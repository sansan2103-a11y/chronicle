/* 回帰テスト: v292Dfix643 — 崩壊ターンの救済生成（既定 shadow）
 *
 * ★実チェーン: 配信する fix624（判定器）と fix643（救済層）の**両方をそのまま**
 *   モックwindow上で走らせ、Api.call → 判定 → 救済生成 → ターン確定/不成立 まで通しで見る。
 *   判定器だけを切り出して試さない。
 *
 * ★G.submit は index.html の本物を実行できない（UI/DOM/Planner/PsychEngine 全部に依存する）ので、
 *   **同じ順序の代役**を置く。その順序が本物と一致していることは (0) で index.html のソースに対して
 *   直接固定する。ここがズレたらテストは意味を失うので、(0) は必ず一緒に読むこと。
 *
 * このテストが固定する契約（GPT裁定・緩めない）:
 *   (0) 配線位置 … Api.call の戻り値は parsePlan / S.turns.push / S.save / 表示 より前にある
 *   (1) 既定は shadow … hard でも挙動を変えない（再生成しない・ターンは確定する）
 *   (2) live で hard → 救済生成は **1回だけ**。直れば採用する
 *   (3) live で2回とも hard → ターン不成立。①ターン数が増えない ②入力欄が空にならない
 *       ③却下した試行で状態(fix77/fix190/longmem 相当)を更新しない ④保存しない＝クラウドへ出ない
 *   (4) 誤検出の逃げ道 … 「最初の文章を確認する」で通信せずに最初の候補を採用する
 *   (5) ボタン連打で並列生成しない
 *   (6) ページ復帰（読み込み直後）で勝手に再生成しない
 *   (7) 救済プロンプトに**壊れた本文を渡さない**（異常コードだけ）
 *   (8) 記録は score と hits のコードだけ。本文を localStorage へ書かない
 *   (9) OFF / 冪等 / 公開API / index.html 配線
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC624 = read('v292Dfix624-degeneration-probe.js');
const SRC643 = read('v292Dfix643-collapse-rescue.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

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
function buttons(root){
  const out = [];
  (function walk(n){ if (!n) return; if (n.tagName === 'button') out.push(n); (n.children || []).forEach(walk); })(root);
  return out;
}
function clickBtn(w, label){
  const b = buttons(w.document.body).filter(x => x.textContent === label)[0];
  if (!b) throw new Error('ボタンが無い: ' + label);
  b.click();
  return b;
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

/* ---------------- モック Api / G ----------------
   ★index.html G.submit の順序をそのまま写した代役。順序の一致は (0) で固定する。 */
function wire(w, S, responses){
  const trace = { apiCalls: [], parsePlan: 0, psych: 0, appendTurn: 0, saves: 0, status: [] };
  const queue = responses.slice();

  w.Api = {
    async call(system, userContent, maxTok, opts){
      trace.apiCalls.push({ system: system, user: userContent, maxTok: maxTok, argc: arguments.length });
      const r = queue.length ? queue.shift() : null;
      return r === null ? null : { text: r };
    }
  };
  const Planner = { build: (mode, text) => ({ sys: 'SYS', user: 'USER:' + text }),
                    parsePlan: (raw) => { trace.parsePlan++; return { narrative: [String(raw)] }; } };
  const PsychEngine = { process(){ trace.psych++; } };
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
        /* ★index.html:1809 fix263a2 と同じ: falsy なら入力を戻して return（ターン不成立） */
        if (!result){
          if (text && !String(inputEl.value || '').trim()) inputEl.value = text;
          UI.setStatus('応答が得られませんでした。もう一度お試しください', true);
          return;
        }
        const plan = Planner.parsePlan(result.text, S.mode);
        PsychEngine.process(plan);                       /* fix77/fix190/longmem 更新の代理 */
        const turn = { inputType: S.mode, playerText: text, narrative: plan.narrative.join('\n'),
                       plan: plan, _convSays: [] };
        S.turns.push(turn);
        S.save();
        UI.appendTurn(turn, S.turns.length - 1);
      } finally { S.inFlight = false; }
    }
  };
  /* 本番では Api/G が出来てから fix643 が取り付く（install の再試行）。同じ順序を再現する。 */
  try { w.__v292Dfix643._install(); } catch(e){}
  return trace;
}
function mkS(turns){
  const s = { mode: 'DO', inFlight: false, cast: { hero: { name: '' }, npcs: [] },
              turns: turns || [], saved: 0, cfg: {} };
  s.save = function(){ s.saved++; };
  return s;
}
function boot(w, S){
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(SRC624, ctx, { filename: 'fix624' });
  vm.runInContext(SRC643, ctx, { filename: 'fix643' });
  return ctx;
}
/* fix624 の実データ由来の見本を、生の応答文字列として使う */
function fixtures(w){ return w.__v292Dfix624._fixtures; }
const say3 = '<say who="a">「あ」</say>\n<say who="b">「い」</say>\n<say who="c">「う」</say>';
function taggedHistory(n){
  const out = [];
  for (let i = 0; i < n; i++) out.push({ plan: { narrative: [say3] }, narrative: '', _convSays: [1, 2, 3] });
  return out;
}
function logOf(w){ try { return JSON.parse(w.__store['v292Dfix643_log'] || '[]'); } catch(e){ return []; } }

/* =====================================================================
   (0) 配線位置の根拠 — index.html の実物に対して固定する
   ===================================================================== */
console.log('\n== (0) 配線位置の根拠（index.html の実際の順序） ==');
{
  const iCall   = HTMLU.indexOf('result = await Api.call(sys, user)');
  const iGuard  = HTMLU.indexOf('if (!result) {');
  const iParse  = HTMLU.indexOf('let plan = Planner.parsePlan(result.text');
  const iPsych  = HTMLU.indexOf('PsychEngine.process(plan)');
  const iPush   = HTMLU.indexOf('S.turns.push(turn)');
  const iSave   = HTMLU.indexOf('S.save();\n      UI.appendTurn(turn');
  ok('★本編は Api.call(sys, user) で呼ばれている', iCall > 0);
  ok('★Api.call が falsy を返したときの早期 return がある（fix263a2）', iGuard > 0);
  ok('★★その早期 return は Planner.parsePlan より前にある', iGuard > 0 && iParse > iGuard, { iGuard, iParse });
  ok('★★早期 return は PsychEngine.process より前（却下した試行で状態を更新しない）',
     iPsych > iGuard, { iGuard, iPsych });
  ok('★★早期 return は S.turns.push より前（ターン数が増えない）', iPush > iGuard, { iGuard, iPush });
  ok('★★早期 return は S.save より前（保存＝クラウドpushに出ない）', iSave > iGuard, { iGuard, iSave });
  ok('★早期 return は入力欄へ本文を戻す', /if \(!result\) \{[^\n]*inputEl\.value = text/.test(HTMLU));
  ok('★S.turns.push → S.save → UI.appendTurn の順', iPush < iSave);

  /* どの Api.call が本編かの見分け（maxTok を渡さない呼び出しだけが本編） */
  /* 本編3（初回 / 429・5xx の透過リトライ / fix216-235 の書き直し）＋ 補助2（会話ログ・帰属照会） */
  const calls = (HTMLU.match(/Api\.call\(/g) || []).length;
  ok('★index.html の Api.call は5箇所', calls === 5, calls);
  ok('★本編は maxTok を渡さない呼び出し3つ',
     (HTMLU.match(/Api\.call\(sys, user[)\s+]/g) || []).length === 3,
     (HTMLU.match(/Api\.call\(sys, user[)\s+]/g) || []));
  ok('★genConvLog は maxTok を渡す（本編と区別できる）', HTMLU.indexOf('Api.call(sys2, user2, 500') > 0);
  ok('★attribQuotes218 も maxTok を渡す', HTMLU.indexOf('Api.call(sys2, user2, 400') > 0);
  ok('★fix643 は maxTok 無しの呼び出しだけを対象にする',
     /args\.length <= 2 \|\| args\[2\] === undefined/.test(SRC643));
}

/* 非同期のシナリオはまとめて順に流す */
(async function run(){

  /* ---- (1) shadow ---- */
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin(); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('★shadow: 崩壊していても再生成しない（API呼出は1回）', tr.apiCalls.length === 1, tr.apiCalls.length);
    ok('★shadow: ターンは確定する', S.turns.length === 4, S.turns.length);
    ok('★shadow: 保存も表示も通る', S.saved === 1 && tr.appendTurn === 1);
    const L = logOf(w);
    ok('★shadow: 記録は残る', L.length === 1, L);
    ok('★shadow: mode=shadow / outcome=hard-observed',
       L[0].mode === 'shadow' && L[0].outcome === 'hard-observed', L[0]);
    ok('★shadow: score と hits のコードが入る',
       L[0].score >= 7 && L[0].hits.indexOf('repetition-loop') >= 0, L[0]);
    ok('★shadow: 入る予定のターン番号が入る', L[0].turnIndex === 3, L[0]);
    ok('★shadow: 本文は1文字も保存しない',
       JSON.stringify(L).indexOf('いっぱい') < 0 && JSON.stringify(L).length < 600, JSON.stringify(L).length);
    ok('★shadow: バナーを出さない', !w.document.getElementById('v643banner'));
  }
  {
    /* 正常なターンは pass として記録され、何も起きない */
    const S = mkS(taggedHistory(3));
    const w = mkWin(); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.normalA]);
    w.__inp.value = '話しかける';
    await w.G.submit();
    const L = logOf(w);
    ok('★正常ターンは outcome=pass', L.length === 1 && L[0].outcome === 'pass', L);
    ok('★正常ターンは再生成しない', tr.apiCalls.length === 1);
    ok('★正常ターンは確定する', S.turns.length === 4);
  }
  {
    /* GPT の反証文（意識の流れ）を hard にしない＝偽陽性を固定する */
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.streamOfConsciousness]);
    w.__inp.value = 'ぼんやりする';
    await w.G.submit();
    ok('★意図的な文体（意識の流れ）を hard にしない', tr.apiCalls.length === 1, tr.apiCalls.length);
    ok('★ターンは確定する', S.turns.length === 4);
  }

  /* ---- (2) live: 救済して直る ---- */
  console.log('\n== (2) live: hard → 救済生成は1回だけ / 直れば採用 ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.normalA]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('★救済生成は1回だけ（API呼出は2回）', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★直った方の本文がターンになる', S.turns.length === 4 && S.turns[3].narrative === F.normalA,
       S.turns.length);
    ok('★保存も表示も通る', S.saved === 1 && tr.appendTurn === 1);
    const L = logOf(w);
    ok('★outcome=regen-ok / mode=live',
       L.length === 1 && L[0].outcome === 'regen-ok' && L[0].mode === 'live', L);

    /* (7) 救済プロンプトの中身 */
    const u2 = tr.apiCalls[1].user;
    ok('★救済は sys ではなく user の末尾へ足す（sys注入経路を壊さない）',
       tr.apiCalls[1].system === tr.apiCalls[0].system && u2.indexOf(tr.apiCalls[0].user) === 0, u2.slice(0, 40));
    ok('★★壊れた本文をモデルへ渡さない', u2.indexOf('いっぱいいっぱい') < 0 && u2.indexOf(F.repLoop.slice(0, 20)) < 0, u2);
    ok('★異常コードだけを渡す', u2.indexOf('repetition-loop') >= 0, u2);
    ok('★救済であることが分かる指示になっている', u2.indexOf('【重要・書き直し】') >= 0);
  }
  {
    /* 語調崩壊型（B型）も捕まえる。★実物と同じ「台詞が続いていた物語」を分母にする */
    const S = mkS(taggedHistory(4));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.registerCollapse, F.normalB]);
    w.__inp.value = '書類を見る';
    await w.G.submit();
    ok('★語調崩壊型でも救済が走る', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★異常コードに register-collapse が入る',
       tr.apiCalls[1].user.indexOf('register-collapse') >= 0, tr.apiCalls[1].user);
  }

  /* ---- (3) live: 2回とも hard → ターン不成立 ---- */
  console.log('\n== (3) live: 2回とも hard → ターン不成立で停止 ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.repLoop, F.normalA]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('★★自動の3回目は無い（API呼出は2回で止まる）', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★★①ターン数が増えない', S.turns.length === 3, S.turns.length);
    ok('★★②入力欄が空にならない', w.__inp.value === '扉を開ける', w.__inp.value);
    ok('★★③却下した試行で状態を更新しない（parsePlan も PsychEngine も走らない）',
       tr.parsePlan === 0 && tr.psych === 0, tr);
    ok('★★④保存しない＝クラウドpushに出ない', S.saved === 0, S.saved);
    ok('★表示もしない', tr.appendTurn === 0);
    const L = logOf(w);
    ok('★outcome=regen-hard', L.length === 1 && L[0].outcome === 'regen-hard', L);
    ok('★案内バナーが出る', !!w.document.getElementById('v643banner'));
    const labels = buttons(w.document.body).map(b => b.textContent);
    ok('★操作は3つ', labels.length === 3, labels);
    ok('★「もう一度試す」がある', labels.indexOf('もう一度試す') >= 0, labels);
    ok('★「入力を直す」がある', labels.indexOf('入力を直す') >= 0, labels);
    ok('★「最初の文章を確認する」がある（誤検出の逃げ道）', labels.indexOf('最初の文章を確認する') >= 0, labels);
    ok('★hard候補は localStorage へ保存していない（メモリだけ）',
       JSON.stringify(w.__store).indexOf('いっぱいいっぱい') < 0);

    /* 「もう一度試す」= ユーザー起点の新規生成 */
    clickBtn(w, 'もう一度試す');
    await new Promise(r => setImmediate(r));
    ok('★「もう一度試す」で新しく生成する（3回目のAPI呼出はここで初めて起きる）',
       tr.apiCalls.length === 3, tr.apiCalls.length);
    ok('★直ればターンが確定する', S.turns.length === 4, S.turns.length);
    ok('★バナーは消える', !w.document.getElementById('v643banner'));
  }
  {
    /* 「入力を直す」は生成しない */
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.repLoop]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    clickBtn(w, '入力を直す');
    await new Promise(r => setImmediate(r));
    ok('★「入力を直す」は生成しない', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★入力は残っている', w.__inp.value === '扉を開ける');
    ok('★入力欄へフォーカスする', w.__inp._focused === true);
    ok('★ターンは増えない', S.turns.length === 3);
  }

  /* ---- (4) 誤検出の逃げ道 ---- */
  console.log('\n== (4) 「最初の文章を確認する」= 誤検出の逃げ道 ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.repLoop]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('前提: ターンは不成立', S.turns.length === 3 && tr.apiCalls.length === 2);
    clickBtn(w, '最初の文章を確認する');
    await new Promise(r => setImmediate(r));
    ok('★★通信しない（API呼出は増えない）', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★★保持していた最初の候補がそのまま採用される',
       S.turns.length === 4 && S.turns[3].narrative === F.repLoop, S.turns.length);
    ok('★保存も表示も通る（普通のターンとして確定する）', S.saved === 1 && tr.appendTurn === 1);
    ok('★プレイヤー入力が復元されている', S.turns[3].playerText === '扉を開ける', S.turns[3].playerText);
    const L = logOf(w);
    ok('★outcome=user-accepted として記録する',
       L.length === 2 && L[1].outcome === 'user-accepted', L);
    ok('★user-accepted-hard-candidate と分かる注記が残る',
       L[1].note === 'user-accepted-hard-candidate', L[1]);
    ok('★バナーは消える', !w.document.getElementById('v643banner'));
  }

  /* ---- (5) 連打ガード ---- */
  console.log('\n== (5) ボタン連打で並列生成しない ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.repLoop, F.normalA, F.normalA, F.normalA]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    const b = buttons(w.document.body).filter(x => x.textContent === 'もう一度試す')[0];
    b.click(); b.click(); b.click();              /* 3連打 */
    await new Promise(r => setImmediate(r));
    ok('★★連打しても生成は1本だけ', tr.apiCalls.length === 3, tr.apiCalls.length);
    ok('★ターンも1つだけ増える', S.turns.length === 4, S.turns.length);
  }

  /* ---- (6) ページ復帰 ---- */
  console.log('\n== (6) ページ復帰で勝手に再生成しない ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1',
                               v292Dfix643_log: JSON.stringify([{ ts: 'x', outcome: 'regen-hard' }]) } });
    boot(w, S);
    const tr = wire(w, S, []);
    ok('★読み込み直後に生成しない', tr.apiCalls.length === 0, tr.apiCalls.length);
    ok('★保留を localStorage から復元しない（メモリだけ）', w.__v292Dfix643.held() === null);
    ok('★バナーも出ない', !w.document.getElementById('v643banner'));
    ok('★前回のログは残る', logOf(w).length === 1);
    ok('★ターンも増えない', S.turns.length === 3 && S.saved === 0);
  }

  /* ---- (8) 記録 ---- */
  console.log('\n== (8) 記録は score と hits だけ（LSへ大容量を書かない） ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin(); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, new Array(45).fill(F.normalA));
    for (let i = 0; i < 45; i++){ w.__inp.value = 'a' + i; await w.G.submit(); }
    const L = logOf(w);
    ok('★上限40件で古いものから捨てる', L.length === 40, L.length);
    ok('★1件のキーは ts/slotId/turnIndex/score/hits/mode/outcome',
       JSON.stringify(Object.keys(L[0]).sort()) ===
       JSON.stringify(['hits', 'mode', 'outcome', 'score', 'slotId', 'ts', 'turnIndex']), Object.keys(L[0]));
    ok('★slotId が入る', L[0].slotId === 'chr6');
    ok('★本文は入らない', JSON.stringify(L).indexOf('佐伯ミナ') < 0);
    ok('★ログ全体でも十分小さい', JSON.stringify(L).length < 8000, JSON.stringify(L).length);
    ok('★書いたのは自分のキーだけ',
       Object.keys(w.__store).filter(k => k.indexOf('v292Dfix643') !== 0).length === 0, Object.keys(w.__store));
  }

  /* ---- (9) OFF / 冪等 / 公開API / 配線 ---- */
  console.log('\n== (9) OFF / 冪等 / 公開API / 配線 ==');
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Off: '1', v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.normalA]);
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('★OFF なら判定も救済もしない', tr.apiCalls.length === 1, tr.apiCalls.length);
    ok('★OFF ならターンはそのまま確定する', S.turns.length === 4 && S.saved === 1);
    ok('★OFF なら記録もしない', logOf(w).length === 0, logOf(w));
  }
  {
    const S = mkS([]);
    const w = mkWin(); const ctx = boot(w, S);
    wire(w, S, []);
    const first = w.__v292Dfix643;
    vm.runInContext(SRC643, ctx, { filename: 'fix643#2' });
    ok('★二重ロードで初期化し直さない', w.__v292Dfix643 === first);
  }
  {
    const S = mkS(taggedHistory(3));
    const w = mkWin(); boot(w, S);
    wire(w, S, []);
    w.__v292Dfix643._install();
    const st = w.__v292Dfix643.status();
    ok('★status() が読める', !!st && st.mode === 'shadow' && st.probe === true, st);
    ok('★status() に配線状態が出る', st.wrapped === true && st.submitWrapped === true, st);
    const t = w.__v292Dfix643.selfTest();
    ok('★selfTest() が通る', t.ok === true, t);
    ok('★崩壊2種を両方捕まえる', t.repLoopHard && t.registerHard, t);
    ok('★正常2種と意識の流れは通す', t.normalAPass && t.normalBPass && t.streamNotHard, t);
    ok('★救済プロンプトに本文が入らないことを自己証明する', t.noBodyInPrompt === true, t);
    w.__v292Dfix643._install();
    ok('★何度 install しても Api.call の層は増えない（印で冪等）',
       w.Api.call.__f643 === true && w.G.submit.__f643 === true);
  }
  {
    /* 多重ラップされても1回しか働かない（fix333/fix555 が後から包み直す前提） */
    const S = mkS(taggedHistory(3));
    const w = mkWin({ store: { v292Dfix643Live: '1' } }); boot(w, S);
    const F = fixtures(w);
    const tr = wire(w, S, [F.repLoop, F.normalA]);
    const inner = w.Api.call;
    w.Api.call = function(){ return inner.apply(this, arguments); };   /* 印を継がない外側ラッパ */
    w.__v292Dfix643._install();                                        /* fix643 が包み直す */
    w.__inp.value = '扉を開ける';
    await w.G.submit();
    ok('★包み直されても救済は1回のまま', tr.apiCalls.length === 2, tr.apiCalls.length);
    ok('★ターンは1つだけ確定する', S.turns.length === 4, S.turns.length);
  }
  {
    ok('★script タグがある', HTMLU.indexOf('v292Dfix643-collapse-rescue.js') >= 0);
    ok('★?cb= が付いている', HTMLU.indexOf('v292Dfix643-collapse-rescue.js?cb=fix643') >= 0);
    ok('★fix624（判定器）より後に読み込む',
       HTMLU.indexOf('v292Dfix643-collapse-rescue.js') > HTMLU.indexOf('v292Dfix624-degeneration-probe.js'));
    ok('★fix641 の後に置く',
       HTMLU.indexOf('v292Dfix643-collapse-rescue.js') > HTMLU.indexOf('v292Dfix641-cast-auto-register.js'));
    ok('★index.html の NUL バイトが1個のまま',
       fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
    ok('★CRLF を持ち込んでいない',
       fs.readFileSync(path.join(__dirname, 'index.html')).indexOf(Buffer.from('\r\n')) < 0);
    ok('★OFFスイッチがある', SRC643.indexOf('v292Dfix643Off') >= 0);
    ok('★実弾スイッチがある（既定は shadow）', SRC643.indexOf("v292Dfix643Live") >= 0);
    ok('★冪等ガードのフラグ名が __v292 系', SRC643.indexOf('window.__v292Dfix643') >= 0);
    ok('★window.S を新設しない', !/window\.S\s*=[^=]/.test(SRC643));
    ok('★features.js を変更していない', read('features.js').indexOf('v292Dfix643') < 0);
    ok('★fix624 を変更していない（判定の正本は1つ）',
       SRC624.indexOf('fix643') < 0 && SRC624.indexOf('v292Dfix643') < 0);
    ok('★判定は fix624 を呼ぶだけ（自前の検出器を作らない）',
       SRC643.indexOf('__v292Dfix624') >= 0 && SRC643.indexOf('scoreTurn') >= 0);
    /* ★BUILTの値そのものは出荷ごとに進む。固定値で縛るとデプロイのたびに偽の失敗になる。
       契約は「BUILT と version.txt が同値」（=上げ忘れ検査は test_fix596/602_home の担当）。 */
    ok('★BUILT と version.txt が同値', (() => {
      const b = (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1];
      const v = fs.readFileSync(path.join(__dirname, 'version.txt'), 'utf8').trim();
      return !!b && b === v;
    })());
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
