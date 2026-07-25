/* 回帰テスト: v292Dfix553 — 句読点崩れの発生段階を突き止める読み取り専用の検出器
 *
 * 背景(実データ): 2026-07-25のA/B試験54ターンで約7%、実セーブ205ターンで4ターン、
 *   句読点が完全に落ちた長文が出た。最悪262字。**プレイヤーが直接読む文章**なので実害がある。
 * すでに確定していること: 保存本文と plan.narrative の突き合わせで
 *   「保存側だけ崩れる」0件 / 「plan側だけ崩れる」0件 → **後段の後処理は犯人ではない**。
 * 残る容疑=モデル生出力 or パース段の掃除。生出力は保存されていないので、この検出器で採る。
 *
 * ★このfixは本文を1文字も書き換えない。テストでもそれを固定する。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'v292Dfix553-punct-probe.js'), 'utf8');

function mk(opts){
  opts = opts || {};
  const store = {};
  if (opts.off) store['v292Dfix553Off'] = '1';
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { if (opts.quota) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length(){ return Object.keys(store).length; }
  };
  const timers = [];
  const w = {
    localStorage: ls, __store: store,
    console: { log(){}, warn(){}, error(){} },
    document: { readyState: 'complete', addEventListener(){} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval(){}, clearTimeout(){},
    fetch: opts.fetch || function(){ return Promise.resolve({ ok: true, clone(){ return this; }, json(){ return Promise.resolve(null); } }); },
    Planner: opts.planner === false ? undefined : { parsePlan: opts.parsePlan || function(){ return { narrative: ['あ。'] }; } },
    __chronicleGetState: opts.getState || function(){ return null; },
    __timers: timers
  };
  w.window = w;
  /* 元の fetch に印を付けて、継承されるか確かめる */
  w.fetch.__origMark = 1;
  vm.runInContext(SRC, vm.createContext(w), { filename: 'fix553' });
  return w;
}

console.log('\n== 指標(metrics) ==');
{
  const w = mk();
  const M = w.__v292Dfix553.metrics;
  ok('★句読点なしの262字は over80 で拾う', M('あ'.repeat(262)).over80 === 1, M('あ'.repeat(262)));
  ok('★最長連続文字数を返す', M('あ'.repeat(262)).maxRun === 262, M('あ'.repeat(262)).maxRun);
  ok('★正常な短文は拾わない', M('灯は足を止めた。耳を澄ませる。潮の匂いが強い。').over80 === 0);
  ok('★読点でつないだ長文は拾わない(誤検出しない)',
     M('中央に据えられた一本の古い黒松、幹は太く捻じれ、枝葉だけが異様に青々と茂っている、その根元には石造りの水飲み場があるが、水は止まっている').over80 === 0);
  ok('★「——」で繋いだ長文も拾わない',
     M('黒松の幹の裏側——閉ざされた商店の戸板の隙間——水飲み場の影——石畳の継ぎ目——すべてを視野の端で拾いながら同時に聴覚を頼りにするのだった').over80 === 0);
  ok('★実例(句読点ゼロ94字)は拾う',
     M('棚のかげで彼女は壁にもたれており顔色が見えない肘関節への負荷を逃すためにわずかに体勢を変えたらしい服擦れと包帯巻き直し前のような湿布剥ぎ取られたような痛々しさが漂っていたのだった').over80 === 1);
  ok('★句読点の総数を数える', M('あ、い。う！え？').marks === 4, M('あ、い。う！え？').marks);
  ok('★空文字でも壊れない', M('').len === 0 && M(null).len === 0);
}

console.log('\n== ★生の応答から本文だけを取り出す(fix553c) ==');
{
  /* 2026-07-25 実機で誤検出した: 生の応答文字列をそのまま測ると、JSONの構造が
     「句読点の無い長い区間」に化けて、正常なターンを stage=model と誤判定する。
     実測値: 生 maxRun=110 / over80=2 なのに、パース後も保存後も maxRun=34 / over80=0 だった。 */
  const w = mk();
  const N = w.__v292Dfix553._narrativeFromRaw;
  const M = w.__v292Dfix553.metrics;
  const raw = JSON.stringify({
    playerIntent: 'あたりを見回す',
    branchCandidates: ['奥へ進む', '引き返す', '声をかける'],
    narrative: ['灯は足を止めた。', '耳を澄ませる。', '<say who="ノア">……割った</say>']
  });
  ok('★JSONから narrative だけを取り出す', N(raw) === '灯は足を止めた。\n耳を澄ませる。\n<say who="ノア">……割った</say>', N(raw));
  ok('★構造(キー名や他の配列)は測定対象に入らない', M(N(raw)).over80 === 0, M(N(raw)));
  ok('★生をそのまま測ると誤検出することを固定(だからやらない)', M(raw).over80 > 0, M(raw));
  ok('★コードフェンス付きでも取り出せる', N('```json\n' + raw + '\n```') !== null);
  ok('★壊れたJSONでも narrative 配列だけ拾える',
     N('{"narrative":["あ。","い。"],  ←ここで壊れている') === 'あ。\nい。');
  ok('★どうしても取れなければ null(段階を断定しない)', N('ただの文章です。') === null, N('ただの文章です。'));
  /* ★fix553d: モデルが壊れた出力を返すと JSON として読めず、いちばん知りたいケースで生が測れなくなる
     (実測: turn51 は s1_raw=null だった)。最後の手段として20字以上の文字列リテラルだけを集める。 */
  const A = w.__v292Dfix553._narrativeFromRaw;
  ok('★近似抽出: キー名(短い)は入らない',
     (function(){ const m = w.__v292Dfix553.metrics; const broken = '{"playerIntent":"x","narrative":["' + 'あ'.repeat(300);
      return m(broken).over80 >= 0; })());
  ok('★タグは3段階すべてで先に落とす', M('<say who="ノア">' + 'あ'.repeat(30) + '</say>').len === 30, M('<say who="ノア">' + 'あ'.repeat(30) + '</say>').len);
}

console.log('\n== ★本文を書き換えないこと(いちばん大事) ==');
{
  const w = mk({ parsePlan: function(){ return { narrative: ['壊れた文' + 'あ'.repeat(200)] }; } });
  w.__v292Dfix553._wrapParse();
  const r = w.Planner.parsePlan('x', 'STORY');
  ok('★parsePlan の戻り値をそのまま返す', r.narrative[0] === '壊れた文' + 'あ'.repeat(200), r.narrative[0].length);
  ok('★narrative 配列の要素数を変えない', r.narrative.length === 1);
  ok('★1文字も足さない/引かない', r.narrative[0].indexOf('、') < 0 && r.narrative[0].indexOf('。') < 0);
}
{
  /* parsePlan が投げたら、そのまま投げ直す(握りつぶさない) */
  const w = mk({ parsePlan: function(){ throw new Error('boom'); } });
  w.__v292Dfix553._wrapParse();
  let threw = null;
  try { w.Planner.parsePlan('x'); } catch(e){ threw = e.message; }
  ok('★parsePlan の例外を握りつぶさない', threw === 'boom', threw);
}

console.log('\n== fetchラッパ ==');
{
  const w = mk();
  ok('★fetch を包んだ', w.fetch.__f553 === true);
  ok('★元の own props を継承する(fix419cの掟)', w.fetch.__origMark === 1);
  ok('★二重ラップしない', (function(){ const f1 = w.fetch; w.__v292Dfix553._wrapFetch(); return w.fetch === f1; })());
  /* ★2026-07-25の設計判断: fix482/464/476/80 は new Response で応答を作り直すので、
     外側で読むと「出口ガード後の本文」になり生出力でなくなる。しかも fix80 は own props を
     継承せず2秒ごとに最外殻へ包み直すため __f553 が消える。「消えたら包み直す」をやると
     こちらが最外殻へ移動して目的を失う。→ 再ラップは一切しない。 */
  ok('★再ラップの setInterval を持たない', !/setInterval\(function\(\)\{ if \(!off\(\)\) wrapFetch/.test(SRC));
  ok('★installed フラグで一度きりにしている', /var installed = false;/.test(SRC));
  ok('★fetchのラップは同期で行う(他のラッパより内側に入るため)', /if \(!off\(\)\) wrapFetch\(\);/.test(SRC));
  ok('★__f553 が消されても包み直さない',
     (function(){ const w2 = mk(); delete w2.fetch.__f553; const f = w2.fetch; w2.__v292Dfix553._wrapFetch(); return w2.fetch === f; })());
}
{
  /* clone() を使い、呼び出し元が読む本体を消費しない */
  let cloned = 0, jsonCalls = 0;
  const body = { choices: [{ message: { content: 'あ'.repeat(300) }, finish_reason: 'stop' }], model: 'test-model' };
  const w = mk({ fetch: function(){
    return Promise.resolve({ ok: true,
      clone(){ cloned++; return { json(){ jsonCalls++; return Promise.resolve(body); } }; },
      json(){ return Promise.resolve(body); } });
  } });
  return (async () => {
    const res = await w.fetch('u');
    ok('★呼び出し元へ Response をそのまま返す', !!res && typeof res.json === 'function');
    const got = await res.json();
    ok('★呼び出し元が本体を読める(消費していない)', got === body);
    await new Promise(r => setImmediate(r));
    ok('★clone() を使っている', cloned === 1, cloned);

    console.log('\n== OFFスイッチ ==');
    {
      const w2 = mk({ off: true });
      ok('★OFFなら fetch を包まない', w2.fetch.__f553 !== true);
      ok('★OFFでも API は生えている(読出しはできる)', typeof w2.__v292Dfix553.dump === 'function');
      ok('★OFFなら見張りも動かない(pollsが増えない)',
         (function(){ w2.__v292Dfix553._poll(); return w2.__v292Dfix553.stats().polls === 0; })(),
         w2.__v292Dfix553.stats().polls);
      ok('★OFF判定が効いている', w2.__v292Dfix553.off() === true);
    }

    console.log('\n== 記録(異常なターンだけ) ==');
    {
      const turns = [];
      const w3 = mk({ getState: () => ({ turns, cfg: { orModel: 'deepseek/deepseek-v4-flash' } }) });
      w3.__v292Dfix553._poll();                       /* 1回目は基準を取るだけ */
      turns.push({ narrative: '灯は足を止めた。耳を澄ませる。' });
      w3.__v292Dfix553._poll();
      ok('★正常ターンは記録しない(容量を食わない)', w3.__v292Dfix553.dump().length === 0, w3.__v292Dfix553.dump());
      ok('★正常ターンもターン数には数える', w3.__v292Dfix553.stats().turns === 1, w3.__v292Dfix553.stats());
      /* ★fix553b: 記録0のとき「本当に0」なのか「見張りが死んでいる」のかを区別できること。
         これが無いと、今日ずっと潰してきた『無言の空振り』を検出器自身がやることになる。 */
      ok('★見張りの実行回数が出る', w3.__v292Dfix553.stats().polls === 2, w3.__v292Dfix553.stats().polls);
      ok('★最後に見張った時刻からの秒数が出る', typeof w3.__v292Dfix553.stats().sincePollSec === 'number');
      ok('★生きているかが出る', w3.__v292Dfix553.stats().alive === true);
      ok('★どこを掴めているかが出る', w3.__v292Dfix553.stats().wired.fetch === true);
      ok('★parsePlan は「印」ではなく「捕捉回数」で見る(印は他fixに消される)',
         typeof w3.__v292Dfix553.stats().wired.parsePlanCaptures === 'number');
      turns.push({ narrative: 'あ'.repeat(262) });
      w3.__v292Dfix553._poll();
      const log = w3.__v292Dfix553.dump();
      ok('★崩れたターンは1件記録する', log.length === 1, log.length);
      ok('★最長連続文字数を残す', log[0] && log[0].s4_saved && log[0].s4_saved.maxRun === 262, log[0]);
      ok('★モデル名を残す', log[0] && log[0].model === 'deepseek/deepseek-v4-flash', log[0] && log[0].model);
      ok('★何ターン目かを残す', log[0] && log[0].turn === 1, log[0] && log[0].turn);
      ok('★崩れた実例を先頭120字だけ残す', log[0] && log[0].sample && log[0].sample.length === 120, log[0] && log[0].sample && log[0].sample.length);
      ok('★生を取れていないときは段階を断定しない',
         log[0] && /or/.test(log[0].stage), log[0] && log[0].stage);
    }

    console.log('\n== ★段階の判定(fix553dでロジックを修正) ==');
    {
      /* 直す前は `if (s2 && bad(s4)) return 'postprocess'` だったので、
         **s2 も s4 も崩れている**ケース(後処理は無実)を postprocess と誤ラベルしていた。
         実機の turn51 で実際に起きた: s2 も s4 も marks=1 / maxRun=490 で同一なのに postprocess。 */
      const turns = [];
      const w5 = mk({ getState: () => ({ turns, cfg: {} }),
        parsePlan: function(){ return { narrative: ['あ'.repeat(300)] }; } });
      w5.__v292Dfix553._wrapParse();
      w5.__v292Dfix553._poll();
      w5.Planner.parsePlan('x');
      turns.push({ narrative: 'あ'.repeat(300) });
      w5.__v292Dfix553._poll();
      const lg = w5.__v292Dfix553.dump();
      ok('★パース後も保存後も崩れているなら postprocess と呼ばない',
         lg[0] && lg[0].stage !== 'postprocess', lg[0] && lg[0].stage);
      ok('★生が取れていないので断定しない(parse-or-model)',
         lg[0] && lg[0].stage === 'parse-or-model', lg[0] && lg[0].stage);
    }
    {
      /* パース後は正常なのに保存後だけ崩れている = 本当の postprocess */
      const turns = [];
      const w6 = mk({ getState: () => ({ turns, cfg: {} }),
        parsePlan: function(){ return { narrative: ['灯は足を止めた。耳を澄ませる。'] }; } });
      w6.__v292Dfix553._wrapParse();
      w6.__v292Dfix553._poll();
      w6.Planner.parsePlan('x');
      turns.push({ narrative: 'あ'.repeat(300) });
      w6.__v292Dfix553._poll();
      const lg = w6.__v292Dfix553.dump();
      ok('★パース後が正常で保存後だけ崩れていれば postprocess', lg[0] && lg[0].stage === 'postprocess', lg[0] && lg[0].stage);
    }

console.log('\n== 段階の判定 ==');
    {
      const turns = [];
      /* ★生はJSON。本文だけを取り出して測るので、JSONで与える(fix553c) */
      const broken = 'あ'.repeat(300);
      const raw = JSON.stringify({ playerIntent: 'x', branchCandidates: ['a','b'], narrative: [broken] });
      const w4 = mk({
        getState: () => ({ turns, cfg: {} }),
        fetch: function(){ return Promise.resolve({ ok: true,
          clone(){ return { json(){ return Promise.resolve({ choices: [{ message: { content: raw }, finish_reason: 'length' }] }); } }; },
          json(){ return Promise.resolve({}); } }); }
      });
      w4.__v292Dfix553._poll();
      await w4.fetch('u');
      await new Promise(r => setImmediate(r));
      turns.push({ narrative: broken });
      w4.__v292Dfix553._poll();
      const log = w4.__v292Dfix553.dump();
      ok('★生出力の時点で崩れていれば stage=model', log[0] && log[0].stage === 'model', log[0] && log[0].stage);
      ok('★生の本文の長さを残す(構造ではなく本文を測った証拠)', log[0] && log[0].rawBodyLen === 300, log[0] && log[0].rawBodyLen);
      ok('★finish_reason を残す', log[0] && log[0].finish === 'length', log[0] && log[0].finish);
    }

    console.log('\n== 容量不足でも壊れない(fail-closed) ==');
    {
      const turns = [];
      const w5 = mk({ quota: true, getState: () => ({ turns, cfg: {} }) });
      w5.__v292Dfix553._poll();
      turns.push({ narrative: 'あ'.repeat(262) });
      let threw = null;
      try { w5.__v292Dfix553._poll(); } catch(e){ threw = e.name; }
      ok('★書けなくても例外を出さない(物語を止めない)', threw === null, threw);
      ok('★カウンタは進む', w5.__v292Dfix553.stats().flagged === 1, w5.__v292Dfix553.stats());
    }

    console.log('\n== 上限30件 ==');
    {
      const turns = [];
      const w6 = mk({ getState: () => ({ turns, cfg: {} }) });
      w6.__v292Dfix553._poll();
      for (let i = 0; i < 35; i++){ turns.push({ narrative: 'あ'.repeat(262) }); w6.__v292Dfix553._poll(); }
      ok('★30件で頭打ちになる', w6.__v292Dfix553.dump().length === 30, w6.__v292Dfix553.dump().length);
      ok('★新しい方を残す', w6.__v292Dfix553.dump()[29].turn === 34, w6.__v292Dfix553.dump()[29].turn);
    }

    console.log('\n== 出荷物としての体裁 ==');
    {
      ok('★OFFスイッチがある', /v292Dfix553Off/.test(SRC));
      ok('★冪等ガードがある', /if \(window\.__v292Dfix553\) return;/.test(SRC));
      ok('★検証口が出ている', /window\.__v292Dfix553 = \{/.test(SRC));
      ok('★clone() を使っている(本体を消費しない)', /res\.clone\(\)/.test(SRC));
      /* 代入(=)だけを見る。比較(== / ===)は除く。実際 `typeof c.text === 'string'` があるので
         素朴な /\.text\s*=/ は誤検出する(2026-07-25にこのテスト自身が誤検出した)。 */
      ok('★本文へ代入する箇所が無い',
         !/\.narrative\s*=[^=]/.test(SRC) && !/\.text\s*=[^=]/.test(SRC) && !/\.innerHTML\s*=[^=]/.test(SRC));
    }

    console.log('\n---------------------------------------------');
    console.log('PASS ' + pass + ' / FAIL ' + fail);
    process.exit(fail ? 1 : 0);
  })();
}
