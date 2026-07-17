// =====================================================================
// test_inspect_v20_3.mjs — Worker /inspect 検品ロジック(v20.3変更)の回帰テスト
//   実行: node worker/test_inspect_v20_3.mjs   (ネットワーク不使用・純粋関数のみ)
//   v20.3: hard failを「明確な破綻除外」に限定
//     - chest_up_bust: hard → soft
//     - front_or_three_quarter: soft → hard(横顔/後ろ姿の除外)
//     - no_text_or_watermark / no_severe_artifacts: hard 追加
// =====================================================================
import { __testInspect } from './chronicle-proxy-v20_inspect.js';
const { buildInspectPrompt, parseInspectResult, scoreInspect, validB64Image, INSPECT_KEYS } = __testInspect;

let passCnt = 0, failCnt = 0; const fails = [];
function ok(cond, name, detail) {
  if (cond) { passCnt++; console.log('  ok  -', name); }
  else { failCnt++; fails.push(name); console.log('  FAIL-', name, detail || ''); }
}

console.log('== 1) INSPECT_KEYS 構成(v20.3) ==');
ok(INSPECT_KEYS.human.hard.includes('front_or_three_quarter'), 'front_or_three_quarter が hard(横顔/後ろ姿除外)');
ok(!INSPECT_KEYS.human.hard.includes('chest_up_bust') && INSPECT_KEYS.human.soft.includes('chest_up_bust'), 'chest_up_bust は soft へ降格');
ok(INSPECT_KEYS.human.hard.includes('no_text_or_watermark'), 'no_text_or_watermark が hard');
ok(INSPECT_KEYS.human.hard.includes('no_severe_artifacts'), 'no_severe_artifacts が hard');
ok(['single_person','face_clear','anime_style','desc_match_gender','desc_match_age_band','desc_match_hair','desc_match_clothing'].every(k => INSPECT_KEYS.human.hard.includes(k)), '既存の破綻/人物条件hardは維持');
ok(!INSPECT_KEYS.human.soft.includes('front_or_three_quarter'), 'softからfront_or_three_quarterを撤去');
ok(INSPECT_KEYS.human.soft.join(',') === 'chest_up_bust,dark_background,muted_colors', 'softは構図/パレットの好みのみ(美観加点なし)');
ok(INSPECT_KEYS.creature.hard.includes('no_text_or_watermark') && INSPECT_KEYS.creature.hard.includes('no_severe_artifacts'), 'creature hardにも透かし/破綻を追加');

console.log('== 2) scoreInspect: hard fail の限定 ==');
const allTrueHuman = {
  single_person: true, face_clear: true, anime_style: true,
  desc_match_gender: true, desc_match_age_band: true, desc_match_hair: true, desc_match_clothing: true,
  front_or_three_quarter: true, no_text_or_watermark: true, no_severe_artifacts: true,
  chest_up_bust: true, dark_background: true, muted_colors: true,
};
{
  const r = scoreInspect([allTrueHuman], 'human')[0];
  ok(r.pass === true && r.score === 103, '全true → pass/score=103(100+soft3)');
}
{ // 横顔 → hard fail
  const r = scoreInspect([{ ...allTrueHuman, front_or_three_quarter: false }], 'human')[0];
  ok(r.pass === false, '横顔/後ろ姿(front_or_three_quarter=false) → 不合格');
}
{ // 文字/透かし → hard fail
  const r = scoreInspect([{ ...allTrueHuman, no_text_or_watermark: false }], 'human')[0];
  ok(r.pass === false, '文字/透かしあり → 不合格');
}
{ // 手などの破綻 → hard fail
  const r = scoreInspect([{ ...allTrueHuman, no_severe_artifacts: false }], 'human')[0];
  ok(r.pass === false, '明白な破綻(手/顔の崩れ) → 不合格');
}
{ // 写真/実写3D → hard fail(従来どおり)
  const r = scoreInspect([{ ...allTrueHuman, anime_style: false }], 'human')[0];
  ok(r.pass === false, '写真/実写3D(anime_style=false) → 不合格');
}
{ // 人物条件の不一致 → hard fail(従来どおり)
  const r = scoreInspect([{ ...allTrueHuman, desc_match_age_band: false }], 'human')[0];
  ok(r.pass === false, '年齢帯不一致 → 不合格');
}
{ // 構図(バスト)ずれは soft のみ → 合格のまま減点だけ
  const r = scoreInspect([{ ...allTrueHuman, chest_up_bust: false }], 'human')[0];
  ok(r.pass === true && r.score === 102, '構図(chest_up_bust=false)は破綻ではない → 合格(scoreのみ-1)');
}
{ // null(descに明記なし/構図外)は除外 → 合格に影響しない(v20.1較正の維持)
  const r = scoreInspect([{ ...allTrueHuman, desc_match_clothing: null, no_severe_artifacts: null }], 'human')[0];
  ok(r.pass === true, 'null項目は判定から除外(fail-openではなく適用除外)');
}
{ // undefined(VLMが返し忘れ)は不合格側(従来どおり fail-closed)
  const it = { ...allTrueHuman }; delete it.no_text_or_watermark;
  const r = scoreInspect([it], 'human')[0];
  ok(r.pass === false, '未返却キーは不合格(fail-closed維持)');
}
{ // creature 回帰
  const c = { single_creature: true, non_human: true, clearly_visible: true, anime_or_concept_art: true, desc_match_form: true, no_text_or_watermark: true, no_severe_artifacts: true, dark_background: true, muted_colors: false };
  const r = scoreInspect([c], 'creature')[0];
  ok(r.pass === true && r.score === 101, 'creature全hard true → 合格(soft1)');
  const r2 = scoreInspect([{ ...c, non_human: false }], 'creature')[0];
  ok(r2.pass === false, 'creatureに人の顔 → 不合格');
}

console.log('== 2b) fixture: 候補3枚相当(fix476運用)での null/undefined 挙動 ==');
{
  // fix476 は各候補の r.pass / r.score / hardFailCount(r.hard内のfalse個数) を使う。
  //   候補1: 全項目返却・全true(理想) → pass
  //   候補2: 軽量VLMが新hardキー(no_text_or_watermark/no_severe_artifacts)を【返し忘れ】(undefined)
  //          → fail-closed で pass=false。ただし hardFails(false個数)=0 なので best-effort では最上位。
  //   候補3: 横顔(front_or_three_quarter=false) + 服が構図外(desc_match_clothing=null)
  //          → null は除外・false は hard fail → pass=false, hardFails=1。
  const cand1 = { ...allTrueHuman };
  const cand2 = { ...allTrueHuman }; delete cand2.no_text_or_watermark; delete cand2.no_severe_artifacts;
  const cand3 = { ...allTrueHuman, front_or_three_quarter: false, desc_match_clothing: null };
  const rs = scoreInspect([cand1, cand2, cand3], 'human');
  const hardFailCount = r => Object.values(r.hard).filter(v => v === false).length;   // fix476 L177-181と同じ数え方
  ok(rs[0].pass === true && rs[0].score === 103, 'fixture候補1: 全返却・全true → pass');
  ok(rs[1].pass === false, 'fixture候補2: 新hardキー未返却(undefined) → fail-closed(黙って通さない)');
  ok(hardFailCount(rs[1]) === 0, 'fixture候補2: undefinedはhardFails(false個数)に計上されない → best-effortで不利にならない');
  ok(rs[2].pass === false && hardFailCount(rs[2]) === 1, 'fixture候補3: 横顔false=hard fail 1件・服null=除外');
  // fix476の選抜規則の再現: pass候補があればそれ(候補1)。pass無しならhardFails昇順→score降順。
  const pass = rs.filter(r => r.pass);
  ok(pass.length === 1 && pass[0] === rs[0], 'fixture: pass選抜=候補1');
  const noPass = [rs[1], rs[2]].sort((a, b) => (hardFailCount(a) - hardFailCount(b)) || (b.score - a.score));
  ok(noPass[0] === rs[1], 'fixture: 全滅時のbest-effortでは未返却候補(hardFails=0)が横顔候補(=1)より優先');
}

console.log('== 3) buildInspectPrompt: 新checklist/説明の整合 ==');
{
  const p = buildInspectPrompt('human', 'A high school girl, long black hair.', 3);
  ok(p.system.includes('no_text_or_watermark') && p.system.includes('no_severe_artifacts'), 'systemに新hard項目');
  ok(p.system.includes('front view or a three-quarter view') || p.system.includes('front_or_three_quarter is true for a front view'), '横顔/後ろ姿の判定基準を明記');
  ok(p.system.includes('chest_up_bust, dark_background and muted_colors are soft preferences'), 'softの位置づけを明記');
  ok(p.system.includes('false ONLY for a photograph or photorealistic 3D render'), 'anime_style定義(写真/3Dのみfalse)は不変');
  ok(p.system.includes('exactly 3 objects'), '件数指定(n=3)');
  // 「You do NOT make aesthetic judgments(美的判断の禁止)」は残す。美観を"求める"語が無いことを確認。
  ok(!/beauty|beautiful|attractive|pretty|high[- ]quality/i.test(p.system) && p.system.includes('You do NOT make aesthetic judgments'), '美観を要求する語が無い(禁止文言は維持)');
  const pc = buildInspectPrompt('creature', 'a shadow wraith', 1);
  ok(pc.system.includes('no_text_or_watermark') && pc.system.includes('single_creature'), 'creature checklist更新');
}

console.log('== 4) parseInspectResult / validB64Image 回帰(不変) ==');
{
  ok(parseInspectResult('```json\n{"results":[{"a":true}]}\n```', 1)?.length === 1, 'コードフェンス+results配列');
  ok(parseInspectResult('{"a":true}', 1)?.length === 1, '裸オブジェクト(n=1のみ)');
  ok(parseInspectResult('{"results":[{},{}]}', 3) === null, '件数不一致はnull(位置ずれ防止)');
  ok(parseInspectResult('garbage', 1) === null, '非JSONはnull');
  ok(validB64Image('/9j/AAAAAAAAAAAAAA') === true && validB64Image('poison') === false, 'validB64Image不変');
}

console.log('\n==== 結果: pass=' + passCnt + ' fail=' + failCnt + ' ====');
if (fails.length) { console.log('失敗:'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
