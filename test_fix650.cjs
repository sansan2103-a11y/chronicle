/* 回帰テスト: v292Dfix650 — fix643 自動救済の安全層（canary 前提の必須仕様）
 *
 * ★実チェーン: 配信する fix624（判定器）・fix643（救済層）・fix650（安全層）の**3本をそのまま**
 *   モックwindow上で走らせ、Api.call → 判定 → 救済 → 採用/確認待ち/停止 まで通しで見る。
 *   閾値だけを切り出して試さない。G.submit は index.html と同じ順序の代役（順序の一致は
 *   test_fix643 (0) が index.html の実物に対して固定している）。
 *
 * このテストが固定する契約（GPT裁定・緩めない）:
 *   (1) 物語allowlistゲート … 端末フラグ v292Dfix643Live='1' **だけでは live にしない**。
 *       v292Dfix650LiveSlots に現在の物語が入っている時だけ live。未設定・壊れたJSON・別物語は shadow。
 *       ★フラグを1つも置かない端末は、fix650 を積んでも**挙動が1ビットも変わらない**。
 *   (2) 保守的な採用条件 … 救済 0〜3点=採用 / 4〜6点=確認待ち / 7点以上=停止。
 *       確認待ち・停止は二重hardと同じ契約（ターンを進めない・状態を更新しない・保存しない・入力を残す・自動3回目なし）。
 *   (3) 状態リーク防止 … 却下した候補の state は一度も適用されない。生成前 state hash が動いていたら**採用しない**。
 *   (4) single-flight … 同一 logicalTurnId の救済が並列で走らない。走れない時は観測だけして素通しする。
 *   (5) 即時停止 … stop() は次の生成から効く（再読込しない）。元栓(v292Dfix643Live)も閉じる。
 *   (6) ring buffer … hard候補を救済後も端末ローカルに直近20件・全文保存。クラウド同期・スナップショットに載らない。
 *       QuotaExceeded は最古から捨てる（例外を投げない）。人手確認フラグを付けられる。
 *   (7) 表示文字列を変えない … 採用した本文は1文字も加工されない。sys にも触らない。
 *   (8) OFF / 冪等 / 配線 / 出荷の体裁
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC624 = read('v292Dfix624-degeneration-probe.js');
const SRC643 = read('v292Dfix643-collapse-rescue.js');
const SRC650 = read('v292Dfix650-rescue-safety.js');
const SRC399 = read('v292Dfix399-cloudsync.js');
const SRC564 = read('v292Dfix564-snapshot.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');
const HOME   = read('home.html');

/* canary 対象の物語（開発者PCのテスト物語）。★このテストは「この4本だけが通る」ことは縛らない。
   縛るのは「allowlist に載っている物語だけが live になる」という仕組みの方。 */
const CANARY = ['sms4np33eyg', 'sms5t2snqso', 'sms5xyl4jjy', 'sms60fhnthz'];
const SLOT = CANARY[0];

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* ---------------- 最小DOM ---------------- */
function mkEl(tag){
  const el = {
    tagName: String(tag).toLowerCase(), id: '', textContent: '', value: '',
    style: { cssText: '' }, children: [], parentNode: null, _h: {}, _focused: false,
    appendChild(c){ c.parentNode = el; el.children.push(c); return c; },
    removeChild(c){ const i = el.children.indexOf(c); if (i >= 0){ el.children.splice(i, 1); c.parentNode = null; } },
    addEventListener(ev, fn){ (el._h[ev] = el._h[ev] || []).push(fn); },
    click(){ (el._h.click || []).slice().forEach(f => f()); },
    focus(){ el._focused = true; }
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
function allButtons(root){
  const out = [];
  (function walk(n){ if (!n) return; if (n.tagName === 'button') out.push(n); (n.children || []).forEach(walk); })(root);
  return out;
}
/* 案内バナーのボタンだけ（fix650 の停止トグルは数に入れない） */
function bannerButtons(w){
  const b = w.document.getElementById('v643banner');
  return b ? allButtons(b) : [];
}
function clickBanner(w, label){
  const b = bannerButtons(w).filter(x => x.textContent === label)[0];
  if (!b) throw new Error('ボタンが無い: ' + label + ' / ある: ' + bannerButtons(w).map(x => x.textContent));
  b.click();
  return b;
}

/* ---------------- モック window ---------------- */
function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => {
      v = String(v);
      if (opts.quota != null){
        let total = v.length;
        for (const kk of Object.keys(store)) if (kk !== k) total += store[kk].length;
        if (total > opts.quota){ const e = new Error('quota'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
      }
      store[k] = v;
    },
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
  w.window = w; w.__store = store; w.__inp = inp;
  return w;
}

/* ---------------- モック Api / G（index.html G.submit の順序をそのまま写した代役） ---------------- */
function wire(w, S, responses, hooks){
  hooks = hooks || {};
  const trace = { apiCalls: [], parsePlan: 0, psych: 0, appendTurn: 0, saves: 0, status: [] };
  const queue = responses.slice();

  w.Api = {
    async call(system, userContent, maxTok, opts){
      const n = trace.apiCalls.length;
      trace.apiCalls.push({ system: system, user: userContent, maxTok: maxTok, argc: arguments.length });
      if (typeof hooks.onCall === 'function') hooks.onCall(n, w, S);
      const r = queue.length ? queue.shift() : null;
      return r === null ? null : Object.assign({ text: r }, hooks.extra || {});
    }
  };
  const Planner = { build: (mode, text) => ({ sys: 'SYS', user: 'USER:' + text }),
                    parsePlan: (raw) => { trace.parsePlan++; return { narrative: [String(raw)] }; } };
  const PsychEngine = { process(plan){ trace.psych++; if (typeof hooks.onPsych === 'function') hooks.onPsych(plan, w); } };
  const UI = { setStatus(m, e){ trace.status.push(String(m)); },
               appendTurn(){ trace.appendTurn++; }, setLoading(){}, renderBranches(){} };
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
        PsychEngine.process(plan);
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
              cfg: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' } };
  s.save = function(){ s.saved++; };
  return s;
}
/* fix650 を積む/積まないを切り替えられる boot（「積んでも変わらない」を示すため） */
function boot(w, S, withSafety){
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC624, ctx, { filename: 'fix624' });
  vm.runInContext(SRC643, ctx, { filename: 'fix643' });
  if (withSafety !== false) vm.runInContext(SRC650, ctx, { filename: 'fix650' });
  return ctx;
}
function fixtures(w){ return w.__v292Dfix624._fixtures; }
const say3 = '<say who="a">「あ」</say>\n<say who="b">「い」</say>\n<say who="c">「う」</say>';
function taggedHistory(n){            /* 台詞が続いていた物語（cardAvg=3） */
  const out = [];
  for (let i = 0; i < n; i++) out.push({ plan: { narrative: [say3] }, narrative: '', _convSays: [1, 2, 3] });
  return out;
}
function plainHistory(n){             /* 台詞タグを使わない物語（cardAvg=0） */
  const out = [];
  for (let i = 0; i < n; i++) out.push({ plan: { narrative: ['静かな時間が流れていた。窓の外では雨が降っている。'] }, narrative: '', _convSays: [] });
  return out;
}
function logOf(w){ try { return JSON.parse(w.__store['v292Dfix643_log'] || '[]'); } catch(e){ return []; } }
function ringOf(w){ try { return JSON.parse(w.__store['v292Dfix650Ring'] || '[]'); } catch(e){ return []; } }
function liveStore(extra){
  return Object.assign({ v292Dfix643Live: '1', v292Dfix650LiveSlots: JSON.stringify(CANARY) }, extra || {});
}
const SLOTKEY = 'chr6_slot_' + SLOT;

/* =====================================================================
   (0) 素材の確認 — このテストが使う見本の点数帯を先に固定する
   ★ここがずれると以下の3分岐テストが「何を確かめているのか」分からなくなる。
   ===================================================================== */
console.log('\n== (0) 見本の点数帯（0〜3 / 4〜6 / 7以上 が実在すること） ==');
{
  const w = mkWin(); const S = mkS(plainHistory(3)); boot(w, S);
  const F = fixtures(w);
  const j = t => w.__v292Dfix643.judgeRaw(t, S);
  ok('★repLoop は hard（7点以上）', j(F.repLoop).score >= 7, j(F.repLoop).score);
  ok('★registerCollapse は台詞なし物語では soft（4〜6点）',
     j(F.registerCollapse).score >= 4 && j(F.registerCollapse).score <= 6, j(F.registerCollapse).score);
  ok('★normalA は 0〜3点', j(F.normalA).score <= 3, j(F.normalA).score);
}

(async function run(){

/* =====================================================================
   (1) 物語allowlistゲート
   ===================================================================== */
console.log('\n== (1) 端末フラグだけでは live にしない（物語allowlist） ==');
async function gateRun(store, slotKey){
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: store, slotKey: slotKey || SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  return { w, S, tr, L: logOf(w) };
}
{
  const r = await gateRun({ v292Dfix643Live: '1' });                       /* allowlist 未設定 */
  ok('★★Live=1 でも allowlist 未設定なら救済しない（shadow）', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
  ok('★shadow なのでターンは確定する', r.S.turns.length === 4 && r.S.saved === 1);
  ok('★記録も shadow', r.L.length === 1 && r.L[0].mode === 'shadow' && r.L[0].outcome === 'hard-observed', r.L[0]);
  ok('★ring は1バイトも書かない', r.w.__store['v292Dfix650Ring'] === undefined, Object.keys(r.w.__store));
}
{
  const r = await gateRun({ v292Dfix643Live: '1', v292Dfix650LiveSlots: JSON.stringify(['sms_other']) });
  ok('★★別の物語だけが載っている allowlist では live にしない', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
  ok('★ターンは確定する', r.S.turns.length === 4);
}
{
  const r = await gateRun({ v292Dfix643Live: '1', v292Dfix650LiveSlots: '{壊れたJSON' });
  ok('★★壊れた allowlist は shadow へ倒す（fail-closed）', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
}
{
  const r = await gateRun({ v292Dfix643Live: '1', v292Dfix650LiveSlots: '[]' });
  ok('★空配列も shadow', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
}
{
  const r = await gateRun({ v292Dfix650LiveSlots: JSON.stringify(CANARY) });   /* 端末フラグなし */
  ok('★★allowlist だけでは live にしない（端末フラグも要る＝二重の鍵）', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
}
{
  const r = await gateRun(liveStore());
  ok('★★端末フラグ＋allowlist が揃った時だけ救済が走る', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
  ok('★直った方が採用される', r.S.turns.length === 4 && r.S.turns[3].narrative === fixtures(r.w).normalA);
  ok('★記録は live/regen-ok', r.L.length === 1 && r.L[0].mode === 'live' && r.L[0].outcome === 'regen-ok', r.L[0]);
}
{
  const r = await gateRun({ v292Dfix643Live: '1', v292Dfix643LiveSlots: JSON.stringify(CANARY) });
  ok('★別名キー v292Dfix643LiveSlots でも通る（手順書の揺れを吸収）', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
}
{
  const r = await gateRun(liveStore(), 'chr6_slot_sms_not_in_list');
  ok('★★allowlist に無い物語へ切り替えたら自動で shadow に戻る', r.tr.apiCalls.length === 1, r.tr.apiCalls.length);
}
{
  /* ★フラグを1つも置かない端末＝既定。fix650 を積んでも積まなくても結果が同じであることを見る。 */
  const S1 = mkS(taggedHistory(3)); const w1 = mkWin(); boot(w1, S1, false);
  const t1 = wire(w1, S1, [fixtures(w1).repLoop, fixtures(w1).normalA]);
  w1.__inp.value = '扉を開ける'; await w1.G.submit();
  const S2 = mkS(taggedHistory(3)); const w2 = mkWin(); boot(w2, S2, true);
  const t2 = wire(w2, S2, [fixtures(w2).repLoop, fixtures(w2).normalA]);
  w2.__inp.value = '扉を開ける'; await w2.G.submit();
  ok('★★既定端末: fix650 を積んでも API 呼出回数が同じ', t1.apiCalls.length === t2.apiCalls.length, [t1.apiCalls.length, t2.apiCalls.length]);
  ok('★★既定端末: ターン数も保存回数も同じ',
     S1.turns.length === S2.turns.length && S1.saved === S2.saved, [S1.turns.length, S2.turns.length]);
  ok('★★既定端末: 本文も同じ', S1.turns[3].narrative === S2.turns[3].narrative);
  ok('★★既定端末: localStorage に増えるキーが無い',
     JSON.stringify(Object.keys(w1.__store).sort()) === JSON.stringify(Object.keys(w2.__store).sort()),
     [Object.keys(w1.__store), Object.keys(w2.__store)]);
}

/* =====================================================================
   (2) 保守的な採用条件（0〜3 / 4〜6 / 7以上）
   ===================================================================== */
console.log('\n== (2) 採用は3分岐（0〜3=採用 / 4〜6=確認待ち / 7以上=停止） ==');
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★0〜3点: 自動採用', S.turns.length === 4 && S.turns[3].narrative === F.normalA, S.turns.length);
  ok('★0〜3点: 保存も表示も通る', S.saved === 1 && tr.appendTurn === 1);
  ok('★0〜3点: ring の裁定は adopt', ringOf(w).length === 1 && ringOf(w)[0].verdict === 'adopt', ringOf(w)[0]);
}
{
  /* ★4〜6点（soft）: 自動確定しない。二重hardと同じ契約で止まる。 */
  const S = mkS(plainHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.registerCollapse, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★4〜6点: 自動の3回目は無い（API呼出は2回で止まる）', tr.apiCalls.length === 2, tr.apiCalls.length);
  ok('★★4〜6点: ①ターン数が増えない', S.turns.length === 3, S.turns.length);
  ok('★★4〜6点: ②入力欄が空にならない', w.__inp.value === '扉を開ける', w.__inp.value);
  ok('★★4〜6点: ③状態を更新しない（parsePlan も PsychEngine も走らない）',
     tr.parsePlan === 0 && tr.psych === 0, tr);
  ok('★★4〜6点: ④保存しない＝クラウドpushに出ない', S.saved === 0, S.saved);
  ok('★4〜6点: 表示もしない', tr.appendTurn === 0);
  const L = logOf(w);
  ok('★4〜6点: outcome=regen-confirm', L.length === 1 && L[0].outcome === 'regen-confirm', L);
  ok('★4〜6点: ring の裁定は confirm', ringOf(w)[0].verdict === 'confirm', ringOf(w)[0] && ringOf(w)[0].verdict);
  ok('★4〜6点: 案内バナーが出る', !!w.document.getElementById('v643banner'));
  const labels = bannerButtons(w).map(b => b.textContent);
  ok('★4〜6点: 操作は3つ', labels.length === 3, labels);
  ok('★4〜6点: 採用ボタンは「書き直した文章」を指す', labels.indexOf('書き直した文章を確認する') >= 0, labels);
  ok('★4〜6点: 保留しているのは救済側の候補', w.__v292Dfix643.status().pendingKind === 'confirm');

  /* 人が採用したら、その本文が**1文字も変わらずに**ターンになる */
  clickBanner(w, '書き直した文章を確認する');
  await new Promise(r => setImmediate(r));
  ok('★★人の採用では通信しない（API呼出は増えない）', tr.apiCalls.length === 2, tr.apiCalls.length);
  ok('★★採用されるのは救済側の本文（初回の崩壊本文ではない）',
     S.turns.length === 4 && S.turns[3].narrative === F.registerCollapse, S.turns.length);
  ok('★★本文は1文字も加工されない', S.turns[3].narrative === F.registerCollapse);
  ok('★入力が復元されている', S.turns[3].playerText === '扉を開ける', S.turns[3].playerText);
  const L2 = logOf(w);
  ok('★user-accepted として記録し、救済側だと分かる注記が残る',
     L2[1].outcome === 'user-accepted' && L2[1].note === 'user-accepted-rescue-candidate', L2[1]);
  ok('★★ring の採用結果が後追いで更新される', ringOf(w)[0].outcome === 'user-accepted', ringOf(w)[0].outcome);
  ok('★裁定そのもの(verdict)は書き換えない（何を機械が決めたかが残る）', ringOf(w)[0].verdict === 'confirm');
}
{
  /* ★7点以上（二重hard）: 従来どおり停止。保留は**初回**の候補。 */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★7点以上: 自動の3回目は無い', tr.apiCalls.length === 2, tr.apiCalls.length);
  ok('★★7点以上: ターン数が増えない / 保存しない / 状態を更新しない',
     S.turns.length === 3 && S.saved === 0 && tr.psych === 0 && tr.parsePlan === 0);
  ok('★7点以上: 入力は残る', w.__inp.value === '扉を開ける');
  ok('★7点以上: outcome=regen-hard', logOf(w)[0].outcome === 'regen-hard', logOf(w)[0]);
  ok('★7点以上: ring の裁定は stop', ringOf(w)[0].verdict === 'stop', ringOf(w)[0].verdict);
  ok('★7点以上: 保留は初回候補（従来どおりの逃げ道）',
     bannerButtons(w).map(b => b.textContent).indexOf('最初の文章を確認する') >= 0,
     bannerButtons(w).map(b => b.textContent));
  ok('★7点以上: pendingKind=hard', w.__v292Dfix643.status().pendingKind === 'hard');
}
{
  /* 閾値そのものを純関数でも固定する（境界値: 3/4/6/7） */
  const w = mkWin(); const S = mkS([]); boot(w, S);
  const V = w.__v292Dfix650._verdict;
  ok('★境界: 3点は採用', V({ measurable: true, score: 3 }) === 'adopt');
  ok('★境界: 4点は確認待ち', V({ measurable: true, score: 4 }) === 'confirm');
  ok('★境界: 6点は確認待ち', V({ measurable: true, score: 6 }) === 'confirm');
  ok('★境界: 7点は停止', V({ measurable: true, score: 7 }) === 'stop');
  ok('★★測れない救済は自動確定しない（改善したと言えないから）', V(null) === 'confirm');
  ok('★selfTest() が通る', w.__v292Dfix650.selfTest().ok === true, w.__v292Dfix650.selfTest());
}
{
  /* 測れない救済（短すぎて判定不能）は confirm＝止まる。fix643 単体なら採用していた経路。 */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, '短い。']);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★測れない救済は自動確定しない', S.turns.length === 3 && S.saved === 0, S.turns.length);
  ok('★測れない救済も記録に残る（reason=unmeasurable）',
     ringOf(w)[0].reason === 'unmeasurable', ringOf(w)[0] && ringOf(w)[0].reason);
}

/* =====================================================================
   (3) 状態リーク防止（最重要）
   ===================================================================== */
console.log('\n== (3) 却下した候補の state は一度も適用されない ==');
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const applied = [];
  const tr = wire(w, S, [F.repLoop, F.normalA], { onPsych: (plan) => applied.push(plan.narrative.join('\n')) });
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★状態適用は1回だけ（仮適用→再適用が起きない）', applied.length === 1, applied.length);
  ok('★★適用されたのは救済側の本文だけ', applied[0] === F.normalA, applied[0] && applied[0].slice(0, 20));
  ok('★★初回の崩壊本文は一度も適用されない', applied.indexOf(F.repLoop) < 0);
  ok('★parsePlan も1回だけ（却下側は解釈すらしない）', tr.parsePlan === 1, tr.parsePlan);
  const e = ringOf(w)[0];
  ok('★生成前の state hash を記録している', typeof e.stateHashBefore === 'string' && e.stateHashBefore.length > 0, e.stateHashBefore);
  ok('★★救済後も state hash が動いていない（＝完全再実行の証拠）',
     e.stateHashAfter === e.stateHashBefore, [e.stateHashBefore, e.stateHashAfter]);
}
{
  /* ★救済の最中に状態が動いていたら（＝どこかで仮適用された疑い）採用しない */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA], {
    onCall: (n, ww) => { if (n === 1) ww.__v292Dfix77Store = { 佐伯: { karada: '傷' } }; }   /* 2回目の呼出前に fix77 が動く */
  });
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★state が動いていたら救済を自動採用しない', S.turns.length === 3 && S.saved === 0, S.turns.length);
  ok('★★理由が残る（state-drift）', ringOf(w)[0].reason === 'state-drift', ringOf(w)[0].reason);
  ok('★裁定は stop（採用でも確認待ちでもない）', ringOf(w)[0].verdict === 'stop');
  ok('★前後の hash が違うことも残る', ringOf(w)[0].stateHashAfter !== ringOf(w)[0].stateHashBefore);
  ok('★入力は残る（プレイヤーの入力を失わない）', w.__inp.value === '扉を開ける');
}
{
  /* state hash が「実際に fix77/fix190 を見ている」ことを直接確かめる（見ていなければ差が出ない） */
  const w = mkWin(); const S = mkS(taggedHistory(2)); boot(w, S);
  const h0 = w.__v292Dfix650._stateHash(S);
  w.__v292Dfix77Store = { a: { kizu: 'x' } };
  const h1 = w.__v292Dfix650._stateHash(S);
  w.__store['v292Dfix77States'] = '{"a":{"kizu":"y"}}';
  const h2 = w.__v292Dfix650._stateHash(S);
  S.turns.push({ plan: { narrative: ['x'] } });
  const h3 = w.__v292Dfix650._stateHash(S);
  ok('★fix77 store の変化を捉える', h0 !== h1, [h0, h1]);
  ok('★fix190 永続side(v292Dfix77States) の変化を捉える', h1 !== h2);
  ok('★ターン本数の変化を捉える', h2 !== h3);
  ok('★同じ状態なら同じ値（安定している）', w.__v292Dfix650._stateHash(S) === h3);
}

/* =====================================================================
   (4) single-flight
   ===================================================================== */
console.log('\n== (4) 同一 logicalTurnId の救済は並列で走らない ==');
{
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); const S = mkS(taggedHistory(3)); boot(w, S);
  const f = w.__v292Dfix650;
  const a = f.begin({ state: S, seq: 1, input: '扉を開ける', slotId: SLOT, sys: 's', user: 'u' });
  const b = f.begin({ state: S, seq: 1, input: '扉を開ける', slotId: SLOT, sys: 's', user: 'u' });
  const c = f.begin({ state: S, seq: 1, input: '窓を見る',   slotId: SLOT, sys: 's', user: 'u' });
  ok('★同じ物語・同じターン・同じ入力は同じ logicalTurnId', a.turnId === b.turnId, [a.turnId, b.turnId]);
  ok('★入力が違えば別の logicalTurnId', a.turnId !== c.turnId);
  ok('★logicalTurnId に物語IDとターン番号が入る',
     a.turnId.indexOf(SLOT) === 0 && a.turnId.indexOf('#3#') > 0, a.turnId);
  ok('★★1本目は取れる', f.acquire(a) === true);
  ok('★★2本目は取れない（並列で走らない）', f.acquire(b) === false);
  ok('★別の論理ターンは同時に取れる', f.acquire(c) === true);
  f.release(a);
  ok('★解放したら次が取れる', f.acquire(b) === true);
  f.release(b); f.release(c);
  ok('★全部解放されている', f.status().inflight === 0, f.status().inflight);
}
{
  /* ★取れなかったら救済せず素通しする（観測だけ）。＝並列時に二重生成しない */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__v292Dfix650.acquire = function(){ return false; };      /* 先に誰かが走っている状況を作る */
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★取れなければ救済を始めない（API呼出は1回）', tr.apiCalls.length === 1, tr.apiCalls.length);
  ok('★素通しなのでターンは確定する（プレイヤーを待たせない）', S.turns.length === 4 && S.saved === 1);
  ok('★記録に hard-singleflight が残る', logOf(w)[0].outcome === 'hard-singleflight', logOf(w)[0]);
}
{
  /* 救済が終われば必ず解放される（例外が出ても残さない） */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★救済が終わったら logicalTurnId は解放されている', w.__v292Dfix650.status().inflight === 0,
     w.__v292Dfix650.status().inflight);
}

/* =====================================================================
   (5) 即時停止
   ===================================================================== */
console.log('\n== (5) 即時停止（次の生成から効く・再読込しない） ==');
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA, F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('前提: live で救済が走っている', tr.apiCalls.length === 2, tr.apiCalls.length);
  w.__v292Dfix650.stop();
  w.__inp.value = 'もう一度';
  await w.G.submit();
  ok('★★stop() の次の生成から救済しない（再読込していない）', tr.apiCalls.length === 3, tr.apiCalls.length);
  ok('★停止後もターンは普通に確定する（プレイヤーを止めない）', S.turns.length === 5, S.turns.length);
  ok('★★元栓(v292Dfix643Live)も閉じる＝安全層を OFF にしても live へ戻らない',
     w.__store['v292Dfix643Live'] === undefined, w.__store['v292Dfix643Live']);
  ok('★停止フラグが残る', w.__store['v292Dfix650Stop'] === '1');
  ok('★status() が shadow を示す', w.__v292Dfix650.status().mode === 'shadow', w.__v292Dfix650.status());
  w.__v292Dfix650.arm();
  ok('★arm() で元に戻せる', w.__v292Dfix650.status().mode === 'live' && w.__store['v292Dfix643Live'] === '1');
}
{
  /* 画面のトグル: live を開けた端末にだけ出る。押すと即 OFF。 */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const t = w.document.getElementById('v650toggle');
  ok('★live 端末にはトグルが出る', !!t, !!t);
  ok('★ONと分かる表示', !!t && t.textContent.indexOf('ON') > 0 && t.textContent.indexOf('OFF') > 0, t && t.textContent);
  t.click();
  ok('★★押すと即 OFF（フラグが落ちる）', w.__store['v292Dfix643Live'] === undefined && w.__store['v292Dfix650Stop'] === '1');
  ok('★表示も切り替わる', w.document.getElementById('v650toggle').textContent.indexOf('OFF（') > 0,
     w.document.getElementById('v650toggle').textContent);
  t.click();
  ok('★もう一度押すと ON へ戻る', w.__store['v292Dfix643Live'] === '1' && w.__store['v292Dfix650Stop'] === undefined);
}
{
  const S = mkS(taggedHistory(3));
  const w = mkWin(); boot(w, S);          /* 既定の端末 */
  ok('★★既定の端末にはトグルを出さない（画面に何も足さない）',
     !w.document.getElementById('v650toggle') && w.document.body.children.length === 0,
     w.document.body.children.length);
}

/* =====================================================================
   (6) ring buffer（候補の保全）
   ===================================================================== */
console.log('\n== (6) hard候補の保全（直近20件・全文・端末ローカル） ==');
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  wire(w, S, [F.repLoop, F.normalA], { extra: { finish_reason: 'stop' } });
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  const e = ringOf(w)[0];
  ok('★1件保存されている', ringOf(w).length === 1);
  ok('★★初回本文が全文残る', e.first.text === F.repLoop, e.first.text && e.first.text.length);
  ok('★★救済本文も全文残る', e.rescue.text === F.normalA, e.rescue.text && e.rescue.text.length);
  ok('★★初回のスコア内訳が残る（点数と内訳の両方）',
     e.first.score.score >= 7 && e.first.score.hits.length > 0 && e.first.score.codes.length > 0, e.first.score);
  ok('★★救済のスコア内訳も残る', e.rescue.score.measurable === true && typeof e.rescue.score.score === 'number', e.rescue.score);
  ok('★モデルと経路が残る', e.route.provider === 'anthropic' && /haiku/.test(e.route.model) && /Api\.call/.test(e.route.path), e.route);
  ok('★finish_reason が残る（取れた時）', e.first.finishReason === 'stop' && e.rescue.finishReason === 'stop', [e.first.finishReason, e.rescue.finishReason]);
  ok('★生成前 state hash が残る', !!e.stateHashBefore);
  ok('★Planner の素性が残る（sys/user の指紋と長さ・モード）',
     !!e.planner.sysHash && e.planner.sysBytes > 0 && !!e.planner.userHash && e.planner.mode === 'DO', e.planner);
  ok('★★sys 本文そのものは持たない（プロンプトを端末に溜めない）',
     JSON.stringify(e.planner).indexOf('SYS') < 0, e.planner);
  ok('★logicalTurnId が残る', typeof e.logicalTurnId === 'string' && e.logicalTurnId.indexOf(SLOT) === 0, e.logicalTurnId);
  ok('★物語IDとターン番号が残る', e.slotId === SLOT && e.turnIndex === 3, [e.slotId, e.turnIndex]);
  ok('★採用結果が残る', e.verdict === 'adopt' && e.outcome === 'adopt');
  ok('★人手確認フラグは既定 false', e.reviewed === false);
}
{
  /* 上限20件・古いものから捨てる */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const f = w.__v292Dfix650;
  for (let i = 0; i < 25; i++){
    const ctx = f.begin({ state: S, seq: 1, input: 'a' + i, slotId: SLOT, sys: 's', user: 'u' });
    f.judgeRescue(ctx, { first: { view: { measurable: true, score: 9, level: 'hard', hits: [], codes: [] }, result: { text: 'first' + i } },
                         second: { view: { measurable: true, score: 0, level: 'ok', hits: [], codes: [] }, result: { text: 'rescue' + i } },
                         state: S });
  }
  const r = ringOf(w);
  ok('★★上限は20件', r.length === 20, r.length);
  ok('★★捨てるのは最古（最新は残る）', r[19].first.text === 'first24' && r[0].first.text === 'first5',
     [r[0].first.text, r[19].first.text]);
}
{
  /* 人手確認のマーク */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  const f = w.__v292Dfix650;
  ok('★list() で読める', f.list().length === 1 && f.list()[0].first.text === F.repLoop);
  ok('★summary() は一覧向けに小さい', f.summary().length === 1 && typeof f.summary()[0].firstScore === 'number', f.summary()[0]);
  ok('★★mark(0) で人手確認済みにできる', f.mark(0, '誤検出だった') === true);
  ok('★★確認済みが永続する（localStorage に残る）', ringOf(w)[0].reviewed === true && ringOf(w)[0].reviewNote === '誤検出だった', ringOf(w)[0].reviewed);
  ok('★確認した時刻も残る', typeof ringOf(w)[0].reviewedAt === 'string');
  ok('★unmark(0) で戻せる', f.unmark(0) === true && ringOf(w)[0].reviewed === false);
  ok('★範囲外の mark は false（黙って壊さない）', f.mark(99) === false && f.mark(-1) === false);
  ok('★status() に件数が出る', f.status().ring === 1, f.status());
  ok('★clearRing() で消せる', f.clearRing() === true && ringOf(w).length === 0);
}
{
  /* ★QuotaExceeded: 最古から捨てて書き直す。例外を外へ出さない。 */
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY, quota: 4000 }); boot(w, S);
  const f = w.__v292Dfix650;
  let threw = null;
  try {
    for (let i = 0; i < 12; i++){
      const ctx = f.begin({ state: S, seq: 1, input: 'a' + i, slotId: SLOT, sys: 's', user: 'u' });
      f.judgeRescue(ctx, { first: { view: { measurable: true, score: 9, level: 'hard', hits: [], codes: [] }, result: { text: 'X'.repeat(600) + i } },
                           second: { view: { measurable: true, score: 0, level: 'ok', hits: [], codes: [] }, result: { text: 'Y'.repeat(600) + i } },
                           state: S });
    }
  } catch(e){ threw = String(e && e.message || e); }
  ok('★★QuotaExceeded で例外を投げない', threw === null, threw);
  const r = ringOf(w);
  ok('★★書けるところまでは残る（全滅しない）', r.length >= 1, r.length);
  ok('★★残るのは新しい方', r[r.length - 1].first.text.indexOf('11') > 0, r[r.length - 1].first.text.slice(-4));
  ok('★捨てたことを数えている', f.status().stats.evicted > 0, f.status().stats);
  ok('★他のキーを壊していない', w.__store['v292Dfix643Live'] === '1');
}
{
  /* ★★クラウド同期・スナップショットの網に掛からない — 実際の判定関数をソースから抜いて当てる */
  const w = mkWin(); const S = mkS([]); boot(w, S);
  const KEY = w.__v292Dfix650.RING_KEY;
  ok('★キー名は v292Dfix650Ring', KEY === 'v292Dfix650Ring', KEY);

  const gk = SRC399.match(/function isGlobalKey\(k\)\{[\s\S]*?\n  \}/);
  const sk = SRC399.match(/function slotKeyMatch\(k, slotId\)\{[\s\S]*?\n  \}/);
  ok('★fix399 から isGlobalKey / slotKeyMatch を取り出せた（取り出せないと偽の合格になる）', !!gk && !!sk);
  const probe = vm.runInNewContext('(function(){ ' + gk[0] + '\n' + sk[0] +
                                   '\nreturn { g: isGlobalKey, s: slotKeyMatch }; })()', {});
  ok('★★fix399 の isGlobalKey に当たらない（クラウドの荷物に載らない）', probe.g(KEY) === false);
  let matched = [];
  CANARY.concat(['chr6']).forEach(id => { if (probe.s(KEY, id)) matched.push(id); });
  ok('★★fix399 の slotKeyMatch にも当たらない（どのcanary物語のキーとも見なされない）', matched.length === 0, matched);
  /* fix402 側の規則（キーにスロットIDが含まれるか）と fix564 の partKeys 規則も同じ形 */
  ok('★★キーにスロットIDを含めていない（fix402/fix564 が拾う条件を満たさない）',
     CANARY.every(id => KEY.indexOf(id) < 0));
  ok('★fix564 の除外規則と同じ形であることを確認（partKeys は k.indexOf(slot) で拾う）',
     /k\.indexOf\(slot\) < 0/.test(SRC564));
  ok('★fix399 の同期状態キー(v292Dfix399_)とも別物', KEY.indexOf('v292Dfix399_') !== 0);
}

/* =====================================================================
   (7) 表示文字列・sys に触らない
   ===================================================================== */
console.log('\n== (7) 本文と sys に触らない ==');
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore(), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★★採用された本文は1文字も変わらない', S.turns[3].narrative === F.normalA);
  ok('★★sys は初回と同じものが渡る（sys注入経路を壊さない）',
     tr.apiCalls[1].system === tr.apiCalls[0].system && tr.apiCalls[0].system === 'SYS', tr.apiCalls[1].system);
  ok('★救済の追加指示は user の末尾だけ（fix643 の作法のまま）',
     tr.apiCalls[1].user.indexOf(tr.apiCalls[0].user) === 0);
  ok('★fix650 は sys へ何も足さない',
     !/PromptRegistry|_preCallHooks|Planner\s*\./.test(SRC650), 'sys');
  ok('★fix650 は本文を書き換えない（.text への代入が無い）',
     !/\.text\s*=[^=]/.test(SRC650), 'text');
  ok('★fix650 は Api.call を包まない（配線の正本は fix643 ひとつ）',
     SRC650.indexOf('Api.call =') < 0 && SRC650.indexOf('api.call =') < 0);
}

/* =====================================================================
   (8) OFF / 冪等 / 公開API / 配線 / 出荷の体裁
   ===================================================================== */
console.log('\n== (8) OFF / 冪等 / 配線 / 出荷の体裁 ==');
{
  /* 安全層だけ OFF → fix643 は従来の判断（hard でなければ採用）に戻る。ring も書かない。 */
  const S = mkS(plainHistory(3));
  const w = mkWin({ store: liveStore({ v292Dfix650Off: '1' }), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.registerCollapse]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★安全層 OFF なら fix643 の従来判断に戻る（softでも採用）', S.turns.length === 4, S.turns.length);
  ok('★安全層 OFF なら ring を書かない', w.__store['v292Dfix650Ring'] === undefined);
  ok('★安全層 OFF でも救済そのものは動く（fix643 を壊していない）', tr.apiCalls.length === 2);
}
{
  const S = mkS(taggedHistory(3));
  const w = mkWin({ store: liveStore({ v292Dfix643Off: '1' }), slotKey: SLOTKEY }); boot(w, S);
  const F = fixtures(w);
  const tr = wire(w, S, [F.repLoop, F.normalA]);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  ok('★fix643 OFF なら判定も救済も ring も無い',
     tr.apiCalls.length === 1 && S.turns.length === 4 && w.__store['v292Dfix650Ring'] === undefined);
}
{
  const S = mkS([]);
  const w = mkWin(); const ctx = boot(w, S);
  const first = w.__v292Dfix650;
  vm.runInContext(SRC650, ctx, { filename: 'fix650#2' });
  ok('★二重ロードで初期化し直さない', w.__v292Dfix650 === first);
}
{
  ok('★★冪等ガードが __v292 系（fix274 の継承バグの教訓）', /if\s*\(window\.__v292Dfix650\)\s*return/.test(SRC650));
  ok('★★OFFスイッチがある', SRC650.indexOf("'v292Dfix650Off'") > 0);
  ok('★window.S を新設しない', !/window\.S\s*=[^=]/.test(SRC650));
  ok('★状態取得は __chronicleGetState 経由の fix643 に委ねる（自前で S を掘らない）',
     SRC650.indexOf('eval(') < 0);
  ok('★fix624（判定の正本）を変更していない', SRC624.indexOf('fix650') < 0);
  ok('★features.js を変更していない', read('features.js').indexOf('v292Dfix650') < 0);
  ok('★fix643 は安全層が居ない時も動く（居るかを毎回確かめている）',
     /window\.__v292Dfix650/.test(SRC643) && /if\s*\(!s\s*\|\|\s*s\.__armed\s*!==\s*true\)\s*return null/.test(SRC643));
  ok('★fix643 の live 判定が gate を通る', /s\.gate\(slotId\(\)\)/.test(SRC643));
  ok('★fix643 が single-flight を尋ねる', /s6\.acquire\(ctx6\)/.test(SRC643));
  ok('★fix643 が採用可否を安全層へ委ねる', /s6\.judgeRescue\(ctx6/.test(SRC643));
  ok('★安全層が転んだら止める側へ倒す', /verdict = 'stop'/.test(SRC643));
}
{
  ok('★index.html に script タグがある', HTMLU.indexOf('v292Dfix650-rescue-safety.js') > 0);
  ok('★?cb= が付いている（値は出荷ごとに進む）', /v292Dfix650-rescue-safety\.js\?cb=[A-Za-z0-9]+/.test(HTMLU));
  ok('★★fix643 より後に読み込む（安全層は救済層の後）',
     HTMLU.indexOf('v292Dfix650-rescue-safety.js') > HTMLU.indexOf('v292Dfix643-collapse-rescue.js'));
  ok('★fix624（判定器）より後', HTMLU.indexOf('v292Dfix650-rescue-safety.js') > HTMLU.indexOf('v292Dfix624-degeneration-probe.js'));
  ok('★</body> より前にある', HTMLU.indexOf('v292Dfix650-rescue-safety.js') < HTMLU.lastIndexOf('</body>'));
  ok('★home.html には入れない（ゲーム画面専用）', HOME.indexOf('v292Dfix650-rescue-safety.js') < 0);
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★CRLF を持ち込んでいない',
     fs.readFileSync(path.join(__dirname, 'index.html')).indexOf(Buffer.from('\r\n')) < 0);
  ok('★fix650 のファイルに CRLF / NUL が無い',
     fs.readFileSync(path.join(__dirname, 'v292Dfix650-rescue-safety.js')).indexOf(Buffer.from('\r\n')) < 0 &&
     fs.readFileSync(path.join(__dirname, 'v292Dfix650-rescue-safety.js')).filter(b => b === 0).length === 0);
  /* ★BUILT の値そのものは出荷ごとに進む。固定値で縛らない（契約は「同値であること」）。 */
  ok('★★BUILT と version.txt が同値', (() => {
    const b = (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1];
    return !!b && b === read('version.txt').trim();
  })());
  ok('★★中身を変えた fix643 の cb も上がっている（いまの BUILT の fix札と一致）', (() => {
    const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
    const cb = (HTMLU.match(/v292Dfix643-collapse-rescue\.js\?cb=v292D(\w+)/) || [])[1];
    return !!token && cb === token;
  })(), (HTMLU.match(/v292Dfix643-collapse-rescue\.js\?cb=[^"]*/) || [])[0]);
  ok('★★新モジュールの cb も同じ fix札', (() => {
    const token = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
    const cb = (HTMLU.match(/v292Dfix650-rescue-safety\.js\?cb=v292D(\w+)/) || [])[1];
    return !!token && cb === token;
  })(), (HTMLU.match(/v292Dfix650-rescue-safety\.js\?cb=[^"]*/) || [])[0]);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
})();
