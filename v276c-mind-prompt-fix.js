// v276c-mind-prompt-fix.js
// 目的: v276 character-mind の出力スキーマを固定し、値の創造性は保つ。
//       Hermes 4 405B が毎回違うスキーマ ("story", "dialogues",
//       "kaleido_context" 等) を発明する暴走を物理的に止める。
//
// 設計哲学 (制約より刺激):
//   - 「外形」は固定 (キャラ名 → 2〜3 文の文字列)
//   - 「中身」は完全自由 (解離・身体感覚・本人未自覚・断片化、何でも OK)
//   - 表現の自由とリアリティを犠牲にしないため、温度は控えめに下げるだけ
//
// 動作:
//   - window.fetch を hook し、X-Title が 'v276 character-mind' のリクエストを傍受
//   - 送信前に body を書き換える:
//     1. system prompt に出力例 + 禁止リストを追記
//     2. messages に assistant プレフィル ('{\n  "') を追加
//        → Hermes は JSON のキャラ名から始めるしかなくなる
//     3. temperature 0.95 → 0.8 (値の自由度は保ちつつ schema 揺れを抑制)
//   - 受信後、レスポンス本文がプレフィルを含まない場合は前置して返す
//     (一部プロバイダはプレフィルを返答に含めない)
//
// チェーン:
//   v276 (orchestration) → callMindAnalysis()
//     → fetch() → [v276b 受信時 repair] → [v276c 送信時 schema 強化 + 受信時 prefill 補正] → OpenRouter
//
// ガート: window.__v276cActive

(function v276c() {
  'use strict';
  if (window.__v276cActive) return;
  window.__v276cActive = true;
  console.log('[v276c] mind-prompt-fix init');

  var PREFILL = '{\n  "';
  var TARGET_TEMP = 0.8;
  var MIN_MAX_TOKENS = 1000;

  // === 出力例: スキーマ固定 + 値の方向性を「見せる」===
  // [v276c-rev2] 旧版はリナ/スピカの具体描写を入れていたため Hermes が中身ごと
  // 逐語コピーして毎ターン同じ文面を返す問題が発生。
  // 改修方針:
  //   - キャラ名はプレースホルダ (<キャラA> / <キャラB>) にして「置き換える」前提を示す
  //   - 値の中身は現在のシナリオ (眼球喰い・蜘蛛など) と無関係な抽象的身体感覚に振る
  //   - 「中身は絶対にコピーするな」という強い禁止文を例の直後に置く
  var SCHEMA_EXAMPLE =
    '【出力例 (この外形を厳密に守る — 値の中身は ⚠ 絶対にこのまま使わない ⚠)】\n' +
    '{\n' +
    '  "<キャラA>": "<2〜3 文の自由記述。例: 視界の端だけがやけに鮮明で、中央が遠い。' +
    '手のひらの温度が分からない。何かを言わなければ、と思うが言葉が降りてこない。>",\n' +
    '  "<キャラB>": "<2〜3 文の自由記述。例: 自分の決断のはずなのに、決めた瞬間が思い出せない。' +
    '足だけが先に進んでいる。喉の奥がやけに乾いている。>"\n' +
    '}\n' +
    '\n' +
    '⚠ 重要: 上の例文はあくまで【外形】(JSON の形 / キャラ名 → 2〜3 文の文字列) を示す雛型です。\n' +
    '  - キーの "<キャラA>" / "<キャラB>" は必ず、いま実際にシーンに登場している\n' +
    '    キャラの日本語名 (リナ / カエデ / スピカ など) に置き換えてください。\n' +
    '  - 値の【中身】(「視界の端…」「自分の決断…」「手のひらの温度」「喉の奥」等の語彙) を\n' +
    '    そのままコピーしてはいけません。例文と同じ文を返した時点で失敗です。\n' +
    '  - 値は必ず、今このターンの状況・各キャラの直近の経験・身体状態に基づいて\n' +
    '    新しく観察して書いてください。例文の言い回しを真似ず、語彙・着眼点・温度感まで\n' +
    '    その場から立ち上げること。';

  // === 禁止リスト: 過去に観測された暴走パターンを名指しで止める ===
  var BANLIST =
    '【絶対に出力してはいけないキー / 構造】\n' +
    '- "story" / "dialogues" / "narrative" / "scene" / "events" など物語系キー\n' +
    '- "kaleido_context" / "characters_status" / "emotion" / "physical" / "psychological" / "actions" など分析系キー\n' +
    '- {% include ... %} / {{ ... }} のような Jinja / Liquid テンプレートタグ\n' +
    '- ネストしたオブジェクト (例: {"カエデ": {"physical": "..."}} は禁止)\n' +
    '- 配列値 (例: {"カエデ": ["...", "..."]} は禁止)\n' +
    '- トップレベルキーは「シーンに登場している実在キャラの日本語名」のみ\n' +
    '- 値は単一の日本語文字列 (2〜3 文)。それ以外の型は禁止。\n' +
    '- 上記【出力例】の値の中身を逐語コピーすること (例文の文面を再利用するのは禁止)';

  var REINFORCE =
    '【再確認】\n' +
    '出力は { "<キャラ名>": "<2〜3 文の自由記述>" } の形式のみ。\n' +
    '値の中身は完全に自由 (解離・身体感覚・本人未自覚・断片化・連想、何でも OK)。\n' +
    '外形だけ守ってください。値の中身は毎ターン、その場のシーンから新しく書き起こすこと。';

  // === Body 書き換え ===
  function modifyBody(body) {
    try {
      var msgs = Array.isArray(body.messages) ? body.messages.slice() : [];

      // 1. system prompt に追記 (上書きでなく append)
      var foundSystem = false;
      for (var i = 0; i < msgs.length; i++) {
        if (msgs[i].role === 'system') {
          msgs[i] = {
            role: 'system',
            content: msgs[i].content + '\n\n' + SCHEMA_EXAMPLE +
                     '\n\n' + BANLIST + '\n\n' + REINFORCE
          };
          foundSystem = true;
          break;
        }
      }
      if (!foundSystem) {
        msgs.unshift({ role: 'system', content: SCHEMA_EXAMPLE + '\n\n' + BANLIST + '\n\n' + REINFORCE });
      }

      // 2. (旧 prefill ロジックは Hermes via OpenRouter では逆効果だったため除去。
      //    Hermes は assistant role を「前のターン」として扱い、独自に markdown
      //    で包んだ JSON を返してしまい、レスポンス側で prepend すると壊れる。
      //    schema 例 + 禁止リスト + temperature 0.8 だけで構造を安定させる。)

      // 3. 温度: 0.95 → 0.8
      body.temperature = TARGET_TEMP;
      // top_p は触らない (値の表現幅は維持)

      // 4. プレフィル分の補正
      if (!body.max_tokens || body.max_tokens < MIN_MAX_TOKENS) {
        body.max_tokens = MIN_MAX_TOKENS;
      }

      body.messages = msgs;
      return body;
    } catch (e) {
      console.warn('[v276c] body modification failed', e);
      return body;
    }
  }

  // === Response 補正: 旧 prefill 戦略は除去。応答はそのまま v276b に渡す。 ===
  function fixResponseContent(content) {
    return content;  // no-op (markdown 剥がし & 欠落カンマ修復は v276b の責務)
  }

  // === Fetch hook ===
  var origFetch = window.fetch.bind(window);
  if (origFetch.__v276cHooked) {
    console.log('[v276c] fetch already hooked, skipping');
    return;
  }

  function isMindCall(url, opts) {
    if (typeof url !== 'string') return false;
    if (url.indexOf('openrouter.ai') < 0) return false;
    if (!opts || !opts.headers) return false;
    var title = opts.headers['X-Title'] || opts.headers['x-title'];
    return typeof title === 'string' && title.indexOf('v276 character-mind') >= 0;
  }

  var hooked = function (url, opts) {
    if (!isMindCall(url, opts) || !opts.body) {
      return origFetch(url, opts);
    }

    // 送信前: body 書き換え
    var newOpts;
    try {
      var body = JSON.parse(opts.body);
      body = modifyBody(body);
      newOpts = Object.assign({}, opts, { body: JSON.stringify(body) });
      console.log('[v276c] modified outgoing character-mind request (temp=' + body.temperature + ', prefill applied)');
    } catch (e) {
      console.warn('[v276c] body parse failed, sending original', e);
      return origFetch(url, opts);
    }

    // 送信 + 受信時 prefill 補正
    return origFetch(url, newOpts).then(function (res) {
      // クローンを使って body を読みつつ、補正後の Response を返す
      return res.clone().json().then(function (json) {
        try {
          if (json && json.choices && Array.isArray(json.choices)) {
            for (var i = 0; i < json.choices.length; i++) {
              var msg = json.choices[i] && json.choices[i].message;
              if (msg && typeof msg.content === 'string') {
                var fixed = fixResponseContent(msg.content);
                if (fixed !== msg.content) {
                  msg.content = fixed;
                  console.log('[v276c] prepended prefill to response choice ' + i);
                }
              }
            }
          }
          var newHeaders = new Headers(res.headers);
          newHeaders.delete('content-length');
          newHeaders.set('content-type', 'application/json');
          return new Response(JSON.stringify(json), {
            status: res.status,
            statusText: res.statusText,
            headers: newHeaders
          });
        } catch (e) {
          console.warn('[v276c] response patching failed, returning original', e);
          return res;
        }
      }).catch(function (e) {
        console.warn('[v276c] response read failed, returning original', e);
        return res;
      });
    });
  };
  hooked.__v276cHooked = true;
  window.fetch = hooked;
  console.log('[v276c] fetch hook installed');

  // === Public API ===
  window.__v276c = {
    modifyBody: modifyBody,
    fixResponseContent: fixResponseContent,
    PREFILL: PREFILL,
    SCHEMA_EXAMPLE: SCHEMA_EXAMPLE,
    BANLIST: BANLIST
  };

  console.log('[v276c] init complete');
})();
