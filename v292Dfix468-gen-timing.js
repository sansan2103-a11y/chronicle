// =====================================================================
// Chronicle TRPG - v292Dfix468: 生成の所要時間を分解して計測する（🎲高速化の前段）
// ---------------------------------------------------------------------
// GPT-5.6の指摘(2026-07-13): 「30〜40秒の内訳が **キュー待ち/TTFB** なのか **出力生成**
//   なのかで、2並列化の効果は逆転する。まず計測してから設計しろ」。
//   → 本fixは**計測だけ**。挙動は一切変えない。
//
// 計測: 物語生成 / 🎲おまかせ生成 の各POSTについて
//   ・req→ヘッダ到着(TTFB) ・ヘッダ→本文完了 ・合計 ・応答文字数 ・モデル名
//   を console と localStorage(v292Dfix468Log・直近20件) に残す。
//
// 既定ON。OFF: localStorage v292Dfix468Off='1'
// 検証口: window.__v292Dfix468 = { log, clear, stats }
// =====================================================================
(function(){
  'use strict';
  if (window.__f468done) return; window.__f468done = 1;
  var TAG = '[v292Dfix468:gen-timing]';
  var KEY = 'v292Dfix468Log';

  function off(){ try { return localStorage.getItem('v292Dfix468Off') === '1'; } catch(e){ return false; } }
  function push(rec){
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      a.push(rec);
      if (a.length > 20) a = a.slice(-20);
      localStorage.setItem(KEY, JSON.stringify(a));
    } catch(e){}
  }

  function kindOf(body){
    try {
      var b = String(body || '');
      if (b.indexOf('"messages"') < 0) return '';
      // 🎲おまかせ生成は JSONモード or 生成用の合図を含む。物語ターンは <say>契約のsysを持つ。
      if (/json_object|"response_format"/.test(b)) return 'random';
      return 'turn';
    } catch(e){ return ''; }
  }

  var of = window.fetch;
  var wrapped = function(url, init){
    var kind = '';
    try {
      var u = String((url && url.url) || url || '');
      if (!off() && init && init.method === 'POST' && typeof init.body === 'string' && /workers\.dev|openrouter/.test(u)){
        kind = kindOf(init.body);
      }
    } catch(e){}
    if (!kind) return of.apply(this, [url, init]);

    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var model = '';
    try { model = String(JSON.parse(init.body).model || ''); } catch(e){}
    return of.apply(this, [url, init]).then(function(res){
      var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
      try {
        res.clone().text().then(function(txt){
          var t2 = (window.performance && performance.now) ? performance.now() : Date.now();
          var rec = { at: Date.now(), kind: kind, model: model,
                      ttfbMs: Math.round(t1 - t0), bodyMs: Math.round(t2 - t1), totalMs: Math.round(t2 - t0),
                      chars: txt.length, ok: res.ok };
          push(rec);
          try { console.log(TAG, kind, 'TTFB ' + rec.ttfbMs + 'ms / 本文 ' + rec.bodyMs + 'ms / 合計 ' + rec.totalMs + 'ms / ' + rec.chars + '字'); } catch(e){}
        }).catch(function(){});
      } catch(e){}
      return res;
    });
  };
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
  wrapped.__f468 = true;
  window.fetch = wrapped;

  window.__v292Dfix468 = {
    __armed: true,
    log: function(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } },
    clear: function(){ try { localStorage.removeItem(KEY); } catch(e){} },
    stats: function(){
      var a = this.log(), out = {};
      a.forEach(function(r){
        var k = r.kind; out[k] = out[k] || { n: 0, ttfb: 0, body: 0, total: 0 };
        out[k].n++; out[k].ttfb += r.ttfbMs; out[k].body += r.bodyMs; out[k].total += r.totalMs;
      });
      Object.keys(out).forEach(function(k){
        var o = out[k];
        out[k] = { n: o.n, avgTTFB: Math.round(o.ttfb / o.n), avgBody: Math.round(o.body / o.n), avgTotal: Math.round(o.total / o.n) };
      });
      return out;
    }
  };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
