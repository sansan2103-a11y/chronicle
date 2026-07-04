/* v292Dfix366-cast-gender.js (v3 Planner.buildラップ方式)
 * 目的: S.cast[].gender がテキスト生成sysに渡っていない真因の修正（fix359の本文経路版）。
 * 経緯: v1(_extensions返り値)/v2(_extensions mutation)は実sysに乗らず(Network傍受で確認)。
 *       _extensionsは現行エンジンでは消費されない。fix363と同じbuild直ラップが正解(実sysで検証済み)。
 * OFF: localStorage v292Dfix366Off = '1'（リロード後有効）
 */
(function(){
  if (window.__f366done) return; window.__f366done = 1;
  function hook(){
    try {
      var P = (0,eval)('Planner');
      if (!P || typeof P.build !== 'function') return false;
      var ob = P.build;
      P.build = function(){
        var r = ob.apply(this, arguments);
        try {
          if (localStorage.getItem('v292Dfix366Off') === '1') return r;
          if (!r || typeof r.sys !== 'string') return r;
          if (r.sys.indexOf('【キャラ属性】') >= 0) return r;
          var S = (0,eval)('S');
          var parts = [];
          var h = S && S.cast && S.cast.hero;
          if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
          ((S && S.cast && S.cast.npcs) || []).forEach(function(n){
            if (n && n.name && n.gender) parts.push(n.name + '=' + n.gender);
          });
          if (!parts.length) return r;
          r.sys += '\n【キャラ属性】' + parts.join('、') +
            '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。';
        } catch(e) {}
        return r;
      };
      return true;
    } catch(e) { return false; }
  }
  if (!hook()) {
    var iv = setInterval(function(){ if (hook()) clearInterval(iv); }, 1000);
    setTimeout(function(){ clearInterval(iv); }, 30000);
  }
})();
