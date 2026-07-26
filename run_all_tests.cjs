#!/usr/bin/env node
/* run_all_tests.cjs — テスト母集団の正本（2026-07-26・fix576）
 *
 * ■なぜ作ったか
 *   同じテスト群を数えるのに、その場しのぎの `grep | tail` を書くたびに**違う数**が出ていた。
 *   実測: 「24ファイル962件」→「21ファイル854件」→ 実際は 24ファイル943件 / 25ファイル982件。
 *   ファイルは**1つも消えていなかった**（git --diff-filter=D で確認済み）。
 *   つまり縮んだのは母集団ではなく**私の数え方**だった。
 *   GPT裁定「安全機構を増やしている段階でテスト母集団が無言で縮むのは避ける」に応える。
 *
 * ■このスクリプトの約束
 *   ①テストファイルを列挙するのは**ここだけ**。手で数えない。
 *   ②サマリ形式は3種類あるので全部に対応する（下の PARSERS）。
 *   ③**サマリが読めなかったファイルはエラー扱い**にする。
 *     「読めなかったから0件として素通し」が、母集団が黙って縮む唯一の経路だから。
 *   ④配信成果物のhashも一緒に出す（テストが見ていたコードを後から特定できるようにする）。
 *
 * 使い方: node run_all_tests.cjs [--json]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const TESTS = fs.readdirSync(DIR)
  .filter(f => /^test_.*\.(cjs|mjs)$/.test(f))
  .sort();

/* 実際に使われている3形式。増えたらここに足す（推測で緩い正規表現にしない）。 */
const PARSERS = [
  { id: 'PASS n / FAIL n', re: /^PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)\s*$/m,        map: m => [+m[1], +m[2]] },
  { id: 'pass=n fail=n',   re: /^pass=(\d+)\s+fail=(\d+)\s*$/m,                 map: m => [+m[1], +m[2]] },
  { id: 'n/m PASS',        re: /^(\d+)\/(\d+)\s+PASS\s*$/m,                     map: m => [+m[1], +m[2] - +m[1]] },
  { id: 'n passed, m failed', re: /^(\d+)\s+passed,\s+(\d+)\s+failed\s*$/m,     map: m => [+m[1], +m[2]] },
  { id: '結果: pass=n fail=n', re: /結果:\s*pass=(\d+)\s+fail=(\d+)/,            map: m => [+m[1], +m[2]] },
  { id: 'E2E: pass=n fail=n',  re: /pass=(\d+)\s+fail=(\d+)/,                   map: m => [+m[1], +m[2]] }
];

function parse(out){
  for (const p of PARSERS){
    const m = out.match(p.re);
    if (m) return { pass: p.map(m)[0], fail: p.map(m)[1], format: p.id };
  }
  return null;
}

const rows = [];
let totalPass = 0, totalFail = 0, unreadable = 0, crashed = 0;

for (const f of TESTS){
  let out = '', rc = 0;
  try {
    out = execFileSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', timeout: 120000, cwd: DIR });
  } catch (e){
    rc = e.status == null ? -1 : e.status;
    out = String((e.stdout || '') + (e.stderr || ''));
  }
  const r = parse(out);
  if (!r){
    unreadable++;
    rows.push({ file: f, pass: null, fail: null, rc, format: null, note: 'サマリを読めなかった(母集団から漏れる)' });
    continue;
  }
  if (rc !== 0) crashed++;
  totalPass += r.pass; totalFail += r.fail;
  rows.push({ file: f, pass: r.pass, fail: r.fail, rc, format: r.format });
}

/* 配信成果物のhash: テストが見ていたコードを後から特定できるようにする */
function sha(f){
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex').slice(0, 16); }
  catch(e){ return null; }
}
const ARTIFACTS = ['index.html', 'version.txt', 'v292Dfix399-cloudsync.js',
                   'v292Dfix569-gc-shadow.js', 'v292Dfix490-slot-write-guard.js',
                   'v292Dfix562-backup-inventory.js'];
const hashes = {}; ARTIFACTS.forEach(a => { const h = sha(a); if (h) hashes[a] = h; });
let build = null;
try { build = fs.readFileSync(path.join(DIR, 'version.txt'), 'utf8').trim(); } catch(e){}

const summary = { build, files: TESTS.length, totalPass, totalFail, unreadable, crashed, hashes };

if (process.argv.indexOf('--json') >= 0){
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log('== テスト母集団 (build ' + build + ') ==');
  rows.forEach(r => {
    const st = r.pass == null ? '  ??  ' : (r.fail ? '  NG  ' : '  ok  ');
    console.log(st + r.file.padEnd(32) +
      (r.pass == null ? '(サマリ不明)' : ('pass=' + String(r.pass).padEnd(5) + 'fail=' + r.fail)) +
      (r.rc !== 0 ? '  [exit ' + r.rc + ']' : ''));
  });
  console.log('---------------------------------------------');
  console.log('ファイル数 ' + TESTS.length + ' / 合格 ' + totalPass + ' / 失敗 ' + totalFail +
              ' / サマリ不明 ' + unreadable + ' / 異常終了 ' + crashed);
  console.log('配信成果物 hash(sha256先頭16):');
  Object.keys(hashes).forEach(k => console.log('  ' + k.padEnd(34) + hashes[k]));
}

/* ★サマリ不明も異常終了も失敗と同じ扱いにする（無言で縮ませないため） */
process.exit((totalFail || unreadable || crashed) ? 1 : 0);
