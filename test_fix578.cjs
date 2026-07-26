/* 回帰テスト: v292Dfix578 (A3.1) — fix562 に読取専用の分類器を追加
 *   ・classifyKey()  … キー1本の family / slotId / protection を返す。**判断だけ**
 *   ・deletePolicy() … allow と理由コードを返す。**物理削除しない**
 *   ・★protectedSet() は1バイトも変えない（A3.2の不変テストをここで兼ねる）
 *
 * 保護階層(GPT指定):
 *   hard       … chr6 / chr6_slot_* / 生きているスロットのサイドストア / 台帳
 *   protected  … 各スロットの最良の控え / 完全スナップショット
 *   releasable … 余剰控え / 孤児サイドストア / test-fixture / 診断ログ
 *   review     … 形式不明（判断できないものは消さない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix562-backup-inventory.js'), 'utf8');

const STORY = JSON.stringify({ turns: [{}, {}, {}, {}, {}] });

function mk(seed){
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
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, location: { href: '' }, JSON, Date };
  w.window = w; w.__store = store;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix562-backup-inventory.js' });
  return w;
}

/* 生きたスロット1つ＋そのサイドストア＋控え2件＋孤児 */
const SEED = {
  'chr6': STORY,
  'chr6_slot_smrg85jwsn6': STORY,
  'chr6_slots_meta': '[{"id":"smrg85jwsn6"}]',
  'chr6_active_slot': '"smrg85jwsn6"',
  /* ★引用符付きキー（fix54 が JSON.parse せず連結するため実在する） */
  'chr6_v292Dfix54_genderMap_"smrg85jwsn6"': '{"a":"f"}',
  'v292Dfix77States_slot_smrg85jwsn6': '{}',
  'chr6_bk_guard_smrg85jwsn6_1785000000000': STORY,      /* 最良の控えになるはず */
  'chr6_bk_guard_smrg85jwsn6_1780000000000': STORY,      /* 余剰 */
  'chr6_snap_smrg85jwsn6_1785000000001': '{"slotId":"smrg85jwsn6"}',
  'v292Dfix77States_slot_smGONE9': '{}',                 /* 孤児 */
  'ab552p1A': 'x',                                       /* test-fixture */
  'v292Dfix573_log': '[]'                                /* 診断ログ */
};

console.log('\n== (1) 生セーブ・台帳は hard ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  [['chr6', 'default'], ['chr6_slot_smrg85jwsn6', 'smrg85jwsn6']].forEach(([k, sid]) => {
    const c = f.classifyKey(k);
    ok('★' + k + ' → hard', c.protection === 'hard', c);
    ok('  family=live-story', c.family === 'live-story', c);
    ok('  slotId=' + sid, c.slotId === sid, c);
  });
  ['chr6_slots_meta', 'chr6_active_slot'].forEach(k => {
    const c = f.classifyKey(k);
    ok('★' + k + ' → hard(台帳)', c.protection === 'hard' && c.family === 'live-index', c);
  });
}

console.log('\n== (2) ★引用符付きキーでも slotId を正しく取り、hard にする ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const k = 'chr6_v292Dfix54_genderMap_"smrg85jwsn6"';
  const c = f.classifyKey(k);
  ok('★★hard として守る', c.protection === 'hard', c);
  ok('★★slotId を正しく抽出', c.slotId === 'smrg85jwsn6', c);
  ok('family=live-side-store', c.family === 'live-side-store', c);
  ok('★keyは引用符込みのexact keyのまま', c.key === k, c);
}
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const c = f.classifyKey('v292Dfix77States_slot_smrg85jwsn6');
  ok('通常のサイドストアも hard', c.protection === 'hard' && c.family === 'live-side-store', c);
}

console.log('\n== (3) 控え: 最良は protected / 余剰は releasable ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const best = f.classifyKey('chr6_bk_guard_smrg85jwsn6_1785000000000');
  const spare = f.classifyKey('chr6_bk_guard_smrg85jwsn6_1780000000000');
  ok('★最良の控え → protected', best.protection === 'protected', best);
  ok('★余剰の控え → releasable', spare.protection === 'releasable', spare);
  ok('どちらも family=story-backup',
     best.family === 'story-backup' && spare.family === 'story-backup', { best, spare });
}

console.log('\n== (4) スナップショット / 孤児 / test-fixture / 診断ログ ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  ok('★スナップショット → protected',
     f.classifyKey('chr6_snap_smrg85jwsn6_1785000000001').protection === 'protected');
  const orphan = f.classifyKey('v292Dfix77States_slot_smGONE9');
  ok('★孤児サイドストア → releasable', orphan.protection === 'releasable', orphan);
  ok('  孤児のslotIdが取れる', orphan.slotId === 'smGONE9', orphan);
  ok('★test-fixture → releasable', f.classifyKey('ab552p1A').protection === 'releasable');
  ok('★診断ログ → releasable', f.classifyKey('v292Dfix573_log').protection === 'releasable');
}

console.log('\n== (5) 形式不明は review（判断できないものは消さない） ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const c = f.classifyKey('totally_unknown_key_xyz');
  ok('★review になる', c.protection === 'review', c);
  ok('★理由が書いてある', /形式不明/.test(c.why), c);
  ok('空キーも review', f.classifyKey('').protection === 'review');
}

console.log('\n== (6) deletePolicy: 生セーブは reclaim では絶対に消せない ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  ['chr6', 'chr6_slot_smrg85jwsn6', 'chr6_v292Dfix54_genderMap_"smrg85jwsn6"',
   'v292Dfix77States_slot_smrg85jwsn6', 'chr6_slots_meta'].forEach(k => {
    const p = f.deletePolicy({ key: k, intent: 'reclaim', path: 'fix399' });
    ok('★★' + k.slice(0, 34) + ' は reclaim 拒否', p.allow === false, p);
    ok('  code=live-data-requires-lifecycle-authorization',
       p.code === 'live-data-requires-lifecycle-authorization', p);
  });
}
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const p = f.deletePolicy({ key: 'chr6_slot_smrg85jwsn6', intent: 'retention' });
  ok('★retention でも拒否', p.allow === false, p);
}

console.log('\n== (7) deletePolicy: tombstone未実装なので lifecycle-delete も許可しない ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const p = f.deletePolicy({ key: 'chr6_slot_smrg85jwsn6', intent: 'lifecycle-delete' });
  ok('★★allow:false', p.allow === false, p);
  ok('★code=lifecycle-delete-not-ready', p.code === 'lifecycle-delete-not-ready', p);
}
{
  /* tombstone barrier ができたと申告されても、計画の検証はまだなので許可しない */
  const w = mk(SEED), f = w.__v292Dfix562;
  w.__chronicleStoryLifecycle = { tombstoneBarrierReady: true };
  const p = f.deletePolicy({ key: 'chr6_slot_smrg85jwsn6', intent: 'lifecycle-delete' });
  ok('★barrierができても、計画の検証前は許可しない', p.allow === false, p);
  ok('★code=lifecycle-delete-requires-verified-plan',
     p.code === 'lifecycle-delete-requires-verified-plan', p);
}

console.log('\n== (8) deletePolicy: releasable は reclaim を許可 ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  ['chr6_bk_guard_smrg85jwsn6_1780000000000', 'ab552p1A', 'v292Dfix573_log',
   'v292Dfix77States_slot_smGONE9'].forEach(k => {
    const p = f.deletePolicy({ key: k, intent: 'reclaim' });
    ok('★' + k.slice(0, 34) + ' は reclaim 可', p.allow === true && p.code === 'releasable', p);
  });
  const b = f.deletePolicy({ key: 'chr6_bk_guard_smrg85jwsn6_1785000000000', intent: 'reclaim' });
  ok('★★最良の控えは reclaim 不可', b.allow === false && b.code === 'protected', b);
}

console.log('\n== (9) 形式不明は削除許可しない(fail-closed) ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const p = f.deletePolicy({ key: 'totally_unknown_key_xyz', intent: 'reclaim' });
  ok('★allow:false', p.allow === false, p);
  ok('★code=unknown-format-review-only', p.code === 'unknown-format-review-only', p);
}

console.log('\n== (10) ★A3.2: protectedSet() は変えていない ==');
{
  const w = mk(SEED), f = w.__v292Dfix562;
  const ps = f.protectedSet();
  ok('★オブジェクトを返す（形が変わっていない）', ps && typeof ps === 'object' && !Array.isArray(ps), ps);
  const sids = Object.keys(ps);
  ok('★キーはスロットIDのまま（exact keyではない）', sids.indexOf('smrg85jwsn6') >= 0, sids);
  const e = ps['smrg85jwsn6'];
  ok('★エントリの形が同じ(key/bytes/turns/createdAt/complete/reason)',
     e && 'key' in e && 'bytes' in e && 'turns' in e && 'createdAt' in e
       && 'complete' in e && 'reason' in e, e);
  ok('★★生セーブは protectedSet() に**入っていない**（控え専用の意味を維持）',
     sids.every(s => !/^chr6(_slot_)?/.test(ps[s].key) || ps[s].key.indexOf('chr6_bk_') === 0
                     || ps[s].key.indexOf('chr6_snap') === 0),
     sids.map(s => ps[s].key));
  ok('★★サイドストアも入っていない',
     sids.every(s => ps[s].key.indexOf('genderMap') < 0 && ps[s].key.indexOf('77States') < 0),
     sids.map(s => ps[s].key));
}

console.log('\n== (11) 読取専用であること ==');
{
  /* classifyKey / deletePolicy が localStorage を書き換えないこと */
  const w = mk(SEED), f = w.__v292Dfix562;
  const before = JSON.stringify(w.__store);
  Object.keys(SEED).forEach(k => { f.classifyKey(k); f.deletePolicy({ key: k, intent: 'reclaim' }); });
  ok('★★localStorage が1バイトも変わっていない', JSON.stringify(w.__store) === before);
}
{
  const i = SRC.indexOf('function classifyKey');
  const j = SRC.indexOf('window.__v292Dfix562 = {');
  const body = SRC.slice(i, j);
  ok('★分類器のコードに removeItem が無い', !/removeItem\s*\(/.test(body));
  ok('★分類器のコードに setItem が無い', !/setItem\s*\(/.test(body));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
