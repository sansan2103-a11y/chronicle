// =====================================================================
// Chronicle v292Dfix579: tombstone(墓標)のスキーマとマージ規則
// ---------------------------------------------------------------------
// ★なぜ必要か（実コードの棚卸しで判明した構造的欠陥）
//   「物語を削除しても、次の bootPull でクラウドから復活する」。原因は3つ重なっている:
//     ①tombstone(墓標)の仕組みが**存在しない**（全js/htmlをgrepして0件）
//     ②applySave は setItem のみの**純マージ**。クラウドの chr6_slot_* は無条件に書き戻る
//     ③push の起動点は S.save のラップだけ。削除は S.save も markDirty も呼ばないので
//       **dirtyにならず、クラウドは古いまま**
//   GPT裁定「これはA3の後回し課題ではなく、A3の前提条件」。
//
// ★このファイルの位置づけ（A3.2 = スキーマとマージ規則だけ）
//   GPT指定の順序は **tombstoneスキーマ → push競合規則 → pull barrier**。
//   ここは**その1段目**。純粋関数だけを置き、**どこからも呼ばれていない**。
//   したがってこのfixを入れても挙動は1バイトも変わらない。
//   実際に同期へ配線するのは次段(pull barrier / push合成)で行う。
//
// ★なぜ「pull barrierだけ先に入れる」ではないのか（GPT名指しの注意）
//   pull側だけ塞いでも、push で tombstone が古い meta に上書きされたら消える。
//     PC: deleted:true を push → 開きっぱなしの旧端末: deleted を知らない古い meta を push
//     → tombstone が消える
//   **push競合規則と pull barrier は一組**として扱う必要がある。だから先にスキーマを固める。
//
// ■ tombstone の不変条件（T1〜T6・GPT指定）
//   T1 deleted:true のスロットは通常一覧へ出さない
//   T2 deleted:true のスロットに対するクラウド上の古い本体は、ローカルへ書き戻さない
//   T3 本体データが存在していても、tombstone があれば削除状態を優先
//   T4 通常の push は tombstone を消せない
//   T5 tombstone を解除できるのは、明示的な復元処理だけ
//   T6 復元は restoreOfDeleteOpId が現在の deleteOpId と一致した場合だけ許可
//
// 冪等: window.__v292Dfix579 / OFF: localStorage.v292Dfix579Off='1'
// 検証口: __v292Dfix579.make() / .isTombstone() / .validate() / .mergeMeta() / .visible()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix579) return;

  var LIFECYCLE_VERSION = 1;

  /* ---- 生成 ------------------------------------------------------------ */
  /* ★物理削除より先に「墓標を立てる」ための形。実際に立てるのは StoryLifecycleService(A3.5)。
     recoverySnapshotId は fix564 の完全スナップショットを指す（新しい退避方式は作らない・GPT裁定）。 */
  function make(o){
    o = o || {};
    if (!o.slotId) return null;
    if (!o.deleteOpId) return null;
    return {
      id: String(o.slotId),
      title: o.title == null ? '' : String(o.title),
      deleted: true,
      deletedAt: (typeof o.deletedAt === 'number') ? o.deletedAt : null,
      deleteOpId: String(o.deleteOpId),
      recoverySnapshotId: o.recoverySnapshotId == null ? null : String(o.recoverySnapshotId),
      lifecycleVersion: LIFECYCLE_VERSION
    };
  }

  function isTombstone(e){
    return !!(e && typeof e === 'object' && e.deleted === true && e.id);
  }

  /* ---- 検証 ------------------------------------------------------------ */
  /* ★「形が違う墓標」を黙って通さない。通すと、削除したのに復活する経路を新しく作る。 */
  function validate(e){
    var r = { ok: false, problems: [] };
    if (!e || typeof e !== 'object'){ r.problems.push('オブジェクトではない'); return r; }
    if (e.deleted !== true) r.problems.push('deleted が true ではない');
    if (!e.id) r.problems.push('id が無い');
    if (!e.deleteOpId) r.problems.push('deleteOpId が無い（復元時の照合ができない）');
    if (e.lifecycleVersion !== LIFECYCLE_VERSION)
      r.problems.push('lifecycleVersion が ' + LIFECYCLE_VERSION + ' ではない');
    r.ok = r.problems.length === 0;
    return r;
  }

  /* ---- 一覧表示（T1） --------------------------------------------------- */
  function visible(meta){
    if (!Array.isArray(meta)) return [];
    return meta.filter(function(e){ return e && !isTombstone(e); });
  }
  function tombstonesOf(meta){
    if (!Array.isArray(meta)) return {};
    var out = {};
    meta.forEach(function(e){ if (isTombstone(e)) out[String(e.id)] = e; });
    return out;
  }

  /* ---- ★push競合規則 = メタのマージ（T3・T4・T5・T6） -------------------
   * 「どちらか一方に deleted:true があれば、通常の live meta では解除できない」を実装する。
   *
   * mergeMeta(a, b) は**対称**（順序を入れ替えても同じ結果）にする。
   * 非対称だと「PCから見た結果」と「iPhoneから見た結果」が食い違い、
   * 同期のたびに墓標が立ったり消えたりする振動を作るため。
   *
   * 解除できるのは、明示的な復元エントリだけ:
   *   { id, restoreOfDeleteOpId: <解除したい deleteOpId>, ... }
   * これが**現在の deleteOpId と一致した場合だけ** 墓標を解く（T6）。
   * 一致しない復元要求は無視する（古い端末が持っていた昔の復元要求で、
   * 新しい削除を取り消してしまうのを防ぐ）。
   */
  function isRestore(e){
    return !!(e && typeof e === 'object' && e.restoreOfDeleteOpId && e.id);
  }
  function mergeEntry(x, y){
    /* 片方が無ければもう片方 */
    if (!x) return y;
    if (!y) return x;
    var xt = isTombstone(x), yt = isTombstone(y);

    /* 両方が墓標 → 新しい方（deletedAt が大きい方）を採る。同点なら deleteOpId で決定的に */
    if (xt && yt){
      var xa = typeof x.deletedAt === 'number' ? x.deletedAt : -1;
      var ya = typeof y.deletedAt === 'number' ? y.deletedAt : -1;
      if (xa !== ya) return xa > ya ? x : y;
      return String(x.deleteOpId) <= String(y.deleteOpId) ? x : y;
    }

    /* 片方だけ墓標 → ★墓標が勝つ（T3・T4）。
       ただし相手が「その墓標に対する明示的な復元」なら解除する（T5・T6）。 */
    if (xt || yt){
      var tomb  = xt ? x : y;
      var other = xt ? y : x;
      if (isRestore(other) && String(other.restoreOfDeleteOpId) === String(tomb.deleteOpId)){
        return other;                 /* T6: deleteOpId が一致した復元だけが解除できる */
      }
      return tomb;                    /* T4: 通常の live meta では墓標を消せない */
    }

    /* どちらも生エントリ → 更新が新しい方 */
    var xu = Date.parse(x.updatedAt || 0) || 0;
    var yu = Date.parse(y.updatedAt || 0) || 0;
    if (xu !== yu) return xu > yu ? x : y;
    return x;
  }

  function mergeMeta(a, b){
    var A = Array.isArray(a) ? a : [];
    var B = Array.isArray(b) ? b : [];
    var byId = {}, order = [];
    function put(e){
      if (!e || !e.id) return;
      var id = String(e.id);
      if (!(id in byId)){ byId[id] = e; order.push(id); }
      else byId[id] = mergeEntry(byId[id], e);
    }
    A.forEach(put);
    B.forEach(put);
    return order.map(function(id){ return byId[id]; });
  }

  /* ---- pull barrier の判定材料（T2）— まだ誰も呼んでいない --------------- */
  /* 「このキーは、墓標が立っているスロットのものか？」を返す。
     取り込み側がこれを見て**書き戻さない**ようにするのが次段。
     ★引用符付きキー chr6_v292Dfix54_genderMap_"<id>" も弾けるよう、部分一致で判定する。 */
  function isBlockedByTombstone(key, meta){
    var k = String(key == null ? '' : key);
    if (!k) return null;
    var tombs = tombstonesOf(meta);
    var ids = Object.keys(tombs);
    for (var i = 0; i < ids.length; i++){
      var id = ids[i];
      if (k === 'chr6_slot_' + id) return { blocked: true, slotId: id, kind: 'story', tombstone: tombs[id] };
      if (k.indexOf(id) >= 0)      return { blocked: true, slotId: id, kind: 'side-store', tombstone: tombs[id] };
    }
    return { blocked: false, slotId: null, kind: null, tombstone: null };
  }

  window.__v292Dfix579 = {
    __armed: true,
    LIFECYCLE_VERSION: LIFECYCLE_VERSION,
    make: make,
    isTombstone: isTombstone,
    isRestore: isRestore,
    validate: validate,
    visible: visible,
    tombstonesOf: tombstonesOf,
    mergeMeta: mergeMeta,
    mergeEntry: mergeEntry,
    isBlockedByTombstone: isBlockedByTombstone,
    /* ★まだ同期へ配線していないことを明示する。pull barrier(次段)がこれを見て動く。 */
    wiredIntoSync: false
  };
})();
