/* 回帰テスト: v292Dfix602 — StoryLifecycleService の「なぜ片づかないのか」を残す部分
 *   対象: v292Dfix587-story-lifecycle.js の fix602 で足された振る舞い
 *
 * ■なぜ必要か（2026-07-27 の実機）
 *   削除の後片づけが 16件中6件 残ったまま動かなくなった。当時 `gateRefused` は**総数だけ**で、
 *   理由はメモリ上の LOG にしか無かったので、**ページを閉じた時点で原因が消えた**。
 *   「片づかない」という事実だけが残り、stale なのか protected なのか
 *   policy-unavailable なのかが誰にも分からない＝また「無言の失敗」。
 *
 * ■fix602 が約束したこと（＝このテストが固定する契約）
 *   ①拒否の内訳（期待した長さ/指紋 と いまの長さ/指紋）を記録する。**生の本文は残さない**
 *   ②理由を code 別に数える
 *   ③理由を localStorage（ring 20件）へ永続化する ＝ 再読込しても読める
 *   ④自動で片づけられない計画は**理由つきの終端状態**へ移し、保留から外す
 *     （GPT裁定「永久に片づかないを防ぐことは、必ず物理削除することではない。
 *       自動処理不能を理由つき終端状態へ移すことも正しい解決」）
 *   ⑤一過性の失敗は回数を**永続化して**数え、上限で自動再試行をやめる
 *   ⑥人が読める理由を出す（専門用語も生hashも出さない）
 *
 * ★このテストの方針（過去に踏んだ「偽の合格」を作らないため）
 *   ・期待値は**具体値**で書く。`a === b` で両辺 undefined/null の偽合格を作らない。
 *   ・「異常0件」だけを信じない。**必ず既知の人工1件を通してから**カウンタを読む。
 *   ・振る舞いを固定する。ソース文字列の形は原則見ない。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC = read('v292Dfix587-story-lifecycle.js');

/* ★本文に「絶対に記録へ漏れてはいけない生の値」を混ぜておく（漏洩検査の的） */
const SECRET = 'ヒミツの本文_これが記録に出たら個人情報漏れ';
const STORY = JSON.stringify({ turns: [{ text: SECRET }, {}, {}] });

/* 内容に依存する hash（fix562._hash の代役）。
   ★長さだけの hash にすると「内容が変わったのに指紋が同じ」を作ってしまい、
     stale の検査が意味を失う。 */
function mkHash(s){ s = String(s); let n = 0; for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0; return 'H' + s.length + '-' + n; }

function mkEnv(opts){
  opts = opts || {};
  const store = opts.store || Object.assign({
    'chr6_slots_meta': JSON.stringify([{ id: 'smA', name: '消す物語' }, { id: 'smB', name: '残す物語' }]),
    'chr6_slot_smA': STORY,
    'chr6_slot_smB': STORY
  }, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };
  const gateCalls = [];
  const w = { localStorage: ls, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, JSON, Date, Error, Promise,
    __v292Dfix579: {
      make: o => (o && o.slotId && o.deleteOpId) ? { id: o.slotId, title: o.title || '', deleted: true,
        deletedAt: o.deletedAt || null, deleteOpId: o.deleteOpId,
        recoverySnapshotId: o.recoverySnapshotId || null, lifecycleVersion: 1 } : null,
      validate: e => ({ ok: !!(e && e.deleted === true && e.id && e.deleteOpId), problems: [] }),
      isBlockedByTombstone: () => ({ blocked: false })
    },
    __v292Dfix564: {
      create: (slot, o) => ({ ok: true, id: 'chr6_snap_' + slot + '_' + (o && o.now) }),
      verify: id => ({ ok: true, id: id })
    },
    __v292Dfix569: {
      /* 拒否コードは opts.refuse(req) が返す文字列。null なら実際に消す。 */
      tryDeleteExact: req => {
        gateCalls.push(req);
        if (opts.gateThrows) throw new Error('ゲートが落ちた');
        const code = opts.refuse ? opts.refuse(req) : null;
        if (code) return { ok: false, deleted: false, code: code, key: req.key };
        ls.removeItem(req.key);
        return { ok: true, deleted: true, code: 'deleted', key: req.key };
      }
    },
    __v292Dfix562: {
      classifyKey: k => {
        const m = /^chr6_slot_(.+)$/.exec(k) || /_slot_([^"]+)$/.exec(k) || /genderMap_"([^"]+)"$/.exec(k);
        return { slotId: m ? m[1] : null };
      },
      sideStoreKeys: slot => Object.keys(store).filter(k =>
        k !== 'chr6_slot_' + slot && k.indexOf('chr6_bk_') !== 0 &&
        k.indexOf('chr6_snap') !== 0 && k.indexOf(slot) >= 0),
      _hash: mkHash
    },
    __v292Dfix399x: { push: () => opts.pushFail ? Promise.reject(new Error('offline')) : Promise.resolve({ rev: 1 }) }
  };
  w.window = w; w.__store = store; w.__gateCalls = gateCalls;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'v292Dfix587-story-lifecycle.js' });
  return w;
}
/* ★「ページを再読込した」を作る。localStorage(store) だけを引き継ぎ、
   メモリ上の LOG も stats も**全部捨てた**状態で読み直す。 */
function reload(w, opts){ return mkEnv(Object.assign({}, opts || {}, { store: w.__store })); }
const svc = w => w.__chronicleStoryLifecycle;

(async () => {

console.log('\n== (1) ★★拒否の内訳を「期待した値」と「いまの値」で残す（stale が判別できる） ==');
{
  /* 計画を立てた時点と、実際に消す時点で本文が変わった状況を作る。
     ★これは推測ではなく、fix587 の設計そのもの（計画は exact key + bytes + hash で固定される）。 */
  let refuseCode = null;
  const w = mkEnv({ pushFail: true, refuse: () => refuseCode });
  const L = svc(w);

  /* ★★「異常0件」を信じない。まず**何も起きていない状態**を具体値で確かめる。 */
  ok('★はじめは拒否0件（この0は後で1になることで初めて意味を持つ）',
     L.refusals().length === 0 && JSON.stringify(L.stats().gateRefusedByCode) === '{}' &&
     L.stats().gateRefused === 0, L.stats());
  ok('★はじめは終端0件', L.blockedDeletes().length === 0);
  ok('★はじめは画面に出す行が無い（黙るのではなく null と言える）', L.pendingSummary() === null, L.pendingSummary());

  const r1 = await L.requestDelete('smA', { source: 'home' });
  ok('★push できないので保留（実データは消さない）',
     r1.ok === true && r1.code === 'pending-cloud' && w.__store['chr6_slot_smA'] === STORY, r1);
  const plan = L.pendingDeletes()[0];
  ok('★計画に exact key と長さと指紋が載っている（具体値）',
     plan.keys.length === 1 && plan.keys[0].key === 'chr6_slot_smA' &&
     plan.keys[0].bytes === STORY.length && plan.keys[0].hash === mkHash(STORY), plan.keys);

  /* 別端末の pull などで本文が更新された */
  const NEWER = STORY + 'あとから追記された本文';
  w.__store['chr6_slot_smA'] = NEWER;
  w.__v292Dfix399x.push = () => Promise.resolve({ rev: 2 });
  refuseCode = 'stale';

  const r2 = await L.resumePending();
  ok('★★人工の拒否を1件だけ通した（＝これから読むカウンタには必ず1が入るはず）',
     w.__gateCalls.length === 1 && w.__gateCalls[0].key === 'chr6_slot_smA', w.__gateCalls.length);

  const f = L.refusals();
  ok('★★拒否理由が1件だけ記録された', f.length === 1, f);
  ok('★★期待した長さ（計画時）が入っている', f[0].expectedBytes === STORY.length, f[0]);
  ok('★★いまの長さ（実際の値）が入っている', f[0].actualBytes === NEWER.length, f[0]);
  ok('★★期待した指紋が入っている', f[0].expectedHash === mkHash(STORY), f[0]);
  ok('★★いまの指紋が入っている', f[0].actualHash === mkHash(NEWER), f[0]);
  ok('★★★長さも指紋も食い違っている＝「内容が更新された」と後から断定できる',
     f[0].expectedBytes !== f[0].actualBytes && f[0].expectedHash !== f[0].actualHash, f[0]);
  ok('★どのスロット・どの操作の拒否かが分かる',
     f[0].slotId === 'smA' && f[0].key === 'chr6_slot_smA' && f[0].code === 'stale' &&
     f[0].deleteOpId === plan.deleteOpId && f[0].planId === plan.planId, f[0]);
  ok('★★★生の本文は1文字も記録に入らない（長さと指紋だけ）',
     JSON.stringify(f).indexOf(SECRET) < 0 && JSON.stringify(f).indexOf('turns') < 0, f);

  ok('★★code 別に数えている（総数ではなく内訳）',
     L.stats().gateRefusedByCode.stale === 1 && L.stats().gateRefused === 1, L.stats());
  ok('★他の code は数えていない（数え漏れも数え過ぎもない）',
     Object.keys(L.stats().gateRefusedByCode).length === 1, L.stats().gateRefusedByCode);

  console.log('\n== (2) ★★stale は一過性ではない → 保留から外して理由つき終端にする ==');
  ok('★resumePending が終端になったことを返す',
     r2.ok === true && r2.code === 'resumed' && r2.done === 0 &&
     r2.blocked.length === 1 && r2.blocked[0].slotId === 'smA' &&
     r2.blocked[0].reason === 'blocked-stale-legacy', r2);
  ok('★★保留から外れる（永久に再試行し続けない）', L.pendingDeletes().length === 0, L.pendingDeletes());
  const b = L.blockedDeletes();
  ok('★★理由つきの終端として1件残る', b.length === 1 && b[0].slotId === 'smA', b);
  ok('★★理由が「内容が更新された」だと分かる', b[0].blockedReason === 'blocked-stale-legacy', b[0]);
  ok('★★どのキーで止まったかが残る',
     b[0].keys.length === 1 && b[0].keys[0].key === 'chr6_slot_smA' && b[0].keys[0].code === 'stale', b[0].keys);
  ok('★終端の件数と理由も数えている',
     L.stats().blockedPlans === 1 && L.stats().blockedByReason['blocked-stale-legacy'] === 1, L.stats());

  ok('★★★拒否されたキーは消えていない（中途半端に消さない）',
     w.__store['chr6_slot_smA'] === NEWER, Object.keys(w.__store));
  ok('★★関係ない物語は無傷', w.__store['chr6_slot_smB'] === STORY);
  ok('★墓標は残る（一覧からは消えたまま・復活させない）',
     JSON.parse(w.__store['chr6_slots_meta']).some(e => e.id === 'smA' && e.deleted === true),
     w.__store['chr6_slots_meta']);

  console.log('\n== (3) ★★★再読込しても「なぜ止まったか」が読める（fix602 の目的そのもの） ==');
  const w2 = reload(w);
  const L2 = svc(w2);
  ok('★★終端状態が再読込後も読める',
     L2.blockedDeletes().length === 1 &&
     L2.blockedDeletes()[0].blockedReason === 'blocked-stale-legacy', L2.blockedDeletes());
  ok('★★拒否理由も再読込後も読める（内訳つき）',
     L2.refusals().length === 1 && L2.refusals()[0].code === 'stale' &&
     L2.refusals()[0].expectedBytes === STORY.length &&
     L2.refusals()[0].actualBytes === NEWER.length, L2.refusals());
  ok('★保留は再読込後も0件（終端に移ったものが戻ってこない）', L2.pendingDeletes().length === 0);
  {
    const before = w2.__gateCalls.length;
    const r = await L2.resumePending();
    ok('★★終端後の resumePending は何もしない（code=nothing・ゲート呼び出し0）',
       r.ok === true && r.code === 'nothing' && r.done === 0 &&
       w2.__gateCalls.length === before && before === 0, { r, before, now: w2.__gateCalls.length });
  }
}

console.log('\n== (4) ★★protected（大切な控えとして保護）も一過性ではない → 終端 ==');
{
  const w = mkEnv({ refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  const r = await L.requestDelete('smA', { source: 'home' });
  ok('★partial として返る', r.ok === true && r.code === 'partial' && r.refused.length === 1, r);
  ok('★★終端の理由は protected', r.outcome === 'blocked-protected', r);
  ok('★★保留に残さない', L.pendingDeletes().length === 0, L.pendingDeletes());
  ok('★★終端として1件残る', L.blockedDeletes().length === 1 &&
     L.blockedDeletes()[0].blockedReason === 'blocked-protected', L.blockedDeletes());
  ok('★★人が読める理由を同時に返す（UIがそのまま出せる）',
     r.humanReason === '大切な控えとして保護されているため保留しています', r.humanReason);
  ok('★code 別カウンタは protected が1', L.stats().gateRefusedByCode.protected === 1, L.stats());
  ok('★★拒否されたキーは消えていない', w.__store['chr6_slot_smA'] === STORY);
}

console.log('\n== (5) ★★一過性の失敗（delete-failed）は回数を数えて上限で止める ==');
{
  const w = mkEnv({ refuse: () => 'delete-failed' });
  const L = svc(w);
  const r = await L.requestDelete('smA', { source: 'home' });
  ok('★1回目は終端にしない（一過性なので次の機会に試す）',
     r.code === 'partial' && r.outcome === 'delete-failed' && L.blockedDeletes().length === 0, r);
  ok('★★保留に残る', L.pendingDeletes().length === 1, L.pendingDeletes());
  ok('★★回数が1として記録される', L.pendingDeletes()[0].attempts === 1, L.pendingDeletes()[0]);
  ok('★★★回数は localStorage に載る＝ページを再読込しても0に戻らない',
     JSON.parse(w.__store['v292Dfix587_pending'])[0].attempts === 1, w.__store['v292Dfix587_pending']);
  ok('★人が読める理由（次に開いたときにもう一度試す、と言える）',
     L.humanReason('delete-failed') === '片づけに失敗したので、次に開いたときにもう一度試します');

  /* ★再読込しても回数が残っていることを、**別インスタンスで**確かめる（メモリを疑う） */
  const w2 = reload(w, { refuse: () => 'delete-failed' });
  ok('★★再読込後も回数1（0に戻らない）', svc(w2).pendingDeletes()[0].attempts === 1,
     svc(w2).pendingDeletes());

  console.log('  -- 上限（MAX_ATTEMPTS=3）に達したら自動再試行をやめる --');
  ok('★上限が3として公開されている', svc(w2).MAX_ATTEMPTS === 3, svc(w2).MAX_ATTEMPTS);
  /* 2回分の記録が既に残っている端末（＝前回までのセッションで2回試した）を作る */
  const seeded = JSON.parse(w2.__store['v292Dfix587_pending']);
  seeded[0].attempts = 2;
  w2.__store['v292Dfix587_pending'] = JSON.stringify(seeded);
  const w3 = reload(w2, { refuse: () => 'delete-failed' });
  const L3 = svc(w3);
  const r3 = await L3.resumePending();
  ok('★★3回目で終端へ移る', r3.blocked.length === 1 &&
     r3.blocked[0].reason === 'blocked-delete-failed-max-attempts', r3);
  ok('★★保留から外れる', L3.pendingDeletes().length === 0, L3.pendingDeletes());
  ok('★★終端として読める', L3.blockedDeletes().length === 1 &&
     L3.blockedDeletes()[0].blockedReason === 'blocked-delete-failed-max-attempts', L3.blockedDeletes());
  ok('★★人が読める理由（3回試して駄目だったと言える）',
     L3.humanReason('blocked-delete-failed-max-attempts') === '3回試しても片づけられなかったため停止しました');
  {
    const before = w3.__gateCalls.length;
    const r4 = await L3.resumePending();
    ok('★★★上限後は自動再試行しない（ゲートを1度も叩かない）',
       r4.code === 'nothing' && w3.__gateCalls.length === before, { r4, before, now: w3.__gateCalls.length });
  }
}

console.log('\n== (5b) ★★★実際の再試行ループでも上限に達する（回数が本当に積み上がるか） ==');
{
  /* ★ここが (5) と違う点: (5) は「回数が2まで積まれていれば3回目で止まる」ことを確かめた。
     ここは**誰も手を加えずに**、requestDelete → resumePending を繰り返しただけで
     上限に達するか＝**回数が実際に積み上がるか**を確かめる。
     これが成立しないと、fix602 が防ごうとした
     「永久に片づかない（同じ計画がゲートを叩き続ける）」がそのまま残る。
     ------------------------------------------------------------------------
     ★★★このテストは 2026-07-27 時点で**意図的に赤**（実装側の不具合を指している）。
       実測: requestDelete で attempts=1 が保存されたあと、resumePending を何度呼んでも
             保存された attempts は 1 のまま＝**上限に永久に達しない**。
       真因: afterRefusal() が plan.attempts を増やしたあと addPending(plan) を呼ぶが、
             addPending は
                 if (!a.some(x => x.planId === plan.planId)) a.push(plan);
             と**同じ planId が既にあれば何もしない**ので、増やした回数が保存されない
             （書き戻されるのは localStorage から読み直した古い方）。
             1回目だけは保留に載っていないので保存され、2回目以降が落ちる。
       影響: 一過性の失敗（delete-failed / policy-unavailable / gate-unavailable）が続くと、
             同じ計画が起動のたびにゲートを叩き続け、終端状態へ移らない。
             ＝fix602 が防ぐと宣言した「永久に片づかない」がその経路で残っている。
       ★このテストを消したり緩めたりして緑にしないこと。直すのは実装側（addPending が
         既存 planId を**置き換える**ようにする）。修正は破壊的変更ではないが、
         保留の書き換えなので、おしんの承認を得てから入れる。
     ------------------------------------------------------------------------ */
  const w = mkEnv({ refuse: () => 'delete-failed' });
  const L = svc(w);
  await L.requestDelete('smA', { source: 'home' });      /* 1回目 */
  await L.resumePending();                                /* 2回目 */
  await L.resumePending();                                /* 3回目 → ここで上限のはず */
  const gateAfter3 = w.__gateCalls.length;
  await L.resumePending();                                /* 4回目 */
  ok('★★★4回目の resumePending では何も起きない（同じ計画を永久に叩き続けない）',
     L.blockedDeletes().length === 1 &&
     L.blockedDeletes()[0].blockedReason === 'blocked-delete-failed-max-attempts' &&
     L.pendingDeletes().length === 0 &&
     w.__gateCalls.length === gateAfter3,
     { attempts: L.pendingDeletes().map(p => p.attempts), blocked: L.blockedDeletes(),
       gateCallsAfter3: gateAfter3, gateCallsAfter4: w.__gateCalls.length });
}

console.log('\n== (6) ★★準備が整っていないだけ（policy-unavailable / gate-unavailable）も一過性 ==');
{
  const w = mkEnv({ refuse: () => 'policy-unavailable' });
  const L = svc(w);
  const r = await L.requestDelete('smA', {});
  ok('★1回目は終端にしない', r.outcome === 'policy-unavailable' && L.blockedDeletes().length === 0, r);
  ok('★人が読める理由（待っている、と言える）',
     L.humanReason('policy-unavailable') === '安全確認の準備ができるまで待っています');
  const seeded = JSON.parse(w.__store['v292Dfix587_pending']);
  seeded[0].attempts = 2;
  w.__store['v292Dfix587_pending'] = JSON.stringify(seeded);
  const w2 = reload(w, { refuse: () => 'policy-unavailable' });
  const r2 = await svc(w2).resumePending();
  ok('★★上限で終端（理由も policy 用の名前になる）',
     r2.blocked.length === 1 && r2.blocked[0].reason === 'blocked-policy-unavailable-max-attempts', r2);
  ok('★★人が読める理由（仕組みが動かない、と言える）',
     svc(w2).humanReason('blocked-policy-unavailable-max-attempts') === '安全確認の仕組みが動かないため保留しています');
}
{
  /* ゲート自体が落ちた場合は code が取れない。これも一過性として扱う。 */
  const w = mkEnv({ gateThrows: true });
  const L = svc(w);
  const r = await L.requestDelete('smA', {});
  ok('★★ゲートが落ちたら gate-unavailable として記録する',
     L.refusals().length === 1 && L.refusals()[0].code === 'gate-unavailable', L.refusals());
  ok('★★一過性として扱う（いきなり終端にしない）',
     r.outcome === 'policy-unavailable' && L.blockedDeletes().length === 0 &&
     L.pendingDeletes().length === 1, r);
  ok('★code 別カウンタも gate-unavailable で数える',
     L.stats().gateRefusedByCode['gate-unavailable'] === 1, L.stats());
  ok('★★この場合もキーは消えていない', w.__store['chr6_slot_smA'] === STORY);
}

console.log('\n== (7) ★★blocked と pending は別々に数えられる ==');
{
  /* smA は protected で終端、smB は push 失敗で保留。**同時に**成立させる。 */
  const w = mkEnv({ refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  await L.requestDelete('smA', { source: 'home' });
  w.__v292Dfix399x.push = () => Promise.reject(new Error('offline'));
  await L.requestDelete('smB', { source: 'home' });
  ok('★★終端1件・保留1件が同時に読める（混ざらない）',
     L.blockedDeletes().length === 1 && L.blockedDeletes()[0].slotId === 'smA' &&
     L.pendingDeletes().length === 1 && L.pendingDeletes()[0].slotId === 'smB',
     { blocked: L.blockedDeletes().map(x => x.slotId), pending: L.pendingDeletes().map(x => x.slotId) });
  const s = L.pendingSummary();
  ok('★★画面に出す1行が両方を別々に数えている',
     s !== null && s.pending === 1 && s.blocked === 1 && s.lines.length === 2, s);
  ok('★保留の行と停止の行が別の文になっている',
     s.lines[0] === '削除の後片づけが1件残っています' &&
     s.lines[1] === '削除の後片づけを停止しました（大切な控えとして保護されているため保留しています）', s.lines);
  ok('★★★1行に生の hash も専門用語も出ない（おしんが読む文）',
     s.lines.join('').indexOf('hash') < 0 && s.lines.join('').indexOf('stale') < 0 &&
     s.lines.join('').indexOf('protected') < 0 && s.lines.join('').indexOf('blocked') < 0 &&
     s.lines.join('').indexOf('H' + STORY.length) < 0, s.lines);
  ok('★★どちらも無ければ null を返す（「無い」と言える形）', svc(mkEnv()).pendingSummary() === null);
  ok('★知らない理由でも人向けの文になる（空文字や undefined を出さない）',
     L.humanReason('なにか未知の理由') === '確認が必要です' &&
     L.humanReason(undefined) === '確認が必要です');
}

console.log('\n== (8) ★★記録は ring（上限を超えても壊れない・古いものから消える） ==');
{
  /* 拒否理由は20件。既に20件ある端末へ、既知の人工1件を足す。 */
  const old = [];
  for (let i = 0; i < 20; i++) old.push({ at: i, slotId: 'sm' + i, key: 'k' + i, code: 'protected',
    expectedBytes: i, actualBytes: i, expectedHash: 'h' + i, actualHash: 'h' + i, planId: 'p' + i });
  const w = mkEnv({ seed: { 'v292Dfix587_refusals': JSON.stringify(old) },
                    refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  ok('★前提: 20件ある', L.refusals().length === 20);
  await L.requestDelete('smA', { source: 'home' });
  const f = L.refusals();
  ok('★★20件を超えない', f.length === 20, f.length);
  ok('★★いちばん古い1件が押し出されている', !f.some(x => x.planId === 'p0'), f.map(x => x.planId).slice(0, 3));
  ok('★★★新しい1件は必ず入っている（古いものを守って新しい理由を捨てない）',
     f[19].slotId === 'smA' && f[19].code === 'protected' && f[19].key === 'chr6_slot_smA', f[19]);
}
{
  /* 終端は10件。 */
  const old = [];
  for (let i = 0; i < 10; i++) old.push({ planId: 'old' + i, slotId: 'sm' + i, at: i,
    blockedReason: 'blocked-protected', attempts: 0, keys: [] });
  const w = mkEnv({ seed: { 'v292Dfix587_blocked': JSON.stringify(old) },
                    refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  ok('★前提: 10件ある', L.blockedDeletes().length === 10);
  await L.requestDelete('smA', { source: 'home' });
  const b = L.blockedDeletes();
  ok('★★10件を超えない', b.length === 10, b.length);
  ok('★★いちばん古い1件が押し出されている', !b.some(x => x.planId === 'old0'), b.map(x => x.planId).slice(0, 3));
  ok('★★★新しい1件は必ず入っている', b[9].slotId === 'smA' && b[9].blockedReason === 'blocked-protected', b[9]);
}
{
  /* 記録が壊れていても、読めないだけで落とさない・新しい記録は書ける */
  const w = mkEnv({ seed: { 'v292Dfix587_refusals': '{壊れたJSON', 'v292Dfix587_blocked': 'ぐちゃぐちゃ' },
                    refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  ok('★壊れた記録は空として読む（例外で止まらない）',
     L.refusals().length === 0 && L.blockedDeletes().length === 0);
  const r = await L.requestDelete('smA', { source: 'home' });
  ok('★★壊れていても新しい記録は書ける（無言で記録をやめない）',
     r.code === 'partial' && L.refusals().length === 1 && L.blockedDeletes().length === 1, r);
}

console.log('\n== (9) ★成功したときは何も残さない（余計な記録・余計な書込みをしない） ==');
{
  const w = mkEnv();
  const L = svc(w);
  const r = await L.requestDelete('smA', { source: 'home' });
  ok('★正常に消える', r.ok === true && r.code === 'deleted' && w.__store['chr6_slot_smA'] === undefined, r);
  ok('★★拒否も終端も0件のまま（成功を異常として記録しない）',
     L.refusals().length === 0 && L.blockedDeletes().length === 0 &&
     JSON.stringify(L.stats().gateRefusedByCode) === '{}', L.stats());
  ok('★★画面に出す行も無い', L.pendingSummary() === null);
  ok('★★記録用のキーを無駄に作らない',
     w.__store['v292Dfix587_refusals'] === undefined &&
     w.__store['v292Dfix587_blocked'] === undefined, Object.keys(w.__store));
}

console.log('\n== (10) 読む口は読むだけ（診断を見ただけで状態が変わらない） ==');
{
  const w = mkEnv({ refuse: req => req.key.indexOf('smA') >= 0 ? 'protected' : null });
  const L = svc(w);
  await L.requestDelete('smA', { source: 'home' });
  const snap = JSON.stringify(w.__store);
  L.refusals(); L.blockedDeletes(); L.pendingDeletes(); L.pendingSummary(); L.stats(); L.log();
  ok('★★診断を全部読んでも localStorage は1バイトも変わらない', JSON.stringify(w.__store) === snap);
  ok('★★返した配列を書き換えても内部は壊れない（外へ渡すのは写し）', (() => {
    const a = L.blockedDeletes(); a.push({ planId: 'にせもの' });
    return L.blockedDeletes().length === 1;
  })(), L.blockedDeletes());
}

console.log('\n== (11) 退行防止（fix602 で足した口が消えていない） ==');
{
  const L = svc(mkEnv());
  ok('★blockedDeletes / refusals / humanReason / pendingSummary が全部ある',
     ['blockedDeletes', 'refusals', 'humanReason', 'pendingSummary'].every(k => typeof L[k] === 'function'));
  ok('★永続化先のキー名を変えていない（既存端末の記録を読めなくしない）',
     /v292Dfix587_refusals/.test(SRC) && /v292Dfix587_blocked/.test(SRC) && /v292Dfix587_pending/.test(SRC));
  ok('★ring の上限を宣言している（20件 / 10件）',
     /REFUSAL_MAX = 20/.test(SRC) && /BLOCKED_MAX = 10/.test(SRC));
  ok('★★fix602 でも「自分では消さない」を守っている（削除の所有者を増やさない）',
     !/localStorage\.removeItem/.test(
       SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exitCode = 1;
})();
