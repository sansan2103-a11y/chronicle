#!/usr/bin/env node
/* test_fix663.cjs — ホームでも Google ログインできるようにする
 *
 * ■背景
 *   ログインはゲーム画面(v292Dfix328-google-login.js)にしか無く、Googleトークンが切れると
 *   home は「ゲーム画面からログインし直してください」としか言えなかった。
 *
 * ■このテストが固定する契約
 *   (1) client id が fix328 と**同一**（違うと片方でログインしても もう片方が読めない）
 *   (2) 保存キー・保存形式が fix328 と**同一**（v292GoogleToken = {token,exp,email,name,pic}）
 *   (3) GIS の初期化パラメータが fix328 と同一・二重初期化しない・スクリプトは1回だけ読む
 *   (4) 状態表示4種（Google✓/期限切れ/合言葉のみ/未ログイン）とボタンの出し分け
 *   (5) ログイン成功 → v292GoogleToken 保存 → 取り込みを**自動で1回**実行
 *   (6) 失敗（ポップアップブロック/スクリプト/保存失敗）は最上部 notes(showNotes) に理由を出す
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME   = read('home.html');
const SRC328 = read('v292Dfix328-google-login.js');
const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC564 = read('v292Dfix564-snapshot.js');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const SRC590 = read('v292Dfix590-commit-ledger.js');
const SRC_GW = read('v292Dfix660-delete-gateway.js');
const SRC_GC = read('v292Dfix660-backup-gc.js');

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i })) });
const SLOT = 'shirasagi';
const settle = async (n = 300) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

function mkLS(seed, opts){
  opts = opts || {};
  const store = Object.assign(Object.create(null), seed || {});
  const removed = [];
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ if (opts.blockKey && opts.blockKey === k){ const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem(k){ removed.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removed
  };
  const RES = { getItem:1, setItem:1, removeItem:1, key:1, length:1, clear:1, __store:1, __removed:1 };
  return new Proxy(api, {
    get(t, p){ if (typeof p === 'symbol' || RES[p] || (p in t)) return t[p];
               return Object.prototype.hasOwnProperty.call(store, p) ? store[p] : undefined; },
    has(t, p){ return RES[p] || (p in t) || Object.prototype.hasOwnProperty.call(store, p); },
    ownKeys(){ return Object.keys(store); },
    getOwnPropertyDescriptor(t, p){
      if (Object.prototype.hasOwnProperty.call(store, p)) return { value: store[p], enumerable: true, configurable: true, writable: true };
      return undefined; }
  });
}
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const b = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return b[b.length - 1];
}
const HOME_JS = homeScript();

/* GIS(Google Identity Services)のモック。挙動は opts.gis で切り替える */
function mkHome(opts){
  opts = opts || {};
  const ls = opts.ls || mkLS(opts.seed || {}, opts);
  const nodes = {}, listeners = {};
  const appended = [];
  function mkEl(id){
    const e = { id, tagName: 'div', src: '', async: false, defer: false, onload: null, onerror: null,
      value: '', textContent: '', innerHTML: '', className: '', style: { cssText: '', display: '' }, checked: false,
      children: [], addEventListener(t, f){ (listeners[id] = listeners[id] || {})[t] = f; },
      appendChild(c){ e.children.push(c); appended.push(c); if (c && c.src && opts.onScript) opts.onScript(c); return c; },
      removeChild(){}, remove(){}, querySelectorAll: () => [], setAttribute(){}, getAttribute: () => null,
      removeAttribute(){}, click(){}, closest: () => null, classList: { add(){}, remove(){}, contains: () => false } };
    nodes[id] = e; return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile',
   'gcBtn','capMeter','gLoginBtn','loginState','noteMore','noteRest'].forEach(mkEl);
  const body = mkEl('__body'), head = mkEl('__head');
  const document = { body, head, getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__e' + Math.random()), createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [], addEventListener(){} };
  const sent = [];
  const gisCalls = { initialize: [], prompt: 0 };
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'iPhone Safari' },
    location: { href: '', search: opts.search || '', pathname: '/home.html', hash: '', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: (f) => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} }, AbortController: undefined,
    atob: (x) => Buffer.from(String(x), 'base64').toString('binary'),
    /* ★本物の escape() は非ASCIIを %XX へ。ここを手抜きすると日本語の name が化けて
       「fix328 と同じ形で保存できている」ことを検証できなくなる。 */
    escape: (x) => String(x).replace(/[^A-Za-z0-9@*_+\-./]/g, (c) => {
      const n = c.charCodeAt(0);
      return n < 256 ? '%' + n.toString(16).toUpperCase().padStart(2, '0')
                     : '%u' + n.toString(16).toUpperCase().padStart(4, '0');
    }),
    unescape: (x) => String(x),
    decodeURIComponent, encodeURIComponent,
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok: true, text: () => Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){ b = {}; }
      sent.push(b);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve((opts.server || (() => ({ ok: false })))(b)) });
    }
  };
  if (opts.gis !== false){
    w.google = { accounts: { id: {
      initialize(cfg){ gisCalls.initialize.push(cfg); w.__gisCb = cfg.callback; },
      prompt(cb){ gisCalls.prompt++; if (opts.promptBehavior) opts.promptBehavior(cb, w); },
      disableAutoSelect(){}
    } } };
  }
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC579, ctx, { filename: 'f579' });
  vm.runInContext(SRC562, ctx, { filename: 'f562' });
  vm.runInContext(SRC564, ctx, { filename: 'f564' });
  vm.runInContext(SRC_GW, ctx, { filename: 'f660gw' });
  vm.runInContext(SRC_GC, ctx, { filename: 'f660gc' });
  vm.runInContext(SRC587, ctx, { filename: 'f587' });
  vm.runInContext(SRC590, ctx, { filename: 'f590' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home' });
  return { w, ls, nodes, sent, gisCalls, appended,
           fire: (id, t, ev) => { const f = listeners[id] && listeners[id][t]; return f ? f(ev || {}) : undefined; } };
}
/* テスト用の JWT（header.payload.signature の payload だけ本物にする） */
function mkJwt(payload){
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return b64({ alg: 'none' }) + '.' + b64(payload) + '.sig';
}
function baseSeed(extra){
  const meta = JSON.stringify([{ id: SLOT, name: '白鷺荘', key: 'chr6_slot_' + SLOT, updatedAt: 5 }]);
  return Object.assign({ 'chr6_slots_meta': meta, ['chr6_slot_' + SLOT]: story(10),
                         'chr6_active_slot': JSON.stringify(SLOT), 'v292Dfix402_baseRev': '0' }, extra || {});
}
const server = b => b.op === 'meta' ? { ok: true, rev: 492, ns: 'ns1', meta: { updatedAt: 9, device: 'Win' } }
  : b.op === 'get' ? { ok: true, rev: 492, ns: 'ns1', data: { ls: { ['chr6_slot_' + SLOT]: story(96) }, updatedAt: 9 } }
  : { ok: false };

(async () => {

/* =====================================================================
   (1)(2)(3) fix328 との同一性
   ===================================================================== */
console.log('== (1)(2)(3) fix328 と同じ client id / 保存形式 / GIS初期化 ==');
{
  const idHome = (HOME.match(/F663_BAKED_CLIENT_ID = '([^']+)'/) || [])[1];
  const id328  = (SRC328.match(/BAKED_CLIENT_ID = '([^']+)'/) || [])[1];
  ok('★★client id が fix328 と完全一致', !!id328 && idHome === id328, { idHome, id328 });
  ok('★上書きキーも同じ（v292GoogleClientId）',
     /v292GoogleClientId/.test(HOME) && /v292GoogleClientId/.test(SRC328));
  ok('★★保存キーが v292GoogleToken', /s\('v292GoogleToken', JSON\.stringify\(rec\)\)/.test(HOME));
  ok('★★保存形式が fix328 と同じ5フィールド',
     /rec = \{ token: jwt, exp: p\.exp \|\| 0, email: String\(p\.email\|\|''\)\.toLowerCase\(\), name: p\.name \|\| '', pic: p\.picture \|\| '' \}/.test(HOME));
  ok('★★fix328 も同じ5フィールドで書いている（写し間違いを検出する）',
     /store\(\{ token: jwt, exp: p\.exp\|\|0, email: \(p\.email\|\|''\)\.toLowerCase\(\), name: p\.name\|\|'', pic: p\.picture\|\|'' \}\)/.test(SRC328));
  ok('★★有効判定式が fix328/fix601 と同じ（exp は秒・30秒の余裕）',
     /\(t\.exp\*1000\) > \(Date\.now\(\)\+30000\)/.test(HOME) && /\(T\.exp\*1000\) > \(Date\.now\(\)\+30000\)/.test(SRC328));
  ok('★★GIS スクリプトURLが同じ',
     /accounts\.google\.com\/gsi\/client/.test(HOME) && /accounts\.google\.com\/gsi\/client/.test(SRC328));
  for (const k of ['client_id', 'callback', 'auto_select', 'cancel_on_tap_outside', 'use_fedcm_for_prompt'])
    ok('★GIS初期化に ' + k + ' がある（fix328 と同じ組）', HOME.indexOf(k) > 0 && SRC328.indexOf(k) > 0);
  ok('★★二重初期化しない（f663Inited ガード）', /if \(!f663Inited\)\{/.test(HOME) && /f663Inited = true;/.test(HOME));
  ok('★★GIS スクリプトは1回だけ読む（f663GisReady / f663GisLoading）',
     /f663GisReady = false, f663GisLoading = false/.test(HOME) && /if \(f663GisLoading\)\{/.test(HOME));
  ok('★fix328 側は1バイトも変えていない',
     SRC328.indexOf('fix663') < 0 && SRC328.indexOf('f663') < 0);
}

/* =====================================================================
   (4) 状態表示とボタンの出し分け
   ===================================================================== */
console.log('\n== (4) 状態表示4種とボタンの出し分け ==');
const future = Math.floor(Date.now() / 1000) + 3 * 3600;
const past   = Math.floor(Date.now() / 1000) - 3600;
{
  const h = mkHome({ seed: baseSeed({ 'v292GoogleToken': JSON.stringify({ token: 't', exp: future, email: 'a@b.c' }) }), server });
  await settle();
  ok('★★Google有効 → 「ログイン: Google ✓（残りn時間 …）」',
     /^ログイン: Google ✓（残り\d+時間 \/ a@b\.c）$/.test(h.nodes.loginState.textContent), h.nodes.loginState.textContent);
  ok('★★有効ならボタンは出さない', h.nodes.gLoginBtn.style.display === 'none', h.nodes.gLoginBtn.style.display);
}
{
  const h = mkHome({ seed: baseSeed({ 'v292GoogleToken': JSON.stringify({ token: 't', exp: past }) }), server });
  await settle();
  ok('★★期限切れ → 「Google期限切れ」', /Google期限切れ/.test(h.nodes.loginState.textContent), h.nodes.loginState.textContent);
  ok('★★期限切れならボタンを出す', h.nodes.gLoginBtn.style.display === '', h.nodes.gLoginBtn.style.display);
}
{
  const h = mkHome({ seed: baseSeed({ 'v292ProxyPass': 'pw' }), server });
  await settle();
  ok('★★合言葉だけ → 「合言葉のみ」', /合言葉のみ/.test(h.nodes.loginState.textContent), h.nodes.loginState.textContent);
  ok('★合言葉だけでもGoogleログインは案内する', h.nodes.gLoginBtn.style.display === '');
}
{
  const h = mkHome({ seed: baseSeed(), server });
  await settle();
  ok('★★何も無い → 「未ログイン」', /未ログイン/.test(h.nodes.loginState.textContent), h.nodes.loginState.textContent);
  /* ★fix667: 旧prompt経路のボタン名を直接書いていたが、iPhone ではそのボタンを隠すので
     文言が変わった。**この試験が本当に守りたいのは「ホームでログインしろと言うこと」**
     （fix663 以前は「ゲーム画面からログインし直してください」としか言えなかった）。
     ボタン名の固定値ではなく、その意味で縛り直す。退行文言の禁止も足すので契約は弱くならない。 */
  ok('★未ログインの案内文がホームでのログインを指す', (() => {
    /* ★whyNotLoggedIn の**本体だけ**を見る。home.html 全体で探すと、別の場所（fix667 のゲート案内）
       に同じ語があるだけで通ってしまい、この文言が退行しても気づけない。
       退行文言の検査はコメントを除いた実行部に掛ける（fix667 の由来コメントに
       「ゲーム画面からログインし直してください」という過去の症状の引用があるため）。 */
    const i = HOME.indexOf('function whyNotLoggedIn(');
    const body = i < 0 ? '' : HOME.slice(i, HOME.indexOf('\n  }', i)).replace(/\/\*[\s\S]*?\*\//g, '');
    return body.length > 0
        && /ホームのGoogle公式ログインボタンからログインしてください。/.test(body)
        && /ホームのGoogle公式ログインボタンからログインし直してください。/.test(body)
        && !/ゲーム画面からログイン/.test(body);
  })(), (HOME.match(/ログインしていないため同期できません。[^']*/) || [])[0]);
}
{
  const h = mkHome({ seed: baseSeed({ 'v292GoogleLoginOff': '1' }), server });
  await settle();
  ok('★★v292GoogleLoginOff=1 ならボタンを出さない', h.nodes.gLoginBtn.style.display === 'none');
}

/* =====================================================================
   (5) ログイン成功 → 保存 → 自動で取り込み
   ===================================================================== */
console.log('\n== (5) ログイン成功で保存し、取り込みを自動で1回だけ実行する ==');
{
  const jwt = mkJwt({ exp: future, email: 'Oshin@Example.COM', name: 'おしん', picture: 'http://p' });
  const h = mkHome({
    seed: baseSeed(), server,
    promptBehavior: (cb, w) => { w.__gisCb({ credential: jwt }); }
  });
  await settle();
  const before = h.sent.filter(b => b.op === 'get').length;
  h.fire('gLoginBtn', 'click');
  /* ★ログイン直後の掲示は同期で出る。そのあとの自動 pull が掲示を上書きするので、ここで見る。 */
  const loginNote = h.nodes.note.innerHTML;
  await settle();
  const saved = JSON.parse(h.ls.getItem('v292GoogleToken'));
  ok('★★v292GoogleToken に fix328 と同じ形で保存される',
     saved.token === jwt && saved.exp === future && saved.name === 'おしん' && saved.pic === 'http://p', saved);
  ok('★★email は小文字化して保存（fix328 と同じ）', saved.email === 'oshin@example.com', saved.email);
  ok('★★GIS の initialize は1回だけ', h.gisCalls.initialize.length === 1, h.gisCalls.initialize.length);
  ok('★★client id が initialize に渡っている',
     h.gisCalls.initialize[0].client_id === (SRC328.match(/BAKED_CLIENT_ID = '([^']+)'/) || [])[1]);
  ok('★★ログイン直後に取り込みが自動で走る（op:get が増える）',
     h.sent.filter(b => b.op === 'get').length > before, { before, after: h.sent.filter(b => b.op === 'get').length });
  ok('★★実際に96Tが取り込まれた', (() => {
    try { return JSON.parse(h.ls.getItem('chr6_slot_' + SLOT)).turns.length === 96; } catch(e){ return false; }
  })());
  ok('★★状態表示が「Google ✓」へ更新される', /Google ✓/.test(h.nodes.loginState.textContent), h.nodes.loginState.textContent);
  ok('★ボタンは消える', h.nodes.gLoginBtn.style.display === 'none');
  ok('★ログインしたことを最上部に出す（直後）', /Googleでログインしました/.test(loginNote), loginNote);
  ok('★そのあと取り込み結果の診断行に置き換わる', /☁ サーバ: rev492/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}

/* =====================================================================
   (6) 失敗時は理由を最上部 notes に出す
   ===================================================================== */
console.log('\n== (6) 失敗の理由を最上部に出す ==');
{
  /* ポップアップ/FedCM がブロックされた（isNotDisplayed） */
  const h = mkHome({ seed: baseSeed(), server,
    promptBehavior: (cb) => { if (cb) cb({ isNotDisplayed: () => true, isSkippedMoment: () => false }); } });
  await settle();
  h.fire('gLoginBtn', 'click');
  await settle();
  ok('★★ブロック時は理由と対処を出す',
     /ログイン画面が表示されませんでした/.test(h.nodes.note.innerHTML) && /ポップアップ/.test(h.nodes.note.innerHTML),
     h.nodes.note.innerHTML);
  ok('★★トークンは保存されない', h.ls.getItem('v292GoogleToken') == null);
  ok('★★勝手に取り込みも走らない', h.sent.filter(b => b.op === 'get').length === 0, h.sent.map(b => b.op));
}
{
  /* skipped moment も同じ扱い */
  const h = mkHome({ seed: baseSeed(), server,
    promptBehavior: (cb) => { if (cb) cb({ isNotDisplayed: () => false, isSkippedMoment: () => true }); } });
  await settle();
  h.fire('gLoginBtn', 'click');
  await settle();
  ok('★スキップされた場合も理由を出す', /ログイン画面が表示されませんでした/.test(h.nodes.note.innerHTML));
}
{
  /* GIS スクリプトが読めない */
  const h = mkHome({ seed: baseSeed(), server, gis: false,
    onScript: (sc) => { if (sc.onerror) sc.onerror(); } });
  await settle();
  h.fire('gLoginBtn', 'click');
  await settle();
  ok('★★スクリプトを読めないときも理由を出す',
     /ログイン部品を読み込めませんでした/.test(h.nodes.note.innerHTML), h.nodes.note.innerHTML);
}
{
  /* 保存できない（容量不足） */
  const jwt = mkJwt({ exp: future, email: 'x@y.z' });
  const ls = mkLS(baseSeed(), { blockKey: 'v292GoogleToken' });
  const h = mkHome({ ls, blockKey: 'v292GoogleToken', server,
    promptBehavior: (cb, w) => { w.__gisCb({ credential: jwt }); } });
  await settle();
  h.fire('gLoginBtn', 'click');
  await settle();
  ok('★★保存できないときは容量不足として案内する',
     /ログイン情報を保存できませんでした/.test(h.nodes.note.innerHTML) && /容量を空ける/.test(h.nodes.note.innerHTML),
     h.nodes.note.innerHTML);
}
{
  ok('★★エラー表示は showNotes 経由＝画面最上部（fix662 の位置）',
     /function f663Fail\(why\)\{[\s\S]{0,900}?showNotes\(\[msg\]\)/.test(HOME));
  ok('★★成功表示も showNotes 経由', /showNotes\(\['🔑 Googleでログインしました/.test(HOME));
}

/* =====================================================================
   (7) 出荷の体裁
   ===================================================================== */
console.log('\n== (7) 出荷の体裁 ==');
{
  const ver = read('version.txt').trim();
  const HTMLU = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
  ok('★★BUILT / HOME_BUILT / fix654 BUILD が version.txt と同値',
     (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver &&
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver &&
     (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver, ver);
  ok('★home.html に fix328 の script タグは積まない（形式を共有するだけ・二重初期化を作らない）',
     !/<script src="v292Dfix328-google-login\.js/.test(HOME));
  ok('★home.html の直接削除は既存3か所のまま', (() => {
    const code = HOME.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    return (code.match(/\.removeItem\s*\(/g) || []).length === 3;
  })());
  ok('★home.html に NUL / CRLF は無い', (() => {
    const b = fs.readFileSync(path.join(__dirname, 'home.html'));
    return b.filter(x => x === 0).length === 0 && b.indexOf(Buffer.from('\r\n')) < 0;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
