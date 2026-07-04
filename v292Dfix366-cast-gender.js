/* v292Dfix366-cast-gender.js
 * 目的: S.cast[].gender がテキスト生成sysに一切渡っていない真因の修正。
 *       （fix359はアイコン経路のみ。本文経路は本fixで対応）
 * 方式: Planner._extensions で sys末尾に【キャラ属性】ブロックを毎ターン注入。
 * OFF: localStorage v292Dfix366Off = '1'
 * 注意: fix363と同様、一度ONでsysに乗った後のOFFはリロード後に有効。
 */
(function(){
  if (window.__f366done) return; window.__f366done = 1; /* 冪等ガードは非__v292名(fix274教訓) */
  function inject(){
    try {
      var P = (0,eval)('Planner');
      if (!P || !Array.isArray(P._extensions)) return false;
      P._extensions.push(function(ctx){
        try {
          if (localStorage.getItem('v292Dfix366Off') === '1') return ctx.sys;
          if (!ctx || typeof ctx.sys !== 'string') return ctx && ctx.sys;
          if (ctx.sys.indexOf('【キャラ属性】') >= 0) return ctx.sys; /* マーカー冪等 */
          var S = (0,eval)('S');
          var parts = [];
          var h = S && S.cast && S.cast.hero;
          if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
          ((S && S.cast && S.cast.npcs) || []).forEach(function(n){
            if (n && n.name && n.gender) parts.push(n.name + '=' + n.gender);
          });
          if (!parts.length) return ctx.sys;
          return ctx.sys + '\n【キャラ属性】' + parts.join('、') +
            '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。';
        } catch(e) { return ctx.sys; }
      });
      return true;
    } catch(e) { return false; }
  }
  if (!inject()) {
    var iv = setInterval(function(){ if (inject()) clearInterval(iv); }, 1000);
    setTimeout(function(){ clearInterval(iv); }, 30000);
  }
})();
