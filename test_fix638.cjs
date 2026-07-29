/* 回帰テスト: v292Dfix638 — pull側の画像ガード（blobで既存アイコンを上書きしない）
 *
 * ■背景（2026-07-29・現コードで確認した保存層の機序）
 *   v292Dfix399-cloudsync.js の applySave は
 *       return idbWriteAll(pkg.idb || {})
 *   で、クラウドの save blob に入っていた画像を **ローカルIDBの既存キーへ無条件に put** していた
 *   （idbPutAllOneTx は存在確認を一切しない）。blob は「キー集合が変わった時だけ」しか更新
 *   されないので、再生成した絵は blob に載らず古いまま固定される。その古い blob が pull で
 *   降ってきて手元の新しい絵を潰す ＝ おしんの症状「アイコンが以前のものへ戻る」。
 *
 * ■GPT裁定（このテストが固定する契約）
 *   正本は per-key チャネル（D1 images + imageRev / fix523・fix633）。blob は最後の受け皿。
 *   C1 ★ローカルに実体があるキーは、blob では**絶対に上書きされない**
 *   C2 ★per-key remote(manifest)に載っているキーは blob から書かない（rev/hash規則へ委ねる）
 *   C3 ★不在＋いま必要＋墓標なし のときだけ補充し、**backfill 対象として記録**する
 *   C4 ★墓標のあるキーは blob から復活しない
 *   C5 ★必要とされていないキーは復活しない
 *   C6 ★モード分離: explicit-restore / self-heal は素通し（fix564復元と selfHeal を壊さない）
 *   C7 ★OFF（v292Dfix638Off='1'）で **fix637 時点と完全に同じ挙動**（無条件上書きへ戻る）
 *   C8 ★期待集合 v292Dfix399_imgKeys を縮めない（fix631 の単調性を壊さない）
 *   C9 ★判定できないときは fail-closed（書かない）。applySave は落ちない
 *   C10 ★直列化: fix523 の pullOne/pushOne はロック中なら少し待ってから走る
 *   C11 ★backfill: 補充で書いたキーは fix523.pushOne で正本へ昇格し、台帳から落ちる
 *   C12 ★fix564 のスナップショット復元は従来どおり置換できる（missing-only 化していない）
 *
 * ■このテストの作りについて（偽の合格を避けるための備え）
 *   ★モック localStorage は setItem したキーが Object.keys(localStorage) にも見えること
 *     （fix638 の neededKeys は v292avrec_* を列挙する）。
 *   ★C1〜C5・C7 は **本物の fix399 の applySave を通して** 確かめる。
 *     ガード関数だけを直接呼ぶと「フックが実際に刺さっているか」を確かめられない。
 *   ★IndexedDB モックは put を本当に保存し、読み戻せること（上書きされたかどうかを見るため）。
 *   ★setTimeout スタブはコールバックを必ず呼ぶ（マイクロタスクへ寄せる）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC399 = read('v292Dfix399-cloudsync.js');
const SRC638 = read('v292Dfix638-pull-image-guard.js');
const SRC564 = read('v292Dfix564-snapshot.js');

const tick = async (n = 200) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const STORY = n => JSON.stringify({ turns: Array.from({ length: n }, () => ({})) });

/* ---------- モック localStorage（Object.keys にも見える） ---------- */
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

/* ---------- IndexedDB モック（put を本当に保存する） ---------- */
function mkIDB(initial){
  const store = Object.assign(Object.create(null), initial || {});
  function cursor(keysOnly){
    const c = {};
    Promise.resolve().then(() => {
      const keys = Object.keys(store);
      let i = 0;
      const step = () => {
        if (i < keys.length){
          const k = keys[i++];
          const rec = { key: k, continue: () => Promise.resolve().then(step) };
          if (!keysOnly) rec.value = store[k];
          if (c.onsuccess) c.onsuccess({ target: { result: rec } });
        } else if (c.onsuccess) c.onsuccess({ target: { result: null } });
      };
      step();
    });
    return c;
  }
  return {
    __store: store,
    open(){
      const req = {};
      Promise.resolve().then(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore(){ return {}; },
          close(){},
          transaction(){
            const tx = {};
            const os = { put(v, k){ store[k] = v; return {}; },
                         openKeyCursor(){ return cursor(true); },
                         openCursor(){ return cursor(false); } };
            tx.objectStore = () => os;
            Promise.resolve().then(() => { if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          }
        };
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    }
  };
}

/* ---------- 実行環境（fix399 + fix638 を本物で読む） ---------- */
function mkEnv(opts){
  opts = opts || {};
  const ls = mkLS(Object.assign({ 'chr6': STORY(3) }, opts.seed || {}));
  const idb = mkIDB(opts.idb || {});
  const visible = opts.visible || [];
  const el = { querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){},
               setAttribute(){}, style: {}, remove(){}, classList: { add(){}, remove(){}, contains: () => false } };
  const doc = { hidden: false, visibilityState: 'visible', readyState: 'complete', documentElement: el, body: el,
    querySelectorAll: (sel) => (String(sel).indexOf('data-avpk') >= 0
        ? visible.map(pk => ({ getAttribute: () => pk })) : []),
    querySelector: () => null, getElementById: () => null, addEventListener(){},
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){},
                            insertAdjacentElement(){}, classList: { add(){}, remove(){} } }) };
  const w = { localStorage: ls, document: doc, console: { log(){}, warn(){}, error(){} },
    setTimeout: (f) => { if (typeof f === 'function') Promise.resolve().then(() => { try { f(); } catch(e){} }); return 0; },
    setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    navigator: { userAgent: 'node' }, location: { href: 'https://x/', search: '', origin: 'https://x' },
    addEventListener(){}, removeEventListener(){}, JSON, Date, Error, Promise, Math, Object, Array, String, Number, RegExp,
    confirm: () => false, alert(){}, prompt: () => null,
    indexedDB: idb,
    fetch: () => Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ v: 26 }) })
  };
  if (opts.manifest !== undefined){
    /* fix633 の manifest 口だけを模す（cb は同期で呼ぶ＝キャッシュ命中時と同じ形） */
    w.__v292Dfix633 = { __armed: true, manifest: (cb) => cb(opts.manifest) };
  }
  if (opts.f523) w.__v292Dfix523 = opts.f523;
  if (opts.inv) w.__v292av = opts.inv;
  w.window = w; w.__ls = ls; w.__idb = idb;
  const ctx = vm.createContext(w);
  if (opts.load638 !== false) vm.runInContext(SRC638, ctx, { filename: 'v292Dfix638-pull-image-guard.js' });
  vm.runInContext(SRC399, ctx, { filename: 'v292Dfix399-cloudsync.js' });
  if (opts.load564) vm.runInContext(SRC564, ctx, { filename: 'v292Dfix564-snapshot.js' });
  return w;
}

const PKG = (idbMap, lsMap) => ({ schema: 1, updatedAt: 1785000000000, activeSlot: 'chr6',
                                  ls: Object.assign({ 'chr6': STORY(3) }, lsMap || {}), idb: idbMap || {} });

(async () => {

console.log('\n== ⓪ ソース検査: フックが本当に刺さっているか ==');
{
  const i = SRC399.indexOf('function applySave');
  const body = SRC399.slice(i, SRC399.indexOf('function toast(', i));
  ok('★applySave が idbWriteGuarded を呼ぶ', /idbWriteGuarded\(pkg\.idb \|\| \{\}/.test(body), body.slice(0, 40));
  ok('★applySave から生の idbWriteAll 呼び出しが消えている', !/return idbWriteAll\(pkg\.idb/.test(body));
  ok('★idbWriteGuarded は未ロード/OFF なら idbWriteAll を呼ぶ（素通し）',
     /function idbWriteGuarded[\s\S]{0,900}?return idbWriteAll\(map\);/.test(SRC399));
  ok('★fix638 が無い環境を壊さない（存在チェックがある）', /window\.__v292Dfix638/.test(SRC399));
  ok('★selfHeal は idbPutAllOneTx を直接使う＝ガードを通らない',
     /function selfHeal[\s\S]*?idbPutAllOneTx\(map, mk\)/.test(SRC399));
  ok('★fix638 に緊急OFFがある', /v292Dfix638Off/.test(SRC638));
  ok('★fix638 は localStorage.setItem をラップしない（画像経路を増やさない）',
     !/localStorage\.setItem\s*=/.test(SRC638) && !/\.setItem\s*=\s*function/.test(SRC638));
}

console.log('\n== ① classify（純関数）: 優先順と理由 ==');
{
  const W = mkEnv({});
  const g = W.__v292Dfix638;
  const K = k => 'v292av2_' + k;
  const v = g.classify({
    mode: 'normal-sync',
    keys: [K('has'), K('tomb'), K('remote'), K('junk'), K('need')],
    local:  { [K('has')]: 1 },
    remote: { [K('remote')]: 1 },
    needed: { [K('need')]: 1, [K('tomb')]: 1, [K('remote')]: 1 },
    tomb:   { [K('tomb')]: 1 }
  });
  ok('★C1 ローカル実体あり → skip(local-exists)', v.why[K('has')] === 'local-exists', v.why);
  ok('★C4 墓標 → skip(tombstone)', v.why[K('tomb')] === 'tombstone');
  ok('★C2 per-key remote あり → skip(per-key-remote)', v.why[K('remote')] === 'per-key-remote');
  ok('★C5 必要とされていない → skip(not-needed)', v.why[K('junk')] === 'not-needed');
  ok('★C3 不在＋必要＋墓標なし → allow(recovery-candidate)', v.why[K('need')] === 'recovery-candidate');
  ok('書くのは1件だけ', JSON.stringify(v.allow) === JSON.stringify([K('need')]), v.allow);
  ok('補充候補として記録される', JSON.stringify(v.recover) === JSON.stringify([K('need')]));
  ok('件数の内訳が出る', v.counts['local-exists'] === 1 && v.counts['not-needed'] === 1, v.counts);
}
{
  const W = mkEnv({});
  const g = W.__v292Dfix638;
  const K = k => 'v292av2_' + k;
  /* ★ローカル実体があるなら、他の条件が何であっても書かない（最強の不変条件） */
  const v = g.classify({ mode: 'normal-sync', keys: [K('a')],
                         local: { [K('a')]: 1 }, remote: null, needed: { [K('a')]: 1 }, tomb: {} });
  ok('★★ローカル有は remote 不明・必要・墓標なしでも skip', v.allow.length === 0 && v.why[K('a')] === 'local-exists');

  const v2 = g.classify({ mode: 'normal-sync', keys: [K('b')],
                          local: {}, remote: null, needed: { [K('b')]: 1 }, tomb: {} });
  ok('remote 不明でも「不在＋必要」なら補充する（上書きは起きない）', v2.allow.length === 1 && v2.remoteKnown === false);

  const v3 = g.classify({ mode: 'explicit-restore', keys: [K('a'), K('b')],
                          local: { [K('a')]: 1 }, remote: { [K('b')]: 1 }, needed: {}, tomb: { [K('a')]: 1 } });
  ok('★C6 explicit-restore は全部素通し', v3.allow.length === 2 && v3.why[K('a')] === 'mode-bypass');

  const v4 = g.classify({ mode: 'self-heal', keys: [K('a')], local: { [K('a')]: 1 }, remote: {}, needed: {}, tomb: {} });
  ok('★C6 self-heal も素通し', v4.allow.length === 1 && v4.why[K('a')] === 'mode-bypass');

  ok('キー0件でも落ちない', g.classify({ keys: [] }).total === 0);
  ok('PREFIX 無しのキーも正規化して扱う', g.classify({ keys: ['mia'], local: { 'v292av2_mia': 1 } }).skip[0] === 'v292av2_mia');
}

console.log('\n== ② ★本物の applySave を通した上書き禁止（C1/C2/C3/C5） ==');
{
  const W = mkEnv({
    idb: { 'v292av2_mia': 'data:image/png;base64,NEW-LOCAL' },     // 手元で再生成した新しい絵
    seed: { 'v292avrec_mia': '{"p":"x"}', 'v292avrec_ken': '{"p":"y"}' },   // mia/ken は実在キャラ
    manifest: { 'v292av2_ghost': { rev: 7, hash: '9:zz' } }                  // ghost は per-key 正本にある
  });
  const r = await W.__v292Dfix399x.applySave(PKG({
    'v292av2_mia':   'data:image/png;base64,OLD-BLOB',   // ★古い blob（これで潰されていた）
    'v292av2_ken':   'data:image/png;base64,KEN',        // 不在＋必要 → 補充してよい
    'v292av2_ghost': 'data:image/png;base64,GHOST',      // per-key remote にある → 触らない
    'v292av2_junk':  'data:image/png;base64,JUNK'        // 誰のものでもない → 復活させない
  }));
  await tick();
  const store = W.__idb.__store;
  ok('applySave は成功する', r === true, r);
  ok('★★C1 既存のローカル画像が blob で上書きされない',
     store['v292av2_mia'] === 'data:image/png;base64,NEW-LOCAL', store['v292av2_mia']);
  ok('★C3 不在＋必要なキーは補充される', store['v292av2_ken'] === 'data:image/png;base64,KEN');
  ok('★C2 per-key remote にあるキーは blob から書かない', store['v292av2_ghost'] === undefined);
  ok('★C5 必要とされていないキーは復活しない', store['v292av2_junk'] === undefined);

  const d = W.__v292Dfix638.lastDecision();
  ok('判定の内訳が読める', d && d.counts['local-exists'] === 1 && d.counts['per-key-remote'] === 1
     && d.counts['not-needed'] === 1 && d.counts['recovery-candidate'] === 1, d);
  ok('診断が localStorage にも残る', W.__ls.getItem('v292Dfix638_diag') !== null);
  ok('★C3 補充したキーは backfill 台帳に載る',
     JSON.stringify(W.__v292Dfix638.backlog()) === JSON.stringify(['v292av2_ken']), W.__v292Dfix638.backlog());

  /* ★C8 期待集合は縮まない（blob の全キーが union される） */
  const exp = JSON.parse(W.__ls.getItem('v292Dfix399_imgKeys'));
  ok('★C8 期待集合に blob の全キーが入る（縮めない）',
     JSON.stringify(exp) === JSON.stringify(['v292av2_ghost', 'v292av2_junk', 'v292av2_ken', 'v292av2_mia']), exp);
}
{
  /* 画面に映っているキャラは、レシピが無くても「必要」とみなす */
  const W = mkEnv({ idb: {}, visible: ['onscreen'], manifest: {} });
  await W.__v292Dfix399x.applySave(PKG({ 'v292av2_onscreen': 'data:image/png;base64,S' }));
  await tick();
  ok('★画面に映っている不在キーは補充される', W.__idb.__store['v292av2_onscreen'] === 'data:image/png;base64,S');
}
{
  /* 期待集合(v292Dfix399_imgKeys)に入っているキーも「必要」 */
  const W = mkEnv({ idb: {}, manifest: {},
                    seed: { 'v292Dfix399_imgKeys': JSON.stringify(['v292av2_expected']) } });
  await W.__v292Dfix399x.applySave(PKG({ 'v292av2_expected': 'data:image/png;base64,E' }));
  await tick();
  ok('★期待集合にあるキーは補充される', W.__idb.__store['v292av2_expected'] === 'data:image/png;base64,E');
}
{
  /* ★新品の端末（在庫0・期待集合なし）でも、同じ取り込みで来たレシピを根拠に復元できる */
  const W = mkEnv({ idb: {}, manifest: {} });
  await W.__v292Dfix399x.applySave(PKG(
    { 'v292av2_a': 'data:image/png;base64,A', 'v292av2_b': 'data:image/png;base64,B' },
    { 'v292avrec_a': '{"p":"1"}', 'v292avrec_b': '{"p":"2"}' }));
  await tick();
  ok('★★新品端末の復元が壊れていない（クラウド由来のレシピを根拠に補充）',
     W.__idb.__store['v292av2_a'] === 'data:image/png;base64,A' &&
     W.__idb.__store['v292av2_b'] === 'data:image/png;base64,B', W.__idb.__store);
}
{
  /* ★C4 墓標のあるキーは復活しない */
  const W = mkEnv({ idb: {}, manifest: {},
                    seed: { 'v292avrec_dead': '{"p":"x"}',
                            'v292Dfix638_tomb': JSON.stringify(['v292av2_dead']) } });
  await W.__v292Dfix399x.applySave(PKG({ 'v292av2_dead': 'data:image/png;base64,D' }));
  await tick();
  ok('★C4 墓標のあるキーは blob から復活しない', W.__idb.__store['v292av2_dead'] === undefined);
  ok('★墓標のキーは期待集合にも入れない',
     JSON.parse(W.__ls.getItem('v292Dfix399_imgKeys') || '[]').indexOf('v292av2_dead') < 0);
}

console.log('\n== ③ ★C7 OFF で fix637 時点の挙動へ完全に戻る ==');
{
  const W = mkEnv({
    seed: { 'v292Dfix638Off': '1', 'v292avrec_mia': '{"p":"x"}' },
    idb: { 'v292av2_mia': 'data:image/png;base64,NEW-LOCAL' },
    manifest: { 'v292av2_ghost': { rev: 7, hash: '9:zz' } }
  });
  ok('OFF なら on()=false', W.__v292Dfix638.on() === false);
  await W.__v292Dfix399x.applySave(PKG({
    'v292av2_mia':   'data:image/png;base64,OLD-BLOB',
    'v292av2_ghost': 'data:image/png;base64,GHOST',
    'v292av2_junk':  'data:image/png;base64,JUNK'
  }));
  await tick();
  const store = W.__idb.__store;
  ok('★C7 OFF なら既存も無条件で上書きされる（旧挙動）', store['v292av2_mia'] === 'data:image/png;base64,OLD-BLOB');
  ok('★C7 OFF なら per-key remote 済みも書かれる（旧挙動）', store['v292av2_ghost'] === 'data:image/png;base64,GHOST');
  ok('★C7 OFF なら不要なキーも書かれる（旧挙動）', store['v292av2_junk'] === 'data:image/png;base64,JUNK');
  ok('OFF なら判定も記録しない', W.__v292Dfix638.lastDecision() === null);
  ok('OFF なら backfill 台帳も作らない', W.__ls.getItem('v292Dfix638_backfill') === null);
  ok('OFF でも fix399 の期待集合は従来どおり書かれる（idbWriteAll の仕様）',
     JSON.parse(W.__ls.getItem('v292Dfix399_imgKeys')).length === 3);
}
{
  /* fix638 を読み込んでいない環境（配信順の事故など）でも壊れない */
  const W = mkEnv({ load638: false, idb: { 'v292av2_mia': 'OLD' } });
  const r = await W.__v292Dfix399x.applySave(PKG({ 'v292av2_mia': 'data:image/png;base64,X' }));
  await tick();
  ok('★fix638 未ロードでも applySave は成功する', r === true);
  ok('★fix638 未ロードなら従来どおり書き込む', W.__idb.__store['v292av2_mia'] === 'data:image/png;base64,X');
}

console.log('\n== ④ ★C6 モード分離: guardedWrite は normal-sync 以外を素通しする ==');
{
  const W = mkEnv({ idb: {}, manifest: {} });
  const g = W.__v292Dfix638;
  const seen = [];
  const prim = { writeAll: (m) => { seen.push(Object.keys(m).sort()); return Promise.resolve(Object.keys(m).length); },
                 readKeys: () => Promise.resolve(['v292av2_a']) };
  const map = { 'v292av2_a': 'A', 'v292av2_b': 'B' };
  const n1 = await g.guardedWrite(map, { mode: 'explicit-restore', path: 'fix564.restore' }, prim);
  ok('★C6 explicit-restore は全キーを渡す（fix564復元を壊さない）',
     JSON.stringify(seen[0]) === JSON.stringify(['v292av2_a', 'v292av2_b']) && n1 === 2, seen);
  const n2 = await g.guardedWrite(map, { mode: 'self-heal', path: 'fix399.selfHeal' }, prim);
  ok('★C6 self-heal も全キーを渡す', JSON.stringify(seen[1]) === JSON.stringify(['v292av2_a', 'v292av2_b']) && n2 === 2);

  const n3 = await g.guardedWrite(map, { mode: 'normal-sync', path: 't' }, prim);
  ok('★normal-sync では既存キー(a)が落ちる', seen[2] === undefined || seen[2].indexOf('v292av2_a') < 0, seen[2]);
  ok('normal-sync で書けるものが無ければ writeAll を呼ばない', n3 === 0, n3);
}

console.log('\n== ⑤ ★C9 判定できないときは書かない（fail-closed・applySaveは落ちない） ==');
{
  const W = mkEnv({ idb: {}, manifest: {}, seed: { 'v292avrec_a': '{"p":"x"}' } });
  const g = W.__v292Dfix638;
  let called = 0;
  const prim = { writeAll: () => { called++; return Promise.reject(new Error('IDB死亡')); },
                 readKeys: () => Promise.resolve([]) };
  const n = await g.guardedWrite({ 'v292av2_a': 'A' },
                                 { mode: 'normal-sync', path: 't' }, prim).catch(() => 'THREW');
  ok('補充候補なので writeAll までは行く', called === 1, called);
  ok('★C9 書込みが失敗しても例外を投げ返さない（取り込み全体を巻き添えにしない）', n === 0, n);
  const diag = JSON.parse(W.__ls.getItem('v292Dfix638_diag') || '{}');
  ok('★C9 失敗理由を黙らせない', typeof diag.error === 'string' && diag.allowed === 0, diag);
  ok('★C9 失敗しても期待集合は縮めない',
     JSON.parse(W.__ls.getItem('v292Dfix399_imgKeys') || '[]').indexOf('v292av2_a') >= 0);
}

console.log('\n== ⑥ ★C10 直列化（後勝ちの窓を狭める） ==');
{
  const calls = [];
  const f523 = { __armed: true, on: () => true,
                 pullOne: (pk, rev, done) => { calls.push('pull:' + pk); if (done) done(true); },
                 pushOne: (pk, done) => { calls.push('push:' + pk); if (done) done(true); } };
  const W = mkEnv({ f523, idb: {}, manifest: {} });
  const g = W.__v292Dfix638;
  ok('fix523 を包める', g.wrap523() === true);
  ok('二重には包まない', g.wrap523() === true && W.__v292Dfix523.__f638lock === true);
  ok('共通ロックを1本だけ置く', W.__chronicleImgApplyLock === g.lock);

  const rel = g.lock.acquire('blob-apply');
  ok('ロックを取れる', typeof rel === 'function' && g.lock.held() === true);
  W.__v292Dfix523.pullOne('mia', 3, () => {});
  ok('★C10 ロック中は per-key 適用がすぐには走らない', calls.length === 0, calls);
  rel();
  await tick(20);
  ok('★C10 ロックが空けば走る', JSON.stringify(calls) === JSON.stringify(['pull:mia']), calls);
  ok('ロックは解放されている', g.lock.held() === false);
}
{
  /* v292Dfix638LockOff='1' なら包まない（緊急時の逃げ道） */
  const f523 = { __armed: true, on: () => true, pullOne: (p, r, d) => d && d(true), pushOne: (p, d) => d && d(true) };
  const W = mkEnv({ f523, seed: { 'v292Dfix638LockOff': '1' } });
  ok('★LockOff なら fix523 を包まない', W.__v292Dfix638.wrap523() === false && !W.__v292Dfix523.__f638lock);
}

console.log('\n== ⑦ ★C11 backfill: 補充したキーを per-key 正本へ昇格する ==');
{
  const pushed = [];
  const f523 = { __armed: true, on: () => true,
                 pullOne: (pk, rev, done) => done && done(true),
                 pushOne: (pk, done) => { pushed.push(pk); if (done) done(true); } };
  const W = mkEnv({ f523, idb: {}, manifest: {}, seed: { 'v292avrec_ken': '{"p":"y"}' } });
  await W.__v292Dfix399x.applySave(PKG({ 'v292av2_ken': 'data:image/png;base64,KEN' }));
  await tick();
  /* ★補充が起きたら自動で昇格まで進む（このテストの setTimeout は即時に回るので、
     applySave の直後には既に flushBackfill まで走っている）。 */
  ok('★C11 fix523.pushOne へ PREFIX 無しの pk で渡す', JSON.stringify(pushed) === JSON.stringify(['ken']), pushed);
  ok('★C11 昇格したら台帳から落ちる', W.__v292Dfix638.backlog().length === 0, W.__v292Dfix638.backlog());
  ok('★C11 昇格は1回だけ（同じキーを押し続けない）', pushed.length === 1, pushed);
  const r = await new Promise(res => W.__v292Dfix638.flushBackfill(res));
  ok('台帳が空なら何も送らない', r && r.pushed === 0 && pushed.length === 1, r);
}
{
  /* backfill OFF / fix523 不在では何もしない（例外も出さない） */
  const W = mkEnv({ idb: {}, manifest: {}, seed: { 'v292Dfix638BackfillOff': '1' } });
  const r = await new Promise(res => W.__v292Dfix638.flushBackfill(res));
  ok('BackfillOff なら何もしない', r === null, r);
  const W2 = mkEnv({ idb: {}, manifest: {} });
  const r2 = await new Promise(res => W2.__v292Dfix638.flushBackfill(res));
  ok('fix523 が居なくても落ちない', r2 === null, r2);
}

console.log('\n== ⑧ ★C12 fix564 のスナップショット復元は従来どおり置換できる ==');
{
  const W = mkEnv({ load564: true, idb: {},
    seed: { 'chr6_slot_s1': STORY(5), 'v292Dfix77States_slot_s1': '{"old":1}' } });
  const f564 = W.__v292Dfix564;
  const c = f564.create('s1', { now: 1785000000000, reason: 'test' });
  ok('スナップショットを作れる', c.ok === true, c);
  /* live 側を書き換えてから復元する（＝上書きが起きることを確かめる） */
  W.__ls.setItem('v292Dfix77States_slot_s1', '{"changed":1}');
  const dry = f564.restore(c.id, {});
  ok('既定は dryRun（1バイトも書かない）', dry.dryRun === true && W.__ls.getItem('v292Dfix77States_slot_s1') === '{"changed":1}');
  const rr = f564.restore(c.id, { confirm: true });
  ok('★C12 confirm すれば既存を置換できる（missing-only 化していない）',
     rr.ok === true && W.__ls.getItem('v292Dfix77States_slot_s1') === '{"old":1}', rr);
  ok('★fix564 は fix638 を経由しない（画像はスナップショット対象外）', !/fix638/.test(SRC564));
}

console.log('\n== ⑨ 冪等・堅牢性 ==');
{
  const W = mkEnv({ idb: {}, manifest: {} });
  const before = W.__v292Dfix638;
  const ctx = vm.createContext(W);
  vm.runInContext(SRC638, ctx, { filename: '638-again' });
  ok('2回読んでも差し替わらない', W.__v292Dfix638 === before);
}
{
  const W = mkEnv({ idb: {}, manifest: {},
                    seed: { 'v292Dfix399_imgKeys': '{{{broken', 'v292Dfix638_tomb': 'nope',
                            'v292Dfix638_backfill': '###' } });
  ok('壊れた期待集合でも落ちない', Object.keys(W.__v292Dfix638.neededKeys()).length >= 0);
  ok('壊れた墓標台帳でも落ちない', JSON.stringify(W.__v292Dfix638.tombKeys()) === '{}');
  ok('壊れた backfill 台帳でも落ちない', JSON.stringify(W.__v292Dfix638.backlog()) === '[]');
  const r = await W.__v292Dfix399x.applySave(PKG({ 'v292av2_a': 'data:image/png;base64,A' }));
  ok('壊れた台帳があっても applySave は成功する', r === true);
}
{
  const W = mkEnv({ idb: {}, manifest: {} });
  const r = await W.__v292Dfix399x.applySave(PKG({}));
  await tick();
  ok('画像0件の取り込みでも成功する', r === true);
  ok('status() が例外を投げない', (() => { try { W.__v292Dfix638.status(); return true; } catch(e){ return false; } })());
}
{
  /* manifest が取れない（未ログイン・通信失敗）→ remoteKnown:false でも上書きはしない */
  const W = mkEnv({ idb: { 'v292av2_mia': 'data:image/png;base64,LOCAL' },
                    seed: { 'v292avrec_mia': '{"p":"x"}' } });   // manifest 口そのものが無い
  await W.__v292Dfix399x.applySave(PKG({ 'v292av2_mia': 'data:image/png;base64,BLOB' }));
  await tick();
  ok('★manifest が取れなくても既存は守られる', W.__idb.__store['v292av2_mia'] === 'data:image/png;base64,LOCAL');
  ok('remote 不明として記録される', W.__v292Dfix638.lastDecision().remoteKnown === false);
}

console.log('');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);

})();
