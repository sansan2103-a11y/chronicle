/* 回帰テスト: v292Dfix605 — 不完全なパッケージで canonical を置き換えない
 *
 * ■背景（2026-07-27・本番データの実測。読み取り専用で確認したもの）
 *     サーバ正本 rev452        = 72キー / 物語の本体は **1件だけ**（22ターン）・`full` 印なし
 *     同時刻の iPhone の fork rev449 = 191キー / 物語の本体 **11件すべて**（同じ物語は23ターン）
 *     PCローカル               = 10本すべて健在
 *   ＝ `collectLS()` が「いま開いている物語1件」しか集めていないのに、
 *      Worker は canonical を **丸ごと置き換える**ので、他の9本がクラウドから消えていた。
 *   おしんの報告「iPhoneで進めたのにPCに反映されない」の裏側がこれ。
 *
 *   ★GPT裁定:
 *     「同じ put という操作に **完全スナップショットと部分パッケージの2種類が混在** し、
 *      Worker が両方を全置換として扱うのが根本原因。当面は
 *      **canonical を置き換える main put は必ず完全パッケージだけ** に統一するのが最小で安全」。
 *
 * ■このテストが固定する契約（形ではなく振る舞い。期待値は具体値で書く）
 *   C1 collectLS が **全生存スロットの本体とサイドストア** を集める（既定枠 chr6 も含む）
 *   C2 **墓標スロットの本体・サイドストアは入らない**（isDeadSlotKey 経由）
 *   C3 **chr6_slots_meta は入る**（墓標を含んだまま。削除を他端末へ伝えるため）
 *   C4 墓標 sm1 で生きている sm12 を巻き込まない
 *   C5 completeness() は「meta が live と言い、ローカルに本体があるのに pkg に無い」ときだけ full:false
 *   C6 ローカルに本体が無い 0ターンの枠は欠落とみなさない
 *   C7 collectLight は完全なときだけ full:true を立てる
 *   C8 ★パッケージに新しいフィールドを増やしていない
 *      （packageHash は `chronicle-light-v1` = 「pkg から idb を除いて JSON.stringify」で
 *        計算される。勝手にフィールドを足すと、送信側とサーバの照合の前提が変わる）
 *   C9 push() は不完全なら **送信せず** INCOMPLETE_PACKAGE（err.incomplete === true）を投げ、
 *      サーバへ put が **1件も届かない**
 *   C10 完全なら従来どおり送れる
 *   C11 v292Dfix605Off='1' で従来の単一スロット収集へ戻り、ガードも止まる（緊急時の逃げ道）
 *   C12 ★「同期中」フラグ(pushing)が解除されて **次の push ができる**
 *       （ガードで抜けたときに解除漏れがあると、以後まったく同期できなくなる）
 *
 * ■このテストの作りについて（偽の合格を避けるための備え）
 *   ★モック localStorage は setItem したキーが Object.keys(localStorage) にも見えること。
 *     fix562 の分類器は Object.keys(localStorage) を使うので、ここを手を抜くと
 *     分類器が常に「生きているスロット0件」を返して**全部が素通りする偽の合格**になる。
 *   ★分類器は **本物の v292Dfix562 を読み込んで使う**。モックにすると
 *     「モックが正しいこと」を確かめているだけになる。
 *   ★期待値は「等しい」ではなく具体値（キー名の配列）で書く。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC399 = read('v292Dfix399-cloudsync.js');
const SRC402 = read('v292Dfix402-invisible-sync.js');
const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC580 = read('v292Dfix580-meta-sync-coordinator.js');

const STORY = n => JSON.stringify({ turns: Array.from({ length: n }, () => ({})) });

/* ---------- モック localStorage ----------
   ★setItem したキーが Object.keys(localStorage) にも見えること（fix562 がそれを読む）。 */
function mkLS(seed){
  const store = {}, ls = {};
  Object.defineProperties(ls, {
    getItem:    { value: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null },
    setItem:    { value: (k, v) => { store[k] = String(v);
                    Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: k => { delete store[k]; delete ls[k]; } },
    key:        { value: i => Object.keys(store)[i] },
    length:     { get(){ return Object.keys(store).length; } },
    __store:    { value: store }
  });
  Object.keys(seed || {}).forEach(k => ls.setItem(k, seed[k]));
  return ls;
}

/* ---------- サーバのモック ----------
   op ごとに何が届いたかを全部控える。「送っていない」を数えられるようにするため。 */
function mkServer(startRev){
  const st = { rev: startRev == null ? 5 : startRev, puts: [], ops: [] };
  return { state: st, handle(body){
    let o = null; try { o = JSON.parse(body); } catch(e){ o = null; }
    if (!o) return { ok: true };
    st.ops.push(o.op);
    if (o.op === 'meta') return { ok: true, meta: { updatedAt: 1785000000000, rev: st.rev, size: 5000 }, rev: st.rev };
    if (o.op === 'get')  return { ok: true, data: null, rev: st.rev };
    if (o.op !== 'put')  return { ok: true };
    st.puts.push(o); st.rev++;
    return { ok: true, rev: st.rev, lsSize: 1 };
  } };
}

function mkEnv(opts){
  opts = opts || {};
  const server = opts.server || mkServer();
  const ls = mkLS(opts.seed || {});
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){},
               setAttribute(){}, style: {}, remove(){}, classList: { add(){}, remove(){}, contains: () => false } };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, classList: { add(){}, remove(){} } }) };
  const fetchLog = [];
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    /* ★既定は「予約するだけで実行しない」。実行させたい試験だけ後から差し替える。 */
    setTimeout: (f, ms) => (opts.runTimers && typeof f === 'function' ? (f(), 0) : 0),
    setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){}, JSON, Date, Error, Promise,
    confirm: () => false, alert(){}, prompt: () => null,
    /* ★IndexedDB の最小モック。画像0件で必ず解決する。
       解決しないモックにすると push が永久に待って**テストが無言で止まる**。 */
    indexedDB: { open(){
      const req = {};
      Promise.resolve().then(() => {
        const db = { close(){}, transaction: () => ({ objectStore: () => ({
          openKeyCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; },
          openCursor(){ const c = {}; Promise.resolve().then(() => c.onsuccess && c.onsuccess({ target: { result: null } })); return c; }
        }) }) };
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    } },
    fetch: function(url, init){
      let b = null; try { b = JSON.parse(init && init.body); } catch(e){}
      fetchLog.push({ url: String(url), op: b && b.op ? b.op : null });
      const resp = server.handle(init && init.body);
      return Promise.resolve({ status: 200, json: () => Promise.resolve(resp),
                               clone: () => ({ json: () => Promise.resolve(resp) }) });
    }
  };
  w.window = w; w.__ls = ls; w.__server = server; w.__fetchLog = fetchLog;
  const ctx = vm.createContext(w);
  vm.runInContext(SRC562, ctx, { filename: 'v292Dfix562-backup-inventory.js' });
  vm.runInContext(SRC580, ctx, { filename: 'v292Dfix580-meta-sync-coordinator.js' });
  vm.runInContext(SRC399, ctx, { filename: 'v292Dfix399-cloudsync.js' });
  return w;
}
const lsKeys = pkg => Object.keys(pkg.ls).sort();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 本番に近い並び: 既定枠(chr6) + 生きている2本 + 墓標1本。サイドストアと控えも混ぜる。 */
const SEED_LIVE = () => ({
  'chr6_slots_meta': JSON.stringify([{ id: 'smA', name: 'A' }, { id: 'smB', name: 'B' },
                                     { id: 'smD', name: '削除済み', deleted: true, deleteOpId: 'op1' }]),
  'chr6_active_slot': JSON.stringify('smA'),
  'chr6':            STORY(22),
  'chr6_slot_smA':   STORY(23),
  'chr6_slot_smB':   STORY(11),
  'chr6_slot_smD':   STORY(2),
  'v292Dfix77States_slot_smA': '{"s":1}',
  'v292Dfix77States_slot_smB': '{"s":2}',
  'v292Dfix77States_slot_smD': '{"s":3}',
  'v292avrec_face':  'g1',
  'chr6_bk_cloudsync_smA_1785000000000': 'bk',
  'v292Dfix399_baseTs': '123',
  'v292ProxyPass':   'p',
  'v292Dfix402_baseRev': '5'
});

console.log('\n== fix605 ⓪: ソース検査（ガードが送信より前にあること） ==');
{
  const i = SRC399.indexOf('function push(force)');
  const body = SRC399.slice(i, SRC399.indexOf('// ---- pull(取得のみ', i));
  ok('★push の中に fix605 のガードがある', /INCOMPLETE_PACKAGE/.test(body), body.length);
  ok('★★ガードは callSave(=送信) より前にある',
     body.indexOf('INCOMPLETE_PACKAGE') < body.indexOf('return callSave(body)'),
     { guard: body.indexOf('INCOMPLETE_PACKAGE'), send: body.indexOf('return callSave(body)') });
  ok('★ガードは err.incomplete で見分けられる', /ep\.incomplete = true/.test(body));
  ok('★止めた理由を黙らせない（missing を載せる）', /ep\.missing = lastCompleteness\.missing/.test(body));
  ok('★緊急時の逃げ道 v292Dfix605Off がある', SRC399.indexOf("'v292Dfix605Off'") > 0);
  ok('★collectLS の既定は liveSlotIds()（単一スロットではない）',
     /var ids = f605off\(\) \? \[slotId\] : liveSlotIds\(\)/.test(SRC399));
  ok('★診断口 completeness() / liveSlotIds() を出している',
     /completeness: function\(\)/.test(SRC399) && /liveSlotIds: liveSlotIds/.test(SRC399));
  /* ★C8: 判定結果はパッケージの外（lastCompleteness）に置く、と実装が明言していること */
  ok('★★判定結果を pkg へ入れていない（packageHash の前提を変えない）',
     !/pkg\.completeness/.test(SRC399) && !/pkg\.missing/.test(SRC399) && !/pkg\.liveCount/.test(SRC399));
}

console.log('\n== fix605 ①: 全生存スロットの本体とサイドストアを集める（C1/C2/C3） ==');
const W1 = mkEnv({ seed: SEED_LIVE() });
{
  const x = W1.__v292Dfix399x;
  ok('★生存スロットは smA / smB / 既定枠 chr6 の3つ',
     eq(x.liveSlotIds(), ['smA', 'smB', 'chr6']), x.liveSlotIds());
  const pkg = x.collectLight(1111);
  /* ★期待値は具体値で書く（「同じ長さ」等では偽の合格が出る） */
  ok('★★集めたキーが具体値で一致する（本体3件＋サイドストア2件＋台帳＋現在地＋共有資産）',
     eq(lsKeys(pkg), ['chr6', 'chr6_active_slot', 'chr6_slot_smA', 'chr6_slot_smB',
                      'chr6_slots_meta', 'v292Dfix77States_slot_smA',
                      'v292Dfix77States_slot_smB', 'v292avrec_face']), lsKeys(pkg));
  ok('★★いま開いていない物語(smB)の本体が入っている（＝今回の事故の芯）',
     pkg.ls['chr6_slot_smB'] === STORY(11), Object.keys(pkg.ls));
  ok('★★既定枠(chr6)の本体も入っている（22ターンだけが生き残っていた枠）',
     pkg.ls['chr6'] === STORY(22));
  ok('★墓標スロットの本体は入らない', !('chr6_slot_smD' in pkg.ls));
  ok('★墓標スロットのサイドストアも入らない', !('v292Dfix77States_slot_smD' in pkg.ls));
  ok('★★台帳(chr6_slots_meta)は入る', typeof pkg.ls['chr6_slots_meta'] === 'string');
  ok('★★台帳は墓標を含んだまま入る（削除を他端末へ伝えるため）',
     (JSON.parse(pkg.ls['chr6_slots_meta']) || []).some(e => e && e.id === 'smD' && e.deleted === true),
     pkg.ls['chr6_slots_meta']);
  ok('控え(chr6_bk_*)は送らない', !('chr6_bk_cloudsync_smA_1785000000000' in pkg.ls));
  ok('同期状態(v292Dfix399_*)は送らない', !('v292Dfix399_baseTs' in pkg.ls));
}

console.log('\n== fix605 ②: 墓標 sm1 で生きている sm12 を巻き込まない（C4） ==');
{
  /* 実運用のIDは smrg85jwsn6 のような11桁なので、まずその形で確かめる。 */
  const DEAD = 'smrg85jwsn6', LIVE = 'smzq41pkab2';
  const w = mkEnv({ seed: {
    'chr6_slots_meta': JSON.stringify([{ id: DEAD, deleted: true, deleteOpId: 'o' }, { id: LIVE, name: '生きてる' }]),
    'chr6_active_slot': JSON.stringify(LIVE),
    ['chr6_slot_' + DEAD]: STORY(2),
    ['chr6_slot_' + LIVE]: STORY(23),
    ['v292Dfix77States_slot_' + DEAD]: 'a',
    ['v292Dfix77States_slot_' + LIVE]: 'b',
    ['chr6_v292Dfix54_genderMap_"' + LIVE + '"']: 'g',
    'v292ProxyPass': 'p'
  } });
  const pkg = w.__v292Dfix399x.collectLight(1);
  ok('★★生きている方の本体・サイドストア・引用符付きキーが全部入る',
     eq(lsKeys(pkg), ['chr6_active_slot', 'chr6_slot_' + LIVE, 'chr6_slots_meta',
                      'chr6_v292Dfix54_genderMap_"' + LIVE + '"', 'v292Dfix77States_slot_' + LIVE]),
     lsKeys(pkg));
  ok('★墓標側の本体は落ちる', !(('chr6_slot_' + DEAD) in pkg.ls));
  ok('★墓標側のサイドストアも落ちる', !(('v292Dfix77States_slot_' + DEAD) in pkg.ls));
}
{
  /* ★IDが前方一致する作り物（sm1 / sm12）でも、**本体は絶対に巻き込まれない**。
     本体の分類は /^chr6_slot_([A-Za-z0-9]+)$/ の完全一致なので、前方一致に影響されない。 */
  const meta = JSON.stringify([{ id: 'sm1', deleted: true, deleteOpId: 'o' }, { id: 'sm12', name: '生きてる' }]);
  const mk = order => mkEnv({ seed: order });
  const wA = mk({ 'chr6_slots_meta': meta, 'chr6_active_slot': JSON.stringify('sm12'),
                  'chr6_slot_sm1': STORY(2), 'chr6_slot_sm12': STORY(23),
                  'v292Dfix77States_slot_sm1': 'a', 'v292Dfix77States_slot_sm12': 'b', 'v292ProxyPass': 'p' });
  const pA = wA.__v292Dfix399x.collectLight(1);
  ok('★★sm12 の本体は入る（sm1 の墓標に巻き込まれない）', pA.ls['chr6_slot_sm12'] === STORY(23), lsKeys(pA));
  ok('★sm1 の本体は入らない', !('chr6_slot_sm1' in pA.ls));
  ok('★sm1 のサイドストアも入らない', !('v292Dfix77States_slot_sm1' in pA.ls));
  ok('★完全性の判定は full のまま（本体は1件も欠けていない）',
     wA.__v292Dfix399x.completeness().full === true, wA.__v292Dfix399x.completeness());

  /* ★★【既知の限界・実装は直さず報告】
     サイドストアの分類（fix562 classifyKey ⑧）は「生きているスロットIDを**部分一致**で先に
     見つけた方を採用」する。墓標 sm1 の**本体がまだ物理削除されずに残っている**あいだは
     liveSlots() に 'sm1' が入るので、列挙順が sm1 → sm12 だと
     'v292Dfix77States_slot_sm12'.indexOf('sm1') が当たり、**生きている sm12 のサイドストアが
     墓標側と誤判定されて落ちる**。本体は落ちないので completeness も full のままになる。
     実運用のIDは11桁の乱数で前方一致はまず起きず、物理削除が済めば消える現象なので
     いまは影響が小さいが、**ガードは本体しか守っていない**ことを記録として残す。
     ★この行が赤くなったら、それは直った合図。期待値を「入る」へ変えること。 */
  ok('【既知の限界】墓標の本体が残っている前方一致IDでは、生きている側のサイドストアが落ちる',
     !('v292Dfix77States_slot_sm12' in pA.ls), lsKeys(pA));
  const wB = mk({ 'chr6_slots_meta': meta, 'chr6_active_slot': JSON.stringify('sm12'),
                  'chr6_slot_sm12': STORY(23),
                  'v292Dfix77States_slot_sm12': 'b', 'v292ProxyPass': 'p' });
  const pB = wB.__v292Dfix399x.collectLight(1);
  ok('★墓標側の本体が物理削除済みなら、生きている側のサイドストアは正しく入る',
     pB.ls['v292Dfix77States_slot_sm12'] === 'b', lsKeys(pB));
}

console.log('\n== fix605 ③: completeness の判定（C5/C6） ==');
{
  const c = W1.__v292Dfix399x.completeness();
  ok('★完全なら full:true / missing は空', c.full === true && eq(c.missing, []), c);
  ok('★生存スロット数を具体値で持つ（smA/smB/chr6 = 3）', c.liveCount === 3, c);
}
{
  /* ★C6: meta には居るが、ローカルに本体が無い枠（0ターンの新規枠など）は欠落ではない。 */
  const w = mkEnv({ seed: {
    'chr6_slots_meta': JSON.stringify([{ id: 'smA', name: 'A' }, { id: 'smNew', name: 'まだ0ターン' }]),
    'chr6_active_slot': JSON.stringify('smA'),
    'chr6_slot_smA': STORY(23),
    'v292ProxyPass': 'p'
  } });
  const pkg = w.__v292Dfix399x.collectLight(1);
  const c = w.__v292Dfix399x.completeness();
  ok('★★本体が無い枠(smNew)を欠落とみなさない', c.full === true && eq(c.missing, []), c);
  ok('★その枠のキーは当然入らない（存在しないので）', !('chr6_slot_smNew' in pkg.ls), lsKeys(pkg));
  ok('★既定枠 chr6 もローカルに本体が無ければ欠落ではない', !('chr6' in pkg.ls) && c.full === true, c);
  ok('生存スロット数は smA/smNew/chr6 = 3', c.liveCount === 3, c);
}
{
  /* ★C5: 「live と言われていて、ローカルに本体があるのに pkg に無い」ときだけ full:false。
     作り物ではなく実装が実際に落とす経路で作る:
       既定枠(chr6)の分類は fix562 では slotId='default'。
       台帳に id:'default' の墓標が立っていると、chr6 の本体が isDeadSlotKey で落ちる。
       一方 liveSlotIds() は 'chr6' を必ず生存として数えるので、両者の食い違いが
       **そのまま「不完全なパッケージ」**になる。＝本番で起きた形と同じ（22ターンの1件が消える）。 */
  const w = mkEnv({ seed: {
    'chr6_slots_meta': JSON.stringify([{ id: 'default', name: '最初の物語', deleted: true, deleteOpId: 'op1' },
                                       { id: 'smB', name: 'B' }]),
    'chr6_active_slot': JSON.stringify('smB'),
    'chr6': STORY(22),
    'chr6_slot_smB': STORY(11),
    'v292ProxyPass': 'p'
  } });
  const pkg = w.__v292Dfix399x.collectLight(1);
  const c = w.__v292Dfix399x.completeness();
  ok('★★ローカルにある本体が pkg から落ちたら full:false', c.full === false, c);
  ok('★★落ちた本体を名指しで報告する（missing=["chr6"]）', eq(c.missing, ['chr6']), c);
  ok('落ちたのは既定枠の本体だけ（smB は入っている）',
     !('chr6' in pkg.ls) && pkg.ls['chr6_slot_smB'] === STORY(11), lsKeys(pkg));
  W1.__incompleteSeed = true;
}

console.log('\n== fix605 ④: full 印とパッケージの形（C7/C8） ==');
{
  const pkg = W1.__v292Dfix399x.collectLight(2222);
  ok('★★完全なら full:true を立てる', pkg.full === true, pkg.full);
  /* ★C8: packageHash は「pkg から idb を除いて JSON.stringify」した文字列の上で計算される。
     フィールドを1つ足すだけで送信側とサーバの照合の前提が変わる。 */
  ok('★★pkg のキー集合が具体値で一致する（新しいフィールドを増やしていない）',
     eq(Object.keys(pkg).sort(), ['activeSlot', 'device', 'full', 'ls', 'schema', 'updatedAt']),
     Object.keys(pkg));
  ok('★診断値(completeness)はパッケージの外に置いている',
     !('completeness' in pkg) && !('missing' in pkg) && !('liveCount' in pkg), Object.keys(pkg));
  ok('updatedAt は渡した ts がそのまま入る（照合で作り直せる）', pkg.updatedAt === 2222, pkg.updatedAt);
  ok('schema は 1 のまま', pkg.schema === 1, pkg.schema);
}
{
  /* ★不完全なときは full 印を立てない（Worker 側の「完全パッケージだけが canonical を置換」の材料） */
  const w = mkEnv({ seed: {
    'chr6_slots_meta': JSON.stringify([{ id: 'default', deleted: true, deleteOpId: 'o' }, { id: 'smB' }]),
    'chr6_active_slot': JSON.stringify('smB'), 'chr6': STORY(22), 'chr6_slot_smB': STORY(11), 'v292ProxyPass': 'p'
  } });
  const pkg = w.__v292Dfix399x.collectLight(3333);
  ok('★★不完全なら full 印を立てない', !('full' in pkg), Object.keys(pkg));
  ok('★不完全なときの pkg キー集合も具体値で一致（full が無いだけ）',
     eq(Object.keys(pkg).sort(), ['activeSlot', 'device', 'ls', 'schema', 'updatedAt']), Object.keys(pkg));
}
{
  /* ★もう一方の送信経路 fix402 と同じ形であること。
     `full` は fix402c が既に使っている印なので、fix605 は**新しい語彙を増やしていない**。
     両者の形がずれると Worker 側（light = pkg から idb を除いたもの）の判断材料がぶれる。
     ★fix402 は collectLight を外へ出していないので、**ソースの collectLight 本体**を切り出して比べる。
       切り出せなかったら黙って通さない（切り出し失敗が偽の合格になる唯一の経路なので）。 */
  const cutCollectLight = src => {
    const i = src.indexOf('function collectLight(ts){');
    if (i < 0) return null;
    const j = src.indexOf('\n  }', i);
    return j > i ? src.slice(i, j) : null;
  };
  const litFields = body => ['schema', 'updatedAt', 'device', 'activeSlot', 'ls']
                              .filter(f => new RegExp('\\b' + f + ':').test(body)).sort();
  const assigned = body => { const out = [], re = /pkg\.([A-Za-z_$][\w$]*)\s*=[^=]/g; let m;
                             while ((m = re.exec(body))) out.push(m[1]); return out.sort(); };
  const b399 = cutCollectLight(SRC399), b402 = cutCollectLight(SRC402);
  ok('★両方の collectLight を切り出せた（切り出し失敗で素通しさせない）', !!b399 && !!b402,
     { fix399: b399 && b399.length, fix402: b402 && b402.length });
  if (b399 && b402){
    ok('★★pkg リテラルの項目が fix399 と fix402 で一致する',
       eq(litFields(b399), litFields(b402)) &&
       eq(litFields(b399), ['activeSlot', 'device', 'ls', 'schema', 'updatedAt']),
       { fix399: litFields(b399), fix402: litFields(b402) });
    ok('★★あとから足す項目は両方とも full だけ（新しいフィールドを増やしていない）',
       eq(assigned(b399), ['full']) && eq(assigned(b402), ['full']),
       { fix399: assigned(b399), fix402: assigned(b402) });
  }
}

console.log('\n== fix605 ⑤: 不完全なら送らない（C9/C12） ==');
function incompleteEnv(extra){
  return mkEnv({ seed: Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id: 'default', name: '最初の物語', deleted: true, deleteOpId: 'op1' },
                                       { id: 'smB', name: 'B' }]),
    'chr6_active_slot': JSON.stringify('smB'),
    'chr6': STORY(22),
    'chr6_slot_smB': STORY(11),
    'v292ProxyPass': 'p',
    'v292Dfix402_baseRev': '5'
  }, extra || {}) });
}
const W5 = incompleteEnv();
W5.__v292Dfix399x.push().then(
  r => { ok('★★不完全なパッケージで push が成功してはいけない', false, r); return step6(); },
  err => {
    const st = W5.__server.state;
    ok('★★INCOMPLETE_PACKAGE で止まる', err && err.message === 'INCOMPLETE_PACKAGE', String(err && err.message));
    ok('★★err.incomplete === true で見分けられる', err.incomplete === true, err.incomplete);
    ok('★★止めた理由を名指しで返す（missing=["chr6"]）', eq(err.missing, ['chr6']), err.missing);
    /* ★★「送っていない」の確かめ方について
       fetch そのものは 0 回にはならない。push は送信の前に
         ①Worker のバージョン下見（GET /）②op:'meta' の下見（サーバの現在rev取得）
       を必ず行うからで、これらは canonical を1バイトも書き換えない読み取りである。
       固定すべきは **canonical を置き換える put が1件も届いていない** こと。 */
    ok('★★サーバへ put が1件も届いていない（＝本当に送っていない）', st.puts.length === 0, st.puts);
    ok('★★/save に投げたのは下見(op:meta)だけで、op:put は0件',
       eq(st.ops, ['meta']) && st.ops.indexOf('put') < 0, st.ops);
    ok('★通信したのは下見2本だけ（バージョン確認と meta）',
       eq(W5.__fetchLog.map(f => f.op), [null, 'meta']), W5.__fetchLog);
    ok('★サーバの rev が動いていない（canonical に触れていない）', st.rev === 5, st.rev);
    /* ★C12: ガードで抜けたときに pushing の解除漏れがあると、以後まったく同期できなくなる。 */
    return W5.__v292Dfix399x.push().then(
      r2 => { ok('★★2回目も送らないはず', false, r2); return step6(); },
      err2 => {
        ok('★★2回目の push が「同期中」で門前払いされない（pushing が解除されている）',
           err2 && err2.message === 'INCOMPLETE_PACKAGE' && err2.incomplete === true, String(err2 && err2.message));
        ok('★2回目も put は0件のまま', W5.__server.state.puts.length === 0, W5.__server.state.puts);
        return step6();
      });
  }
).catch(e => { fail++; console.log('  FAIL  例外: ' + (e && e.stack || e)); done(); });

function step6(){
  console.log('\n== fix605 ⑤b: 予約された照合が走っても put は漏れない ==');
  /* ガードで抜けたあと fix596 の照合が setTimeout で予約される。
     それが実行されても **canonical を書き換える put は出ない** ことを確かめる。 */
  const w = mkEnv({ runTimers: true, seed: {
    'chr6_slots_meta': JSON.stringify([{ id: 'default', deleted: true, deleteOpId: 'o' }, { id: 'smB' }]),
    'chr6_active_slot': JSON.stringify('smB'), 'chr6': STORY(22), 'chr6_slot_smB': STORY(11),
    'v292ProxyPass': 'p', 'v292Dfix402_baseRev': '5'
  } });
  return w.__v292Dfix399x.push().then(
    r => { ok('★成功してはいけない', false, r); return step7(); },
    err => {
      ok('★INCOMPLETE_PACKAGE のまま', err && err.incomplete === true, String(err && err.message));
      ok('★★予約された照合が走っても put は0件', w.__server.state.puts.length === 0, w.__server.state.ops);
      return step7();
    });
}

function step7(){
  console.log('\n== fix605 ⑥: 完全なら従来どおり送れる（C10） ==');
  const w = mkEnv({ seed: SEED_LIVE() });
  return w.__v292Dfix399x.push().then(res => {
    const st = w.__server.state, put = st.puts[0];
    ok('★push が成功する', res && res.rev === 6, res);
    ok('★★put が1件だけ届く', st.puts.length === 1, st.puts.length);
    ok('★★送った pkg に full:true が付いている', put.pkg.full === true, put.pkg.full);
    ok('★★送った ls に生きている本体が全部入っている（chr6 / smA / smB）',
       put.pkg.ls['chr6'] === STORY(22) && put.pkg.ls['chr6_slot_smA'] === STORY(23) &&
       put.pkg.ls['chr6_slot_smB'] === STORY(11), Object.keys(put.pkg.ls).sort());
    ok('★★送った ls に墓標スロットの本体は入っていない', !('chr6_slot_smD' in put.pkg.ls));
    ok('★fix582 の baseRev も従来どおり付いている（競合検査に参加する）', put.baseRev === 5, put.baseRev);
    ok('★送った pkg のキー集合は idb を足しただけ（新フィールドなし）',
       eq(Object.keys(put.pkg).sort(), ['activeSlot', 'device', 'full', 'idb', 'ls', 'schema', 'updatedAt']),
       Object.keys(put.pkg));
    ok('★診断口も full を返す', w.__v292Dfix399x.completeness().full === true, w.__v292Dfix399x.completeness());
    return step8();
  }, err => { ok('★完全なのに送れないのはおかしい', false, String(err && err.message)); return step8(); });
}

function step8(){
  console.log('\n== fix605 ⑦: OFFスイッチは従来の単一スロット収集へ戻し、ガードも止める（C11） ==');
  /* ★これは同時に「fix605 が無かったときに何が起きていたか」の再現でもある。
     ＝ いま開いている物語1件だけの部分パッケージが、そのまま canonical を置き換えに行く。 */
  const seed = SEED_LIVE(); seed['v292Dfix605Off'] = '1';
  const w = mkEnv({ seed });
  const x = w.__v292Dfix399x;
  const pkg = x.collectLight(1);
  ok('★★OFF: いま開いている物語(smA)まわり＋共有キーしか集めない',
     eq(lsKeys(pkg), ['chr6_active_slot', 'chr6_slot_smA', 'chr6_slots_meta',
                      'v292Dfix77States_slot_smA', 'v292avrec_face']), lsKeys(pkg));
  ok('★★OFF: 他の物語の本体が落ちる（＝事故そのものの再現）',
     !('chr6_slot_smB' in pkg.ls) && !('chr6' in pkg.ls), lsKeys(pkg));
  ok('★OFF: 不完全なので full 印は付かない', !('full' in pkg), Object.keys(pkg));
  ok('★OFF: 判定そのものは動いていて、欠落を名指しできる',
     x.completeness().full === false && eq(x.completeness().missing, ['chr6_slot_smB', 'chr6']),
     x.completeness());
  return x.push().then(res => {
    const st = w.__server.state;
    ok('★★OFF: ガードが止まり、不完全でも送れる（緊急時の逃げ道が生きている）',
       res && res.rev === 6 && st.puts.length === 1, { res, puts: st.puts.length });
    ok('★★OFF: 送られたのは部分パッケージ（旧挙動そのもの）',
       eq(Object.keys(st.puts[0].pkg.ls).sort(), ['chr6_active_slot', 'chr6_slot_smA',
                                                  'chr6_slots_meta', 'v292Dfix77States_slot_smA',
                                                  'v292avrec_face']),
       Object.keys(st.puts[0].pkg.ls).sort());
    ok('★OFF: full 印が付いていない（Worker 側で見分けられる）',
       !('full' in st.puts[0].pkg), Object.keys(st.puts[0].pkg));
    return step9();
  }, err => { ok('★OFF なのに送れないのはおかしい', false, String(err && err.message)); return step9(); });
}

function step9(){
  console.log('\n== fix605 ⑧: セーブ非破壊（収集も判定も1バイトも書かない） ==');
  const seed = SEED_LIVE();
  const w = mkEnv({ seed });
  const before = JSON.stringify(w.__ls.__store);
  w.__v292Dfix399x.collectLight(1);
  w.__v292Dfix399x.completeness();
  w.__v292Dfix399x.liveSlotIds();
  ok('★★collectLight / completeness / liveSlotIds は localStorage を書き換えない',
     JSON.stringify(w.__ls.__store) === before, '差分あり');
  /* ★ガードで止まった push も、セーブ本体（chr6*）を壊さない */
  const w2 = incompleteEnv();
  const storyBefore = w2.__ls.getItem('chr6');
  return w2.__v292Dfix399x.push().then(() => {}, () => {}).then(() => {
    ok('★★ガードで止まった push はセーブ本体を触らない', w2.__ls.getItem('chr6') === storyBefore);
    ok('★他の物語の本体も無傷', w2.__ls.getItem('chr6_slot_smB') === STORY(11));
    done();
  });
}

function done(){
  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
}
