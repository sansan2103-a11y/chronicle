/* =====================================================================
 * v292DfixSPKNEW1-speaker-new.js — 登録の一覧に無い人物の台詞の who の書き方を、指示の文に形式として足す（SPKNEW1・2026-11-22・LOCAL・出荷しない・既定 OFF）
 * ---------------------------------------------------------------------
 * ■なぜ: Owner の実プレイ（裏京）で、登録の女性（本条ひなた）が場にいる回に出た 2 人目の新しい女性の台詞が、ひなたの名札になった。
 *   今日の比較（scene1/qa/ab・ab2）でも誤りの大半は AI の生の札の時点。sys の【話者タグの徹底（最優先）】（fix514）は
 *   「who は登場キャストの完全登録名から完全一致で選ぶ」「全ての発話に完全登録名の who が付いているか確認する」で、登録の一覧に無い人物の書き方が無い
 *   （怪異・謎の声などの「名前の無い存在」だけが呼び名で書ける）。そのため、新しい人物の台詞にも登録名のどれかを選ばせていた（読み）。
 * ■やること（文言の置き換えだけ。禁止文は足さない。登録キャラの書き方は今のまま）:
 *   fix514 の 2 文・PRUNE2 a の末尾のブロックの 3 文（PRUNE2 a が ON のとき）・fix459【話者】の役割名の 1 文を、
 *   「登録キャラは完全登録名／登録の一覧に無い人物は、本文でその人を呼んでいる短い呼び名（例: 見知らぬ女性・配達の男）」の形に置き換える。
 * ■鍵: v292DfixSPKNEW1On='1'（既定 OFF）・kill v292DfixSPKNEW1Off='1'（常に勝つ）。OFF・kill は 1 字も変えない。
 * ■診断: window.__v292DfixSPKNEW1.stats()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixSPKNEW1) return;
  var VER = 'spknew1-20261122-r1', ST = { b514: 0, p2: 0, role: 0, miss: {} };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return lsg('v292DfixSPKNEW1Off') !== '1' && lsg('v292DfixSPKNEW1On') === '1'; }
  function rep(s, pairs, tag) { var out = s, n = 0; pairs.forEach(function (p) { if (out.split(p[0]).length === 2) { out = out.split(p[0]).join(p[1]); n++; } else ST.miss[tag] = (ST.miss[tag] || 0) + 1; }); return out; }
  var P514 = [
    ['whoは登場キャストの完全登録名から完全一致で選ぶ（短縮名・名字だけ・名前だけ・愛称・役職名・「主人公」「彼」「彼女」は不可）。',
     'whoは、登録キャラなら登場キャストの完全登録名を完全一致で書く（登録キャラを短縮名・名字だけ・名前だけ・愛称・役職名・「主人公」「彼」「彼女」で書かない）。登録の一覧に無い人物なら、本文でその人を呼んでいる短い呼び名を書く（例: 見知らぬ女性・配達の男）。'],
    ['出力を終える前に、全ての発話に完全登録名のwhoが付いているか確認する。', '出力を終える前に、全ての発話にwho（登録キャラは完全登録名）が付いているか確認する。']
  ];
  var PP2 = [
    ['・who は実際に発声した本人の完全な登録名（完全一致。短縮名・名字だけ・愛称・役職名・「主人公」「彼」「彼女」は不可）。',
     '・who は実際に発声した本人。登録キャラなら完全な登録名（完全一致。登録キャラを短縮名・名字だけ・愛称・役職名・「主人公」「彼」「彼女」で書かない）。'],
    ['・登録のない存在（怪異・敵・謎の声）が喋ったときも、本文で使っている呼び名を who にして囲む。',
     '・登録の一覧に無い人物・存在（初めて出た人・怪異・敵・謎の声）が喋ったときは、本文で使っている短い呼び名を who にする（例: 見知らぬ女性・配達の男）。'],
    ['・出力の前に、すべての発話に完全な登録名の who が付いているか確かめる。', '・出力の前に、すべての発話に who（登録キャラは完全な登録名）が付いているか確かめる。']
  ];
  var ROLE_OLD = '・次の人物を役割名で who に書かない（本人の登録名で書く）：', ROLE_NEW = '・次の登録キャラを役割名で who に書かない（本人の登録名で書く。同じ役割の別の人物は、その人の呼び名で書く）：';
  function blk514(b) { if (!on() || typeof b !== 'string') return b; ST.b514++; return rep(b, P514, 'b514'); }
  function blkP2(oldB, newB) { if (!on()) return [oldB, newB]; ST.p2++; return [rep(oldB, P514, 'p2old'), rep(newB, PP2, 'p2new')]; }
  function roleLine(t) { if (!on() || typeof t !== 'string') return t; if (t.indexOf(ROLE_OLD) !== 0) { ST.miss.role = (ST.miss.role || 0) + 1; return t; } ST.role++; return ROLE_NEW + t.slice(ROLE_OLD.length); }
  var api = { VER: VER, on: on, blk514: blk514, blkP2: blkP2, roleLine: roleLine, stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixSPKNEW1', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixSPKNEW1 = api; }
})(typeof window !== 'undefined' ? window : globalThis);
