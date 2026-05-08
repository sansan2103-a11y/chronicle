// test paste// v276-character-mind.js
// 目的: 短期 (毎ターン) のキャラクター内面思索。LLM 自身に各キャラの「今この瞬間の内側」
//       を観察させ、その自由記述を Planner に注入する。
//
// 設計哲学:
//   - 列挙された反応モードリストは渡さない (= LLM が「お約束」に逃げ込まない)
//   - 分類用語ではなく、自由記述で「彼女として今何が起きているか」を書かせる
//   - 本人がまだ気づいていない変化（解離・予兆など）まで書く許可を与える
//   - メタ視点 (アーク・観客の期待) は v275 の管轄。ここでは扱わない
//
// 動作:
//   - setItem hook で chr6 (turns 配列) の変化を検知 → 毎ターン別 LLM call
//   - 結果を window.__v276Mind に保存
//   - Planner.build wrap で内面ブロックを system prompt に追記
//   - 設定トグル: cfg.characterMindEnabled (default: true)
//
// 設定 UI:
//   - 設定パネル AI セクション (v275 トグルの直後) に「キャラ内面思索: ON/OFF」
//   - localStorage に保存
//
// API call:
//   OpenRouter Hermes 4 405B / X-Title: 'Chronicle TRPG (v276 character-mind)'
//   余分なトークン: ~700 / 1 turn
//
// ガード: window.__v276Active

(function v276() {
  'use strict';
  if (window.__v276Active) return;
  window.__v276Active = true;
  console.log('[v276] character-mind init');

  var MIND_MAX_TOKENS = 700;
  var MIND_MODEL = 'nousresearch/hermes-4-405b';
  var MIND_TEMPERATURE = 0.95;       // 高め＝毎ターン違う観察を引き出す
  var MIN_TURNS_FOR_MIND = 1;         // 1 ターン履歴があれば走らせる
  var FETCH_DELAY_MS = 1500;          // turn 確定後この間隔で開始 (v275 と同じ)
  var FETCH_TIMEOUT_MS = 30000;

  // === Settings ===
  function isEnabled() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      // default ON unless explicitly false
      return s.cfg && s.cfg.characterMindEnabled !== false;
    } catch (e) { return true; }
  }

  function setEnabled(enabled) {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      if (!s.cfg) s.cfg = {};
      s.cfg.characterMindEnabled = !!enabled;
      window.__v259Writing = true;  // v259 の自己再帰書込ガード
      localStorage.setItem('chr6', JSON.stringify(s));
      setTimeout(function () { window.__v259Writing = false; }, 250);
      console.log('[v276] character-mind ' + (enabled ? 'ENABLED' : 'DISABLED'));
    } catch (e) {}
  }
  window.__v276SetEnabled = setEnabled;

  // === API key ===
  function getOrKey() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      return s.cfg && s.cfg.orKey;
    } catch (e) { return null; }
  }

  // === Build Mind request ===
  function buildMindRequest() {
    var s;
    try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return null; }
    var turns = (s.turns || []).slice(-3);
    if (turns.length < MIN_TURNS_FOR_MIND) return null;

    // 直近の物語: ナラティブ + 直前のセリフ抜粋
    var recentNarrative = turns.map(function (t, i) {
      var idx = (s.turns.length - turns.length) + i;
      var narrative = (t.narrative || '').slice(0, 600);
      var lines = '';
      // セリフがあれば添える (構造は v258 抽出に依存するが、複数候補対応)
      if (Array.isArray(t.lines) && t.lines.length) {
        lines = '\nセリフ:\n' + t.lines.map(function (ln) {
          return '  ' + (ln.who || ln.speaker || '?') + ': 「' + (ln.text || ln.line || '') + '」';
        }).join('\n');
      } else if (Array.isArray(t.dialogue) && t.dialogue.length) {
        lines = '\nセリフ:\n' + t.dialogue.map(function (ln) {
          return '  ' + (ln.who || ln.speaker || '?') + ': 「' + (ln.text || ln.line || '') + '」';
        }).join('\n');
      }
      return '[T' + idx + ']\n' + narrative + lines;
    }).join('\n\n');

    // キャスト情報 (名前識別の助けに)
    var castNames = [];
    try {
      if (s.cast) {
        Object.keys(s.cast).forEach(function (k) {
          var c = s.cast[k];
          if (c && c.name) castNames.push(c.name);
        });
      }
    } catch (e) {}
    var castHint = castNames.length
      ? '\n\n登場キャラ候補: ' + castNames.join('、') + ' （文脈に登場している者だけ書いてください）'
      : '';

    var sys =
      'あなたはホラー小説のキャラクター心象を観察する役目です。\n' +
      '\n' +
      '【あなたの仕事】\n' +
      'このシーンで動いているキャラクターを文脈から識別し、各キャラについて\n' +
      '「今この瞬間の内側」を 2〜3 文の自由記述で書いてください。\n' +
      '\n' +
      '【書き方】\n' +
      '- 分類しないでください。「ショック状態」「解離モード」のようなカテゴリ名は禁止。\n' +
      '- 彼／彼女として、今そこで何が起きているかをただ書いてください。\n' +
      '- 含めて欲しい観点 (全部書く必要はなく、その瞬間に重要なものだけ):\n' +
      '    ・ 身体は何ができる／できない？(声量、視界、四肢、出血、意識レベル)\n' +
      '    ・ 意識はどこにある？(過覚醒・解離・混濁・集中など、ただし用語化しない)\n' +
      '    ・ 直前と何が変わったか？\n' +
      '    ・ 本人はまだ気づいていないが起こりつつある変化 (書いて OK)\n' +
      '\n' +
      '【避けて欲しいこと】\n' +
      '- 物語全体のメタ評価 (アーク位置・観客の期待・展開予想) — これは別の役目\n' +
      '- 次に何が起きるかの予言\n' +
      '- 既に台詞として表現された反応をそのまま再記述するだけ\n' +
      '\n' +
      '【出力形式】\n' +
      'JSON のみ。前後に説明文・コードブロックマーカー不要:\n' +
      '{\n' +
      '  "<キャラ名>": "<2〜3 文の自由記述>",\n' +
      '  ...\n' +
      '}';

    var user = '直近の物語:\n\n' + recentNarrative + castHint;

    return { sys: sys, user: user };
  }

  // === Fire Mind call ===
  var inFlight = null;     // promise of in-flight call
  var inFlightForTurn = -1;

  function callMindAnalysis() {
    if (!isEnabled()) return Promise.reject(new Error('disabled'));
    var key = getOrKey();
    if (!key) return Promise.reject(new Error('no orKey'));
    var req = buildMindRequest();
    if (!req) return Promise.reject(new Error('not enough turns'));

    console.log('[v276] firing character-mind (extra OpenRouter call, ~' + MIND_MAX_TOKENS + ' tokens)');

    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': 'https://sansan2103-a11y.github.io/chronicle/',
        'X-Title': 'Chronicle TRPG (v276 character-mind)'
      },
      body: JSON.stringify({
        model: MIND_MODEL,
        max_tokens: MIND_MAX_TOKENS,
        temperature: MIND_TEMPERATURE,
        top_p: 0.95,
        messages: [
          { role: 'system', content: req.sys },
          { role: 'user', content: req.user }
        ]
      }),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(tid);
      if (!res.ok) throw new Error('mind HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      var text = ((json && json.choices && json.choices[0] && json.choices[0].message &&
                   json.choices[0].message.content) || '').trim();
      // strip code fences
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
      var first = text.indexOf('{'), last = text.lastIndexOf('}');
      if (first >= 0 && last > first) text = text.slice(first, last + 1);
      // tolerate trailing commas
      var cleaned = text.replace(/,(\s*[}\]])/g, '$1');
      try {
        var parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        return null;
      } catch (e) {
        console.warn('[v276] mind parse fail:', e.message, '/ raw=', text.slice(0, 200));
        return null;
      }
    });
  }

  // === Build Mind injection block ===
  function buildMindBlock() {
    var mind = window.__v276Mind;
    if (!mind || typeof mind !== 'object') return '';
    var entries = Object.keys(mind);
    if (!entries.length) return '';

    var lines = [];
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('【キャラ内面状態 (このターンの内的観察)】');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    entries.forEach(function (name) {
      var desc = String(mind[name] || '').replace(/\s+/g, ' ').trim();
      if (!desc) return;
      lines.push('◆ ' + name + ':');
      lines.push('  ' + desc);
    });
    lines.push('');
    lines.push('上記は各キャラの「今この瞬間の内側」です。これを直接セリフとして引用するのではなく、');
    lines.push('内面と矛盾しない発話・行動・描写として自然に展開してください。');
    lines.push('叫ぶこと自体を否定しません。ただし、内面が示す状態 (例: 声が出ない / 解離している)');
    lines.push('と矛盾する大声の連呼や類型的反復は避けてください。');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }

  // === Trigger every turn ===
  var lastAnalyzedTurnCount = 0;

  function maybeRunMind() {
    if (!isEnabled()) return;
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var n = (s.turns || []).length;
      if (n < MIN_TURNS_FOR_MIND) return;
      if (n === lastAnalyzedTurnCount) return;       // 同じターンで再呼出ししない
      if (inFlightForTurn === n && inFlight) return; // 既に走っている
      lastAnalyzedTurnCount = n;
      inFlightForTurn = n;
      inFlight = callMindAnalysis().then(function (mind) {
        if (mind) {
          window.__v276Mind = mind;
          console.log('[v276] mind updated:', mind);
        }
        inFlight = null;
        return mind;
      }).catch(function (e) {
        console.warn('[v276] mind fail:', e && e.message);
        inFlight = null;
      });
    } catch (e) {}
  }

  // setItem hook で turn 追加検知 (v275 と同じ手口、別フック登録)
  try {
    var origSet = Storage.prototype.setItem;
    if (!origSet.__v276Hooked) {
      var prevHooked = origSet.__v275Hooked;
      Storage.prototype.setItem = (function (prev) {
        var fn = function (key, value) {
          var ret = prev.call(this, key, value);
          if (key === 'chr6' && !window.__v259Writing) {
            setTimeout(maybeRunMind, FETCH_DELAY_MS);
          }
          return ret;
        };
        // v275 hook フラグも保持して二重登録防止
        if (prevHooked) fn.__v275Hooked = true;
        fn.__v276Hooked = true;
        return fn;
      })(Storage.prototype.setItem);
    }
  } catch (e) {}

  // === Wrap Planner.build to inject mind block ===
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v276Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (isEnabled() && r && r.sys) {
          var block = buildMindBlock();
          if (block) r.sys += '\n' + block;
        }
      } catch (e) {}
      return r;
    };
    Planner.build.__v276Wrapped = true;
    console.log('[v276] Planner.build wrapped');
    return true;
  }
  wrapPlanner();
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // === Settings UI: 設定パネルにトグルを追加 ===
  function injectToggleUI() {
    if (document.getElementById('v276-toggle')) return true;
    var panelBody = document.querySelector('.mpanel-body');
    if (!panelBody) return false;

    var section = document.createElement('div');
    section.id = 'v276-toggle';
    section.style.cssText = 'background:rgba(217,119,87,.05);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:10px';
    section.innerHTML =
      '<div style="font-size:12px;font-weight:600;color:var(--acc);margin-bottom:6px">v276 キャラ内面思索</div>' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--tx)">' +
      '<input type="checkbox" id="v276-toggle-input" checked> ' +
      '<span>有効化 (毎ターン、各キャラの内側を観察 / 別 LLM 呼出 ~700 tokens)</span>' +
      '</label>' +
      '<div style="font-size:11px;color:var(--dim);margin-top:6px">' +
      '反応モードを列挙せず、LLM 自身に「今このキャラの内側」を自由記述させ、' +
      '叫び声の繰り返しなど類型的反復を回避します。' +
      '本人未自覚の変化 (解離・予兆) も書かせる設定です。OFF にすると追加 API call は発生しません。' +
      '</div>';

    // v275 トグルの直後に挿入。なければ AI セクションの後ろ
    var v275Section = document.getElementById('v275-toggle');
    if (v275Section && v275Section.parentNode) {
      v275Section.parentNode.insertBefore(section, v275Section.nextSibling);
    } else {
      var aiSec = document.getElementById('aiInstructionsSection');
      if (aiSec && aiSec.parentNode) {
        aiSec.parentNode.insertBefore(section, aiSec.nextSibling);
      } else {
        panelBody.appendChild(section);
      }
    }

    var checkbox = document.getElementById('v276-toggle-input');
    checkbox.checked = isEnabled();
    checkbox.addEventListener('change', function () {
      setEnabled(this.checked);
    });
    console.log('[v276] settings toggle injected');
    return true;
  }

  function tryInjectUI() {
    var ov = document.getElementById('settingsOv');
    if (ov && ov.classList.contains('open')) {
      injectToggleUI();
    }
  }
  setInterval(tryInjectUI, 1000);

  // === API ===
  window.__v276 = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    callMindAnalysis: callMindAnalysis,
    buildMindBlock: buildMindBlock,
    maybeRunMind: maybeRunMind,
    getMind: function () { return window.__v276Mind; },
    forceRefresh: function () {
      lastAnalyzedTurnCount = -1;
      maybeRunMind();
    }
  };

  console.log('[v276] init complete');
})();
