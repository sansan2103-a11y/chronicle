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

  // ---- ①fix338 の画風PREFIXを差し替える（配列は同一参照なので要素書換で効く） ----
  var applied = false;
  function apply(){
    try {
      if (off()) return false;
      var f429 = window.__v292Dfix429;
      if (!f429 || !f429.PREFIX || !f429.PREFIX_CREATURE) return false;
      var tail = '@TAIL ' + style();
      var tailC = '@TAIL ' + STYLE_CREATURE;
      for (var i = 0; i < f429.PREFIX.length; i++){ f429.PREFIX[i] = tail; }
      for (var j = 0; j < f429.PREFIX_CREATURE.length; j++){ f429.PREFIX_CREATURE[j] = tailC; }
      if (!applied){ applied = true; try { console.log(TAG, '画風PREFIXをお手本スタイルへ差し替え'); } catch(e){} }
      return true;
    } catch(e){ return false; }
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (apply()) return; if (poll._n > 60) return; setTimeout(poll, 500); })();
  try { setInterval(apply, 5000); } catch(e){}   // fix429がライブ再適用しても奪い返す

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
        if (b && b.prompt != null && !b.style420){
          b.style420 = { path: HF_ANCHOR, no_lora: 1, steps: 28, trigger: '', model: MODEL };
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
