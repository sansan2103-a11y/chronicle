// v264-body-damage-and-posthumous.js
// 目的:
//   1. キャラクターの体損壊・拘束情報を LLM 推論ベースで蓄積記憶
//   2. 死者のセリフを「削除」ではなく「posthumous フラグ + 半透明スタイル」で保持
//   3. 表現の自由 (回想・幽覚・幽霊・最後の言葉) を最大限残す
//
// 設計方針: 「情報を提供、創作は縛らない」
//   - LLM プロンプトには「事実」+「柔軟ガイダンス」を注入 (絶対禁止ではない)
//   - dialogue 削除はしない、posthumous フラグでマーク → UI で半透明表示
//   - 損傷検出は LLM 任せ (誤検出ゼロ、文脈理解可能)
//
// 実装:
//   A. v259 callInference の system prompt を拡張: bodyParts/restraints/diedAtTurn を要求
//   B. applyInferredStates を wrap: 新フィールドも保存
//   C. buildStateBlock を置換: 柔軟ガイダンス形式
//   D. postProcessDialogues を置換: 削除ではなく posthumous=true マーク
//   E. CSS + 会話カードレンダラに posthumous スタイル適用
//
// ガード: window.__v264Active

(function v264() {
  'use strict';
  if (window.__v264Active) {
    console.log('[v264] already active, skip');
    return;
  }
  window.__v264Active = true;
  console.log('[v264] body-damage-and-posthumous init');

  // ========================================================================
  // A. fetch hook: v259 inference 呼び出しの system prompt を拡張
  // ========================================================================
  (function hookInferenceFetch() {
    if (window.fetch.__v264InferHooked) return;
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      try {
        var u = String(url || '');
        var isInfer = u.indexOf('openrouter.ai') !== -1 &&
          opts && opts.headers &&
          (opts.headers['X-Title'] === 'Chronicle TRPG (v259 state-inference)');
        if (isInfer && opts.body) {
          try {
            var body = JSON.parse(opts.body);
            if (body.messages && body.messages[0] && body.messages[0].role === 'system') {
              var ext = '\n\n# 追加要求 (v264):\n' +
                '上記の必須フィールドに加え、以下も含めてください (検出できた場合):\n' +
                '- bodyParts: { 部位名: 状態 } 例 {"leftEye":"lost","leftArm":"severed","abdomen":"pierced"}\n' +
                '  (lost=喪失, severed=切断, broken=骨折, pierced=刺傷, burned=熱傷, intact=無傷)\n' +
                '- restraints: ["拘束状況の説明", ...] 例 ["椅子に括り付け","口に布"]\n' +
                '- diedAtTurn: 死亡したターン番号 (alive=false の場合)\n' +
                '- newInjury: 直近で受けた損傷の説明 (短文)\n' +
                '\n部位名は英語キー(leftEye/rightEye/leftArm/rightArm/leftLeg/rightLeg/abdomen/chest/head/tongue/heart 等)を使用。\n' +
                '部位の状態は永続的事実として記録されます。回復には明示的な治療描写が必要。';
              body.messages[0].content = (body.messages[0].content || '') + ext;
              opts = Object.assign({}, opts, { body: JSON.stringify(body) });
            }
          } catch (e) {}
        }
      } catch (e) {}
      return origFetch.call(this, url, opts);
    };
    window.fetch.__v264InferHooked = true;
    console.log('[v264] inference fetch hook installed');
  })();

  // ========================================================================
  // B. applyInferredStates wrap: bodyParts/restraints/diedAtTurn を保存
  // ========================================================================
  function patchApplyInferred() {
    if (!window.__v259) return false;
    if (window.__v264AppliedPatched) return true;
    // 直接 fetch 応答を見て items を補完する仕組み (v260 と類似)
    if (window.fetch.__v264AugHooked) { window.__v264AppliedPatched = true; return true; }
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      var p = origFetch.apply(this, arguments);
      try {
        var u = String(url || '');
        var isInfer = u.indexOf('openrouter.ai') !== -1 &&
          opts && opts.headers &&
          (opts.headers['X-Title'] === 'Chronicle TRPG (v259 state-inference)');
        if (!isInfer) return p;
        return p.then(function (res) {
          var clone = res.clone();
          clone.json().then(function (json) {
            try {
              var text = ((json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '').trim();
              text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
              var first = text.indexOf('['); var last = text.lastIndexOf(']');
              if (first >= 0 && last > first) text = text.slice(first, last + 1);
              text = text.replace(/,\s*([\]\}])/g, '$1');
              var arr = JSON.parse(text);
              if (!Array.isArray(arr)) return;
              applyExtendedFields(arr);
            } catch (e) {}
          }).catch(function () {});
          return res;
        });
      } catch (e) {}
      return p;
    };
    window.fetch.__v264AugHooked = true;
    window.__v264AppliedPatched = true;
    console.log('[v264] inference response augment hook installed');
    return true;
  }

  function applyExtendedFields(items) {
    if (!items || !items.length || !window.__v259) return;
    var s;
    try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return; }
    if (!s.cast) return;
    var changed = false;
    items.forEach(function (it) {
      if (!it || !it.name) return;
      var c = window.__v259.findCharByName ? window.__v259.findCharByName(it.name) : null;
      if (!c) return;
      c.state = c.state || {};
      // bodyParts merge (永続: 上書きはするが、部位の "intact" 化は明示治療のみ)
      if (it.bodyParts && typeof it.bodyParts === 'object') {
        c.state.bodyParts = c.state.bodyParts || {};
        Object.keys(it.bodyParts).forEach(function (k) {
          var newV = it.bodyParts[k];
          var oldV = c.state.bodyParts[k];
          // 損傷状態 → intact 化は許可しない (治療描写検出は別途必要)
          if (oldV && oldV !== 'intact' && newV === 'intact') return;
          if (oldV !== newV) {
            c.state.bodyParts[k] = newV;
            changed = true;
          }
        });
      }
      // restraints (現在のスナップショットで上書き)
      if (Array.isArray(it.restraints)) {
        var newR = it.restraints.filter(function (r) { return typeof r === 'string' && r.length > 0; }).slice(0, 6);
        if (JSON.stringify(c.state.restraints || []) !== JSON.stringify(newR)) {
          c.state.restraints = newR;
          changed = true;
        }
      }
      // diedAtTurn
      if (typeof it.diedAtTurn === 'number' && c.state.diedAtTurn !== it.diedAtTurn) {
        c.state.diedAtTurn = it.diedAtTurn;
        changed = true;
      }
      // newInjury → injuryLog に追加
      if (typeof it.newInjury === 'string' && it.newInjury.length > 0) {
        c.state.injuryLog = c.state.injuryLog || [];
        var turnIdx = (s.turns || []).length - 1;
        var sig = turnIdx + '|' + it.newInjury.slice(0, 60);
        var dup = c.state.injuryLog.some(function (e) {
          return (e.turn === turnIdx) && (e.cause === it.newInjury.slice(0, 60));
        });
        if (!dup) {
          c.state.injuryLog.push({
            turn: turnIdx,
            cause: it.newInjury.slice(0, 60)
          });
          if (c.state.injuryLog.length > 10) {
            c.state.injuryLog.splice(0, c.state.injuryLog.length - 10);
          }
          changed = true;
        }
      }
    });
    if (changed) {
      window.__v259Writing = true;
      try {
        localStorage.setItem('chr6', JSON.stringify(s));
        // S.cast も同期
        if (typeof S !== 'undefined' && S.cast) {
          if (s.cast.hero) S.cast.hero = s.cast.hero;
          if (s.cast.npcs) S.cast.npcs = s.cast.npcs;
        }
      } finally {
        setTimeout(function () { window.__v259Writing = false; }, 250);
      }
      console.log('[v264] extended state fields applied');
    }
  }

  // ========================================================================
  // C. buildStateBlock を置換: 柔軟ガイダンス形式
  // ========================================================================
  function patchBuildStateBlock() {
    if (!window.__v259 || typeof window.__v259.buildStateBlock !== 'function') return false;
    if (window.__v259.buildStateBlock.__v264Patched) return true;

    var BODY_PART_LABELS = {
      leftEye: '左眼', rightEye: '右眼', eye: '眼', eyes: '両眼',
      leftArm: '左腕', rightArm: '右腕', arm: '腕', arms: '両腕',
      leftLeg: '左脚', rightLeg: '右脚', leg: '脚', legs: '両脚',
      leftHand: '左手', rightHand: '右手', hand: '手', hands: '両手',
      leftFoot: '左足', rightFoot: '右足',
      abdomen: '腹部', chest: '胸部', back: '背中', head: '頭部',
      tongue: '舌', heart: '心臓', neck: '首', face: '顔',
      fingers: '指', leftFingers: '左指', rightFingers: '右指',
      hair: '髪', skin: '皮膚'
    };
    var STATUS_LABELS = {
      lost: '喪失', severed: '切断', broken: '骨折',
      pierced: '刺傷', burned: '熱傷', cut: '裂傷',
      bruised: '打撲', bleeding: '出血', missing: '欠損',
      damaged: '損傷', crushed: '挫傷', torn: '断裂',
      intact: '無傷'
    };

    function describeBodyParts(bp) {
      if (!bp) return [];
      return Object.keys(bp).map(function (k) {
        var status = bp[k];
        if (!status || status === 'intact' || status === 'normal') return null;
        var label = BODY_PART_LABELS[k] || k;
        var statusLbl = STATUS_LABELS[status] || status;
        return label + ': ' + statusLbl;
      }).filter(Boolean);
    }

    window.__v259.buildStateBlock = function () {
      var chars = window.__v259.listChars ? window.__v259.listChars() : [];
      if (!chars.length) return '';
      var s;
      try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { s = {}; }
      var heroName = (s.cast && s.cast.hero && s.cast.hero.name) || '';
      var currentTurnIdx = (s.turns || []).length;

      var lines = [];
      chars.forEach(function (c) {
        var st = c.state || {};
        var roleTag = (heroName && c.name === heroName) ? '（主人公）' : '';
        var cond = st.condition || '健康';
        var hp = (typeof st.hpEstimate === 'number') ? ('HP ' + st.hpEstimate) : '';
        var line = c.name + roleTag + ': ' + cond;
        if (hp) line += '、' + hp;
        if (st.alive === false || cond === '死亡') {
          var diedAt = (typeof st.diedAtTurn === 'number') ? ('T' + st.diedAtTurn) : '';
          line += '、死亡' + (diedAt ? '(' + diedAt + ')' : '');
        }
        // 部位損傷
        var bp = describeBodyParts(st.bodyParts);
        if (bp.length) line += '\n  損傷: ' + bp.join('、');
        // 拘束
        if (Array.isArray(st.restraints) && st.restraints.length) {
          line += '\n  拘束: ' + st.restraints.slice(0, 3).join('、');
        }
        // 直近の loss/event
        if (st.injuryLog && st.injuryLog.length) {
          var recent = st.injuryLog.slice(-2);
          recent.forEach(function (inj) {
            line += '\n  - T' + (inj.turn != null ? inj.turn : '?') + ': ' + (inj.cause || '');
          });
        }
        if (st.lastReason) {
          line += '\n  ※ ' + st.lastReason;
        }
        lines.push(line);
      });

      var block =
        '【継承事実 — 永続的状態】\n' +
        lines.join('\n\n') +
        '\n\n【ガイダンス】\n' +
        '- 上記の損傷・拘束・死亡状態は永続的な事実として継承してください\n' +
        '- 物理的に不可能な行動は避けてください (例: 切断された腕で物を持つ、喪失した眼で見る、拘束されたまま自由に走る)\n' +
        '- 治療描写なしに損傷状態が回復することはありません\n' +
        '\n【表現の自由として許可される事項】\n' +
        '- 死亡キャラの最後の言葉、断末魔、うめき声 (死亡直前/直後)\n' +
        '- 回想シーン・夢・幻覚・走馬灯\n' +
        '- 幽霊・霊体・超自然的描写\n' +
        '- 主人公の幻聴/死者の声を聞く描写 (明示的に「幻聴」「幻」と分かる文脈で)\n' +
        '- 死亡から数ターン後でも、上記文脈なら登場可能\n' +
        '\n避けてほしい: 死亡キャラが何の文脈もなく普通の会話に混ざる状況。';
      return block;
    };
    window.__v259.buildStateBlock.__v264Patched = true;
    console.log('[v264] buildStateBlock replaced with flexible-guidance format');
    return true;
  }

  // ========================================================================
  // D. postProcessDialogues を置換: 削除→posthumous フラグ付与
  // ========================================================================
  function patchPostProcessDialogues() {
    if (!window.__v259) return false;
    if (window.__v264PostProcPatched) return true;

    function fragmentText(text) {
      var t = String(text || '').trim();
      if (t.length <= 10) return t;
      return t.slice(0, 5) + '……';
    }

    function newPostProcessDialogues(turn) {
      if (!turn || !Array.isArray(turn.dialogues) || turn.dialogues.length === 0) return false;
      var changed = false;
      var s;
      try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return false; }

      function findChar(name) {
        if (!name || !s.cast) return null;
        if (s.cast.hero && s.cast.hero.name === name) return s.cast.hero;
        var npcs = s.cast.npcs || [];
        for (var i = 0; i < npcs.length; i++) {
          if (npcs[i] && npcs[i].name === name) return npcs[i];
        }
        return null;
      }

      turn.dialogues.forEach(function (d) {
        if (!d || !d.speaker || !d.text) return;
        var c = findChar(d.speaker);
        var st = c && c.state;
        if (!st) return;
        // 死亡キャラ: posthumous フラグ付与 (削除しない)
        if (st.alive === false || st.condition === '死亡') {
          if (!d.posthumous) {
            d.posthumous = true;
            changed = true;
          }
          return; // text はいじらない (回想/幻覚/最後の言葉として保持)
        } else {
          // 生きている場合は posthumous を外す (蘇生等のレアケース)
          if (d.posthumous) {
            delete d.posthumous;
            changed = true;
          }
        }
        // 気絶キャラ: 「（声にならない）」に置換
        if (st.canSpeak === false || st.condition === '気絶') {
          if (d.text !== '……' && d.text !== '（声にならない）') {
            d.text = (st.condition === '気絶') ? '（声にならない）' : '……';
            changed = true;
          }
          return;
        }
        // 瀕死: 文を断片化
        if (st.condition === '瀕死') {
          var frag = fragmentText(d.text);
          if (frag !== d.text) {
            d.text = frag;
            changed = true;
          }
          return;
        }
      });
      return changed;
    }

    window.__v259.postProcessAllTurns = function () {
      var s;
      try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return false; }
      if (!s.turns) return false;
      var changed = false;
      s.turns.forEach(function (t) {
        if (newPostProcessDialogues(t)) changed = true;
      });
      if (changed) {
        window.__v259Writing = true;
        try {
          localStorage.setItem('chr6', JSON.stringify(s));
        } finally {
          setTimeout(function () { window.__v259Writing = false; }, 250);
        }
        try { if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') UI.renderAll(); } catch (e) {}
      }
      return changed;
    };
    window.__v264PostProcPatched = true;
    console.log('[v264] postProcessAllTurns replaced (posthumous-tag mode)');
    return true;
  }

  // ========================================================================
  // E. CSS: posthumous スタイル + 会話カードレンダラ拡張
  // ========================================================================
  (function injectCSS() {
    var id = '__v264-style';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      // 死亡キャラの会話カード: 半透明 + イタリック + 「霊」マーク
      '.v101-dlg-card.v264-posthumous {',
      '  opacity: 0.55 !important;',
      '  font-style: italic !important;',
      '  background: linear-gradient(180deg, rgba(160,138,240,.06), rgba(50,50,80,.04)) !important;',
      '  border-left: 3px dashed rgba(160,138,240,.45) !important;',
      '  position: relative;',
      '}',
      '.v101-dlg-card.v264-posthumous::before {',
      '  content: "霊";',
      '  position: absolute;',
      '  top: 4px; right: 6px;',
      '  font-size: 10px;',
      '  color: rgba(200,180,255,.55);',
      '  background: rgba(40,30,70,.4);',
      '  padding: 1px 5px;',
      '  border-radius: 6px;',
      '  border: 1px solid rgba(160,138,240,.35);',
      '  font-style: normal;',
      '}',
      '.v101-dlg-card.v264-posthumous .v101-dlg-text,',
      '.v101-dlg-card.v264-posthumous div:last-child {',
      '  color: rgba(220,210,250,.7) !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  })();

  // 会話カードレンダラ完了後に posthumous フラグに基づいてクラスを付ける
  function decoratePosthumous() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      // posthumous な dialogue の (speaker, text) ペアを収集
      var posthumousSet = {};
      turns.forEach(function (t) {
        (t.dialogues || []).forEach(function (d) {
          if (d && d.posthumous && d.speaker && d.text) {
            posthumousSet[d.speaker + '||' + d.text.trim()] = true;
          }
        });
      });
      // 既存の会話カードを走査し、posthumous なら class を付ける
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var cards = stream.querySelectorAll('.v101-dlg-card');
      cards.forEach(function (card) {
        // カード内の名前と本文を抽出
        var nameEl = card.querySelector('.v101-dlg-name, [style*="color:var(--acc)"]');
        var textEl = card.querySelector('.v101-dlg-text, div:last-child');
        if (!nameEl || !textEl) return;
        var sp = (nameEl.textContent || '').trim();
        var tx = (textEl.textContent || '').trim().replace(/^「|」$/g, '');
        var key = sp + '||' + tx;
        if (posthumousSet[key]) {
          card.classList.add('v264-posthumous');
        } else {
          card.classList.remove('v264-posthumous');
        }
      });
    } catch (e) {}
  }

  // MutationObserver で会話カード追加時に decorate
  function installDecorator() {
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return false;
    if (stream.__v264Decorated) return true;
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        decoratePosthumous();
      });
    });
    mo.observe(stream, { childList: true, subtree: false });
    stream.__v264Decorated = true;
    decoratePosthumous();
    return true;
  }

  // ========================================================================
  // 初期化
  // ========================================================================
  function tryAll() {
    patchApplyInferred();
    patchBuildStateBlock();
    patchPostProcessDialogues();
    installDecorator();
  }
  tryAll();
  var tries = 0;
  var iv = setInterval(function () {
    tryAll();
    if (++tries > 40) clearInterval(iv);
  }, 500);

  // 起動直後に一度 posthumous フラグを反映するため postProcessAllTurns を呼ぶ
  setTimeout(function () {
    if (window.__v259 && typeof window.__v259.postProcessAllTurns === 'function') {
      try { window.__v259.postProcessAllTurns(); } catch (e) {}
    }
    decoratePosthumous();
  }, 2000);

  window.__v264 = {
    decoratePosthumous: decoratePosthumous,
    applyExtendedFields: applyExtendedFields
  };

  console.log('[v264] init complete');
})();
