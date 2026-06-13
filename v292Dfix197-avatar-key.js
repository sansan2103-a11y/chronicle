// =====================================================================
// Chronicle TRPG - v292Dfix199b: AIアイコンを課金版APIで生成（seed固定・キャラ単位統一）
// ---------------------------------------------------------------------
// fix199 からの改良（おしんFB: 場所ごとに絵が違う／絵柄が前と違う）:
//   ・キャッシュを【キャラ名＋画風】単位に統一 → 会話ログ/設定/キャラ一覧で同じ1枚を共有。
//     （旧実装はプロンプト文字列単位 → 場所ごとに微妙に違う文言で別画像になっていた）
//   ・legacy URL の seed をそのまま API に渡す（実測: /v1/images は seed を尊重し
//     同seed=同一画像）。旧アイコンは seed=hash(name) で生成されていたので、
//     同プロンプト+同seed で以前の絵柄が再現される見込み。
//   ・キャッシュ接頭辞を v292av2_ に変更（seed無しで生成された旧世代を破棄）。
//   ・↻再生成ボタン / 🖌画風切替で再生成されるよう配線。
//
// 基本構造（fix199と同じ）:
//   課金版API gen.pollinations.ai/v1/images/generations（枠制限なし・b64返却）を
//   1枚ずつ直列で fetch → data:URL を img へ。localStorage キャッシュで再生成なし
//   （各キャラ1回 ~0.0011 pollen）。キー無し/失敗は DiceBear。legacy <img> は読ませない。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix199b:avatar-api]';
  var DICE_STYLE = 'lorelei';
  var API = 'https://gen.pollinations.ai/v1/images/generations';
  var LS_PREFIX = 'v292av2_';

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function pollKey(){ try{ var S=getS(); var k=(S&&S.cfg&&S.cfg.pollKey)||''; return String(k).trim(); }catch(e){ return ''; } }
  function artStyle(){ try{ var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); }catch(e){ return '0'; } }
  function diceUrl(name){ return 'https://api.dicebear.com/9.x/' + DICE_STYLE + '/svg?seed=' + encodeURIComponent(String(name||'character')); }
  function isSquareAvatar(src){ var m=/[?&]width=(\d+)&height=(\d+)/.exec(src); if(!m) return true; return m[1]===m[2]; }

  function promptOf(src){ var m=/\/prompt\/([^?]+)/.exec(src); try{ return m?decodeURIComponent(m[1]):''; }catch(e){ return m?m[1]:''; } }
  function modelOf(src){ var m=/[?&]model=([^&]+)/.exec(src); return m?m[1]:'flux'; }
  function seedOf(src){ var m=/[?&]seed=(\d+)/.exec(src); return m? +m[1] : null; }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  // キャッシュキー＝キャラ名＋画風（場所が違っても同キャラは同じ1枚）
  function keyFor(name){ return 'n' + hash(String(name||'') + '|' + artStyle()); }

  function persistGet(pk){ try{ return localStorage.getItem(LS_PREFIX+pk); }catch(e){ return null; } }
  function persistSet(pk,v){ try{ localStorage.setItem(LS_PREFIX+pk, v); }catch(e){} }
  function persistDel(pk){ try{ localStorage.removeItem(LS_PREFIX+pk); }catch(e){} }

  function b64ToDataUrl(b64){
    var mime='image/png';
    if(b64.charAt(0)==='/') mime='image/jpeg';
    else if(b64.slice(0,5)==='iVBOR') mime='image/png';
    else if(b64.slice(0,6)==='R0lGOD') mime='image/gif';
    else if(b64.slice(0,4)==='UklG') mime='image/webp';
    return 'data:'+mime+';base64,'+b64;
  }

  var cache = {};     // pk -> dataURL / 'pending' / 'dice'
  var jobInfo = {};   // pk -> {prompt, model, seed, name}
  var queue = [];
  var active = 0;

  function genOne(pk){
    var info = jobInfo[pk] || {};
    var key = pollKey();
    if(!key){ cache[pk]='dice'; active--; applyAll(); pump(); return; }
    var prompt280 = info.prompt || 'portrait';
    try {
      /* v292Dfix281(fix280改): 非キャスト(自動抽出キャラ)のアイコンが風景画/別人になる根治。
         真因2段=①プロンプト元のncAppearanceが「外見」でなく場面文(「カエデに担がれて運ばれる」)
         →fluxが情景を描く ②英語のportrait指示を前置すると日本語の外見が打ち消され人種/性別が
         デフォルト(西洋人男性)に化ける(実機実証: 長い黒髪の少女→西洋人男性)。
         修正=longmem worldinfo desc(キャラ一覧の説明文=「三年前に失踪した長い黒髪の少女」等
         外見を含む)を最優先の外見ソースにし、日本語の外見記述を「先頭」に置く(人種/性別/髪を尊重)。
         英語の制御語は最小限後置。キャスト(desc=外見文)は従来通り無加工=回帰ゼロ。
         OFF: v292PortraitAnchorOff */
      if (localStorage.getItem('v292PortraitAnchorOff') !== '1' && info.name){
        var f66x = window.__v292Dfix66;
        if (f66x && typeof f66x.isCast === 'function' && !f66x.isCast(info.name)){
          var d281 = '';
          try {
            var wi281 = (window.__longmem && window.__longmem.raw && typeof window.__longmem.raw.loadWorldInfo === 'function') ? window.__longmem.raw.loadWorldInfo() : [];
            (wi281 || []).forEach(function(w){ if (w && w.name === info.name && !d281) d281 = String(w.desc || w.description || ''); });
            if (!d281) (wi281 || []).forEach(function(w){ if (w && w.name && !d281 && (String(w.name).indexOf(info.name) >= 0 || info.name.indexOf(String(w.name)) >= 0)) d281 = String(w.desc || w.description || ''); });
          } catch(ew281){}
          var base281 = (d281 || String(prompt280)).slice(0, 120);
          prompt280 = base281 + '、人物のポートレート、顔と上半身、正面、無地の暗い背景、anime style, solo portrait, no scenery, no landscape';
        }
      }
    } catch(e280){}
    var body = { model: info.model||'flux', prompt: prompt280, n:1, size:'384x384' };
    if(info.seed != null) body.seed = info.seed;   // 同seed＝同一画像（旧絵柄の再現）
    fetch(API, { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ if(!r.ok) throw r.status; return r.json(); })
      .then(function(j){ var b=j&&j.data&&j.data[0]&&j.data[0].b64_json; if(!b) throw 'nob64';
        var d=b64ToDataUrl(b); cache[pk]=d; persistSet(pk,d); })
      .catch(function(){ cache[pk]='dice'; })
      .then(function(){ active--; applyAll(); pump(); });
  }
  // v292Dfix199f: 暴走防止の遮断器。生成は直列・最小間隔つき・セッション上限あり。
  //   万一どこかが無限再生成ループに陥っても、上限で自動停止して DiceBear に退避し、
  //   pollen を燃やし続けない（嵐クラスの不具合の最終ブレーキ）。
  var GEN_BUDGET = 15;      // 1ページセッションの生成上限（通常はキャラ数回で足りる）
  var MIN_INTERVAL = 1500;  // 生成と生成の最小間隔(ms)
  var genCount = 0, lastGenAt = 0, pumpTimer = null;
  function pump(){
    if(active >= 1 || !queue.length || pumpTimer) return;
    if(genCount >= GEN_BUDGET){
      while(queue.length){ var pkx = queue.shift(); if(cache[pkx]==='pending') cache[pkx]='dice'; }
      try{ console.warn(TAG, 'generation budget ('+GEN_BUDGET+') exceeded — DiceBearに退避（暴走防止）'); }catch(e){}
      applyAll(); return;
    }
    var pk = queue.shift();
    if(cache[pk] !== 'pending'){ pump(); return; }
    active++;
    var wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastGenAt));
    pumpTimer = setTimeout(function(){ pumpTimer = null; lastGenAt = Date.now(); genCount++; genOne(pk); }, wait);
  }

  function applyOne(img){
    var pk = img.getAttribute('data-avpk'); if(!pk) return;
    var info = jobInfo[pk] || {}; var name = info.name || img.getAttribute('alt') || 'character';
    var c = cache[pk];
    if(typeof c==='string' && c.indexOf('data:')===0){ if(img.getAttribute('src')!==c){ img.onerror=null; img.src=c; } return; }
    if(c==='dice'){ var d=diceUrl(name); if(img.getAttribute('src')!==d){ img.onerror=null; img.src=d; } return; }
    if(c!=='pending'){
      var pe=persistGet(pk);
      if(pe && pe.indexOf('data:')===0){ cache[pk]=pe; if(img.getAttribute('src')!==pe){ img.onerror=null; img.src=pe; } return; }
      if(info.prompt){ cache[pk]='pending'; queue.push(pk); pump(); }  // promptが無いキーは生成しない（legacy URL待ち）
    }
    // pending中: legacy pollinations を読ませない（DiceBearを仮表示）
    var dp=diceUrl(name);
    var cur=img.getAttribute('src')||'';
    if(cur.indexOf('image.pollinations.ai')>=0 || !cur){ img.onerror=null; img.src=dp; }
  }

  function fixImg(img){
    var src = img.getAttribute('src') || '';
    // v292Dfix209: legacy URLは src でなく data-av-legacy 属性でも運べる（ブラウザにfetchさせず
    //   プロンプト/seedだけ受け取る＝ロード時402の根絶。書き手側はfix66 buildCard等）。
    var legacy209 = img.getAttribute('data-av-legacy') || '';
    var carrier = (src.indexOf('image.pollinations.ai') >= 0) ? src
                : (legacy209.indexOf('image.pollinations.ai') >= 0 ? legacy209 : '');
    // v292Dfix199c: 会話ログはimg要素を使い回すため、altが変わったらタグを付け替える
    //   （旧: ミリアのタグが残ったimgがカエデに再利用され、カエデのカードにミリアの絵が出た）
    var alt0 = img.getAttribute('alt') || '';
    var pk0 = img.getAttribute('data-avpk');
    if(pk0 && alt0){
      var expect = keyFor(alt0);
      if(pk0 !== expect){
        img.setAttribute('data-avpk', expect);
        if(!jobInfo[expect]){
          if(carrier && isSquareAvatar(carrier)){
            jobInfo[expect] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: alt0 };
          } else {
            jobInfo[expect] = { name: alt0 };   // prompt未取得: legacy URL が来るまで生成しない
          }
        }
      }
    }
    if(img.getAttribute('data-avpk')){
      // v292Dfix199f: 「プロンプト変化で自動再生成」は廃止。
      //   主人公アバターは2系統のコードが【別々のプロンプト】を出すため、自動再生成が
      //   A↔Bの無限ループになり（点滅・402嵐・pollen消費）危険だった。
      //   説明変更後の作り直しは ↻ボタン（regenFor）だけで行う。
      applyOne(img); return;
    }
    if(!carrier) return;
    if(!isSquareAvatar(carrier)) return;
    var name = img.getAttribute('alt') || 'character';
    var pk = keyFor(name);
    if(!jobInfo[pk]) jobInfo[pk] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: name };
    img.setAttribute('data-avpk', pk);
    applyOne(img);
  }

  function applyAll(){
    try{ var imgs=document.getElementsByTagName('img'); for(var i=0;i<imgs.length;i++){ if(imgs[i].getAttribute('data-avpk')) applyOne(imgs[i]); } }catch(e){}
  }
  var lastStyle = artStyle();
  function sweep(){
    try{
      // 🖌画風が変わったら、タグを外して features.js に新styleのURLを再適用させる（新キーで再生成）
      var st = artStyle();
      if(st !== lastStyle){
        lastStyle = st;
        var tagged=document.querySelectorAll('img[data-avpk]');
        for(var t=0;t<tagged.length;t++){ tagged[t].removeAttribute('data-avpk'); try{ tagged[t].src=''; }catch(e){} }
      }
      var imgs=document.getElementsByTagName('img');
      for(var i=0;i<imgs.length;i++) fixImg(imgs[i]);
    }catch(e){}
  }

  // ↻ 再生成: features.js と同じクリック検知で、このキャラのキャッシュを破棄して作り直す
  function regenFor(name){
    if(!name) return;
    var pk=keyFor(name);
    delete cache[pk]; delete jobInfo[pk]; persistDel(pk);
    try{
      var imgs=document.querySelectorAll('img[data-avpk]');
      for(var i=0;i<imgs.length;i++){ if((imgs[i].getAttribute('alt')||'')===name){ imgs[i].removeAttribute('data-avpk'); try{ imgs[i].src=''; }catch(e){} } }
    }catch(e){}
  }
  try{
    document.addEventListener('click', function(ev){
      try{
        var t=ev.target; if(!t||!t.closest) return;
        var probe=t.closest('button,[role="button"],a')||t;
        var txt=(probe.textContent||'')+' '+((probe.getAttribute&&(probe.getAttribute('title')||probe.getAttribute('aria-label')))||'');
        if(txt.length>40) return;
        if(!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card=t.closest('.npc-card')||t.closest('.v100-clean')||t.closest('[class*="card"]')||t.parentNode;
        var nm=''; var img=card&&card.querySelector?card.querySelector('img[alt]'):null;
        if(img) nm=(img.getAttribute('alt')||'').trim();
        if(!nm&&card&&card.querySelector){ var ni=card.querySelector('input[type="text"]'); if(ni) nm=(ni.value||'').trim(); }
        if(nm) setTimeout(function(){ regenFor(nm); }, 300);
      }catch(e){}
    }, true);
  }catch(e){}

  function start(){
    try{
      var obs=new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){ var m=muts[i];
          if(m.type==='attributes' && m.target && m.target.tagName==='IMG'){ fixImg(m.target); }
          else if(m.addedNodes && m.addedNodes.length){ sweep(); }
        }
      });
      obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
      window.__v292Dfix199Observer=obs;
    }catch(e){}
    setInterval(sweep, 1500);
    sweep();
    try{ console.log(TAG,'loaded (pollKey='+(pollKey()?'set':'none')+', style='+artStyle()+')'); }catch(_){}
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', start); } else { start(); }

  window.__v292Dfix197 = { sweep: sweep, fixImg: fixImg, diceUrl: diceUrl, pollKey: pollKey, regenFor: regenFor,
    // v292Dfix209: 書き手(fix66等)が初期srcに使うキャッシュ済みdata:URLの取得口
    keyFor: keyFor,
    cachedFor: function(name){ try{ var pk=keyFor(name); var c=cache[pk]; if(typeof c==='string'&&c.indexOf('data:')===0) return c; var p=persistGet(pk); return (p&&p.indexOf('data:')===0)?p:''; }catch(e){ return ''; } },
    clearCache: function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('v292av')===0) localStorage.removeItem(k); }); }catch(e){} cache={}; jobInfo={}; } };
  window.__v292Dfix199 = window.__v292Dfix197;
})();
