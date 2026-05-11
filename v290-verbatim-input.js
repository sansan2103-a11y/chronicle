// v290-verbatim-input.js
//
// 目的: SAY / DO / STORY 全モードのユーザー入力を「逐語反映」させる。
//
// 背景 (おしんさん 2026-05-11 報告):
//   SAY「フィオナは大丈夫よ」と入力しても hero のセリフが「だ、大丈夫…」に
//   言い換えられる。DO「剣を抜く」と入力しても hero が躊躇する。
//   STORY「親玉がリナに巻き付いた」と入れても無視されて前ターン延長になる。
//   3 モードとも「プレイヤーが書いた内容を AI が勝手にパラフレーズして
//   別物に置き換える」問題がある。
//
// 哲学:
//   - 3モードとも逐語ベース: プレイヤー入力は「世界の確定した事実」
//   - SAY:   hero のセリフが入力そのもの
//   - DO:    hero が入力アクションを完了形で実行
//   - STORY: 入力内容をシーンの地の文として確実に取り込み、そこから AI が広げる
//   - LLM 側に強い指示を与えつつ、後処理でも強制挿入して二重に保証
//
// 実装 (Spec v290):
//   A. プロンプト指示の強化 (最先頭・最末尾の両方に注入)
//   B. user payload (context) への事前固定
//   C. ポスト処理の強制挿入 (parsePlan を wrap)
//
// 注意:
//   - v288 (fetch wrap) と独立: prompt 層で動作するので衝突なし
//   - v289 (cast bootstrap) より後に wrap: hero 名が埋まってから読む
//   - simpleMode 切替に対応 (v103 patch が Hermes/Llama 系で自動 ON)
//
// ガード: window.__v290Active

(function v290() {
  'use strict';
  if (window.__v290Active) return;
  window.__v290Active = true;
  var TAG = '[v290]';
  console.log(TAG, 'verbatim-input init (SAY/DO/STORY)');

  // ============================================================
  // ユーティリティ
  // ============================================================

  function heroName() {
    try {
      var h = (window.S && S.cast && S.cast.hero) || {};
      return (h.name && String(h.name).trim()) || '';
    } catch (e) { return ''; }
  }

  function escForRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeSayInput(s) {
    if (!s) return '';
    return String(s).trim();
  }

  function normalizeDoInput(s) {
    if (!s) return '';
    var t = String(s).trim();
    if (!t) return '';
    if (!/[。！？!?…]$/.test(t)) t = t + '。';
    return t;
  }

  function normalizeStoryInput(s) {
    if (!s) return '';
    var t = String(s).trim();
    if (!t) return '';
    if (!/[。！？!?…」]$/.test(t)) t = t + '。';
    return t;
  }

  // ============================================================
  // A. プロンプト指示生成
  // ============================================================

  function sayDirective(inputText) {
    var h = heroName() || '主人公';
    return [
      '',
      '【★v290: SAY モード 逐語指示 ★絶対厳守】',
      'このターン、プレイヤーは ' + h + ' に「' + inputText + '」というセリフを言わせます。',
      'これは逐語指示です。' + h + ' の最初のセリフは一字一句変えず、プレイヤー入力そのものを出力してください。',
      '要約・言い換え・装飾追加・敬語化・くだけた化は禁止。文字通りそのまま出力。',
      '',
      'このセリフを起点に、シーンにいる他のNPC全員が**その正確な言葉に**反応してください：',
      '- 言葉の選び方 (丁寧/乱暴/冷たい/温かい/命令形/疑問形) のニュアンスを汲み取る',
      '- 呼び方 (呼び捨て/敬称/お前/あなた/君) に敏感に反応',
      '- 質問なら答える、命令なら従う or 拒否する、暴言なら傷つく、優しさなら感謝する',
      '- セリフが短ければ短い反応、長ければ重い反応',
      '- NPCの dialogue は「' + inputText + '」というセリフの内容と語感を踏まえて作る',
      ''
    ].join('\n');
  }

  function doDirective(inputText) {
    var h = heroName() || '主人公';
    return [
      '',
      '【★v290: DO モード 逐語指示 ★絶対厳守】',
      'このターン、プレイヤーは ' + h + ' に「' + inputText + '」というアクションを取らせます。',
      'これは逐語指示です。' + h + ' は確実に**そのアクションを実行**します。',
      '躊躇・回避・代替行動・「〜しようとした」「〜しかけて止めた」のような未完了表現は禁止。',
      'アクションは完了した事実として narrative の冒頭で描写してください。',
      '',
      'このアクションを起点に、他キャラの反応・環境の変化のみを生成してください：',
      '- 他NPCがそのアクションを見てどう感じ、どう動くか',
      '- 環境がどう変わるか (音/匂い/光/距離)',
      '- ' + h + ' 自身の内面 (〜と感じた) は書いてよい',
      ''
    ].join('\n');
  }

  function storyDirective(inputText) {
    return [
      '',
      '【★v290: STORY モード 逐語起点指示 ★絶対厳守】',
      'このターン、プレイヤーは「' + inputText + '」という展開を物語に投入します。',
      'これは逐語指示の起点です。この内容を**必ず冒頭の地の文に含め**、',
      'そこから自然に物語を広げてください。',
      '',
      '- 入力内容を要約・改変・省略・別解釈・なかったことにする・矛盾させる、すべて禁止',
      '- 「ユーザーが入力した出来事は確実に起きた」前提で続きを描く',
      '- 主体は誰でも OK (NPC・環境・敵・第三者) — 入力をそのまま地の文として取り込む',
      '- 拡張・広げる・続きを書くのは OK、無視・否定は禁止',
      '- narrative[0] (または極めて早い位置) に入力テキストの中身が必ず登場すること',
      ''
    ].join('\n');
  }

  // ============================================================
  // B. user payload への事前固定
  // ============================================================

  function transformUserJson(userStr, inputType, inputText) {
    if (!userStr || typeof userStr !== 'string') return userStr;
    if (userStr.indexOf('"recentHistory"') < 0) return userStr;

    var obj;
    try { obj = JSON.parse(userStr); } catch (e) { return userStr; }

    var h = heroName() || '主人公';
    var verbatim = '';
    if (inputType === 'SAY') {
      verbatim = '\n---\n[★今ターン・既に発生した事実] ' +
        h + 'は「' + normalizeSayInput(inputText) + '」と言った。\n' +
        '(↑この台詞は一字一句変えず narrative に必ず登場させること。続きは他キャラの反応のみ書く)';
    } else if (inputType === 'DO') {
      verbatim = '\n---\n[★今ターン・既に発生した事実] ' +
        h + 'は ' + normalizeDoInput(inputText) + '\n' +
        '(↑このアクションは確定完了として narrative 冒頭で描写し、続きは他キャラの反応・環境変化のみ書く)';
    } else if (inputType === 'STORY') {
      verbatim = '\n---\n[★今ターン・既に発生した事実] ' +
        normalizeStoryInput(inputText) + '\n' +
        '(↑この展開はもう起きた事実。narrative 冒頭に必ず取り込み、ここから自然に物語を広げよ)';
    }

    if (verbatim) {
      obj.recentHistory = (obj.recentHistory || '') + verbatim;
      if (inputType === 'SAY') {
        obj.CRITICAL_INSTRUCTION =
          '★v290逐語ルール: ' + h + ' の最初のセリフは「' + inputText +
          '」と一字一句同一で出力。要約・言い換え・装飾禁止。NPCはこの台詞に敏感に反応。';
      } else if (inputType === 'DO') {
        obj.CRITICAL_INSTRUCTION =
          '★v290逐語ルール: ' + h + ' は「' + inputText +
          '」を確実に実行 (完了形)。躊躇・回避・代替行動禁止。narrative冒頭にこのアクションを記述、続きは他NPCの反応のみ。';
      } else if (inputType === 'STORY') {
        obj.CRITICAL_INSTRUCTION =
          '★v290逐語ルール: 「' + inputText +
          '」を起点に物語を広げる。narrative 冒頭にこの展開を確実に取り込み、要約・省略・無視は禁止。ここから自然に拡張せよ。';
      }
      obj.v290VerbatimInput = { type: inputType, text: inputText, hero: h };
    }

    try { return JSON.stringify(obj, null, 2); }
    catch (e) { return userStr; }
  }

  function transformUserPlain(userStr, inputType, inputText) {
    if (!userStr || typeof userStr !== 'string') return userStr;
    var h = heroName() || '主人公';
    var block = '';
    if (inputType === 'SAY') {
      block = [
        '',
        '【★v290 逐語指示・絶対厳守】',
        h + ' の最初のセリフは「' + inputText + '」と一字一句変えず出力。',
        '要約・言い換え・装飾追加・敬語化は禁止。NPCはこのセリフに敏感に反応せよ。',
        ''
      ].join('\n');
    } else if (inputType === 'DO') {
      block = [
        '',
        '【★v290 逐語指示・絶対厳守】',
        h + ' は「' + inputText + '」を確実に実行する (完了形)。',
        '躊躇・回避・代替行動は禁止。narrative 冒頭でこのアクションを完了済として描写せよ。',
        '続きは他NPCの反応・環境変化のみ書け。',
        ''
      ].join('\n');
    } else if (inputType === 'STORY') {
      block = [
        '',
        '【★v290 逐語起点指示・絶対厳守】',
        '「' + inputText + '」を物語の起点として narrative 冒頭に必ず取り込め。',
        '要約・改変・省略・無視は禁止。この展開は確実に起きた事実。',
        'ここから自然に物語を広げる方向で続きを書け。',
        ''
      ].join('\n');
    }
    if (!block) return userStr;
    var marker = '↓ ';
    var idx = userStr.lastIndexOf(marker);
    if (idx > -1) {
      return userStr.slice(0, idx) + block + '\n' + userStr.slice(idx);
    }
    return userStr + block;
  }

  function transformSys(sysStr, inputType, inputText) {
    if (!sysStr || typeof sysStr !== 'string') return sysStr;
    var directive = '';
    if (inputType === 'SAY')   directive = sayDirective(inputText);
    else if (inputType === 'DO')    directive = doDirective(inputText);
    else if (inputType === 'STORY') directive = storyDirective(inputText);
    if (!directive) return sysStr;
    return directive + '\n' + sysStr + '\n' + directive;
  }

  // ============================================================
  // C. ポスト処理
  // ============================================================

  function findHeroDialogue(narrative, h) {
    if (!Array.isArray(narrative) || !h) return null;
    for (var i = 0; i < narrative.length; i++) {
      var line = String(narrative[i] || '');
      if (!line) continue;
      var rxNear = new RegExp(escForRegex(h) + '[^「」\n]{0,40}「([^「」]{1,200})」');
      var m = line.match(rxNear);
      if (m) return { index: i, inner: m[1], hadName: true };
      var rxAfter = new RegExp('「([^「」]{1,200})」[^\n]{0,40}' + escForRegex(h));
      var m2 = line.match(rxAfter);
      if (m2) return { index: i, inner: m2[1], hadName: true };
    }
    for (var j = 0; j < narrative.length; j++) {
      var ln = String(narrative[j] || '');
      var mm = ln.match(/「([^「」]{1,200})」/);
      if (mm && /(私|わたし|俺|僕|あたし|ぼく|おれ)/.test(mm[1])) {
        return { index: j, inner: mm[1], hadName: false };
      }
    }
    return null;
  }

  function findHeroAction(narrative, h, actionText) {
    if (!Array.isArray(narrative) || !h || !actionText) return false;
    var keyword = String(actionText).replace(/[。、！？!?…]/g, '').trim();
    if (!keyword) return false;
    var snippet = keyword.slice(0, Math.min(6, keyword.length));
    for (var i = 0; i < Math.min(narrative.length, 3); i++) {
      var line = String(narrative[i] || '');
      if (line.indexOf(snippet) >= 0) return true;
    }
    return false;
  }

  // STORY 用: 入力テキストの「核となるキーワード」が narrative 冒頭付近に
  // 含まれているかをチェック。複数の特徴語のうち一つでも見つかれば OK。
  function findStoryEcho(narrative, inputText) {
    if (!Array.isArray(narrative) || !inputText) return false;
    var clean = String(inputText).replace(/[「」『』。、！？!?…\s]+/g, '').trim();
    if (!clean) return false;
    // 連続する 4-6 文字程度のスニペットを複数試す
    var snippets = [];
    if (clean.length >= 4) snippets.push(clean.slice(0, Math.min(6, clean.length)));
    if (clean.length >= 8) snippets.push(clean.slice(2, 8));
    if (clean.length >= 12) snippets.push(clean.slice(Math.max(0, clean.length - 6)));
    // 冒頭 4 文字でもチェック
    if (clean.length >= 4) snippets.push(clean.slice(0, 4));
    var checkLines = narrative.slice(0, Math.min(4, narrative.length));
    for (var i = 0; i < checkLines.length; i++) {
      var line = String(checkLines[i] || '');
      for (var j = 0; j < snippets.length; j++) {
        if (snippets[j] && line.indexOf(snippets[j]) >= 0) return true;
      }
    }
    return false;
  }

  function applyVerbatimSay(narrative, h, inputText) {
    if (!Array.isArray(narrative)) narrative = [];
    var verbatim = normalizeSayInput(inputText);
    if (!verbatim) return narrative;

    var found = findHeroDialogue(narrative, h);
    var heroLine = h + 'は「' + verbatim + '」と言った。';

    if (found) {
      var origLine = String(narrative[found.index] || '');
      var innerNormalized = (found.inner || '').trim();
      var inputNormalized = verbatim.replace(/[。、！？!?…]+$/, '').trim();
      var innerNoPunct = innerNormalized.replace(/[。、！？!?…]+$/, '').trim();
      if (innerNoPunct === inputNormalized || innerNormalized === inputNormalized) {
        return narrative;
      }
      var replaced = origLine.replace(/「[^「」]{1,200}」/, '「' + verbatim + '」');
      if (replaced !== origLine) {
        narrative = narrative.slice();
        narrative[found.index] = replaced;
        console.log(TAG, 'SAY: replaced hero dialogue at index', found.index);
        return narrative;
      }
    }

    narrative = narrative.slice();
    narrative.unshift(heroLine);
    console.log(TAG, 'SAY: inserted hero verbatim at index 0');
    return narrative;
  }

  function applyVerbatimDo(narrative, h, inputText) {
    if (!Array.isArray(narrative)) narrative = [];
    var action = String(inputText || '').trim();
    if (!action) return narrative;

    if (findHeroAction(narrative, h, action)) {
      return narrative;
    }

    var actionLine = h + 'は' + normalizeDoInput(action);
    narrative = narrative.slice();
    narrative.unshift(actionLine);
    console.log(TAG, 'DO: inserted hero action at index 0');
    return narrative;
  }

  function applyVerbatimStory(narrative, inputText) {
    if (!Array.isArray(narrative)) narrative = [];
    var line = normalizeStoryInput(inputText);
    if (!line) return narrative;

    if (findStoryEcho(narrative, inputText)) {
      return narrative;
    }

    // 入力をそのまま地の文として narrative 冒頭に挿入
    narrative = narrative.slice();
    narrative.unshift(line);
    console.log(TAG, 'STORY: inserted user event at index 0');
    return narrative;
  }

  // ============================================================
  // wrap
  // ============================================================

  function wrapPlannerBuild() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v290Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var result;
      try { result = orig(inputType, inputText); }
      catch (e) {
        console.warn(TAG, 'orig build failed:', e && e.message);
        throw e;
      }
      try {
        if (inputType !== 'SAY' && inputType !== 'DO' && inputType !== 'STORY') return result;
        if (!inputText || typeof inputText !== 'string') return result;
        if (!result || typeof result !== 'object') return result;

        var sys = transformSys(result.sys || '', inputType, inputText);
        var user;
        if (typeof result.user === 'string' && result.user.indexOf('"recentHistory"') >= 0) {
          user = transformUserJson(result.user, inputType, inputText);
        } else {
          user = transformUserPlain(result.user || '', inputType, inputText);
        }
        if (!window.__v290LoggedBuildOnce) {
          window.__v290LoggedBuildOnce = true;
          console.log(TAG, 'build wrapped: first ' + inputType + ' transform applied');
        }
        return { sys: sys, user: user };
      } catch (e) {
        console.warn(TAG, 'build transform fail:', e && e.message);
        return result;
      }
    };
    Planner.build.__v290Wrapped = true;
    console.log(TAG, 'Planner.build wrapped');
    return true;
  }

  function wrapPlannerParse() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.parsePlan !== 'function') return false;
    if (Planner.parsePlan.__v290Wrapped) return true;
    var origParse = Planner.parsePlan.bind(Planner);
    Planner.parsePlan = function (rawText, inputType) {
      var plan;
      try { plan = origParse(rawText, inputType); }
      catch (e) { throw e; }
      try {
        if (!plan) return plan;
        if (inputType !== 'SAY' && inputType !== 'DO' && inputType !== 'STORY') return plan;
        var stash = window.__v290LastInput;
        if (!stash || stash.type !== inputType) return plan;
        var inputText = stash.text;
        if (!inputText) return plan;

        var h = heroName() || '主人公';
        var narr = Array.isArray(plan.narrative) ? plan.narrative : [];
        if (inputType === 'SAY') {
          plan.narrative = applyVerbatimSay(narr, h, inputText);
        } else if (inputType === 'DO') {
          plan.narrative = applyVerbatimDo(narr, h, inputText);
        } else if (inputType === 'STORY') {
          plan.narrative = applyVerbatimStory(narr, inputText);
        }
        return plan;
      } catch (e) {
        console.warn(TAG, 'parsePlan transform fail:', e && e.message);
        return plan;
      }
    };
    Planner.parsePlan.__v290Wrapped = true;
    console.log(TAG, 'Planner.parsePlan wrapped');
    return true;
  }

  function wrapBuildForStash() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v290StashWrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      try {
        if ((inputType === 'SAY' || inputType === 'DO' || inputType === 'STORY') &&
            typeof inputText === 'string') {
          window.__v290LastInput = { type: inputType, text: inputText, t: Date.now() };
        }
      } catch (e) {}
      return orig(inputType, inputText);
    };
    Planner.build.__v290StashWrapped = true;
    return true;
  }

  function init() {
    wrapBuildForStash();
    wrapPlannerParse();
    wrapPlannerBuild();
  }

  setTimeout(init, 0);
  setTimeout(init, 500);
  setTimeout(init, 2000);
  setTimeout(init, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    init();
    if (++tries > 30) clearInterval(iv);
  }, 500);

  window.__v290 = {
    sayDirective: sayDirective,
    doDirective: doDirective,
    storyDirective: storyDirective,
    transformSys: transformSys,
    transformUserJson: transformUserJson,
    transformUserPlain: transformUserPlain,
    applyVerbatimSay: applyVerbatimSay,
    applyVerbatimDo: applyVerbatimDo,
    applyVerbatimStory: applyVerbatimStory,
    findHeroDialogue: findHeroDialogue,
    findHeroAction: findHeroAction,
    findStoryEcho: findStoryEcho,
    version: 'v290-2-with-story'
  };
})();
