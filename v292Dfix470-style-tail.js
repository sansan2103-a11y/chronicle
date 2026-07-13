// =====================================================================
// Chronicle TRPG - v292Dfix470: 画風統一（お手本の絵柄をプロンプトで固定する）
// ---------------------------------------------------------------------
// 経緯(2026-07-13・すべて実測):
//   ①fix420のスタイルLoRAは**原理的に不可能**だった。Togetherのサーバーレスでは
//     LoRA対応モデル(FLUX.1-dev-lora)が「専用エンドポイント必須」で400、
//     schnell/FLUX.2-dev は「image_loras is not supported」。Workerは失敗を黙って
//     フォールバックしていたため「効いているように見えて何も効いていない」状態だった。
//   ②FLUX.2-dev の reference_images（お手本画像）も**絵柄が動かない**（実測: 参照あり/なしがほぼ同一）。
//   ③**英語のスタイル文をプロンプト末尾に付ける方式は効く**（実測: 老人・少女・少年が同じ絵柄で統一）。
//
// 本fix:
//   ・fix338 の画風PREFIX（現在の画風インデックス）を「@TAIL + お手本スタイル文」に差し替える
//     （@TAIL = 外見を先、スタイルを末尾に置く既存機構）
//   ・画像生成モデルを **FLUX.2-dev / steps 28** に固定する（style420を外側で先に設定）
//   ・おしんのお手本2枚（半写実の韓国ウェブトゥーン調・柔らかい塗り・淡いグレー背景）を言語化
//
// 既定ON。OFF: localStorage v292Dfix470Off='1'（＝従来の闇アニメ画風に戻る）
// スタイル文の差し替え: localStorage v292Dfix470Style（文字列）
// 検証口: window.__v292Dfix470 = { STYLE, apply, status }
// ※ 既存アイコンは変わらない。**再生成した分だけ**新しい絵柄になる（「絵柄をそろえ直す」で一括）。
// =====================================================================
(function(){
  'use strict';
  if (window.__f470done) return; window.__f470done = 1;
  var TAG = '[v292Dfix470:style-tail]';

  var STYLE_DEFAULT = 'soft semi-realistic korean webtoon illustration, smooth airbrushed shading, delicate thin linework, muted desaturated palette, pale light grey background, gentle rim light, subtle blush on cheeks, glossy dark eyes, matte finish, clean anime-realism hybrid';
  var STYLE_CREATURE = 'soft semi-realistic korean webtoon illustration, smooth airbrushed shading, delicate thin linework, muted desaturated palette, pale light grey background, eerie non-human creature concept art, no human face, unsettling silhouette, matte finish';
  var MODEL = 'black-forest-labs/FLUX.2-dev';
  var HF_ANCHOR = 'https://huggingface.co/black-forest-labs/FLUX.2-dev';   // Worker側のモデル指定を通すための鍵(LoRAは使わない)

  function off(){ try { return localStorage.getItem('v292Dfix470Off') === '1'; } catch(e){ return false; } }
  function style(){ try { return localStorage.getItem('v292Dfix470Style') || STYLE_DEFAULT; } catch(e){ return STYLE_DEFAULT; } }

  // ---- ①fix338(旧・闇アニメ画風)を止めて、画風は本fixが一手に決める ----
  //   ※fix338のPREFIX配列を書き換える方法は不可（transformPromptの入口でapply429()が毎回上書きするため実測で無効）。
  //     よって fix338 自体をOFFにし、プロンプトの最終形は本fix（最外側のfetchラッパ）が作る。
  var applied = false;
  function apply(){
    try {
      if (off()){
        // 本fixをOFFにしたら、旧画風(fix338)を元に戻す
        try { if (localStorage.getItem('v292Dfix338Off') === '1' && localStorage.getItem('v292Dfix470WasOn') === '1'){ localStorage.removeItem('v292Dfix338Off'); localStorage.removeItem('v292Dfix470WasOn'); } } catch(e){}
        return false;
      }
      if (localStorage.getItem('v292Dfix338Off') !== '1'){
        localStorage.setItem('v292Dfix338Off', '1');      // 旧画風PREFIXを止める
        localStorage.setItem('v292Dfix470WasOn', '1');    // 元に戻せるように印を残す
      }
      if (!applied){ applied = true; try { console.log(TAG, '旧画風(fix338)を停止。画風は本fixが付与'); } catch(e){} }
      return true;
    } catch(e){ return false; }
  }
  apply();
  try { setInterval(apply, 5000); } catch(e){}

  // 既存プロンプトに残っている旧スタイル文を剥がす（fix429の純関数を借りる）
  function stripOld(p){
    var s = String(p || '');
    try { if (window.__v292Dfix429 && window.__v292Dfix429.stripOwnPrefix) s = window.__v292Dfix429.stripOwnPrefix(s); } catch(e){}
    // 旧@TAILスタイル(末尾)の除去: 我々が過去に付けた文言・旧スタイル語
    s = s.replace(/,?\s*(dark anime[^,]*|highly detailed, high quality|simple dark atmospheric background[^,]*|chest-up bust[^,]*|not a close-up)/gi, '');
    return s.replace(/[\s,、]+$/,'').trim();
  }

  // 人外か（fix463の判定器を借りる）
  function isCreature(p){
    try {
      var g = window.__v292Dfix463;
      if (g && g.wouldCreature && g.isHuman) return g.wouldCreature(p) && !g.isHuman(p);
    } catch(e){}
    return false;
  }

  // ---- ②モデル/ステップを固定（style420を先に置く。fix420は既にあれば触らない） ----
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 && !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }
  var of = window.fetch;
  var wrapped = function(url, init){
    try {
      if (!off() && isAvatarGen(url, init)){
        var b = JSON.parse(String(init.body));
        if (b && b.prompt != null){
          var core = stripOld(b.prompt);
          var tail = isCreature(core) ? STYLE_CREATURE : style();
          if (core.indexOf(tail.slice(0, 30)) < 0) b.prompt = core + ', ' + tail;     // 画風は必ず末尾（@TAIL方式）
          if (!b.style420) b.style420 = { path: HF_ANCHOR, no_lora: 1, steps: 28, trigger: '', model: MODEL };
          init = Object.assign({}, init, { body: JSON.stringify(b) });
        }
      }
    } catch(e){}
    return of.apply(this, [url, init]);
  };
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
  wrapped.__f470 = true;
  window.fetch = wrapped;

  window.__v292Dfix470 = {
    __armed: true, STYLE: style, MODEL: MODEL, apply: apply,
    status: function(){ return { off: off(), applied: applied, style: style().slice(0, 40) + '…' }; }
  };
  try { console.log(TAG, 'armed (model=' + MODEL + ')'); } catch(e){}
})();
