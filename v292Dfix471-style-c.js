// =====================================================================
// Chronicle TRPG - v292Dfix471: アイコンの画風を1本に固定する（案C・闇アニメ整理版）
// ---------------------------------------------------------------------
// ★2026-07-14 A/B実測（同じ外見文・同じseed・12枚）で確定した「画風がバラバラだった真因」:
//   ①**矛盾するスタイル語**: 現行のスタイル文が `anime` と `semi-realistic` を同時指定していた。
//     → 少女はアニメ、**老人は実写写真**、人外は真っ暗、と**キャラごとに別の画風**に落ちる（実測）。
//   ②**モデルとステップ数**: 本番は FLUX.1-schnell / steps 4（速いが絵が安定しない）。
//   ③**プロンプト自動拡張(prompt_upsampling)**: TogetherのFLUX.2系は既定 true。
//     モデルが光・背景・カメラを勝手に書き足す → キャラごとに画風が揺れる。
//   GPT-5.6 / Deep Research とも「絵柄はコード側で1本に固定し、LLMには外見だけ書かせる」で一致。
//
// 本fix（おしんが案Cを選択）:
//   ・スタイル文は **コード側で固定**（矛盾語なし・否定語なし＝FLUX.2はnegativeが効かないため肯定形）
//   ・モデル= **FLUX.2-dev / steps 28 / prompt_upsampling OFF**（Worker v19c の style420 で指定）
//   ・画風は必ず**プロンプト末尾**（外見文を先頭に置く＝fix461の@TAIL方式）
//   ・旧スタイル（fix338 PREFIX / fix461 @TAIL / fix470）は剥がしてから付け直す（二重前置の防止）
//
// 既定ON。OFF: localStorage v292Dfix471Off='1'（＝従来の画風・schnellへ戻る）
// スタイル差し替え: localStorage v292Dfix471Style / v292Dfix471StyleCreature
// モデル差し替え: localStorage v292Dfix471Cfg = {"model":"...","steps":28}
// 検証口: window.__v292Dfix471 = { STYLE, STYLE_CREATURE, status, preview }
// ※ 既存アイコンは変わらない。**再生成した分だけ**新しい絵柄になる（「絵柄をそろえ直す」で一括）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix471 && window.__v292Dfix471.__armed) return;
  var TAG = '[v292Dfix471:style-c]';

  // ---- 案C（闇アニメ整理版）: 矛盾語(semi-realistic/cinematic/painterly)なし・品質語の水増しなし ----
  // ★fix471b(2026-07-14・おしん報告「横を向く」「澚が男っぽい」):
  //   ①旧スタイル文にあった構図の指定(正面を向く)を、矛盾語の掃除と一緒に落としてしまった
  //     → FLUX.2は指定が無いと横顔・斜め後ろを選ぶ。**正面・顔が見えることを明示**する。
  //   ②性別は外見の英文の**冒頭にしか無い**ため、長い外見文の後半で薄まり、
  //     中性的〜男性寄りの顔になる(GPT-5.6: 年齢・性別は可視特徴に展開しないと事前分布に負ける)。
  //     → **末尾で性別を1回だけ言い直す**(元の文に明示されている場合だけ)。
  var STYLE_HUMAN =
    'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, ' +
    'cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, ' +
    'dim rim light, matte finish. ' +
    'Composition: chest-up bust portrait, the character faces the viewer in a front view or a slight three-quarter turn, ' +
    'the whole face clearly visible with both eyes visible, never a profile view and never a back view, ' +
    'the subject centered with space around, the outfit and collar visible.';
  var STYLE_CREATURE =
    'Style: dark fantasy anime illustration, hand-drawn digital painting, crisp clean linework, ' +
    'cel shading with soft gradients, muted desaturated cold palette, deep charcoal atmospheric background, ' +
    'dim rim light, matte finish. ' +
    'Subject rendering: non-human creature concept art, unsettling silhouette, no human face. ' +
    'Composition: upper body framing, the subject centered with space around.';

  var CFG_DEFAULT = { model: 'black-forest-labs/FLUX.2-dev', steps: 28, upsample: 0 };

  function off(){ try { return localStorage.getItem('v292Dfix471Off') === '1'; } catch(e){ return false; } }
  function styleHuman(){ try { return localStorage.getItem('v292Dfix471Style') || STYLE_HUMAN; } catch(e){ return STYLE_HUMAN; } }
  function styleCreature(){ try { return localStorage.getItem('v292Dfix471StyleCreature') || STYLE_CREATURE; } catch(e){ return STYLE_CREATURE; } }
  function cfg(){
    try {
      var raw = localStorage.getItem('v292Dfix471Cfg');
      if (!raw) return CFG_DEFAULT;
      var o = JSON.parse(raw);
      return {
        model: (typeof o.model === 'string' && /^black-forest-labs\/[A-Za-z0-9._-]{1,60}$/.test(o.model)) ? o.model : CFG_DEFAULT.model,
        steps: Math.min(50, Math.max(1, +o.steps || CFG_DEFAULT.steps)),
        upsample: o.upsample === 1 ? 1 : 0
      };
    } catch(e){ return CFG_DEFAULT; }
  }

  // ---- ①旧画風モジュールを止める（画風は本fixが一手に決める） ----
  //   fix338 のPREFIX配列を直接書き換える方法は無効（transformPromptの入口でapply429()が毎回上書きする）。
  //   よって fix338 自体をOFFにし、プロンプトの最終形は本fix（最外側のfetchラッパ）が作る。
  //   fix470 は既定OFF(オプトイン)だが、もしONなら止める（画風が二重に付くため）。
  var applied = false;
  function apply(){
    try {
      if (off()){
        // 本fixをOFFにしたら旧画風(fix338)を元に戻す
        try {
          if (localStorage.getItem('v292Dfix338Off') === '1' && localStorage.getItem('v292Dfix471WasOn') === '1'){
            localStorage.removeItem('v292Dfix338Off');
            localStorage.removeItem('v292Dfix471WasOn');
          }
        } catch(e){}
        return false;
      }
      if (localStorage.getItem('v292Dfix338Off') !== '1'){
        localStorage.setItem('v292Dfix338Off', '1');    // 旧画風PREFIXを止める
        localStorage.setItem('v292Dfix471WasOn', '1');  // 元に戻せるように印を残す
      }
      // fix470(前回差し戻した韓国ウェブトゥーン調)が万一ONなら止める
      try { if (localStorage.getItem('v292Dfix470On') === '1') localStorage.setItem('v292Dfix470Off', '1'); } catch(e){}
      if (!applied){ applied = true; try { console.log(TAG, '旧画風(fix338/470)を停止。画風は本fixが付与'); } catch(e){} }
      return true;
    } catch(e){ return false; }
  }
  apply();
  try { setInterval(apply, 5000); } catch(e){}

  // ---- ②既存プロンプトに残っている旧スタイル文を剥がす ----
  var OLD_TAILS = [
    // fix461 @TAIL（現行の本番スタイル）
    'Dark fantasy visual-novel illustration, semi-realistic anime rendering, textured mature facial features, individual asymmetrical face, dim cinematic lighting with soft shadows, muted desaturated cold palette, simple dark atmospheric background, chest-up bust with space around, not a close-up, highly detailed, high quality',
    'Dark fantasy creature concept art, JRPG bestiary portrait, semi-realistic rendering, dim cinematic lighting, muted desaturated palette, dark atmospheric background, upper body framing with space around, not a close-up, highly detailed, high quality',
    // fix470（差し戻した韓国ウェブトゥーン調）
    'korean webtoon anime illustration'
  ];
  function stripOld(p){
    var s = String(p || '');
    // fix429の純関数（自前PREFIX群の剥がし）を借りる
    try { if (window.__v292Dfix429 && window.__v292Dfix429.stripOwnPrefix) s = window.__v292Dfix429.stripOwnPrefix(s); } catch(e){}
    for (var i = 0; i < OLD_TAILS.length; i++){
      var t = OLD_TAILS[i];
      var at = s.indexOf(t.slice(0, 60));
      if (at >= 0) s = s.slice(0, at);                       // その語から末尾までを丸ごと落とす
    }
    // 旧fixが付けた断片・品質語の残骸
    s = s.replace(/,?\s*(highly detailed, high quality|not a close-up|simple dark atmospheric background[^,]*|chest-up bust[^,]*)/gi, '');
    return s.replace(/[\s,、。]+$/,'').trim();
  }

  // ---- ③人外か（fix463の判定器を借りる。無ければ人間として扱う＝安全側） ----
  function isCreature(p){
    try {
      var g = window.__v292Dfix463;
      if (g && g.wouldCreature && g.isHuman) return g.wouldCreature(p) && !g.isHuman(p);
    } catch(e){}
    return false;
  }

  // ---- ④最外側の fetch ラッパ（画像生成リクエストだけ書き換える） ----
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 && !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }

  // ★fix471b: 性別の言い直し。元の外見文に**明示されている語**だけを使う(推測しない)。
  function genderLine(core){
    try {
      var s = String(core || '');
      var f = s.search(/\b(girl|woman|female|lady)\b/i);
      var m = s.search(/\b(boy|man|male|gentleman)\b/i);
      if (f < 0 && m < 0) return '';                    // 性別が書かれていない → 触らない
      if (f >= 0 && (m < 0 || f <= m)) return 'The subject is clearly female, with feminine facial features. ';
      return 'The subject is clearly male, with masculine facial features. ';
    } catch(e){ return ''; }
  }

  function buildPrompt(raw){
    var core = stripOld(raw);
    var creature = isCreature(core);
    var tail = creature ? styleCreature() : styleHuman();
    if (core.indexOf(tail.slice(0, 40)) >= 0) return core;   // 冪等（既に付いている）
    var g = creature ? '' : genderLine(core);                // 人外に性別は付けない
    return core + ' ' + g + tail;
  }

  var of = window.fetch;
  var wrapped = function(url, init){
    try {
      if (!off() && isAvatarGen(url, init)){
        var b = JSON.parse(String(init.body));
        if (b && b.prompt != null){
          b.prompt = buildPrompt(b.prompt);
          var c = cfg();
          // Worker v19c: style420 は「画像生成パラメータ束」。LoRAは使わない（Togetherのサーバーレスでは原理的に不可）。
          b.style420 = { model: c.model, steps: c.steps, upsample: c.upsample };
          init = Object.assign({}, init, { body: JSON.stringify(b) });
        }
      }
    } catch(e){}
    return of.apply(this, [url, init]);
  };
  // ★fix419cの教訓: ラッパは内側の own props を全継承する（フラグの消し合い＝再ラップ地獄の防止）
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
  wrapped.__f471 = true;
  window.fetch = wrapped;

  window.__v292Dfix471 = {
    __armed: true,
    STYLE: styleHuman, STYLE_CREATURE: styleCreature, CFG: cfg,
    preview: function(p){ return buildPrompt(p || 'a Japanese girl in her late teens, long black hair'); },
    status: function(){
      var c = cfg();
      return { off: off(), applied: applied, model: c.model, steps: c.steps, upsample: c.upsample, style: styleHuman().slice(0, 50) + '…' };
    }
  };
  try { console.log(TAG, 'armed (model=' + cfg().model + ' steps=' + cfg().steps + ')'); } catch(e){}
})();
