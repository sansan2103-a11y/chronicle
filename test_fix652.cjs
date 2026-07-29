/* 回帰テスト: v292Dfix652 — ストリームガード(fix651A)の LIVE 判定を fix643 の救済ゲートから分離する
 *
 * ★このテストが固定する契約（GPT裁定・緩めない）。値ではなく**振る舞い**で見る。
 *   固定値（BUILT の中身・件数）では縛らない。縛るのは「この2つが同値」のような関係だけ。
 *
 * [1] フラグOFF（既定）… ガードの live は従来どおり fix643 の live() 従属
 *   1a allowlist外の物語では shadow ＝ ターンは従来どおり確定する
 *   1b 端末フラグが無ければ localStorage を1バイトも増やさない（新キーを勝手に作らない）
 *
 * [2] v292Dfix652StreamGuardAllLive='1' … ガードだけ全物語 LIVE
 *   2a allowlist外の物語でも遮断する（暴走本文を採用しない）
 *   2b ターン数を増やさない・保存しない・パース/描画へ進まない・入力は残る
 *   2c 案内バナー（既存の生成失敗UX）が出る
 *   2d 誤検出の逃げ道（「最初の文章を確認する」）は従来どおり効く
 *   2e v292Dfix643Live すら無い素の端末でも同じ（fix643 の live とは独立）
 *   2f 正常な応答は遮断しない（フラグを立てただけでは何も止まらない）
 *
 * [3] 救済生成の live 判定は**変えない**（allowlist canary 維持）
 *   3a allowlist外では救済生成を撃たない（Api.call は1回）
 *   3b allowlist外では fix650 の ring を1バイトも書かない
 *   3c fix643.isLive() は allowlist外で false のまま
 *   3d allowlist内（canary）では従来どおり救済が走り、採用まで到達する
 *
 * [4] kill スイッチの優先順位
 *   4a v292Dfix651StreamGuardOff='1' は AllLive より優先して全停止
 *   4b OFF のとき fix651 は記録用キーを1バイトも書かない
 *
 * [5] 端末別の観測カウンタ
 *   5a inspected / tripped / blocked が遮断経路で増える
 *   5b abortCompleted と abortLatency（直近N件のms）が残る
 *   5c 遮断→救済成功で rescued、遮断→救済も遮断で retryFailed
 *   5d 遮断のあとにターンが増える書込みが来たら writesAfterAbort が増える
 *   5e falseTrip は人手マークで増える
 *   5f カウンタは __v292Dfix651.stats() から読める／既存 stats キーへ相乗りする
 *
 * [Z] 出荷の体裁（関係で縛る。リテラルでは縛らない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC624 = read('v292Dfix624-degeneration-probe.js');
const SRC643 = read('v292Dfix643-collapse-rescue.js');
const SRC650 = read('v292Dfix650-rescue-safety.js');
const SRC651 = read('v292Dfix651-guards.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');
const HOME   = read('home.html');

const ALLLIVE = 'v292Dfix652StreamGuardAllLive';
const CANARY = ['sms4np33eyg', 'sms5t2snqso'];
const IN_SLOT  = 'chr6_slot_' + CANARY[0];          /* allowlist に載っている物語 */
const OUT_SLOT = 'chr6_slot_notonthelist';          /* 載っていない物語（おしんの本物の物語の代役） */

/* ---------------- 見本づくり（繰り返しの無い擬似日本語） ---------------- */
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
function varied(n, punct, seed0){
  let s = '', seed = seed0 || 999, i = 0;
  while (s.length < n){
    let seg = '';
    for (let j = 0; j < 12; j++){ seed = (seed * 1103515245 + 12345) % 2147483648; seg += KANA.charAt(seed % KANA.length); }
    s += seg; i++;
    if (punct){ s += '、'; if (i % 3 === 0) s += '。\n'; }
  }
  return s.slice(0, n);
}
const NORMAL_LONG = varied(4000, true);          /* 正常な長文 */
const HUGE_NORMAL = varied(13000, true);         /* 中身は正常だが長すぎる応答（ガードだけが捕まえる） */
const RUNAWAY     = varied(1600, false);         /* 句読点が消えた暴走 */

/* ---------------- 最小DOM ---------------- */
function mkEl(tag){
  const el = {
    tagName: String(tag).toLowerCase(), id: '', textContent: '', value: '',
    style: { cssText: '' }, children: [], parentNode: null, _h: {},
    appendChild(c){ c.parentNode = el; el.children.push(c); return c; },
    removeChild(c){ const i = el.children.indexOf(c); if (i >= 0){ el.children.splice(i, 1); c.parentNode = null; } },
    addEventListener(ev, fn){ (el._h[ev] = el._h[ev] || []).push(fn); },
    click(){ (el._h.click || []).slice().forEach(f => f()); },
    focus(){}
  };
  return el;
}
function findById(root, id){
  if (!root) return null;
  if (root.id === id) return root;
  for (let i = 0; i < (root.children || []).length; i++){ const r = findById(root.children[i], id); if (r) return r; }
  return null;
}
function findByLabel(root, label){
  if (!root) return null;
  if (root.textContent === label) return root;
  for (let i = 0; i < (root.children || []).length; i++){ const r = findByLabel(root.children[i], label); if (r) return r; }
  return null;
}

/* ---------------- モック window ---------------- */
function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const inp = mkEl('textarea'); inp.id = 'inp';
  const body = mkEl('body');
  const doc = { readyState: 'complete', addEventListener(){}, body: body, createElement: mkEl,
                getElementById(id){ return id === 'inp' ? inp : findById(body, id); } };
  const w = {
    localStorage: ls,
    console: { log(){}, warn(){}, error(){} },
    setTimeout: (fn) => { try { if (typeof fn === 'function') fn(); } catch(e){} return 0; },
    clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Promise: Promise, JSON: JSON, Date: Date, AbortController: AbortController,
    location: { search: opts.search || '' },
    document: doc,
    __chr6Key: () => opts.slotKey || 'chr6'
  };
  w.window = w; w.__store = store; w.__ls = ls; w.__inp = inp; w.__body = body;
  return w;
}

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* ---------------- モック Api / G（index.html G.submit の順序をそのまま写した代役） ---------------- */
function wire(w, S, responses){
  const trace = { apiCalls: [], parsePlan: 0, saves: 0, appendTurn: 0, status: [] };
  const queue = responses.slice();
  w.Api = {
    async call(system, userContent, maxTok, opts){
      trace.apiCalls.push({ system, user: userContent, argc: arguments.length });
      const r = queue.length ? queue.shift() : null;
      return r === null ? null : { text: r };
    }
  };
  const Planner = { build: (mode, text) => ({ sys: 'SYS', user: 'USER:' + text }),
                    parsePlan: (raw) => { trace.parsePlan++; return { narrative: [String(raw)] }; } };
  const UI = { setStatus(m){ trace.status.push(String(m)); }, appendTurn(){ trace.appendTurn++; },
               setLoading(){}, renderBranches(){} };
  w.UI = UI;
  w.G = {
    async submit(){
      if (S.inFlight) return;
      const inputEl = w.document.getElementById('inp');
      const text = String(inputEl.value || '').trim();
      if (!text) return;
      inputEl.value = '';
      S.inFlight = true;
      try {
        const b = Planner.build(S.mode, text);
        const result = await w.Api.call(b.sys, b.user);
        if (!result){
          if (text && !String(inputEl.value || '').trim()) inputEl.value = text;
          UI.setStatus('応答が得られませんでした。もう一度お試しください', true);
          return;
        }
        const plan = Planner.parsePlan(result.text, S.mode);
        const turn = { inputType: S.mode, playerText: text, narrative: plan.narrative.join('\n'),
                       plan: plan, _convSays: [] };
        S.turns.push(turn);
        S.save();
        UI.appendTurn(turn, S.turns.length - 1);
      } finally { S.inFlight = false; }
    }
  };
  try { w.__v292Dfix643._install(); } catch(e){}
  return trace;
}
function mkS(turns){
  const s = { mode: 'DO', inFlight: false, cast: { hero: { name: '' }, npcs: [] },
              scene: { loc: '', obj: '' }, turns: turns || [], saved: 0,
              cfg: { provider: 'openrouter', orModel: 'deepseek/deepseek-v4-flash' } };
  s.save = function(){ s.saved++; };
  return s;
}
function boot(w, S, opts){
  opts = opts || {};
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC624, ctx, { filename: 'v292Dfix624-degeneration-probe.js' });
  vm.runInContext(SRC643, ctx, { filename: 'v292Dfix643-collapse-rescue.js' });
  vm.runInContext(SRC650, ctx, { filename: 'v292Dfix650-rescue-safety.js' });
  if (opts.withGuard !== false) vm.runInContext(SRC651, ctx, { filename: 'v292Dfix651-guards.js' });
  return ctx;
}
function plainHistory(n){
  const out = [];
  for (let i = 0; i < n; i++) out.push({ plan: { narrative: ['静かな時間が流れていた。窓の外では雨が降っている。'] }, narrative: '', _convSays: [] });
  return out;
}
/* 「fix643 は live に設定してあるが、この物語は allowlist に載っていない」端末の状態 */
function liveStore(extra){
  return Object.assign({ v292Dfix643Live: '1', v292Dfix650LiveSlots: JSON.stringify(CANARY) }, extra || {});
}
function ringOf(w){ try { return JSON.parse(w.__store['v292Dfix650Ring'] || '[]'); } catch(e){ return []; } }

async function chain(responses, store, slotKey, opts){
  const S = mkS(plainHistory(3));
  const w = mkWin({ store: store || {}, slotKey: slotKey || OUT_SLOT });
  boot(w, S, opts || {});
  const tr = wire(w, S, responses);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  return { w, S, tr };
}
const settle = () => new Promise(r => setImmediate(r));

/* 監視器だけを取り出す軽い箱 */
function guardOnly(store, search){
  const w = mkWin({ store: store || {}, search: search });
  const ctx = vm.createContext(w);
  vm.runInContext(SRC651, ctx, { filename: 'v292Dfix651-guards.js' });
  return w;
}
const softView = () => ({ measurable: true, score: 0, level: 'soft', hard: false, hits: [], codes: [] });

(async function run(){

/* =====================================================================
   [1] フラグOFF（既定）＝ 従来どおり fix643 の live() 従属
   ===================================================================== */
console.log('\n== [1] フラグOFF（既定）は従来どおり ==');
{
  const r = await chain([HUGE_NORMAL], liveStore(), OUT_SLOT);
  ok('1a allowlist外の物語では shadow ＝ ターンは従来どおり確定する',
     r.S.turns.length === 4 && r.S.saved === 1 && r.tr.apiCalls.length === 1,
     { t: r.S.turns.length, s: r.S.saved, c: r.tr.apiCalls.length });
  ok('1a2 本文は1文字も変わらない', r.S.turns[3].narrative === HUGE_NORMAL);
  ok('1a3 shadow の記録は observed のまま',
     (JSON.parse(r.w.__store['v292Dfix651StreamLog'] || '[]')[0] || {}).outcome === 'observed');
}
{
  const w = guardOnly({});
  const g = w.__v292Dfix651.streamGuard;
  ok('1b 既定では AllLive は OFF', g.isAllLive() === false);
  ok('1b2 meta.live 無しなら遮断せず view をそのまま返す（同一オブジェクト）', (() => {
    const v = softView();
    return g.applyToView(v, HUGE_NORMAL, { live: false }) === v;
  })());
  ok('1b3 端末フラグのキーを勝手に作らない',
     Object.keys(w.__store).indexOf(ALLLIVE) < 0, Object.keys(w.__store));
}

/* =====================================================================
   [2] AllLive='1' … ガードだけ全物語 LIVE
   ===================================================================== */
console.log('\n== [2] v292Dfix652StreamGuardAllLive でガードだけ全物語 LIVE ==');
{
  const r = await chain([HUGE_NORMAL], liveStore({ [ALLLIVE]: '1' }), OUT_SLOT);
  ok('2a allowlist外でも遮断する（暴走本文を採用しない）', r.S.turns.length === 3, r.S.turns.length);
  ok('2b 保存しない', r.S.saved === 0, r.S.saved);
  ok('2b2 パース/描画へ進んでいない', r.tr.parsePlan === 0 && r.tr.appendTurn === 0);
  ok('2b3 入力は残る', r.w.__inp.value === '扉を開ける', r.w.__inp.value);
  ok('2c 案内バナーが出る（既存の生成失敗UX）', !!findById(r.w.__body, 'v643banner'));
  const L = JSON.parse(r.w.__store['v292Dfix643_log'] || '[]');
  ok('2c2 fix643 の記録に遮断が残る',
     L.length > 0 && L[L.length - 1].outcome === 'guard-hard-stop', L[L.length - 1]);
  ok('2c3 記録に本文は入っていない',
     (r.w.__store['v292Dfix643_log'] || '').indexOf(HUGE_NORMAL.slice(0, 40)) < 0);
}
{
  /* 2d 誤検出の逃げ道: 「最初の文章を確認する」で、通信せずに1回目の候補を採用できる */
  const r = await chain([HUGE_NORMAL], liveStore({ [ALLLIVE]: '1' }), OUT_SLOT);
  const btn = findByLabel(r.w.__body, '最初の文章を確認する');
  ok('2d 逃げ道のボタンが在る', !!btn);
  if (btn){
    btn.click();
    await settle(); await settle();
    ok('2d2 押せばターンは確定する（誤検出でも詰まらない）',
       r.S.turns.length === 4 && r.S.saved === 1, { t: r.S.turns.length, s: r.S.saved });
    ok('2d3 そのとき通信は増えない（保持していた候補を使う）', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
    ok('2d4 本文は1文字も加工されない', r.S.turns[3].narrative === HUGE_NORMAL);
  }
}
{
  /* 2e v292Dfix643Live すら無い素の端末 */
  const r = await chain([HUGE_NORMAL], { [ALLLIVE]: '1' }, OUT_SLOT);
  ok('2e fix643 が live でない端末でもガードは遮断する',
     r.S.turns.length === 3 && r.S.saved === 0 && r.tr.apiCalls.length === 1,
     { t: r.S.turns.length, s: r.S.saved, c: r.tr.apiCalls.length });
  ok('2e2 そのとき fix643 自身は shadow のまま', r.w.__v292Dfix643.isLive() === false);
}
{
  /* 2f 正常な応答は止めない */
  const r = await chain([NORMAL_LONG], liveStore({ [ALLLIVE]: '1' }), OUT_SLOT);
  ok('2f 正常な長文はフラグONでも確定する',
     r.S.turns.length === 4 && r.S.saved === 1 && r.S.turns[3].narrative === NORMAL_LONG,
     { t: r.S.turns.length, s: r.S.saved });
  const r2 = await chain([RUNAWAY], liveStore({ [ALLLIVE]: '1' }), OUT_SLOT);
  ok('2f2 句読点の消えた暴走は allowlist外でも止まる', r2.S.turns.length === 3 && r2.S.saved === 0,
     { t: r2.S.turns.length, s: r2.S.saved });
}

{
  /* 2g 2本目以降の本編呼び出し（fix216/235 の書き直し）は live と同じく観測だけ。
     ここで null を返すと index.html:1828 の書き直しが「1回目の結果を捨てる」側へ倒れるため。 */
  const S = mkS(plainHistory(3));
  const w = mkWin({ store: liveStore({ [ALLLIVE]: '1' }), slotKey: OUT_SLOT });
  boot(w, S);
  const tr = wire(w, S, [NORMAL_LONG, HUGE_NORMAL]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();                       /* 1本目: 正常 → 確定 */
  const r2 = await w.Api.call('SYS', 'USER+書き直し');   /* 2本目: 暴走 */
  ok('2g 2本目以降の呼び出しは遮断せず結果を返す（観測だけ）',
     !!(r2 && r2.text === HUGE_NORMAL), r2 && String(r2.text || '').slice(0, 20));
  ok('2g2 1本目のターンは確定したまま', S.turns.length === 4 && S.saved === 1,
     { t: S.turns.length, s: S.saved });
}

/* =====================================================================
   [3] 救済生成の live 判定は変えない（allowlist canary 維持）
   ===================================================================== */
console.log('\n== [3] 救済生成の live 判定は変えない ==');
{
  const r = await chain([HUGE_NORMAL, NORMAL_LONG], liveStore({ [ALLLIVE]: '1' }), OUT_SLOT);
  ok('3a allowlist外では救済生成を撃たない（Api.call は1回）', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
  ok('3b allowlist外では fix650 の ring を1バイトも書かない',
     r.w.__store['v292Dfix650Ring'] === undefined, r.w.__store['v292Dfix650Ring']);
  ok('3c fix643.isLive() は allowlist外で false のまま', r.w.__v292Dfix643.isLive() === false);
  ok('3c2 救済の書き直し指示がモデルへ渡っていない',
     r.tr.apiCalls.every(c => String(c.user || '').indexOf('【重要・書き直し】') < 0));
}
{
  /* 3d allowlist内（canary）では従来どおり: 遮断 → 救済 → 採用 */
  const r = await chain([HUGE_NORMAL, NORMAL_LONG], liveStore({ [ALLLIVE]: '1' }), IN_SLOT);
  ok('3d canary の物語では救済が走る（Api.call は2回）', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
  ok('3d2 救済が正常なら採用される', r.S.turns.length === 4 && r.S.saved === 1,
     { t: r.S.turns.length, s: r.S.saved });
  const ring = ringOf(r.w);
  ok('3d3 fix650 の ring は canary でだけ書かれる', ring.length === 1 && ring[0].verdict === 'adopt',
     ring[0] && ring[0].verdict);
  ok('3d4 fix643.isLive() は canary で true', r.w.__v292Dfix643.isLive() === true);
}
{
  /* 3d5 canary で二重遮断 → 従来どおりターン不成立（AllLive を足しても契約は同じ） */
  const r = await chain([HUGE_NORMAL, HUGE_NORMAL], liveStore({ [ALLLIVE]: '1' }), IN_SLOT);
  ok('3d5 canary の二重遮断は従来どおりターン不成立',
     r.tr.apiCalls.length === 2 && r.S.turns.length === 3 && r.S.saved === 0,
     { c: r.tr.apiCalls.length, t: r.S.turns.length });
}

/* =====================================================================
   [4] kill スイッチの優先順位
   ===================================================================== */
console.log('\n== [4] v292Dfix651StreamGuardOff が最優先 ==');
{
  const off = await chain([HUGE_NORMAL], liveStore({ [ALLLIVE]: '1', v292Dfix651StreamGuardOff: '1' }), OUT_SLOT);
  const none = await chain([HUGE_NORMAL], liveStore(), OUT_SLOT, { withGuard: false });
  ok('4a OFF は AllLive より優先して全停止（ターンは確定する）',
     off.S.turns.length === 4 && off.S.saved === 1, { t: off.S.turns.length, s: off.S.saved });
  ok('4a2 OFF と「fix651 未ロード」でターン数・保存回数・呼び出し回数が一致',
     off.S.turns.length === none.S.turns.length && off.S.saved === none.S.saved &&
     off.tr.apiCalls.length === none.tr.apiCalls.length);
  ok('4b OFF では fix651 が記録用のキーを1バイトも書かない',
     Object.keys(off.w.__store).filter(k => k.indexOf('v292Dfix651') === 0 &&
                                            k !== 'v292Dfix651StreamGuardOff').length === 0,
     Object.keys(off.w.__store));
  const w = guardOnly({ [ALLLIVE]: '1', v292Dfix651StreamGuardOff: '1' });
  const v = softView();
  ok('4b2 OFF なら applyToView は view をそのまま返す',
     w.__v292Dfix651.streamGuard.applyToView(v, HUGE_NORMAL, { live: true }) === v);
}

/* =====================================================================
   [5] 端末別の観測カウンタ
   ===================================================================== */
console.log('\n== [5] 観測カウンタ ==');
{
  const w = guardOnly({ [ALLLIVE]: '1' });
  const g = w.__v292Dfix651.streamGuard;
  const out = g.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'first', slotId: 'x' });
  const s = g.stats();
  ok('5a 遮断された view は hard になって返る', out.hard === true && !!out.guard, out && out.guard);
  ok('5a2 inspected / tripped / blocked が増える',
     s.inspected === 1 && s.tripped === 1 && s.blocked === 1, s);
  ok('5b abortCompleted が増える', s.abortCompleted === 1, s.abortCompleted);
  ok('5b2 abortLatency に ms が積まれる（数値・直近N件）',
     Array.isArray(s.abortLatency) && s.abortLatency.length === 1 &&
     typeof s.abortLatency[0] === 'number' && s.abortLatency[0] >= 0, s.abortLatency);
  ok('5f __v292Dfix651.stats() から読める', (() => {
    const all = w.__v292Dfix651.stats();
    return !!(all && all.stream && all.stream.blocked === 1);
  })(), w.__v292Dfix651.stats());
  ok('5f2 既存の stats キーへ相乗りしている（新キーを増やさない）', (() => {
    const c = JSON.parse(w.__store['v292Dfix651Stats'] || '{}');
    /* 増えてよいのは既存の fix651 系キーだけ。fix652 は端末フラグ以外のキーを作らない */
    return !!(c.g652 && c.g652.blocked === 1 && c.g652.allLive === true) &&
           Object.keys(w.__store).filter(k => k.indexOf('v292Dfix652') === 0 && k !== ALLLIVE).length === 0;
  })(), Object.keys(w.__store));
  ok('5f3 カウンタに本文は入らない',
     JSON.stringify(w.__v292Dfix651.stats()).indexOf(HUGE_NORMAL.slice(0, 30)) < 0);
}
{
  /* 5c 遮断 → 救済成功 = rescued / 遮断 → 救済も遮断 = retryFailed */
  const w = guardOnly({ [ALLLIVE]: '1' });
  const g = w.__v292Dfix651.streamGuard;
  g.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'first' });
  g.applyToView(softView(), NORMAL_LONG, { live: false, phase: 'rescue' });
  ok('5c 遮断のあと救済が通れば rescued', g.stats().rescued === 1 && g.stats().retryFailed === 0, g.stats());

  const w2 = guardOnly({ [ALLLIVE]: '1' });
  const g2 = w2.__v292Dfix651.streamGuard;
  g2.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'first' });
  g2.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'rescue' });
  ok('5c2 救済も遮断なら retryFailed', g2.stats().retryFailed === 1 && g2.stats().rescued === 0, g2.stats());

  const w3 = guardOnly({ [ALLLIVE]: '1' });
  const g3 = w3.__v292Dfix651.streamGuard;
  g3.applyToView(softView(), NORMAL_LONG, { live: false, phase: 'first' });
  g3.applyToView(softView(), NORMAL_LONG, { live: false, phase: 'rescue' });
  ok('5c3 遮断していないターンの救済は rescued に数えない',
     g3.stats().rescued === 0 && g3.stats().retryFailed === 0, g3.stats());
}
{
  /* 5d 遮断のあとにターンが増える書込みが来たら数える（不変条件の見張り） */
  const T3 = JSON.stringify({ turns: [{}, {}, {}], mode: 'DO' });
  const T4 = JSON.stringify({ turns: [{}, {}, {}, {}], mode: 'DO' });
  const w = guardOnly({ [ALLLIVE]: '1', [OUT_SLOT]: T3 });
  const g = w.__v292Dfix651.streamGuard;
  w.__ls.setItem(OUT_SLOT, T4);
  ok('5d0 遮断前の通常の書込みは数えない', g.stats().writesAfterAbort === 0, g.stats().writesAfterAbort);
  g.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'first' });
  w.__store[OUT_SLOT] = T3;
  w.__ls.setItem(OUT_SLOT, T4);
  ok('5d 遮断のあとターンが増える書込みが来たら writesAfterAbort が増える',
     g.stats().writesAfterAbort === 1, g.stats());
  ok('5d2 数えるだけで書込みは妨げない（0T上書きの非常ブレーキとは別物）',
     w.__store[OUT_SLOT] === T4);
  ok('5d3 救済が通れば見張りは解除される（正当な保存を誤って数えない）', (() => {
    const x = guardOnly({ [ALLLIVE]: '1', [OUT_SLOT]: T3 });
    const xg = x.__v292Dfix651.streamGuard;
    xg.applyToView(softView(), HUGE_NORMAL, { live: false, phase: 'first' });
    xg.applyToView(softView(), NORMAL_LONG, { live: false, phase: 'rescue' });
    x.__ls.setItem(OUT_SLOT, T4);
    return xg.stats().writesAfterAbort === 0;
  })());
}
{
  /* 5e falseTrip は人手マーク */
  const w = guardOnly({ [ALLLIVE]: '1' });
  const g = w.__v292Dfix651.streamGuard;
  ok('5e 既定は 0', g.stats().falseTrip === 0);
  g.markFalseTrip();
  ok('5e2 人手マークで増える', g.stats().falseTrip === 1, g.stats().falseTrip);
  ok('5e3 マークも既存の stats キーへ残る',
     (JSON.parse(w.__store['v292Dfix651Stats'] || '{}').g652 || {}).falseTrip === 1);
}

/* =====================================================================
   [Z] 出荷の体裁（関係で縛る）
   ===================================================================== */
console.log('\n== [Z] 出荷の体裁 ==');
ok('Z1 端末フラグのキー名が fix651 の中に在る', SRC651.indexOf(ALLLIVE) > 0);
ok('Z1b fix643 は端末フラグを自分で読まない（判定の正本はガード側ひとつ）',
   SRC643.indexOf(ALLLIVE + "'") < 0 && !/lsg\(\s*'v292Dfix652/.test(SRC643));
ok('Z1c fix643 の live() は fix650 の gate に従属したまま',
   /function live\(\)\{[\s\S]{0,400}s\.gate\(slotId\(\)\)/.test(SRC643));
ok('Z2 fix652 の目的が1行コメントとして残っている',
   /fix652/.test(SRC651) && /fix652/.test(SRC643));
ok('Z3 新モジュールは増やしていない（.js は2本の変更だけ）',
   !fs.existsSync(path.join(__dirname, 'v292Dfix652-stream-guard.js')));
ok('Z4 index.html の NUL は1個のまま',
   Buffer.from(HTML, 'latin1').filter(b => b === 0).length === 1);
ok('Z4b index.html に CRLF は無い', HTMLU.indexOf('\r\n') < 0);
ok('Z4c 変更した .js に NUL は無い',
   ['v292Dfix651-guards.js', 'v292Dfix643-collapse-rescue.js'].every(f =>
     fs.readFileSync(path.join(__dirname, f)).filter(b => b === 0).length === 0));
ok('Z5 ★BUILT と version.txt が同値', (() => {
  const b = (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1];
  return !!b && b === read('version.txt').trim();
})(), (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1]);
ok('Z5b ★HOME_BUILT も同値', (() => {
  const b = (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1];
  return !!b && b === read('version.txt').trim();
})(), (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1]);
{
  const TOKEN = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
  ok('Z6 version.txt から fix札を取り出せた', !!TOKEN, TOKEN);
  ['v292Dfix651-guards.js', 'v292Dfix643-collapse-rescue.js'].forEach(f => {
    ok('Z6b 中身を変えた ' + f + ' の cb が今の fix札と一致（上げ忘れていない）', (() => {
      const cb = (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=v292D(\\w+)')) || [])[1];
      return !!TOKEN && cb === TOKEN;
    })(), (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=[^"]*')) || [])[0]);
  });
}
ok('Z7 fix651 は sys を触らない（sys注入を増やしていない）',
   SRC651.indexOf('Planner') < 0 && SRC651.indexOf('_extensions') < 0);
ok('Z8 遮断の LIVE 判定は applyToView の中だけで決めている（配線を増やしていない）',
   /var isLive = !!meta\.live \|\| isOn\(A_ALL\)/.test(SRC651));

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
})();
