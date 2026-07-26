// =====================================================================
// Chronicle v292Dfix577: 物語削除の入口を1つに寄せる（B/Cの独自削除を停止）
// ---------------------------------------------------------------------
// ★経緯(2026-07-26・実コードの棚卸しで判明):
//   物語(スロット)を削除する入口が**3系統**あり、消す範囲がバラバラだった。
//     A home.html:delStory()          … 控えを取り、metaから外し、idの部分一致でサイドストアまで掃く
//     B v292Dfix310-gallery.js:deleteSave() … 控えなし。掃き出しが '_slot_'+id 固定のため
//        **chr6_v292Dfix54_genderMap_"<id>" のような引用符付きキーを取りこぼす**
//     C features.js:clearSlot()       … 本体1キーのみ。**metaにエントリを残す**(updatedAt=null)
//        → metaにidが残るので fix402c が「サーバmetaに有る」と判断し doomed にせず、
//          他端末が持つ本体が push→pull で戻ってくる（最悪の復活経路）
//
// ★GPT裁定「先に塞ぐべきです。削除経路が3系統ある状態のまま新しいtombstone方式を足すと、
//   移行中に旧経路が新設計を迂回します」
//   「正規サービスがまだ未搭載なら、**削除せず fail-closed** です。旧実装へ戻しません」
//
// ■このfixがやること
//   `window.__v292Dfix577.requestDelete(slotId, {source})` を用意する。
//     ・正規サービス `window.__chronicleStoryLifecycle` が居れば**そこへ委譲**する
//     ・居なければ**削除しない**。理由をユーザーへ伝え、記録して false を返す
//   B/C はこの関数を呼ぶだけにする（自前で removeItem しない）。
//
// ■このfixが絶対にやらないこと
//   自分で localStorage を削除すること。**削除の所有者をこれ以上増やさない**のが第0段の趣旨。
//   経路A(home.html)の挙動を変えること（Aは現時点で唯一まともな経路なので触らない）。
//
// 冪等: window.__v292Dfix577 / OFF: localStorage.v292Dfix577Off='1'
// 検証口: __v292Dfix577.requestDelete() / .log() / .stats()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix577) return;
  var TAG = '[v292Dfix577:delete-entry-guard]';

  function off(){ try { return localStorage.getItem('v292Dfix577Off') === '1'; } catch(e){ return false; } }

  /* 記録はメモリを正本にする。容量満杯のときに記録自体が失敗して無言になるのを避ける
     （fix575/fix576 で同じ型を踏んだ）。 */
  var LOG = [], LOG_MAX = 20;
  var stats = { requested: 0, delegated: 0, refused: 0, bySource: {} };
  function note(rec){
    try { rec.at = Date.now(); LOG.push(rec); if (LOG.length > LOG_MAX) LOG.shift(); } catch(e){}
  }

  function service(){
    try {
      var s = window.__chronicleStoryLifecycle;
      return (s && typeof s.requestDelete === 'function') ? s : null;
    } catch(e){ return null; }
  }

  /* ユーザーへ黙って失敗しない。何が起きたのか・どうすればよいのかを必ず伝える。 */
  function tellUser(msg){
    var told = false;
    try { if (typeof window.showToast === 'function'){ window.showToast(msg); told = true; } } catch(e){}
    try { if (!told && typeof window.alert === 'function'){ window.alert(msg); told = true; } } catch(e){}
    try { console.warn(TAG, msg); } catch(e){}
    return told;
  }

  var NOT_READY =
    '削除は「消したのに復活する」問題を直すため、安全な手順へ移行中です。\n' +
    'この画面からの削除は一時的に止めています。\n' +
    'ホーム画面（物語の一覧）からの削除をお使いください。';

  /* 戻り値: true = 正規サービスが受け付けた / false = 削除していない */
  function requestDelete(slotId, opts){
    opts = opts || {};
    var src = String(opts.source || 'unknown');
    stats.requested++;
    stats.bySource[src] = (stats.bySource[src] || 0) + 1;

    if (off()){
      /* 緊急停止。★それでも旧削除経路は復活させない（GPT裁定）。
         「止めたい」と「昔のやり方で消したい」は別物なので、ここでは何もしない。 */
      note({ act:'refused', slotId:slotId, source:src, why:'v292Dfix577Off=1（緊急停止。旧経路へは戻さない）' });
      stats.refused++;
      return false;
    }

    var s = service();
    if (!s){
      note({ act:'refused', slotId:slotId, source:src, why:'正規サービス(__chronicleStoryLifecycle)が未搭載' });
      stats.refused++;
      tellUser(NOT_READY);
      return false;
    }

    try {
      var r = s.requestDelete(slotId, { source: src });
      note({ act:'delegated', slotId:slotId, source:src, result:(r === false ? 'refused-by-service' : 'accepted') });
      stats.delegated++;
      return r !== false;
    } catch(e){
      note({ act:'refused', slotId:slotId, source:src, why:'正規サービスが例外: ' + String(e && e.message || e).slice(0,80) });
      stats.refused++;
      tellUser(NOT_READY);
      return false;
    }
  }

  window.__v292Dfix577 = {
    __armed: true,
    requestDelete: requestDelete,
    serviceAvailable: function(){ return !!service(); },
    log: function(){ return LOG.slice(); },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    isOff: off
  };
})();
