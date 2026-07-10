// =====================================================================
// Chronicle TRPG - v292Dfix416: 痛覚リアクション(急性反応) + 文体ノブ
// ---------------------------------------------------------------------
// 設計書=設計書_fix416_痛覚リアクションと文体ノブ_2026-07-11.md (Fable5設計・Opus実装)。
//   A(fix416a 痛覚リアクション): 受傷の「瞬間」の不随意反応(悲鳴/凍結/解離+身体徴候)を
//     促す。fix414(持続する機能制約)とは別軸。直近1〜2ターンの本文 + fix77 store差分から
//     新規重傷イベントを検出し、受傷から2ターン以内だけ急性フラグを立てる(ステートレス・
//     turn番号ベース・保存なし)。keeper(__f379reg・prio2)へ短文を注入。既定OFF(v292Dfix416On)。
//   B(fix416b 文体ノブ): 調整パネル(トップバー・fix308と同方式)に「文体 やさしい/標準/文学的」
//     セレクタを追加(保存キー v292StyleLevel)。やさしい/文学的のときだけ keeper(prio3)へ
//     文体指示を注入。標準は注入ゼロ(現行不変)。
//   注入は fix379 keeper 経由(__f379reg・Planner._extensionsは死に経路のため不使用)。
//   共通OFF=v292Dfix416Off(最優先)。冪等ガード __v292Dfix416。ES5風。
//   検証口: window.__v292Dfix416 = { preview(), lastEvents(), styleText(), level(), status() }。
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix416) return; G.__v292Dfix416Loaded = true;   // ロード痕(検証口は末尾で上書き)
  var TAG = '[v292Dfix416:pain-style]';

  // ---- 設定アクセサ ---------------------------------------------------
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function offAll(){ return ls('v292Dfix416Off') === '1'; }     // 最優先で全停止
  function onPain(){ return ls('v292Dfix416On') === '1'; }      // A(痛覚)は既定OFF・Onで有効
  function level(){ var v = ls('v292StyleLevel'); return (v === 'easy' || v === 'lit') ? v : 'std'; }
  function setLevel(v){ try { localStorage.setItem('v292StyleLevel', v); } catch(e){} }

  function store(){ try { return G.__v292Dfix77Store || {}; } catch(e){ return {}; } }
  function getS(){ try { return G.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ---- A: 重傷語彙と検出(pure) ----------------------------------------
  //   断裂/骨折/切断等は常に重傷。裂傷は近傍に軽傷語があれば除外(浅い裂傷=非急性)。
  var WINDOW = 2;   // 受傷ターンから WINDOW ターン以内だけ急性
  var SEVERE_SRC = '(断裂|切断|骨折|裂傷|深い傷|大量出血|大出血|多量出血|失血|貫通|抉れ|抉ら|えぐれ|えぐら|えぐり取|千切れ|ちぎれ|引き裂|切り落と|もぎ取|もげ|噛み千切|串刺し|刺し貫|射抜)';
  var LIGHT_NEAR = /(浅|軽|かすり|掠り|小さ|擦り傷|かすり傷|かする|軽傷)/;

  function scanSevereText(text){
    text = String(text || '');
    var re = new RegExp(SEVERE_SRC, 'g'), m, out = [];
    while ((m = re.exec(text))){
      var w = m[0];
      // 軽傷ガード: 「裂傷」だけは近傍窓に軽傷語があれば除外(断裂・骨折・切断等は無条件で重傷)
      if (w === '裂傷'){
        var ctx = text.slice(Math.max(0, m.index - 8), m.index + w.length + 4);
        if (LIGHT_NEAR.test(ctx)){ if (re.lastIndex === m.index) re.lastIndex++; continue; }
      }
      out.push(w);
      if (re.lastIndex === m.index) re.lastIndex++;   // ゼロ幅ループ回避
    }
    return out;
  }
  // turnsArr = [{ idx, text }] を走査し受傷イベント配列を返す(pure・windowは呼び出し側)
  function detectEvents(turnsArr){
    var out = [];
    (turnsArr || []).forEach(function(t){
      scanSevereText(t && t.text).forEach(function(w){ out.push({ turn: (t && t.idx), word: w }); });
    });
    return out;
  }

  // ---- fix77 store / S.turns からライブに窓を取る -----------------------
  function turnText(t){
    if (!t) return '';
    var parts = [];
    if (t.narrative)  parts.push(Array.isArray(t.narrative) ? t.narrative.join('\n') : String(t.narrative));
    if (t.playerText) parts.push(String(t.playerText));
    if (t.text)       parts.push(String(t.text));
    if (t.body)       parts.push(String(t.body));
    var cs = t._convSays;
    if (Array.isArray(cs)){ for (var i = 0; i < cs.length; i++){ if (cs[i] && cs[i].say) parts.push(String(cs[i].say)); } }
    return parts.join('\n');
  }
  function liveWindowTurns(){
    var out = [], S = getS();
    if (S && Array.isArray(S.turns)){
      var t = S.turns, n = t.length;
      for (var i = Math.max(0, n - WINDOW); i < n; i++){ out.push({ idx: i, text: turnText(t[i]) }); }
    }
    return out;
  }
  // fix77 store差分: 直近WINDOWターンで更新された(=e.turn が現在turnに近い)エントリの
  //   からだ/傷 に重傷語があれば急性(古傷は e.turn が古く窓外→除外)。
  function storeAcuteEvents(){
    var ev = [];
    try {
      var S = getS(); var n = (S && Array.isArray(S.turns)) ? S.turns.length : 0;
      var st = store();
      Object.keys(st).forEach(function(name){
        var e = st[name]; if (!e) return;
        var tn = (typeof e.turn === 'number') ? e.turn : -999;
        if (n - tn > WINDOW) return;                       // 古い状態更新は非急性
        var body = String(e.karada || '') + '。' + String(e.kizu || '');
        var w = scanSevereText(body);
        if (w.length) ev.push({ name: name, turn: tn, word: w[0], src: 'store' });
      });
    } catch(e){}
    return ev;
  }

  var _lastEvents = [];
  // ライブ検出(本文窓 + store差分)。副作用として _lastEvents を更新。
  function detectLive(){
    var bodyEv = detectEvents(liveWindowTurns()).map(function(e){ e.src = 'body'; return e; });
    var ev = bodyEv.concat(storeAcuteEvents());
    _lastEvents = ev;
    return ev;
  }
  function isAcuteLive(){ return detectLive().length > 0; }

  // ---- 注入文 ---------------------------------------------------------
  var PAIN_MARK = '【痛覚】';
  var PAIN_TEXT = '\n【痛覚】直前に重傷を負った者には、その瞬間の不随意反応を必ず描写する(型は人物と状態で選ぶ: 悲鳴・絶叫/声にならない息と凍結/解離した平板さ+身体徴候)。無反応や冷静な分析だけで流さない。';
  var STYLE_MARK = '【文体】';
  var STYLE_EASY = '\n【文体】地の文は中学生でも読める平易な語彙で書く。難読語・凝った比喩を避け、短い文を基調に。感情と身体感覚は具体的に描く。';
  var STYLE_LIT  = '\n【文体】比喩と余韻を豊かに、文学的な文体で。';

  // pure: 急性フラグ×On/Off から痛覚注入文を決める(node単体テスト用)
  function painInjection(acuteFlag, onFlag, offFlag){
    if (offFlag) return '';
    if (!onFlag) return '';        // A は既定OFF(プレビュー)
    return acuteFlag ? PAIN_TEXT : '';
  }
  // pure: 文体レベルから注入文を決める(std=空・node単体テスト用)
  function styleInjection(lv, offFlag){
    if (offFlag) return '';
    if (lv === 'easy') return STYLE_EASY;
    if (lv === 'lit')  return STYLE_LIT;
    return '';                     // 'std' 既定=注入なし
  }

  // keeper text 関数(ステートレス・毎ターン評価)
  function painTextFn(){
    try { return painInjection(isAcuteLive(), onPain(), offAll()); } catch(e){ return ''; }
  }
  function styleTextFn(){
    try { return styleInjection(level(), offAll()); } catch(e){ return ''; }
  }

  // ---- keeper 登録(__f379reg・A=prio2 / B=prio3・marker冪等) -----------
  function register(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      var haveP = false, haveS = false;
      for (var i = 0; i < reg.length; i++){
        if (reg[i] && reg[i].marker === PAIN_MARK)  haveP = true;
        if (reg[i] && reg[i].marker === STYLE_MARK) haveS = true;
      }
      if (!haveP) reg.push({ off: 'v292Dfix416Off', marker: PAIN_MARK,  prio: 2, text: painTextFn });
      if (!haveS) reg.push({ off: 'v292Dfix416Off', marker: STYLE_MARK, prio: 3, text: styleTextFn });
      try { console.log(TAG, 'registered to __f379reg (pain prio2 / style prio3)'); } catch(_){}
    } catch(e){}
  }

  // ---- B: 文体セレクタUI(fix308と同方式=#topbar へ span+select 挿入) --
  function inject(){
    try {
      var tb = document.getElementById('topbar'); if (!tb){ setTimeout(inject, 600); return; }
      if (document.getElementById('v292-style-sel')) return;
      var span = document.createElement('span');
      span.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
      span.innerHTML = '文体<select id="v292-style-sel" style="font-size:12px;max-width:110px;">'
        + '<option value="easy">やさしい</option>'
        + '<option value="std">標準</option>'
        + '<option value="lit">文学的</option></select>';
      var sel = span.querySelector('#v292-style-sel');
      sel.value = level();
      sel.addEventListener('change', function(){ setLevel(sel.value); });
      tb.appendChild(span);
      try { console.log(TAG, 'style selector injected (', level(), ')'); } catch(e){}
    } catch(e){ setTimeout(inject, 600); }
  }

  // ---- ブート(browserのみ・keeper登録は常時) --------------------------
  register();
  if (typeof document !== 'undefined'){
    inject();
    try { setInterval(inject, 3000); } catch(e){}
  }

  // ---- 検証口 ---------------------------------------------------------
  G.__v292Dfix416 = {
    preview:    function(){ return painTextFn(); },                 // 現在の痛覚注入文
    lastEvents: function(){ try { return detectLive(); } catch(e){ return []; } }, // 検出イベント一覧
    styleText:  function(){ return styleTextFn(); },
    level:      function(){ return level(); },
    status:     function(){ return { off: offAll(), on: onPain(), level: level(), names: Object.keys(store()) }; }
  };

  // ---- node単体テスト用エクスポート(browserでは module 未定義→skip) ----
  if (typeof module !== 'undefined' && module.exports){
    module.exports = {
      scanSevereText: scanSevereText,
      detectEvents: detectEvents,
      painInjection: painInjection,
      styleInjection: styleInjection,
      PAIN_TEXT: PAIN_TEXT, STYLE_EASY: STYLE_EASY, STYLE_LIT: STYLE_LIT,
      SEVERE_SRC: SEVERE_SRC, WINDOW: WINDOW
    };
  }
  try { console.log(TAG, 'loaded (painOn=' + (onPain() ? '1' : '0') + ', off=' + (offAll() ? '1' : '0') + ', level=' + level() + ')'); } catch(e){}
})();
