/* 回帰テスト: v292Dfix552 — 現在地A/Bの実験用スイッチ（キー名だけを切り替える）
 * 背景: `scene.loc` は開始時の設定文が**永久固定**でモデルへ送られ続ける。
 *   キー名が `location`(現在地) なので「いまここにいる」と解釈され、開始地点へ引き戻される疑いがある。
 * ただし30ターンの自然プレイでは巻き戻り**0件**。よって**出荷前提ではなく実験**として扱う（GPT裁定）。
 * A/Bの差分を「キー名だけ」に固定するため、**同じビルドをスイッチで切り替える**。 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const html = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');

console.log('\n== fix552: スイッチの形 ==');
{
  ok('★既定は OFF = 従来どおり location', /_ab \? \{ openingSetting: scene\.loc/.test(html) && /: \{ location: scene\.loc/.test(html));
  ok('★ON のときだけ openingSetting', /localStorage\.getItem\('v292Dfix552OpeningSetting'\) === '1'/.test(html));
  ok('★差分はキー名だけ(objective / tone は両方同じ)',
     (html.match(/objective: scene\.obj, tone: scene\.tone/g) || []).length === 2);
  ok('★値は同じ scene.loc を送る(中身は変えない)',
     html.indexOf('openingSetting: scene.loc') > 0 && html.indexOf('location: scene.loc') > 0);
  ok('★スイッチの読み取りは例外に強い(try/catch)', /try \{ _ab = localStorage\.getItem\('v292Dfix552OpeningSetting'\)/.test(html));
}
{
  /* スイッチ本体を切り出して両方の分岐を実際に評価する */
  const i = html.indexOf('scene: (function(){');
  const j = html.indexOf('})(),', i) + 5;
  const src = html.slice(i, j).replace(/^scene: /, '');
  const build = (on) => {
    const scene = { loc: '離島の漁港、真夏の昼下がり', obj: '弟を探す', tone: '静かな緊張' };
    const localStorage = { getItem: k => (k === 'v292Dfix552OpeningSetting' && on) ? '1' : null };
    return eval('(' + src.replace(/\}\)\(\),$/, '})()') + ')');
  };
  const a = build(false), b = build(true);
  ok('★OFF: location キーで出る', Object.prototype.hasOwnProperty.call(a, 'location') && !a.openingSetting, a);
  ok('★ON: openingSetting キーで出る', Object.prototype.hasOwnProperty.call(b, 'openingSetting') && !b.location, b);
  ok('★値は同一', a.location === b.openingSetting, [a.location, b.openingSetting]);
  ok('★他の項目は完全一致', a.objective === b.objective && a.tone === b.tone, [a, b]);
  ok('★キーの数も同じ(項目が増減していない)', Object.keys(a).length === Object.keys(b).length, [Object.keys(a), Object.keys(b)]);
}

console.log('\n== fix552: 実験であって出荷判断ではないことを明示する ==');
{
  ok('★既定OFFなので、出荷しても本番の挙動は変わらない',
     html.indexOf("var _ab = false;") > 0);
  ok('★判定基準がコメントに書かれている(採用/保留/却下)',
     /Bが明確に改善・悪化なし → 採用/.test(html) && /差がない → 出荷しない/.test(html) && /却下/.test(html));
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
