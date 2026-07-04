// =====================================================================
// Chronicle TRPG - v292Dfix379: wrap-keeper（build wrap喪失レースの根治）
// v2(fix381同時): ブロックレジストリ化。以後のsys注入fixは window.__f379reg に
//   {off:'OFFキー', marker:'冪等マーカー', text:function(){return '\n【…】…';}} を
//   push するだけで、喪失レースを気にせず毎ターン確実に注入される。
// ---------------------------------------------------------------------
// 真因(2026-07-04実測): boot後にPlanner.buildが差し替えられるタイミング次第で、
//   fix363(種)/fix366(キャラ属性)/fix376(話者厳守)/fix377(口調)のbuildラップが
//   まるごと失われるロードがある（各fixの再試行は30秒で打ち切り＝差し替えを検知できない）。
// 対策: 2秒ポーリングで P.build.__f379 マーカーを監視し、消えていたら再ラップ。
//   各ブロックは元fixと同一文言・同一マーカー冪等・各fixのOFFスイッチを尊重。
//   元fixのラップが生きていれば sys マーカーで二重追加は起きない（共存安全）。
// OFF: localStorage v292Dfix379Off='1'（keeperのみ停止。各fix本体のOFFは従来どおり）
// =====================================================================
(function(){
  'use strict';
  if (window.__f379done) return; window.__f379done = 1;
  var TAG = '[v292Dfix379:wrap-keeper]';
  function off(){ try { return localStorage.getItem('v292Dfix379Off') === '1'; } catch(e){ return false; } }
  function offK(k){ try { return !!k && localStorage.getItem(k) === '1'; } catch(e){ return false; } }
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
  // ---- ブロックレジストリ（fix381以降もここに登録するだけで喪失レース知らず） ----
  window.__f379reg = window.__f379reg || [];
  var reg = window.__f379reg;
  reg.push({ off: 'v292Dfix363Off', marker: '【プレイヤーの種】', text: function(){ return SEED; } });
  reg.push({ off: 'v292Dfix366Off', marker: '【キャラ属性】', text: genderBlock });
  reg.push({ off: 'v292Dfix376Off', marker: '【話者厳守】', text: function(){ return SPK; } });
  reg.push({ off: 'v292Dfix377Off', marker: '【口調】', text: function(){
    try { return (window.__v292Dfix377x && window.__v292Dfix377x.block) ? window.__v292Dfix377x.block() : ''; } catch(e){ return ''; }
  } });

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
          for (var i = 0; i < reg.length; i++){
            var en = reg[i];
            try {
              if (!en || offK(en.off)) continue;
              if (en.marker && r.sys.indexOf(en.marker) >= 0) continue;
              var t = en.text ? en.text() : '';
              if (t) r.sys += t;
            } catch(e2){}
          }
        } catch(e){}
        return r;
      };
      w.__f379 = 1;
      try { w._f363mark = true; } catch(e){} // fix363のarmWrapに二重ラップさせない
      P.build = w;
      try { console.log(TAG, 're-armed Planner.build (' + reg.length + ' blocks)'); } catch(e){}
    } catch(e){}
  }
  ensure();
  setInterval(ensure, 2000);
  try { console.log(TAG, 'loaded v2 (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
