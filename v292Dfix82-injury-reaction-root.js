/* v292Dfix82 — injury reaction (root override)
 * 課題B(無表情アンカー)の根底対策。キャラ個別設定を書き換えず、
 * 「重度損傷時はキャラ設定に関わらず不随意反応を必ず出す」強い土台ルールを
 * system prompt 末尾(recency最高)に注入する。全キャラ・新キャラに自動適用。
 * fix79 と同様 _extensions の末尾に再配置して dedup の後に走らせる。
 * 契約: ext(ctx{sys,state}) -> 改変後の sys 文字列を返す。
 */
(function(){
'use strict';
var NL = String.fromCharCode(10);
var ADD = NL + NL + [
"【損傷・激痛時の反応（最優先・キャラ設定より上位）】",
"1. 重度の身体損傷（切断・眼球損傷・刺突・骨折・内臓露出・火傷など）を受けたキャラは、性格・気質・口数・「感情を切り離している」等いかなる設定にも関わらず、その瞬間は神経系が意志を上回り、不随意の反応を必ず示す。",
"2. 不随意反応の例：声にならない絶叫や喉から漏れる音、全身の痙攣・のけぞり・硬直、失禁・嘔吐反射、呼吸の乱れ、瞳孔の収縮。",
"3. 重度損傷の瞬間に「無表情のまま」「声を上げなかった」「冷静に」「動じない」と書くことを禁止する。どんなに気丈なキャラでも、損傷の瞬間は仮面が外れる。",
"4. キャラの平常の性格・傷・過去は平時の傾向にすぎない。激痛・恐怖・損傷がその強度を上回る場面では平常の性格を優先しない。性格が前面に戻るのは衝撃が引いた後。",
"5. 致命傷・瀕死では逆に反応が静かになる（ショック・解離：痛みが遠のき世界が遠ざかる）。ただしこれは『気丈な無表情』ではなく、意識が落ちていく放心として描く。"
].join(NL);

function fix82Ext(ctx){
  try{
    if(ctx && typeof ctx.sys === "string" && ctx.sys.indexOf("損傷・激痛時の反応") === -1){
      ctx.sys = ctx.sys + ADD;
    }
  }catch(e){}
  return ctx ? ctx.sys : undefined;
}
fix82Ext.__fix82 = "injury-reaction-root";

function install(){
  try{
    var P = window.Planner;
    if(!P || !Array.isArray(P._extensions)) return;
    for(var i = P._extensions.length - 1; i >= 0; i--){
      if(P._extensions[i] && P._extensions[i].__fix82 === "injury-reaction-root"){ P._extensions.splice(i, 1); }
    }
    P._extensions.push(fix82Ext);
    window.__v292Dfix82Active = true;
  }catch(e){}
}
install();
setInterval(install, 2000);
try{ if(window.console && console.log) console.log("[v292Dfix82] injury-reaction-root installed (tail)"); }catch(e){}
})();
