/* 回帰テスト: v292Dfix577 — GPT裁定で「即時出荷可」とされた2件
 *   (A) home.html: chr6_bk_del_ の世代整理の sort バグ
 *       旧: ks.sort() がキー全体の辞書順 → **idが先に効いて時刻順にならない**
 *       条件(GPT指定): ①異なるslot IDが混在しても時刻順 ②13桁時刻をint32へ折り返さない
 *                      ③時刻が読めないものは自動削除しない ④各スロットの唯一の控えは消さない
 *   (B) 削除経路B/C(gallery deleteSave / features clearSlot)の独自削除を停止し、
 *       正規サービスへ委譲。未搭載なら**削除せず fail-closed**（旧実装へ戻さない）。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME = read('home.html');
const GAL  = read('v292Dfix310-gallery.js');
const FEAT = read('features.js');
const G577 = read('v292Dfix577-delete-entry-guard.js');

/* ---- 共通のモック環境 ---------------------------------------------------- */
function mkWin(seed, opts){
  opts = opts || {};
  const store = Object.assign({}, seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const toasts = [], alerts = [], warns = [];
  const w = { localStorage: ls, console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error(){} },
    alert: m => alerts.push(String(m)),
    confirm: () => opts.confirm !== false,
    setTimeout: () => 0, clearTimeout(){}, location: { reload(){}, href: '' },
    showToast: m => toasts.push(String(m)) };
  w.window = w; w.__store = store; w.__toasts = toasts; w.__alerts = alerts; w.__warns = warns;
  vm.createContext(w);
  vm.runInContext(G577, w, { filename: 'v292Dfix577-delete-entry-guard.js' });
  return w;
}

/* ================= (A) sort バグ ========================================= */
console.log('\n== (A1) ソース: 時刻を数値で比較している ==');
{
  const i = HOME.indexOf('function delStory');
  const body = HOME.slice(i, HOME.indexOf('function renameStory'));
  ok('★キー全体の素の sort() を使っていない', !/ks\.sort\(\);/.test(body), body.slice(0,80));
  ok('★時刻の数値順で並べている', /ks\.sort\(function\(a,b\)\{\s*return \(a\.ts - b\.ts\)/.test(body));
  ok('★Number() を使う(|0 は13桁で壊れる)', /Number\(m\[2\]\)/.test(body));
  ok('★時刻の切り捨て(|0)で13桁を壊していない',
     !/Number\([^)]*\)\s*\|\s*0/.test(body) && !/m\[2\]\s*\|\s*0/.test(body));
  ok('★時刻が読めないキーは触らない(正規表現で弾く)', /if\(!m\) continue;/.test(body));
  ok('★古い順に落としている', /ks\.shift\(\)/.test(body));
  ok('★★同時刻でも決定的な順序になる(キー名でtie-break)',
     /\(a\.ts - b\.ts\) \|\| \(a\.key < b\.key/.test(body));
  ok('★★書けたことを読み戻して確認してから整理する', /wrote = \(g\(newKey\) === raw\)/.test(body));
  ok('★今書いた控えを整理候補にしない', /if\(k===newKey\) continue;/.test(body));
  ok('★★唯一控え保護を適用しない理由がコメントに書いてある(将来の誤修正を防ぐ)',
     body.indexOf('定義上すべてが') > 0 && body.indexOf('有限の保持枠') > 0);
  ok('★「undoではなく退避」と正確に書いてある(復元UIがまだ無いため)',
     body.indexOf('復元可能性を残した退避') > 0);
}

/* delStory の控え整理部分だけを切り出して実際に走らせる */
function runTrim(seedKeys, newId, opts){
  opts = opts || {};
  const store = {};
  seedKeys.forEach(k => { store[k] = 'v_' + k; });
  store['chr6_slot_' + newId] = 'NEWRAW';
  const LS = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => {
      /* quota:true なら新しい控えの書込だけ失敗させる（既存キーの更新は通す） */
      if (opts.quota && !Object.prototype.hasOwnProperty.call(store, k)){
        const e = new Error('q'); e.name = 'QuotaExceededError'; throw e;
      }
      store[k] = String(v);
    },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const i = HOME.indexOf('    // P2-d:');
  const j = HOME.indexOf('    writeMeta(readMeta()', i);
  const src = HOME.slice(i, j);
  const ctx = { LS, g: k => LS.getItem(k), s: (k, v) => LS.setItem(k, v),
                slotKey: id => 'chr6_slot_' + id, id: newId, Date, Number };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'home.html' });
  return { store, left: Object.keys(store).filter(k => k.indexOf('chr6_bk_del_') === 0).sort() };
}

console.log('\n== (A2) 実挙動: 異なるslot IDが混在しても「最も古い」が消える ==');
{
  /* 旧実装なら辞書順で 'aaa' が先に消える。正しくは時刻の古い 'zzz_...000' が消えるべき。 */
  const r = runTrim([
    'chr6_bk_del_zzz_1780000000000',   /* ← 最も古い。これが消えるべき */
    'chr6_bk_del_aaa_1785000000000'    /* ← 新しい。残すべき */
  ], 'new1');
  ok('★★時刻の古い方(zzz)が消えた', r.left.indexOf('chr6_bk_del_zzz_1780000000000') < 0, r.left);
  ok('★★時刻の新しい方(aaa)は残った', r.left.indexOf('chr6_bk_del_aaa_1785000000000') >= 0, r.left);
  ok('新しい控えが書かれた', r.left.some(k => k.indexOf('chr6_bk_del_new1_') === 0), r.left);
  ok('2世代に収まっている', r.left.length === 2, r.left);
}

console.log('\n== (A3) 13桁時刻が壊れない(int32折り返しをしていない) ==');
{
  /* |0 を使うと 1780000000000|0 は負の小さい値になり、順序が壊れる */
  const r = runTrim([
    'chr6_bk_del_s1_1780000000000',
    'chr6_bk_del_s1_1785000000000'
  ], 'new2');
  ok('★★古い方が消えた(13桁が正しく比較されている)',
     r.left.indexOf('chr6_bk_del_s1_1780000000000') < 0, r.left);
  ok('新しい方は残った', r.left.indexOf('chr6_bk_del_s1_1785000000000') >= 0, r.left);
}

console.log('\n== (A4) 時刻が読めないキーは自動削除しない ==');
{
  const r = runTrim([
    'chr6_bk_del_broken',                 /* 時刻なし */
    'chr6_bk_del_s1_notanumber',          /* 時刻が数字でない */
    'chr6_bk_del_s1_1780000000000',
    'chr6_bk_del_s2_1785000000000'
  ], 'new3');
  ok('★★時刻なしは残る', r.left.indexOf('chr6_bk_del_broken') >= 0, r.left);
  ok('★★時刻が数字でないものは残る', r.left.indexOf('chr6_bk_del_s1_notanumber') >= 0, r.left);
}

console.log('\n== (A5) ★2世代の上限が実際に効く(際限なく積み上がらない) ==');
{
  /* ここは設計判断を固定する。chr6_bk_del_ は「削除済み物語」の控えなので、
     『各スロットの唯一の控えは消さない』を字義どおり当てると上限が一度も効かず、
     削除のたびに60KB級の控えが際限なく積み上がる（実装時に回帰テストで踏んだ）。
     有限のundo枠として、古い順に落とすのが正しい。 */
  const r = runTrim([
    'chr6_bk_del_s1_1780000000000',
    'chr6_bk_del_s2_1781000000000'
  ], 'new4');
  ok('★★2世代に収まる(上限が効く)', r.left.length === 2, r.left);
  ok('★★最も古い s1 が落ちる', r.left.indexOf('chr6_bk_del_s1_1780000000000') < 0, r.left);
  ok('新しい控えは書かれる', r.left.some(k => k.indexOf('chr6_bk_del_new4_') === 0), r.left);
}
{
  /* 5件溜まっていても2件に収束する */
  const r = runTrim([
    'chr6_bk_del_a_1780000000000', 'chr6_bk_del_b_1781000000000',
    'chr6_bk_del_c_1782000000000', 'chr6_bk_del_d_1783000000000',
    'chr6_bk_del_e_1784000000000'
  ], 'new6');
  ok('★★5件からでも2世代へ収束する', r.left.length === 2, r.left);
  ok('★残るのは最新の e と新規', r.left.indexOf('chr6_bk_del_e_1784000000000') >= 0, r.left);
}
{
  /* 同じスロットが2件あるなら、古い方は消してよい */
  const r = runTrim([
    'chr6_bk_del_s1_1780000000000',
    'chr6_bk_del_s1_1781000000000'
  ], 'new5');
  ok('同一スロットに2件あれば古い方は消える',
     r.left.indexOf('chr6_bk_del_s1_1780000000000') < 0, r.left);
}

/* ================= (B) 削除入口ガード ==================================== */
console.log('\n== (A6) ★★書込に失敗したら既存の控えを先に減らさない(fix568と同じ型の事故) ==');
{
  /* 旧実装は「先に消してから書く」なので、書込に失敗すると控えが1件も無い状態を自分で作る。 */
  const r = runTrim([
    'chr6_bk_del_a_1780000000000',
    'chr6_bk_del_b_1781000000000'
  ], 'newQ', { quota: true });
  ok('★★既存の控えが2件とも残っている', r.left.length === 2, r.left);
  ok('★★具体的に a が残る', r.left.indexOf('chr6_bk_del_a_1780000000000') >= 0, r.left);
  ok('★★具体的に b が残る', r.left.indexOf('chr6_bk_del_b_1781000000000') >= 0, r.left);
  ok('★中途半端な新しい控えを残さない',
     !r.left.some(k => k.indexOf('chr6_bk_del_newQ_') === 0), r.left);
}

console.log('\n== (A7) 同時刻の控えでも結果が決定的 ==');
{
  const run = () => runTrim([
    'chr6_bk_del_zzz_1780000000000',
    'chr6_bk_del_aaa_1780000000000'   /* ← 同じ時刻 */
  ], 'newT').left.filter(k => k.indexOf('chr6_bk_del_newT_') !== 0).sort().join(',');
  const a = run(), b = run(), c = run();
  ok('★★3回実行して同じ結果になる', a === b && b === c, { a, b, c });
  ok('★キー名の小さい方(aaa)が先に落ちる', a.indexOf('chr6_bk_del_aaa_') < 0, a);
}

console.log('\n== (B1) ソース: B/C が自前で削除していない ==');
{
  const i = GAL.indexOf('function deleteSave');
  const body = GAL.slice(i, i + 1200);
  ok('★gallery: removeItem を呼んでいない', body.indexOf('removeItem') < 0, body.slice(0, 300));
  ok('★gallery: ガードへ委譲している', /requestDelete\(id,\s*\{\s*source:'gallery'\s*\}\)/.test(body));
  ok('★gallery: 断られたら何もしない', /if\(!g\.requestDelete[^)]*\)\)\s*return;/.test(body));

  const j = FEAT.indexOf('function clearSlot');
  const cbody = FEAT.slice(j, j + 900);
  ok('★features: lsRemove を呼んでいない', cbody.indexOf('lsRemove') < 0, cbody.slice(0, 300));
  ok('★features: metaを書き換えていない(updatedAt=null を残さない)', cbody.indexOf('updatedAt = null') < 0);
  ok('★features: ガードへ委譲している', /requestDelete\(id,\s*\{\s*source:\s*'features-clearSlot'\s*\}\)/.test(cbody));
  ok('★features: 呼び出し元が失敗時にトーストを出さない',
     /if \(!clearSlot\(id\)\) return;/.test(FEAT));
}

console.log('\n== (B2) 正規サービス未搭載なら削除しない(fail-closed) ==');
{
  const w = mkWin({ 'chr6_slot_smA': 'data' });
  const r = w.__v292Dfix577.requestDelete('smA', { source: 'gallery' });
  ok('★false を返す', r === false, r);
  ok('★★データは消えていない', w.__store['chr6_slot_smA'] === 'data', Object.keys(w.__store));
  ok('★ユーザーへ理由を伝える(無言で失敗しない)', w.__toasts.length + w.__alerts.length > 0,
     { toasts: w.__toasts, alerts: w.__alerts });
  ok('★案内にホーム画面が含まれる',
     (w.__toasts.concat(w.__alerts)).some(m => m.indexOf('ホーム画面') >= 0), w.__toasts.concat(w.__alerts));
  ok('理由が記録される', w.__v292Dfix577.log().some(x => x.act === 'refused'), w.__v292Dfix577.log());
  ok('refused が数えられる', w.__v292Dfix577.stats().refused === 1, w.__v292Dfix577.stats());
  ok('呼び出し元が記録される', w.__v292Dfix577.stats().bySource.gallery === 1, w.__v292Dfix577.stats());
}

console.log('\n== (B3) 正規サービスが居れば委譲する ==');
{
  const w = mkWin({ 'chr6_slot_smA': 'data' });
  const seen = [];
  w.__chronicleStoryLifecycle = { requestDelete: (id, o) => { seen.push({ id, o }); return true; } };
  const r = w.__v292Dfix577.requestDelete('smA', { source: 'features-clearSlot' });
  ok('★true を返す', r === true, r);
  ok('★正規サービスが呼ばれた', seen.length === 1 && seen[0].id === 'smA', seen);
  ok('★呼び出し元を伝えている', seen[0].o.source === 'features-clearSlot', seen[0]);
  ok('★★ガード自身は削除していない(所有者を増やさない)', w.__store['chr6_slot_smA'] === 'data');
  ok('delegated が数えられる', w.__v292Dfix577.stats().delegated === 1, w.__v292Dfix577.stats());
}

console.log('\n== (B4) 正規サービスが断ったら false を返す ==');
{
  const w = mkWin({ 'chr6_slot_smA': 'data' });
  w.__chronicleStoryLifecycle = { requestDelete: () => false };
  ok('★false を返す', w.__v292Dfix577.requestDelete('smA', { source: 'gallery' }) === false);
  ok('★データは消えていない', w.__store['chr6_slot_smA'] === 'data');
}

console.log('\n== (B5) 正規サービスが例外を投げても削除しない ==');
{
  const w = mkWin({ 'chr6_slot_smA': 'data' });
  w.__chronicleStoryLifecycle = { requestDelete: () => { throw new Error('boom'); } };
  ok('★false を返す', w.__v292Dfix577.requestDelete('smA', { source: 'gallery' }) === false);
  ok('★データは消えていない', w.__store['chr6_slot_smA'] === 'data');
  ok('例外が記録される', w.__v292Dfix577.log().some(x => /例外/.test(String(x.why))), w.__v292Dfix577.log());
}

console.log('\n== (B6) ★緊急停止でも旧削除経路は復活させない ==');
{
  /* 「止めたい」と「昔のやり方で消したい」は別物(GPT裁定)。OFFにしても削除はしない。 */
  const w = mkWin({ 'chr6_slot_smA': 'data', 'v292Dfix577Off': '1' });
  w.__chronicleStoryLifecycle = { requestDelete: () => true };
  ok('★false を返す', w.__v292Dfix577.requestDelete('smA', { source: 'gallery' }) === false);
  ok('★★データは消えていない', w.__store['chr6_slot_smA'] === 'data');
  ok('理由に緊急停止が残る',
     w.__v292Dfix577.log().some(x => /v292Dfix577Off/.test(String(x.why))), w.__v292Dfix577.log());
}

console.log('\n== (B7) index.html への配線 ==');
{
  const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  ok('★script タグがある', idx.indexOf('v292Dfix577-delete-entry-guard.js') > 0);
  ok('★gallery より先に読み込まれる',
     idx.indexOf('v292Dfix577-delete-entry-guard.js') < idx.indexOf('v292Dfix310-gallery.js'));
  /* ★ビルド番号を直に固定しない。出荷のたびに落ちて、本質と無関係な赤を作るため。
     見るべきは「BUILT が fix577 以降であること」。 */
  const m = idx.match(/20260726-fix(\d+)/);
  ok('BUILT が fix577 以降', !!m && Number(m[1]) >= 577, m && m[0]);
}

console.log('\n== (B8) ガード自身は localStorage を削除しない ==');
{
  const code = G577.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('★★removeItem を1度も呼ばない(削除の所有者を増やさない)',
     !/removeItem\s*\(/.test(code) && code.indexOf('removeItem') < 0, code.slice(0, 200));
  ok('★setItem も呼ばない(記録はメモリだけ)', !/localStorage\.setItem/.test(code));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
