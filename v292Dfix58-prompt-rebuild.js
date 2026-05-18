// =====================================================================
// Chronicle TRPG — v292Dfix58: prompt rebuild (delta-only + XML tags + summary)
// ---------------------------------------------------------------------
// 目的:
//   1. JSON 出力要件を撤回し、自由な散文（prose）で Hermes に書かせる
//   2. 過去 6 ターン → 直近 2 ターン + rolling summary（context bleed 防止）
//   3. 台詞を <say who="..."> タグで囲む指示（fix59 hybrid extractor が拾う）
//   4. Hermes 自身に <summary>...</summary> タグで「物語の現在地」を書かせる
//
// v2 (self-healing):
//   既存の sysExt extensions に「sys を完全置換するもの」が複数あり、
//   fix58 を中間位置に push するだけだと後続に上書きされる。
//   解決: setInterval で fix58 hook を配列末尾に維持する。
//
// 使う hook:
//   Planner._extensions       : sys プロンプト書き換え（末尾維持）
//   Planner._userExtensions   : user payload 書き換え（delta-aware）
//   Planner._parseExtensions  : <summary> 抽出 → S.rollingSummary 保存（末尾維持）
// =====================================================================
(function(){
  if (window.__v292Dfix58Active) return;
  window.__v292Dfix58Active = true;
  var TAG = '[v292Dfix58]';

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------
  function getStateLocal(){
    try {
      var S = (0, eval)('typeof S !== "undefined" ? S : null');
      if (S) return S;
    } catch(e){}
    if (window.S) return window.S;
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  function buildRollingSummary(state){
    if (state.rollingSummary && typeof state.rollingSummary === 'string' &&
        state.rollingSummary.trim().length > 0){
      return state.rollingSummary.trim();
    }
    var turns = state.turns || [];
    if (!turns.length) return '（物語の開始時点）';
    var last = turns[turns.length - 1];
    var n = (last.narrative || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return 'これまで ' + turns.length + ' ターン経過。直近の状況: ' + n + (n.length >= 200 ? '…' : '');
  }

  function buildRecentDialoguesList(state, maxN){
    var lines = [];
    var turns = state.turns || [];
    var extract = window.__v292 && window.__v292.dialogueLayout && window.__v292.dialogueLayout.extractDialogues;
    for (var i = turns.length - 1; i >= 0 && lines.length < maxN; i--){
      var t = turns[i];
      var ds = Array.isArray(t.dialogues) ? t.dialogues : null;
      if (!ds && typeof extract === 'function'){
        try { ds = extract(t.narrative || '', t) || []; }
        catch(e){ ds = []; }
      }
      ds = ds || [];
      for (var j = ds.length - 1; j >= 0 && lines.length < maxN; j--){
        var d = ds[j];
        if (d && d.speaker && d.text){
          lines.unshift({ speaker: d.speaker, text: d.text });
        }
      }
    }
    return lines;
  }

  // ---------------------------------------------------------------
  // 1. sys プロンプト書き換え（末尾に出力形式仕様を追加）
  // ---------------------------------------------------------------
  // 注意: 他の sysExt が sys を完全置換するため、本 hook は配列末尾で実行されるよう
  //       setInterval で維持する。受け取る ctx.sys は最終形なので、不要な regex 置換が
  //       マッチしなくても問題ない。我々の責任は「出力形式仕様を末尾に append」のみ。
  function sysExt(ctx){
    var sys = ctx.sys || '';

    // (a) 旧 JSON のみ要件があれば撤回
    sys = sys.replace(
      /必ず以下の全制約を守り、JSONのみを返してください。余分なテキストは一切出力禁止。/g,
      '必ず以下の文学的指針を守ってください。'
    );

    // (b) 旧 JSON 出力スキーマセクションが残っていれば削除
    sys = sys.replace(
      /【出力形式 — このJSONのみ返す】[\s\S]*?(?=\n【|$)/g,
      ''
    );

    // (c) 旧 JSON 配列例セクションが残っていれば削除
    sys = sys.replace(
      /【お手本となる正しいnarrative出力例】[\s\S]*?(?=\n【|$)/g,
      ''
    );

    // (d) 既に fix58 のセクションが含まれていれば二重 append を防ぐ
    if (sys.indexOf('【出力形式 ★絶対遵守】') !== -1) return sys;

    // (e) 新セクション追加
    sys += '\n\n【出力形式 ★絶対遵守】\n' +
      'プレイヤー入力の「直後」に起こることだけを、自由な散文で描写してください。\n' +
      'JSON 出力は禁止。地の文・心理描写・行動描写は自由なプローズで書く。\n\n' +
      '★ 既に語った台詞・場面の言い換え・再演は禁止。新しく起きたことだけを書く。\n\n' +
      '★ 登場人物の発話は必ず以下のタグで囲んでください：\n' +
      '   <say who="キャラ名">セリフ本文</say>\n\n' +
      '例:\n' +
      '<say who="ミリア">走れ！振り向くな！</say> ミリアはナイフを構えた。\n' +
      '<say who="フィオナ">置いていけない</say>\n' +
      'サクラは小さく頷いた。指先が氷のように冷たかった。\n\n' +
      '帰属が曖昧な声・正体不明の声: <say who="？">…</say> または <say who="謎の声">…</say>\n' +
      '内心モノローグ: <say who="キャラ名(心)">（…と思った）</say>\n\n' +
      '★ 出力の最後に、これまでの物語の「現在地」を 2〜3 文で要約して以下のタグで囲んでください：\n' +
      '<summary>\n' +
      'これまでの物語の要点を 2〜3 文で。読み手が次のターンを理解できる最小限の情報。\n' +
      '</summary>\n\n' +
      '本編の描写は 500〜800 字を目安。Hermes らしい文学的・心理的没入を最優先。';

    return sys;
  }

  // ---------------------------------------------------------------
  // 2. user payload 書き換え（delta-aware）
  // ---------------------------------------------------------------
  function userExt(ctx){
    var user = ctx.user;
    try {
      var parsed = JSON.parse(user);
      var state = ctx.state || getStateLocal();

      parsed.storySoFar = buildRollingSummary(state);

      var turns = state.turns || [];
      var recent = turns.slice(-2);
      parsed.recentScenes = recent.map(function(t){
        return {
          input: { type: t.inputType, text: t.playerText },
          narrative: t.narrative
        };
      });

      parsed.recentDialogues = buildRecentDialoguesList(state, 5);

      var inputText = (parsed.currentInput && parsed.currentInput.text) || '';
      parsed.deltaInstruction =
        '上記入力「' + inputText + '」の直後だけを描写してください。' +
        'recentScenes / recentDialogues の内容は「これまでの文脈」であり、再演・言い換え・引用は禁止。';

      delete parsed.recentHistory;

      return JSON.stringify(parsed, null, 2);
    } catch(e){
      console.warn(TAG, 'userExt error:', e && e.message);
      return user;
    }
  }

  // ---------------------------------------------------------------
  // 3. parse: <summary> 抽出 + 除去
  // ---------------------------------------------------------------
  function parseExt(plan, info){
    try {
      var raw = (info && info.raw) || '';
      var state = (info && info.state) || getStateLocal();

      var m = raw.match(/<summary>([\s\S]*?)<\/summary>/);
      if (m){
        var summary = (m[1] || '').trim();
        if (summary){
          state.rollingSummary = summary;
          try {
            if (typeof state.save === 'function') state.save();
            else localStorage.setItem('chr6', JSON.stringify(state));
          } catch(e){}
          console.log(TAG, 'summary captured (' + summary.length + ' chars):', summary.slice(0, 60) + (summary.length > 60 ? '…' : ''));
        }
      }

      if (plan && plan.narrative){
        var stripSummary = function(s){
          return String(s).replace(/<summary>[\s\S]*?<\/summary>/g, '').trim();
        };
        if (Array.isArray(plan.narrative)){
          plan.narrative = plan.narrative.map(stripSummary).filter(function(s){ return s.length > 0; });
        } else if (typeof plan.narrative === 'string'){
          plan.narrative = stripSummary(plan.narrative);
        }
      }
    } catch(e){
      console.warn(TAG, 'parseExt error:', e && e.message);
    }
    return plan;
  }

  // ---------------------------------------------------------------
  // install + self-heal: 配列末尾位置を維持
  // ---------------------------------------------------------------
  function ensureAtTail(arr, fn){
    if (!arr || !fn) return false;
    var i = arr.indexOf(fn);
    if (i < 0){
      arr.push(fn);
      return true;
    } else if (i < arr.length - 1){
      arr.splice(i, 1);
      arr.push(fn);
      return true;
    }
    return false; // 既に末尾
  }

  function install(){
    var P = window.Planner;
    if (!P){
      setTimeout(install, 200);
      return;
    }
    P._extensions = P._extensions || [];
    P._userExtensions = P._userExtensions || [];
    P._parseExtensions = P._parseExtensions || [];

    var movedSys = ensureAtTail(P._extensions, sysExt);
    var movedUser = ensureAtTail(P._userExtensions, userExt);
    var movedParse = ensureAtTail(P._parseExtensions, parseExt);

    P._extensions.__v292Dfix58 = true;
    P._userExtensions.__v292Dfix58 = true;
    P._parseExtensions.__v292Dfix58 = true;

    if (movedSys || movedUser || movedParse){
      console.log(TAG, 'hooks ensured at array tail (sys+user+parse) — sysMoved=' + movedSys + ' userMoved=' + movedUser + ' parseMoved=' + movedParse);
    }
  }

  install();
  // 他 feature が後から push したら末尾を奪われる → 3 秒毎に末尾位置を再確保
  setInterval(install, 3000);

  console.log(TAG, 'prompt rebuild active (v2 self-healing)');
})();
