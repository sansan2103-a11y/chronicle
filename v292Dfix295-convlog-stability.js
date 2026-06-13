// =====================================================================
// Chronicle TRPG - v292Dfix295: 会話ログのスクロール保持 + アイコン即同期
// ---------------------------------------------------------------------
// おしんFB(最新版)「スクロールが一番上に戻る／アイコンがたまにキャラと一致しない」。
// 原因: 会話ログ(#dialogue-stream)が修復スケジュール/新ターン/sweep等で再描画されるたび
//   (1)スクロール位置が失われて飛ぶ (2)再描画直後はimgのalt↔srcが一瞬ズレる。
// 対策(v292Dfix295c・時間窓方式):
//   ・ユーザーのscroll位置と「最下部にいたか」を常時記録。ただし【再描画(childList)の直後
//     350msのscroll変化は記録しない】= 再描画に伴うブラウザの自動スクロール(ユーザー操作で
//     はない)で記録が汚れるのを防ぐ(295/295bはここが甘く、トップに飛んだ値を拾っていた)。
//   ・childList検知→requestAnimationFrame で「記録済みのユーザー位置」へ復元
//     (最下部にいた=新ターン追従で最下部へ / 途中=読書位置を維持して飛ばさない)。
//   ・同時に fix197.sweep() を即実行して alt↔src(アイコン)を即同期=ズレ窓を潰す。
// OFF: localStorage v292ConvStabilityOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix295:convlog-stability]';
  if (window.__v292Dfix295) return;
  window.__v292Dfix295 = true;

  var GUARD_MS = 350;
  var stream = null;
  var lastTop = 0, atBottom = true;   // ユーザーの最後の意思(再描画起因の変化は含めない)
  var restoring = false, pending = false, lastCL = 0;

  function nearBottom(s){ return (s.scrollHeight - s.scrollTop - s.clientHeight) < 48; }

  function onScroll(){
    if (restoring) return;
    if (Date.now() - lastCL < GUARD_MS) return;   // 再描画直後の自動scrollは「ユーザー操作」として記録しない
    try { lastTop = stream.scrollTop; atBottom = nearBottom(stream); } catch(e){}
  }

  function restore(){
    pending = false;
    if (!stream || !document.body.contains(stream)) return;
    try {
      restoring = true;
      if (atBottom) stream.scrollTop = stream.scrollHeight;  // 新ターン等=最下部に追従
      else stream.scrollTop = lastTop;                       // 読書中=その位置を維持(飛ばさない)
      try { if (window.__v292Dfix197 && typeof window.__v292Dfix197.sweep === 'function') window.__v292Dfix197.sweep(); } catch(e){}
    } catch(e){}
    setTimeout(function(){ restoring = false; }, 80);
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
    lastCL = Date.now();              // 以降 GUARD_MS の scroll変化は記録しない
    if (pending) return;
    pending = true;
    requestAnimationFrame(restore);
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
    try { console.log(TAG, 'attached'); } catch(e){}
  }
  attach();
  try { setInterval(function(){ var s = document.getElementById('dialogue-stream'); if (s && s !== stream) attach(); }, 2000); } catch(e){}

  window.__v292ConvStability = { attach: attach, restore: restore, peek: function(){ return { lastTop: lastTop, atBottom: atBottom, sinceCL: Date.now()-lastCL }; } };
  try { console.log(TAG, 'loaded (c: 時間窓)'); } catch(e){}
})();
