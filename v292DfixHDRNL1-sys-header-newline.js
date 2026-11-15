// =====================================================================
// Chronicle TRPG - v292DfixHDRNL1: 最終 sys で見出しが前の行の末尾に貼り付く改行抜けを直す（既定 ON・kill つき）
// ---------------------------------------------------------------------
// 実測（lanePRUNE3・2026-11-15・HEAD 12e5248／7d927e5 の最終送信）: fix405 の SLIM_LINE「・【各キャラの現在の状態】節を反応の前提にする。回復イベント無しに改善・平常化させない。」
//   の直後に、fix417 の見出し【反応と身体（統合・最優先）】が改行なしで続いていた（keeper の連結で改行が落ちる）。
//   見出しとして読まれず、fix417 の 5 行が【状態の出力】の続きに見える。
// やること: 送信直前（fetch 境界）に、その 1 か所に改行を 1 つ入れるだけ。文字は変えない。見つからない・2 か所以上 → 何もしない。
// kill: localStorage v292DfixHDRNL1Off='1' → 何もしない（送信バイト同一）。localStorage が読めないときも何もしない。毎回評価。
// 検証口: window.__v292DfixHDRNL1 = { VER, fixSys, stats }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixHDRNL1) return;
  var TAG = '[v292DfixHDRNL1]', VER = 'hdrnl1-20261115-a';
  var GLUED = '平常化させない。【反応と身体（統合・最優先）】', FIXED = '平常化させない。\n【反応と身体（統合・最優先）】';
  function off(){ try { return localStorage.getItem('v292DfixHDRNL1Off') === '1'; } catch(e){ return true; } }
  function cnt(h, n){ var c = 0, k = 0; while ((k = h.indexOf(n, k)) >= 0){ c++; k += n.length; } return c; }
  function fixSys(s){ return (typeof s === 'string' && s.indexOf('＜あなたの役割＞') >= 0 && cnt(s, GLUED) === 1) ? s.replace(GLUED, FIXED) : s; }
  var stats = { seen: 0, changed: 0, err: 0 };
  function fixBody(body){
    if (off() || typeof body !== 'string' || body.indexOf(GLUED) < 0) return body;
    var b = JSON.parse(body); if (!b || !b.messages) return body;
    for (var i = 0; i < b.messages.length; i++){ var m = b.messages[i];
      if (m && m.role === 'system' && typeof m.content === 'string'){ stats.seen++; var t = fixSys(m.content); if (t === m.content) return body; m.content = t; stats.changed++; return JSON.stringify(b); } }
    return body;
  }
  var of = window.fetch;
  if (typeof of === 'function'){
    var wrapped = function(u, o){
      try { if (!off() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){ var nb = fixBody(o.body); if (nb !== o.body) o = Object.assign({}, o, { body: nb }); } }
      catch(e){ stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
    wrapped.__fHDRNL1 = true; window.fetch = wrapped;
  }
  window.__v292DfixHDRNL1 = { VER: VER, fixSys: fixSys, fixBody: fixBody, stats: function(){ return stats; } };
  try { console.log(TAG, 'armed', VER); } catch(e){}
})();
