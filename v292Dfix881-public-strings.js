// =====================================================================
// Chronicle TRPG - v292Dfix881: PUBLIC_COPY_V1（lane 15 / 裁定 #L15entry / sp10A）
// ---------------------------------------------------------------------
// ■ これは何か
//   **文字列だけ**を公開向けの言い回しに置き換える。挙動・分岐・保存・通信は 1 つも変えない。
//   index.html / home.html の静的リテラルは sp10A の HTML 側で直接直してある。
//   この file が受け持つのは、**sp10A が再配布しない patch 群が後から差し込む文字列**
//   （例: fixP0 の封鎖バナー）と、UI.setStatus に流れ込む動的メッセージの丸め。
//
// ■ 壊さない約束
//   STRING_ONLY   … 置換表に載った文字列を、表示される直前に別の文字列にするだけ。
//                   DOM の構造・class・id・event・属性（title 等の「値」以外）を変えない。
//   NO_CODES      … 置換後の文面に内部 code / 識別子を 1 つも出さない。
//   NO_STORY      … #story / #composer / textarea / input / script / style は**走査しない**
//                   （物語本文と利用者の入力に絶対に触れないため）。
//   LS_WRITE_0    … localStorage へ 1 バイトも書かない。NO_NETWORK … fetch 0。
//   IDEMPOTENT    … 置換後の文字列は表のどの pattern にも一致しない（再入で二重変換しない）。
//
// 検証口: window.__v292Dfix881 = { version, api }
// kill:  localStorage['v292Dfix881Off'] = '1' → 何もしない（sp9 と同じ文面）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix881) return;
  var TAG = '[v292Dfix881:public-strings]';
  var VERSION = 'v292Dfix881-20260921-sp16r-v1.1';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix881Off') === '1'; }

  /* ---------- 置換表（D 章。上から順に 1 回だけ適用） ----------
     kind:'exact'  … 完全一致
     kind:'has'    … 部分一致したら文全体を to に差し替える（技術詳細を残さない）
     kind:'re'     … 正規表現で部分置換                                        */
  var TABLE = [
    /* ★★sp16（lane19 C-5 / C-6 / C-8・GPT 裁定 #LANE19）— 新規 3 行。
       ★順序が意味を持つ: 下にある D-13 の /\bHTTP \d{3}\b/ は **どんな例外文でも先に食う**ので、
         403 行はここ（HTTP 行より上）でなければ 1 度も発火しない。表は上から 1 回だけ適用される。
       ★3 行とも to は表のどの pattern にも一致しない（IDEMPOTENT・harness I-2 が実測する）。 */
    /* S-1 403: worker の allow: に居ない Google アカウント（worker.js:847）。本文に
       メールアドレスが入るので、丸めるのではなく **理由が分かる文** に置き換える。
       「うまくつながりませんでした」に丸めると、許可されていないという事実が player に 1 文字も届かない。 */
    { kind:'re',  from:/\bHTTP 403\b/,
      to:'このアカウントはまだ招待されていません。招待をお待ちください。' },
    /* S-2 通信断: Failed to fetch / NetworkError / load failed は HTTP を含まないので D-13 に
       当たらず、英語のまま player の画面へ出ていた。 */
    { kind:'re',  from:/Failed to fetch|NetworkError|load failed/i,
      to:'うまくいきませんでした。通信を確かめて、もう一度お試しください' },
    /* S-3 停止中: 「(管理者が一時停止しています)」は player の情報ではない（worker.js:5208）。 */
    { kind:'has', from:'メンテナンス中です',
      to:'ただいま一時的に休止しています。少し待ってからお試しください' },
    /* D-20 fixP0（sp10A は fixP0 を再配布しないので実行時に直す） */
    { kind:'has', from:'公開API封鎖に失敗したため',
      to:'この機能は一時停止しています。ページを再読み込みしてください。' },
    /* D-2 / D-14 API 語の集約 */
    { kind:'has', from:'APIキーが未設定です',
      to:'まだ遊ぶ準備ができていません。設定を開きます' },
    /* D-1 welcome（古い HTML を掴んだ端末への保険） */
    { kind:'has', from:'⚙ 設定 からAPIキーと世界設定を入力してください。',
      to:'物語を始めましょう。世界とキャラクターを用意すると、すぐに遊び始められます。' },
    /* D-11 HTTP code */
    { kind:'has', from:'レート制限(429)',
      to:'混み合っています。少し待って自動でもう一度試します…' },
    /* D-16 model 名 */
    { kind:'has', from:'予備モデル（',
      to:'少し時間がかかっています…' },
    /* D-12 / D-13 生の例外・HTTP 応答 */
    { kind:'re',  from:/^エラー: [\s\S]*$/,
      to:'うまくいきませんでした。もう一度お試しください' },
    { kind:'re',  from:/^[\s\S]*\bHTTP \d{3}\b[\s\S]*$/,
      to:'うまくつながりませんでした。もう一度お試しください' },
    /* D-15 生成物の生テキスト */
    { kind:'has', from:'JSONとして解析できませんでした',
      to:'うまく物語を組み立てられませんでした。もう一度お試しください' }
  ];

  var stats = { textNodes: 0, attrs: 0, status: 0, sweeps: 0 };

  function convert(s){
    if (typeof s !== 'string' || !s) return null;
    for (var i = 0; i < TABLE.length; i++){
      var r = TABLE[i];
      if (r.kind === 'exact'){ if (s === r.from) return r.to; }
      else if (r.kind === 'has'){ if (s.indexOf(r.from) >= 0) return r.to; }
      else if (r.kind === 're'){ if (r.from.test(s)) return r.to; }
    }
    return null;
  }

  /* ---------- 走査対象外（物語本文・入力・非表示要素） ---------- */
  var SKIP_TAG = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, CODE:1, PRE:1 };
  var SKIP_ID  = { story:1, composer:1, branches:1, inp:1, editTa:1, grid:1, detail:1, recent:1 };
  function skipped(node){
    var p = node;
    while (p && p !== document.body){
      if (p.nodeType === 1){
        if (SKIP_TAG[p.tagName]) return true;
        if (p.id && SKIP_ID[p.id]) return true;
      }
      p = p.parentNode;
    }
    return false;
  }

  var ATTRS = ['title', 'placeholder', 'aria-label'];

  function sweep(){
    if (off() || !document.body) return;
    try {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n;
      while ((n = w.nextNode())){
        var t = n.nodeValue;
        if (!t || t.length > 600) continue;
        var c = convert(t);
        if (c !== null && c !== t && !skipped(n)){ n.nodeValue = c; stats.textNodes++; }
      }
      var els = document.body.querySelectorAll('[title],[placeholder],[aria-label]');
      for (var i = 0; i < els.length; i++){
        for (var a = 0; a < ATTRS.length; a++){
          var v = els[i].getAttribute(ATTRS[a]);
          var cv = convert(v);
          if (cv !== null && cv !== v){ els[i].setAttribute(ATTRS[a], cv); stats.attrs++; }
        }
      }
      stats.sweeps++;
    } catch(e){}
  }

  /* ---------- UI.setStatus の文面だけを通す（引数 1 個を差し替えるだけ） ---------- */
  function wrapStatus(){
    try {
      var U = window.UI; if (!U || typeof U.setStatus !== 'function' || U.setStatus.__v881) return false;
      var orig = U.setStatus;
      var w = function(msg, err){
        var c = convert(msg);
        if (c !== null && c !== msg){ stats.status++; msg = c; }
        return orig.call(this, msg, err);
      };
      w.__v881 = 1;
      U.setStatus = w;
      return true;
    } catch(e){ return false; }
  }

  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix881Off)'); } catch(e){} return; }
    sweep(); wrapStatus();
    /* 後から差し込まれる文面（トースト・バナー・後着 patch）に追従。1.2s throttle。 */
    var pend = 0;
    function kick(){
      if (pend) return;
      pend = setTimeout(function(){ pend = 0; sweep(); wrapStatus(); }, 1200);
    }
    try { new MutationObserver(kick).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch(e){}
    try { setInterval(function(){ sweep(); wrapStatus(); }, 5000); } catch(e){}
    try { console.log(TAG, 'armed'); } catch(e){}
  }

  window.__v292Dfix881 = {
    version: VERSION,
    api: {
      convert: convert, sweep: sweep, isOff: off, TABLE: TABLE,
      state: function(){ var o = {}; for (var k in stats) o[k] = stats[k]; return o; }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
