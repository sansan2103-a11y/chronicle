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

  /* ★FACTS1（laneFLOW3・2026-11-11・kill: localStorage v292DfixFACTS1Off='1' で従来と送信バイト同一・毎回評価）:
     モデルに渡る本文は直近 2 ターン（recentScenes）だけで、storySoFar は fix75 の重複除去の後「これまで N ターン経過。」の 1 文になる。
     3 ターン以上前の事実がずれていた（laneFLOW1 実測: 鍵束「十本ほど」→「三本」、通っていない非常口を「さっき通った」）。
     追加の AI 呼び出しはしない。保存も store も変えない。その回の S.turns から毎回作る（取消・やり直しで消えたターンは入らない）。
       ・recentScenes より前のターン（turns[0 .. -3]）について、プレイヤーの入力（本人が書いた言葉・40 字まで。「続きを書く」は入れない）と、
         本文のうち「数＋助数詞」を含む地の文を前から 2 文まで（台詞＝「」『』の中は使わない・1 文 70 字まで・「一番」は数えない）だけを 1 行にする。
       ・新しいターンを優先して合計 600 字まで（古い方から落とす）。並びは古い順。何も無ければキーを足さない。
       ・置き場所は user JSON の storySoFar の直後（earlierFacts）。sys は 0 字。
     過去の不具合（fix35/fix71）: sys 末尾に「各ターン本文の 1 文目を番号付きで並べ『上記の経緯を踏まえ続きを書く』」と渡したら、
       モデルがそれを本文で語り直し、保存→次のターンで増幅して反復崩壊した。ここではその条件を避ける:
       本文の書き出しを並べない（入力と数の事実だけ）・user 側の背景データとして置く・「語り直し・引用の禁止」と「ここに無いことを過去の事実にしない」を同じ場所に書く。
       本文の文と同じ文が出たときは従来どおり fix71 の全ターン照合が落とす。 */
  var FACTS1_MAX = 600, FACTS1_IN = 40, FACTS1_SENT = 70, FACTS1_PER = 2;
  var FACTS1_NUM = /[0-9０-９一二三四五六七八九十百千]+\s*(?:本|個|枚|人|つ|階|号|番|台|匹|頭|冊|発|錠|か所|箇所|ヶ所|歩|メートル|ｍ|キロ|束|部屋|段)/;
  var FACTS1_RULE = 'earlierFacts は recentScenes より前に実際にあったことの控え（プレイヤーの入力と、数・持ち物の事実）。食い違わせないためだけに使う。本文で振り返り・言い換え・引用をしない。ここにも recentScenes にも無いことを、前にあった事実（通った道・持ち物・約束など）として作らない。';
  function facts1On(){ try { return localStorage.getItem('v292DfixFACTS1Off') !== '1'; } catch(e){ return false; } }
  function facts1Plain(narr){
    var t = Array.isArray(narr) ? narr.join('\n') : String(narr || '');
    t = t.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/<[^>]*>/g, ' ');
    return t;
  }
  function facts1Sentence(narr){
    var t = facts1Plain(narr), buf = '', depth = 0, out = [];
    for (var i = 0; i < t.length; i++){
      var c = t.charAt(i);
      if (c === '「' || c === '『'){ depth++; buf = ''; continue; }
      if (c === '」' || c === '』'){ if (depth > 0) depth--; buf = ''; continue; }
      if (depth > 0) continue;
      if (c === '。' || c === '！' || c === '？' || c === '\n'){ if (c !== '\n') buf += c; var s = buf.replace(/\s+/g, ' ').trim(); if (s) out.push(s); buf = ''; continue; }
      buf += c;
    }
    var got = [], f2 = facts2On();
    for (var k = 0; k < out.length && got.length < FACTS1_PER; k++){
      var hit = out[k].replace(/一番/g, '');   /* 「一番上」等の「一番」は数の事実ではない */
      if (f2 && facts2MeasureOnly(hit)) continue;   /* ★FACTS2: 長さ・体の部位の数だけの文は拾わない（迷えば拾う） */
      if (FACTS1_NUM.test(hit) && /[ぁ-ん]/.test(out[k]) && out[k].length >= 6) got.push(out[k].length > FACTS1_SENT ? (out[k].slice(0, FACTS1_SENT - 1) + '…') : out[k]);
    }
    return got.join('');
  }
  /* ★FACTS2（laneSCENE1・2026-11-11・kill: localStorage v292DfixFACTS2Off='1' で FACTS1 のまま＝送信バイト同一・毎回評価）:
     FACTS1 は新しい 7 行前後（600 字）しか残さず、12 ターン目に「鍵十二本・一本は左ポケット」の行が窓から押し出された（laneFABLE1 #12）。
     また「指先が三本ぶん届かない」のような長さ・体の部位の数の文を拾って、鍵の本数を汚す恐れがあった（#13）。
       ・数（物の個数）・持ち物の受け渡し・けが・約束や期限 を含む行は、新しい方から 5 行まで「固定」して窓から落とさない。残りの字数を従来どおり新しい行で埋める。
         固定行のプレイヤー入力だけは 80 字まで残す（「…11 本を美羽へ」の後半が切れないように）。合計 600 字・並びは古い順は従来どおり。
       ・本文から拾う数の文のうち、数の出どころが全部「〜ぶん」「〜メートル・歩・段」や「指・腕・足」の数だけのものは拾わない。
       固定の順番: プレイヤーの入力にその手の語・数があるターン（新しい順）→ 本文の数の文だけのターン（新しい順）。
     書き方（rule の文）・置き場所・保存は FACTS1 のまま。AI の呼び出しは増えない。 */
  var FACTS2_PIN = 5, FACTS2_IN = 80;
  var FACTS2_NUMG = /[0-9０-９一二三四五六七八九十百千]+\s*(本|個|枚|人|つ|階|号|番|台|匹|頭|冊|発|錠|か所|箇所|ヶ所|歩|メートル|ｍ|キロ|束|部屋|段)/g;
  var FACTS2_BODY = /(指|爪|歯)/;   /* 指・爪・歯の数だけ（腕・足は怪異の数のことがあるので残す） */
  var FACTS2_KEY = /(渡し|渡す|渡さ|渡せ|預け|預か|受け取|ポケット|持っ|持た|持つ|持ち帰|握らせ|しまっ|仕舞|鞄|カバン|リュック|傷|怪我|けが|出血|血が|骨折|折れ|捻挫|ひね|捻っ|切り傷|噛ま|刺さ|火傷|腫れ|止血|手当|約束|までに|迎えに|戻る|戻れ|戻って|戻ります|戻す|戻し|[0-9０-９一二三四五六七八九十]+\s*(?:分|秒|時間)(?:で|後|以内|まで))/;
  function facts2On(){ try { return localStorage.getItem('v292DfixFACTS2Off') !== '1'; } catch(e){ return false; } }
  function facts2MeasureOnly(t){
    FACTS2_NUMG.lastIndex = 0; var m, n = 0, meas = 0;
    while ((m = FACTS2_NUMG.exec(t)) !== null){
      n++;
      var after = t.slice(m.index + m[0].length, m.index + m[0].length + 3), before = t.slice(Math.max(0, m.index - 3), m.index);
      if (/^(ぶん|分(?![か-ん])|ほど先|ほど後|先|後ろ)/.test(after) || /(歩|メートル|ｍ|キロ|段)/.test(m[1])) { meas++; continue; }
      if (FACTS2_BODY.test(after.charAt(0) === 'の' ? after.slice(1, 2) : '') || FACTS2_BODY.test(before.replace(/[がはも]$/, '').slice(-1))) { meas++; continue; }
    }
    return n > 0 && meas === n;
  }
  function facts2Key(pt, fact){   /* 2 = プレイヤーの入力に 数・持ち物・けが・約束 / 1 = 本文の文にだけある / 0 = なし */
    var p = String(pt || '').replace(/一番/g, ''); FACTS2_NUMG.lastIndex = 0;
    if (FACTS2_KEY.test(p) || (FACTS2_NUMG.test(p) && !facts2MeasureOnly(p))) return 2;
    return fact ? 1 : 0;
  }
  function facts1Build(state){
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
    if (turns.length <= 2) return null;
    if (facts2On()) return facts2Build(turns);   /* ★FACTS2（kill v292DfixFACTS2Off='1'）: 下の FACTS1 のまま */
    var TYPE = { SAY: '発言', DO: '行動', STORY: '展開' }, items = [], used = 0;
    for (var i = turns.length - 3; i >= 0; i--){
      var t = turns[i]; if (!t) continue;
      var pt = String(t.playerText || '').replace(/\s+/g, ' ').trim();
      if (/続きを(?:自然に)?進めて|^続きを書/.test(pt)) pt = '';
      if (pt.length > FACTS1_IN) pt = pt.slice(0, FACTS1_IN - 1) + '…';
      var fact = facts1Sentence(t.narrative);
      if (!pt && !fact) continue;
      var line = (i + 1) + 'ターン目' + (pt ? ('・' + (TYPE[t.inputType] || '入力') + '「' + pt + '」') : '') + (fact ? ('・' + fact) : '');
      if (used + line.length > FACTS1_MAX) break;
      used += line.length; items.unshift(line);
    }
    return items.length ? items : null;
  }
  function facts2Build(turns){
    var TYPE = { SAY: '発言', DO: '行動', STORY: '展開' }, rows = [], i;
    for (i = turns.length - 3; i >= 0; i--){
      var t = turns[i]; if (!t) continue;
      var pt = String(t.playerText || '').replace(/\s+/g, ' ').trim();
      if (/続きを(?:自然に)?進めて|^続きを書/.test(pt)) pt = '';
      var fact = facts1Sentence(t.narrative);
      if (!pt && !fact) continue;
      var key = facts2Key(pt, fact), cap = (key === 2) ? FACTS2_IN : FACTS1_IN;
      if (pt.length > cap) pt = pt.slice(0, cap - 1) + '…';
      rows.push({ i: i, key: key, line: (i + 1) + 'ターン目' + (pt ? ('・' + (TYPE[t.inputType] || '入力') + '「' + pt + '」') : '') + (fact ? ('・' + fact) : '') });
    }
    /* rows は新しい順。固定（key）を新しい方から 5 行まで先に取り、残りの字数を新しい行で埋める */
    var pick = {}, used = 0, pins = 0, r;
    for (var tier = 2; tier >= 1; tier--){
      for (r = 0; r < rows.length && pins < FACTS2_PIN; r++){ if (rows[r].key !== tier || pick[r]) continue; if (used + rows[r].line.length > FACTS1_MAX) continue; pick[r] = 1; used += rows[r].line.length; pins++; }
    }
    for (r = 0; r < rows.length; r++){ if (pick[r]) continue; if (used + rows[r].line.length > FACTS1_MAX) break; pick[r] = 1; used += rows[r].line.length; }
    var items = [];
    for (r = rows.length - 1; r >= 0; r--) if (pick[r]) items.push(rows[r].line);
    _facts2Pins = pins;
    return items.length ? items : null;
  }
  /* ★NOW1（laneSCENE1・2026-11-11・kill: localStorage v292DfixNOW1Off='1' で従来と送信バイト同一・毎回評価）:
     モデルに「いま誰がどこでどうなっているか」を言う欄が無かった。状態ブロックは <state> が出た回しか動かず（宙吊りの前後 4 ターン 0 件）、
     現在地は開始地点のまま（laneFABLE1 #2 #4 #11 #15）。追加の AI 呼び出しはしない。保存・store も変えない。
       ・直前のターン（S.turns の最後）の本文から、地の文（「」『』（）と <say> の中は使わない）の最後の 2〜3 文（合計 150 字まで）を取り、
         この回の入力（「続きを書く」は入れない・40 字まで）と合わせて 1〜2 行にする。user JSON の recentScenes の直後に nowScene として置く。
       ・現在地のキーは fix192 の B38-e と同じ置き換え（「物語開始時の場所…」）を NOW1 でも行う（fix192 側。B38-e の鍵が無くても）。
     過去の不具合（fix35/fix71/fix75）: sys 末尾に過去の文を並べ「上記を踏まえ続きを」と渡すと語り直しの反復崩壊が起きた。ここでは
       sys に置かない・並べるのは直前ターンの末尾 3 文まで（recentScenes にも同じ文がある＝新しい手本にならない）・「続けて」とは書かず
       「繰り返さない・言い換えない」を同じ場所に書く。本文が同じ文を出したときは従来どおり fix71 が落とす。 */
  var NOW1_MAX = 150, NOW1_SENT = 3, NOW1_IN = 40;
  var NOW1_RULE = 'nowScene は、いまこの瞬間の場面（直前の本文の終わり）と、この回の入力。誰がどこで何をしているか・位置・姿勢を食い違わせないためだけに使う。本文で繰り返さない・言い換えない。';
  function now1On(){ try { return localStorage.getItem('v292DfixNOW1Off') !== '1'; } catch(e){ return false; } }
  function now1Tail(narr){
    var ls = Array.isArray(narr) ? narr : String(narr || '').split('\n'), t = '';
    for (var a = 0; a < ls.length; a++){
      var l = String(ls[a] == null ? '' : ls[a]);
      if (/^\s*<(react|state|summary|scene_move)\b/.test(l)) continue;
      t += l.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/<[^>]*>/g, ' ') + '\n';
    }
    var buf = '', depth = 0, out = [];
    for (var i = 0; i < t.length; i++){
      var c = t.charAt(i);
      if (c === '「' || c === '『' || c === '（' || c === '('){ depth++; buf = ''; continue; }
      if (c === '」' || c === '』' || c === '）' || c === ')'){ if (depth > 0) depth--; buf = ''; continue; }
      if (depth > 0) continue;
      if (c === '。' || c === '！' || c === '？' || c === '\n'){ if (c !== '\n') buf += c; var x = buf.replace(/\s+/g, ' ').trim(); if (x && /[ぁ-んァ-ヶ一-龠]/.test(x) && x.length >= 4) out.push(x); buf = ''; continue; }
      buf += c;
    }
    var x2 = buf.replace(/\s+/g, ' ').trim(); if (x2 && x2.length >= 4 && /[ぁ-ん]/.test(x2)) out.push(x2);
    var got = [], used = 0;
    for (var k = out.length - 1; k >= 0 && got.length < NOW1_SENT; k--){
      var sx = out[k].length > 70 ? (out[k].slice(0, 69) + '…') : out[k];
      if (got.length && used + sx.length > NOW1_MAX) break;
      got.unshift(sx); used += sx.length;
    }
    return got.join('');
  }
  var _now1Last = null;
  function now1Apply(parsed, state){
    if (!now1On()) return parsed;
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
    _now1Last = { turns: turns.length, text: '' };
    if (!turns.length) return parsed;
    var last = turns[turns.length - 1] || {};
    var tail = now1Tail(last.narrative);
    if (!tail) return parsed;
    var ci = parsed.currentInput || {}, it = String(ci.text || '').replace(/\s+/g, ' ').trim();
    if (/続きを(?:自然に)?進めて|^続きを書/.test(it)) it = '';
    if (it.length > NOW1_IN) it = it.slice(0, NOW1_IN - 1) + '…';
    var TYPE = { SAY: '発言', DO: '行動', STORY: '展開' };
    var text = 'いまの場面：' + tail + (it ? ('\nこの回の入力：' + (TYPE[String(ci.type || '').toUpperCase()] || '入力') + '「' + it + '」') : '');
    _now1Last.text = text;
    var o = {}, k, placed = false;
    for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'nowScene') continue; o[k] = parsed[k]; if (k === 'recentScenes'){ o.nowScene = { rule: NOW1_RULE, text: text }; placed = true; } }
    if (!placed) o.nowScene = { rule: NOW1_RULE, text: text };
    return o;
  }
  window.__v292DfixNOW1 = { VER: 'now1-20261111', on: now1On, tail: now1Tail, last: function(){ return _now1Last; } };
  var _facts2Pins = 0;
  var _facts1Last = null;
  function facts1Apply(parsed, state){
    if (!facts1On()) return parsed;
    var items = facts1Build(state);
    _facts1Last = { turns: (state && state.turns) ? state.turns.length : 0, items: items ? items.length : 0, chars: items ? items.join('').length : 0 };
    if (!items) return parsed;
    var o = {}, k, placed = false;
    for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'earlierFacts') continue; o[k] = parsed[k]; if (k === 'storySoFar'){ o.earlierFacts = { rule: FACTS1_RULE, items: items }; placed = true; } }
    if (!placed) o.earlierFacts = { rule: FACTS1_RULE, items: items };
    return o;
  }
  window.__v292DfixFACTS1 = { VER: 'facts1-20261111', on: facts1On, build: facts1Build, sentence: facts1Sentence, last: function(){ return _facts1Last; } };
  window.__v292DfixFACTS2 = { VER: 'facts2-20261111', on: facts2On, measureOnly: facts2MeasureOnly, pins: function(){ return _facts2Pins; } };

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

      parsed = now1Apply(parsed, state);     /* ★NOW1（kill v292DfixNOW1Off='1'）: recentScenes の直後に nowScene（直前ターンが無ければ何もしない） */
      parsed = facts1Apply(parsed, state);   /* ★FACTS1（kill v292DfixFACTS1Off='1'）: storySoFar の直後に earlierFacts（無ければ何もしない） */

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
            if (typeof state.save === 'function') (typeof state.saveD==='function'?state.saveD('fix58.rollingSummary'):state.save());
            else { /* ★fix694: 既定の 'chr6' 決め打ちをやめ document の権限キーへ */
              /* ★fix748(C9): state.save が無い環境の fallback。本体への直接書込なので
                 admission 外なら書かない（次の summary 捕捉で再試行）。 */
              var __g748 = null;
              try { var __A748 = window.__v292DfixDAdm;
                    if (__A748 && typeof __A748.skipGuard === 'function') __g748 = __A748.syncGuard('S.save(fix58.fallback)'); } catch(_){}
              var __wk = (window.__chr6WriteKey ? window.__chr6WriteKey() : 'chr6');
              if (__wk && !(__g748 && (__g748.skip || __g748.hold))) localStorage.setItem(__wk, JSON.stringify(state));
            }
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
