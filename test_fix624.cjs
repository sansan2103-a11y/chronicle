/* 回帰テスト: v292Dfix624 — 生成の崩壊を測る（読み取り専用）
 *
 * ■このテストが固定する「約束」
 *   ①崩壊の**2つの型を両方**捕まえる（反復ループ型／語調崩壊型）
 *     ★片方だけ捕まえる検出器を書いて実際に失敗している。1指標で決めない
 *   ②正常な文章を**弾かない**（偽陽性を具体値で固定する）
 *   ③本文・who・DOM・localStorage を**一切触らない**（測るだけ）
 *   ④実データ168ターンで測った分布の「空き帯」に閾値が乗っていること
 *   ⑤壊れた入力で例外を投げない
 *
 * ■実データの裏づけ（2026-07-28・全168ターン）
 *   点数分布: 0→119, 1→15, 2→28, 3→3, 7→1, 11→1, 12→1
 *   ★4〜6 が**空**。閾値5はこの空き帯に置いている（境界に敏感でない）
 *   閾値5で拾えた3件はすべて**実物を読んで崩壊を確認済み**（偽陽性0）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const eq = (n, got, want) => ok(n + ' = ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want), got);

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix624-degeneration-probe.js'), 'utf8');

function load(opts) {
  opts = opts || {};
  const wrote = [];
  const ls = {
    getItem: k => (opts.lsInit && Object.prototype.hasOwnProperty.call(opts.lsInit, k)) ? opts.lsInit[k] : null,
    setItem: k => { wrote.push(k); throw new Error('fix624 must not write localStorage: ' + k); },
    removeItem: k => { wrote.push(k); throw new Error('fix624 must not remove: ' + k); },
    length: 0
  };
  const S = { turns: opts.turns || [], cast: { hero: { name: '火村レイナ' }, npcs: [] } };
  const W = { localStorage: ls, __chronicleGetState: () => S };
  const ctx = { window: W, localStorage: ls, console: { log() {}, warn() {}, error() {} },
    JSON, Math, Object, Array, String, Number, RegExp, Date,
    setTimeout: fn => { try { fn(); } catch (e) {} return 1; }, setInterval: () => 1 };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'v292Dfix624-degeneration-probe.js' });
  return { api: W.__v292Dfix624, S, wrote, ls };
}

/* ★実データそのもの（削除した物語と港町の物語から採取）。作り話の見本で通しても意味がない。 */
const REAL = {
  /* (A) 反復ループ型 — smrnoszes2j ターン1 */
  repLoop: '俺たち二台目――というよりも初代であろう――というよりもかつて' +
    'いっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいいっぱいい――、' +
    '俺たち彼女はいまここにあいつをもっと深遠なる領域――夜陰《夜陰》とはまた別種《べっ》だからしてもっと深遠なる領域『領域』？' +
    '《闇夜》だから？じゃあもう少し詳しいところ、《暗黒物質》？《そこ》？《あるべき姿》？' +
    'もうなんでも構わなくなっていました……本当ですか？はい！そうです！',
  /* (B) 語調崩壊型 — smrnoszes2j ターン6。★反復もルビも無い */
  registerCollapse: '私は両手同時存在証明のように、右半分挙上途中停止状態維持していて、' +
    '左胸近接保持封筒握り締めたままであり、対峙者側老眼鏡奥眼光固定不動維持、' +
    '書類載せ机脇置き続け姿勢変更一切確認されていない。一方第三者隣立姿勢崩しかけており、' +
    '口元覆う手指降ろしかけてまた戻しかけ迷走中観測される最中のことであると言える状況において、' +
    '今私発しようとする問いかけそれ自体発生直前時点での出来事でありました為、' +
    '必然的に次なる事態発生順序確定されていく契機形成されていくものであったといっても過言ではないと考えられますため、以下の通り推移致します',
  /* (C) ダッシュ乱用型 — smri0s9cno3 ターン2。★検出器が新しく見つけた実物 */
  dashSpam: '潮風とは逆の方角——山側に向けて伸びている道があることに氣づいたのだろうと思うほど自然だっただろう' +
    '――それとも彼自身の中にある目的地があそこだと教えたのだろう――\n' +
    '海岸線ではなく山側に向けて曲線を取りながら緩勾配となっていくとコンクリ塀はいつの間にか崩れて低くなっていました' +
    '――舗装路にもひび割れて穴があいている箇所がある――水道管由来かもしれぬ錆を含んだ臭氣を含んだ地面' +
    '──周囲より暗くなる空間──細隙のような開口部があった――そこにあの人に関する痕跡のようなものが在るとすればそこ以外なかったはずです――\n' +
    '振り返らずにもっと前方を行きます―彼にとって懐古以上の念慮を含んだ風景―高架下道というより穿山地帯を通っていたのです；' +
    '壁肌覆いつほこりの様子―天井にかかった照明灯具のあるところ；昼尚早々點滅しながら垂れる黄色味電球二列並列設置されてある──',
  /* 正常 — 同じ物語・同じモデルの健全なターン */
  normalGarage: '「あ、うん。佐伯ミナ。ミナでいいよ」\n彼女は右手を軽く上げる。' +
    'グリスの残る指先が裸電球の灯りで鈍く光る。革ジャケット越しに冷えた空気が這う。' +
    'ミナの立つ奥から、ガレージに閉じ込められた埃と油と金属の匂いが流れてくる。鼻の奥がひりつく。' +
    'ミナは顎で受付机の方向をしゃくった。机の上では、源蔵が伝票を押さえながらペンを走らせている。' +
    '彼の指先は老眼鏡の下で正確に動く。猫背の影が壁に伸びている。',
  /* 正常 — 白鷺荘（別モデル・別物語） */
  normalInn: '火鉢の炭が、かすかに赤く息づいている。主人公はそのそばの座布団に腰を落とし、' +
    '手をかざしながら宿の主人を見上げた。主人は湯呑みを両手で包んだまま、一呼吸置いてから口を開く。' +
    '主人は視線を火鉢に落とす。炎ではなく、灰の中に何かを探すような目だった。' +
    '低く短く返すと、主人の指が湯呑みの縁をなぞった。',
  /* 正常だが情景描写だけでセリフが無いターン（★これを弾いてはいけない） */
  normalNoDialogue: '裸電球の灯りが、ほこりの混じった空気の中で淡く暈ける。' +
    '施錠——聞いていない。依頼の伝票にはそんな注意書きはなかった。' +
    '自分は無意識に、防水封筒の角を指の腹で撫でていた。表面は冷たい。中身は薄い。' +
    '視線は、机で伝票を書く源蔵の背中へ向く。彼の手は止まらない。'
};

console.log('--- 1. 起動と生存証明 ---');
{
  const { api } = load();
  ok('window.__v292Dfix624 が生える', !!api && typeof api.measure === 'function');
  const st = api.selfTest();
  ok('★selfTest が合格する', st.ok === true, st.detail);
}

console.log('\n--- 2. ★崩壊の2型を両方捕まえる（実データ） ---');
{
  const { api } = load();
  const a = api.scoreTurn({ narrative: REAL.repLoop, _convSays: [] }, { cardAvg: 4 });
  ok('★(A)反復ループ型を捕まえる', a.hard === true, { score: a.score, hits: a.hits.map(h => h.w) });
  ok('  反復として検出している', a.hits.some(h => h.w === '反復'), a.hits.map(h => h.w));

  const b = api.scoreTurn({ narrative: REAL.registerCollapse, _convSays: [{}] }, { cardAvg: 4 });
  ok('★(B)語調崩壊型を捕まえる', b.hard === true, { score: b.score, hits: b.hits.map(h => h.w) });
  eq('  ★(B)には反復が無い（＝反復だけの検出器では捕まらない）', b.metrics.rep4, 0);
  eq('  ★(B)にはルビも無い', b.metrics.ruby, 0);
  ok('  助詞の少なさで捕まえている', b.hits.some(h => h.w === '助詞が少ない'), b.hits.map(h => h.w));

  const c = api.scoreTurn({ narrative: REAL.dashSpam, _convSays: [] }, { cardAvg: 4 });
  ok('★(C)ダッシュ乱用型を捕まえる', c.hard === true, { score: c.score, hits: c.hits.map(h => h.w) });
}

console.log('\n--- 2b. ★GPT の反証（意図的な文体を hard にしない） ---');
{
  /* ■GPT が出した反証。実際に当ててみたら**片方が本当に誤検出した**（5点）。
     原因は「最長文」と「平均文長」の二重計上。文が1〜2個の段落では両者は同じ事実。
     ★反証は当ててみるまで正しいか分からない。もらった時点で満足しない。 */
  const { api } = load();
  const stream = '私はまだここにいるはずだと考えるけれどここがどこなのかは分からないし彼女が私なのか' +
    '私が彼女なのかも分からないまま鏡の向こうで笑っている私を見ている彼女の目だけが' +
    'やけに鮮明でその瞬間だけ私は自分がもう戻れない場所へ来たのだと理解した。';
  const shortLines = '足音が止まった。\n灯りが消えた。\n誰も動かない。\n廊下の奥で何かが鳴った。\n近い。\n' +
    'また鳴る。\n今度は扉のすぐ向こうだ。\n澪は息を殺した。\n指先が冷たい。\n動けない。';

  const a = api.scoreTurn({ narrative: stream, _convSays: [] }, { cardAvg: 4 });
  ok('★意識の流れを hard にしない', a.hard === false, { score: a.score, hits: a.hits.map(h => h.w) });
  const b = api.scoreTurn({ narrative: shortLines, _convSays: [] }, { cardAvg: 4 });
  ok('★緊迫した短文連打を hard にしない', b.hard === false, { score: b.score, hits: b.hits.map(h => h.w) });

  /* 二重計上そのものを固定する */
  const one = api.measure(stream);
  eq('  意識の流れは1文として数える', one.sentences, 1);
  ok('  助詞は豊富（＝語調崩壊とは逆）', one.particleRate >= 14, one.particleRate);
}

console.log('\n--- 3. ★正常な文章を弾かない（偽陽性） ---');
{
  const { api } = load();
  for (const [name, text, cards] of [
    ['ガレージ（会話あり）', REAL.normalGarage, 4],
    ['白鷺荘（会話あり）', REAL.normalInn, 3],
    ['★情景描写だけでセリフ0', REAL.normalNoDialogue, 0]
  ]) {
    const r = api.scoreTurn({ narrative: text, _convSays: new Array(cards).fill({}) }, { cardAvg: 4 });
    ok('通す: ' + name, r.hard === false, { score: r.score, hits: r.hits.map(h => h.w) });
  }
}

console.log('\n--- 4. ★閾値は分布の「空き帯」に乗っている ---');
{
  /* 実データ168ターンの分布: 0→119, 1→15, 2→28, 3→3, 7→1, 11→1, 12→1
     4〜6 が空。閾値5は境界に敏感でない＝1点ずれても結論が変わらない。 */
  const { api } = load();
  const bad = [REAL.repLoop, REAL.registerCollapse, REAL.dashSpam]
    .map(t => api.scoreTurn({ narrative: t, _convSays: [] }, { cardAvg: 4 }).score);
  const good = [REAL.normalGarage, REAL.normalInn, REAL.normalNoDialogue]
    .map(t => api.scoreTurn({ narrative: t, _convSays: [{}, {}, {}, {}] }, { cardAvg: 4 }).score);
  ok('★崩壊はすべて7点以上（＝hard）', bad.every(s => s >= 7), bad);
  ok('★正常はすべて3点以下', good.every(s => s <= 3), good);
  ok('★間に十分な開きがある', Math.min(...bad) - Math.max(...good) >= 4, { bad, good });
}

console.log('\n--- 5. ★何も書かない（測るだけ） ---');
{
  const { api, wrote } = load({ turns: [{ narrative: REAL.repLoop, _convSays: [] }] });
  api.sweep();
  api.measure(REAL.repLoop);
  api.scoreTurn({ narrative: REAL.normalInn, _convSays: [] });
  eq('★localStorage へ書こうとすらしない', wrote, []);

  /* 本文を書き換えない */
  const turn = { narrative: REAL.repLoop, _convSays: [{ who: 'A', say: 'B' }] };
  const before = JSON.stringify(turn);
  api.scoreTurn(turn, { cardAvg: 4 });
  eq('★ターンを1文字も変えない', JSON.stringify(turn), before);
}

console.log('\n--- 6. sweep と OFF ---');
{
  const { api } = load({ turns: [
    { narrative: REAL.normalInn, _convSays: [{}, {}, {}, {}] },
    { narrative: REAL.repLoop, _convSays: [] },
    { narrative: REAL.normalGarage, _convSays: [{}, {}, {}, {}] }
  ] });
  const s = api.sweep();
  eq('3ターン見る', s.turns, 3);
  eq('★崩壊は1件だけ', s.suspects, 1);
  eq('  その位置', s.detail[0].turn, 1);

  const { api: a2 } = load({ lsInit: { v292Dfix624Off: '1' } });
  eq('OFF なら sweep は止まる', a2.sweep().disabled, true);
}

console.log('\n--- 7. 壊れた入力 ---');
{
  const { api } = load();
  let threw = null;
  for (const x of [null, undefined, '', {}, { narrative: null }, { narrative: [] },
                   { narrative: [{ text: 'あ' }] }, { narrative: 123 }, { _convSays: null }]) {
    try { api.scoreTurn(x, { cardAvg: 1 }); } catch (e) { threw = String(e.message); }
  }
  eq('例外を投げない', threw, null);
  eq('空文字は長さ0', api.measure('').len, 0);
  eq('null も落ちない', api.measure(null).len, 0);
  ok('短い正常文を崩壊にしない', api.scoreTurn({ narrative: 'そうか。', _convSays: [] }, { cardAvg: 0 }).hard === false);

  /* ★三段階のラベルが出ていること */
  const lv = t => api.scoreTurn({ narrative: t, _convSays: [] }, { cardAvg: 4 }).level;
  eq('正常は ok', lv(REAL.normalInn), 'ok');
  eq('崩壊は hard', lv(REAL.repLoop), 'hard');
}

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
