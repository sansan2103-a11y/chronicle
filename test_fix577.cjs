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

/* ================= (A) 旧 chr6_bk_del_ 退避は引退した ===================== */
/* ★2026-07-26 fix587で置き換わった。
   ここには元々「chr6_bk_del_ の世代整理(sortバグ)」のテストが13件あった。
   fix577でsortバグを直したが、fix587で home.html の delStory が**正規サービスへ委譲**され、
   この退避方式そのものが無くなったため、対象コードが存在しない。

   ★テストを黙って消さない。何がどこへ移ったかを固定する。
     旧: chr6_bk_del_<id>_<ts>  … 本体1キーだけ・2世代・復元UIなし・サイドストアは戻せない
     新: fix564 の完全スナップショット … 本体＋サイドストアを一組・hash検証つき・復元経路あり
   GPTも「将来fix564のtrash-recoveryへ移行後、旧chr6_bk_del_の新規作成を停止する」と指定していた。
   移った先の検証は test_fix587.cjs（49件）が持っている。 */
console.log('\n== (A) ★旧 chr6_bk_del_ 退避の引退を固定する ==');
{
  const i = HOME.indexOf('function delStory');
  const body = HOME.slice(i, HOME.indexOf('function renameStory'));
  ok('★★home.html が新しい chr6_bk_del_ を作らなくなった', body.indexOf('chr6_bk_del_') < 0, body.slice(0, 300));
  ok('★★代わりに正規サービスへ委譲している', /requestDelete\(id,\s*\{\s*source:'home'\s*\}\)/.test(body));
  ok('★delStory 内で自前の removeItem をしていない', body.indexOf('removeItem') < 0);
  ok('★サービス未搭載なら削除しない（旧実装へ戻さない）',
     /requestDelete === 'function'/.test(body) && /return;/.test(body));
  ok('★★移行の理由がコメントに残っている（将来の誤解を防ぐ）',
     body.indexOf('墓標') > 0 && body.indexOf('サイドストア') > 0, body.slice(0, 200));
  /* 置き換え先が実在することも確かめる（引退＝機能の穴、にしない） */
  ok('★★置き換え先(fix587の復元セット)が存在する',
     fs.existsSync(path.join(__dirname, 'v292Dfix587-story-lifecycle.js')));
  ok('★★置き換え先のテストが存在する',
     fs.existsSync(path.join(__dirname, 'test_fix587.cjs')));
}

/* ================= (B) 削除入口ガード ==================================== */
/* ★(A6)(A7) も同じ理由で引退。
   「書込に失敗したら既存の控えを先に減らさない」「同時刻でも決定的」という**性質そのもの**は
   捨てていない。fix564のスナップショットは
     ・作成 → **read-back と hash 一致を検証** → 検証が通らなければ削除しない（＝先に減らさない）
     ・IDに作成時刻を含み、同一IDは作らない（＝決定的）
   という形で満たしており、test_fix587.cjs の (2) が
   「復元セットが作れない/検証に落ちたら絶対に消さない」として固定している。 */

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
