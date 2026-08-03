#!/usr/bin/env node
/* test_fixP0.cjs — シナリオテンプレ適用の緊急封鎖（P0）の契約テスト
 *
 * ■なにが危なかったか（確定・公開バイトの静的読解＋GPT敵対監査）
 *   fix41 の `applyTemplate` は、fix527 が `chr6_active_slot` の別ID書込みを黙って捨てるため
 *   「新規 slot へ」でも一時切替が成立せず、**いま開いている物語のメモリ**を置換して
 *   `S.save()` まで到達する。入口は3系統:
 *     ①「適用(上書き)」の modal click  ②「新規 slot へ」の modal click
 *     ③ window.__v292Dfix41.applyTemplate の直接呼出し（★第2版監査で発見）
 *   既存ガードでは止まらない: fix651(C) は turns>0→0 の初回だけ / fix490 は控えを取るだけ /
 *   fix490 の capture は [data-act="saveto"] のみ / fix526,527 の非表示も対象外。
 *
 * ■封鎖（4層・OFFスイッチなし＝安全封鎖の例外）
 *   L0  features.js の applyTemplate 冒頭で hard stop（依存なし・副作用なし）
 *   L1  external blocker が #v41-overlay 内の危険2ボタンを DOM から除去（UX層）
 *   L2  index.html inline の document capture-phase で危険 activation を拒否（正本）
 *   L2b inline が公開API applyTemplate を non-configurable accessor + no-op setter へ
 *
 * ■このテストが縛る契約
 *   「本番で解除不可」はクライアントJSでは永久保証できない（将来のデプロイで削除できる）。
 *   だから **blocker を削除・無効化した build は、このテストで落ちる**。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
/* index.html はリテラルNULを1個含むので latin1 経由で読む（既存テストと同じ作法） */
const readHtml = f => Buffer.from(fs.readFileSync(path.join(__dirname, f), 'latin1'), 'latin1').toString('utf8');

const HTML = readHtml('index.html');
const HOME = read('home.html');
const FEAT = read('features.js');
const BLOCKER = read('v292DfixP0-scenario-blocker.js');
const VER = read('version.txt').trim();

const DANGER_SEL = '#v41-overlay [data-act="apply"], #v41-overlay [data-act="apply-to-slot"]';

/* ============================================================================
 * A. 静的契約（CI で blocker の削除・無効化を落とす）
 * ========================================================================== */
console.log('\n[A] 静的契約');

/* 1. features.js 直後に inline ガードが存在する */
{
  const iFeat = HTML.indexOf('<script src="features.js?cb=');
  const iInline = HTML.indexOf('v292DfixP0-inline');
  const iBlocker = HTML.indexOf('v292DfixP0-scenario-blocker.js');
  const after = HTML.slice(iFeat, iInline);
  ok('A1 inline ガードが features.js の直後にある（間に他の<script src>を挟まない）',
     iFeat > 0 && iInline > iFeat && !/<script\s+src=/.test(after.slice(after.indexOf('</script>'))),
     { iFeat, iInline });
  ok('A1b external blocker は inline の後・他モジュールより前',
     iBlocker > iInline && iBlocker < HTML.indexOf('v292Dfix135-longmem.js'));
}

/* 2. inline ガードに async / defer が付いていない */
{
  const i = HTML.indexOf('v292DfixP0-inline');
  const open = HTML.lastIndexOf('<script', i);
  const tag = HTML.slice(open, HTML.indexOf('>', open) + 1);
  ok('A2 inline の<script>に async/defer が付いていない', tag === '<script>', tag);
  const bi = HTML.indexOf('<script src="v292DfixP0-scenario-blocker.js');
  const btag = HTML.slice(bi, HTML.indexOf('>', bi) + 1);
  ok('A2b blocker の<script>にも async/defer が付いていない',
     !/\sasync|\sdefer/.test(btag), btag);
}

/* 3. 危険 selector への capture 拒否が存在する */
ok('A3 inline に document capture-phase の click 拒否がある',
   /addEventListener\('click',[\s\S]{0,600}?\},\s*true\)/.test(HTML) &&
   HTML.indexOf(DANGER_SEL) > 0);
ok('A3b 危険 selector が #v41-overlay 配下に限定されている（誤封鎖防止）', (() => {
  const i = HTML.indexOf('v292DfixP0-inline');
  const body = HTML.slice(i, HTML.indexOf('</script>', i));
  /* inline 内のすべての [data-act="apply...] は直前に #v41-overlay が付いていること */
  const re = /(.{0,14})\[data-act="apply(-to-slot)?"\]/g;
  let m, allScoped = true, n = 0;
  while ((m = re.exec(body))){ n++; if (m[1].indexOf('#v41-overlay ') < 0) allScoped = false; }
  return n >= 2 && allScoped;
})());
ok('A3c preventDefault と stopImmediatePropagation の両方を呼ぶ',
   HTML.indexOf('e.preventDefault()') > 0 && HTML.indexOf('e.stopImmediatePropagation()') > 0);
ok('A3d composedPath 非対応時に親を document まで辿る fallback がある',
   /while\s*\(n\s*&&\s*n\s*!==\s*document\)/.test(HTML));

/* 4. applyTemplate の拒否関数化が存在する */
ok('A4 inline に applyTemplate の accessor 化がある',
   /Object\.defineProperty\(api,\s*'applyTemplate'/.test(HTML));
ok('A4b data property(writable:false) ではなく accessor + no-op setter',
   /'applyTemplate',\s*\{[\s\S]{0,200}?get:\s*function[\s\S]{0,200}?set:\s*function\s*\(\)\s*\{\}/.test(HTML) &&
   !/'applyTemplate',\s*\{[\s\S]{0,200}?writable:\s*false/.test(HTML));
ok('A4c applyTemplate は configurable:false',
   /'applyTemplate',\s*\{[\s\S]{0,260}?configurable:\s*false/.test(HTML));

/* 5. window.__v292Dfix41 の固定が存在する */
ok('A5 window.__v292Dfix41 も accessor で固定',
   /Object\.defineProperty\(window,\s*'__v292Dfix41'[\s\S]{0,260}?configurable:\s*false/.test(HTML));

/* 6. blocker を削除・無効化した build は CI が落ちる（＝この一群が契約） */
ok('A6 L0 が features.js の applyTemplate 冒頭に存在する（危険操作より前で return）', (() => {
  const i = FEAT.indexOf('function applyTemplate(tpl, options){');
  if (i < 0) return false;
  const body = FEAT.slice(i, i + 4000);
  /* コメントを除いた「実行文」だけで判定する */
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const iRet = code.indexOf('return false;');
  if (iRet < 0) return false;
  const later = ['S.scene', 'S.cast', 'S.turns', 'S.save', 'localStorage'];
  for (const k of later){
    const j = code.indexOf(k);
    if (j >= 0 && j < iRet) return false;   /* return より前に危険操作があってはならない */
  }
  return true;
})());
ok('A6b L0 は外部関数へ依存しない（console.warn だけ・try/catch 付き）', (() => {
  const i = FEAT.indexOf('function applyTemplate(tpl, options){');
  const body = FEAT.slice(i, i + 4000);
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const head = code.slice(0, code.indexOf('return false;') + 13);
  return head.indexOf('showSafetyNotice') < 0 && head.indexOf('alert(') < 0
      && /try\s*\{\s*console\.warn\(/.test(head);
})());
ok('A6c L0 の実行文は localStorage へ触れない（コメントを除いて判定）', (() => {
  const i = FEAT.indexOf('function applyTemplate(tpl, options){');
  const body = FEAT.slice(i, i + 4000);
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const head = code.slice(0, code.indexOf('return false;') + 13);
  return head.indexOf('localStorage') < 0 && head.indexOf('S.save') < 0;
})());
ok('A6d external blocker ファイルが存在する',
   fs.existsSync(path.join(__dirname, 'v292DfixP0-scenario-blocker.js')));
ok('A6e index.html が blocker を読み込んでいる',
   HTML.indexOf('<script src="v292DfixP0-scenario-blocker.js') > 0);

/* 11. external blocker が通常時に2本目の L2 を登録しない */
ok('A11 blocker は inline が ARMED のとき L2 を追加しない（分岐が存在する）',
   /inline ARMED[\s\S]{0,120}external installs L1\/observation only/.test(BLOCKER) &&
   /installFallbackL2\(\)/.test(BLOCKER));
ok('A11b blocker の fallback L2 は verify() が NG の分岐の中だけで呼ばれる', (() => {
  const i = BLOCKER.indexOf('function boot()');
  const body = BLOCKER.slice(i, i + 1400);
  const iArmed = body.indexOf('v.present && v.armed');
  const iFb = body.indexOf('installFallbackL2()');
  const iElse = body.indexOf('} else {', iArmed);
  return iArmed > 0 && iElse > iArmed && iFb > iElse;
})());

/* 12. blocker 内に L2 を無効化する localStorage 参照が存在しない（GPT） */
ok('A12 inline ガードに localStorage 参照が無い', (() => {
  const i = HTML.indexOf('v292DfixP0-inline');
  const j = HTML.indexOf('</script>', i);
  return HTML.slice(i, j).indexOf('localStorage') < 0;
})());
ok('A12b external blocker に localStorage 参照が無い', BLOCKER.indexOf('localStorage') < 0);
ok('A13 installObserver が冪等（observerInstalled で早期 return する）',
   /function installObserver\(\)\s*\{\s*if \(observerInstalled\) return true;/.test(BLOCKER));
ok('A13b boot が一度だけ（booted で早期 return する）',
   /function boot\(\)\s*\{\s*if \(booted\) return;/.test(BLOCKER));
ok('A13c boot 内で installObserver を呼ばない（責務分離）', (() => {
  const i = BLOCKER.indexOf('function boot()');
  const end = BLOCKER.indexOf('\n  }\n', i);          /* boot の閉じ括弧まで */
  const body = BLOCKER.slice(i, end);
  return end > i && body.indexOf('installObserver(') < 0;
})());
ok('A13d pageshow は再走査だけ（Observer を追加登録しない）',
   /addEventListener\('pageshow',\s*function \(\) \{ scan\(\); \}/.test(BLOCKER));
ok('A14 inline の isArmed は state を読まない（closure private の l2Ok を使う）', (() => {
  const i = HTML.indexOf('isArmed: function ()');
  const end = HTML.indexOf('\n    }', i);              /* isArmed の閉じ括弧まで */
  const body = HTML.slice(i, end);
  return end > i && body.indexOf('l2Ok') > 0 && body.indexOf('st.') < 0;
})());
ok('A12c P0 に OFF スイッチ（v292DfixP0Off 等）が存在しない',
   HTML.indexOf('v292DfixP0Off') < 0 && BLOCKER.indexOf('v292DfixP0Off') < 0 && FEAT.indexOf('v292DfixP0Off') < 0);

/* 版識別子の整合 */
console.log('\n[B] 版識別子の整合');
ok('B1 index.html の BUILT が version.txt と同値',
   (HTML.match(/var BUILT = '([^']+)'/) || [])[1] === VER, VER);
ok('B2 home.html の HOME_BUILT が version.txt と同値',
   (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === VER);
ok('B3 fix654 の BUILD が version.txt と同値',
   (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === VER);
ok('B4 内容を変えた features.js の ?cb= が更新されている',
   /features\.js\?cb=v292Dfix665/.test(HTML));
ok('B5 新規 blocker の ?cb= が付いている',
   /v292DfixP0-scenario-blocker\.js\?cb=v292Dfix665/.test(HTML));
ok('B6 home.html は識別子更新のみ（危険 selector も P0 コードも入れない）',
   HOME.indexOf('data-act="apply"') < 0 && HOME.indexOf('v292DfixP0-inline') < 0);
ok('B7 index.html のリテラルNULは1個のまま',
   fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);

/* ============================================================================
 * C. 挙動（最小 DOM モック上で実際に動かす）
 * ========================================================================== */
console.log('\n[C] 挙動');

/* --- 極小セレクタエンジン: #id / [attr="v"] / 子孫結合 / カンマ群 のみ --- */
function matchSimple(el, part){
  if (part.charAt(0) === '#') return el.id === part.slice(1);
  const m = /^\[([a-zA-Z0-9_-]+)="([^"]*)"\]$/.exec(part);
  if (m) return el.attrs[m[1]] === m[2];
  const m2 = /^\[([a-zA-Z0-9_-]+)\]$/.exec(part);
  if (m2) return Object.prototype.hasOwnProperty.call(el.attrs, m2[1]);
  return false;
}
function matchesSel(el, sel){
  const groups = sel.split(',').map(s => s.trim()).filter(Boolean);
  for (const g of groups){
    const parts = g.split(/\s+/);
    let cur = el, i = parts.length - 1;
    if (!matchSimple(cur, parts[i])) continue;
    i--;
    let p = cur.parentNode, okAll = true;
    while (i >= 0){
      let found = false;
      while (p && p.nodeType === 1){ if (matchSimple(p, parts[i])){ found = true; p = p.parentNode; break; } p = p.parentNode; }
      if (!found){ okAll = false; break; }
      i--;
    }
    if (okAll) return true;
  }
  return false;
}

function makeEnv(){
  const listeners = [];
  function El(tag){
    return {
      nodeType: 1, tagName: (tag || 'div').toUpperCase(), id: '', attrs: {}, style: { cssText: '' },
      childNodes: [], parentNode: null, textContent: '',
      setAttribute(k, v){ this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
      getAttribute(k){ return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      appendChild(c){ c.parentNode = this; this.childNodes.push(c); return c; },
      insertBefore(c){ c.parentNode = this; this.childNodes.unshift(c); return c; },
      removeChild(c){ const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
      matches(sel){ return matchesSel(this, sel); },
      querySelectorAll(sel){
        const out = [];
        (function walk(n){ for (const c of n.childNodes){ if (matchesSel(c, sel)) out.push(c); walk(c); } })(this);
        return out;
      },
      querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }
    };
  }
  const html = El('html'); html.id = '';
  const body = El('body');
  html.appendChild(body);
  const document = {
    nodeType: 9, readyState: 'complete', documentElement: html, body,
    createElement: t => El(t),
    addEventListener(type, fn, capture){ listeners.push({ type, fn, capture: !!capture }); },
    getElementById(id){
      let found = null;
      (function walk(n){ for (const c of n.childNodes){ if (c.id === id) { found = found || c; } walk(c); } })(html);
      return found;
    },
    querySelectorAll(sel){ return html.querySelectorAll(sel); },
    querySelector(sel){ return html.querySelector(sel); }
  };
  document.parentNode = null;
  html.parentNode = document;
  const win = { document, console, setTimeout, clearTimeout, Object, JSON, String, Error };
  win.window = win;
  win.addEventListener = () => {};
  /* click を document capture で流す。stopImmediatePropagation を尊重。 */
  function click(target){
    const path = [];
    let n = target;
    while (n && n.nodeType === 1){ path.push(n); n = n.parentNode; }
    path.push(document); path.push(win);
    let stopped = false, prevented = false;
    const e = {
      type: 'click', target, composedPath: () => path.slice(),
      preventDefault(){ prevented = true; },
      stopImmediatePropagation(){ stopped = true; },
      stopPropagation(){}
    };
    for (const L of listeners){
      if (L.type !== 'click' || !L.capture) continue;
      try { L.fn(e); } catch (err) { /* ハンドラ例外は握らない設計だが試験は続行 */ }
      if (stopped) break;
    }
    return { stopped, prevented };
  }
  return { win, document, body, El, click, listeners };
}

/* --- fix41 の IIFE を features.js から切り出す --- */
function extractFix41(){
  const start = FEAT.indexOf('(function v292Dfix41(){');
  const endMark = FEAT.indexOf('/* v292Dfix42:', start);
  return FEAT.slice(start, endMark);
}
/* --- inline ガード本体を index.html から切り出す --- */
function extractInline(){
  const i = HTML.indexOf('v292DfixP0-inline');
  const open = HTML.lastIndexOf('<script>', i);
  const close = HTML.indexOf('</script>', i);
  return HTML.slice(open + '<script>'.length, close);
}

function buildScenario(env){
  /* モーダル相当の DOM を作る */
  const overlay = env.El('div'); overlay.setAttribute('id', 'v41-overlay');
  const card = env.El('div');
  const bApply = env.El('button'); bApply.setAttribute('data-act', 'apply');
  const bSlot = env.El('button'); bSlot.setAttribute('data-act', 'apply-to-slot');
  card.appendChild(bApply); card.appendChild(bSlot); overlay.appendChild(card);
  env.body.appendChild(overlay);
  const topbar = env.El('button'); topbar.setAttribute('id', 'v41-topbar-btn');
  env.body.appendChild(topbar);
  return { overlay, card, bApply, bSlot, topbar };
}

/* ---------- C-1: L0（features.js 単体）---------- */
{
  const env = makeEnv();
  const S = { scene: { loc: 'orig' }, cast: { hero: { name: '緒方 湊' }, npcs: [] }, turns: [1, 2, 3], save(){ S.__saved = (S.__saved || 0) + 1; } };
  const ls = { store: { chr6_active_slot: '"smrrcv25pcq"' }, writes: 0,
    getItem(k){ return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem(k, v){ this.writes++; this.store[k] = String(v); },
    removeItem(k){ this.writes++; delete this.store[k]; }, key(){ return null; }, length: 0 };
  const sandbox = { window: env.win, document: env.document, console, S, localStorage: ls,
                    UI: { renderAll(){}, _renderHooks: [] }, setInterval: () => 0, setTimeout: () => 0,
                    alert(){ sandbox.__alerted = true; }, JSON, Object, Date };
  sandbox.window.S = S; sandbox.window.localStorage = ls;
  vm.createContext(sandbox);
  vm.runInContext(extractFix41(), sandbox, { filename: 'fix41.js' });

  const api = sandbox.window.__v292Dfix41;
  ok('C1 fix41 の公開APIが存在する（封鎖対象の入口）', !!api && typeof api.applyTemplate === 'function');
  const before = JSON.stringify({ scene: S.scene, cast: S.cast, turns: S.turns, w: ls.writes, saved: S.__saved || 0 });
  const r = api.applyTemplate(api.TEMPLATES[0], { resetTurns: true });
  const after = JSON.stringify({ scene: S.scene, cast: S.cast, turns: S.turns, w: ls.writes, saved: S.__saved || 0 });
  ok('C2 L0: applyTemplate は false を返す', r === false, r);
  ok('C3 L0: S.scene / S.cast / S.turns / S.save / localStorage が不変', before === after, { before, after });
  ok('C4 L0: chr6_active_slot が不変', ls.store.chr6_active_slot === '"smrrcv25pcq"');
}

/* ---------- C-2: L2 / L2b（inline ガード）---------- */
function armInline(){
  const env = makeEnv();
  const S = { scene: { loc: 'orig' }, cast: { hero: { name: '緒方 湊' }, npcs: [] }, turns: [1, 2, 3], save(){ S.__saved = (S.__saved || 0) + 1; } };
  const applied = { count: 0 };
  const origApply = function (){ applied.count++; return true; };   /* 封鎖前の危険関数の代役 */
  env.win.__v292Dfix41 = { openLibrary(){}, closeLibrary(){}, applyTemplate: origApply, TEMPLATES: [{ id: 'ruins' }] };
  const nodes = buildScenario(env);
  const sandbox = { window: env.win, document: env.document, console, S,
                    Object, JSON, String, Error, setTimeout: () => 0, BUILT: VER };
  vm.createContext(sandbox);
  vm.runInContext(extractInline(), sandbox, { filename: 'inline.js' });
  return { env, sandbox, nodes, applied, origApply, S };
}

{
  const t = armInline();
  const st = t.sandbox.window.__v292P0.state;
  ok('C5 inline: ARMED になる', st.armed === true && st.safeHaltActive === false, st);
  ok('C6 inline: l2Installed / l2bInstalled / 両 descriptor 固定', st.l2Installed && st.l2bInstalled && st.apiPropertyFrozen && st.globalPropertyFrozen, st);
  ok('C7 inline: descriptorVerified と identityVerified が true', st.descriptorVerified && st.identityVerified, st);

  /* --- L2: クリック拒否（3経路） --- */
  const r1 = t.env.click(t.nodes.bApply);
  ok('C8 L2: 「適用(上書き)」クリックが拒否される（preventDefault + stopImmediatePropagation）',
     r1.prevented && r1.stopped, r1);
  const r2 = t.env.click(t.nodes.bSlot);
  ok('C9 L2: 「新規 slot へ」クリックが拒否される', r2.prevented && r2.stopped, r2);
  ok('C10 L2: モーダルの bubble ハンドラまで到達しない（applyTemplate 未実行）', t.applied.count === 0);

  /* --- 関係ない要素は素通し（誤封鎖しない） --- */
  const other = t.env.El('button'); other.setAttribute('data-act', 'apply'); t.env.body.appendChild(other);
  const r3 = t.env.click(other);
  ok('C11 L2: #v41-overlay 配下でない [data-act="apply"] は拒否しない（誤封鎖防止）',
     !r3.prevented && !r3.stopped, r3);
  const close = t.env.El('button'); close.setAttribute('id', 'v41-close-x'); t.nodes.overlay.appendChild(close);
  const r4 = t.env.click(close);
  ok('C12 L2: 閉じるボタンなど他の操作は素通し', !r4.prevented && !r4.stopped);

  /* --- L2b: 公開API直接呼出し --- */
  const api = t.sandbox.window.__v292Dfix41;
  const ret = api.applyTemplate({ id: 'ruins' }, { resetTurns: true });
  ok('C13 L2b: 公開API直接呼出しが false を返す', ret === false, ret);
  ok('C14 L2b: 元の危険関数が実行されない', t.applied.count === 0);

  /* --- 解除試験（GPT指定：例外の有無ではなく「封鎖が解除されないこと」が合格条件） --- */
  const blocked = api.applyTemplate;
  let exAssignProp = null, exAssignGlobal = null, exDelete = null, exDefine = null;
  try { t.sandbox.window.__v292Dfix41.applyTemplate = t.origApply; } catch (e) { exAssignProp = String(e.name); }
  ok('C15 解除試験: プロパティ代入は例外を出さず静かに無視される',
     exAssignProp === null && t.sandbox.window.__v292Dfix41.applyTemplate === blocked, exAssignProp);
  try { t.sandbox.window.__v292Dfix41 = { applyTemplate: t.origApply }; } catch (e) { exAssignGlobal = String(e.name); }
  ok('C16 解除試験: オブジェクト全体の代入も例外を出さず静かに無視される',
     exAssignGlobal === null && t.sandbox.window.__v292Dfix41 === api, exAssignGlobal);
  try { delete t.sandbox.window.__v292Dfix41.applyTemplate; } catch (e) { exDelete = String(e.name); }
  ok('C17 解除試験: delete は失敗する（例外または無効。結果として封鎖が維持される）',
     t.sandbox.window.__v292Dfix41.applyTemplate === blocked, { exDelete });
  try { Object.defineProperty(t.sandbox.window.__v292Dfix41, 'applyTemplate', { value: t.origApply }); }
  catch (e) { exDefine = String(e.name); }
  ok('C18 解除試験: defineProperty による復元も失敗する',
     t.sandbox.window.__v292Dfix41.applyTemplate === blocked, { exDefine });
  ok('C19 解除試験のあとも identity が維持される',
     t.sandbox.window.__v292Dfix41.applyTemplate === blocked && t.sandbox.window.__v292Dfix41 === api);
  ok('C20 解除試験のあとも直接呼出しは false', t.sandbox.window.__v292Dfix41.applyTemplate({}, {}) === false);

  /* --- descriptor の形 --- */
  const d1 = Object.getOwnPropertyDescriptor(t.sandbox.window.__v292Dfix41, 'applyTemplate');
  const d2 = Object.getOwnPropertyDescriptor(t.sandbox.window, '__v292Dfix41');
  ok('C21 descriptor: applyTemplate は accessor（get/set があり value を持たない）',
     !!d1 && typeof d1.get === 'function' && typeof d1.set === 'function' && !('value' in d1), d1 && Object.keys(d1));
  ok('C22 descriptor: applyTemplate は configurable:false / enumerable:true',
     d1.configurable === false && d1.enumerable === true);
  ok('C23 descriptor: window.__v292Dfix41 も accessor かつ configurable:false',
     !!d2 && typeof d2.get === 'function' && typeof d2.set === 'function' && d2.configurable === false);
  ok('C24 descriptor: writable は存在しない（data property ではない）',
     !('writable' in d1) && !('writable' in d2));

  /* --- verify() の再検証 --- */
  const v = t.sandbox.window.__v292P0.verify();
  ok('C25 verify(): descriptorOk / identityOk / effectiveOk がすべて true',
     v.descriptorOk && v.identityOk && v.effectiveOk, v);
  ok('C26 isArmed(): sentinel ではなく実物を再検証して true',
     t.sandbox.window.__v292P0.isArmed() === true);
}

/* ---------- C-3: sentinel 偽装 / L2b 失敗 → SAFE HALT ---------- */
{
  /* ★L2b が失敗する環境を作り、state/sentinel だけを成功値へ偽装しても
     isArmed() が false のままであること＝安全判定の正本が descriptor/identity である証明 */
  const env = makeEnv();
  const nodes = buildScenario(env);
  const sandbox = { window: env.win, document: env.document, console, Object, JSON, String, Error,
                    setTimeout: () => 0, BUILT: VER };
  /* window.__v292Dfix41 を用意しない → L2b が必ず失敗する */
  vm.createContext(sandbox);
  vm.runInContext(extractInline(), sandbox, { filename: 'inline.js' });
  const P = sandbox.window.__v292P0;
  ok('C27a 前提: L2b 失敗環境で isArmed() は false', P.isArmed() === false, P.state);

  /* state を全部「成功相当」へ偽装する */
  P.state.armed = true;
  P.state.l2bInstalled = true;
  P.state.apiPropertyFrozen = true;
  P.state.globalPropertyFrozen = true;
  P.state.descriptorVerified = true;
  P.state.identityVerified = true;
  P.state.safeHaltActive = false;
  P.state.failureStage = null;
  P.state.failureReason = null;
  sandbox.window.__v292P0Armed = true;                 /* 単純 sentinel も偽装 */

  ok('C27b sentinel偽装: state を全部成功値にしても isArmed() は false のまま',
     P.isArmed() === false, P.state);
  ok('C27c sentinel偽装: verify() も descriptorOk=false を返す',
     P.verify().descriptorOk === false);

  /* SAFE HALT が維持されている（偽装で解除されない） */
  const topbar = env.document.getElementById('v41-topbar-btn');
  const r = env.click(topbar);
  ok('C27d sentinel偽装後も SAFE HALT が維持される（topbar クリックが拒否される）',
     r.prevented && r.stopped, r);
  const danger = env.document.querySelector('#v41-overlay [data-act="apply"]');
  const r2 = env.click(danger);
  ok('C27e sentinel偽装後も危険2ボタンは拒否される', r2.prevented && r2.stopped);

  /* external blocker も sentinel を信用しない */
  let observeCount = 0;
  sandbox.MutationObserver = function (cb){ this.observe = () => { observeCount++; }; this.cb = cb; };
  sandbox.window.MutationObserver = sandbox.MutationObserver;
  sandbox.window.addEventListener = () => {};
  vm.runInContext(BLOCKER, sandbox, { filename: 'blocker.js' });
  ok('C27f sentinel偽装環境でも external blocker は armed と判定しない',
     sandbox.window.__v292DfixP0.status().verify.armed === false,
     sandbox.window.__v292DfixP0.status().verify);
  ok('C27g sentinel偽装環境では external が fallback を試す',
     sandbox.window.__v292DfixP0.status().stats.fallbackL2 === true);
}

/* ---------- C-3b: MutationObserver の登録は「ちょうど1回」 ---------- */
function countObserve(readyState){
  const env = makeEnv();
  buildScenario(env);
  env.document.readyState = readyState;
  const S = { scene: {}, cast: {}, turns: [], save(){} };
  env.win.__v292Dfix41 = { openLibrary(){}, closeLibrary(){}, applyTemplate: function(){ return true; }, TEMPLATES: [{ id: 'ruins' }] };
  let ctorCount = 0, observeCount = 0;
  const dcl = [];
  const sandbox = { window: env.win, document: env.document, console, S, Object, JSON, String, Error,
                    setTimeout: () => 0, BUILT: VER };
  sandbox.MutationObserver = function (cb){ ctorCount++; this.cb = cb; this.observe = () => { observeCount++; }; this.disconnect = () => {}; };
  env.win.MutationObserver = sandbox.MutationObserver;
  env.win.addEventListener = () => {};
  /* DOMContentLoaded を捕まえて後から発火できるようにする */
  const origAdd = env.document.addEventListener.bind(env.document);
  env.document.addEventListener = (type, fn, capture) => {
    if (type === 'DOMContentLoaded'){ dcl.push(fn); return; }
    origAdd(type, fn, capture);
  };
  vm.createContext(sandbox);
  vm.runInContext(extractInline(), sandbox, { filename: 'inline.js' });
  vm.runInContext(BLOCKER, sandbox, { filename: 'blocker.js' });
  /* loading のときは DOMContentLoaded を発火する */
  dcl.forEach(f => { try { f(); } catch (e) {} });
  dcl.forEach(f => { try { f(); } catch (e) {} });   /* 二重発火しても増えないこと */
  return { ctorCount, observeCount, scans: sandbox.window.__v292DfixP0.status().stats.scans,
           installed: sandbox.window.__v292DfixP0.status().observerInstalled };
}
{
  const a = countObserve('loading');
  ok("C46 readyState='loading' → DOMContentLoaded 発火後も MutationObserver の登録はちょうど1回",
     a.ctorCount === 1 && a.observeCount === 1, a);
  ok("C46b readyState='loading' → 起動時の scan もちょうど1回", a.scans === 1, a);
  const b = countObserve('complete');
  ok("C47 readyState='complete' で起動しても MutationObserver の登録はちょうど1回",
     b.ctorCount === 1 && b.observeCount === 1, b);
  ok("C47b readyState='complete' でも起動時の scan はちょうど1回", b.scans === 1, b);
  ok('C48 observerInstalled フラグが立つ（冪等化の証拠）', a.installed === true && b.installed === true);
}
{
  /* L2b を強制的に失敗させる（fix41 API が存在しない） */
  const env = makeEnv();
  buildScenario(env);
  const sandbox = { window: env.win, document: env.document, console, Object, JSON, String, Error,
                    setTimeout: () => 0, BUILT: VER };
  /* window.__v292Dfix41 を用意しない → L2b が throw する */
  vm.createContext(sandbox);
  vm.runInContext(extractInline(), sandbox, { filename: 'inline.js' });
  const st = sandbox.window.__v292P0.state;
  ok('C28 L2b 失敗時: armed にならない', st.armed === false, st);
  ok('C29 L2b 失敗時: safeHaltActive になる', st.safeHaltActive === true, st);
  ok('C30 L2b 失敗時でも L2 は生きている（別 try/catch の証明）', st.l2Installed === true, st);
  ok('C31 L2b 失敗時: failureStage / failureReason が記録される',
     !!st.failureStage && !!st.failureReason, { s: st.failureStage, r: st.failureReason });

  /* SAFE HALT: topbar のクリックが拒否される（再生成されても効く＝セレクタ判定） */
  const topbar = env.document.getElementById('v41-topbar-btn');
  const r = env.click(topbar);
  ok('C32 SAFE HALT: #v41-topbar-btn のクリックが capture で拒否される', r.prevented && r.stopped, r);
  /* 再注入を模して作り直す */
  topbar.parentNode.removeChild(topbar);
  const again = env.El('button'); again.setAttribute('id', 'v41-topbar-btn'); env.body.appendChild(again);
  const r2 = env.click(again);
  ok('C33 SAFE HALT: 5秒周期で再注入されても拒否し続ける（セレクタ判定なので効く）',
     r2.prevented && r2.stopped, r2);
  const danger = env.document.querySelector('#v41-overlay [data-act="apply"]');
  const r3 = env.click(danger);
  ok('C34 SAFE HALT: 危険2ボタンも拒否される', r3.prevented && r3.stopped);

  /* 表示文言 */
  const halt = env.document.getElementById('v292P0-halt');
  ok('C35 SAFE HALT: 消えない警告が最上部に出る', !!halt);
  ok('C36 SAFE HALT: 「完全封鎖済み」と表示しない（公開API封鎖に失敗した旨を明記）',
     !!halt && halt.textContent.indexOf('公開API封鎖に失敗') >= 0 &&
     halt.textContent.indexOf('完全封鎖') < 0, halt && halt.textContent);
}

/* ---------- C-4: L1（external blocker）---------- */
{
  const t = armInline();
  const sandbox = t.sandbox;
  sandbox.MutationObserver = function (cb){ this.observe = () => { sandbox.__moObserved = true; }; this.cb = cb; };
  sandbox.window.MutationObserver = sandbox.MutationObserver;
  sandbox.window.addEventListener = () => {};
  vm.runInContext(BLOCKER, sandbox, { filename: 'blocker.js' });

  const left = sandbox.document.querySelectorAll(DANGER_SEL);
  ok('C37 L1: #v41-overlay 内の危険2ボタンが DOM から除去される', left.length === 0, left.length);
  const note = sandbox.document.querySelector('[data-v292p0-note]');
  ok('C38 L1: 代わりに静的な説明が挿入される', !!note && note.textContent.indexOf('安全上の理由') >= 0);
  const before = sandbox.__v292DfixP0 ? 0 : 0;
  sandbox.window.__v292DfixP0.rescan(); sandbox.window.__v292DfixP0.rescan();
  const notes = sandbox.document.querySelectorAll('[data-v292p0-note]');
  ok('C39 L1: 再走査しても説明文が重複挿入されない', notes.length === 1, notes.length);
  ok('C40 L1: MutationObserver は documentElement を監視する（body 交換に耐える）',
     sandbox.__moObserved === true && /observe\(document\.documentElement/.test(BLOCKER));

  /* 通常時に2本目の L2 を張らない */
  const capClicks = t.env.listeners.filter(l => l.type === 'click' && l.capture).length;
  ok('C41 blocker: inline が ARMED のとき capture リスナは1本のまま', capClicks === 1, capClicks);
  const status = sandbox.window.__v292DfixP0.status();
  ok('C42 blocker: status() が inline の state と verify を返す',
     !!status.inlineState && status.verify.descriptorOk === true);
  ok('C43 blocker: fallback L2/L2b を張っていない',
     status.stats.fallbackL2 === false && status.stats.fallbackL2b === false, status.stats);
}

/* ---------- C-5: L1 が失敗しても L2/L2b が有効 ---------- */
{
  const t = armInline();
  /* blocker を読み込まない＝L1 なし */
  const r = t.env.click(t.nodes.bApply);
  ok('C44 L1 なし（blocker 読込失敗）でも L2 がクリックを拒否する', r.prevented && r.stopped);
  ok('C45 L1 なしでも L2b が公開APIを拒否する',
     t.sandbox.window.__v292Dfix41.applyTemplate({}, {}) === false && t.applied.count === 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
