/* v292Dfix826 — P0B_REVISION_COHERENCE_BUNDLE_V1（GPT 裁定 52）
 * ============================================================================
 * 目的（裁定 52）:
 *   F2  fork を main への保存成功として扱わない
 *   F3  古い pull 応答を現在の state へ適用しない
 *   F1  そのうえで 580 が 402 の「より新しい trusted revision」を参照できるようにする
 *
 * 最重要 invariant（裁定 52 §7）:
 *   REVISION NUMBER IS NOT ENOUGH TO PROVE LOCAL PACKAGE AUTHORITY
 *   ＝ server から rev=N を見ただけでは「いま local package が main rev=N と整合している」
 *      ことにはならない。fork 応答がその代表。
 *   したがって F1 の max は、F2/F3 が trusted revision provenance を保った上でのみ安全。
 *
 * この module がやらないこと（裁定 52 / 恒久ルール）:
 *   ・新しい同期エンジン / 汎用 transaction 層を作らない
 *   ・自動 forceput / 自動 resume / 自動 rollback を作らない
 *   ・localStorage を **1 バイトも書かない**（read-only。判定だけを返す）
 *   ・story-lane rev（fix750 の preparedServerRev 等）を package revision と混ぜない
 *
 * kill switch: v292Dfix826Off = '1' → 全 API が legacy 相当（判定を無効化）を返す。
 *   ・trustedRev()      → OFF なら null（呼び出し側は従来の値をそのまま使う）
 *   ・shouldApplyPull() → OFF なら常に { apply:true, reason:'OFF' }
 *   ・classifyPut()     → OFF でも分類は返す（fork 判定は事実の読み取りであって挙動変更ではない）
 *     ただし呼び出し側は OFF のとき従来分岐へ倒すこと。
 * ========================================================================== */
(function(){
  'use strict';
  if (window.__v292Dfix826) return;
  var TAG = '[v292Dfix826:revision-coherence]';
  var VERSION = 'v292Dfix826-20260907-bundle-v1';

  var KEY_580 = 'v292Dfix580_rev';        /* index 側 coordinator の共有 rev 台帳 */
  var KEY_402 = 'v292Dfix402_baseRev';    /* fix402 の自前キー（home もここだけを進める） */

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix826Off') === '1'; }

  /* ---- rev の妥当性（package revision のみ。story-lane rev は渡さないこと） ----
     ・非数値 / 負 / NaN / Infinity は「無い」扱い（既存 semantics を維持し、0 と区別しない）
     ・文字列は 10 進として読む（既存 getNum / +v と同じ流儀） */
  function validRev(v){
    if (v == null) return null;
    var n = +v;
    if (n !== n) return null;                 /* NaN */
    if (!isFinite(n)) return null;
    if (n < 0) return null;
    return n;
  }

  /* ---- F1: MONOTONIC_MAX ----------------------------------------------------
     rev() = max(valid(580), valid(402))
     ・read only（LS write 0）
     ・rollback 0（小さい方へは絶対に寄らない）
     ・両方無ければ null を返す（呼び出し側の既存 default を壊さない） */
  function trustedRev(){
    if (off()) return null;
    var a = validRev(lsg(KEY_580));
    var b = validRev(lsg(KEY_402));
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return (a > b) ? a : b;
  }
  /* 診断用（OFF でも素の値を見せる。判定には使わない） */
  function revs(){
    return { k580: validRev(lsg(KEY_580)), k402: validRev(lsg(KEY_402)),
             trusted: trustedRev(), off: off() };
  }

  /* ---- F2: put/forceput 応答の分類 ------------------------------------------
     server 契約:
       main 採用   … { ok:true, fork 無し, rev:<新 rev> }
       fork 隔離   … { ok:true, fork:true, rev:<server 現在 rev>, server:{rev} }
       拒否/エラー … ok!==true もしくは HTTP 非 200
     返り値:
       { kind:'MAIN'|'FORK'|'REJECTED'|'UNKNOWN',
         mainAccepted:boolean,          … 自分の package が main になったか
         revIsMine:boolean,             … 応答の rev を「自分が書いた rev」と見なしてよいか
         serverRev:number|null,         … server の現在 rev（fork のときはこちら）
         myRev:number|null }            … 自分の write が作った rev（MAIN のときだけ）
     ★ここが裁定 52 の核心。fork の rev は **server の現在値**であって自分の write の証明ではない。 */
  function classifyPut(json){
    var j = (json && typeof json === 'object') ? json : null;
    if (!j) return { kind:'UNKNOWN', mainAccepted:false, revIsMine:false, serverRev:null, myRev:null };
    if (j.ok !== true) return { kind:'REJECTED', mainAccepted:false, revIsMine:false,
                                serverRev: validRev(j.rev), myRev:null };
    if (j.fork === true){
      var sr = validRev(j.server && j.server.rev);
      if (sr == null) sr = validRev(j.rev);
      return { kind:'FORK', mainAccepted:false, revIsMine:false, serverRev: sr, myRev:null };
    }
    var r = validRev(j.rev);
    return { kind:'MAIN', mainAccepted:true, revIsMine:true, serverRev:r, myRev:r };
  }
  /* 「この応答を根拠に local の控えを消してよいか」= main 採用のときだけ true。
     fork は「サーバに別分岐として残っている」だけで main backup の証明にはならない（裁定 52 §3）。 */
  function mayDestructiveCleanup(json){
    if (off()) return null;                    /* OFF: 呼び出し側の従来判断へ委ねる */
    return classifyPut(json).mainAccepted === true;
  }

  /* ---- F3: pull 応答の適用可否 ----------------------------------------------
     契約: responseRev < currentKnownRev → apply 0 / revision rollback 0
       currentKnownRev = trustedRev()（= F1 の max。F2 で fork 由来 rev が
       trusted へ昇格しないことが前提）
     ★裁定 53 REVISION 1（unknown rev の扱いを狭める）:
     ・currentKnownRev **不明** かつ responseRev **不明** … 通す（`LEGACY_FIRST_RESTORE`）。
       ここだけは通さないと「一度も同期していない端末が永久に復元できない」既存不具合
       （fix659 実因 G1 と同型）を再生産する。
     ・currentKnownRev **既知** かつ responseRev **不明 / 不正** … **適用しない**（fail-closed）。
       既に rev=N を知っている端末に、版を証明できない package を被せる必要はない。
       （Worker v27 の `op:'get'` は D1 経路で `rev` を必ず返す。rev が無いのは
         KV フォールバック等の旧経路なので、そちらを優先しない。）
     ・currentKnownRev 不明 かつ responseRev 既知 … 通す（比較不能）
     ・等値 … 通す（同じ版の再適用は害が無く、既存の再取り込み導線を壊さない） */
  function shouldApplyPull(responseRev, opts){
    if (off()) return { apply:true, reason:'OFF', responseRev:null, currentKnownRev:null };
    var rr = validRev(responseRev);
    var ck = trustedRev();
    if (rr == null && ck == null)
      return { apply:true, reason:'LEGACY_FIRST_RESTORE', responseRev:null, currentKnownRev:null };
    if (rr == null)
      return { apply:false, reason:'UNKNOWN_RESPONSE_REV_WITH_KNOWN_LOCAL_REV', responseRev:null, currentKnownRev:ck };
    if (ck == null)  return { apply:true, reason:'NO_KNOWN_REV', responseRev:rr, currentKnownRev:null };
    if (rr < ck)     return { apply:false, reason:'STALE_PULL_RESPONSE', responseRev:rr, currentKnownRev:ck };
    return { apply:true, reason:(rr === ck ? 'SAME_REV' : 'NEWER_REV'), responseRev:rr, currentKnownRev:ck };
  }

  window.__v292Dfix826 = {
    VERSION: VERSION,
    off: off,
    validRev: validRev,
    trustedRev: trustedRev,
    revs: revs,
    classifyPut: classifyPut,
    mayDestructiveCleanup: mayDestructiveCleanup,
    shouldApplyPull: shouldApplyPull
  };
  try { console.log(TAG, 'loaded', VERSION); } catch(e){}
})();
