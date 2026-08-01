/* test_fix569_loadorder.cjs — 「fix569 が Chronicle 本体の最初の実行スクリプトである」ことの静的検査
 *
 * ■なぜ必要か（GPT裁定・案Y+）
 *   `Storage.prototype.removeItem` へ三枚目のラッパを足しても、**fix569 より前に取得済みの
 *   bound 参照は捕まらない**。三重化は二重計上とラップ順序の組合せを増やし、観測値の意味を壊す。
 *   代わりに「fix569 より前に localStorage / Storage / removeItem を触るコードを置かない」ことを
 *   **静的に固定する**。「scriptタグが前にある」だけでは不十分で、**インラインスクリプトも走査対象**。
 *
 * ■固定する契約
 *   ①配信/リポジトリの index.html で fix569 が最初の Chronicle 実行スクリプト
 *     ★fix654(2026-07-31)だけは例外で、fix569 の**直前**に置く。理由:
 *       fix654 は Storage.prototype を accessor 化して「以後の全モジュールの代入」を捕獲する土台で、
 *       fix569 自身の inner ラッパ（`localStorage.removeItem = ...`）も iOS ではこれが無いと素通りする。
 *       ラッパを1枚も足さず、OFFフラグを native getItem で1回読むだけ（削除APIを一切呼ばない）。
 *       → 「fix569 より前に**削除経路を触るコード**を置かない」という元の契約は保たれる。
 *   ②fix246 / fix346 / fix472 は必ず fix569 より後
 *   ③fix569 より前に localStorage / Storage / removeItem を参照するコードが 0 件
 *   ④ファイル名だけでなく **scriptタグの実際の出現位置**で比較する
 *
 * 使い方: node test_fix569_loadorder.cjs [index.htmlのパス]
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const FILE = process.argv[2] || path.join(__dirname, 'index.html');
/* index.html はリテラルNULバイトを含むので latin1 で読んでから utf8 へ */
const html = Buffer.from(fs.readFileSync(FILE, 'latin1'), 'latin1').toString('utf8');

/* ---- scriptタグを出現順に切り出す ------------------------------------------- */
const TAGS = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))){
  const attrs = m[1] || '', body = m[2] || '';
  const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || null;
  TAGS.push({ index: m.index, src, body, inline: !src });
}

const idxOf = (needle) => TAGS.findIndex(t => t.src && t.src.indexOf(needle) >= 0);
const i569 = idxOf('v292Dfix569-gc-shadow.js');
const i246 = idxOf('v292Dfix246-store-slot-isolation.js');
const i346 = idxOf('v292Dfix346-idb-avatars.js');
const i472 = idxOf('v292Dfix472-icon-protect.js');
/* ★fix569 より前に置いてよい唯一の Chronicle JS（上の契約①の例外・ここ以外に増やさない） */
const ALLOW_BEFORE_569 = ['v292Dfix654-storage-trap.js'];
const i654 = idxOf('v292Dfix654-storage-trap.js');

console.log('\n== A. ロード順（scriptタグの実際の出現位置で比較） ==');
{
  ok('fix569 の script が存在する', i569 >= 0, { i569, total: TAGS.length });
  ok('★fix569 は fix246 より前', i569 >= 0 && i246 >= 0 && i569 < i246, { i569, i246 });
  ok('★fix569 は fix346 より前', i569 >= 0 && i346 >= 0 && i569 < i346, { i569, i346 });
  ok('★fix569 は fix472 より前', i569 >= 0 && i472 >= 0 && i569 < i472, { i569, i472 });
}

console.log('\n== B. fix569 より前に「Chronicle の実行コード」が無い ==');
{
  /* fix569 より前に置いてよいもの: style / データを持たない設定 /
     localStorage へ触れない第三者ライブラリ。
     禁止: ChronicleのJS / localStorage参照 / Storage参照 / removeItem参照 / 遅延実行コード。 */
  const before = TAGS.slice(0, i569 < 0 ? TAGS.length : i569);
  const chronicleJs = before.filter(t => t.src && /v\d|features\.js|v292Dfix/.test(t.src))
                            .filter(t => !ALLOW_BEFORE_569.some(a => t.src.indexOf(a) >= 0));
  ok('★fix569 より前に Chronicle の外部JSが無い（許可: ' + ALLOW_BEFORE_569.join(',') + '）',
     chronicleJs.length === 0, chronicleJs.map(t => t.src));
  ok('★★fix654(storage trap) は fix569 の直前に居る', i654 >= 0 && i654 === i569 - 1, { i654, i569 });

  const DANGER = [
    { id:'localStorage', re:/\blocalStorage\b/ },
    { id:'sessionStorage', re:/\bsessionStorage\b/ },
    { id:'Storage', re:/\bStorage\s*\./ },
    { id:'removeItem', re:/\bremoveItem\b/ }
  ];
  const hits = [];
  before.forEach((t, i) => {
    if (!t.inline) return;
    /* コメントを落としてから走査する（説明文で落ちないように） */
    const code = t.body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    DANGER.forEach(d => { if (d.re.test(code)) hits.push({ tag: i, id: d.id, head: code.trim().slice(0, 40) }); });
  });
  ok('★fix569 より前のインラインscriptに localStorage/Storage/removeItem 参照が0件',
     hits.length === 0, hits.slice(0, 5));

  /* 遅延実行（setTimeout/setInterval/イベント登録）で後から走るコードも禁止 */
  const late = [];
  before.forEach((t, i) => {
    if (!t.inline) return;
    const code = t.body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    if (/\bsetTimeout\s*\(|\bsetInterval\s*\(|addEventListener\s*\(/.test(code)) late.push({ tag: i, head: code.trim().slice(0, 40) });
  });
  ok('fix569 より前のインラインscriptに遅延実行コードが0件', late.length === 0, late.slice(0, 5));
}

console.log('\n== C. fix569 の位置が「最初の Chronicle 実行スクリプト」である ==');
{
  const chron = TAGS.filter(t => t.src && /v292Dfix|features\.js|^v\d+.*\.js$/.test(t.src));
  const firstChronicle = TAGS.findIndex(t => t.src && /v292Dfix|features\.js|^v\d+.*\.js$/.test(t.src));
  /* ★契約①の例外（fix654）を除けば、最初の Chronicle 外部JS は fix569 のまま */
  const firstNonAllowed = TAGS.findIndex(t => t.src && /v292Dfix|features\.js|^v\d+.*\.js$/.test(t.src) &&
                                              !ALLOW_BEFORE_569.some(a => t.src.indexOf(a) >= 0));
  ok('★最初の Chronicle 外部JS が fix569（fix654 を除く）', firstNonAllowed === i569,
     { firstNonAllowed, src: firstNonAllowed >= 0 ? TAGS[firstNonAllowed].src : null, i569 });
  ok('★★fix569 より前に居る Chronicle JS は fix654 の1本だけ',
     firstChronicle === i654 && i654 >= 0 && (i569 - i654) === 1,
     { firstChronicle, i654, i569, before: chron.slice(0, 2).map(t => t.src) });
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
