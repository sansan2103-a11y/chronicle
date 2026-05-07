// v275-meta-plot-manager.js
// 目的: 中期 (5-10 ターン) のストーリーアーク管理。LLM 自身に物語の現在地を分析させ、
//       次の展開方向性を Planner に注入する。
//
// 動作:
//   - 5 ターンごとに別 LLM call (OpenRouter) で arc 分析を実行
//   - 分析結果を window.__v275Arc に保存
//   - Planner.build wrap で arc 情報を system prompt に注入
//   - 設定トグル: cfg.metaPlotEnabled (default: true)
//
// 設定 UI:
//   - 設定パネル AI セクションに「メタプロット分析: ON/OFF」スイッチ
//   - localStorage に保存
//
// API call:
//   OpenRouter Hermes 4 405B / X-Title: 'Chronicle TRPG (v275 meta-plot)'
//   余分なトークン: ~500 / 5 turn = 100 token/turn 平均
//
// ガード: window.__v275Active

(function v275() {
  'use strict';
  if (window.__v275Active) return;
  window.__v275Active = true;
  console.log('[v275] meta-plot-manager init');

  var META_INTERVAL = 5;        // 5 ターンごとに分析
  var META_MAX_TOKENS = 500;
  var META_MODEL = 'nousresearch/hermes-4-405b';

  // === Settings ===
  function isEnabled() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      // default ON unless explicitly set false
      return s.cfg && s.cfg.metaPlotEnabled !== false;
    } catch (e) { return true; }
  }

  function setEnabled(enabled) {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      if (!s.cfg) s.cfg = {};
      s.cfg.metaPlotEnabled = !!enabled;
      window.__v259Writing = true;
      localStorage.setItem('chr6', JSON.stringify(s));
      setTimeout(function () { window.__v259Writing = false; }, 250);
      console.log('[v275] meta-plot ' + (enabled ? 'ENABLED' : 'DISABLED'));
    } catch (e) {}
  }
  window.__v275SetEnabled = setEnabled;

  // === Arc analysis ===
  function getOrKey() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      return s.cfg && s.cfg.orKey;
    } catch (e) { return null; }
  }

  function buildArcRequest() {
    var s;
    try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return null; }
    var turns = (s.turns || []).slice(-10);
    if (turns.length < 3) return null; // 分析する材料が少なすぎる

    var summary = turns.map(function (t, i) {
      return '[T' + i + '] ' + (t.narrative || '').slice(0, 200);
    }).join('\n\n');

    var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '主人公';

    var sys = '与えられた物語の直近 ' + turns.length + ' ターンを分析し、JSON 形式で以下を返してください。\n' +
              '推測でもよく、自由に発想してください。\n\n' +
              '{\n' +
              '  "arcPosition": "序" | "破" | "急" のいずれか,\n' +
              '  "mainConflict": 物語の主要な対立構造 (1文),\n' +
              '  "protagonistGoal": "' + heroName + '" の表面的な目標 (短く),\n' +
              '  "hiddenGoal": 隠れた / 無意識の目標 (短く),\n' +
              '  "expectedPivot": 次に起きるべき転換点の方向性 (短く),\n' +
              '  "audienceDesire": 観客が今最も見たい展開 (短く),\n' +
              '  "stuckPattern": 物語が膠着しているなら指摘 / なければ "なし",\n' +
              '  "nextTurnHint": 次ターンに推奨する具体的な方向性 (1-2文)\n' +
              '}\n\n' +
              '純粋な JSON のみを返してください。説明文・コードブロックマーカー不要。';

    return { sys: sys, user: '物語の直近:\n\n' + summary };
  }

  function callArcAnalysis() {
    if (!isEnabled()) return Promise.reject(new Error('disabled'));
    var key = getOrKey();
    if (!key) return Promise.reject(new Error('no orKey'));
    var req = buildArcRequest();
    if (!req) return Promise.reject(new Error('not enough turns'));

    console.log('[v275] firing arc analysis (extra OpenRouter call, ~' + META_MAX_TOKENS + ' tokens)');

    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, 30000);

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': 'https://sansan2103-a11y.github.io/chronicle/',
        'X-Title': 'Chronicle TRPG (v275 meta-plot)'
      },
      body: JSON.stringify({
        model: META_MODEL,
        max_tokens: META_MAX_TOKENS,
        temperature: 0.6,
        top_p: 0.9,
        messages: [
          { role: 'system', content: req.sys },
          { role: 'user', content: req.user }
        ]
      }),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(tid);
      if (!res.ok) throw new Error('arc HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      var text = ((json && json.choices && json.choices[0] && json.choices[0].message &&
                   json.choices[0].message.content) || '').trim();
      // extract JSON
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
      var first = text.indexOf('{'), last = text.lastIndexOf('}');
      if (first >= 0 && last > first) text = text.slice(first, last + 1);
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('[v275] arc parse fail:', e.message, '/ raw=', text.slice(0, 200));
        return null;
      }
    });
  }

  // === Build arc injection block ===
  function buildArcBlock() {
    var arc = window.__v275Arc;
    if (!arc) return '';
    var lines = [];
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('【物語アーク分析 (中期視点)】');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (arc.arcPosition) lines.push('現在地点: 【' + arc.arcPosition + '】');
    if (arc.mainConflict) lines.push('主要対立: ' + arc.mainConflict);
    if (arc.protagonistGoal) lines.push('表面的目標: ' + arc.protagonistGoal);
    if (arc.hiddenGoal) lines.push('隠れた目標: ' + arc.hiddenGoal);
    if (arc.expectedPivot) lines.push('予想される転換点: ' + arc.expectedPivot);
    if (arc.audienceDesire) lines.push('観客が見たい展開: ' + arc.audienceDesire);
    if (arc.stuckPattern && arc.stuckPattern !== 'なし') {
      lines.push('膠着パターン警告: ' + arc.stuckPattern);
    }
    if (arc.nextTurnHint) {
      lines.push('');
      lines.push('🎯 次ターン推奨方向:');
      lines.push('  ' + arc.nextTurnHint);
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }

  // === Trigger analysis every META_INTERVAL turns ===
  var lastAnalyzedTurnCount = 0;

  function maybeRunAnalysis() {
    if (!isEnabled()) return;
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var n = (s.turns || []).length;
      if (n < 3) return;
      if (n - lastAnalyzedTurnCount < META_INTERVAL) return;
      lastAnalyzedTurnCount = n;
      callArcAnalysis().then(function (arc) {
        if (arc) {
          window.__v275Arc = arc;
          console.log('[v275] arc analysis updated:', arc);
        }
      }).catch(function (e) {
        console.warn('[v275] arc fail:', e && e.message);
      });
    } catch (e) {}
  }

  // setItem hook で turn 追加検知
  try {
    var origSet = Storage.prototype.setItem;
    if (!origSet.__v275Hooked) {
      Storage.prototype.setItem = function (key, value) {
        var ret = origSet.call(this, key, value);
        if (key === 'chr6' && !window.__v259Writing) {
          setTimeout(maybeRunAnalysis, 1500);
        }
        return ret;
      };
      Storage.prototype.setItem.__v275Hooked = true;
    }
  } catch (e) {}

  // === Wrap Planner.build to inject arc block ===
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v275Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (isEnabled() && r && r.sys) {
          var block = buildArcBlock();
          if (block) r.sys += '\n' + block;
        }
      } catch (e) {}
      return r;
    };
    Planner.build.__v275Wrapped = true;
    console.log('[v275] Planner.build wrapped');
    return true;
  }
  wrapPlanner();
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // === Settings UI: 設定パネルにトグルを追加 ===
  function injectToggleUI() {
    if (document.getElementById('v275-toggle')) return true;
    // 設定パネルが存在するか
    var panelBody = document.querySelector('.mpanel-body');
    if (!panelBody) return false;
    // セクションを作成
    var section = document.createElement('div');
    section.id = 'v275-toggle';
    section.style.cssText = 'background:rgba(139,118,240,.05);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:10px';
    section.innerHTML =
      '<div style="font-size:12px;font-weight:600;color:var(--acc);margin-bottom:6px">v275 メタプロット分析</div>' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--tx)">' +
      '<input type="checkbox" id="v275-toggle-input" checked> ' +
      '<span>有効化 (5 ターン毎にストーリーアーク分析、別 LLM 呼出 ~500 tokens)</span>' +
      '</label>' +
      '<div style="font-size:11px;color:var(--dim);margin-top:6px">' +
      'OFF にすると追加 API call は発生しません。物語の中期視点ガイダンスは無くなります。' +
      '</div>';
    // 既存セクションの後に追加
    var aiSec = document.getElementById('aiInstructionsSection');
    if (aiSec && aiSec.parentNode) {
      aiSec.parentNode.insertBefore(section, aiSec.nextSibling);
    } else {
      panelBody.appendChild(section);
    }

    // 状態を反映
    var checkbox = document.getElementById('v275-toggle-input');
    checkbox.checked = isEnabled();
    checkbox.addEventListener('change', function () {
      setEnabled(this.checked);
    });
    console.log('[v275] settings toggle injected');
    return true;
  }

  // 設定パネル開閉時に injection 試行
  function tryInjectUI() {
    var ov = document.getElementById('settingsOv');
    if (ov && ov.classList.contains('open')) {
      injectToggleUI();
    }
  }
  setInterval(tryInjectUI, 1000);

  // === API ===
  window.__v275 = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    callArcAnalysis: callArcAnalysis,
    buildArcBlock: buildArcBlock,
    maybeRunAnalysis: maybeRunAnalysis,
    getArc: function () { return window.__v275Arc; }
  };

  console.log('[v275] init complete');
})();
