/* v292Dfix564-snapshot.js (2026-07-26) — サイドストア込みの「論理スナップショット」
 *
 * ■なぜ必要か(fix562/563 の棚卸しで実データ確認済み)
 *   物語を復元するのに必要なデータは本体セーブ(chr6_slot_*)だけではない。
 *   状態・準登録カルテ・ロスター・長期記憶・別名台帳などは**スロットIDを含む別キー**にあり、
 *   既存の控えは story も wrapped も**すべて本体セーブしか運ばない**(実測40件中、
 *   サイドストアを運べるのは cloudsync の丸ごと控え2件だけ)。
 *   そのためスロット複製・クラウド復元で状態やカルテが落ちていた(実測2件)。
 *
 * ■★GPTの重要な指摘(初版の設計を作り直した点)
 *   「key/hash/bytes だけを持ちデータを複製しない manifest は、棚卸しには十分だが
 *    **単独ではバックアップにならない**。参照先が live キーなら、複製・復元・破損・削除と
 *    同時に参照先も失われる」
 *   → manifest は **snapshot側に保存した実体**へ結び付ける。live キーは「どこへ戻すか」の情報として持つ。
 *
 * ■作成手順(1パーツでも失敗したら complete=false。復元対象にしない)
 *   全パーツを読む → スナップショット領域へ保存 → **読み戻す** → hash一致を確認
 *   → 全部揃ったときだけ manifest を complete:true で書く
 *   途中で失敗したら、この試行で書いた**自分のキーだけ**を消して中止する(fail-closed)。
 *
 * ■保存レイアウト
 *   manifest = chr6_snap_<slot>_<ts>            … JSON(実体は持たない)
 *   実体     = chr6_snapd_<slot>_<ts>_<n>       … 値の文字列そのまま
 *
 * ■復元は既定で dryRun。実際に書くには {confirm:true} が要る。
 *
 * OFF   = localStorage['v292Dfix564Off'] = '1'
 * 読出  = window.__v292Dfix564.list() / .create(slot,{reason}) / .verify(id)
 *         / .restore(id,{toSlot,confirm}) / .remove(id) / .estimate(slot)
 */
(function v292Dfix564(){
  if (window.__v292Dfix564) return;
  var TAG = '[v292Dfix564]';
  var MPRE = 'chr6_snap_';
  var DPRE = 'chr6_snapd_';
  var VERSION = 1;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix564Off') === '1'; }
  function keys(){ try { return Object.keys(localStorage); } catch(e){ return []; } }

  function hash(s){
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16) + '-' + s.length;
  }

  /* ---- パーツの集め方 -------------------------------------------------- */
  /* ★キー名をハードコードしない。「スロットIDを含む、本体でも控えでもスナップショットでもないキー」。
     スナップショット自身を除外しないと、2回目の作成で**前回のスナップショットを取り込んで**
     容量が雪だるま式に増える(設計時に気づいた。fix562側も同じ除外が要る)。 */
  function isOurs(k){ return k.indexOf(MPRE) === 0 || k.indexOf(DPRE) === 0; }
  function partKeys(slot){
    var storyKey = 'chr6_slot_' + slot;
    var out = [];
    if (lsg(storyKey) != null) out.push(storyKey);
    keys().forEach(function(k){
      if (k === storyKey) return;
      if (k.indexOf('chr6_bk_') === 0) return;
      if (isOurs(k)) return;
      if (k.indexOf(slot) < 0) return;
      out.push(k);
    });
    return out;
  }

  function estimate(slot){
    var ks = partKeys(slot), bytes = 0;
    ks.forEach(function(k){ var v = lsg(k); if (v != null) bytes += v.length; });
    return { slotId: slot, parts: ks.length, bytes: bytes, kb: Math.round(bytes / 1024),
             hasStory: ks.indexOf('chr6_slot_' + slot) >= 0 };
  }

  /* ---- 作成 ------------------------------------------------------------ */
  /* now は引数で受ける。Date.now() を直に使うとテストで固定できないため。 */
  function create(slot, opts){
    opts = opts || {};
    if (off()) return { ok: false, error: 'off' };
    if (!slot) return { ok: false, error: 'slotId が要ります' };
    var ks = partKeys(slot);
    if (ks.indexOf('chr6_slot_' + slot) < 0){
      /* 本体が無いスロットのスナップショットは、復元しても物語にならない */
      return { ok: false, error: '本体セーブ(chr6_slot_' + slot + ')がありません' };
    }
    var ts = opts.now || (opts.nowFn ? opts.nowFn() : null);
    if (!ts) return { ok: false, error: '作成時刻(now)が要ります' };
    var id = MPRE + slot + '_' + ts;
    if (lsg(id) != null) return { ok: false, error: '同じIDのスナップショットが既にあります: ' + id };

    var written = [], parts = {}, total = 0, failed = null;
    for (var i = 0; i < ks.length; i++){
      var liveKey = ks[i];
      var val = lsg(liveKey);
      if (val == null) continue;
      var dataKey = DPRE + slot + '_' + ts + '_' + i;
      try { localStorage.setItem(dataKey, val); }
      catch(e){ failed = { at: liveKey, error: e.name || String(e) }; break; }
      written.push(dataKey);
      /* ★書いたら必ず読み戻して照合する。QuotaExceeded 以外に、
         書けたつもりで切れている経路を疑わないと「complete なのに壊れている」が生まれる。 */
      var back = lsg(dataKey);
      if (back == null || back.length !== val.length || hash(back) !== hash(val)){
        failed = { at: liveKey, error: '読み戻しが一致しません' };
        break;
      }
      parts[liveKey] = { liveKey: liveKey, snapKey: dataKey, hash: hash(val), bytes: val.length,
                         role: liveKey === 'chr6_slot_' + slot ? 'story' : 'sideStore' };
      total += val.length;
    }

    if (failed){
      /* fail-closed: この試行で書いた自分のキーだけを消して、痕跡を残さない。
         manifest は書かないので「不完全なのに complete」は存在し得ない。 */
      written.forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
      return { ok: false, error: failed.error, at: failed.at, rolledBack: written.length };
    }

    var turns = null;
    try { var o = JSON.parse(lsg('chr6_slot_' + slot) || 'null');
      var a = (o && o.turns) || (o && o.state && o.state.turns) || null;
      turns = Array.isArray(a) ? a.length : null; } catch(e){}

    var manifest = {
      version: VERSION, id: id, slotId: slot, createdAt: ts,
      reason: String(opts.reason || 'manual'),
      complete: true, turns: turns,
      partCount: Object.keys(parts).length, totalBytes: total,
      parts: parts
    };
    try { localStorage.setItem(id, JSON.stringify(manifest)); }
    catch(e){
      written.forEach(function(k){ try { localStorage.removeItem(k); } catch(e2){} });
      return { ok: false, error: 'manifestを書けませんでした: ' + (e.name || e), rolledBack: written.length };
    }
    /* manifest も読み戻す */
    var chk = null; try { chk = JSON.parse(lsg(id) || 'null'); } catch(e){}
    if (!chk || chk.partCount !== manifest.partCount){
      try { localStorage.removeItem(id); } catch(e){}
      written.forEach(function(k){ try { localStorage.removeItem(k); } catch(e2){} });
      return { ok: false, error: 'manifestの読み戻しが一致しません', rolledBack: written.length };
    }
    return { ok: true, id: id, parts: manifest.partCount, bytes: total, turns: turns };
  }

  /* ---- 検証 ------------------------------------------------------------ */
  /* 「スナップショット側の実体が、保存したときのまま残っているか」だけを見る。
     live 側が変わっていても、それは異常ではない(遊べば変わる)。 */
  function verify(id){
    var m = null; try { m = JSON.parse(lsg(id) || 'null'); } catch(e){}
    if (!m || !m.parts) return { ok: false, error: 'manifestが読めません: ' + id };
    var missing = [], mismatch = [], okCount = 0;
    Object.keys(m.parts).forEach(function(lk){
      var p = m.parts[lk];
      var v = lsg(p.snapKey);
      if (v == null){ missing.push(lk); return; }
      if (hash(v) !== p.hash){ mismatch.push(lk); return; }
      okCount++;
    });
    return { ok: missing.length === 0 && mismatch.length === 0,
             id: id, slotId: m.slotId, parts: m.partCount, verified: okCount,
             missing: missing, mismatch: mismatch, turns: m.turns, bytes: m.totalBytes };
  }

  /* ---- 復元 ------------------------------------------------------------ */
  /* 既定は dryRun。実際に書くには {confirm:true}。
     toSlot を変えると、キー名の中のスロットIDを置換して別スロットへ復元する
     (genderMap のようにIDが引用符で囲まれるキーもあるので、単純な全置換で扱う)。 */
  function restore(id, opts){
    opts = opts || {};
    if (off()) return { ok: false, error: 'off' };
    var v = verify(id);
    if (!v.ok) return { ok: false, error: '検証を通らないスナップショットは復元しません', detail: v };
    var m = JSON.parse(lsg(id));
    var toSlot = opts.toSlot || m.slotId;
    var plan = [];
    Object.keys(m.parts).forEach(function(lk){
      var p = m.parts[lk];
      var target = toSlot === m.slotId ? lk : lk.split(m.slotId).join(toSlot);
      var cur = lsg(target);
      plan.push({ from: p.snapKey, to: target, bytes: p.bytes, role: p.role,
                  overwrites: cur != null, sameAsCurrent: cur != null && hash(cur) === p.hash });
    });
    if (!opts.confirm){
      return { ok: true, dryRun: true, id: id, toSlot: toSlot, willWrite: plan.length,
               willOverwrite: plan.filter(function(x){ return x.overwrites; }).length,
               bytes: plan.reduce(function(a, b){ return a + b.bytes; }, 0), plan: plan,
               note: '★dryRunです。1バイトも書いていません。実行するには {confirm:true} を渡してください。' };
    }
    /* 実行。書けなかった時点で中止する(部分復元のまま進めない)。
       すでに書いた分は戻さない = 元の値を控えていないため。
       だから**復元前に必ずスナップショットを取る**(呼び出し側の責任)。 */
    var done = [], failedAt = null;
    for (var i = 0; i < plan.length; i++){
      var val = lsg(plan[i].from);
      if (val == null){ failedAt = { to: plan[i].to, error: '実体が消えています' }; break; }
      try { localStorage.setItem(plan[i].to, val); } catch(e){ failedAt = { to: plan[i].to, error: e.name || String(e) }; break; }
      var back = lsg(plan[i].to);
      if (back == null || hash(back) !== hash(val)){ failedAt = { to: plan[i].to, error: '読み戻しが一致しません' }; break; }
      done.push(plan[i].to);
    }
    return { ok: !failedAt, id: id, toSlot: toSlot, written: done.length,
             total: plan.length, failedAt: failedAt, writtenKeys: done };
  }

  /* ---- 一覧・削除 ------------------------------------------------------ */
  function list(){
    var out = [];
    keys().forEach(function(k){
      if (k.indexOf(MPRE) !== 0) return;
      var m = null; try { m = JSON.parse(lsg(k) || 'null'); } catch(e){}
      if (!m) { out.push({ id: k, broken: true }); return; }
      var dataBytes = 0;
      Object.keys(m.parts || {}).forEach(function(lk){
        var v = lsg(m.parts[lk].snapKey); if (v != null) dataBytes += v.length;
      });
      out.push({ id: k, slotId: m.slotId, createdAt: m.createdAt, reason: m.reason,
                 complete: !!m.complete, turns: m.turns, parts: m.partCount,
                 manifestBytes: (lsg(k) || '').length, dataBytes: dataBytes,
                 totalKB: Math.round(((lsg(k) || '').length + dataBytes) / 1024) });
    });
    return out.sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  /* 自分が作ったスナップショットだけを消す。他人のキーには触らない。 */
  function remove(id){
    if (String(id || '').indexOf(MPRE) !== 0) return { ok: false, error: 'スナップショットのIDではありません' };
    var m = null; try { m = JSON.parse(lsg(id) || 'null'); } catch(e){}
    var removed = 0;
    if (m && m.parts){
      Object.keys(m.parts).forEach(function(lk){
        var sk = m.parts[lk].snapKey;
        if (String(sk || '').indexOf(DPRE) !== 0) return;   /* 念のため */
        try { localStorage.removeItem(sk); removed++; } catch(e){}
      });
    }
    try { localStorage.removeItem(id); removed++; } catch(e){}
    return { ok: true, id: id, removed: removed };
  }

  window.__v292Dfix564 = {
    off: off, create: create, verify: verify, restore: restore,
    list: list, remove: remove, estimate: estimate,
    _partKeys: partKeys, _hash: hash, _isOurs: isOurs, MPRE: MPRE, DPRE: DPRE
  };
  try { if (!off()) console.log(TAG, 'ready'); } catch(e){}
})();
