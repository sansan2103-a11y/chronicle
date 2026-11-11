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

  /* ★CLICHE2（laneFLOW3・2026-11-11・kill: localStorage v292DfixCLICHE2Off='1' で従来どおり＝本文バイト同一・毎回評価）:
     13 種の言い回し（息を呑・目を見開いた・背筋が凍 等）を含む文を「文ごと」消していた（ここ fix68 と features.js fix27）。
     消えた文が筋の事実を運んでいた（laneFLOW1 実測 A T11「腫れた足首が宙に浮き、彼女は小さく息を呑んだ。」・Local 再現
     「時が止まったような静けさの中、湊は赤い札の鍵を差し込んだ。」）うえ、次のターンの文脈からも消えていた。
     言い回しだけを抜くと日本語が壊れる（「彼女は小さく。」）ので、消すのをやめる（文は 1 字も変えない）。言い回しの癖は
     sys の既存の指示（【描写の芯】の「型に嵌めない・固有の反応を毎回新鮮に」等）に任せる。fix27 の文ごとの削除も同じ鍵で止める。
     ★DEDUPQ1（同日・kill: localStorage v292DfixDEDUPQ1Off='1' で従来どおり）: 重複の削除（fix27 の全ターン照合・ターン内照合、
     fix71 の全ターン照合、fix72 のターン内照合）で、台詞の中の文を消さない。この段階の本文では <say who="X">…</say> の行が
     「X…」の形（括弧もタグも無い）になっていて、各 fix の「台詞か」の判定（「」や <say> の有無）をすり抜け、地の文として消えていた
     （laneFLOW1 A T12「私、ここで待ってる。」が台詞の途中から消えた型・Local で再現）。ここでは生の応答（raw）の <say> と「」『』の中身から
     台詞の集合を作り、文（先頭の話者名は除く）がその中に含まれれば台詞として扱う。同じターンで同じ台詞が続けて 2 回（壊れた連続）だけは従来どおり 1 つにする。 */
  function cliche2On(){ try { return localStorage.getItem('v292DfixCLICHE2Off') !== '1'; } catch(e){ return false; } }
  function dedupq1On(){ try { return localStorage.getItem('v292DfixDEDUPQ1Off') !== '1'; } catch(e){ return false; } }
  function q1norm(t){ return String(t == null ? '' : t).replace(/[「」『』（）()\s　…⋯。、！？!?.,<>\/="\uE000-\uE002]/g, ''); }
  var _q1cache = { raw: null, v: null };
  function q1set(raw){
    raw = String(raw || '');
    if (_q1cache.raw === raw) return _q1cache.v;
    var dl = [], who = {}, m, re = /<say\b([^>]*)>([\s\S]*?)<\/say>/g;
    while ((m = re.exec(raw))){ var w = (m[1].match(/who\s*=\s*["']([^"']{1,24})["']/) || [])[1]; if (w) who[w.trim()] = 1; var n = q1norm(m[2]); if (n) dl.push(n); }
    /* fix61 は parsePlan の前に <say who="X">…</say> を U+E000 X U+E001 … U+E002 に置き換える（拡張が見る raw と本文はこの形） */
    var re1 = /\uE000([^\uE001\uE002]{0,40})\uE001([\s\S]*?)\uE002/g;
    while ((m = re1.exec(raw))){ if (m[1] && m[1].trim()) who[m[1].trim()] = 1; var n1 = q1norm(m[2]); if (n1) dl.push(n1); }
    var re2 = /[「『]([^「『」』]{1,400})[」』]/g;
    while ((m = re2.exec(raw.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, ' ').replace(/\uE000[^\uE001\uE002]{0,40}\uE001[\s\S]*?\uE002/g, ' ')))){ var n2 = q1norm(m[1]); if (n2) dl.push(n2); }
    try { var S = (0, eval)('typeof S !== "undefined" ? S : null'); var c = S && S.cast; if (c && c.hero && c.hero.name) who[String(c.hero.name)] = 1; ((c && c.npcs) || []).forEach(function(x){ if (x && x.name) who[String(x.name)] = 1; }); } catch(e){}
    var names = Object.keys(who).map(q1norm).filter(Boolean).sort(function(a, b){ return b.length - a.length; });
    _q1cache = { raw: raw, v: { dl: dl, names: names } };
    return _q1cache.v;
  }
  function q1isDlg(text, raw){
    try {
      if (!dedupq1On()) return false;
      var st = q1set(raw); if (!st.dl.length) return false;
      var k = q1norm(text); if (!k) return false;
      for (var i = 0; i < st.names.length; i++){ if (k.indexOf(st.names[i]) === 0 && k.length > st.names[i].length){ k = k.slice(st.names[i].length); break; } }
      if (k.length < 2) return false;
      for (var j = 0; j < st.dl.length; j++){ if (st.dl[j].indexOf(k) >= 0) return true; }
      return false;
    } catch(e){ return false; }
  }
  var q1stats = { cliche2Kept: 0, dlgKept: 0 };
  window.__v292DfixCLICHE2 = { VER: 'cliche2-20261111', on: cliche2On, stats: function(){ return { kept: q1stats.cliche2Kept }; },
    noteKept: function(){ q1stats.cliche2Kept++; }, hasCliche: function(t){ return hasCliche(String(t || '')); } };
  window.__v292DfixDEDUPQ1 = { VER: 'dedupq1-20261111', on: dedupq1On, isDlg: q1isDlg, norm: q1norm, stats: function(){ return { kept: q1stats.dlgKept }; }, noteKept: function(){ q1stats.dlgKept++; } };

  function clicheProtect(plan, meta){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var changed = 0;
      var keep2 = cliche2On();   /* ★CLICHE2: 文を消さない（下の 1 字以下の行を落とす filter は従来どおり） */
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line !== 'string') return line;
        if (keep2){ if (hasCliche(line)) q1stats.cliche2Kept++; return line; }
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
