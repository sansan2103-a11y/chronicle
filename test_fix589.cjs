/* 回帰テスト: v292Dfix589 — 保留した削除が「次にアプリを開いたとき」本当に片づくか
 *
 * ★なぜ必要か（2026-07-27 の実機テストで判明した実バグ）
 *   fix587 の autoResume() は先頭で
 *       if (!d.sync || typeof d.sync.push !== 'function') return;
 *   としていた。しかし index.html のスクリプト順は
 *       fix587 (2863行) → fix399 (2919行)
 *   なので、autoResume が走る時点で `window.__v292Dfix399x` は**必ず未定義**。
 *   → 毎回そこで抜け、**8秒のタイマーすら仕込まれていなかった**。
 *   → 「homeで削除 → 墓標は立つ → アプリ側で続きを片づける」という設計が
 *     **実機で一度も成立していなかった**（log() が空・pending が残り続けることで確定）。
 *   実害: 物理削除が永久に保留（容量が空かない）＋**墓標がクラウドへ伝わらない**（他端末で消えない）。
 *
 * ★もう1点: push 失敗の理由を区別していなかった。
 *   実機では 0ターンのスロットを開いた状態で push したため fix399 の**空ガード**で弾かれたのに、
 *   返ってきたコードは 'still-offline'（オフライン）だった。理由が分からないと次に追えない。
 *
 * 固定する契約
 *   R1 fix399 が**後から**現れても autoResume は起動する
 *   R2 fix399 が現れなければ一定回数で諦める（home.html では何もしない・無限ループしない）
 *   R3 push 失敗の理由を区別して記録する（空ガード / 競合 / 未ログイン / 進行中 / 不在）
 *   R4 'still-offline' という誤解を招くコードを返さない
 *   R5 依存の即 return（旧実装の形）が復活していない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix587-story-lifecycle.js');
const STORY = JSON.stringify({ turns: [{}, {}] });

/* pending が1件ある状態から起動する環境。setTimeout は**キューに溜めて手で回す**
   （★スタブでコールバックを呼ばないと、この種のテストは素通りで合格する） */
function mkEnv(opts){
  opts = opts || {};
  const PLAN = { planId:'plan_del_smA_1', deleteOpId:'del_smA_1', slotId:'smA',
                 snapshotId:'chr6_snap_smA_1', createdAt:1, lifecycleVersion:1,
                 keys:[{ key:'chr6_slot_smA', bytes:STORY.length, hash:'h'+STORY.length }], source:'home' };
  const store = Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id:'smA', deleted:true, deleteOpId:'del_smA_1',
                                         recoverySnapshotId:'chr6_snap_smA_1', lifecycleVersion:1 }]),
    'chr6_slot_smA': STORY,
    'v292Dfix587_pending': JSON.stringify([PLAN])
  }, opts.seed || {});
  const timers = [];
  const gateCalls = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const w = {
    localStorage: ls, console: { log(){}, warn(){}, error(){} }, JSON, Date, Error, Promise,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    __v292Dfix579: {
      make: o => ({ id:o.slotId, deleted:true, deleteOpId:o.deleteOpId, lifecycleVersion:1 }),
      validate: () => ({ ok:true, problems:[] }),
      isBlockedByTombstone: () => ({ blocked:false })
    },
    __v292Dfix564: { create: () => ({ ok:true, id:'chr6_snap_smA_9' }), verify: () => ({ ok:true }) },
    __v292Dfix569: { tryDeleteExact: req => { gateCalls.push(req.key); ls.removeItem(req.key);
                                              return { ok:true, deleted:true, code:'deleted' }; } },
    __v292Dfix562: { classifyKey: k => ({ slotId: /smA/.test(k) ? 'smA' : null }),
                     sideStoreKeys: () => [], _hash: s => 'h' + String(s).length }
  };
  w.window = w; w.__store = store; w.__timers = timers; w.__gate = gateCalls;
  /* fix399 は**あとから**生やす（実機の読み込み順を再現する） */
  w.__addSync = pushImpl => { w.__v292Dfix399x = { push: pushImpl || (() => Promise.resolve({rev:1})) }; };
  if (opts.syncFromStart) w.__addSync(opts.syncFromStart);
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix587-story-lifecycle.js' });
  return w;
}
/* 溜まったタイマーを順に実行する（最大 n 回） */
async function runTimers(w, n){
  for (let i = 0; i < n; i++){
    const t = w.__timers.shift();
    if (!t) break;
    try { t.fn(); } catch(e){}
    await Promise.resolve();
  }
  await new Promise(r => setImmediate(r));
}

(async () => {

console.log('\n== (1) ★★fix399 が後から現れても autoResume が起動する（実機で踏んだ順序バグ） ==');
{
  const w = mkEnv();                       /* 起動時は fix399 が居ない＝実機と同じ */
  const svc = w.__chronicleStoryLifecycle;
  ok('起動時点では保留が1件', svc.pendingDeletes().length === 1);
  ok('★待ちのタイマーが仕込まれている（旧実装は即returnで0だった）', w.__timers.length >= 1, w.__timers.length);

  await runTimers(w, 3);                   /* まだ fix399 は居ない → ポーリングが続く */
  ok('fix399 が居ないあいだは削除しない', w.__gate.length === 0);
  ok('ポーリングが継続している', w.__timers.length >= 1);

  w.__addSync();                           /* ★ここで fix399 が読み込まれた */
  await runTimers(w, 3);                   /* ポーリングが検知 → 8秒後のタイマーを仕込む */
  ok('★★fix399 を検知して起動した', svc.stats().autoResumeArmed === 1, svc.stats());

  await runTimers(w, 4);                   /* 8秒タイマー → resumePending */
  await new Promise(r => setTimeout(r, 30));
  ok('★★保留が片づいた', svc.pendingDeletes().length === 0, svc.pendingDeletes());
  ok('★★本体が物理削除された', w.__store['chr6_slot_smA'] === undefined, Object.keys(w.__store));
  ok('★ゲート経由で消している', w.__gate.length === 1 && w.__gate[0] === 'chr6_slot_smA', w.__gate);
  ok('完了として数えている', svc.stats().completed === 1, svc.stats());
}

console.log('\n== (2) ★fix399 が現れなければ諦める（home.html では何もしない・無限ループしない） ==');
{
  const w = mkEnv();
  const svc = w.__chronicleStoryLifecycle;
  await runTimers(w, 60);                  /* 最大回数を超えて回す */
  ok('★諦めたことを記録している', svc.stats().autoResumeGaveUp === 1, svc.stats());
  ok('★タイマーが残っていない（無限ループしない）', w.__timers.length === 0, w.__timers.length);
  ok('★★データは1バイトも消していない', w.__store['chr6_slot_smA'] === STORY);
  ok('★保留はそのまま残る（次の起動でまた試す）', svc.pendingDeletes().length === 1);
}

console.log('\n== (3) ★★push 失敗の理由を区別して記録する ==');
{
  const cases = [
    { name:'空ガード（0ターンのスロットを開いている）', err: (() => { const e = new Error('EMPTY_LOCAL_GUARD'); e.emptyGuard = true; return e; })(), want:'empty-local-guard' },
    { name:'競合（サーバが新しい）', err: (() => { const e = new Error('CONFLICT'); e.conflict = true; return e; })(), want:'conflict' },
    { name:'未ログイン', err: new Error('ログインが必要です'), want:'not-logged-in' },
    { name:'別のpushが進行中', err: new Error('同期中'), want:'busy' }
  ];
  for (const c of cases){
    const w = mkEnv({ syncFromStart: () => Promise.reject(c.err) });
    const svc = w.__chronicleStoryLifecycle;
    const r = await svc.resumePending();
    ok('★' + c.name + ' → 理由が残る',
       r.ok === false && r.code === 'push-failed' && String(r.why || '').indexOf(c.want) === 0,
       { code: r.code, why: r.why });
    ok('  ' + c.name + ' → データは消さない', w.__store['chr6_slot_smA'] === STORY);
    ok('  ' + c.name + ' → 保留は解除しない', svc.pendingDeletes().length === 1);
  }
  {
    const w = mkEnv();                     /* fix399 が居ない */
    const svc = w.__chronicleStoryLifecycle;
    const r = await svc.resumePending();
    ok('★fix399 が無いページ → not-ready を返す（削除しない）', r.ok === false, r);
    ok('  データは消さない', w.__store['chr6_slot_smA'] === STORY);
  }
  {
    const w = mkEnv({ syncFromStart: () => Promise.reject(new Error('EMPTY_LOCAL_GUARD')) });
    const svc = w.__chronicleStoryLifecycle;
    await svc.resumePending();
    ok('★失敗回数を数えている', svc.stats().pushFailures >= 1, svc.stats());
    ok('★実機から理由を読める口がある', typeof svc.lastPushWhy === 'function' && !!svc.lastPushWhy());
  }
}

console.log('\n== (3b) ★fix594: もう存在しないキーは成功扱い（保留が永久に残らない） ==');
{
  const w = mkEnv({ syncFromStart: () => Promise.resolve({rev:1}) });
  const svc = w.__chronicleStoryLifecycle;
  delete w.__store['chr6_slot_smA'];        /* 物理削除は済んでいるが保留だけ残った状態 */
  const r = await svc.resumePending();
  ok('★★保留が片づく（永久に残らない）', r.ok === true && r.done === 1, r);
  ok('★保留の記録が消える', svc.pendingDeletes().length === 0);
  ok('★ゲートを呼んでいない（消すものが無いので）', w.__gate.length === 0, w.__gate);
  /* ★★fix595(GPT裁定): 「元から無かった」を physicalDeleted に混ぜると、
     端末間試験で「削除が効いた」のか「空振りした」のか区別できなくなる。 */
  ok('★★fix595: 既に無かった計画キーとして数える', svc.stats().alreadyMissingPlannedKeys === 1, svc.stats());
  ok('★★fix595: ゲート経由の物理削除には数えない', svc.stats().gatewayPhysicalDeletes === 0, svc.stats());
}

console.log('\n== (3c) ★★fix595: 実在したキーは gatewayPhysicalDeletes に数える（2つの数が混ざらない） ==');
{
  const w = mkEnv({ syncFromStart: () => Promise.resolve({rev:1}) });
  const svc = w.__chronicleStoryLifecycle;
  const r = await svc.resumePending();
  ok('保留が片づく', r.ok === true && r.done === 1, r);
  ok('★★実在したキーはゲート経由の物理削除として数える', svc.stats().gatewayPhysicalDeletes === 1, svc.stats());
  ok('★★「元から無かった」は0件', svc.stats().alreadyMissingPlannedKeys === 0, svc.stats());
  ok('★従来の physicalDeleted も維持（退行していない）', svc.stats().physicalDeleted === 1, svc.stats());
  ok('★ゲートを1回だけ呼んでいる', w.__gate.length === 1, w.__gate);
}

console.log('\n== (4) 退行防止（旧実装の形が復活していないこと） ==');
{
  const noComment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const code = noComment(SRC);
  ok('★★依存の即returnが無い（旧: if (!d.sync ...) return;）',
     !/if\s*\(\s*!d\.sync[^)]*\)\s*return\s*;/.test(code),
     (code.match(/if\s*\(\s*!d\.sync[^\n]*/) || [])[0]);
  ok("★'still-offline' を返さない（実態と違う名前だった）", code.indexOf("'still-offline'") < 0);
  ok('★ポーリングの上限がある（無限に回さない）', /RESUME_POLL_MAX/.test(code));
  const idx = read('index.html');
  const pos = f => idx.indexOf(f);
  ok('★index.html では fix587 が fix399 より**前**にある（この順序でも動くように直した）',
     pos('v292Dfix587-story-lifecycle.js') > 0 && pos('v292Dfix399-cloudsync.js') > 0 &&
     pos('v292Dfix587-story-lifecycle.js') < pos('v292Dfix399-cloudsync.js'),
     { fix587: pos('v292Dfix587-story-lifecycle.js'), fix399: pos('v292Dfix399-cloudsync.js') });
  ok('★home.html には fix399 が無い（＝そこでは諦めるのが正しい）',
     read('home.html').indexOf('v292Dfix399-cloudsync.js') < 0);
}

console.log('\n---------------------------------------------');
console.log('test_fix589: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
})();
