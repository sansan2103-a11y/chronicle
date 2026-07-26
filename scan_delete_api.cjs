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
/* ★2段階に分ける（GPT裁定）:
     [bypass] 監視を**構造的に迂回する**書き方。569c では 0 件にする。今も新規追加は禁止。
     [direct] 呼び出し時に解決される直接呼び出し。569c で DeleteGateway へ移行する対象。 */
const PATTERNS = [
  /* --- bypass: 監視を迂回する（最優先で潰す） --- */
  { id:'proto-removeItem',  sev:'bypass', re:/Storage\s*\.\s*prototype\s*\.\s*removeItem/g, why:'Storage.prototype.removeItem の直接使用' },
  { id:'proto-index',       sev:'bypass', re:/Storage\s*\[\s*["']prototype["']\s*\]\s*\[\s*["']removeItem["']\s*\]/g, why:'Storage["prototype"]["removeItem"]' },
  { id:'proto-clear',       sev:'bypass', re:/Storage\s*\.\s*prototype\s*\.\s*clear/g, why:'Storage.prototype.clear' },
  { id:'bind-alias',        sev:'bypass', re:/localStorage\s*\.\s*removeItem\s*\.\s*bind\s*\(/g, why:'localStorage.removeItem.bind（読込時に参照を捕捉）' },
  { id:'bind-index',        sev:'bypass', re:/localStorage\s*\[\s*["']removeItem["']\s*\]\s*\.\s*bind\s*\(/g, why:'localStorage["removeItem"].bind' },
  { id:'alias-assign',      sev:'bypass', re:/(?:var|let|const)?\s*[A-Za-z_$][\w$]*\s*=\s*localStorage\s*\.\s*removeItem\b(?!\s*\.\s*bind)/g, why:'removeItem を変数へ代入（別名経由の迂回）' },
  { id:'delete-index',      sev:'bypass', re:/delete\s+localStorage\s*\[/g,              why:'delete localStorage[key]' },
  { id:'clear',             sev:'bypass', re:/localStorage\s*\.\s*clear\s*\(/g,          why:'localStorage.clear()' },
  /* --- direct: 呼び出し時に解決される直接呼び出し（569cでDeleteGatewayへ） --- */
  { id:'removeItem-call',   sev:'direct', re:/\.removeItem\s*\(/g,                       why:'localStorage.removeItem の直接呼び出し' },
  { id:'removeItem-index',  sev:'direct', re:/\[\s*["']removeItem["']\s*\]\s*\(/g,     why:'ブラケット記法での removeItem 呼び出し' }
];

function allowed(name){ return ALLOW.some(re => re.test(name)); }
function lineOf(text, idx){ return text.slice(0, idx).split('\n').length; }

const files = fs.readdirSync(ROOT).filter(f => /\.(js|cjs|mjs|html)$/.test(f));
let violations = 0, bypassCount = 0;
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
      if (p.sev === 'bypass') bypassCount++;
      (byFile[f] = byFile[f] || []).push({ id: p.id, sev: p.sev, line: lineOf(text, m.index), why: p.why });
    }
  }
}
const names = Object.keys(byFile).sort((a,b) => byFile[b].length - byFile[a].length);
console.log('危険な削除API: 合計 ' + violations + '件 / ' + names.length + 'ファイル  (許可ファイルは除外済み)');
console.log('  うち [bypass] 監視を構造的に迂回する書き方 = ' + bypassCount + '件  ★569c では 0 にする。新規追加は今も禁止');
console.log('  うち [direct] 呼び出し時解決の直接呼び出し   = ' + (violations - bypassCount) + '件  ★569c で DeleteGateway へ移行');
console.log('');
for (const f of names){
  const v = byFile[f];
  const kinds = {};
  v.forEach(x => { kinds[x.id] = (kinds[x.id]||0)+1; });
  const mark = v.some(x => x.sev === 'bypass') ? '★bypass ' : '        ';
  console.log('  ' + mark + f + '  ' + v.length + '件  ' + JSON.stringify(kinds) + '  行: ' + v.slice(0,8).map(x=>x.line).join(','));
}
/* 終了コード: bypass が1件でもあれば 1（569c の受け入れ条件は violations===0） */
process.exit(bypassCount ? 1 : 0);
