// v267-fresh-start-confirm.js
// 目的: welcome 画面の quickstart クリック時、過去ターンが残っていれば
//       「リセットして新規開始しますか?」を確認、OK なら turns/state を初期化
//
// 背景:
//   localStorage.chr6 は永続。welcome を消しても turns は残るため、
//   前回のセッションで死んだキャラ・進行状況が新シーンに混在 → 文脈崩壊。
//
// 実装:
//   - #welcome 内の click を capture phase で hook
//   - S.turns.length > 0 なら confirm() ダイアログ
//   - OK → 即時 reset (turns=[], NPC state を初期値に戻す) → 元の click を再発火
//   - Cancel → そのまま継続 (既存ターンに新ターンを追加)
//
// ガード: window.__v267Active

(function v267() {
  'use strict';
  if (window.__v267Active) return;
  window.__v267Active = true;
  console.log('[v267] fresh-start-confirm init');

  function resetGame() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.turns = [];
      if (s.scene) s.scene.branches = [];

      function resetCharState(c) {
        if (!c || !c.state) return;
        c.state.alive = true;
        c.state.conscious = true;
        c.state.canSpeak = true;
        c.state.canAct = true;
        c.state.condition = '健康';
        c.state.hpEstimate = 100;
        c.state.bodyParts = {};
        c.state.restraints = [];
        c.state.injuryLog = [];
        c.state.recentEvents = [];
        c.state.trauma = [];
        delete c.state.diedAtTurn;
        delete c.state.lastReason;
      }
      resetCharState(s.cast && s.cast.hero);
      (s.cast && s.cast.npcs || []).forEach(function (n) {
        resetCharState(n);
        if (n) {
          n.emotion = '中立';
          if (typeof n.stress === 'number') n.stress = 50;
          if (typeof n.trust === 'number') n.trust = 0;
          if (typeof n.intimacy === 'number') n.intimacy = 0;
          n.keyMoments = [];
        }
      });

      window.__v259Writing = true;
      try { localStorage.setItem('chr6', JSON.stringify(s)); }
      finally { setTimeout(function () { window.__v259Writing = false; }, 500); }

      if (typeof S !== 'undefined') {
        S.turns = [];
        if (S.scene) S.scene.branches = [];
        if (s.cast) {
          if (S.cast && s.cast.hero) S.cast.hero = s.cast.hero;
          if (S.cast && s.cast.npcs) S.cast.npcs = s.cast.npcs;
        }
      }

      try { if (typeof UI !== 'undefined' && UI.renderAll) UI.renderAll(); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI.renderBranches) UI.renderBranches([]); } catch (e) {}
      try { if (typeof UI !== 'undefined' && UI._showIntro) UI._showIntro(); } catch (e) {}

      var stream = document.getElementById('dialogue-stream');
      if (stream) stream.innerHTML = '';
      console.log('[v267] game reset complete');
      return true;
    } catch (e) {
      console.warn('[v267] reset err:', e && e.message);
      return false;
    }
  }

  function hookWelcome() {
    var welcome = document.getElementById('welcome');
    if (!welcome) return false;
    if (welcome.__v267Hooked) return true;
    welcome.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== welcome && t.tagName !== 'BUTTON' && t.tagName !== 'A') t = t.parentNode;
      if (!t || (t.tagName !== 'BUTTON' && t.tagName !== 'A')) return;
      // 「設定」など、ゲーム開始以外のボタンは除外（label で判定）
      var label = (t.textContent || '').trim();
      if (/設定|settings/i.test(label)) return;

      var hasPrevious = false, prevCount = 0;
      try {
        if (typeof S !== 'undefined' && S.turns && S.turns.length > 0) {
          hasPrevious = true;
          prevCount = S.turns.length;
        }
      } catch (err) {}
      if (!hasPrevious) return;

      // すでに過去ターンがある → 確認ダイアログ
      e.stopPropagation();
      e.preventDefault();
      var msg = '前回までの物語が残っています（' + prevCount + ' ターン）。\n\n' +
                'リセットして新規開始しますか？\n\n' +
                'OK = 過去のターン・NPC 状態をリセットして新規開始\n' +
                'キャンセル = 続きから（既存ターンに新展開を追加）';
      var doReset = window.confirm(msg);
      if (doReset) {
        resetGame();
        // リセット後、ユーザーが押したボタンを再度クリックして新規開始
        setTimeout(function () {
          try { t.click(); } catch (err) {}
        }, 150);
      } else {
        // 続きから: そのまま元のクリックを実行
        setTimeout(function () {
          try {
            // 元の click を再発火（confirm でブロックしたため）
            // capture phase でブロックしているので、bubble を回避するため inline onclick を呼ぶ
            var inline = t.getAttribute('onclick');
            if (inline) {
              try { (new Function(inline)).call(t); } catch (err) {}
            }
          } catch (err) {}
        }, 50);
      }
    }, true); // capture phase
    welcome.__v267Hooked = true;
    console.log('[v267] welcome hooked');
    return true;
  }

  hookWelcome();
  setTimeout(hookWelcome, 500);
  setTimeout(hookWelcome, 2000);
  setTimeout(hookWelcome, 5000);
  // welcome の DOM が後から作られる可能性があるので MutationObserver
  try {
    var mo = new MutationObserver(function () { hookWelcome(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 30000);
  } catch (e) {}

  window.__v267 = { resetGame: resetGame };

  console.log('[v267] init complete');
})();
