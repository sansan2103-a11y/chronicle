/* scan_delete_api.cjs — 「危険な削除API」の直接使用を静的に検出する（GPT指定・569cの受け入れ条件）
 *
 * 目的: veto/DeleteGateway の**足し忘れ**を、変数名やループ形状ではなく
 *       「危険APIの直接使用禁止」という形で固定する。
 *
 * 許可ファイル（allowlist）:
 *   v292Dfix569-*  … DeleteGateway と影監視そのもの
 *   v292Dfix246-*  … 移行期間中の例外（キー名の書換ラッパ）
 *   test_*         … テスト
 *
 * 使い方: node scan_delete_api.cjs [対象ディレクトリ]
 * 終了コード: 違反があれば 1（569cではこれを 0 にするのが受け入れ条件）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const ALLOW = [/^v292Dfix569-/, /^v292Dfix246-/, /^test_/, /^scan_delete_api\.cjs$/];
const PATTERNS = [
  { id:'removeItem-call',   re:/\.removeItem\s*\(/g,                       why:'localStorage.removeItem の直接呼び出し' },
  { id:'removeItem-index',  re:/\[\s*["']removeItem["']\s*\]/g,            why:'ブラケット記法での removeItem 参照' },
  { id:'proto-removeItem',  re:/Storage\s*\.\s*prototype\s*\.\s*removeItem/g, why:'Storage.prototype.removeItem の直接使用' },
  { id:'clear',             re:/localStorage\s*\.\s*clear\s*\(/g,          why:'localStorage.clear()' },
  { id:'delete-index',      re:/delete\s+localStorage\s*\[/g,              why:'delete localStorage[key]' },
  { id:'alias-assign',      re:/=\s*localStorage\s*\.\s*removeItem\b/g,    why:'removeItem を変数へ代入（別名経由の迂回）' },
  { id:'bind-alias',        re:/localStorage\s*\.\s*removeItem\s*\.\s*bind\s*\(/g, why:'removeItem.bind（別名経由の迂回）' }
];

function allowed(name){ return ALLOW.some(re => re.test(name)); }
function lineOf(text, idx){ return text.slice(0, idx).split('\n').length; }

const files = fs.readdirSync(ROOT).filter(f => /\.(js|cjs|mjs|html)$/.test(f));
let violations = 0;
const byFile = {};
for (const f of files){
  if (allowed(f)) continue;
  let text;
  try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch(e){ continue; }
  for (const p of PATTERNS){
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))){
      /* コメント行はスキップ（行頭が * や // のもの） */
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const linePrefix = text.slice(lineStart, m.index);
      if (/^\s*(\*|\/\/|\/\*)/.test(linePrefix)) continue;
      violations++;
      (byFile[f] = byFile[f] || []).push({ id: p.id, line: lineOf(text, m.index), why: p.why });
    }
  }
}
const names = Object.keys(byFile).sort((a,b) => byFile[b].length - byFile[a].length);
console.log('危険な削除APIの直接使用: ' + violations + '件 / ' + names.length + 'ファイル  (許可ファイルは除外済み)');
for (const f of names){
  const v = byFile[f];
  const kinds = {};
  v.forEach(x => { kinds[x.id] = (kinds[x.id]||0)+1; });
  console.log('  ' + f + '  ' + v.length + '件  ' + JSON.stringify(kinds) + '  行: ' + v.slice(0,8).map(x=>x.line).join(','));
}
process.exit(violations ? 1 : 0);
