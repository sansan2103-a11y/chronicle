#!/usr/bin/env node
/* test_fix655.cjs — fix655: 公開API契約検査(fail-closed)と rev-only 採用の実効
 *
 * ■背景(2026-08-01・A2ケース1で発見)
 *   fix523 が公開API(W.__v292Dfix523)に revSet を入れ忘れており、fix633 の rev 処理は
 *   `if (typeof f.revSet === 'function')` ガードで**黙って素通り**していた(無言の失敗)。
 *   → rev-only 採用は全端末で一度も動いたことがなく、iPhone の plan rev:4 が永遠に消えなかった。
 *
 * ■GPT裁定(2026-08-01)の条件をそのまま契約にする
 *   ①fix523 は fix633 が依存する公開APIを全て実際に公開している(固定名でなく fix633 の DEPS 宣言と突き合わせ)
 *   ②依存APIが1つでも欠けたら fail-closed: sweep 停止・ネットワーク0・一度だけ warn・永続counter
 *   ③Live で一部だけ動かない(黙殺ガードの禁止)
 *   ④rev-only 採用が実際に動き、読み戻しで検証され、次周期で収束する
 *   ⑤非収束(採用したのに再計画される)を観測値として数える
 *
 * ■方針: 実物の v292Dfix523 / v292Dfix633 を vm サンドボックスへロードして挙動で縛る。
 *   文字列 grep は「fix633 の DEPS 宣言の読取」と「黙殺パターンの不在」だけに限定。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC523 = fs.readFileSync(path.join(__dirname, 'v292Dfix523-icon-sync-versioned.js'), 'utf8');
const SRC633 = fs.readFileSync(path.join(__dirname, 'v292Dfix633-icon-sweep-full.js'), 'utf8');

/* ---------- localStorage モック(Object.keys/length/key(i) にも見せる) ---------- */
function makeLS(){
  const store = Object.create(null);
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    _dump(){ return Object.assign({}, store); }
  };
}

/* ---------- サンドボックス ---------- */
function makeSandbox(opts){
  opts = opts || {};
  const ls = opts.ls || makeLS();
  const warns = [], logs = [];
  const fetchCalls = [];
  const sandbox = {
    localStorage: ls,
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')), error: (...a) => warns.push(a.join(' ')) },
    setTimeout, setInterval, clearTimeout, clearInterval, Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise,
    fetch: function(url, init){
      fetchCalls.push({ url: String(url), init });
      if (opts.manifest){
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ manifest: opts.manifest() }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }
  };
  sandbox.window = sandbox;
  sandbox._warns = warns; sandbox._logs = logs; sandbox._fetchCalls = fetchCalls; sandbox._ls = ls;
  vm.createContext(sandbox);
  return sandbox;
}
function load(sb, src, name){ vm.runInContext(src, sb, { filename: name }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function sweepAsync(sb){ return new Promise(res => { sb.window.__v292Dfix633.sweep(p => res(p)); }); }

(async () => {

console.log('== (1) 契約: fix633 の DEPS 宣言と fix523 の公開APIの突き合わせ ==');
{
  const m = SRC633.match(/var DEPS = \[([^\]]+)\]/);
  ok('fix633 に依存API宣言(DEPS)がある', !!m);
  const deps = m ? m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
  ok('DEPS に revSet が含まれる(今回の真因)', deps.indexOf('revSet') >= 0, deps);
  const sb = makeSandbox();
  load(sb, SRC523, 'fix523');
  const f = sb.window.__v292Dfix523;
  ok('fix523 が __armed', !!(f && f.__armed));
  for (const d of deps){
    ok('fix523 公開APIに ' + d + ' が実在(function)', typeof f[d] === 'function', typeof f[d]);
  }
}

console.log('\n== (2) 実効: 実物 fix523 の revSet→revGet 往復(台帳へ実書込) ==');
{
  const sb = makeSandbox();
  load(sb, SRC523, 'fix523');
  const f = sb.window.__v292Dfix523;
  f.revSet('__t655probe', 7);
  ok('revGet が書いた値を返す', f.revGet('__t655probe') === 7);
  ok('台帳(v292Dfix523_rev)に永続化されている', (() => {
    try { return JSON.parse(sb._ls.getItem('v292Dfix523_rev'))['__t655probe'] === 7; } catch(e){ return false; }
  })());
  f.revSet('__t655probe', 0);   // 後始末(0 は revGet の既定値と同じ)
}

console.log('\n== (3) fail-closed: 依存APIが欠けたら sweep 停止・通信0・warn一度・永続counter ==');
{
  const sb = makeSandbox();
  // revSet を意図的に欠いた fix523 もどき(旧本番と同じ形)
  sb.window.__v292Dfix523 = {
    __armed: true, on: () => true,
    pullOne: () => {}, pushOne: () => {}, revGet: () => 0, hashFull: s => 'h' + String(s).length
    /* revSet なし */
  };
  sb._ls.setItem('v292ProxyPass', 'testpass');
  sb._ls.setItem('v292Dfix400_ns', 'ns1');
  sb._ls.setItem('v292Dfix633Live', '1');
  load(sb, SRC633, 'fix633');
  const F = sb.window.__v292Dfix633;
  const p1 = await sweepAsync(sb);
  ok('sweep は null を返して停止', p1 === null);
  ok('★★ネットワーク書込み0(manifest 取得すら行かない)', sb._fetchCalls.length === 0, sb._fetchCalls.length);
  ok('★warn がちょうど一度', sb._warns.filter(w => w.indexOf('dependency-unavailable') >= 0).length === 1, sb._warns);
  ok('★永続counter(v292Dfix655_depFail)が加算', sb._ls.getItem('v292Dfix655_depFail') === '1');
  const p2 = await sweepAsync(sb);
  ok('2回目も停止・通信0のまま', p2 === null && sb._fetchCalls.length === 0);
  ok('warn は増えない(一度だけ)', sb._warns.filter(w => w.indexOf('dependency-unavailable') >= 0).length === 1);
  ok('同一ロード内では counter も増えない', sb._ls.getItem('v292Dfix655_depFail') === '1');
  const st = F.status();
  ok('status().deps.unavailable=true', st.deps && st.deps.unavailable === true);
  ok('status().deps.missing に revSet', st.deps && st.deps.missing.indexOf('revSet') >= 0, st.deps && st.deps.missing);
  ok('status().deps.depFailCount=1', st.deps && st.deps.depFailCount === 1);
}

console.log('\n== (4) 緊急バイパス: v292Dfix655Off=1 なら従来挙動(検査なしで走る) ==');
{
  const sb = makeSandbox({ manifest: () => ({}) });
  sb.window.__v292Dfix523 = {
    __armed: true, on: () => true,
    pullOne: () => {}, pushOne: () => {}, revGet: () => 0, hashFull: s => 'h' + String(s).length
  };
  sb._ls.setItem('v292ProxyPass', 'testpass');
  sb._ls.setItem('v292Dfix400_ns', 'ns1');
  sb._ls.setItem('v292Dfix655Off', '1');
  load(sb, SRC633, 'fix633');
  await sweepAsync(sb);
  ok('バイパス時は manifest 取得まで進む(通信が起きる)', sb._fetchCalls.length >= 1, sb._fetchCalls.length);
  ok('status().deps.bypass=true', sb.window.__v292Dfix633.status().deps.bypass === true);
}

console.log('\n== (5) rev-only 採用の実効と収束(実物 fix523 + 実物 fix633・Live) ==');
{
  const sb = makeSandbox({ manifest: () => manifestNow });
  load(sb, SRC523, 'fix523');
  sb._ls.setItem('v292ProxyPass', 'testpass');
  sb._ls.setItem('v292Dfix400_ns', 'ns1');
  sb._ls.setItem('v292Dfix633Live', '1');
  // ローカル在庫: v292av2_k1 = 'data:x'(モックLSは length/key(i) で列挙可能)
  sb._ls.setItem('v292av2_k1', 'data:x');
  const H = sb.window.__v292Dfix523.hashFull('data:x');
  let manifestNow = { 'v292av2_k1': { rev: 5, hash: H } };   // same-content・rev だけ差
  load(sb, SRC633, 'fix633');
  const F = sb.window.__v292Dfix633;

  const p1 = await sweepAsync(sb);
  ok('初回 plan は rev:1 / pull:0 / push:0', !!p1 && p1.rev === 1 && p1.pull === 0 && p1.push === 0, p1);
  await sleep(250);   // batch の GAP_MS 待ち(rev 採用が走る)
  const st1 = F.status();
  ok('★★revAdopted=1(採用が実際に走り読み戻し一致)', st1.counters.revAdopted === 1, st1.counters);
  ok('revAdoptFailed=0', st1.counters.revAdoptFailed === 0);
  ok('台帳に k1=5 が入った', sb.window.__v292Dfix523.revGet('k1') === 5);

  const p2 = await sweepAsync(sb);
  ok('★★次周期 plan は 0/0/0(収束)', !!p2 && p2.rev === 0 && p2.pull === 0 && p2.push === 0, p2);
  ok('収束時 revPlanNonConvergent=0', F.status().counters.revPlanNonConvergent === 0);
  ok('rev-only で PULL/PUSH の通信は発生していない(manifest 取得のみ)',
     sb._fetchCalls.every(c => (c.init && String(c.init.body).indexOf('imgmanifest') >= 0)), sb._fetchCalls.length);

  // 非収束の観測: 採用済みの台帳を裏から巻き戻す(=旧世界の再現)→ 同じ sRev で rev が再計画される
  sb._ls.setItem('v292Dfix523_rev', JSON.stringify({}));
  const p3 = await sweepAsync(sb);
  ok('巻き戻すと rev が再計画される(検出の前提)', !!p3 && p3.rev === 1, p3);
  ok('★revPlanNonConvergent が加算(黙って再計画を繰り返さない)', F.status().counters.revPlanNonConvergent >= 1, F.status().counters);
}

console.log('\n== (6) 黙殺ガードの不在(ソース契約) ==');
{
  ok("★fix633 に旧黙殺パターン typeof f.revSet==='function' が残っていない",
     !/typeof f\.revSet === 'function'\) f\.revSet/.test(SRC633));
  ok('fix633 の rev 採用は読み戻し検証つき(revAdoptFailed を数える)', /revAdoptFailed/.test(SRC633));
  ok('fix523 の revSet 公開はコメントで fix655 と明示', /fix655/.test(SRC523));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
