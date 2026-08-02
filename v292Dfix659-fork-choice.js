// =====================================================================
// Chronicle TRPG - v292Dfix659: 分岐(fork)の選択バナーを作り直す
// ---------------------------------------------------------------------
// ■何が問題だったか(2026-08-02・iPhone実機)
//   ・文言が分かりにくい:「この端末と別端末の両方に新しいつづきがあります」
//   ・fix527c(v292Dfix527-story-url.js:183-205)が「別端末のつづき」ボタンを
//     「🏠 ホームで取り込む」へ付け替えていたが、押してもホームに着くだけで
//     **取り込みが走らない**ことがあった(=実質「あとで」しか機能しない罠)。
//     実因は home.html 側の2つの門(fix659のB項で対処):
//       (G1) 起動時の pull() は force 無しなので `serverRev <= baseRev` なら「☁ 最新です」で終わる。
//            baseRev は**スキップした回でも** serverRev まで進むので、一度スキップすると
//            その物語は二度と取り込まれない。
//       (G2) スロット毎の「ローカルの方がターン数が多ければ上書きしない」保護は force でも効いたままで、
//            真の分岐(双方が進んだ)では必ずここで止まる。
//   ・物語画面での直接 pull は fix527 [3] の applySave ガードで設計上不可能(ホーム専用)。
//     **この決定は維持する**。だからバナーは「ホームへ渡して、ホームで完走させる」形にする。
//
// ■このモジュールがすること(純UI・localStorage へ1バイトも書かない)
//   fix402 の forkBanner() を冒頭1行のフックで置き換え、平易な文言のバナーを出す。
//     ①「☁ クラウド側を取り込む」→ home.html?autopull=<この物語のslotId> へ。
//        home が一度だけ取り込みを完走させる。★local-ahead 保護を外すのは**この物語だけ**。
//        他の物語がこの端末で進んでいたら、それは従来どおり守る(黙って短くしない)。
//        ★ここで S.save はしない。この端末の分岐は put が fork として**サーバーに保持**されており、
//          ホーム側の取り込みでも上書き前に検証済みの控えを取る。二重に守られている。
//          ここで保存を挟むと markDirty→flush が走って余計な fork を積むだけで守りは増えない。
//     ②「この端末のつづきで進める」→ 既存の __v292Dfix402.forcePut()(公開API・挙動そのまま)。
//     ③「今は決めない」→ 閉じるだけ。
//
// ■fix527 と衝突しないこと(二重の保証)
//   ・ボタン文言に「別端末」を含めない(fix527c が書き換える条件そのもの)。
//   ・バナー要素に __f527 = 1 を立てる(fix527c は処理済みとみなして素通りする)。
//   ・要素IDも 'v292Dfix659-fork' で、fix527c が探す 'v292Dfix402-fork' とは別。
//
// ■スイッチ / 観測口
//   OFF   = localStorage['v292Dfix659Off']='1' … renderForkBanner は常に false を返し、
//           fix402 の従来バナー(+fix527c の付け替え)へ**完全に**フォールバックする。
//   観測  = window.__v292Dfix659.status() / .selfTest()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix659) return;
  var TAG = '[v292Dfix659:fork-choice]';
  var BANNER_ID = 'v292Dfix659-fork';
  /* ★遷移先は物語単位。バナーは「**この物語**が分かれています」と語るので、
     ホーム側で local-ahead 保護を外すのも**この物語だけ**でなければ意図を超える
     (別の物語がこの端末で進んでいたら、それは黙って短くしてはいけない)。 */
  function homeUrl(){ return 'home.html?autopull=' + encodeURIComponent(activeSlot()); }

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsGet('v292Dfix659Off') === '1'; }
  var rendered = 0, lastError = null;

  /* ---- いま開いている物語のターン数(URL の story を真とする=fix527 [1]) ---- */
  function activeSlot(){
    try { var m = String(location.search || '').match(/[?&]story=([^&#]+)/); if (m) return decodeURIComponent(m[1]); } catch(e){}
    try { return JSON.parse(lsGet('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; }
  }
  function localTurns(){
    try {
      var slot = activeSlot();
      var raw = lsGet(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot));
      if (!raw) return 0;
      var d = JSON.parse(raw);
      return (d && Array.isArray(d.turns)) ? d.turns.length : 0;
    } catch(e){ return 0; }
  }
  function two(n){ n = String(n); return n.length < 2 ? ('0' + n) : n; }
  function stamp(ts){                       // M/d HH:mm
    try {
      var t = +ts || 0; if (!t) return '';
      var d = new Date(t);
      if (isNaN(d.getTime())) return '';
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
    } catch(e){ return ''; }
  }

  /* =====================================================================
     文言の組み立て(純関数)。selfTest はここを真理値表で縛る。
     ★ボタン文言に「別端末」を入れない(fix527c の書換条件に触れないため)。
       状況表示の行には入れてよい(fix527c が見るのは button の textContent だけ)。
     ===================================================================== */
  function buildText(server, turns){
    server = server || {};
    var dev = String(server.device || '').slice(0, 22);
    var when = stamp(server.updatedAt);
    var cloud = 'クラウド' + (dev ? ('(別端末: ' + dev + ')') : '');
    cloud += when ? (': ' + when + '保存') : 'に新しいつづきがあります';
    return {
      head: '☁ この物語のつづきが2つに分かれています。',
      lineLocal: 'この端末: ' + (+turns || 0) + 'ターン(この物語)',
      lineCloud: cloud,
      note: 'どちらを選んでも、選ばなかった方は自動バックアップに残ります。',
      buttons: [
        { key: 'cloud', label: '☁ クラウド側を取り込む', main: true },
        { key: 'local', label: 'この端末のつづきで進める', main: false },
        { key: 'later', label: '今は決めない', main: false }
      ]
    };
  }

  function toast(msg){
    try { if (window.UI && UI.setStatus) UI.setStatus(msg); } catch(e){}
    try { console.log(TAG, msg); } catch(e){}
  }
  function close(){
    try {
      var el = document.getElementById(BANNER_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch(e){}
  }

  /* =====================================================================
     描画。true を返したら fix402 は従来バナーを出さない。
     **描けなかったときは必ず false**(黙って何も出さない状態を作らない)。
     ===================================================================== */
  function renderForkBanner(server){
    if (off()) return false;
    try {
      if (!document || !document.createElement) return false;
      if (document.getElementById(BANNER_ID)) return true;      // 冪等(自要素の存在で二重表示ガード)
      var T = buildText(server, localTurns());

      var el = document.createElement('div');
      el.id = BANNER_ID;
      el.__f527 = 1;                                            // fix527c に再付け替えさせない(二重の保証)
      el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;max-width:92vw;box-sizing:border-box;'
        + 'background:#1d2733;color:#dfe8f2;border:1px solid #4a7ad0;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.7;box-shadow:0 4px 18px rgba(0,0,0,.45);';

      function row(text, css){
        var d = document.createElement('div');
        d.style.cssText = css || '';
        d.textContent = text;
        el.appendChild(d);
        return d;
      }
      row(T.head,      'font-weight:700;margin-bottom:2px;');
      row(T.lineLocal, 'opacity:.92;');
      row(T.lineCloud, 'opacity:.92;');
      row(T.note,      'opacity:.75;font-size:12px;margin-top:2px;');

      var acts = { cloud: onCloud, local: onLocal, later: close };
      for (var i = 0; i < T.buttons.length; i++){
        (function(spec){
          var b = document.createElement('button');
          b.type = 'button';
          b.__f527 = 1;
          b.textContent = spec.label;
          b.style.cssText = 'margin:8px 8px 0 0;padding:8px 12px;font-size:13px;border-radius:7px;cursor:pointer;border:1px solid '
            + (spec.main ? '#4a7ad0' : '#666') + ';background:' + (spec.main ? '#2a4a8a' : '#333') + ';color:#fff;';
          b.onclick = function(){ try { acts[spec.key](el); } catch(e){ try { console.warn(TAG, e && e.message); } catch(_){} } };
          el.appendChild(b);
        })(T.buttons[i]);
      }

      (document.body || document.documentElement).appendChild(el);
      rendered++;
      try { console.log(TAG, 'fork banner rendered', JSON.stringify({ turns: localTurns(), device: (server && server.device) || null })); } catch(e){}
      return true;
    } catch(e){
      lastError = String((e && e.message) || e);
      try { console.warn(TAG, '描画に失敗→従来バナーへフォールバック:', lastError); } catch(_){}
      return false;
    }
  }

  /* ①クラウド側を取り込む: ホームへ「取り込め」と伝えて渡すだけ(確認は不要=既に選んでいる)。 */
  function onCloud(el){
    try { if (el) el.textContent = '☁ ホーム画面で取り込みます…'; } catch(e){}
    try { location.href = homeUrl(); } catch(e){}
  }
  /* ②この端末のつづきで進める: 既存の forcePut(世代化・連打防止つき)へ委譲。挙動は現行のまま。 */
  function onLocal(el){
    try { if (el) el.textContent = '☁ この端末のつづきで統一しています…'; } catch(e){}
    var done = function(okFlag){
      if (okFlag) toast('☁ この端末のつづきで統一しました(相手側はバックアップ保存)');
      else toast('☁ 統一に失敗しました。あとで自動再試行します');
      close();
    };
    try {
      var f = window.__v292Dfix402;
      if (f && typeof f.forcePut === 'function') { f.forcePut(done); return; }
    } catch(e){}
    done(false);
  }

  function selfTest(){
    var fails = [];
    function chk(name, cond, got){ if (!cond) fails.push({ name: name, got: got }); }
    var T = buildText({ device: 'iPhone Safari', updatedAt: Date.UTC(2026, 7, 2, 5, 7) }, 12);
    chk('見出しが平易', T.head === '☁ この物語のつづきが2つに分かれています。', T.head);
    chk('この端末の行にターン数が入る', T.lineLocal === 'この端末: 12ターン(この物語)', T.lineLocal);
    chk('クラウドの行に端末名が入る', T.lineCloud.indexOf('(別端末: iPhone Safari)') > 0, T.lineCloud);
    chk('クラウドの行に M/d HH:mm 保存が入る', /: \d+\/\d+ \d\d:\d\d保存$/.test(T.lineCloud), T.lineCloud);
    chk('注記がある', T.note.indexOf('自動バックアップに残ります') > 0, T.note);
    chk('ボタンは3つ', T.buttons.length === 3, T.buttons);
    chk('並びは cloud / local / later', T.buttons.map(function(b){ return b.key; }).join(',') === 'cloud,local,later', T.buttons);
    chk('★ボタン文言に「別端末」を含めない(fix527c の書換対象にしない)',
        T.buttons.every(function(b){ return b.label.indexOf('別端末') < 0; }), T.buttons);
    chk('主ボタンは「クラウド側を取り込む」だけ',
        T.buttons.filter(function(b){ return b.main; }).map(function(b){ return b.key; }).join(',') === 'cloud', T.buttons);

    var T2 = buildText({}, 0);
    chk('端末名が無ければ括弧を出さない', T2.lineCloud.indexOf('(') < 0, T2.lineCloud);
    chk('保存日時が無ければ日時を騙らない', T2.lineCloud.indexOf('保存') < 0, T2.lineCloud);
    chk('0ターンでも文言が壊れない', T2.lineLocal === 'この端末: 0ターン(この物語)', T2.lineLocal);

    var T3 = buildText({ device: 'あいうえおかきくけこさしすせそたちつてとなにぬね' }, 3);
    chk('端末名は22字までに切る', T3.lineCloud.indexOf('あいうえおかきくけこさしすせそたちつてとなに)') > 0, T3.lineCloud);

    chk('遷移先は物語単位(autopull=<slotId>)',
        homeUrl() === 'home.html?autopull=' + encodeURIComponent(activeSlot()), homeUrl());

    return { ok: fails.length === 0, fails: fails };
  }

  function status(){
    var el = null; try { el = document.getElementById(BANNER_ID); } catch(e){}
    return { on: !off(), off: off(), bannerId: BANNER_ID, homeUrl: homeUrl(),
             rendered: rendered, showing: !!el, lastError: lastError,
             turns: localTurns(), slot: activeSlot(),
             forcePutAvailable: !!(window.__v292Dfix402 && typeof window.__v292Dfix402.forcePut === 'function') };
  }

  window.__v292Dfix659 = {
    __real: true,
    renderForkBanner: renderForkBanner,
    status: status,
    selfTest: selfTest,
    buildText: buildText,
    close: close
  };

  try { console.log(TAG, 'loaded', off() ? 'OFF(従来バナーへフォールバック)' : 'ON'); } catch(e){}
})();
