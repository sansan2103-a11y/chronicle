/* 回帰テスト: v292Dfix645 — scene_move タグの shadow 収集
 *
 * ★配信する fix645 / fix643 / fix624 / fix459 / fix379 を**そのまま**モックwindow上で走らせる。
 *   判定器だけを切り出して試さない。
 *
 * このテストが固定する契約（GPT裁定・緩めない）:
 *   (1) ev 完全一致でないタグは拒否
 *   (2) ev の一致箇所が2か所あるタグは拒否
 *   (3) ev に to を含まないタグは拒否
 *   (4) 未遂・回想・予定・否定は拒否
 *   (5) finish_reason==='length' のターンは不採用
 *   (6) well-formed が2件以上でも 1件目だけ評価（2件目以降は無視）／閉じ不完全は無視
 *   (7) OFF で sys 注入もパーサも停止
 *   (8) 画面用 narrative からタグが剥がれ、plan.narrative には残る
 *   (9) fix643 のスコアに影響しない（タグ有無で score/level/hits が完全一致）
 *  (10) fix459 MARKERS に【移動タグ】が在り、fix496 追加の8件も全部残っている
 *  (11) 記録の上限100件・raw 150字・本文を保存しない
 *  (12) index.html 配線（script タグ・?cb=fix645・fix643 の後・_body split）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC645 = read('v292Dfix645-scene-move-shadow.js');
const SRC643 = read('v292Dfix643-collapse-rescue.js');
const SRC624 = read('v292Dfix624-degeneration-probe.js');
const SRC459 = read('v292Dfix459-sys-v2.js');
const SRC553 = read('v292Dfix553-punct-probe.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

/* ---------------- 最小 DOM / window ---------------- */
function mkEl(tag){
  const el = {
    tagName: String(tag).toLowerCase(), id: '', textContent: '', value: '',
    style: { cssText: '' }, children: [],
    appendChild(c){ el.children.push(c); return c; },
    addEventListener(){}, click(){}, focus(){}
  };
  return el;
}
function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const body = mkEl('body');
  const w = {
    localStorage: ls,
    console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, Object: Object, Array: Array, RegExp: RegExp,
    document: { readyState: 'complete', addEventListener(){}, body, createElement: mkEl, getElementById(){ return null; } },
    __chr6Key: () => opts.slotKey || 'chr6'
  };
  w.window = w; w.__store = store;
  return w;
}
function run(w, src, name){
  const ctx = vm.createContext(w);
  vm.runInContext(src, ctx, { filename: name });
  return w;
}
function load645(opts){
  const w = mkWin(opts);
  run(w, SRC645, 'v292Dfix645-scene-move-shadow.js');
  return w;
}

/* ---------------- 素材 ---------------- */
const HERO = '澪';
const tag = (who, to, ev) => `<scene_move who="${who}" to="${to}" ev="${ev}"/>`;
const OPTS = { hero: HERO };

console.log('=== (1)〜(4) 検証条件（純関数 verify/judge） ===');
{
  const F = load645().__v292Dfix645;

  // (1) ev 完全一致
  const body1 = '澪は廊下を抜け、厨房に入った。湯気が顔に触れた。';
  ok('(1a) ev が本文と一字一句一致 → 採用',
     F.judge(body1 + '\n' + tag('hero', '厨房', '厨房に入った'), body1, OPTS).accepted === true);
  ok('(1b) ev が一字違う → 拒否 ev-not-in-body',
     F.judge(body1 + '\n' + tag('hero', '厨房', '厨房へ入った'), body1, OPTS).reason === 'ev-not-in-body',
     F.judge(body1 + '\n' + tag('hero', '厨房', '厨房へ入った'), body1, OPTS));
  ok('(1c) ev が本文に無い（丸ごと幻覚） → 拒否',
     F.judge('澪は廊下で立ち止まった。' + tag('hero', '厨房', '厨房に入った'), '澪は廊下で立ち止まった。', OPTS).reason === 'ev-not-in-body');
  ok('(1d) 生でだけ一致 → ev-not-in-final-body で切り分けられる',
     F.judge('x' + tag('hero', '厨房', '厨房に入った'), '澪は廊下にいる。',
             { hero: HERO, rawBody: '澪は厨房に入った。' }).reason === 'ev-not-in-final-body');

  // (2) 一致2箇所
  const body2 = '澪は厨房に入った。少しして戻り、また厨房に入った。';
  ok('(2) ev の一致箇所が2か所 → 拒否 ev-ambiguous',
     F.judge(body2 + tag('hero', '厨房', '厨房に入った'), body2, OPTS).reason === 'ev-ambiguous');

  // (3) to を含まない ev
  const body3 = '澪は静かに中へ入った。';
  ok('(3) ev に to がそのまま含まれない → 拒否 ev-missing-to',
     F.judge(body3 + tag('hero', '厨房', '静かに中へ入った'), body3, OPTS).reason === 'ev-missing-to');

  // (4) 未遂・予定・仮定・回想・否定
  const cases4 = [
    ['未遂(意志形・入ろうとした)', '澪は厨房に入ろうとしたが、足が止まった。', '厨房に入ろうとした'],
    ['未遂(ようとした)',          '澪は厨房を出ようとして、やめた。',         '厨房を出ようとして'],
    ['予定(つもり)',              '澪は厨房に入ったつもりでいた。',           '厨房に入ったつもり'],
    ['回想',                      '澪は厨房に入った日を思い出していた。',     '厨房に入った日を思い出'],
    ['否定',                      '澪は厨房に入らなかった。結局その場にいた。', '厨房に入らなかった'],
    ['仮定',                      'あのとき厨房に入っただったら、と澪は考えた。', '厨房に入っただったら']
  ];
  cases4.forEach(([nm, body, ev]) => {
    const r = F.judge(body + tag('hero', '厨房', ev), body, OPTS);
    ok('(4) ' + nm + ' → 拒否 unrealized', r.accepted === false && r.reason === 'unrealized', r);
  });
  ok('(4e) 到着完了の語が無い（視線だけ） → 拒否 no-arrival-verb',
     F.judge('澪は厨房の方を見た。' + tag('hero', '厨房', '厨房の方を見た'), '澪は厨房の方を見た。', OPTS).reason === 'no-arrival-verb');

  // その他の門
  ok('(x1) to が空 → to-empty',
     F.judge('澪は厨房に入った。' + tag('hero', '', '厨房に入った'), '澪は厨房に入った。', OPTS).reason === 'to-empty');
  ok('(x2) ev が空 → ev-empty',
     F.judge('澪は厨房に入った。' + tag('hero', '厨房', ''), '澪は厨房に入った。', OPTS).reason === 'ev-empty');
  ok('(x3) ev が80字超 → ev-too-long', (() => {
    const ev = '厨房に入った' + 'あ'.repeat(80);
    const body = 'x' + ev + 'y';
    return F.judge(body + tag('hero', '厨房', ev), body, OPTS).reason === 'ev-too-long';
  })());
  ok('(x4) ev がちょうど80字なら長さでは落ちない', (() => {
    const ev = ('厨房に入った' + 'あ'.repeat(74));
    const body = 'x' + ev + 'y';
    return ev.length === 80 && F.judge(body + tag('hero', '厨房', ev), body, OPTS).accepted === true;
  })());
  ok('(x5) who が主人公でない（NPCの移動） → who-not-hero',
     F.judge('澪は厨房に入った。' + tag('ミリア', '厨房', '厨房に入った'), '澪は厨房に入った。', OPTS).reason === 'who-not-hero');
  ok('(x6) who=登録済みの主人公名でも採用',
     F.judge('澪は厨房に入った。' + tag(HERO, '厨房', '厨房に入った'), '澪は厨房に入った。', OPTS).accepted === true);
  ok('(x7) タグが無いターンは hadTag=false・拒否理由も付かない', (() => {
    const r = F.judge('澪は厨房に入った。', '澪は厨房に入った。', OPTS);
    return r.hadTag === false && r.reason === null && r.accepted === false;
  })());
}

console.log('=== (5) finish_reason==="length" は不採用 ===');
{
  const F = load645().__v292Dfix645;
  const body = '澪は厨房に入った。';
  const raw  = body + tag('hero', '厨房', '厨房に入った');
  ok('(5a) finish=length → finish-length で不採用',
     F.judge(raw, body, { hero: HERO, finish: 'length' }).reason === 'finish-length');
  ok('(5b) stop_reason=max_tokens（Anthropic系）も不採用',
     F.judge(raw, body, { hero: HERO, finish: 'max_tokens' }).reason === 'finish-length');
  ok('(5c) finish=stop なら通常どおり採用',
     F.judge(raw, body, { hero: HERO, finish: 'stop' }).accepted === true);
  ok('(5d) finish 不明(null)でも採用は妨げない',
     F.judge(raw, body, { hero: HERO, finish: null }).accepted === true);
  ok('(5e) truncated() の判定', F.truncated('length') && F.truncated('MAX_TOKENS') && !F.truncated('stop') && !F.truncated(null));
}

console.log('=== (6) 複数タグ・閉じ不完全 ===');
{
  const F = load645().__v292Dfix645;
  const body = '澪は厨房に入った。それから庭に出た。';
  const raw  = body + '\n' + tag('hero', '厨房', '厨房に入った') + tag('hero', '庭', '庭に出た');
  const ex = F.extractTags(raw);
  ok('(6a) well-formed を2件とも抽出できる', ex.tags.length === 2);
  const r = F.judge(raw, body, OPTS);
  ok('(6b) 評価するのは1件目だけ', r.to === '厨房' && r.accepted === true, r);
  ok('(6c) 2件目以降は extra として数えるだけ', r.extra === 1, r);
  // 1件目が拒否でも2件目に救済されない
  const body2 = '澪は庭に出た。';
  const r2 = F.judge(body2 + tag('hero', '厨房', '厨房に入った') + tag('hero', '庭', '庭に出た'), body2, OPTS);
  ok('(6d) 1件目が拒否なら2件目で救済しない', r2.accepted === false && r2.reason === 'ev-not-in-body', r2);
  // 閉じ不完全
  const r3 = F.judge('澪は厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入っ', '澪は厨房に入った。', OPTS);
  ok('(6e) 閉じが不完全なタグは採用しない（incomplete-tag）', r3.accepted === false && r3.reason === 'incomplete-tag', r3);
  const r4 = F.judge('澪は厨房に入った。\n<scene_move who="hero" to="厨房" ev="厨房に入った">', '澪は厨房に入った。', OPTS);
  ok('(6f) 自己閉じでない（/ 無し）タグも採用しない', r4.accepted === false && r4.reason === 'incomplete-tag', r4);
  ok('(6g) 閉じ不完全は hadTag=true として記録対象にはなる', r3.hadTag === true);
}

console.log('=== (7) OFF で sys 注入もパーサも停止 ===');
{
  const wOn  = load645();
  const wOff = load645({ store: { v292Dfix645Off: '1' } });
  ok('(7a) ON: keeper へ 1 件登録される',
     (wOn.__f379reg || []).filter(r => r.marker === '【移動タグ】').length === 1);
  ok('(7b) ON: keeper の text() が sys 文を返す', /scene_move/.test(wOn.__v292Dfix645.text()));
  const regOff = (wOff.__f379reg || []).filter(r => r.marker === '【移動タグ】');
  ok('(7c) OFF: keeper の off キーが v292Dfix645Off である',
     regOff.length === 1 && regOff[0].off === 'v292Dfix645Off');
  ok('(7d) OFF: text() が空文字（keeper が off を見なくても注入されない）', wOff.__v292Dfix645.text() === '');
  ok('(7e) OFF: fetch を包まない', wOff.fetch === undefined || !wOff.fetch.__f645);
  ok('(7f) OFF: パーサ（S.save 処理）が何もしない', (() => {
    const S = { turns: [{ narrative: '澪は厨房に入った。' + tag('hero','厨房','厨房に入った'), plan: { narrative: ['x'] } }], save(){} };
    wOff.S = S;
    wOff.__v292Dfix645._processLastTurn();
    return S.turns[0].narrative.indexOf('<scene_move') >= 0 && wOff.__v292Dfix645.log().length === 0;
  })());
  ok('(7g) ON: prio は 3（予算逼迫時に最初に落ちる＝品質ブロックを押し出さない）',
     (wOn.__f379reg || []).filter(r => r.marker === '【移動タグ】')[0].prio === 3);
  ok('(7h) 冪等: 2回読み込んでも keeper 登録は1件のまま', (() => {
    run(wOn, SRC645, 're-load');
    return (wOn.__f379reg || []).filter(r => r.marker === '【移動タグ】').length === 1;
  })());
}

console.log('=== (8) 画面用 narrative から剥がれ、plan.narrative には残る ===');
{
  const w = load645();
  const F = w.__v292Dfix645;
  const bodyText = '澪は廊下を抜け、厨房に入った。';
  const tg = tag('hero', '厨房', '厨房に入った');
  const raw = bodyText + '\n' + tg + '\n<state>…</state>';

  // parsePlan ラップで raw を控える（plan は一切いじらない）
  const planIn = { narrative: [bodyText, tg], branchCandidates: [] };
  w.Planner = { parsePlan(rawText){ return planIn; } };
  ok('(8a) parsePlan ラップが装着できる', F._wrapParse() === true);
  const planOut = w.Planner.parsePlan(raw, 'DO');
  ok('(8b) parsePlan の戻り値を書き換えない', planOut === planIn && planOut.narrative.length === 2);

  const turn = { narrative: bodyText + '\n' + tg, plan: planOut };
  const S = { turns: [turn], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
  w.S = S;
  ok('(8c) S.save ラップが装着できる', F._wrapSave() === true);
  S.save();

  ok('(8d) turn.narrative からタグが消えている', turn.narrative.indexOf('<scene_move') < 0, turn.narrative);
  ok('(8e) turn.narrative の本文は1文字も欠けていない', turn.narrative === bodyText, turn.narrative);
  ok('(8f) turn.plan.narrative にはタグが残る（一次証拠＝話者タグと同じ扱い）',
     turn.plan.narrative.join('\n').indexOf('<scene_move') >= 0);
  ok('(8g) 剥がす前の narrative を退避してある（ロールバック可能）',
     typeof turn.__f645nprev === 'string' && turn.__f645nprev.indexOf('<scene_move') >= 0);
  ok('(8h) 記録が1件できている', F.log().length === 1, F.log());
  ok('(8i) 採用され、to が記録されている', F.log()[0].accepted === true && F.log()[0].to === '厨房', F.log()[0]);
  ok('(8j) 同じターンを二度処理しない', (() => { S.save(); return F.log().length === 1; })());

  // 表示側の二重ネット
  const rendered = [];
  w.UI = { renderNarr(t){ rendered.push(t); return ''; } };
  ok('(8k) renderNarr ラップが装着できる', F._wrapRender() === true);
  w.UI.renderNarr('本文。' + tg);
  ok('(8l) 二重ネット: renderNarr へ渡る文字列からもタグが消える',
     rendered[0].indexOf('<scene_move') < 0, rendered[0]);

  // 剥がしの安全弁
  ok('(8m) 剥がすと空になる本文は置き換えない（本文を消さない）', (() => {
    const t2 = { narrative: tg, plan: { narrative: [tg] } };
    S.turns.push(t2);
    S.save();
    return t2.narrative === tg;
  })());
  ok('(8n) 途中で切れたタグは行末までしか消さない（後続の本文を巻き込まない）',
     F.strip('一行目。\n<scene_move who="hero" to="厨\n二行目。') === '一行目。\n\n二行目。',
     F.strip('一行目。\n<scene_move who="hero" to="厨\n二行目。'));
  ok('(8o-1) 古い raw（別ターン／別スロットの残り）では判定も記録もしない', (() => {
    const w2 = load645();
    const F2 = w2.__v292Dfix645;
    w2.Planner = { parsePlan(){ return {}; } };
    F2._wrapParse();
    // 別スロットの応答（タグ付き）を控えたまま、まったく別の本文のターンが確定する
    w2.Planner.parsePlan('別の物語の本文がここに長々と続いていた。' + tag('hero', '厨房', '厨房に入った'));
    const t = { narrative: '雨の匂いが階段の踊り場に溜まっていた。誰もいない。', plan: { narrative: [] } };
    const S2 = { turns: [t], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
    w2.S = S2; F2._wrapSave(); S2.save();
    return F2.log().length === 0 && F2.stats().session.rawMismatch === 1;
  })());
  ok('(8o-2) 同じターンの raw なら（多少校正されていても）判定する', (() => {
    const w2 = load645();
    const F2 = w2.__v292Dfix645;
    const body = '澪は廊下を抜け、湯気の立ちこめる厨房に入った。誰かが鍋をかき混ぜている。';
    w2.Planner = { parsePlan(){ return {}; } };
    F2._wrapParse();
    w2.Planner.parsePlan(body + tag('hero', '厨房', '厨房に入った'));
    // fix555 が句読点を1つ直した想定（先頭が変わっても中盤で照合できる）
    const t = { narrative: body.replace('誰かが', 'だれかが') + tag('hero', '厨房', '厨房に入った'),
                plan: { narrative: [] } };
    const S2 = { turns: [t], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
    w2.S = S2; F2._wrapSave(); S2.save();
    return F2.log().length === 1 && F2.log()[0].accepted === true;
  })());
  ok('(8o) 履歴（このセッションで生成していないターン）は触らない', (() => {
    const w2 = load645();
    const F2 = w2.__v292Dfix645;
    const t3 = { narrative: '澪は厨房に入った。' + tg, plan: { narrative: [] } };
    const S2 = { turns: [t3], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
    w2.S = S2; F2._wrapSave(); S2.save();
    return t3.narrative.indexOf('<scene_move') >= 0 && F2.log().length === 0;
  })());
}

console.log('=== (9) fix643 のスコアに影響しない ===');
{
  // 配信物そのまま: fix624（判定器）→ fix643（救済層）→ fix645
  const w = mkWin();
  run(w, SRC624, 'fix624'); run(w, SRC643, 'fix643'); run(w, SRC645, 'fix645');
  const f643 = w.__v292Dfix643;
  ok('(9a) fix624/fix643 が載っている', !!(w.__v292Dfix624 && f643));

  const say3 = '<say who="a">「あ」</say>\n<say who="b">「い」</say>\n<say who="c">「う」</say>';
  const st = { turns: [ { plan: { narrative: [say3] } }, { plan: { narrative: [say3] } },
                        { plan: { narrative: [say3] } }, { plan: { narrative: [say3] } } ] };
  const FIX = w.__v292Dfix624._fixtures || {};
  const samples = Object.keys(FIX).filter(k => typeof FIX[k] === 'string' && FIX[k].length > 60);
  ok('(9b) fix624 の固定サンプルが取れている', samples.length >= 3, samples);

  let same = 0, diff = [];
  samples.forEach(k => {
    const base = FIX[k];
    const withTag = base + '\n' + tag('hero', '厨房', '厨房に入った');
    const a = f643.judgeRaw(base, st), b = f643.judgeRaw(withTag, st);
    if (JSON.stringify([a.measurable, a.score, a.level, a.hits]) === JSON.stringify([b.measurable, b.score, b.level, b.hits])) same++;
    else diff.push({ k, a: { s: a.score, l: a.level }, b: { s: b.score, l: b.level } });
  });
  ok('(9c) 全サンプルで score/level/hits がタグ有無で完全一致', same === samples.length && diff.length === 0, diff);

  ok('(9d) fix643.bodyOf が <scene_move> を本文の終わりとして切る',
     String(f643.bodyOf('本文。'.repeat(20) + tag('hero','厨房','厨房に入った'))).indexOf('<scene_move') < 0);
  ok('(9e) タグが無い応答では bodyOf の結果が従来と同一',
     f643.bodyOf('本文。'.repeat(20)) === '本文。'.repeat(20));
  ok('(9f) fix645 は fix643 の再生成経路を一切呼ばない（救済カウンタが動かない）',
     f643.stats().rescued === 0 && f643.stats().blocked === 0);
  ok('(9g) fix553（句読点プローブ）も <scene_move> を本文の終わりとして切る',
     /split\(\/<react\|<state\|<scene_move\//.test(SRC553));
}

console.log('=== (10) fix459 MARKERS の網羅 ===');
{
  const w = mkWin();
  run(w, SRC459, 'fix459');
  const M = (w.__v292Dfix459 && w.__v292Dfix459.MARKERS) || null;
  // 公開されていない場合はソースから直接読む（網羅の確認が目的）
  const src = SRC459;
  const need = ['【移動タグ】', '【制約】', '【読ませ方】', '【表記】', '【キャラの反応】',
                '【口調訂正】', '【関係】', '【打ち明け】', '【NPC間の関係】'];
  need.forEach(m => ok('(10) MARKERS に ' + m + ' が在る', new RegExp("'" + m + "'").test(src)));
  ok('(10z) 【移動タグ】は dropA/B/C/D のどれにも入っていない（＝毎ターン生き残る）', (() => {
    const drops = src.match(/var drop[ABCD] = \[[^\]]*\]/g) || [];
    return drops.length === 4 && drops.every(d => d.indexOf('【移動タグ】') < 0);
  })());

  /* ★実チェーン: fix459 の rewrite を通しても【移動タグ】ブロックが消えないこと。
     ここが fix496 の事故（未知マーカーが直前ブロックへ吸収され、直前が drop 対象なら道連れ）の再発防止。 */
  const F645TEXT = load645().__v292Dfix645.TEXT;
  const head = '【守ること】' + 'あ'.repeat(700) + '\n';
  const sysWithDrop = head + '【ダッシュ】ダッシュ記号は使わない。' + F645TEXT;
  const outSys = w.__v292Dfix459.rewrite(sysWithDrop);
  ok('(10y) rewrite 後も【移動タグ】が sys に残る', outSys.indexOf('【移動タグ】') >= 0);
  ok('(10x) rewrite 後も scene_move の雛形が sys に残る', outSys.indexOf('<scene_move') >= 0);
  ok('(10w) 直前の【ダッシュ】は従来どおり drop される（土台が効いている証明）',
     outSys.indexOf('【ダッシュ】ダッシュ記号は使わない。') < 0);
  ok('(10v) 負の対照: 未知マーカーなら道連れで消える（＝MARKERS 登録が効いている）', (() => {
    const unknown = head + '【ダッシュ】ダッシュ記号は使わない。' + F645TEXT.replace('【移動タグ】', '【未知タグ】');
    return w.__v292Dfix459.rewrite(unknown).indexOf('【未知タグ】') < 0;
  })());
}

console.log('=== (11) 記録の作法（本文を保存しない・上限） ===');
{
  const F = load645().__v292Dfix645;
  ok('(11a) 上限は100件', F.MAX_LOG === 100);
  ok('(11b) raw の上限は150字', F.MAX_RAW === 150);
  ok('(11c) ev の上限は80字', F.MAX_EV === 80);
  // 記録行に本文が混ざらないこと（150字までのタグ文字列のみ）
  const w = load645();
  const F2 = w.__v292Dfix645;
  const longEv = 'あ'.repeat(200);
  const body = '澪は厨房に入った。' + longEv;
  const turn = { narrative: body + tag('hero', '厨房', longEv), plan: { narrative: [] } };
  const S = { turns: [turn], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
  w.Planner = { parsePlan(){ return { narrative: [] }; } };
  F2._wrapParse(); w.Planner.parsePlan(turn.narrative);
  w.S = S; F2._wrapSave(); S.save();
  const row = F2.log()[0];
  ok('(11d) 記録は1件', F2.log().length === 1);
  ok('(11e) raw は150字以下', row && String(row.raw).length <= 150, row && String(row.raw).length);
  ok('(11f) 本文（ev 本体）を保存しない＝evLen だけ', row && typeof row.evLen === 'number' && row.evLen === 200);
  ok('(11g) 拒否時は to を残さない（幻覚文字列を保存しない）', row && row.accepted === false && row.to === null, row);
  ok('(11h) 記録行のキーは仕様どおり', (() => {
    const keys = Object.keys(row).sort().join(',');
    return keys.indexOf('accepted') >= 0 && keys.indexOf('rejectReason') >= 0 &&
           keys.indexOf('slotId') >= 0 && keys.indexOf('turnIndex') >= 0 &&
           keys.indexOf('ts') >= 0 && keys.indexOf('evLen') >= 0;
  })(), row && Object.keys(row));
  ok('(11i) 物語データ(chr6*)へは1バイトも書かない',
     Object.keys(w.__store).every(k => k.indexOf('chr6') < 0), Object.keys(w.__store));
  ok('(11j) 書き込むキーは v292Dfix645_log だけ',
     Object.keys(w.__store).join(',') === 'v292Dfix645_log', Object.keys(w.__store));
  // 上限100件
  ok('(11k) 100件を超えたら古い方から捨てる', (() => {
    const w3 = load645();
    const F3 = w3.__v292Dfix645;
    const arr = []; for (let i = 0; i < 130; i++) arr.push({ ts: i, accepted: false, rejectReason: 'x' });
    w3.localStorage.setItem('v292Dfix645_log', JSON.stringify(arr));
    // record 経路を通す
    const t = { narrative: '澪は厨房に入った。' + tag('hero','厨房','厨房に入った'), plan: { narrative: [] } };
    const S3 = { turns: [t], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
    w3.Planner = { parsePlan(){ return {}; } }; F3._wrapParse(); w3.Planner.parsePlan(t.narrative);
    w3.S = S3; F3._wrapSave(); S3.save();
    return F3.log().length === 100;
  })());
  ok('(11l) stats() が採用数と拒否理由別内訳を返す', (() => {
    const s = F2.stats();
    return s.tagTurns === 1 && s.accepted === 0 && s.rejected === 1 &&
           s.byReason && s.byReason['ev-too-long'] === 1 && typeof s.acceptRate === 'number';
  })(), F2.stats());
  ok('(11m) clearLog() で消える', (() => { F2.clearLog(); return F2.log().length === 0; })());
}

console.log('=== (12) index.html 配線 ===');
{
  ok('(12a) script タグが在る', /<script src="v292Dfix645-scene-move-shadow\.js\?cb=fix645"><\/script>/.test(HTMLU));
  ok('(12b) fix643 より後ろに置かれている',
     HTMLU.indexOf('v292Dfix645-scene-move-shadow.js') > HTMLU.indexOf('v292Dfix643-collapse-rescue.js'));
  ok('(12c) </body> より前', HTMLU.indexOf('v292Dfix645-scene-move-shadow.js') < HTMLU.lastIndexOf('</body>'));
  ok('(12d) 会話ログ抽出元 _body も <scene_move> で切っている（ev内の「」の混入防止）',
     /var _body = String\(result\.text \|\| ''\)\.split\(\/<react\|<state\|<scene_move\/\)\[0\];/.test(HTMLU));
  /* ★固定値で縛らない（出荷ごとに進む）。契約=BUILTとversion.txtが同値。 */
  ok('(12e) BUILT と version.txt が同値', (() => {
    const b = (HTMLU.match(/BUILT\s*=\s*'([^']+)'/) || [])[1];
    return !!b && b === read('version.txt').trim();
  })());
  ok('(12g) index.html の NUL は1個のまま',
     Buffer.from(HTML, 'latin1').filter(b => b === 0).length === 1,
     Buffer.from(HTML, 'latin1').filter(b => b === 0).length);
  ok('(12h) sys 注入は Planner._extensions ではなく keeper(__f379reg) 経由',
     /__f379reg/.test(SRC645) && !/_extensions\s*\.\s*push/.test(SRC645));
  ok('(12i) OFF スイッチ名が規約どおり', /v292Dfix645Off/.test(SRC645));
  ok('(12j) 冪等ガードが __v292* 形式', /__v292Dfix645/.test(SRC645));
}

console.log('=== (13) sys 文面（GPT裁定の文言を保つ） ===');
{
  const F = load645().__v292Dfix645;
  const T = F.TEXT;
  ok('(13a) marker は【移動タグ】', F.MARKER === '【移動タグ】' && T.indexOf('【移動タグ】') === 1);
  ok('(13b) タグ雛形を含む', T.indexOf('<scene_move who="hero" to="到着地点" ev="本文からの抜粋"/>') >= 0);
  ok('(13c) 「1つだけ」を含む', T.indexOf('1つだけ') >= 0);
  ok('(13d) 「一字も変えずに」を含む', T.indexOf('一字も変えずに') >= 0);
  ok('(13e) 「迷ったら出さない」を含む', T.indexOf('迷ったら出さない') >= 0);
  ok('(13f) 「本文を短くしない」を含む', T.indexOf('本文を短くしない') >= 0);
  ok('(13g) 「完全に省略する」を含む', T.indexOf('完全に省略する') >= 0);
  ok('(13h) from を要求しない', T.indexOf('from') < 0);
  ok('(13i) 長い内省指示を入れない（推論せよ／慎重に 等が無い）',
     T.indexOf('推論') < 0 && T.indexOf('慎重') < 0 && T.indexOf('よく考え') < 0);
  ok('(13j) 在場・姿勢・所持へ広げていない',
     T.indexOf('在場') < 0 && T.indexOf('姿勢') < 0 && T.indexOf('所持') < 0);
  ok('(13k) sys ブロックは300字以内（keeper 予算1600字を圧迫しない）', T.length <= 300, T.length);
}

console.log('=== (14) 実機用の読出口 ===');
{
  const w = load645();
  const F = w.__v292Dfix645;
  const st = F.selfTest();
  ok('(14a) selfTest() が全ケース合格', st.ok === true, st.cases.filter(c => !c.pass));
  ok('(14b) status() が keeper 登録を報告する', F.status().keeperRegistered === true);
  ok('(14c) status() が off=false を返す', F.status().off === false);
  ok('(14d) 将来基準がコメントに残っている（実装はしない）',
     /98%/.test(SRC645) && /60%/.test(SRC645) && /99%/.test(SRC645) && /200件/.test(SRC645));
  ok('(14e) 位置 state を作らないことがコメントで明示されている',
     /位置 ?state は?作らない|位置stateは作らない/.test(SRC645));
}

console.log('=== (15) finish_reason の捕捉配線（非同期） ===');
(async function(){
  const w = load645();
  const F = w.__v292Dfix645;
  const rawTurn = '澪は厨房に入った。' + tag('hero', '厨房', '厨房に入った');
  const payload = { choices: [{ message: { content: rawTurn }, finish_reason: 'length' }] };
  const origRes = { ok: true, clone(){ return { json(){ return Promise.resolve(payload); } }; } };
  w.fetch = function(){ return Promise.resolve(origRes); };
  F._wrapFetch();
  ok('(15a) fetch を包んだ', typeof w.fetch === 'function' && w.fetch.__f645 === true);

  const res = await w.fetch('x');
  ok('(15b) 呼び出し元へは元の Response をそのまま返す（body を消費しない）', res === origRes);
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  ok('(15c) 応答から finish_reason を控える',
     F._finishRing().length === 1 && F._finishRing()[0].finish === 'length', F._finishRing());

  // parsePlan → 同じ本文なら finish が引き当てられ、length のターンは採用されない
  w.Planner = { parsePlan(){ return { narrative: [] }; } };
  F._wrapParse();
  w.Planner.parsePlan(rawTurn);   // ★fetch で控えた本文と同一 → finish が引き当てられる
  ok('(15c2) raw から finish を引き当てられる', F.status().lastFinish === 'length', F.status().lastFinish);
  const turn = { narrative: rawTurn, plan: { narrative: [] } };
  const S = { turns: [turn], cast: { hero: { name: HERO }, npcs: [] }, save(){} };
  w.S = S; F._wrapSave(); S.save();
  ok('(15d) finish=length のターンでは採用しない（実チェーン）',
     F.log().length === 1 && F.log()[0].accepted === false && F.log()[0].rejectReason === 'finish-length',
     F.log()[0]);
  ok('(15e) 不採用でも本文からタグは剥がす（画面へ漏らさない）',
     turn.narrative.indexOf('<scene_move') < 0, turn.narrative);

  console.log('');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  if (fail) process.exitCode = 1;
})();
