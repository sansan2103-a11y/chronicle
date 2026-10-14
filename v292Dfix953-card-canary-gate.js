// =====================================================================
// Chronicle TRPG - v292Dfix953: card canary gate（設定カードを届ける修正の canary 用の関所）
//   GPT 裁定 #125-GU: Canary 準備 GO（有効化は別途 Owner GO）。#125-GV: r2（fix951 節単位・A/B 腕、fix952 はカードの見出しだけ）。
//   この関所が true を返す時だけ、次の 3 つが動く。false の時、3 つとも本番（fix950 r2）と 1 バイトも同じ動き。
//     fix952 … fix459 に【設定カード】の見出しを登録（v292Dfix459-sys-v2.js）。【記憶】は登録しない（r2）
//     fix951 … fix313 のカード選択器（節単位の選択・A/B の枠・GM 分離・【】の無害化）（v292Dfix313-story-cards.js）
//     fix444g… fix444【世界の掟】の抽出元から GM 専用の記述を外す（v292Dfix444-world-law.js）
//
// ★true になる条件（両方とも必要。どちらかが欠ければ false＝本番どおり）
//   (a) この端末の localStorage.v292Dfix953On === '1'（開発者 PC で手で入れる。既定は無い＝OFF）
//   (b) この文書（タブ）の物語 ID が ALLOW に入っている。
//       物語 ID は window.__chronicleDocumentStoryKey（index.html の fix694 が起動時に 1 回だけ決める・不変）
//       の 'chr6_slot_<id>' から取る。sendgate（chrStoryId）と同じ出所。null / 'chr6'（既定スロット）/ ホーム → false。
//   さらに DENY（元の物語 smv6r10s7u9）は ALLOW に入っていても false。
// ★ALLOW は配信物に焼き込む（端末や利用者が書き換えられない）。canary 専用に複製した合成物語の ID だけを入れる。
//   tools/set_allowlist.py で書き換え、版札（cb / BUILT）をそろえて配信する。空のままなら、何をしても false。
// ★例外・関所の読込失敗 → false（fail-closed）。各部品も「関所が無い・例外」なら本番の動きを取る。
// ★この部品はストレージへ書かない・送信しない・DOM を触らない。読むのは localStorage の 1 キーと文書の物語 ID だけ。
// 検証口（読むだけ）: window.__v292Dfix953.status()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix953) return;
  var VERSION = 'fix953-r2-20261014';
  var TAG = '[v292Dfix953:card-canary]';
  var FLAG = 'v292Dfix953On';
  var ALLOW = [/*CANARY_ALLOW_BEGIN*/ 'smv82tjjai8', 'smv85pfjasb' /*CANARY_ALLOW_END*/];
  var DENY = ['smv6r10s7u9'];
  var ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  var st = { calls: 0, trueCalls: 0, errors: 0 };

  function flagOn(){ try { return localStorage.getItem(FLAG) === '1'; } catch(e){ return false; } }
  function isHome(){ try { return /\/home(\.html)?$/i.test(location.pathname); } catch(e){ return true; } }
  function docStoryId(){
    try {
      var k = window.__chronicleDocumentStoryKey;
      if (typeof k !== 'string' || k.indexOf('chr6_slot_') !== 0) return null;
      var id = k.slice(10);
      return ID_RE.test(id) ? id : null;
    } catch(e){ return null; }
  }
  function allowed(id){
    if (!id) return false;
    for (var i = 0; i < DENY.length; i++) if (DENY[i] === id) return false;
    for (var j = 0; j < ALLOW.length; j++) if (ALLOW[j] === id) return true;
    return false;
  }
  function active(){
    st.calls++;
    try {
      if (!ALLOW.length) return false;            // allowlist が空の配信物では、常に本番どおり
      if (!flagOn()) return false;
      if (isHome()) return false;
      if (!allowed(docStoryId())) return false;
      st.trueCalls++;
      return true;
    } catch(e){ st.errors++; return false; }
  }
  function status(){
    var id = docStoryId();
    return { version: VERSION, flagOn: flagOn(), docStoryId: id, storyAllowed: allowed(id), denied: !!id && DENY.indexOf(id) >= 0,
             allowCount: ALLOW.length, home: isHome(), active: (function(){ try { return !!ALLOW.length && flagOn() && !isHome() && allowed(id); } catch(e){ return false; } })(),
             calls: st.calls, trueCalls: st.trueCalls, errors: st.errors };
  }
  window.__v292Dfix953 = { __armed: true, version: VERSION, active: active, status: status };
  try { console.log(TAG, VERSION, 'allow=' + ALLOW.length); } catch(e){}
})();
