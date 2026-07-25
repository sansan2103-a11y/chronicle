/* ab552_driver.js — 現在地A/B(fix552)の測定ハーネス(本番コードではない・出荷しない)
 *
 * GPT裁定(2026-07-25)を反映:
 *  - 主指標 = 「予定されていない過去地点への巻き戻り断定」率(開始地点だけを見ない)
 *  - 3段階 0=期待地点と整合 / 1=現在地不明・過去地点への言及のみ / 2=誤った地点を現在地として断定
 *  - 各試行は独立した新規スロット(履歴を混ぜない)
 *  - A/Bは交互(反復1: A→B / 反復2: B→A / 反復3: A→B)
 *  - 移動入力にだけ完全名を1回入れる。その次のターン(観測ターン)には場所名を書かない
 *    (毎回書くと「モデルの記憶」ではなく「入力の復唱能力」を測ってしまうため)
 *
 * 使い方(ブラウザのタブ内):
 *   1) 現在の物語タブで  __ab552.prepare(trialId, armIsB)   → 新スロットを作り、切替キーを設定し、URLを返す
 *   2) そのURLへ navigate
 *   3) 読み込み後にこのファイルを注入 → 自動で開幕〜8入力を流す
 *   4) __ab552.report() で結果を回収
 */
(function(){
  'use strict';
  if (window.__ab552 && window.__ab552.__v === 4) return;

  var JOB = '__ab552_job';
  var LOG = '__ab552_log_';        // + trialId
  var IDX = '__ab552_index';

  var PLACES = ['青鐘港', '赤錆館二階', '白坑道地下', '黒松広場', '月影診療所'];

  var SCENE = {
    loc: '青鐘港',
    obj: '行方不明の妹の行方を突き止める。',
    tone: '夏の終わりの夕暮れ。潮と錆の匂いが混じり、遠くで鐘が鳴る。',
    lore: 'この町には五つの場所がある。青鐘港、赤錆館、白坑道、黒松広場、月影診療所。'
        + '十年前の落盤事故以来、白坑道は封鎖されている。',
    branches: [], laws: [], lawT: 0, cards: []
  };

  var CAST = {
    hero: { name: '久瀬 灯', gender: '男性', avatar: '',
      desc: '年齢：17歳\n外見：黒髪、痩身。目つきが鋭い。\n性格：慎重で観察力がある。口数は少ない。',
      voice: { fp: '俺', auto: 1 } },
    npcs: [ { id: 'npcAB5521', name: '柊 みなも', gender: '女性', avatar: '',
      desc: '外見：短い銀髪。小柄。\n性格：寡黙だが察しがいい。',
      personality: '寡黙・観察的', coreDesire: '真相を知ること', coreFear: '置き去りにされること',
      wound: '幼い頃に家族と離れた', appeared: true, voice: { fp: 'わたし', auto: 1 } } ]
  };

  /* 入力列: 移動(完全名1回) → 観測(場所名を書かない) を4回くり返す */
  var INPUTS = [
    { m: 'DO',    t: '赤錆館二階へ上がる。' },
    { m: 'STORY', t: '周囲を見回し、いま自分がいる場所の様子を確かめる。' },
    { m: 'DO',    t: '白坑道地下へ降りる。' },
    { m: 'STORY', t: '足を止め、耳を澄ませる。' },
    { m: 'DO',    t: '黒松広場へ出る。' },
    { m: 'STORY', t: 'あたりの気配を探る。' },
    { m: 'DO',    t: '月影診療所へ入る。' },
    { m: 'STORY', t: '手近なものを調べる。' }
  ];

  /* 各ターンで「いるはずの場所」。0 は開幕。 */
  var EXPECT = ['青鐘港','赤錆館二階','赤錆館二階','白坑道地下','白坑道地下','黒松広場','黒松広場','月影診療所','月影診療所'];
  var PROBE  = [2, 4, 6, 8];   // 場所名を入力に書いていない観測ターン

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function getS(){ try { return window.__chronicleGetState('ab552'); } catch(e){ return null; } }
  /* ★2026-07-25 実測: G / Api / UI は index.html のトップレベル const で window に載っていない。
     window.G.startScene() は TypeError を投げ、tick の catch に黙って飲まれていた(= 今日ずっと
     潰してきた「無言の空振り」と同じ型)。経路ごとに try を分け、失敗は必ず記録する。 */
  function getG(){
    try { if (window.G) return window.G; } catch(e){}
    try { if (typeof G !== 'undefined' && G) return G; } catch(e){}
    try { return (0,eval)('typeof G!=="undefined"?G:null'); } catch(e){ return null; }
  }
  function getPlanner(){
    try { if (window.Planner) return window.Planner; } catch(e){}
    try { if (typeof Planner !== 'undefined' && Planner) return Planner; } catch(e){}
    try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; }
  }

  /* ---------- 1) 試行の準備(現在のタブで実行し、URLを返す) ---------- */
  function prepare(trialId, armIsB){
    var st = getS();
    if (!st) return { ok: false, why: 'no-state' };
    var id = 'ab552' + trialId;
    var slotKey = 'chr6_slot_' + id;

    /* cfg は現在の物語から丸ごと複製する = プロバイダ・モデル・出力長・演出レベルを完全に固定 */
    var cfg = JSON.parse(JSON.stringify(st.cfg));
    cfg.debug = false;

    var blob = { cfg: cfg, cast: JSON.parse(JSON.stringify(CAST)),
                 scene: JSON.parse(JSON.stringify(SCENE)), turns: [], mode: 'STORY' };
    if (!lss(slotKey, JSON.stringify(blob))) return { ok: false, why: 'quota' };

    var meta = [];
    try { meta = JSON.parse(lsg('chr6_slots_meta') || '[]') || []; } catch(e){ meta = []; }
    meta = meta.filter(function(m){ return m && String(m.id) !== id; });
    meta.push({ id: id, name: '【A/B試験】' + trialId, key: slotKey, updatedAt: null,
                createdAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString() });
    if (!lss('chr6_slots_meta', JSON.stringify(meta))) return { ok: false, why: 'quota-meta' };

    /* ★A/Bのアーム。差分はこれ1個だけ。 */
    if (armIsB) lss('v292Dfix552OpeningSetting', '1');
    else { try { localStorage.removeItem('v292Dfix552OpeningSetting'); } catch(e){} }

    lss(JOB, JSON.stringify({ trial: trialId, arm: armIsB ? 'B' : 'A', id: id,
                              want: 1 + INPUTS.length, started: new Date().toISOString() }));
    try { localStorage.removeItem(LOG + trialId); } catch(e){}
    return { ok: true, id: id, arm: armIsB ? 'B' : 'A', want: 1 + INPUTS.length };
  }

  /* ---------- 2) 実行(遷移後のページで注入して動かす) ---------- */
  var timer = null, state = null;

  function armProof(){
    /* 実際に送られる user ペイロードを組み立てて、どちらのキー名が入るかを確かめる(送信はしない) */
    try {
      var P = getPlanner(); if (!P) return { error: 'no-planner' };
      var b = P.build('STORY', '__ab552_probe__');
      var u = String(b && b.user || '');
      return { openingSetting: u.indexOf('"openingSetting"') >= 0, location: u.indexOf('"location"') >= 0 };
    } catch(e){ return { error: String(e && e.message || e) }; }
  }

  function snapshot(){
    var st = getS(); if (!st) return null;
    return st.turns.map(function(t){
      return { input: String(t.playerText || ''), narrative: String(t.narrative || '') };
    });
  }

  function saveLog(extra){
    var j = state; if (!j) return;
    var rec = { trial: j.trial, arm: j.arm, id: j.id, want: j.want,
                armProof: j.armProof, status: j.status, finished: new Date().toISOString(),
                turns: snapshot() };
    if (extra) rec.note = extra;
    lss(LOG + j.trial, JSON.stringify(rec));
  }

  function start(){
    var j = null; try { j = JSON.parse(lsg(JOB) || 'null'); } catch(e){}
    if (!j) { console.warn('[ab552] no job'); return { ok: false, why: 'no-job' }; }
    var st = getS();
    if (!st) return { ok: false, why: 'no-state' };
    if (window.__chronicleStoryId !== j.id) return { ok: false, why: 'wrong-story', got: window.__chronicleStoryId };

    j.armProof = armProof();
    state = j;
    state.lastLen = st.turns.length;
    state.lastMove = 0;          /* 0 = 即座に最初の一手を投げる */
    state.step = 0;
    state.retries = 0;
    state.status = 'running';
    saveLog();

    if (timer) clearInterval(timer);
    timer = setInterval(tick, 4000);
    tick();
    return { ok: true, trial: j.trial, arm: j.arm, armProof: j.armProof };
  }

  function tick(){
    var st = getS(); if (!st || !state) return;
    var n = st.turns.length;

    if (n !== state.lastLen){ state.lastLen = n; state.lastMove = Date.now(); state.retries = 0; saveLog(); }

    if (n >= state.want){
      state.status = 'done';
      saveLog('complete');
      clearInterval(timer); timer = null;
      try { console.log('[ab552] done', state.trial, state.arm, n); } catch(e){}
      return;
    }
    if (st.inFlight) return;

    /* このターン番号でまだ一度も投げていなければ即投げる。既に投げてあるなら60秒待ってから再送
       (60秒は「送ったのに何も起きない」判定用。ここを lastMove 基準にすると毎ターン60秒空転する)。 */
    if (state.submittedFor === n && (Date.now() - (state.lastSubmit || 0)) < 60000) return;
    state.submittedFor = n; state.lastSubmit = Date.now();

    if (state.retries > 6){
      state.status = 'stalled';
      saveLog('stalled at turn ' + n);
      clearInterval(timer); timer = null;
      return;
    }
    state.retries++;
    state.lastMove = Date.now();

    try {
      var g = getG();
      if (!g) { state.lastError = 'no-G'; saveLog('no-G'); return; }
      if (n === 0){ g.startScene(); }
      else {
        var s = INPUTS[n - 1];
        if (!s) return;
        g.setMode(s.m);
        document.getElementById('inp').value = s.t;
        g.submit();
      }
      state.lastError = null;
    } catch(e){
      state.lastError = String((e && e.name) || '') + ': ' + String((e && e.message) || e).slice(0, 200);
      saveLog('submit-threw');
      try { console.warn('[ab552] submit failed', e); } catch(_){}
    }
  }

  function status(){
    var st = getS();
    return { trial: state && state.trial, arm: state && state.arm,
             status: state && state.status,
             turns: st ? st.turns.length : null, want: state && state.want,
             inFlight: st ? !!st.inFlight : null,
             sinceMove: state ? Math.round((Date.now() - state.lastMove)/1000) : null,
             retries: state && state.retries, lastError: state && state.lastError || null,
             hasG: !!getG(), hasPlanner: !!getPlanner() };
  }

  /* ---------- 3) 集計 ---------- */
  function places(text){
    var out = [];
    for (var i = 0; i < PLACES.length; i++){
      var p = PLACES[i], k = 0, at = text.indexOf(p);
      while (at >= 0){ k++; at = text.indexOf(p, at + p.length); }
      if (k) out.push({ name: p, n: k, first: text.indexOf(p) });
    }
    out.sort(function(a,b){ return a.first - b.first; });
    return out;
  }

  function report(trialIds){
    var res = [];
    (trialIds || []).forEach(function(tid){
      var raw = lsg(LOG + tid); if (!raw) { res.push({ trial: tid, missing: true }); return; }
      var r = null; try { r = JSON.parse(raw); } catch(e){ res.push({ trial: tid, broken: true }); return; }
      var rows = (r.turns || []).map(function(t, i){
        var found = places(t.narrative);
        return { i: i, expect: EXPECT[i] || '?', probe: PROBE.indexOf(i) >= 0,
                 input: t.input.slice(0, 40),
                 len: t.narrative.length,
                 found: found.map(function(f){ return f.name + '×' + f.n; }).join(' / '),
                 hasExpect: found.some(function(f){ return f.name === EXPECT[i]; }),
                 others: found.filter(function(f){ return f.name !== EXPECT[i]; }).map(function(f){ return f.name; }) };
      });
      res.push({ trial: tid, arm: r.arm, armProof: r.armProof, note: r.note, n: rows.length, rows: rows });
    });
    return res;
  }

  function text(trialId, i){
    var raw = lsg(LOG + trialId); if (!raw) return null;
    var r = JSON.parse(raw);
    return (r.turns && r.turns[i]) ? r.turns[i].narrative : null;
  }

  function cleanup(){
    var removed = [];
    try {
      var meta = JSON.parse(lsg('chr6_slots_meta') || '[]') || [];
      meta = meta.filter(function(m){ return !(m && String(m.id).indexOf('ab552') === 0); });
      lss('chr6_slots_meta', JSON.stringify(meta));
      var ks = []; for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (k && k.indexOf('ab552') >= 0) ks.push(k); }
      ks.forEach(function(k){ try { localStorage.removeItem(k); removed.push(k); } catch(e){} });
    } catch(e){}
    return removed;
  }

  window.__ab552 = { __v: 4, prepare: prepare, start: start, status: status, report: report,
                     text: text, cleanup: cleanup, PLACES: PLACES, EXPECT: EXPECT, PROBE: PROBE,
                     INPUTS: INPUTS, armProof: armProof };
  try { console.log('[ab552] harness ready'); } catch(e){}
})();
