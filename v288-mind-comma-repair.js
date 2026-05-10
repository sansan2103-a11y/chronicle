// v288-mind-comma-repair.js
// 目的: Hermes 4 が JSON object のキー値ペア間で `,` を落としたときに自動修復。
//
// 背景 (おしんさん 2026-05-10 観測):
//   v276-character-mind.js が `[v276] mind parse fail: Expected ',' or '}' after
//   property value in JSON at position 115` を頻発。raw を確認すると:
//     { "ミコト": "...近づいてくる。" "アリア": "腰の裏剣袋から…" }
//                                  ↑ ここに `,` が無い
//   Hermes 4 が JSON 構造の規律を時折破る既知パターン。値内容は正しく日本語で書かれて
//   いるので、構造だけ後処理で補修すれば mind injection が活きる。
//
//   結果として:
//   - mind が parsed に乗らない → 内面状態が空 → fallback render (空 dialog 「りあ」「りあ」が並ぶ)
//   - 物語進行は止まらないが、キャラの内面駆動が外れ、表現が薄くなる
//
// 哲学:
//   - 「制約より刺激」: LLM 側に JSON 規律を強要しない、後処理で構造を担保
//   - v286e と同じく「Hermes 4 を自由に書かせ、こちらで形を整える」方向
//
// 実装方針:
//   1. window.fetch を wrap (最外層)
//   2. openrouter.ai 宛のレスポンスを intercept
//   3. response body の choices[0].message.content を取得
//   4. content が JSON object 形式 (例: `{ "ミコト": "...", ... }`) なら、
//      キー値ペア間の missing comma を補修
//   5. 修復後の content で Response を再構築 (status/headers は保持)
//
// 修復パターン:
//   `"value"<ws>"key":` (comma 無し) → `"value",<ws>"key":`
//   regex: /("(?:[^"\\]|\\.)*")(\s+)("[^"\n]{1,40}")(\s*):/g
//   - キャプチャ 1: value (引用符付き、エスケープ対応)
//   - キャプチャ 2: 値とキーの間のホワイトスペース (改行含む)
//   - キャプチャ 3: 次のキー (引用符付き)
//   - キャプチャ 4: コロン前のホワイトスペース
//
//   注: キー値が正しくカンマ区切りなら value の直後は `,` で、`(\s+)("...":)` にマッチ
//        しないので何もしない (idempotent)。
//
// 影響範囲:
//   - mind モジュール (v276) の出力 → 修復 → parse 成功
//   - seed 拡張 (v286/v286e) の出力 → JSON ならそのまま、ナラティブなら無関係
//   - 物語 turn (v274) の出力 → ナラティブなので JSON 構造を持たず無関係
//
// チェーン:
//   fetch =
//     (caller)
//     → window.fetch (= v288 wrap、newest)
//       → v288: response body の content を repair
//       → 元の window.fetch (= v211/v287/v246/native の chain)
//
// ガード: window.__v288Active

(function v288(){
  'use strict';
  if (window.__v288Active) return;
  window.__v288Active = true;

  var TAG = '[v288]';
  console.log(TAG, 'mind comma-repair init');

  // キー値ペア間の missing comma 修復
  // "value"<ws>"key": → "value",<ws>"key":
  function repairMissingCommas(text){
    if (!text || typeof text !== 'string') return text;
    var fixCount = 0;
    var repaired = text.replace(
      /("(?:[^"\\]|\\.)*")(\s+)("[^"\n]{1,40}")(\s*):/g,
      function(m, val, ws, key, ws2){
        fixCount++;
        return val + ',' + ws + key + ws2 + ':';
      }
    );
    return { text: repaired, fixCount: fixCount };
  }

  // mind/seed shape 検出: object 内に `"key": "value"` 形式が 1 個以上
  function looksLikeKvObject(content){
    if (!content) return false;
    var s = String(content).trim();
    // コードフェンス除去
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    // 先頭が `{` で始まる
    if (!/^\s*\{/.test(s)) return false;
    // `"<key>": "..."` パターンが 1 つ以上
    return /"[^"\n]{1,40}"\s*:\s*"/.test(s);
  }

  // content の JSON 風部分のみ修復し、残り (前後の説明文等) は保持
  function repairContent(content){
    if (!content) return null;
    if (!looksLikeKvObject(content)) return null;
    // {} の範囲を切り出して repair
    var firstBrace = content.indexOf('{');
    var lastBrace = content.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    var head = content.slice(0, firstBrace);
    var jsonPart = content.slice(firstBrace, lastBrace + 1);
    var tail = content.slice(lastBrace + 1);
    var r = repairMissingCommas(jsonPart);
    if (r.fixCount === 0) return null;  // 修復不要だった
    var newContent = head + r.text + tail;
    return { newContent: newContent, fixCount: r.fixCount };
  }

  // ===== fetch wrap =====
  function patchFetch(){
    if (window.fetch.__v288Wrapped) return true;
    var prev = window.fetch;
    var wrapped = function(url, opts){
      var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
      var promise = prev.apply(this, arguments);
      if (!/openrouter\.ai\/api\/v1\/chat\/completions/i.test(urlStr)){
        return promise;
      }
      return promise.then(function(res){
        try {
          if (!res || !res.ok) return res;
          var ct = res.headers && res.headers.get && res.headers.get('content-type') || '';
          if (!/json/i.test(ct)) return res;
          // body を読むため clone
          var clone = res.clone();
          return clone.text().then(function(bodyText){
            try {
              var j = JSON.parse(bodyText);
              var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
              if (!content || typeof content !== 'string') return res;
              var rep = repairContent(content);
              if (!rep) return res;  // 修復不要 or 対象外
              j.choices[0].message.content = rep.newContent;
              window.__v288RepairCount = (window.__v288RepairCount || 0) + 1;
              if (window.__v288RepairCount <= 5){
                console.log(TAG, 'repaired mind/kv response: +' + rep.fixCount + ' commas (total repairs=' + window.__v288RepairCount + ')');
              }
              return new Response(JSON.stringify(j), {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers
              });
            } catch(e){
              // body が JSON でない / 解釈できない → そのまま
              return res;
            }
          }).catch(function(e){
            console.warn(TAG, 'response interception failed, passthrough:', e && e.message);
            return res;
          });
        } catch(e){
          console.warn(TAG, 'wrap then-block error, passthrough:', e && e.message);
          return res;
        }
      });
    };
    wrapped.__v288Wrapped = true;
    window.fetch = wrapped;
    console.log(TAG, 'fetch wrapped (response-side repair)');
    return true;
  }

  patchFetch();

  // 後発 wrap (v211 / 他) で剥がされた場合の継続再 wrap
  var tries = 0;
  var iv = setInterval(function(){
    if (!window.fetch.__v288Wrapped){
      patchFetch();
    }
    if (++tries > 60) clearInterval(iv);
  }, 1000);

  // ===== Public API =====
  window.__v288 = {
    repairMissingCommas: repairMissingCommas,
    repairContent: repairContent,
    looksLikeKvObject: looksLikeKvObject,
    getRepairCount: function(){ return window.__v288RepairCount || 0; }
  };

  console.log(TAG, 'init complete');
})();
