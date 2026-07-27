/* 回帰テスト: v292Dfix604 — 感情主ブリッジに「声の出所」型（起点の「から」）を足す
 *
 * ■背景（2026-07-27・おしんのiPhone実機で捕獲した誤り）
 *     「……ぇ」
 *     ひなたの喉の奥から、引きつったような声が漏れる。
 *   ＝**その地の文自身が話者を名指している**のに、会話ログは主人公(白石澪)に振っていた。
 *
 *   なぜ既存の「感情主ブリッジ」で拾えなかったか:
 *     既存は `Xの<部位>**が**` ＝**主語の「が」限定**。
 *     「は」「を」は誤爆事故（「リカの声は震えていなかった」で大事故）を避けるため
 *     **意図的に除外**されていた。
 *     今回の文は「ひなたの喉**の奥から**」＝**起点の「から」**。
 *     が でも は でも を でもないので、どれにも当たらず素通りしていた。
 *
 *   fix604 の主張: 「から」は「は」「を」と違い**曖昧ではない**。
 *   「Xの<発声器官>から<声>が<出る>」は *声の出所が X* という意味しか持たない。
 *   だから主語の「が」と同格の手がかりとして扱える。
 *   ただし器官は発声部位に限定し、<声>の直後は「が」限定、否定は弾く（安全側）。
 *
 * ■このテストが固定するもの（形ではなく振る舞い。期待値は具体値で書く）
 *   実機で捕獲した文で `voice-source` が立ち、話者が「ひなた」になること。
 *   そして**拾ってはいけない型**（打ち消し／目的語形／一般語／語順違い）を拾わないこと。
 *   既存の「が」型を1件も壊していないこと。
 *
 * ■このプロジェクトの決まりに対する備え
 *   ★両辺が null なら等しくなって偽の合格が出る → 期待値は具体値で書く。
 *   ★「異常0件」だけを信じない → **既知の人工1件（＝実機で捕獲した文）を毎回通してから**
 *     否定側を判定する（下の neg() は canary が生きていることを毎回確かめる）。
 *   ★モック localStorage は setItem したキーが Object.keys(localStorage) にも見えること。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRCPATH = path.join(__dirname, 'v292Dfix469-speaker-score.js');
const SRC = fs.readFileSync(SRCPATH, 'utf8');

/* ---------- モック localStorage ----------
   ★setItem したキーが Object.keys(localStorage) にも見えること。
   メソッド類は non-enumerable にして、格納キーだけが列挙されるようにする。 */
function mkLS(){
  const store = {}, ls = {};
  Object.defineProperties(ls, {
    getItem:    { value: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null },
    setItem:    { value: (k, v) => { store[k] = String(v);
                    Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: k => { delete store[k]; delete ls[k]; } },
    clear:      { value: () => { Object.keys(store).forEach(k => { delete store[k]; delete ls[k]; }); } },
    key:        { value: i => Object.keys(store)[i] },
    length:     { get(){ return Object.keys(store).length; } }
  });
  return ls;
}

/* ---------- ①実装の切り出し（narrationEmoter とその依存だけを走らせる） ----------
   v292Dfix469-speaker-score.js は巨大なので、感情主ブリッジの区間だけを切り出して回す。
   ★切り出し範囲がずれたら気づけるように、境界と中身を**先に**検査する。 */
const CUT_BEGIN = "  var EMO_BODY = ";
const CUT_END   = "  // ---------- 分裂防止: 名前正規化";
const iBegin = SRC.indexOf(CUT_BEGIN), iEnd = SRC.indexOf(CUT_END);
const SLICE = (iBegin >= 0 && iEnd > iBegin) ? SRC.slice(iBegin, iEnd) : '';

console.log('\n== fix604: 切り出し範囲の同一性検査（実装が動いたら気づけるように） ==');
ok('★切り出し開始アンカーが実ファイルに存在する', iBegin >= 0, iBegin);
ok('★切り出し終了アンカーが実ファイルに存在し、開始より後ろにある', iEnd > iBegin, { iBegin, iEnd });
ok('★切り出した文字列が実ファイルに現在も存在する', SLICE.length > 0 && SRC.indexOf(SLICE) === iBegin, SLICE.length);
['VOICE_ORIFICE', 'VOICE_NOUN', 'VOICE_EMIT', 'VOICE_NEG', 'voiceSourceRe', 'voiceSourceHit', 'narrationEmoter']
  .forEach(id => ok('切り出しに ' + id + ' の定義が含まれる', SLICE.indexOf('var ' + id) >= 0 || SLICE.indexOf('function ' + id) >= 0));
ok('★fix604 の定義は切り出し区間の中にしかない（区間外に別定義が生えていない）',
   SRC.indexOf('var VOICE_ORIFICE') >= iBegin && SRC.indexOf('var VOICE_ORIFICE') < iEnd &&
   SRC.indexOf('var VOICE_ORIFICE', SRC.indexOf('var VOICE_ORIFICE') + 1) < 0, SRC.indexOf('var VOICE_ORIFICE'));
ok('★切り出した narrationEmoter が本番パイプライン(planTurn)から実際に呼ばれている',
   SRC.indexOf('narrationEmoter(prev, next, heroName, allTokens)') > iEnd);
ok('OFFスイッチのキー名が v292Dfix604Off である',
   SLICE.indexOf("localStorage.getItem('v292Dfix604Off') === '1'") >= 0);
ok('reasons の値が narration-emoter / voice-source の2種である',
   SLICE.indexOf("'narration-emoter'") >= 0 && SLICE.indexOf("'voice-source'") >= 0);
{
  /* 既存の「が」型が一致したら continue で抜け、外れた時だけ fix604 の呼び出しに落ちる。
     ※ voiceSourceHit は定義が先に出てくるので、比べるのは**呼び出し側**の位置。 */
  const iGa   = SLICE.indexOf("why[canon] = 'narration-emoter'; continue;");
  const iKara = SLICE.indexOf("if (useVoice && voiceSourceHit(text, tk))");
  ok('★既存の「が」型が先に見られ、外れた時だけ fix604 を見る（順序）',
     iGa >= 0 && iKara > iGa, { iGa, iKara });
  ok('★fix604 の呼び出しは OFFスイッチ(useVoice)で必ず守られている', iKara >= 0, iKara);
}

const LS = mkLS();
const API = new Function('localStorage',
  SLICE + '\n return { narrationEmoter: narrationEmoter, voiceSourceHit: voiceSourceHit, voiceSourceRe: voiceSourceRe };')(LS);

console.log('\n== fix604: モック localStorage の自己検査 ==');
{
  LS.setItem('__probe', '1');
  ok('★setItem したキーが Object.keys(localStorage) に見える', Object.keys(LS).indexOf('__probe') >= 0, Object.keys(LS));
  ok('getItem が具体値を返す', LS.getItem('__probe') === '1', LS.getItem('__probe'));
  LS.removeItem('__probe');
  ok('removeItem で列挙からも消える', Object.keys(LS).indexOf('__probe') < 0 && LS.getItem('__probe') === null, Object.keys(LS));
}

/* ---------- 共通の登場人物 ---------- */
const HERO   = '白石澪';
const TOKENS = [{ tok: 'ひなた', canon: 'ひなた' }, { tok: 'ナナミ', canon: 'ナナミ' },
                { tok: 'リカ', canon: 'リカ' }, { tok: '白石', canon: HERO }, { tok: '澪', canon: HERO }];
const NE = (text, tokens) => API.narrationEmoter('', text, HERO, tokens || TOKENS);

/* ★実機で捕獲した既知の1件。これが立たないうちは否定側の「立たない」を信用しない。 */
const REAL = 'ひなたの喉の奥から、引きつったような声が漏れる。';
const canary = () => { const r = NE(REAL); return !!(r && r.to === 'ひなた' && r.reasons && r.reasons[0] === 'voice-source'); };
/* 否定側の判定は必ず canary 同伴で行う（ハーネスが壊れて全部 null になる偽合格を防ぐ） */
const neg = (name, text, tokens) => {
  const r = NE(text, tokens);
  ok(name, r === null && canary(), { got: r, canary: canary() });
};

console.log('\n== fix604 ①: 実機で捕獲した文そのもの（既知の人工1件） ==');
{
  const r = NE(REAL);
  ok('★voice-source が立つ', r !== null && r.reasons[0] === 'voice-source', r);
  ok('★話者が「ひなた」になる', r !== null && r.to === 'ひなた', r);
  ok('reasons は1件だけ', r !== null && r.reasons.length === 1, r);
  ok('voiceSourceHit 単体でも true', API.voiceSourceHit(REAL, 'ひなた') === true, API.voiceSourceHit(REAL, 'ひなた'));
  ok('主人公トークンでは voiceSourceHit が false', API.voiceSourceHit(REAL, '澪') === false, API.voiceSourceHit(REAL, '澪'));
}
{
  /* 器官の言い換え（口元）でも同じ扱いになる */
  const r = NE('ひなたの口元から、ちいさな呟きが零れた。');
  ok('「Xの口元から…呟きが零れた」も voice-source / ひなた',
     r !== null && r.to === 'ひなた' && r.reasons[0] === 'voice-source', r);
}

console.log('\n== fix604 ②: 打ち消しを弾く（X は喋っていない） ==');
neg('★「ひなたの喉から声が漏れることはなかった。」→ 立たない', 'ひなたの喉から声が漏れることはなかった。');
neg('★「ひなたの口からは何の声も漏れなかった。」→ 立たない', 'ひなたの口からは何の声も漏れなかった。');
ok('voiceSourceHit 単体でも打ち消しは false',
   API.voiceSourceHit('ひなたの喉から声が漏れることはなかった。', 'ひなた') === false);

console.log('\n== fix604 ③: 目的語形は拾わない（安全側で棄権） ==');
neg('★「ひなたの喉から漏れた声を、澪は聞いた。」→ 立たない', 'ひなたの喉から漏れた声を、澪は聞いた。');

console.log('\n== fix604 ④: 一般語を発声器官と誤認しない ==');
neg('★「ひなたの記憶の奥から声が蘇る。」→ 立たない', 'ひなたの記憶の奥から声が蘇る。');
neg('「ひなたの鞄の奥から声が漏れる。」→ 立たない（鞄は発声器官ではない）', 'ひなたの鞄の奥から声が漏れる。');

console.log('\n== fix604 ⑤: 名前が器官の前に無ければ立たない（語順） ==');
{
  /* 「ラジオからひなたの声が漏れる」は fix604 の型ではない。
     ただしこの文は**既存の「が」型**(ひなたの声が漏れる)に当たるので、
     ここで固定するのは「voice-source では**ない**」こと。 */
  const r = NE('ラジオからひなたの声が漏れる。');
  ok('★voice-source としては立たない', r !== null && r.reasons[0] === 'narration-emoter', r);
  ok('（既存の「が」型としての挙動は従来どおり ひなた）', r !== null && r.to === 'ひなた', r);
}
neg('★「スピーカーの奥からひなたの吐息が漏れる。」→ どちらも立たない',
    'スピーカーの奥からひなたの吐息が漏れる。');

console.log('\n== fix604 ⑥: 既存の「が」型の振る舞いを壊していない ==');
{
  const r = NE('ひなたの体が弓なりに反った。');
  ok('★「ひなたの体が弓なりに反った」→ ひなた', r !== null && r.to === 'ひなた', r);
  ok('★reasons は narration-emoter のまま', r !== null && r.reasons[0] === 'narration-emoter', r);
  const r2 = NE('ナナミの肩が、びくりと跳ねた。');
  ok('「ナナミの肩が…跳ねた」→ ナナミ / narration-emoter',
     r2 !== null && r2.to === 'ナナミ' && r2.reasons[0] === 'narration-emoter', r2);
}

console.log('\n== fix604 ⑦: 過去の大事故（リカ）の再発防止 ==');
{
  /* 「は」＝完結描写型。fix604 で「から」を足しても、ここは依然として立たない。 */
  const r = NE('リカの声は震えていなかった。');
  ok('★「リカの声は震えていなかった。」→ 立たない', r === null && canary(), { got: r, canary: canary() });
  ok('voiceSourceHit 単体でも false', API.voiceSourceHit('リカの声は震えていなかった。', 'リカ') === false);
  neg('「リカの声を、澪は思い出していた。」→ 立たない', 'リカの声を、澪は思い出していた。');
}

console.log('\n== fix604 ⑧: 主人公は対象外 ==');
neg('★heroName と一致するトークンでは立たない（澪 → 白石澪）', '澪の喉の奥から、引きつったような声が漏れる。');
neg('フル名でも立たない（白石 → 白石澪）', '白石の喉の奥から、引きつったような声が漏れる。');

console.log('\n== fix604 ⑨: 1文字トークンは対象外 ==');
{
  const one = [{ tok: '凛', canon: '凛' }];
  const r = API.narrationEmoter('', '凛の喉の奥から声が漏れる。', HERO, one);
  ok('★1文字トークンでは立たない', r === null && canary(), { got: r, canary: canary() });
  /* 同じ文型でも2文字なら立つ＝「文が悪い」のではなく「1文字だから外した」ことを示す */
  const r2 = API.narrationEmoter('', 'ひなたの喉の奥から声が漏れる。', HERO, [{ tok: 'ひなた', canon: 'ひなた' }]);
  ok('★同じ文型でも2文字トークンなら voice-source / ひなた',
     r2 !== null && r2.to === 'ひなた' && r2.reasons[0] === 'voice-source', r2);
}

console.log('\n== fix604 ⑩: 該当が1人に絞れない時は棄権 ==');
neg('★2人該当なら棄権（ひなた＋ナナミ）',
    'ひなたの喉の奥から声が漏れる。ナナミの喉から低い呻きが漏れた。');
neg('★0人なら棄権', '風が鳴っただけだった。');
{
  /* 「が」型 と 「から」型 が別人に1件ずつでも、絞れないので棄権する */
  const r = NE('ひなたの喉の奥から声が漏れる。ナナミの肩がびくりと跳ねた。');
  ok('★「が」型と「から」型が別人に立っても棄権', r === null && canary(), { got: r, canary: canary() });
}

console.log('\n== fix604 ⑪: OFFスイッチは追加分だけを止める ==');
{
  LS.setItem('v292Dfix604Off', '1');
  ok('OFFキーが Object.keys(localStorage) に見える', Object.keys(LS).indexOf('v292Dfix604Off') >= 0, Object.keys(LS));
  ok('★OFF: 実機で捕獲した文は立たなくなる', NE(REAL) === null, NE(REAL));
  const g = NE('ひなたの体が弓なりに反った。');
  ok('★OFFでも既存の「が」型は生きている（ひなた / narration-emoter）',
     g !== null && g.to === 'ひなた' && g.reasons[0] === 'narration-emoter', g);
  LS.removeItem('v292Dfix604Off');
  const back = NE(REAL);
  ok('★OFFを外すと元に戻る（voice-source / ひなた）',
     back !== null && back.to === 'ひなた' && back.reasons[0] === 'voice-source', back);
}

console.log('\n== fix604 ⑫: reasons で「が」型と「から」型を区別できる ==');
{
  const a = NE(REAL), b = NE('ひなたの体が弓なりに反った。');
  ok('★同じ話者でも理由が違う', a.to === b.to && a.reasons[0] !== b.reasons[0],
     { kara: a.reasons[0], ga: b.reasons[0] });
  ok('★「から」型は voice-source（具体値）', a.reasons[0] === 'voice-source', a.reasons[0]);
  ok('★「が」型は narration-emoter（具体値）', b.reasons[0] === 'narration-emoter', b.reasons[0]);
}

/* ---------- ②本番パイプライン(planTurn)を通した端から端まで ----------
   切り出しが正しくても、実際のカードが直らなければ意味がない。
   実機で捕獲したターンの並びをそのまま流し、会話ログの who が変わることを確かめる。 */
function loadFull(){
  const ls = mkLS();
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}, setAttribute(){}, style: {}, remove(){}, classList: { add(){}, remove(){}, contains: () => false } };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList: { add(){}, remove(){} } }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' }, location: { href: 'x', search: '' } };
  w.window = w;
  w.S = { cast: { hero: { name: HERO }, npcs: [{ name: 'ひなた' }, { name: 'ナナミ' }] }, turns: [], save(){} };
  vm.runInContext(SRC, vm.createContext(w), { filename: 'fix469' });
  return w;
}
const W = loadFull();
const NAMES = [HERO, 'ひなた', 'ナナミ'];
const TOKS  = W.__v292Dfix469.tokensOf(NAMES);
const PROFS = W.__v292Dfix469.profiles(W.S);
/* 実機で捕獲したターン: 引用の**次の行**が「ひなたの喉の奥から…」 */
const realTurn = () => ({ narrative: ['澪は息を呑んだ。', '「……ぇ」', REAL].join('\n'),
                          playerText: '', _convSays: [{ who: HERO, say: '「……ぇ」' }] });
const gaTurn   = () => ({ narrative: ['澪は息を呑んだ。', '「……っ」', 'ひなたの体が弓なりに反った。'].join('\n'),
                          playerText: '', _convSays: [{ who: HERO, say: '「……っ」' }] });

console.log('\n== fix604 ⑬: 本番パイプライン(planTurn)を通した実機ターン ==');
{
  const t = realTurn();
  const p = W.__v292Dfix469.planTurn(t, NAMES, TOKS, PROFS, false);
  ok('★カードの話者が 白石澪 →「ひなた」に直る', t._convSays[0].who === 'ひなた', t._convSays[0]);
  ok('★変更理由が voice-source として記録される',
     p.changes.length === 1 && p.changes[0].act === 'toneFix' && p.changes[0].why === 'voice-source' &&
     p.changes[0].from === HERO && p.changes[0].to === 'ひなた', p.changes);
  ok('台詞そのものは書き換えない', t._convSays[0].say === '「……ぇ」', t._convSays[0]);
  ok('カードは1枚のまま（削除しない）', t._convSays.length === 1, t._convSays);
}
{
  const t = gaTurn();
  const p = W.__v292Dfix469.planTurn(t, NAMES, TOKS, PROFS, false);
  ok('★既存の「が」型もパイプラインで従来どおり直る（理由は narration-emoter）',
     t._convSays[0].who === 'ひなた' && p.changes.length === 1 && p.changes[0].why === 'narration-emoter', p.changes);
}

console.log('\n== fix604 ⑭: パイプラインでもOFFは追加分だけを止める ==');
{
  W.localStorage.setItem('v292Dfix604Off', '1');
  const t = realTurn();
  const p = W.__v292Dfix469.planTurn(t, NAMES, TOKS, PROFS, false);
  ok('★OFF: 実機ターンは主人公タグのまま（fix604 が止まる）', t._convSays[0].who === HERO, t._convSays[0]);
  ok('★OFF: 変更なし', p.changes.length === 0, p.changes);
  const t2 = gaTurn();
  const p2 = W.__v292Dfix469.planTurn(t2, NAMES, TOKS, PROFS, false);
  ok('★OFFでも「が」型は直る（既存機能は止まらない）',
     t2._convSays[0].who === 'ひなた' && p2.changes.length === 1 && p2.changes[0].why === 'narration-emoter', p2.changes);
  W.localStorage.removeItem('v292Dfix604Off');
  const t3 = realTurn();
  W.__v292Dfix469.planTurn(t3, NAMES, TOKS, PROFS, false);
  ok('★OFFを外すと再び直る', t3._convSays[0].who === 'ひなた', t3._convSays[0]);
}

console.log('\n== fix604 ⑮: セーブ非破壊（chr6* を触らない） ==');
{
  const keys = Object.keys(W.localStorage);
  ok('★chr6* のキーを1つも書いていない', keys.filter(k => /^chr6/.test(k)).length === 0, keys);
  ok('書き込み先は診断ログ(v292Dfix469_toneshadow)だけ',
     keys.filter(k => k !== 'v292Dfix469_toneshadow').length === 0, keys);
  const dump = W.__v292Dfix469.toneDump();
  ok('★診断ログに voice-source の記録が残る',
     dump.some(r => r && r.why === 'voice-source' && r.to === 'ひなた'), dump.map(r => r && r.why));
}

/* =====================================================================
 * ★fix604 追補（2026-07-27）: VOICE_NEG に 未遂・伝聞・推量 を足したぶんの固定
 *
 * GPT が指定した棄権例をそのまま期待値にする。
 *   未遂  「Xの喉から声が漏れそうになった（が、出なかった）」→ 実際には声が出ていない
 *   伝聞  「Xの喉から声が漏れたように聞こえた」            → 聞き手の主観であって事実ではない
 *   推量  「Xの喉から声が漏れたかのようだった」            → 同上
 *   回想  「あの時Xの喉から漏れた声を思い出した」          → いま喋っているのは思い出している側
 *   模倣  「YはXの喉から漏れる声を真似した」               → いま喋っているのは Y
 *   録音  「ラジオからXの声が流れた」                      → 発話者はその場にいない
 * ★回想・模倣・録音は VOICE_NEG ではなく**構文の側**（<声>の直後が「が」でない／
 *   名前＋器官の並びが無い）で落ちる。どちらで落ちているかまで固定しておく。
 * ★逆に **正当な例が棄権に倒れていない**ことを必ず併せて確かめる
 *   （打ち消しの網を広げると、本来立つべき文まで落ちるのが典型的な副作用）。
 * ===================================================================== */
console.log('\n== fix604 ⑯: 未遂・伝聞・推量は棄権する（VOICE_NEG の追加分） ==');
neg('★★未遂+否定「ひなたの喉から声が漏れそうになったが、出なかった」→ 棄権',
    'ひなたの喉から声が漏れそうになったが、出なかった。');
neg('★★未遂「ひなたの喉から声が漏れそうになった」→ 棄権',
    'ひなたの喉から声が漏れそうになった。');
neg('★★伝聞「ひなたの喉から声が漏れたように聞こえた」→ 棄権',
    'ひなたの喉から声が漏れたように聞こえた。');
neg('★★推量「ひなたの喉から声が漏れたかのようだった」→ 棄権',
    'ひなたの喉から声が漏れたかのようだった。');
neg('推量「ひなたの喉から声が漏れるようだ」→ 棄権', 'ひなたの喉から声が漏れるようだ。');
neg('推量「ひなたの喉から声が漏れるらしかった」→ 棄権', 'ひなたの喉から声が漏れるらしかった。');
neg('推量「ひなたの喉から声が漏れた気がした」→ 棄権', 'ひなたの喉から声が漏れた気がした。');
{
  /* ★どこで落ちているかを名指しで固定する。
     ⑯ は「構文としては当たっているが、続きの打ち消しで棄権した」型。
     voiceSourceRe（打ち消しを見ない生の型）は当たり、voiceSourceHit は false になる。 */
  const T = ['ひなたの喉から声が漏れそうになった。',
             'ひなたの喉から声が漏れたように聞こえた。',
             'ひなたの喉から声が漏れたかのようだった。'];
  const re = API.voiceSourceRe('ひなた');
  ok('★★構文としては当たっている（＝落としているのは打ち消しの側だと確定する）',
     T.every(t => re.test(t)), T.filter(t => !re.test(t)));
  ok('★★それでも voiceSourceHit は全部 false', T.every(t => API.voiceSourceHit(t, 'ひなた') === false),
     T.filter(t => API.voiceSourceHit(t, 'ひなた') !== false));
}

console.log('\n== fix604 ⑰: 回想・模倣・録音は構文の側で落ちる ==');
neg('★★回想「あの時ひなたの喉から漏れた声を思い出した」→ 棄権',
    'あの時ひなたの喉から漏れた声を思い出した。');
neg('★★模倣「澪はひなたの喉から漏れる声を真似した」→ 棄権',
    '澪はひなたの喉から漏れる声を真似した。');
{
  /* ★録音: 名前が器官の前に無いので、この型では立たない。 */
  const t = 'ラジオからひなたの声が流れた。';
  ok('★★録音「ラジオからひなたの声が流れた」→ voice-source としては立たない',
     API.voiceSourceHit(t, 'ひなた') === false, API.voiceSourceHit(t, 'ひなた'));
  ok('★録音: 感情主ブリッジ全体としても立たない（棄権）', NE(t) === null && canary(), { got: NE(t), canary: canary() });
}
{
  /* ★★落ち方の内訳を固定する。回想・模倣は **打ち消しではなく構文** で落ちている。
     voiceSourceRe（打ち消しを見ない生の型）すら当たらないことが、その証拠。 */
  const T = ['あの時ひなたの喉から漏れた声を思い出した。',
             '澪はひなたの喉から漏れる声を真似した。',
             'ラジオからひなたの声が流れた。'];
  const re = API.voiceSourceRe('ひなた');
  ok('★★生の型すら当たらない（＝VOICE_NEG に頼っていない）',
     T.every(t => re.test(t) === false), T.filter(t => re.test(t)));
}

console.log('\n== fix604 ⑱: ★打ち消しを広げても、正当な例が棄権に倒れていない ==');
{
  /* ★VOICE_NEG に語を足すと、本来立つべき文まで落ちるのが典型的な副作用。
     実機で捕獲した1件が**引き続き立つ**ことを、追加分のすぐ隣で必ず確かめる。 */
  const r = NE(REAL);
  ok('★★「ひなたの喉の奥から、引きつったような声が漏れる。」は引き続き立つ',
     r !== null && r.to === 'ひなた' && r.reasons[0] === 'voice-source', r);
  ok('★voiceSourceHit 単体でも引き続き true', API.voiceSourceHit(REAL, 'ひなた') === true);
  /* 「〜ような」を含むが打ち消しではない文（"引きつったような声" と同型）も倒れない */
  const r2 = NE('ひなたの喉から、絞り出すような呻きが漏れた。');
  ok('★★「絞り出すような呻きが漏れた」も立つ（"ような"だけで棄権しない）',
     r2 !== null && r2.to === 'ひなた' && r2.reasons[0] === 'voice-source', r2);
  const r3 = NE('ひなたの口元から、ちいさな呟きが零れた。');
  ok('★言い換え（口元・呟き・零れた）も引き続き立つ',
     r3 !== null && r3.to === 'ひなた' && r3.reasons[0] === 'voice-source', r3);
  const r4 = NE('ひなたの唇から、掠れた声が押し出された。');
  ok('★言い換え（唇・押し出された）も立つ',
     r4 !== null && r4.to === 'ひなた' && r4.reasons[0] === 'voice-source', r4);
  const g = NE('ひなたの体が弓なりに反った。');
  ok('★既存の「が」型も倒れていない（narration-emoter / ひなた）',
     g !== null && g.to === 'ひなた' && g.reasons[0] === 'narration-emoter', g);
}

/* =====================================================================
 * ★★GPT からの重要な指摘の検証（2026-07-27）
 *
 *   > 「④1文字トークンは除外」が**発話本文**へ適用されるなら、今回の「……ぇ」は
 *   > 記号除去後に「ぇ」1文字となり、fix604 を入れても救済されない可能性がある。
 *
 * 実装(v292Dfix469-speaker-score.js)を読んで確かめた結果:
 *   1文字（および2文字未満）の除外は **人物名トークン / who ラベルにだけ** 掛かっている。
 *     L116 `p.length >= 2`      … 名前を空白で割った断片（名前）
 *     L122 `t.length === 1`     … tokensOf が作る名前トークン
 *     L152 `w.length < 2`       … _convSays の who ラベル
 *     L586 `tk.length < 2`      … narrationEmoter が見る名前トークン
 *   発話本文の長さを見ている箇所は **score() の L318 ただ1つ** で、そこは
 *     `POLITE_STD.test(text) && text.length >= 8` ＝ **長いときにだけ減点する**ガードであり、
 *   短い台詞は「何もされない」側に落ちる。**カードを落とす経路は無い**。
 * 下でソースの側と振る舞いの側の両方から固定する。
 * ===================================================================== */
console.log('\n== fix604 ⑲: ★「1文字除外」は人物名トークンにだけ掛かる（発話本文には掛からない） ==');
{
  /* ①ソースにある長さ比較を**全部**拾い、発話本文を落とす経路が無いことを確かめる。
     行番号ではなく行の中身で照合する（行がずれても気づけるように）。 */
  const lenLines = SRC.split('\n')
    .map((l, i) => ({ n: i + 1, s: l.trim() }))
    .filter(o => /\.length\s*(===|==|<|<=|>=|>)\s*\d/.test(o.s));
  ok('★長さ比較の行数が想定どおり（増えていたら中身を見直す合図）', lenLines.length === 14, lenLines.map(o => o.n));
  const nameSide = [
    'if (p.length >= 2) cand[p] = 1;',                      // 名前の断片
    'if (t.length === 1 && !KANJI.test(t)) return;',        // 名前トークン
    'if (w.length < 2 || PRONOUN_WHO.indexOf(w) >= 0) return;', // who ラベル
    'canon === heroName || tk.length < 2'                   // narrationEmoter の名前トークン
  ];
  nameSide.forEach(sig => ok('★1文字/2文字未満の除外は名前側にある: ' + sig.slice(0, 40),
                             SRC.indexOf(sig) >= 0, sig));
  /* ②発話本文の長さを見ている唯一の箇所が「減点を控えるだけ」であることを固定する */
  ok('★★発話本文の長さを見るのは score() の1箇所だけ',
     (SRC.match(/text\.length >= 8/g) || []).length === 1, (SRC.match(/text\.length >= 8/g) || []).length);
  ok('★★そこは「長いときだけ減点する」ガードであり、カードを落とさない',
     /else if \(POLITE_STD\.test\(text\) && text\.length >= 8\) add\(p\.name, -35\);/.test(SRC));
  /* ③「本文が短いから落とす」形のコードが**存在しない**ことを確かめる */
  ['say.length <', 'say.length <=', 'norm(c.say).length', 'norm(say).length',
   'quote.length <', 'c.say.length <'].forEach(bad =>
     ok('★発話本文の長さで落とす経路が無い: ' + bad, SRC.indexOf(bad) < 0, bad));
  /* ④正規化そのものの確認: 「……ぇ」は記号除去後ちょうど1文字になる（GPT の前提は正しい） */
  const normSrc = /function norm\(s\)\{[^\n]*\}/.exec(SRC);
  ok('★norm() を実ファイルから切り出せた', !!normSrc, normSrc && normSrc[0]);
  const norm = new Function('return ' + normSrc[0].replace('function norm', 'function'))();
  ok('★★「「……ぇ」」は記号除去後ちょうど1文字「ぇ」になる（GPT の前提は事実）',
     norm('「……ぇ」') === 'ぇ' && norm('「……ぇ」').length === 1, norm('「……ぇ」'));
  ok('「「……っ」」も1文字「っ」', norm('「……っ」') === 'っ', norm('「……っ」'));
  ok('「「……」」は0文字になる（本文が記号だけの場合）', norm('「……」') === '', norm('「……」'));
  /* ⑤0文字のときの扱いは「落とす」ではなく「不触」であることを固定する */
  ok('★★正規化して0文字なら findLine は -1 を返す＝判断材料なしで不触（削除ではない）',
     /var q = norm\(quote\); if \(!q\) return -1;/.test(SRC) &&
     /if \(at < 0\)\{ out\.push\(c\); continue; \}/.test(SRC));
}

console.log('\n== fix604 ⑳: 実データ「……ぇ」を正規化から最終帰属まで通す（end-to-end） ==');
{
  /* ★切り出しでもソース検査でもなく、**本番パイプラインに1文字本文をそのまま流して**
     カードの話者が最後まで直ることを確かめる。ここが通れば GPT の懸念は事実として否定できる。 */
  const W2 = loadFull();
  const toks = W2.__v292Dfix469.tokensOf(NAMES);
  const profs = W2.__v292Dfix469.profiles(W2.S);
  const run = t => { const p = W2.__v292Dfix469.planTurn(t, NAMES, toks, profs, false); return p; };

  const t1 = { narrative: ['澪は息を呑んだ。', '「……ぇ」', REAL].join('\n'),
               playerText: '', _convSays: [{ who: HERO, say: '「……ぇ」' }] };
  const p1 = run(t1);
  ok('★★1文字本文「……ぇ」でもカードが見つかり、話者が「ひなた」へ直る',
     t1._convSays[0].who === 'ひなた', t1._convSays[0]);
  ok('★★理由は voice-source（fix604 の型で救われている）',
     p1.changes.length === 1 && p1.changes[0].act === 'toneFix' && p1.changes[0].why === 'voice-source',
     p1.changes);
  ok('★台詞そのものは1文字も書き換えない', t1._convSays[0].say === '「……ぇ」', t1._convSays[0]);
  ok('★★カードは1枚のまま（短いことを理由に落とされていない）', t1._convSays.length === 1, t1._convSays);

  /* ★同じ1文字本文でも既存の「が」型で直る＝「短いから救えない」経路がそもそも無い */
  const t2 = { narrative: ['澪は息を呑んだ。', '「……っ」', 'ひなたの体が弓なりに反った。'].join('\n'),
               playerText: '', _convSays: [{ who: HERO, say: '「……っ」' }] };
  const p2 = run(t2);
  ok('★★1文字本文「……っ」も既存の「が」型で直る（narration-emoter / ひなた）',
     t2._convSays[0].who === 'ひなた' && p2.changes.length === 1 && p2.changes[0].why === 'narration-emoter',
     p2.changes);

  /* ★正規化して0文字になる本文は「不触」であって「削除」ではない */
  const t3 = { narrative: ['澪は息を呑んだ。', '「……」', REAL].join('\n'),
               playerText: '', _convSays: [{ who: HERO, say: '「……」' }] };
  const p3 = run(t3);
  ok('★★正規化して0文字の本文はカードが残る（黙って消さない）',
     t3._convSays.length === 1 && t3._convSays[0].say === '「……」', t3._convSays);
  ok('★その場合は話者も触らない（判断材料なし＝主人公タグのまま）',
     t3._convSays[0].who === HERO && p3.changes.length === 0, { who: t3._convSays[0].who, changes: p3.changes });

  /* ★長い本文でも同じ結果になる＝長さは結論に効いていない */
  const t4 = { narrative: ['澪は息を呑んだ。', '「……どうして、そんなことを言うの」', REAL].join('\n'),
               playerText: '', _convSays: [{ who: HERO, say: '「……どうして、そんなことを言うの」' }] };
  const p4 = run(t4);
  ok('★★長い本文でも同じく voice-source で「ひなた」へ直る（長さは結論に効かない）',
     t4._convSays[0].who === 'ひなた' && p4.changes.length === 1 && p4.changes[0].why === 'voice-source',
     p4.changes);

  ok('★end-to-end でもセーブ本体(chr6*)を書いていない',
     Object.keys(W2.localStorage).filter(k => /^chr6/.test(k)).length === 0,
     Object.keys(W2.localStorage));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
