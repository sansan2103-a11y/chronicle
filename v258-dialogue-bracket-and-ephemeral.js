// v258-dialogue-bracket-and-ephemeral.js
// 目的: 会話ログにセリフが反映されないバグの修正
//
// 観測されたバグ（実機・PC・スマホ共通）:
//   narrative に `サクラ『助けて！…』` のような台詞が書かれても、会話ログに
//   全く反映されない。古いターンのセリフだけが残ったまま。
//
// 原因（根本）:
//   既存の dialogue 抽出ロジックの取りこぼし:
//     - v200 PARSER.extractInline: `「…」` と `《…》` のみ。`『…』` 非対応。
//     - v203 parseDialogues: 同上。`『…』` 非対応。
//     - v220 extractInlineDialogues: `『…』` 対応だが、cast.hero.name と
//       cast.npcs[].name のみ抽出対象。エフェメラル NPC（サクラ 等、
//       AI が地の文で初登場させた未登録キャラ）は無視される。
//   結果: `名前『セリフ』` でかつ 名前 が未登録の場合、どの抽出器にも
//   引っかからず、t.dialogues に追加されない → 会話ログに出ない。
//
//   ※ user は「スマホ版限定」と推定したが、実機検証で PC でも同じバグ。
//
// 修正方針（設計原則準拠 / 機能向上 / 「禁止」追加なし）:
//   1. `『…』` パターンの抽出を独立に実装
//   2. cast 登録の有無を問わず、name らしい識別子を speaker として受理。
//      validation は v200 isValidSpeaker と同等のブラックリスト。
//   3. 「」「《》」も同様に ephemeral 対応で再抽出（取りこぼし防止）
//   4. 各ターンの t.dialogues に未追加のものだけ append（idempotent）
//   5. 変更があれば UI.renderAll() と v201/v257 force render を呼んで反映
//   6. v220 と衝突しないよう sig 比較で重複防止
//
// ガード: window.__v258Active

(function () {
  'use strict';
  if (window.__v258Active) {
    console.log('[v258] already active, skip');
    return;
  }
  window.__v258Active = true;
  console.log('[v258] dialogue bracket + ephemeral extractor init');

  // ====================================================================
  // Speaker validation
  // ====================================================================
  var BODY_PARTS = /^(手|声|目|顔|肌|髪|血|涙|息|胸|腰|腕|足|指|口|耳|背|腹|肩|首|頬|唇|舌|歯|爪|肘|膝|踝|尻|股|膣|陰|穴|肉|骨|筋|腱|脈|皮|毛|汗|蕾|突起)$/;
  var BAD_NOUNS = /^(夕暮れ|今は人|二つの|埃に埋|冷や汗|怪我|一体誰|三人|貴方|彼|彼女|此処|其処|何|誰|今|昔|これ|それ|あれ|私|俺|僕|あたし|拙者|彼ら|彼女ら|二人|男|女|少年|少女|老人|子供|周囲|自分|相手|誰か|何か)$/;
  var PARTICLE_PRESENT = /[をはがにへもまでよりからとや]/;
  var VERB_FORM = /(した|して|する|される|られる|である|ている|った|たい|ない|だっ|だが|ました|ません|です|だった)/;

  function isValidSpeaker(name) {
    if (!name) return false;
    name = name.replace(/[\s　]+/g, '');
    if (name.length < 2 || name.length > 12) return false;
    if (BODY_PARTS.test(name)) return false;
    if (BAD_NOUNS.test(name)) return false;
    if (PARTICLE_PRESENT.test(name)) return false;
    if (VERB_FORM.test(name)) return false;
    if (name.indexOf('の') >= 0) return false;
    if (/^[ぁ-ゖ]+$/.test(name) && name.length < 4) return false;
    if (/^[0-9０-９\s・…。、,.!?！？「」『』《》〈〉]+$/.test(name)) return false;
    return true;
  }

  // ====================================================================
  // 抽出: `名前「…」` `名前『…』` `名前《…》` （ephemeral 含む）
  // ====================================================================
  function extractAllDialogues(narrative) {
    if (!narrative) return [];
    var out = [];

    var charClass = '[一-鿿ぁ-ゖァ-ヺ々ー・A-Za-zＡ-Ｚａ-ｚ]';
    var nameRx = '(' + charClass + '{2,12})';
    var partOpt = '(?:[はがも、,]\\s*)?';
    var anchor = '(?:^|[\\n。\\s])';

    var patterns = [
      { rx: new RegExp(anchor + nameRx + partOpt + '「([^「」\\n]{1,300})」', 'g'), inner: false, kind: 'square' },
      { rx: new RegExp(anchor + nameRx + partOpt + '『([^『』\\n]{1,300})』', 'g'), inner: false, kind: 'double' },
      { rx: new RegExp(anchor + nameRx + partOpt + '《([^《》\\n]{1,300})》', 'g'), inner: true,  kind: 'angle'  }
    ];

    var seenSpans = [];

    patterns.forEach(function (p) {
      p.rx.lastIndex = 0;
      var m;
      while ((m = p.rx.exec(narrative)) !== null) {
        var name = (m[1] || '').replace(/[\s　]+/g, '');
        var text = (m[2] || '').trim();
        if (!isValidSpeaker(name)) continue;
        if (!text) continue;
        if (/^(送信|再生成|取消|続きを書く|やり直す|戻る|決定)$/.test(text)) continue;
        var start = m.index;
        var end = start + m[0].length;
        var dup = false;
        for (var i = 0; i < seenSpans.length; i++) {
          if (start < seenSpans[i][1] && end > seenSpans[i][0]) { dup = true; break; }
        }
        if (dup) continue;
        seenSpans.push([start, end]);
        out.push({
          speaker: name,
          text: text,
          inner: !!p.inner,
          start: start
        });
      }
    });

    out.sort(function (a, b) { return a.start - b.start; });
    return out.map(function (h) { return { speaker: h.speaker, text: h.text, inner: h.inner }; });
  }

  // ====================================================================
  // 1 ターン分の dialogues 同期（idempotent）
  // ====================================================================
  function syncTurn(turn) {
    if (!turn || !turn.narrative) return false;
    var found = extractAllDialogues(turn.narrative);
    if (!found.length) return false;
    if (!Array.isArray(turn.dialogues)) turn.dialogues = [];

    var existing = {};
    turn.dialogues.forEach(function (d) {
      var k = ((d && d.speaker) || '') + '||' + (((d && d.text) || '').trim()) + '||' + ((d && d.inner) ? '1' : '0');
      existing[k] = true;
    });

    var added = 0;
    found.forEach(function (h) {
      var sig = h.speaker + '||' + h.text + '||' + (h.inner ? '1' : '0');
      if (existing[sig]) return;
      existing[sig] = true;
      turn.dialogues.push({
        speaker: h.speaker,
        text: h.text,
        inner: h.inner
      });
      added++;
      try { console.log('[v258] extracted:', h.speaker, '|', h.text.slice(0, 40)); } catch (e) {}
    });
    return added > 0;
  }

  // ====================================================================
  // 全ターン再抽出 + 反映
  // ====================================================================
  function reprocessAll() {
    try {
      var s;
      try {
        s = (typeof S !== 'undefined' && S && S.turns) ? S : JSON.parse(localStorage.getItem('chr6') || '{}');
      } catch (e) {
        s = JSON.parse(localStorage.getItem('chr6') || '{}');
      }
      var turns = (s && s.turns) || [];
      if (!turns.length) return false;

      var changed = false;
      turns.forEach(function (t) {
        if (syncTurn(t)) changed = true;
      });

      if (changed) {
        try {
          var raw = localStorage.getItem('chr6');
          var ls = raw ? JSON.parse(raw) : {};
          ls.turns = turns;
          if (typeof S !== 'undefined' && S.cast) ls.cast = S.cast;
          localStorage.setItem('chr6', JSON.stringify(ls));
        } catch (e) {}

        try { if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') UI.renderAll(); } catch (e) {}
        try { if (typeof window.__v201render === 'function') window.__v201render(); } catch (e) {}
        try { if (typeof window.__v257ForceRender === 'function') window.__v257ForceRender(); } catch (e) {}
        try { if (typeof window.__v256ForceRender === 'function') window.__v256ForceRender(); } catch (e) {}

        if (!window.__v258Renders) window.__v258Renders = 0;
        window.__v258Renders++;
        console.log('[v258] reprocessed turns; reflow triggered (count=' + window.__v258Renders + ')');
      }
      return changed;
    } catch (e) {
      console.warn('[v258] reprocess fail:', e && e.message);
      return false;
    }
  }

  // ====================================================================
  // 起動
  // ====================================================================
  function start() {
    try { reprocessAll(); } catch (e) {}
    setInterval(function () {
      try { reprocessAll(); } catch (e) {}
    }, 2500);
  }

  if (document.readyState === 'complete') {
    setTimeout(start, 600);
  } else {
    window.addEventListener('load', function () { setTimeout(start, 600); });
    setTimeout(start, 3500);
  }

  try {
    var proto = Storage.prototype;
    if (!proto.setItem.__v258Hooked) {
      var origSet = proto.setItem;
      proto.setItem = function (key, value) {
        var ret = origSet.call(this, key, value);
        if (key === 'chr6') {
          setTimeout(function () { try { reprocessAll(); } catch (e) {} }, 60);
        }
        return ret;
      };
      proto.setItem.__v258Hooked = true;
    }
  } catch (e) {}

  window.__v258 = {
    extractAllDialogues: extractAllDialogues,
    isValidSpeaker: isValidSpeaker,
    reprocessAll: reprocessAll,
    syncTurn: syncTurn
  };

  console.log('[v258] init complete');
})();
