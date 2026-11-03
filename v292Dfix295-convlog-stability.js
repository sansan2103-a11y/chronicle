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
//   ・childList検知→setTimeout(0) で「記録済みのユーザー位置」へ復元(バックグラウンドタブでも動く)
//     (最下部にいた=新ターン追従で最下部へ / 途中=読書位置を維持して飛ばさない)。
//   ・同時に fix197.sweep() を即実行して alt↔src(アイコン)を即同期=ズレ窓を潰す。
// v292Dfix295e (laneCONV 2026-11-03・LOCAL 候補): 「新しいターンのあと会話ログが上端(0)へ戻る」の根治。
//   実測の型: ログを空にしてから組み直す経路で、空のまま layout が走る(例: EDIT01 の clearStream→UI.renderAll は
//   _scroll が #story.scrollHeight を読む＝組み直し前に layout)と、ブラウザが scrollTop を 0 に丸める。その後、
//   (1) 最下部へ戻す書き込みが fix222 の門(__convPinned=false)で拒否される → 0 のまま残る。
//       __convPinned=false は「↓ 最新へ」・慣性スクロール・scrollbar で最下部へ着いたとき実測で残っていた(295 は最下部と記録)。
//   (2) 復元より先に 0 の scroll イベントが届き、GUARD_MS を過ぎていると lastTop=0/atBottom=false と記録 → 以後ずっと 0 へ戻す。
//   直し(3 点・新しい timer / observer なし):
//   a) 再描画後の復元がまだ済んでいない間(pending)の scroll は記録しない(時間窓に加えて順序で守る)。
//   b) 利用者のスクロールで最下部と記録したときは window.__convPinned=true にそろえる(2 つの見張りの食い違いを無くす)。
//   c) 最下部への書き込みが通らなかったら(最下部に届いていない)、記録済みの lastTop へ戻す(0 に置き去りにしない)。
//   d) 装着(attach)時は atBottom=true(最新へ追従)で始め、1 回だけ restore する。実測: 物語を開き直すと会話ログは UI1 の
//      自動たたみ(turns=0 の間 display:none)の中でカードが入り、fix66 の最下部 snap が空振り→未スクロールの 0 のまま表示。
//      295 の装着がその後だと lastTop=0/atBottom=false を「利用者の位置」として記録し、次の再描画・新ターンで 0 へ戻していた。
//   kill: localStorage v292Dfix295eOff='1' → 295d と同じ挙動。
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
  function eOff(){ try { return localStorage.getItem('v292Dfix295eOff') === '1'; } catch(e){ return false; } }   // v292Dfix295e kill

  function onScroll(){
    if (restoring) return;
    if (pending && !eOff()) return;               // v292Dfix295e(a): 復元前の scroll は再描画の副作用(0 への丸め等)。記録しない
    if (Date.now() - lastCL < GUARD_MS) return;   // 再描画直後の自動scrollは「ユーザー操作」として記録しない
    try { lastTop = stream.scrollTop; atBottom = nearBottom(stream); } catch(e){}
    if (atBottom && !eOff()) { try { window.__convPinned = true; } catch(e){} }   // v292Dfix295e(b): fix222 の追従フラグとそろえる
  }

  function restore(){
    pending = false;
    if (!stream || !document.body.contains(stream)) return;
    try {
      restoring = true;
      if (atBottom) {
        stream.scrollTop = stream.scrollHeight;              // 新ターン等=最下部に追従
        if (!eOff() && !nearBottom(stream)) stream.scrollTop = lastTop;   // v292Dfix295e(c): 門で拒否された→0 に残さず記録位置へ
      }
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
    setTimeout(restore, 0);   // v292Dfix295d: rAFはバックグラウンドタブで止まる→setTimeoutで確実に復元
  }

  var obs = null;
  function attach(){
    var s = document.getElementById('dialogue-stream');
    if (!s){ setTimeout(attach, 600); return; }
    if (s === stream && obs) return;
    stream = s;
    try { lastTop = s.scrollTop; atBottom = eOff() ? nearBottom(s) : true; } catch(e){}   // v292Dfix295e(d): 装着時はまだ利用者の選択が無い＝最新へ追従(fix222 の既定と同じ)。未スクロールの 0 を「上で読書中」と取らない
    if (!eOff()) { pending = true; setTimeout(restore, 0); }                              // v292Dfix295e(d): 装着時に 1 回だけ最新へ(隠れている間に入ったカードで上端に残らない)
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
  try { console.log(TAG, 'loaded (e: 時間窓+setTimeout+pending/pinned/fallback)'); } catch(e){}
})();
