/* ============================================================================
 * v292Dfix741 — Severity Consequence Lane (Phase2-S)
 *
 * RULING118P2S_V0 / RULING118-P1R FINAL 準拠。
 * fix414 の deriveConstraints から 1 行のフックで呼ばれる外部レーン。
 *
 * 設計:
 *   外傷語辞書ではなく severity consequence closed mapping。
 *   「重篤であること自体を示す語」を要求し、最小限の帰結だけを課す。
 *
 * 不変条件:
 *   DERIVED_CONSTRAINT_SCOPE_MUST_NOT_EXCEED_SEVERITY_EVIDENCE
 *   CRITICAL_HEMORRHAGE_REQUIRES_CRITICALITY_EVIDENCE
 *   SEVERITY_S_RECOVERY_GUARD = CLASS_LOCAL
 *   UNCONSCIOUS_STATE = DEFERRED / DO NOT MAP TO MERE COGNITION REDUCTION
 *
 * flags:
 *   v292Dfix414SeverityS = '1'  → ON   （unset / '0' → OFF。既定 OFF）
 *   v292Dfix741Off       = '1'  → この file 自体を完全無効化（kill switch）
 *
 * 副作用:
 *   localStorage 書き込み 0 / network 0 / DOM 0 / 既存 fix 変更 0
 *   fix414 側の変更は hook 1 行のみ。hook は本 file 未 load 時 no-op。
 * ==========================================================================*/
(function () {
  'use strict';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (lsGet('v292Dfix741Off') === '1') return;          // kill switch
  if (window.__v292Dfix741) return;                     // install 重複防止

  var PAST_ONLY = /(な(かっ|かつ)た)(?!が)/;

  var PART_ARM = /(左|右|両)?(腕|手首|手|拳|肘|肩)/;
  var PART_LEG = /(左|右|両)?(太もも|太腿|大腿|ふくらはぎ|足首|脚|足|膝|下半身)/;

  // 1) STRUCTURAL_LOSS — hard は 断裂/切断/欠損 系のみ。骨露出・削がれ 単独は不可。
  var STRUCT_HARD  = /(断裂|切断|欠損|千切れ|ちぎれ|もげ(た|て))/;
  var TISSUE_LOSS  = /(削が(れ|れて)|抉(られ|れて))/;
  var BONE_EXPOSED = /(骨(が|は)?(露出|見え)|骨が出)/;

  // 2) CRITICAL_HEMORRHAGE — criticality evidence 必須。出血中/出血継続/単独の失血 は除外。
  var HEMORRHAGE = /(大量出血|出血多量|多量出血|多量の出血|(出)?血[がはも]?[^。]{0,4}止まら(な|ぬ)|止血(が)?(不能|できな|間に合わ)|(拍動に合わせて|勢いよく|激しく)[^。]{0,6}(噴出|噴き出|吹き出)|(噴出|噴き出|吹き出)[^。]{0,6}(拍動|勢いよく))/;
  var HEMO_RESOLVED = /(止血(済|し(た|て|完了))|血が止まった|出血が(止まった|収まった|おさまった)|出血なし|縫合(済|し(た|て)))/;

  // 3) CONSCIOUSNESS — 3 分割。UNCONSCIOUS は DEFERRED。
  var ALTERED_CLARITY = /(意識(が)?混濁|朦朧|もうろう|意識が(はっきりしな|定まらな)|意識が混乱)/;
  var IMPENDING_LOC   = /(意識が(飛び|飛ぶ|飛びかけ|遠のく|遠く|途切れ)|気を失い(かけ|そう))/;
  var CONSC_RESOLVED  = /(意識(が)?(戻った|回復|はっきりした|清明))/;

  // 4) GLOBAL_CRITICAL_STATE — 「生命の危機」は未来予測に使えるため除外。
  var GLOBAL = /(瀕死|虫の息|死にかけ)/;

  var RANK_PART   = 1;    // {part}使用不可
  var RANK_LOCO   = 2;    // 走行不可・移動は支え必要
  var RANK_SUST   = 3;    // 長い行動で意識が揺らぐ
  var RANK_JUDGE  = 3.5;  // 複雑な判断が鈍る（ALTERED_CLARITY 専用）
  var T_LOCO  = '走行不可・移動は支え必要';
  var T_SUST  = '長い行動で意識が揺らぐ';
  var T_JUDGE = '複雑な判断が鈍る';

  function classify(clause) {
    var s = String(clause || '');
    if (!s || PAST_ONLY.test(s)) return [];
    var out = [];

    if (STRUCT_HARD.test(s) || (TISSUE_LOSS.test(s) && BONE_EXPOSED.test(s))) {
      var a = s.match(PART_ARM), l = s.match(PART_LEG);
      if (a)      out.push({ cls: 'STRUCTURAL_LOSS', rank: RANK_PART, text: a[0] + '使用不可' });
      else if (l) out.push({ cls: 'STRUCTURAL_LOSS', rank: RANK_LOCO, text: T_LOCO });
      // 部位不明なら出さない
    }

    if (HEMORRHAGE.test(s) && !HEMO_RESOLVED.test(s))
      out.push({ cls: 'CRITICAL_HEMORRHAGE', rank: RANK_SUST, text: T_SUST });

    if (!CONSC_RESOLVED.test(s)) {
      if (ALTERED_CLARITY.test(s)) {
        out.push({ cls: 'ALTERED_CLARITY', rank: RANK_SUST,  text: T_SUST });
        out.push({ cls: 'ALTERED_CLARITY', rank: RANK_JUDGE, text: T_JUDGE });
      }
      if (IMPENDING_LOC.test(s))
        out.push({ cls: 'IMPENDING_LOC', rank: RANK_SUST, text: T_SUST });
      // UNCONSCIOUS_STATE は意図的に扱わない
    }

    if (GLOBAL.test(s)) {
      out.push({ cls: 'GLOBAL_CRITICAL_STATE', rank: RANK_LOCO, text: T_LOCO });
      out.push({ cls: 'GLOBAL_CRITICAL_STATE', rank: RANK_SUST, text: T_SUST });
    }
    return out;
  }

  var lastRun = null;   // 診断用（read-only）。prompt 本文は保持しない。

  // fix414 の deriveConstraints から呼ばれる。bodyClauses は karada + kizu の節配列。
  window.__v292Dfix414S = function (bodyClauses, add) {
    if (lsGet('v292Dfix414SeverityS') !== '1') return;   // default OFF
    if (!bodyClauses || typeof add !== 'function') return;
    var seen = {}, n = 0, classes = [];
    for (var i = 0; i < bodyClauses.length; i++) {
      var cs = classify(bodyClauses[i]);
      for (var j = 0; j < cs.length; j++) {
        var c = cs[j];
        if (seen[c.text]) continue;
        seen[c.text] = 1;
        add(c.rank, c.text);
        n++; classes.push(c.cls);
      }
    }
    lastRun = { clauses: bodyClauses.length, emitted: n, classes: classes };
  };

  window.__v292Dfix741 = {
    version: 'v0',
    classify: classify,
    status: function () {
      return { on: lsGet('v292Dfix414SeverityS') === '1',
               off: lsGet('v292Dfix741Off') === '1',
               hooked: typeof window.__v292Dfix414S === 'function',
               last: lastRun };
    }
  };
})();
