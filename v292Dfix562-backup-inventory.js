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
                 kind: m.kind || 'user', protectedReason: m.protectedReason || null,
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
      /* ★fix567(GPT指定): 保護には階層がある。test-fixture(回帰コーパス)は保護するが、
         容量が再び逼迫したら**ユーザデータより先に**消してよい層に置く。
         これを区別しないと、テスト用データがユーザの物語と同じ重みで守られ続ける。 */
      out[sn.slotId] = { key: sn.id, bytes: sn.bytes, turns: sn.turns, createdAt: sn.createdAt,
                         complete: true, kind: 'snapshot', tier: sn.kind === 'test-fixture' ? 'test-fixture' : 'user',
                         protectedReason: sn.protectedReason,
                         reason: sn.kind === 'test-fixture'
                           ? '回帰コーパスの論理スナップショット。保護するが、容量逼迫時はユーザデータより先に解放してよい'
                           : 'サイドストア込みの論理スナップショット(fix564)。控えより強い' };
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
        return { slot: s.slotId, turns: s.turns, parts: s.parts, kind: s.kind,
                 kb: Math.round(s.bytes / 1024), complete: s.complete, missing: s.missing };
      }),
      /* 容量が逼迫したとき、ユーザデータに手を付ける前に解放できる量 */
      releasableFirstKB: Math.round(snapshotsBySlot()
        .filter(function(s){ return s.kind === 'test-fixture'; })
        .reduce(function(a, b){ return a + b.bytes; }, 0) / 1024),
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

  /* ================= fix578(A3.1): classifyKey() — 読取専用の汎用分類器 ==========
   * ■なぜ protectedSet() を拡張しないのか（GPT裁定）
   *   protectedSet() は「**控えの中から**保護するものを返す」という意味で既存コードに使われている。
   *   ここへ生セーブやサイドストアを混ぜると、控え総量・保護控え容量・GC候補数などの意味が変わる。
   *   したがって **protectedSet() は1バイトも変えず**、別APIとして足す。
   *
   * ■このAPIがやること／やらないこと
   *   やる  : キー1本を見て「これは何で、誰のもので、どれだけ強く守るべきか」を返す。**判断だけ**。
   *   やらない: 物理削除。localStorageへの書込。protectedSet()の意味を変えること。
   *
   * ■保護の段階（GPT指定の保護階層）
   *   'hard'       … 生セーブ本体・生きているスロットのサイドストア。
   *                  単なる reclaim / retention では**絶対に消せない**。
   *                  検証済みのライフサイクル計画(lifecycle-delete)でだけ消せる。
   *   'protected'  … 完全スナップショットの実体、各スロットの最良の控え。
   *                  通常は消さない。より強い保護を優先する。
   *   'releasable' … 余剰控え・キャッシュ・診断ログ・test-fixture。reclaim で消してよい。
   *   'review'     … 形式不明。**判断できないものは消さない**（fail-closed）。
   *
   * ★引用符付きキーへの対応:
   *   chr6_v292Dfix54_genderMap_"smrg85jwsn6" のように、キー名の中でスロットIDが
   *   引用符で囲まれる家族が実在する（fix54 が chr6_active_slot を JSON.parse せずに
   *   連結しているため）。slotFromKey() は部分一致で拾うのでIDは正しく抽出できる。
   *   ★計画に載せるのは**実際のexact key（引用符込み）**であって、正規化した名前ではない。
   */
  var TEST_FIXTURE_RE = /^(ab\d+p\d+[A-Za-z]?|chr6_gc_probe_|__v543|__v292probe)/;
  var DIAG_RE = /^(v292Dfix\d+_log|v292Dfix\d+_bkLog|v292Dfix\d+_dropped|__v346raw|v292Dfix573_log)/;
  /* ★fix579(GPT裁定): 画像・外見系は **review のままにせず shared-asset として分類**する。
     実測(2026-07-26・実データ563キー)で **398件/295KB が review** に落ちており、その大半がこれだった。
     この家族は**スロットIDを持たず、登場人物の「名前」をキーにして全スロットで共有**される。
     つまり「どの物語のものか」が原理的に決まらないので、slotId は null のままにする。
     ★protection は 'protected'。参照カウント（どの物語が使っているか）が無い以上、
       消してよいと判断できないため。**参照カウントと削除は、まだ実装しない**（GPT指定）。 */
  var SHARED_ASSET_RE = /^(chrAiAv\d*:|v292av\d*_|v292avrec_|v292avatar)/;

  function classifyKey(key, value){
    var k = String(key == null ? '' : key);
    var live = liveSlots();
    var r = { key: k, family: 'unknown', slotId: null, protection: 'review',
              owner: null, why: '', completeness: null, policyVersion: 1 };
    if (!k){ r.why = 'キーが空'; return r; }

    /* ①生セーブ本体 ------------------------------------------------------ */
    if (k === 'chr6' || SLOT_RE.test(k)){
      r.family = 'live-story';
      r.slotId = (k === 'chr6') ? 'default' : k.replace('chr6_slot_', '');
      r.protection = 'hard';
      r.owner = 'story-lifecycle';
      /* ★fix579(GPT指定): 中身が壊れたJSONでも、**キーだけで生セーブと分かるなら hard のまま**。
         「壊れているから」を理由に削除可能へ降格させない。
         壊れた本体こそ手作業復元の対象で、勝手に消されると本当に取り返しがつかない。 */
      var rawV = (value !== undefined) ? value : lsg(k);
      if (rawV == null){
        r.completeness = 'missing';
      } else {
        try { JSON.parse(rawV); r.completeness = 'ok'; }
        catch(e){ r.completeness = 'broken'; }
      }
      r.why = (r.completeness === 'broken')
        ? '生セーブ本体（中身は壊れているが、壊れを理由に削除可能へ降格させない）'
        : '生セーブ本体。ライフサイクル計画でのみ削除可';
      return r;
    }
    /* ②スロット台帳・現在地 ---------------------------------------------- */
    if (k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'){
      r.family = 'live-index'; r.protection = 'hard'; r.owner = 'story-lifecycle';
      r.why = '物語一覧そのもの。消すと全物語が行方不明になる';
      return r;
    }
    /* ③控え（chr6_bk_*） -------------------------------------------------- */
    if (k.indexOf('chr6_bk_') === 0){
      r.family = 'story-backup';
      r.slotId = slotFromKey(k, live);
      r.owner = 'backup-retention';
      var ps = null; try { ps = protectedSet(); } catch(e){ ps = null; }
      if (ps){
        var isBest = false;
        Object.keys(ps).forEach(function(sid){ if (ps[sid] && ps[sid].key === k) isBest = true; });
        if (isBest){
          r.protection = 'protected';
          r.why = '現在存在するスロットの、復元可能な最良の控え1件';
          return r;
        }
      } else {
        /* ★分類器が判断できない状態で「余剰」と言い切らない（fail-closed） */
        r.protection = 'review';
        r.why = '控えの棚卸しに失敗したため判断保留';
        return r;
      }
      r.protection = 'releasable';
      r.why = '余剰の控え（最良の控えではない）';
      return r;
    }
    /* ④論理スナップショット（fix564） ------------------------------------- */
    if (k.indexOf('chr6_snap_') === 0 || k.indexOf('chr6_snapd_') === 0){
      r.family = 'story-snapshot';
      r.slotId = slotFromKey(k, live);
      r.owner = 'snapshot';
      r.protection = 'protected';
      r.why = '完全スナップショットの一部。復元の単位なので通常は消さない';
      return r;
    }
    /* ⑤画像・外見（スロット横断で共有される資産） -------------------------- */
    if (SHARED_ASSET_RE.test(k)){
      r.family = 'shared-asset';
      r.slotId = null;                 /* ★名前キーなので、どの物語のものかは決まらない */
      r.protection = 'protected';
      r.owner = 'asset-store';
      r.why = '複数の物語で共有されうる画像・外見。参照関係が不明なため削除しない';
      return r;
    }
    /* ⑥test-fixture（ユーザーデータより先に回収してよい） ------------------ */
    if (TEST_FIXTURE_RE.test(k)){
      r.family = 'test-fixture'; r.protection = 'releasable'; r.owner = 'diagnostics';
      r.why = '診断・テスト用の残骸。ユーザーデータより先に回収してよい';
      return r;
    }
    /* ⑦診断ログ・キャッシュ ----------------------------------------------- */
    if (DIAG_RE.test(k)){
      r.family = 'diagnostic-log'; r.protection = 'releasable'; r.owner = 'diagnostics';
      r.why = '診断ログ。失っても物語は復元できる';
      return r;
    }
    /* ⑧サイドストア ------------------------------------------------------- */
    /* ★「生きているスロットのサイドストア」は hard。スロットが既に無いなら孤児で releasable。
       ここで live を先に見るのが要。生セーブと同じ強さで守らないと、
       物語は残っているのに登場人物や記憶だけが消える事故になる。 */
    var sid = null;
    for (var i = 0; i < live.length; i++){
      if (k.indexOf(live[i]) >= 0){ sid = live[i]; break; }
    }
    if (sid){
      r.family = 'live-side-store'; r.slotId = sid; r.protection = 'hard'; r.owner = 'story-lifecycle';
      r.why = '生きているスロットのサイドストア。本体と同じ論理単位';
      return r;
    }
    var orphan = slotFromKey(k, live);
    if (orphan && live.indexOf(orphan) < 0){
      r.family = 'orphan-side-store'; r.slotId = orphan; r.protection = 'releasable';
      r.owner = 'story-lifecycle';
      r.why = 'もう存在しないスロットのサイドストア（孤児）';
      return r;
    }
    /* ⑨それ以外は判断しない（消さない） ----------------------------------- */
    r.why = '形式不明。判断できないものは削除対象にしない';
    return r;
  }

  /* ================= fix578(A3.1): deletePolicy() — 判断だけを返す ==============
   * ★物理削除は行わない。allow の真偽と理由コードだけを返す。
   * ★生セーブの lifecycle-delete は、クラウド側の tombstone(A3.3)が未実装のあいだ
   *   **常に allow:false / 'lifecycle-delete-not-ready'** にする（GPT裁定）。
   *   tombstone が無いまま生セーブを消すと、次の bootPull で復活して
   *   「消したのに戻ってくる」を新たに作るため。
   */
  /* ★fix735: LDR server proof の鮮度上限。fix660 の SERVER_PROOF_TTL_MS と同じ意味
     （0 <= now - serverConfirmedAt <= TTL）。理由なく別 semantics へ分岐させない。 */
  var LDR_PROOF_TTL_MS = 120000;

  /* ★★fix735(RULING109 §3): 分類器の入力（localStorage の列挙）が信用できないとき、
     hard を releasable などへ降格させたまま削除許可を出さない。
     ・ここで判定するのは **削除の authorization** だけ。classifyKey 本体は 1 行も変えない
     ・正常な production 相当の列挙では従来どおりの分類・従来どおりの判断を返す
     ・新しい storage 抽象や汎用 enumerator は作らない */
  function enumerationTrustworthy(){
    try {
      var ks = Object.keys(localStorage);
      if (Object.prototype.toString.call(ks) !== '[object Array]') return false;
      var len = localStorage.length;
      if (typeof len !== 'number' || !isFinite(len) || len < 0 || Math.floor(len) !== len) return false;
      if (ks.length !== len) return false;
      var seen = Object.create(null), n = 0;
      for (var i = 0; i < len; i++){
        var k = localStorage.key(i);
        if (typeof k !== 'string' || k === '') return false;     /* invalid key */
        if (seen[k] === 1) return false;                          /* duplicate */
        seen[k] = 1; n++;
      }
      if (n !== len) return false;
      for (var j = 0; j < ks.length; j++){
        var kk = ks[j];
        if (typeof kk !== 'string' || kk === '') return false;
        if (seen[kk] !== 1) return false;                         /* 集合不一致 */
      }
      return true;
    } catch(e){ return false; }                                   /* throw / 判定不能 */
  }

  function tombstoneReady(){
    try { var s = window.__chronicleStoryLifecycle;
          return !!(s && s.tombstoneBarrierReady === true); } catch(e){ return false; }
  }
  function deletePolicy(req){
    req = req || {};
    var c = classifyKey(req.key, req.value);
    var intent = String(req.intent || 'reclaim');
    var out = { allow: false, code: 'denied', classification: c, policyVersion: 1 };

    /* ★★fix735: 列挙が信用できない状態では、どの分類であっても削除を許可しない。
       hard → orphan-side-store(releasable) のような降格で authorization を
       迂回されるのを防ぐ（fail closed）。 */
    if (!enumerationTrustworthy()){
      out.code = 'classification-input-unreliable';
      return out;
    }

    if (c.protection === 'review'){ out.code = 'unknown-format-review-only'; return out; }
    if (c.protection === 'releasable'){
      if (intent === 'reclaim' || intent === 'retention' || intent === 'lifecycle-delete'){
        out.allow = true; out.code = 'releasable'; return out;
      }
      out.code = 'unknown-intent'; return out;
    }
    if (c.protection === 'protected'){
      /* 最良の控え・スナップショットは reclaim/retention では消さない */
      out.code = (intent === 'lifecycle-delete') ? 'lifecycle-delete-not-ready' : 'protected';
      return out;
    }
    /* hard = 生セーブ本体・生きているスロットのサイドストア・台帳 */
    if (intent !== 'lifecycle-delete'){
      out.code = 'live-data-requires-lifecycle-authorization';
      return out;
    }
    if (!tombstoneReady()){
      /* ★A3.3(pull側 tombstone barrier)が入るまでは、生セーブの削除を許可しない */
      out.code = 'lifecycle-delete-not-ready';
      return out;
    }
    /* ★★fix735(RULING108 修正1): LDR-terminal に限った狭い verified authorization。
       汎用の verified-plan 機構ではない。LIFECYCLE_DELETE_RECOVERY で server tombstone が
       確定し legacy plan が正式 terminal 化された **その計画に載っている exact key** だけを解禁する。
       通常の（非 terminal）hard story delete は今回も解禁しない。 */
    var ldr = ldrTerminalAuthorization(req, c);
    if (ldr.ok){
      out.allow = true;
      out.code = 'lifecycle-delete-verified-ldr-terminal';
      out.ldr = { slotId: ldr.slotId, resolutionDeleteOpId: ldr.resolutionDeleteOpId,
                  resolvedServerRev: ldr.resolvedServerRev };
      /* ★fix735: TOCTOU 対策。authorization を「exact key + そのときの値 + 計画同一性」へ縛る。
         新しい永続 hash authority は作らない（既存 hash() の値をその場で持つだけ）。 */
      out.binding = ldr.binding;
      return out;
    }
    out.code = 'lifecycle-delete-requires-verified-plan';
    out.ldrWhy = ldr.why;     /* なぜ verified 経路に乗らなかったか（診断のみ） */
    return out;
  }

  /* ★★fix735: LDR-terminal verified authorization の判定だけを行う。
     ここでは **何も削除しない・何も書かない**。判定と理由を返すだけ。 */
  var LDR_RESOLUTION = 'SERVER_TOMBSTONED_BY_LDR';
  function metaTombstoneExists(slotId){
    try {
      var a = JSON.parse(lsg('chr6_slots_meta') || '[]');
      if (!Array.isArray(a)) return false;
      for (var i = 0; i < a.length; i++){
        var e = a[i];
        if (e && e.deleted === true && String(e.id) === String(slotId)) return true;
      }
      return false;
    } catch(e){ return false; }
  }
  /* ★fix735: 時刻異常は必ず fail closed。TTL を伸ばして通す方向にはしない。 */
  function proofTimeOk(sp){
    var at = sp.serverConfirmedAt;
    if (typeof at !== 'number' || !isFinite(at) || at <= 0) return 'proof-timestamp-invalid';
    var now = Date.now();
    var age = now - at;
    if (age < 0) return 'proof-timestamp-future';
    if (age > LDR_PROOF_TTL_MS) return 'proof-stale';
    if (sp.issuedAt !== undefined){
      var ia = sp.issuedAt;
      if (typeof ia !== 'number' || !isFinite(ia) || ia <= 0) return 'proof-issuedat-invalid';
      if (ia - now > 0) return 'proof-issuedat-future';
    }
    if (sp.expiresAt !== undefined){
      var ea = sp.expiresAt;
      if (typeof ea !== 'number' || !isFinite(ea) || ea <= 0) return 'proof-expiresat-invalid';
      if (ea <= now) return 'proof-expired';
      if (ea - now > LDR_PROOF_TTL_MS) return 'proof-expiresat-abnormal';
    }
    return null;
  }
  function ldrTerminalAuthorization(req, c){
    function no(why){ return { ok:false, why:why }; }
    if (!req || typeof req !== 'object') return no('no-req');
    /* ① 対象は hard の live-story / live-side-store のみ */
    if (!c || c.protection !== 'hard') return no('not-hard');
    if (c.family !== 'live-story' && c.family !== 'live-side-store') return no('family-not-story');
    /* ② 計画 */
    var vp = req.verifiedPlan;
    if (!vp || typeof vp !== 'object') return no('no-verified-plan');
    if (vp.sdTerminal !== true) return no('plan-not-terminal');
    if (vp.sdResolution !== LDR_RESOLUTION) return no('plan-resolution-mismatch');
    if (typeof vp.resolutionDeleteOpId !== 'string' || vp.resolutionDeleteOpId === '')
      return no('plan-no-resolution-opid');
    if (typeof vp.planId !== 'string' || vp.planId === '') return no('plan-no-planid');
    if (typeof vp.deleteOpId !== 'string' || vp.deleteOpId === '') return no('plan-no-deleteopid');
    if (typeof vp.snapshotId !== 'string' || vp.snapshotId === '') return no('plan-no-snapshotid');
    /* ★元の停止理由（事故原因の証拠）が残っていること */
    if (!vp.sdHold || vp.sdHold.verdict !== 'DELETE_BASE_HASH_MISSING')
      return no('plan-provenance-missing');
    if (vp.localDeleteBaseHash != null && vp.localDeleteBaseHash !== '')
      return no('plan-basehash-present');
    if (c.slotId == null || String(c.slotId) !== String(vp.slotId)) return no('slot-mismatch');
    /* ③ exact key が計画に載っており、bytes/hash が現在値と一致する */
    var keys = vp.keys;
    if (Object.prototype.toString.call(keys) !== '[object Array]') return no('plan-keys-missing');
    var it = null;
    for (var i = 0; i < keys.length; i++){ if (keys[i] && keys[i].key === req.key){ it = keys[i]; break; } }
    if (!it) return no('key-not-in-plan');
    var raw = (req.value !== undefined) ? req.value : lsg(req.key);
    if (raw == null) return no('value-missing');
    if (it.bytes != null && raw.length !== it.bytes) return no('bytes-mismatch');
    var curHash = hash(raw);
    if (it.hash != null && curHash !== it.hash) return no('hash-mismatch');
    /* ④ server proof（id / deleted / authority / rev / 時刻） */
    var sp = req.serverProof;
    if (!sp || typeof sp !== 'object') return no('no-server-proof');
    if (String(sp.id != null ? sp.id : vp.slotId) !== String(vp.slotId)) return no('proof-id-mismatch');
    if (sp.deleted !== true) return no('proof-not-deleted');
    if (sp.authority !== 'shadow' && sp.authority !== 'canonical') return no('proof-authority-unexpected');
    if (typeof vp.resolvedServerRev !== 'number' || sp.rev !== vp.resolvedServerRev) return no('proof-rev-mismatch');
    var tw = proofTimeOk(sp);
    if (tw) return no(tw);
    /* ⑤ local 側の墓標と barrier */
    if (!metaTombstoneExists(vp.slotId)) return no('no-meta-tombstone');
    if (!tombstoneReady()) return no('tombstone-barrier-not-ready');
    return { ok:true, slotId: String(vp.slotId),
             resolutionDeleteOpId: vp.resolutionDeleteOpId,
             resolvedServerRev: vp.resolvedServerRev,
             /* ★TOCTOU binding。永続化しない。判定した瞬間の同一性そのもの */
             binding: { key: req.key, bytes: raw.length, hash: curHash,
                        slotId: String(vp.slotId), planId: vp.planId,
                        deleteOpId: vp.deleteOpId, snapshotId: vp.snapshotId,
                        sdTerminal: true, sdResolution: vp.sdResolution,
                        resolutionDeleteOpId: vp.resolutionDeleteOpId,
                        resolvedServerRev: vp.resolvedServerRev } };
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
    /* fix578(A3.1): 読取専用の汎用分類器。protectedSet() の意味は据え置き。 */
    classifyKey: classifyKey,
    deletePolicy: deletePolicy,
    _hash: hash, _tsFromKey: tsFromKey, _slotFromKey: slotFromKey, _familyOf: familyOf, _score: score
  };
  try { if (!off()) console.log(TAG, 'ready (read-only)'); } catch(e){}
})();
