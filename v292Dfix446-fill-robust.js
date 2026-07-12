// =====================================================================
// Chronicle TRPG - v292Dfix446: 🎲空欄補完の応答を頑健にする（fail: json / fail: empty の根治）
// ---------------------------------------------------------------------
// ■ 症状(本番コンソール実測・BUILT=20260712-fix442)
//     [v292Dfix436:seedExpand] fail: json     (v292Dfix436-seed-expand.js:352)
//     [v292Dfix436:seedExpand] fail: empty    (同上)
//
// ■ 発生条件(実コード確定・推測なし)
//   fix436:352 は onFail() の唯一の console.warn。onFail の呼び出し元は run() 内の4箇所
//   だけで、すべて `return onFail(...)` = **1回の run() につき最大1回**しか出ない。
//     - 'empty' … fix436:335。HTTP200 で JSON.parse(responseText) は成功したが
//                 choices[0].message.content が falsy（空文字/null/choices欠落）。
//     - 'json'  … fix436:380。content は非空だが parseFillJson() が null。
//                 parseFillJson(fix436:205-236) は
//                   a=indexOf('{'), b=lastIndexOf('}') → b<=a なら null
//                   → **末尾が切れて '}' が1つも無い＝即 null**
//                   → JSON.parse が throw しても null（閉じ括弧不足＝切断）
//   ⇒ 'json'(切断) と 'empty'(content空) は **別々の run()＝別々の🎲送信**。
//
// ■ 真因(裏取り済み)
//   fix436 の request()(:316-343) は max_tokens:1800 固定。
//   fix442 が送信境界で sys に伝承ブロック(実測 1063〜1154字)を追記し、
//   「伝承の構造(禁忌/代償/象徴/契約)を織り込め」と要求する＝**各値が長くなる**。
//   空欄キー数は空フォームで18、NPCカード4枚なら29（実測）。
//   18キー×(日本語100〜200字) + JSONの足回り ≒ 1500〜2600トークン、
//   29キーなら 2500〜4000トークン。**1800 は日常的に足りない**。
//   → 途中で切れる → '}' が無い → parseFillJson が null → fail: json
//   → 出力予算を前置き/推論で食い切ると content が空 → fail: empty
//   （content が空になる経路は他に「OpenRouterが200でerror本文を返す」もある。
//     どちらだったかを次回必ず特定できるよう、fix446 は生応答の先頭200字を必ず残す＝D項）
//
//   ※「世界観は良い感じに埋まった」= fix436:353 hasSeed()==false のとき onFail は
//     legacy()(旧・全上書きランダム生成)へ退避する。空フォームで🎲を押した場合は
//     この旧経路が埋めるので、失敗が体感上マスクされていた。
//
// ■ fix446 の方式（response 書き換え方式を採用。理由は IMPL_REPORT_446.md）
//   fix436 の内部関数(parseFillJson/request/onFail)はレキシカル参照で差し替え不能
//   （fix442 が同じ罠を確認済み）。よって fix442 と同じ **送信境界(XHR)** に乗る:
//     ① send ラップ: fix436 の空欄補完 body だけを識別し max_tokens を必要量へ引き上げる
//     ② onload ラップ: fix436 が xhr.onload を send より前に代入する(fix436:330,341)ので、
//        send 時点で this.onload を掴んで包める。**fix436 のハンドラが読む前に**
//        responseText / response を Object.defineProperty で「きれいなJSONだけ」に差し替える。
//        （プロトタイプの getter を own データプロパティで shadow する標準の挙動）
//     ③ 抽出不能なら **1回だけ再試行**: 伝承ブロックを外し(fix442の署名も外すので
//        再注入されない)、「JSONだけを返せ・各値80字以内」を最優先で指示し、
//        max_tokens を上げて再送。成功したらその中身を①の器に詰めて fix436 へ渡す。
//        再試行も失敗 → 元の応答をそのまま通す（fix436 が従来どおり失敗表示）。
//   ★ユーザー入力は1バイトも触らない。書き込みは fix436 の applyFill(filled/writable 防御)のまま。
//
// 冪等: window.__v292Dfix446 (検証口を兼ねる)
// OFF : localStorage v292Dfix446Off='1'（live評価。max_tokens引き上げ・応答書換・再試行が全て停止）
// 読込: index.html 最後尾・?cb=v292Dfix446。**fix442 より後**（外側に乗る必要がある）
// ロールバック: scriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix446) return;

  var TAG = '[v292Dfix446:fillRobust]';

  // fix436 の空欄補完リクエストの署名（fix442:53-54 と同一。勝手に変えない）
  var SIG_USER = '## 埋めるべき空欄';
  var SIG_SYS  = 'TRPGのシナリオ設計者';
  var F442_MARKER = '【伝承モチーフ】';     // fix442:52。再試行時に sys から切り落とす
  // 再試行の user 見出し。SIG_USER を含まないので fix442 は再注入しない（fix442:295）
  var ALT_HEAD = '## 埋める空欄キー（このキーだけを返す）';

  var OR_URL     = 'https://openrouter.ai/api/v1/chat/completions';
  var TIMEOUT_MS = 60000;
  var MT_BASE    = 300;     // JSONの足回り(キー名・引用符・カンマ)＋安全余裕
  var MT_PER_KEY = 140;     // 1キーあたり: 日本語値〜120字(≒120tok) + キー/記号 ≒ 20tok
  var MT_MIN     = 1800;    // fix436 の現行値。これ未満へは絶対に下げない
  var MT_MAX     = 6000;    // 暴走ガード（max_tokens は上限。実課金は実出力分のみ）
  var RETRY_TEMP = 0.6;     // 再試行は形式順守を優先（創作性より完結性）
  var HEAD       = 200;     // ログに残す生応答の先頭字数

  function off(){ try { return localStorage.getItem('v292Dfix446Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { if (typeof S !== 'undefined' && S) return S; } catch(e){} return window.S || null; }
  function getUI(){ try { if (typeof UI !== 'undefined' && UI) return UI; } catch(e){} return window.UI || null; }
  function setStatus(m, err){ try { var U = getUI(); if (U && U.setStatus) U.setStatus(m, err); } catch(e){} }
  function head(s){ return String(s == null ? '' : s).slice(0, HEAD); }

  var ST = {
    attempts: 0,      // 空欄補完リクエストを掴んだ回数
    passthrough: 0,   // 応答が既に素のJSON → 一切書き換えず素通し
    extracted: 0,     // フェンス/散文から切り出して書き換えた
    repaired: 0,      // 切断されたJSONを補修して書き換えた
    retried: 0,       // 伝承抜き＋厳格指示で再送した
    failed: 0,        // 再試行しても救えなかった
    raised: 0,        // max_tokens を引き上げた回数
    lastRaw: '',
    lastError: ''
  };

  // ===================================================================
  // A) extractJson — モデル応答から JSON オブジェクトを頑健に取り出す(pure)
  // ===================================================================

  // 構造文字だけを ASCII 化。★strictパースが失敗した後にだけ使う(本文破壊の回避)
  function normalizeStructural(s){
    return String(s)
      .replace(/[｛]/g, '{').replace(/[｝]/g, '}')
      .replace(/[［]/g, '[').replace(/[］]/g, ']')
      .replace(/[“”„″＂]/g, '"')
      .replace(/[：]/g, ':')
      .replace(/[，]/g, ',');
  }
  function stripFences(s){
    return String(s).replace(/```[a-zA-Z0-9_\-]*[ \t]*\r?\n?/g, '\n').replace(/```/g, '\n');
  }
  function tryParse(str){
    var o = null;
    try { o = JSON.parse(str); }
    catch(e){
      try { o = JSON.parse(String(str).replace(/,\s*([}\]])/g, '$1')); }  // 末尾カンマ
      catch(e2){ return null; }
    }
    if (!o || typeof o !== 'object') return null;
    if (Object.prototype.toString.call(o) === '[object Array]'){
      // [{...}] で返してきた場合は最初のオブジェクトを採用
      for (var i = 0; i < o.length; i++){
        if (o[i] && typeof o[i] === 'object' && Object.prototype.toString.call(o[i]) !== '[object Array]') return o[i];
      }
      return null;
    }
    return o;
  }

  // 文字列リテラル内の括弧を数えないスキャナ。start は '{' の位置。
  //   end        : 対応する '}' の位置（見つからなければ -1 = 途中で切れている）
  //   depth      : 走査終了時点の深さ（不足している '}' の数）
  //   inString   : 文字列の途中で終わったか
  //   topCommas  : 深さ1で、文字列の外にあるカンマの位置（切り戻し候補）
  function scanObject(s, start){
    var depth = 0, inStr = false, esc = false, i, ch;
    var topCommas = [];
    for (i = start; i < s.length; i++){
      ch = s.charAt(i);
      if (inStr){
        if (esc) { esc = false; continue; }
        if (ch === '\\'){ esc = true; continue; }
        if (ch === '"'){ inStr = false; }
        continue;
      }
      if (ch === '"'){ inStr = true; continue; }
      if (ch === '{' || ch === '['){ depth++; continue; }
      if (ch === '}' || ch === ']'){
        depth--;
        if (depth === 0) return { end: i, depth: 0, inString: false, topCommas: topCommas };
        continue;
      }
      if (ch === ',' && depth === 1) topCommas.push(i);
    }
    return { end: -1, depth: depth, inString: inStr, topCommas: topCommas };
  }

  function closers(frag){
    // frag の残り深さを数え直して、閉じ括弧列を作る（'[' があれば ']' で閉じる）
    var stack = [], inStr = false, esc = false, i, ch;
    for (i = 0; i < frag.length; i++){
      ch = frag.charAt(i);
      if (inStr){
        if (esc){ esc = false; continue; }
        if (ch === '\\'){ esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"'){ inStr = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
    var out = '';
    for (i = stack.length - 1; i >= 0; i--) out += (stack[i] === '[' ? ']' : '}');
    return out;
  }

  function countKeys(o){
    var n = 0, k;
    for (k in o){ if (Object.prototype.hasOwnProperty.call(o, k)) n++; }
    return n;
  }

  // 1つの文字列から JSON オブジェクトを取り出す（切断補修つき）
  function extractFrom(s){
    var start = s.indexOf('{');
    if (start < 0) return null;
    var sc = scanObject(s, start);

    if (sc.end >= 0){
      var whole = tryParse(s.slice(start, sc.end + 1));
      if (whole && countKeys(whole) > 0) return whole;
    }

    // ── 切断復旧 ──
    var frag = s.slice(start, sc.end >= 0 ? sc.end + 1 : s.length);

    // 候補1: 開いた文字列を閉じ、末尾のゴミ(空白/カンマ)を落として括弧を閉じる
    var base = frag;
    if (sc.end < 0 && sc.inString) base = base + '"';
    base = base.replace(/\s+$/, '').replace(/,\s*$/, '');
    var c1 = tryParse(base + closers(base));
    if (c1 && countKeys(c1) > 0) return c1;

    // 候補2: 深さ1のカンマまで切り戻す（＝そこまでの完全なペアだけを救う）
    var i;
    for (i = sc.topCommas.length - 1; i >= 0; i--){
      var cut = s.slice(start, sc.topCommas[i]);   // カンマ直前まで
      var c2 = tryParse(cut + closers(cut));
      if (c2 && countKeys(c2) > 0) return c2;
    }
    return null;
  }

  // ★公開API: 失敗しても例外を投げず null を返す
  function extractJson(text){
    if (typeof text !== 'string' || !text) return null;
    var variants = [], s0;
    try { s0 = stripFences(text); } catch(e){ s0 = text; }
    variants.push(s0);
    try { variants.push(normalizeStructural(s0)); } catch(e){}
    for (var i = 0; i < variants.length; i++){
      var r = null;
      try { r = extractFrom(variants[i]); } catch(e){ r = null; }
      if (r && countKeys(r) > 0) return r;
    }
    return null;
  }

  // ===================================================================
  // C) max_tokens — 空欄キー数から必要量を見積もる(pure)
  // ===================================================================
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
    var m = /(\d+)\s*件/.exec(body);      // 保険: 見出しの「N件」
    return m ? parseInt(m[1], 10) : 0;
  }
  function neededMaxTokens(keys){
    var need = MT_BASE + (keys > 0 ? keys : 12) * MT_PER_KEY;
    if (need < MT_MIN) need = MT_MIN;
    if (need > MT_MAX) need = MT_MAX;
    return need;
  }

  // ===================================================================
  // 対象識別（fix442:293-298 と同一条件）
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

  // ===================================================================
  // 再試行 body（伝承抜き・厳格JSON・値短め・max_tokens増）(pure)
  // ===================================================================
  var STRICT =
    '\n\n【出力形式・最優先】\n' +
    '- 返答はJSONオブジェクト1個だけ。最初の文字は { 、最後の文字は } 。\n' +
    '- コードフェンス(```)・前置き・後書き・見出し・箇条書き・思考過程を一切書かない。\n' +
    '- 指定されたキー以外は返さない。値はすべて日本語の文字列。\n' +
    '- 各値は80字以内で簡潔に。長さより「JSONが最後まで閉じていること」を優先する。';

  function buildRetryBody(origBodyStr){
    var o;
    try { o = JSON.parse(origBodyStr); } catch(e){ return null; }
    var pm = pickMsgs(o);
    if (!pm) return null;

    // 伝承ブロックを切り落とす（fix446はfix442の外側なので通常は入っていない。順序変更への保険）
    var sys = pm.sys.content;
    var mk = sys.indexOf(F442_MARKER);
    if (mk >= 0) sys = sys.slice(0, mk).replace(/\s+$/, '');
    pm.sys.content = sys + STRICT;

    // 見出しを変える＝fix442 の署名(SIG_USER)から外れる → 再試行に伝承は再注入されない
    pm.usr.content = pm.usr.content.split(SIG_USER).join(ALT_HEAD);

    var keys = countBlankKeys(origBodyStr);
    o.max_tokens = neededMaxTokens(keys);
    o.temperature = RETRY_TEMP;
    try { return JSON.stringify(o); } catch(e){ return null; }
  }

  // ===================================================================
  // B) 応答書き換え — fix436 のハンドラが読む前に responseText を差し替える
  // ===================================================================
  var RT_DESC = null, RS_DESC = null;
  try { RT_DESC = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText'); } catch(e){}
  try { RS_DESC = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response'); } catch(e){}

  function readRaw(xhr){
    try {
      if (Object.prototype.hasOwnProperty.call(xhr, '__f446raw')) return xhr.__f446raw;
      var v = (RT_DESC && typeof RT_DESC.get === 'function') ? RT_DESC.get.call(xhr) : xhr.responseText;
      xhr.__f446raw = (typeof v === 'string') ? v : '';
      return xhr.__f446raw;
    } catch(e){ return ''; }
  }
  function shadow(xhr, text){
    var ok = false;
    try {
      Object.defineProperty(xhr, 'responseText', { value: text, configurable: true, enumerable: true, writable: false });
      ok = true;
    } catch(e){ try { console.warn(TAG, 'shadow failed', e && e.message); } catch(_){} }
    // response も同値にしておく（responseType='' のときの契約を壊さない）
    try {
      if (RS_DESC) Object.defineProperty(xhr, 'response', { value: text, configurable: true, enumerable: true, writable: false });
    } catch(e){}
    return ok;
  }

  // envelope から content を取り出す（reasoning 側に JSON を書いた場合も拾う）
  function contentsOf(env){
    var out = [];
    try {
      var c = env && env.choices && env.choices[0];
      var m = c && (c.message || c.delta);
      if (m){
        if (typeof m.content === 'string' && m.content) out.push(m.content);
        if (typeof m.reasoning === 'string' && m.reasoning) out.push(m.reasoning);
        if (typeof m.reasoning_content === 'string' && m.reasoning_content) out.push(m.reasoning_content);
      }
      if (c && typeof c.text === 'string' && c.text) out.push(c.text);
    } catch(e){}
    return out;
  }
  function repack(env, obj){
    try {
      if (!env.choices) env.choices = [{}];
      if (!env.choices[0]) env.choices[0] = {};
      if (!env.choices[0].message) env.choices[0].message = { role: 'assistant' };
      env.choices[0].message.content = JSON.stringify(obj);
      return JSON.stringify(env);
    } catch(e){ return null; }
  }

  // 応答を検分して「素通し / 書き換え / 再試行」を決める
  function handleLoad(xhr, reqBody, done){
    ST.attempts++;
    var raw = readRaw(xhr);
    ST.lastRaw = head(raw);

    var env = null;
    try { env = JSON.parse(raw); } catch(e){ env = null; }
    if (!env){
      ST.lastError = 'envelope-not-json';
      try { console.warn(TAG, 'response is not JSON (head):', head(raw)); } catch(_){}
      return done();                                    // fix436 が従来どおり失敗処理
    }

    var texts = contentsOf(env);
    var i, cand = null;

    // ① content がそのまま素のJSONなら **一切触らない**（素通し）
    if (texts.length && typeof texts[0] === 'string'){
      var direct = null;
      try { direct = JSON.parse(String(texts[0]).replace(/^\s+|\s+$/g, '')); } catch(e){ direct = null; }
      if (direct && typeof direct === 'object' && Object.prototype.toString.call(direct) !== '[object Array]' && countKeys(direct) > 0){
        ST.passthrough++;
        return done();
      }
    }

    // ② フェンス/散文/切断から救出
    for (i = 0; i < texts.length; i++){
      cand = extractJson(texts[i]);
      if (cand && countKeys(cand) > 0) break;
      cand = null;
    }
    if (cand){
      var packed = repack(env, cand);
      if (packed && shadow(xhr, packed)){
        // 「閉じ括弧が無かった＝切断」なら repaired、それ以外は extracted
        var t0 = texts.length ? String(texts[0]) : '';
        var wasTruncated = (t0.indexOf('{') >= 0 && t0.lastIndexOf('}') < t0.indexOf('{'));
        if (wasTruncated) ST.repaired++; else ST.extracted++;
        try { console.log(TAG, (wasTruncated ? 'repaired(truncated)' : 'extracted'), countKeys(cand), 'keys'); } catch(_){}
        return done();
      }
    }

    // ③ 救出不能 → 伝承抜き＋厳格指示で1回だけ再試行
    ST.lastError = texts.length ? 'unextractable' : 'empty-content';
    try { console.warn(TAG, 'unusable response (' + ST.lastError + '), head:', head(texts.length ? texts[0] : raw)); } catch(_){}

    if (xhr.__f446retried){ ST.failed++; return done(); }
    xhr.__f446retried = true;

    var rb = buildRetryBody(reqBody);
    if (!rb){ ST.failed++; return done(); }

    ST.retried++;
    setStatus('🎲 応答が途中で切れました。書き直しています…（あと数秒）');
    sendRetry(rb, function(err, obj, rawRetry){
      if (!err && obj && countKeys(obj) > 0){
        var packed2 = repack(env, obj);
        if (packed2 && shadow(xhr, packed2)){
          try { console.log(TAG, 'retry ok:', countKeys(obj), 'keys'); } catch(_){}
          return done();
        }
      }
      ST.failed++;
      ST.lastError = 'retry-' + (err ? String(err.message || err) : 'unextractable');
      ST.lastRaw = head(rawRetry || ST.lastRaw);
      try { console.warn(TAG, 'retry failed:', ST.lastError, '| head:', head(rawRetry)); } catch(_){}
      done();                                            // 元の応答のまま fix436 へ（入力は無傷）
    });
  }

  function sendRetry(bodyStr, cb){
    var st = getS(), cfg = (st && st.cfg) || {};
    var x;
    try {
      x = new XMLHttpRequest();
      x.open('POST', OR_URL, true);                      // fix247 が proxy へ書換＋ヘッダ付与
      x.setRequestHeader('Content-Type', 'application/json');
      x.setRequestHeader('Authorization', 'Bearer ' + (cfg.orKey || ''));
      x.timeout = TIMEOUT_MS;
      x.__f446retry = true;                              // 自分の send ラップで再処理しない印
      x.onload = function(){
        var raw = '';
        try { raw = (RT_DESC && typeof RT_DESC.get === 'function') ? RT_DESC.get.call(x) : x.responseText; } catch(e){ raw = ''; }
        if (x.status !== 200) return cb(new Error('HTTP ' + x.status), null, raw);
        var env = null;
        try { env = JSON.parse(raw); } catch(e){ return cb(new Error('envelope'), null, raw); }
        var ts = contentsOf(env), obj = null, i;
        for (i = 0; i < ts.length; i++){ obj = extractJson(ts[i]); if (obj && countKeys(obj) > 0) break; obj = null; }
        cb(obj ? null : new Error('unextractable'), obj, ts.length ? ts[0] : raw);
      };
      x.onerror   = function(){ cb(new Error('network'), null, ''); };
      x.ontimeout = function(){ cb(new Error('timeout'), null, ''); };
      x.send(bodyStr);
    } catch(e){ cb(e || new Error('send'), null, ''); }
  }

  // ===================================================================
  // 送信境界: send をラップ（fix442 の外側 = index.html 最後尾）
  // ===================================================================
  function rewriteSendBody(xhr, s){
    var o;
    try { o = JSON.parse(s); } catch(e){ return s; }
    if (!pickMsgs(o)) return s;                          // fix436 の sys でなければ触らない

    // ① max_tokens を必要量へ（下げない。既に十分なら触らない）
    var keys = countBlankKeys(s);
    var need = neededMaxTokens(keys);
    var cur  = (typeof o.max_tokens === 'number') ? o.max_tokens : 0;
    var out = s;
    if (need > cur){
      o.max_tokens = need;
      try { out = JSON.stringify(o); ST.raised++; } catch(e){ out = s; }
      try { console.log(TAG, 'max_tokens', cur, '->', need, '(' + keys + ' blank keys)'); } catch(_){}
    }
    // ② 応答フックを仕掛ける（fix436 は onload を send より前に代入する＝fix436:330,341）
    hookResponse(xhr, out);
    return out;
  }

  function hookResponse(xhr, reqBody){
    try {
      if (xhr.__f446hooked) return;
      var prev = xhr.onload;
      if (typeof prev !== 'function') return;            // 想定外の呼び出し順 → 触らない
      xhr.__f446hooked = true;
      xhr.onload = function(ev){
        var self = this;
        var done = function(){
          try { prev.call(self, ev); }
          catch(e){ try { console.warn(TAG, 'orig onload err', e && e.message); } catch(_){} }
        };
        try {
          if (off()) return done();
          if (self.status !== 200) return done();        // HTTPエラーは fix436 に任せる
          handleLoad(self, reqBody, done);
        } catch(e){
          ST.lastError = 'hook-' + (e && e.message);
          try { console.warn(TAG, 'hook err', e && e.message); } catch(_){}
          done();
        }
      };
    } catch(e){}
  }

  function armSend(){
    try {
      if (typeof XMLHttpRequest === 'undefined' || !XMLHttpRequest.prototype) return false;
      var cur = XMLHttpRequest.prototype.send;
      if (typeof cur !== 'function') return false;
      if (cur.__f446) return true;
      var inner = cur;
      var w = function(body){
        var b = body;
        try {
          if (!off() && !this.__f446retry && typeof b === 'string' && isFillBody(b)){
            b = rewriteSendBody(this, b);
          }
        } catch(e){ b = body; }
        if (arguments.length === 0) return inner.apply(this, arguments);
        return inner.call(this, b);
      };
      // fix419c教訓: 内側関数の own props を全継承（fix442の __f442 等を消さない）
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
      } catch(e){}
      w.__f446 = true;
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
      if (ticks > 50) clearInterval(iv);                 // 約30秒で停止（有限）
    }, 600);
    window.__v292Dfix446_stopKeeper = function(){ try { clearInterval(iv); } catch(e){} };
  })();
  try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}

  // ===================================================================
  // D) 可観測性 / 検証口（冪等ガードを兼ねる）
  // ===================================================================
  window.__v292Dfix446 = {
    extractJson: extractJson,
    normalizeStructural: normalizeStructural,
    stripFences: stripFences,
    scanObject: scanObject,
    isFillBody: isFillBody,
    countBlankKeys: countBlankKeys,
    neededMaxTokens: neededMaxTokens,
    buildRetryBody: buildRetryBody,
    armSend: armSend,
    off: off,
    SIG_USER: SIG_USER,
    SIG_SYS: SIG_SYS,
    ALT_HEAD: ALT_HEAD,
    stats: function(){
      return {
        off: off(),
        attempts: ST.attempts,
        passthrough: ST.passthrough,
        extracted: ST.extracted,
        repaired: ST.repaired,
        retried: ST.retried,
        failed: ST.failed,
        raised: ST.raised,
        lastRaw: ST.lastRaw,
        lastError: ST.lastError
      };
    },
    _state: function(){
      var s = false;
      try { s = !!(XMLHttpRequest.prototype.send && XMLHttpRequest.prototype.send.__f446); } catch(e){}
      return { sendArmed: s, off: off(), hasRtDesc: !!(RT_DESC && RT_DESC.get) };
    }
  };
})();
