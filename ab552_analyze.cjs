/* ab552_analyze.cjs — 現在地A/B の一次集計(機械判定)
 *
 * ★実測でわかったこと(2026-07-25 p1A):
 *   本文は固有名を毎回は書かない。しかも「白坑道地下」ではなく「白坑道」と書く。
 *   → 完全一致の固有名カウントでは信号がほぼ取れない(p1Aは9ターン中1ターンしか当たらなかった)。
 *   よって (1) 固有名は**基本形**で数え、(2) 名前が出ないターンは**場所の特徴語**で推定する。
 *   これは一次スクリーニングであり、最終判定(0/1/2)は本文を読んで付ける。
 *
 * 使い方: node ab552_analyze.cjs ab552_logs.json
 */
'use strict';
const fs = require('fs');

const PLACES = [
  { key: '青鐘港',   base: ['青鐘港'],   feat: ['港','桟橋','岸壁','漁船','埠頭','潮の匂','海','カモメ','船'] },
  { key: '赤錆館',   base: ['赤錆館'],   feat: ['廊下','踊り場','階段','二階','扉が並','蝶番'] },
  { key: '白坑道',   base: ['白坑道'],   feat: ['坑道','坑内','地下','岩','トンネル','梯子','支柱','рельс','レール','闇'] },
  { key: '黒松広場', base: ['黒松広場'], feat: ['広場','松','ベンチ','石畳の広','噴水'] },
  { key: '月影診療所', base: ['月影診療所','診療所'], feat: ['診療所','待合','カルテ','消毒','ベッド','薬棚','処置'] }
];

const EXPECT = ['青鐘港','赤錆館','赤錆館','白坑道','白坑道','黒松広場','黒松広場','月影診療所','月影診療所'];
const PROBE = [2, 4, 6, 8];

function count(text, words){
  let n = 0, hit = [];
  words.forEach(w => {
    let k = 0, at = text.indexOf(w);
    while (at >= 0){ k++; at = text.indexOf(w, at + w.length); }
    if (k){ n += k; hit.push(w + '×' + k); }
  });
  return { n, hit };
}

function analyzeTurn(text, expect){
  const rows = PLACES.map(p => {
    const b = count(text, p.base), f = count(text, p.feat);
    return { key: p.key, name: b.n, feat: f.n, featHit: f.hit.join(',') };
  });
  const named = rows.filter(r => r.name > 0).map(r => r.key);
  const byFeat = rows.slice().sort((a, b) => b.feat - a.feat);
  const top = byFeat[0].feat > 0 ? byFeat[0].key : null;
  const second = byFeat[1] ? byFeat[1].feat : 0;
  return {
    named,
    guess: named.length === 1 ? named[0] : top,
    guessBy: named.length === 1 ? 'name' : 'feature',
    margin: byFeat[0].feat - second,
    featTop: byFeat.slice(0, 2).map(r => r.key + ':' + r.feat).join(' / '),
    expect,
    ok: (named.length === 1 ? named[0] : top) === expect,
    pastNamed: named.filter(x => x !== expect)
  };
}

const file = process.argv[2] || 'ab552_logs.json';
const logs = JSON.parse(fs.readFileSync(file, 'utf8'));
const summary = [];

Object.keys(logs).sort().forEach(tid => {
  const r = logs[tid];
  console.log('\n================ ' + tid + '  arm=' + r.arm +
              '  (openingSetting=' + (r.armProof && r.armProof.openingSetting) +
              ' / location=' + (r.armProof && r.armProof.location) + ')  status=' + r.status);
  let probeOk = 0, probeNg = 0, probeAmb = 0;
  r.turns.forEach((t, i) => {
    const a = analyzeTurn(t.narrative, EXPECT[i]);
    const probe = PROBE.indexOf(i) >= 0;
    if (probe){
      if (a.ok && a.margin > 0) probeOk++;
      else if (!a.ok && a.guess) probeNg++;
      else probeAmb++;
    }
    console.log(
      (probe ? '★' : ' ') + 'T' + i +
      ' 期待=' + EXPECT[i].padEnd(6) +
      ' 推定=' + String(a.guess || '不明').padEnd(6) +
      ' (' + a.guessBy + ',差' + a.margin + ')' +
      ' 名前=' + (a.named.join(',') || '-') +
      ' 特徴=' + a.featTop +
      ' len=' + t.narrative.length +
      (a.ok ? '' : '   ← 不一致')
    );
  });
  summary.push({ trial: tid, arm: r.arm, probeOk, probeNg, probeAmb });
});

console.log('\n---------------- 観測ターン(場所名を入力に書いていない4ターン)の一次集計 ----------------');
summary.forEach(s => console.log(
  s.trial + '  arm=' + s.arm + '  整合=' + s.probeOk + '  不一致=' + s.probeNg + '  判定不能=' + s.probeAmb));
['A', 'B'].forEach(arm => {
  const g = summary.filter(s => s.arm === arm);
  if (!g.length) return;
  console.log(arm + ' 合計: 整合=' + g.reduce((a, x) => a + x.probeOk, 0) +
              ' 不一致=' + g.reduce((a, x) => a + x.probeNg, 0) +
              ' 判定不能=' + g.reduce((a, x) => a + x.probeAmb, 0) + '  (n=' + g.length * 4 + ')');
});
console.log('\n※これは一次スクリーニング。最終の 0/1/2 判定は本文を読んで付ける。');
