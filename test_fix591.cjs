/* 回帰テスト: v292Dfix591 — 取り込み(pull)で墓標を消さない
 *
 * ★なぜ必要か（2026-07-27 の実機で実際に起きた事故）
 *   使い捨て物語#2 の墓標を立てた → クラウドへの push が fork で失敗した →
 *   その後の取り込みで **クラウド側の（墓標が無い）meta がローカルへ書き戻され**、
 *   墓標が消えて **削除した物語が live として一覧に戻った**。
 *   （#1 は墓標の push に成功していたのでクラウドにも墓標があり、無事だった）
 *
 *   fix587 の pull barrier(T2) は「墓標が立ったスロットの**キー**を書き戻さない」もので、
 *   `chr6_slots_meta` 自体は global キーとして素通りしていた。
 *   fix579 に `mergeMeta`（対称・墓標優先）を作ってあったのに、**pull 側で使われていなかった**。
 *   ＝fix588 と同じ「作ったが配線していない」型。
 *
 * 固定する契約
 *   M1 取り込みで meta を丸ごと上書きしない。mergeMeta を通す
 *   M2 mergeMeta が使えないときは **meta を上書きしない**（墓標を消さない側へ倒す）
 *   M3 アプリ側(fix399 applySave)と ホーム側(home.html pull) の**両方**に関門がある
 *   M4 墓標のないローカル meta は従来どおり更新される（退行していない）
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC399 = read('v292Dfix399-cloudsync.js');
const HOME = read('home.html');

/* fix579 を本物で動かす（mergeMeta の挙動はここで確認済み＝test_fix579） */
function loadTomb(){
  const w = { window: null, JSON, Object, Array, String };
  w.window = w;
  vm.runInContext(SRC579, vm.createContext(w), { filename: 'v292Dfix579-tombstone-schema.js' });
  return w.__v292Dfix579;
}

console.log('\n== (1) ★★事故の再現: 墓標のあるローカル meta を、墓標の無いリモート meta で上書きしない ==');
{
  const T = loadTomb();
  const local = [
    { id:'smAlive', name:'生きている物語' },
    { id:'smDead', deleted:true, deleteOpId:'del_smDead_1', lifecycleVersion:1 }   /* pushに失敗した墓標 */
  ];
  const remote = [
    { id:'smAlive', name:'生きている物語' },
    { id:'smDead', name:'新しい物語' }        /* クラウドはまだ live のまま */
  ];
  const merged = T.mergeMeta(local, remote);
  const e = merged.filter(x => x && x.id === 'smDead')[0];
  ok('★★墓標が生き残る（削除した物語が live に戻らない）', !!e && e.deleted === true, e);
  ok('★deleteOpId も保たれる', !!e && e.deleteOpId === 'del_smDead_1');
  ok('生きている物語は消えない', merged.some(x => x && x.id === 'smAlive'));
  /* 順序を入れ替えても同じ（対称） */
  const merged2 = T.mergeMeta(remote, local);
  const e2 = merged2.filter(x => x && x.id === 'smDead')[0];
  ok('★★順序を入れ替えても同じ結果（PC視点とiPhone視点で食い違わない）', !!e2 && e2.deleted === true);
}

console.log('\n== (2) ★アプリ側(fix399 applySave)に関門がある ==');
{
  const i = SRC399.indexOf('function applySave');
  const j = SRC399.indexOf('return idbWriteAll');
  const body = SRC399.slice(i, j);
  ok('★★meta を特別扱いしている', /chr6_slots_meta/.test(body), body.length);
  ok('★★mergeMeta を通している', /mergeMeta\(/.test(body));
  ok('★★マージできないのに墓標があれば上書きしない',
     /delete incoming\['chr6_slots_meta'\]/.test(body));
  ok('★barrier(filterIncoming) も従来どおり残っている', /filterIncoming\(/.test(body));
  ok('★書き戻しは merge の**後**に行う',
     body.indexOf('mergeMeta(') < body.indexOf('Object.keys(incoming).forEach'));
}

console.log('\n== (3) ★ホーム側(home.html pull)にも同じ関門がある ==');
{
  const i = HOME.indexOf("call({op:'get'}");
  const j = HOME.indexOf("s('v292Dfix402_baseRev'");
  const body = HOME.slice(i, j);
  ok('★★meta を特別扱いしている', /k==='chr6_slots_meta'/.test(body));
  ok('★★mergeMeta を通している', /mergeMeta\(/.test(body));
  ok('★★マージできないときは continue（上書きしない）', /if\(metaGuarded\) continue;/.test(body));
  ok('★物語本体の local-ahead 保護は残っている', /lt > rt/.test(body) && /skipped\.push/.test(body));
  ok('★home.html に fix579 が積んである（mergeMetaが使える）',
     HOME.indexOf('v292Dfix579-tombstone-schema.js') > 0);
}

console.log('\n== (4) ★実際に取り込みロジックを動かす（ホーム側の判定式を抜き出して検証） ==');
{
  const T = loadTomb();
  /* home.html の該当ロジックと同じ手順を再現する */
  function applyLikeHome(localStore, remoteLs, tombLib){
    let mergedMeta = null, metaGuarded = false, wrote = 0;
    if (Object.prototype.hasOwnProperty.call(remoteLs, 'chr6_slots_meta')){
      const lm = JSON.parse(localStore['chr6_slots_meta'] || 'null');
      const rm = JSON.parse(remoteLs['chr6_slots_meta'] || 'null');
      if (tombLib && Array.isArray(lm) && Array.isArray(rm)){
        const mg = tombLib.mergeMeta(lm, rm);
        if (Array.isArray(mg)) mergedMeta = JSON.stringify(mg);
      }
      if (mergedMeta == null) metaGuarded = true;
    }
    for (const k in remoteLs){
      if (k === 'chr6_slots_meta'){
        if (metaGuarded) continue;
        if (localStore[k] !== mergedMeta){ localStore[k] = mergedMeta; wrote++; }
        continue;
      }
      if (localStore[k] !== remoteLs[k]){ localStore[k] = remoteLs[k]; wrote++; }
    }
    return { wrote, metaGuarded };
  }

  {
    const store = { 'chr6_slots_meta': JSON.stringify([{ id:'smDead', deleted:true, deleteOpId:'d1', lifecycleVersion:1 }]) };
    const remote = { 'chr6_slots_meta': JSON.stringify([{ id:'smDead', name:'新しい物語' }]) };
    applyLikeHome(store, remote, T);
    const after = JSON.parse(store['chr6_slots_meta']);
    ok('★★取り込み後も墓標が残る', after[0].deleted === true, after);
  }
  {
    /* fix579 が居ない（＝マージできない）環境 */
    const store = { 'chr6_slots_meta': JSON.stringify([{ id:'smDead', deleted:true, deleteOpId:'d1', lifecycleVersion:1 }]) };
    const remote = { 'chr6_slots_meta': JSON.stringify([{ id:'smDead', name:'新しい物語' }]) };
    const r = applyLikeHome(store, remote, null);
    ok('★★マージできないときは meta を触らない', r.metaGuarded === true && JSON.parse(store['chr6_slots_meta'])[0].deleted === true);
  }
  {
    /* 墓標が無い普通の取り込みは従来どおり更新される（退行していない） */
    const store = { 'chr6_slots_meta': JSON.stringify([{ id:'smA', name:'古い名前' }]) };
    const remote = { 'chr6_slots_meta': JSON.stringify([{ id:'smA', name:'新しい名前' }, { id:'smB', name:'別端末で作った物語' }]) };
    applyLikeHome(store, remote, T);
    const after = JSON.parse(store['chr6_slots_meta']);
    ok('★別端末で作った物語が取り込まれる', after.some(e => e.id === 'smB'), after);
    ok('★既存の物語も消えない', after.some(e => e.id === 'smA'));
  }
}

console.log('\n== (5) 出荷の体裁 ==');
{
  const idx = read('index.html');
  const built = (idx.match(/var BUILT = '([^']+)'/) || [])[1] || '';
  ok('★BUILT と version.txt が同値', built === read('version.txt').trim(), { built });
  ok('★BUILT が fix591 以降', /fix(59[1-9]|[6-9]\d\d)/.test(built), built);
  for (const f of ['v292Dfix399-cloudsync.js']){
    const cb = (idx.match(new RegExp(f.replace(/\./g, '\\.') + '\\?cb=v292Dfix(\\d+)')) || [])[1];
    ok('★' + f + ' の cb が fix591 以降', !!cb && Number(cb) >= 591, cb);
  }
  const cbHome = (HOME.match(/v292Dfix579-tombstone-schema\.js\?cb=v292Dfix(\d+)/) || [])[1];
  ok('★home.html 側 fix579 の cb がある', !!cbHome, cbHome);
}

/* ---- fix592: ホームにも古いHTMLキャッシュからの脱出を入れた ---- */
{
  console.log('\n== (6) ★★fix592: home.html の古いキャッシュから抜ける ==');
  const home = read('home.html');
  ok('★★version.txt を no-store で見ている', /fetch\('version\.txt\?_='[\s\S]{0,80}cache:\s*'no-store'/.test(home));
  ok('★BUILT と食い違えば置換リロードする', /location\.replace\([\s\S]{0,80}vr=1&v=/.test(home));
  ok('★★ループ防止がある（?vr=1 で二度目は何もしない）', /\[\?&\]vr=1/.test(home));
  ok('★HOME_BUILT が version.txt と同値', (() => {
    const m = home.match(/HOME_BUILT = '([^']+)'/);
    return !!m && m[1] === read('version.txt').trim();
  })(), (home.match(/HOME_BUILT = '([^']+)'/) || [])[1]);
  ok('★index.html 側の同じ仕組み(fix242)は残っている', read('index.html').indexOf('vr=1&v=') > 0);
}

console.log('\n---------------------------------------------');
console.log('test_fix591/592: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
