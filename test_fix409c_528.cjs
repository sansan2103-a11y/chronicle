/* =====================================================================
 * 回帰テスト: v292Dfix409c (登録cast宛の共起免除 + 主人公の正式呼称注入)
 *             v292Dfix528a/b (準登録カルテの同一性ガード)
 * 実行: node test_fix409c_528.cjs
 * 方針: 配信中の実ファイルをそのまま読み込み、モックwindowで動かして検証する。
 *       期待値は 2026-07-25 におしんの実セーブ(10スロット)から観測した実データ形状に合わせた。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? ('  >> ' + JSON.stringify(extra)) : '')); }
}
function section(t){ console.log('\n== ' + t + ' =='); }

// ---------------------------------------------------------------- mock env
function makeEnv(){
  const store = {};
  const localStorage = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i]; },
    get length(){ return Object.keys(store).length; }
  };
  const noopEl = { querySelectorAll(){ return []; }, addEventListener(){}, appendChild(){}, setAttribute(){}, style:{} };
  const document = {
    hidden: false,
    documentElement: noopEl,
    body: noopEl,
    querySelectorAll(){ return []; },
    addEventListener(){},
    createElement(){ return { style:{}, setAttribute(){}, addEventListener(){} }; }
  };
  const win = {
    localStorage, document,
    console,
    setTimeout(){ return 0; },          // 起動時の遅延処理は走らせない(検証は同期API経由)
    setInterval(){ return 0; },
    clearTimeout(){}, clearInterval(){},
    MutationObserver: function(){ return { observe(){}, disconnect(){} }; },
    navigator: { userAgent: 'node' },
    Date, Math, JSON, RegExp, String, Number, Array, Object, Error, parseInt, parseFloat, isNaN
  };
  win.window = win;
  return win;
}

function load(win, file){
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const ctx = vm.createContext(win);
  // ブラウザと同じく location も window.location と同一にしておく(本テストでは未使用だが慣例)
  vm.runInContext(src, ctx, { filename: file });
}

// スロットデータ(実データ形状: 離島 smrisv41ho7 相当)
function islandState(){
  return {
    cast: {
      hero: { name: '霧 涼太', desc: '主人公' },
      npcs: [ { name: '真鍋 ひかり', desc: '看護師' }, { name: '大浦 源蔵', desc: '漁師' }, { name: '藤堂 志乃', desc: '民宿の女将' } ]
    },
    turns: [
      // 地の文はフルネーム「霧 涼太」を一度も書かない = 実測どおりの状況
      { narrative: '涼太は桟橋の縁に立っていた。潮の匂いが濃い。', _convSays: [ { who: '涼太', say: 'まだ船は出ないのか' } ] },
      { narrative: '源蔵が網を放り出す。', _convSays: [ { who: '涼太', say: 'ここで待つ' }, { who: '大浦 源蔵', say: '待っても無駄だ' } ] },
      { narrative: '霧が濃くなる。', _convSays: [ { who: '涼太', say: '……行こう' } ] }
    ],
    save(){ this.__saved = (this.__saved || 0) + 1; }
  };
}

// ============================================================ fix409c
section('fix409c: 統合ゲート');
{
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = islandState();
  const x = win.__v292Dfix409x;

  ok('resolveCanon 涼太 -> 霧 涼太 (末尾一致・一意)', x.resolve('涼太') === '霧 涼太', x.resolve('涼太'));
  ok('resolveCanon 霧 涼太 自身は不触', x.resolve('霧 涼太') === '');
  const g = x.canApply('涼太', '霧 涼太', 0);
  ok('cast宛は共起なしでも許可(fix409c本体)', g && g.ok === true, g);
  ok('許可理由が cast-namepart-409d', g && g.via === 'cast-namepart-409d', g);

  // dryRun で実際に全ターン分の変更が計画されること
  const dr = x.dryRun();
  const applied = [].concat.apply([], dr.map(r => r.changes)).filter(c => !c.skipped);
  ok('dryRun が「涼太」カード3件すべての統合を計画', applied.length === 3, applied);
  ok('統合先はすべて 霧 涼太', applied.every(c => c.to === '霧 涼太'), applied);
}

section('fix409c: ロスターhandle宛は従来どおり阻止(過剰統合させない)');
{
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.__v292Dfix307api = { loadRoster(){ return [ { handle: '観覧車の少女', appr: '色白の少女。白いワンピース。' } ]; } };
  win.S = {
    cast: { hero: { name: 'アリア・リュミエール' }, npcs: [ { name: 'カエデ' } ] },
    turns: [ { narrative: '少女が観覧車の下に立っている。', _convSays: [ { who: '少女', say: 'まだ回るの' } ] } ],
    save(){}
  };
  const x = win.__v292Dfix409x;
  ok('resolveCanon 少女 -> 観覧車の少女', x.resolve('少女') === '観覧車の少女', x.resolve('少女'));
  const g = x.canApply('少女', '観覧車の少女', 0);
  ok('共起なし=従来どおり阻止', g && g.ok === false && g.reason === 'no-cooccurrence', g);
  const dr = x.dryRun();
  const applied = [].concat.apply([], dr.map(r => r.changes)).filter(c => !c.skipped);
  ok('実適用は0件(別個体の可能性を潰さない)', applied.length === 0, applied);
}

section('fix409c: 共起があるロスターhandle宛は従来どおり許可(既存挙動の保全)');
{
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.__v292Dfix307api = { loadRoster(){ return [ { handle: '民宿の女将', appr: '白髪の女将' } ]; } };
  win.S = {
    cast: { hero: { name: '霧 涼太' }, npcs: [] },
    turns: [ { narrative: '民宿の女将が茶を置いた。', _convSays: [ { who: '女将', say: 'ゆっくりしていき' } ] } ],
    save(){}
  };
  const g = win.__v292Dfix409x.canApply('女将', '民宿の女将', 0);
  ok('共起あり=許可(reason無し・cast免除でもない)', g && g.ok === true && !g.via, g);
}

section('fix409c: 同名衝突は統合しない');
{
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = { cast: { hero: { name: '霧 涼太' }, npcs: [ { name: '南 涼太' } ] }, turns: [], save(){} };
  ok('候補2件 -> resolveCanon は空', win.__v292Dfix409x.resolve('涼太') === '', win.__v292Dfix409x.resolve('涼太'));
}

section('fix409c: OFFスイッチで fix409b 挙動へ戻る');
{
  const win = makeEnv();
  win.localStorage.setItem('v292Dfix409cOff', '1');
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = islandState();
  const g = win.__v292Dfix409x.canApply('涼太', '霧 涼太', 0);
  ok('OFF時は共起なしで阻止(退行できる)', g && g.ok === false && g.reason === 'no-cooccurrence', g);
}

section('fix409c: 正式呼称キーパーに主人公が入る');
{
  function keeperText(offC){
    const win = makeEnv();
    if (offC) win.localStorage.setItem('v292Dfix409cOff', '1');
    load(win, 'v292Dfix409-handle-merge.js');
    win.S = { cast: { hero: { name: '霧 涼太' }, npcs: [ { name: '真鍋 ひかり' } ] }, turns: [], save(){} };
    const reg = (win.__f379reg || []).filter(r => r.marker === '【正式呼称】');
    return reg.length ? reg[0].text() : '';
  }
  const on = keeperText(false), off = keeperText(true);
  ok('ON: 主人公名が含まれる', on.indexOf('霧 涼太') >= 0, on);
  ok('ON: 登録NPCも従来どおり含まれる', on.indexOf('真鍋 ひかり') >= 0, on);
  ok('OFF: 主人公名は含まれない(従来挙動)', off.indexOf('霧 涼太') < 0, off);
}

// ============================================================ fix528
section('fix528a/b: 準登録カルテの同一性ガード');
function quasiEnv(opts){
  const win = makeEnv();
  if (opts && opts.off) win.localStorage.setItem('v292Dfix528Off', '1');
  win.S = (opts && opts.S) || islandState();
  load(win, 'v292Dfix277-quasi-pack.js');
  return win;
}
{
  const win = quasiEnv();
  const q = win.__v292QuasiPack;
  q.noteAppear('涼太', 3);
  q.noteAppear('民宿の女将', 3);
  q.noteAppear('鏡の奥から', 4);
  q.noteAppear('ハルト', 4);
  q.noteAppear('大浦源蔵', 5);          // 空白抜きの姓名 = 「大浦 源蔵」の別表記
  const names = Object.keys(q.store());
  ok('fix528b: 主人公の名だけ呼び「涼太」を登録しない', names.indexOf('涼太') < 0, names);
  ok('fix528b: 空白抜き「大浦源蔵」も登録しない', names.indexOf('大浦源蔵') < 0, names);
  ok('fix528a: 断片「鏡の奥から」を登録しない', names.indexOf('鏡の奥から') < 0, names);
  ok('本物の未登録キャラ「民宿の女将」は登録する', names.indexOf('民宿の女将') >= 0, names);
  ok('「と」で終わる実在人名「ハルト」は登録する(巻き込み無し)', names.indexOf('ハルト') >= 0, names);
}
{
  // 洋名順(名+姓・中黒区切り)の先頭一致
  const win = quasiEnv({ S: {
    cast: { hero: { name: 'アリア・リュミエール' }, npcs: [ { name: 'カエデ' }, { name: 'ノア' } ] }, turns: [], save(){}
  } });
  const q = win.__v292QuasiPack;
  q.noteAppear('アリア', 2);
  q.noteAppear('観覧車の少女', 2);
  const names = Object.keys(q.store());
  ok('fix528b: 洋名の名だけ「アリア」を登録しない(先頭一致)', names.indexOf('アリア') < 0, names);
  ok('無関係な未登録キャラ「観覧車の少女」は登録する', names.indexOf('観覧車の少女') >= 0, names);
}
{
  // 区切りの無いキャスト名は対象外(過剰遮断させない)
  const win = quasiEnv({ S: {
    cast: { hero: { name: '白石澪' }, npcs: [ { name: '朝比奈ひなた' } ] }, turns: [], save(){}
  } });
  const q = win.__v292QuasiPack;
  q.noteAppear('ひなた', 2);
  const names = Object.keys(q.store());
  ok('区切り無しキャスト「朝比奈ひなた」の「ひなた」は遮断しない(保守的)', names.indexOf('ひなた') >= 0, names);
}
section('fix528d: 別物語/巻き戻しの残骸を sys 注入から外す');
{
  // 実データ再現: 8ターンの物語(グレイヘイヴン)の台帳に、別物語のキャラが last12/13 で残っている
  function build(off){
    const win = quasiEnv({ off: off, S: {
      cast: { hero: { name: 'マリア' }, npcs: [ { name: 'リカ' }, { name: 'レオン' }, { name: 'ミカ' } ] },
      turns: new Array(8).fill(0).map(() => ({ narrative: '', _convSays: [] })),
      save(){}
    } });
    const key = 'v292Dfix277Quasi';   // slotSfx() はモックでは '' になる
    win.localStorage.setItem(key, JSON.stringify({
      '桐生悠真': { seen: [1,2,3,4,5,6,7,8,9,10,11,12,13], last: 13, ali: [] },
      '氷川杏子': { seen: [4,5,6,7,8,9,10,11,12], last: 12, ali: [] },
      '若い男':   { seen: [3,4,5], last: 5, ali: [] }
    }));
    win.__v292QuasiPack._dropCache();
    return win.__v292QuasiPack.quasiRecent().map(r => r.name);
  }
  const on = build(false), off = build(true);
  ok('ON: 別物語の残骸(未来last)は注入対象から外れる', on.indexOf('桐生悠真') < 0 && on.indexOf('氷川杏子') < 0, on);
  ok('ON: この物語の正当な準登録は残る', on.indexOf('若い男') >= 0, on);
  ok('OFF: 従来どおり残骸も注入される(退行できる)', off.indexOf('桐生悠真') >= 0, off);
}
{
  // 分身(登録キャラの名だけ呼び)も注入対象から外す(既存台帳を書き換えずに効かせる)
  const win = quasiEnv();
  win.localStorage.setItem('v292Dfix277Quasi', JSON.stringify({
    '涼太':       { seen: [10,11,12,13,14,15,16], last: 2, ali: [] },
    '民宿の女将': { seen: [0,1,2], last: 2, ali: [] }
  }));
  win.__v292QuasiPack._dropCache();
  const rec = win.__v292QuasiPack.quasiRecent().map(r => r.name);
  ok('既存台帳の分身「涼太」も注入対象から外れる', rec.indexOf('涼太') < 0, rec);
  ok('本物の未登録キャラは注入され続ける', rec.indexOf('民宿の女将') >= 0, rec);
}

{
  const win = quasiEnv({ off: true });
  const q = win.__v292QuasiPack;
  q.noteAppear('涼太', 3);
  q.noteAppear('鏡の奥から', 4);
  const names = Object.keys(q.store());
  ok('OFF時は従来どおり両方登録される(退行できる)', names.indexOf('涼太') >= 0 && names.indexOf('鏡の奥から') >= 0, names);
}

section('fix528d-b: 未来lastは「再観測まで注入禁止」(自動復活しない)');
{
  const KEY='v292Dfix277Quasi';
  function envWith(turnCount, ledger, off){
    const win = makeEnv();
    if (off) win.localStorage.setItem('v292Dfix528Off','1');
    win.localStorage.setItem(KEY, JSON.stringify(ledger));
    win.S = {
      cast: { hero:{name:'マリア'}, npcs:[{name:'リカ'},{name:'レオン'},{name:'ミカ'}] },
      turns: new Array(turnCount).fill(0).map(()=>({narrative:'',_convSays:[]})),
      save(){}
    };
    load(win, 'v292Dfix277-quasi-pack.js');
    return win;
  }
  // 実セーブ smriifzelrt 相当: 8ターン物語に last12/13 の別物語キャラが混入
  const ledger = () => ({
    '桐生悠真': { seen:[1,2,3,4,5,6,7,8,9,10,11,12,13], last:13, ali:[] },
    '氷川杏子': { seen:[4,5,6,7,8,9,10,11,12], last:12, ali:[] },
    '若い男':   { seen:[3,4,5], last:5, ali:[] }
  });

  // (1) 8ターン時点: 除外され、sf が立つ
  const w8 = envWith(8, ledger());
  const r8 = w8.__v292QuasiPack.quasiRecent().map(r=>r.name);
  ok('8ターン時点で別物語キャラは注入されない', r8.indexOf('桐生悠真')<0 && r8.indexOf('氷川杏子')<0, r8);
  ok('正当な準登録は残る', r8.indexOf('若い男')>=0, r8);
  const after8 = JSON.parse(w8.localStorage.getItem(KEY));
  ok('sf フラグが台帳へ永続化される', after8['桐生悠真'].sf===2 && after8['氷川杏子'].sf===2, Object.keys(after8).map(k=>k+':'+(after8[k].sf||0)));
  ok('データは削除されていない(退避先 sfSeen に全登場実績が残る)', after8['桐生悠真'].sfSeen.length===13 && after8['桐生悠真'].seen.length===0, after8['桐生悠真']);

  // (2) ★再発条件: 現在ターンが last に追いついても自動復活しない
  const w14 = envWith(14, after8);
  const r14 = w14.__v292QuasiPack.quasiRecent().map(r=>r.name);
  ok('★14ターンへ進んでも自動復活しない(桐生悠真)', r14.indexOf('桐生悠真')<0, r14);
  ok('★14ターンへ進んでも自動復活しない(氷川杏子)', r14.indexOf('氷川杏子')<0, r14);

  // (3) 新しい本文でその人物を再観測したときだけ復活する
  const w14b = envWith(14, after8);
  w14b.__v292QuasiPack.noteAppear('桐生悠真', 13);   // この物語の実在ターンで観測
  const e = w14b.__v292QuasiPack.store()['桐生悠真'];
  ok('再観測で sf が解除される', !e.sf, e);
  ok('別物語の登場実績は seen へ戻らない(即時に準登録化しない)', e.seen.length===1 && e.seen[0]===13, e.seen);
  ok('外した番号は sfSeen へ退避され消えていない', Array.isArray(e.sfSeen) && e.sfSeen.length===13, e.sfSeen && e.sfSeen.length);
  const r14c = w14b.__v292QuasiPack.quasiRecent().map(r=>r.name);
  ok('再観測直後はまだ3ターン未達なので注入されない', r14c.indexOf('桐生悠真')<0, r14c);
  w14b.__v292QuasiPack.noteAppear('桐生悠真', 12);
  w14b.__v292QuasiPack.noteAppear('桐生悠真', 11);
  const r14d = w14b.__v292QuasiPack.quasiRecent().map(r=>r.name);
  ok('この物語で3ターン観測されたら正常に注入対象へ戻る', r14d.indexOf('桐生悠真')>=0, r14d);

  // (4) 未来ターンでの観測では解除しない
  const w8b = envWith(8, after8);
  w8b.__v292QuasiPack.noteAppear('桐生悠真', 13);   // 8ターン物語に turn13 は存在しない
  const e2 = w8b.__v292QuasiPack.store()['桐生悠真'];
  ok('この物語に無いターン番号での観測では解除しない', e2.sf===2, e2);

  // (5) 起動直後(turns=0)で誤って全件 sf を立てない
  const w0 = envWith(0, ledger());
  w0.__v292QuasiPack.quasiRecent();
  const after0 = w0.__v292QuasiPack.store();
  ok('物語未ロード(0ターン)では sf を立てない', !after0['若い男'].sf && !after0['桐生悠真'].sf, Object.keys(after0).map(k=>k+':'+(after0[k].sf||0)));


  // (7) 正当な巻き戻し(本文にその人物が実在する)は実績を保持する
  {
    const win = makeEnv();
    win.localStorage.setItem(KEY, JSON.stringify({
      '民宿の女将': { seen:[2,3,4,15,16,17], last:17, ali:[] }
    }));
    win.S = {
      cast: { hero:{name:'霧 涼太'}, npcs:[] },
      turns: new Array(10).fill(0).map((_,i)=>({ narrative: i<5 ? '民宿の女将が茶を置いた。' : '波が高い。', _convSays: [] })),
      save(){}
    };
    load(win, 'v292Dfix277-quasi-pack.js');
    const rec = win.__v292QuasiPack.quasiRecent().map(r=>r.name);
    const e3 = win.__v292QuasiPack.store()['民宿の女将'];
    ok('巻き戻し: 未来ターンなので一旦は注入停止', rec.indexOf('民宿の女将')<0, rec);
    ok('巻き戻し: 別物語ではないと判定される(sf=1)', e3.sf===1, e3.sf);
    ok('巻き戻し: この物語に実在するターンの実績は保持される', JSON.stringify(e3.seen)===JSON.stringify([2,3,4]), e3.seen);
    ok('巻き戻し: 存在しない番号だけ退避される', JSON.stringify(e3.sfSeen)===JSON.stringify([15,16,17]), e3.sfSeen);
    win.__v292QuasiPack.noteAppear('民宿の女将', 9);
    const rec2 = win.__v292QuasiPack.quasiRecent().map(r=>r.name);
    ok('巻き戻し: 再登場した瞬間に実績を保ったまま復帰する', rec2.indexOf('民宿の女将')>=0, rec2);
  }

  // (6) OFF スイッチ
  const wOff = envWith(14, ledger(), true);
  const rOff = wOff.__v292QuasiPack.quasiRecent().map(r=>r.name);
  ok('OFF時は従来どおり(退行できる)', rOff.indexOf('桐生悠真')>=0, rOff);
}

section('fix409d/528e/528f: GPT監査で指摘された退行の修正');
{
  // (1) fix409d: 区切りの無い登録NPC名への強制統合を止める(GPTの反例)
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = {
    cast: { hero: { name: 'アリア' }, npcs: [ { name: '観覧車の少女' } ] },
    turns: [ { narrative: '少女が柵の上に座っている。', _convSays: [ { who: '少女', say: 'まだ回るの' } ] } ],
    save(){}
  };
  const x = win.__v292Dfix409x;
  ok('resolveCanon 少女 -> 観覧車の少女 は依然として成立する', x.resolve('少女') === '観覧車の少女', x.resolve('少女'));
  const g = x.canApply('少女', '観覧車の少女', 0);
  ok('★区切りの無い登録NPC名へは共起免除しない(別個体を守る)', g && g.ok === false && g.reason === 'no-cooccurrence', g);
  const dr = x.dryRun();
  ok('実適用0件', [].concat.apply([], dr.map(r => r.changes)).filter(c => !c.skipped).length === 0);
}
{
  // fix409d: 主人公の姓名分割は従来どおり免除される
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = islandState();
  const g = win.__v292Dfix409x.canApply('涼太', '霧 涼太', 0);
  ok('主人公の姓名分割は共起なしでも許可', g && g.ok === true && g.via === 'cast-namepart-409d', g);
  const applied = [].concat.apply([], win.__v292Dfix409x.dryRun().map(r => r.changes)).filter(c => !c.skipped);
  ok('実データ形状で3カード統合される', applied.length === 3, applied.length);
}
{
  // fix409d: 中黒区切りの登録NPCの姓も免除される
  const win = makeEnv();
  load(win, 'v292Dfix409-handle-merge.js');
  win.S = { cast: { hero: { name: 'アリア・リュミエール' }, npcs: [] },
    turns: [ { narrative: 'リュミエールは杖を握った。', _convSays: [ { who: 'リュミエール', say: '行くわ' } ] } ], save(){} };
  const g = win.__v292Dfix409x.canApply('リュミエール', 'アリア・リュミエール', 0);
  ok('中黒区切りの構成要素も免除される', g && g.ok === true && g.via === 'cast-namepart-409d', g);
}
{
  // (2) fix528e: 空白区切りの「姓だけ」を別人として抑止しない(GPTの反例)
  const win = quasiEnv({ S: {
    cast: { hero: { name: '霧 涼太' }, npcs: [ { name: '佐藤 太郎' }, { name: 'アン・マリー' } ] }, turns: [], save(){}
  } });
  const q = win.__v292QuasiPack;
  q.noteAppear('佐藤', 2);        // 別人の佐藤さん
  q.noteAppear('太郎', 2);        // 佐藤 太郎 の名だけ呼び
  q.noteAppear('涼太', 2);        // 主人公の名だけ呼び
  q.noteAppear('アン', 2);        // 中黒区切りの先頭 = 抑止される
  const names = Object.keys(q.store());
  ok('★空白区切りの姓「佐藤」は別人として登録される(抑止しない)', names.indexOf('佐藤') >= 0, names);
  ok('空白区切りの名「太郎」は従来どおり抑止', names.indexOf('太郎') < 0, names);
  ok('主人公の名だけ呼びは従来どおり抑止', names.indexOf('涼太') < 0, names);
  ok('中黒区切りの先頭「アン」は従来どおり抑止', names.indexOf('アン') < 0, names);
}
{
  // (3) fix528f: 進行中ターンの index でも sf を解除できる
  const KEY = 'v292Dfix277Quasi';
  const win = makeEnv();
  win.localStorage.setItem(KEY, JSON.stringify({ '桐生悠真': { seen: [], sfSeen: [1,2,3], last: 0, sf: 2, ali: [] } }));
  win.S = { cast: { hero: { name: 'マリア' }, npcs: [] },
    turns: new Array(8).fill(0).map(() => ({ narrative: '', _convSays: [] })), save(){} };
  load(win, 'v292Dfix277-quasi-pack.js');
  // harvestRaw は push 前に turnIdx = S.turns.length(=8) を渡す
  win.__v292QuasiPack.noteAppear('桐生悠真', 8, { source: 'current-parse' });
  const e = win.__v292QuasiPack.store()['桐生悠真'];
  ok('★進行中ターン(turns.length)での観測でも解除される(生応答経路)', !e.sf, e);
  ok('その観測が実績として積まれる', e.seen.indexOf(8) >= 0, e.seen);
  // fix528g: source を付けない呼出元は進行中ターンで解除できない
  const win2 = makeEnv();
  win2.localStorage.setItem(KEY, JSON.stringify({ '桐生悠真': { seen: [], sfSeen: [1,2,3], last: 0, sf: 2, ali: [] } }));
  win2.S = { cast: { hero: { name: 'マリア' }, npcs: [] },
    turns: new Array(8).fill(0).map(() => ({ narrative: '', _convSays: [] })), save(){} };
  load(win2, 'v292Dfix277-quasi-pack.js');
  win2.__v292QuasiPack.noteAppear('桐生悠真', 8);
  ok('★source未指定では進行中ターンでの解除を許さない(契約の明示)', win2.__v292QuasiPack.store()['桐生悠真'].sf === 2);
}
{
  // fix528f: それでも「この物語に無い番号」では解除しない
  const KEY = 'v292Dfix277Quasi';
  const win = makeEnv();
  win.localStorage.setItem(KEY, JSON.stringify({ '桐生悠真': { seen: [], sfSeen: [1,2,3], last: 0, sf: 2, ali: [] } }));
  win.S = { cast: { hero: { name: 'マリア' }, npcs: [] },
    turns: new Array(8).fill(0).map(() => ({ narrative: '', _convSays: [] })), save(){} };
  load(win, 'v292Dfix277-quasi-pack.js');
  win.__v292QuasiPack.noteAppear('桐生悠真', 13);
  ok('存在しないターン番号では解除しない', win.__v292QuasiPack.store()['桐生悠真'].sf === 2);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
