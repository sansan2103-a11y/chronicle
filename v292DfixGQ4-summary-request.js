/* ★v292DfixGQ4 — SUMMARY_REQUEST_REVIVAL（GAME QUALITY・記憶と約束の忘却。Offline 候補・既定 OFF opt-in）
   実測（2026-10-09・headless Chromium・本番の写し・fetch 境界で捕捉）: 新エンジン（fix192）では、モデルに渡る文脈が
   「recentScenes = 直近 2 ターン」＋「storySoFar = 『これまで N ターン経過。直近の状況: …』の代替文」だけで、
   <summary> の要求（fix58 sysExt）は Planner._extensions 経路ごとスキップされている。一方 <summary> の捕捉と除去
   （fix61 の parsePlan wrap／fix58 parseExt）と、S.rollingSummary を storySoFar に載せる処理（fix58 userExt）は生きている。
   r1: keeper（fix379 __f379reg・prio1）経由で <summary> の要求 1 ブロックを戻す。
   r2（GPT #125-BJ 必須 QA D/E）: 要約を「そのターンの持ち物」にする。
   r3: _dadmRun を包む時に SC1 の冪等印（__sc1）を引き継ぐ（SC1 が後から二重に包まないように）。
   r4: 適用範囲を v292DfixGQStories に載った物語だけに限定（GPT #125-BL・QA 物語限定）。
     ・TURN_COMMIT で、その生成で捕捉した要約を turn._gq4s に写す（本文と同じ保存単位＝取消で一緒に消える）。
     ・生成直前（TURN_BUILD）と取消・やり直しの直前に、S.rollingSummary を「現在の履歴の最後の _gq4s」から導出し直す。
       取り消したターン由来の要約、巻き戻し後に遅れて書かれた旧要約は、次の生成までに必ず上書きされる。
       _gq4s を持つターンが無ければ ''（fix58 の代替文に戻る）。
     ・要約は記憶の補助情報。負傷・関係・所在の正本（fix77 / cast / scene）へは一切書かない。
   新 Store・新キー・LLM call 追加なし（モデルの出力が 2〜3 文増える）。
   opt-in: localStorage v292DfixGQ4On='1' ／ kill: v292DfixGQ4Off='1'（kill 優先。OFF では要求も導出も行わない＝従来どおり）。 */
(function v292DfixGQ4(){
  'use strict';
  if (window.__v292DfixGQ4) return;
  var MARKER = '【要約】';
  var stats = { stamped: 0, derived: 0, cleared: 0 };
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function gqScope(){ try { var k = window.__chronicleDocumentStoryKey; var id = (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) ? k.slice(10) : null; if (!id) return false; var list = String(localStorage.getItem('v292DfixGQStories') || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean); return list.indexOf(id) >= 0; } catch(e){ return false; } } /* GPT #125-BL: opt-in 機能は QA 物語だけ（v292DfixGQStories にカンマ区切りで物語 id。未設定なら動かない） */
  function on(){ return ls('v292DfixGQ4Off') !== '1' && ls('v292DfixGQ4On') === '1' && gqScope(); }
  function getS(){ try { if (window.S) return window.S; } catch(e){} try { return (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function getG(){ try { if (window.G) return window.G; } catch(e){} try { return (0,eval)('typeof G!=="undefined"?G:null'); } catch(e){ return null; } }
  var TEXT = '\n' + MARKER + '\n'
    + '・本文を書き切った後、最後に <summary>…</summary> を 1 つ置き、これまでの物語の要点（現在地・同行者・負傷や約束など引き継ぐべき事実）を 2〜3 文で書く。\n'
    + '・<summary> は本文ではない。本文の途中に置かず、要約の中に新しい出来事を書かない。\n';
  try {
    window.__f379reg = window.__f379reg || [];
    var reg = window.__f379reg, dup = false;
    for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) dup = true; }
    if (!dup) reg.push({ off: 'v292DfixGQ4Off', marker: MARKER, prio: 1, text: function(){ return on() ? TEXT : ''; } });
  } catch(e){}

  /* ---- 要約の出所を履歴に結び付ける ---- */
  function derive(turns){                                   /* 現在の履歴の最後の _gq4s（無ければ ''） */
    for (var i = turns.length - 1; i >= 0; i--){ var t = turns[i]; if (t && typeof t._gq4s === 'string') return t._gq4s; }
    return '';
  }
  function reconcile(turns){
    try {
      if (!on()) return;
      var S = getS(); if (!S) return;
      var want = derive(turns || S.turns || []);
      if ((S.rollingSummary || '') !== want){ S.rollingSummary = want; if (want) stats.derived++; else stats.cleared++; }
    } catch(e){}
  }
  var pre = null;
  function wire(){
    var g = getG(); if (!g || typeof g._dadmRun !== 'function') return false;
    if (!g._dadmRun.__gq4){
      var orig = g._dadmRun;
      var run = function(label, fn){
        if (!on() || typeof fn !== 'function') return orig.call(this, label, fn);
        if (label === 'TURN_BUILD'){
          var inB = fn; fn = function(){ try { reconcile(); var S0 = getS(); pre = S0 ? (S0.rollingSummary || '') : ''; } catch(e){} return inB.apply(this, arguments); };
        } else if (label === 'TURN_COMMIT'){
          var inC = fn; fn = function(){ var r = inC.apply(this, arguments);
            try { if (r === true){ var S1 = getS(), T = S1 && S1.turns, last = T && T[T.length - 1];
              if (last && typeof last === 'object'){ var cur = S1.rollingSummary || ''; if (cur && cur !== pre){ last._gq4s = cur; stats.stamped++; try { S1.save && S1.save(); } catch(_s){} } else if (!cur) { /* 要約なし: 代替文のまま */ } } } } catch(e){}
            return r; };
        }
        return orig.call(this, label, fn);
      };
      run.__gq4 = true; try { if (orig.__sc1) run.__sc1 = true; } catch(e){} /* r3: SC1 の冪等印を引き継ぐ（SC1 の wireRun が二重に包まないように） */
      g._dadmRun = run;
    }
    ['undo', 'retryRollback'].forEach(function(nm){
      if (typeof g[nm] !== 'function' || g[nm].__gq4) return;
      var o = g[nm];
      g[nm] = function(){ try { var S2 = getS(); if (on() && S2 && Array.isArray(S2.turns) && S2.turns.length) reconcile(S2.turns.slice(0, -1)); } catch(e){} return o.apply(this, arguments); };   /* pop の前に導出＝orig の S.save で保存される */
      g[nm].__gq4 = true;
    });
    return true;
  }
  (function w(){ w._n = (w._n || 0) + 1; if (wire()) return; if (w._n > 120) return; setTimeout(w, 500); })();
  try { window.addEventListener('chr:engine-booted', function(){ setTimeout(function(){ reconcile(); }, 0); }); } catch(e){}
  window.__v292DfixGQ4 = { VER: 'gq4-r4', MARKER: MARKER, on: on, text: function(){ return on() ? TEXT : ''; }, reconcile: reconcile, derive: derive, stats: function(){ return JSON.parse(JSON.stringify(stats)); } };
  try { console.log('[v292DfixGQ4]', 'loaded (summary request via keeper, opt-in; summary bound to turn)'); } catch(e){}
})();
