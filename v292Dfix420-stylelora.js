// =====================================================================
// Chronicle TRPG - v292Dfix420: アイコン画風統一(スタイルLoRA・プレビュー)
// ---------------------------------------------------------------------
// 背景(2026-07-11 DR2+裏取り): schnellはプロンプトPREFIXだけでは絵柄が
//   ばらつく(蒸留4stepの限界)。Together AIはFLUX.1-dev-lora+image_lorasを
//   公式サポート→全キャラに同一スタイルLoRAを共通適用すれば絵柄が揃う。
//   Worker v18(lora420)がbody.style420={path,scale,steps,trigger}を受けて
//   モデル切替+LoRA適用+trigger前置を行う(本番実証済み・A/B画像で品質向上確認)。
//
// 本fix: アイコン生成リクエスト(/image系)のbodyに style420 を注入するだけ。
//   ★fix473で **既定OFF**。ONにする = v292Dfix420OnV2='1'（旧 v292Dfix420On は無効・再利用しない）
//   LoRA差し替え= v292Dfix420Cfg にJSON {path,scale,steps,trigger}
//   (Worker側はhuggingface.co/civitai.com/replicate.comのみ許可)
//
// コスト注意: LoRA経路は$0.035/枚(schnellの約50倍・ただしアイコンは
//   キャラ毎1回生成+キャッシュなので実負担小)。台帳はWorker側で別単価記帳。
// 冪等: window.__v292Dfix420 / ラップmarker _f420w
// ロールバック: scriptタグ削除 or v292Dfix420Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix420) return;
  window.__v292Dfix420 = true;
  var TAG = '[v292Dfix420:stylelora]';

  var DEFAULT_CFG = {
    path: 'https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors',
    scale: 0.8,
    steps: 28,
    trigger: 'anime'
  };

  function on(){
    // ★fix473(2026-07-14・おしん指示 / Codex監査): **既定OFF**へ戻す。
    //   理由: TogetherのサーバーレスではLoRA(image_loras)が使えず、本fixがLoRAを付けると
    //   Togetherが400 → Workerが黙って別プロバイダへフォールバックしていた（＝効いていないのに絵は出る）。
    //   ⚠️ 旧キー `v292Dfix420On` は **再利用しない**（=1 が残っている端末があるため）。
    //      新しい versioned opt-in key: `v292Dfix420OnV2`='1' のときだけ有効。
    try {
      if (localStorage.getItem('v292Dfix420Off') === '1') return false;
      return localStorage.getItem('v292Dfix420OnV2') === '1';
    } catch(e){ return false; }
  }
  function cfg(){
    try {
      var raw = localStorage.getItem('v292Dfix420Cfg');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o.path === 'string') {
          return { path: o.path, scale: +o.scale || DEFAULT_CFG.scale, steps: +o.steps || DEFAULT_CFG.steps, trigger: (o.trigger != null ? String(o.trigger) : DEFAULT_CFG.trigger) };
        }
      }
    } catch(e){}
    return DEFAULT_CFG;
  }
  function isImageUrl(u){
    var s = String(u || '');
    return s.indexOf('gen.pollinations.ai/v1/images/generations') !== -1 ||
           (/workers\.dev/.test(s) && s.indexOf('/image') !== -1);
  }

  if (window.fetch && !window.fetch._f420w) {
    var of = window.fetch;
    var w = function(url, opts){
      try {
        if (on() && opts && opts.body && typeof opts.body === 'string' &&
            String(opts.method || '').toUpperCase() === 'POST' && isImageUrl(url)) {
          var b = JSON.parse(opts.body);
          if (b && b.prompt != null && !b.style420) {
            b.style420 = cfg();
            opts = Object.assign({}, opts, { body: JSON.stringify(b) });
            try { console.log(TAG, 'style420 injected'); } catch(e){}
          }
        }
      } catch(e){}
      return of.apply(this, arguments.length > 1 || opts ? [url, opts] : [url]);
    };
    // fix419c教訓: ラップは内側関数の全own propsを継承する
    try { Object.keys(of).forEach(function(k){ w[k] = of[k]; }); } catch(e){}
    w._f420w = true;
    window.fetch = w;
  }
  try { console.log(TAG, 'loaded', on() ? '(ON)' : '(OFF・v292Dfix420OnV2=1で有効。旧v292Dfix420Onは無効)'); } catch(e){}
})();
