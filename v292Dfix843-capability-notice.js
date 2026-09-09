// =====================================================================
// v292Dfix843 CLASS_BC_409_USER_NOTICE_V1（②C1 裁定 2026-09-09: GO）
//
// 目的:
//   fix838 / fix842 が分類した **非一過性の 409**（CLASS B = capability /
//   CLASS C = state）で保存が安全停止したとき、利用者に 1 行だけ知らせる。
//   これまでは「保存が止まっている」ことが画面から一切分からなかった。
//
// 契約（これを外さない）:
//   ・**UI だけ**。write / retry / HOLD / releaseHold の判断を 1 つも変えない。
//   ・既存モジュールを 1 バイトも書き換えない。本 module は **read-only observer**。
//     公開済みの診断口（fix705.status / fix697.status+ledger / fix729.last）だけを読む。
//   ・localStorage / sessionStorage へ 1 バイトも書かない。network 追加 0。
//   ・CLASS A CONVERGENT（shadow-conflict / CAS / idem-processing / idem-race）には **出さない**。
//     収束するものを障害として見せない。
//   ・NETWORK は fix840 の告知が担当。Google 失効は fix835/837/841 系が担当。混ぜない。
//   ・原因コードは title 属性にだけ載せる（本文は 1 行）。
//   ・fix840 の告知が既に出ているときは重ならないよう下へずらす。
//
// 検証口: window.__v292Dfix843 = { BUILD, off, state, codes, check }
// kill switch: localStorage v292Dfix843Off='1'（既定 ON）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix843) return;
  var TAG = '[v292Dfix843:capability-notice]';
  var BUILD = '20260909-fix843';
  var NOTICE_ID = 'v292Dfix843-notice';
  var F840_NOTICE_ID = 'v292Dfix840-notice';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix843Off') === '1'; }

  /* ---- 対象コード。CLASS A(収束系) は **入れない**。 ---- */
  var CLASS_B_CAPABILITY = {
    'CLIENT_SCHEMA_TOO_OLD': 1, 'legacy-client-too-old': 1,
    'CANONICAL_WRITE_DISABLED': 1, 'SHADOW_SCHEMA2_UNSUPPORTED': 1
  };
  var CLASS_C_STATE = {
    'SHADOW_DELETED': 1, 'already-deleted': 1, 'deleted-row': 1,
    'idem-key-reuse': 1, 'image-conflict': 1, 'bad-authority': 1
  };
  function classOf(code){
    var c = String(code || '');
    if (CLASS_B_CAPABILITY[c]) return 'B';
    if (CLASS_C_STATE[c]) return 'C';
    return null;
  }

  var state = { shown: false, cls: null, code: null, source: null, checks: 0 };

  /* ---- 観測（すべて read-only。例外は握りつぶして観測を止めない） ---- */
  function fromF705(){
    try {
      var A = window.__v292Dfix705;
      if (!A || typeof A.status !== 'function') return null;
      var s = A.status();
      if (!s || !s.state) return null;
      if (s.state.error !== 'CAPABILITY_409') return null;
      var cls = classOf(s.state.errorCode);
      /* errorCode が未知でも、fix705 が CAPABILITY_409 で止めている時点で
         「この端末からは安全に保存できない」は確定しているので B 扱いにする。 */
      return { cls: cls || 'B', code: s.state.errorCode || 'CAPABILITY_409', source: 'fix705' };
    } catch(e){ return null; }
  }
  function fromF697(){
    try {
      var A = window.__v292Dfix697;
      if (!A || typeof A.ledger !== 'function') return null;
      var L = A.ledger() || [];
      for (var i = L.length - 1; i >= 0; i--){
        var r = L[i];
        if (!r || (r.kind !== 'CONTRACT_409' && r.kind !== 'CANONICAL_409')) continue;
        var cls = classOf(r.errorCode);
        if (cls) return { cls: cls, code: r.errorCode, source: 'fix697:' + r.kind };
        /* 未知コードは黙って無視する（CLASS A を誤って出さないため fail-quiet）。 */
      }
    } catch(e){}
    return null;
  }
  function fromF729(){
    try {
      var A = window.__v292Dfix729;
      if (!A || typeof A.last !== 'function') return null;
      var r = A.last();
      if (!r || r.reason !== 'CAPABILITY_409') return null;
      var cls = classOf(r.errorCode);
      return { cls: cls || 'B', code: r.errorCode || 'CAPABILITY_409', source: 'fix729' };
    } catch(e){ return null; }
  }

  function detect(){ return fromF705() || fromF697() || fromF729() || null; }

  function show(hit){
    try {
      if (off() || document.getElementById(NOTICE_ID)) return;
      var top = 0;
      try { if (document.getElementById(F840_NOTICE_ID)) top = 30; } catch(e){}   /* fix840 の告知と重ねない */
      var d = document.createElement('div');
      d.id = NOTICE_ID;
      d.textContent = '⚠ この物語は、いまこの端末からは安全に保存できません。'
                    + 'ページを再読み込みしても直らない場合は、アプリを最新版にしてください。';
      d.title = 'class=' + hit.cls + ' code=' + hit.code + ' src=' + hit.source;
      d.setAttribute('style', 'position:fixed;left:0;right:0;top:' + top + 'px;z-index:99996;'
        + 'background:#4a3320;color:#ffe8c8;font-size:12px;line-height:1.6;padding:6px 10px;'
        + 'text-align:center;pointer-events:none;font-family:system-ui,sans-serif;');
      (document.body || document.documentElement).appendChild(d);
      state.shown = true; state.cls = hit.cls; state.code = hit.code; state.source = hit.source;
      try { console.log(TAG, 'notice shown', hit); } catch(e){}
    } catch(e){}
  }

  function check(){
    state.checks++;
    if (off() || state.shown) return state;
    var hit = detect();
    if (hit) show(hit);
    return state;
  }

  /* 監視は軽量な polling のみ（既存モジュールへ hook を差し込まない = 挙動非干渉）。
     上限付きで、出したら止める。1 document あたり最大およそ 3 分。 */
  var ticks = 0, MAX_TICKS = 60, INTERVAL_MS = 3000;
  function tick(){
    try {
      if (off()) return;
      check();
      if (state.shown) return;
      if (++ticks >= MAX_TICKS) return;
      setTimeout(tick, INTERVAL_MS);
    } catch(e){}
  }
  try { setTimeout(tick, 2000); } catch(e){}

  window.__v292Dfix843 = {
    __armed: true, BUILD: BUILD, off: off,
    codes: function(){ return { B: Object.keys(CLASS_B_CAPABILITY), C: Object.keys(CLASS_C_STATE) }; },
    state: function(){ var o = {}; for (var k in state) o[k] = state[k]; o.ticks = ticks; o.noticeInDom = !!document.getElementById(NOTICE_ID); return o; },
    check: check
  };
  try { console.log(TAG, 'loaded (UI only / read-only observer / no write-retry-HOLD change / kill=v292Dfix843Off=1)'); } catch(e){}
})();
