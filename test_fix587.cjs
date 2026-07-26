/* 回帰テスト: v292Dfix587 — StoryLifecycleService（物語削除の正規サービス）
 *
 * 固定する契約（GPT指定の順序と不変条件）
 *   ①復元セット(fix564スナップショット)を作り、**検証が通らなければ絶対に消さない**
 *   ②meta に墓標を立てる
 *   ③★**物理削除より先に、墓標をクラウドへ確定させる**
 *   ④push できなければ「一覧からは消すが**実データは消さない**」＝保留
 *   ⑤物理削除は**必ず fix569 のゲート経由**（自分で removeItem しない）
 *   ⑥ゲートが1つでも拒否したら保留に回す（中途半端に消さない）
 *   ⑦pull barrier: 墓標が立ったスロットのキーは書き戻さない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix587-story-lifecycle.js');
const STORY = JSON.stringify({ turns: [{}, {}, {}] });

function mkEnv(opts){
  opts = opts || {};
  const store = Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id: 'smA', name: '消す物語' }, { id: 'smB', name: '残す物語' }]),
    'chr6_slot_smA': STORY,
    'chr6_slot_smB': STORY,
    'v292Dfix77States_slot_smA': '{"s":1}',
    'chr6_v292Dfix54_genderMap_"smA"': '{"g":"f"}'
  }, opts.seed || {});
  const removed = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { if (opts.quota && !(k in store)) { const e=new Error('q'); e.name='QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: k => { removed.push(k); delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const gateCalls = [];
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, JSON, Date, Error, Promise,
    /* --- 依存のモック --- */
    __v292Dfix579: {
      make: o => (o && o.slotId && o.deleteOpId) ? { id:o.slotId, title:o.title||'', deleted:true,
        deletedAt:o.deletedAt||null, deleteOpId:o.deleteOpId, recoverySnapshotId:o.recoverySnapshotId||null,
        lifecycleVersion:1 } : null,
      validate: e => ({ ok: !!(e && e.deleted === true && e.id && e.deleteOpId && e.lifecycleVersion === 1), problems: [] }),
      isBlockedByTombstone: (key, meta) => {
        const ids = (meta||[]).filter(e => e && e.deleted === true).map(e => String(e.id));
        for (const id of ids){
          if (key === 'chr6_slot_' + id) return { blocked:true, slotId:id, kind:'story' };
          if (String(key).indexOf(id) >= 0) return { blocked:true, slotId:id, kind:'side-store' };
        }
        return { blocked:false };
      }
    },
    __v292Dfix564: {
      create: (slot, o) => opts.snapFail ? { ok:false, error:'容量不足' }
                                         : { ok:true, id:'chr6_snap_' + slot + '_' + (o&&o.now) },
      verify: id => ({ ok: !opts.verifyFail, id: id })
    },
    __v292Dfix569: {
      tryDeleteExact: req => {
        gateCalls.push(req);
        if (opts.gateRefuse && opts.gateRefuse(req)) return { ok:false, deleted:false, code:'protected', key:req.key };
        ls.removeItem(req.key);
        return { ok:true, deleted:true, code:'deleted', key:req.key };
      }
    },
    __v292Dfix562: {
      sideStoreKeys: slot => Object.keys(store).filter(k =>
        k !== 'chr6_slot_' + slot && k.indexOf('chr6_bk_') !== 0 &&
        k.indexOf('chr6_snap') !== 0 && k.indexOf(slot) >= 0),
      _hash: s => 'h' + String(s).length
    }
  };
  if (opts.withSync !== false){
    w.__v292Dfix399x = { push: () => opts.pushFail ? Promise.reject(new Error('offline')) : Promise.resolve({ rev: 1 }) };
  }
  w.window = w; w.__store = store; w.__removed = removed; w.__gateCalls = gateCalls;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix587-story-lifecycle.js' });
  return w;
}
const metaOf = w => { try { return JSON.parse(w.__store['chr6_slots_meta']); } catch(e){ return []; } };
const tombOf = (w, id) => metaOf(w).filter(e => e && e.id === id && e.deleted === true)[0] || null;

console.log('\n== (1) 正常系: 墓標→クラウド確定→ゲート経由でexact削除 ==');
{
  const w = mkEnv();
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r => {
    ok('★成功する', r.ok === true && r.code === 'deleted', r);
    ok('★★墓標が立っている', !!tombOf(w, 'smA'), metaOf(w));
    ok('★墓標に復元セットIDが入っている', !!tombOf(w, 'smA').recoverySnapshotId, tombOf(w, 'smA'));
    ok('★★本体が消えている', w.__store['chr6_slot_smA'] === undefined, Object.keys(w.__store));
    ok('★★サイドストアも消えている',
       w.__store['v292Dfix77States_slot_smA'] === undefined &&
       w.__store['chr6_v292Dfix54_genderMap_"smA"'] === undefined, Object.keys(w.__store));
    ok('★★残す物語は無傷', w.__store['chr6_slot_smB'] === STORY);
    ok('★★削除はすべてゲート経由（intent=lifecycle-delete）',
       w.__gateCalls.length === 3 && w.__gateCalls.every(c => c.intent === 'lifecycle-delete'),
       w.__gateCalls.map(c => c.intent));
    ok('★exact keyとhashを申告している',
       w.__gateCalls.every(c => c.key && c.expectedBytes != null && c.expectedHash), w.__gateCalls[0]);
    return step2();
  });
}

function step2(){
  console.log('\n== (2) ★★復元セットが作れない/検証に落ちたら絶対に消さない ==');
  const a = mkEnv({ snapFail: true });
  return a.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r => {
    ok('★失敗を返す', r.ok === false && r.code === 'snapshot-failed', r);
    ok('★★データは無傷', a.__store['chr6_slot_smA'] === STORY);
    ok('★★墓標も立てない', !tombOf(a, 'smA'), metaOf(a));
    ok('★ゲートを呼んでいない', a.__gateCalls.length === 0);
    const b = mkEnv({ verifyFail: true });
    return b.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r2 => {
      ok('★検証に落ちたら失敗', r2.ok === false && r2.code === 'snapshot-unverified', r2);
      ok('★★データは無傷', b.__store['chr6_slot_smA'] === STORY);
      ok('★★墓標も立てない', !tombOf(b, 'smA'));
      return step3();
    });
  });
}

function step3(){
  console.log('\n== (3) ★★pushできないなら「隠すが消さない」（保留） ==');
  const w = mkEnv({ pushFail: true });
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r => {
    ok('★ok:true だが code=pending-cloud', r.ok === true && r.code === 'pending-cloud', r);
    ok('★★墓標は立つ（一覧からは消える）', !!tombOf(w, 'smA'));
    ok('★★★実データは消していない', w.__store['chr6_slot_smA'] === STORY, Object.keys(w.__store));
    ok('★★ゲートを呼んでいない', w.__gateCalls.length === 0);
    ok('★保留として記録される', w.__chronicleStoryLifecycle.pendingDeletes().length === 1,
       w.__chronicleStoryLifecycle.pendingDeletes());
    return step3b(w);
  });
}
function step3b(){
  console.log('\n== (3b) 再接続後に保留の続きをやる ==');
  const w = mkEnv({ pushFail: true });
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(() => {
    /* 通信が回復した状態にする */
    w.__v292Dfix399x.push = () => Promise.resolve({ rev: 2 });
    return w.__chronicleStoryLifecycle.resumePending().then(r => {
      ok('★再開できる', r.ok === true && r.done === 1, r);
      ok('★★このタイミングで実データが消える', w.__store['chr6_slot_smA'] === undefined);
      ok('★保留が空になる', w.__chronicleStoryLifecycle.pendingDeletes().length === 0);
      ok('★墓標は残っている', !!tombOf(w, 'smA'));
      return step4();
    });
  });
}

function step4(){
  console.log('\n== (4) ★ゲートが1つでも拒否したら保留へ（中途半端に消さない） ==');
  const w = mkEnv({ gateRefuse: req => req.key.indexOf('genderMap') >= 0 });
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r => {
    ok('★code=partial', r.ok === true && r.code === 'partial', r);
    ok('★拒否されたキーを報告する', r.refused && r.refused.length === 1, r.refused);
    ok('★★保留に回る（あとで再試行できる）',
       w.__chronicleStoryLifecycle.pendingDeletes().length === 1);
    ok('拒否されたキーは残っている', w.__store['chr6_v292Dfix54_genderMap_"smA"'] !== undefined);
    return step5();
  });
}

function step5(){
  console.log('\n== (5) 依存が欠けたら削除しない（fail-closed） ==');
  const w = mkEnv();
  delete w.__v292Dfix569;
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(r => {
    ok('★失敗を返す', r.ok === false && r.code === 'missing-deps', r);
    ok('★不足しているものを名前で返す', (r.missing || []).some(m => /fix569/.test(m)), r.missing);
    ok('★★データは無傷', w.__store['chr6_slot_smA'] === STORY);

    console.log('\n== (6) 既定枠は削除できない / 本体が無ければ何もしない ==');
    const a = mkEnv();
    return a.__chronicleStoryLifecycle.requestDelete('default', {}).then(r2 => {
      ok('★default は拒否', r2.ok === false && r2.code === 'not-deletable', r2);
      return a.__chronicleStoryLifecycle.requestDelete('smZZZ', {}).then(r3 => {
        ok('★存在しないスロットは no-body', r3.ok === false && r3.code === 'no-body', r3);
        return step7();
      });
    });
  });
}

function step7(){
  console.log('\n== (7) ★pull barrier: 墓標が立ったスロットは書き戻さない ==');
  const w = mkEnv();
  return w.__chronicleStoryLifecycle.requestDelete('smA', { source:'home' }).then(() => {
    const svc = w.__chronicleStoryLifecycle;
    ok('★★本体を弾く', svc.shouldBlockRestore('chr6_slot_smA') === true);
    ok('★★サイドストアも弾く', svc.shouldBlockRestore('v292Dfix77States_slot_smA') === true);
    ok('★★引用符付きキーも弾く', svc.shouldBlockRestore('chr6_v292Dfix54_genderMap_"smA"') === true);
    ok('★★生きているスロットは弾かない', svc.shouldBlockRestore('chr6_slot_smB') === false);
    const f = svc.filterIncoming({ 'chr6_slot_smA': 'x', 'chr6_slot_smB': 'y', 'other': 'z' });
    ok('★取り込みから除外される', !('chr6_slot_smA' in f.ls) && ('chr6_slot_smB' in f.ls), f.ls);
    ok('★除外したキーを報告する', f.blocked.indexOf('chr6_slot_smA') >= 0, f.blocked);
    return step8();
  });
}

function step8(){
  console.log('\n== (8) 静的: 自分では削除しない / 配線 ==');
  {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('★★localStorage.removeItem を1度も呼ばない（削除の所有者を増やさない）',
       !/localStorage\.removeItem/.test(code) && !/removeItem\s*\(/.test(code));
    ok('★物理削除は tryDeleteExact 経由だけ', /tryDeleteExact/.test(code));
    ok('★tombstoneBarrierReady を宣言している（fix562のdeletePolicyが見る）',
       /tombstoneBarrierReady:\s*true/.test(SRC));
  }
  {
    const home = read('home.html');
    ok('★home.html が正規サービスへ委譲している', /requestDelete\(id,\s*\{\s*source:'home'\s*\}\)/.test(home));
    ok('★home.html が自前で removeItem していない（delStory内）', (() => {
      const i = home.indexOf('function delStory'); const j = home.indexOf('function renameStory');
      return home.slice(i, j).indexOf('removeItem') < 0;
    })());
    ok('★home.html に必要なスクリプトが積んである',
       ['v292Dfix569-gc-shadow.js','v292Dfix562-backup-inventory.js','v292Dfix564-snapshot.js',
        'v292Dfix579-tombstone-schema.js','v292Dfix587-story-lifecycle.js'].every(f => home.indexOf(f) > 0));
    ok('★★home.html でも fix569 が最初',
       home.indexOf('v292Dfix569-gc-shadow.js') < home.indexOf('v292Dfix587-story-lifecycle.js'));
  }
  {
    const idx = read('index.html');
    ok('★index.html に fix587 が入っている', idx.indexOf('v292Dfix587-story-lifecycle.js') > 0);
    const f399 = read('v292Dfix399-cloudsync.js');
    ok('★★取り込み側が pull barrier を通している', /svc\.filterIncoming\(incoming\)/.test(f399));
    ok('★barrier が無ければ従来どおり書き戻す（fail-open）',
       /if \(svc && typeof svc\.filterIncoming === 'function'\)/.test(f399));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
}
