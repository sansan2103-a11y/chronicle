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
  var stats = { turns: 0, flagged: 0, byStage: { model: 0, parse: 0, postprocess: 0, unknown: 0 } };

  function stageOf(s1, s2, s4){
    if (bad(s1)) return 'model';
    if (s1 && bad(s2)) return 'parse';
    if (s2 && bad(s4)) return 'postprocess';
    if (bad(s2)) return 'parse-or-model';   /* 生を取れなかったとき */
    if (bad(s4)) return 'postprocess-or-earlier';
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
                    lastRaw = { text: t, metrics: metrics(t), finish: pickFinish(j), model: pickModel(j), ts: Date.now() };
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
    var st = getS(); if (!st || !Array.isArray(st.turns)) return;
    var n = st.turns.length;
    if (lastLen < 0){ lastLen = n; return; }
    if (n === lastLen) return;
    lastLen = n;
    stats.turns++;

    var t = st.turns[n - 1] || {};
    var s4 = metrics(t.narrative);
    var s1 = lastRaw ? lastRaw.metrics : null;
    var s2 = lastParsed ? lastParsed.metrics : null;

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
        finish: lastRaw ? lastRaw.finish : null,
        model: (lastRaw && lastRaw.model) || (st.cfg && (st.cfg.orModel || st.cfg.model)) || null,
        outLen: (function(){ try { return lsg('v100_outputLen') || (st.cfg && st.cfg.outLen) || null; } catch(e){ return null; } })(),
        rawAgeMs: lastRaw ? (Date.now() - lastRaw.ts) : null,
        sample: sample
      });
    }
    lastRaw = null; lastParsed = null;
  }

  /* ---- boot ----------------------------------------------------------- */
  function boot(){
    /* Planner は index.html の読み込み後に出来るので、出来るまで待つ(最大60秒) */
    (function tryParse(n){
      if (off()) return;
      if (wrapParse()) { try { console.log(TAG, 'parsePlan wrapped'); } catch(e){} return; }
      if (n > 120) return;
      setTimeout(function(){ tryParse(n + 1); }, 500);
    })(0);
    setInterval(poll, 3000);
    try { console.log(TAG, 'ready (読み取り専用・本文は書き換えない)'); } catch(e){}
  }

  window.__v292Dfix553 = {
    metrics: metrics,
    dump: function(){ return read(); },
    stats: function(){ return { turns: stats.turns, flagged: stats.flagged, byStage: stats.byStage, logged: read().length }; },
    clear: function(){ try { localStorage.removeItem(LOG); } catch(e){} return true; },
    off: off,
    _wrapFetch: wrapFetch, _wrapParse: wrapParse, _poll: poll,
    _peek: function(){ return { hasRaw: !!lastRaw, hasParsed: !!lastParsed, lastLen: lastLen }; }
  };

  /* ★fetch のラップだけは「今すぐ・同期で」やる。DOMContentLoaded まで待つと、
     その間に読み込まれる他のfetchラッパより外側になってしまい、生出力が取れなくなる。 */
  if (!off()) wrapFetch();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
