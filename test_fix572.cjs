/* test_fix572.cjs — 「空き容量の測定プローブが、緊急GCを誤発動させない」ことの回帰テスト
 *
 * ■なぜ必要か（2026-07-26 実機で発覚）
 *   fix543 は空き容量を**二分探索で測る**ため、`__v543hp` を上限に当たるまで書いて**わざと失敗させる**。
 *   fix264b（v292Dfix228）の quota 自己回復はそれを**本物の保存失敗**として扱い、
 *   `shrinkOnce()` を最大8回まわして **`__gen_` 世代を間引き → `__bak*` を全消し** していた。
 *   実測: おしんの実機で `__gen_` が **0件**（事故復元の主力が食い尽くされていた）。
 *   さらに「保存領域が満杯」トーストまで出るので、**空きが2MBあっても満杯に見えていた**。
 *
 * ■固定する契約
 *   ①`__v543*` の書込が失敗しても、緊急GCを起こさない（例外はそのまま投げ直す）
 *   ②`__gen_` 世代と `__bak*` が1件も減らない
 *   ③本物の物語キーが失敗したときは、従来どおり緊急GCが働く（機能を殺していない）
 *   ④`__gen_` 自身と `chr6_bk_*` の失敗では緊急GCを起こさない（fix495 C3 の約束を維持）
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

function makeEnv(cap){
  const store = {};
  let used = 0;
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem(k, v){
      v = String(v);
      const add = k.length + v.length - (store[k] ? store[k].length : 0);
      if (used + add > cap){ const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      used += add; store[k] = v;
    },
    removeItem(k){ if (store[k] != null){ used -= k.length + store[k].length; delete store[k]; } },
    key: i => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]
  };
  Object.defineProperty(ls, 'length', { get(){ return Object.keys(store).length; } });
  /* 事故復元の主力: 世代バックアップと残骸を仕込む */
  ls.setItem('__gen_chr6_slot_smA', JSON.stringify([{ t: 1, turns: 5, data: 'a'.repeat(5000) },
                                                    { t: 2, turns: 6, data: 'b'.repeat(5000) }]));
  ls.setItem('__bakOld', 'c'.repeat(100));
  const quiet = { log(){}, warn(){}, error(){} };
  const el = { remove(){}, style: {}, setAttribute(){}, appendChild(){}, addEventListener(){} };
  const doc = { readyState: 'complete', addEventListener(){}, getElementById: () => null,
                createElement: () => Object.assign({}, el), body: el, documentElement: el };
  const win = { localStorage: ls, document: doc, console: quiet, setTimeout: () => 0, setInterval: () => 0, addEventListener(){} };
  win.window = win;
  new Function('window','document','localStorage','console','setTimeout','setInterval',
    fs.readFileSync(path.join(__dirname, 'v292Dfix228-slot-generations.js'), 'utf8'))(
      win, doc, ls, quiet, () => 0, () => 0);
  return { ls, store, win, gen: () => { try { return JSON.parse(ls.getItem('__gen_chr6_slot_smA') || '[]').length; } catch(e){ return -1; } },
           bak: () => Object.keys(store).filter(k => k.indexOf('__bak') === 0).length };
}

console.log('\n== 1. 前提: quota自己回復が armed ==');
{
  const e = makeEnv(100000);
  ok('setItem がラップされている', e.win.__v292QuotaGuard === 1);
  ok('世代が2件ある', e.gen() === 2, e.gen());
  ok('残骸が1件ある', e.bak() === 1, e.bak());
}

console.log('\n== 2. ★測定プローブ(__v543hp)の失敗では緊急GCを起こさない ==');
{
  const e = makeEnv(100000);
  const genBefore = e.gen(), bakBefore = e.bak();
  let threw = false;
  /* 上限を超える大きさをプローブとして書く＝fix543 の二分探索が必ずやること */
  try { e.ls.setItem('__v543hp', 'x'.repeat(200000)); } catch(err){ threw = true; }
  ok('★例外はそのまま呼び出し元へ返る（fix543が自分で測れる）', threw);
  ok('★世代が1件も減っていない', e.gen() === genBefore, [genBefore, e.gen()]);
  ok('★残骸が1件も減っていない', e.bak() === bakBefore, [bakBefore, e.bak()]);
  ok('プローブ自身も残っていない', e.ls.getItem('__v543hp') === null);
}

console.log('\n== 3. ★何度測っても削られない（二分探索は毎回20回以上失敗する） ==');
{
  const e = makeEnv(100000);
  const genBefore = e.gen(), bakBefore = e.bak();
  for (let i = 0; i < 25; i++){ try { e.ls.setItem('__v543hp', 'x'.repeat(200000)); } catch(err){} }
  ok('★25回測っても世代はそのまま', e.gen() === genBefore, [genBefore, e.gen()]);
  ok('★25回測っても残骸はそのまま', e.bak() === bakBefore, [bakBefore, e.bak()]);
}

console.log('\n== 4. 本物の物語キーでは従来どおり緊急GCが働く（機能を殺していない） ==');
{
  /* 世代を1つ間引かないと入らない大きさを狙って書く */
  const e = makeEnv(20000);
  const genBefore = e.gen();
  let saved = false;
  try { e.ls.setItem('chr6_slot_smB', 'y'.repeat(13000)); saved = true; } catch(err){}
  ok('★世代を間引いて保存に成功した', saved === true, { saved, gen: e.gen() });
  ok('★世代が減っている（緊急GCが確かに動いた）', e.gen() < genBefore, [genBefore, e.gen()]);
}

console.log('\n== 5. fix495(C3)の約束は維持（__gen_ と chr6_bk_ 自身では起こさない） ==');
{
  const e = makeEnv(100000);
  const genBefore = e.gen(), bakBefore = e.bak();
  let t1 = false, t2 = false;
  try { e.ls.setItem('__gen_chr6_slot_smZ', 'z'.repeat(200000)); } catch(err){ t1 = true; }
  try { e.ls.setItem('chr6_bk_guard_smA_1', 'z'.repeat(200000)); } catch(err){ t2 = true; }
  ok('__gen_ の失敗はそのまま投げ直す', t1);
  ok('chr6_bk_ の失敗はそのまま投げ直す', t2);
  ok('世代も残骸も減っていない', e.gen() === genBefore && e.bak() === bakBefore, [e.gen(), e.bak()]);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
