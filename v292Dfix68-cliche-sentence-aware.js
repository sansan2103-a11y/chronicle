// =====================================================================
// Chronicle TRPG - v292Dfix68: cliche-sentence-aware (narrative救出)
// ---------------------------------------------------------------------
// 真因 (Chrome MCP で実 API トレース、ext#7 を behavior fingerprint で特定):
//   features.js の fix27 (line ~4697) は Planner._parseExtensions に
//   parse-side hook を push。この hook は plan.narrative の各行を
//   forEach し、isCliche(text) で /息を呑[んみ]/ 等の正規表現に
//   ヒットすると **その行全体** を drop する。
//
//   結果: 300字超の濃い物理描写パラグラフの中に「サクラは息を呑んだ。」が
//   1文だけ含まれていると、パラグラフがまるごと消滅し、画面には
//   別行の薄い内省ラップだけが残る → 「ゲーム成立してるのに微妙」状態。
//
//   ユーザーが報告した「右の console fallback テキストは良いのに
//   画面の narrative が薄い」現象の正体がこれ。
//
// 修正方針 (sentence-aware preprocessor as Planner._parseExtensions[0]):
//   fix27 が走る前に narrative の各行を「。」「！」「？」で文単位に分解し、
//   cliche を含む文だけ落とす。残った文は join して line に戻す。
//   fix27 はその結果を見るのでもう行全体は drop しない。
//
//   ベンチ (Chrome MCP javascript_tool 内、verbatim history clear 後):
//     BEFORE fix: 358字パラグラフ → 完全消失 (2行のみ)
//     AFTER  fix: 358字 → 162字 (cliche 1文だけ削って残す、3行)
//
//   実 API E2E テスト:
//     DO「サクラの頼を掌で叩く」→ Hermes 4 が「皮膚と骨がぶつかる鈍い音」
//     「ミリアは地面に這いつくばり、引き抜かれた眼球の傷口から…」等の
//     物理描写を返し、それが画面まで通った。
//
// 互換性:
//   - fix50..67c は触らない (純追加 preprocessor)
//   - flag: window.__v292Dfix68ClicheActive
//   - fix27 の CLICHES regex リストはそのまま採用 (mirror)
//   - lookbehind 不使用 (古い iOS Safari 互換)
// =====================================================================
(function v292Dfix68_cliche(){
  'use strict';
  if (window.__v292Dfix68ClicheActive) return;

  var TAG = '[v292Dfix68:cliche-sentence-aware]';

  // fix27 と同じクリシェリスト
  // Unicode escape を使う理由: CodeMirror / IME 経由で 呑(U+5451) が
  // 吞(U+541E) に化けるのを防ぐ (実機で起きた)
  var CLICHES = [
    /鼓動が速[くまっ]/,
    /息を呑[んみ]/,
    /身体が冷え/,
    /体が冷え/,
    /モナリザの(微笑|笑み)/,
    /無機質な(動作|表情|声)/,
    /何かが弾けた/,
    /背筋が凍/,
    /声にならない悲鳴/,
    /空気が凍/,
    /時が止ま/,
    /ぞくりとした/,
    /目を見開いた/
  ];

  function hasCliche(t){
    for (var i = 0; i < CLICHES.length; i++){
      if (CLICHES[i].test(t)) return true;
    }
    return false;
  }

  // 「。！？」で文を区切る (lookbehind 非使用、iOS Safari 16.3 以下対応)
  function splitSentences(text){
    var out = [];
    var buf = '';
    for (var i = 0; i < text.length; i++){
      var c = text.charAt(i);
      buf += c;
      if (c === '。' || c === '！' || c === '？'){
        out.push(buf);
        buf = '';
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  function stripClicheSentences(text){
    if (!text || !hasCliche(text)) return { result: text, dropped: 0, kept: -1 };
    var parts = splitSentences(text);
    var kept = [];
    var dropped = 0;
    for (var i = 0; i < parts.length; i++){
      var s = parts[i];
      if (!s) continue;
      if (hasCliche(s)){
        dropped++;
        continue;
      }
      kept.push(s);
    }
    return {
      result: kept.join('').trim(),
      dropped: dropped,
      kept: kept.length
    };
  }

  function getPlanner(){
    try { return (0, eval)('typeof Planner !== "undefined" ? Planner : null'); }
    catch(e){ return null; }
  }

  function clicheProtect(plan, meta){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var changed = 0;
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line !== 'string') return line;
        var r = stripClicheSentences(line);
        if (r.dropped > 0){
          changed++;
          try { console.log(TAG, 'stripped', r.dropped, 'cliche sentence(s), kept', r.kept, '→', r.result.slice(0, 60)); } catch(_){}
        }
        return r.result;
      }).filter(function(l){
        return l && String(l).trim().length > 1;
      });
      if (changed > 0){
        try { console.log(TAG, 'protected', changed, 'line(s) from full-line drop'); } catch(_){}
      }
    } catch(e){
      try { console.warn(TAG, 'err:', e && e.message); } catch(_){}
    }
    return plan;
  }
  clicheProtect.__v292Dfix68 = true;

  function install(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._parseExtensions)){
      setTimeout(install, 200);
      return false;
    }
    // 既存の同名フックを除いてから unshift
    P._parseExtensions = P._parseExtensions.filter(function(f){
      return !(f && f.__v292Dfix68);
    });
    P._parseExtensions.unshift(clicheProtect);
    try { console.log(TAG, 'installed at position 0, extCount=', P._parseExtensions.length); } catch(_){}
    return true;
  }

  // selfHeal: 他のフィーチャが配列を replace する可能性に備えて末尾位置を保つ
  // (今回は position 0 を維持したい)
  function selfHeal(){
    try {
      var P = getPlanner();
      if (!P || !Array.isArray(P._parseExtensions)) return;
      var arr = P._parseExtensions;
      var idx = -1;
      for (var i = 0; i < arr.length; i++){
        if (arr[i] && arr[i].__v292Dfix68){ idx = i; break; }
      }
      if (idx === -1){
        arr.unshift(clicheProtect);
      } else if (idx !== 0){
        arr.splice(idx, 1);
        arr.unshift(clicheProtect);
      }
    } catch(e){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
  setTimeout(install, 400);
  setTimeout(install, 1500);
  setTimeout(install, 4000);
  setInterval(selfHeal, 2000);

  window.__v292Dfix68ClicheActive = true;
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
