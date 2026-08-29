/* v292Dfix527-story-url.js (2026-07-25) — P2-c: 物語IDをURLで持つ
 *
 * 目的: 「今どの物語を開いているか」の真実を localStorage の共有1個から
 *       URL(タブ毎) へ移し、タブ間のセーブ汚染と pull 衝突を原理的に止める。
 *
 * 設計(設計書 §3/§6/§8):
 *   [1] 真実 = location.search の story。localStorage['chr6_active_slot'] は互換用のミラー。
 *       → 既存16ファイル約30箇所の"読み手"は無改修のまま動く。
 *   [2] ミラー固定: story が有効なら、このタブでは chr6_active_slot への"別idへの書換"を
 *       すべて遮断する。これで下記の汚染源が一括で塞がる。
 *         features.js 6258(読込)/8205(テンプレ→新slot) / fix310:147(削除) /
 *         ★fix399:274 applySave が「別端末の activeSlot」を書き戻す経路
 *   [3] 取り込み(pull)は物語画面で行わない(ホーム専用)。
 *       __v292Dfix399x.applySave を包んで拒否 + クラウド取込の confirm を自動キャンセル。
 *       push は安全なので従来どおり(fix402)。
 *   [4] fix525 の own を URL 由来に格上げ。
 *   [5] セーブ管理から「読込」を隠し、トップバーに「← ホーム」を出す。
 *
 * story が無い(旧URL直叩き)ときは何もしない = 完全な後方互換。
 * OFF = localStorage['v292Dfix527Off']='1'
 * 検証口 = window.__v292Dfix527
 */
(function v292Dfix527(){
  if (window.__v292Dfix527) return;
  var TAG = '[v292Dfix527]';
  var ACT = 'chr6_active_slot';
  var HOME = 'home.html';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix527Off') === '1'; }

  var storyId = null, blocked = 0, pullBlocked = 0, internalWrite = false;
  /* ★fix588: URLで指定された物語が削除済み(墓標あり)だったときのid。
     storyId は採用しないが、取り込み(pull)は止めなければならないので別に持つ。 */
  var deletedStoryId = null;

  function param(){
    try {
      var m = String(location.search || '').match(/[?&]story=([^&#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch(e){ return null; }
  }
  function metaIds(){
    var out = {};
    try { (JSON.parse(lsg('chr6_slots_meta') || '[]') || []).forEach(function(s){ if (s && s.id) out[String(s.id)] = 1; }); } catch(e){}
    out['default'] = 1; out['chr6'] = 1;
    return out;
  }
  /* ★fix588: 墓標(tombstone)が立った物語は**起動させない**。
     ここが抜けていた: 墓標は meta の中に居るので metaIds() が「既知のid」として通し、
     ?story=<削除済みid> でアプリが起動できてしまう。起動すると
       ・lastOpenedAt を墓標へ書く
       ・本体が消えている場合は空の物語として作り直され、S.save でローカルへ復活する
     という2つの復活経路になる。判定は fix579 を正本にし、未搭載時も自前で判定する（安全側）。 */
  function isDeletedStoryId(id){
    /* OFF = v292Dfix588Off … 起動遮断だけを止める（pull barrier(fix587)は別途生きている） */
    if (lsg('v292Dfix588Off') === '1') return false;
    var meta = null;
    try { meta = JSON.parse(lsg('chr6_slots_meta') || '[]'); } catch(e){ meta = null; }
    if (!Array.isArray(meta)) return false;
    try {
      var T = window.__v292Dfix579;
      if (T && typeof T.isTombstonedId === 'function') return !!T.isTombstonedId(id, meta);
    } catch(e){}
    /* ★GPT裁定(B): 起動を止める側は deleteOpId を要求しない。
       deleteOpId が欠けた「壊れた墓標」も**開かせない**（削除の再開はしない=fix587側の責務）。 */
    var want = String(id == null ? '' : id);
    for (var i = 0; i < meta.length; i++){
      var e2 = meta[i];
      if (e2 && e2.deleted === true && String(e2.id) === want) return true;
    }
    return false;
  }

  // ---- [2] ミラー固定 ---------------------------------------------------
  function installMirrorLock(){
    try {
      var ls = window.localStorage, _set = ls.setItem.bind(ls);
      if (_set.__f527) return;
      var wrapped = function(k, v){
        if (k === ACT && storyId && !internalWrite){
          var want = JSON.stringify(storyId);
          if (String(v) !== want){
            blocked++;
            try { console.warn(TAG, 'blocked active-slot rewrite:', String(v).slice(0, 24), '(this tab owns ' + storyId + ')'); } catch(e){}
            return;                       // 黙って捨てる(このタブの物語は動かさない)
          }
        }
        return _set(k, v);
      };
      wrapped.__f527 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      ls.setItem = wrapped;
    } catch(e){}
  }
  function setMirror(id){
    internalWrite = true;
    try { localStorage.setItem(ACT, JSON.stringify(id)); } catch(e){}
    internalWrite = false;
  }

  // ---- [3] 物語画面では取り込まない -------------------------------------
  function blockPull(){
    // (a) applySave を包んで拒否(fix399 bootPull も fix402 pullApplyReload も必ずここを通る)
    (function poll(){
      poll._n = (poll._n || 0) + 1;
      var api = window.__v292Dfix399x;
      if (api && typeof api.applySave === 'function' && !api.applySave.__f527){
        var inner = api.applySave;
        var w = function(pkg){
          /* ★fix588: 削除済み物語のURLで開かれたときも取り込みを止める（storyIdは採用しない） */
          if ((storyId || deletedStoryId) && !off()){
            pullBlocked++;
            try { console.warn(TAG, 'pull blocked in story page (取り込みはホームで行います)'); } catch(e){}
            return Promise.reject(new Error('取り込みはホーム画面で行います'));
          }
          return inner.apply(this, arguments);
        };
        w.__f527 = true;
        try { for (var p in inner){ if (!(p in w)) { try { w[p] = inner[p]; } catch(e){} } } } catch(e){}
        api.applySave = w;
        try { console.log(TAG, 'applySave guarded'); } catch(e){}
        return;
      }
      if (poll._n > 240) return;
      setTimeout(poll, 500);
    })();

    // (b) クラウド取込の confirm だけ自動キャンセル(対象メッセージをパターン限定・安全側の回答)
    try {
      var _c = window.confirm;
      if (!_c.__f527){
        var wc = function(msg){
          var s = String(msg || '');
          if (storyId && !off() && s.indexOf('クラウド') >= 0 && s.indexOf('取り込') >= 0){
            try { console.warn(TAG, 'auto-cancel cloud pull confirm (story page)'); } catch(e){}
            return false;                 // = 「この端末を保持」。データを壊さない側
          }
          return _c.apply(window, arguments);
        };
        wc.__f527 = true;
        window.confirm = wc;
      }
    } catch(e){}
  }

  // ---- [5] UI: 読込を隠す / ← ホーム -----------------------------------
  function hideLoadButtons(root){
    try {
      var bs = (root || document).querySelectorAll('[data-act="load"]');
      for (var i = 0; i < bs.length; i++){
        var b = bs[i];
        if (b.__f527hidden) continue;
        b.__f527hidden = 1; b.style.display = 'none';
      }
    } catch(e){}
  }
  // ★おしん要望(2026-07-25): トップバーの「セーブ」を「ホーム」に置き換える。
  //   物語の一覧・読込・新規作成・削除・書き出し/取り込み・同期は すべてホームへ集約したため、
  //   物語画面にセーブ管理を残す理由が無い(元のボタンは display:none で残す＝他fixのanchor探索を壊さない)。
  function injectHomeButton(){
    try {
      var anchor = document.querySelector('[title^="セーブ管理"]') || document.getElementById('v30-topbar-btn');
      if (!anchor || !anchor.parentNode) return false;
      if (document.getElementById('v527-home')){ anchor.style.display = 'none'; return true; }
      var b = document.createElement('button');
      b.id = 'v527-home';
      b.type = 'button';
      b.textContent = '🏠 ホーム';
      b.title = 'ホームへ戻る（今の物語は自動保存されます）';
      try { b.className = anchor.className || ''; } catch(e){}
      b.style.cssText = (anchor.getAttribute('style') || '') + ';cursor:pointer';
      b.addEventListener('click', function(){
        try { var S = window.S || (0,eval)('typeof S!=="undefined"?S:null'); if (S && typeof S.save === 'function') (typeof S.saveD==='function'?S.saveD('fix527.injectHomeButton'):S.save()); } catch(e){}
        setTimeout(function(){ try { location.href = HOME; } catch(e){} }, 150);
      });
      anchor.parentNode.insertBefore(b, anchor);
      anchor.style.display = 'none';                 // 「セーブ」を隠して同じ位置に「ホーム」を置く
      try { console.log(TAG, 'topbar: セーブ → ホーム'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  // ★fix527c: fix402 の分岐(fork)バナーの「別端末のつづき」は pull なので、物語画面では
  //   [3] の applySave ガードに阻まれて失敗する。押せない選択肢を出したままにせず、
  //   「ホームで取り込む」に付け替えてホームへ誘導する(取り込みはホームで安全に行える)。
  function fixForkBanner(){
    try {
      var el = document.getElementById('v292Dfix402-fork');
      if (!el || el.__f527) return;
      el.__f527 = 1;
      var bs = el.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++){
        var b = bs[i];
        if (String(b.textContent || '').indexOf('別端末') < 0) continue;
        var nb = b.cloneNode(false);                 // 元のリスナーを落とす
        nb.textContent = '🏠 ホームで取り込む';
        nb.addEventListener('click', function(){
          try { var S = window.S || (0,eval)('typeof S!=="undefined"?S:null'); if (S && typeof S.save === 'function') (typeof S.saveD==='function'?S.saveD('fix527.fixForkBanner'):S.save()); } catch(e){}
          setTimeout(function(){ try { location.href = HOME; } catch(e){} }, 150);
        });
        b.parentNode.replaceChild(nb, b);
        try { console.log(TAG, 'fork banner: 別端末のつづき → ホームで取り込む'); } catch(e){}
      }
    } catch(e){}
  }

  function watchUI(){
    try {
      hideLoadButtons(document); fixForkBanner();
      var mo = new MutationObserver(function(){ hideLoadButtons(document); injectHomeButton(); fixForkBanner(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch(e){}
    (function poll(){
      poll._n = (poll._n || 0) + 1;
      if (injectHomeButton()) return;
      if (poll._n > 120) return;
      setTimeout(poll, 500);
    })();
  }

  // ---- boot -------------------------------------------------------------
  function bootUI(){
    // ★UI(セーブ→ホーム / 読込を隠す)は ?story= の有無にかかわらず出す。
    //   旧URLで開いたままのタブからもホームへ戻れるようにするため。
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchUI, { once: true });
    else watchUI();
  }

  function boot(){
    if (off()) { try { console.log(TAG, 'off'); } catch(e){} return; }
    var q = param();
    if (!q) { try { console.log(TAG, 'no ?story= → 旧互換モード(UIのみ適用)'); } catch(e){} bootUI(); return; }
    /* ★fix588: 削除済み(墓標あり)の物語は開かない。ホームへ戻す。
       ・取り込み(pull)も先に止める … クラウドに残っている古い本体で復活させないため
       ・ミラー(chr6_active_slot)へ墓標idを書かない … 他fixの読み手が生きた物語だと誤解する
       ・lastOpenedAt も書かない（墓標を触らない）
       誤判定でループしないこと: home.html は ?story= を持たないので、戻り先で再判定は起きない。 */
    if (isDeletedStoryId(q)){
      deletedStoryId = q;
      try { blockPull(); } catch(e){}
      try { console.warn(TAG, 'deleted story in URL → ホームへ戻します: ' + q); } catch(e){}
      /* ★GPT裁定(A): 理由は**URLに載せず**、端末内の一回限りの通知で渡す。
         履歴ループを避けるため遷移は location.replace()。 */
      try { sessionStorage.setItem('chr6_home_notice',
              'この物語は削除済みのため開けません。復元が必要なときは、削除時の控えから戻せます。'); } catch(e){}
      try { location.replace(HOME); } catch(e){}
      return;
    }
    if (!metaIds()[q]) { try { console.warn(TAG, 'unknown story id in URL → 旧互換モード(UIのみ適用)'); } catch(e){} bootUI(); return; }

    storyId = q;
    window.__chronicleStoryId = storyId;
    setMirror(storyId);
    installMirrorLock();
    blockPull();

    // lastOpenedAt を更新(表示用・同一性キーではない)
    /* ★★fix748 + 裁定11 GATE3: chr6_slots_meta は protected domain（本体の companion key）。
       この boot 時 write は GWS を通っていなかった（GLOBAL_WRITE_BYPASS_AUDIT で検出）。
         分類 = Class C
         RECOMPUTATION_SOURCE  = chr6_slots_meta 自身。この write を失っても直前の lastOpenedAt が
                                 残るだけで、物語データにも同一性にも影響しない **表示用フィールド**
         RECOMPUTATION_TRIGGER = 次にこの story を開いたとき（毎 boot 必ず実行される）
       ★「開けなかった」ことにはしない（story を開く操作そのものは成功してよい）ので Class D ではない。 */
    try {
      var meta = JSON.parse(lsg('chr6_slots_meta') || '[]') || [];
      var hit = false;
      for (var i = 0; i < meta.length; i++){ if (meta[i] && String(meta[i].id) === storyId){ meta[i].lastOpenedAt = new Date().toISOString(); hit = true; break; } }
      if (hit){
        var A748 = null;
        try { A748 = window.__v292DfixDAdm; } catch(_){}
        if (A748 && typeof A748.registerC === 'function')
          A748.registerC('fix527.lastOpenedAt',
            'chr6_slots_meta 自身（失っても直前の lastOpenedAt が残るだけ。表示用で同一性には影響しない）',
            '次にこの story を開いたとき（毎 boot）',
            'C17 story-url lastOpenedAt / companion of chr6_slot_');
        if (A748 && typeof A748.persistC === 'function')
          A748.persistC('fix527.lastOpenedAt', function(){ localStorage.setItem('chr6_slots_meta', JSON.stringify(meta)); });
        else localStorage.setItem('chr6_slots_meta', JSON.stringify(meta));
      }
    } catch(e){}

    // fix525 の own を URL 由来へ
    (function poll(){
      poll._n = (poll._n || 0) + 1;
      try { if (window.__v292Dfix525 && window.__v292Dfix525._setOwn){ window.__v292Dfix525._setOwn(storyId); return; } } catch(e){}
      if (poll._n > 60) return;
      setTimeout(poll, 500);
    })();

    bootUI();

    try { console.log(TAG, 'story=' + storyId + ' (URL authoritative)'); } catch(e){}
  }

  window.__v292Dfix527 = {
    state: function(){ return { storyId: storyId, deletedStoryId: deletedStoryId, off: off(),
                                blockedWrites: blocked, blockedPulls: pullBlocked, urlParam: param() }; },
    isDeletedStoryId: isDeletedStoryId,
    storyId: function(){ return storyId; },
    homeUrl: HOME
  };

  boot();   // ★同期実行(DOMContentLoaded前)＝fix30 bootLoadActiveSlot より先にミラーを確定させる
})();
