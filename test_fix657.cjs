#!/usr/bin/env node
/* test_fix657.cjs — pull の read-back 検証と apply-blocked 隔離(GPT裁定テスト19〜22)
 *
 * ■背景(2026-08-01・GPT裁定)
 *   旧 pullOne は「server画像取得 → fix472等がローカル書込みを黙って阻止 → それでも revSet」だった。
 *   台帳だけserver版・実体は旧local になり、次周期に旧localを「新しい変更」として押し返す
 *   (=rev膨張ピンポンの片翼)。裁定: read-back一致前のrevSetは禁止。
 *   ブロックされたキーは隔離し、同周期の押し返しpushを止める。
 *
 * ■契約(裁定19〜22をそのまま縛る)
 *   19. pull書込み成功+read-back一致のときだけ revSet
 *   20. 書込みが実体に届かない(fix472等のブロック)なら revSet しない
 *   21. blockしたキーを同周期に push しない(pushOne抑止+fix633計画から除外)
 *   22. 書込みが「成功したように見えても」read-back不一致なら失敗扱い(done(false)・隔離)
 *   +: releaseBlocked で人手解除できる / 観測口(applyBlocked/counters657/applyBlockedSkips)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC523 = fs.readFileSync(path.join(__dirname, 'v292Dfix523-icon-sync-versioned.js'), 'utf8');
const SRC633 = fs.readFileSync(path.join(__dirname, 'v292Dfix633-icon-sweep-full.js'), 'utf8');

function makeLS(){
  const store = Object.create(null);
  const blocked = new Set();          // fix472相当: このキーへの「中身が変わる書込み」を黙って無視
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){
      if (blocked.has(k) && store[k] != null && store[k] !== String(v)) return;   // 黙殺(例外なし)=fix472と同じ
      store[k] = String(v);
    },
    removeItem(k){ delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    _block(k){ blocked.add(k); }, _unblock(k){ blocked.delete(k); }
  };
}
const IMG_SRV = 'data:image/png;base64,' + Buffer.from('SERVER-IMG-1').toString('base64');
const IMG_OLD = 'data:image/png;base64,' + Buffer.from('OLD-LOCAL-9').toString('base64');

function makeSandbox(){
  const ls = makeLS();
  const warns = [], puts = [];
  const sandbox = {
    localStorage: ls,
    console: { log: () => {}, warn: (...a) => warns.push(a.join(' ')), error: () => {} },
    setTimeout, setInterval, clearTimeout, clearInterval, Date, JSON, Math, Object, Array, String, Number, parseInt, isFinite, Promise, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: function(url, init){
      if (String(url).indexOf('/img?') >= 0){
        const bytes = Buffer.from('SERVER-IMG-1');
        return Promise.resolve({ ok: true, headers: { get: () => 'image/png' },
          arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) });
      }
      if (init && init.body){ try { const j = JSON.parse(init.body); if (j.op === 'putimg') puts.push(j.k); } catch(e){} }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, imageRev: 5, hash: 'x' }) });
    }
  };
  sandbox.window = sandbox;
  sandbox._ls = ls; sandbox._warns = warns; sandbox._puts = puts;
  ls.setItem('v292Dfix400_ns', 'ns1');               // pullOne は ns 必須(実機と同じ前提を敷く)
  ls.setItem('v292ProxyPass', 'testpass');
  vm.createContext(sandbox);
  vm.runInContext(SRC523, sandbox, { filename: 'fix523' });
  return sandbox;
}
const pullAsync = (sb, pk, rev) => new Promise(res => sb.window.__v292Dfix523.pullOne(pk, rev, res));
const pushAsync = (sb, pk) => new Promise(res => sb.window.__v292Dfix523.pushOne(pk, res));

(async () => {

console.log('== (19) pull書込み成功 + read-back一致 → revSet される ==');
{
  const sb = makeSandbox();
  sb._ls.setItem('v292av2_pk1', IMG_OLD);
  const ok1 = await pullAsync(sb, 'pk1', 7);
  const F = sb.window.__v292Dfix523;
  ok('pullOne が成功を返す', ok1 === true);
  ok('実体がserver版に置き換わっている', sb._ls.getItem('v292av2_pk1') === IMG_SRV);
  ok('★revSet が採用されている(revGet=7)', F.revGet('pk1') === 7);
  ok('counters657.readbackOk=1', F.counters657().readbackOk === 1, F.counters657());
  ok('隔離は空', F.counters657().blockedNow === 0);
}

console.log('\n== (20)(22) fix472ブロック(黙殺) → revSetしない・失敗扱い・隔離 ==');
{
  const sb = makeSandbox();
  sb._ls.setItem('v292av2_pk2', IMG_OLD);
  sb._ls._block('v292av2_pk2');                    // fix472相当: 中身が変わる書込みを黙って無視
  const ok2 = await pullAsync(sb, 'pk2', 9);
  const F = sb.window.__v292Dfix523;
  ok('★★done(false)=失敗扱い(旧実装はtrueだった)', ok2 === false);
  ok('実体は旧localのまま(ブロックが効いている前提確認)', sb._ls.getItem('v292av2_pk2') === IMG_OLD);
  ok('★★revSet を採っていない(revGet=0のまま)', F.revGet('pk2') === 0, F.revGet('pk2'));
  ok('★apply-blocked に隔離されている', F.isApplyBlocked('pk2') === true);
  ok('隔離記録に local/server 両hashがある', (() => { const b = F.applyBlocked()['pk2']; return b && b.why === 'readback-mismatch' && b.localHash && b.serverHash && b.localHash !== b.serverHash; })(), F.applyBlocked());
  ok('warnが出ている(無言にしない)', sb._warns.some(w => w.indexOf('隔離') >= 0), sb._warns.length);
  ok('counters657.applyBlocked=1', F.counters657().applyBlocked === 1);
}

console.log('\n== (21) blockしたキーを push しない・再pullもしない(凍結) ==');
{
  const sb = makeSandbox();
  sb._ls.setItem('v292av2_pk3', IMG_OLD);
  sb._ls._block('v292av2_pk3');
  await pullAsync(sb, 'pk3', 9);                       // → 隔離される
  const F = sb.window.__v292Dfix523;
  const p = await pushAsync(sb, 'pk3');
  ok('★★pushOne が抑止される(false)', p === false);
  ok('★putimg が1件も飛んでいない(押し返しゼロ)', sb._puts.length === 0, sb._puts);
  const p2 = await pullAsync(sb, 'pk3', 10);
  ok('隔離中は再pullも走らない(false即返し)', p2 === false);
  // fix633 の計画からも除外される

  vm.runInContext(SRC633, sb, { filename: 'fix633' });
  const F3 = sb.window.__v292Dfix633;
  const H = F.hashFull(IMG_SRV);
  const plan = F3.decide({ 'v292av2_pk3': { rev: 9, hash: H } });
  ok('★fix633 decide が隔離キーを計画に入れない', plan.filter(x => x.pk === 'pk3').length === 0, plan);
  ok('applyBlockedSkips が数えられている', F3.status().counters.applyBlockedSkips >= 1, F3.status().counters);
}

console.log('\n== (+) releaseBlocked で人手解除 → 通常動作に戻る ==');
{
  const sb = makeSandbox();
  sb._ls.setItem('v292av2_pk4', IMG_OLD);
  sb._ls._block('v292av2_pk4');
  await pullAsync(sb, 'pk4', 9);
  const F = sb.window.__v292Dfix523;
  ok('隔離されている', F.isApplyBlocked('pk4'));
  F.releaseBlocked('pk4');
  ok('解除できる', F.isApplyBlocked('pk4') === false);
  sb._ls._unblock('v292av2_pk4');                      // 人手確認でおしんが保護を外した想定
  const ok4 = await pullAsync(sb, 'pk4', 9);
  ok('解除+保護解除後は通常どおりpull成功+revSet', ok4 === true && F.revGet('pk4') === 9);
}

console.log('\n== (+) fix655契約との整合: 新DEPS(isApplyBlocked)を実物523が満たす ==');
{
  const m = SRC633.match(/var DEPS = \[([^\]]+)\]/);
  const deps = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  ok('fix633のDEPSに isApplyBlocked が入っている', deps.indexOf('isApplyBlocked') >= 0, deps);
  const sb = makeSandbox();
  const F = sb.window.__v292Dfix523;
  for (const d of deps) ok('実物fix523が ' + d + ' を公開', typeof F[d] === 'function');
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
