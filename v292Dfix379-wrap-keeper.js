// =====================================================================
// Chronicle TRPG - v292Dfix379: wrap-keeper（build wrap喪失レースの根治）
// ---------------------------------------------------------------------
// 真因(2026-07-04実測): boot後にPlanner.buildが差し替えられるタイミング次第で、
//   fix363(種)/fix366(キャラ属性)/fix376(話者厳守)/fix377(口調)のbuildラップが
//   まるごと失われるロードがある（各fixの再試行は30秒で打ち切り＝差し替えを検知できない）。
//   実測: 傍受で4ブロック全滅のロードを確認。話者厳守が消えたターンで誤帰属再発の疑い。
// 対策: 2秒ポーリングで P.build.__f379 マーカーを監視し、消えていたら再ラップ。
//   ラップは4ブロックをまとめて復元（各ブロックは元fixと同一文言・同一マーカー冪等・
//   各fixのOFFスイッチをそのまま尊重）。元fixのラップが生きていれば sys マーカーで
//   二重追加は起きない（共存安全）。
// OFF: localStorage v292Dfix379Off='1'（keeperのみ停止。各fix本体のOFFは従来どおり）
// =====================================================================
(function(){
  'use strict';
  if (window.__f379done) return; window.__f379done = 1;
  var TAG = '[v292Dfix379:wrap-keeper]';
  function off(){ try { return localStorage.getItem('v292Dfix379Off') === '1'; } catch(e){ return false; } }
  function offK(k){ try { return localStorage.getItem(k) === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  var SEED = '\n【プレイヤーの種】プレイヤーがDO/SAY/STORYで書き込む内容は、この物語の種である。入力に現れた固有名詞・場所・小道具・意図・思いつきは使い捨てにせず物語の記憶として拾い上げ、のちの展開で芽吹かせて意味を持たせる。入力を素通りさせたり打ち消したりせず、その方向へ世界を確かに動かして応える。';
  var SPK = '\n【話者厳守】主人公が話しかけた直後の返答セリフは、返答した本人の<say 名前>タグで書く（主人公のタグに入れない）。万一セリフを地の文の「」で書く場合は、直前の文に必ずその話者の名前を書く。';
  function genderBlock(){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      var parts = [];
      var h = S.cast.hero;
      if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
      (S.cast.npcs || []).forEach(function(n){ if (n && n.name && n.gender) parts.push(n.name + '=' + n.gender); });
      if (!parts.length) return '';
      return '\n【キャラ属性】' + parts.join('、') + '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。';
    } catch(e){ return ''; }
  }
  function ensure(){
    if (off()) return;
    try {
      var P = window.Planner || (0,eval)('typeof Planner!=="undefined" ? Planner : null');
      if (!P || typeof P.build !== 'function' || P.build.__f379) return;
      var ob = P.build;
      var w = function(){
        var r = ob.apply(this, arguments);
        try {
          if (off() || !r || typeof r.sys !== 'string') return r;
          if (!offK('v292Dfix363Off') && r.sys.indexOf('【プレイヤーの種】') < 0) r.sys += SEED;
          if (!offK('v292Dfix366Off') && r.sys.indexOf('【キャラ属性】') < 0){ var g = genderBlock(); if (g) r.sys += g; }
          if (!offK('v292Dfix376Off') && r.sys.indexOf('【話者厳守】') < 0) r.sys += SPK;
          if (!offK('v292Dfix377Off') && r.sys.indexOf('【口調】') < 0 && window.__v292Dfix377x && window.__v292Dfix377x.block){
            var b = window.__v292Dfix377x.block();
            if (b) r.sys += b;
          }
        } catch(e){}
        return r;
      };
      w.__f379 = 1;
      try { w._f363mark = true; } catch(e){} // fix363のarmWrapに二重ラップさせない
      P.build = w;
      try { console.log(TAG, 're-armed Planner.build (seed/gender/speaker/voice)'); } catch(e){}
    } catch(e){}
  }
  ensure();
  setInterval(ensure, 2000);
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
