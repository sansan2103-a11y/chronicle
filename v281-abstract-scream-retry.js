// v281-abstract-scream-retry.js
//
// 目的: narrative の抽象悲鳴 (悲鳴/絶叫/金切り声/叫び声/うめき声/呻き声/呻吟/嗚咽)
//       を検出し、その近傍に引用形式の長音絶叫が無ければ retry する
//       (v280 の prompt 先回りでもサボった場合のセーフティネット)
//
// 背景 (おしんさん 2026-05-09 報告):
//   v220 の retry は「response 中に LONG_SCREAM_RX パターンが 1 つでもあれば OK」と
//   判定するため、前ターンの「んぐぅ」のような短い呻きが含まれていると
//   narrative が抽象描写でも retry されない。
//
// 動作:
//   fetch wrap → response の narrative を抜き出し
//   ABSTRACT_SCREAM_RX が match (= 抽象悲鳴ワードあり)
//   かつ QUOTED_SCREAM_RX が match しない (= 長音絶叫の引用が同じ narrative 内に無い)
//   → retry を発動
//
//   v279 toggle が OFF なら一切何もしない。
//   v281 自身の retry は最大 1 回 (window.__v281Retrying flag で制御)。
//
// ガード: window.__v281Active

(function v281() {
  'use strict';
  if (window.__v281Active) return;
  window.__v281Active = true;
  console.log('[v281] abstract-scream-retry init');

  // ============================================================
  // 検出ロジック
  // ============================================================

  // 抽象悲鳴ワード (narrative 中で発見すべき)
  var ABSTRACT_SCREAM_RX = /(悲鳴|絶叫|金切り声|叫び声|叫び(?!ば)|うめき声|呻き声|呻吟|嗚咽|わめき声|哀鳴)/;

  // narrative 内の引用された長音絶叫
  // 「...」または『...』の中に長音 (3+) や典型絶叫パターンがあれば match
  var QUOTED_SCREAM_RX = /[「『][^」』]*?(あ{3,}|い{3,}|う{3,}|きゃ{2,}|ぎゃ{2,}|ひぃ{2,}|いやぁ{2,}|あぁ{2,}|うぅ{2,}|やめて|助けて|痛い痛い|いやだ|ぐぅ|ぎぃ)[^」』]*?[」』]/;

  function detectAbstractScreamWithoutQuote(narrativeText) {
    if (!narrativeText) return false;
    if (!ABSTRACT_SCREAM_RX.test(narrativeText)) return false;
    return !QUOTED_SCREAM_RX.test(narrativeText);
  }

  // ============================================================
  // v279 toggle 連動
  // ============================================================
  function isEnabled() {
    if (window.__v279 && typeof window.__v279.getEnabled === 'function') {
      return window.__v279.getEnabled();
    }
    return true;
  }

  // ============================================================
  // Fetch wrap
  // ============================================================
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (!isApi) return origFetch(input, init);

    // v279 OFF → 何もしない
    if (!isEnabled()) return origFetch(input, init);

    // 既に v281 retry 中ならスキップ
    if (window.__v281Retrying) return origFetch(input, init);

    var firstResp = origFetch(input, init);
    return firstResp.then(function (resp) {
      if (!resp.ok) return resp;
      var clone = resp.clone();
      return clone.text().then(function (text) {
        try {
          var json = JSON.parse(text);
          var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!content || typeof content !== 'string') return resp;

          // narrative 部分を抽出。content は JSON 形式 (chronicle plan) か plain text かどちらか。
          // 簡易抽出: JSON なら "narrative":"..." を取り出し、無理なら全文を narrative 扱い
          var narrativeText = extractNarrative(content);
          if (!narrativeText) return resp;

          if (!detectAbstractScreamWithoutQuote(narrativeText)) return resp;

          window.__v281Retrying = true;
          console.warn('[v281] abstract scream without quote — retrying. sample:',
            narrativeText.match(ABSTRACT_SCREAM_RX) && narrativeText.match(ABSTRACT_SCREAM_RX)[0]);

          var newInit = JSON.parse(JSON.stringify(init));
          var body2;
          try {
            body2 = JSON.parse(newInit.body);
          } catch (e) {
            window.__v281Retrying = false;
            return resp;
          }
          if (!body2.messages) {
            window.__v281Retrying = false;
            return resp;
          }
          body2.messages.push({
            role: 'user',
            content:
              '⚠️ 前の応答は narrative に「悲鳴」「絶叫」「金切り声」「うめき声」のような ' +
              '**抽象悲鳴ワード** を含んでいたが、**それを引用形式で展開していない**。\n\n' +
              '**やり直し**:\n' +
              '- 「悲鳴が響いた」「金切り声が迸った」「絶叫した」「呻き声を漏らした」のような抽象描写の ' +
              '**直後に必ず キャラ名「いやぁああ！」/「ひぃぃぃっ！」/「ぎゃあああ！」など 3 文字以上の長音絶叫を引用形式** で展開する。\n' +
              '- 該当キャラの絶望語連呼 (やめてやめて / 助けて / 痛い痛い / いやだいやだ) や呻吟 (んぐぅ / うぅ……) も合わせて入れる。\n' +
              '- narrative 中なら 名前「セリフ」 / 名前『セリフ』 形式、JSON では dialogues 配列に入れる。\n' +
              '- 同じ悲鳴の連発ではなく、毎回違う言葉/角度で書く。\n\n' +
              'このシーンを再生成してください。'
          });
          newInit.body = JSON.stringify(body2);

          var retry = origFetch(input, newInit);
          return retry.then(function (r2) {
            window.__v281Retrying = false;
            return r2;
          }).catch(function (e) {
            window.__v281Retrying = false;
            console.warn('[v281] retry failed', e);
            return resp;
          });
        } catch (e) {
          return resp;
        }
      });
    });
  };

  // ============================================================
  // narrative 抽出ヘルパ
  // ============================================================
  function extractNarrative(content) {
    // 1) JSON {"narrative": [...]} or {"narrative": "..."}
    var m = content.match(/"narrative"\s*:\s*(\[[\s\S]*?\]|"[^"]*")/);
    if (m) {
      var raw = m[1];
      if (raw[0] === '[') {
        try {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr)) return arr.join('\n');
        } catch (e) {}
      } else {
        return raw.slice(1, -1);  // strip quotes
      }
    }
    // 2) plain text fallback
    return content;
  }

  console.log('[v281] fetch wrapped');

  // ============================================================
  // API
  // ============================================================
  window.__v281 = {
    ABSTRACT_SCREAM_RX: ABSTRACT_SCREAM_RX,
    QUOTED_SCREAM_RX: QUOTED_SCREAM_RX,
    detectAbstractScreamWithoutQuote: detectAbstractScreamWithoutQuote,
    extractNarrative: extractNarrative,
    isEnabled: isEnabled
  };

  console.log('[v281] init complete');
})();
