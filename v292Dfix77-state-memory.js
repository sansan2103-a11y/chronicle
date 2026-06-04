// Chronicle TRPG - v292Dfix77: 状態の記憶（state memory）
// 目的: fix76 の土台(からだ/こころ/本能)を「ターンを跨いで覚える」層。モデルに各キャラの
//   現在状態を <state> タグで吐かせ、解析して保存し、次ターンの system に再投入する。
//   これで前ターンの傷・恐怖・喪失が次ターンも効き続ける（=淡々リセットの解消）。
// 設計（おしんと合意）:
//   ・モデルは本文末に、状態が動いたキャラだけ次形式で出力:
//       <state who="名前" からだ="…" こころ="…" 本能="…"/>
//   ・3軸は自由記述（眼球貫通・腸が出る等の固有の傷もそのまま保持できる）
//   ・解析して store に保存（localStorage 永続）、表示からは必ず剥がす
//   ・次ターン: 保存済み状態を system に「各キャラの現在の状態」として注入
// 実装の要点（実機検証済み）:
//   ・parsePlan(rawString) は <state> を plan.narrative(配列) にそのまま通す＝parseExtension で
//     拾える。core は剥がさないので、ここで剥がさないと表示に漏れる→必ず strip する。
//   ・emit 指示と現在状態の注入は _extensions(system)。capture+strip は _parseExtensions。
// 互換: 純追加。<state> は fix77 が必ず strip するので表示漏れ無し。
// flag: window.__v292Dfix77Active
(function v292Dfix77(){
  'use strict';
  if (window.__v292Dfix77Active) return;
  window.__v292Dfix77Active = true;
  var TAG = '[v292Dfix77:state-memory]';
  var LSKEY = 'v292Dfix77States';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  // ---- store（キャラ名 -> {karada,kokoro,honno,turn}）localStorage 永続 ----
  var store = (function(){ try { return JSON.parse(localStorage.getItem(LSKEY)||'{}') || {}; } catch(e){ return {}; } })();
  function persist(){ try { localStorage.setItem(LSKEY, JSON.stringify(store)); } catch(e){} }
  window.__v292Dfix77Store = store;

  function attr(tag, name){
    var m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
    return m ? m[1].trim() : '';
  }

  // ---- (capture+strip) parseExtension: narrative 中の <state> を拾って保存、本文から除去 ----
  function captureState(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var re = /<state\b[^>]*?\/?>/g;
      var found = 0, m;
      // v292Dfix203: 読み元を ctx.raw（生テキスト）に変更。reactionVoiceExt(fix157①・
      //   _parseExtensions#3)が<react>処理時に<state>行ごとnarrativeから除去するため、
      //   narrative読みでは3軸(からだ/こころ/本能)が一度も保存されなかった
      //   （実測: 全キャラ3軸空・<react>共存rawで再現・拡張二分探索で犯人確定）。
      //   fix190(傷/関係/未解決)と同方式のraw読みなら上流の除去に影響されない。
      var src = (ctx && typeof ctx.raw === 'string' && ctx.raw) ? ctx.raw : plan.narrative.join('\n');
      re.lastIndex = 0;
      while ((m = re.exec(src)) !== null){
        var tag = m[0];
        var who = attr(tag,'who');
        if (who){
          var cur = store[who] || {};
          var ka = attr(tag,'からだ'), ko = attr(tag,'こころ'), ho = attr(tag,'本能');
          if (ka) cur.karada = ka;
          if (ko) cur.kokoro = ko;
          if (ho) cur.honno = ho;
          cur.turn = (function(){ try{ var S=(0,eval)('typeof S!=="undefined"?S:null'); return (S&&S.turns)?S.turns.length:0; }catch(e){ return 0; } })();
          store[who] = cur;
          found++;
        }
      }
      // narrativeからの<state>除去は安全網として従来通り（表示漏れ防止）
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line !== 'string') return line;
        return line.replace(re, '').trim();
      }).filter(function(l){ return l && String(l).trim().length > 0; });
      if (found > 0){ persist(); try { console.log(TAG,'captured',found,'state(s) [raw]'); } catch(_){} }
    } catch(e){ try { console.warn(TAG,'capture err:', e && e.message); } catch(_){} }
    return plan;
  }
  captureState.__v292Dfix77 = true;

  // ---- (emit + feedback) system 追記 ----
  var EMIT =
    '\n\n【状態の出力（fix77・必須）】\n' +
    '本文の最後に、今ターンで状態が動いたキャラだけ次形式で1行ずつ出力する（変化が無いキャラは省略可）:\n' +
    '<state who="名前" からだ="…" こころ="…" 本能="…"/>\n' +
    '・who は cast の名前。3軸は今この瞬間の状態を簡潔な自由記述で。\n' +
    '・このタグは本文（地の文・セリフ）には絶対に含めない。必ず本文の後に独立して置く。';

  function buildStatesBlock(){
    var names = Object.keys(store);
    if (!names.length) return '';
    var lines = [];
    names.forEach(function(n){
      var s = store[n]; if (!s) return;
      var parts = [];
      if (s.karada) parts.push('からだ:'+s.karada);
      if (s.kokoro) parts.push('こころ:'+s.kokoro);
      if (s.honno)  parts.push('本能:'+s.honno);
      if (parts.length) lines.push(n + '｜' + parts.join('／'));
    });
    if (!lines.length) return '';
    return '\n\n【各キャラの現在の状態（前ターンからの継続・必ず踏まえる）】\n' +
      lines.join('\n') +
      '\n・この状態を反応の前提にする。回復イベント無しに改善・平常化させない。';
  }

  function stateExt(ctx){
    try { if (ctx && typeof ctx.sys === 'string') return ctx.sys + EMIT + buildStatesBlock(); } catch(e){}
    return ctx && ctx.sys;
  }
  stateExt.__v292Dfix77 = true;

  // ---- install + selfHeal ----
  function install(){
    var P = getPlanner();
    if (!P){ setTimeout(install, 200); return false; }
    P._extensions = P._extensions || [];
    P._parseExtensions = P._parseExtensions || [];
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix77; })) P._extensions.push(stateExt);
    if (!P._parseExtensions.some(function(f){ return f && f.__v292Dfix77; })) P._parseExtensions.push(captureState);
    try { console.log(TAG,'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions) || !Array.isArray(P._parseExtensions)) return;
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix77; })) P._extensions.push(stateExt);
    if (!P._parseExtensions.some(function(f){ return f && f.__v292Dfix77; })) P._parseExtensions.push(captureState);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  setTimeout(install, 400); setTimeout(install, 1500); setTimeout(install, 4000);
  setInterval(selfHeal, 2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
