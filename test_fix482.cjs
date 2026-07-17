// node test_fix482.cjs — fix482 v2 pure関数のテスト(GPT-5.6監査の追試項目を含む)
'use strict';
const F = require('./v292Dfix482-output-quality.js');
let pass = 0, fail = 0;
function eq(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok){ pass++; } else { fail++; console.log('FAIL', name, '\n  got :', JSON.stringify(got), '\n  want:', JSON.stringify(want)); }
}
function ok(name, cond){ cond ? pass++ : (fail++, console.log('FAIL', name)); }

const ippai = 'いっぱい'.repeat(30);

// ==== 1. 正常反復は不触(監査・重大1の追試) ====
for (const t of [
  'お願いお願いお願いお願い、やめて。',                    // 3字x4
  '「助けて助けて助けて助けて」',                         // 3字x4
  'ごめんなさいごめんなさいごめんなさいごめんなさい。',    // 6字x4
  'まだまだまだまだまだ行ける。',                          // 2字x5
  '太鼓がどんどんどんどんと鳴る。',
  '……そうか。',
  '<say who="澪">こんにちは</say>',
  '<br><br><br><br>',
  '</say></say></say></say>',
]){
  const d = F.detectRuns(t);
  ok('normal-untouched: ' + t.slice(0, 12), d.removable === 0 || d.maxRepsMulti < 6);
  const c = F.collapsePathological(t);
  ok('normal-nochange: ' + t.slice(0, 12), c.text === t);
}

// ==== 2. 病的ループは検知+折り畳み ====
let a = F.assess('俺たちは' + ippai + 'だった。');
ok('ippai30-degenerate', a.degenerate === true && a.maxReps === 30);
let c = F.collapsePathological('俺たちは' + ippai + 'だった。');
eq('ippai30->3', c.text, '俺たちは' + 'いっぱい'.repeat(3) + 'だった。');

// 2字ユニット×8(ユニット長の誤認対策: 4字x4でなく2字x8として検知)
a = F.assess('まだ'.repeat(8) + '闇が続く。');
ok('mada8-maxreps8', a.maxReps === 8);
c = F.collapsePathological('まだ'.repeat(8) + '闇が続く。');
eq('mada8->3', c.text, 'まだ'.repeat(3) + '闇が続く。');

// 2字×10・×30
ok('mada10-deg', F.assess('まだ'.repeat(10)).degenerate === true);
ok('mada30-deg', F.assess('まだ'.repeat(30)).degenerate === true);

// 悲鳴: 20連=無傷・40連=病的
ok('scream20-clean', F.assess('ぎゃ' + 'あ'.repeat(20) + '!').degenerate === false);
eq('scream20-nochange', F.collapsePathological('ぎゃ' + 'あ'.repeat(20) + '!').text, 'ぎゃ' + 'あ'.repeat(20) + '!');
ok('scream40-deg', F.assess('ぎゃ' + 'あ'.repeat(40) + '!').degenerate === true);
eq('scream40->8', F.collapsePathological('ぎゃ' + 'あ'.repeat(40) + '!').text, 'ぎゃ' + 'あ'.repeat(8) + '!');

// タグを含むユニットの反復は畳まない
c = F.collapsePathological('<br>'.repeat(10));
eq('br10-untouched', c.text, '<br>'.repeat(10));

// 改行をまたぐ反復は畳まない
ok('newline-not-crossed', F.detectRuns('いっぱい\n'.repeat(10)).removableMulti === 0);

// ==== 3. ルビ除去は「確信できるルビ」だけ(監査・重大2の追試) ====
let s = F.stripRuby('深夜の夜陰《やいん》に紛れて');
eq('ruby-kana-after-kanji', s.text, '深夜の夜陰に紛れて');
s = F.stripRuby('夜陰《夜陰》とはまた別種《べっしゅ》だ');
eq('ruby-dup-and-kana', s.text, '夜陰とはまた別種だ');
s = F.stripRuby('｜今日《きょう》は晴れ');
eq('ruby-aozora-bar', s.text, '今日は晴れ');
s = F.stripRuby('空の《》が残る');
eq('empty-removed', s.text, '空のが残る');
// 非ルビは原文保持
s = F.stripRuby('彼は《契約》と呼んだ');
eq('emphasis-kept', s.text, '彼は《契約》と呼んだ');
s = F.stripRuby('《重要》ここを読む');
eq('label-kept', s.text, '《重要》ここを読む');
s = F.stripRuby('A《B》C');
eq('latin-kept', s.text, 'A《B》C');
s = F.stripRuby('ふと《ささやき》が聞こえた');   // 直前がかな=ルビと確信できない
eq('kana-before-kana-kept', s.text, 'ふと《ささやき》が聞こえた');
s = F.stripRuby('罠《<say>x</say>》だ');          // タグ入りは絶対に展開しない
eq('tag-in-brackets-kept', s.text, '罠《<say>x</say>》だ');
ok('count-only-removed', F.stripRuby('彼は《契約》と呼んだ').count === 0);

// ==== 4. 崩壊判定・採用判定 ====
const normal = 'シャッターの奥で気配が動いた。源蔵は書類を睨み、それから静かに顔を上げた。「夜間専門、ね」と呟く声は低い。レイナは荷物を抱え直した。倉庫の空気は冷たく、油の匂いがした。遠くで金属の軋む音がした。';
ok('assess-normal-clean', F.assess(normal).degenerate === false);
const dup = '鏡が歪んだまま戻らない。鏡が歪んだまま戻らない。鏡が歪んだまま戻らない。鏡が歪んだまま戻らない。彼は見ていた。';
ok('assess-dup-degenerate', F.assess(dup).degenerate === true);
ok('proto-safe', F.dupSentenceRatio('__proto__です。constructorです。toStringです。valueOfです。') === 0);

// better(): 重複率だけ崩壊のケースでも改善品を採用(監査・中2)
const aBad  = { degenerate: true, dupRatio: 0.8, maxReps: 0, removable: 0 };
const aLess = { degenerate: true, dupRatio: 0.6, maxReps: 0, removable: 0 };
const aGood = { degenerate: false, dupRatio: 0, maxReps: 0, removable: 0 };
ok('better-dup-improve', F.better(aLess, aBad) === true);
ok('better-clean-wins', F.better(aGood, aBad) === true);
ok('better-worse-rejected', F.better(aBad, aGood) === false);

// ==== 5. 対象判定(Chronicle署名) ====
const mk = sys => ({ body: JSON.stringify({ messages: [{ role: 'system', content: sys }] }) });
ok('narrative-detected', F.isChronicleNarrative('https://openrouter.ai/api/v1/chat/completions', mk('【出力の形式】…')) === true);
ok('foreign-chat-passthrough', F.isChronicleNarrative('https://openrouter.ai/api/v1/chat/completions', mk('You are a helpful assistant')) === false);
ok('image-url-passthrough', F.isChronicleNarrative('https://gen.pollinations.ai/image', mk('【出力の形式】')) === false);

// ==== 5.5 タグ保護(プレースホルダ) ====
let tp = F.collapsePathological('<say who="澪">' + 'いっぱい'.repeat(30) + '</say>');
eq('tag-preserved-collapse', tp.text, '<say who="澪">' + 'いっぱい'.repeat(3) + '</say>');
tp = F.collapsePathological('<img alt="' + 'ab'.repeat(9) + '">本文');
eq('tag-attr-untouched', tp.text, '<img alt="' + 'ab'.repeat(9) + '">本文');

// ==== 6. makeRetryInit: __f482はbodyに入らない(監査・重大4) ====
const init2 = F.makeRetryInit({ method: 'POST', body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', messages: [{ role: 'system', content: '【出力の形式】' }] }) });
ok('retry-init-flag', init2.__f482Retry === true);
ok('retry-body-no-marker', init2.body.indexOf('__f482') < 0);
ok('retry-body-no-internal', !/"__/.test(init2.body));
const rb = JSON.parse(init2.body);
ok('retry-sampling', rb.temperature === 0.7 && rb.frequency_penalty === 0.5);
ok('retry-sys-note', rb.messages[0].content.indexOf('【再生成】') >= 0);

console.log(`\n${pass}/${pass + fail} PASS${fail ? ' / ' + fail + ' FAIL' : ''}`);
process.exit(fail ? 1 : 0);
