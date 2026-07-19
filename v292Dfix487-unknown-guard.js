// =====================================================================
// Chronicle TRPG - v292Dfix487: 未識別・汎用ラベルのアイコンをシルエット化（Phase1）
// ---------------------------------------------------------------------
// 背景(2026-07-17 実データ診断・GPT設計/意匠レビュー):
//   若い男のセリフが未識別のまま who="???" に帰属 → アイコン生成器が「???という
//   実体の外見」を曖昧文脈＋ホラートーンで創作 → 骸骨。「???」「異形」「人影」等の
//   汎用ラベルは名前単位キャッシュ(chrAiAv4 / v292av2_+keyFor)で全スロット共有 →
//   どの物語でも同じ怪物画像を使い回す構造的な穴。
// 意匠(GPT: 手描きSVGは安っぽい→画風6で生成した固定シルエット4種をハッシュ割当):
//   画風6の「顔なし逆光バスト」4枚(Pollinations/Flux・おしん承認)を、端末で1回だけ
//   取得してdataURLでキャッシュ(=生成揺れ無し・以後オフライン)。名前ハッシュで安定割当。
//   取得失敗時はURL直参照→最終はSVGフォールバック。汎用/仮ラベルは【生成させず】これを出す。
//   本物の人外(具体名のある怪物)や登録キャラは一切不触。
// opt-in : localStorage v292Dfix487OnV1='1'（既定OFF・おしんPCのみON）
// OFF    : v292Dfix487IconOff='1'（アイコン遮断だけ止める）
// 検証口 : window.__v292Dfix487.{isGeneric,silhouetteFor,silIndex,sweep,isolateCaches,warmSilCache}
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix487boot) return; window.__v292Dfix487boot = 1;
  var TAG = '[v292Dfix487:unknown-guard]';
  try { console.log(TAG, 'boot v487b'); } catch(e){}
  function on(){ try { return localStorage.getItem('v292Dfix487OnV1') === '1'; } catch(e){ return false; } }
  function iconOff(){ try { return localStorage.getItem('v292Dfix487IconOff') === '1'; } catch(e){ return false; } }
  function active(){ return on() && !iconOff(); }

  // ---- 画風6で生成した「顔なし逆光バスト」4種（おしん承認・2026-07-17）----
  var SILH_URLS = [
    "https://image.pollinations.ai/prompt/backlit%20silhouette%20of%20a%20person%20seen%20from%20chest%20up%2C%20face%20completely%20hidden%20in%20deep%20shadow%2C%20featureless%20faceless%20dark%20figure%2C%20only%20the%20rim-lit%20outline%20of%20head%20shoulders%20and%20hair%20visible%2C%20no%20facial%20features%2C%20no%20eyes%2C%20plain%20empty%20dark%20background%2C%20short%20hair%2C%20slim%20build%2C%20dark%20fantasy%20anime%20character%20portrait%2C%20head%20and%20shoulders%2C%20dim%20moody%20backlight%2C%20muted%20desaturated%20colors%2C%20dark%20shadowy%20background%2C%20somber%20gothic%20horror%20atmosphere%2C%20high%20quality?width=512&height=512&model=flux&nologo=true&seed=333",
    "https://image.pollinations.ai/prompt/backlit%20silhouette%20of%20a%20person%20seen%20from%20chest%20up%2C%20face%20completely%20hidden%20in%20deep%20shadow%2C%20featureless%20faceless%20dark%20figure%2C%20only%20the%20rim-lit%20outline%20of%20head%20shoulders%20and%20hair%20visible%2C%20no%20facial%20features%2C%20no%20eyes%2C%20plain%20empty%20dark%20background%2C%20long%20flowing%20hair%2C%20slender%2C%20dark%20fantasy%20anime%20character%20portrait%2C%20head%20and%20shoulders%2C%20dim%20moody%20backlight%2C%20muted%20desaturated%20colors%2C%20dark%20shadowy%20background%2C%20somber%20gothic%20horror%20atmosphere%2C%20high%20quality?width=512&height=512&model=flux&nologo=true&seed=77",
    "https://image.pollinations.ai/prompt/backlit%20silhouette%20of%20a%20person%20seen%20from%20chest%20up%2C%20face%20completely%20hidden%20in%20deep%20shadow%2C%20featureless%20faceless%20dark%20figure%2C%20only%20the%20rim-lit%20outline%20of%20head%20shoulders%20and%20hair%20visible%2C%20no%20facial%20features%2C%20no%20eyes%2C%20plain%20empty%20dark%20background%2C%20medium%20tousled%20hair%2C%20average%20build%2C%20coat%20collar%2C%20dark%20fantasy%20anime%20character%20portrait%2C%20head%20and%20shoulders%2C%20dim%20moody%20backlight%2C%20muted%20desaturated%20colors%2C%20dark%20shadowy%20background%2C%20somber%20gothic%20horror%20atmosphere%2C%20high%20quality?width=512&height=512&model=flux&nologo=true&seed=123",
    "https://image.pollinations.ai/prompt/backlit%20silhouette%20of%20a%20person%20seen%20from%20chest%20up%2C%20face%20completely%20hidden%20in%20deep%20shadow%2C%20featureless%20faceless%20dark%20figure%2C%20only%20the%20rim-lit%20outline%20of%20head%20shoulders%20and%20hair%20visible%2C%20no%20facial%20features%2C%20no%20eyes%2C%20plain%20empty%20dark%20background%2C%20tall%20broad%20shoulders%2C%20high%20collar%20coat%2C%20cropped%20hair%2C%20dark%20fantasy%20anime%20character%20portrait%2C%20head%20and%20shoulders%2C%20dim%20moody%20backlight%2C%20muted%20desaturated%20colors%2C%20dark%20shadowy%20background%2C%20somber%20gothic%20horror%20atmosphere%2C%20high%20quality?width=512&height=512&model=flux&nologo=true&seed=205"
  ];
  var SIL_FALLBACK = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2333304a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2316141f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20fill%3D%22url%28%23b%29%22%2F%3E%3Cg%20fill%3D%22%233a3652%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2219%22%20r%3D%227.5%22%2F%3E%3Cpath%20d%3D%22M9%2044c0-8%206.5-13%2015-13s15%205%2015%2013z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E";
  var silCache = {};   // idx -> dataURL（端末キャッシュ）
  function ihash(s){ var h=0; s=String(s==null?'':s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h); }

  // ---- 汎用/仮ラベルの判定（保守的：明確なプレースホルダのみ。実キャラを隠さない） ----
  var NONHUMAN_RE = /^(異形|化け?物|怪物|怪異|妖怪|亡霊|幽鬼|得体の知れない|人ならぬ)/;
  var HUMANUNK_RE = /^([?？\s]+|謎の(人物|声|存在|影)|正体不明.*|誰か|何者か|何か|人影|人の(影|形)|不明(の.*)?|名も無き.*)$/;
  function normLabel(s){ return String(s == null ? '' : s).trim(); }
  function isPronoun(s){ return /^(彼|彼女|それ|あれ|これ|自分|私|僕|俺|あなた|君|お前|奴|やつ)$/.test(normLabel(s)); }
  function isGeneric(name){
    var n = normLabel(name);
    if (!n) return true;
    if (/^[?？]+$/.test(n)) return true;
    if (isPronoun(n)) return true;
    if (NONHUMAN_RE.test(n)) return true;
    if (HUMANUNK_RE.test(n)) return true;
    if (/）\s*$/.test(n) && /(未確認|正体不明)/.test(n)) return true;  // ★fix487c: 仮ラベル(女（未確認）/（正体不明の人物）)もシルエット対象
    return false;
  }
  function isNonhumanGeneric(name){ return NONHUMAN_RE.test(normLabel(name)); }
  function silIndex(name){ return ihash(normLabel(name)) % SILH_URLS.length; }
  function silhouetteFor(name){ var i = silIndex(name); return silCache[i] || SIL_FALLBACK; }  // ★fix487b: 生成URLを直接imgに渡さない(fix197がcarrier誤認→骸骨上書きを防ぐ)。未キャッシュ時はSVG、warm後にdataURLへ差替。

  // ---- ★fix487h(2026-07-19): 検品を通った実画像がある汎用ラベルはシルエット固定を解除 ----
  //   初期状態(外見不明・画像なし)のシルエットは維持(骸骨対策)。ↇで生成→
  //   fix476検品合格→v292av2_に実画像が保存されたときだけ表示を切替える。
  //   表示した名前は keepn_ マーカで記録し、isolateCachesの再隔離対象から外す。
  function f197h(){ return window.__v292Dfix197 || window.__v292Dfix199 || null; }
  function hasRealIcon(name){
    try {
      var f = f197h();
      if (!f || typeof f.cachedFor !== 'function') return false;
      var c = f.cachedFor(name) || '';
      if (typeof c !== 'string' || c.indexOf('data:image') !== 0) return false;
      if (c === SIL_FALLBACK) return false;
      for (var i = 0; i < SILH_URLS.length; i++){ if (silCache[i] && c === silCache[i]) return false; }
      return true;
    } catch(e){ return false; }
  }
  // ★fix487h v2(GPT再監査反映): 許可は「名前に永続」ではなく「↻1回で作られた画像インスタンス」に紐付ける。
  //   ↻クリック → pend_(直前画像の指紋を記録) → 新しい実画像が届いたら allow_=新画像の指紋 に昇格。
  //   表示解除は「現キャッシュの指紋 === allow_ の指紋」の間だけ。画像が変われば再↻が必要。
  function fpOf(d){
    if (typeof d !== 'string' || !d) return '';
    var head = d.slice(0, 96), tail = d.slice(-64), src = d.length + '|' + head + '|' + tail;
    var h = 0; for (var i = 0; i < src.length; i++){ h = ((h << 5) - h + src.charCodeAt(i)) | 0; }
    return 'f' + (h >>> 0).toString(36) + '_' + d.length;
  }
  // ★fix487h v4(GPT監査③②反映・2026-07-19): allow_/pend_/keepn_ を「名前」でなく fix197 の最終pk
  //   (=fix493 ON時はslot+名前+画風でスコープ化される)へ紐付ける。これにより別スロットで同一指紋の
  //   画像が返っても、別pk=別allowキーなので明示↻無しに解除されない(GPT重大②)。fix197不在時のみ名前へ退避。
  function scopeSuffix(name){
    try {
      var f = f197h();
      if (f && typeof f.keyFor === 'function'){ var pk = f.keyFor(name); if (pk) return pk; }
    } catch(e){}
    return normLabel(name);
  }
  function allowFpOf(name){
    try { return localStorage.getItem('v292Dfix487allow_' + scopeSuffix(name)) || ''; } catch(e){ return ''; }
  }
  function getPending(name){
    try { return JSON.parse(localStorage.getItem('v292Dfix487pend_' + scopeSuffix(name)) || 'null'); } catch(e){ return null; }
  }
  function setPending(name){
    try {
      var nm = normLabel(name); if (!nm) return;
      var f = f197h();
      var cur = (f && typeof f.cachedFor === 'function') ? (f.cachedFor(nm) || '') : '';
      localStorage.setItem('v292Dfix487pend_' + scopeSuffix(name), JSON.stringify({ t: Date.now(), prev: fpOf(cur) }));
      try { console.info('[v292Dfix487h] ↻明示指示を受付(新画像が検品を通れば表示):', nm); } catch(e){}
    } catch(e){}
  }
  function promote(name, fp){
    try {
      var nm = normLabel(name), suf = scopeSuffix(name);
      localStorage.setItem('v292Dfix487allow_' + suf, fp);
      localStorage.removeItem('v292Dfix487pend_' + suf);
      try { console.info('[v292Dfix487h] 新画像を承認 → シルエット解除:', nm); } catch(e){}
    } catch(e){}
  }
  // 手動用(検証口): その名前の現画像を即承認
  function allowName(name){
    try {
      var f = f197h();
      var cur = (f && typeof f.cachedFor === 'function') ? (f.cachedFor(normLabel(name)) || '') : '';
      if (cur && cur.indexOf('data:image') === 0) promote(name, fpOf(cur));
      else setPending(name);
    } catch(e){}
  }
  function markKeep(name){
    try {
      var suf = scopeSuffix(name);
      if (localStorage.getItem('v292Dfix487keepn_' + suf) !== '1') localStorage.setItem('v292Dfix487keepn_' + suf, '1');
    } catch(e){}
  }
  function unneutralizeImg(img, name){
    try {
      if (img.getAttribute('data-gensil') === '1'){
        img.removeAttribute('data-gensil');
        img.removeAttribute('data-av-placeholder');
        try { img.title = ''; } catch(e){}
      }
      var f = f197h();
      var c = (f && typeof f.cachedFor === 'function') ? (f.cachedFor(name) || '') : '';
      if (c && c.indexOf('data:image') === 0 && img.getAttribute('src') !== c) img.src = c;
      markKeep(name);
      return true;
    } catch(e){ return false; }
  }


  // ---- 端末キャッシュ: 4枚を1回だけ取得しdataURL化して保存（以後オフライン） ----
  function loadSilCache(i){
    if (silCache[i]) return;
    try { var ls = localStorage.getItem('v292Dfix487sil' + i); if (ls && ls.indexOf('data:image') === 0){ silCache[i] = ls; return; } } catch(e){}
    try {
      fetch(SILH_URLS[i], { mode: 'cors' })
        .then(function(r){ if (!r.ok) throw 0; return r.blob(); })
        .then(function(b){ var fr = new FileReader(); fr.onload = function(){ var d = fr.result;
          if (typeof d === 'string' && d.indexOf('data:image') === 0){ silCache[i] = d; try { localStorage.setItem('v292Dfix487sil' + i, d); } catch(e){} sweep(); } }; fr.readAsDataURL(b); })
        .catch(function(){});
    } catch(e){}
  }
  function warmSilCache(){ for (var i = 0; i < SILH_URLS.length; i++) loadSilCache(i); }

  // ---- 1枚のimgを中立シルエットへ固定（他のsweepに再描画させない） ----
  function neutralizeImg(img){
    try {
      if (!img || img.tagName !== 'IMG') return false;
      var alt = img.getAttribute('alt') || '';
      if (!isGeneric(alt)) return false;
      // ★fix487h: ↻由来の新画像だけ解除(指紋一致)。キャッシュ存在だけでは解除しない(GPT条件)
      if (hasRealIcon(alt)){
        var __f = f197h();
        var __cur = (__f && __f.cachedFor) ? (__f.cachedFor(alt) || '') : '';
        var __cfp = fpOf(__cur);
        var __afp = allowFpOf(alt);
        if (__afp && __afp === __cfp) return unneutralizeImg(img, alt);
        var __pend = getPending(alt);
        if (__pend && __pend.prev !== __cfp){ promote(alt, __cfp); return unneutralizeImg(img, alt); }
      }
      var sil = silhouetteFor(alt);
      if (img.getAttribute('data-gensil') === '1' && img.getAttribute('src') === sil) return true;
      img.removeAttribute('data-avpk');
      img.removeAttribute('data-av-legacy');
      img.removeAttribute('srcset');      // ★fix487b: srcset/data-srcも除去(他モジュールの再解決を断つ・GPT条件)
      img.removeAttribute('data-src');
      img.removeAttribute('data-r');
      img.removeAttribute('data-gen');
      img.setAttribute('data-gensil', '1');
      img.setAttribute('data-av-placeholder', 'unidentified');   // ★fix487b: 未識別マーカー(fix197/fix400が早期returnする目印)
      img.title = '（まだ姿がはっきり見えていない）';
      img.onerror = function(){ this.onerror = null; if (this.getAttribute('src') !== SIL_FALLBACK) this.src = SIL_FALLBACK; };
      if (img.getAttribute('src') !== sil) img.src = sil;
      return true;
    } catch(e){ return false; }
  }

  // ---- imgを持たない「?」テキストのカード（dlg-avが空）にもシルエットを挿す ----
  function neutralizeCards(root){
    try {
      var cards = (root || document).querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cards.length; i++){
        var nameEl = cards[i].querySelector('.dlg-name');
        var nm = nameEl ? (nameEl.textContent || '').trim() : '';
        if (!isGeneric(nm)) continue;
        var av = cards[i].querySelector('.dlg-av');
        if (!av) continue;
        var img = av.querySelector('img');
        if (!img){ av.textContent = ''; img = document.createElement('img'); img.setAttribute('alt', nm || '???'); img.setAttribute('loading', 'lazy'); av.appendChild(img); }
        else if (!(img.getAttribute('alt') || '').trim()){ img.setAttribute('alt', nm || '???'); }
        neutralizeImg(img);
      }
    } catch(e){}
  }

  function sweep(){
    if (!active()) return;
    try {
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++){ neutralizeImg(imgs[i]); }
      neutralizeCards(document);
    } catch(e){}
  }

  // ---- 既存の汎用キャッシュを退避（削除でなくリネーム＝ロールバック可） ----
  function isolateCaches(){
    if (!active()) return 0;
    var moved = 0;
    try {
      var keyFor = null;
      try { if (window.__v292Dfix197 && typeof window.__v292Dfix197.keyFor === 'function') keyFor = window.__v292Dfix197.keyFor; } catch(e){}
      var genericNames = {};
      Object.keys(localStorage).forEach(function(k){
        if (k.indexOf('chrAiAv4:') !== 0) return;
        var nm = k.slice('chrAiAv4:'.length).split('::')[0];
        if (isGeneric(nm)){
          // ★fix487h: 実画像を表示済みの名前(keepn_)や一度退避済みのキーは再隔離しない
          //   (退避は「旧・骸骨時代キャッシュの一回限りの掃除」。以後の生成物と外見文は尊重)
          var suf1 = scopeSuffix(nm);   // ★fix487h v4: pkスコープ(fix493でslot単位)へ統一
          try { if (localStorage.getItem('v292Dfix487keepn_' + suf1) === '1') return; } catch(e){}
          try { if (localStorage.getItem('v292Dfix487allow_' + suf1) != null) return; } catch(e){}
          try { if (localStorage.getItem('v292Dfix487pend_' + suf1) != null) return; } catch(e){}
          try { if (localStorage.getItem('__f487bk_' + k) != null) return; } catch(e){}
          genericNames[nm] = 1; try { var v = localStorage.getItem(k); localStorage.setItem('__f487bk_' + k, v); localStorage.removeItem(k); moved++; } catch(e){}
        }
      });
      if (keyFor){
        Object.keys(genericNames).forEach(function(nm){
          try {
            var suf2 = scopeSuffix(nm);   // ★fix487h v4: pkスコープ
            if (localStorage.getItem('v292Dfix487keepn_' + suf2) === '1') return;   // ★fix487h
            if (localStorage.getItem('v292Dfix487allow_' + suf2) != null) return;    // ★fix487h
            if (localStorage.getItem('v292Dfix487pend_' + suf2) != null) return;     // ★fix487h
            var ik = 'v292av2_' + keyFor(nm); var iv = localStorage.getItem(ik);
            if (localStorage.getItem('__f487bk_' + ik) != null) return;           // ★fix487h: 一度退避済み
            if (iv != null){ localStorage.setItem('__f487bk_' + ik, iv); localStorage.removeItem(ik); moved++; }
          } catch(e){}
        });
      }
    } catch(e){}
    try { if (moved) console.log(TAG, 'isolated generic caches:', moved); } catch(e){}
    return moved;
  }

  function start(){
    try {
      warmSilCache();
      isolateCaches();
      sweep();
      var obs = new MutationObserver(function(muts){
        if (!active()) return;
        var need = false;
        for (var i = 0; i < muts.length; i++){ var m = muts[i];
          if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG'){ neutralizeImg(m.target); }
          else if (m.addedNodes && m.addedNodes.length){ need = true; } }
        if (need) sweep();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt'] });
      window.__v292Dfix487Observer = obs;
      setInterval(sweep, 1000);
      setTimeout(isolateCaches, 3000);
    } catch(e){}
    try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', iconOff=' + (iconOff() ? '1' : '0') + ')'); } catch(e){}
  }
  // ---- ★fix487h: ↻アイコン再生成クリックの捕捉(fix437と同一の判定・genericなら表示許可を付与) ----
  try {
    document.addEventListener('click', function(ev){
      try {
        if (!active()) return;
        var t = ev.target; if (!t || !t.closest) return;
        var probe = t.closest('button,[role="button"],a') || t;
        var txt = (probe.textContent || '') + ' ' + ((probe.getAttribute && (probe.getAttribute('title') || probe.getAttribute('aria-label'))) || '');
        if (txt.length > 40) return;
        if (!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card = t.closest('.npc-card') || t.closest('.v100-clean') || t.closest('[class*="card"]') || t.parentNode;
        var nm = '';
        var img = (card && card.querySelector) ? card.querySelector('img[alt]') : null;
        if (img) nm = (img.getAttribute('alt') || '').trim();
        if (!nm && card && card.querySelector){ var ni = card.querySelector('input[type="text"]'); if (ni) nm = (ni.value || '').trim(); }
        if (nm && isGeneric(nm)) setPending(nm);
      } catch(e){}
    }, true);
  } catch(e){}

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', start); } else { start(); }

  window.__v292Dfix487 = {
    isGeneric: isGeneric, isNonhumanGeneric: isNonhumanGeneric, silIndex: silIndex,
    silhouetteFor: silhouetteFor, neutralizeImg: neutralizeImg, sweep: sweep,
    isolateCaches: isolateCaches, warmSilCache: warmSilCache, SILH_URLS: SILH_URLS, SIL_FALLBACK: SIL_FALLBACK,
    hasRealIcon: hasRealIcon, unneutralizeImg: unneutralizeImg, allowName: allowName,
    fpOf: fpOf, allowFpOf: allowFpOf, setPending: setPending, getPending: getPending   // ★fix487h
  };
})();
