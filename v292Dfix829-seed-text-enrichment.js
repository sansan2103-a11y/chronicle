// =====================================================================
// Chronicle TRPG - v292Dfix829: SEED_TEXT_ENRICHMENT_V1（home 専用・engine only / DOM 0）
// ---------------------------------------------------------------------
// GPT 裁定 58 (DESIGN_PASS_WITH_REVISIONS) ＋ 裁定 71 (GO IMPLEMENT TO PRODUCTION)
//
// ■ これは何か
//   Scenario Original の **短いキャラ設定 seed に「続き」を 1 行足す**だけの薄いアダプタ。
//   fix823（空欄補完）とは対象が正反対: fix823 = 空欄を埋める / fix829 = **非空**の短い seed に append する。
//   生成 engine は作らない。transport / parser / 値正規化は fix436 の公開 pure 関数 3 本だけを再利用する。
//
// ■ 契約（1 つでも破ったら実装ミス）
//   REUSE            … fix436 の request / parseFillJson / normVal の 3 本のみ。
//                      buildFillPrompt / applyFill は「空欄にだけ書く」前提で正反対なので **使わない**。
//   TARGETS          … hero.desc / npc[].desc / npc[].personality / npc[].coreDesire / npc[].coreFear / npc[].wound
//                      name / gender / scene / startCondition / startRules は **write 0**（gender は context 参照のみ）。
//   ELIGIBLE         … target field のうち **1〜24 code points**（非空かつ短い）だけ。空欄は fix823 の領分。
//                      24cp は「UI が提案してよい」条件であって **AI call の自動発火条件ではない**（呼ぶのは caller = Owner 操作のみ）。
//   SEPARATOR        … ENRICHMENT_SEPARATOR_V1 = 改行 1 個。AUTO_PUNCTUATION_REPAIR = NO。
//                      既存 seed は **raw のまま byte 保持**（trim もしない）。append-only。
//   LENGTH           … per field <= 120cp（超過 = その field を REJECT。truncate 禁止）
//                      per character 合計 <= 300cp（超過 = **その character の候補ごと reject**。
//                      truncate も「どの field を落とすか」の恣意的間引きも禁止 = 裁定 71）
//   DUPLICATION      … 正規化後に addendum === seed / addendum.startsWith(seed) は reject。
//                      seed が 12cp 以上のときだけ完全包含も reject。短い seed の語彙重複は reject しない。
//                      新しい意味類似判定は作らない。LLM に同義判定させない。
//   CALLS            … 1 character = ちょうど 1 call・直列（hero → npc1 → npc2 …）。
//                      field 単位の失敗 → その field だけ落として続行。
//                      call 全体の失敗（network / transport / timeout / JSON parse / shape 不正）→ **後続 call を STOP**。
//                      成功済み候補は保持。**auto retry 0**。
//   ATOMICITY        … 入力 draft を mutation 0（自己検査あり）。Store / Story / cloud / LS / DOM への書込 0。
//                      候補適用は draft 全置換ではなく **対象 field への差分 append**（applyCandidates）。
//   STALE GUARD      … adoption 側（fix825）で draftRevision を照合する。ここは pure なので判定材料だけ返す。
//
// 検証口: window.__v292Dfix829 = { cpLen, normCmp, dupReject, eligible, offerCount, buildPrompt,
//                                  validateCandidate, applyCandidates, enrich, transportAvailable, state }
// kill: localStorage v292Dfix829Off='1' → enrich が即 {ok:false, code:'OFF'}。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix829) return;
  var TAG = '[v292Dfix829:seed-text-enrichment]';
  var VERSION = 'v292Dfix829-20260907-enrich-v1';

  var SEPARATOR      = '\n';   /* ENRICHMENT_SEPARATOR_V1（裁定 58） */
  var MAX_FIELD_CP   = 120;    /* MAX_ENRICH_ADDENDUM_PER_FIELD */
  var MAX_CHAR_CP    = 300;    /* MAX_ENRICH_ADDENDUM_PER_CHARACTER */
  var OFFER_MAX_CP   = 24;     /* eligible 上限（UI offer 条件でもある） */
  var DUP_CONTAIN_CP = 12;     /* この長さ以上の seed だけ「完全包含」も reject */
  var TARGET_TEXT    = '40〜80';  /* 生成目標（安全契約は 120/300） */

  var HERO_FIELDS = ['desc'];
  var NPC_FIELDS  = ['desc', 'personality', 'coreDesire', 'coreFear', 'wound'];
  var LABEL = { desc: '外見・立場', personality: '性格特性', coreDesire: '核心的欲求', coreFear: '核心的恐怖', wound: '傷・過去' };
  var HERO_LABEL = { desc: '説明（性格・外見・立場）' };

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix829Off') === '1'; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
  function f436(){ return window.__v292Dfix436 || null; }
  function fail(code, detail){ var r = { ok: false, code: code }; if (detail !== undefined) r.detail = detail; return r; }

  /* code point 長（SQLite の length() と同じ数え方。JS の .length は UTF-16 単位なので使わない） */
  function cpLen(s){
    s = str(s); var n = 0, i = 0, c;
    while (i < s.length){ c = s.charCodeAt(i); i += (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) ? 2 : 1; n++; }
    return n;
  }
  /* 重複判定「だけ」に使う正規化（保存する値には絶対に使わない）。
     既存の trim / 空白畳み込みだけ。新しい意味類似判定は作らない（裁定 58）。 */
  function normCmp(s){ return trim(str(s).replace(/\s+/g, ' ')); }

  /* ADDENDUM_CONTAINS_ORIGINAL の 3 段（裁定 58）。null = reject しない */
  function dupReject(seed, add){
    var s = normCmp(seed), a = normCmp(add);
    if (!s || !a) return null;
    if (a === s) return 'DUP_EQUAL';
    if (a.indexOf(s) === 0) return 'DUP_PREFIX';
    if (cpLen(s) >= DUP_CONTAIN_CP && a.indexOf(s) >= 0) return 'DUP_CONTAINED';
    return null;                     /* 短い seed の単純な語彙重複だけでは落とさない */
  }

  /* ---- draft の形を壊さず読む（fix825 の draft = fix820 の入力 shape） ---- */
  function nz(d){
    var s = isObj(d) ? d : {};
    var sc = isObj(s.scene) ? s.scene : {};
    var ca = isObj(s.cast) ? s.cast : {};
    var he = isObj(ca.hero) ? ca.hero : {};
    var np = isArr(ca.npcs) ? ca.npcs : [];
    return { title: str(s.title), scene: sc, hero: he, npcs: np,
             startCondition: str(s.startCondition), startRules: str(s.startRules) };
  }

  /* ---- ① eligible: 1..24cp の target field を持つキャラを順番に列挙 ---- */
  function eligible(draft){
    var s = nz(draft), out = [], i, k, v, fields, fieldSet, paths, labels, n;

    function pick(kind, idx, src, list, labelMap, pathPrefix){
      fields = {}; fieldSet = {}; paths = {}; labels = {}; n = 0;
      for (k = 0; k < list.length; k++){
        var f = list[k], raw = str(src[f]), cp = cpLen(trim(raw));
        if (cp >= 1 && cp <= OFFER_MAX_CP){
          fields[f] = raw; fieldSet[f] = true; paths[f] = pathPrefix + f; labels[f] = labelMap[f] || f; n++;
        }
      }
      if (!n) return null;
      var nm = trim(src.name);
      return { key: (kind === 'hero') ? 'hero' : ('npc' + idx), kind: kind, index: idx,
               name: nm, gender: trim(src.gender),
               label: (kind === 'hero') ? ('主人公' + (nm ? '：' + nm : '')) : ('NPC ' + (idx + 1) + (nm ? '：' + nm : '')),
               fields: fields, fieldSet: fieldSet, paths: paths, labels: labels, count: n };
    }

    var h = pick('hero', 0, s.hero, HERO_FIELDS, HERO_LABEL, 'cast.hero.');
    if (h) out.push(h);
    for (i = 0; i < s.npcs.length; i++){
      var c = pick('npc', i, isObj(s.npcs[i]) ? s.npcs[i] : {}, NPC_FIELDS, LABEL, 'cast.npcs.' + i + '.');
      if (c) out.push(c);
    }
    return out;
  }
  /* offer count = eligible field の総数（hero.desc を含む・gender は対象外） */
  function offerCount(draft){
    var cs = eligible(draft), n = 0;
    for (var i = 0; i < cs.length; i++) n += cs[i].count;
    return n;
  }

  /* ---- ② prompt（enrich 専用。buildFillPrompt は使わない） ---- */
  function ctxLine(label, v){ v = trim(v); return v ? ('- ' + label + '：' + v + '\n') : ''; }
  function buildPrompt(draft, c){
    var s = nz(draft), i, k;
    var ctx = '';
    ctx += ctxLine('世界観', s.scene.lore);
    ctx += ctxLine('現在の場所', s.scene.loc);
    ctx += ctxLine('物語の前提・目的', s.scene.obj);
    ctx += ctxLine('文体・雰囲気', s.scene.tone);

    var who = '', src = (c.kind === 'hero') ? s.hero : (s.npcs[c.index] || {});
    var listAll = (c.kind === 'hero') ? HERO_FIELDS : NPC_FIELDS;
    who += ctxLine('名前', src.name);
    who += ctxLine('性別', src.gender);
    for (i = 0; i < listAll.length; i++){
      var f = listAll[i], lm = (c.kind === 'hero') ? HERO_LABEL : LABEL;
      who += ctxLine(lm[f] || f, src[f]);
    }

    var keys = [], desc = '';
    for (k in c.fieldSet){ if (has(c.fieldSet, k)) keys.push(k); }
    for (i = 0; i < keys.length; i++){
      desc += '- "' + keys[i] + '"（' + (c.labels[keys[i]] || keys[i]) + '）… 今の記述:「' + trim(c.fields[keys[i]]) + '」\n';
    }

    var sys = '' +
      'あなたは日本語のTRPGシナリオ制作を手伝う編集者です。\n' +
      '与えられた登場人物の「すでに書かれている短い設定」に、**続きとして書き足す文だけ**を作ります。\n' +
      '厳守事項:\n' +
      '1. すでに書かれている内容を**繰り返さない・言い換えない・書き直さない**。追記する部分だけを出力する。\n' +
      '2. 既存の設定と矛盾しないこと。名前・性別は変えないし、出力にも含めない。\n' +
      '3. 各項目 ' + TARGET_TEXT + ' 文字程度。どの項目も 120 文字を超えないこと。\n' +
      '4. 出力は JSON オブジェクト 1 個だけ。説明文・前置き・コードフェンスを付けない。\n' +
      '5. 指定されたキーだけを使う。書けない項目はキーごと省略する（「なし」と書かない）。\n' +
      '6. 入れ子にしない（トップレベルにキーを並べる）。';

    var user = '' +
      '## 物語の確定情報（変更しない）\n' + (ctx || '- （未設定）\n') +
      (trim(s.startRules) ? '\n## 作者が定めた開始ルール（変更・転記しない。矛盾しない追記をする）\n' + trim(s.startRules) + '\n' : '') +
      '\n## 対象の登場人物（' + c.label + '）\n' + (who || '- （未設定）\n') +
      '\n## 書き足してほしい項目\n' + desc +
      '\n上の各キーについて、**今の記述の続きになる文だけ**を値にした JSON を返してください。\n' +
      '例: {"' + (keys[0] || 'desc') + '":"（ここに続きの文）"}';

    return { sys: sys, user: user, keys: keys };
  }

  /* ---- ③ 1 call 分の応答を検査（field 単位 reject / character 単位 reject） ---- */
  function validateCandidate(c, json, F){
    F = F || f436();
    if (!F || typeof F.normVal !== 'function') return fail('FIX436_UNAVAILABLE');
    if (!isObj(json)) return { ok: false, code: 'SHAPE_INVALID', callLevel: true };
    var addenda = {}, rejected = [], unknown = [], known = 0, total = 0, count = 0, k;
    for (k in json){
      if (!has(json, k)) continue;
      if (!has(c.fieldSet, k)){ unknown.push(k); continue; }   /* 対象外 field への write は構造的に不可能 */
      known++;
      var raw = json[k];
      if (typeof raw !== 'string' && typeof raw !== 'number'){ rejected.push({ field: k, code: 'NOT_TEXT' }); continue; }
      /* normVal 再利用: trim / 端の引用符除去 / 「なし・未定・不明…」→ '' 。
         normVal は 400 **UTF-16 単位**で切るが、切られた値は必ず 200cp 以上になり下の 120cp で必ず落ちるので、
         silent truncation がこの経路を通り抜けることはない。 */
      var n = F.normVal(raw);
      if (!n){ rejected.push({ field: k, code: 'EMPTY' }); continue; }
      var cp = cpLen(n);
      if (cp > MAX_FIELD_CP){ rejected.push({ field: k, code: 'FIELD_TOO_LONG', cp: cp }); continue; }   /* truncate しない */
      var d = dupReject(c.fields[k], n);
      if (d){ rejected.push({ field: k, code: d }); continue; }
      addenda[k] = n; total += cp; count++;
    }
    if (known === 0) return { ok: false, code: 'SHAPE_INVALID', callLevel: true, unknown: unknown, rejected: rejected };
    if (count === 0) return { ok: false, code: 'NOTHING_APPLIED', unknown: unknown, rejected: rejected, totalCp: 0 };
    /* 裁定 71: 合計超過は character 候補ごと reject。truncate も恣意的な間引きもしない */
    if (total > MAX_CHAR_CP) return { ok: false, code: 'CHARACTER_TOTAL_EXCEEDED', unknown: unknown, rejected: rejected, totalCp: total };
    return { ok: true, addenda: addenda, unknown: unknown, rejected: rejected, totalCp: total, count: count };
  }

  /* ---- ④ 候補適用: 対象 field への差分 append（draft 全置換ではない） ---- */
  function applyCandidates(draft, candidates){
    var d = clone(draft), i, k, cand, tgt;
    if (!isArr(candidates)) return d;
    for (i = 0; i < candidates.length; i++){
      cand = candidates[i];
      if (!cand || !isObj(cand.addenda)) continue;
      if (cand.kind === 'hero'){ tgt = d.cast && d.cast.hero; }
      else { tgt = (d.cast && isArr(d.cast.npcs)) ? d.cast.npcs[cand.index] : null; }
      if (!isObj(tgt)) continue;
      for (k in cand.addenda){
        if (!has(cand.addenda, k)) continue;
        var seed = str(tgt[k]);
        if (!trim(seed)) continue;                      /* seed が消えていたら append しない（fail-closed） */
        tgt[k] = seed + SEPARATOR + cand.addenda[k];    /* ★既存 seed は raw のまま。句読点補完 0 */
      }
    }
    return d;
  }

  /* ---- transport（fix823 と同じく実 fix247 runtime authority のみ） ---- */
  function transportAvailable(){
    try {
      var p = window.__v292Dfix247;
      if (!p || typeof p !== 'object') return false;
      if (typeof p.on === 'function') return p.on() === true;
      if (typeof p.state === 'function'){ var st = p.state(); return !!(st && st.on === true); }
      return false;
    } catch(e){ return false; }
  }

  /* ---- ⑤ enrich: eligible なキャラを 1 人 1 call で直列に。保存しない ---- */
  function enrich(draft, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = {}; }
    opts = opts || {}; cb = cb || function(){};
    if (off()) return cb(fail('OFF'));
    var F = f436();
    if (!F || typeof F.request !== 'function' || typeof F.parseFillJson !== 'function' || typeof F.normVal !== 'function') return cb(fail('FIX436_UNAVAILABLE'));
    if (!transportAvailable()) return cb(fail('AI_UNAVAILABLE'));
    if (!isObj(draft)) return cb(fail('NO_DRAFT'));

    var baseStr = JSON.stringify(draft);
    var base = clone(draft);
    var chars = eligible(base);
    /* opts.only = 'hero' | 'npc0' … character card のボタン用（1 人だけ = 1 call）。
       未指定なら eligible な全員を hero → npc1 → npc2 の順で直列。 */
    if (opts.only){
      var onlyKey = str(opts.only), kept = [];
      for (var y = 0; y < chars.length; y++){ if (chars[y].key === onlyKey) kept.push(chars[y]); }
      if (!kept.length) return cb({ ok: true, noTargets: true, candidates: [], report: { calls: 0, eligibleChars: 0, eligibleFields: 0, perChar: [], stopped: null, only: onlyKey } });
      chars = kept;
    }
    var report = { calls: 0, eligibleChars: chars.length, eligibleFields: 0, perChar: [], stopped: null, only: opts.only || null };
    for (var z = 0; z < chars.length; z++) report.eligibleFields += chars[z].count;
    if (!chars.length) return cb({ ok: true, noTargets: true, candidates: [], report: report });

    var out = [], i = 0;

    function finish(){
      if (JSON.stringify(draft) !== baseStr) return cb(fail('BASE_MUTATED'));   /* 入力を汚していないことの自己検査 */
      return cb({ ok: true, candidates: out, report: report, stopped: report.stopped });
    }

    (function next(){
      if (i >= chars.length) return finish();
      var c = chars[i++];
      var p = buildPrompt(base, c);
      report.calls++;                                     /* 1 character = ちょうど 1 call */
      var done = false;
      F.request({ sys: p.sys, user: p.user }, function(err, txt){
        if (done) return; done = true;                    /* auto retry 0 */
        if (err){ report.stopped = { at: c.key, code: 'AI_FAILED', detail: (err && err.message) || null }; return finish(); }
        var json = F.parseFillJson(txt);
        if (!json){ report.stopped = { at: c.key, code: 'BAD_JSON' }; return finish(); }
        var v = validateCandidate(c, json, F);
        report.perChar.push({ key: c.key, label: c.label, code: v.ok ? null : v.code,
                              accepted: v.ok ? Object.keys(v.addenda) : [],
                              rejected: v.rejected || [], unknown: v.unknown || [], totalCp: v.totalCp || 0 });
        if (v.ok){
          out.push({ key: c.key, kind: c.kind, index: c.index, label: c.label,
                     addenda: v.addenda, seeds: c.fields, labels: c.labels, paths: c.paths, totalCp: v.totalCp });
        } else if (v.callLevel){
          report.stopped = { at: c.key, code: v.code };   /* shape 不正 = call 全体の失敗 → 後続 STOP */
          return finish();
        }
        return next();                                    /* field / character 単位の reject は続行 */
      });
    })();
  }

  window.__v292Dfix829 = {
    version: VERSION,
    SEPARATOR: SEPARATOR, MAX_FIELD_CP: MAX_FIELD_CP, MAX_CHAR_CP: MAX_CHAR_CP,
    OFFER_MAX_CP: OFFER_MAX_CP, DUP_CONTAIN_CP: DUP_CONTAIN_CP,
    HERO_FIELDS: HERO_FIELDS, NPC_FIELDS: NPC_FIELDS, LABEL: LABEL, HERO_LABEL: HERO_LABEL,
    cpLen: cpLen, normCmp: normCmp, dupReject: dupReject,
    eligible: eligible, offerCount: offerCount, buildPrompt: buildPrompt,
    validateCandidate: validateCandidate, applyCandidates: applyCandidates,
    transportAvailable: transportAvailable, enrich: enrich,
    state: function(){ return { off: off(), fix436: !!f436(), fix436Request: !!(f436() && f436().request), transport: transportAvailable(), uiWired: false }; }
  };
  try { console.log(TAG, 'loaded (engine only; caller = fix825)'); } catch(e){}
})();
