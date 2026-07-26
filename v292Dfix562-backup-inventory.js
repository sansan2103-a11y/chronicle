/* v292Dfix562-backup-inventory.js (2026-07-26) — 控えとサイドストアの「読み取り専用」棚卸し
 *
 * ■なぜ必要か(実測)
 *   localStorage 3.9MB のうち **控え(chr6_bk_*)が 2054KB = 52%** を占めている。
 *   一方で、物語を復元するのに必要なデータは本体セーブ(chr6_slot_*)だけではない。
 *   状態・準登録カルテ・ロスター・長期記憶・別名台帳・画像manifest などは
 *   **スロットIDを含む別キー(サイドストア)**に入っており、控えにも入っていない。
 *   そのためクラウド復元やスロット複製でこれらが運ばれず、状態0件の物語ができていた(実測2件)。
 *
 * ■このfixがやること = 「見るだけ」
 *   ・スロットごとの**論理スナップショット**(本体＋サイドストア)を定義して可視化する
 *   ・控えを棚卸しし、復元可能性・完全性・重複・孤児を判定する
 *   ・GCの**dryRun**(削除候補・解放量・保護理由)を出す
 *
 * ■このfixが絶対にやらないこと
 *   ・localStorage への書き込み(自分の診断キーも書かない)
 *   ・控えの削除。**復元試験を通す前に、容量だけを理由に自動削除しない**(GPT裁定)
 *   dryRun は「消したらこうなる」を返すだけで、1バイトも消さない。
 *
 * ■削除順(GPT裁定・dryRunはこの順で候補を並べる)
 *   ①存在しないスロットの孤児控え ②壊れていて復元不能な控え ③同一hashの重複控え
 *   ④同一スロットの保護対象ではない古い完全控え ⑤古い部分控え ⑥保護されていない大容量控え
 *   最後まで削除しないもの: **現在存在する各スロットの、最新かつ復元可能な完全スナップショット1件**
 *   「控えの家族(fix469/guard/cloudsync…)ごとに1件」ではなく、**スロットごとに1組**を守る。
 *
 * OFF   = localStorage['v292Dfix562Off'] = '1'
 * 読出  = window.__v292Dfix562.report() / .inventory() / .snapshotOf(slot) / .dryRun({targetKB:1024})
 */
(function v292Dfix562(){
  if (window.__v292Dfix562) return;
  var TAG = '[v292Dfix562]';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix562Off') === '1'; }
  function keys(){ try { return Object.keys(localStorage); } catch(e){ return []; } }
  function bytes(k){ var v = lsg(k); return v == null ? 0 : v.length; }

  /* ---- 指紋 ----------------------------------------------------------- */
  /* 内容が同一の控えを見つけるためだけに使う。暗号用途ではない(FNV-1a 32bit)。
     長さも併記するので、実用上の衝突は無視できる。 */
  function hash(s){
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16) + '-' + s.length;
  }
  function hashOf(k){ var v = lsg(k); return v == null ? null : hash(v); }

  /* ---- スロット ------------------------------------------------------- */
  var SLOT_RE = /^chr6_slot_([A-Za-z0-9]+)$/;
  function liveSlots(){
    var out = [];
    keys().forEach(function(k){ var m = k.match(SLOT_RE); if (m) out.push(m[1]); });
    return out;
  }

  /* ---- サイドストアの発見 --------------------------------------------- */
  /* ★キー名をハードコードしない。新しい fix が増えるたびに一覧が腐るため。
     「スロットIDを含む、本体でも控えでもないキー」を機械的にサイドストアとみなす。
     実測(2026-07-26)で12家族が見つかった: fix104_dlg / fix277Quasi / fix77States /
     fix136_wi / fix307Roster / fix137_ev / fix54_genderMap / fix135_sum /
     fix298 / fix374Chosen / fix307Last / fix135_last。
     genderMap のようにキー内でスロットIDが引用符で囲まれる例があるので、部分一致で拾う。 */
  function sideStoreKeys(slot){
    if (!slot) return [];
    var out = [];
    keys().forEach(function(k){
      if (k === 'chr6_slot_' + slot) return;      /* 本体 */
      if (k.indexOf('chr6_bk_') === 0) return;    /* 控え */
      /* ★スナップショット(fix564)自身を除外する。除外しないと、スナップショットを取るたびに
         前回のスナップショットをサイドストアとして数え、容量が雪だるま式に増える。 */
      if (k.indexOf('chr6_snap_') === 0 || k.indexOf('chr6_snapd_') === 0) return;
      if (k.indexOf(slot) < 0) return;
      out.push(k);
    });
    return out.sort();
  }

  /* ---- 論理スナップショット ------------------------------------------- */
  /* ★実データを一つの巨大JSONへまとめるのではなく、manifest によって
     「本体＋サイドストアで一組」であることを**論理的に定義**する(GPT裁定)。
     画像は本体(dataURL)ではなく参照情報だけを持つ。dataURL を複製すると容量を使い切る。 */
  function snapshotOf(slot){
    var storyKey = 'chr6_slot_' + slot;
    var storyRaw = lsg(storyKey);
    var parts = {};
    if (storyRaw != null){
      parts.story = { key: storyKey, hash: hash(storyRaw), bytes: storyRaw.length };
    }
    var side = sideStoreKeys(slot), sideBytes = 0;
    side.forEach(function(k){
      var v = lsg(k); if (v == null) return;
      sideBytes += v.length;
      parts[k] = { key: k, hash: hash(v), bytes: v.length };
    });
    var turns = null;
    try { var o = JSON.parse(storyRaw || 'null');
      var a = (o && o.turns) || (o && o.state && o.state.turns) || null;
      turns = Array.isArray(a) ? a.length : null; } catch(e){}
    return {
      slotId: slot,
      complete: storyRaw != null,
      turns: turns,
      sideStoreCount: side.length,
      totalBytes: (storyRaw ? storyRaw.length : 0) + sideBytes,
      storyBytes: storyRaw ? storyRaw.length : 0,
      sideBytes: sideBytes,
      parts: parts
    };
  }

  /* ---- 控えの棚卸し --------------------------------------------------- */
  /* 作成時刻は**キー名末尾の13桁**から採るのが第一。実測40件中22件がこれを持つ。
     本文に savedAt を持つものは2件しかなかったので、本文は第二候補。
     どちらも無いものは createdAt:null / importedLegacy:true として登録し、
     「最古扱いだが、そのスロットで唯一復元できるなら保護する」に回す。 */
  function tsFromKey(k){ var m = k.match(/[_-](\d{13})$/); return m ? Number(m[1]) : null; }
  function tsFromBody(o){
    if (!o || typeof o !== 'object') return null;
    var c = o.savedAt || o.ts || o.updatedAt || (o.meta && o.meta.savedAt) || null;
    return typeof c === 'number' ? c : null;
  }
  /* 控えのキーからスロットIDを推定する。3段構え:
       ①`chr6_slot_<id>` を含む(fix469 系)
       ②いま生きているスロットIDのどれかを含む ← いちばん確実。孤児以外はここで決まる
       ③`_sm…` の形(孤児=もう存在しないスロットの控えは②で当たらないため、形で拾う)
     ③のパターンだけに頼ると、命名規則が変わった控えを取りこぼす。 */
  function slotFromKey(k, live){
    var m = k.match(/chr6_slot_([A-Za-z0-9]+)/);
    if (m) return m[1];
    var ls = live || liveSlots();
    for (var i = 0; i < ls.length; i++){ if (k.indexOf(ls[i]) >= 0) return ls[i]; }
    m = k.match(/_(sm[A-Za-z0-9]{3,})(?:_\d{13})?$/);
    if (m) return m[1];
    m = k.match(/_(sm[A-Za-z0-9]{3,})_/);
    return m ? m[1] : null;
  }
  function familyOf(k){
    var rest = k.replace(/^chr6_bk_/, '');
    var m = rest.match(/^([A-Za-z0-9]+?)_/);
    return m ? m[1] : rest;
  }

  /* ---- 控えの「形」を読む --------------------------------------------- */
  /* ★2026-07-26 実測でわかったこと(最初の実装はここを3通り誤読していた)。
     控えは1つの形式ではなく、少なくとも4つの形がある:
       ①素の本体セーブ            {turns:[…]}                     … fix469 / guard 系
       ②1キーを包んだ控え          {key, blob, ts}                  … fix538 / fix409 系
                                   blob は**文字列**なので、中を開かないとターンが0に見える
       ③localStorage 丸ごとの控え   {activeSlot, ls:{キー: 値}}      … cloudsync 系(442KB)
                                   ★サイドストアも入っているので、事実上の完全スナップショット
       ④部分控え                   配列・素のテキストなど            … roster / 画像プロンプト等
     最初の実装は ②③を「ターン0」、④を「壊れている」と判定していた。
     その結果、**622KB の正当な控えが削除順位2位(壊れている)に並んでいた**。
     読み取り専用のうちに気づけたので実害は無い。以後、形を判定してから中身を数える。 */
  function turnsIn(o){
    try {
      var a = (o && o.turns) || (o && o.state && o.state.turns) || null;
      return Array.isArray(a) ? a.length : 0;
    } catch(e){ return 0; }
  }
  function classify(raw){
    var r = { kind: 'unknown', parseable: false, turns: 0, slotsInside: 0, carriesSideStores: false };
    if (raw == null) return r;
    var o = null;
    try { o = JSON.parse(raw); r.parseable = true; }
    catch(e){
      /* JSONに見えるのに読めないものだけを「壊れている」とする。
         素のテキスト(画像プロンプト等)は壊れていない、ただの部分控え。 */
      var head = raw.replace(/^\s+/, '').charAt(0);
      r.kind = (head === '{' || head === '[') ? 'broken' : 'partial';
      return r;
    }
    if (o && typeof o === 'object' && o.ls && typeof o.ls === 'object'){
      /* ③丸ごと控え */
      r.kind = 'fullDump';
      var ks = Object.keys(o.ls);
      ks.forEach(function(k2){
        if (/^chr6_slot_/.test(k2)){
          r.slotsInside++;
          var t = 0;
          try { t = turnsIn(JSON.parse(String(o.ls[k2]))); } catch(e2){}
          if (t > r.turns) r.turns = t;
        }
      });
      /* 本体以外のキーも含んでいれば、サイドストアを運べる */
      r.carriesSideStores = ks.length > r.slotsInside;
      return r;
    }
    if (o && typeof o === 'object' && typeof o.key === 'string' && 'blob' in o){
      /* ②包まれた控え。blob は文字列なので開いて数える */
      r.kind = 'wrapped';
      r.wrappedKey = o.key;
      var inner = o.blob;
      if (typeof inner === 'string'){ try { inner = JSON.parse(inner); } catch(e3){ inner = null; } }
      r.turns = turnsIn(inner);
      if (r.turns === 0) r.kind = 'partial';
      return r;
    }
    var t2 = turnsIn(o);
    if (t2 > 0){ r.kind = 'story'; r.turns = t2; return r; }
    r.kind = 'partial';
    return r;
  }

  function inventory(){
    var live = liveSlots(), liveSet = {};
    live.forEach(function(s){ liveSet[s] = true; });
    var rows = [];
    keys().forEach(function(k){
      if (k.indexOf('chr6_bk_') !== 0) return;
      var raw = lsg(k);
      var c = classify(raw);
      var o = null; try { o = JSON.parse(raw == null ? 'null' : raw); } catch(e){}
      var slot = slotFromKey(k, live);
      if (!slot && c.wrappedKey) slot = slotFromKey(c.wrappedKey, live);
      var ts = tsFromKey(k);
      var tsSrc = ts ? 'key' : null;
      if (!ts){ ts = tsFromBody(o); if (ts) tsSrc = 'body'; }
      rows.push({
        key: k,
        family: familyOf(k),
        kind: c.kind,                 /* story / wrapped / fullDump / partial / broken */
        slotId: slot,
        slotAlive: slot ? !!liveSet[slot] : null,
        createdAt: ts,
        createdAtSource: tsSrc,
        importedLegacy: !ts,
        bytes: raw == null ? 0 : raw.length,
        hash: raw == null ? null : hash(raw),
        parseable: c.parseable,
        /* 「そのスロットの物語を復元できる」= ターンを1つ以上運べること。
           部分控え(ロスターだけ・画像プロンプトだけ)は、物語の復元には使えない。 */
        restorable: c.turns > 0,
        turns: c.turns,
        slotsInside: c.slotsInside,
        /* 「完全」= 本体だけでなくサイドストアも運べるか。
           ★丸ごと控え(cloudsync)だけが現状これを満たす。他は本体のみで、
           復元すると状態・カルテ・ロスター・長期記憶を失う。 */
        completeSnapshot: c.kind === 'fullDump' ? c.carriesSideStores
                        : !!(o && o.parts && o.parts.story)
      });
    });
    return rows.sort(function(a, b){ return b.bytes - a.bytes; });
  }

  /* ---- 保護対象の判定 ------------------------------------------------- */
  /* スロットごとに1件。優先度は
       ①完全スナップショット ②復元可能 ③ターン数が多い ④作成時刻が新しい ⑤サイズが大きい
     「新しい」を最優先にしない理由: 時刻の無い legacy が22/40あり、時刻順だと
     ターン221の唯一の控えが「最古扱い」で消える可能性があるため。 */
  function score(r){
    return (r.completeSnapshot ? 1e15 : 0) + (r.restorable ? 1e12 : 0)
         + Math.min(r.turns, 999999) * 1e6 + Math.min(r.createdAt || 0, 1e12) / 1e6;
  }
  /* fix564 のスナップショットを読む(読むだけ。fix564 が無くても動く) */
  function snapshotsBySlot(){
    var out = [];
    keys().forEach(function(k){
      if (k.indexOf('chr6_snap_') !== 0) return;
      var m = null; try { m = JSON.parse(lsg(k) || 'null'); } catch(e){}
      if (!m || !m.slotId) return;
      var dataBytes = 0, missing = 0;
      Object.keys(m.parts || {}).forEach(function(lk){
        var v = lsg(m.parts[lk].snapKey);
        if (v == null) missing++; else dataBytes += v.length;
      });
      out.push({ id: k, slotId: m.slotId, createdAt: m.createdAt, turns: m.turns,
                 parts: m.partCount, bytes: dataBytes + (lsg(k) || '').length,
                 complete: !!m.complete && missing === 0, missing: missing });
    });
    /* スロットごとに最新1件だけを代表にする */
    var best = {};
    out.sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); })
       .forEach(function(s){ if (!best[s.slotId]) best[s.slotId] = s; });
    return Object.keys(best).map(function(s){ return best[s]; });
  }

  function protectedSet(){
    var live = liveSlots(), best = {}, inv = inventory();
    inv.forEach(function(r){
      if (!r.slotId || live.indexOf(r.slotId) < 0) return;   /* 生きているスロットだけ守る */
      if (!r.restorable) return;
      if (!best[r.slotId] || score(r) > score(best[r.slotId])) best[r.slotId] = r;
    });
    var out = {};
    Object.keys(best).forEach(function(s){
      out[s] = { key: best[s].key, bytes: best[s].bytes, turns: best[s].turns,
                 createdAt: best[s].createdAt, complete: best[s].completeSnapshot,
                 reason: '現在存在するスロットの、復元可能な最良の控え1件' };
    });
    /* ★fix566: 論理スナップショット(fix564)は chr6_bk_ ではないので inventory() に入らない。
       数えないと「控えが1件も無いスロット」と誤って警告し、**旧式の本体だけの控えを
       増やす方向へ人を誘導してしまう**。スナップショットの方が保護として強いので、
       完全なスナップショットがあればそれを保護対象として採用する。 */
    snapshotsBySlot().forEach(function(sn){
      if (live.indexOf(sn.slotId) < 0) return;
      if (!sn.complete) return;
      out[sn.slotId] = { key: sn.id, bytes: sn.bytes, turns: sn.turns, createdAt: sn.createdAt,
                         complete: true, kind: 'snapshot',
                         reason: 'サイドストア込みの論理スナップショット(fix564)。控えより強い' };
    });
    /* ★丸ごと控え(localStorage全体)は、どれか1つのスロットに属さないので上のループでは守れない。
       しかし**サイドストアを運べる唯一の控え**なので、最新の1件を別枠で保護する。
       これを容量のために消すと、状態・カルテ・ロスターごと復元する手段が完全に消える。 */
    var dumps = inv.filter(function(r){ return r.kind === 'fullDump' && r.completeSnapshot; })
                   .sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0) || b.bytes - a.bytes; });
    if (dumps.length){
      out['(fullDump)'] = { key: dumps[0].key, bytes: dumps[0].bytes, turns: dumps[0].turns,
                            createdAt: dumps[0].createdAt, complete: true,
                            reason: 'サイドストアごと復元できる唯一の控え(localStorage丸ごと)。最新1件' };
    }
    return out;
  }

  /* ---- GC の dryRun(何も消さない) ------------------------------------- */
  var ORDER = [
    { rank: 1, why: '存在しないスロットの孤児控え' },
    { rank: 2, why: '壊れていて復元不能な控え' },
    { rank: 3, why: '同一hashの重複控え' },
    { rank: 4, why: '同一スロットの、保護対象ではない古い完全控え' },
    { rank: 5, why: '古い部分控え' },
    { rank: 6, why: '保護されていない大容量控え' }
  ];
  function dryRun(opts){
    opts = opts || {};
    var targetKB = typeof opts.targetKB === 'number' ? opts.targetKB : 1024;
    var rows = inventory();
    var prot = protectedSet(), protKeys = {};
    Object.keys(prot).forEach(function(s){ protKeys[prot[s].key] = prot[s].reason; });

    var seenHash = {};
    /* 重複判定は「古い方を候補にする」ため、保護 → 新しい順に先に印を付ける */
    rows.slice().sort(function(a, b){
      if (protKeys[a.key] !== protKeys[b.key]) return protKeys[a.key] ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }).forEach(function(r){
      if (r.hash == null) return;
      if (seenHash[r.hash]) r._dupOf = seenHash[r.hash]; else seenHash[r.hash] = r.key;
    });

    var cands = [], kept = [];
    rows.forEach(function(r){
      if (protKeys[r.key]){ kept.push({ key: r.key, bytes: r.bytes, reason: protKeys[r.key] }); return; }
      var rank = null, why = null;
      /* ★順位は kind を見て決める。restorable(=ターンを持つ)だけで「壊れている」を決めると、
         ロスターだけ・画像プロンプトだけの**正当な部分控え**が2位に並ぶ(実測で622KB分やらかした)。 */
      if (r.slotId && r.slotAlive === false){ rank = 1; why = ORDER[0].why; }
      else if (r.kind === 'broken'){ rank = 2; why = ORDER[1].why; }
      else if (r._dupOf){ rank = 3; why = ORDER[2].why + '(同内容: ' + r._dupOf + ')'; }
      else if (r.completeSnapshot){ rank = 4; why = ORDER[3].why; }
      else if (r.kind === 'partial'){ rank = 5; why = ORDER[4].why + (r.createdAt ? '' : '(作成時刻不明)'); }
      else { rank = 6; why = ORDER[5].why + (r.createdAt ? '' : '(作成時刻不明)'); }
      cands.push({ key: r.key, bytes: r.bytes, rank: rank, why: why, kind: r.kind,
                   slotId: r.slotId, turns: r.turns, createdAt: r.createdAt });
    });
    /* 同じ rank の中は「古い順 → 大きい順」。時刻不明は最古扱い。 */
    cands.sort(function(a, b){
      return a.rank - b.rank || (a.createdAt || 0) - (b.createdAt || 0) || b.bytes - a.bytes;
    });

    var totalKB = Math.round(rows.reduce(function(a, b){ return a + b.bytes; }, 0) / 1024);
    var keptKB = Math.round(kept.reduce(function(a, b){ return a + b.bytes; }, 0) / 1024);
    var plan = [], freed = 0, cur = totalKB;
    for (var i = 0; i < cands.length && cur > targetKB; i++){
      plan.push(cands[i]);
      freed += Math.round(cands[i].bytes / 1024);
      cur = totalKB - freed;
    }
    return {
      note: '★dryRun です。1バイトも削除していません。復元試験を通すまで自動削除しません。',
      targetKB: targetKB, totalKB: totalKB, protectedKB: keptKB,
      wouldDelete: plan.length, wouldFreeKB: freed, resultKB: totalKB - freed,
      reachesTarget: (totalKB - freed) <= targetKB,
      /* 保護分だけで上限を超えるなら、上限を上げるか、論理スナップショット化で
         本体とサイドストアの重複を減らすしかない。容量のために保護を外さない。 */
      protectedExceedsTarget: keptKB > targetKB,
      plan: plan, protectedItems: kept,
      remaining: cands.slice(plan.length).map(function(c){
        return { key: c.key, bytes: c.bytes, rank: c.rank, why: c.why }; })
    };
  }

  /* ---- まとめ --------------------------------------------------------- */
  function report(){
    var live = liveSlots();
    var snaps = live.map(function(s){ var x = snapshotOf(s);
      return { slot: s, turns: x.turns, storyKB: Math.round(x.storyBytes/1024),
               sideKB: Math.round(x.sideBytes/1024), sideCount: x.sideStoreCount }; });
    var inv = inventory();
    var prot = protectedSet();
    var totalLS = 0; keys().forEach(function(k){ totalLS += k.length + bytes(k); });
    return {
      lsKB: Math.round(totalLS / 1024),
      slots: live.length,
      slotsWithoutBackup: live.filter(function(s){ return !prot[s]; }),
      backups: inv.length,
      backupKB: Math.round(inv.reduce(function(a, b){ return a + b.bytes; }, 0) / 1024),
      backupWithTimestamp: inv.filter(function(r){ return !!r.createdAt; }).length,
      backupLegacyNoTime: inv.filter(function(r){ return !r.createdAt; }).length,
      backupUnrestorable: inv.filter(function(r){ return !r.restorable; }).length,
      backupCompleteSnapshot: inv.filter(function(r){ return r.completeSnapshot; }).length,
      protectedCount: Object.keys(prot).length,
      /* ★fix566: ライブの構成(snapshots)と保存済みの論理スナップショット(logicalSnapshots)は別物。
         同じ名前にすると後から定義した方に潰される(実際にテストで踏んだ)。 */
      logicalSnapshots: snapshotsBySlot().map(function(s){
        return { slot: s.slotId, turns: s.turns, parts: s.parts,
                 kb: Math.round(s.bytes / 1024), complete: s.complete, missing: s.missing };
      }),
      byKind: (function(){
        var m = {}; inv.forEach(function(r){
          m[r.kind] = m[r.kind] || { n: 0, kb: 0 };
          m[r.kind].n++; m[r.kind].kb += Math.round(r.bytes / 1024);
        }); return m;
      })(),
      snapshots: snaps,
      /* ★スロット単位の控え(story/wrapped)は本体セーブしか運ばない。
         サイドストアまで運べるのは丸ごと控え(fullDump)だけで、しかもそれは
         「たまたま残っている cloudsync の副産物」であって、意図した設計ではない。
         各スロットの保存時にサイドストアごとスナップショットを取るのが本丸。 */
      warnings: [
        inv.filter(function(r){ return r.completeSnapshot; }).length === 0
          ? 'サイドストアを含む完全スナップショットが0件。控えから復元すると状態・カルテ・ロスターを失う。' : null,
        inv.filter(function(r){ return r.kind === 'story' || r.kind === 'wrapped'; })
           .every(function(r){ return !r.completeSnapshot; })
          ? 'スロット単位の控えはすべて本体セーブのみ。スロット複製・クラウド復元でサイドストアが運ばれない。' : null,
        live.filter(function(s){ return !prot[s]; }).length
          ? '控えが1件も無いスロットがある(上の slotsWithoutBackup)。' : null
      ].filter(Boolean)
    };
  }

  window.__v292Dfix562 = {
    off: off,
    report: report,
    inventory: inventory,
    snapshotOf: snapshotOf,
    sideStoreKeys: sideStoreKeys,
    liveSlots: liveSlots,
    protectedSet: protectedSet,
    snapshotsBySlot: snapshotsBySlot,
    dryRun: dryRun,
    _hash: hash, _tsFromKey: tsFromKey, _slotFromKey: slotFromKey, _familyOf: familyOf, _score: score
  };
  try { if (!off()) console.log(TAG, 'ready (read-only)'); } catch(e){}
})();
