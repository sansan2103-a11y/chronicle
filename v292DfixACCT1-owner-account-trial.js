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
 *             ★出荷の既定に入れるまでは、鍵 v292DfixACCT1Scene1bOn='1' がある端末だけ（再比較の結果の後、統括が出荷で外す）。
 * ■優先順: 各部品の Off 鍵（各部品が先に見る）＞ まとめの kill v292DfixACCT1Off='1' ＞ 項目の kill ＞（scene1b は v292DfixACCT1Scene1bOn）＞ Owner 判定。
 *   OWNERON1 の kill v292DfixOWNERON1Off='1' でも Owner 判定が OFF になる（OFF 側にだけ働く）。
 *   各部品の On 鍵を手で入れた端末は従来どおり（この部品とは関係なく ON）。
 * ■毎回評価（覚えない）。診断（読むだけ）: window.__v292DfixACCT1.status() / want('mem') / want('scene1b')
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixACCT1) return;
  var VER = 'acct1-20261122-r1';
  var KILL = 'v292DfixACCT1Off';
  var ITEMS = {
    mem: { off: 'v292DfixACCT1MemOff' },
    scene1b: { off: 'v292DfixACCT1Scene1bOff', gate: 'v292DfixACCT1Scene1bOn' }
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
    return ownerOf();
  }
  function want(name) { var j = judge(name); ST.evals++; if (j.on) ST.yes++; var w = String(name) + ':' + j.why; ST.why[w] = (ST.why[w] || 0) + 1; return j.on === true; }
  function status() { var o = ownerOf(), it = {}; for (var n in ITEMS) if (Object.prototype.hasOwnProperty.call(ITEMS, n)) it[n] = judge(n); return { ver: VER, killed: lsGet(KILL) === '1', owner: o, items: it, evals: ST.evals, yes: ST.yes, why: JSON.parse(JSON.stringify(ST.why)) }; }
  try { Object.defineProperty(root, '__v292DfixACCT1', { value: Object.freeze({ ver: VER, want: want, status: status, items: function () { return Object.keys(ITEMS); } }), configurable: false, enumerable: false, writable: false }); }
  catch (e) { try { root.__v292DfixACCT1 = { ver: VER, want: want, status: status }; } catch (e2) {} }
})(typeof window !== 'undefined' ? window : globalThis);
