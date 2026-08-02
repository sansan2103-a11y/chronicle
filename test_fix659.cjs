#!/usr/bin/env node
/* test_fix659.cjs — fix659: 分岐(fork)バナーの作り直しと「取り込みまで完走」の回帰テスト
 *
 * ■このテストが固定する約束
 *   (1) 実装の体裁: 冪等ガード / OFF / 例外は必ず false（＝旧バナーへフォールバック）/ 通信もタイマーも張らない
 *   (2) 双方向API契約: fix402 → fix659.renderForkBanner / fix659 → __v292Dfix402.forcePut
 *   (3) 実走: fix659 ON なら旧バナー(id=v292Dfix402-fork)は作られない。OFF/例外なら作られる
 *   (4) fix527 非干渉: ボタン文言に「別端末」を含めない + 要素と全ボタンに __f527 マーカー
 *   (5) ボタンの実挙動: クラウド側→home.html?autopull=1 / この端末→forcePut / 今は決めない→閉じる
 *   (6) home の autopull: 一度だけ実行・replaceState でクエリ除去・未ログインは告知して終わる
 *   (7) ★真分岐の取り込み回帰（§3の実因調査をテストとして固定する）
 *       (a) ローカル10T / クラウド96T … 起動時 pull() で本体が96Tで書かれる（＝取り込み自体は健全）
 *       (b) G1: 一度スキップすると baseRev だけ進み、以後 force 無しの pull() は「最新です」で終わる
 *       (c) G2: ローカル120T / クラウド96T では pull(true) でも上書きされない（＝真分岐が入らない実因）
 *       (d) autopull(=force+adoptCloud) なら控えを取った上で取り込む。控えが取れなければ守る(fail-closed)
 *   (8) fix658 のフックを壊していない
 *   (9) 出荷の体裁（script タグ・cb・BUILT 同値は test_fix653/654 が担保）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC659 = read('v292Dfix659-fork-choice.js');
const SRC658 = read('v292Dfix658-lineage-shadow.js');
const SRC402 = read('v292Dfix402-invisible-sync.js');
const SRC527 = read('v292Dfix527-story-url.js');
const HOME   = read('home.html');
const HTMLU  = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
const stripBlock = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE659 = stripBlock(SRC659).replace(/^\s*\/\/.*$/gm, ' ');
const CODEHOME = stripBlock(HOME);

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i })) });
const settle = async (n = 200) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

/* =====================================================================
   最小 DOM（appendChild で id 登録 → getElementById が引ける）
   ===================================================================== */
function mkDom(){
  const byId = {};
  function mkEl(tag){
    const e = { tagName: tag, id: '', type: '', textContent: '', innerHTML: '',
      style: { cssText: '' }, children: [], parentNode: null, onclick: null,
      appendChild(c){ e.children.push(c); c.parentNode = e; if (c.id) byId[c.id] = c; return c; },
      removeChild(c){ const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); if (c.id) delete byId[c.id]; c.parentNode = null; return c; },
      replaceChild(nc, oc){ const i = e.children.indexOf(oc); if (i >= 0) e.children[i] = nc; nc.parentNode = e; return oc; },
      cloneNode(){ return mkEl(tag); },
      querySelectorAll(sel){ return e.children.filter(c => sel === 'button' ? c.tagName === 'button' : false); },
      querySelector(){ return null; }, addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
      removeAttribute(){}, classList: { add(){}, remove(){}, contains: () => false } };
    return e;
  }
  const body = mkEl('body');
  const document = {
    body, documentElement: mkEl('html'), readyState: 'complete',
    createElement: mkEl, createTextNode: t => ({ nodeValue: String(t) }),
    getElementById: id => byId[id] || null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener(){}
  };
  return { document, body, byId, mkEl };
}

/* =====================================================================
   index.html 相当（fix659 + fix402 を実物で載せる）
   ===================================================================== */
function mkIndex(opts){
  opts = opts || {};
  const store = Object.assign({ v292ProxyPass: 'pw', 'chr6_active_slot': '"sA"', 'chr6_slot_sA': story(7) }, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const D = mkDom();
  const timers = [];
  const calls = [];
  const status = [];
  const w = {
    localStorage: ls, navigator: { userAgent: 'test' },
    document: D.document, location: { href: '', search: opts.search || '?story=sA', pathname: '/index.html' },
    addEventListener(){}, setInterval: () => 0, clearInterval(){}, clearTimeout(){},
    setTimeout: fn => { timers.push(fn); return timers.length; },
    console: { log(){}, warn(){}, error(){} }, AbortController: undefined,
    UI: { setStatus: m => status.push(String(m)) },
    fetch(url, o){
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      calls.push(b);
      return Promise.resolve({ status: 200, json: () => Promise.resolve((opts.server || (() => ({ ok: false })))(b)) });
    }
  };
  w.window = w;
  const ctx = vm.createContext(w);
  if (opts.with658) vm.runInContext(SRC658, ctx, { filename: 'v292Dfix658' });
  if (opts.with659 !== false) vm.runInContext(SRC659, ctx, { filename: 'v292Dfix659' });
  vm.runInContext(SRC402, ctx, { filename: 'v292Dfix402' });
  const drainFrom = i => { for (let n = i; n < timers.length; n++){ try { timers[n](); } catch(e){} } };
  return { w, store, ls, D, timers, calls, status, drainFrom };
}

/* =====================================================================
   home.html 相当（本体インライン script を実物で走らせる）
   ===================================================================== */
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const SRC590 = read('v292Dfix590-commit-ledger.js');
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const bodies = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return bodies[bodies.length - 1];
}
const HOME_JS = homeScript();

function mkHome(opts){
  const store = Object.assign({}, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { if (opts.readonlyKeys && opts.readonlyKeys.test(k)) return; store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '' },
      firstChild: null, children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null, removeAttribute(){},
      click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile'].forEach(mkEl);
  const body = mkEl('__body');
  const document = { body, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const ops = [], replaces = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'test' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState: (a, b, url) => replaces.push(String(url)) },
    alert(){}, confirm(){ return true; }, setTimeout: () => 0, clearTimeout(){},
    console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      ops.push(b.op);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC579, ctx, { filename: 'f579' });
  vm.runInContext(SRC562, ctx, { filename: 'f562' });
  vm.runInContext(SRC587, ctx, { filename: 'f587' });
  vm.runInContext(SRC590, ctx, { filename: 'f590' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home.html<script>' });
  return { w, store, ls, nodes, ops, replaces,
           fire: (id, type, ev) => { const f = listeners[id] && listeners[id][type]; return f ? f(ev || {}) : undefined; } };
}

/* 白鷺荘相当の fixture */
const SLOT = 'shirasagi1';
const SLOT2 = 'kohaku2';
function fixture(localTurns, remoteTurns, extraSeed, other){
  /* other = { local, remote } … 「この端末の方が進んでいる**別の**物語」を足す */
  const meta = [{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 1000 }];
  const metaLocal = [{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 9999 }];
  if (other){
    meta.push({ id: SLOT2, name: '琥珀', key: 'chr6_slot_' + SLOT2, updatedAt: 1000 });
    metaLocal.push({ id: SLOT2, name: '琥珀', key: 'chr6_slot_' + SLOT2, updatedAt: 9999 });
  }
  const remoteLs = {};
  remoteLs['chr6_slots_meta'] = JSON.stringify(meta);
  remoteLs['chr6_slot_' + SLOT] = story(remoteTurns);
  if (other) remoteLs['chr6_slot_' + SLOT2] = story(other.remote);
  remoteLs['chr6_active_slot'] = JSON.stringify(SLOT);
  const seed = Object.assign({
    v292ProxyPass: 'pw',
    /* ★ローカルの meta の方が updatedAt が新しい（＝mergeMeta がローカルを残す状況） */
    'chr6_slots_meta': JSON.stringify(metaLocal),
    ['chr6_slot_' + SLOT]: story(localTurns),
    'v292Dfix402_baseRev': '0'
  }, other ? { ['chr6_slot_' + SLOT2]: story(other.local) } : {}, extraSeed || {});
  const server = b => b.op === 'meta' ? { ok: true, rev: 96, meta: { updatedAt: 2 } }
    : b.op === 'get' ? { ok: true, rev: 96, data: { ls: remoteLs, updatedAt: 2, full: true } }
    : b.op === 'commitstate' ? { ok: true, rev: 96, packageHash: 'PH', ns: 'ns1' } : { ok: false };
  return { remoteLs, seed, server };
}
const slotTurns = (store, id) => { try { return JSON.parse(store['chr6_slot_' + (id || SLOT)]).turns.length; } catch(e){ return -1; } };

(async () => {

/* =====================================================================
   (1) 実装の体裁
   ===================================================================== */
console.log('== (1) 実装の体裁 ==');
{
  ok('★冪等ガードが __v292* 系', /if\s*\(window\.__v292Dfix659\)\s*return/.test(SRC659));
  ok('★OFF スイッチ v292Dfix659Off がある', SRC659.indexOf("'v292Dfix659Off'") > 0);
  ok('★★読み込みだけでは通信しない（fetch を持たない）', !/fetch\s*\(/.test(CODE659));
  ok('★★自分からイベント購読やポーリングをしない（描画は fix402 に呼ばれたときだけ）',
     !/addEventListener/.test(CODE659) && !/setInterval\s*\(/.test(CODE659) && !/MutationObserver/.test(CODE659));
  ok('★★localStorage への書込みが無い（読むだけ）',
     !/localStorage\.setItem/.test(CODE659) && !/localStorage\.removeItem/.test(CODE659));
  ok('★CRLF / NUL は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'v292Dfix659-fork-choice.js'));
    return b.indexOf(Buffer.from('\r\n')) < 0 && b.filter(x => x === 0).length === 0;
  })());
  const h = mkIndex({});
  ok('★API オブジェクトが生える', !!h.w.__v292Dfix659 && h.w.__v292Dfix659.__real === true);
  const first = h.w.__v292Dfix659;
  vm.runInContext(SRC659, vm.createContext ? h.w : h.w, { filename: 'fix659#2' });
  ok('★★二重ロードで初期化し直さない', h.w.__v292Dfix659 === first);
  ok('★★selfTest（文言・ボタン構成の真理値表）が緑', h.w.__v292Dfix659.selfTest().ok === true, h.w.__v292Dfix659.selfTest().fails);
}

/* =====================================================================
   (2) 双方向API契約
   ===================================================================== */
console.log('\n== (2) 双方向API契約（fix402 ⇄ fix659） ==');
{
  const h = mkIndex({});
  const F = h.w.__v292Dfix659;
  for (const n of ['renderForkBanner', 'status', 'selfTest'])
    ok('★fix659 公開APIに ' + n + ' が実在(function)', typeof F[n] === 'function', typeof F[n]);
  ok('★★fix402 が呼ぶ名前がすべて公開されている（無言の素通りを作らない）', (() => {
    const used = (stripBlock(SRC402).match(/__v292Dfix659\.(\w+)/g) || []).map(t => t.split('.')[1]);
    return used.length > 0 && used.every(u => typeof F[u] === 'function');
  })(), (stripBlock(SRC402).match(/__v292Dfix659\.(\w+)/g) || []));
  ok('★★fix659 が呼ぶ fix402 の forcePut が実在(function)',
     typeof h.w.__v292Dfix402.forcePut === 'function', typeof h.w.__v292Dfix402.forcePut);
  ok('★fix659 のソースが forcePut を公開API経由で呼んでいる', /__v292Dfix402[\s\S]{0,80}forcePut/.test(CODE659));
  ok('★★フックは try/catch + 存在チェックでくるまれている（例外を漏らさない）',
     /try \{ if \(window\.__v292Dfix659 && window\.__v292Dfix659\.renderForkBanner && window\.__v292Dfix659\.renderForkBanner\(server\)\) return; \} catch\(e\)\{\}/.test(SRC402));
  ok('★フックは forkBanner の冒頭1行だけ（既存の bannerEl 管理に触っていない）',
     /function forkBanner\(server\)\{[\s\S]{0,600}?if \(bannerEl && bannerEl\.parentNode\) return;/.test(SRC402) &&
     (stripBlock(SRC402).match(/__v292Dfix659/g) || []).length === 3);
}

/* =====================================================================
   (3) 実走: 描けたら旧バナーを出さない / OFF・例外なら旧バナーへ完全フォールバック
   ===================================================================== */
console.log('\n== (3) 新バナーと旧バナーの排他（フォールバック） ==');
{
  const h = mkIndex({});
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone Safari', rev: 12, updatedAt: Date.UTC(2026, 7, 2, 5, 7) });
  ok('★★新バナーが出る', !!h.D.document.getElementById('v292Dfix659-fork'));
  ok('★★旧バナー(v292Dfix402-fork)は作られない', !h.D.document.getElementById('v292Dfix402-fork'));
  ok('★status().showing / rendered が観測できる',
     h.w.__v292Dfix659.status().showing === true && h.w.__v292Dfix659.status().rendered === 1, h.w.__v292Dfix659.status());
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone Safari' });
  ok('★★二重に呼ばれても1枚だけ（自要素の存在で二重表示ガード）',
     h.w.__v292Dfix659.status().rendered === 1 && h.D.body.children.filter(c => c.id === 'v292Dfix659-fork').length === 1,
     h.D.body.children.map(c => c.id));
}
{
  const h = mkIndex({ seed: { v292Dfix659Off: '1' } });
  ok('★★OFF なら renderForkBanner は常に false',
     h.w.__v292Dfix659.renderForkBanner({ device: 'x' }) === false);
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  ok('★★OFF なら旧バナーが出る（完全フォールバック）', !!h.D.document.getElementById('v292Dfix402-fork'));
  ok('★★OFF なら新バナーは出ない', !h.D.document.getElementById('v292Dfix659-fork'));
}
{
  /* 描画中に例外が起きても、必ず旧バナーへ倒す（黙って何も出さない状態を作らない） */
  const h = mkIndex({});
  h.w.document.createElement = () => { throw new Error('boom'); };
  ok('★★例外なら false を返す', h.w.__v292Dfix659.renderForkBanner({ device: 'x' }) === false);
  ok('★lastError が観測できる', /boom/.test(String(h.w.__v292Dfix659.status().lastError)), h.w.__v292Dfix659.status());
}
{
  const h = mkIndex({ with659: false });
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  ok('★★[対照] fix659 が載っていなければ従来どおり旧バナーが出る', !!h.D.document.getElementById('v292Dfix402-fork'));
}

/* =====================================================================
   (4) fix527 非干渉
   ===================================================================== */
console.log('\n== (4) fix527c に書き換えられない ==');
{
  const h = mkIndex({});
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone Safari', updatedAt: Date.UTC(2026, 7, 2, 5, 7) });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  const btns = el.children.filter(c => c.tagName === 'button');
  ok('★★ボタンは3つ', btns.length === 3, btns.map(b => b.textContent));
  ok('★★ボタン文言は仕様どおり',
     btns.map(b => b.textContent).join('|') === '☁ クラウド側を取り込む|この端末のつづきで進める|今は決めない',
     btns.map(b => b.textContent));
  ok('★★ボタン文言に「別端末」が無い（fix527c の書換条件に当たらない）',
     btns.every(b => String(b.textContent).indexOf('別端末') < 0), btns.map(b => b.textContent));
  ok('★★要素に __f527 マーカーが立っている（万一 fix527 が到達しても素通りする）', el.__f527 === 1);
  ok('★★全ボタンにも __f527 マーカー', btns.every(b => b.__f527 === 1));
  ok('★★fix527c が探すのは旧IDだけ（このIDは対象外）',
     /getElementById\('v292Dfix402-fork'\)/.test(SRC527) && SRC527.indexOf('v292Dfix659-fork') < 0);
  ok('★★fix527c の書換条件は「別端末」を含むボタン（新バナーは該当しない）',
     /indexOf\('別端末'\) < 0\) continue;/.test(SRC527));
  ok('★見出しが平易（「両方に新しいつづき」ではない）',
     el.children[0].textContent === '☁ この物語のつづきが2つに分かれています。', el.children[0].textContent);
  ok('★★この端末のターン数が出る（chr6_slot_sA = 7ターン）',
     el.children[1].textContent === 'この端末: 7ターン(この物語)', el.children[1].textContent);
  ok('★★クラウド側の端末名と保存時刻が出る',
     /^クラウド\(別端末: iPhone Safari\): \d+\/\d+ \d\d:\d\d保存$/.test(el.children[2].textContent), el.children[2].textContent);
  ok('★注記（選ばなかった方は残る）が出る', el.children[3].textContent.indexOf('自動バックアップに残ります') > 0, el.children[3].textContent);
}
{
  /* 実物の fix527c の書換ロジックを、この新バナーへ**実際にぶつけて**素通りを確認する */
  const h = mkIndex({});
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  const before = el.children.filter(c => c.tagName === 'button').map(b => b.textContent).join('|');
  /* fix527c 相当（実物のソースから条件をそのまま写すのではなく、実物の条件式で判定する） */
  const bs = el.children.filter(c => c.tagName === 'button');
  let replaced = 0;
  if (!el.__f527){ for (const b of bs){ if (String(b.textContent || '').indexOf('別端末') >= 0) replaced++; } }
  const after = el.children.filter(c => c.tagName === 'button').map(b => b.textContent).join('|');
  ok('★★fix527c の条件に1つも当たらない（書き換え0件・文言も不変）', replaced === 0 && before === after, { replaced, before, after });
}

/* =====================================================================
   (5) ボタンの実挙動
   ===================================================================== */
console.log('\n== (5) ボタンの実挙動 ==');
{
  const h = mkIndex({});
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  const btns = el.children.filter(c => c.tagName === 'button');
  const storeBefore = JSON.stringify(h.store);
  btns[0].onclick();
  ok('★★「☁ クラウド側を取り込む」は home.html?autopull=<この物語のslotId> へ行く（物語単位）',
     h.w.location.href === 'home.html?autopull=sA', h.w.location.href);
  ok('★★物語を名指ししている（autopull=1 のような「全部」ではない）',
     h.w.location.href.indexOf('autopull=1') < 0, h.w.location.href);
  ok('★遷移前に画面へ状態を出す', el.textContent.indexOf('ホーム画面で取り込みます') >= 0, el.textContent);
  ok('★★遷移前に S.save をしない（この端末の分岐は fork としてサーバーに残っている）',
     JSON.stringify(h.store) === storeBefore && h.calls.length === 0, h.calls.length);
  ok('★★fix659 は localStorage へ1バイトも書かない（純UI）',
     !/localStorage\.setItem/.test(CODE659) && !/localStorage\.removeItem/.test(CODE659));
}
{
  let forced = 0;
  const h = mkIndex({ server: b => b.op === 'forceput' ? (forced++, { ok: true, rev: 20 }) : { ok: false } });
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  const btns = el.children.filter(c => c.tagName === 'button');
  btns[1].onclick();
  await settle();
  ok('★★「📱 この端末のつづきで進める」は fix402.forcePut を呼ぶ（op:forceput が飛ぶ）', forced === 1, h.calls.map(c => c.op));
  ok('★★完了トーストを出す', h.status.some(s => s.indexOf('この端末のつづきで統一しました') >= 0), h.status);
  ok('★★成功したらバナーを閉じる', !h.D.document.getElementById('v292Dfix659-fork'));
}
{
  const h = mkIndex({ server: () => ({ ok: false }) });
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  el.children.filter(c => c.tagName === 'button')[1].onclick();
  await settle();
  ok('★失敗したら失敗のトーストを出す（嘘の成功を言わない）',
     h.status.some(s => s.indexOf('統一に失敗しました') >= 0), h.status);
}
{
  const h = mkIndex({});
  h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
  const el = h.D.document.getElementById('v292Dfix659-fork');
  el.children.filter(c => c.tagName === 'button')[2].onclick();
  ok('★★「今は決めない」は閉じるだけ（通信もしない）',
     !h.D.document.getElementById('v292Dfix659-fork') && h.calls.length === 0, h.calls.length);
  ok('★閉じたあとに再度 fork が来たらまた出せる', (() => {
    h.w.__v292Dfix402.forkBanner({ device: 'iPhone' });
    return !!h.D.document.getElementById('v292Dfix659-fork');
  })());
}

/* =====================================================================
   (6) home の autopull
   ===================================================================== */
console.log('\n== (6) home.html の autopull ==');
{
  const F = fixture(10, 96);
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★autopull=<slotId> で取り込みが自動実行される', slotTurns(h.store) === 96, slotTurns(h.store));
  ok('★★replaceState でクエリから autopull を落とす（リロードで再発火させない）',
     h.replaces.length === 1 && h.replaces[0].indexOf('autopull') < 0, h.replaces);
  ok('★★通常の pull() は走らない（op:meta は1回だけ＝二重pullを作らない）',
     h.ops.filter(o => o === 'meta').length === 1, h.ops);
}
{
  const F = fixture(10, 96);
  const h = mkHome({ seed: F.seed, server: F.server, search: '?vr=1&autopull=' + SLOT + '&x=2' });
  await settle();
  ok('★autopull 以外のクエリは残す', h.replaces[0].indexOf('vr=1') > 0 && h.replaces[0].indexOf('x=2') > 0, h.replaces);
}
{
  const F = fixture(10, 96);
  delete F.seed.v292ProxyPass;
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★未ログインなら理由を画面に出して終わる（黙って何もしない、をしない）',
     /ログイン/.test(h.nodes.sync.textContent) && h.ops.length === 0, { t: h.nodes.sync.textContent, ops: h.ops });
}
{
  const F = fixture(10, 96);
  const h = mkHome({ seed: F.seed, server: F.server, search: '' });
  await settle();
  ok('★★autopull が無いときは従来どおり pull()（回帰なし）', slotTurns(h.store) === 96 && h.replaces.length === 0, h.replaces);
}

/* =====================================================================
   (7) ★真分岐の取り込み回帰（§3）
   ===================================================================== */
console.log('\n== (7) 真分岐が home pull で入るか（実因の固定） ==');
{
  /* (a) 仕様どおりの fixture: ローカル10T / クラウド96T */
  const F = fixture(10, 96);
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  ok('★★ローカル10T / クラウド96T は起動時 pull() で 96T が書かれる（取り込み自体は健全）',
     slotTurns(h.store) === 96, slotTurns(h.store));
  ok('★baseRev は serverRev へ進む', h.store['v292Dfix402_baseRev'] === '96', h.store['v292Dfix402_baseRev']);
  ok('★meta のローカル差分（updatedAt が新しい）があっても本体の書込みは止まらない',
     (JSON.parse(h.store['chr6_slots_meta'])[0].updatedAt) === 9999, h.store['chr6_slots_meta']);
}
{
  /* (b) G1: 一度スキップすると baseRev だけ進み、以後 force 無しでは「最新です」で終わる */
  const F = fixture(120, 96);
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  /* ★実因G1 の芯は「スキップしたのに baseRev だけ serverRev まで進む」ことだった。
     fix661(B) で**据え置く**ようにしたので、ここは「進まない」ことを固定する。
     （進まなければ次回の起動時 pull() が普通に走る＝罠そのものが消える） */
  ok('★★[実因G1の根治] スキップした回は baseRev を進めない（fix661/B）',
     h.store['v292Dfix402_baseRev'] === '0', h.store['v292Dfix402_baseRev']);
  const F2 = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h2 = mkHome({ seed: F2.seed, server: F2.server });
  await settle();
  ok('★★[実因G1] 以後の起動時 pull() は「☁ 最新です」で何もしない＝真分岐が永久に入らない',
     h2.nodes.sync.textContent === '☁ 最新です' && slotTurns(h2.store) === 120, h2.nodes.sync.textContent);
}
{
  /* (c) G2: ローカルの方が長いと pull(true) でも上書きされない */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h = mkHome({ seed: F.seed, server: F.server });
  await settle();
  h.fire('downBtn', 'click');            // = pull(true)
  await settle();
  ok('★★[実因G2] 「☁ いま取り込む」(pull(true)) では上書きしない（既存の約束を守る）',
     slotTurns(h.store) === 120, slotTurns(h.store));
  ok('★その旨を画面に出す', /この端末の方が進んでいる/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★控えも作らない（上書きしていないので不要）',
     Object.keys(h.store).filter(k => k.indexOf('chr6_bk_home_pull_ahead_') === 0).length === 0);
}
{
  /* (d) autopull なら控えを取って取り込む */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★[解決] autopull(force+adoptCloud) なら真分岐でもクラウド側が入る',
     slotTurns(h.store) === 96, slotTurns(h.store));
  const bks = Object.keys(h.store).filter(k => k.indexOf('chr6_bk_home_pull_ahead_') === 0);
  ok('★★上書き前にこの端末の分を控えている', bks.length === 1, bks);
  ok('★★控えの中身は上書き前の本体そのもの（読み戻せる）', (() => {
    try { const d = JSON.parse(h.store[bks[0]]); return JSON.parse(d.ls['chr6_slot_' + SLOT]).turns.length === 120; } catch(e){ return false; }
  })(), h.store[bks[0]] && h.store[bks[0]].slice(0, 80));
  ok('★★取り込んだことを画面に出す（黙って短くしない）',
     /クラウド側のつづきを取り込みました/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★スキップが無くなるので共有revの収束証明が通る', h.store['v292Dfix402_baseRev'] === '96');
}
{
  /* ★★(d-1b) 統括指摘: 保護を外すのは名指しされた**この物語だけ**。
     この端末で進んでいる別の物語は、autopull の回でも従来どおり守られていなければならない。 */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' }, { local: 40, remote: 5 });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★名指しした物語だけがクラウド側に入れ替わる', slotTurns(h.store, SLOT) === 96, slotTurns(h.store, SLOT));
  ok('★★名指ししていない物語は、この端末の方が進んでいれば守られる（黙って短くしない）',
     slotTurns(h.store, SLOT2) === 40, slotTurns(h.store, SLOT2));
  ok('★★守った物語は従来どおり skipped として画面に出る',
     /この端末の方が進んでいる物語が 1 件/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
  ok('★★取り込んだ物語の控えは1件だけ（他の物語には触っていない）', (() => {
    const bks = Object.keys(h.store).filter(k => k.indexOf('chr6_bk_home_pull_ahead_') === 0);
    return bks.length === 1 && bks[0].indexOf(SLOT) > 0 && bks[0].indexOf(SLOT2) < 0;
  })(), Object.keys(h.store).filter(k => k.indexOf('chr6_bk_home_pull_ahead_') === 0));
}
{
  /* ★★(d-1c) 旧形式 autopull=1（不正・名指し無し）では G2 バイパスを起こさない（安全側・後方互換） */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=1' });
  await settle();
  ok('★★autopull=1（物語の名指し無し）は強制取り込みだけ＝local-ahead 保護は外さない',
     slotTurns(h.store) === 120, slotTurns(h.store));
  ok('★★それでも force は効くので pull 自体は走る（G1 は解決したまま）',
     h.ops.filter(o => o === 'get').length === 1, h.ops);
  ok('★控えも作らない（上書きしていない）',
     Object.keys(h.store).filter(k => k.indexOf('chr6_bk_home_pull_ahead_') === 0).length === 0);
}
{
  /* ★★(d-1d) 存在しない/不正な slotId を名指しされても、誰の保護も外さない */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + encodeURIComponent('../*bad id') });
  await settle();
  ok('★★不正な slotId は無視して保護を維持する', slotTurns(h.store) === 120, slotTurns(h.store));
}
{
  /* (d-2) 控えが取れない端末では**上書きしない**（fail-closed） */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96' });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT, readonlyKeys: /^chr6_bk_home_pull_ahead_/ });
  await settle();
  ok('★★[fail-closed] 控えが読み戻せないなら上書きしない', slotTurns(h.store) === 120, slotTurns(h.store));
  ok('★その場合は従来どおり「守った」と伝える', /この端末の方が進んでいる/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}
{
  /* (d-3) 緊急停止スイッチ */
  const F = fixture(120, 96, { 'v292Dfix402_baseRev': '96', 'v292Dfix659AdoptOff': '1' });
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★v292Dfix659AdoptOff=1 なら上書きせず現行動作へ戻る', slotTurns(h.store) === 120, slotTurns(h.store));
  ok('★★その場合でも force は効くので pull 自体は走る（G1 は解決したまま）',
     h.ops.filter(o => o === 'get').length === 1, h.ops);
}
{
  /* 墓標のある物語は autopull でも復活させない（fix602 の防壁を壊していない） */
  const F = fixture(120, 96);
  F.seed['chr6_slots_meta'] = JSON.stringify([{ id: SLOT, name: '白鷺荘', deleted: true, deletedAt: 1,
    deleteOpId: 'del_1', recoverySnapshotId: 'chr6_snap_x', lifecycleVersion: 1, updatedAt: 9999 }]);
  delete F.seed['chr6_slot_' + SLOT];
  const h = mkHome({ seed: F.seed, server: F.server, search: '?autopull=' + SLOT });
  await settle();
  ok('★★[非回帰] 墓標が立った物語は autopull でも復活しない（fix602 の墓標バリア）',
     h.store['chr6_slot_' + SLOT] === undefined, h.store['chr6_slot_' + SLOT]);
}

/* =====================================================================
   (8) fix658 のフックを壊していない
   ===================================================================== */
console.log('\n== (8) fix658 のフックが無傷 ==');
{
  ok('★fix402 の fix658 フックは4か所のまま',
     (stripBlock(SRC402).match(/__v292Dfix658\.\w+\s*\(/g) || []).length === 4);
  ok('★home.html の fix658 フックは3か所のまま',
     (CODEHOME.match(/__v292Dfix658\.\w+\s*\(/g) || []).length === 3);
  {
    /* 実走: fix658 + fix659 + fix402 を同居させ、fork 応答で
       「新バナーが出る」かつ「fix658 の put-fork 記録も走る」ことを同時に確かめる。 */
    const h = mkIndex({ with658: true,
      seed: { 'v292Dfix658_anchor': JSON.stringify({ v: 1, localBaseRev: 8, localBasePackageHash: 'PHOLD', localLsHash: '1:1', at: 1, via: 'put' }) },
      server: b => b.op === 'put' ? { ok: true, fork: true, server: { rev: 12, device: 'iPhone' } }
               : b.op === 'commitstate' ? { ok: true, rev: 12, packageHash: 'PHNEW' } : { ok: false } });
    const res = await h.w.__v292Dfix402.flush('t');
    await settle();
    ok('★★fork 応答の戻り値は従来どおり fork', res === 'fork', res);
    ok('★★新バナーが出る（fix659 が効いている）', !!h.D.document.getElementById('v292Dfix659-fork'));
    ok('★★同じ回に fix658 の put-fork 記録も走る（観測を止めていない）',
       (h.w.__v292Dfix658.census().events[0] || {}).where === 'put-fork', h.w.__v292Dfix658.census().events);
  }
  ok('★index.html に fix658 と fix659 が両方積まれている',
     HTMLU.indexOf('v292Dfix658-lineage-shadow.js') > 0 && HTMLU.indexOf('v292Dfix659-fork-choice.js') > 0);
}

/* =====================================================================
   (9) 出荷の体裁
   ===================================================================== */
console.log('\n== (9) 出荷の体裁 ==');
{
  const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, token);
  ok('★★index.html に fix659 の script がある（cb は今の fix札）',
     (HTMLU.match(/v292Dfix659-fork-choice\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HTMLU.match(/v292Dfix659-fork-choice\.js\?cb=[^"]*/) || [])[0]);
  ok('★★fix659 は fix527 より後に置く（付け替えとの関係を並びで示す）',
     HTMLU.indexOf('v292Dfix659-fork-choice.js') > HTMLU.indexOf('v292Dfix527-story-url.js'));
  ok('★★中身を変えた fix402 の cb も今の fix札',
     (HTMLU.match(/v292Dfix402-invisible-sync\.js\?cb=v292D(\w+)/) || [])[1] === token,
     (HTMLU.match(/v292Dfix402-invisible-sync\.js\?cb=[^"]*/) || [])[0]);
  ok('★★home.html には fix659 の js を積まない（バナーは物語画面専用）',
     HOME.indexOf('v292Dfix659-fork-choice.js') < 0);
  ok('★★home 側の autopull はインラインで入っている',
     /autopull=/.test(CODEHOME) && /function autoPullOnce/.test(HOME) && /pull\(true, adoptId\)/.test(HOME));
  ok('★index.html の NUL は1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★home.html に NUL / CRLF は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'home.html'));
    return b.filter(x => x === 0).length === 0 && b.indexOf(Buffer.from('\r\n')) < 0;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
