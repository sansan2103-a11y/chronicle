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
    var body = { model: info.model||'flux', prompt: info.prompt||'portrait', n:1, size:'384x384' };
    if(info.seed != null) body.seed = info.seed;   // 同seed＝同一画像（旧絵柄の再現）
    fetch(API, { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ if(!r.ok) throw r.status; return r.json(); })
      .then(function(j){ var b=j&&j.data&&j.data[0]&&j.data[0].b64_json; if(!b) throw 'nob64';
        var d=b64ToDataUrl(b); cache[pk]=d; persistSet(pk,d); })
      .catch(function(){ cache[pk]='dice'; })
      .then(function(){ active--; applyAll(); pump(); });
  }
  function pump(){ while(active<1 && queue.length){ var pk=queue.shift(); if(cache[pk]==='pending'){ active++; genOne(pk); } } }

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
    // v292Dfix199c: 会話ログはimg要素を使い回すため、altが変わったらタグを付け替える
    //   （旧: ミリアのタグが残ったimgがカエデに再利用され、カエデのカードにミリアの絵が出た）
    var alt0 = img.getAttribute('alt') || '';
    var pk0 = img.getAttribute('data-avpk');
    if(pk0 && alt0){
      var expect = keyFor(alt0);
      if(pk0 !== expect){
        img.setAttribute('data-avpk', expect);
        if(!jobInfo[expect]){
          if(src.indexOf('image.pollinations.ai')>=0 && isSquareAvatar(src)){
            jobInfo[expect] = { prompt: promptOf(src), model: modelOf(src), seed: seedOf(src), name: alt0 };
          } else {
            jobInfo[expect] = { name: alt0 };   // prompt未取得: legacy URL が来るまで生成しない
          }
        }
      }
    }
    if(img.getAttribute('data-avpk')){
      // 新しいlegacy URLが再適用された場合は jobInfo を更新（↻再生成後の新プロンプト反映）
      if(src.indexOf('image.pollinations.ai')>=0){
        var pk0=img.getAttribute('data-avpk');
        if(jobInfo[pk0] && promptOf(src) && jobInfo[pk0].prompt!==promptOf(src) && cache[pk0]!=='pending'){
          jobInfo[pk0]={prompt:promptOf(src), model:modelOf(src), seed:seedOf(src), name:img.getAttribute('alt')||jobInfo[pk0].name};
          delete cache[pk0]; persistDel(pk0);
        }
      }
      applyOne(img); return;
    }
    if(src.indexOf('image.pollinations.ai') < 0) return;
    if(!isSquareAvatar(src)) return;
    var name = img.getAttribute('alt') || 'character';
    var pk = keyFor(name);
    if(!jobInfo[pk]) jobInfo[pk] = { prompt: promptOf(src), model: modelOf(src), seed: seedOf(src), name: name };
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
    clearCache: function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('v292av')===0) localStorage.removeItem(k); }); }catch(e){} cache={}; jobInfo={}; } };
  window.__v292Dfix199 = window.__v292Dfix197;
})();
