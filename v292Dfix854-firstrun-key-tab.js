// =====================================================================
// Chronicle TRPG - v292Dfix854: API キー未設定が理由で設定パネルを開いた時だけ
//                               ⚙ システム タブを初期選択にする
// ---------------------------------------------------------------------
// ★真因(2026-09-16・まっさら profile の実測で確定 / gold/DS_UX_FIRSTRUN_P0P1_SWEEP_v1.md):
//   遊ぶのに必須の API キー欄 (#cfgKey) は fix275 の「⚙ システム」タブにあるのに、
//   設定パネルは既定タブ「🌍 世界」で開く。しかも
//     ・初回 (turns=0 かつ key 無し) の自動 open      → 🌍 世界
//     ・ターン送信時の「APIキーが未設定です」自動再open → 🌍 世界
//   のどちらでも 🌍 世界のままで、鍵がどのタブにあるかの案内が画面に無い
//   (「システム」という語は画面上タブのラベル 1 箇所のみ)。
//   ＝ 初見ユーザーは、唯一のブロック要因である API キー入力欄へ辿り着く手掛かりが無い。
//
// 設計(②C1 裁定 案(a)):
//   ・**API キー未設定が理由で開く 2 経路だけ**に効かせる。通常の手動 open は不触。
//     index.html 側は UI.openSettings('key-missing') と reason を渡すだけ
//     (既存の wrapper は features.js / fix418 とも orig.apply(this, arguments) なので素通りする)。
//   ・タブ切替は **fix275 の既存 UI をそのまま使う** = #v275tabs の sys ボタンを click する。
//     DOM を直接いじらないので、features.js の遅延 inject が起こす fix275 の
//     MutationObserver 再 render 後も選択が保たれる (cur は fix275 側の closure に入る)。
//   ・★記憶タブ設定 localStorage 'v292SettingsTab' は **元の値へ戻す**。
//     手動 open の既定挙動(=次回ロード時に前回タブを出す)を 1 バイトも変えないため。
//     removeItem を使うのは「自分の click が作った値」を消す時だけで、他人のキーには触らない。
//   ・#v275tabs はパネル生成後に arm されるので、最大 6 秒だけ 150ms 間隔で待つ(bounded)。
//   ・世界タブ / 設定 DOM / save semantics / schema は一切変更しない。
//
// 冪等ガード: window.__v292Dfix854
// OFF: localStorage v292Dfix854Off='1'（この fix だけ停止。従来どおり 🌍 世界で開く）
// 検証口: window.__v292Dfix854 = { focusSystemTab, isOff, TAB_SEL }
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix854:firstrun-key-tab]';
  if (window.__v292Dfix854) return;

  var TAB_SEL = '#v275tabs button[data-t="sys"]';
  var TAB_LS  = 'v292SettingsTab';
  var TRIES   = 40;      /* 40 * 150ms = 最大 6 秒 */
  var IVAL    = 150;

  function off(){ try { return localStorage.getItem('v292Dfix854Off') === '1'; } catch(e){ return false; } }

  /* 記憶タブ設定を保存 → click(既存切替) → 記憶タブ設定を元へ戻す */
  function clickSys(btn){
    var prev = null, had = false;
    try { prev = localStorage.getItem(TAB_LS); had = (prev !== null); } catch(e){}
    try { btn.click(); } catch(e){ return false; }
    try {
      if (had) localStorage.setItem(TAB_LS, prev);
      else     localStorage.removeItem(TAB_LS);   /* ★自分の click が作った値だけを消す */
    } catch(e){}
    return true;
  }

  function focusSystemTab(){
    if (off()) return false;
    var n = 0;
    (function tick(){
      if (off()) return;
      var btn = null;
      try { btn = document.querySelector(TAB_SEL); } catch(e){}
      if (!btn){ if (++n < TRIES) setTimeout(tick, IVAL); return; }
      if (clickSys(btn)){
        try { console.log(TAG, 'system tab selected (api key absent)'); } catch(e){}
      }
    })();
    return true;
  }

  window.__v292Dfix854 = { focusSystemTab: focusSystemTab, isOff: off, TAB_SEL: TAB_SEL, TAB_LS: TAB_LS };

  /* ★acceptance run1 で判明した実レース: G.init() の setTimeout(...,100) は
     まだこの file が parse される前に発火しうる(index.html は script 300 本を読む)。
     その場合 index.html 側の呼び出しは window.__v292Dfix854 が未定義で空振りする。
     そこで index.html は「合図(時刻)」も置き、この file は load 時にその合図を拾う。
     合図は 15 秒以内のものだけ有効(古い合図で勝手にタブを変えない)。 */
  try {
    var pend = window.__v292Dfix854KeyMissing;
    if (typeof pend === 'number' && (Date.now() - pend) < 15000) focusSystemTab();
  } catch(e){}

  try { console.log(TAG, 'loaded'); } catch(e){}
})();
