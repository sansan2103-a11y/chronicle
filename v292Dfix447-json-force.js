// =====================================================================
// Chronicle TRPG - v292Dfix447: 🎲空欄補完に「JSONだけを返す」契約を強制する
// ---------------------------------------------------------------------
// ■ 症状(本番コンソール実測・BUILT=20260712-fix446)
//     [v292Dfix446:fillRobust] unusable response (unextractable)
//     head: 我们被要求填充指定的空栏，基于给定的确定信息。确定信息中已经包含了hero、npc1到npc4…
//   = モデル(DeepSeek V4 Flash)が **中国語で思考(chain-of-thought)を書き出し、JSONを1文字も出していない**。
//   fix446 の救出(フェンス剥がし/対応括弧抽出/閉じ括弧補完)は **JSONが存在しないので原理的に無力**。
//   → fix436 は失敗 → 種が無ければ legacy()(旧・全上書き) へ退避 →
//     「空欄だけ埋める」新機能が本番でまだ一度も成立していない。
//
// ■ 真因(実コード確定・推測なし)
//   fix436:request() の body は
//     { model, temperature:0.85, max_tokens:1800, messages:[system,user] }
//   だけ。**出力形式を機械的に縛る手段(response_format)が無い**。
//   sys の「JSONオブジェクトだけを返す」は自然文の“お願い”にすぎず、
//   推論志向のモデルは前置き思考を吐く。temperature 0.85 もそれを助長する。
//
// ■ fix447 の方式(多層防御。1つが効かなくても次が効く)
//   ① response_format:{type:'json_object'} を **空欄補完のbodyにだけ** 付ける
//      - 経路の実測: fix436 → XHR POST openrouter.ai/api/v1/chat/completions
//        → fix247 が URL を <proxy>/openrouter.ai へ書換 → Worker v18(:159-161,:378)は
//          `body = await request.json()` を **キーを選別せずそのまま** JSON.stringify して
//          OpenRouter へ転送する(:378-386)。model の allowlist 判定以外は素通し。
//        ⇒ **response_format は欠落せずモデルまで届く**(worker実コードで確認)。
//      - OpenAI互換APIの json_object モードは「messagesのどこかに 'json' の語が要る」制約が
//        あるため、②の sys ブロックに JSON の語を必ず含める(下の SYS_BLOCK)。
//      - ★ただし deepseek-v4-flash が OpenRouter 経由で json_object を受け付ける保証は
//        コードからは断定できない(実APIを叩けない)。**拒否(4xx)されたら自動で
//        response_format 抜きに落として1回だけ再送する安全網**を持つ(下の ⑤)。
//   ② system の先頭に【出力契約】ブロックを前置(最初に読ませる)
//   ③ user の末尾に念押しブロックを追記(最後に読ませる = 直近性)
//   ④ temperature を 0.85 → 0.3 へ(既定。localStorage v292Dfix447Temp で上書き可)
//   ⑤ 安全網: 我々が付けた body が HTTP 4xx/5xx、または 200+errorエンベロープで
//      返ってきたら、**response_format を外し・厳格指示を足して1回だけ再送**し、
//      成功したら元のXHRの status/responseText を 200/正常JSON に差し替えて
//      fix446/fix436 へ渡す(体感は「ちょっと遅い成功」)。
//   ※ assistant プリフィル({ role:'assistant', content:'{' })は **採用しない**。
//      理由は IMPL_REPORT_447_448.md（fix446:readRaw が responseText を
//      **プロトタイプのgetter経由**で読むため、先頭 '{' を補う正規化が
//      fix446 の私有キャッシュ(__f446raw)へ手を突っ込まないと届かない＝結合が過剰。
//      ①の json_object が効けば先頭 '{' は保証され、プリフィルは冗長になる）。
//
// ■ 触らないもの
//   - 通常の物語生成は **fetch 経路**(fix441)。fix447 は XHR だけを見る。
//   - さらに body 署名(user に '## 埋めるべき空欄' / sys に 'TRPGのシナリオ設計者')の
//     両方が揃ったときだけ書き換える。longmem/アバター記述XHRは通らない。
//   - max_tokens は **fix446 の担当**。fix447 は触らない(責務分離。安全網の再送でだけ自前計算)。
//   - fix436/442/446 のファイルは1バイトも変更しない。ユーザー入力にも触れない。
//
// ■ 読込位置: index.html 最後尾・**fix446 の直後**(?cb=v292Dfix447)
//   送信チェーン: fix448 → **fix447** → fix446 → fix442 → fix247 → native
//   応答チェーン: **fix447h** → fix446h → fix436.onload  (fix447 は inner を呼んだ *後*に
//   onload を包む＝応答の最外周を取る。これにより安全網の差し替え結果を fix446 の
//   救出ロジックにも通せる)
//
// 冪等: window.__v292Dfix447 (検証口を兼ねる) / sys 内マーカー【出力契約】
// OFF : localStorage v292Dfix447Off='1'(live評価。body書換・応答フック・安全網が全停止)
// 調整: v292Dfix447Temp (例 '0.6') / v292Dfix447NoRF='1' で response_format だけ止める
// ロールバック: scriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix447) return;

  var TAG = '[v292Dfix447:jsonForce]';

  // fix436 の空欄補完リクエストの署名(fix442:53-54 / fix446:80-81 と同一。勝手に変えない)
  var SIG_USER = '## 埋めるべき空欄';
  var SIG_SYS  = 'TRPGのシナリオ設計者';
  var MARKER   = '【出力契約】';               // sys 冪等マーカー
  var U_MARKER = '## 出力の厳守（最優先）';    // user 冪等マーカー

  var OR_URL     = 'https://openrouter.ai/api/v1/chat/completions';
  var TIMEOUT_MS = 60000;
  var DEF_TEMP   = 0.3;      // 0.85 → 0.3（創作性より形式順守。v292Dfix447Temp で上書き可）
  var FB_TEMP    = 0.2;      // 安全網の再送はさらに堅く
  // 安全網の再送で使う max_tokens 見積り(fix446 と同じ係数。fix446 不在時のため自前で持つ)
  var MT_BASE    = 300;
  var MT_PER_KEY = 140;
  var MT_MIN     = 1800;
  var MT_MAX     = 6000;

  // ── ② system 先頭に置く出力契約(JSON の語を必ず含める= json_object モードの前提) ──
  var SYS_BLOCK =
    MARKER + '\n' +
    'あなたはJSONだけを出力するAPIである。人間向けの文章を書く役ではない。\n' +
    '- 出力の最初の文字は { 、最後の文字は } でなければならない。\n' +
    '- 前置き・思考過程・検討・要約・説明・後書き・見出し・箇条書き・コードフェンス(```)を一切書かない。\n' +
    '- 中国語や英語で思考や説明を書かない。値はすべて日本語の文字列。\n' +
    '- 指定されたキー以外は返さない。JSONオブジェクトは1個だけ返す。';

  // ── ③ user 末尾に置く念押し(モデルが最後に読む位置) ──
  var USER_TAIL =
    U_MARKER + '\n' +
    '- 出力はJSONオブジェクトのみ。最初の文字は { 、最後の文字は } 。\n' +
    '- 思考過程・説明文・前置きを書かない。中国語・英語で説明しない。\n' +
    '- 値はすべて日本語。JSONが最後まで閉じていることを最優先する。';

  // ── ⑤ 安全網の再送で sys 末尾に足す厳格指示 ──
  var FB_STRICT =
    '\n\n【再送・最優先】前回の応答はJSONとして使えなかった。' +
    '今回は必ずJSONオブジェクト1個だけを返すこと。最初の文字は { 、最後の文字は } 。' +
    '思考過程・説明・コードフェンスを書かない。中国語・英語で書かない。各値は120字以内の日本語。';

  function off(){ try { return localStorage.getItem('v292Dfix447Off') === '1'; } catch(e){ return false; } }
  function noRF(){ try { return localStorage.getItem('v292Dfix447NoRF') === '1'; } catch(e){ return false; } }
  function temp(){
    try {
      var v = localStorage.getItem('v292Dfix447Temp');
      if (v !== null && v !== ''){
        var n = parseFloat(v);
        if (!isNaN(n) && n >= 0 && n <= 2) return n;
      }
    } catch(e){}
    return DEF_TEMP;
  }
  function getS(){ try { if (typeof S !== 'undefined' && S) return S; } catch(e){} return window.S || null; }
  function getUI(){ try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){} return window.UI || null; }
  function setStatus(m, err){ try { var U = getUI(); if (U && U.setStatus) U.setStatus(m, err); } catch(e){} }
  function head(s){ return String(s == null ? '' : s).slice(0, 200); }

  var ST = {
    stamped: 0,      // 空欄補完bodyへ出力契約を刻んだ回数
    rf: 0,           // response_format を付けた回数
    fallbacks: 0,    // 安全網の再送を撃った回数
    recovered: 0,    // 安全網で救えた回数
    failed: 0,       // 安全網でも救えなかった回数
    lastBody: '',    // 直近に送った(fix447時点の)body全文 ※検証用
    lastError: ''
  };

  // ===================================================================
  // 対象識別(fix442:293-298 / fix446:227-241 と同一条件)
  // ===================================================================
  function isFillBody(s){
    if (typeof s !== 'string' || s.length < 40) return false;
    if (s.indexOf(SIG_USER) < 0) return false;
    if (s.indexOf('messages') < 0) return false;
    return true;
  }
  function pickMsgs(o){
    var sys = null, usr = null, i, m;
    if (!o || !o.messages || !o.messages.length) return null;
    for (i = 0; i < o.messages.length; i++){
      m = o.messages[i];
      if (!m || typeof m.content !== 'string') continue;
      if (m.role === 'system' && sys === null) sys = m;
      if (m.role === 'user'   && usr === null) usr = m;
    }
    if (!sys || !usr) return null;
    if (sys.content.indexOf(SIG_SYS) < 0) return null;   // fix436 の sys 以外は触らない
    return { sys: sys, usr: usr };
  }

  // 空欄キー数(fix446:countBlankKeys と同一。安全網の max_tokens 見積り用)
  function countBlankKeys(userText){
    if (typeof userText !== 'string') return 0;
    var at = userText.indexOf(SIG_USER);
    if (at < 0) return 0;
    var body = userText.slice(at);
    var end = body.indexOf('\n## ', 1);
    if (end > 0) body = body.slice(0, end);
    var lines = body.split('\n'), n = 0, re = /^-\s*([A-Za-z0-9_]+)\s*:/;
    for (var i = 0; i < lines.length; i++){
      if (re.test(String(lines[i]).replace(/^\s+/, ''))) n++;
    }
    if (n > 0) return n;
    var m = /(\d+)\s*件/.exec(body);
    return m ? parseInt(m[1], 10) : 0;
  }
  function neededMaxTokens(keys){
    try {
      var f446 = window.__v292Dfix446;
      if (f446 && typeof f446.neededMaxTokens === 'function') return f446.neededMaxTokens(keys);
    } catch(e){}
    var need = MT_BASE + (keys > 0 ? keys : 12) * MT_PER_KEY;
    if (need < MT_MIN) need = MT_MIN;
    if (need > MT_MAX) need = MT_MAX;
    return need;
  }

  // ===================================================================
  // ①〜④ 送信bodyの書き換え(pure)
  //   ・sys 先頭へ出力契約 / user 末尾へ念押し / response_format / temperature
  //   ・max_tokens は触らない(fix446 の責務)
  // ===================================================================
  function rewriteBody(s){
    if (!isFillBody(s)) return s;
    var o;
    try { o = JSON.parse(s); } catch(e){ return s; }
    var pm = pickMsgs(o);
    if (!pm) return s;
    if (pm.sys.content.indexOf(MARKER) >= 0) return s;    // 冪等(sys)

    pm.sys.content = SYS_BLOCK + '\n\n' + pm.sys.content;
    if (pm.usr.content.indexOf(U_MARKER) < 0){            // 冪等(user)
      pm.usr.content = pm.usr.content + '\n\n' + USER_TAIL;
    }
    if (!noRF()) { o.response_format = { type: 'json_object' }; ST.rf++; }
    o.temperature = temp();

    var out;
    try { out = JSON.stringify(o); } catch(e){ return s; }
    ST.stamped++;
    ST.lastBody = out;
    try { console.log(TAG, 'json contract stamped (response_format=' + (!noRF()) + ', temp=' + temp() + ')'); } catch(e){}
    return out;
  }

  // ===================================================================
  // ⑤ 安全網: response_format を外して1回だけ再送する
  // ===================================================================
  var RT_DESC = null, RS_DESC = null, STAT_DESC = null;
  try { RT_DESC   = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText'); } catch(e){}
  try { RS_DESC   = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response'); } catch(e){}
  try { STAT_DESC = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'status'); } catch(e){}

  function rawOf(xhr){
    try {
      var v = (RT_DESC && typeof RT_DESC.get === 'function') ? RT_DESC.get.call(xhr) : xhr.responseText;
      return (typeof v === 'string') ? v : '';
    } catch(e){ return ''; }
  }
  function contentOf(env){
    try {
      var c = env && env.choices && env.choices[0];
      var m = c && (c.message || c.delta);
      if (m){
        if (typeof m.content === 'string' && m.content) return m.content;
        if (typeof m.reasoning === 'string' && m.reasoning) return m.reasoning;
      }
      if (c && typeof c.text === 'string' && c.text) return c.text;
    } catch(e){}
    return '';
  }

  // 元XHRの status/responseText/response を「成功した再送の結果」に差し替える。
  // fix446 は readRaw() で **プロトタイプgetter** を読むので、その私有キャッシュ
  // (__f446raw) にも同じ文字列を置いて整合させる(fix446:246-253 で hasOwnProperty 判定)。
  function shadow(xhr, text){
    var ok = false;
    try {
      Object.defineProperty(xhr, 'responseText', { value: text, configurable: true, enumerable: true, writable: false });
      ok = true;
    } catch(e){ try { console.warn(TAG, 'shadow responseText failed', e && e.message); } catch(_){} }
    try { if (RS_DESC)   Object.defineProperty(xhr, 'response', { value: text, configurable: true, enumerable: true, writable: false }); } catch(e){}
    try { if (STAT_DESC) Object.defineProperty(xhr, 'status',   { value: 200,  configurable: true, enumerable: true, writable: false }); } catch(e){}
    try { xhr.__f446raw = text; } catch(e){}   // fix446 の生応答キャッシュを同値化
    return ok;
  }

  function buildFallbackBody(reqBody){
    var o;
    try { o = JSON.parse(reqBody); } catch(e){ return null; }
    var pm = pickMsgs(o);
    if (!pm) return null;
    try { delete o.response_format; } catch(e){ o.response_format = undefined; }
    o.temperature = FB_TEMP;
    var keys = countBlankKeys(pm.usr.content);
    var need = neededMaxTokens(keys);
    var cur = (typeof o.max_tokens === 'number') ? o.max_tokens : 0;
    if (need > cur) o.max_tokens = need;
    pm.sys.content = pm.sys.content + FB_STRICT;
    try { return JSON.stringify(o); } catch(e){ return null; }
  }

  function sendFallback(reqBody, cb){
    var body = buildFallbackBody(reqBody);
    if (!body) return cb(new Error('build'), '');
    var st = getS(), cfg = (st && st.cfg) || {};
    var x;
    try {
      x = new XMLHttpRequest();
      x.open('POST', OR_URL, true);                  // fix247 が proxy へ書換＋ヘッダ付与
      x.setRequestHeader('Content-Type', 'application/json');
      x.setRequestHeader('Authorization', 'Bearer ' + (cfg.orKey || ''));
      x.timeout = TIMEOUT_MS;
      x.__f447retry = true;                          // 自分の send ラップで再スタンプしない
      x.__f446retry = true;                          // fix446 の応答フック/再試行を掛けない(二重再試行の防止)
      x.onload = function(){
        var raw = rawOf(x);
        if (x.status !== 200) return cb(new Error('HTTP ' + x.status), raw);
        var env = null;
        try { env = JSON.parse(raw); } catch(e){ return cb(new Error('envelope'), raw); }
        if (env && env.error && (!env.choices || !env.choices.length)) return cb(new Error('error-envelope'), raw);
        if (!contentOf(env)) return cb(new Error('empty'), raw);
        cb(null, raw);                               // 生エンベロープをそのまま返す
      };                                             // → 抽出/切断補修は fix446 の救出ロジックに任せる
      x.onerror   = function(){ cb(new Error('network'), ''); };
      x.ontimeout = function(){ cb(new Error('timeout'), ''); };
      x.send(body);
    } catch(e){ cb(e || new Error('send'), ''); }
  }

  // ===================================================================
  // 応答フック: inner(=fix446/442/247/native) を呼んだ **後** に onload を包む
  //   → 応答チェーンの最外周になる → 安全網の結果を fix446 の救出にも通せる
  // ===================================================================
  function hookResponse(xhr, reqBody){
    try {
      if (xhr.__f447hooked) return;
      var prev = xhr.onload;
      if (typeof prev !== 'function') return;        // 想定外の呼び出し順 → 触らない
      xhr.__f447hooked = true;
      xhr.onload = function(ev){
        var self = this;
        var done = function(){
          try { prev.call(self, ev); }
          catch(e){ try { console.warn(TAG, 'inner onload err', e && e.message); } catch(_){} }
        };
        try {
          if (off()) return done();

          var bad = false, why = '';
          if (self.status !== 200){ bad = true; why = 'HTTP ' + self.status; }
          else {
            var env = null;
            try { env = JSON.parse(rawOf(self)); } catch(e){ env = null; }
            if (env && env.error && (!env.choices || !env.choices.length)){ bad = true; why = 'error-envelope'; }
          }
          if (!bad) return done();                   // 正常 → fix446 の救出ロジックへ
          if (self.__f447fellback){ ST.failed++; return done(); }
          self.__f447fellback = true;

          ST.fallbacks++;
          ST.lastError = why;
          try { console.warn(TAG, 'fill request rejected (' + why + ') → retry WITHOUT response_format | head:', head(rawOf(self))); } catch(_){}
          setStatus('🎲 生成をやり直しています…（あと数秒）');

          sendFallback(reqBody, function(err, raw){
            if (!err && raw && shadow(self, raw)){
              ST.recovered++;
              try { console.log(TAG, 'fallback recovered (no response_format)'); } catch(_){}
              return done();                         // status=200 / 正常JSON として fix446→fix436 へ
            }
            ST.failed++;
            ST.lastError = 'fallback-' + (err ? String(err.message || err) : 'shadow');
            try { console.warn(TAG, 'fallback failed:', ST.lastError, '| head:', head(raw)); } catch(_){}
            done();                                  // 元の失敗応答のまま(入力は無傷)
          });
        } catch(e){
          ST.lastError = 'hook-' + (e && e.message);
          try { console.warn(TAG, 'hook err', e && e.message); } catch(_){}
          done();
        }
      };
    } catch(e){}
  }

  // ===================================================================
  // 送信境界: XMLHttpRequest.prototype.send をラップ(fix446 の外側)
  // ===================================================================
  function armSend(){
    try {
      if (typeof XMLHttpRequest === 'undefined' || !XMLHttpRequest.prototype) return false;
      var cur = XMLHttpRequest.prototype.send;
      if (typeof cur !== 'function') return false;
      if (cur.__f447) return true;
      var inner = cur;
      var w = function(body){
        var b = body, stamped = false, self = this;
        try {
          if (!off() && !this.__f447retry && typeof b === 'string' && isFillBody(b)){
            var nb = rewriteBody(b);
            if (nb !== b){ b = nb; stamped = true; }
          }
        } catch(e){ b = body; }
        var r;
        if (arguments.length === 0) r = inner.apply(this, arguments);
        else r = inner.call(this, b);
        // ★inner を通した後に包む = 応答チェーンの最外周を取る(fix446 より先に走る)
        try { if (stamped && !off()) hookResponse(self, b); } catch(e){}
        return r;
      };
      // fix419c教訓: 内側関数の own props を全継承(fix446の __f446 等を消さない)
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
      } catch(e){}
      w.__f447 = true;
      XMLHttpRequest.prototype.send = w;
      return true;
    } catch(e){ return false; }
  }

  armSend();
  (function keeper(){
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      try { armSend(); } catch(e){}
      if (ticks > 50) clearInterval(iv);             // 約30秒で停止(有限)
    }, 600);
    window.__v292Dfix447_stopKeeper = function(){ try { clearInterval(iv); } catch(e){} };
  })();
  try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}

  // ===================================================================
  // 検証口(冪等ガードを兼ねる)
  // ===================================================================
  window.__v292Dfix447 = {
    rewriteBody: rewriteBody,
    buildFallbackBody: buildFallbackBody,
    isFillBody: isFillBody,
    pickMsgs: pickMsgs,
    countBlankKeys: countBlankKeys,
    neededMaxTokens: neededMaxTokens,
    armSend: armSend,
    off: off,
    temp: temp,
    SYS_BLOCK: SYS_BLOCK,
    USER_TAIL: USER_TAIL,
    MARKER: MARKER,
    U_MARKER: U_MARKER,
    stats: function(){
      return {
        off: off(), temp: temp(), responseFormat: !noRF(),
        stamped: ST.stamped, rf: ST.rf,
        fallbacks: ST.fallbacks, recovered: ST.recovered, failed: ST.failed,
        lastError: ST.lastError
      };
    },
    lastBody: function(){ return ST.lastBody; },
    _state: function(){
      var s = false;
      try { s = !!(XMLHttpRequest.prototype.send && XMLHttpRequest.prototype.send.__f447); } catch(e){}
      return { sendArmed: s, off: off(), hasStatDesc: !!(STAT_DESC && STAT_DESC.get) };
    }
  };
})();
