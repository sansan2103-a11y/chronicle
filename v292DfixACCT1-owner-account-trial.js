/* =====================================================================
 * Chronicle v292DfixACCT1: Owner のアカウントでログイン中なら、端末の鍵が無くても試しの機能を ON として扱う（GPT #127-WN 優先3・#127-WP 裁定 1・2026-11-22・LOCAL・未出荷）
 * ---------------------------------------------------------------------
 * ■やること（読むだけ。localStorage / sessionStorage / cookie / IDB / DOM / 通信へは 1 つも書かない。保存も sys の文も足さない）
 *   各機能の on() が want('<項目>') を呼ぶ。この部品は「いま Owner のアカウントでログイン中か」と「その項目が切られていないか」だけを答える。
 *   Owner の判定は自分で作らない: OWNERON1 の owner()（/auth/me の答え fix893.serverMe() の entitlement 'owner' かつ status 'active'・
 *   同じ答えの写し flagsSnap() の acct が一致・ログインの印が一致・匿名経路でない）をそのまま使う＝MEMTRIAL と同じ entitlement の読み方で、
 *   さらに失敗・ログアウト・別アカウントで写しが捨てられたら OFF。値（アカウント id 等）はコードに書かない。
 *   OWNERON1 が無い・答えがまだ無い・失敗・別アカウント・例外 → OFF（fail-closed）。
 * ■項目（互いに連動しない。片方だけ切れる）
 *   mem     : 長期記憶の試し 4 つ（MEM2 腕 A・MEM3b・MEM3・MEM4）。項目の kill v292DfixACCT1MemOff='1'。
 *   scene1b : SCENE1 の b だけ（a・c は今のまま端末の鍵だけ）。項目の kill v292DfixACCT1Scene1bOff='1'。
 *   ★r3: contract1・heroact1・sfl1・tmpicon1（Owner の PC と同じにする。項目の kill v292DfixACCT1Contract1Off・Heroact1Off・Sfl1Off・Tmpicon1Off）。
 *             ★r3: Owner のアカウントなら鍵なしで ON（r2 までの出荷前の鍵 v292DfixACCT1Scene1bOn は読まない）。
 * ■優先順: 各部品の Off 鍵（各部品が先に見る）＞ まとめの kill v292DfixACCT1Off='1' ＞ 項目の kill ＞ Owner 判定。
 *   OWNERON1 の kill v292DfixOWNERON1Off='1' でも Owner 判定が OFF になる（OFF 側にだけ働く）。
 *   各部品の On 鍵を手で入れた端末は従来どおり（この部品とは関係なく ON）。
 * ■毎回評価（覚えない）。診断（読むだけ）: window.__v292DfixACCT1.status() / want('mem') / want('scene1b')
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixACCT1) return;
  var VER = 'acct1-20261122-r3';
  var KILL = 'v292DfixACCT1Off';
  var ITEMS = {
    mem: { off: 'v292DfixACCT1MemOff', all: true },   /* ★ALLON-MEM: ログイン中のアカウントなら ON */
    scene1b: { off: 'v292DfixACCT1Scene1bOff' },   /* ★r3: 出荷前の鍵（gate）を外した */
    /* ★r3（Owner の指示「iPhone だけオフはやめて・PC と同じに」）: Owner の PC の端末の鍵のうち、鍵が無い端末では OFF になり、端末の中身を消さないもの */
    contract1: { off: 'v292DfixACCT1Contract1Off', all: true },   /* ★ALLON-B: ログイン中のアカウントなら ON */   /* CONTRACT1: 今回の場面の契約を user に渡す（v292DfixCONTRACT1On と同じ） */
    heroact1: { off: 'v292DfixACCT1Heroact1Off' },     /* HEROACT1: 入力に無い主人公の発話・行動を数えるだけ（v292DfixHEROACT1On と同じ） */
    sfl1: { off: 'v292DfixACCT1Sfl1Off' },             /* SFL1: 話者の手直し（v292DfixSFL1On と同じ。管理者画面の行 sfl1 があればそちらが勝つ＝ADMF1 のまま） */
    tmpicon1: { off: 'v292DfixACCT1Tmpicon1Off' }      /* TMPICON1: 未登録の話者の仮の胸像（v292DfixTMPICON1On と同じ） */
  };
  var ST = { evals: 0, yes: 0, why: {} };
  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return undefined; } }   /* undefined = 読めない */
  function ownerOf() {
    try { var O = root.__v292DfixOWNERON1; if (!O || typeof O.owner !== 'function') return { on: false, why: 'no-owneron1' };
      var o = O.owner(); return (o && o.on === true) ? { on: true, why: 'owner' } : { on: false, why: String(o && o.why || 'not-owner') }; }
    catch (e) { return { on: false, why: 'owner-threw' }; }
  }
  function judge(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, name)) return { on: false, why: 'unknown-item' };
    var k = lsGet(KILL); if (k === undefined) return { on: false, why: 'storage-unreadable' }; if (k === '1') return { on: false, why: 'killed' };
    var it = ITEMS[name], off = lsGet(it.off); if (off === undefined) return { on: false, why: 'storage-unreadable' }; if (off === '1') return { on: false, why: 'item-off' };
    if (it.gate && lsGet(it.gate) !== '1') return { on: false, why: 'not-default-yet' };
    var o = ownerOf(); if (o.on) return o;
    if (it.all === true && memberOf()) return { on: true, why: 'member' };   /* ★ALLON core: all の項目はログイン中のアカウント（owner・beta）なら ON（OWNERON1.member）。未ログインは OFF のまま */
    if (allOn()) return { on: true, why: 'all-flag' };   /* ★r3: 全員の旗（管理者画面の acct1all。Worker に鍵が足されるまでは来ない＝OFF のまま） */
    return o;
  }
  function memberOf() { try { var O = root.__v292DfixOWNERON1; return !!(O && typeof O.member === 'function' && O.member().on === true); } catch (e) { return false; } }   /* ★ALLON core */
  function allOn() { try { var A = root.__v292DfixADMF1; return !!(A && typeof A.gate === 'function' && A.gate('acct1all', false) === true); } catch (e) { return false; } }
  function want(name) { var j = judge(name); ST.evals++; if (j.on) ST.yes++; var w = String(name) + ':' + j.why; ST.why[w] = (ST.why[w] || 0) + 1; return j.on === true; }
  function status() { var o = ownerOf(), it = {}; for (var n in ITEMS) if (Object.prototype.hasOwnProperty.call(ITEMS, n)) it[n] = judge(n); return { ver: VER, killed: lsGet(KILL) === '1', owner: o, items: it, evals: ST.evals, yes: ST.yes, why: JSON.parse(JSON.stringify(ST.why)) }; }
  try { Object.defineProperty(root, '__v292DfixACCT1', { value: Object.freeze({ ver: VER, want: want, status: status, all: function () { return lsGet(KILL) !== '1' && allOn(); }, items: function () { return Object.keys(ITEMS); } }), configurable: false, enumerable: false, writable: false }); }
  catch (e) { try { root.__v292DfixACCT1 = { ver: VER, want: want, status: status }; } catch (e2) {} }
})(typeof window !== 'undefined' ? window : globalThis);
