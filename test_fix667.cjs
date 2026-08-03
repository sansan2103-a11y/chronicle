/* ============================================================================
 * test_fix667.cjs — ホームのGoogle公式ボタン(M2) と 作成前ゲート(M1) の契約試験
 * ---------------------------------------------------------------------------
 * 実機で確定した事実(2026-08-03):
 *   ・iPhone版Chrome のホームは prompt() だけなので One Tap/FedCM が出ず
 *     「Googleのログイン画面が表示されませんでした」= f663Fail('popup') になる。
 *     物語画面(fix328)は renderButton を併用しているので入れていた。
 *   ・ホームには更新のtickが無く、居る限りトークンは切れっぱなし。
 *   ・切れたまま新規物語を作ると f666ProxyOn() が false になり cfg 無しの slot ができる。
 *
 * この試験が守る契約:
 *   M2-1 ホームに renderButton の呼び出しがある（公式ボタンが主導線）
 *   M2-2 prompt() は残すが、自動で繰り返し起動しない（60秒interval等を足さない）
 *   M2-3 再判定は pageshow / focus / visibilitychange / 作成直前 / ログイン成功時 だけ
 *   M2-4 GIS 読込失敗時は既存のエラー表示(f663Fail)を維持する
 *   M2-5 物語画面(fix328)には触っていない
 *   M1-1 ゲート条件は4つすべて成立したときだけ
 *   M1-2 ゲート表示中は slot を作らない（発行・保存より前で止まる）
 *   M1-3 「認証設定なしで作成」を明示選択したときだけ従来どおり作成する
 *   M1-4 「Googleでログイン」では作成を自動再開しない
 *   M1-5 連打しても二重作成しない
 *   M1-6 v292Dfix667GateOff='1' は M1 だけを止め、M2 の公式ボタンは残す
 *   R-1  fix666 の f666InitialSlotData と ==null ガードは無変更
 *   R-2  P0 のコードは home.html に入っていない
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
const VER  = read('version.txt').trim();
const F328 = read('v292Dfix328-google-login.js');

/* 主スクリプト本体だけを取り出す（HTML部分の誤検出を避ける） */
const SRC = (() => {
  const i = HOME.indexOf("<script>\n(function(){\n  'use strict';");
  const j = HOME.indexOf('</script>', i);
  return HOME.slice(i, j);
})();
const bodyOf = (name) => {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') { d++; started = true; }
    else if (SRC[k] === '}') { d--; if (started && d === 0) return SRC.slice(i, k + 1); }
  }
  return '';
};

/* ============================================================================
 * A. M2 — ホームのGoogle公式ボタン
 * ========================================================================== */
console.log('\n[A] M2 ホームのGoogle公式ボタン');

ok('A1 ★公式ボタンの置き場 #g667btn がHTMLにある', /id="g667btn"/.test(HOME));
ok('A2 ★renderButton を呼んでいる', /google\.accounts\.id\.renderButton\s*\(/.test(SRC));
ok('A3 renderButton の対象は #g667btn', /renderButton\(\s*box\s*,/.test(SRC) && /var box = el\('g667btn'\)/.test(SRC));
ok('A4 描画は1回だけ（再描画ガードがある）',
   /f667Rendered\s*\|\|\s*f667Rendering/.test(SRC) && /f667Rendered = true/.test(SRC));
ok('A5 prompt() はPC向けの補助として残っている', /google\.accounts\.id\.prompt\(/.test(SRC));

/* ★自動で prompt を繰り返さない: 再判定関数は prompt を含まない */
const REFRESH = bodyOf('f667Refresh');
ok('A6 f667Refresh を取り出せた', REFRESH.length > 0);
ok('A7 ★★再判定は prompt() を呼ばない（自動ログイン誘発をしない）',
   REFRESH.indexOf('prompt') < 0, REFRESH);
/* ★★変異試験で見逃した穴の塞ぎ: 「prompt という語を書かずに f663Login を呼ぶ」でも
   自動ログインは起きる。再判定からログイン開始関数へ入る経路そのものを禁じる。 */
ok('A7b ★★再判定は f663Login（ログイン開始）を呼ばない',
   REFRESH.indexOf('f663Login') < 0 && REFRESH.indexOf('google.accounts') < 0, REFRESH);
ok('A7c ★★ログイン開始は利用者のクリックからだけ（f663Login の参照は定義と click 登録の2か所のみ）',
   (SRC.match(/f663Login/g) || []).length === 2,
   (SRC.match(/.*f663Login.*/g) || []).map(s => s.trim().slice(0, 70)));
ok('A8 ★★60秒interval等を足していない（fix667が setInterval を導入しない）',
   !/f667[\w]*[\s\S]{0,200}setInterval/.test(SRC) && !/setInterval\([^)]*f667/.test(SRC));

/* 再判定のタイミングは5か所だけ */
ok('A9  pageshow で再判定する', /addEventListener\('pageshow',\s*f667Refresh/.test(SRC));
ok('A10 focus で再判定する', /addEventListener\('focus',\s*f667Refresh/.test(SRC));
ok('A11 visibilitychange で visible のときだけ再判定する',
   /visibilitychange[\s\S]{0,120}document\.hidden[\s\S]{0,40}f667Refresh/.test(SRC));
ok('A12 新規物語ボタン押下の直前に再判定する',
   /function newStory\(opts\)\{?[\s\S]{0,200}f667Refresh\(\)/.test(SRC));
ok('A13 ログイン成功時も通る（f663RenderLogin から公式ボタンを同期）',
   /f667SyncOfficialButton\(okG\)/.test(SRC) && /f663RenderLogin\(\);/.test(SRC));

ok('A14 ★GIS読込失敗時は既存のエラー表示を維持する',
   /f663Fail\(why \|\| 'script'\)/.test(SRC) && /function f663Fail/.test(SRC));

/* ★★自動再試行ループの防止（おしん指摘・2026-08-03）
   f663Fail() は f663RenderLogin() を呼び、そこから f667SyncOfficialButton() へ再入する。
   先に f667Rendering=false にすると、その場で GIS script をもう1本追加してしまい、
   読込が失敗し続ける環境では onerror → f663Fail → RenderLogin → Sync → script追加 のループになる。 */
{
  const ERRCB = (() => {
    const i = SRC.indexOf('}, function(why){');
    if (i < 0) return '';
    let d = 0, started = false;
    for (let k = SRC.indexOf('{', i + 3); k < SRC.length; k++) {
      if (SRC[k] === '{') { d++; started = true; }
      else if (SRC[k] === '}') { d--; if (started && d === 0) return SRC.slice(i, k + 1); }
    }
    return '';
  })();
  ok('A14b GIS失敗コールバックを取り出せた', ERRCB.length > 0);
  ok('A14c ★★f663Fail は try の中、f667Rendering=false は finally にある（順序が逆でない）',
     /try \{\s*f663Fail\(why \|\| 'script'\);\s*\} finally \{\s*f667Rendering = false;\s*\}/.test(ERRCB), ERRCB);
  ok('A14d ★★失敗処理の前に f667Rendering を false へ戻していない（再入で2本目を追加しない）',
     ERRCB.indexOf('f667Rendering = false') > ERRCB.indexOf('f663Fail('), ERRCB);
}
ok('A15 OFF端末(v292GoogleLoginOff)では公式ボタンを出さない',
   /if \(f663Off\(\) \|\| okG\)\{ box\.style\.display = 'none'; return; \}/.test(SRC));

/* ★★公式ボタンを「主導線」にする（おしん指摘・2026-08-03）
   旧 #gLoginBtn は iPhone で失敗する prompt() 経路。HTML 上で公式ボタンより先にあり見た目も大きいので、
   モバイル幅では隠し、名前も分ける。 */
const CSS = HOME.slice(HOME.indexOf('<style>'), HOME.indexOf('</style>'));
const CSS1 = CSS.replace(/\s*\n\s*/g, ' ');
ok('A18 ★★モバイル幅(max-width:640px)で旧 #gLoginBtn を非表示にする',
   /@media \(max-width:640px\), \(hover:none\) and \(pointer:coarse\)\{[^}]*#gLoginBtn\{ display:none !important \}/.test(CSS1),
   (CSS.match(/@media \(max-width:640px\)[\s\S]{0,200}/g) || []).slice(-1));
/* ★iPhone 横向き（844×390）は幅640pxを超えるので、幅だけの条件では旧ボタンが復活する。
   タッチ端末（hover不可・粗いポインタ）も対象に含めることを契約にする。 */
ok('A18b ★★タッチ端末も対象にしている（横向きで旧ボタンが復活しない）',
   /\(hover:none\) and \(pointer:coarse\)/.test(CSS1), CSS1.slice(CSS1.indexOf('#gLoginBtn{ display:none') - 120, CSS1.indexOf('#gLoginBtn{ display:none') + 40));
ok('A19 ★公式ボタンはモバイルで中央・1行表示',
   /#g667btn\{ flex:1 1 100%; display:flex; justify-content:center; margin-top:6px \}/.test(CSS));
ok('A20 ★★旧ボタンの表示名が公式ボタンと同名ではない',
   HOME.indexOf('>🔑 ワンタップログイン（対応ブラウザ）<') > 0
   && HOME.indexOf('>🔑 Googleでログイン<') < 0);
ok('A21 ★ゲート後の案内が「ホームのGoogle公式ログインボタン」を指す',
   SRC.indexOf('ホームのGoogle公式ログインボタンからログインしてください。') > 0
   && SRC.indexOf('左の「Googleでログイン」ボタン') < 0);
/* ★同期できないときの案内も、隠してあるボタンを指してはいけない */
{
  const WHY = bodyOf('whyNotLoggedIn');
  ok('A21b whyNotLoggedIn を取り出せた', WHY.length > 0);
  ok('A21c ★★whyNotLoggedIn に旧文言（左の「🔑 Googleでログイン」）が残っていない',
     WHY.indexOf('左の「🔑 Googleでログイン」') < 0, WHY);
  ok('A21d ★whyNotLoggedIn の2文とも公式ボタンを指す',
     WHY.indexOf('ホームのGoogle公式ログインボタンからログインしてください。') > 0
     && WHY.indexOf('ホームのGoogle公式ログインボタンからログインし直してください。') > 0, WHY);
  ok('A21e ★home.html 全体に旧文言が残っていない',
     HOME.indexOf('左の「🔑 Googleでログイン」') < 0);
}

/* ★物語画面には触っていない */
ok('A16 ★★fix328 に fix667 のコードを入れていない', F328.indexOf('f667') < 0);
ok('A17 ★★fix328 の renderButton 併用は元のまま',
   (F328.match(/renderButton/g) || []).length === 2);

/* ============================================================================
 * B. M1 — 作成前ゲート
 * ========================================================================== */
console.log('\n[B] M1 作成前ゲート');

const NEEDS = bodyOf('f667NeedsGate');
ok('B1 f667NeedsGate を取り出せた', NEEDS.length > 0);
ok('B2 ★緊急OFF v292Dfix667GateOff を見る',
   /f667GateOff\(\)/.test(NEEDS) && /v292Dfix667GateOff/.test(bodyOf('f667GateOff')),
   { needs: /f667GateOff\(\)/.test(NEEDS), off: bodyOf('f667GateOff') });
ok('B2b ★緊急OFF は最初に判定する（他の条件より先）',
   NEEDS.indexOf('f667GateOff()') < NEEDS.indexOf('v292ProxyOff'));
ok('B3 条件: v292ProxyOff !== "1"', /v292ProxyOff/.test(NEEDS));
ok('B4 条件: v292ProxyUrl が存在', /v292ProxyUrl/.test(NEEDS));
ok('B5 条件: v292ProxyPass が空', /v292ProxyPass/.test(NEEDS));
ok('B6 条件: Googleトークンの有効性', /v292GoogleToken/.test(NEEDS));
ok('B7 ★★30秒マージンを生の値で見る（表示用に丸めない）',
   /\(\+t\.exp \* 1000\) > \(Date\.now\(\) \+ 30000\)/.test(NEEDS));
ok('B8 ★Math.round を使っていない', NEEDS.indexOf('Math.round') < 0, NEEDS);

const NEW = bodyOf('newStory');
ok('B9 newStory を取り出せた', NEW.length > 0);
ok('B10 ★★ゲートは slot ID の発行より前にある', (() => {
  const gi = NEW.indexOf('f667ShowGate()');
  const idi = NEW.indexOf("var id = 's'+Date.now()");
  return gi > 0 && idi > 0 && gi < idi;
})(), { gate: NEW.indexOf('f667ShowGate()'), id: NEW.indexOf("var id = 's'+Date.now()") });
ok('B11 ★★ゲートを出したらその場で return する（作成へ進まない）',
   /if \(f667NeedsGate\(\)\)\{ f667ShowGate\(\); return; \}/.test(NEW));
ok('B12 ★force のときだけゲートを飛ばす', /!\(opts && opts\.force\)/.test(NEW));
ok('B13 ★連打ガードがある', /if \(f667Creating\) return;/.test(NEW) && /f667Creating = true/.test(NEW));
ok('B14 容量不足で戻るときは連打ガードを解除する',
   /f667Creating = false; alert\('保存容量が不足/.test(NEW));

const GATE = bodyOf('f667ShowGate');
ok('B15 f667ShowGate を取り出せた', GATE.length > 0);
ok('B16 ★二重表示しない', /if \(el\('f667gate'\)\) return;/.test(GATE));
ok('B17 主ボタンは「Googleでログイン」', /textContent = 'Googleでログイン'/.test(GATE));
ok('B18 副ボタンは「認証設定なしで作成」', /textContent = '認証設定なしで作成'/.test(GATE));
ok('B19 キャンセルは「戻る」', /textContent = '戻る'/.test(GATE));
ok('B20 ★副ボタンの注意文が指定どおり',
   GATE.indexOf('このまま作成すると、開始前にGoogleログインまたはAPI設定が必要になります') >= 0);
ok('B21 ★★「Googleでログイン」は newStory を呼ばない（自動再開しない）', (() => {
  const i = GATE.indexOf('bLogin.addEventListener');
  const j = GATE.indexOf('bForce.addEventListener');
  return i > 0 && j > i && GATE.slice(i, j).indexOf('newStory') < 0;
})());
ok('B22 ★「認証設定なしで作成」だけが force で作成する',
   /bForce\.addEventListener\('click', function\(\)\{[\s\S]{0,120}newStory\(\{ force: true \}\)/.test(GATE));
ok('B23 「戻る」は閉じるだけ',
   /bBack\.addEventListener\('click', function\(\)\{ f667CloseGate\(\); \}/.test(GATE));
ok('B24 ★ゲート本体は localStorage へ書かない', GATE.indexOf('setItem') < 0, GATE.slice(0, 80));

/* ============================================================================
 * C. 回帰 — 触っていないことの確認
 * ========================================================================== */
console.log('\n[C] 回帰');

const INIT = bodyOf('f666InitialSlotData');
ok('C1 ★fix666 の f666InitialSlotData は無変更（他slotを読まない）',
   INIT.indexOf('localStorage') < 0 && INIT.indexOf('chr6_slot_') < 0 && INIT.indexOf('JSON.parse') < 0, INIT);
ok('C2 ★fix666 の cfg は provider と orKey の2項目だけ',
   /provider: 'openrouter'/.test(INIT) && /orKey: '__proxy__'/.test(INIT)
   && !/pollKey|naiKey|orModel|\bkey\s*:/.test(INIT));
ok('C3 ★★== null ガードが残っている',
   /if \(localStorage\.getItem\('chr6_slot_'\+id\) == null\)\{/.test(SRC));
ok('C4 ★初期データは今も f666InitialSlotData() から取る',
   /localStorage\.setItem\('chr6_slot_'\+id, JSON\.stringify\(f666InitialSlotData\(\)\)\)/.test(SRC));
ok('C5 ★P0 のコードも危険 selector も home.html に入っていない',
   HOME.indexOf('data-act="apply"') < 0 && HOME.indexOf('v292DfixP0-inline') < 0);
ok('C6 chr6_active_slot を先に向ける処理は残っている',
   /localStorage\.setItem\('chr6_active_slot', JSON\.stringify\(id\)\)/.test(SRC));
ok('C7 ?new=1 付きで遷移する処理は残っている', /'&new=1'/.test(SRC));
ok('C8 削除は正規サービスへの委譲のまま',
   /__chronicleStoryLifecycle/.test(SRC) && /requestDelete/.test(SRC));

/* ============================================================================
 * D. 版識別子
 * ========================================================================== */
console.log('\n[D] 版識別子');
ok('D1 BUILT が fix667 以降', /fix(6[6-9]\d|[7-9]\d\d)/.test(VER), VER);
{
  const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1');
  ok('D2 index.html の BUILT が version.txt と同値',
     (idx.match(/var BUILT = '([^']+)'/) || [])[1] === VER);
  ok('D3 home.html の HOME_BUILT が version.txt と同値',
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === VER);
  ok('D4 fix654 の BUILD が version.txt と同値',
     (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === VER);
}

/* ============================================================================
 * E. 挙動 — f667NeedsGate を実際に動かす
 * ========================================================================== */
console.log('\n[E] 挙動（f667NeedsGate を実行）');
const mk = (() => {
  const src = bodyOf('f667GateOff') + '\n' + NEEDS;
  return new Function('g', src + '\n return { off: f667GateOff, need: f667NeedsGate };');
})();
const withLS = (o) => mk(k => (k in o ? o[k] : null));
const live = JSON.stringify({ token: 't', exp: Math.floor(Date.now() / 1000) + 3600 });
const dead = JSON.stringify({ token: 't', exp: Math.floor(Date.now() / 1000) - 10 });
const edge = JSON.stringify({ token: 't', exp: Math.floor(Date.now() / 1000) + 20 });  /* 30秒マージン内 */

const cases = [
  ['E1  BYOK（proxy URL なし）→ ゲートなし',        {}, false],
  ['E2  合言葉利用者 → ゲートなし',                  { v292ProxyUrl:'https://x', v292ProxyPass:'p' }, false],
  ['E3  ProxyOff=1 → ゲートなし',                    { v292ProxyUrl:'https://x', v292ProxyOff:'1' }, false],
  ['E4  ★有効なトークン → ゲートなし',               { v292ProxyUrl:'https://x', v292GoogleToken:live }, false],
  ['E5  ★期限切れトークン → ゲートあり',             { v292ProxyUrl:'https://x', v292GoogleToken:dead }, true],
  ['E6  ★トークン無し → ゲートあり',                 { v292ProxyUrl:'https://x' }, true],
  ['E7  ★30秒マージン内（残り20秒）→ ゲートあり',    { v292ProxyUrl:'https://x', v292GoogleToken:edge }, true],
  ['E8  壊れたトークン → ゲートあり',                 { v292ProxyUrl:'https://x', v292GoogleToken:'{{{' }, true],
  ['E9  ★GateOff=1 → ゲートなし（M1だけ無効化）',    { v292ProxyUrl:'https://x', v292GoogleToken:dead, v292Dfix667GateOff:'1' }, false],
  ['E10 空白だけのURL → ゲートなし',                  { v292ProxyUrl:'   ', v292GoogleToken:dead }, false],
  ['E11 空白だけの合言葉は無効扱い → ゲートあり',      { v292ProxyUrl:'https://x', v292ProxyPass:'  ', v292GoogleToken:dead }, true]
];
for (const [name, ls, expect] of cases) {
  let r = null, threw = null;
  try { r = withLS(ls).need(); } catch (e) { threw = String(e && e.message); }
  ok(name, !threw && r === expect, { threw, got: r, expect });
}

console.log('\n─────────────────────────────');
console.log(`結果: pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
