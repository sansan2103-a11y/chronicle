/* ============================================================================
 * v292Dfix237: アバター運搬URLの整合ガード(別キャラ同一アイコンの根治)
 *
 * 実測(2026-06-07): カリナ(従来)とリナ(従来)のキャッシュがバイト同一。シードは
 *   非衝突(373771 vs 400672)・descも別 → 生成時にfix197が「altは新キャラ、srcは
 *   別キャラの運搬URL」のimg(使い回し)からprompt+seedを捕捉した=fix199cが会話ログ側で
 *   潰した「img使い回しのalt/中身ズレ」クラスの、設定/一覧パネル側での再発。
 *   アリアのアニメ/従来同一も同根(画風切替時に旧suffixの運搬URLを掴んだ)。
 *
 * 対策: 運搬URL(image.pollinations.ai/prompt/...)を持つimgを巡回し、
 *   seedOf(src) が alt名の期待値 {hash31(name), hash31(name)%1e6} のどちらでもなければ
 *   「ズレた運搬」と断定し、そのキャラ自身のdesc+現画風で正規の運搬URLに書き直す。
 *   fix197のMutationObserverはその後の正しいsrcからjobInfoを捕捉する。
 *   (legacy URLはfix197/199により実フェッチされない=402リスクなし。運搬専用。)
 * OFF: localStorage v292AvCarrierGuardOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix237]';
  try { if (localStorage.getItem('v292AvCarrierGuardOff') === '1') return; } catch(e){}
  if (window.__v292Dfix237) return; window.__v292Dfix237 = 1;

  var STYLE_SUFFIX = {
    anime: ', high quality anime art style, clean detailed anime illustration, vibrant',
    realistic: ', realistic digital painting, cinematic lighting, highly detailed',
    watercolor: ', soft watercolor illustration, delicate brushwork, artistic',
    darkfantasy: ', dark fantasy anime portrait, detailed face, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality'
  };
  var STYLE_LIST = ['anime', 'realistic', 'watercolor', 'darkfantasy'];

  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function hash31(s){ var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function seedOf(src){ var m = /[?&]seed=(\d+)/.exec(String(src || '')); return m ? +m[1] : null; }
  /* v292Dfix237b: 運搬整合はアバター(正方形384)だけが対象。SEE(fix315)等の非正方形
     画像(例 768x512)は別機能の絵なので絶対に書き換えない。fix197と同じ判定。 */
  function isSquareCarrier(src){ var m=/[?&]width=(\d+)&height=(\d+)/.exec(String(src||'')); if(!m) return true; return m[1]===m[2]; }
  function styleSuffix(){ try { var S = getS(); var i = (S && S.cfg && S.cfg.artStyle != null) ? (+S.cfg.artStyle) : 3; return STYLE_SUFFIX[STYLE_LIST[i] || 'darkfantasy']; } catch(e){ return STYLE_SUFFIX.darkfantasy; } }
  function descFor(name){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      if (S.cast.hero && S.cast.hero.name === name) return String(S.cast.hero.desc || '');
      var hit = (S.cast.npcs || []).filter(function(n){ return n && n.name === name; })[0];
      return hit ? String(hit.desc || '') : '';
    } catch(e){ return ''; }
  }
  function authoritativeUrl(name){
    var d = descFor(name).replace(/^性別:\s*[男女][性]?[。、]?/, '').replace(/\s+/g, ' ').slice(0, 60);
    var prompt = 'portrait of a character, ' + (d ? d + ', ' : '') + 'detailed face' + styleSuffix();
    var seed = hash31(name); /* features.js getAvatar系(フル31bit)の慣習に合わせる */
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function sweep(){
    try {
      var imgs = document.querySelectorAll('img[src*="image.pollinations.ai/prompt"]');
      for (var i = 0; i < imgs.length; i++){
        var img = imgs[i];
        var name = String(img.alt || '').trim();
        if (!name) continue;
        var s = seedOf(img.src);
        if (s == null) continue;
        if (!isSquareCarrier(img.src)) continue; /* v292Dfix237b: 非正方形(SEE等)は対象外 */
        var h = hash31(name);
        if (s === h || s === (h % 1000000)) continue; /* 正しい運搬 */
        /* ズレた運搬: 別キャラのprompt+seedを背負っている → 本人の正規URLへ書き直し */
        try {
          img.src = authoritativeUrl(name);
          console.log(TAG, 'carrier mismatch corrected for', name, '(seed', s, '->', h + ')');
        } catch(e){}
      }
    } catch(e){}
  }
  try { setInterval(sweep, 1500); } catch(e){}
  setTimeout(sweep, 800);
  window.__v292Dfix237Sweep = sweep;
  try { console.log(TAG, 'avatar carrier guard armed'); } catch(e){}
})();
