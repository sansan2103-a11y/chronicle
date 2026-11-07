// =====================================================================
// Chronicle TRPG - v292DfixISO1 (ISO1d): 別アカウント・持ち主不明の「この端末だけ」の物語を、いまのアカウントに見せない・開かせない
// ---------------------------------------------------------------------
// 実測(laneISO): A が作った未同期(local-only)の物語が、同じブラウザで B がログインすると B の HOME に出て、B が開いて遊べた。
// ISO1c → ISO1d (GPT #127-QY の HOLD 理由への対処):
//   ISO1c は「持ち主の記録(iso2 の印)が無い古い物語」を、この端末の最初のログインアカウント(v292DfixISO1_first)へ自動で帰属させていた。
//   → Owner が使っていた端末で、更新後に最初にログインしたのが友人 B なら、B に Owner の古い物語が見える。ISO1d ではこれをやめた。
// やること:
//   (1) HOME の一覧: fix889 の mayShowRow / mayShow を包み、「local-only かつ 本文が端末にあり かつ いまの人のものと証明できない」物語は描かない。
//   (2) 物語を開く扉: index.html?story=<id> が同じ条件なら、engine の最初の起動(__chrBootDefer)を止め、「物語を開けません」を出す。
//   (3) 画像メタの putimg: 同じ条件の物語の storyId を外す。
//   (4) 持ち主不明の古い物語の取り戻し(HOME だけ・自動ではない): サーバの /auth/me がこの document で「owner かつ active」と答えたアカウントにだけ、
//       「この端末の持ち主不明の物語 N 件を自分のものにする」を出す。2 段階の確認のあと /auth/me を取り直し、まだ owner なら、
//       iso2 と同じ形の帰属の記録(v292iso2_slotown.s[id] = {c,w,at,by:'iso1d-claim'})を、記録の無い物語にだけ書く(既にある記録は変えない)。
//   (5) HOME の「続きから遊ぶ」(fix870 #contBtn) が隠した物語を指していたら、一覧に出せる最新の物語へ付け替える(無ければ隠す)。ISO1c にもあった漏れ(物語の id だけ)。
// 「いまの人のもの」の証拠(local-only・本文あり の物語だけに適用。クラウドにある物語・本文の無い物語は従来どおり何もしない):
//   ・iso2 の帰属の記録 v292iso2_slotown の作成者 c と最終書込み w が、どちらもいまのアカウントの tag → いまの人のもの(見せる)。
//     (iso2 は、サーバの行と中身が一致した時にも同じ記録を書く = server-pkg / server-e1 / server-e2。それもそのまま証拠として使う)
//   ・c / w のどちらかが違う → 別アカウント(隠す)。
//   ・記録が無いが、いまのアカウントのクラウドがその物語 id を持っている(この document の fix889 listshadow の答え。/auth/me と同じアカウントの時だけ)
//     → いまの人のもの(新しい端末でクラウドから取り込んだ直後の物語)。ISO1 専用の台帳 v292DfixISO1_srv に残す。iso2 の記録には書かない。
//     物語画面ではこの答えを待つ間 engine を起動せず、確かめられたら 1 度だけ読み込み直す。
//   ・記録もサーバの証拠も無い → 持ち主不明(隠す・開かせない・消さない)。v292iso946_owner の印は「最後に物語画面を開いた人(画像の持ち主)」で、
//     物語を作った人の証拠ではないので使わない。最初のログインアカウントへの自動帰属もしない。
//   ・ログイン中の人が分からない: fix893 のある origin(pages.dev)でログインしていない・identity conflict(別タブで切替) → 隠す。
//     fix893 の無い origin(旧 github.io)でログインしていない時だけ従来どおり(何もしない)。
// 取り戻しの対象: 持ち主不明・local-only・本文あり、かつ作成日時(chr6_slots_meta の createdAt)が CUTOFF 以前(または記録なし)。
//   根拠: 招待機能の前は、本番のアカウントは Owner と内部 QA の 2 つだけ(本番 D1 の account 表 2 行 = owner/active ×1・beta/suspended ×1、
//   2026-11-07 の件数だけの確認)。CUTOFF より前に作られた記録の無い物語は Owner か QA のもの。CUTOFF より後の記録の無い物語は取り戻しの対象にしない(隠したまま)。
// 何も消さない・動かさない。書くのは (4) の確認後の帰属の記録だけ。ISO1c の台帳 v292DfixISO1_first は読むだけ(判定に使わない・書かない)。
// kill: localStorage v292DfixISO1Off='1' → 何も置かない(従来と同一)。観測口: window.__v292DfixISO1.status()
// 読み込み位置: index.html は fix893 の直後(fix946 より前)。home.html は iso2 の直後(fix889 より前)。ISO1c と同じ。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292DfixISO1) return;
  var TAG = '[v292DfixISO1]', BUILD = 'ISO1e';
  /* ★ISO1e（GPT #127-RA ①）: 持ち主不明の物語を Owner が自分のものにする操作は、いったん無効（ボタンを出さない）。
     データは消さない・動かさない・書き換えない。安全な取り戻し方は別の小さな作業で決める。コードは残す（CLAIM_ON を true にするまで動かない）。 */
  var CLAIM_ON = false;
  var CUTOFF = '2026-11-07T19:45:00+09:00';   // 取り戻しの対象にする作成日時の上限(これより後に作られた記録の無い物語は対象外)
  var LS = null; try { LS = W.localStorage; } catch(e){ return; }
  if (!LS) return;
  function lsg(k){ try { return LS.getItem(k); } catch(e){ return null; } }
  if (lsg('v292DfixISO1Off') === '1') return;

  // ---- アカウント tag (iso2 ownerRaw / tagOf と同じ式)
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function fnv(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return (h>>>0).toString(36); }
  function ownerRaw(){
    var sup = '', mk = '';
    try { var f = W.__chronicleSessionId; if (typeof f === 'function') sup = String(f() || ''); } catch(e){ sup = ''; }
    var supAcct = (sup.indexOf('cookie:') === 0) ? sup.slice(7) : '';
    var mark = null; try { mark = JSON.parse(lsg('v292Dfix837_sess') || 'null'); } catch(e){ mark = null; }
    if (mark && mark.sid === 'cookie' && mark.acct) mk = String(mark.acct);
    if (supAcct && mk && supAcct !== mk) return 'conflict';
    if (supAcct || mk) return 'acct:' + (supAcct || mk);
    var em = '';
    try { if (typeof W.__chronicleGoogleEmail === 'function') em = String(W.__chronicleGoogleEmail() || ''); } catch(e){}
    if (!em) { try { var t = JSON.parse(lsg('v292GoogleToken') || 'null'); if (t && t.email) em = String(t.email); } catch(e){} }
    if (!em) { try { if (mark && mark.email) em = String(mark.email); } catch(e){} }
    if (em) return 'mail:' + em.toLowerCase();
    var p = ''; try { p = String(lsg('v292ProxyPass') || '').trim(); } catch(e){}
    if (p) return 'code:' + fnv(p) + hash(p);
    if (sup) return 'sess:' + fnv(sup);
    return 'anon';
  }
  function tagOf(raw){ return 'o' + fnv(raw) + hash(raw); }
  function f893(){ try { var A = W.__v292Dfix893; return (A && A.active === true) ? A : null; } catch(e){ return null; } }
  // いま見ている人: acct(ログイン済み・tag あり) / conflict / nouser(fix893 の origin で未ログイン) / legacy(fix893 の無い origin で未ログイン)
  function viewer(){
    var r = ownerRaw();
    if (r === 'conflict') return { k: 'conflict' };
    if (r.indexOf('acct:') === 0 || r.indexOf('mail:') === 0) return { k: 'acct', tag: tagOf(r), raw: r };
    return f893() ? { k: 'nouser' } : { k: 'legacy' };
  }
  function meTag(){ var v = viewer(); return v.k === 'acct' ? v.tag : null; }
  function readFirst(){ var v = lsg('v292DfixISO1_first'); return (typeof v === 'string' && v) ? v : null; }   // ISO1c の台帳(読むだけ。判定に使わない)

  // ---- 物語の帰属 (iso2 の記録を読む)
  var STAMP_KEY = 'v292iso2_slotown';
  function sidNorm(id){ id = String(id == null ? '' : id); return (id === 'default') ? 'chr6' : id; }
  function stampOf(id){
    try { var o = JSON.parse(lsg(STAMP_KEY) || 'null'); if (o && o.v === 1 && o.s && typeof o.s === 'object') return o.s[sidNorm(id)] || null; } catch(e){}
    return null;   // 記録なし・壊れている → 記録なし扱い(= 持ち主不明・隠す側)
  }
  var stats = { hid: 0, refused: 0, stripped: 0, claimed: 0, claimFail: null, contFixed: 0 };
  // その物語の本文がこの端末にあるか(無ければ対象外: クラウドから来る/まだ pull 前)
  var NGET = null; try { NGET = W.Storage.prototype.getItem; } catch(e){ NGET = null; }   // 読み込み時の getItem(扉の罠に目隠しされない)
  function hasLocalBody(id){ try { var k = (sidNorm(id) === 'chr6') ? 'chr6' : ('chr6_slot_' + id); var v = NGET ? NGET.call(LS, k) : LS.getItem(k); return v != null && v !== ''; } catch(e){ return false; } }
  /* ---- サーバの証拠: いまのアカウントのクラウドがこの物語 id を持っている(fix889 の listshadow の答え = VIS.visible。この document で取った答えだけ)。
     新しい端末でクラウドの物語を取り込んだ直後は、本文はあるが iso2 の記録も同期の印もまだ無い(実測: conc の iPhone)。その物語は
     このアカウントのクラウドから来たものなので隠さない。証拠は ISO1 専用の台帳 v292DfixISO1_srv に (アカウント tag, 物語 id) で残し、
     次の読み込みでは同期で判定する。iso2 の記録(送ってよいか)には書かない＝送信の判定は変えない。 */
  var SRV_KEY = 'v292DfixISO1_srv', r889 = null;
  function srvHas(tag, id){ try { var o = JSON.parse(lsg(SRV_KEY) || 'null'); return !!(o && o.v === 1 && o.t && o.t[tag] && o.t[tag][sidNorm(id)]); } catch(e){ return false; } }
  function srvAdd(tag, id){
    try {
      if (srvHas(tag, id)) return true;
      var o = null; try { o = JSON.parse(lsg(SRV_KEY) || 'null'); } catch(e){ o = null; }
      if (!o || o.v !== 1 || !o.t || typeof o.t !== 'object') o = { v: 1, t: {} };
      (o.t[tag] = o.t[tag] || {})[sidNorm(id)] = Date.now();
      try { LS.setItem(SRV_KEY, JSON.stringify(o)); } catch(e1){ stats.srvErr = String(e1 && e1.message || e1).slice(0, 120); }
      stats.srvAdded = (stats.srvAdded || 0) + 1;
      return srvHas(tag, id);             // 書けたかは読み戻しで決める
    } catch(e){ stats.srvErr = 'X:' + String(e && e.message || e).slice(0, 120); return srvHas(tag, id); }
  }
  /* 起動直後は Vault v2 CopyGate(K5)が、自分の答え(vault2visible)が出るまで物語 id を含む新しい key の書込みを断る(WebKit 実測: 「この控えはいま保存できません」)。
     そのため 1 度だけの読み込み直しには、同じタブの sessionStorage の札(アカウント tag・物語 id・2 分以内・1 回で消す)で答えを運ぶ。
     札で開けた document では、後で(書込みが通る時に)台帳へ写す。 */
  var SS_OK = 'v292iso1_ok_', memOk = {};
  function ssObj(){ try { return W.sessionStorage; } catch(e){ return null; } }
  /* ★ISO1e（GPT #127-RA ①）: サーバの答え（/auth/me）がすでに出ていて、それが「ログインしていない」か「別のアカウント」なら、
     台帳・札・このページで覚えた確認は使わない（ログアウト・切替・身元の食い違いのときに流用しない）。答えがまだ無いあいだは従来どおり。 */
  function srvMeDisagrees(tag){
    // ログアウト（/auth/me が 401）は fix893 が印を消すので、viewer() が nouser になり、ここまで来ない。
    // ここで見るのは「サーバの答えが別のアカウント」の場合だけ（印がまだ古いまま、など）。答えがまだ無い・通信の失敗は従来どおり。
    try {
      var A = f893(); if (!A || typeof A.serverMe !== 'function') return false;
      var m = A.serverMe(); if (!m || !m.accountId) return false;
      var r = ownerRaw(); if (typeof r !== 'string' || r.indexOf('acct:') !== 0) return false;
      return tagOf('acct:' + String(m.accountId)) !== tag;
    } catch(e){ return false; }
  }
  function evidenceOk(tag, id){
    var k = tag + '|' + sidNorm(id);
    if (srvMeDisagrees(tag)) { stats.evDenied = (stats.evDenied || 0) + 1; return false; }
    if (memOk[k]) return true;
    if (srvHas(tag, id)) return true;
    try {
      var ss = ssObj(); var o = ss ? JSON.parse(ss.getItem(SS_OK + sidNorm(id)) || 'null') : null;
      if (o && o.tag === tag && (Date.now() - (+o.at || 0)) < 120000) {
        memOk[k] = true; try { ss.removeItem(SS_OK + sidNorm(id)); } catch(e){}
        stats.ssToken = (stats.ssToken || 0) + 1;
        var tries = 0, persist = function(){ if (srvAdd(tag, id) || ++tries >= 6) return; setTimeout(persist, 5000); };
        setTimeout(persist, 3000);
        return true;
      }
    } catch(e){}
    return false;
  }
  function srvAcctAgrees(tag){ try { var A = f893(); var m = A && typeof A.serverMe === 'function' ? A.serverMe() : null; return !!(m && m.accountId && tagOf('acct:' + String(m.accountId)) === tag); } catch(e){ return false; } }
  /* いま(この document で)サーバが「このアカウントに見える」と答えたか。答えが無い・別アカウントの答え・隠し物語 → false */
  function srvVisibleNow(tag, id){
    try {
      var F = f889(); if (!F || !r889 || typeof F.state !== 'function' || F.state() !== 'ready') return false;
      if (!srvAcctAgrees(tag)) return false;
      return r889.call(F, { id: String(id), cloud: true }) === true;   // fix889 の元の判定(クラウド行として: 隠されていない かつ サーバの一覧にある)
    } catch(e){ return false; }
  }
  /* 判定(local-only かどうかは呼び出し側)。null = 何もしない(見せる) / 'foreign' / 'unknown' / 'conflict' / 'nouser' = 隠す・開かせない */
  function verdict(id){
    if (!hasLocalBody(id)) return null;                   // 本文が無い物語は拒否・非表示にしない(ISO1c と同じ)
    var v = viewer();
    if (v.k === 'legacy') return null;                    // fix893 の無い origin で未ログイン: 従来どおり
    if (v.k !== 'acct') return v.k;                       // conflict / nouser: いま見ている人が分からない → 隠す
    var st = stampOf(id);
    if (st && (st.c || st.w)) return ((st.c && st.c !== v.tag) || (st.w && st.w !== v.tag)) ? 'foreign' : null;
    if (evidenceOk(v.tag, id)) return null;               // このアカウントのサーバが持っていると、この端末(このタブ)で確かめ済み
    if (srvVisibleNow(v.tag, id)) { srvAdd(v.tag, id); return null; }
    return 'unknown';                                     // ★ISO1d: 記録なし・サーバの証拠なし = 持ち主不明。誰にも自動で帰属させない
  }
  function foreignId(id){ return verdict(id) != null; }
  function f889(){ try { return W.__v292Dfix889 || null; } catch(e){ return null; } }
  function localOnlyId(id){ var F = f889(); try { return !!(F && typeof F.classOf === 'function' && F.classOf(id) === 'local'); } catch(e){ return false; } }
  function localOnlyRow(x){ var F = f889(); try { return !!(F && typeof F.classOfRow === 'function' && F.classOfRow(x) === 'local'); } catch(e){ return false; } }

  // ---- (1) HOME 一覧: fix889 の公開関数を包む
  function wrap889(F){
    if (!F || F.__iso1 || typeof F.mayShowRow !== 'function') return;
    var r0 = F.mayShowRow, s0 = F.mayShow; r889 = r0;
    try {
      F.mayShowRow = function(x){ var ok = r0.apply(this, arguments); if (ok && x && x.id != null && localOnlyRow(x) && foreignId(x.id)){ stats.hid++; return false; } return ok; };
      if (typeof s0 === 'function') F.mayShow = function(id){ var ok = s0.apply(this, arguments); if (ok && localOnlyId(id) && foreignId(id)){ stats.hid++; return false; } return ok; };
      F.__iso1 = true;
    } catch(e){}
    try { if (/(^|\/)index\.html$|\/$/.test(W.location.pathname)) armGate(); } catch(e){}
  }
  try {
    var cur = W.__v292Dfix889;
    if (cur) wrap889(cur);
    else Object.defineProperty(W, '__v292Dfix889', { configurable: true, enumerable: true,
      get: function(){ return undefined; },
      set: function(v){ try { Object.defineProperty(W, '__v292Dfix889', { value: v, writable: true, configurable: true, enumerable: true }); } catch(e){ } wrap889(v); } });
  } catch(e){}

  // ---- (2) 物語を開く扉 (index.html?story=<id>)
  var gate = { armed: false, id: null, why: null };
  var GATE_MSG = {
    foreign: 'この物語は、いまログイン中のアカウントとは別のアカウントで作られた、この端末だけの物語です。作ったアカウントでログインし直すと開けます。',
    unknown: 'この物語は、この端末に持ち主の記録がない古い物語のため、いまは開けません（消していません）。持ち主のアカウントでホームの案内から自分のものにすると開けます。',
    conflict: '別のタブでアカウントが切り替わったため、この画面では開けません。読み込み直してください（物語は消していません）。',
    nouser: 'ログインしていないため開けません。ログインしてから読み込み直してください（物語は消していません）。',
    checking: 'この物語を開いてよいか、サーバに確かめています…'
  };
  function storyIdOfUrl(){ try { var u = new URLSearchParams(W.location.search).get('story'); return u ? String(u) : null; } catch(e){ return null; } }
  function btn(d, label, bg){ var b = d.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'padding:8px 16px;border-radius:8px;border:0;background:' + bg + ';color:#fff;font-size:14px;margin:0 8px 0 0'; return b; }
  function showGate(){
    try {
      var d = W.document, old = d.getElementById('v292iso1gate'); if (old && old.parentNode) old.parentNode.removeChild(old);
      var box = d.createElement('div');
      box.id = 'v292iso1gate'; box.setAttribute('data-why', String(gate.why || ''));
      box.style.cssText = 'position:fixed;inset:0;z-index:100003;display:flex;align-items:center;justify-content:center;background:#111;color:#f2f2f4;padding:16px;font:15px/1.7 sans-serif';
      var c = d.createElement('div'); c.style.cssText = 'max-width:420px;background:#1b1b20;border:1px solid #3a3a44;border-radius:12px;padding:20px';
      var h = d.createElement('h2'); h.style.cssText = 'margin:0 0 10px;font-size:17px'; h.textContent = (gate.why === 'checking') ? '確認しています' : '物語を開けません';
      var p = d.createElement('p'); p.style.cssText = 'margin:0 0 14px;font-size:13.5px;color:#c8c8d0';
      p.textContent = GATE_MSG[gate.why] || GATE_MSG.foreign;
      var b = btn(d, 'ホームへ戻る', '#4a6cf7');
      b.addEventListener('click', function(){ try { W.location.href = 'home.html'; } catch(e){} }, false);
      c.appendChild(h); c.appendChild(p); c.appendChild(b);
      if (gate.why === 'conflict' || gate.why === 'nouser' || gate.retry) { var r = btn(d, '読み込み直す', '#3a3a44'); r.addEventListener('click', function(){ try { W.location.reload(); } catch(e){} }, false); c.appendChild(r); }
      box.appendChild(c); (d.body || d.documentElement).appendChild(box);
    } catch(e){}
  }
  // 拒否した document では、その物語の本文キーを読ませず、物語まわりの key へ書かせない(lastOpenedAt なども含め 1 byte も変えない)
  function armTrap(id){
    try {
      var P = W.Storage && W.Storage.prototype; if (!P || P.__iso1) return;
      var body = (sidNorm(id) === 'chr6') ? 'chr6' : ('chr6_slot_' + id), og = P.getItem, os = P.setItem, orm = P.removeItem;
      var wr = function(k){ k = String(k); return k === body || k === 'chr6_slots_meta' || k.indexOf('chr6_scenario_') === 0 || k === 'v292iso2_slotown'; };
      var mine = function(t){ try { return t === W.localStorage; } catch(e){ return false; } };
      P.getItem = function(k){ if (mine(this) && String(k) === body) return null; return og.apply(this, arguments); };
      P.setItem = function(k){ if (mine(this) && wr(k)) return undefined; return os.apply(this, arguments); };
      P.removeItem = function(k){ if (mine(this) && wr(k)) return undefined; return orm.apply(this, arguments); };
      P.__iso1 = true;
      // 先に読み込まれた他 file の instance 包み(fix246/fix893 等)は prototype を経由しないので、いちばん外側に instance 包みも置く
      try {
        var L = W.localStorage, i0 = L.setItem, r0 = L.removeItem;
        L.setItem = function(k){ if (wr(k)) return undefined; return i0.apply(L, arguments); };
        L.removeItem = function(k){ if (wr(k)) return undefined; return r0.apply(L, arguments); };
      } catch(e){}
    } catch(e){}
  }
  function hideChrome(){
    try { var st = W.document.createElement('style'); st.id = 'v292iso1style'; st.textContent = '#story,#composer,#topbar,#branches{visibility:hidden !important}'; (W.document.head || W.document.documentElement).appendChild(st); } catch(e){}
  }
  function armGate(){
    var id = storyIdOfUrl(); if (!id) return;
    var why = verdict(id); if (!why) return;
    if (!localOnlyId(id)) return;                         // クラウドに結び付いた物語は fix889 の扉に任せる(従来どおり)
    gate.armed = true; gate.id = id; gate.why = (why === 'unknown') ? 'checking' : why; stats.refused++;
    try { W.__chrBootDefer = true; } catch(e){}            // engine の最初の起動を止める(誰も __chrEngineBoot を呼ばない)
    armTrap(id); hideChrome();
    if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', showGate, false); else showGate();
    if (why === 'unknown') probeUnknown(id);
  }
  /* 持ち主不明(記録なし)の物語: サーバに「このアカウントのクラウドにあるか」を聞く(fix889 の listshadow。新しい通信の種類は増やさない)。
     ある → 台帳に書いて 1 度だけ読み込み直す(engine はこの document では起動しない。fix889 の reload-once と同じ考え方)。
     無い・答えが無い・別アカウント・時間切れ → 開けない(unknown)。 */
  function probeUnknown(id){
    var done = false, t0 = Date.now(), RL = 'v292iso1_rl_' + sidNorm(id);
    var fin = function(ok, why){
      if (done) return; done = true; gate.probe = why;
      var tag = meTag();
      var refuse = function(w){ gate.why = 'unknown'; gate.retry = (w === 'TIMEOUT' || w === 'NO_ME' || w === 'RELOAD_CAPPED' || w === 'WRITE_REFUSED'); gate.probe = w; showGate(); };
      if (!(ok && tag)) return refuse(why);
      /* 答えを残す(台帳 or 同じタブの札)。Vault v2 CopyGate は起動直後(自分の答えが出るまで)物語 id を含む新しい key を断る(K5)ので、
         通るまで最大 10 秒待って書き直す(CopyGate は迂回しない)。書けなければ開かない。 */
      var tries = 0, persist = function(){
        var added = srvAdd(tag, id), tok = false;
        try { var s0 = ssObj(), tv = JSON.stringify({ tag: tag, at: Date.now() }); s0.setItem(SS_OK + sidNorm(id), tv); tok = (s0.getItem(SS_OK + sidNorm(id)) === tv); } catch(e){ tok = false; }
        gate.fin = { ok: ok, tag: tag, added: added, token: tok, tries: tries };
        if (!(added || tok)) { if (++tries < 20) return setTimeout(persist, 500); return refuse('WRITE_REFUSED'); }
        var n = 0; try { var ss = W.sessionStorage; var o = JSON.parse(ss.getItem(RL) || 'null'); n = (o && (Date.now() - o.at) < 60000) ? o.n : 0; ss.setItem(RL, JSON.stringify({ n: n + 1, at: Date.now() })); } catch(e){ gate.fin.ssErr = String(e && e.message || e).slice(0, 80); }
        gate.fin.n = n;
        if (n < 2) { gate.why = 'reload'; try { W.location.reload(); } catch(e){} return; }
        refuse('RELOAD_CAPPED');
      };
      persist();
    };
    var ask = function(){
      try {
        if (done) return;
        var tag = meTag(); if (!tag) return fin(false, 'NO_VIEWER');
        if (!srvAcctAgrees(tag)) { if (Date.now() - t0 > 15000) return fin(false, 'NO_ME'); return setTimeout(ask, 300); }   // /auth/me の答え待ち
        var F = f889(); if (!F || typeof F.refresh !== 'function') return fin(false, 'NO_F889');
        F.refresh(function(){ try { var okv = srvVisibleNow(tag, id); gate.diag = { st: F.state && F.state(), agree: srvAcctAgrees(tag), row: (function(){ try { return r889.call(F, { id: String(id), cloud: true }); } catch(e){ return 'ERR'; } })(), at: Date.now() - t0 }; fin(okv, (F.state && F.state()) || '?'); } catch(e){ fin(false, 'ERR'); } });
      } catch(e){ fin(false, 'ERR'); }
    };
    setTimeout(function(){ fin(false, 'TIMEOUT'); }, 25000);   // サーバの答え待ちの上限(書き直し待ちは fin の中で別に最大 10 秒)
    if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', function(){ setTimeout(ask, 0); }, false); else setTimeout(ask, 0);
  }

  // ---- (3) putimg: 隠す対象の local-only 物語の storyId を外す (fix889 の wrapper より内側)
  (function(){
    var N = W.fetch; if (typeof N !== 'function') return;
    var w = function(input, init){
      try {
        var u = (typeof input === 'string') ? input : (input && input.url) || '';
        if (init && typeof init.body === 'string' && String(u).indexOf('/save') >= 0 && init.body.indexOf('"putimg"') >= 0) {
          var o = JSON.parse(init.body);
          if (o && o.op === 'putimg') {
            var ids = [];
            if (o.storyId != null && o.storyId !== '') ids.push(String(o.storyId));
            if (Object.prototype.toString.call(o.storyIds) === '[object Array]') for (var i = 0; i < o.storyIds.length; i++) ids.push(String(o.storyIds[i]));
            var bad = {}, any = false;
            for (var j = 0; j < ids.length; j++) { var sid = ids[j]; if (foreignLocal(sid)) { bad[sid] = true; any = true; } }
            if (any) {
              if (o.storyId != null && bad[String(o.storyId)]) { if (o.mid != null) o.mid = String(o.mid).split('|s' + o.storyId).join(''); delete o.storyId; }
              if (o.storyIds) o.storyIds = o.storyIds.filter(function(s){ return !bad[String(s)]; });
              stats.stripped++;
              var i2 = {}; for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) i2[k] = init[k];
              i2.body = JSON.stringify(o); init = i2;
            }
          }
        }
      } catch(e){}
      return N.call(this === w ? W : this, input, init);
    };
    try { W.fetch = w; } catch(e){}
  })();
  function foreignLocal(id){
    id = String(id);
    if (!localOnlyId(id)) return false;
    return foreignId(id);
  }

  // ---- (4) 持ち主不明の古い物語の取り戻し (HOME・Owner だけ・明示の確認のあと)
  /* Owner かどうか: この document の /auth/me の答え(fix893 serverMe。in-memory。mark の ent は使わない)だけを信じる(fix905 の serverGate と同じ条件) */
  function ownerNow(){
    try {
      var A = f893(); if (!A || typeof A.serverMe !== 'function') return null;
      var m = A.serverMe(); if (!m || !m.accountId) return null;
      if (m.entitlement !== 'owner') return null;
      if (m.status && m.status !== 'active') return null;
      var v = viewer(); if (v.k !== 'acct') return null;
      var t = tagOf('acct:' + String(m.accountId));
      return (t === v.tag) ? t : null;                    // mark / supplier と /auth/me が同じアカウントの時だけ
    } catch(e){ return null; }
  }
  function metaRows(){ try { var m = JSON.parse(lsg('chr6_slots_meta') || '[]'); return (Object.prototype.toString.call(m) === '[object Array]') ? m : []; } catch(e){ return []; } }
  function createdOk(row){ var c = row && row.createdAt; if (c == null || c === '') return true; var t = Date.parse(String(c)); if (!(t > 0)) return true; return t <= Date.parse(CUTOFF); }
  function heldSummary(){
    var out = { foreign: 0, unknown: 0, conflict: 0, nouser: 0, claimable: 0, unknownAfterCutoff: 0 };
    metaRows().forEach(function(x){
      if (!x || x.id == null || !localOnlyRow(x)) return;
      var v = verdict(x.id); if (!v) return;
      out[v] = (out[v] || 0) + 1;
      if (v === 'unknown') { if (createdOk(x)) out.claimable++; else out.unknownAfterCutoff++; }
    });
    return out;
  }
  function claimableIds(){
    var ids = [];
    metaRows().forEach(function(x){ if (x && x.id != null && localOnlyRow(x) && verdict(x.id) === 'unknown' && createdOk(x)) ids.push(String(x.id)); });
    return ids;
  }
  function writeClaim(me, ids){
    var raw = lsg(STAMP_KEY), o = null;
    if (raw == null) o = { v: 1, s: {}, c: {}, a: {} };
    else { try { o = JSON.parse(raw); } catch(e){ o = null; } if (!o || o.v !== 1 || !o.s || typeof o.s !== 'object') return { ok: false, why: 'STAMPS_BROKEN' }; }   // 壊れた記録は上書きしない
    var n = 0, at = Date.now();
    for (var i = 0; i < ids.length; i++){ var k = sidNorm(ids[i]); if (o.s[k]) continue; o.s[k] = { c: me, w: me, at: at, by: 'iso1d-claim' }; n++; }   // 既にある記録は変えない
    if (!n) return { ok: true, n: 0 };
    var s = JSON.stringify(o);
    try { LS.setItem(STAMP_KEY, s); } catch(e){ return { ok: false, why: 'WRITE_FAILED' }; }
    if (lsg(STAMP_KEY) !== s) return { ok: false, why: 'READBACK_MISMATCH' };
    return { ok: true, n: n };
  }
  var CLAIM_ID = 'v292iso1claim';
  function isHome(){ try { return /(^|\/)home(\.html)?$/.test(W.location.pathname); } catch(e){ return false; } }
  function renderClaim(){
    try {
      if (!CLAIM_ON) { var o0 = W.document.getElementById(CLAIM_ID); if (o0 && o0.parentNode) o0.parentNode.removeChild(o0); return; }
      if (!isHome()) return;
      var d = W.document, old = d.getElementById(CLAIM_ID);
      var me = ownerNow(), ids = me ? claimableIds() : [];
      if (!me || !ids.length){ if (old && !old.__busy) old.parentNode.removeChild(old); return; }
      if (old) { if (old.__busy || old.__n === ids.length) return; old.parentNode.removeChild(old); }
      var grid = d.getElementById('grid'); if (!grid || !grid.parentNode) return;
      var box = d.createElement('div'); box.id = CLAIM_ID; box.__n = ids.length; box.setAttribute('data-n', String(ids.length));
      box.style.cssText = 'margin:0 0 12px;padding:12px 14px;border:1px solid #6b5a2a;background:#2a2416;color:#efe6cf;border-radius:10px;font-size:13px;line-height:1.7';
      var p = d.createElement('div'); p.setAttribute('data-iso1claim', 'text');
      p.textContent = 'この端末に、持ち主の記録がない古い物語が ' + ids.length + ' 件あります（この端末だけに保存）。いまは一覧に出さず、開けないようにしています（消していません）。';
      var b1 = btn(d, 'この端末の持ち主不明の物語 ' + ids.length + ' 件を自分のものにする', '#8a6d1f'); b1.setAttribute('data-iso1claim', 'ask'); b1.style.marginTop = '8px';
      box.appendChild(p); box.appendChild(b1);
      b1.addEventListener('click', function(){
        try {
          box.__busy = true; b1.style.display = 'none';
          var q = d.createElement('div'); q.setAttribute('data-iso1claim', 'confirm-text'); q.style.marginTop = '8px';
          q.textContent = '本当に自分のものにしますか？ ' + ids.length + ' 件が、いまのアカウント（オーナー）の物語として一覧に出て、開けるようになり、クラウドへの同期の対象にもなります。ほかの人の物語が混ざっているかもしれない時は「やめる」を押してください。';
          var ok = btn(d, '自分のものにする', '#b0402a'); ok.setAttribute('data-iso1claim', 'yes');
          var no = btn(d, 'やめる', '#3a3a44'); no.setAttribute('data-iso1claim', 'no');
          var row = d.createElement('div'); row.style.marginTop = '8px'; row.appendChild(ok); row.appendChild(no);
          box.appendChild(q); box.appendChild(row);
          no.addEventListener('click', function(){ try { box.__busy = false; q.parentNode.removeChild(q); row.parentNode.removeChild(row); b1.style.display = ''; } catch(e){} }, false);
          ok.addEventListener('click', function(){
            try {
              ok.disabled = true; no.disabled = true; q.textContent = 'アカウントを確かめています…';
              var tag0 = ownerNow(), A = f893();
              var fail = function(why){ stats.claimFail = why; q.textContent = 'オーナーのアカウントであることを確かめられなかったため、何もしていません（' + why + '）。'; box.__busy = false; };
              if (!tag0 || !A || typeof A.refreshMe !== 'function') return fail('NOT_OWNER');
              Promise.resolve(A.refreshMe()).then(function(){
                var tag1 = ownerNow();
                if (!tag1 || tag1 !== tag0) return fail('NOT_OWNER_AFTER_RECHECK');
                var r = writeClaim(tag1, claimableIds());
                if (!r.ok) return fail(r.why);
                stats.claimed += r.n;
                q.textContent = r.n + ' 件を自分のものにしました。読み込み直します。';
                try { console.log(TAG, 'claimed', r.n); } catch(e){}
                setTimeout(function(){ try { W.location.reload(); } catch(e){} }, 300);
              }, function(){ fail('RECHECK_FAILED'); });
            } catch(e){ stats.claimFail = 'ERROR'; }
          }, false);
        } catch(e){}
      }, false);
      grid.parentNode.insertBefore(box, grid);
    } catch(e){}
  }
  /* ---- (5) HOME の「続きから遊ぶ」(fix870 #contBtn): chr6_slots_meta の最新 1 件を一覧の可視判定なしで指すため、
     隠した物語の id を持つことがある(実測: B の home に A の物語の id)。隠した物語を指していたら、一覧に出せる物語のうち最新のものへ付け替え、
     無ければボタンを隠す。fix870 の node・handler・並びは触らない(data-open と hidden だけ)。 */
  function okKey(m){ return String((m && (m.lastOpenedAt || m.updatedAt || m.createdAt)) || ''); }
  function fixCont(){
    try {
      var b = W.document.getElementById('contBtn'); if (!b) return;
      var id = b.getAttribute('data-open'); if (!id) return;
      if (!(localOnlyId(id) && foreignId(id))) return;
      var F = f889(), best = null;
      metaRows().forEach(function(m){ try { if (m && m.id && F && F.mayShowRow(m) === true && (best === null || okKey(m).localeCompare(okKey(best)) > 0)) best = m; } catch(e){} });
      if (best) b.setAttribute('data-open', String(best.id)); else { b.removeAttribute('data-open'); b.hidden = true; }
      stats.contFixed = (stats.contFixed || 0) + 1;
    } catch(e){}
  }
  function watchCont(){
    try {
      fixCont();
      if (typeof MutationObserver !== 'function') return;
      new MutationObserver(function(recs){ for (var i = 0; i < recs.length; i++) if (recs[i].target && recs[i].target.id === 'contBtn') { fixCont(); return; } })
        .observe(W.document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-open', 'hidden'] });
    } catch(e){}
  }
  try {
    if (isHome()) {
      if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', watchCont, false); else watchCont();
      W.addEventListener('chr:account-me', function(){ setTimeout(fixCont, 0); }, false);
    }
  } catch(e){}
  try {
    if (isHome()) {
      W.addEventListener('chr:account-me', function(){ setTimeout(renderClaim, 0); }, false);
      if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', function(){ setTimeout(renderClaim, 0); }, false); else setTimeout(renderClaim, 0);
      W.addEventListener('storage', function(ev){ try { if (!ev || !ev.key || ev.key === STAMP_KEY || ev.key === 'chr6_slots_meta' || ev.key === 'v292Dfix837_sess') setTimeout(renderClaim, 0); } catch(e){} }, false);
    }
  } catch(e){}

  W.__v292DfixISO1 = {
    build: BUILD, TAG: TAG, CUTOFF: CUTOFF,
    foreignId: foreignId, foreignLocal: foreignLocal, verdict: verdict,
    status: function(){ var v = viewer(); return { build: BUILD, me: v.k === 'acct' ? v.tag : null, viewer: v.k, owner: !!ownerNow(), held: heldSummary(), firstLegacy: readFirst(), gate: { armed: gate.armed, id: gate.id, why: gate.why, probe: gate.probe || null, diag: gate.diag || null, fin: gate.fin || null }, stats: JSON.parse(JSON.stringify(stats)), wrapped: !!(f889() && f889().__iso1), claimUi: !!(W.document && W.document.getElementById(CLAIM_ID)) }; }
  };
  try { console.log(TAG, 'armed', BUILD, gate.armed ? 'GATE:' + gate.id + ':' + gate.why : ''); } catch(e){}
})();
