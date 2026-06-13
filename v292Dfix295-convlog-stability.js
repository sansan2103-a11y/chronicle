// =====================================================================
// Chronicle TRPG - v292Dfix295: 会話ログのスクロール保持 + アイコン即同期
// ---------------------------------------------------------------------
// おしんFB(最新版)「スクロールが一番上に戻る／アイコンがたまにキャラと一致しない」。
// 原因: 会話ログ(#dialogue-stream)が修復スケジュール/新ターン/sweep等で再描画される
//   たびに、(1)スクロール位置が失われて飛ぶ (2)再描画直後はimgのalt↔srcが一瞬ズレる
//   (fix197のsweepが1.5s間隔なので、再描画〜次sweepまでの窓でズレが見える)。
// 対策(再描画の犯人を問わず効く後段ガード):
//   ・scrollイベントでユーザーの読書位置と「最下部にいたか」を常時記録。
//   ・childList再描画を検知したら requestAnimationFrame で位置を復元
//     (最下部にいた=新ターン追従で最下部へ / 途中=読書位置を維持して飛ばさない)。
//   ・同時に fix197.sweep() を即実行して alt↔src(アイコン)を即同期=ズレ窓を潰す。
//   ・復元による scroll が再記録ループにならないよう __restoring フラグでガード。
// OFF: localStorage v292ConvStabilityOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix295:convlog-stability]';
  if (window.__v292Dfix295) return;
  window.__v292Dfix295 = true;

  var stream = null;
  var lastTop = 0, atBottom = true, restoring = false, pending = false;

  function nearBottom(s){ return (s.scrollHeight - s.scrollTop - s.clientHeight) < 48; }

  function onScroll(){
    if (restoring) return;
    try { lastTop = stream.scrollTop; atBottom = nearBottom(stream); } catch(e){}
  }

  function restore(){
    pending = false;
    if (!stream || !document.body.contains(stream)) return;
    try {
      restoring = true;
      if (atBottom) stream.scrollTop = stream.scrollHeight;   // 新ターン等=最下部に追従
      else stream.scrollTop = lastTop;                        // 読書中=その位置を維持(飛ばさない)
      // アイコンの alt↔src を即同期(再描画直後のズレ窓を潰す)
      try { if (window.__v292Dfix197 && typeof window.__v292Dfix197.sweep === 'function') window.__v292Dfix197.sweep(); } catch(e){}
    } catch(e){}
    // フラグ解除はscrollイベントが落ち着いてから
    setTimeout(function(){ restoring = false; }, 60);
  }

  function onMut(muts){
    if (localStorage.getItem('v292ConvStabilityOff') === '1') return;
    var hit = false;
    for (var i = 0; i < muts.length; i++){
      var m = muts[i];
      if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)){ hit = true; break; }
      if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'data-avpk')){ hit = true; break; }
    }
    if (!hit || pending) return;
    pending = true;
    requestAnimationFrame(restore);   // 再描画が一通り終わった次フレームで復元
  }

  var obs = null;
  function attach(){
    var s = document.getElementById('dialogue-stream');
    if (!s){ setTimeout(attach, 600); return; }
    if (s === stream && obs) return;
    stream = s;
    try { lastTop = s.scrollTop; atBottom = nearBottom(s); } catch(e){}
    s.removeEventListener('scroll', onScroll);
    s.addEventListener('scroll', onScroll, { passive: true });
    if (obs) obs.disconnect();
    obs = new MutationObserver(onMut);
    obs.observe(s, { childList: true, subtree: true, attributes: true, attributeFilter: ['src','data-avpk'] });
    try { console.log(TAG, 'attached to #dialogue-stream'); } catch(e){}
  }
  // #dialogue-stream は features.js が再生成することがある → 定期的に張り直し確認
  attach();
  try { setInterval(function(){ var s = document.getElementById('dialogue-stream'); if (s && s !== stream) attach(); }, 2000); } catch(e){}

  window.__v292Dfix295 = window.__v292Dfix295;
  window.__v292ConvStability = { attach: attach, restore: restore };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
