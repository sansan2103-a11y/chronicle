/* v292Dfix79 — momentum-anchor
 * 課題A(前進力)とB(無表情アンカー)のプロンプト即効対策。
 * Planner._extensions に同型関数を置き、system prompt 末尾(=recency最高)に
 * 「場面前進と反応の鮮度」ルールを追記する。fix76 土台の上に重ねる。
 * 契約: ext(ctx{sys,state}) -> 改変後の sys 文字列を返す。
 * ※ 後段の dedup 拡張が sys を再構築して追記を捨てるため、
 *   install で常に _extensions の末尾に再配置して最後に走らせる。
 */
(function(){
'use strict';
var ADD = "\n\n" + [
"【場面前進と反応の鮮度（最優先・他指示より上位）】",
"1. 物語を毎ターン前に進める。心理・内面・状態の描写は合計2文以内に収め、それ以降は必ず行動・出来事・他者の反応で進める。状態描写だけでターンを終えない。",
"2. 毎ターン最低1つ、新しい事実（場所・人物・物・時間・力関係の変化）を起こす。プレイヤーの入力が受け身または曖昧なら、NPCか環境が能動的に動いて状況を変える。",
"3. 心理は行動の燃料として使う（迷い→決断→行動の順で、すぐ行動に変える）。",
"4. キャラの平常の性格（寡黙・無表情・冷静など）は、痛み・恐怖・衝撃の強度がそれを上回る場面では適用しない。強い刺激の下では平常の仮面より、不随意の身体反応（痙攣・嘔吐・震え・声にならない音）を優先して描く。",
"5. 「無表情のまま」「痛みの色は浮かんでいない」「〜のままだ」などの定型句で段落を締めない。同じ反応の言い回しを2回以上繰り返さない。"
].join("\n");

function fix79Ext(ctx){
try{
if(ctx && typeof ctx.sys === "string" && ctx.sys.indexOf("場面前進と反応の鮮度") === -1){
ctx.sys = ctx.sys + ADD;
}
}catch(e){}
return ctx ? ctx.sys : undefined;
}
fix79Ext.__fix79 = "momentum-anchor";

function install(){
try{
var P = window.Planner;
if(!P || !Array.isArray(P._extensions)) return;
for(var i = P._extensions.length - 1; i >= 0; i--){
if(P._extensions[i] && P._extensions[i].__fix79 === "momentum-anchor"){ P._extensions.splice(i, 1); }
}
P._extensions.push(fix79Ext);
window.__v292Dfix79Active = true;
}catch(e){}
}

install();
setInterval(install, 2000);
})();
