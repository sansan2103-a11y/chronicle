/* 回帰テスト: v292Dfix640 — 証拠台帳（採取・分類・貯蔵）
 *
 * このテストが固定する契約:
 *   (0) 真因の固定 … §8 auto_bootstrap は !window.S で死んでいる／window.S は誰も代入しない
 *   (1) fix640 は **物語データを1バイトも書かない**（S.cast / S.turns / save は不触）
 *   (2) 証拠の分類が GPT裁定どおり（強4種 / 弱4種）
 *   (3) `<say who>` は plan.narrative（段落の配列）から取れる
 *   (4) 役割語（宿の主人）は roleWord として記録され、一意解決できたときだけ resolvedTo が入る
 *   (5) 回想だけのターンは distinctSeenTurns に数えない
 *   (6) hero は台帳にも積まない
 *   (7) 1ターンは1回しか走査しない（cursor）／ターンが減ったら台帳を作り直す
 *   (8) **fix277 の準登録カルテキーに触れない**（読みも書きもしない）
 *   (9) スロット別キー／OFF／冪等／index.html 配線
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC640 = read('v292Dfix640-cast-evidence-ledger.js');
const FEAT   = read('features.js');
const HTML   = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
const HTMLU  = Buffer.from(HTML, 'latin1').toString('utf8');

function extractAccessor(){
  const i = HTML.indexOf('(function v292Dfix539(){');
  const j = HTML.indexOf('})();', i);
  return Buffer.from(HTML.slice(i, j + 5), 'latin1').toString('utf8');
}

/* ---- モック window（★localStorage は Object.keys に見える実体を持つ） ---- */
function mkWin(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const reads = [], writes = [];
  const ls = {
    getItem: k => { reads.push(k); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: (k, v) => { writes.push(k); store[k] = String(v); },
    removeItem: k => { writes.push(k); delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const warns = [], logs = [];
  const w = {
    localStorage: ls,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    document: { readyState: 'complete', addEventListener(){} },
    UI: opts.noUI ? undefined : { _renderHooks: [], appendTurn: function(){ return 'orig'; } },
    __chr6Key: () => opts.slotKey || 'chr6'
  };
  if (opts.helpers) w.__v292 = { autoBootstrap: opts.helpers };
  w.window = w; w.__store = store; w.__warns = warns; w.__logs = logs; w.__reads = reads; w.__writes = writes;
  return w;
}
function boot(w, S, src){
  const ctx = vm.createContext(w);
  w.__seed = S;
  vm.runInContext('let S = __seed;\n' + extractAccessor() + '\n', ctx, { filename: 'index.html:fix539' });
  vm.runInContext(src || SRC640, ctx, { filename: 'fix640' });
  return ctx;
}
function mkS(hero, npcs, turns){
  const s = { cast: { hero: hero || { name: '' }, npcs: npcs || [] }, turns: turns || [], saved: 0 };
  s.save = function(){ s.saved++; };
  return s;
}
/* plan.narrative は**段落の配列**（fix608 の実測）。テストも同じ形で作る。 */
function T(paras, narrative){
  return { plan: { narrative: Array.isArray(paras) ? paras : [String(paras || '')] },
           narrative: narrative === undefined ? '' : narrative, playerText: '' };
}

console.log('\n== (0) 真因の固定 ==');
{
  ok('★index.html の S はトップレベル const', HTMLU.indexOf('const S = {') >= 0);
  ok('★window.S への代入がどこにも無い', !/window\.S\s*=[^=]/.test(HTMLU));
  ok('★features.js §8 auto_bootstrap は !window.S で即 return',
     FEAT.indexOf('if (!window.S || !S.cast) return;') >= 0);
  ok('★fix640 は window.S を新設しない（休眠コード約40箇所を起こさない）',
     !/window\.S\s*=[^=]/.test(SRC640));
  ok('★fix640 は fix539 の正式APIを第一経路にする', SRC640.indexOf("__chronicleGetState") >= 0);
}

console.log('\n== (1) 物語データを1バイトも書かない ==');
{
  const S = mkS({ name: '' }, [], [
    T(['<say who="白石澪">「おはよう」</say>', '<state who="白石澪" からだ="立っている"/>']),
    T(['<say who="白石澪">「行こう」</say>', '<state who="白石澪" からだ="歩く"/>'])
  ]);
  const before = JSON.stringify(S);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  ok('★S が1文字も変わらない', JSON.stringify(S) === before, { before, after: JSON.stringify(S) });
  ok('★S.save を呼ばない', S.saved === 0);
  const keys = Object.keys(w.__store);
  ok('★書いたのは自前キーだけ', keys.length === 1 && keys[0] === 'v292Dfix640Evid_slot_chr6', keys);
  ok('★cast.npcs は空のまま（昇格はしない＝fix641 の仕事）', S.cast.npcs.length === 0);
}

console.log('\n== (2) 証拠の分類（強4種 / 弱4種） ==');
{
  const w = mkWin(); boot(w, mkS());
  const f = w.__v292Dfix640;
  ok('★強い証拠は say_who / state_tag / introduction / appearance_stable の4種',
     JSON.stringify(f.STRONG_KINDS.slice().sort()) ===
     JSON.stringify(['appearance_stable', 'introduction', 'say_who', 'state_tag']), f.STRONG_KINDS);
  ok('★弱い証拠は prose_name / react / recall / role_word の4種',
     JSON.stringify(f.WEAK_KINDS.slice().sort()) ===
     JSON.stringify(['prose_name', 'react', 'recall', 'role_word']), f.WEAK_KINDS);
  ['say_who', 'state_tag', 'introduction', 'appearance_stable'].forEach(k =>
    ok('強と判定: ' + k, f.isStrong(k) === true));
  ['prose_name', 'react', 'recall', 'role_word'].forEach(k =>
    ok('★弱と判定: ' + k, f.isStrong(k) === false));
  ok('★_convSays の who は証拠の種類として存在しない（推測のロンダリングをしない）',
     f.STRONG_KINDS.concat(f.WEAK_KINDS).indexOf('convlog_who') < 0);
  /* コメントには「なぜ使わないか」を書いてある。**コードとして**参照していないことを固定する。 */
  const CODE640 = SRC640.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
                        .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  ok('★fix640 は _convSays をコードで読まない', CODE640.indexOf('_convSays') < 0);
}

console.log('\n== (3) plan.narrative（段落の配列）から <say who> を採る ==');
{
  const S = mkS({ name: '' }, [], [
    T(['夜の廊下は冷えていた。', '<say who="白石澪">「誰かいるの」</say>']),
    T(['<say who="白石澪">「行こう」</say>', '<react who="鏡"  反応="揺れる"/>'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('白石澪');
  ok('★say_who を拾う', !!y && y.kinds.indexOf('say_who') >= 0, y);
  ok('★2ターンで distinctSeenTurns=2', !!y && y.distinctSeenTurns === 2, y);
  ok('★sourceSpans が残る', !!y && y.sourceSpans.length >= 1, y && y.sourceSpans);
  const r = w.__v292Dfix640.why('鏡');
  ok('★<react who> は弱（react）としてだけ記録', !!r && r.kinds.indexOf('react') >= 0
     && r.strong.length === 0, r);
}
{
  /* 画面用 turn.narrative にはタグが無い。plan 側にしか証拠が無いのを固定する。 */
  const S = mkS({ name: '' }, [], [ T(['<say who="澪">「ん」</say>'], '「ん」') ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  ok('★タグの無い turn.narrative ではなく plan.narrative を見る',
     !!w.__v292Dfix640.why('澪'), w.__v292Dfix640.report());
}

console.log('\n== (3b) 明示的な人物紹介 / 安定した外見記述（強い証拠） ==');
{
  const S = mkS({ name: '' }, [], [
    T(['男が振り返った。「私は佐々木と申します」']),
    T(['佐々木は帳場に戻った。'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('佐々木');
  ok('★名乗りを introduction（強）として拾う', !!y && y.kinds.indexOf('introduction') >= 0, y);
  ok('★助詞まで飲み込まない（名前だけを切り出す）', !!y && y.name === '佐々木', y);
}
{
  const S = mkS({ name: '' }, [], [
    T(['長い黒髪の女がこちらを見た。', '<say who="ミナ">「こんばんは」</say>', '長い黒髪が揺れる。ミナは笑った。']),
    T(['ミナの長い黒髪が濡れている。', '<say who="ミナ">「入って」</say>'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('ミナ');
  ok('★同じ外見トークンが2ターンで一貫していたら appearance_stable（強）',
     !!y && y.strong.indexOf('appearance_stable') >= 0, y);
  ok('★「ミナの長い黒髪」と「長い黒髪の女」を同じトークンとして数える',
     !!y && Array.isArray(y.appearance['長い黒髪']) && y.appearance['長い黒髪'].length === 2, y && y.appearance);
}
{
  /* 1ターンだけの外見記述では強くならない（一貫していないので） */
  const S = mkS({ name: '' }, [], [
    T(['長い黒髪の女がこちらを見た。', '<say who="ミナ">「こんばんは」</say>']),
    T(['<say who="ミナ">「入って」</say>'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('ミナ');
  ok('★1ターンだけの外見記述は強い証拠にしない',
     !!y && y.strong.indexOf('appearance_stable') < 0, y);
}

console.log('\n== (4) 役割語 ==');
{
  const w = mkWin(); boot(w, mkS());
  const f = w.__v292Dfix640;
  ['宿の主人', '白鷺荘の主人', '少女', '男', '怪異', '若い女', '女将', '人影', '仲居', '執事', '巫女'].forEach(n =>
    ok('★役割語と判定: ' + n, f.isRoleWord(n) === true));
  ['白石澪', '隼人', '麻子', '佐々木', 'ミナ', '桐生 悠真'].forEach(n =>
    ok('★実名を役割語と誤判定しない: ' + n, f.isRoleWord(n) === false));
}
{
  /* 解決できない役割語 */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「いらっしゃい」</say>', '<state who="宿の主人" からだ="帳場"/>']),
    T(['<say who="宿の主人">「二階です」</say>', '<state who="宿の主人" からだ="階段"/>'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('宿の主人');
  ok('★役割語は roleWord=true で記録される', !!y && y.roleWord === true, y);
  ok('★強い証拠があっても resolvedTo は空のまま', !!y && y.resolvedTo === '', y);
}
{
  /* 一意に解決できる役割語 */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「いらっしゃい」</say>']),
    T(['宿の主人の佐々木が帳場から顔を上げた。'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('宿の主人');
  ok('★正式名へ一意解決できたら resolvedTo が入る', !!y && y.resolvedTo === '佐々木', y);
}
{
  /* 候補が2つ＝曖昧 → 永久に解決しない */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「はい」</say>']),
    T(['宿の主人の佐々木が答えた。']),
    T(['宿の主人の田島が現れた。'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('宿の主人');
  ok('★候補が2つ以上なら resolvedTo は空（曖昧なまま昇格させない）',
     !!y && y.resolvedTo === '' && y.resolveCandidates.length === 2, y);
}

{
  /* 「宿の主人」から「主人」「主」まで台帳を増やさない（ノイズで台帳が溢れるのを防ぐ） */
  const S = mkS({ name: '' }, [], [
    T(['<say who="宿の主人">「いらっしゃい」</say>']),
    T(['宿の主人は帳簿を閉じた。'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const names = Object.keys(w.__v292Dfix640.ledger().entries);
  ok('★長い役割語の一部を別エントリにしない',
     names.indexOf('宿の主人') >= 0 && names.indexOf('主人') < 0 && names.indexOf('主') < 0, names);
}

console.log('\n== (5) 回想だけのターンは「居た」と数えない ==');
{
  const S = mkS({ name: '' }, [], [
    T(['<say who="カエデ">「またね」</say>']),
    T(['回想の中で、カエデは笑っていた。']),
    T(['写真のカエデはまだ幼い。'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  const y = w.__v292Dfix640.why('カエデ');
  ok('★recall として記録される', !!y && y.kinds.indexOf('recall') >= 0, y);
  ok('★回想ターンは distinctSeenTurns に数えない（1のまま）',
     !!y && y.distinctSeenTurns === 1, y);
}

console.log('\n== (6) hero は台帳にも積まない ==');
{
  const S = mkS({ name: '白石澪' }, [], [
    T(['<say who="白石澪">「行こう」</say>', '<state who="白石澪" からだ="歩く"/>']),
    T(['<say who="白石澪">「待って」</say>', '<say who="ソウタ">「ん」</say>'])
  ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  ok('★hero は台帳に入らない', w.__v292Dfix640.why('白石澪') === null, w.__v292Dfix640.report());
  ok('★hero 以外は入る', !!w.__v292Dfix640.why('ソウタ'));
  ok('★cast.hero を書き換えない', S.cast.hero.name === '白石澪');
}

console.log('\n== (7) 1ターンは1回だけ走査する / ターンが減ったら作り直す ==');
{
  const S = mkS({ name: '' }, [], [ T(['<say who="澪">「a」</say>']), T(['<say who="澪">「b」</say>']) ]);
  const w = mkWin(); boot(w, S);
  const r1 = w.__v292Dfix640.harvestPending({});
  const r2 = w.__v292Dfix640.harvestPending({});
  ok('★1回目は2ターン走査', r1.scanned === 2, r1);
  ok('★2回目は0ターン（同じターンを2度数えない）', r2.scanned === 0 && r2.reason === 'up-to-date', r2);
  ok('★distinctSeenTurns は 2 のまま', w.__v292Dfix640.why('澪').distinctSeenTurns === 2);
  S.turns.push(T(['<say who="澪">「c」</say>']));
  const r3 = w.__v292Dfix640.harvestPending({});
  ok('★新ターンだけを走査する', r3.scanned === 1, r3);
  ok('★distinctSeenTurns が 3 になる', w.__v292Dfix640.why('澪').distinctSeenTurns === 3);
}
{
  /* 物語リセット（turns が減る）→ 前の物語の証拠を引き継がない */
  const S = mkS({ name: '' }, [], [ T(['<say who="澪">「a」</say>']), T(['<say who="澪">「b」</say>']) ]);
  const w = mkWin(); boot(w, S);
  w.__v292Dfix640.harvestPending({});
  ok('前提: 台帳に載っている', !!w.__v292Dfix640.why('澪'));
  S.turns.length = 0;
  S.turns.push(T(['夜が明けた。']));
  w.__v292Dfix640.harvestPending({});
  ok('★ターンが減ったら台帳を作り直す（他物語の証拠を持ち越さない）',
     w.__v292Dfix640.why('澪') === null, w.__v292Dfix640.report());
}

console.log('\n== (8) fix277 の準登録カルテに触れない（汚染隔離） ==');
{
  const S = mkS({ name: '' }, [], [ T(['<say who="澪">「a」</say>']), T(['<say who="澪">「b」</say>']) ]);
  const w = mkWin({ store: { 'v292Dfix277Quasi': JSON.stringify({ '別物語の人': { turns: 99 } }) } });
  boot(w, S);
  w.__v292Dfix640.harvestPending({});
  ok('★fix277 のキーを読まない', w.__reads.every(k => k.indexOf('v292Dfix277Quasi') < 0), w.__reads);
  ok('★fix277 のキーへ書かない', w.__writes.every(k => k.indexOf('v292Dfix277Quasi') < 0), w.__writes);
  ok('★fix277 のデータが台帳に混ざらない', w.__v292Dfix640.why('別物語の人') === null);
  ok('★ソースに fix277 の台帳キー名が出てこない',
     SRC640.indexOf('v292Dfix277Quasi') < 0 && SRC640.indexOf('__v292QuasiPack') < 0);
}

console.log('\n== (9) スロット別キー / OFF / 冪等 / 配線 ==');
{
  const w1 = mkWin({ slotKey: 'chr6' }); boot(w1, mkS());
  const w2 = mkWin({ slotKey: 'chr6_slot_sms4np33eyg' }); boot(w2, mkS());
  ok('★既定スロットのキー', w1.__v292Dfix640.KEY() === 'v292Dfix640Evid_slot_chr6', w1.__v292Dfix640.KEY());
  ok('★別スロットは別キー', w2.__v292Dfix640.KEY() === 'v292Dfix640Evid_slot_sms4np33eyg', w2.__v292Dfix640.KEY());
}
{
  /* 別スロットの台帳が置いてあっても使わない（distinctSeenTurns は同一slot内だけ） */
  const other = JSON.stringify({ v: 1, slotId: 'chr6', cursor: 5,
    entries: { 'よその人': { name: 'よその人', distinctSeenTurns: 9, evidenceKinds: ['say_who', 'state_tag'],
                             seenTurns: [1, 2], sourceSpans: [], roleWord: false, resolvedTo: '',
                             resolveCandidates: [], appearance: {}, lastTurn: 4, firstSeenTurn: 0 } },
    promotions: [], blocked: [] });
  const w = mkWin({ slotKey: 'chr6_slot_abc', store: { 'v292Dfix640Evid_slot_abc': other } });
  boot(w, mkS());
  ok('★slotId が食い違う台帳は捨てる', w.__v292Dfix640.why('よその人') === null, w.__v292Dfix640.report());
}
{
  const S = mkS({ name: '' }, [], [ T(['<say who="澪">「a」</say>']) ]);
  const w = mkWin({ store: { 'v292Dfix640Off': '1' } }); boot(w, S);
  const r = w.__v292Dfix640.harvestPending({});
  ok('★OFF なら採取しない', r.reason === 'off' && r.ok === false, r);
  ok('★OFF なら localStorage へも書かない', !w.__store['v292Dfix640Evid_slot_chr6']);
}
{
  const S = mkS({ name: '' }, [], []);
  const w = mkWin(); const ctx = boot(w, S);
  const first = w.__v292Dfix640;
  vm.runInContext(SRC640, ctx, { filename: 'fix640#2' });
  ok('★二重ロードで初期化し直さない', w.__v292Dfix640 === first);
}
{
  const S = mkS({ name: '' }, [], []);
  const w = mkWin(); boot(w, S);
  ok('★ターン確定（UI.appendTurn）に相乗りする', typeof w.UI.appendTurn === 'function' && w.UI.__v292Dfix640 === true);
  ok('★元の appendTurn の戻り値を壊さない', w.UI.appendTurn({}, 0) === 'orig');
  ok('★render の追いつきフックも1本だけ', w.UI._renderHooks.length === 1);
}
{
  ok('★script タグがある', HTMLU.indexOf('v292Dfix640-cast-evidence-ledger.js') >= 0);
  ok('★?cb= が付いている', HTMLU.indexOf('v292Dfix640-cast-evidence-ledger.js?cb=fix640') >= 0);
  ok('★features.js より後に読み込む',
     HTMLU.indexOf('v292Dfix640-cast-evidence-ledger.js') > HTMLU.indexOf('features.js?'));
  ok('★fix606 より後に読み込む（抽出規則を live 参照するため）',
     HTMLU.indexOf('v292Dfix640-cast-evidence-ledger.js') > HTMLU.indexOf('v292Dfix606-speaker-provenance.js'));
  ok('★index.html の NUL バイトが1個のまま',
     fs.readFileSync(path.join(__dirname, 'index.html')).filter(b => b === 0).length === 1);
  ok('★OFFスイッチがある', SRC640.indexOf("v292Dfix640Off") >= 0);
  ok('★冪等ガードのフラグ名が __v292 系', SRC640.indexOf('window.__v292Dfix640') >= 0);
  ok('★features.js を変更していない',
     FEAT.indexOf('v292Dfix640') < 0 && FEAT.indexOf('v292Dfix641') < 0);
  ok('★fix277 / fix307 を変更していない',
     read('v292Dfix277-quasi-pack.js').indexOf('fix640') < 0 &&
     read('v292Dfix307-npc-roster.js').indexOf('fix640') < 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
