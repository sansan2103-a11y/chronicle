// v292Dfix83 name-truncation-repair
// Hermes 4 405B はヒーロー名の先頭1文字を落とすことがある(例: ミリア -> リア)。
// 句読点/空白/行頭の直後にある truncated 名 + 助詞 のみをフルネームへ復元する。
// アリア/エリア/クリア/リアル 等は境界条件で除外。バックスラッシュ不使用(CodeMirror paste 対策)。
(function(){
  var NL = String.fromCharCode(10);
  var SP = ' ';
  var FW = String.fromCharCode(12288); // 全角スペース

  function heroFull(){
    try{
      var s = JSON.parse(localStorage.getItem('chr6'));
      var h = s && s.cast && s.cast.hero;
      if(h && typeof h === 'object') h = h.name;
      return (typeof h === 'string') ? h : null;
    }catch(e){ return null; }
  }

  // 境界(行頭/句読点/括弧/空白) + truncated名 + 助詞 だけにマッチ
  function makeRegex(){
    var full = heroFull();
    if(!full || full.length < 3) return null;       // 3文字未満は対象外
    var trunc = full.slice(1);                       // 先頭1文字を落とした形
    if(trunc.length < 2) return null;                // 2文字未満の trunc は誤爆危険
    var bset = '[。、！？「」（）' + SP + FW + NL + ']';
    var fset = '[はがをにのへともでやだ。、！？' + SP + FW + NL + ']';
    return {
      re: new RegExp('(^|' + bset + ')' + trunc + '(?=' + fset + ')', 'g'),
      full: full,
      trunc: trunc
    };
  }

  function nameRepairExt(plan, ctx){
    try{
      var g = makeRegex();
      if(!g) return plan;
      if(plan && Array.isArray(plan.narrative)){
        plan.narrative = plan.narrative.map(function(line){
          return (typeof line === 'string') ? line.replace(g.re, '$1' + g.full) : line;
        });
      }
    }catch(e){}
    return plan;
  }

  function install(){
    try{
      var P = window.Planner;
      if(!P || !Array.isArray(P._parseExtensions)) return;
      // 既存コピーを除去して末尾へ(冪等)
      P._parseExtensions = P._parseExtensions.filter(function(f){ return f.name !== 'nameRepairExt'; });
      P._parseExtensions.push(nameRepairExt);
      if(!window.__v292Dfix83Active){
        window.__v292Dfix83Active = true;
        console.log('[v292Dfix83] name-truncation-repair installed');
      }
    }catch(e){}
  }

  install();
  setInterval(install, 2000); // selfHeal: 再構築後も再登録
})();
