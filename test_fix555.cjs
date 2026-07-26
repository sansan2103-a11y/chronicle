/* 回帰テスト: v292Dfix555 — 句読点だけを直す「校正専用の1回修復」
 *
 * 前提(fix553/554で確定): 句読点崩れは **AIの生の応答の時点で既に発生**している。
 *   3段階(生/パース後/保存後)で maxRun と over80 が完全一致。後段は無実。finish_reason は stop。
 *   実測: turn123 maxRun=93/over80=1、turn158 maxRun=110/over80=2。自然プレイ304ターン中10件(3.3%)。
 *
 * ★このfixがやってよいのは「句読点・空白・改行」だけ。
 *   文字の追加/削除/並べ替え、助詞の変更、内容の変更はすべて**拒否して元を採用する**。
 *   タグを含む区間には触らない。<state>/<react> はモデルへ渡さない。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix555-punct-repair.js'), 'utf8');

/* 実測に近い壊れ方: 句読点ゼロで110字続く段落 */
const BROKEN = 'ヒナだけ膝の中に顔埋めた姿勢変えないままだ呼吸だけ変わった一拍遅れて深くなる息継ぎ一つ分だけ長く伸びたそれは聞いていることを拒否しているのかもしれないそれでも確かに聴いている証拠でもあるのだった';
const FIXED  = 'ヒナだけ膝の中に顔埋めた姿勢変えないままだ。呼吸だけ変わった。一拍遅れて深くなる。息継ぎ一つ分だけ長く伸びた。それは聞いていることを拒否しているのかもしれない。それでも確かに聴いている証拠でもあるのだった。';
const OK_LINE = '灯は足を止めた。耳を澄ませる。潮の匂いが強い。遠くで鐘が鳴った。夕暮れの光が倉庫の影を長く伸ばしている。誰の姿もない。';
const OK_LINE2 = 'カエデが半歩だけ前へ出る。彼女の指先が短剣の柄に触れた。まだ抜かない。';
const TAIL = '\n<state who="アリア" karada="右拳に裂傷" kokoro="警戒" />\n<react who="カエデ" 声="…" />';

function mk(opts){
  opts = opts || {};
  const store = {};
  if (opts.off) store['v292Dfix555Off'] = '1';
  const calls = [];
  const api = {
    call: opts.call || function(sys, user){
      calls.push({ sys: sys, user: user });
      /* 1回目=本文 / 2回目=校正 の順で返す */
      if (calls.length === 1) return Promise.resolve({ text: opts.body });
      return Promise.resolve({ text: JSON.stringify(opts.repair || {}) });
    }
  };
  const w = {
    localStorage: {
      getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
    },
    console: { log(){}, warn(){}, error(){} },
    setTimeout: (fn) => { return 0; }, clearTimeout(){},
    Api: api, __calls: calls, __store: store
  };
  w.window = w;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'fix555' });
  return w;
}

console.log('\n== 骨格の比較(内容が変わっていないことの証明) ==');
{
  const w = mk({ body: 'x' });
  const SK = w.__v292Dfix555._skeleton;
  ok('★句読点だけ足した文は骨格が一致する', SK(BROKEN) === SK(FIXED));
  ok('★1文字でも足すと骨格が違う', SK(BROKEN) !== SK(FIXED + 'あ'));
  ok('★1文字でも消すと骨格が違う', SK(BROKEN) !== SK(FIXED.replace('呼吸', '')));
  ok('★言い換えると骨格が違う', SK(BROKEN) !== SK(FIXED.replace('拒否', '拒絶')));
  ok('★助詞を変えると骨格が違う', SK('灯は歩く') !== SK('灯が歩く'));
  ok('★空白と改行は無視する', SK('あ い\nう') === SK('あいう'));
}

console.log('\n== 本文とタグの切り分け ==');
{
  const w = mk({ body: 'x' });
  const SP = w.__v292Dfix555._splitTail;
  const r = SP(OK_LINE + TAIL);
  ok('★<state>より前だけを本文とする', r.body === OK_LINE + '\n', r.body);
  ok('★<state>/<react>は tail として保持する', r.tail.indexOf('<state') === 0 && r.tail.indexOf('<react') > 0);
  ok('★タグが無ければ全部が本文', SP(OK_LINE).body === OK_LINE && SP(OK_LINE).tail === '');
}

console.log('\n== 対象区間の選び方 ==');
{
  const w = mk({ body: 'x' });
  const P = w.__v292Dfix555._pickSegments;
  const r = P([OK_LINE, BROKEN, '<say who="ノア">' + BROKEN + '</say>'].join('\n'));
  ok('★正常な段落は選ばない', r.picked.every(s => s.text !== OK_LINE));
  ok('★崩れた段落を選ぶ', r.picked.length === 1 && r.picked[0].text === BROKEN, r.picked);
  ok('★★タグを含む段落は触らない(<say>の属性を守る)', r.skippedTagged === 1, r.skippedTagged);
  ok('★段落の位置(index)を持つ', r.picked[0].index === 1, r.picked[0]);
}

console.log('\n== 校正プロンプト ==');
{
  const w = mk({ body: 'x' });
  const p = w.__v292Dfix555._buildPrompt([{ id: 'seg-1', text: BROKEN }]);
  ok('★句読点だけ直すと明示している', /句読点・空白・改行だけ/.test(p.sys));
  ok('★追加・削除・並べ替えを禁じている', /追加しない[\s\S]*削除しない[\s\S]*並べ替えない/.test(p.sys));
  ok('★助詞の変更を禁じている', /助詞を変えない/.test(p.sys));
  ok('★順序の変更を禁じている', /順序を変えない/.test(p.sys));
  ok('★一文80字の目安を入れている', /80字以内/.test(p.sys));
  /* ★実機で確認した失敗: モデルは「顔埋めた姿勢変えない」→「顔を埋めた姿勢を変えない」と
     **助詞を足す**。骨格検証が正しく拒否したが、それでは採用率が0になるので、
     実際に観測した誤りを負の例としてプロンプトに入れる。 */
  ok('★助詞を足す失敗を負の例として明示している', /助詞を足してしまう/.test(p.sys) && /顔\*\*を\*\*埋めた/.test(p.sys));
  ok('★自己点検の手順を書いている', /1文字も違わない/.test(p.sys));
  ok('★対象文をJSONで渡す', p.user.indexOf('"seg-1"') > 0 && p.user.indexOf(BROKEN) > 0);
  ok('★<state>/<react>を渡していない', p.user.indexOf('<state') < 0 && p.user.indexOf('<react') < 0);
}

(async function(){
  console.log('\n== ★正常系: 句読点だけ直った場合は採用する ==');
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': FIXED } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★修復後の本文が入っている', r.text.indexOf(FIXED) >= 0);
    ok('★★<state>/<react>はそのまま残る', r.text.indexOf(TAIL.trim().split('\n')[0]) > 0);
    ok('★正常な段落は1文字も変わらない', r.text.indexOf(OK_LINE) >= 0);
    ok('★骨格が変わっていない', w.__v292Dfix555._skeleton(r.text) === w.__v292Dfix555._skeleton(body));
    ok('★統計に repaired が立つ', w.__v292Dfix555.stats().repaired === 1, w.__v292Dfix555.stats());
    ok('★校正のためのAPI呼出しは1回だけ', w.__calls.length === 2, w.__calls.length);
    ok('★記録が残る', w.__v292Dfix555.dump().slice(-1)[0].result === 'repaired');
  }

  console.log('\n== ★内容が変わっていたら拒否して元を採用する(いちばん大事) ==');
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': FIXED.replace('拒否', '拒絶') } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★★言い換えられたら採用しない', r.text === body, r.text.slice(0, 60));
    ok('★拒否として記録する', w.__v292Dfix555.stats().rejectedContent >= 1, w.__v292Dfix555.stats());
    ok('★repaired は増えない', w.__v292Dfix555.stats().repaired === 0);
  }
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': FIXED + '（そして彼女は泣いた）' } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★★文を足されたら採用しない', r.text === body);
  }
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': '<say who="ヒナ">' + FIXED + '</say>' } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★★タグを足されたら採用しない', r.text === body);
  }
  {
    /* 改善していない(句読点が入っていない)なら採用しない */
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': BROKEN } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★改善していなければ採用しない', r.text === body);
    ok('★no-improve として記録する', w.__v292Dfix555.stats().rejectedNoImprove >= 1 || w.__v292Dfix555.stats().rejectedContent >= 1);
  }

  console.log('\n== 発動しない場合 ==');
  {
    const body = [OK_LINE, OK_LINE2, OK_LINE].join('\n') + TAIL;
    const w = mk({ body: body, repair: {} });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★正常なターンでは校正しない(APIを余計に呼ばない)', w.__calls.length === 1, w.__calls.length);
    ok('★本文はそのまま', r.text === body);
    ok('★fired が立たない', w.__v292Dfix555.stats().fired === 0);
  }
  {
    /* 会話ログ(短いJSON配列)は対象外 */
    const conv = JSON.stringify([{ who: 'ノア', say: '……割った' }]);
    const w = mk({ body: conv, repair: {} });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★会話ログの応答には触らない', r.text === conv && w.__calls.length === 1);
  }
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ off: true, body: body, repair: { 'seg-1': FIXED } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★OFFなら何もしない', r.text === body && w.__calls.length === 1);
  }
  {
    /* 崩れているのがタグ入りの段落だけなら、触らずに終わる */
    const body = [OK_LINE, '<say who="ノア">' + BROKEN + '</say>', OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: {} });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★★タグ入りしか無ければ校正を呼ばない', w.__calls.length === 1, w.__calls.length);
    ok('★本文はそのまま', r.text === body);
    ok('★no-target として記録する', w.__v292Dfix555.dump().slice(-1)[0].result === 'no-target');
  }

  console.log('\n== 失敗しても物語を止めない ==');
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    let n = 0;
    const w = mk({ body: body, call: function(sys, user){
      n++;
      if (n === 1) return Promise.resolve({ text: body });
      return Promise.reject(new Error('network'));
    } });
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★校正が失敗しても元の本文を返す', r.text === body);
    ok('★failed として記録する', w.__v292Dfix555.stats().failed === 1, w.__v292Dfix555.stats());
  }
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: null });
    let n = 0;
    w.Api.call = function(sys, user){
      n++;
      if (n === 1) return Promise.resolve({ text: body });
      return Promise.resolve({ text: 'JSONではない返事です' });
    };
    w.__v292Dfix555._install();
    const r = await w.Api.call('sys', 'user');
    ok('★JSONで返ってこなければ元の本文を返す', r.text === body);
  }
  {
    /* 本文生成そのものが例外なら、そのまま投げ直す(握りつぶさない) */
    const w = mk({ body: 'x', call: function(){ return Promise.reject(new Error('boom')); } });
    w.__v292Dfix555._install();
    let threw = null;
    try { await w.Api.call('sys', 'user'); } catch(e){ threw = e.message; }
    ok('★本文生成の例外は握りつぶさない', threw === 'boom', threw);
  }

  console.log('\n== 再帰しない(1ターン最大1回) ==');
  {
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    let n = 0;
    const w = mk({ body: body, call: function(sys, user){
      n++;
      if (n === 1) return Promise.resolve({ text: body });
      /* 校正結果も崩れたまま返す = もう一度校正したくなる形 */
      return Promise.resolve({ text: JSON.stringify({ 'seg-1': BROKEN }) });
    } });
    w.__v292Dfix555._install();
    await w.Api.call('sys', 'user');
    ok('★★校正リクエストを自分で校正しない(呼出しは2回まで)', n === 2, n);
  }

  console.log('\n== ★多重ラップされても1回だけ働く(fix555b) ==');
  {
    /* 実機で判明: 他のfix(fix333など)が Api.call を後から包み直し own props を継承しないので
       __f555 が消える。印が消えたら包み直してよいが、積み上がると校正を何度も走らせてしまう。 */
    const body = [OK_LINE, BROKEN, OK_LINE2].join('\n') + TAIL;
    const w = mk({ body: body, repair: { 'seg-1': FIXED } });
    w.__v292Dfix555._install();
    delete w.Api.call.__f555;              /* 他のfixが印を消した状況を再現 */
    w.__v292Dfix555._install();            /* もう一度包む */
    const r = await w.Api.call('sys', 'user');
    ok('★★二重に包まれても校正は1回だけ', w.__v292Dfix555.stats().calls === 1, w.__v292Dfix555.stats());
    ok('★結果は正しく適用される', r.text.indexOf(FIXED) >= 0);
    ok('★repaired も1回だけ', w.__v292Dfix555.stats().repaired === 1, w.__v292Dfix555.stats());
  }
  {
    /* 印が消えたら包み直す(=常に鎖の中にいる) */
    const w = mk({ body: 'x' });
    w.__v292Dfix555._install();
    ok('★印がある', !!w.Api.call.__f555);
    delete w.Api.call.__f555;
    ok('★印が消えていても包み直せる', w.__v292Dfix555._install() === true && !!w.Api.call.__f555);
  }

console.log('\n== 出荷物としての体裁 ==');
  {
    ok('★OFFスイッチがある', /v292Dfix555Off/.test(SRC));
    ok('★冪等ガードがある', /if \(window\.__v292Dfix555\) return;/.test(SRC));
    ok('★検証口が出ている', /window\.__v292Dfix555 = \{/.test(SRC));
    ok('★末尾の切り捨てをしていない', !/slice\(0,\s*\d+\)\s*;?\s*\/\/\s*truncate/.test(SRC) && SRC.indexOf('切り捨て(展開') > 0);
    ok('★own props を継承する(fix419cの掟)', /Object\.keys\(prev\)\.forEach/.test(SRC));
    ok('★ユーザへ通知しない(不可視の自動化)', !/showToast|alert\(/.test(SRC));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
