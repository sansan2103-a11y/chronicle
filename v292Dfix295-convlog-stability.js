// =====================================================================
// Chronicle TRPG - v292Dfix295: 会話ログのスクロール保持 + アイコン即同期
// ---------------------------------------------------------------------
// おしんFB(最新版)「スクロールが一番上に戻る／アイコンがたまにキャラと一致しない」。
// 原因: 会話ログ(#dialogue-stream)が修復スケジュール/新ターン/sweep等で再描画される
//   たびに、(1)スクロール位置が失われて飛ぶ (2)再描画直後はimgのalt↔srcが一瞬ズレる。
// 対策(再描画の犯人を問わず効く後段ガード):
//   ・scrollイベントでユーザーの読書位置と「最下部にいたか」を常時記録。
//   ・childList再描画を検知したら、その瞬間のユーザー位置を frozenTop に凍結し、
//     以降のscrollイベント(再描画に伴うブラウザの自動スクロール=ユーザー操作ではない)を
//     一時的に無視する。requestAnimationFrame で frozenTop に復元
//     (最下部にいた=新ターン追従で最下部へ / 途中=読書位置を維持して飛ばさない)。
//   ・同時に fix197.sweep() を即実行して alt↔src(アイコン)を即同期=ズレ窓を潰す。
//   ※ v292Dfix295b: 凍結機構が無いと「再描画後の自動scroll変化」を拾って記録先が汚れ、
//     復元しても0(トップ)のままになる不具合があった(実機検証で発見→修正)。
// OFF: localStorage v292ConvStabilityOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix295:convlog-stability]';
  if (window.__v292Dfix295) return;
  window.__v292Dfix295 = true;

  var stream = null;
  var lastTop = 0, atBottom = true;        // ユーザーの最後の意思
  var restoring = false, frozen = false, pending = false;
  var frozenTop = 0, frozenAtBottom = true;

  function nearBottom(s){ return (s.scrollHeight - s.scrollTop - s.clientHeight) < 48; }

  function onScroll(){
    // 復元中・凍結中(再描画に伴う自動スクロール)は「ユーザー操作」として記録しない
    if (restoring || frozen) return;
    try { lastTop = stream.scrollTop; atBottom = nearBottom(stream); } catch(e){}
  }

  function restore(){
    pending = false;
    if (!stream || !document.body.contains(stream)){ frozen = false; return; }
    try {
      restoring = true;
      if (frozenAtBottom) stream.scrollTop = stream.scrollHeight;  // 新ターン等=最下部に追従
      else stream.scrollTop = frozenTop;                           // 読書中=その位置を維持(飛ばさない)
      try { if (window.__v292Dfix197 && typeof window.__v292Dfix197.sweep === 'function') window.__v292Dfix197.sweep(); } catch(e){}
    } catch(e){}
    setTimeout(function(){ restoring = false; frozen = false; }, 80);
  }

  function onMut(muts){
    if (localStorage.getItem('v292ConvStabilityOff') === '1') return;
    var hit = false;
    for (var i = 0; i < muts.length; i++){
      var m = muts[i];
      if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)){ hit = true; break; }
      if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'data-avpk')){ hit = true; break; }
    }
    if (!hit) return;
    if (!frozen){ frozenTop = lastTop; frozenAtBottom = atBottom; frozen = true; }  // 再描画前のユーザー位置を確定
    if (pending) return;
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
  attach();
  try { setInterval(function(){ var s = document.getElementById('dialogue-stream'); if (s && s !== stream) attach(); }, 2000); } catch(e){}

  window.__v292ConvStability = { attach: attach, restore: restore, peek: function(){ return { lastTop: lastTop, atBottom: atBottom, frozen: frozen }; } };
  try { console.log(TAG, 'loaded (b: 凍結機構)'); } catch(e){}
})();
