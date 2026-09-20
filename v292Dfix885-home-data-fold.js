// =====================================================================
// Chronicle TRPG - v292Dfix885: HOME_DATA_MANAGEMENT_FOLD_V1
//   (lane 16 / GPT 裁定 #L16entry / sp11a)
// ---------------------------------------------------------------------
// ■ これは何か
//   ホーム左袖の「データ」欄を **player 向けに減らす**。DOM の **移動だけ**で、
//   ボタン・id・handler・保存経路は 1 バイトも変えない。
//     【常に見える】 いま上げる / いま取り込む（手動同期）＋ ログイン関係
//     【データの管理】既定で閉じた details。書き出す / 取り込む / 容量を空ける / 保存容量
//     【同期の知らせ】画面上の一行診断を、既定では畳んだ詳細の中へ入れる
//
// ■ 裁定で決まっている境界（守らないと実装ミス）
//   MANUAL_SYNC_STAYS_TOP … 手動同期の 2 ボタンは **常に見える位置のまま**。
//                            降格は sp11b（連続同期の信頼性が緑になってから）。
//   NO_ADMIN_MOVE        … ここは player 側を減らすだけ。運営者向けの画面へは何も移さない。
//   NO_ID_CHANGE         … expBtn / impBtn / impFile / gcBtn / capMeter の id を変えない。
//                          addEventListener は node に付いているので移動しても切れない。
//   FIX243_UNTOUCHED     … 物語画面の折りたたみ許可表には触らない。「セーブ」は外さない。
//   FIX248_UNTOUCHED     … 他所の style.display 制御に割り込まない。
//                          #gLoginBtn / #g667btn / #loginState は 1 バイトも触らない。
//   FIXP0_UNTOUCHED      … シナリオテンプレ封鎖を解除しない。
//   LS_WRITE_0           … localStorage へ 1 バイトも書かない（読むのは gate key だけ）。
//   NO_NETWORK           … fetch / XHR 0。
//
// ■ 表示 gate（fix880 と同じ鍵を **読むだけ**。権限ではない）
//     localStorage['v292DevMode']==='1'
//   ｜localStorage['v292Dfix867ShowCodes']==='1'
//   ｜localStorage['v292ProxyShowUrl']==='1'
//   gate が入っているときは一行診断を畳まない（開発者はそのまま読める）。
//
// 検証口: window.__v292Dfix885 = { version, api }
// kill:  localStorage['v292Dfix885Off'] = '1'  → 何もしない（sp10b と同じ DOM）
//        localStorage['v292Lane16Off']  = '1'  → 同上（lane 16 の一括停止）
//        ★kill は **この patch が実行時に動かした分**を戻す。HTML 側に静的に書いた
//          script tag と BUILT 文字列は戻らない（戻すのは release rollback）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix885) return;
  var TAG = '[v292Dfix885:home-data-fold]';
  var VERSION = 'v292Dfix885-20260919-sp11a-v1.0';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix885Off') === '1' || lsg('v292Lane16Off') === '1'; }
  /* ★裁定 F2 の構造を踏襲: 既存 opt-in key を残したまま OR で束ねる。 */
  var DEV_KEYS = ['v292DevMode', 'v292Dfix867ShowCodes', 'v292ProxyShowUrl'];
  function devOn(){
    for (var i = 0; i < DEV_KEYS.length; i++){ if (lsg(DEV_KEYS[i]) === '1') return true; }
    return false;
  }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* 畳む対象（A16 / A17 / A18 / A19）。順序はこの配列のとおりに並べ直す。 */
  var FOLD_IDS = ['expBtn', 'impBtn', 'impFile', 'gcBtn', 'capMeter'];
  /* ★常に見える位置に残すもの（A14 / A15）。sp11a では 1 つも動かさない。 */
  var KEEP_TOP = ['upBtn', 'downBtn'];
  /* ★触らないもの（ログイン導線）。移動も非表示も **しない**。 */
  var NEVER_TOUCH = ['gLoginBtn', 'g667btn', 'loginState'];

  var stats = { applies: 0, moved: 0, built: false, noteFolded: 0, noteSeen: 0 };

  /* ---------- CSS（畳みの見た目だけ。既存要素の display には触らない） ---------- */
  function injectStyle(){
    if (el('v885css')) return;
    var css = [
      'aside details.v885-fold{border:1px solid rgba(139,118,240,.30);border-radius:8px;',
      '  padding:6px 8px;margin-top:8px;background:rgba(255,255,255,.02)}',
      'aside details.v885-fold > summary{cursor:pointer;font-size:12px;opacity:.9;list-style:revert}',
      'aside details.v885-fold[open] > summary{margin-bottom:8px}',
      'aside details.v885-fold .v885-note{font-size:11px;opacity:.7;line-height:1.5;margin:2px 0 6px}',
      '#note details.v885-diag{display:inline-block;margin:2px 0}',
      '#note details.v885-diag > summary{cursor:pointer;opacity:.8;text-decoration:underline;list-style:none}',
      '#note details.v885-diag > summary::-webkit-details-marker{display:none}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'v885css'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 「データの管理」の箱を作る ---------- */
  function build(){
    var host = document.querySelector('aside .data');
    if (!host) return null;
    var fold = el('v885-data');
    if (!fold){
      fold = document.createElement('details');
      fold.className = 'v885-fold'; fold.id = 'v885-data';   /* ★open を付けない = 既定で閉じている */
      var s = document.createElement('summary'); s.textContent = 'データの管理';
      fold.appendChild(s);
      var n = document.createElement('div'); n.className = 'v885-note';
      n.textContent = '書き出し・取り込み・容量の整理は、ここにまとめました。';
      fold.appendChild(n);
      host.appendChild(fold);
    }
    stats.built = true;
    return fold;
  }

  /* ---------- 移動（べき等。すでに行き先に居れば何もしない） ---------- */
  function moveInto(node, host){
    if (!node || !host || node.parentNode === host) return false;
    host.appendChild(node); return true;
  }
  function moveData(){
    var fold = el('v885-data'); if (!fold) return;
    for (var i = 0; i < FOLD_IDS.length; i++){
      var n = el(FOLD_IDS[i]); if (!n) continue;
      if (fold.contains(n)) continue;
      if (moveInto(n, fold)) stats.moved++;
    }
  }

  /* ---------- 一行診断を畳む（A21・既定は畳む / gate ON ならそのまま） ----------
     対象は取り込み後の掲示に出る「☁ クラウド側: … ・ 受信 N件/NKB」の 1 行だけ。
     ほかの行（警告・件数の説明）は 1 文字も動かさない。 */
  var DIAG_HEAD = '☁ クラウド側:';
  function foldNoteDiag(){
    /* ★harness D-4 の FAIL を受けた **製品側の修正**（run history #2 で開示）:
       kill が入っているときは何もしない。boot() は観測を張らないので実運用では
       呼ばれないが、検証口 api.foldNoteDiag() から直接呼べてしまい
       「kill しても畳む」経路が残っていた。kill は 1 つの入口で効くべきである。 */
    if (off()) return;
    if (devOn()) return;
    var box = el('note'); if (!box) return;
    var notes = box.querySelectorAll('.note');
    for (var i = 0; i < notes.length; i++){
      var host = notes[i];
      if (host.getAttribute('data-v885') === '1') continue;
      stats.noteSeen++;
      var kids = [], k;
      for (k = 0; k < host.childNodes.length; k++) kids.push(host.childNodes[k]);
      for (k = 0; k < kids.length; k++){
        var nd = kids[k];
        if (nd.nodeType !== 3) continue;                      /* text node だけ */
        var txt = String(nd.nodeValue || '');
        if (txt.indexOf(DIAG_HEAD) !== 0) continue;
        var d = document.createElement('details');
        d.className = 'v885-diag';
        var sm = document.createElement('summary'); sm.textContent = '同期の詳細';
        d.appendChild(sm);
        var body = document.createElement('span'); body.textContent = txt;
        d.appendChild(body);
        nd.parentNode.replaceChild(d, nd);
        stats.noteFolded++;
      }
      host.setAttribute('data-v885', '1');
    }
  }

  function apply(){
    if (off()) return;
    try {
      injectStyle();
      if (!build()) return;
      moveData();
      foldNoteDiag();
      stats.applies++;
    } catch(e){ try { console.warn(TAG, 'apply failed'); } catch(_){} }
  }

  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix885Off / v292Lane16Off)'); } catch(e){} return; }
    apply();
    /* 後着の描画（fix870 が袖を組み替える・取り込み後に掲示が入れ替わる）に追従 */
    try { setInterval(apply, 2000); } catch(e){}
    try {
      var nb = el('note');
      if (nb) new MutationObserver(function(){ try { foldNoteDiag(); } catch(e){} })
                .observe(nb, { childList: true });
    } catch(e){}
    try { console.log(TAG, 'armed (dev=' + (devOn() ? 'on' : 'off') + ')'); } catch(e){}
  }

  window.__v292Dfix885 = {
    version: VERSION,
    api: {
      apply: apply, isOff: off, devOn: devOn,
      DEV_KEYS: DEV_KEYS, FOLD_IDS: FOLD_IDS, KEEP_TOP: KEEP_TOP, NEVER_TOUCH: NEVER_TOUCH,
      foldNoteDiag: foldNoteDiag,
      state: function(){ var o = {}; for (var k in stats) o[k] = stats[k]; o.dev = devOn(); return o; }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
