// v292Dfix85 reaction-spectrum
// 反応を「刺激の強度 x 種類」のスペクトルに拡張(fix82の損傷根底ルールの上に積む)。
// 微弱→致命の段階、損傷以外(恐怖/寒さ/興奮等)にも身体反応を強制。
// fix82/fix79 と同じ _extensions 末尾再配置 + selfHeal。改行は String.fromCharCode(10)。
(function(){
  var NL = String.fromCharCode(10);
  var MARKER = '反応の強度スケール';
  var LINES = [
    '',
    '【反応の強度スケール（毎回バリエーションを変える）】',
    '1. 刺激の強度に応じて反応の深さを変える。同じ反応語を2回以上繰り返さない。',
    '2. 微弱（接触・寒さ・かすかな痛み・気配）: 息を呑む / 肩の強張り / 視線の揺れ / 短い吐息 のいずれか。',
    '3. 中（殴打・浅い切創・強い恐怖・嫌悪）: 呻き / くぐもった声 / 身じろぎ / 呼吸の乱れ / 喉の上下 のいずれか。',
    '4. 強（骨折・刺突・眼球・火傷など）: 絶叫 / 痙攣 / のけぞり / 嘔吐反射 / 失禁（損傷時の根底ルールに従う）。',
    '5. 致命傷・瀕死: 反応は逆に静かになる（解離・放心。気丈な無表情ではなく、意識が遠のいていく描写）。',
    '6. 損傷以外の刺激（驚き・嫌悪・興奮・疲労・寒さ・快）にも、身体反応を必ず1つ添える。',
    '7. 反応は「声 / 身体の動き / 自律神経（呼吸・瞳孔・震え・発汗）」のうち最低2系統を、毎回違う組み合わせで描く。'
  ];

  function reactionSpectrumExt(ctx){
    try{
      var sys = (ctx && typeof ctx.sys === 'string') ? ctx.sys : '';
      if(sys.indexOf(MARKER) >= 0) return sys; // 二重追記しない
      return sys + NL + LINES.join(NL);
    }catch(e){ return (ctx && ctx.sys) || ''; }
  }

  function install(){
    try{
      var P = window.Planner;
      if(!P || !Array.isArray(P._extensions)) return;
      // 既存コピー除去 -> 末尾へ(fix74 dedup の後に効かせる)
      P._extensions = P._extensions.filter(function(f){ return f.name !== 'reactionSpectrumExt'; });
      P._extensions.push(reactionSpectrumExt);
      if(!window.__v292Dfix85Active){
        window.__v292Dfix85Active = true;
        try{ console.log('[v292Dfix85] reaction-spectrum installed'); }catch(e){}
      }
    }catch(e){}
  }

  install();
  setInterval(install, 2000);
})();
