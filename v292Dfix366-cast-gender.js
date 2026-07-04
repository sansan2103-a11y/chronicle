/* v292Dfix366-cast-gender.js (v2 mutation方式)
 * 目的: S.cast[].gender がテキスト生成sysに渡っていない真因の修正（fix359の本文経路版）。
 * 方式: Planner._extensions + ctx.sys 直接書換（fix361と同方式。返り値だけでは反映されない）。
 * OFF: localStorage v292Dfix366Off = '1'（リロード後有効）
 */
(function(){
  if (window.__f366done) return; window.__f366done = 1;
  function inject(){
    try {
      var P = (0,eval)('Planner');
      if (!P || !Array.isArray(P._extensions)) return false;
      P._extensions.push(function(ctx){
        try {
          if (localStorage.getItem('v292Dfix366Off') === '1') return ctx && ctx.sys;
          if (!ctx || typeof ctx.sys !== 'string') return ctx && ctx.sys;
          if (ctx.sys.indexOf('【キャラ属性】') >= 0) return ctx.sys;
          var S = (0,eval)('S');
          var parts = [];
          var h = S && S.cast && S.cast.hero;
          if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
          ((S && S.cast && S.cast.npcs) || []).forEach(function(n){
            if (n && n.name && n.gender) parts.push(n.name + '=' + n.gender);
          });
          if (!parts.length) return ctx.sys;
          ctx.sys += '\n【キャラ属性】' + parts.join('、') +
            '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。';
          return ctx.sys;
        } catch(e) { return ctx && ctx.sys; }
      });
      return true;
    } catch(e) { return false; }
  }
  if (!inject()) {
    var iv = setInterval(function(){ if (inject()) clearInterval(iv); }, 1000);
    setTimeout(function(){ clearInterval(iv); }, 30000);
  }
})();
