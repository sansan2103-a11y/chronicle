/* 回帰テスト: v292Dfix552（現在地A/Bの実験用スイッチ）の**撤去**が完全であること
 *
 * 経緯:
 *   fix552 は `scene.loc` を送るときのキー名を `location` ↔ `openingSetting` で切り替える
 *   実験用スイッチだった（「現在地というキー名が開始地点への巻き戻りを起こすのでは」という仮説）。
 *   2026-07-26、実データで **差が無いと確認できたため fix561 で純粋撤去**した。
 *
 * ★このファイルは 2026-07-26 に全面的に書き換えた。
 *   撤去したのにテストが「スイッチが存在すること」を固定したままで、
 *   **実行すると必ず失敗する状態**（index.html を切り出した eval が SyntaxError）で放置されていた。
 *   撤去したものは「消えたこと」を固定する。仮説が否定された記録もここに残す。
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

/* index.html は先頭にリテラルNULバイトを含むので latin1 で読んでから utf8 へ直す */
const html = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');

console.log('\n== fix552 は完全に撤去されている ==');
{
  ok('★スイッチのキー名がどこにも残っていない', html.indexOf('v292Dfix552OpeningSetting') < 0);
  ok('★実験側のキー名 openingSetting が残っていない', html.indexOf('openingSetting') < 0);
  ok('★分岐変数 _ab が残っていない', !/\b_ab\b/.test(html));
}

console.log('\n== 従来動作（location キー）に戻っている ==');
{
  ok('★location: scene.loc が1つだけある',
     (html.match(/location: scene\.loc/g) || []).length === 1,
     (html.match(/location: scene\.loc/g) || []).length);
  ok('★objective / tone も1組だけ（分岐で二重化していない）',
     (html.match(/objective: scene\.obj/g) || []).length === 1,
     (html.match(/objective: scene\.obj/g) || []).length);
}

console.log('\n== 仮説が否定された記録（再実装を防ぐため） ==');
{
  /* 「locationというキー名が場所の巻き戻りを起こす」は 30ターンの自然プレイで巻き戻り0件、
     A/B比較でも差が無かった。同じ実験を再び作らないための記録。 */
  ok('★scene.loc は今も送られている（機能自体は消していない）', html.indexOf('scene.loc') > 0);
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
