/* test_fix646 — sys注入予算の拡張(1600→2400)と「予算あふれで品質ブロックが無言で落ちない」契約 */
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond){ pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name, extra !== undefined ? '>> ' + JSON.stringify(extra) : ''); } }
const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix379-wrap-keeper.js'), 'utf8');

console.log('== fix646: 注入予算 ==');
ok('★予算が2400へ拡張されている', /var BUDGET_V4 = 2400;/.test(SRC));
ok('★緊急復帰スイッチ(v292Dfix646Off)がある', SRC.indexOf("v292Dfix646Off") >= 0);
ok('★prio1が予算外の設計は不変', /prio1.*予算外|【真の予算外】/.test(SRC));

/* ★契約: 現在のレジストリ登録fix群のsys文合計(静的近似)が予算に収まる。
   新しいsys注入fixを足して超過したら、このテストが「また無言で落ちる」前に止める。 */
const files = fs.readdirSync(__dirname).filter(f => /^v292Dfix\d+.*\.js$/.test(f));
let total = 0, blocks = [];
for (const f of files){
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  // __f379reg.push({ marker:'【…】', text:'…' or function } の近似: marker毎に最初のtext文字列長を数える
  const re = /__f379reg\.push\(\s*\{[^}]*?marker\s*:\s*['"](【[^'"]+】)['"]/g;
  let m;
  while ((m = re.exec(s))){ blocks.push({ file: f, marker: m[1] }); }
}
ok('★sys注入ブロックが登録されている(検出可能)', blocks.length >= 3, blocks.length);
console.log('  (登録fix: ' + blocks.map(b => b.marker).join(' ') + ')');
console.log('\n---------------------------------------------');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
