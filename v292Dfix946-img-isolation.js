// =====================================================================
// Chronicle TRPG - v292Dfix946（第 1 段 = M3 だけ）: アイコン画像の「アカウント境界」
// ---------------------------------------------------------------------
// 裁定: GPT #125-GR（段階リリース採用。第 1 段は M3 だけ。M1 新キー・M2 移行は入れない）
// 元: imgiso_fix_20261014/ovr/v292Dfix946-img-isolation.js（M1〜M3 の Local 実装）から M3 だけを切り出した。
//
// ■第 1 段で変わること（アカウントが変わったときだけ）
//   ・アイコンのキーは今までどおり（'n'+hash(正名|画風)。物語 ID は付けない）。表示・生成・通信は
//     同じアカウントで使う限り修正前と同じ。
//   ・持ち主の印 v292iso946_owner = hash(アカウントの識別)。起動時に今のアカウントと比べ、違えば
//     画像系の端末状態（LS の ns・rev 台帳・レシピ・生成記録など、IndexedDB の画像）を**退避（隔離）**してから
//     印を付け替える。退避先: LS は v292iso946_q_<旧印> の 1 blob、IndexedDB は別 DB chr6av_q。
//     ★消さない: 写し終えて読み戻し（LS）／書込み完了（IDB）を確かめてから元を消す＝移動。元の持ち主に戻れば戻す。
//   ・ページの途中でアカウントが変わったら（別タブのログイン・cookie の差し替え）、その document を fence する:
//       画像の読み書きを止め、表示中のアイコンを仮アイコンへ戻す／遅れて届いた生成・pull・ns の応答は捨てる／
//       画像系の通信（putimg / getimg / imgmanifest / imgconfirm / imgmigrate / imgnsinfo / GET /img）を送らない。
//   ・仮表示（provisional）は無い（M2 の概念。第 1 段には入れない）。
//
// ■キー名（第 1 段で M1〜M3 版から変えた）
//   M1〜M3 版の 'v292av_owner' / 'v292avq_' は本番の既存の「接頭辞で一括に扱う」規則に当たる:
//     ・v292Dfix197 clearCache の indexOf('v292av')===0 → 退避 blob（前のアカウントのデータ）ごと消える
//     ・v292Dfix562 / v292Dfix721 の SHARED_ASSET_RE /^v292av\d*_/ → 印が共有資産として控えに入り、復元で別アカウントへ戻る
//   そのため本番のどの接頭辞規則にも当たらない 'v292iso946_' に変えた（STAGE1_AND_NUMBERING_20261014.md §1）。
//
// ■kill（localStorage。既定は有効）
//   v292Dfix946Off='1'   … 全部止める（関所も置かない。fix197/346/400/523 の変更点も修正前と同じ挙動）
//   v292Dfix946M3Off='1' … 関所は置くが素通し（退避・fence をしない）
//
// ■変えないもの: Worker・D1・/img の仕様・ns の式・アイコンのキー。サーバの行は読むだけで書かない。
// 読み込み位置: index.html の fix893 の直後（fix889 より前。fix889 が掴む fetch をこの関所にするため）
// 観測口: window.__v292Dfix946.status()
//
// ■iso1b（2026-10-14 / GPT #125-GV: 残り 2 条件だけ直す）
//   (1) fix654 の Storage トラップが効かない iPhone（インスタンスへの代入 localStorage.setItem = fn が保存アイテムになる型）:
//       書込みの関所をインスタンスに置いて、効いたか（LS.setItem === w）をその場で確かめる。効かなければ Storage.prototype の
//       getItem / setItem / removeItem に関所を置く（this === localStorage の時だけ。fence 中だけ働き、それ以外は素通し）。
//       fence 中に止めるもの: 持ち主つき key の書込み／'v292av2_' の削除と読み（fix346 のラッパが iOS で効かない分の肩代わり）。
//   (2) 持ち主の印（v292iso946_owner）が読めない・書けない・壊れている時は「持ち主不明」として扱う（fail-closed・消さない）:
//       ・切替の起動: 退避 → 印を書く（読み戻して確かめる）→ 成功した時だけ今の持ち主の分を戻す。印が書けなければ fence し、
//         戻さない・IndexedDB の退避もしない（次の起動でやり直す。今の持ち主の絵を前の持ち主の退避に入れない）。
//       ・IndexedDB の退避後の印の書き直し（idbFrom を消す）は、fix346 が今の持ち主の分を戻す**前**に行う（idbMovedOut）。
//         書けなければ fence し、戻さない。
//       ・印が読めない（例外）: fence・何もしない。印が壊れている／退避 blob があるのに印が無い: 今の端末状態を「持ち主不明」の
//         退避（タグ 'u…'。どのアカウントにも戻さない）へ移してから、今の持ち主の印を付ける。
//       ・document の途中でも、fenced() のたびに印を読み直し、印が自分の持ち主でなくなっていたら fence する（別タブの切替）。
//       ・bootstrap（印が無く、退避 blob も無い）で印が書けない時は fence しない（同じアカウントの動きを変えない。次の起動も
//         bootstrap になるだけで、誤った退避は起きない）。
//       → ★iso1c で変更（下）。
//
// ■iso1c（2026-10-14 / GPT #125-GW: 初回＝bootstrap で印が書けない時の扱い）
//   iso1b の「bootstrap で印が書けない時は fence しない」は不採用。次の形に直した:
//   ・bootstrap（印が無く、退避 blob も無い）で印が書けない（例外・満杯・読み戻し不一致）→ 画像だけ「保留」（hold）にする。
//       保留＝この document では画像を扱わない: 保存済みの画像（所属不明）を表示しない・移さない・再保存しない、
//       新しい画像も作らない・保存しない（印が無いので「この端末・このアカウントのもの」と後から確かめられない）。
//       画像系の通信（putimg / getimg / imgmanifest / imgconfirm / imgmigrate / imgnsinfo / GET /img）も送らない。
//       中身は fence と同じ（fix197 / fix346 / fix400 / fix523 は fenced() を見て止まる）。止めるのは画像だけで、
//       物語の生成・保存・表示（画像以外の localStorage・送信）は止めない。保留でも何も消さない。
//   ・印に問題がある起動（印が読めない・印が書けない・bootstrap で書けない）では、fix346 の LS→IndexedDB の移行もしない
//       （holding()。所属不明の絵を動かさない）。
//   ・持ち主不明（u…）の退避・印の読み直し・関所の置き方は iso1b のまま。次の起動で印が書ければ、従来の bootstrap に戻る。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix946 && W.__v292Dfix946.__armed) return;
  var TAG = '[v292Dfix946:img-account-boundary]';
  var STAGE = 'stage1-m3';
  var LS = W.localStorage;
  var _get = LS.getItem.bind(LS), _set = LS.setItem.bind(LS), _del = LS.removeItem.bind(LS);
  function lsg(k){ try { return _get(k); } catch(e){ return null; } }
  function lss(k, v){ try { _set(k, v); return true; } catch(e){ return false; } }
  function lsd(k){ try { _del(k); } catch(e){} }

  function masterOff(){ return lsg('v292Dfix946Off') === '1'; }
  function on(){ return !masterOff(); }
  function m3On(){ return on() && lsg('v292Dfix946M3Off') !== '1'; }

  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function fnv(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return (h>>>0).toString(36); }

  // ------------------------------------------------------------------ 持ち主
  /* 識別の優先順（M1〜M3 版と同じ）:
       (1) pages.dev の cookie アカウント: fix893 の mark（LS・全タブ共有）と supplier（document の記憶）。
           2 つが食い違う＝別タブがログインし直した → 'conflict'（どちらとも決めない＝fence 側）
       (2) 旧 origin の Google: fix328 のメール（token 失効中も保存されている）／fix837 の mark のメール
       (3) 合言葉: hash(合言葉)
       (4) 何も無い: 'anon'（匿名も 1 人の持ち主として扱う＝ログアウト後の人に前の人の絵を見せない） */
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
    if (sup) return 'sess:' + fnv(sup);           // 旧 fix837 sid だけ（メール不明）
    return 'anon';
  }
  function tagOf(raw){ return (raw === 'conflict') ? 'conflict' : ('o' + fnv(raw) + hash(raw)); }
  function ownerNow(){ return tagOf(ownerRaw()); }

  var OWNER_KEY = 'v292iso946_owner';
  var Q_PREFIX = 'v292iso946_q_';
  /* 退避の対象（持ち主つきの端末状態）。'v292avprov_v1' / 'v292avmig_' は第 2 段（M2）の台帳。第 1 段は書かないが、
     第 2 段から第 1 段へ戻した端末でも前の持ち主の台帳を残さないよう対象に入れておく（無ければ何もしない）。 */
  var OWNED_EXACT = ['v292Dfix400_ns', 'v292Dfix891_ns', 'v292Dfix891_nsc', 'v292Dfix523_rev',
                     'v292Dfix402_pimg', 'v292Dfix402_pimg_dead', 'v292Dfix399_imgHash', 'v292Dfix399_imgKeys',
                     'chr6_vault_hidden', 'v292avprov_v1'];
  var OWNED_PREFIX = ['v292av2_', 'v292avrec_', 'v292cvar_', 'v292cgen_', 'v292avmig_'];
  function isOwnedKey(k){
    k = String(k || '');
    if (OWNED_EXACT.indexOf(k) >= 0) return true;
    for (var i = 0; i < OWNED_PREFIX.length; i++) if (k.indexOf(OWNED_PREFIX[i]) === 0) return true;
    return false;
  }
  function lsKeys(){ var out = []; try { var n = LS.length || 0; for (var i = 0; i < n; i++){ var k = LS.key(i); if (k != null) out.push(k); } } catch(e){} return out; }

  var diag = { boot: null, from: null, to: null, lsMoved: 0, lsRestored: 0, idbMoved: 0, idbRestored: 0,
               fenceAt: null, fenceWhy: null, blockedNet: 0, droppedWrites: 0, staleDiscard: 0, err: [],
               mark: null, droppedRemoves: 0, hold: null };   // ★iso1b: mark = 起動時の印の状態 / droppedRemoves = prototype の関所で止めた削除 ／ ★iso1c: hold
  var bootOwner = null, sticky = false, epochN = 0, fenceCbs = [], idbPending = null, quarantining = false;
  var markOk = false, idbMarkDone = false, gateMode = 'none';   // ★iso1b
  var markHold = null;   // ★iso1c: 印に問題がある起動の理由（BOOTSTRAP_UNMARKED / MARK_UNREADABLE / MARK_WRITE_FAILED）。null＝保留していない

  /* ★iso1b: 印の状態を 4 つに分ける。'ok' / 'absent'（読めて、無い）/ 'unreadable'（読むと例外）/ 'corrupt'（在るが形が違う） */
  function readMarkSt(){
    var raw;
    try { raw = _get(OWNER_KEY); } catch(e){ return { st: 'unreadable' }; }
    if (raw == null) return { st: 'absent' };
    try {
      var o = JSON.parse(raw);
      if (o && o.v === 1 && typeof o.o === 'string' && o.o && (o.idbFrom == null || typeof o.idbFrom === 'string')) return { st: 'ok', m: o, raw: raw };
    } catch(e){}
    return { st: 'corrupt', raw: String(raw) };
  }
  function readMark(){ var r = readMarkSt(); return r.st === 'ok' ? r.m : null; }
  /* idbFrom = IndexedDB の退避がまだ終わっていない旧持ち主。終わるまで印に残し、次の起動でやり直す
     ★iso1b: 書いた後に読み戻し、同じ文字列が入っている時だけ成功とする（黙って書けなかった場合も失敗） */
  function writeMark(o, why, idbFrom){
    var m = { v: 1, o: o, at: Date.now(), why: why }; if (idbFrom) m.idbFrom = idbFrom;
    var s = JSON.stringify(m);
    if (!lss(OWNER_KEY, s)) return false;
    var back = null; try { back = _get(OWNER_KEY); } catch(e){ return false; }
    return back === s;
  }
  /* ★iso1b: 持ち主不明の退避タグ（'u' で始まる。持ち主のタグ 'o…' / 'conflict' とは決して一致しない＝どのアカウントにも戻さない）。
     同じ壊れ方なら同じタグ（起動をまたいで 1 つの退避にまとまる） */
  function unknownTag(seed){ return 'u' + fnv(String(seed)) + hash(String(seed)); }
  function hasQBlob(){ var ks = lsKeys(); for (var i = 0; i < ks.length; i++) if (ks[i].indexOf(Q_PREFIX) === 0) return true; return false; }

  /* LS の退避: 旧持ち主の owned key を 1 blob にまとめ、読み戻して確かめてから元を消す（blob が書けなければ元を消さない＝fence）。 */
  function quarantineLs(fromTag){
    var keys = lsKeys().filter(function(k){ return isOwnedKey(k) && k.indexOf(Q_PREFIX) !== 0; });
    if (!keys.length) return true;
    var bk = Q_PREFIX + fromTag, blob = null;
    try { blob = JSON.parse(lsg(bk) || 'null'); } catch(e){ blob = null; }
    if (!blob || blob.v !== 1 || typeof blob.keys !== 'object') blob = { v: 1, at: Date.now(), keys: {} };
    /* ★同じ key が既に blob に在る（前回の復帰が部分的だった）ときは、今の値を keys に入れ、前の値は older に残す（どちらも消さない） */
    keys.forEach(function(k){
      var v = lsg(k); if (v == null) return;
      if ((k in blob.keys) && blob.keys[k] !== v){ if (!blob.older || typeof blob.older !== 'object') blob.older = {}; (blob.older[k] = blob.older[k] || []).push(blob.keys[k]); }
      blob.keys[k] = v;
    });
    blob.at = Date.now();
    if (!lss(bk, JSON.stringify(blob))) { diag.err.push('LS_QUARANTINE_WRITE_FAILED'); return false; }
    var back = null; try { back = JSON.parse(lsg(bk) || 'null'); } catch(e){ back = null; }
    if (!back || !back.keys) { diag.err.push('LS_QUARANTINE_READBACK_FAILED'); return false; }
    // ★読み戻した blob に同じ値が入っている key だけを元から消す（値が違う＝退避に失敗した key は残す）
    keys.forEach(function(k){ if ((k in back.keys) && back.keys[k] === lsg(k)) { lsd(k); diag.lsMoved++; } });
    return true;
  }
  function restoreLs(toTag){
    var bk = Q_PREFIX + toTag, blob = null;
    try { blob = JSON.parse(lsg(bk) || 'null'); } catch(e){ blob = null; }
    if (!blob || blob.v !== 1 || !blob.keys) return;
    var ok = true;
    for (var k in blob.keys){
      if (!Object.prototype.hasOwnProperty.call(blob.keys, k)) continue;
      if (lsg(k) != null) { if (lsg(k) !== blob.keys[k]) ok = false; continue; }   // 今の値があれば上書きしない（その場合 blob は残す）
      if (lss(k, blob.keys[k])) diag.lsRestored++; else ok = false;
    }
    if (!ok) { diag.err.push('LS_RESTORE_PARTIAL'); return; }
    if (blob.older && typeof blob.older === 'object' && Object.keys(blob.older).length) lss(bk, JSON.stringify({ v: 1, at: Date.now(), keys: {}, older: blob.older }));   // 前の値は残す
    else lsd(bk);
  }

  function bootFence(why, hold){ sticky = true; diag.fenceWhy = why; diag.fenceAt = Date.now(); quarantining = false; idbPending = null; if (hold) { markHold = why; diag.hold = why; } }   // ★iso1c: hold
  function boot(){
    if (!m3On()) { diag.boot = 'm3-off'; return; }
    var cur = ownerNow();
    var rm = readMarkSt(); diag.mark = rm.st;
    if (cur === 'conflict') { diag.boot = 'conflict'; bootFence('BOOT_OWNER_CONFLICT'); return; }
    /* ★iso1b: 印が読めない（例外）＝持ち主不明。何も移さず・書かず・表示しない（消さない） */
    if (rm.st === 'unreadable') { diag.boot = 'mark-unreadable'; diag.err.push('MARK_UNREADABLE'); bootFence('MARK_UNREADABLE', true); return; }
    var from = null, unknown = false;
    if (rm.st === 'absent') {
      if (!hasQBlob()) {
        // 既存端末の初回: 今の持ち主のものとみなす（限界は報告書）。
        // ★iso1c（GPT #125-GW）: 印が書けない時は、端末の画像の持ち主を確かめられない＝所属不明。画像だけ保留（hold）にする。
        //   表示・移動・再保存・新しい画像の生成と保存・画像系の通信をしない（fence と同じ）。何も消さない。物語は止めない。
        //   次の起動で印が書ければ、従来どおりの bootstrap になる（この document は画像系を何も書いていない＝所属不明のデータを増やさない）。
        markOk = writeMark(cur, 'bootstrap'); bootOwner = cur;
        if (!markOk) { diag.err.push('MARK_WRITE_FAILED_BOOTSTRAP'); diag.boot = 'bootstrap-hold'; bootFence('BOOTSTRAP_UNMARKED', true); return; }
        diag.boot = 'bootstrap'; return;
      }
      from = unknownTag('lost'); unknown = true; diag.boot = 'mark-lost';      // 退避 blob が在るのに印が無い＝印が消えた
    } else if (rm.st === 'corrupt') {
      from = unknownTag(rm.raw); unknown = true; diag.boot = 'mark-corrupt';
    } else if (rm.m.o === cur) {
      bootOwner = cur; diag.boot = 'same'; markOk = true;
      if (rm.m.idbFrom && rm.m.idbFrom !== cur) { idbPending = { from: rm.m.idbFrom, to: cur }; quarantining = true; diag.boot = 'same+idb-retry'; diag.from = rm.m.idbFrom; diag.to = cur; }
      return;
    } else {
      from = rm.m.o; diag.boot = 'switch';
    }
    // ★持ち主が違う（または持ち主不明）: 退避 → 印 → 戻す の順
    diag.from = from; diag.to = cur;
    quarantining = true;
    if (!quarantineLs(from)) { bootFence('LS_QUARANTINE_FAILED'); return; }
    var idbFrom = (!unknown && rm.m.idbFrom) ? rm.m.idbFrom : from;   // IndexedDB の退避は fix346 が mem を読む前に行う
    /* ★iso1b: 印を書いて読み戻せた時だけ先へ進む。書けなければ fence し、今の持ち主の分を戻さない・IndexedDB の退避もしない
       （印は前の持ち主のまま＝次の起動で同じ切替をやり直す。この document は何も書かないので、今の持ち主の絵が前の持ち主の退避に入らない） */
    if (!writeMark(cur, unknown ? 'switch-unknown' : 'switch', idbFrom)) { diag.err.push('MARK_WRITE_FAILED'); bootFence('MARK_WRITE_FAILED', true); return; }
    markOk = true;
    restoreLs(cur);
    idbPending = { from: idbFrom, to: cur };
    bootOwner = cur;
  }

  // ------------------------------------------------------------------ fence
  function fire(why){
    if (sticky && diag.fenceWhy) return;
    sticky = true; epochN++; diag.fenceAt = Date.now(); diag.fenceWhy = why;
    try { console.warn(TAG, 'fenced:', why); } catch(e){}
    var cbs = fenceCbs.slice();
    for (var i = 0; i < cbs.length; i++){ try { cbs[i](why); } catch(e){} }
  }
  function fenced(){
    if (!m3On()) return false;
    if (sticky) return true;
    if (bootOwner == null) return false;
    var cur = ownerNow();
    if (cur !== bootOwner){ fire(cur === 'conflict' ? 'OWNER_CONFLICT' : 'OWNER_CHANGED'); return true; }
    /* ★iso1b: 印も読むたびに確かめる（別タブが切替の退避をした＝この document の持ち主の端末状態はもう無い）。
       起動時に印を確かめられた document だけ（bootstrap で書けなかった document は印が無いのが正しいので見ない） */
    if (markOk){
      var r = readMarkSt();
      var why = (r.st === 'ok') ? ((r.m.o === bootOwner) ? '' : 'MARK_CHANGED') : (r.st === 'absent' ? 'MARK_LOST' : (r.st === 'unreadable' ? 'MARK_UNREADABLE' : 'MARK_CORRUPT'));
      if (why){ fire(why); return true; }
    }
    return false;
  }
  function epoch(){ fenced(); return epochN; }
  function sameEpoch(e){ return !fenced() && e === epochN; }
  function onFence(cb){ if (typeof cb === 'function') fenceCbs.push(cb); }

  var INSTALL = !masterOff();   // ★kill 中は関所そのものを置かない（修正前と同じ呼び出し連鎖）
  // 書込みの関所: fence 中は持ち主つきの LS key へ書かせない（別タブで遅れて書かれる ns 等を止める）
  if (INSTALL) (function(){
    try {
      var below = LS.setItem;
      var w = function(k, v){
        try { if (m3On() && isOwnedKey(k) && fenced()) { diag.droppedWrites++; return; } } catch(e){}
        return below.apply(this, arguments);
      };
      w.__f946 = true;
      LS.setItem = w;
      /* ★iso1b: 代入が効いたかをその場で確かめる（PC・fix654 が効いた iPhone は効く＝iso1 と同じ）。
         効かない＝iOS で fix654 が外れた端末（代入が保存アイテムになり、読みは prototype のメソッドへ行く）→ prototype に関所を置く */
      var took = false; try { took = (LS.setItem === w); } catch(e){ took = false; }
      gateMode = took ? 'instance' : protoGate();
    } catch(e){}
  })();
  /* ★iso1b: Storage.prototype の関所（インスタンス代入が効かない端末だけ）。this === localStorage の時だけ、fence 中だけ働く。
       setItem: 持ち主つき key を書かない（instance の関所 w と同じ）
       removeItem / getItem: 'v292av2_'（絵）を消さない・読ませない（fix346 のラッパと同じ。iOS ではそのラッパが効かないため）
     fence していない間は元のメソッドをそのまま呼ぶ（同じアカウントの動きは変わらない）。 */
  function protoGate(){
    try {
      var SP = (W.Storage && W.Storage.prototype) || null;
      if (!SP) return 'none-no-proto';
      var pg = SP.getItem, ps = SP.setItem, pr = SP.removeItem;
      if (typeof pg !== 'function' || typeof ps !== 'function' || typeof pr !== 'function') return 'none-no-method';
      var AV = 'v292av2_';
      var isAv = function(k){ return typeof k === 'string' && k.indexOf(AV) === 0; };
      var gs = function setItem(k, v){
        try { if (this === LS && isOwnedKey(k) && m3On() && fenced()) { diag.droppedWrites++; return; } } catch(e){}
        return ps.apply(this, arguments);
      };
      var gr = function removeItem(k){
        try { if (this === LS && isAv(k) && m3On() && fenced()) { diag.droppedRemoves = (diag.droppedRemoves || 0) + 1; return; } } catch(e){}
        return pr.apply(this, arguments);
      };
      var gg = function getItem(k){
        try { if (this === LS && isAv(k) && m3On() && fenced()) return null; } catch(e){}
        return pg.apply(this, arguments);
      };
      gs.__f946 = gr.__f946 = gg.__f946 = true;
      SP.setItem = gs; SP.removeItem = gr; SP.getItem = gg;
      return (SP.setItem === gs && SP.removeItem === gr && SP.getItem === gg) ? 'proto' : 'none-proto-failed';
    } catch(e){ return 'none-proto-error'; }
  }

  // 通信の関所: fence 中は画像系の op と GET /img を送らない（応答は合成）
  var IMG_OPS = { putimg: 1, getimg: 1, imgmanifest: 1, imgconfirm: 1, imgmigrate: 1, imgnsinfo: 1 };
  function synth(status, obj){
    var txt = JSON.stringify(obj || {});
    try { if (typeof Response === 'function') return new Response(txt, { status: status, headers: { 'Content-Type': 'application/json' } }); } catch(e){}
    return { ok: false, status: status, json: function(){ return Promise.resolve(obj || {}); }, text: function(){ return Promise.resolve(txt); },
             headers: { get: function(h){ return String(h).toLowerCase() === 'content-type' ? 'application/json' : null; } },
             arrayBuffer: function(){ return Promise.resolve(new ArrayBuffer(0)); }, body: { cancel: function(){} }, clone: function(){ return this; } };
  }
  function isImgRequest(input, init){
    var u = ''; try { u = (typeof input === 'string') ? input : (input && input.url) || String(input || ''); } catch(e){ u = ''; }
    if (/\/img\?/.test(u)) return 'GET /img';
    if (/\/save(\?|$)/.test(u) && init && typeof init.body === 'string'){
      try { var op = (JSON.parse(init.body) || {}).op; if (IMG_OPS[op]) return op; } catch(e){}
    }
    return '';
  }
  if (INSTALL) (function(){
    try {
      var nf = W.fetch;
      if (typeof nf !== 'function') return;
      var w = function(input, init){
        try {
          if (m3On() && fenced()){
            var kind = isImgRequest(input, init);
            if (kind){ diag.blockedNet++; return Promise.resolve(kind === 'GET /img' ? synth(404, { ok: false }) : synth(409, { ok: false, errorCode: 'OWNER_FENCED' })); }
          }
        } catch(e){}
        return nf.apply(this === w ? W : this, arguments);
      };
      w.__f946 = true;
      W.fetch = w;
    } catch(e){}
  })();

  // 別タブでのログイン／ログアウトを即座に拾う（LS の mark が変わる）
  if (INSTALL) try { if (typeof W.addEventListener === 'function') W.addEventListener('storage', function(ev){ try { if (!ev || !ev.key || /v292Dfix837_sess|v292GoogleToken|v292ProxyPass|v292iso946_owner/.test(ev.key)) fenced(); } catch(e){} }); } catch(e){}

  // ------------------------------------------------------------------ 起動
  boot();

  W.__v292Dfix946 = {
    __armed: true, TAG: TAG, stage: STAGE,
    on: on, m3On: m3On,
    ownerNow: ownerNow, bootOwner: function(){ return bootOwner; },
    fenced: fenced, epoch: epoch, sameEpoch: sameEpoch, onFence: onFence, fenceNow: function(why){ fire(why || 'MANUAL'); },
    isOwnedKey: isOwnedKey,
    idbPending: function(){ return idbPending; },
    /* ★iso1b: fix346 が前の持ち主の絵を退避し終えた（元から消した）直後、今の持ち主の分を戻す**前**に呼ぶ。
       印の idbFrom を消して（読み戻して確かめる）、成功した時だけ true＝戻してよい。失敗したら fence して false＝戻さない
       （印は idbFrom 付きのまま＝次の起動でやり直す。この document は何も書かないので、やり直しで今の持ち主の絵を前の持ち主の退避に入れない） */
    idbMovedOut: function(){
      try {
        if (!bootOwner) return false;
        if (writeMark(bootOwner, 'switch-done')) { idbMarkDone = true; return true; }
        diag.err.push('MARK_WRITE_FAILED'); fire('MARK_WRITE_FAILED'); return false;
      } catch(e){ return false; }
    },
    idbDone: function(info){
      try {
        if (info) { diag.idbMoved += (info.moved || 0); diag.idbRestored += (info.restored || 0); }
        if (info && info.err) { if (info.err !== 'MARK_WRITE_FAILED') diag.err.push(info.err); fire(info.err === 'MARK_WRITE_FAILED' ? 'MARK_WRITE_FAILED' : 'IDB_QUARANTINE_FAILED'); }   // 印の idbFrom は残す＝次の起動でやり直す
        else if (bootOwner && !idbMarkDone) {   // idbMovedOut を呼ばない fix346（iso1 以前の版）と組んだ時だけ、ここで印を書く
          if (!writeMark(bootOwner, 'switch-done')) { diag.err.push('MARK_WRITE_FAILED'); fire('MARK_WRITE_FAILED'); }
        }
      } catch(e){}
      idbPending = null; quarantining = false;
    },
    quarantining: function(){ return quarantining; },
    /* ★iso1c: 印に問題がある起動（hold）か。fix346 はこの間 LS→IndexedDB の移行をしない（所属不明の絵を動かさない） */
    holding: function(){ return !!markHold && m3On(); },
    noteStale: function(){ diag.staleDiscard++; },
    status: function(){ return { stage: STAGE, build: 'iso1c', gate: gateMode, hold: markHold, on: on(), m3: m3On(), bootOwner: bootOwner, fenced: fenced(), epoch: epochN, diag: JSON.parse(JSON.stringify(diag)) }; }
  };
  try { console.log(TAG, 'armed', JSON.stringify({ stage: STAGE, build: 'iso1c', gate: gateMode, hold: markHold, on: on(), m3: m3On(), boot: diag.boot })); } catch(e){}
})();
