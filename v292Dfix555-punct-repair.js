/* v292Dfix555-punct-repair.js (2026-07-25) — 句読点だけを直す「校正専用の1回修復」
 *
 * ■なぜ必要か(実データで原因確定済み = fix553/554)
 *   句読点が完全に落ちた長文が **AIの生の応答の時点で既に発生**している。
 *   3段階(生 → パース後 → 保存後)で maxRun と over80 が完全一致し、後段は無実だった。
 *   実測: turn123 生 maxRun=93/over80=1、turn158 生 maxRun=110/over80=2。どちらも finish_reason=stop。
 *   発生率は自然プレイ 304ターン中10件 = 3.3%。**プレイヤーが直接読む文章**なので実害がある。
 *
 * ■何をするか(GPT裁定の初版・意図的に最小)
 *   ・入る場所 = Api.call の直後・Planner.parsePlan の**前**。生の応答から本文だけを取り出し、
 *     **異常だった区間だけ**を校正専用のリクエストで直す。1ターン最大1回。
 *   ・直してよいのは **句読点・空白・改行だけ**。文字の追加/削除/並べ替えも助詞の変更も禁止。
 *   ・タグを含む区間は**触らない**(<say> の属性・順序をバイト単位で守るため)。
 *     <state>/<react> は**モデルへ渡さない**。
 *   ・検証: 句読点と空白を除いた「骨格」が修復前後で**完全一致**すること。1文字でも違えば**元を採用**。
 *     さらに maxRun が改善し over80 が減っていること。満たさなければ**元を採用**(fail-closed)。
 *   ・ユーザには成功も失敗も通知しない(不可視の自動化)。診断だけ残す。
 *
 * ■やらないこと(初版では意図的に見送り)
 *   ・末尾の切り捨て(展開・台詞・状態変化・伏線を失うため却下)
 *   ・助詞の修正 / 反復表現の削除(意味変更の範囲が一気に広がるため、別の修復として設計する)
 *
 * OFF   = localStorage['v292Dfix555Off'] = '1'
 * 読出  = window.__v292Dfix555.stats() / .dump() / .clear()
 * 依存  = window.__v292Dfix553.metrics(あれば使う。無ければ内蔵の同等実装)
 */
(function v292Dfix555(){
  if (window.__v292Dfix555) return;
  var TAG = '[v292Dfix555]';
  var LOG = 'v292Dfix555_log';
  var MAX = 20;
  var OVER = 80;                 /* この長さ以上の無句読点区間があれば発動 */
  var MAX_SEGS = 6;              /* 1回で送る区間の上限 */
  /* ★fix555d(GPT裁定): 実測15秒。20秒だと正常な修復まで切ってしまうので30秒。
     1ターンの本文生成が60〜120秒かかる環境で、異常時だけ最大30秒追加は許容範囲。
     発生率3.3%・平均15秒なら全ターン平均の追加待ちは 15×0.033 ≒ 0.5秒/ターン。 */
  var TIMEOUT_MS = 30000;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix555Off') === '1'; }

  /* ---- 指標(fix553と同じ土俵で測る) ----------------------------------- */
  var SPLIT = /[、。！？!?\n…]|——|──|―――/;
  function metricsLocal(text){
    var s = String(text == null ? '' : text).replace(/<[^>]*>/g, '');
    var parts = s.split(new RegExp(SPLIT.source, 'g'));
    var max = 0, o80 = 0;
    for (var i = 0; i < parts.length; i++){
      var n = parts[i].trim().length;
      if (n > max) max = n;
      if (n >= OVER) o80++;
    }
    return { len: s.length, marks: (s.match(/[、。！？!?…]/g) || []).length, maxRun: max, over80: o80 };
  }
  function metrics(t){
    try { if (window.__v292Dfix553 && typeof window.__v292Dfix553.metrics === 'function') return window.__v292Dfix553.metrics(t); } catch(e){}
    return metricsLocal(t);
  }

  /* ---- 骨格の比較(内容が変わっていないことの証明) ---------------------- */
  /* 直してよいのは句読点・空白・改行だけ。それらを取り除いた文字列が完全一致するなら、
     モデルは1文字も足しても消しても並べ替えてもいない。1文字でも違えば拒否する。 */
  function skeleton(s){
    return String(s == null ? '' : s).replace(/[、。，．,\.！？!?…‥\s　]/g, '');
  }

  /* ---- 本文とタグの切り分け -------------------------------------------- */
  /* 応答は「素の本文 + <say>/<state>/<react> タグ」(新エンジン fix192)。
     <react / <state から後ろは管理情報なので、**モデルへ渡さない**。 */
  function splitTail(text){
    var s = String(text == null ? '' : text);
    var m = s.search(/<react|<state/);
    if (m < 0) return { body: s, tail: '' };
    return { body: s.slice(0, m), tail: s.slice(m) };
  }
  function hasTag(s){ return /<[^>]*>/.test(s); }

  /* ---- 発動判定 -------------------------------------------------------- */
  /* 異常なのは「タグを含まない・80字以上の無句読点区間を持つ」段落だけ。
     タグを含む段落は触らない(=<say>の属性と順序をバイト単位で守る)。 */
  function pickSegments(body){
    var lines = String(body).split('\n');
    var picked = [], skippedTagged = 0;
    for (var i = 0; i < lines.length; i++){
      var L = lines[i];
      if (metrics(L).over80 < 1) continue;
      if (hasTag(L)){ skippedTagged++; continue; }
      picked.push({ id: 'seg-' + i, index: i, text: L });
    }
    return { lines: lines, picked: picked.slice(0, MAX_SEGS), skippedTagged: skippedTagged,
             overflow: Math.max(0, picked.length - MAX_SEGS) };
  }

  /* ---- 記録 ------------------------------------------------------------ */
  var stats = { fired: 0, repaired: 0, rejectedContent: 0, rejectedNoImprove: 0,
                failed: 0, timedOut: 0, lateDropped: 0, skippedTagged: 0, calls: 0, ms: 0, msList: [],
                viaDirect: 0, viaApiCall: 0 };
  /* ★fix555d: Api.call は AbortSignal を受け取らないので通信そのものは止められない。
     代わりに**試行トークン**で囲い、遅れて届いた修復結果を次の生成へ混ぜない。 */
  var attemptSeq = 0;
  function read(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function write(a){ try { localStorage.setItem(LOG, JSON.stringify(a.slice(-MAX))); } catch(e){} }
  function note(rec){ var a = read(); a.push(rec); write(a); }

  /* ---- 校正プロンプト --------------------------------------------------- */
  function buildPrompt(segs){
    var sys = [
      'あなたは日本語の校正器です。渡された文章の**句読点・空白・改行だけ**を直します。',
      '厳守事項:',
      '・文字を追加しない。削除しない。並べ替えない。言い換えない。',
      '・助詞を変えない。漢字やかなを変えない。人名・地名・数値を変えない。',
      '・事実、出来事、台詞の内容、出来事の順序を変えない。',
      '・やってよいのは「、」「。」を適切な位置に入れること、余分な空白を整えること、段落を分けることだけ。',
      '・一文は原則80字以内になるように区切る。意味の切れ目で句読点を入れる。',
      '・出力は渡されたJSONと同じ id をキーに持つJSONオブジェクトのみ。説明文やコードフェンスを書かない。',
      '',
      '★いちばん多い失敗: **助詞を足してしまう**こと。これをやると採用されません。',
      '  誤: 「顔埋めた姿勢変えないままだ」→「顔**を**埋めた姿勢**を**変えないままだ」(「を」を2つ足した)',
      '  正: 「顔埋めた姿勢変えないままだ」→「顔埋めた姿勢、変えないままだ。」(句読点だけ足した)',
      '  文が不自然に見えても、**足りない助詞は補わない**。句読点を置く位置だけで区切ってください。',
      '',
      '自己点検: 出力から「、」「。」「！」「？」「…」と空白を取り除いた文字列が、',
      '入力から同じものを取り除いた文字列と**1文字も違わない**ことを確かめてから答えてください。',
      '出力形式: {"seg-0":"直した文章", "seg-3":"直した文章"}'
    ].join('\n');
    var payload = {};
    segs.forEach(function(s){ payload[s.id] = s.text; });
    var user = '次の各区間の句読点だけを直してください。\n' + JSON.stringify(payload, null, 1);
    return { sys: sys, user: user };
  }
  function parseRepairJSON(t){
    var s = String(t == null ? '' : t).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { var j = JSON.parse(s); return (j && typeof j === 'object' && !Array.isArray(j)) ? j : null; } catch(e){}
    var m = s.match(/\{[\s\S]*\}/);
    if (m){ try { var j2 = JSON.parse(m[0]); return (j2 && typeof j2 === 'object' && !Array.isArray(j2)) ? j2 : null; } catch(e2){} }
    return null;
  }

  /* ---- ★fix556: 校正だけは専用のリクエストで送る -------------------------
     実測(2026-07-26)で分かった真因:
       `Api.call` の OpenRouter 経路は **temperature 0.85 / top_p 0.95 /
        frequency_penalty 0.4 / presence_penalty 0.4** という**創作用の設定**を使う。
       frequency/presence penalty は「同じ語を繰り返すな」という圧力なので、
       **入力をそのまま書き写すのが仕事の校正には最悪**。これが
       「助詞を足す」「言い換える」の温床だった。
       さらに空出力のとき Api.call は内部で**3回**まで再試行するので、
       失敗ケースが 60〜80秒に伸びていた(=「返ってこない」ように見えていた)。
     → 校正は temperature 0 / penalty 0 / 再試行なし の専用リクエストで送る。
     プロバイダが分からない場合は従来どおり Api.call へ落とす。 */
  function normKey(k){ return String(k == null ? '' : k).replace(/[\s\u3000]/g, ''); }
  function getState555(){ try { return window.__chronicleGetState('fix555'); } catch(e){ return null; } }

  function repairRequest(sys, user, ms){
    var st = getState555();
    var cfg = st && st.cfg;
    if (!cfg) return null;
    var prov = cfg.provider || 'anthropic';
    var ctrl = null;
    try { ctrl = new AbortController(); } catch(e){}
    if (ctrl) setTimeout(function(){ try { ctrl.abort(); } catch(e){} }, ms || TIMEOUT_MS);

    if (prov === 'openrouter'){
      var key = normKey(cfg.orKey);
      if (!key) return null;
      return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key,
                   'HTTP-Referer': 'https://sansan2103-a11y.github.io/chronicle/', 'X-Title': 'Chronicle TRPG' },
        body: JSON.stringify({
          model: cfg.orModel || 'deepseek/deepseek-v4-flash',
          max_tokens: 2000,
          temperature: 0,          /* ★校正は決定的に */
          top_p: 1,
          frequency_penalty: 0,    /* ★入力をそのまま書き写すので繰り返しへの罰はゼロ */
          presence_penalty: 0,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
        }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(res){
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function(j){
        var t = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        return { text: String(t).trim() };
      });
    }
    if (prov === 'anthropic'){
      var akey = normKey(cfg.key);
      if (!akey) return null;
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': akey,
                   'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 2000, temperature: 0,
                               system: sys, messages: [{ role: 'user', content: user }] }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(res){
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function(j){
        var t = ((j && j.content) || []).map(function(c){ return (c && c.text) || ''; }).join('');
        return { text: String(t).trim() };
      });
    }
    return null;   /* 未知のプロバイダは従来どおり Api.call へ */
  }

  /* ---- Api.call を包む -------------------------------------------------- */
  var inRepair = false;         /* 校正リクエスト自身を対象にしない(再帰防止) */
  var installed = false;
  /* ★fix555b(実機で判明): 他のfix(fix333など)が Api.call を後から包み直し、
     own props を継承しないため `__f555` が消える。印が消えたら包み直してよい
     (このfixは Planner.parsePlan の前でありさえすればよく、Api.call の層の内外は問わない)。
     ただし多重ラップが積み上がると校正を何度も走らせてしまうので、
     **自分の中に入っていたら素通しする** depth ガードを置く。 */
  var depth = 0;

  function getApi(){
    try { if (window.Api) return window.Api; } catch(e){}
    try { if (typeof Api !== 'undefined' && Api) return Api; } catch(e){}
    try { return (0,eval)('typeof Api!=="undefined"?Api:null'); } catch(e){ return null; }
  }

  function shouldRun(text){
    var s = String(text == null ? '' : text);
    if (s.length < 200) return false;                       /* 会話ログなど短い応答は対象外 */
    if (/^\s*\[/.test(s)) return false;                     /* 会話ログのJSON配列 */
    return true;
  }

  function install(){
    var api = getApi();
    if (!api || typeof api.call !== 'function') return false;
    if (api.call.__f555){ installed = true; return true; }
    var prev = api.call;

    var wrapped = async function(){
      if (depth > 0) return prev.apply(this, arguments);  /* 多重ラップされても1回だけ働く */
      depth++;
      var r;
      try { r = await prev.apply(this, arguments); }      /* 例外はそのまま伝播させる */
      catch(e){ depth--; throw e; }
      try {
        if (off() || inRepair) return r;
        if (!r || typeof r.text !== 'string') return r;
        if (!shouldRun(r.text)) return r;

        var sp = splitTail(r.text);
        var before = metrics(sp.body);
        if (before.over80 < 1) return r;                   /* 正常なターンは何もしない */

        var pick = pickSegments(sp.body);
        stats.skippedTagged += pick.skippedTagged;
        if (!pick.picked.length){
          note({ ts: new Date().toISOString(), result: 'no-target', before: before,
                 skippedTagged: pick.skippedTagged });
          return r;
        }

        stats.fired++;
        var t0 = Date.now();
        var p = buildPrompt(pick.picked);
        var out = null;
        var myAttempt = ++attemptSeq;
        inRepair = true;
        try {
          stats.calls++;
          var timedOut = false;
          /* ★fix556: まず専用リクエスト(temperature 0 / penalty 0 / 再試行なし)。
             作れなければ従来どおり Api.call。 */
          var reqP = repairRequest(p.sys, p.user, TIMEOUT_MS);
          if (!reqP){ stats.viaApiCall++; reqP = prev.call(this, p.sys, p.user, 1200); }
          else { stats.viaDirect++; }
          out = await Promise.race([
            reqP,
            new Promise(function(res){ setTimeout(function(){ timedOut = true; res(null); }, TIMEOUT_MS); })
          ]);
          if (timedOut){
            stats.timedOut++;
            note({ ts: new Date().toISOString(), result: 'timeout', before: before,
                   timeoutMs: TIMEOUT_MS, elapsedMs: Date.now() - t0 });
            return r;                                      /* 元の本文を採用。再試行はしない */
          }
        } catch(e){
          stats.failed++;
          note({ ts: new Date().toISOString(), result: 'call-failed', before: before,
                 elapsedMs: Date.now() - t0,
                 error: String((e && e.message) || e).slice(0, 120) });
          return r;                                        /* 例外時は元のまま(挙動を変えない) */
        } finally { inRepair = false; }

        /* ★遅れて届いた結果は使わない(別のターンへ混ざるのを防ぐ) */
        if (myAttempt !== attemptSeq){
          stats.lateDropped++;
          note({ ts: new Date().toISOString(), result: 'late-dropped', before: before,
                 elapsedMs: Date.now() - t0 });
          return r;
        }

        var map = out && out.text ? parseRepairJSON(out.text) : null;
        if (!map){
          stats.failed++;
          note({ ts: new Date().toISOString(), result: 'unparsable', before: before });
          return r;
        }

        /* ---- 検証: 骨格が完全一致する区間だけ採用する ---- */
        var lines = pick.lines.slice(), applied = 0, rejected = 0;
        for (var i = 0; i < pick.picked.length; i++){
          var seg = pick.picked[i];
          var fixed = map[seg.id];
          if (typeof fixed !== 'string'){ rejected++; continue; }
          if (hasTag(fixed)){ rejected++; continue; }                        /* タグを足させない */
          if (skeleton(fixed) !== skeleton(seg.text)){ rejected++; continue; } /* ★内容が変わったら拒否 */
          if (metrics(fixed).over80 >= metrics(seg.text).over80){ rejected++; continue; } /* 改善していない */
          lines[seg.index] = fixed;
          applied++;
        }
        if (rejected) stats.rejectedContent += rejected;

        if (!applied){
          stats.rejectedNoImprove++;
          note({ ts: new Date().toISOString(), result: 'rejected', before: before,
                 segs: pick.picked.length, rejected: rejected, ms: Date.now() - t0 });
          return r;
        }

        var newBody = lines.join('\n');
        var after = metrics(newBody);
        /* ---- 全体でも改善していること。していなければ元を採用(fail-closed) ---- */
        if (!(after.over80 < before.over80 && after.maxRun <= before.maxRun)){
          stats.rejectedNoImprove++;
          note({ ts: new Date().toISOString(), result: 'no-improve', before: before, after: after,
                 segs: pick.picked.length, applied: applied, ms: Date.now() - t0 });
          return r;
        }
        /* ---- 本文全体の骨格も一致することを最後にもう一度確かめる ---- */
        if (skeleton(newBody) !== skeleton(sp.body)){
          stats.rejectedContent++;
          note({ ts: new Date().toISOString(), result: 'skeleton-mismatch', before: before, after: after });
          return r;
        }

        stats.repaired++;
        stats.ms += (Date.now() - t0);
        stats.msList.push(Date.now() - t0);
        if (stats.msList.length > 40) stats.msList.shift();
        note({ ts: new Date().toISOString(), result: 'repaired', before: before, after: after,
               segs: pick.picked.length, applied: applied, rejected: rejected,
               overflow: pick.overflow, skippedTagged: pick.skippedTagged, ms: Date.now() - t0 });
        try { console.log(TAG, '句読点を校正しました', before, '→', after); } catch(e){}

        r.text = newBody + sp.tail;                        /* 管理タグ(<state>/<react>)はそのまま戻す */
        return r;
      } catch(e){
        try { console.warn(TAG, 'repair skipped', e); } catch(_){}
        return r;                                          /* どんな失敗でも元の応答を返す */
      } finally { depth--; }
    };
    wrapped.__f555 = true;
    try { Object.keys(prev).forEach(function(k){ if (k !== '__f555') wrapped[k] = prev[k]; }); } catch(e){}
    api.call = wrapped;
    installed = true;
    try { console.log(TAG, 'ready (句読点のみ・1ターン1回・検証不合格なら元を採用)'); } catch(e){}
    return true;
  }

  window.__v292Dfix555 = {
    stats: function(){
      return { fired: stats.fired, repaired: stats.repaired,
               rejectedContent: stats.rejectedContent, rejectedNoImprove: stats.rejectedNoImprove,
               failed: stats.failed, timedOut: stats.timedOut, lateDropped: stats.lateDropped,
               skippedTagged: stats.skippedTagged, calls: stats.calls, timeoutMs: TIMEOUT_MS,
               viaDirect: stats.viaDirect, viaApiCall: stats.viaApiCall,
               avgMs: stats.repaired ? Math.round(stats.ms / stats.repaired) : 0,
               /* ★20件ほど貯まったら p95 を見て上限を調整する(GPT) */
               p95Ms: (function(){ var a = stats.msList.slice().sort(function(x,y){ return x-y; });
                                   return a.length ? a[Math.min(a.length-1, Math.floor(a.length*0.95))] : 0; })(),
               wired: installed,
               /* ★印が生きているか。消えていても包み直すので、ここは参考値 */
               marked: (function(){ try { var a = getApi(); return !!(a && a.call && a.call.__f555); } catch(e){ return false; } })(),
               logged: read().length };
    },
    dump: function(){ return read(); },
    clear: function(){ try { localStorage.removeItem(LOG); } catch(e){} return true; },
    off: off,
    _metrics: metrics, _skeleton: skeleton, _splitTail: splitTail,
    _pickSegments: pickSegments, _buildPrompt: buildPrompt, _parseRepairJSON: parseRepairJSON,
    _install: install, _timeoutMs: function(){ return TIMEOUT_MS; }, _repairRequest: repairRequest
  };

  /* ★包めても止めない。他のfixが包み直して印が消えたら、また包む。 */
  (function tryInstall(n){
    if (off()) return;
    install();
    if (n > 240) return;
    setTimeout(function(){ tryInstall(n + 1); }, n < 120 ? 500 : 5000);
  })(0);
})();
