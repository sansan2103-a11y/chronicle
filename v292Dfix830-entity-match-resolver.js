// =====================================================================
// Chronicle TRPG - v292Dfix830: ENTITY_MATCH_RESOLVER_V1（read-time only・pure・DOM 0 / write 0）
// ---------------------------------------------------------------------
// GPT 裁定 73（`ENTITY_IDENTITY_DYNAMIC_REGISTRATION_V1 = GO`・新しい巨大 engine を作らない）
// GPT 裁定 74（`shared resolver must return match strength` / `AUTO MERGE forbidden: LEGACY_PARTIAL`）
//
// ■ これは何か
//   「この名前は、すでに知っている人物のことか？」を **1 か所で・強さつきで**答えるだけの薄い述語。
//   判定材料は **既存の関数だけ**を組み合わせる（新しい正規化も新しい辞書も作らない）:
//     ・生文字列の完全一致
//     ・fix277 の別名マップ（作者が「別名: A, B」と書いた明示の対応）= window.__v292AliasFix
//     ・fix764 の異体字フォールド（簡体 ↔ 繁体 ↔ 新字体。比較のときだけ使う）= window.__v292Dfix764.same
//     ・fix445 の castMatch（前方 / 後方の部分一致）＝ **分類だけ**
//
// ■ 安全境界（裁定 74 の一番重要な線・破ったら実装ミス）
//   AUTO_MERGE してよい      … EXACT / FOLDED_EXACT / ALIAS_EXACT
//   AUTO_MERGE してはいけない … LEGACY_PARTIAL
//     「少女」と「観覧車の少女」／「影」と「巨大な影」／「腕」と「鏡から伸びる腕」を、
//     部分一致だけで同一人物にしない。**別人を 1 人に潰す事故のほうが重い。**
//     LEGACY_PARTIAL は従来どおり表示補助・候補提示には使ってよいので、分類として返すだけにする。
//   曖昧なら fail-closed  … 1 つの候補に決まらない（fold が 2 人に当たる / 別名の解決先が 2 人）ときは
//                          NO_MATCH（ambiguous:true）を返す。**推測で merge しない。**
//
// ■ 書き換えないもの（read-time identity resolution だけを強くする）
//   S.cast.npcs[].name ／ Story schema ／ fix190 ／ roster schema ／ icon key schema ／ character pk
//   localStorage への書込 0 ／ DOM 0 ／ ネットワーク 0 ／ 新しい永続 key 0
//
// 検証口: window.__v292Dfix830 = { KIND, AUTO_MERGE_KINDS, norm, resolve, autoMatch, canAutoMerge, state }
// kill: localStorage v292Dfix830Off='1' → resolve が常に NO_MATCH（＝呼び手は従来動作へ戻る）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix830) return;
  var TAG = '[v292Dfix830:entity-match]';
  var VERSION = 'v292Dfix830-20260907-resolver-v1.2';   /* v1.2: PART_EXACT を追加（自動 merge には使わない・agenda の棄権専用） */

  var KIND = {
    EXACT:          'EXACT',
    ALIAS_EXACT:    'ALIAS_EXACT',
    FOLDED_EXACT:   'FOLDED_EXACT',
    /* ★v1.2 PART_EXACT … 既存名が **明示の区切り**（空白 / 全角空白 / 中黒）を持ち、
       候補がその **丸ごと 1 パート**（先頭 or 末尾）と完全一致し、しかも cast 内で **一意**なとき。
       例: 「朔」→「鷺沼 朔」／「アリア」→「アリア・リュミエール」。
       ★「村長」→「村長の使い」は既存名に区切りが無いので **該当しない**（別人を潰さない）。
       ★AUTO_MERGE_KINDS には **入れない**。人物の恒久統合には使わない。 */
    PART_EXACT:     'PART_EXACT',
    LEGACY_PARTIAL: 'LEGACY_PARTIAL',
    NO_MATCH:       'NO_MATCH'
  };
  /* ★自動 merge / 新規登録抑止に使ってよいのはこの 3 つだけ（裁定 74） */
  var AUTO_MERGE_KINDS = [KIND.EXACT, KIND.ALIAS_EXACT, KIND.FOLDED_EXACT];

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix830Off') === '1'; }
  function str(v){ return (v == null) ? '' : String(v); }
  function norm(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }

  function f764(){ try { var f = window.__v292Dfix764; return (f && typeof f.same === 'function') ? f : null; } catch(e){ return null; } }
  function aliasFn(){ try { var f = window.__v292AliasFix; return (typeof f === 'function') ? f : null; } catch(e){ return null; } }
  function f445(){ try { var f = window.__v292Dfix445; return (f && typeof f.castMatch === 'function') ? f : null; } catch(e){ return null; } }

  function uniqNames(list){
    var out = [], seen = {}, i, n;
    if (!isArr(list)) return out;
    for (i = 0; i < list.length; i++){
      n = norm(list[i]);
      if (!n || seen[n]) continue;
      seen[n] = 1; out.push(n);
    }
    return out;
  }
  function res(kind, matched, extra){
    var r = { kind: kind, matched: matched || null };
    if (extra) for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; }
    return r;
  }

  /* ---- PART_EXACT（v1.2）----
     既存の fix277 `castPartOwner`（fix528b）と同じ発想を、判定だけ取り出したもの。
     ・既存名に区切り（半角空白 / 全角空白 / 中黒）が無ければ **対象外**（= 「村長」→「村長の使い」を弾く）
     ・区切りを外した既存名の **先頭 or 末尾に候補が丸ごと一致**すること（部分一致ではない）
     ・残りが 1〜6 文字（姓 or 名の側として妥当な長さ）
     ・cast 全体で **一意**なときだけ返す（「霧 涼太」と「霧 悠真」に対する「霧」は返さない）
     新しい辞書も新しい正規化も作らない。 */
  var SEP_RE = /[\s\u3000・]/;
  var SEP_G  = /[\s\u3000・]/g;
  function partHit(cand, full){
    var c = norm(cand), f = norm(full);
    if (!c || !f || c === f) return false;
    if (!SEP_RE.test(f)) return false;                  /* 区切りの無い名前は対象外 */
    var flat = f.replace(SEP_G, '');
    if (flat.length <= c.length) return false;
    var rest = flat.length - c.length;
    if (rest < 1 || rest > 6) return false;
    if (flat.slice(0, c.length) === c) return true;     /* 先頭パート（アリア・リュミエール → アリア） */
    if (flat.slice(flat.length - c.length) === c) return true;  /* 末尾パート（鷺沼 朔 → 朔） */
    return false;
  }
  /* 一意に決まる既存名だけを返す。決まらなければ ''（＝呼び手は従来動作へ） */
  function partMatch(name, existingNames){
    if (off()) return '';
    var n = norm(name), names = uniqNames(existingNames), hits = [], i;
    if (!n || !names.length) return '';
    for (i = 0; i < names.length; i++){ if (names[i] === n) return ''; }   /* 完全一致は EXACT の領分 */
    for (i = 0; i < names.length; i++){ if (partHit(n, names[i])) hits.push(names[i]); }
    return (hits.length === 1) ? hits[0] : '';
  }

  /* ---- 本体: 強さつきの解決 ----
     opts.noFold  … true なら fold 段を飛ばす（呼び手が異体字統合を望まない場合）
     opts.noAlias … true なら別名段を飛ばす
     opts.noPartial … true なら LEGACY_PARTIAL の分類もしない（分類コスト削減用）        */
  function resolve(name, existingNames, opts){
    opts = opts || {};
    var n = norm(name);
    var names = uniqNames(existingNames);
    if (off()) return res(KIND.NO_MATCH, null, { why: 'off' });
    if (!n || !names.length) return res(KIND.NO_MATCH, null, { why: !n ? 'empty-name' : 'no-existing' });

    var i;

    /* ① 生文字列の完全一致 */
    for (i = 0; i < names.length; i++){ if (names[i] === n) return res(KIND.EXACT, names[i]); }

    /* ② 作者が明示した別名（fix277 aliasMap）。解決先が既存に無ければ採用しない。 */
    if (!opts.noAlias){
      var af = aliasFn();
      if (af){
        var target = '';
        try { target = norm(af(n)); } catch(e){ target = ''; }
        if (target && target !== n){
          var hitsA = [];
          for (i = 0; i < names.length; i++){ if (names[i] === target) hitsA.push(names[i]); }
          if (hitsA.length === 1) return res(KIND.ALIAS_EXACT, hitsA[0]);
          if (hitsA.length > 1) return res(KIND.NO_MATCH, null, { ambiguous: true, why: 'alias-ambiguous', candidates: hitsA.slice(0, 4) });
          /* 解決先が既存名に無い＝この場では判断材料にしない（fail-closed。新しい merge は作らない） */
        }
      }
    }

    /* ③ 異体字フォールド（比較のときだけ）。**2 人以上に当たったら fail-closed** */
    if (!opts.noFold){
      var f = f764();
      if (f){
        var hitsF = [];
        for (i = 0; i < names.length; i++){
          var ok = false;
          try { ok = (f.same(n, names[i]) === true); } catch(e){ ok = false; }
          if (ok) hitsF.push(names[i]);
        }
        if (hitsF.length === 1) return res(KIND.FOLDED_EXACT, hitsF[0]);
        if (hitsF.length > 1) return res(KIND.NO_MATCH, null, { ambiguous: true, why: 'fold-ambiguous', candidates: hitsF.slice(0, 4) });
      }
    }

    /* ④ PART_EXACT（区切り付き名前の丸ごと 1 パート・一意）。**自動 merge には使わない**（分類のみ） */
    if (!opts.noPartial){
      var pm = partMatch(n, names);
      if (pm) return res(KIND.PART_EXACT, pm, { autoMergeAllowed: false });
    }

    /* ⑤ 従来の部分一致は **分類だけ**。自動 merge には使わせない（裁定 74） */
    if (!opts.noPartial){
      var f4 = f445();
      if (f4){
        var m = '';
        try { m = norm(f4.castMatch(n, names)); } catch(e){ m = ''; }
        if (m) return res(KIND.LEGACY_PARTIAL, m, { autoMergeAllowed: false });
      }
    }

    return res(KIND.NO_MATCH, null);
  }

  /* 自動 merge に使ってよい強さか */
  function canAutoMerge(kind){
    for (var i = 0; i < AUTO_MERGE_KINDS.length; i++){ if (AUTO_MERGE_KINDS[i] === kind) return true; }
    return false;
  }

  /* 呼び手が一番欲しい形: 「自動 merge してよい既存名」だけを返す。無ければ '' */
  function autoMatch(name, existingNames, opts){
    var r = resolve(name, existingNames, opts);
    return canAutoMerge(r.kind) ? (r.matched || '') : '';
  }

  window.__v292Dfix830 = {
    version: VERSION,
    KIND: KIND, AUTO_MERGE_KINDS: AUTO_MERGE_KINDS.slice(),
    norm: norm, resolve: resolve, autoMatch: autoMatch, canAutoMerge: canAutoMerge,
    partMatch: partMatch, partHit: partHit,
    state: function(){
      return { off: off(), fold764: !!f764(), alias: !!aliasFn(), partial: !!f445(),
               fold764Off: lsg('v292Dfix764Off') === '1', aliasOff: lsg('v292AliasOff') === '1' };
    }
  };
  try { console.log(TAG, 'loaded (read-time resolver; auto-merge = EXACT / ALIAS_EXACT / FOLDED_EXACT only)'); } catch(e){}
})();
