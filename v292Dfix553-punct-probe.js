/* v292Dfix553-punct-probe.js (2026-07-25) — 句読点崩れの発生段階を突き止める「読み取り専用」検出器
 *
 * ■何を直すためのものか(まだ直さない)
 *   2026-07-25のA/B試験(54ターン)で、**句読点が完全に落ちた長文**が約7%のターンで出た。
 *   実セーブ205ターンでも4ターンで再現。最悪例は262字にわたって「、」も「。」も無い。
 *   プレイヤーが直接読む文章なので実害がある。
 *
 * ■すでに実データで分かっていること(2026-07-25)
 *   ・保存本文 と plan.narrative(パース段の掃除まで通した状態) を205ターンで突き合わせた結果、
 *     **保存側だけが崩れている例は0件・plan側だけ崩れている例も0件**。
 *     → 後段の後処理(fix53/300/439/467 など)が壊しているのでも、直しているのでもない。
 *   ・崩れは1ターンの**後半に偏る**(実例: 18要素中 0〜13は正常、14/15/17だけ句読点ゼロ)。
 *   → 残る容疑は「モデルの生出力」か「パース段の掃除」の2つ。**生出力は保存されていない**ので測れない。
 *
 * ■だからこれは何をするか
 *   ①生の応答(fetch) ②Planner.parsePlan の戻り値 ③保存された本文 の3段階で指標だけを採る。
 *   **本文は書き換えない。例外は必ず投げ直す。判定も修正もしない。**
 *   異常が出たターンだけ1件記録する(正常ターンは記録しない=容量を食わない)。
 *
 * ■指標(GPT指定)
 *   ・maxRun  : 句読点(、。！？…)なしで続く最長文字数
 *   ・over80  : 80字以上の無句読点区間の数     ← 主指標
 *   ・over55  : 55字以上の無句読点区間の数     ← 参考
 *   ・marks   : 本文全体の句読点の数
 *   ・len     : 文字数
 *   加えて model / outLen / finish_reason / 段階(stage) を残す。
 *
 * OFF   = localStorage['v292Dfix553Off'] = '1'
 * 読出  = window.__v292Dfix553.dump() / .stats() / .clear() / .metrics(text)
 * 保存先= localStorage['v292Dfix553_log'](上限30件・古いものから捨てる)
 */
(function v292Dfix553(){
  if (window.__v292Dfix553) return;
  var TAG = '[v292Dfix553]';
  var LOG = 'v292Dfix553_log';
  var MAX = 30;
  var OVER = 80;            /* 主指標のしきい値 */
  var OVER2 = 55;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix553Off') === '1'; }

  /* ---- 指標 ---------------------------------------------------------- */
  /* 「、。！？…」に加えて、この作品で文の区切りに使われる ——／──／\n も区切りとして数える。
     そうしないと「——」で繋いだ正常な長文まで異常として拾ってしまう(実測で誤検出した)。 */
  var SPLIT = /[、。！？!?\n…]|——|──|―――|、/;
  function metrics(text){
    var s = String(text == null ? '' : text);
    /* ★fix553c: タグは3段階すべてで先に落とす。plan.narrative には <say who="…">…</say> が
       要素として入るので、落とさないと段階間で土俵が揃わない。 */
    s = s.replace(/<[^>]*>/g, '');
    var parts = s.split(new RegExp(SPLIT.source, 'g'));
    var max = 0, o80 = 0, o55 = 0;
    for (var i = 0; i < parts.length; i++){
      var n = parts[i].trim().length;
      if (n > max) max = n;
      if (n >= OVER) o80++;
      if (n >= OVER2) o55++;
    }
    var marks = (s.match(/[、。！？!?…]/g) || []).length;
    return { len: s.length, marks: marks, maxRun: max, over80: o80, over55: o55 };
  }
  function bad(m){ return !!(m && m.over80 > 0); }

  /* ---- 記録 ---------------------------------------------------------- */
  function read(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function write(a){
    /* fail-closed: 書けなければ黙って諦める(fix543が本物の保存失敗を見ているので、
       診断の書込み失敗でユーザの物語を止めない)。ただし自分のキーは fix543 の集計に混ぜない。 */
    try { localStorage.setItem(LOG, JSON.stringify(a.slice(-MAX))); } catch(e){}
  }
  /* ★fix553b: 見張り自身が止まっていても気づけるように polls/lastPollTs を出す。
     この検出器は「異常が無ければ何も記録しない」設計なので、記録0のとき
     「本当に0なのか、見張りが死んでいるのか」を区別できないと今日ずっと潰してきた
     『無言の空振り』を自分でやることになる。 */
  var stats = { turns: 0, flagged: 0, polls: 0, lastPollTs: 0,
                byStage: { model: 0, parse: 0, postprocess: 0, unknown: 0 },
                /* ★fix553e(GPT指定): 異常ログ0件は**それだけでは何の証明にもならない**。
                   「1ターンについて3段階が揃った件数」が生存証明になる。 */
                capture: { raw: 0, rawUsable: 0, parsed: 0, saved: 0, all3: 0, rawApprox: 0 } };

  /* ★fix553d(2026-07-25・実機で誤ラベルしたので修正):
     「前の段階が**正常だったのに**次の段階で崩れた」ときだけ、その段階を犯人と呼ぶ。
     直す前は `if (s2 && bad(s4)) return 'postprocess'` だったので、
     **s2 も s4 も崩れている**ケース(=後処理は無実)を postprocess と呼んでいた。
     実際に turn51 でそれが起きた(s2 も s4 も marks=1 / maxRun=490 で同一なのに postprocess と出た)。 */
  /* ★fix553e(2026-07-25・実機で誤ラベルしたので追加): 生の抽出は**部分的にしか取れないことがある**。
     実測: turn92 は生が99字しか取れていないのに、パース後は776字あった(=別のfetchを拾ったか抽出失敗)。
     その99字が「きれい」だからといって「生は正常だった」とは言えないのに、`parse` と断定していた。
     → 生が後段の6割の長さに届かないときは**生は無かったことにして、段階を断定しない**。 */
  function usable(s1, ref){
    if (!s1 || !ref) return false;
    return s1.len >= Math.floor(ref.len * 0.6);
  }
  function stageOf(s1raw, s2, s4){
    var s1 = usable(s1raw, s2 || s4) ? s1raw : null;
    if (bad(s1)) return 'model';                                  /* 生の時点で崩れている */
    if (s1 && !bad(s1) && bad(s2)) return 'parse';                /* 生は正常 → パース段で崩れた */
    if (s2 && !bad(s2) && bad(s4)) return 'postprocess';          /* パース後は正常 → 後段で崩れた */
    if (!s1 && bad(s2)) return 'parse-or-model';                  /* 生が取れていない */
    if (!s2 && bad(s4)) return 'postprocess-or-earlier';          /* パース後が取れていない */
    return 'unknown';
  }

  function record(rec){
    var a = read(); a.push(rec); write(a);
    stats.flagged++;
    var k = rec.stage;
    if (stats.byStage[k] == null) stats.byStage[k] = 0;
    stats.byStage[k]++;
    try { console.warn(TAG, '句読点崩れを検出', rec.stage, rec); } catch(e){}
  }

  /* ---- ①生の応答をとる(fetchを包む) ----------------------------------- */
  var lastRaw = null;   /* { text, metrics, finish, model, ts } */

  function pickText(json){
    /* Worker/OpenRouter/Anthropic のどれでも本文らしき文字列を拾う。取れなければ null。 */
    try {
      if (!json) return null;
      if (typeof json === 'string') return json;
      if (json.choices && json.choices[0]){
        var c = json.choices[0];
        if (c.message && typeof c.message.content === 'string') return c.message.content;
        if (typeof c.text === 'string') return c.text;
      }
      if (Array.isArray(json.content)){
        var out = '';
        for (var i = 0; i < json.content.length; i++){
          if (json.content[i] && typeof json.content[i].text === 'string') out += json.content[i].text;
        }
        if (out) return out;
      }
      if (typeof json.output === 'string') return json.output;
      if (typeof json.text === 'string') return json.text;
    } catch(e){}
    return null;
  }
  /* ★fix553c(2026-07-25・実機で誤検出したので追加): 生の応答文字列をそのまま測ってはいけない。
     モデルはJSONを返す契約なので、`{"playerIntent":"…","branchCandidates":[…]` のような
     **構造そのもの**が「句読点の無い長い区間」に化け、正常なターンを stage=model と誤判定した
     (実測: 生 maxRun=110/over80=2 なのに、パース後も保存後も maxRun=34/over80=0)。
     → 生からも**本文(narrative)だけ**を取り出し、②③と同じ土俵で測る。
     取り出せなければ null を返し、**段階を断定しない**。 */
  function narrativeFromRaw(t){
    var s = String(t == null ? '' : t).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      var j = JSON.parse(s);
      if (j && Array.isArray(j.narrative)) return j.narrative.join('\n');
    } catch(e){}
    var m = s.match(/"narrative"\s*:\s*\[([\s\S]*?)\]/);
    if (m){
      try { var arr = JSON.parse('[' + m[1] + ']'); if (Array.isArray(arr)) return arr.join('\n'); } catch(e2){}
    }
    return null;
  }
  /* ★fix553d: モデルが壊れた出力を返すと JSON として読めず、上の2手が両方失敗して
     **いちばん知りたいケースで生が測れなくなる**(実測: turn51 は s1_raw=null だった)。
     最後の手段として「20字以上の文字列リテラルだけ」を集める。キー名は短いので入らず、
     構造記号も入らないので、JSONそのものを測る誤検出は起きない。近似なので approx を立てる。 */
  function narrativeApprox(t){
    var s = String(t == null ? '' : t);
    var lits = s.match(/"(?:[^"\\]|\\.)*"/g);
    if (!lits) return null;
    var out = [];
    for (var i = 0; i < lits.length; i++){
      var v = null;
      try { v = JSON.parse(lits[i]); } catch(e){ v = lits[i].slice(1, -1); }
      if (typeof v === 'string' && v.length >= 20) out.push(v);
    }
    return out.length ? out.join('\n') : null;
  }

  function pickFinish(json){
    try {
      if (json && json.choices && json.choices[0]) return json.choices[0].finish_reason || json.choices[0].stop_reason || null;
      if (json && json.stop_reason) return json.stop_reason;
    } catch(e){}
    return null;
  }
  function pickModel(json){ try { return (json && json.model) || null; } catch(e){ return null; } }

  /* ★このラッパは「一度だけ・できるだけ内側(nativeに近い側)」に置く。
     理由: fix482/464/476/80 は `new Response(...)` で応答を作り直すので、外側で読むと
     「出口ガードを通したあとの本文」になり、**モデルの生出力ではなくなる**。
     また fix80 は2秒ごとに最外殻へ包み直し own props を継承しないため、`__f553` が消える。
     そこで「消えたら包み直す」をやると、こちらが最外殻へ移動してしまい目的を失う。
     → 再ラップは絶対にしない。installed フラグで一度きりにする。 */
  var installed = false;
  function wrapFetch(){
    try {
      if (installed) return;
      var prev = window.fetch;
      if (!prev || prev.__f553) { installed = true; return; }
      var wrapped = function(){
        var p = prev.apply(this, arguments);
        if (off() || !p || typeof p.then !== 'function') return p;
        return p.then(function(res){
          /* ★clone() を使い、呼び出し元が読む本体は一切消費しない */
          try {
            if (res && typeof res.clone === 'function' && res.ok){
              res.clone().json().then(function(j){
                try {
                  var t = pickText(j);
                  if (t && t.length > 200){        /* 会話ログ(短いJSON配列)は拾わない */
                    var body = narrativeFromRaw(t), approx = false;
                    if (body == null){ body = narrativeApprox(t); approx = (body != null); }
                    lastRaw = { metrics: body == null ? null : metrics(body),
                                bodyLen: body == null ? null : body.length,
                                approx: approx,
                                finish: pickFinish(j), model: pickModel(j), ts: Date.now() };
                  }
                } catch(e){}
              }, function(){});
            }
          } catch(e){}
          return res;
        });
        /* 失敗は握りつぶさない: then の第2引数を付けないので元の rejection がそのまま伝わる */
      };
      wrapped.__f553 = true;
      /* ★fix419cの掟: 内側関数の own props を全継承する */
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f553') wrapped[k] = prev[k]; }); } catch(e){}
      try { Object.defineProperty(wrapped, 'name', { value: prev.name || 'wrapped', configurable: true }); } catch(e){}
      window.fetch = wrapped;
      installed = true;
    } catch(e){}
  }

  /* ---- ②パース直後をとる(Planner.parsePlan を包む) --------------------- */
  var lastParsed = null;
  var pairedRaw = null;        /* parsePlan が走った瞬間の lastRaw = 本文の生 */
  var parsedCaptures = 0;

  /* ★fix553d: parsePlan は他のfix(fix155/159/427など)が後から包み直すことがあり、
     そのとき own props を継承しないので `__f553` が消える。fetch と違って
     **parsePlan は最外殻の方が正しい**(submit() が実際に受け取る plan を測りたいため)。
     よって消えていたら包み直してよい。ただし「掴めているか」は
     __f553 の有無ではなく **実際に捕捉した回数** で見る(印だけ見ると false negative になる)。 */
  function wrapParse(){
    try {
      var P = window.Planner || (function(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } })();
      if (!P || typeof P.parsePlan !== 'function' || P.parsePlan.__f553) return false;
      var prev = P.parsePlan;
      var wrapped = function(){
        var r = prev.apply(this, arguments);      /* 例外はそのまま伝播させる */
        try {
          if (!off() && r && Array.isArray(r.narrative)){
            lastParsed = { metrics: metrics(r.narrative.join('\n')), n: r.narrative.length, ts: Date.now() };
            parsedCaptures++;
            /* ★★fix553e(いちばん大事な修正): 1ターンの中で fetch は2回以上走る。
               順番は 本文fetch → parsePlan → 会話ログfetch → 保存 → poll。
               つまり poll の時点で lastRaw は**会話ログの応答**に上書きされている。
               実測: turn92 は生が99字しか無いのに本文は776字あった(= 別の応答を掴んでいた)。
               → parsePlan が走った**この瞬間**の lastRaw を本文の生としてペアにする。 */
            pairedRaw = lastRaw;
            lastRaw = null;
          }
        } catch(e){}
        return r;
      };
      wrapped.__f553 = true;
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f553') wrapped[k] = prev[k]; }); } catch(e){}
      P.parsePlan = wrapped;
      return true;
    } catch(e){ return false; }
  }

  /* ---- ③保存された本文をとる(ターン数の増加を見る) --------------------- */
  function getS(){ try { return window.__chronicleGetState('fix553'); } catch(e){ return null; } }
  var lastLen = -1;

  function poll(){
    if (off()) return;
    stats.polls++; stats.lastPollTs = Date.now();
    var st = getS(); if (!st || !Array.isArray(st.turns)) return;
    var n = st.turns.length;
    if (lastLen < 0){ lastLen = n; return; }
    if (n === lastLen) return;
    lastLen = n;
    stats.turns++;

    var t = st.turns[n - 1] || {};
    var s4 = metrics(t.narrative);
    /* ★生は「parsePlanと対になったもの」を使う。lastRaw をそのまま使うと会話ログの応答を掴む */
    var raw = pairedRaw || lastRaw;
    var s1 = raw ? raw.metrics : null;
    var s2 = lastParsed ? lastParsed.metrics : null;

    if (s1) stats.capture.raw++;
    if (usable(s1, s2 || s4)) stats.capture.rawUsable++;
    if (raw && raw.approx) stats.capture.rawApprox++;
    if (s2) stats.capture.parsed++;
    if (s4) stats.capture.saved++;
    if (s1 && s2 && s4) stats.capture.all3++;

    if (bad(s1) || bad(s2) || bad(s4)){
      var sample = '';
      try {
        var parts = String(t.narrative || '').split(new RegExp(SPLIT.source, 'g'));
        var worst = ''; for (var i = 0; i < parts.length; i++){ if (parts[i].trim().length > worst.length) worst = parts[i].trim(); }
        sample = worst.slice(0, 120);
      } catch(e){}
      record({
        ts: new Date().toISOString(),
        turn: n - 1,
        stage: stageOf(s1, s2, s4),
        s1_raw: s1, s2_parsed: s2, s4_saved: s4,
        rawBodyLen: raw ? raw.bodyLen : null,
        rawApprox: raw ? !!raw.approx : null,
        rawPaired: !!pairedRaw,
        /* 生が後段と比べて短すぎないか(短ければ段階の断定に使っていない) */
        rawUsable: usable(s1, s2 || s4),
        finish: raw ? raw.finish : null,
        model: (raw && raw.model) || (st.cfg && (st.cfg.orModel || st.cfg.model)) || null,
        outLen: (function(){ try { return lsg('v100_outputLen') || (st.cfg && st.cfg.outLen) || null; } catch(e){ return null; } })(),
        rawAgeMs: raw ? (Date.now() - raw.ts) : null,
        sample: sample
      });
    }
    lastRaw = null; lastParsed = null; pairedRaw = null;
  }

  /* ---- boot ----------------------------------------------------------- */
  function boot(){
    /* Planner は index.html の読み込み後に出来るので、出来るまで待つ(最大60秒) */
    (function tryParse(n){
      if (off()) return;
      if (wrapParse()) { try { console.log(TAG, 'parsePlan wrapped'); } catch(e){} }
      else if (n > 120) return;
      /* ★包めても止めない: 他のfixが包み直して外れることがあるので見張り続ける */
      setTimeout(function(){ tryParse(n + 1); }, n > 120 ? 5000 : 500);
    })(0);
    setInterval(poll, 3000);
    try { console.log(TAG, 'ready (読み取り専用・本文は書き換えない)'); } catch(e){}
  }

  window.__v292Dfix553 = {
    metrics: metrics,
    dump: function(){ return read(); },
    stats: function(){
      return { turns: stats.turns, flagged: stats.flagged, byStage: stats.byStage, logged: read().length,
               /* ★3段階が揃った件数(all3)が「見張りが生きている」証明。異常0件はそれ単体では証明にならない */
               capture: stats.capture,
               /* ★見張りの生死。polls が増えない = 検出器が死んでいる(記録0の意味が変わる) */
               polls: stats.polls,
               sincePollSec: stats.lastPollTs ? Math.round((Date.now() - stats.lastPollTs) / 1000) : null,
               alive: !!stats.lastPollTs && (Date.now() - stats.lastPollTs) < 120000,
               /* ★印(__f553)の有無ではなく「実際に捕捉した回数」で見る。
                  他のfixが包み直すと印は消えるが、こちらのラッパは鎖の中で生きている。 */
               wired: { fetch: installed, parsePlanCaptures: parsedCaptures,
                        parsePlanMarked: !!(function(){ try { var P = window.Planner; return P && P.parsePlan && P.parsePlan.__f553; } catch(e){ return false; } })() } };
    },
    clear: function(){ try { localStorage.removeItem(LOG); } catch(e){} return true; },
    off: off,
    _wrapFetch: wrapFetch, _wrapParse: wrapParse, _poll: poll, _narrativeFromRaw: narrativeFromRaw,
    _peekPair: function(){ return { paired: !!pairedRaw, pairedLen: pairedRaw ? pairedRaw.bodyLen : null }; },
    _peek: function(){ return { hasRaw: !!lastRaw, hasParsed: !!lastParsed, lastLen: lastLen }; }
  };

  /* ★fetch のラップだけは「今すぐ・同期で」やる。DOMContentLoaded まで待つと、
     その間に読み込まれる他のfetchラッパより外側になってしまい、生出力が取れなくなる。 */
  if (!off()) wrapFetch();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
