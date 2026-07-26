/* 回帰テスト: v24(fix586) Worker側の最終防御
 *   「墓標(tombstone)を持つレコードは、baseRevなしのputで上書きさせない」
 *
 * ★なぜ必要か
 *   Worker の fork 判定は `hasBase`（baseRevが付いている）ときしか働かない。
 *   古いクライアント（キャッシュされた旧JS）は baseRev を送らないので判定を素通りし、
 *   無条件上書きの経路へ入る。その1回で「削除した」事実がサーバから消え、全端末で物語が復活する。
 *
 * ★このテストは Worker のソースから blobHasTombstone を取り出して直接叩く。
 *   Cloudflare 環境が無くても、判定ロジックだけは offline で固定できる。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
/* ★配布物はリポジトリ直下に置く（GitHub Web の Upload はルートへ入るため）。
   worker/ 配下にも置いた時期があるので、両方を見る。
   ★2026-07-26: ここを片方だけにしていたため、出荷後にテストが「サマリ不明」で落ちた。
   run_all_tests.cjs がそれを**失敗として扱う**設計なので気づけた。 */
const CANDIDATES = ['chronicle-proxy-v24_tombstone.js', 'worker/chronicle-proxy-v24_tombstone.js'];
const SRC_PATH = CANDIDATES.map(f => path.join(__dirname, f)).find(p => fs.existsSync(p));
if (!SRC_PATH){ console.log('  FAIL  Worker配布物が見つからない >> ' + CANDIDATES.join(' / '));
                console.log('PASS 0 / FAIL 1'); process.exit(1); }
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

console.log('\n== (1) ソース: 差分が意図どおり ==');
{
  ok('★blobHasTombstone が定義されている', /function blobHasTombstone\(blob\)/.test(SRC));
  ok('★★★二重エンコードを踏まえた検索になっている（引用符付きで探さない）',
     /s\.indexOf\('deleted'\)/.test(SRC) && !/s\.indexOf\('\deleted'\)/.test(SRC));
  ok('★★baseRevなし かつ 墓標ありのときだけ fork へ回す',
     /if \(op === 'put' && !hasBase && cur && blobHasTombstone\(cur\.blob\)\)/.test(SRC));
  ok('★拒否ではなく fork（データを消さない方針を守る）',
     /!hasBase && cur && blobHasTombstone[\s\S]{0,200}saveIncomingAsFork/.test(SRC));
  ok('★判定失敗は fail-open（通常のpushを止めない）',
     /catch \(e\) \{ return false; \}/.test(SRC));
  /* 既存の fork 判定を壊していないこと */
  ok('★★既存の baseRev 不一致 fork はそのまま残っている',
     /if \(op === 'put' && hasBase && cur && baseRev !== curRev\)/.test(SRC));
}

/* blobHasTombstone を取り出して評価する */
const i = SRC.indexOf('function blobHasTombstone(blob) {');
const j = SRC.indexOf('\n}\n', i) + 3;
const ctx = { JSON, String, Array };
vm.createContext(ctx);
vm.runInContext(SRC.slice(i, j) + '; this.f = blobHasTombstone;', ctx, { filename: 'worker' });
const f = ctx.f;

console.log('\n== (2) 墓標を正しく見つける ==');
{
  const withTomb = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([
    { id: 'smA', name: '生きてる' },
    { id: 'smB', deleted: true, deleteOpId: 'del_1' }
  ]) } });
  ok('★★墓標ありを true', f(withTomb) === true);
}
{
  const noTomb = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([
    { id: 'smA', name: '生きてる' }, { id: 'smB', name: '生きてる2' }
  ]) } });
  ok('★墓標なしを false', f(noTomb) === false);
}
{
  /* deleted:false は墓標ではない */
  const restored = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([
    { id: 'smB', deleted: false }
  ]) } });
  ok('★deleted:false は墓標ではない', f(restored) === false);
}
{
  /* id が無いものは墓標として扱わない */
  const noId = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([{ deleted: true }]) } });
  ok('★id が無ければ墓標にしない', f(noId) === false);
}

console.log('\n== (3) ★壊れた入力でも通常のpushを止めない(fail-open) ==');
{
  ok('null → false', f(null) === false);
  ok('空文字 → false', f('') === false);
  ok('JSONでない → false', f('not json at all') === false);
  ok('★deletedを含むがJSONでない → false', f('{"deleted": broken') === false);
  ok('ls が無い → false', f(JSON.stringify({ a: 1 })) === false);
  ok('meta が配列でない → false',
     f(JSON.stringify({ ls: { 'chr6_slots_meta': '{"not":"array"}' } })) === false);
  ok('meta が壊れたJSON → false',
     f(JSON.stringify({ ls: { 'chr6_slots_meta': '[{broken' } })) === false);
}

console.log('\n== (4) 速い経路: deleted を含まないなら JSON.parse しない ==');
{
  /* 巨大なblobでも、"deleted" が無ければ即 false になる（体感できる差になるか確認） */
  const big = JSON.stringify({ ls: { 'chr6_slots_meta': JSON.stringify([{ id: 'a' }]),
                                     'chr6': 'x'.repeat(500000) } });
  const t0 = Date.now();
  for (let k = 0; k < 50; k++) f(big);
  const dt = Date.now() - t0;
  ok('★deletedなしの大きなblobを50回判定しても十分速い(<300ms)', dt < 300, dt + 'ms');
  ok('  結果は false', f(big) === false);
}

console.log('\n== (5) 実際に起きる形（fix579のtombstone）を通す ==');
{
  const tomb = { id: 'smrg85jwsn6', title: '湾の鵬野学園', deleted: true,
                 deletedAt: 1785070000000, deleteOpId: 'del_smrg85jwsn6_x',
                 recoverySnapshotId: 'snap_x', lifecycleVersion: 1 };
  const blob = JSON.stringify({ activeSlot: 'smrg85jwsn6',
    ls: { 'chr6_slots_meta': JSON.stringify([{ id: 'smA' }, tomb]), 'chr6': '{"turns":[]}' } });
  ok('★★fix579が作る形の墓標を検出できる', f(blob) === true);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
