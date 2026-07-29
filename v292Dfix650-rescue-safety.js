/* v292Dfix650-rescue-safety.js (2026-07-29)
 * ─ fix643（崩壊ターンの自動救済）を canary で回すための安全層 ─
 *
 * ■なぜ要るのか
 *   fix643 は「崩壊ターンを検出したら1回だけ書き直す」ところまで出来ている。だが実弾(live)を
 *   開けるための条件が3つ足りない。
 *     ①救済がどう転んだのかを**後から人が読める形**で残す手段が無い（記録は score と hits コードだけ）。
 *     ②「救済が hard でなければ採用」は**甘すぎる**。4〜6点（soft＝崩壊の疑いあり）でも黙って確定する。
 *     ③端末フラグ1個（v292Dfix643Live）で live になるので、**どの物語でも**実弾が飛ぶ。
 *   本fixはこの3つを塞ぎ、さらに「初回候補の state を仮適用してから救済候補で再適用する」
 *   二重適用が構造的に起き得ないことを、生成前の state ハッシュで**照合して**保証する。
 *
 * ■fix643 との接続点（fix643 側は「安全層が居れば聞きに行く」だけ。居なければ従来どおり）
 *   live 判定   … fix643.live() が gate(slotId) を聞く   → 物語allowlistに載っている時だけ live
 *   生成の開始   … begin({state,seq,input,...})            → logicalTurnId と 生成前state hash を発行
 *   多重防止     … acquire(ctx) / release(ctx)             → 同一 logicalTurnId の救済は同時に1本だけ
 *   採用の可否   … judgeRescue(ctx, info)                  → 'adopt' | 'confirm' | 'stop'
 *   採用結果     … noteOutcome(id, outcome)                → ring の採用結果を後追いで更新する
 *
 * ■採用条件（GPT裁定・fix643 の「hard でなければ採用」を強化する）
 *   救済スコア 0〜3点  … adopt   自動採用（従来と同じ）
 *   救済スコア 4〜6点  … confirm 自動確定しない＝**確認待ち**（二重hardと同じ契約で止める）
 *   救済スコア 7点以上 … stop    停止（従来と同じ）
 *   測れない(measurable=false) … confirm（改善したと言えないものを自動確定しない）
 *   生成前後で state hash が動いた … stop（＝どこかで仮適用された疑い。採用しない）
 *   ★confirm / stop はどちらも fix643 の既存契約に相乗りする:
 *     ターン数を進めない / fix77・fix190 を更新しない / 保存しない / 入力を残す / 自動の3回目をしない。
 *     これは fix643 が Api.call から null を返し、index.html:1809 の既存ガードが
 *     parsePlan より前に return する、という**1つの事実**から自動的に従う（細工していない）。
 *
 * ■候補の保全（ring buffer・★クラウドへ出さない）
 *   キー = localStorage['v292Dfix650Ring']（直近20件）。**スロットIDを含まない固定キー**にしてある。
 *   これは意匠ではなく契約:
 *     ・fix399/fix402 の collectLS は「スロットIDを含むキー」と isGlobalKey だけを送る
 *       → この名前は**どちらにも当たらない**ので、クラウド同期の荷物に載らない。
 *     ・fix564 の partKeys も「スロットIDを含むキー」を集める → スナップショット対象にならない。
 *   QuotaExceeded は fix228/fix264b と同じ作法で**最古から捨てて**書き直す（例外を投げない）。
 *   ★ring を書くのは live のときだけ。shadow の端末では1バイトも書かない（挙動変化ゼロ）。
 *
 * ■物語allowlist（端末フラグだけでは live にしない）
 *   v292Dfix643Live='1'  かつ  v292Dfix650LiveSlots に現在の slotId が入っている時だけ live。
 *   v292Dfix643LiveSlots も同義キーとして読む（統括の手順書がどちらを書いても効くようにする）。
 *   未設定・壊れたJSON・空配列 は**すべて shadow**（fail-closed）。
 *
 * ■即時停止
 *   画面右上のトグル（live のときだけ出る）／ window.__v292Dfix650.stop()
 *   stop() は v292Dfix650Stop='1' を立て、**さらに v292Dfix643Live を消す**。
 *   後者があるので、この安全層自体を OFF にしても live へ戻らない。次の生成から効く（再読込不要）。
 *
 * 冪等 : window.__v292Dfix650
 * OFF  : localStorage v292Dfix650Off='1'（安全層だけを外す＝fix643 は従来の判断に戻る）
 * 読出 : window.__v292Dfix650.list() / .mark(i) / .status() / .selfTest() / .stop() / .arm()
 */
(function v292Dfix650(){
  'use strict';
  if (window.__v292Dfix650) return;
  window.__v292Dfix650 = 1;                    /* ★早置きの冪等ガード。最後に本体で差し替える */

  var TAG   = '[v292Dfix650:rescue-safety]';
  var RING  = 'v292Dfix650Ring';
  var STOP  = 'v292Dfix650Stop';
  var SLOTS = 'v292Dfix650LiveSlots';
  var SLOTS_ALT = 'v292Dfix643LiveSlots';
  var LIVE  = 'v292Dfix643Live';
  var MAX   = 20;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsd(k){ try { localStorage.removeItem(k); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix650Off') === '1'; }
  function stopped(){ return lsg(STOP) === '1'; }

  function slotId(){
    try {
      var k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
      return String(k || 'chr6').replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }

  /* ---- 短い安定ハッシュ（fix564 と同じ FNV-1a 亜種。桁数ではなく「同じか違うか」に使う） ---- */
  function fnv(s){
    s = String(s == null ? '' : s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16) + '-' + s.length;
  }

  /* =====================================================================
     物語allowlist ゲート
     ===================================================================== */
  function parseSlots(raw){
    if (raw == null || raw === '') return [];
    var a = null;
    try { a = JSON.parse(raw); } catch(e){ return []; }      /* 壊れたJSONは空扱い＝shadow */
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length; i++){
      var s = a[i];
      if (typeof s !== 'string' && typeof s !== 'number') continue;
      s = String(s).trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }
  function allowlist(){
    var a = parseSlots(lsg(SLOTS));
    if (!a.length) a = parseSlots(lsg(SLOTS_ALT));
    return a;
  }
  /* ★fix643 の live() から呼ばれる。false を返した時点で shadow（＝挙動は従来どおり）。 */
  function gate(slot){
    if (stopped()) return false;
    var id = slot == null ? slotId() : String(slot);
    var a = allowlist();
    if (!a.length) return false;                              /* 未設定は fail-closed */
    return a.indexOf(id) >= 0;
  }

  /* =====================================================================
     生成前 state の指紋
     ★fix77 と fix190 は同じ store（window.__v292Dfix77Store）に載る。永続側は
       localStorage['v292Dfix77States']。ここに turns 本数と cast/scene を足したものを
       「このターンを生成する前の状態」とする。**読むだけ**で、何も書かない。
     ===================================================================== */
  function stateHash(st){
    var parts = [];
    try { parts.push('turns:' + ((st && Array.isArray(st.turns)) ? st.turns.length : -1)); } catch(e){ parts.push('turns:?'); }
    try { parts.push('f77:' + JSON.stringify(window.__v292Dfix77Store || {})); } catch(e){ parts.push('f77:?'); }
    try { parts.push('f190:' + (lsg('v292Dfix77States') || '')); } catch(e){ parts.push('f190:?'); }
    try { parts.push('cast:' + JSON.stringify((st && st.cast) || null)); } catch(e){ parts.push('cast:?'); }
    try { parts.push('scene:' + JSON.stringify((st && st.scene) || null)); } catch(e){ parts.push('scene:?'); }
    return fnv(parts.join('|'));
  }

  /* =====================================================================
     ring buffer（★本文は全文残す。人が読んで裁定するための素材だから）
     ===================================================================== */
  function isQuota(e){
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e && e.message || e)));
  }
  function readRing(){
    var a = null;
    try { a = JSON.parse(lsg(RING) || '[]'); } catch(e){ return []; }
    return Array.isArray(a) ? a : [];
  }
  /* 書けなければ**最古から捨てて**書き直す（fix228/fix264b と同じ作法）。例外は外へ出さない。 */
  function writeRing(arr){
    var a = arr.slice(-MAX);
    while (a.length){
      try { localStorage.setItem(RING, JSON.stringify(a)); return true; }
      catch(e){
        if (!isQuota(e)) return false;
        a = a.slice(1);
        stats.evicted++;
      }
    }
    lsd(RING);
    return false;
  }
  function pushRing(rec){
    var a = readRing();
    a.push(rec);
    var okw = writeRing(a);
    if (okw) stats.ringWrites++; else stats.ringFails++;
    return okw;
  }

  /* ---- 応答から取れるだけの素性を取る（無ければ null。作り話をしない） ---- */
  function textOf(r){ return (r && typeof r.text === 'string') ? r.text : null; }
  function finishOf(r){
    if (!r || typeof r !== 'object') return null;
    var v = r.finish_reason || r.finishReason || r.stop_reason || r.stopReason;
    if (!v && r.body && typeof r.body === 'object'){
      v = r.body.finish_reason || r.body.stop_reason ||
          (r.body.choices && r.body.choices[0] && (r.body.choices[0].finish_reason || r.body.choices[0].native_finish_reason));
    }
    return v == null ? null : String(v);
  }
  function routeOf(st){
    var cfg = (st && st.cfg) || {};
    var prov = String(cfg.provider || 'anthropic');
    var model = prov === 'openrouter' ? (cfg.orModel || cfg.model || '') : (cfg.model || '');
    return { provider: prov, model: String(model || ''), path: 'Api.call/' + prov };
  }
  function viewOf(v){
    if (!v || !v.measurable) return { measurable: false, score: null, level: null, hits: [], codes: [] };
    return { measurable: true, score: v.score, level: v.level, hits: (v.hits || []).slice(),
             codes: (v.codes || []).slice(), cards: v.cards == null ? null : v.cards,
             cardAvg: v.cardAvg == null ? null : v.cardAvg };
  }

  /* =====================================================================
     fix643 から呼ばれる入口
     ===================================================================== */
  var stats = { begun: 0, adopt: 0, confirm: 0, stop: 0, drift: 0, blockedParallel: 0,
                ringWrites: 0, ringFails: 0, evicted: 0, errors: 0 };
  var inflight = {};          /* logicalTurnId -> true（同一論理ターンの救済は1本だけ） */
  var seqId = 0;

  function begin(o){
    o = o || {};
    try {
      var st = o.state || null;
      var slot = o.slotId == null ? slotId() : String(o.slotId);
      var turnIndex = (st && Array.isArray(st.turns)) ? st.turns.length : -1;
      var input = String(o.input == null ? '' : o.input);
      /* ★logicalTurnId は「どの物語の、何ターン目を、どの入力で」作ろうとしているか。
         同じ入力の再送は**同じ論理ターン**として扱う（single-flight の単位）。 */
      var turnId = slot + '#' + turnIndex + '#' + fnv(input);
      stats.begun++;
      return {
        id: 'f650_' + (++seqId) + '_' + Date.now(),
        turnId: turnId, slotId: slot, turnIndex: turnIndex, seq: o.seq == null ? 1 : o.seq,
        stateHash: stateHash(st),
        planner: {
          mode: (st && st.mode) ? String(st.mode) : null,
          sysHash: fnv(o.sys == null ? '' : o.sys), sysBytes: String(o.sys == null ? '' : o.sys).length,
          userHash: fnv(o.user == null ? '' : o.user), userBytes: String(o.user == null ? '' : o.user).length,
          inputHash: fnv(input)
        },
        route: routeOf(st),
        acquired: false
      };
    } catch(e){ stats.errors++; return null; }
  }

  function acquire(ctx){
    if (!ctx || !ctx.turnId) return true;
    if (inflight[ctx.turnId]){ stats.blockedParallel++; return false; }
    inflight[ctx.turnId] = true;
    ctx.acquired = true;
    return true;
  }
  function release(ctx){
    if (!ctx || !ctx.turnId) return;
    if (ctx.acquired){ delete inflight[ctx.turnId]; ctx.acquired = false; }
  }
  function inflightCount(){ var n = 0; for (var k in inflight){ if (inflight.hasOwnProperty(k)) n++; } return n; }

  /* 救済結果の裁定 + ring への保全。★fix643 はこの戻り値だけを見る。 */
  function judgeRescue(ctx, info){
    info = info || {};
    var first  = info.first  || {};
    var second = info.second || {};
    var v1 = first.view || null, v2 = second.view || null;
    var verdict, reason;

    var after = stateHash(info.state || null);
    /* ★fix651(A): 暴走ガードが遮断した応答は、点数を見るまでもなく採用しない。
       理由コード（stream-degenerate / stream-overlength）をそのまま ring の reason に残す。 */
    if (v2 && v2.guard){
      verdict = 'stop'; reason = String(v2.guard); stats.stop++;
      try {
        pushRing({
          v: 1, id: ctx ? ctx.id : ('f650_' + (++seqId)), ts: new Date().toISOString(),
          slotId: ctx ? ctx.slotId : slotId(), logicalTurnId: ctx ? ctx.turnId : null,
          turnIndex: ctx ? ctx.turnIndex : -1, planner: ctx ? ctx.planner : null,
          stateHashBefore: ctx ? ctx.stateHash : null, stateHashAfter: after,
          route: ctx ? ctx.route : routeOf(info.state),
          first:  { text: textOf(first.result),  finishReason: finishOf(first.result),  score: viewOf(v1) },
          rescue: { text: textOf(second.result), finishReason: finishOf(second.result), score: viewOf(v2) },
          guard: { first: (v1 && v1.guard) || null, rescue: String(v2.guard),
                   why: v2.guardWhy == null ? null : String(v2.guardWhy),
                   len: v2.guardLen == null ? null : v2.guardLen },
          verdict: verdict, reason: reason, outcome: verdict, reviewed: false
        });
      } catch(e){ stats.errors++; }
      return verdict;
    }
    if (ctx && after !== ctx.stateHash){
      /* ★最重要: 生成前 snapshot から動いていたら、初回候補が仮適用された疑いがある。
         直せないものを黙って採用しない。ここで止めれば二重適用は起こり得ない。 */
      verdict = 'stop'; reason = 'state-drift'; stats.drift++;
    } else if (!v2 || !v2.measurable){
      verdict = 'confirm'; reason = 'unmeasurable';
    } else if (v2.score <= 3){
      verdict = 'adopt';   reason = 'score<=3';
    } else if (v2.score <= 6){
      verdict = 'confirm'; reason = 'score4-6(soft)';
    } else {
      verdict = 'stop';    reason = 'score>=7(hard)';
    }
    if (verdict === 'adopt') stats.adopt++;
    else if (verdict === 'confirm') stats.confirm++;
    else stats.stop++;

    try {
      pushRing({
        v: 1,
        id: ctx ? ctx.id : ('f650_' + (++seqId)),
        ts: new Date().toISOString(),
        slotId: ctx ? ctx.slotId : slotId(),
        logicalTurnId: ctx ? ctx.turnId : null,
        turnIndex: ctx ? ctx.turnIndex : -1,
        planner: ctx ? ctx.planner : null,
        stateHashBefore: ctx ? ctx.stateHash : null,
        stateHashAfter: after,
        route: ctx ? ctx.route : routeOf(info.state),
        first:  { text: textOf(first.result),  finishReason: finishOf(first.result),  score: viewOf(v1) },
        rescue: { text: textOf(second.result), finishReason: finishOf(second.result), score: viewOf(v2) },
        verdict: verdict, reason: reason, outcome: verdict, reviewed: false
      });
    } catch(e){ stats.errors++; }

    return verdict;
  }

  /* 採用結果を後追いで書き換える（confirm のあとユーザーが採用した／捨てた） */
  function noteOutcome(id, outcome){
    if (!id) return false;
    var a = readRing(), touched = false;
    for (var i = a.length - 1; i >= 0; i--){
      if (a[i] && a[i].id === id){ a[i].outcome = String(outcome || ''); a[i].outcomeAt = new Date().toISOString(); touched = true; break; }
    }
    if (touched) writeRing(a);
    return touched;
  }

  /* =====================================================================
     読み出し / 人手確認マーク
     ===================================================================== */
  function list(){
    return readRing().map(function(e, i){
      var o = {}; for (var k in e){ if (e.hasOwnProperty(k)) o[k] = e[k]; }
      o._i = i; return o;
    });
  }
  function summary(){
    return readRing().map(function(e, i){
      return { i: i, ts: e.ts, slotId: e.slotId, turnIndex: e.turnIndex, verdict: e.verdict,
               outcome: e.outcome, reviewed: !!e.reviewed,
               firstScore: e.first && e.first.score && e.first.score.score,
               rescueScore: e.rescue && e.rescue.score && e.rescue.score.score,
               chars: [(e.first && e.first.text || '').length, (e.rescue && e.rescue.text || '').length] };
    });
  }
  function mark(i, note){
    var a = readRing();
    if (!(i >= 0 && i < a.length) || !a[i]) return false;
    a[i].reviewed = true;
    a[i].reviewedAt = new Date().toISOString();
    if (note != null) a[i].reviewNote = String(note);
    return writeRing(a);
  }
  function unmark(i){
    var a = readRing();
    if (!(i >= 0 && i < a.length) || !a[i]) return false;
    a[i].reviewed = false;
    return writeRing(a);
  }
  function clearRing(){ lsd(RING); return true; }

  /* =====================================================================
     即時停止（次の生成から効く。再読込しない）
     ===================================================================== */
  function stop(){
    lss(STOP, '1');
    lsd(LIVE);                 /* ★安全層を OFF にされても live へ戻らないように、元栓も閉める */
    renderPanel();
    try { console.log(TAG, 'STOPPED (next generation is shadow)'); } catch(e){}
    return status();
  }
  function arm(){
    lsd(STOP);
    lss(LIVE, '1');
    renderPanel();
    return status();
  }
  function setAllowlist(a){
    if (!Array.isArray(a)) return false;
    lss(SLOTS, JSON.stringify(a));
    renderPanel();
    return true;
  }

  /* ---- 画面のトグル（★live を開けた端末にだけ出す。既定の端末には何も足さない） ---- */
  var PANEL_ID = 'v650toggle';
  function panelEl(){ try { return document.getElementById(PANEL_ID); } catch(e){ return null; } }
  function removePanel(){ var e = panelEl(); try { if (e && e.parentNode) e.parentNode.removeChild(e); } catch(x){} }
  /* ★停止したあとも出したままにする（消えると戻す手段が画面から無くなる）。
     どちらのフラグも無い＝canary を開けていない端末には、最初から出さない。 */
  function armedForPanel(){ return (lsg(LIVE) === '1' || stopped()) && !off(); }
  function renderPanel(){
    try {
      if (!document || !document.body) return null;
      if (!armedForPanel()){ removePanel(); return null; }
      var el = panelEl();
      if (!el){
        el = document.createElement('button');
        el.id = PANEL_ID;
        el.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99998;border:0;border-radius:8px;' +
                           'padding:5px 10px;font-size:12px;cursor:pointer;opacity:.85';
        el.addEventListener('click', function(){
          try { if (stopped()) arm(); else stop(); } catch(e){ stats.errors++; }
        });
        document.body.appendChild(el);
      }
      var on = !stopped();
      el.textContent = on ? 'fix643自動救済:ON（押すと今すぐOFF）' : 'fix643自動救済:OFF（押すとON）';
      el.style.background = on ? '#5a4a86' : '#444';
      el.style.color = '#fff';
      return el;
    } catch(e){ stats.errors++; return null; }
  }

  /* =====================================================================
     状態 / 自己診断
     ===================================================================== */
  function status(){
    var a = allowlist(), sid = slotId();
    return {
      off: off(), stopped: stopped(),
      liveFlag: lsg(LIVE) === '1',
      allowlist: a, slotId: sid,
      gate: (lsg(LIVE) === '1') && !off() && gate(sid),
      mode: ((lsg(LIVE) === '1') && !off() && gate(sid)) ? 'live' : 'shadow',
      ringKey: RING, ring: readRing().length, ringMax: MAX,
      reviewed: readRing().filter(function(e){ return e && e.reviewed; }).length,
      inflight: inflightCount(),
      stats: JSON.parse(JSON.stringify(stats))
    };
  }
  function selfTest(){
    var d = {};
    /* 採点の3分岐（判定器を呼ばずに、この層の閾値だけを確かめる） */
    function vd(score){
      return judgeRescueDry({ measurable: true, score: score, level: score >= 7 ? 'hard' : (score >= 4 ? 'soft' : 'ok') });
    }
    d.adoptLow   = vd(0) === 'adopt'   && vd(3) === 'adopt';
    d.confirmMid = vd(4) === 'confirm' && vd(6) === 'confirm';
    d.stopHigh   = vd(7) === 'stop'    && vd(12) === 'stop';
    d.unmeasurableConfirm = judgeRescueDry(null) === 'confirm';
    /* ゲートは fail-closed か */
    d.gateClosedByDefault = !gate('___no_such_slot___');
    /* ring キーがクラウド同期・スナップショットの網に掛からないか（名前の契約） */
    d.ringKeyIsolated = !/^chr6/.test(RING) && !/^v292avrec_/.test(RING) && !/^v292appr_/.test(RING);
    d.ringKeyHasNoSlotId = RING.indexOf(slotId()) < 0 || slotId() === 'chr6';
    d.ok = !!(d.adoptLow && d.confirmMid && d.stopHigh && d.unmeasurableConfirm &&
              d.gateClosedByDefault && d.ringKeyIsolated);
    return d;
  }
  /* 閾値だけを引くための純関数（記録もしないし state も見ない） */
  function judgeRescueDry(v2){
    if (!v2 || !v2.measurable) return 'confirm';
    if (v2.score <= 3) return 'adopt';
    if (v2.score <= 6) return 'confirm';
    return 'stop';
  }

  window.__v292Dfix650 = {
    __armed: true,
    /* fix643 が呼ぶ */
    isOff: off, isStopped: stopped, gate: gate,
    begin: begin, acquire: acquire, release: release, judgeRescue: judgeRescue, noteOutcome: noteOutcome,
    /* 人が呼ぶ */
    list: list, summary: summary, mark: mark, unmark: unmark, clearRing: clearRing,
    stop: stop, arm: arm, allowlist: allowlist, setAllowlist: setAllowlist,
    status: status, selfTest: selfTest,
    /* 部品（テストと診断用） */
    RING_KEY: RING, MAX: MAX,
    _stateHash: stateHash, _hash: fnv, _verdict: judgeRescueDry,
    _panel: renderPanel, _removePanel: removePanel, _inflight: inflightCount,
    _stats: function(){ return JSON.parse(JSON.stringify(stats)); }
  };

  try { renderPanel(); } catch(e){}
  try {
    if (document && document.addEventListener && document.readyState !== 'complete')
      document.addEventListener('DOMContentLoaded', function(){ try { renderPanel(); } catch(e){} });
  } catch(e){}
  try { if (!off()) console.log(TAG, 'ready (' + status().mode + ')'); } catch(e){}
})();
