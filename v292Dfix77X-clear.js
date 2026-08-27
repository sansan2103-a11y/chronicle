// =====================================================================
// Chronicle TRPG - v292Dfix77X: 明示的な傷の解除（D1 CLEAR）
// ---------------------------------------------------------------------
// 背景（R118F・実測）:
//   ・engineMode 0/1 いずれの <state> 契約にも「治った傷を解除する」構文が存在しない
//     （RECOVERY_CLEAR_SYNTAX_ABSENT）。
//   ・そのためモデルは非空文字列で疑似CLEARを表現する
//     （NONEMPTY_NO_INJURY_SENTINEL_EMULATION: 「なし（治癒済み）」「…（完治）」を実測）。
//   ・回復を明示した4turnで、対象の傷を正しく解除できた例は 0/4
//     （TARGETED_RECOVERY_RECONCILIATION_FAILURE = 4/4。3/4 は無関係な傷への全置換）。
//
// 方針（GPT裁定 RULING118F-D2-PROBE-V3 の G1〜G7）:
//   G1 新規属性は 傷解消="部位" の1つだけ。傷変化・新schema・空文字CLEAR・sentinel権限は禁止。
//   G2 傷解消は「解除の意図」であって substring 削除命令ではない。
//      自由記述kizuを句読点で一般分割するclaim parserを作らない。
//   G3 決定論的 mutation table。誤clear 0 を coverage より優先。
//      安全に一意識別できないなら mutation 0（staleを残す方が別の傷を消すより安全）。
//   G5 専用flag・既定OFF・OFF時は1バイトも変えない（byte-inert）。
//   G6 書き込みは既存の guarded commit（fix77 の fix532 guard 経由）だけを使う。
//   G7 scope != claim identity。fix414 の既存部位語彙を再利用するが医学オントロジー化しない。
//
// flag: localStorage v292Dfix77XClear='1'（既定OFF）。OFFなら契約文言もparse分岐も出ない。
// 検証口: window.__v292Dfix77XClear = { status, decide, telemetry }
// 新persistent schema なし（kizu は従来どおり単一文字列）。migration なし。
// =====================================================================
(function v292Dfix77XClear(){
  'use strict';
  if (window.__v292Dfix77XClear) return;
  var TAG = '[v292Dfix77X:clear]';
  var ATTR = '傷解消';
  var MARK = '傷解消="';                    // sys への冪等マーカー

  function on(){ try { return localStorage.getItem('v292Dfix77XClear') === '1'; } catch(e){ return false; } }

  // ---- G7: scope 認識は fix414 の既存語彙のみ（拡張しない＝認識不能はfail-closed） ----
  var ARM_RE = '(左|右|両)?(腕|手首|手|拳|肘)';
  var LEG_RE = '(左|右|両)?(太もも|ふくらはぎ|足首|脚|足|膝)';
  function normScope(s){
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var m = new RegExp('^' + ARM_RE + '$').exec(s) || new RegExp('^' + LEG_RE + '$').exec(s);
    return m ? s : null;                     // 完全一致のみ。部分一致で拾わない
  }
  /** oldKizu 内に scope が「認識可能な部位表記」として何回現れるか。
   *  claim 数ではなく recognized scope occurrence を数える（裁定 Q4）。 */
  function occurrences(text, scope){
    var n = 0, i = 0, t = String(text == null ? '' : text);
    while (true){ var k = t.indexOf(scope, i); if (k < 0) break; n++; i = k + scope.length; }
    return n;
  }
  /** oldKizu 内に「対象 scope 以外の部位」が認識できるか（= mixed state か） */
  function otherScopesPresent(text, scope){
    var t = String(text == null ? '' : text), found = false;
    [ARM_RE, LEG_RE].forEach(function(src){
      var re = new RegExp(src, 'g'), m;
      while ((m = re.exec(t)) !== null){
        var part = (m[1] || '') + m[2];
        if (part !== scope) found = true;
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    return found;
  }

  /* ★TARGET_FIELD_EXCLUSIVITY_PROVEN（RULING118F-D1-IMPLEMENTED Q1）
     「他 scope が検出されない」だけでは mutation を許さない。
     kizu field 全体を target impairment として安全に扱えることを積極的に証明する。
     例: 「右腕断裂・大量出血・意識混濁」は recognized scope が右腕だけでも、
        whole-field CLEAR は 大量出血・意識混濁 まで巻き添えにする
        （UNSCOPED_COIMPAIRMENT_ERASURE_RISK）。
     方針: generic claim splitter / medical ontology を作らない。
        「区切りで分かれた各セグメントが、すべて target scope に言及している」ときだけ
        exclusivity を証明できたとみなす。証明できない文字列は単純に拒否（fail-closed）。 */
  var SEP_RE = /[、,。．・／\/\n]+/;
  var CLAIM_SEP_RE = /[、,。．・\n]/;            // / を含まない（claim境界の判定用）
  /* ★fix190 公式 single-claim 形式の判定（RULING118F-D1-PARSER-AND-RELEASE Q1）
     fix190 契約: 傷="部位・重症度・原因" 例) 左眼球摘出(重傷)/妖怪/未治療
     この / は claim boundary ではなく claim 内 metadata delimiter。
     ただし「/ を常に無視する」実装は禁止された。公式形と認識できた時だけ metadata 扱いにし、
     形が不明な自由記述で / が出た場合は従来どおり fail-closed とする。
     公式形の条件（保守的）:
       ・claim 境界文字（、。・改行等）を含まない
       ・/ 区切りが 2〜3 セグメント
       ・先頭セグメントに target scope を含む
       ・後続セグメント（原因・処置など）に解剖学的 scope 語彙が一切現れない
     いずれか外れたら OFFICIAL_SINGLE_CLAIM_FORMAT_MATCH = FALSE。 */
  function anatomicalScopesIn(text){
    var t = String(text == null ? '' : text), out = [];
    [ARM_RE, LEG_RE].forEach(function(src){
      var re = new RegExp(src, 'g'), m;
      while ((m = re.exec(t)) !== null){ out.push((m[1] || '') + m[2]); if (re.lastIndex === m.index) re.lastIndex++; }
    });
    return out;
  }
  function officialSingleClaimFormat(text, scope){
    var t = String(text == null ? '' : text).trim();
    if (!t || t.indexOf('/') < 0 && t.indexOf('／') < 0) return false;
    if (CLAIM_SEP_RE.test(t)) return false;                    // 他の claim 境界が混在
    var parts = t.split(/[／\/]/).map(function(x){ return String(x || '').trim(); })
                 .filter(function(x){ return x.length > 0; });
    if (parts.length < 2 || parts.length > 3) return false;    // 公式は 部位・重症度・原因
    if (parts[0].indexOf(scope) < 0) return false;             // 先頭が対象部位でない
    for (var i = 1; i < parts.length; i++){
      if (anatomicalScopesIn(parts[i]).length > 0) return false; // 後続が別の傷を含む
    }
    return true;
  }
  function exclusivityProven(text, scope){
    var t = String(text == null ? '' : text).trim();
    if (!t) return false;
    if (officialSingleClaimFormat(t, scope)) return true;      // 公式形＝単一claimとして評価可
    var segs = t.split(SEP_RE).map(function(x){ return String(x || '').trim(); })
                .filter(function(x){ return x.length > 0; });
    if (!segs.length) return false;
    /* 区切りは claim 境界の authority ではなく、
       「巻き添えになり得る独立記述が混ざっていないか」を保守的に見るためだけに使う。 */
    for (var i = 0; i < segs.length; i++){
      if (segs[i].indexOf(scope) < 0) return false;   // target に言及しないセグメントがある = 証明不能
    }
    return true;
  }

  var tel = { NO_TARGET: 0, SCOPE_UNRECOGNIZED: 0, AMBIGUOUS_TARGET: 0, RETENTION_RISK: 0,
              EMPTY_IGNORED: 0, CLEARED: 0, REPLACED: 0 };

  /** G3 決定論表。純関数。storeを触らず「何をすべきか」だけ返す（テスト可能にするため）。 */
  function decide(oldKizu, scopeRaw, newKizu){
    var hasDirective = scopeRaw != null;
    if (!hasDirective) return { action: 'PASSTHROUGH', reason: 'NO_DIRECTIVE' };
    var raw = String(scopeRaw).trim();
    if (!raw) return { action: 'NOOP', reason: 'EMPTY_IGNORED' };            // 傷解消="" は no-op
    var scope = normScope(raw);
    if (!scope) return { action: 'NOOP', reason: 'SCOPE_UNRECOGNIZED' };     // fail-closed
    var old = String(oldKizu == null ? '' : oldKizu);
    var hits = occurrences(old, scope);
    if (hits === 0) return { action: 'NOOP', reason: 'NO_TARGET' };          // 重複CLEAR=idempotent
    if (hits > 1)  return { action: 'NOOP', reason: 'AMBIGUOUS_TARGET' };    // fail-closed
    if (otherScopesPresent(old, scope))
      return { action: 'NOOP', reason: 'RETENTION_RISK' };                   // 別の部位の傷を消さない
    /* ★hard gate: 他 scope 不在だけでは不十分。field 全体の exclusivity を証明する。 */
    if (!exclusivityProven(old, scope))
      return { action: 'NOOP', reason: 'RETENTION_RISK' };                   // 無scope併存症状の巻き添え防止
    var nk = (newKizu == null) ? '' : String(newKizu).trim();
    if (nk) return { action: 'REPLACE', value: nk, reason: 'PARTIAL_RECOVERY' };
    return { action: 'CLEAR', reason: 'FULL_RECOVERY' };
  }

  /* ---- 契約の配置（DELIVERY FIX / RULING118F-D1-EMISSION STEP1 CASE A） ----
     実測(R118F_D1_DELIVERY_TRACE_LIVE): 最終 sys の <state> 見本は3つあり、そのいずれにも
     傷解消 が無かった（傷 は在る）。fix192 は「見本ドリブン」設計のため、schema/見本/allowed
     field list に無い属性は出力候補として選ばれない。
     配置先は v292Dfix192-newengine.js の正準属性仕様行（= allowed field list 本体）。
     同じ flag(v292Dfix77XClear) で gate してあり、OFF なら sys は1バイトも変わらない。
     ここで Planner.build を wrap しないのは、他モジュールの再装着と競合して注入が
     取り消される事象を実測したため（2026-08-27）。契約の配置は定義箇所で行う。 */
  var deliveredVia = 'SCHEMA_FIELD_LIST@fix192';

  // ---- parse: <state> の 傷解消 を読み、guarded commit だけで書く ----
  function attrOf(tag, name){
    try { var m = String(tag).match(new RegExp(name + '\\s*=\\s*"([^"]*)"')); return m ? m[1].trim() : null; }
    catch(e){ return null; }
  }
  function captureClear(plan, ctx){
    try {
      if (!on()) return plan;                                   // OFF: 完全に素通り
      var raw = (ctx && typeof ctx.raw === 'string') ? ctx.raw : '';
      if (!raw || raw.indexOf(ATTR) < 0) return plan;
      var store = window.__v292Dfix77Store; if (!store) return plan;
      var commit = window.__v292Dfix77Commit;                    // G6: guarded commit のみ
      if (typeof commit !== 'function') return plan;             // 不在なら書かない(fail-closed)
      var re = /<state\b[^>]*?\/?>/g, m, changed = 0;
      while ((m = re.exec(raw)) !== null){
        var tag = m[0], who = attrOf(tag, 'who'); if (!who) continue;
        var scope = attrOf(tag, ATTR); if (scope == null) continue;
        var cur = store[who] || {};
        var d = decide(cur.kizu, scope, attrOf(tag, '傷'));
        tel[d.reason] = (tel[d.reason] || 0) + 1;
        if (d.action === 'CLEAR')      { delete cur.kizu; store[who] = cur; changed++; tel.CLEARED++; }
        else if (d.action === 'REPLACE'){ cur.kizu = d.value; store[who] = cur; changed++; tel.REPLACED++; }
        // NOOP / PASSTHROUGH は何も書かない
      }
      if (changed) commit(store);
    } catch(e){ try { console.warn(TAG, e && e.message); } catch(_){} }
    return plan;
  }
  captureClear.__v292Dfix77X = true;

  function install(){
    try {
      var P = window.Planner || (0,eval)('typeof Planner!=="undefined"?Planner:null');
      if (!P) { setTimeout(install, 250); return; }
      P._parseExtensions = P._parseExtensions || [];
      if (!P._parseExtensions.some(function(f){ return f && f.__v292Dfix77X; })) P._parseExtensions.push(captureClear);
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  setTimeout(install, 500); setTimeout(install, 2000);

  window.__v292Dfix77XClear = {
    on: on, decide: decide, normScope: normScope, exclusivityProven: exclusivityProven,
    officialSingleClaimFormat: officialSingleClaimFormat,
    telemetry: function(){ var o = {}; for (var k in tel) o[k] = tel[k]; return o; },
    status: function(){ return { on: on(), attr: ATTR, installed: true, deliveredVia: deliveredVia }; }
  };
  try { console.log(TAG, 'loaded (off by default)'); } catch(_){}
})();
