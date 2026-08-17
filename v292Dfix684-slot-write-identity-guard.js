// =====================================================================
// v292Dfix684 slot-write-identity-guard   (PRODUCTION_CONTAINMENT_CANDIDATE)
// 症状: 物語画面で ?story=A を開いているのに、遅れて到着した pull/適用が
//       別 story B の slot (chr6_slot_B) を上書きし、B のローカル最新版を壊す。
//       実測: URL story = A / chr6_active_slot = A なのに
//       fix399x.status().activeSlot が stale な B を指したまま pull が適用され、
//       chr6_slot_B が書き換わった（boot 時のみ発生。定期処理では発生しない）。
// 方針: 原因モジュール(fix399x / fix402 / bootPull)を作り替えない。
//       **最も狭い write boundary**（chr6_slot_* への setItem）で
//       「今の URL の story 以外の slot へは書かせない」だけを行う。
// ★current story id は初期化時にキャッシュせず、**setItem が呼ばれるたびに URL を読む**。
//   同一タブで story URL が変わっても、常に新しい URL story を正として判定する。
// ★Storage.prototype.setItem は fix654 のアクセサトラップ(get/set)になっており
//   prototype 代入は効かない（第18型の既知ハザード。実測で 1 件も止まらなかった）。
//   既存モジュール(fix543 等)と同じ **instance 代入**で登録する。
// 触らないもの: chr6_bk_guard_* / __gen_* / chr6_snapd_* / chr6_active_slot /
//               quasi 台帳 / chr6_slot_ 以外の全キー / getItem / removeItem
// 新規永続 schema を作らない。自前のキーを 1 つも書かない。
// kill switch: localStorage['v292Dfix684Off'] === '1'
// 検証口: window.__v292Dfix684 = { state, blocked, allowedCount, currentStory, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__f684done) return; window.__f684done = 1;
  var TAG = '[v292Dfix684:slot-write-identity]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix684Off') === '1'; }

  // ★呼び出しのたびに現在の URL から story を読む（キャッシュしない）
  function currentStory(){
    try { return new URLSearchParams(location.search).get('story') || ''; } catch(e){ return ''; }
  }

  var RE_SLOT = /^chr6_slot_(.+)$/;
  var blocked = [], allowed = 0;

  var orig;
  try { orig = localStorage.setItem; } catch(e){ return; }
  if (typeof orig !== 'function') return;

  localStorage.setItem = function(k, v){
    try {
      if (!off()){
        var m = RE_SLOT.exec(String(k));
        if (m){
          var story = currentStory();
          // story を持たない画面(ホーム等)では従来どおり通す
          if (story && m[1] !== story){
            if (blocked.length < 50){
              blocked.push({ key: String(k), slot: m[1], urlStory: story,
                             bytes: String(v == null ? '' : v).length, t: +new Date() });
            }
            try { console.warn(TAG, 'blocked cross-slot write', m[1], 'url=', story); } catch(e){}
            return;
          }
          if (story) allowed++;
        }
      }
    } catch(e){}
    return orig.apply(localStorage, arguments);
  };

  window.__v292Dfix684 = {
    __armed: true,
    currentStory: currentStory,
    blocked: function(){ return blocked.slice(); },
    allowedCount: function(){ return allowed; },
    state: function(){
      return { armed: !off(), urlStory: currentStory(), blockedCount: blocked.length,
               allowedSlotWrites: allowed, off: off() };
    }
  };
  try { console.log(TAG, 'loaded (default ON; off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
