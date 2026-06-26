// =====================================================================
// Chronicle TRPG - v292Dfix326: #story スクロールの「たまに最上部へ巻き戻る」対処＋永続診断
//   背景(おしんと2026-06-24・計測ベース診断): 「展開の描写(#story)がたまに一番上に巻き戻る」。
//     計測で判明=renderAll/appendTurn/onStoryChange/ensureStory は全て最下部へ正しく送る
//     (scrollTopセッター・scrollイベントとも最上部化を一度も観測せず)。fix66のゲートは
//     #dialogue-stream専用で#storyは素通し。v248/249/254/261は未ロード。jumpToTurnはクリック時のみ。
//     →JS経路は全て潰せた。JSレベル計測で捕まらない＝残る容疑はブラウザの overflow-anchor
//     (内部でスクロール位置を動かす・JSセッターを呼ばない)。#storyは display:flex;overflow-y:auto
//     で overflow-anchor 指定が無く既定=auto(anchoring有効)。撤去された v261 が当てていた
//     overflow-anchor:none ガードが整理の過程で一緒に失われたのが遠因。
//   対処(低リスク・証拠ベース):
//     (1) #story に overflow-anchor:none を当てる(失われたガードの復活)。
//     (2) renderAll 後、次フレームで「再描画前に最下部に居たなら最下部へ」再アサート(timing保険)。
//     (3) 永続診断: #storyが「中身は長いのにscrollTopが最上部付近」になった瞬間を
//         localStorage 'v292_scrollDiag' に記録(setter経由=JS犯人/スタック付・event経由のみ=
//         anchor由来、を切り分け)。再発時の確定証拠＆本対処の効果検証に使う。
//   OFF: localStorage v292Dfix326Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix326) return; window.__v292Dfix326 = true;
  var TAG = '[v292Dfix326:storyscroll]';
  function off(){ try { return localStorage.getItem('v292Dfix326Off') === '1'; } catch(e){ return false; } }

  // (1) overflow-anchor:none ＋ スタイル
  try {
    if (!document.getElementById('v326-style')){
      var st = document.createElement('style'); st.id = 'v326-style';
      st.textContent = '#story{overflow-anchor:none;}';
      document.head.appendChild(st);
    }
  } catch(e){}

  var proto = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  function rawTop(el){ try { return proto.get.call(el); } catch(e){ return 0; } }
  function tall(el){ return el.scrollHeight > el.clientHeight * 2; }

  // (3) 永続診断ログ(最大15件)
  function diagLog(entry){
    try {
      var a = JSON.parse(localStorage.getItem('v292_scrollDiag') || '[]') || [];
      a.push(entry); while (a.length > 15) a.shift();
      localStorage.setItem('v292_scrollDiag', JSON.stringify(a));
    } catch(e){}
  }
  var sawSetterTopAt = 0;
  function armDiag(){
    var story = document.getElementById('story'); if (!story || story.__v326diag) return false;
    story.__v326diag = true;
    // setter 経由(JS犯人・スタック付き)
    try {
      Object.defineProperty(story, 'scrollTop', {
        configurable: true,
        get: function(){ return proto.get.call(this); },
        set: function(v){
          try { if (tall(this) && v < 120){ sawSetterTopAt = Date.now(); diagLog({via:'setter', to:Math.round(v), h:this.scrollHeight, stack:(new Error().stack||'').split('\n').slice(1,7).join(' << '), t:sawSetterTopAt}); } } catch(e){}
          return proto.set.call(this, v);
        }
      });
    } catch(e){}
    // event 経由(直前にsetterが無ければ anchor 由来の可能性大)
    story.addEventListener('scroll', function(){
      try {
        var top = rawTop(story);
        if (tall(story) && top < 120){
          var viaSetter = (Date.now() - sawSetterTopAt) < 50;
          if (!viaSetter) diagLog({via:'event(anchor?)', top:Math.round(top), h:story.scrollHeight, t:Date.now()});
        }
      } catch(e){}
    }, { passive:true });
    return true;
  }

  // (2) renderAll 後の最下部再アサート(再描画前に底に居た時だけ・読み返し中は触らない)
  function wrapRenderAll(){
    try {
      var UIo = (0,eval)('typeof UI!=="undefined"?UI:null') || window.UI;
      if (!UIo || typeof UIo.renderAll !== 'function' || UIo.renderAll.__v326) return false;
      var orig = UIo.renderAll.bind(UIo);
      UIo.renderAll = function(){
        var story = document.getElementById('story');
        var wasBottom = story ? (story.scrollHeight - rawTop(story) - story.clientHeight) < 80 : true;
        var r = orig.apply(this, arguments);
        if (!off() && story && wasBottom){
          try { requestAnimationFrame(function(){ try { proto.set.call(story, story.scrollHeight); } catch(e){} }); } catch(e){}
        }
        return r;
      };
      UIo.renderAll.__v326 = true;
      return true;
    } catch(e){ return false; }
  }

  (function poll(){ poll._n=(poll._n||0)+1; var a=armDiag(), b=wrapRenderAll(); if (a && b) { try{console.log(TAG,'armed');}catch(_){ } return; } if (poll._n>80) return; setTimeout(poll, 400); })();

  window.__v292Dfix326api = { readDiag: function(){ try { return JSON.parse(localStorage.getItem('v292_scrollDiag')||'[]'); } catch(e){ return []; } }, clearDiag: function(){ try { localStorage.removeItem('v292_scrollDiag'); } catch(e){} } };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
