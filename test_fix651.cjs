/* 回帰テスト: v292Dfix651 — 暴走生成の遮断(A) / 物語切替の控え汚染(B) / 0ターン上書きの非常ブレーキ(C)
 *
 * ★このテストが固定する契約（GPT裁定・緩めない）。値ではなく**振る舞い**で見る。
 *
 * [A] 暴走ストリームガード
 *   A1 正常な長文は中断しない
 *   A2 累計1024字未満では即断しない
 *   A3 大量反復（Court様型）は**受け切る前に**判定が出る
 *   A4 句読点の消えた暴走（maxRun427相当）を中断する
 *   A5 しきい値を1回超えただけでは止めない
 *   A6 2回連続で超えたら止める
 *   A7 中断時に AbortController が abort する
 *   A8 abort 後に届いた分は無視する（遅延チャンク）
 *   A9 救済は最大1回（自動3回目なし）
 *   A10 救済側も同じ監視を通り、2回目も中断ならターン不成立（二重hard契約）
 *   A11 ターン不成立のとき state・保存・push は1つも増えない。入力は残る
 *   A12 v292Dfix651StreamGuardOff='1' では fix651 が無い時と1ビットも変わらない
 *   A13 既定(shadow)では中断しない＝フラグ無し端末の物語は従来どおり確定する
 *
 * [B] 物語切替による控え汚染（v292Dfix228 の中で直す）
 *   B1 同じ物語の正当な変更は従来どおり退避する
 *   B2 A→B へ切り替えた tick では**1件も退避しない**
 *   B3 A の値が B の __gen_ へ入らない（A→B / B→A の双方向）
 *   B4 切替直後の一時的な空値で、旧物語の値を退避しない
 *   B5 退避の直前にキーが変わっていたら中止する
 *   B6 v292Dfix651SlotBackupGuardOff='1' で旧 fix228 挙動へ戻る
 *
 * [C] 0ターン上書きの非常ブレーキ + 書込トレース
 *   C1 51T→0T の不正書込を拒否する（値は1バイトも変わらない・例外も投げない）
 *   C2 明示的な新規0T作成（既存が無い）は許可
 *   C3 明示的なリセット／削除／復元は正規経路（バイパスAPI）で許可
 *   C4 正規経路の正本ファイル（fix587/fix562/fix564）からの書込は許可
 *   C5 ?new=1&story=<id> の初期化は許可
 *   C6 v292Dfix651ZeroTurnGuardOff='1' で拒否しない（トレースは残る）
 *   C7 トレースは直近30件・本文を保存しない・スロット以外のキーは触らない
 *   C8 他fixの印（__f490/__f543 等）を消さない
 *
 * [Z] 出荷の体裁（BUILT/cb/NUL/配線）
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
const SRC228 = read('v292Dfix228-slot-generations.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');
const HOME   = read('home.html');

const CANARY = ['sms4np33eyg', 'sms5t2snqso'];
const SLOT = CANARY[0];
const SLOTKEY = 'chr6_slot_' + SLOT;

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
const NORMAL_LONG = varied(4000, true);          /* 正常な長文（fix624 も 0点） */
const HUGE_NORMAL = varied(13000, true);         /* 中身は正常だが長すぎる応答 */
const RUNAWAY     = varied(1600, false);         /* 句読点が消えた暴走（maxRun 型） */
const COURT       = new Array(400).join('Court様、すみません。');   /* 大量反復 */

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
  w.window = w; w.__store = store; w.__ls = ls; w.__inp = inp;
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
function liveStore(extra){
  return Object.assign({ v292Dfix643Live: '1', v292Dfix650LiveSlots: JSON.stringify(CANARY) }, extra || {});
}
function ringOf(w){ try { return JSON.parse(w.__store['v292Dfix650Ring'] || '[]'); } catch(e){ return []; } }

/* 監視器だけを取り出す軽い箱（DOM も fix643 も要らないテスト用） */
function guardOnly(store, search){
  const w = mkWin({ store: store || {}, search: search });
  const ctx = vm.createContext(w);
  vm.runInContext(SRC651, ctx, { filename: 'v292Dfix651-guards.js' });
  return w;
}

/* =====================================================================
   (0) 見本の確認 — 何を測っているのかを先に固定する
   ===================================================================== */
console.log('\n== (0) 見本の性質（fix624 と fix651 の役割分担） ==');
{
  const w = guardOnly();
  const g = w.__v292Dfix651;
  const w2 = mkWin(); const S2 = mkS(plainHistory(3)); boot(w2, S2);
  const score = t => w2.__v292Dfix624.scoreTurn({ narrative: t, _convSays: [] }, { cardAvg: 0 }).score;
  ok('★正常な長文(4000字)は fix624 でも 0〜3点', score(NORMAL_LONG) <= 3, score(NORMAL_LONG));
  ok('★異常に長い応答(13000字)も中身は正常＝fix624 では捕まらない', score(HUGE_NORMAL) <= 3, score(HUGE_NORMAL));
  ok('★その13000字を fix651 が長さで捕まえる（役割が重なっていない）',
     (g.streamGuard.inspect(HUGE_NORMAL).verdict || {}).reason === 'stream-overlength');
  ok('★自己診断が通る', g.selfTest().ok, g.selfTest());
}

/* =====================================================================
   [A] 暴走ストリームガード（判定器の契約）
   ===================================================================== */
console.log('\n== [A] 暴走ストリームガード ==');
{
  const g = guardOnly().__v292Dfix651.streamGuard;

  /* A1 */
  ok('A1 正常な長文は中断しない', g.inspect(NORMAL_LONG).verdict == null);
  ok('A1b 台詞まじりの短い正常応答も中断しない',
     g.inspect('「おはよう」と彼女は言った。窓の外は霧で、遠くの鐘が鳴っている。').verdict == null);

  /* A2 */
  ok('A2 累計1024字未満なら、中身が反復でも判定しない',
     g.inspect(COURT.slice(0, 1000)).verdict == null, COURT.slice(0, 1000).length);
  ok('A2b 1024字ちょうどでも1回目の検査で終わり（1回では止めない）',
     g.inspect(COURT.slice(0, 1024)).verdict == null);

  /* A3 */
  {
    const m = g.inspect(COURT);
    ok('A3 大量反復を中断する', (m.verdict || {}).reason === 'stream-degenerate', m.verdict);
    ok('A3b ★受け切る前に判定が出る（読んだ量 < 全長）', m.verdict.len < COURT.length,
       { read: m.verdict.len, total: COURT.length });
    ok('A3c 理由は被覆率', m.verdict.why === 'coverage', m.verdict.why);
  }

  /* A4 */
  {
    const m = g.inspect(RUNAWAY);
    ok('A4 句読点の消えた暴走(maxRun型)を中断する', (m.verdict || {}).reason === 'stream-degenerate', m.verdict);
    ok('A4b 理由は maxRun', m.verdict.why === 'maxRun', m.verdict.why);
    ok('A4c 実測 maxRun は 427 以上の水準', m.verdict.maxRun >= 427, m.verdict.maxRun);
  }
  ok('A4d 正常な長文の maxRun は しきい値のはるか下', g.maxRun(NORMAL_LONG) < 120, g.maxRun(NORMAL_LONG));

  /* A5 / A6 — 「連続2回」を監視器の状態で直接確かめる */
  {
    const m = g.monitor();
    m.feed(COURT.slice(0, 1024));                    /* 1回目の検査 */
    ok('A5 1回超えただけでは verdict は出ない', m.verdict == null && m.trips === 1 && m.streak === 1,
       { trips: m.trips, streak: m.streak });
    ok('A5b abort もしていない', m.aborted === false && m.signal.aborted === false);
    m.feed(COURT.slice(1024, 1024 + 256));           /* 2回目の検査 */
    ok('A6 2回連続で超えたら中断する', (m.verdict || {}).reason === 'stream-degenerate', m.verdict);
    ok('A6b 検査は2回だけ', m.checks === 2, m.checks);
    /* A7 */
    ok('A7 中断で AbortController が abort する', m.aborted === true && m.signal.aborted === true);
    /* A8 */
    const lenAt = m.verdict.len;
    const r = m.feed('この後に届いた分は無視される。'.repeat(50));
    ok('A8 遅延チャンクは無視される（読んだ量は増えない）', m.len === lenAt, { len: m.len, lenAt });
    ok('A8b 遅延チャンクは verdict を書き換えない', r === m.verdict && m.verdict.len === lenAt);
    ok('A8c 遅延チャンクは数えられている', m.lateChunks === 1 && m.lateChars > 0, { c: m.lateChunks });
  }

  /* 途中で正常に戻ったら streak は切れる（1回超えを溜め込まない） */
  {
    const m = g.monitor();
    m.feed(COURT.slice(0, 1024));
    ok('A6c 1回超えの直後', m.streak === 1);
    m.feed(varied(2600, true, 4242));                /* 窓が正常な文で埋まる */
    ok('A6d 正常に戻れば streak は 0 に戻り、中断しない', m.streak === 0 && m.verdict == null,
       { streak: m.streak, v: m.verdict });
  }

  /* 絶対長 */
  {
    const m = g.inspect(HUGE_NORMAL);
    ok('A6e 絶対長上限を超えたら（連続回数を待たず）中断する', (m.verdict || {}).reason === 'stream-overlength');
    ok('A6f 上限は 8192〜16384 の範囲に置かれている',
       g.CFG.maxLen >= 8192 && g.CFG.maxLen <= 16384, g.CFG.maxLen);
    ok('A6g 上限のすぐ下の長さでは中断しない', g.inspect(varied(g.CFG.maxLen - 200, true, 77)).verdict == null);
  }

  /* しきい値そのものが裁定どおりであること（値は契約なので固定する） */
  ok('A0 しきい値: 開始1024 / 窓2048 / 刻み256 / 8-gram / 65% / 2回連続',
     g.CFG.startAt === 1024 && g.CFG.window === 2048 && g.CFG.step === 256 &&
     g.CFG.n === 8 && g.CFG.cover === 0.65 && g.CFG.consecutive === 2, g.CFG);
}

/* ---- A9〜A13: fix624/fix643/fix650/fix651 を通しで動かす ---- */
console.log('\n== [A] 通し（Api.call → 判定 → 救済 → 不成立） ==');
async function chain(responses, store, opts){
  opts = opts || {};
  const S = mkS(plainHistory(3));
  const w = mkWin({ store: store || {}, slotKey: SLOTKEY });
  boot(w, S, opts);
  const tr = wire(w, S, responses);
  w.__inp.value = '扉を開ける';
  await w.G.submit();
  return { w, S, tr };
}
(async function runChain(){

{
  /* 実弾: 1回目も救済も「長すぎる応答」 */
  const r = await chain([HUGE_NORMAL, HUGE_NORMAL], liveStore());
  ok('A9 救済は1回だけ（自動3回目なし）', r.tr.apiCalls.length === 2, r.tr.apiCalls.length);
  ok('A10 二重中断でターンは確定しない', r.S.turns.length === 3, r.S.turns.length);
  ok('A11 保存は増えない', r.S.saved === 0, r.S.saved);
  ok('A11b パース/描画へ進んでいない', r.tr.parsePlan === 0 && r.tr.appendTurn === 0);
  ok('A11c 入力は残る', r.w.__inp.value === '扉を開ける', r.w.__inp.value);
  const ring = ringOf(r.w);
  ok('A10b ring に理由コードが残る', ring.length === 1 && ring[0].reason === 'stream-overlength', ring[0] && ring[0].reason);
  ok('A10c ring の verdict は stop', ring[0] && ring[0].verdict === 'stop');
  ok('A10d ring に遮断の内訳が残る', !!(ring[0] && ring[0].guard && ring[0].guard.rescue === 'stream-overlength'), ring[0] && ring[0].guard);
  const L = JSON.parse(r.w.__store['v292Dfix643_log'] || '[]');
  ok('A10e fix643 の記録は regen-hard', L.length && L[L.length - 1].outcome === 'regen-hard', L[L.length - 1]);
}
{
  /* 実弾: 1回目が暴走 → 救済が正常 → 採用される（救済経路が生きている） */
  const r = await chain([HUGE_NORMAL, NORMAL_LONG], liveStore());
  ok('A9b 暴走 → 救済成功ならターンは確定する', r.S.turns.length === 4 && r.S.saved === 1,
     { t: r.S.turns.length, s: r.S.saved });
  ok('A9c 採用された本文は1文字も加工されない', r.S.turns[3].narrative === NORMAL_LONG);
  ok('A9d 呼び出しは2回', r.tr.apiCalls.length === 2);
  const ring = ringOf(r.w);
  ok('A9e ring の verdict は adopt', ring.length === 1 && ring[0].verdict === 'adopt', ring[0] && ring[0].verdict);
}
{
  /* A13 既定（フラグ無し端末） */
  const r = await chain([HUGE_NORMAL], {});
  ok('A13 既定(shadow)では中断しない＝ターンは従来どおり確定する',
     r.tr.apiCalls.length === 1 && r.S.turns.length === 4 && r.S.saved === 1,
     { c: r.tr.apiCalls.length, t: r.S.turns.length });
  ok('A13b 本文は1文字も変わらない', r.S.turns[3].narrative === HUGE_NORMAL);
  ok('A13c shadow でも記録は残る（後で分布を集計するため）',
     (JSON.parse(r.w.__store['v292Dfix651StreamLog'] || '[]')[0] || {}).outcome === 'observed');
  ok('A13d shadow の記録に本文は入っていない',
     (r.w.__store['v292Dfix651StreamLog'] || '').indexOf(HUGE_NORMAL.slice(0, 40)) < 0);
  ok('A13e fix650 の ring は1バイトも書かない（shadow）', r.w.__store['v292Dfix650Ring'] === undefined);
  const c = JSON.parse(r.w.__store['v292Dfix651Stats'] || '{}');
  ok('A13f 軽量カウンタに長さと finish_reason の分布が溜まる',
     c.n === 1 && c.len && c.len['12k+'] === 1 && c.finish && c.finish.unknown === 1, c);
}
{
  /* A12 OFF は「fix651 が無い時」と完全一致 */
  const off = await chain([HUGE_NORMAL, HUGE_NORMAL], liveStore({ v292Dfix651StreamGuardOff: '1' }));
  const none = await chain([HUGE_NORMAL, HUGE_NORMAL], liveStore(), { withGuard: false });
  ok('A12 OFF: ターンは確定する（旧挙動）', off.S.turns.length === 4 && off.S.saved === 1,
     { t: off.S.turns.length, s: off.S.saved });
  ok('A12b OFF と「fix651 未ロード」で呼び出し回数が一致',
     off.tr.apiCalls.length === none.tr.apiCalls.length, [off.tr.apiCalls.length, none.tr.apiCalls.length]);
  ok('A12c OFF と「fix651 未ロード」でターン数・保存回数が一致',
     off.S.turns.length === none.S.turns.length && off.S.saved === none.S.saved);
  ok('A12d OFF では fix651 が記録用のキーを1バイトも書かない',
     Object.keys(off.w.__store).filter(k => k.indexOf('v292Dfix651') === 0 &&
                                            k !== 'v292Dfix651StreamGuardOff').length === 0,
     Object.keys(off.w.__store));
}
{
  /* 反復型（Court様）も通しで止まること */
  const r = await chain([COURT, COURT], liveStore());
  ok('A10f 大量反復でも二重中断でターン不成立', r.S.turns.length === 3 && r.S.saved === 0);
  const ring = ringOf(r.w);
  ok('A10g ring の理由は stream-degenerate', ring[0] && ring[0].reason === 'stream-degenerate', ring[0] && ring[0].reason);
}

/* =====================================================================
   [B] 物語切替による控え汚染（fix228）
   ===================================================================== */
console.log('\n== [B] 物語切替で控えが混ざらない（fix228） ==');
function mkSlotWin(store, key){
  const w = mkWin({ store: store });
  let cur = key;
  const calls = { key: 0 };
  w.__chr6Key = () => { calls.key++; return (typeof cur === 'function') ? cur(calls.key) : cur; };
  w.__setKey = k => { cur = k; };
  w.__keyCalls = calls;
  const ticks = [];
  w.setInterval = (fn) => { ticks.push(fn); return 0; };
  const ctx = vm.createContext(w);
  vm.runInContext(SRC228, ctx, { filename: 'v292Dfix228-slot-generations.js' });
  w.__tick = () => { ticks.forEach(f => f()); };
  return w;
}
const storyOf = (n, tag) => JSON.stringify({ turns: new Array(n).fill(0).map((_, i) => ({ i: i, tag: tag })), mode: 'DO' });
const KA = 'chr6_slot_A', KB = 'chr6_slot_B';
function gens(w, k){ try { return JSON.parse(w.__store['__gen_' + k] || '[]'); } catch(e){ return []; } }

{
  /* B1 同じ物語の正当な変更は従来どおり退避する */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A') }, KA);
  w.__tick();                                   /* 1回目: キー捕捉 */
  w.__tick();                                   /* 2回目: 基準取り */
  w.__store[KA] = storyOf(6, 'A');
  w.__tick();                                   /* 3回目: 変化を検知して退避 */
  const g = gens(w, KA);
  ok('B1 同一物語の正当な変更は退避される', g.length === 1 && g[0].turns === 5, g);
  ok('B1b 退避された中身は同じ物語のもの', g[0].data.indexOf('"tag":"A"') > 0);
}
{
  /* B2 / B3 A→B 切替 */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A'), [KB]: storyOf(20, 'B') }, KA);
  w.__tick(); w.__tick();                       /* A で基準が立つ */
  w.__setKey(KB);
  w.__tick();                                   /* ★切替 tick */
  ok('B2 切替 tick では1件も退避しない',
     gens(w, KB).length === 0 && gens(w, KA).length === 0,
     { b: gens(w, KB).length, a: gens(w, KA).length });
  w.__tick();                                   /* B で基準が立つ */
  w.__store[KB] = storyOf(21, 'B');
  w.__tick();
  const g = gens(w, KB);
  ok('B3 B の世代には B の値だけが入る', g.length === 1 && g[0].turns === 20, g.map(x => x.turns));
  ok('B3b ★A の値が B の世代へ混ざっていない', g[0].data.indexOf('"tag":"A"') < 0, g[0].data.slice(0, 60));
}
{
  /* B3 逆方向 B→A */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A'), [KB]: storyOf(20, 'B') }, KB);
  w.__tick(); w.__tick();
  w.__setKey(KA);
  w.__tick(); w.__tick();
  w.__store[KA] = storyOf(6, 'A');
  w.__tick();
  const g = gens(w, KA);
  ok('B3c 逆方向（B→A）でも A の世代に B の値は入らない',
     g.length === 1 && g[0].turns === 5 && g[0].data.indexOf('"tag":"B"') < 0, g.map(x => x.turns));
}
{
  /* B4 切替直後の一時的な空値 */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A') }, KA);
  w.__tick(); w.__tick();
  w.__setKey(KB);                               /* B のデータはまだ無い */
  w.__tick();
  ok('B4 切替直後にデータが無くても退避しない', gens(w, KB).length === 0 && gens(w, KA).length === 0);
  w.__store[KB] = storyOf(20, 'B');
  w.__tick(); w.__tick();
  ok('B4b その後 B のデータが現れても、旧物語の値は退避されない',
     gens(w, KB).length === 0, gens(w, KB));
}
{
  /* B5 退避の直前にキーが変わっていたら中止 */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A') }, KA);
  w.__tick(); w.__tick();
  w.__store[KA] = storyOf(6, 'A');
  const base = w.__keyCalls.key;
  w.__setKey(n => (n === base + 1 ? KA : KB));   /* tick の途中でキーが動く */
  w.__tick();
  ok('B5 退避の直前でキーが変わっていたら退避しない',
     gens(w, KA).length === 0 && gens(w, KB).length === 0,
     { a: gens(w, KA).length, b: gens(w, KB).length });
}
{
  /* B6 OFF は旧挙動（＝汚染が再現する） */
  const w = mkSlotWin({ [KA]: storyOf(5, 'A'), [KB]: storyOf(20, 'B'), v292Dfix651SlotBackupGuardOff: '1' }, KA);
  w.__tick();                                   /* 旧挙動では1tick目で基準が立つ */
  w.__setKey(KB);
  w.__tick();
  const g = gens(w, KB);
  ok('B6 OFF では旧 fix228 の挙動（切替 tick で退避してしまう）に戻る', g.length === 1, g.length);
  ok('B6b OFF ではその中身が別物語（＝これが直した欠陥）',
     g.length === 1 && g[0].data.indexOf('"tag":"A"') > 0);
}
{
  /* 指紋が付いていれば、それも見る（無ければ推測しない） */
  const withFp = JSON.stringify({ slotId: 'A', turns: [{}, {}, {}] });
  const w = mkSlotWin({ [KA]: withFp }, KA);
  w.__tick(); w.__tick();
  w.__store[KA] = JSON.stringify({ slotId: 'A', turns: [{}, {}, {}, {}] });
  w.__tick();
  ok('B7 指紋が現在の物語と一致していれば従来どおり退避する', gens(w, KA).length === 1, gens(w, KA).length);
}
{
  const w = mkSlotWin({ [KA]: JSON.stringify({ slotId: 'B', turns: [{}, {}, {}] }) }, KA);
  w.__tick(); w.__tick();
  w.__store[KA] = JSON.stringify({ slotId: 'B', turns: [{}, {}, {}, {}] });
  w.__tick();
  ok('B7b 指紋が現在の物語と食い違うなら退避を中止する', gens(w, KA).length === 0, gens(w, KA).length);
}
{
  const w = mkSlotWin({ [KA]: storyOf(5, 'A') }, KA);
  w.__tick(); w.__tick();
  w.__store[KA] = storyOf(6, 'A');
  w.__tick();
  ok('B8 2秒間隔の tick 頻度は変えていない（setInterval の引数）',
     /setInterval\(tick,\s*2000\)/.test(SRC228));
}

/* =====================================================================
   [C] 0ターン上書きの非常ブレーキ + 書込トレース
   ===================================================================== */
console.log('\n== [C] 0ターン上書きの非常ブレーキ ==');
const T51 = JSON.stringify({ turns: new Array(51).fill(0).map(() => ({ n: '本文はトレースに残さない' })), mode: 'DO' });
const T0  = JSON.stringify({ turns: [], mode: 'DO' });
const T52 = JSON.stringify({ turns: new Array(52).fill(0).map(() => ({ n: 'x' })), mode: 'DO' });
function traceOf(w){ try { return JSON.parse(w.__store['v292Dfix651Trace'] || '[]'); } catch(e){ return []; } }

{
  const w = guardOnly({ [SLOTKEY]: T51 });
  let threw = null, ret = 'x';
  try { ret = w.__ls.setItem(SLOTKEY, T0); } catch(e){ threw = e; }
  ok('C1 51T→0T の書込は拒否される（値が変わらない）', w.__store[SLOTKEY] === T51);
  ok('C1b 例外は投げない（保存失敗UXを誤発火させない）', threw === null, threw && threw.message);
  ok('C1c 戻り値は undefined のまま', ret === undefined);
  const t = traceOf(w);
  ok('C1d トレースに拒否が残る', t.length === 1 && t[0].blocked === true && t[0].reason === 'zero-turn-overwrite', t[0]);
  ok('C1e トレースに新旧のターン数とバイト数が残る',
     t[0].oldTurns === 51 && t[0].newTurns === 0 && t[0].oldBytes === T51.length && t[0].newBytes === T0.length, t[0]);
  ok('C1f トレースに本文は残らない', JSON.stringify(t).indexOf('本文はトレースに残さない') < 0);
  ok('C1g 集計に専用カウンタが出る', w.__v292Dfix651.traceStats().zeroTurnOverwrites === 1);
}
{
  const w = guardOnly({});
  w.__ls.setItem(SLOTKEY, T0);
  ok('C2 既存が無いスロットへの 0T 作成は許可', w.__store[SLOTKEY] === T0);
  const t = traceOf(w);
  ok('C2b 許可された書込もトレースには残る', t.length === 1 && t[0].blocked === false && t[0].oldTurns === -1, t[0]);
}
{
  const w = guardOnly({ [SLOTKEY]: T51 });
  w.__ls.setItem(SLOTKEY, T52);
  ok('C2c 通常の増加（51T→52T）は当然通る', w.__store[SLOTKEY] === T52);
}
{
  const w = guardOnly({ [SLOTKEY]: T51 });
  w.__v292Dfix651.allowOnce('resetStory');
  w.__ls.setItem(SLOTKEY, T0);
  ok('C3 明示的なリセット（allowOnce）は許可', w.__store[SLOTKEY] === T0);
  ok('C3b 理由がトレースに残る', (traceOf(w)[0] || {}).reason === 'zero-turn-allowed:resetStory', traceOf(w)[0]);
  /* 使い切りであること */
  w.__store[SLOTKEY] = T51;
  w.__ls.setItem(SLOTKEY, T0);
  ok('C3c ★1回きり（同じ許可が次の書込へ効き続けない）', w.__store[SLOTKEY] === T51);
}
{
  const w = guardOnly({ [SLOTKEY]: T51 });
  w.__v292Dfix651.allow('delete-story', () => { w.__ls.setItem(SLOTKEY, T0); });
  ok('C3d 明示的な削除（allow でくくる）は許可', w.__store[SLOTKEY] === T0);
  w.__store[SLOTKEY] = T51;
  w.__ls.setItem(SLOTKEY, T0);
  ok('C3e allow を抜けたら元どおり拒否する', w.__store[SLOTKEY] === T51);
}
{
  /* C4 正規経路の正本ファイルからの書込 */
  const w = guardOnly({ [SLOTKEY]: T51 });
  const ctx = vm.createContext(w);
  vm.runInContext('window.__legit = function(k, v){ window.localStorage.setItem(k, v); };',
                  ctx, { filename: 'v292Dfix587-story-lifecycle.js' });
  w.__legit(SLOTKEY, T0);
  ok('C4 fix587(物語の作成・削除の正本)からの 0T 書込は許可', w.__store[SLOTKEY] === T0);
  ok('C4b 理由が残る', (traceOf(w)[0] || {}).reason === 'zero-turn-allowed:v292Dfix587-story-lifecycle', traceOf(w)[0]);
}
{
  const w = guardOnly({ [SLOTKEY]: T51 });
  const ctx = vm.createContext(w);
  vm.runInContext('window.__pull = function(k, v){ window.localStorage.setItem(k, v); };',
                  ctx, { filename: 'v292Dfix399-cloudsync.js' });
  w.__pull(SLOTKEY, T0);
  ok('C4c ★同期(fix399)からの 0T 上書きは正規経路ではない＝拒否する', w.__store[SLOTKEY] === T51);
  ok('C4d 書いた側が推定できている', (traceOf(w)[0] || {}).writer === 'fix399', traceOf(w)[0]);
}
{
  /* C5 ?new=1 の初期化 */
  const w = guardOnly({ 'chr6_slot_newone': T51 }, '?story=newone&new=1');
  w.__ls.setItem('chr6_slot_newone', T0);
  ok('C5 ?new=1&story=<id> の初期化は許可', w.__store['chr6_slot_newone'] === T0);
  const w2 = guardOnly({ [SLOTKEY]: T51 }, '?story=newone&new=1');
  w2.__ls.setItem(SLOTKEY, T0);
  ok('C5b ★別の物語までは許可しない', w2.__store[SLOTKEY] === T51);
}
{
  /* C6 OFF */
  const w = guardOnly({ [SLOTKEY]: T51, v292Dfix651ZeroTurnGuardOff: '1' });
  w.__ls.setItem(SLOTKEY, T0);
  ok('C6 OFF では拒否しない', w.__store[SLOTKEY] === T0);
  ok('C6b OFF でもトレースは残る（調査は続けられる）',
     (traceOf(w)[0] || {}).reason === 'zero-turn-overwrite(guard-off)', traceOf(w)[0]);
}
{
  /* C7 リング・対象キー */
  const w = guardOnly({});
  for (let i = 0; i < 40; i++) w.__ls.setItem('chr6_slot_s' + i, T52);
  ok('C7 トレースは直近30件だけ', traceOf(w).length === 30, traceOf(w).length);
  ok('C7b リングは数KB以内', (w.__store['v292Dfix651Trace'] || '').length < 8192,
     (w.__store['v292Dfix651Trace'] || '').length);
  const before = Object.keys(w.__store).length;
  w.__ls.setItem('chr6_slots_meta', '[]');
  w.__ls.setItem('chr6_active_slot', '"x"');
  w.__ls.setItem('v292Dfix77States', '{}');
  ok('C7c スロット以外のキーは素通し（トレースもしない）', traceOf(w).length === 30);
  ok('C7d 素通しの値はそのまま書かれる',
     w.__store['chr6_slots_meta'] === '[]' && w.__store['v292Dfix77States'] === '{}');
  ok('C7e 既定スロット chr6 も守る', (() => {
    const x = guardOnly({ chr6: T51 });
    x.__ls.setItem('chr6', T0);
    return x.__store.chr6 === T51;
  })());
  void before;
}
{
  /* C8 他fixの印を消さない */
  const w = mkWin({ store: {} });
  const prev = w.localStorage.setItem;
  const marked = function(k, v){ return prev.call(w.localStorage, k, v); };
  marked.__f490 = true; marked.__f543 = true;
  w.localStorage.setItem = marked;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC651, ctx, { filename: 'v292Dfix651-guards.js' });
  ok('C8 先に居たラッパの印を引き継ぐ',
     w.localStorage.setItem.__f490 === true && w.localStorage.setItem.__f543 === true);
  ok('C8b 自分の印も付ける', w.localStorage.setItem.__f651 === true);
  ok('C8c 二重には包まない', (() => {
    const n = w.localStorage.setItem;
    w.__v292Dfix651._install();
    return w.localStorage.setItem === n;
  })());
}
{
  /* 読めない値・スロットでない中身は判定しない（推測しない） */
  const w = guardOnly({ [SLOTKEY]: T51 });
  w.__ls.setItem(SLOTKEY, 'これはJSONではない');
  ok('C9 物語オブジェクトとして読めない値は 0T 判定の対象にしない', w.__store[SLOTKEY] === 'これはJSONではない');
  const w2 = guardOnly({ [SLOTKEY]: T51 });
  w2.__ls.setItem(SLOTKEY, JSON.stringify({ cfg: {} }));
  ok('C9b turns を持たない値も 0T とは呼ばない', w2.__store[SLOTKEY] === JSON.stringify({ cfg: {} }));
}

/* =====================================================================
   [Z] 冪等・OFF・配線・出荷の体裁
   ===================================================================== */
console.log('\n== [Z] 冪等・配線・出荷 ==');
{
  const w = guardOnly({});
  const first = w.__v292Dfix651;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC651, ctx, { filename: 'v292Dfix651-guards.js' });
  ok('Z1 二重読込しても入れ替わらない（冪等）', w.__v292Dfix651 === first);
}
{
  const w = guardOnly({ v292Dfix651StreamGuardOff: '1', v292Dfix651ZeroTurnGuardOff: '1',
                        v292Dfix651SlotBackupGuardOff: '1' });
  const g = w.__v292Dfix651;
  ok('Z2 3つの OFF スイッチが独立して読める',
     g.isStreamGuardOff() === true && g.isZeroTurnGuardOff() === true && g.isSlotBackupGuardOff() === true);
}
ok('Z3 A の OFF キー名', /v292Dfix651StreamGuardOff/.test(SRC651));
ok('Z3b B の OFF キー名（fix228 の中）', /v292Dfix651SlotBackupGuardOff/.test(SRC228));
ok('Z3c C の OFF キー名', /v292Dfix651ZeroTurnGuardOff/.test(SRC651));
ok('Z4 script タグが index.html に在る（fix650 より後）', (() => {
  const i = HTMLU.indexOf('v292Dfix650-rescue-safety.js');
  const j = HTMLU.indexOf('v292Dfix651-guards.js');
  return i > 0 && j > i;
})());
ok('Z4b ?cb= が付いている', /v292Dfix651-guards\.js\?cb=[A-Za-z0-9]+/.test(HTMLU));
ok('Z5 index.html の NUL は1個のまま',
   Buffer.from(HTML, 'latin1').filter(b => b === 0).length === 1);
ok('Z5b index.html に CRLF は無い', HTMLU.indexOf('\r\n') < 0);
ok('Z5c 新モジュールに NUL は無い',
   fs.readFileSync(path.join(__dirname, 'v292Dfix651-guards.js')).filter(b => b === 0).length === 0);
ok('Z6 ★BUILT と version.txt が同値', (() => {
  const b = (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1];
  return !!b && b === read('version.txt').trim();
})());
ok('Z6b ★HOME_BUILT も同値', (() => {
  const b = (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1];
  return !!b && b === read('version.txt').trim();
})());
const TOKEN = (read('version.txt').trim().match(/-(fix\w+)$/) || [])[1];
[['v292Dfix651-guards.js', '新モジュール'],
 ['v292Dfix643-collapse-rescue.js', '中身を変えた fix643'],
 ['v292Dfix650-rescue-safety.js', '中身を変えた fix650'],
 ['v292Dfix228-slot-generations.js', '中身を変えた fix228']].forEach(([f, label]) => {
  ok('Z7 ' + label + ' の cb が今の fix札と一致', (() => {
    const cb = (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=v292D(\\w+)')) || [])[1];
    return !!TOKEN && cb === TOKEN;
  })(), (HTMLU.match(new RegExp(f.replace(/[.\\]/g, '\\$&') + '\\?cb=[^"]*')) || [])[0]);
});
ok('Z7b home.html の全モジュールの cb も今の fix札', (() => {
  const tags = HOME.match(/src="[^"]+\?cb=([^"]+)"/g) || [];
  return tags.length > 0 && tags.every(t => t.indexOf('cb=v292D' + TOKEN) > 0);
})(), (HOME.match(/src="[^"]+\?cb=([^"]+)"/g) || []).slice(0, 3));
ok('Z8 resetStory が正規経路としてバイパスを立てている（0T保存の直前）', (() => {
  const i = HTMLU.indexOf('resetStory() {');
  const j = HTMLU.indexOf('S.save();', i);
  return i > 0 && j > i && HTMLU.slice(i, j).indexOf("__v292Dfix651.allowOnce('resetStory')") > 0;
})());
ok('Z9 fix643 が受信直後・パースの前に監視をかけている', (() => {
  const a = SRC643.indexOf("applyGuard(v, result, isLive, seq, 'first')");
  const b = SRC643.indexOf('var v = judgeRaw(result.text, st);');
  return a > 0 && b > 0 && a > b;
})());
ok('Z9b fix643 が救済側にも同じ監視をかけている',
   SRC643.indexOf("applyGuard(v2, result2, isLive, seq, 'rescue')") > 0);
ok('Z9c fix650 が遮断理由を ring の reason に残す',
   /v2 && v2\.guard/.test(SRC650) && /reason = String\(v2\.guard\)/.test(SRC650));
ok('Z10 sys 注入は増やしていない（fix651 は sys を触らない）',
   SRC651.indexOf('Planner') < 0 && SRC651.indexOf('_extensions') < 0);
ok('Z10b S / G / Api を window から読もうとしていない',
   SRC651.indexOf('window.S') < 0 && SRC651.indexOf('window.Api') < 0 && SRC651.indexOf('window.G') < 0);

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
})();
