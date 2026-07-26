/* 回帰テスト: v292Dfix579 — GPT裁定3件
 *   (A) 画像・外見系は review ではなく shared-asset / protected / slotId:null へ分類
 *   (B) 壊れたJSONでも、キーで生セーブと分かるなら hard のまま（壊れを理由に降格させない）
 *   (C) tombstone のスキーマとマージ規則（push競合規則）。★まだ同期へは配線しない
 *   (D) ★golden fixture: 分類表を実データ由来のキーで固定する（GPT指定）
 *   (E) ★静的検査: Object.keys(localStorage) を削除候補の列挙に使わない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const STORY = JSON.stringify({ turns: [{}, {}, {}] });

function mk562(seed){
  const store = Object.assign({}, seed || {});
  function expose(k){
    if (['getItem','setItem','removeItem','key','length'].indexOf(k) >= 0) return;
    try { Object.defineProperty(ls, k, { configurable:true, enumerable:true,
      get(){ return store[k]; }, set(v){ store[k] = String(v); } }); } catch(e){}
  }
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem(k, v){ store[k] = String(v); expose(k); },
    removeItem(k){ delete store[k]; try { delete ls[k]; } catch(e){} },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; }
  };
  Object.keys(store).forEach(expose);
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} }, setTimeout: () => 0, JSON, Date };
  w.window = w; w.__store = store;
  vm.runInContext(SRC562, vm.createContext(w), { filename: 'v292Dfix562-backup-inventory.js' });
  return w;
}
function mk579(){
  const w = { console: { log(){}, warn(){}, error(){} }, JSON, Date };
  w.window = w;
  vm.runInContext(SRC579, vm.createContext(w), { filename: 'v292Dfix579-tombstone-schema.js' });
  return w.__v292Dfix579;
}

/* 実データ由来の並び（2026-07-26 実機563キーから採取） */
const SEED = {
  'chr6': STORY,
  'chr6_slot_smrg85jwsn6': STORY,
  'chr6_slots_meta': '[{"id":"smrg85jwsn6"}]',
  'chr6_active_slot': '"smrg85jwsn6"',
  'chr6_v292Dfix54_genderMap_"smrg85jwsn6"': '{"a":"f"}',
  'v292Dfix77States_slot_smrg85jwsn6': '{}',
  'chr6_bk_guard_smrg85jwsn6_1785000000000': STORY,
  'chr6_bk_guard_smrg85jwsn6_1780000000000': STORY,
  'chr6_snap_smrg85jwsn6_1785000000001': '{"slotId":"smrg85jwsn6"}',
  'v292Dfix77States_slot_smGONE9': '{}',
  'ab552p1A': 'x',
  'v292Dfix573_log': '[]',
  'chrAiAv4:氷川 杏子::1634390709': 'data:image/png;base64,AAA',
  'chrAiAv3:ルカ': 'data:image/png;base64,BBB',
  'v292avrec_n6d1aee': '{}',
  'v292av2_someone': 'data:image/png;base64,CCC'
};

console.log('\n== (A) 画像・外見は shared-asset / protected / slotId:null ==');
{
  const f = mk562(SEED).__v292Dfix562;
  ['chrAiAv4:氷川 杏子::1634390709', 'chrAiAv3:ルカ', 'v292avrec_n6d1aee', 'v292av2_someone']
  .forEach(k => {
    const c = f.classifyKey(k);
    ok('★' + k.slice(0, 26) + ' → shared-asset', c.family === 'shared-asset', c);
    ok('  protection=protected', c.protection === 'protected', c);
    ok('  ★slotId は null（名前キーなのでどの物語のものか決まらない）', c.slotId === null, c);
    const p = f.deletePolicy({ key: k, intent: 'reclaim' });
    ok('  ★reclaim では消せない', p.allow === false, p);
  });
  ok('★★review ではなくなった',
     f.classifyKey('chrAiAv4:氷川 杏子::1634390709').protection !== 'review');
}

console.log('\n== (B) 壊れたJSONでも生セーブは hard のまま ==');
{
  const seed = Object.assign({}, SEED, { 'chr6_slot_smBROKEN': '{"turns":[{},' });
  const f = mk562(seed).__v292Dfix562;
  const c = f.classifyKey('chr6_slot_smBROKEN');
  ok('★★protection は hard のまま', c.protection === 'hard', c);
  ok('★family=live-story', c.family === 'live-story', c);
  ok('★completeness=broken として記録する', c.completeness === 'broken', c);
  ok('★理由に「降格させない」が書いてある', /降格/.test(c.why), c);
  const p = f.deletePolicy({ key: 'chr6_slot_smBROKEN', intent: 'reclaim' });
  ok('★★壊れていても reclaim では消せない',
     p.allow === false && p.code === 'live-data-requires-lifecycle-authorization', p);
  ok('壊れていない本体は completeness=ok',
     f.classifyKey('chr6_slot_smrg85jwsn6').completeness === 'ok');
}

console.log('\n== (C1) tombstone: 生成と検証 ==');
{
  const T = mk579();
  const t = T.make({ slotId: 'smA', title: '湾の学園', deletedAt: 1785070000000,
                     deleteOpId: 'del_smA_1', recoverySnapshotId: 'snap_1' });
  ok('★生成できる', !!t, t);
  ok('deleted:true', t.deleted === true, t);
  ok('lifecycleVersion=1', t.lifecycleVersion === 1, t);
  ok('★検証を通る', T.validate(t).ok === true, T.validate(t));
  ok('★slotId が無ければ作れない', T.make({ deleteOpId: 'x' }) === null);
  ok('★deleteOpId が無ければ作れない(復元時に照合できないため)',
     T.make({ slotId: 'smA' }) === null);
  const bad = { id: 'smA', deleted: true };
  ok('★deleteOpId 欠落は検証で落ちる',
     T.validate(bad).ok === false && T.validate(bad).problems.some(p => /deleteOpId/.test(p)),
     T.validate(bad));
  ok('★lifecycleVersion 違いは検証で落ちる',
     T.validate(Object.assign({}, t, { lifecycleVersion: 99 })).ok === false);
}

console.log('\n== (C2) T1: 墓標は通常一覧に出さない ==');
{
  const T = mk579();
  const t = T.make({ slotId: 'smA', deleteOpId: 'del_1' });
  const meta = [{ id: 'smB', name: '生きてる' }, t, { id: 'smC', name: '生きてる2' }];
  const v = T.visible(meta);
  ok('★★墓標が一覧から消える', v.length === 2 && v.every(e => e.id !== 'smA'), v);
  ok('生エントリは残る', v.map(e => e.id).join(',') === 'smB,smC', v);
}

console.log('\n== (C3) ★T4: 通常のpushでは墓標を消せない（push競合規則） ==');
{
  const T = mk579();
  const t = T.make({ slotId: 'smA', title: 'X', deletedAt: 1785070000000, deleteOpId: 'del_1' });
  /* PC が墓標をpush、旧iPhone が「deletedを知らない古いmeta」をpush */
  const fromPC  = [t];
  const fromOld = [{ id: 'smA', name: 'X', updatedAt: '2026-07-26T00:00:00Z' }];
  const m1 = T.mergeMeta(fromPC, fromOld);
  const m2 = T.mergeMeta(fromOld, fromPC);
  ok('★★墓標が残る（PC→旧端末の順）', T.isTombstone(m1[0]), m1);
  ok('★★墓標が残る（旧端末→PCの順）', T.isTombstone(m2[0]), m2);
  ok('★★順序を入れ替えても同じ結果（対称）', JSON.stringify(m1) === JSON.stringify(m2), { m1, m2 });
}

console.log('\n== (C4) ★T6: deleteOpId が一致した復元だけが墓標を解ける ==');
{
  const T = mk579();
  const t = T.make({ slotId: 'smA', deletedAt: 1785070000000, deleteOpId: 'del_1' });
  const good = { id: 'smA', name: 'X', restoreOfDeleteOpId: 'del_1', updatedAt: '2026-07-27T00:00:00Z' };
  const stale = { id: 'smA', name: 'X', restoreOfDeleteOpId: 'del_OLD' };
  ok('★★一致する復元は墓標を解く', !T.isTombstone(T.mergeMeta([t], [good])[0]), T.mergeMeta([t], [good]));
  ok('★★一致しない復元は無視される（古い復元要求で新しい削除を取り消させない）',
     T.isTombstone(T.mergeMeta([t], [stale])[0]), T.mergeMeta([t], [stale]));
  ok('順序を入れ替えても同じ',
     JSON.stringify(T.mergeMeta([t], [stale])) === JSON.stringify(T.mergeMeta([stale], [t])));
}

console.log('\n== (C5) 両方が墓標なら新しい方。同時刻でも決定的 ==');
{
  const T = mk579();
  const t1 = T.make({ slotId: 'smA', deletedAt: 1785000000000, deleteOpId: 'del_1' });
  const t2 = T.make({ slotId: 'smA', deletedAt: 1785999999999, deleteOpId: 'del_2' });
  ok('★新しい墓標が勝つ', T.mergeMeta([t1], [t2])[0].deleteOpId === 'del_2');
  ok('順序を入れ替えても同じ', T.mergeMeta([t2], [t1])[0].deleteOpId === 'del_2');
  const s1 = T.make({ slotId: 'smA', deletedAt: 1785000000000, deleteOpId: 'del_b' });
  const s2 = T.make({ slotId: 'smA', deletedAt: 1785000000000, deleteOpId: 'del_a' });
  ok('★★同時刻でも決定的（3回実行して同じ）',
     [0,1,2].every(() => T.mergeMeta([s1],[s2])[0].deleteOpId === 'del_a'));
  ok('同時刻・順序入れ替えでも同じ', T.mergeMeta([s2],[s1])[0].deleteOpId === 'del_a');
}

console.log('\n== (C6) T2: 墓標が立ったスロットのキーを弾ける（引用符付きも） ==');
{
  const T = mk579();
  const meta = [T.make({ slotId: 'smrg85jwsn6', deleteOpId: 'del_1' }), { id: 'smALIVE' }];
  ok('★本体を弾く', T.isBlockedByTombstone('chr6_slot_smrg85jwsn6', meta).blocked === true);
  ok('  kind=story', T.isBlockedByTombstone('chr6_slot_smrg85jwsn6', meta).kind === 'story');
  ok('★★引用符付きサイドストアも弾く',
     T.isBlockedByTombstone('chr6_v292Dfix54_genderMap_"smrg85jwsn6"', meta).blocked === true);
  ok('★通常のサイドストアも弾く',
     T.isBlockedByTombstone('v292Dfix77States_slot_smrg85jwsn6', meta).blocked === true);
  ok('★★生きているスロットは弾かない',
     T.isBlockedByTombstone('chr6_slot_smALIVE', meta).blocked === false);
  ok('無関係なキーは弾かない', T.isBlockedByTombstone('v292Dfix573_log', meta).blocked === false);
}

console.log('\n== (C7) ★まだ同期へ配線していない（挙動を変えない） ==');
{
  const T = mk579();
  ok('★wiredIntoSync が false であることを明示している', T.wiredIntoSync === false);
  const code = SRC579.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('★★localStorage を触らない', code.indexOf('localStorage') < 0);
  ok('★★fetch しない', code.indexOf('fetch') < 0);
  ok('★純粋関数だけ（副作用のある呼び出しが無い）',
     !/setTimeout|setInterval|addEventListener/.test(code));
}

console.log('\n== (D) ★golden fixture: 分類表を固定する ==');
{
  const f = mk562(SEED).__v292Dfix562;
  const GOLDEN = [
    ['chr6',                                        'live-story',       'hard',       'default'],
    ['chr6_slot_smrg85jwsn6',                       'live-story',       'hard',       'smrg85jwsn6'],
    ['chr6_slots_meta',                             'live-index',       'hard',       null],
    ['chr6_active_slot',                            'live-index',       'hard',       null],
    ['chr6_v292Dfix54_genderMap_"smrg85jwsn6"',     'live-side-store',  'hard',       'smrg85jwsn6'],
    ['v292Dfix77States_slot_smrg85jwsn6',           'live-side-store',  'hard',       'smrg85jwsn6'],
    ['chr6_bk_guard_smrg85jwsn6_1785000000000',     'story-backup',     'protected',  'smrg85jwsn6'],
    ['chr6_bk_guard_smrg85jwsn6_1780000000000',     'story-backup',     'releasable', 'smrg85jwsn6'],
    ['chr6_snap_smrg85jwsn6_1785000000001',         'story-snapshot',   'protected',  'smrg85jwsn6'],
    ['v292Dfix77States_slot_smGONE9',               'orphan-side-store','releasable', 'smGONE9'],
    ['ab552p1A',                                    'test-fixture',     'releasable', null],
    ['v292Dfix573_log',                             'diagnostic-log',   'releasable', null],
    ['chrAiAv4:氷川 杏子::1634390709',              'shared-asset',     'protected',  null],
    ['chrAiAv3:ルカ',                               'shared-asset',     'protected',  null],
    ['v292avrec_n6d1aee',                           'shared-asset',     'protected',  null],
    ['totally_unknown_key_xyz',                     'unknown',          'review',     null]
  ];
  GOLDEN.forEach(([k, fam, prot, sid]) => {
    const c = f.classifyKey(k);
    ok('golden: ' + k.slice(0, 40) + ' → ' + fam + '/' + prot,
       c.family === fam && c.protection === prot && c.slotId === sid,
       { got: { family: c.family, protection: c.protection, slotId: c.slotId },
         want: { family: fam, protection: prot, slotId: sid } });
  });
}

console.log('\n== (E) ★静的検査: Object.keys(localStorage) を削除候補の列挙に使わない ==');
{
  /* ラッパが localStorage.removeItem = wrapped と代入するため、
     **メソッド名が own property として列挙される**（実機で removeItem/getItem/setItem が「キー」として出た）。
     旧 fix310 deleteSave はこれを削除対象の列挙に使っていた（fix577で撤去済み）。 */
  const files = fs.readdirSync(__dirname).filter(f => /\.(js|html)$/.test(f) && !/^test_/.test(f));
  const hits = [];
  /* ★コメントは検査対象から外す。外さないと「なぜこれを禁止したか」を説明したコメント自身が
     引っかかり、正しく直したファイルが永久に赤くなる（実際に踏んだ）。 */
  const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  files.forEach(fn => {
    const s = stripComments(read(fn));
    const re = /Object\.keys\s*\(\s*localStorage\s*\)/g;
    let m;
    while ((m = re.exec(s))){
      /* 削除と同じ行・近傍にあるものだけを問題にする（棚卸し用の読み取りは許す） */
      const around = s.slice(m.index, m.index + 240);
      if (/removeItem|_del|delete\s/.test(around)) hits.push(fn + ' :: ' + around.slice(0, 90));
    }
  });
  ok('★★削除候補の列挙に Object.keys(localStorage) を使っている箇所が無い', hits.length === 0, hits);
}

console.log('\n== (F) 読取専用であること ==');
{
  const w = mk562(SEED), f = w.__v292Dfix562;
  const before = JSON.stringify(w.__store);
  Object.keys(SEED).forEach(k => { f.classifyKey(k); f.deletePolicy({ key: k, intent: 'reclaim' }); });
  ok('★★localStorage が1バイトも変わっていない', JSON.stringify(w.__store) === before);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
