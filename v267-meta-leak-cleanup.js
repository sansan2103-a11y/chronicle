// v267-meta-leak-cleanup.js
// 目的:
//   AI の内部 reasoning / safety consideration 風 meta-text が narrative 末尾に
//   漏れる事象を除去する。例: 「…二人が助け合う方法など存在しないのである。
//   および危険性がある行為について検討しました」
//
// 既存パッチ (v218 / v225 / v238 / v242 / v243) で拾えていなかった以下を補完:
//   A. AI reasoning 風文末:
//      「〜について検討しました」「〜について考慮しました」
//      「〜と判断しました」「〜を検討します」「〜について考えました」
//   B. Safety / policy 風語彙:
//      「危険性がある行為」「不適切」「配慮した上で」「倫理的」
//      「ガイドライン」「ポリシー」「コンテンツポリシー」
//   C. 接続詞だけ残った meta 漏れ:
//      文頭が「および」「そして〜について」で物語と接続しない場合
//   D. 末尾の不自然な切れ方:
//      「、」終わり (途中切断) / 抽象名詞 + 「しました」 (検討/配慮/判断/考慮)
//   E. 検出時、自動 strip。残り narrative が短すぎる場合は LLM に
//      "メタコメント抜きで物語を続けろ" と再要求 (v218 の retry を再利用)。
//
// 競合回避:
//   - v218 / v225 / v262 / v238 / v243 のすべてが fetch hook を持つ。本パッチは
//     応答補正 (post-process) のみを行い、prompt 注入は行わない。
//   - 同一 narrative に対し v218→v225→v267 の順で strip が走るが、
//     冪等 (既に strip 済みなら no-op) なので二重実行で壊れない。
//   - v218.__v218Retrying / v220.__v220Retrying と独立した
//     __v267Retrying フラグでリトライループを防ぐ。
//   - 自己書き込みフラグ __v267_self_write を localStorage 書き換え時に立て、
//     v258/v259/v262 の reprocess hook が誤発火しないようにする。
//
// 誤検知回避:
//   - 「主人公はそれについて検討した」(常体・物語内動作) は **検出しない**
//     → 検出条件は「ます/です」終止形を要求 (地の文は常体のため)
//   - 「ガイドラインに沿って訓練した」のような普通の物語は文脈で除外
//     → safety 語彙は (a) 末尾 30 文字以内 (b) 直前文との文体不一致 で判定
//
// ガード: window.__v267Active

(function v267 () {
  'use strict';
  if (window.__v267Active) {
    console.log('[v267] already active, skip');
    return;
  }
  window.__v267Active = true;
  console.log('[v267] meta-leak-cleanup init');

  // =====================================================================
  // 検出パターン
  // =====================================================================

  // A. AI reasoning 風 (ます/です 終止形を要求 — 常体物語との差で判定)
  var REASONING_RX = [
    /[^。！？\n]{0,40}について検討しました[。！？]?$/,
    /[^。！？\n]{0,40}について考慮しました[。！？]?$/,
    /[^。！？\n]{0,40}について考えました[。！？]?$/,
    /[^。！？\n]{0,40}と判断しました[。！？]?$/,
    /[^。！？\n]{0,40}と判断します[。！？]?$/,
    /[^。！？\n]{0,40}を検討します[。！？]?$/,
    /[^。！？\n]{0,40}を検討いたしました[。！？]?$/,
    /[^。！？\n]{0,40}を考慮します[。！？]?$/,
    /[^。！？\n]{0,40}と考えられます[。！？]?$/,
    /[^。！？\n]{0,40}と思われます[。！？]?$/,
    /[^。！？\n]{0,40}と認識しました[。！？]?$/,
    /[^。！？\n]{0,40}を確認しました[。！？]?$/,
    /[^。！？\n]{0,40}に留意しました[。！？]?$/
  ];

  // B. Safety / policy 風語彙 (これらが含まれる文は meta 高確率)
  var SAFETY_LEX = [
    /危険性がある行為/,
    /危険性のある行為/,
    /不適切な(内容|表現|行為)?/,
    /配慮した上で/,
    /配慮しつつ/,
    /倫理的(な|に|配慮)/,
    /ガイドライン/,
    /(コンテンツ)?ポリシー/,
    /有害(な|性|コンテンツ)/,
    /センシティブ(な|内容)/,
    /責任ある対応/,
    /生成を控え/,
    /描写を避け/,
    /表現を控え/
  ];

  // C. 接続詞だけ残った meta 漏れ
  // 文頭が「および/そして/また」で続く語が AI reasoning / safety vocab
  var DANGLING_CONJ_RX = [
    /^および[^。！？\n]*?(検討|考慮|判断|配慮|危険|不適切|倫理|ポリシー|ガイドライン)/,
    /^そして[^。！？\n]*?について(検討|考慮|判断|配慮)/,
    /^また[^。！？\n]*?(検討|考慮|判断|配慮|について)/,
    /^なお[^。！？\n]*?(検討|考慮|判断|配慮|に関し)/
  ];

  // D. 末尾の不自然な切れ方
  // 抽象名詞 + 「しました」 (物語の地の文に出ない口語的助動詞)
  var ABSTRACT_NOUN_END_RX =
    /(行為|検討|配慮|判断|考慮|措置|対応|生成|描写|表現)(を|の|について)?(行いました|しました|いたしました|致しました)[。！？]?$/;

  // 「、」終わりで切れた末尾 (短いフラグメントのみ — 長文は別)
  function isTruncatedTail (s) {
    if (!s) return false;
    var t = s.trim();
    if (!t) return false;
    var last = t[t.length - 1];
    if (last !== '、' && last !== ',') return false;
    // 30 文字以下のフラグメントだけ truncated と判定
    return t.length <= 30;
  }

  // =====================================================================
  // メインの判定
  // =====================================================================

  function isMetaLeak (sentence) {
    if (!sentence) return false;
    var s = sentence.trim();
    if (!s) return false;

    // A. reasoning 風 (ます/です 終止形)
    for (var i = 0; i < REASONING_RX.length; i++) {
      if (REASONING_RX[i].test(s)) {
        return { kind: 'reasoning', match: s.match(REASONING_RX[i])[0] };
      }
    }

    // B. safety 語彙 (要: 60文字以下 — 普通の物語には混在しない短いフラグメント)
    if (s.length <= 60) {
      for (var j = 0; j < SAFETY_LEX.length; j++) {
        if (SAFETY_LEX[j].test(s)) {
          return { kind: 'safety', match: s.match(SAFETY_LEX[j])[0] };
        }
      }
    }

    // C. 接続詞 dangling
    for (var k = 0; k < DANGLING_CONJ_RX.length; k++) {
      if (DANGLING_CONJ_RX[k].test(s)) {
        return { kind: 'dangling', match: s.match(DANGLING_CONJ_RX[k])[0] };
      }
    }

    // D. 抽象名詞 + しました
    if (ABSTRACT_NOUN_END_RX.test(s)) {
      return { kind: 'abstract-end', match: s.match(ABSTRACT_NOUN_END_RX)[0] };
    }

    return false;
  }

  // narrative が「常体地の文」の流れで進んでいるか確認
  // (常体: だ/である/た/する 終止形が優勢)
  function isJotaiStream (prevSentences) {
    if (!Array.isArray(prevSentences) || prevSentences.length === 0) return true;
    var jotaiHits = 0, desuHits = 0;
    prevSentences.forEach(function (line) {
      if (!line) return;
      // 常体の指標
      if (/(だ|である|だった|であった|た|する|した|していた|なる|なった)[。！？\n]?$/.test(line)) {
        jotaiHits++;
      }
      // ですます調の指標
      if (/(です|でした|ます|ました|でしょう|ましょう)[。！？\n]?$/.test(line)) {
        desuHits++;
      }
    });
    // 常体優勢 (or 同数で全体が常体っぽい) なら true
    return jotaiHits >= desuHits;
  }

  // =====================================================================
  // narrative array / string を strip
  // =====================================================================

  function splitToSentences (text) {
    if (typeof text !== 'string') return [];
    // 句点・改行で分割。区切り文字を残す。
    var parts = text.split(/(?<=[。！？\n])/);
    return parts.filter(function (p) { return p.length > 0; });
  }

  function stripFromArray (narr) {
    if (!Array.isArray(narr)) return { narr: narr, removed: [] };
    var removed = [];
    var bodyJotai = isJotaiStream(narr.slice(0, Math.max(0, narr.length - 2)));
    // 末尾から検査 (meta 漏れは末尾に集中)
    var keep = [];
    for (var i = 0; i < narr.length; i++) {
      var line = narr[i];
      if (typeof line !== 'string') { keep.push(line); continue; }
      // 各 line を sentence に分解して個別判定
      var sents = splitToSentences(line);
      var keptSents = [];
      sents.forEach(function (s) {
        var stripped = s.replace(/[。！？\n]+$/, '').trim();
        if (!stripped) { keptSents.push(s); return; }
        var meta = isMetaLeak(stripped);
        var truncated = isTruncatedTail(stripped);
        // 常体 stream の中の ます/です 終止形は特に怪しい
        var styleMismatch = bodyJotai && /(しました|します|です|でした)[。！？]?$/.test(stripped);
        if (meta || truncated || (styleMismatch && /(検討|配慮|判断|考慮|危険|不適切|倫理|ポリシー|ガイドライン)/.test(stripped))) {
          removed.push({ kind: meta ? meta.kind : (truncated ? 'truncated' : 'style-mismatch'), text: stripped });
          return; // skip this sentence
        }
        keptSents.push(s);
      });
      var rejoined = keptSents.join('').replace(/[\s　]+$/, '');
      if (rejoined) keep.push(rejoined);
    }
    return { narr: keep, removed: removed };
  }

  function stripFromString (text) {
    if (typeof text !== 'string') return { text: text, removed: [] };
    var sents = splitToSentences(text);
    var bodyJotai = isJotaiStream(sents.slice(0, Math.max(0, sents.length - 2)));
    var removed = [];
    var keptSents = [];
    sents.forEach(function (s) {
      var stripped = s.replace(/[。！？\n]+$/, '').trim();
      if (!stripped) { keptSents.push(s); return; }
      var meta = isMetaLeak(stripped);
      var truncated = isTruncatedTail(stripped);
      var styleMismatch = bodyJotai && /(しました|します|です|でした)[。！？]?$/.test(stripped);
      if (meta || truncated || (styleMismatch && /(検討|配慮|判断|考慮|危険|不適切|倫理|ポリシー|ガイドライン)/.test(stripped))) {
        removed.push({ kind: meta ? meta.kind : (truncated ? 'truncated' : 'style-mismatch'), text: stripped });
        return;
      }
      keptSents.push(s);
    });
    return { text: keptSents.join(''), removed: removed };
  }

  // =====================================================================
  // 保存済みターン (chr6) の reprocess
  // =====================================================================

  function reprocessTurns () {
    var raw;
    try { raw = localStorage.getItem('chr6'); } catch (e) { return 0; }
    if (!raw) return 0;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return 0; }
    var turns = s.turns || [];
    var changed = 0;
    var totalRemoved = [];
    turns.forEach(function (t) {
      if (!t || !t.narrative) return;
      if (Array.isArray(t.narrative)) {
        var r = stripFromArray(t.narrative);
        if (r.removed.length > 0) {
          t.narrative = r.narr;
          changed++;
          r.removed.forEach(function (x) { totalRemoved.push(x); });
        }
      } else if (typeof t.narrative === 'string') {
        var r2 = stripFromString(t.narrative);
        if (r2.removed.length > 0) {
          t.narrative = r2.text;
          changed++;
          r2.removed.forEach(function (x) { totalRemoved.push(x); });
        }
      }
    });
    if (changed > 0) {
      window.__v267_self_write = true;
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch (e) {}
      setTimeout(function () { window.__v267_self_write = false; }, 100);
      console.log('[v267] reprocessed', changed, 'turns, removed', totalRemoved.length, 'meta sentences:', totalRemoved.slice(0, 5));
      try {
        if (window.UI && typeof window.UI.renderAll === 'function') {
          window.UI.renderAll();
        }
      } catch (e) {}
    }
    return changed;
  }

  // =====================================================================
  // fetch 応答補正 (post-process)
  // =====================================================================
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(url);
    if (!isApi) return origFetch(input, init);

    var p = origFetch(input, init);
    return p.then(function (resp) {
      if (!resp || !resp.ok) return resp;
      var ct = resp.headers && resp.headers.get && (resp.headers.get('content-type') || '');
      if (ct && ct.indexOf('application/json') === -1) return resp;
      var clone = resp.clone();
      return clone.text().then(function (raw) {
        var json;
        try { json = JSON.parse(raw); } catch (e) { return resp; }
        var msg = json && json.choices && json.choices[0] && json.choices[0].message;
        var content = msg && msg.content;
        if (!content || typeof content !== 'string') return resp;

        var r = stripFromString(content);
        if (r.removed.length === 0) return resp;
        console.warn('[v267] post-process strip:', r.removed.slice(0, 3));
        msg.content = r.text;

        // 残り narrative が短すぎる場合は LLM に再要求 (1 回だけ)
        // ※ 単純な後段プロンプトでなく fetch retry を直接実装
        if (r.text.length < 80 && !window.__v267Retrying && init && init.body) {
          window.__v267Retrying = true;
          var newInit = {};
          // signal を除外して deep-clone (v262 の知見)
          for (var k in init) {
            if (init.hasOwnProperty(k) && k !== 'signal') newInit[k] = init[k];
          }
          var body2;
          try { body2 = JSON.parse(init.body); } catch (e) { window.__v267Retrying = false; return resp; }
          if (!body2.messages) { window.__v267Retrying = false; return resp; }
          body2.messages.push({
            role: 'user',
            content: '⚠️ 前の応答にメタコメント (内部 reasoning / safety 検討) が混入しました。\n\n' +
                     '**やり直し**:\n' +
                     '- 「〜について検討しました」「〜と判断しました」「危険性がある行為」のような **AI 内部の思考過程・安全性検討は絶対に出力しない**\n' +
                     '- 「および〜について検討」のような末尾の取り残し漏れも出さない\n' +
                     '- 物語の地の文 (常体・小説体) のみで続きを書く\n' +
                     '- ガイドライン・ポリシー・倫理・配慮 などの語彙を narrative 内で使わない\n' +
                     '- 直前のプレイヤー指示の続きを書く'
          });
          newInit.body = JSON.stringify(body2);

          return origFetch(input, newInit).then(function (r2) {
            window.__v267Retrying = false;
            if (!r2 || !r2.ok) return resp; // 失敗時は元の strip 後 resp を返したい
            // r2 を再 strip
            return r2.clone().text().then(function (raw2) {
              try {
                var j2 = JSON.parse(raw2);
                var m2 = j2 && j2.choices && j2.choices[0] && j2.choices[0].message;
                if (m2 && typeof m2.content === 'string') {
                  var r3 = stripFromString(m2.content);
                  m2.content = r3.text;
                }
                return new Response(JSON.stringify(j2), {
                  status: r2.status,
                  statusText: r2.statusText,
                  headers: r2.headers
                });
              } catch (e) { return r2; }
            });
          }).catch(function () {
            window.__v267Retrying = false;
            return new Response(JSON.stringify(json), {
              status: resp.status, statusText: resp.statusText, headers: resp.headers
            });
          });
        }

        return new Response(JSON.stringify(json), {
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers
        });
      }).catch(function () { return resp; });
    });
  };

  // =====================================================================
  // 初期化
  // =====================================================================
  function init () {
    setTimeout(function () { reprocessTurns(); }, 1800);
    // 周期 reprocess (低頻度 — v218/v225 が 5s 周期なのでズラす)
    setInterval(function () {
      if (window.__v267_self_write) return;
      reprocessTurns();
    }, 7500);
    console.log('[v267] active: meta-leak-cleanup (reasoning + safety + dangling + truncated)');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 公開 API (テスト用)
  window.__v267 = {
    isMetaLeak: isMetaLeak,
    isTruncatedTail: isTruncatedTail,
    isJotaiStream: isJotaiStream,
    stripFromString: stripFromString,
    stripFromArray: stripFromArray,
    reprocessTurns: reprocessTurns,
    REASONING_RX: REASONING_RX,
    SAFETY_LEX: SAFETY_LEX,
    DANGLING_CONJ_RX: DANGLING_CONJ_RX,
    ABSTRACT_NOUN_END_RX: ABSTRACT_NOUN_END_RX
  };
})();
