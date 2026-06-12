/* v292Dfix274: Planner.buildラップのフラグ継承番兵。
   真因(クラス欠陥): 各wrapは「自分の__v292D*フラグが無ければwrap」だが、後続wrapがbuildを置換すると旧フラグが失われる
   → 何かの拍子にインストーラ再実行→再wrap→既存チェーンを輪に巻き込み無限再帰(Maximum call stack、実機2026-06-12)。
   修正: buildへの代入をsetterで横取りし、置換時に旧関数の__v292D*フラグを新関数へ自動継承。
   再インストーラは「フラグあり」でスキップされ、輪が構造的に作れなくなる。OFF: v292BuildGuardOff='1' */
(function(){
  try { if (localStorage.getItem('v292BuildGuardOff') === '1') return; } catch(e){}
  if (window.__v292BuildGuard) return; window.__v292BuildGuard = 1;
  function arm(){
    var P = window.Planner;
    if (!P || typeof P.build !== 'function') { setTimeout(arm, 300); return; }
    var cur = P.build;
    try {
      Object.defineProperty(P, 'build', {
        configurable: true,
        get: function(){ return cur; },
        set: function(f){
          try {
            if (typeof f === 'function' && typeof cur === 'function' && f !== cur) {
              for (var k in cur) { if (/^__v292/.test(k) && !(k in f)) { try { f[k] = cur[k]; } catch(_){} } }
            }
          } catch(_){}
          cur = f;
        }
      });
      try { console.log('[v292Dfix274] build flag-guard armed'); } catch(e){}
    } catch(e){ try { console.warn('[v292Dfix274] arm failed', e && e.message); } catch(_){} }
  }
  arm();
})();
