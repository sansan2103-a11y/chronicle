/* ============================================================================
 * test_fix666.cjs — 新規物語の「認証ブートストラップだけ初期化」の契約試験
 * ---------------------------------------------------------------------------
 * 直した症状（2026-08-03 実測で原因確定）:
 *   APIキーは物語(slot)ごとの blob の cfg に入っている。home.html の newStory()
 *   が {turns:[]} だけを書いていたため、index.html の S.load()(fix230) がその
 *   新slotを読んだ時点で S.cfg は既定値のまま（provider:'anthropic'/orKey:''）。
 *   G.init() はパース中に同期実行されるので「⚙設定からAPIキーと世界設定を
 *   入力してください」＋設定自動オープンへ分岐する。番兵 __proxy__ を埋める
 *   のは fix336 だけで、それは G.init より後（実測977ms）に走り、しかも画面を
 *   作り直さない。だからリロードするまで直らなかった。
 *
 * この試験が守る契約:
 *   1. プロキシONのときだけ、新規slotの初期データに provider/orKey が入る
 *   2. 入るのは**そのリテラル2項目だけ**。他slotの cfg を継承しない
 *   3. プロキシOFF/未設定なら従来どおり {turns:[]}
 *   4. 既にある slot は絶対に上書きしない（== null ガードの維持）
 *   5. newStory() は他の chr6_slot_* を一切読まない（継承経路が無いことの実証）
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const HOME = read('home.html');
const VER = read('version.txt').trim();

/* ============================================================================
 * A. 静的契約
 * ========================================================================== */
console.log('\n[A] 静的契約（home.html のソース）');

ok('A1 f666ProxyOn が定義されている', /function\s+f666ProxyOn\s*\(\)/.test(HOME));
ok('A2 f666InitialSlotData が定義されている', /function\s+f666InitialSlotData\s*\(\)/.test(HOME));
ok('A3 newStory は初期データを f666InitialSlotData() から取る',
   /localStorage\.setItem\('chr6_slot_'\+id,\s*JSON\.stringify\(f666InitialSlotData\(\)\)\)/.test(HOME));
ok('A4 ★既にある slot を上書きしない（== null ガードが残っている）',
   /if\s*\(localStorage\.getItem\('chr6_slot_'\+id\)\s*==\s*null\)/.test(HOME));

/* ★継承禁止の実証: f666InitialSlotData の本体にリテラル以外の供給源が無いこと */
const BODY = (HOME.match(/function\s+f666InitialSlotData\s*\(\)\s*\{([\s\S]*?)\n  \}/) || [])[1] || '';
ok('A5 f666InitialSlotData の本体を取り出せた', BODY.length > 0);
ok('A6 ★★本体は他slotを読まない（chr6_slot_ を参照しない）', BODY.indexOf('chr6_slot_') < 0, BODY);
ok('A7 ★★本体は localStorage を読まない（cfg継承の経路が無い）',
   BODY.indexOf('localStorage') < 0, BODY);
ok('A8 ★★本体は slotData/readMeta などの既存データ取得を呼ばない',
   !/slotData\s*\(|readMeta\s*\(|chr6_active_slot|JSON\.parse/.test(BODY), BODY);
ok('A9 provider は openrouter リテラル', /provider:\s*'openrouter'/.test(BODY));
ok('A10 orKey は __proxy__ リテラル', /orKey:\s*'__proxy__'/.test(BODY));
ok('A11 ★指示どおり cfg は2項目だけ（pollKey/key/naiKey/model を入れない）',
   !/pollKey|naiKey|orModel|\bkey\s*:/.test(BODY), BODY);

ok('A12 プロキシ判定は v292ProxyOff を見る', /v292ProxyOff/.test(HOME));
ok('A13 プロキシ判定は v292ProxyUrl を見る', /v292ProxyUrl/.test(HOME));
ok('A14 プロキシ判定は v292ProxyPass を見る', /v292ProxyPass/.test(HOME));
ok('A15 Googleログイン運用も拾う（v292GoogleToken）', /v292GoogleToken/.test(HOME));

/* ============================================================================
 * B. 版識別子
 * ========================================================================== */
console.log('\n[B] 版識別子');
const TOK = (VER.match(/-(fix[\w]+)$/) || [])[1] || '';
ok('B1 version.txt から fix札を取り出せた', !!TOK, VER);
ok('B2 BUILT が fix666 以降', /fix(6[6-9]\d|[7-9]\d\d)/.test(VER), VER);
{
  const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  ok('B3 index.html の BUILT が version.txt と同値',
     (idx.match(/var BUILT = '([^']+)'/) || [])[1] === VER);
  ok('B4 home.html の HOME_BUILT が version.txt と同値',
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === VER);
}
ok('B5 ★home.html を直したので home.html 自身がキャッシュ破棄の対象',
   /var HOME_BUILT = '([^']+)'/.test(HOME) && /location\.replace/.test(HOME));

/* ============================================================================
 * C. 挙動（newStory() の該当部を実際に動かす）
 * ========================================================================== */
console.log('\n[C] 挙動');

/* home.html から2関数だけを取り出して実行する（DOM も location も要らない） */
function loadFns(){
  const a = HOME.indexOf('function f666ProxyOn()');
  const b = HOME.indexOf('// ---------- 操作 ----------');
  if (a < 0 || b < 0 || b <= a) throw new Error('抽出失敗');
  const src = HOME.slice(a, b);
  const mk = new Function('localStorage', src + '\n return { proxyOn: f666ProxyOn, init: f666InitialSlotData };');
  return mk;
}
const mk = loadFns();
function withLS(obj){
  const store = Object.assign({}, obj);
  return mk({ getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k] = String(v); } });
}
const NOW = Date.now();
const liveTok = JSON.stringify({ token: 't', exp: Math.floor(NOW/1000) + 3600 });
const deadTok = JSON.stringify({ token: 't', exp: Math.floor(NOW/1000) - 10 });

const cases = [
  ['C1  未設定 → 従来どおり turns だけ',            {}, false],
  ['C2  URLのみ（合言葉なし）→ turns だけ',          { v292ProxyUrl:'https://x' }, false],
  ['C3  合言葉のみ（URLなし）→ turns だけ',          { v292ProxyPass:'p' }, false],
  ['C4  ★URL+合言葉 → cfg を入れる',                 { v292ProxyUrl:'https://x', v292ProxyPass:'p' }, true],
  ['C5  ★ProxyOff=1 なら入れない（緊急OFFが効く）',   { v292ProxyUrl:'https://x', v292ProxyPass:'p', v292ProxyOff:'1' }, false],
  ['C6  ★URL+有効なGoogleトークン → cfg を入れる',    { v292ProxyUrl:'https://x', v292GoogleToken: liveTok }, true],
  ['C7  ★期限切れGoogleトークンでは入れない',         { v292ProxyUrl:'https://x', v292GoogleToken: deadTok }, false],
  ['C8  壊れたGoogleトークンでも例外にならない',       { v292ProxyUrl:'https://x', v292GoogleToken: '{{{' }, false],
  ['C9  空白だけのURLは無効',                        { v292ProxyUrl:'   ', v292ProxyPass:'p' }, false],
  ['C10 空白だけの合言葉は無効',                      { v292ProxyUrl:'https://x', v292ProxyPass:'   ' }, false]
];
for (const [name, ls, expectCfg] of cases){
  let r = null, threw = null;
  try { r = withLS(ls).init(); } catch(e){ threw = String(e && e.message); }
  const has = !!(r && r.cfg);
  ok(name, !threw && has === expectCfg && Array.isArray(r.turns) && r.turns.length === 0,
     { threw, r });
}

/* 中身の厳密一致 */
{
  const r = withLS({ v292ProxyUrl:'https://x', v292ProxyPass:'p' }).init();
  ok('C11 ★turns は空配列', Array.isArray(r.turns) && r.turns.length === 0, r);
  ok('C12 ★cfg のキーは provider と orKey の2つだけ',
     JSON.stringify(Object.keys(r.cfg).sort()) === JSON.stringify(['orKey','provider']), r.cfg);
  ok('C13 ★provider === openrouter', r.cfg.provider === 'openrouter', r.cfg);
  ok('C14 ★orKey === __proxy__', r.cfg.orKey === '__proxy__', r.cfg);
  ok('C15 ★トップレベルは turns と cfg の2つだけ（cast/scene を作らない）',
     JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['cfg','turns']), r);
}

/* ★★継承しないことの実証: 他slotに濃い cfg があっても結果が変わらない */
{
  const dirty = {
    v292ProxyUrl:'https://x', v292ProxyPass:'p',
    'chr6': JSON.stringify({ cfg:{ provider:'anthropic', key:'sk-REAL-USER-KEY', naiKey:'nai', orModel:'m' } }),
    'chr6_slot_sOTHER': JSON.stringify({ cfg:{ provider:'novelai', naiKey:'LEAK', key:'LEAK2' },
                                         cast:{ hero:{ name:'澪' } }, turns:[1,2,3] }),
    'chr6_active_slot': JSON.stringify('sOTHER')
  };
  const r = withLS(dirty).init();
  const s = JSON.stringify(r);
  ok('C16 ★★他slotのキーが漏れない', s.indexOf('LEAK') < 0, s);
  ok('C17 ★★既定slotのユーザー鍵が漏れない', s.indexOf('sk-REAL-USER-KEY') < 0, s);
  ok('C18 ★★他slotのキャストが漏れない', s.indexOf('澪') < 0, s);
  ok('C19 ★★他slotのターンが漏れない', r.turns.length === 0, s);
  ok('C20 ★★結果は清潔な環境と完全一致（＝継承経路が存在しない）',
     s === JSON.stringify(withLS({ v292ProxyUrl:'https://x', v292ProxyPass:'p' }).init()), s);
}

/* 冪等・副作用なし */
{
  const w = withLS({ v292ProxyUrl:'https://x', v292ProxyPass:'p' });
  const a = JSON.stringify(w.init()), b = JSON.stringify(w.init());
  ok('C21 何度呼んでも同じ結果', a === b);
  const r1 = w.init(); r1.cfg.orKey = 'MUTATED';
  ok('C22 ★戻り値を書き換えても次の呼び出しに影響しない（共有参照を返さない）',
     w.init().cfg.orKey === '__proxy__');
}

/* ============================================================================
 * D. 回帰: この修正が触ってはいけないもの
 * ========================================================================== */
console.log('\n[D] 回帰（触っていないことの確認）');
ok('D1 chr6_active_slot を先に向ける処理は残っている',
   /localStorage\.setItem\('chr6_active_slot',\s*JSON\.stringify\(id\)\)/.test(HOME));
ok('D2 ?new=1 付きで遷移する処理は残っている', /'&new=1'/.test(HOME));
ok('D3 容量不足のときは物語を作らない（writeMeta ガード）',
   /if\(!writeMeta\(meta\)\)\{\s*alert\(/.test(HOME));
ok('D4 削除は正規サービスへの委譲のまま（自前削除へ戻していない）',
   /__chronicleStoryLifecycle/.test(HOME) && /requestDelete/.test(HOME));
ok('D5 ★newStory 本体は他slotの cfg を読まない', (() => {
  const a = HOME.indexOf('function newStory()');
  const b = HOME.indexOf('function delStory(');
  const body = HOME.slice(a, b);
  return body.indexOf('slotData(') < 0 && !/getItem\('chr6'\)/.test(body);
})());

console.log('\n─────────────────────────────');
console.log(`結果: pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
