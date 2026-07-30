/* 回帰テスト: v292Dfix653 — fix650 救済ゲートの「分母」を URL 権威にする
 *
 * ■何を直したのか（実機で踏んだ）
 *   fix650 の slotId() は window.__chr6Key()（= localStorage の共有ポインタ chr6_active_slot 由来）
 *   から現在の物語IDを取っていた。chr6_active_slot は**全タブで1個**なので、
 *   index.html?story=X を直リンクで開いたタブでは、別タブで開いている現役物語を指したままになる。
 *   実測: URL=sms4np33eyg のタブで slotId()=smrrcv25pcq → canary allowlist に載っている物語なのに
 *   gate() が別物語IDで評価され、__v292Dfix643.isLive()=false（＝救済が一度も撃たれない）。
 *   fix527 で「今どの物語か」の真実は URL(タブ毎) へ移っていたが、fix650 にだけ及んでいなかった。
 *
 * ■このテストが固定する契約（値ではなく関係で縛る。canary の物語IDは固定値として使わない）
 *   (1) ?story=<id> があれば slotId() は **URL の id**（chr6_active_slot が別物語でも）。
 *   (2) ?story= が無いページ（home.html 等）は**従来どおり** __chr6Key() 由来。
 *   (3) story='' / 空白だけ は無効 → 従来経路へフォールバック。
 *   (4) URLSearchParams が壊れている / 例外を投げる / 存在しない → 従来経路。**throw で止めない**。
 *   (5) gate() は URL の物語で評価される。fix643 が引数で渡してくる（共有ポインタ由来の）IDは
 *       URL がある限り採用しない。allowlist の照合そのものは fail-closed のまま。
 *   (6) 実チェーン（fix624→fix643→fix650）で、直リンクのタブでも救済が実際に撃たれる。
 *       逆に URL の物語が allowlist に無ければ、active_slot が allowlist に載っていても shadow。
 *   (7) 出荷の体裁（cb / BUILT / HOME_BUILT / version.txt の**同値関係**）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC624 = read('v292Dfix624-degeneration-probe.js');
const SRC643 = read('v292Dfix643-collapse-rescue.js');
const SRC650 = read('v292Dfix650-rescue-safety.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');
const HOME   = read('home.html');

/* 物語IDは「別物であること」だけが意味を持つ。canary の実IDには依存しない。 */
const URL_STORY   = 'sms_url_story_' + 'aaa';
const OTHER_STORY = 'sms_other_story_' + 'bbb';

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* ---------------- 最小DOM（test_fix650 と同じ作り） ---------------- */
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
  for (let i = 0; i < (root.children || []).length; i++){
    const r = findById(root.children[i], id);
    if (r) return r;
  }
  return null;
}

/* ---------------- モック window ----------------
   opts.search        … location.search（undefined なら location 自体を生やさない＝古い環境の再現）
   opts.slotKey       … __chr6Key() の戻り（= chr6_active_slot 由来の従来経路）
   opts.usp           … URLSearchParams の差し替え（null で「存在しない環境」）           */
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
  const doc = {
    readyState: 'complete', addEventListener(){}, body: body,
    createElement: mkEl,
    getElementById(id){ return id === 'inp' ? inp : findById(body, id); }
  };
  const w = {
    localStorage: ls,
    console: { log(){}, warn(){}, error(){} },
    setTimeout: (fn) => { try { if (typeof fn === 'function') fn(); } catch(e){} return 0; },
    clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Promise: Promise,
    document: doc,
    __chr6Key: () => opts.slotKey || 'chr6'
  };
  if (opts.search !== undefined) w.location = { search: opts.search, href: 'https://x/index.html' + opts.search };
  if (!('usp' in opts)) w.URLSearchParams = URLSearchParams;            /* 既定＝ブラウザ相当 */
  else if (opts.usp) w.URLSearchParams = opts.usp;                      /* null なら生やさない */
  w.window = w; w.__store = store; w.__inp = inp;
  return w;
}

/* ---------------- 実チェーンの起動（fix624 → fix643 → fix650） ---------------- */
function mkS(turns){
  const s = { mode: 'DO', inFlight: false, cast: { hero: { name: '' }, npcs: [] },
              scene: { loc: '', obj: '' }, turns: turns || [], saved: 0,
              cfg: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' } };
  s.save = function(){ s.saved++; };
  return s;
}
function boot(w, S){
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC624, ctx, { filename: 'fix624' });
  vm.runInContext(SRC643, ctx, { filename: 'fix643' });
  vm.runInContext(SRC650, ctx, { filename: 'fix650' });
  return ctx;
}
function fixtures(w){ return w.__v292Dfix624._fixtures; }
function wire(w, S, responses){
  const trace = { apiCalls: [] };
  const queue = responses.slice();
  w.Api = { async call(system, userContent){
    trace.apiCalls.push({ system, user: userContent });
    const r = queue.length ? queue.shift() : null;
    return r === null ? null : { text: r };
  } };
  const Planner = { build: (mode, text) => ({ sys: 'SYS', user: 'USER:' + text }),
                    parsePlan: (raw) => ({ narrative: [String(raw)] }) };
  const UI = { setStatus(){}, appendTurn(){}, setLoading(){}, renderBranches(){} };
  w.UI = UI;
  w.G = { async submit(){
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
  } };
  try { w.__v292Dfix643._install(); } catch(e){}
  return trace;
}
function taggedHistory(n){
  const say3 = '<say who="a">「あ」</say>\n<say who="b">「い」</say>\n<say who="c">「う」</say>';
  const out = [];
  for (let i = 0; i < n; i++) out.push({ plan: { narrative: [say3] }, narrative: '', _convSays: [1, 2, 3] });
  return out;
}
function liveStore(list){
  return { v292Dfix643Live: '1', v292Dfix650LiveSlots: JSON.stringify(list) };
}
function F650(w){ return w.__v292Dfix650; }

/* =====================================================================
   (1) slotId() の分母は URL（?story=）
   ===================================================================== */
console.log('\n== (1) ?story= があれば slotId() は URL の物語 ==');
{
  const w = mkWin({ search: '?story=abc', slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★★?story=abc なら slotId()==="abc"（active_slot が別物語でも）',
     F650(w)._slotId() === 'abc', { slotId: F650(w)._slotId(), legacy: F650(w)._legacySlotId() });
  ok('★従来経路は生きている（比較用に別物を返している＝テストが自明でないことの担保）',
     F650(w)._legacySlotId() === OTHER_STORY && F650(w)._legacySlotId() !== F650(w)._slotId(),
     F650(w)._legacySlotId());
  ok('★status() が URL 由来だと示す',
     F650(w).status().slotId === 'abc' && F650(w).status().slotIdFrom === 'url' &&
     F650(w).status().urlStory === 'abc', F650(w).status());
}
{
  /* 他のパラメータが混ざっていても、URLエンコードされていても取れる（URLSearchParams の作法） */
  const w = mkWin({ search: '?a=1&story=' + encodeURIComponent(URL_STORY) + '&b=2', slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★他パラメータが前後にあっても story を取る', F650(w)._slotId() === URL_STORY, F650(w)._slotId());
}
{
  const w = mkWin({ search: '?story=' + encodeURIComponent('あ い'), slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★パーセントエンコードは復号する（fix527 と同じ作法）', F650(w)._slotId() === 'あ い', F650(w)._slotId());
}
{
  const w = mkWin({ search: '?story=%20' + URL_STORY + '%20', slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★前後の空白は落とす（trim）', F650(w)._slotId() === URL_STORY, F650(w)._slotId());
}

console.log('\n== (2) ?story= が無いページは従来どおり ==');
{
  const w = mkWin({ search: '', slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★★search が空なら __chr6Key() 由来', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
  ok('★status() も従来経路だと示す',
     F650(w).status().slotIdFrom === 'active_slot' && F650(w).status().urlStory === null, F650(w).status());
}
{
  const w = mkWin({ search: '?slot=xyz&other=1', slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★別名のパラメータは拾わない（story だけを見る）', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
}
{
  const w = mkWin({ search: '', slotKey: null });
  boot(w, mkS([]));
  ok('★__chr6Key() が空でも既定 chr6 に落ちる（従来どおり）', F650(w)._slotId() === 'chr6', F650(w)._slotId());
}
{
  const w = mkWin({ slotKey: 'chr6_slot_' + OTHER_STORY });     /* location 自体が無い */
  boot(w, mkS([]));
  ok('★location が無い環境でも throw せず従来経路', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
}

console.log('\n== (3) 空 / 空白だけの story は無効 → 従来経路 ==');
{
  const cases = ['?story=', '?story=&x=1', '?story=%20', '?story=%20%20%20', '?story=+'];
  cases.forEach(s => {
    const w = mkWin({ search: s, slotKey: 'chr6_slot_' + OTHER_STORY });
    boot(w, mkS([]));
    ok('★"' + s + '" は従来経路へフォールバック', F650(w)._slotId() === OTHER_STORY,
       { search: s, got: F650(w)._slotId() });
    ok('★"' + s + '" では urlStory を名乗らない', F650(w)._urlSlotId() === '', F650(w)._urlSlotId());
  });
}

console.log('\n== (4) URLSearchParams が使えない / 例外を投げても止まらない ==');
{
  const Boom = function(){ throw new Error('boom'); };
  const w = mkWin({ search: '?story=' + URL_STORY, slotKey: 'chr6_slot_' + OTHER_STORY, usp: Boom });
  boot(w, mkS([]));
  ok('★★URLSearchParams が例外を投げても throw しない',
     (() => { try { F650(w)._slotId(); return true; } catch(e){ return false; } })());
  ok('★★例外時は従来経路（__chr6Key 由来）', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
  ok('★例外時でも gate/status が動く（診断口を落とさない）',
     (() => { try { F650(w).status(); F650(w).gate(); return true; } catch(e){ return false; } })());
}
{
  const w = mkWin({ search: '?story=' + URL_STORY, slotKey: 'chr6_slot_' + OTHER_STORY, usp: null });
  boot(w, mkS([]));
  ok('★★URLSearchParams が存在しない環境でも従来経路で動く', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
}
{
  /* get が例外を投げる形（インスタンス側の故障）も従来経路へ倒す */
  const Bad = function(){ return { get(){ throw new Error('nope'); } }; };
  const w = mkWin({ search: '?story=' + URL_STORY, slotKey: 'chr6_slot_' + OTHER_STORY, usp: Bad });
  boot(w, mkS([]));
  ok('★get() が例外でも従来経路', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
}
{
  /* get が文字列以外を返す（作りの違う実装）も従来経路へ倒す */
  const Weird = function(){ return { get(){ return 12345; } }; };
  const w = mkWin({ search: '?story=' + URL_STORY, slotKey: 'chr6_slot_' + OTHER_STORY, usp: Weird });
  boot(w, mkS([]));
  ok('★文字列以外が返ったら従来経路', F650(w)._slotId() === OTHER_STORY, F650(w)._slotId());
}

/* =====================================================================
   (5) gate() は URL の物語で評価される
   ===================================================================== */
console.log('\n== (5) gate() の分母が URL 権威 ==');
{
  /* ★これが実機で踏んだ形: allowlist には URL の物語だけが載っていて、
     共有ポインタ(active_slot)は別タブの物語を指している。 */
  const w = mkWin({ store: liveStore([URL_STORY]), search: '?story=' + URL_STORY,
                    slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★★fix643 が渡してくる（共有ポインタ由来の）IDでも、URL の物語で評価する',
     F650(w).gate(OTHER_STORY) === true, { gate: F650(w).gate(OTHER_STORY), status: F650(w).status() });
  ok('★引数なしでも同じ', F650(w).gate() === true);
  ok('★status().mode が live', F650(w).status().mode === 'live', F650(w).status());
}
{
  /* 逆向き: URL の物語が allowlist に無ければ、active_slot が載っていても live にしない */
  const w = mkWin({ store: liveStore([OTHER_STORY]), search: '?story=' + URL_STORY,
                    slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★★URL の物語が allowlist に無ければ shadow（active_slot 側は載っていても）',
     F650(w).gate(OTHER_STORY) === false, F650(w).status());
}
{
  const w = mkWin({ store: liveStore([URL_STORY]), search: '', slotKey: 'chr6_slot_' + URL_STORY });
  boot(w, mkS([]));
  ok('★?story= が無いページでは従来どおり active_slot で評価する', F650(w).gate() === true, F650(w).status());
}
{
  const w = mkWin({ store: liveStore([URL_STORY]), search: '?story=' + URL_STORY,
                    slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★allowlist 未設定は URL があっても fail-closed', (() => {
    w.__store['v292Dfix650LiveSlots'] = '[]';
    return F650(w).gate() === false;
  })());
  ok('★壊れた allowlist も fail-closed', (() => {
    w.__store['v292Dfix650LiveSlots'] = '{壊れ';
    return F650(w).gate() === false;
  })());
  ok('★stop() 後は URL があっても false', (() => {
    w.__store['v292Dfix650LiveSlots'] = JSON.stringify([URL_STORY]);
    F650(w).stop();
    return F650(w).gate() === false;
  })());
  ok('★arm() で戻る', (() => { F650(w).arm(); return F650(w).gate() === true; })());
}
{
  /* 照合そのもの（_gateFor）は URL に引きずられない＝ selfTest の fail-closed 検査が偽合格しない */
  const w = mkWin({ store: liveStore([URL_STORY]), search: '?story=' + URL_STORY,
                    slotKey: 'chr6_slot_' + OTHER_STORY });
  boot(w, mkS([]));
  ok('★★_gateFor は渡された id だけを見る（URLで上書きしない）',
     F650(w)._gateFor(URL_STORY) === true && F650(w)._gateFor('___no_such___') === false);
  ok('★★selfTest() は live な直リンクタブでも通る（fail-closed 検査が偽陽性にならない）',
     F650(w).selfTest().ok === true && F650(w).selfTest().gateClosedByDefault === true, F650(w).selfTest());
}

/* =====================================================================
   (6) 実チェーン: 直リンクのタブで救済が実際に撃たれる
   ===================================================================== */
(async function run(){
console.log('\n== (6) 実チェーン（fix624→fix643→fix650）で救済が撃たれる ==');
async function runChain(store, search, slotKey){
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: store, search: search, slotKey: slotKey });
  boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  return { w, S, tr, F };
}
{
  /* ★実機で踏んだ形そのもの: URL は canary の物語、active_slot は別タブの物語 */
  const r = await runChain(liveStore([URL_STORY]), '?story=' + URL_STORY, 'chr6_slot_' + OTHER_STORY);
  ok('★★直リンクのタブでも救済が撃たれる（Api.call が2回）', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
  ok('★★fix643 の isLive() が true（実機では false だった）',
     r.w.__v292Dfix643.isLive() === true, r.w.__v292Dfix643.status && r.w.__v292Dfix643.isLive());
  ok('★直った方の本文が採用される', r.S.turns.length === 4 && r.S.turns[3].narrative === r.F.normalA);
  ok('★ring に残る', (() => { try { return JSON.parse(r.w.__store['v292Dfix650Ring'] || '[]').length === 1; } catch(e){ return false; } })());
}
{
  /* 対照: URL の物語が allowlist に無ければ、active_slot が載っていても従来どおり shadow */
  const r = await runChain(liveStore([OTHER_STORY]), '?story=' + URL_STORY, 'chr6_slot_' + OTHER_STORY);
  ok('★★URL の物語が allowlist 外なら shadow のまま（分母が URL である証拠）',
     r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
  ok('★shadow なのでターンは確定する', r.S.turns.length === 4 && r.S.saved === 1);
  ok('★ring は1バイトも書かない', r.w.__store['v292Dfix650Ring'] === undefined);
}
{
  /* 既定端末（フラグを1つも置いていない）は URL があっても1ビットも変わらない */
  const r = await runChain({}, '?story=' + URL_STORY, 'chr6_slot_' + URL_STORY);
  ok('★★フラグ未設定の端末は URL があっても shadow', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
  ok('★★fix650 は1バイトも書かない（v292Dfix650* のキーが増えない）',
     Object.keys(r.w.__store).filter(k => k.indexOf('v292Dfix650') === 0).length === 0,
     Object.keys(r.w.__store));
  ok('★ターンは従来どおり確定する', r.S.turns.length === 4 && r.S.saved === 1);
}
{
  /* ?story= が無い旧URLのタブは、従来どおり active_slot で live になる（後方互換） */
  const r = await runChain(liveStore([OTHER_STORY]), '', 'chr6_slot_' + OTHER_STORY);
  ok('★★?story= 無しの後方互換（従来どおり救済が撃たれる）', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
}

/* =====================================================================
   (7) 体裁 / 出荷（値ではなく関係で縛る）
   ===================================================================== */
console.log('\n== (7) 実装と出荷の体裁 ==');
{
  ok('★fix653 の理由がコメントに残っている', /fix653/.test(SRC650));
  ok('★URL の story を見ている', /URLSearchParams/.test(SRC650) && /get\('story'\)/.test(SRC650));
  ok('★★変更は fix650 だけ（fix643 は触っていない）', SRC643.indexOf('fix653') < 0);
  ok('★★fix624（判定の正本）も触っていない', SRC624.indexOf('fix653') < 0);
  ok('★fix651 も触っていない', read('v292Dfix651-guards.js').indexOf('fix653') < 0);
  ok('★新しいモジュールを増やしていない', !fs.existsSync(path.join(__dirname, 'v292Dfix653-url-slot.js')));
  ok('★URL も localStorage も書かない（読むだけ）',
     !/location\.(href|search)\s*=/.test(SRC650) && !/history\.(pushState|replaceState)/.test(SRC650));
  ok('★冪等ガードはそのまま', /if\s*\(window\.__v292Dfix650\)\s*return/.test(SRC650));
  ok('★OFF スイッチはそのまま', SRC650.indexOf("'v292Dfix650Off'") > 0);
}
{
  const S = mkS([]);
  const w = mkWin({ search: '?story=' + URL_STORY });
  const ctx = boot(w, S);
  const first = w.__v292Dfix650;
  vm.runInContext(SRC650, ctx, { filename: 'fix650#2' });
  ok('★二重ロードで初期化し直さない', w.__v292Dfix650 === first);
}
{
  const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
  ok('★version.txt から fix札を取り出せた', !!token, token);
  ok('★★BUILT と version.txt が同値', (() => {
    const b = (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1];
    return !!b && b === read('version.txt').trim();
  })(), (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1]);
  ok('★★HOME_BUILT も同値', (() => {
    const b = (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1];
    return !!b && b === read('version.txt').trim();
  })(), (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1]);
  ok('★★中身を変えた fix650 の cb が今の fix札と一致（上げ忘れていない）', (() => {
    const cb = (HTMLU.match(/v292Dfix650-rescue-safety\.js\?cb=v292D(\w+)/) || [])[1];
    return !!token && cb === token;
  })(), (HTMLU.match(/v292Dfix650-rescue-safety\.js\?cb=[^"]*/) || [])[0]);
  ok('★index.html にこの出荷で上げた cb が実在する（BUILT だけ進めていない）',
     HTMLU.indexOf('?cb=v292D' + token) > 0, token);
  ok('★★fix650 と同じ出荷で読み込まれる fix643 / fix651 の cb も揃っている（前回出荷の札が残っていない）',
     ['v292Dfix643-collapse-rescue.js', 'v292Dfix651-guards.js'].every(f => {
       const cb = (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=v292D(\\w+)')) || [])[1];
       return cb === token;
     }));
  ok('★home.html の全モジュールの cb が HOME_BUILT の fix札', (() => {
    const tags = HOME.match(/src="[^"]+\?cb=([^"]+)"/g) || [];
    return tags.length > 0 && tags.every(t => t.indexOf('cb=v292D' + token) > 0);
  })(), (HOME.match(/src="[^"]+\?cb=([^"]+)"/g) || []).slice(0, 3));
  ok('★index.html の NUL は1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★index.html に CRLF は無い', HTMLU.indexOf('\r\n') < 0);
  ok('★fix650 に CRLF / NUL は無い',
     fs.readFileSync(path.join(__dirname, 'v292Dfix650-rescue-safety.js')).indexOf(Buffer.from('\r\n')) < 0 &&
     fs.readFileSync(path.join(__dirname, 'v292Dfix650-rescue-safety.js')).filter(b => b === 0).length === 0);
  ok('★home.html には fix650 を積まない（ゲーム画面専用）', HOME.indexOf('v292Dfix650-rescue-safety.js') < 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
})();
