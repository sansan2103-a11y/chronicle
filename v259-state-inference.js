// v259-state-inference.js
// 目的: LLM ベースのキャラクター状態推論。死亡・瀕死・気絶などを GM ロールの
//        LLM に判定させ、次ターン以降のセリフ／プロンプト／UI 表現に反映する。
//
// 背景:
//   narrative にキャラの死亡・瀕死描写があっても、次ターンでそのキャラが
//   普通に喋ってしまう問題があった。v200/v220/v258 はあくまで台詞抽出系で
//   あって、「話せる／話せない」の意味解釈は行っていなかった。
//
// 実装内容（v259）:
//   A) State 推論: 各ターンの narrative 受信後、別 LLM 呼び出しで JSON 配列を取得
//   B) State 保存: cast.hero.state / cast.npcs[i].state に永続化
//   C) Dialogue ポスト処理: t.dialogues から死亡者の台詞除去 / 瀕死は断片化 /
//      話せない者は「……」へ置換
//   D) プロンプト注入: Planner.build を wrap して【現在のキャラクター状態】を追加
//   E) UI 演出: 死亡/瀕死/気絶を opacity と名前サフィックスで表示
//   Fallback: state 推論 API がエラーになっても keyword 検出にフォールバックして
//             メイン進行を止めない
//
// ガード: window.__v259Active
// 既存パッチ v200〜v258 と競合しないよう、wrap / hook 形式で導入する。

(function v259() {
  'use strict';
  if (window.__v259Active) {
    console.log('[v259] already active, skip');
    return;
  }
  window.__v259Active = true;
  console.log('[v259] state inference init');

  // ========================================================================
  // 設定
  // ========================================================================
  var INFERENCE_MAX_TOKENS = 800;
  var INFERENCE_TEMPERATURE = 0.2;
  var FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct';
  var DEFAULT_STATE = {
    condition: '健康',
    alive: true,
    conscious: true,
    canSpeak: true,
    canAct: true,
    hpEstimate: 100,
    lastReason: ''
  };

  // ========================================================================
  // ユーティリティ
  // ========================================================================
  function readState() {
    try {
      if (typeof S !== 'undefined' && S && S.cast) return S;
      return JSON.parse(localStorage.getItem('chr6') || '{}');
    } catch (e) {
      return JSON.parse(localStorage.getItem('chr6') || '{}');
    }
  }

  function writeState(s) {
    try {
      if (typeof S !== 'undefined' && S && typeof S.save === 'function') {
        if (s && s !== S) {
          window.__v259Writing = true;
          try { localStorage.setItem('chr6', JSON.stringify(s)); }
          finally { setTimeout(function () { window.__v259Writing = false; }, 80); }
        } else {
          window.__v259Writing = true;
          try { S.save(); }
          finally { setTimeout(function () { window.__v259Writing = false; }, 80); }
        }
        return;
      }
      window.__v259Writing = true;
      try { localStorage.setItem('chr6', JSON.stringify(s)); }
      finally { setTimeout(function () { window.__v259Writing = false; }, 80); }
    } catch (e) {
      console.warn('[v259] writeState fail:', e && e.message);
    }
  }

  function ensureStateObj(charObj) {
    if (!charObj) return null;
    if (!charObj.state) charObj.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    else {
      Object.keys(DEFAULT_STATE).forEach(function (k) {
        if (typeof charObj.state[k] === 'undefined') charObj.state[k] = DEFAULT_STATE[k];
      });
    }
    return charObj.state;
  }

  function listChars() {
    var s = readState();
    var cast = (s && s.cast) || {};
    var out = [];
    if (cast.hero && cast.hero.name) out.push(cast.hero);
    var npcs = cast.npcs || [];
    if (Array.isArray(npcs)) {
      npcs.forEach(function (n) { if (n && n.name) out.push(n); });
    }
    out.forEach(ensureStateObj);
    return out;
  }

  function findCharByName(name) {
    if (!name) return null;
    var s = readState();
    var cast = (s && s.cast) || {};
    if (cast.hero && cast.hero.name === name) return cast.hero;
    var npcs = cast.npcs || [];
    if (Array.isArray(npcs)) {
      for (var i = 0; i < npcs.length; i++) {
        if (npcs[i] && npcs[i].name === name) return npcs[i];
      }
      for (var j = 0; j < npcs.length; j++) {
        if (npcs[j] && npcs[j].name &&
            (name.indexOf(npcs[j].name) >= 0 || npcs[j].name.indexOf(name) >= 0)) {
          return npcs[j];
        }
      }
    }
    return null;
  }

  // ========================================================================
  // A) State 推論用 LLM 呼び出し
  // ========================================================================
  var sysMsg = 'あなたは TRPG の GM。直近の物語を読んで、登場キャラの状態を判定してください。\n' +
    '出力は JSON 配列のみ：\n' +
    '[\n' +
    '  {\n' +
    '    "name": "キャラ名",\n' +
    '    "alive": true,\n' +
    '    "conscious": true,\n' +
    '    "canSpeak": true,\n' +
    '    "canAct": true,\n' +
    '    "hpEstimate": 100,\n' +
    '    "condition": "健康|軽傷|重傷|瀕死|気絶|拘束|呪縛|死亡",\n' +
    '    "reason": "判定理由（一文）"\n' +
    '  }\n' +
    ']\n' +
    '比喩的な描写（"光が消えた"、"骨と皮だけ"、"魂を抜かれた"等）も適切に解釈してください。\n' +
    'JSON 配列のみ。前後のテキスト・コードフェンス禁止。';

  function buildUserMsg(narrativeText) {
    var heroLabel = '';
    var npcLabels = [];
    var s = readState();
    var cast = (s && s.cast) || {};
    if (cast.hero && cast.hero.name) heroLabel = cast.hero.name;
    var npcs = cast.npcs || [];
    if (Array.isArray(npcs)) npcs.forEach(function (n) { if (n && n.name) npcLabels.push(n.name); });

    var charsLine = (heroLabel ? heroLabel : '') +
      (npcLabels.length ? (heroLabel ? ', ' : '') + npcLabels.join(', ') : '');

    return '直近 narrative：\n' + (narrativeText || '') +
      '\n\n登場キャラ一覧：' + (charsLine || '(未登録)') +
      '\n\n判定をお願いします。各キャラについて1要素を返してください。';
  }

  function getInferenceModel() {
    try {
      var s = readState();
      var cfg = (s && s.cfg) || {};
      if (cfg.provider === 'openrouter') return cfg.orModel || FALLBACK_MODEL;
      return FALLBACK_MODEL;
    } catch (e) { return FALLBACK_MODEL; }
  }

  function getOrKey() {
    try {
      var s = readState();
      var cfg = (s && s.cfg) || {};
      return cfg.orKey || '';
    } catch (e) { return ''; }
  }

  function callInference(narrativeText) {
    var key = getOrKey();
    if (!key) return Promise.reject(new Error('no orKey'));
    if (!/^sk-or-/.test(key)) return Promise.reject(new Error('orKey format invalid'));
    var model = getInferenceModel();
    var userMsg = buildUserMsg(narrativeText);

    console.log('[v259] firing state-inference LLM call (additional API request)',
                '— model:', model, ', narr-len:', (narrativeText || '').length);

    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, 30000);

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': 'https://sansan2103-a11y.github.io/chronicle/',
        'X-Title': 'Chronicle TRPG (v259 state-inference)'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: INFERENCE_MAX_TOKENS,
        temperature: INFERENCE_TEMPERATURE,
        top_p: 0.9,
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: userMsg }
        ]
      }),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(tid);
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('inference HTTP ' + res.status + ': ' + (t || '').slice(0, 200));
        });
      }
      return res.json();
    }).then(function (json) {
      var text = ((json && json.choices && json.choices[0] && json.choices[0].message &&
                  json.choices[0].message.content) || '').trim();
      return parseInferenceJSON(text);
    });
  }

  function parseInferenceJSON(rawText) {
    if (!rawText) return [];
    var t = String(rawText).trim();
    t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    var first = t.indexOf('[');
    var last = t.lastIndexOf(']');
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
    try {
      var arr = JSON.parse(t);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) {
        return x && typeof x === 'object' && typeof x.name === 'string';
      });
    } catch (e) {
      console.warn('[v259] inference JSON parse fail:', e && e.message, '/ raw=',
                   rawText.slice(0, 200));
      return [];
    }
  }

  // ========================================================================
  // Fallback: keyword 検出
  // ========================================================================
  var DEATH_RX = /(死んだ|死亡|息絶え|絶命|事切れ|骨と皮|皮と骨|食われた|食い尽くされ|魂を抜かれ|首が落ち|首を落とさ|頭部を失|心臓を貫|血だまりに沈|もう動かな|動かなくなった|永遠に眠|二度と目を開け)/;
  var DYING_RX = /(瀕死|虫の息|血の海|血まみれで倒れ|致命傷|意識が薄れ|意識が遠の|消えそうな|今にも死)/;
  var KO_RX    = /(気絶|失神|意識を失|昏倒|崩れ落ち|目を回し|意識が落ち)/;
  var SILENT_RX = /(口を縫われ|声が出せ|声を奪わ|口を塞|猿轡|声にならな|呪縛|喉を潰さ|喉が裂け)/;

  function fallbackInfer(narrativeText, chars) {
    var out = [];
    var nt = String(narrativeText || '');
    chars.forEach(function (c) {
      var name = c.name;
      if (!name) return;
      var sentences = nt.split(/[\n。]/).filter(function (s) { return s.indexOf(name) >= 0; });
      var joined = sentences.join('。');
      var item = {
        name: name,
        alive: true, conscious: true, canSpeak: true, canAct: true,
        hpEstimate: 100, condition: '健康', reason: '(fallback) keyword 不検出'
      };
      if (DEATH_RX.test(joined)) {
        item.alive = false; item.conscious = false; item.canSpeak = false; item.canAct = false;
        item.hpEstimate = 0; item.condition = '死亡';
        item.reason = '(fallback) 死亡描写検出';
      } else if (DYING_RX.test(joined)) {
        item.conscious = true; item.canSpeak = true; item.canAct = false;
        item.hpEstimate = 5; item.condition = '瀕死';
        item.reason = '(fallback) 瀕死描写検出';
      } else if (KO_RX.test(joined)) {
        item.conscious = false; item.canSpeak = false; item.canAct = false;
        item.hpEstimate = 20; item.condition = '気絶';
        item.reason = '(fallback) 気絶描写検出';
      } else if (SILENT_RX.test(joined)) {
        item.canSpeak = false; item.condition = '拘束';
        item.reason = '(fallback) 発話不能描写検出';
      }
      out.push(item);
    });
    return out;
  }

  // ========================================================================
  // B) State 適用
  // ========================================================================
  function applyInferredStates(items) {
    if (!items || !items.length) return false;
    var s = readState();
    if (!s.cast) return false;
    var changed = false;
    items.forEach(function (it) {
      var c = findCharByName(it.name);
      if (!c) return;
      ensureStateObj(c);
      ['alive', 'conscious', 'canSpeak', 'canAct'].forEach(function (k) {
        if (typeof it[k] === 'boolean' && c.state[k] !== it[k]) {
          c.state[k] = it[k]; changed = true;
        }
      });
      if (typeof it.hpEstimate === 'number' && it.hpEstimate >= 0 && it.hpEstimate <= 100) {
        if (c.state.hpEstimate !== it.hpEstimate) { c.state.hpEstimate = it.hpEstimate; changed = true; }
      }
      if (typeof it.condition === 'string' && it.condition.length <= 8) {
        if (c.state.condition !== it.condition) { c.state.condition = it.condition; changed = true; }
      }
      if (typeof it.reason === 'string') {
        c.state.lastReason = String(it.reason).slice(0, 120);
      }
    });
    if (changed) writeState(s);
    return changed;
  }

  // ========================================================================
  // C) Dialogue ポスト処理
  // ========================================================================
  function fragmentText(text) {
    var t = String(text || '').trim();
    if (t.length <= 10) return t;
    return t.slice(0, 5) + '……';
  }

  function postProcessDialogues(turn) {
    if (!turn || !Array.isArray(turn.dialogues) || turn.dialogues.length === 0) return false;
    var changed = false;
    var kept = [];
    turn.dialogues.forEach(function (d) {
      if (!d || !d.speaker || !d.text) { kept.push(d); return; }
      var c = findCharByName(d.speaker);
      var st = c && c.state;
      if (!st) { kept.push(d); return; }
      if (st.alive === false || st.condition === '死亡') {
        changed = true;
        return;
      }
      if (st.canSpeak === false || st.condition === '気絶') {
        if (d.text !== '……' && d.text !== '（声にならない）') {
          d.text = (st.condition === '気絶') ? '（声にならない）' : '……';
          changed = true;
        }
        kept.push(d);
        return;
      }
      if (st.condition === '瀕死') {
        var frag = fragmentText(d.text);
        if (frag !== d.text) { d.text = frag; changed = true; }
        kept.push(d);
        return;
      }
      kept.push(d);
    });
    if (changed) turn.dialogues = kept;
    return changed;
  }

  function postProcessAllTurns() {
    var s = readState();
    if (!s || !s.turns) return false;
    var changed = false;
    s.turns.forEach(function (t) {
      if (postProcessDialogues(t)) changed = true;
    });
    if (changed) {
      writeState(s);
      try { if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') UI.renderAll(); } catch (e) {}
      try { if (typeof window.__v257ForceRender === 'function') window.__v257ForceRender(); } catch (e) {}
      try { if (typeof window.__v256ForceRender === 'function') window.__v256ForceRender(); } catch (e) {}
    }
    return changed;
  }

  // ========================================================================
  // D) プロンプト注入: Planner.build wrap
  // ========================================================================
  function buildStateBlock() {
    var chars = listChars();
    if (!chars.length) return '';
    var lines = chars.map(function (c) {
      var st = c.state || {};
      var role = '';
      var s = readState();
      if (s && s.cast && s.cast.hero === c) role = '（主人公）';
      var cond = st.condition || '健康';
      var hp = (typeof st.hpEstimate === 'number') ? ('HP ' + st.hpEstimate) : '';
      var hint = '';
      if (st.alive === false || cond === '死亡') {
        hint = '（セリフ・行動絶対禁止、登場させない）';
      } else if (st.canSpeak === false && st.canAct === false) {
        hint = '（セリフ・行動不可）';
      } else if (st.canSpeak === false) {
        hint = '（セリフ不可）';
      } else if (st.canAct === false) {
        hint = '（行動不可）';
      } else if (cond === '瀕死') {
        hint = '（断片的な発話のみ可。長文セリフ禁止）';
      }
      var seg = '- ' + c.name + role + '：' + cond;
      if (hp) seg += '、' + hp;
      if (hint) seg += hint;
      return seg;
    });
    return '\n\n【現在のキャラクター状態（v259 GM 推論）】\n' + lines.join('\n') +
           '\n上記状態に絶対に従うこと。死亡キャラは登場させない。発話不能キャラに台詞を持たせない。';
  }

  function hookPlannerBuild() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.__v259Hooked) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && typeof r.sys === 'string') {
          r.sys += buildStateBlock();
        }
      } catch (e) {
        console.warn('[v259] state block inject fail:', e && e.message);
      }
      return r;
    };
    Planner.__v259Hooked = true;
    console.log('[v259] Planner.build hooked');
    return true;
  }

  // ========================================================================
  // E) UI: opacity と名前サフィックス
  // ========================================================================
  function injectCSS() {
    if (document.getElementById('v259-css')) return;
    var st = document.createElement('style');
    st.id = 'v259-css';
    st.textContent =
      '.v259-dead{opacity:0.4 !important;filter:grayscale(0.7);}' +
      '.v259-dying{opacity:0.7 !important;}' +
      '.v259-ko{opacity:0.6 !important;}' +
      '.v259-state-tag{font-size:10px;color:#ff6b6b;margin-left:6px;font-weight:bold;}' +
      '.v259-state-tag.v259-tag-ko{color:#7da7c7;}' +
      '.v259-state-tag.v259-tag-dying{color:#d49b69;}';
    document.head.appendChild(st);
  }

  function decorateCards() {
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var cards = stream.querySelectorAll('.v101-dlg-card');
      if (!cards || !cards.length) return;
      cards.forEach(function (card) {
        var nm = card.querySelector('.v101-dlg-name');
        if (!nm) return;
        var raw = (nm.getAttribute('data-v259-name') || nm.textContent || '').trim();
        var base = raw.replace(/\s*\((死亡|瀕死|気絶)\)\s*$/, '').trim();
        nm.setAttribute('data-v259-name', base);
        var c = findCharByName(base);
        var st = c && c.state;
        card.classList.remove('v259-dead', 'v259-dying', 'v259-ko');
        var oldTag = nm.querySelector('.v259-state-tag');
        if (oldTag) oldTag.remove();
        if (nm.textContent !== base) nm.textContent = base;
        if (!st) return;
        if (st.alive === false || st.condition === '死亡') {
          card.classList.add('v259-dead');
          var t1 = document.createElement('span');
          t1.className = 'v259-state-tag';
          t1.textContent = '(死亡)';
          nm.appendChild(t1);
        } else if (st.condition === '瀕死') {
          card.classList.add('v259-dying');
          var t2 = document.createElement('span');
          t2.className = 'v259-state-tag v259-tag-dying';
          t2.textContent = '(瀕死)';
          nm.appendChild(t2);
        } else if (st.condition === '気絶' || st.conscious === false) {
          card.classList.add('v259-ko');
          var t3 = document.createElement('span');
          t3.className = 'v259-state-tag v259-tag-ko';
          t3.textContent = '(気絶)';
          nm.appendChild(t3);
        }
      });
    } catch (e) {
      console.warn('[v259] decorate fail:', e && e.message);
    }
  }

  // ========================================================================
  // ターン検知 → 推論パイプライン
  // ========================================================================
  var lastInferredTurnCount = -1;
  var inferenceInFlight = false;

  function lastTurnNarrative() {
    var s = readState();
    var turns = (s && s.turns) || [];
    if (!turns.length) return null;
    var t = turns[turns.length - 1];
    if (!t) return null;
    var n = t.narrative;
    if (Array.isArray(n)) n = n.join('\n');
    return String(n || '');
  }

  function runInferenceForLatestTurn() {
    if (inferenceInFlight) return;
    var s = readState();
    var turns = (s && s.turns) || [];
    if (!turns.length) return;
    if (turns.length === lastInferredTurnCount) return;

    var narr = lastTurnNarrative();
    if (!narr || narr.length < 4) {
      lastInferredTurnCount = turns.length;
      return;
    }
    var chars = listChars();
    if (!chars.length) {
      lastInferredTurnCount = turns.length;
      return;
    }

    inferenceInFlight = true;
    var idxAtLaunch = turns.length;
    callInference(narr).then(function (items) {
      console.log('[v259] state inference parsed items:', items && items.length);
      if (!items || !items.length) {
        items = fallbackInfer(narr, chars);
      }
      try { applyInferredStates(items); } catch (e) {}
      try { postProcessAllTurns(); } catch (e) {}
      try { decorateCards(); } catch (e) {}
      lastInferredTurnCount = idxAtLaunch;
    }).catch(function (err) {
      console.warn('[v259] inference fail, using fallback:', err && err.message);
      if (err && /usage|policy|forbidden|404|disabled/i.test(err.message || '')) {
        console.warn('[v259] policy/route block detected; skipping inference.');
      }
      try {
        var items = fallbackInfer(narr, chars);
        applyInferredStates(items);
        postProcessAllTurns();
        decorateCards();
      } catch (e) {}
      lastInferredTurnCount = idxAtLaunch;
    }).then(function () {
      inferenceInFlight = false;
    });
  }

  // ========================================================================
  // localStorage hook
  // ========================================================================
  function installStorageHook() {
    try {
      var proto = Storage.prototype;
      if (proto.setItem.__v259Hooked) return;
      var origSet = proto.setItem;
      proto.setItem = function (key, value) {
        var ret = origSet.call(this, key, value);
        if (key === 'chr6' && !window.__v259Writing) {
          setTimeout(function () {
            try { runInferenceForLatestTurn(); } catch (e) {}
          }, 80);
        }
        return ret;
      };
      proto.setItem.__v259Hooked = true;
    } catch (e) {}
  }

  // ========================================================================
  // 起動
  // ========================================================================
  function start() {
    injectCSS();
    hookPlannerBuild();
    installStorageHook();

    setTimeout(function () {
      try { postProcessAllTurns(); decorateCards(); } catch (e) {}
    }, 1500);

    setInterval(function () {
      try { decorateCards(); } catch (e) {}
    }, 2500);

    var hookTries = 0;
    var hookTimer = setInterval(function () {
      if (hookPlannerBuild() || ++hookTries > 30) clearInterval(hookTimer);
    }, 500);

    setTimeout(function () { try { runInferenceForLatestTurn(); } catch (e) {} }, 3000);
  }

  if (document.readyState === 'complete') {
    setTimeout(start, 800);
  } else {
    window.addEventListener('load', function () { setTimeout(start, 800); });
    setTimeout(start, 4000);
  }

  window.__v259 = {
    listChars: listChars,
    runInference: runInferenceForLatestTurn,
    fallbackInfer: fallbackInfer,
    postProcessAllTurns: postProcessAllTurns,
    decorateCards: decorateCards,
    buildStateBlock: buildStateBlock,
    callInference: callInference,
    findCharByName: findCharByName
  };

  console.log('[v259] init complete');
})();
