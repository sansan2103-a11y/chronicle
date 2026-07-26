/* 回帰テスト: v292Dfix588 — 墓標(tombstone)を「見せない・開かせない・作り直さない」
 *
 * なぜ必要か（fix587の穴）
 *   fix587 で墓標を立て始めたのに、**表示側と起動側が墓標を知らなかった**。
 *     ・home.html の一覧は chr6_slots_meta をそのまま並べる
 *       → 物理削除が保留(pending-cloud)のあいだ、削除した物語が再読込で戻って見える
 *       → 完全削除後も「（無題）0ターン」の幽霊カードが残る
 *     ・fix527 の metaIds() は墓標のidも「既知」として通す
 *       → ?story=<削除済みid> でアプリが起動でき、lastOpenedAt を墓標へ書き、
 *         本体が無ければ空の物語として作り直されて **ローカルへ復活**する
 *   さらに GPT の必須条件「再実行しても snapshot や墓標を重複作成しない／
 *   autoResume が同じ deleteOpId を再利用する」が未実装だった。
 *
 * 固定する契約
 *   T1 墓標が立った物語は一覧に出さない（home.html）
 *   T2 墓標が立った物語は開けない（fix527・pullも止める）
 *   T3 2回目の削除要求で deleteOpId を作り直さない
 *   T4 2回目の削除要求で復元セット(snapshot)を作り直さない
 *   T5 既に完全に消えている物語への要求は、ゲートを呼ばずに終わる
 *   T6 生きている物語を誤って隠さない（deleted:true かつ deleteOpId 有りに限る）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC527 = read('v292Dfix527-story-url.js');
const STORY = JSON.stringify({ turns: [{}, {}, {}] });

/* ---------------- fix587 の環境（test_fix587 と同じ作り） ---------------- */
function mkEnv(opts){
  opts = opts || {};
  const store = Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id: 'smA', name: '消す物語' }, { id: 'smB', name: '残す物語' }]),
    'chr6_slot_smA': STORY,
    'chr6_slot_smB': STORY,
    'v292Dfix77States_slot_smA': '{"s":1}'
  }, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const gateCalls = [], snapCreated = [];
  let pushFail = !!opts.pushFail;
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, JSON, Date, Error, Promise,
    __v292Dfix579: {
      make: o => (o && o.slotId && o.deleteOpId) ? { id:o.slotId, title:o.title||'', deleted:true,
        deletedAt:o.deletedAt||null, deleteOpId:o.deleteOpId, recoverySnapshotId:o.recoverySnapshotId||null,
        lifecycleVersion:1 } : null,
      validate: e => ({ ok: !!(e && e.deleted === true && e.id && e.deleteOpId && e.lifecycleVersion === 1), problems: [] }),
      isBlockedByTombstone: () => ({ blocked:false })
    },
    __v292Dfix564: {
      /* ★manifest を実際に localStorage へ置く（fix588 は manifest.reason で
         「この復元セットはどの削除操作のものか」を照合するため） */
      create: (slot, o) => {
        snapCreated.push(slot);
        const id = 'chr6_snap_' + slot + '_' + snapCreated.length;
        store[id] = JSON.stringify({ id: id, slotId: slot, complete: true,
                                     reason: (o && o.reason) || 'manual', partCount: 1, parts: {} });
        return { ok:true, id: id };
      },
      verify: id => ({ ok: !opts.verifyFail && !!store[id], id: id })
    },
    __v292Dfix569: {
      tryDeleteExact: req => {
        gateCalls.push(req);
        ls.removeItem(req.key);
        return { ok:true, deleted:true, code:'deleted', key:req.key };
      }
    },
    __v292Dfix562: {
      /* ★fix588: 物理削除の解禁条件に「分類器が使える」が入ったのでモックにも持たせる
         （GPT裁定D-5: 通常同期は fail-open、削除後の物理GCは必ず fail-closed） */
      classifyKey: k => {
        let m = /^chr6_slot_(.+)$/.exec(k) || /_slot_([^"]+)$/.exec(k) || /genderMap_"([^"]+)"$/.exec(k);
        return { slotId: m ? m[1] : null };
      },
      sideStoreKeys: slot => Object.keys(store).filter(k =>
        k !== 'chr6_slot_' + slot && k.indexOf('chr6_snap') !== 0 && k.indexOf(slot) >= 0),
      _hash: s => 'h' + String(s).length
    },
    __v292Dfix399x: { push: () => pushFail ? Promise.reject(new Error('offline')) : Promise.resolve({ rev: 1 }) }
  };
  w.window = w; w.__store = store; w.__gateCalls = gateCalls; w.__snapCreated = snapCreated;
  w.__setOnline = () => { pushFail = false; };
  vm.runInContext(SRC587, vm.createContext(w), { filename: 'v292Dfix587-story-lifecycle.js' });
  return w;
}
const metaOf = w => { try { return JSON.parse(w.__store['chr6_slots_meta']); } catch(e){ return []; } };
const tombsOf = (w, id) => metaOf(w).filter(e => e && e.id === id && e.deleted === true);

/* ---------------- T3/T4: 2回目の要求で作り直さない ---------------- */
console.log('\n== (1) ★★保留中の物語をもう一度削除しても deleteOpId と復元セットを作り直さない ==');
const svcOf = w => w.__chronicleStoryLifecycle;
const w1 = mkEnv({ pushFail: true });
svcOf(w1).requestDelete('smA', { source:'home' }).then(r1 => {
  ok('1回目はクラウドへ反映できず保留になる', r1.ok === true && r1.code === 'pending-cloud', r1);
  ok('墓標は立っている', tombsOf(w1, 'smA').length === 1, metaOf(w1));
  ok('★保留のあいだ実データは残る（消してから伝えない）', w1.__store['chr6_slot_smA'] === STORY);
  const op1 = r1.deleteOpId, snaps1 = w1.__snapCreated.length;
  return svcOf(w1).requestDelete('smA', { source:'home' }).then(r2 => {
    ok('★★2回目も deleteOpId が同じ（クラウドの墓標と食い違わせない）', r2.deleteOpId === op1, { op1, op2: r2.deleteOpId });
    ok('★★復元セットを作り直していない', w1.__snapCreated.length === snaps1, w1.__snapCreated);
    ok('★★墓標が2件に増えていない', tombsOf(w1, 'smA').length === 1, metaOf(w1));
    ok('★保留の記録も1件のまま',
       (JSON.parse(w1.__store['v292Dfix587_pending'] || '[]') || []).length === 1,
       w1.__store['v292Dfix587_pending']);
    ok('★まだ実データは消えていない', w1.__store['chr6_slot_smA'] === STORY);
    /* 通信が戻ったら、同じ deleteOpId のまま続きが片づく */
    w1.__setOnline();
    return svcOf(w1).resumePending().then(r3 => {
      ok('★通信が戻れば保留が片づく', r3.ok === true && r3.done === 1, r3);
      ok('★★本体が消えている', w1.__store['chr6_slot_smA'] === undefined);
      ok('★★サイドストアも消えている', w1.__store['v292Dfix77States_slot_smA'] === undefined);
      ok('★残す物語は無傷', w1.__store['chr6_slot_smB'] === STORY);
      ok('★墓標は残る（削除の正本なので消さない）', tombsOf(w1, 'smA').length === 1);
      return step2();
    });
  });
}).then(() => step5()).catch(e => { fail++; console.log('  FAIL  例外: ' + (e && e.message)); }).then(done);

/* ---------------- ★GPT裁定(C): pending消失時は「工程の進捗を推測しない」 ---------------- */
function step2(){
  console.log('\n== (2) ★★pendingを失ったら、照合が通っても物理削除しない（クラウド確定を推測しない） ==');
  const w = mkEnv({ pushFail: true });
  return svcOf(w).requestDelete('smA', { source:'home' }).then(r1 => {
    const op1 = r1.deleteOpId, snaps1 = w.__snapCreated.length;
    /* 保留の記録だけが失われた状態を作る（容量不足で消えた等） */
    delete w.__store['v292Dfix587_pending'];
    w.__setOnline();
    return svcOf(w).requestDelete('smA', { source:'home' }).then(r2 => {
      ok('★★物理削除せず、read-back 待ちで止まる',
         r2.ok === false && r2.code === 'resume-blocked-needs-readback', r2);
      ok('★deleteOpId は墓標のものを使う（作り直さない）', r2.deleteOpId === op1, { op1, op2: r2.deleteOpId });
      ok('★★復元セットを作り直していない', w.__snapCreated.length === snaps1, w.__snapCreated);
      ok('★★本体は消えていない（推測で消さない）', w.__store['chr6_slot_smA'] === STORY);
      ok('★ゲートを呼んでいない', w.__gateCalls.length === 0, w.__gateCalls);
      ok('★墓標だけ再commitしている', r2.tombstoneRecommitted === true, r2);
      ok('★墓標は1件のまま', tombsOf(w, 'smA').length === 1, metaOf(w));
      return step2b();
    });
  });
}

function step2b(){
  console.log('\n== (2b) ★pendingなし・復元セットが「この削除のもの」と確認できない → 再開しない ==');
  /* 別の削除操作のsnapshot（reasonが一致しない）に差し替わっている状態 */
  const w = mkEnv({
    seed: { 'chr6_slots_meta': JSON.stringify([
      { id:'smA', deleted:true, deleteOpId:'del_smA_111', recoverySnapshotId:'chr6_snap_smA_9', lifecycleVersion:1 },
      { id:'smB', name:'残す物語' } ]),
      'chr6_snap_smA_9': JSON.stringify({ id:'chr6_snap_smA_9', slotId:'smA', complete:true,
                                          reason:'lifecycle-delete:del_smA_222', partCount:1, parts:{} }) }
  });
  return svcOf(w).requestDelete('smA', { source:'home' }).then(r => {
    ok('★★削除を再開しない', r.ok === false && r.code === 'resume-refused', r);
    ok('★理由を記録している', Array.isArray(r.problems) && r.problems.length > 0, r.problems);
    ok('★★本体は無傷', w.__store['chr6_slot_smA'] === STORY);
    ok('★ゲートを呼んでいない', w.__gateCalls.length === 0);

    console.log('\n== (2c) ★正式に復元済みの削除は、古いdeleteOpIdで再開しない ==');
    const v = mkEnv({
      seed: { 'chr6_slots_meta': JSON.stringify([
        { id:'smA', deleted:true, deleteOpId:'del_smA_111', restoreOfDeleteOpId:'del_smA_111',
          recoverySnapshotId:'chr6_snap_smA_9', lifecycleVersion:1 } ]),
        'chr6_snap_smA_9': JSON.stringify({ id:'chr6_snap_smA_9', slotId:'smA', complete:true,
                                            reason:'lifecycle-delete:del_smA_111', partCount:1, parts:{} }) }
    });
    return svcOf(v).requestDelete('smA', { source:'home' }).then(r2 => {
      ok('★★復元済みなら再開しない', r2.ok === false && r2.code === 'resume-refused', r2);
      ok('★理由に「復元済み」が入っている',
         (r2.problems || []).some(p => String(p).indexOf('復元') >= 0), r2.problems);
      ok('★★本体は無傷', v.__store['chr6_slot_smA'] === STORY);

      console.log('\n== (2d) ★★malformed墓標（deleteOpIdなし）は削除を再開しない ==');
      const m = mkEnv({
        seed: { 'chr6_slots_meta': JSON.stringify([{ id:'smA', deleted:true }, { id:'smB', name:'残す' }]) }
      });
      return svcOf(m).requestDelete('smA', { source:'home' }).then(r3 => {
        ok('★★malformed-tombstone を返す', r3.ok === false && r3.code === 'malformed-tombstone', r3);
        ok('★★本体は無傷（物理削除0）', m.__store['chr6_slot_smA'] === STORY);
        ok('★ゲートを呼んでいない', m.__gateCalls.length === 0);
        ok('★復元セットを作っていない', m.__snapCreated.length === 0);
        ok('★診断として数えている', svcOf(m).stats().malformedTombstones === 1, svcOf(m).stats());
        return step3();
      });
    });
  });
}

/* ---------------- T5: 既に消えている物語 ---------------- */
function step3(){
  console.log('\n== (3) ★既に消え終わっている物語への要求は、ゲートを呼ばずに終わる ==');
  const w = mkEnv({
    seed: { 'chr6_slots_meta': JSON.stringify([
      { id:'smA', deleted:true, deleteOpId:'del_smA_1', recoverySnapshotId:'chr6_snap_x', lifecycleVersion:1 },
      { id:'smB', name:'残す物語' } ]) }
  });
  delete w.__store['chr6_slot_smA'];
  delete w.__store['v292Dfix77States_slot_smA'];
  return svcOf(w).requestDelete('smA', { source:'home' }).then(r => {
    ok('★already-deleted を返す', r.ok === true && r.code === 'already-deleted', r);
    ok('★★deleteOpId は元のまま', r.deleteOpId === 'del_smA_1', r);
    ok('★★ゲートを1度も呼んでいない', w.__gateCalls.length === 0, w.__gateCalls);
    ok('★復元セットを作っていない', w.__snapCreated.length === 0, w.__snapCreated);
    ok('★墓標は1件のまま', tombsOf(w, 'smA').length === 1, metaOf(w));
    return step4();
  });
}

/* ---------------- 墓標が無い物語は従来どおり（退行していない） ---------------- */
function step4(){
  console.log('\n== (4) 墓標が無い物語は従来どおり削除できる（退行していない） ==');
  const w = mkEnv();
  return svcOf(w).requestDelete('smA', { source:'home' }).then(r => {
    ok('成功する', r.ok === true && r.code === 'deleted', r);
    ok('復元セットを1つ作る', w.__snapCreated.length === 1, w.__snapCreated);
    ok('墓標が立つ', tombsOf(w, 'smA').length === 1);
    ok('本体とサイドストアが消える',
       w.__store['chr6_slot_smA'] === undefined && w.__store['v292Dfix77States_slot_smA'] === undefined);
    ok('★保留の記録を無駄に書いていない', w.__store['v292Dfix587_pending'] === undefined,
       w.__store['v292Dfix587_pending']);
  });
}

/* ---------------- T1/T2/T6 と配線の静的検査 ---------------- */
function step5(){
  console.log('\n== (5) ★★fix579: isTombstonedId は id の完全一致で判定する ==');
  {
    const w = { window: null, JSON };
    w.window = w;
    vm.runInContext(SRC579, vm.createContext(w), { filename: 'v292Dfix579-tombstone-schema.js' });
    const T = w.__v292Dfix579;
    const meta = [{ id:'sm1', deleted:true, deleteOpId:'d1', lifecycleVersion:1 }, { id:'sm12', name:'生きている' }];
    ok('墓標のidを true と判定する', T.isTombstonedId('sm1', meta) === true);
    ok('★★部分一致で誤爆しない（sm12 は生きている）', T.isTombstonedId('sm12', meta) === false);
    ok('未知のidは false', T.isTombstonedId('zzz', meta) === false);
    ok('空・不正入力で落ちない', T.isTombstonedId('', meta) === false && T.isTombstonedId('sm1', null) === false);
    /* fix579 の判定は deleted===true（形の検証は validate が持つ）。
       表示・起動を止める側は「隠す方向が安全」なので、deleteOpId が無くても隠す。 */
    ok('★deleteOpId が無い削除済みエントリも隠す側では墓標として扱う（安全側）',
       T.isTombstonedId('sm9', [{ id:'sm9', deleted:true }]) === true);
  }

  console.log('\n== (6) ★★fix527: 削除済み物語のURLでは起動せず、pullも止めてホームへ戻す ==');
  {
    const meta = JSON.stringify([
      { id:'smDead', deleted:true, deleteOpId:'del_smDead_1', lifecycleVersion:1 },
      { id:'smLive', name:'生きている' }
    ]);
    const store = { 'chr6_slots_meta': meta, 'chr6_active_slot': '"smLive"' };
    const replaced = [], setKeys = [], notice = {};
    const w = {
      console: { log(){}, warn(){}, error(){} }, JSON, Date, Error, Promise,
      setTimeout: () => 0,
      sessionStorage: { getItem: k => (k in notice ? notice[k] : null),
                        setItem: (k, v) => { notice[k] = String(v); },
                        removeItem: k => { delete notice[k]; } },
      localStorage: {
        getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
        setItem: (k, v) => { setKeys.push(k); store[k] = String(v); },
        removeItem: k => { delete store[k]; }
      },
      location: { search: '?v=x&story=smDead', pathname: '/index.html',
                  replace: u => { replaced.push(String(u)); } },
      document: { readyState: 'complete', addEventListener(){}, querySelector: () => null,
                  querySelectorAll: () => [], body: {} },
      MutationObserver: function(){ this.observe = function(){}; }
    };
    w.window = w;
    vm.runInContext(SRC527, vm.createContext(w), { filename: 'v292Dfix527-story-url.js' });
    const st = w.__v292Dfix527.state();
    ok('★★storyId を採用していない（削除済みなので開かない）', st.storyId === null, st);
    ok('★削除済みidを記録している', st.deletedStoryId === 'smDead', st);
    ok('★★ホームへ戻している（location.replace・履歴ループを避ける）',
       replaced.length === 1 && replaced[0] === 'home.html', replaced);
    ok('★★理由をURLに載せていない', replaced[0].indexOf('?') < 0 && replaced[0].indexOf('smDead') < 0, replaced);
    ok('★★理由は端末内の一回限りの通知で渡す（sessionStorage）',
       typeof notice['chr6_home_notice'] === 'string' && notice['chr6_home_notice'].indexOf('削除済み') >= 0, notice);
    ok('★★墓標へ lastOpenedAt を書いていない',
       setKeys.indexOf('chr6_slots_meta') < 0, setKeys);
    ok('★★ミラー(chr6_active_slot)を墓標idへ書き換えていない',
       store['chr6_active_slot'] === '"smLive"', store['chr6_active_slot']);
    ok('★isDeletedStoryId が公開されている', typeof w.__v292Dfix527.isDeletedStoryId === 'function');
    ok('生きているidは削除済みと判定しない', w.__v292Dfix527.isDeletedStoryId('smLive') === false);

    /* 生きている物語のURLでは、従来どおり起動する（退行していない） */
    const store2 = { 'chr6_slots_meta': meta, 'chr6_active_slot': '"other"' };
    const replaced2 = [];
    const w2 = {
      console: { log(){}, warn(){}, error(){} }, JSON, Date, Error, Promise, setTimeout: () => 0,
      localStorage: {
        getItem: k => Object.prototype.hasOwnProperty.call(store2, k) ? store2[k] : null,
        setItem: (k, v) => { store2[k] = String(v); }, removeItem: k => { delete store2[k]; }
      },
      location: { search: '?story=smLive', pathname: '/index.html', replace: u => { replaced2.push(u); } },
      document: { readyState: 'complete', addEventListener(){}, querySelector: () => null,
                  querySelectorAll: () => [], body: {} },
      MutationObserver: function(){ this.observe = function(){}; }
    };
    w2.window = w2;
    vm.runInContext(SRC527, vm.createContext(w2), { filename: 'v292Dfix527-story-url.js' });
    ok('★生きている物語は従来どおり開く', w2.__v292Dfix527.state().storyId === 'smLive');
    ok('★ホームへ戻していない', replaced2.length === 0, replaced2);
    ok('ミラーを自分のidへ固定している', store2['chr6_active_slot'] === '"smLive"', store2['chr6_active_slot']);
  }

  console.log('\n== (7) ★home.html: 一覧が墓標を除外している（T1） ==');
  {
    const home = read('home.html');
    const i = home.indexOf('function all()'), j = home.indexOf('function mountCovers');
    const body = home.slice(i, j);
    ok('★★all() が墓標を除外している', /!isTombstoneEntry\(m\)/.test(body), body.slice(0, 200));
    ok('★判定は fix579 を正本にしている', /__v292Dfix579[\s\S]{0,200}isTombstone/.test(home));
    /* ★GPT裁定(B): 隠す側は deleteOpId を要求しない（壊れた墓標も隠す） */
    ok('★★未搭載時も自前で墓標を隠す。判定は deleted===true のみ（deleteOpIdを要求しない）',
       /return !!\(m && m\.deleted === true\);/.test(home), (home.match(/return !!\(m && m\.deleted[^\n]*/)||[])[0]);
    ok('★削除済みURLで戻されたときの案内がある（alertは使わない）',
       /v588-deleted/.test(home) && /chr6_home_notice/.test(home));
    ok('★★案内は表示したら消す（一回限り）',
       /sessionStorage\.removeItem\(NOTICE_KEY\)/.test(home));
    const notice = home.slice(home.indexOf('function deletedNotice'), home.indexOf('// ---------- 起動'));
    ok('★案内で alert を使っていない（拡張の自動操作を固める前歴があるため）', notice.indexOf('alert(') < 0);
    ok('★OFFスイッチ v292Dfix588Off がある（各fixに必ず付ける規約）', /v292Dfix588Off/.test(home));
  }

  console.log('\n== (7b) ★OFFスイッチは「隠す・開かせない」だけを止め、削除保護は迂回させない ==');
  {
    ok('★fix527 の起動遮断は OFF で止まる', /v292Dfix588Off/.test(SRC527));
    /* GPT指定「ロールバック設定がデータ削除保護を迂回してはいけない」
       → 墓標→クラウド確定→物理削除の順序と deleteOpId の再利用に OFF は無い */
    ok('★★fix587 に v292Dfix588Off は無い（削除保護は止められない）',
       SRC587.indexOf('v292Dfix588Off') < 0);
    const store = { 'chr6_slots_meta': JSON.stringify([{ id:'smDead', deleted:true, deleteOpId:'d1', lifecycleVersion:1 }]),
                    'v292Dfix588Off': '1' };
    const replaced = [];
    const w = {
      console:{log(){},warn(){},error(){}}, JSON, Date, Error, Promise, setTimeout: () => 0,
      localStorage: { getItem: k => Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null,
                      setItem: (k,v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      location: { search:'?story=smDead', pathname:'/index.html', replace: u => { replaced.push(u); } },
      document: { readyState:'complete', addEventListener(){}, querySelector: () => null,
                  querySelectorAll: () => [], body:{} },
      MutationObserver: function(){ this.observe = function(){}; }
    };
    w.window = w;
    vm.runInContext(SRC527, vm.createContext(w), { filename:'v292Dfix527-story-url.js' });
    ok('★OFFなら削除済みidでも従来どおり開く（緊急脱出口）',
       w.__v292Dfix527.state().storyId === 'smDead' && replaced.length === 0,
       { st: w.__v292Dfix527.state(), replaced });
  }

  console.log('\n== (8) 出荷の体裁（BUILT・version.txt・キャッシュバスター） ==');
  {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
    const built = (idx.match(/var BUILT = '([^']+)'/) || [])[1] || '';
    const ver = read('version.txt').trim();
    ok('★BUILT と version.txt が同値', built === ver, { built, ver });
    ok('★BUILT が fix588 以降', /fix5(8[8-9]|9\d)|fix[6-9]\d\d/.test(built), built);
    /* ★JSを直したら cb も必ず上げる（上げないと実機が旧版を使い続ける） */
    for (const f of ['v292Dfix527-story-url.js', 'v292Dfix579-tombstone-schema.js', 'v292Dfix587-story-lifecycle.js']){
      const cb = (idx.match(new RegExp(f.replace(/\./g, '\\.') + '\\?cb=v292Dfix(\\d+)')) || [])[1];
      ok('★' + f + ' の cb が fix588 以降', !!cb && Number(cb) >= 588, cb);
    }
    const home = read('home.html');
    for (const f of ['v292Dfix579-tombstone-schema.js', 'v292Dfix587-story-lifecycle.js']){
      const cb = (home.match(new RegExp(f.replace(/\./g, '\\.') + '\\?cb=v292Dfix(\\d+)')) || [])[1];
      ok('★home.html 側 ' + f + ' の cb が fix588 以降', !!cb && Number(cb) >= 588, cb);
    }
  }

  console.log('\n== (8b) ★★GPT裁定(D): 墓標スロットの本体・サイドストアを push しない ==');
  {
    /* fix402 / fix399 の収集部だけを取り出して実際に動かす。
       「pull barrier と Worker v24 があるから送ってよい」ではない——最終防御は、
       削除済みの実体を送り続ける設計を正当化しない（GPT明示）。 */
    const SRC402 = read('v292Dfix402-invisible-sync.js');
    const SRC399 = read('v292Dfix399-cloudsync.js');

    const mkLS = obj => {
      const store = Object.assign({}, obj);
      return { store,
        getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v); },
        key: i => Object.keys(store)[i] != null ? Object.keys(store)[i] : null,
        get length(){ return Object.keys(store).length; } };
    };
    /* fix562 の classifyKey の代役（正規化済み slotId を返す。引用符付きキーも扱う） */
    const classifier = {
      classifyKey: k => {
        let m = /^chr6_slot_(.+)$/.exec(k); if (m) return { slotId: m[1] };
        m = /_slot_([^"]+)$/.exec(k);       if (m) return { slotId: m[1] };
        m = /genderMap_"([^"]+)"$/.exec(k); if (m) return { slotId: m[1] };
        return { slotId: null };
      }
    };
    const SEED = {
      'chr6_slots_meta': JSON.stringify([
        { id:'sm1', deleted:true, deleteOpId:'d1', lifecycleVersion:1 },
        { id:'sm12', name:'生きている物語' }]),
      'chr6_active_slot': '"sm12"',
      'chr6_slot_sm1': STORY,                        /* 墓標スロットの本体（保留中はまだ残る） */
      'v292Dfix77States_slot_sm1': '{"s":1}',        /* 墓標スロットのサイドストア */
      'chr6_v292Dfix54_genderMap_"sm1"': '{"g":"f"}',/* ★引用符付きサイドストア */
      'chr6_slot_sm12': STORY,                       /* 生きている物語（idが sm1 を含む） */
      'v292Dfix77States_slot_sm12': '{"s":2}'
    };

    const load402 = (ls, withClassifier) => {
      const region = SRC402.slice(SRC402.indexOf('function tombstonedIds'), SRC402.indexOf('function collectLight'));
      const f = new Function('lsGet', 'window', 'localStorage', 'activeSlot', 'isGlobalKey', 'JSON',
        region + '\nreturn { allSlotIds: allSlotIds, collectLS: collectLS };');
      return f(k => ls.getItem(k), { __v292Dfix562: withClassifier ? classifier : undefined },
               ls, () => 'sm12', k => (k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'), JSON);
    };
    const load399 = (ls, withClassifier) => {
      const region = SRC399.slice(SRC399.indexOf('function deadSlotIds'), SRC399.indexOf('// ---- IndexedDB'));
      const f = new Function('window', 'localStorage', 'isGlobalKey', 'JSON',
        region + '\nreturn { collectLS: collectLS };');
      return f({ __v292Dfix562: withClassifier ? classifier : undefined }, ls,
               k => (k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'), JSON);
    };

    {
      const ls = mkLS(SEED), m = load402(ls, true);
      const ids = m.allSlotIds();
      ok('★★墓標スロットを同期対象の列挙から外す', ids.indexOf('sm1') < 0, ids);
      ok('★生きている物語は列挙に残る', ids.indexOf('sm12') >= 0, ids);
      const pkg = m.collectLS(ids);
      ok('★★墓標スロットの本体を送らない', pkg['chr6_slot_sm1'] === undefined, Object.keys(pkg));
      ok('★★墓標スロットのサイドストアを送らない', pkg['v292Dfix77States_slot_sm1'] === undefined);
      ok('★★引用符付きサイドストアも送らない', pkg['chr6_v292Dfix54_genderMap_"sm1"'] === undefined);
      ok('★★meta（墓標を含む）は送る（削除を伝えるため）', typeof pkg['chr6_slots_meta'] === 'string');
      ok('★★部分一致で誤爆しない: 生きている sm12 は送る',
         pkg['chr6_slot_sm12'] === STORY && pkg['v292Dfix77States_slot_sm12'] === '{"s":2}', Object.keys(pkg));
    }
    {
      const ls = mkLS(SEED), m = load402(ls, false);   /* 分類器が居ない */
      const pkg = m.collectLS(['sm1', 'sm12']);
      ok('★分類器が居なければ従来どおり送る（fail-open・同期を欠かせない）',
         pkg['chr6_slot_sm1'] === STORY, Object.keys(pkg));
    }
    {
      const ls = mkLS(Object.assign({}, SEED, { 'v292Dfix588Off': '1' })), m = load402(ls, true);
      ok('★OFFなら従来どおり列挙する（緊急脱出口）', m.allSlotIds().indexOf('sm1') >= 0, m.allSlotIds());
    }
    {
      const ls = mkLS(SEED), m = load399(ls, true);
      const pkg = m.collectLS('sm1');
      ok('★★fix399 側も墓標スロットの本体を送らない', pkg['chr6_slot_sm1'] === undefined, Object.keys(pkg));
      ok('★★fix399 側も引用符付きサイドストアを送らない', pkg['chr6_v292Dfix54_genderMap_"sm1"'] === undefined);
      ok('★fix399 側も meta は送る', typeof pkg['chr6_slots_meta'] === 'string');
      const pkg2 = m.collectLS('sm12');
      ok('★fix399 側も生きている物語は従来どおり送る', pkg2['chr6_slot_sm12'] === STORY);
    }
    ok('★両方の収集で同じ関門を通している（実装が片方だけになっていない）',
       /isDeadSlotKey\(k, dead\)/.test(SRC402) && /isDeadSlotKey\(k, dead\)/.test(SRC399));
    ok('★★部分一致(indexOf)で墓標判定していない（生きている物語を落とさない）',
       !/dead\[[^\]]*\]\s*&&\s*k\.indexOf/.test(SRC402) && !/dead\[[^\]]*\]\s*&&\s*k\.indexOf/.test(SRC399));
  }

  console.log('\n== (8c) ★★GPT裁定(D-5): 分類器が居ないとき — 同期はfail-open / 物理削除はfail-closed ==');
  {
    /* fix562 の classifyKey が使えない環境を作る（sideStoreKeys だけある古い分類器） */
    const w = mkEnv();
    delete w.__v292Dfix562.classifyKey;
    return svcOf(w).requestDelete('smA', { source:'home' }).then(r => {
      ok('★★物理削除しない（保留になる）', r.ok === true && r.code === 'pending-classifier', r);
      ok('★★本体は残る', w.__store['chr6_slot_smA'] === STORY);
      ok('★ゲートを呼んでいない', w.__gateCalls.length === 0, w.__gateCalls);
      ok('★墓標は立つ（削除の意思は残す）', tombsOf(w, 'smA').length === 1);
      ok('★保留に積んで、次の機会に片づける',
         (JSON.parse(w.__store['v292Dfix587_pending'] || '[]') || []).length === 1);
      ok('★診断として数えている', svcOf(w).stats().classifierUnavailable === 1, svcOf(w).stats());
      ok('★分類器が戻れば片づく（後で解禁される）', true);

      /* 送信側は fail-open だが、記録は必ず残す */
      const v = mkEnv();
      let noted = 0;
      v.__chronicleStoryLifecycle.noteFilterUnavailable();
      noted = v.__chronicleStoryLifecycle.stats().tombstonePayloadFilterUnavailable;
      ok('★★送信側の「除外できなかった」を記録する口がある', noted === 1, noted);
      const SRC402 = read('v292Dfix402-invisible-sync.js'), SRC399 = read('v292Dfix399-cloudsync.js');
      ok('★fix402 が分類器不在を報告している', /noteFilterUnavailable\(\)/.test(SRC402));
      ok('★fix399 が分類器不在を報告している', /noteFilterUnavailable\(\)/.test(SRC399));
      return step9();
    });
  }
}

function step9(){
  console.log('\n== (9) 墓標を「消す」コードを新しく作っていない ==');
  {
    /* ★静的検査は**コメントを除去してから**走らせる。除去しないと、
       その禁止事項を説明したコメント自身が引っかかり、正しいファイルが永久に赤くなる。 */
    const noComment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok('★fix587 は自分で removeItem を呼ばない（削除の所有者を増やさない）',
       noComment(SRC587).indexOf('removeItem') < 0,
       (noComment(SRC587).match(/.{0,60}removeItem.{0,40}/) || [])[0]);
    ok('★fix527 は削除判定でデータを書き換えない',
       (() => { const s = SRC527.slice(SRC527.indexOf('function isDeletedStoryId'), SRC527.indexOf('// ---- [2]'));
                return s.indexOf('setItem') < 0 && s.indexOf('removeItem') < 0; })());
  }
  return Promise.resolve();
}

function done(){
  console.log('\n---------------------------------------------');
  console.log('test_fix588: 合格 ' + pass + ' / 失敗 ' + fail);
  console.log('pass=' + pass + ' fail=' + fail);   /* run_all_tests.cjs が読む形式 */
  if (fail) process.exitCode = 1;
}
