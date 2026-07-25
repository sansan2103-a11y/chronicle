/* 回帰テスト: v292Dfix543 — 保存の失敗を「無言」にしない
 * 由来: 2026-07-25 実測。localStorage が 4.97MB/588鍵で**空き26KB**しかなく、
 *   物語は1ターン約2.9KBずつ増えるため、あと9ターンほどで保存が失敗する状態だった。
 *   index.html の `set(k,v){ try{ localStorage.setItem(...) }catch{} }` が
 *   QuotaExceededError を握りつぶすため、**ターンが無言で失われる**経路になっていた。
 * 方針: 挙動は変えない。**例外はそのまま投げ直し**、記録と警告だけ足す。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function mk(opts){
  opts = opts || {};
  const store = {};
  const quota = opts.quota == null ? Infinity : opts.quota;
  let used = 0;
  const nativeCalls = [];
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: function(k, v){
      nativeCalls.push(k);
      const add = String(k).length + String(v).length - (store[k] ? String(store[k]).length : 0);
      if (used + add > quota){ const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = String(v);
    },
    removeItem: function(k){ if (store[k] != null){ used -= String(k).length + String(store[k]).length; delete store[k]; } },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
  };
  if (opts.off) { store['v292Dfix543Off'] = '1'; used += 20; }
  const warns = [], toasts = [];
  const w = { localStorage: ls, document: { readyState: 'complete', addEventListener(){}, createElement: () => ({ style: {}, setAttribute(){}, appendChild(){}, remove(){} }), body: { appendChild(){} } },
    console: { log(){}, warn: (...a) => warns.push(a.join(' ')), error(){} },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
    showToast: (m, e) => toasts.push(String(m)) };
  w.window = w; w.__warns = warns; w.__toasts = toasts; w.__native = nativeCalls; w.__store = store;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'v292Dfix543-save-guard.js'), 'utf8'),
    vm.createContext(w), { filename: 'fix543' });
  return w;
}

console.log('\n== fix543: 成功時は完全に素通し(挙動不変) ==');
{
  const w = mk();
  w.localStorage.setItem('chr6', '{"turns":[]}');
  ok('★書けている', w.__store['chr6'] === '{"turns":[]}', w.__store['chr6']);
  ok('★成功時は何も記録しない', w.__v292Dfix543.stats().failures === 0, w.__v292Dfix543.stats());
  ok('★成功時は警告もトーストも出さない', w.__warns.filter(x => /保存に失敗/.test(x)).length === 0 && w.__toasts.length === 0,
     [w.__warns.length, w.__toasts]);
}

console.log('\n== fix543: 失敗時は記録するが、例外はそのまま投げ直す ==');
{
  const w = mk({ quota: 200 });
  let threw = null;
  try { w.localStorage.setItem('chr6_slot_abc', new Array(500).join('x')); } catch (e) { threw = e; }
  ok('★例外を握りつぶさない(呼び出し側の挙動が変わらない)', threw && threw.name === 'QuotaExceededError', threw && threw.name);
  const st = w.__v292Dfix543.stats();
  ok('★失敗として数える', st.failures === 1, st);
  ok('★物語の保存失敗として数える', st.storyFailures === 1, st);
  ok('★警告が出る(無言にしない)', w.__warns.some(x => /保存に失敗/.test(x)), w.__warns);
  ok('★物語なら画面にも出す', w.__toasts.some(x => /保存できませんでした/.test(x)), w.__toasts);
}
{
  const w = mk({ quota: 200 });
  for (let i = 0; i < 5; i++){ try { w.localStorage.setItem('chr6', new Array(500).join('x')); } catch (e) {} }
  ok('★同じ鍵の警告は1回だけ(ログを溢れさせない)',
     w.__warns.filter(x => /保存に失敗/.test(x)).length === 1, w.__warns.length);
  ok('★トーストも1回だけ', w.__toasts.filter(x => /保存できませんでした/.test(x)).length === 1, w.__toasts.length);
  ok('回数は毎回数える', w.__v292Dfix543.stats().failures === 5, w.__v292Dfix543.stats());
}
{
  const w = mk({ quota: 200 });
  try { w.localStorage.setItem('v292Dfix469_pshadow', new Array(500).join('x')); } catch (e) {}
  const st = w.__v292Dfix543.stats();
  ok('物語以外の鍵は storyFailures に数えない', st.failures === 1 && st.storyFailures === 0, st);
  ok('★物語以外ならトーストは出さない(過剰通知にしない)', w.__toasts.length === 0, w.__toasts);
}

console.log('\n== fix543: 記録の中身(本文やセーブ内容を残さない) ==');
{
  const w = mk({ quota: 200 });
  try { w.localStorage.setItem('chr6', '{"turns":["秘密の本文' + new Array(400).join('x') + '"]}'); } catch (e) {}
  const r = w.__v292Dfix543.recent()[0];
  const ALLOWED = ['key', 'bytes', 'errorName', 'keys', 'ts'];
  ok('★許可した項目しか残さない', r && Object.keys(r).every(k => ALLOWED.indexOf(k) >= 0), r && Object.keys(r));
  ok('★本文は残さない', JSON.stringify(r).indexOf('秘密の本文') < 0, r);
  ok('大きさとエラー名は残る', r && r.bytes > 0 && r.errorName === 'QuotaExceededError', r);
}
{
  const w = mk({ quota: 200 });
  for (let i = 0; i < 30; i++){ try { w.localStorage.setItem('chr6_slot_' + i, new Array(500).join('x')); } catch (e) {} }
  ok('★記録は20件で頭打ち', w.__v292Dfix543.recent().length === 20, w.__v292Dfix543.recent().length);
}

console.log('\n== fix543: OFFで退行できる ==');
{
  const w = mk({ quota: 200, off: true });
  let threw = null;
  try { w.localStorage.setItem('chr6', new Array(500).join('x')); } catch (e) { threw = e; }
  ok('★OFFでも例外はそのまま', threw && threw.name === 'QuotaExceededError');
  ok('★OFFなら記録しない', w.__v292Dfix543.stats().failures === 0, w.__v292Dfix543.stats());
}

console.log('\n== fix543: 他fixのラップを壊さない(fix419cの教訓) ==');
{
  const w = mk();
  /* fix490 相当のフラグを持つラッパが既にいる状況を作る */
  const before = w.localStorage.setItem;
  const outer = function(k, v){ return before.apply(w.localStorage, arguments); };
  outer.__f490 = true;
  w.localStorage.setItem = outer;
  /* fix543 の再ラップ(setInterval 相当)を手で回す */
  vm.runInContext('', vm.createContext(w));
  ok('★own props を継承する設計になっている',
     fs.readFileSync(path.join(__dirname, 'v292Dfix543-save-guard.js'), 'utf8').indexOf('hasOwnProperty.call(prev, p)') > 0);
  ok('★二重ラップを防ぐフラグがある',
     fs.readFileSync(path.join(__dirname, 'v292Dfix543-save-guard.js'), 'utf8').indexOf('prev.__f543') > 0);
}

console.log('\n== fix543b: 空き測定のプローブを自分で数えない ==');
{
  const w = mk({ quota: 100000 });
  w.__v292Dfix543.headroom(true);
  const st = w.__v292Dfix543.stats();
  ok('★プローブの失敗を保存失敗として数えない', st.failures === 0, st);
  ok('★プローブが記録を埋めない', w.__v292Dfix543.recent().length === 0, w.__v292Dfix543.recent().length);
  ok('★プローブでトーストを出さない', w.__toasts.length === 0, w.__toasts);
}

console.log('\n== fix543: 空き容量の推定 ==');
{
  const w = mk({ quota: 100000 });
  const h = w.__v292Dfix543.headroom(true);
  ok('★空きを見積もれる', h > 50000 && h <= 100000, h);
  ok('★推定のために書いた分は残さない', w.__store['__v543hp'] === undefined, Object.keys(w.__store));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
