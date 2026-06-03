// =====================================================================
// Chronicle TRPG - v292Dfix199: AIアイコンを課金版APIで生成（pollinations）
// ---------------------------------------------------------------------
// 経緯（実測で確定）:
//   ・公開レガシー版 image.pollinations.ai/prompt/... は「IP同時1リクエスト」の
//     無料レート制限つき。おしんの共有IPv6ではこの枠が常時飽和 → 402 queue full。
//     残高があってもこの枠は解除されない（実測: balance>0 でも legacy=402 queueFull）。
//   ・課金版API gen.pollinations.ai/v1/images/generations は枠制限なし・残高で生成。
//     実測: balance>0 で 200・b64_json で画像が返る（flux ~0.0011 pollen/枚）。
//
// 方針:
//   ・pollKey があれば、アバターを <img src=legacy> でなく【課金版APIをfetch】して
//     b64画像を取得 → data: URL を img.src に入れる（枠制限を回避して確実に生成）。
//   ・1枚ずつ直列（同時リクエストを避ける）。
//   ・localStorage にキャッシュ（プロンプト単位）→ 再読込・再描画で再生成しない
//     ＝課金は各キャラ1回だけ（説明を変えるまで）。実質ほぼ無料。
//   ・キー無し / 残高不足 / 失敗時は DiceBear（無料イラスト）にフォールバック。
//   ・features.js 側の再適用ループ(fix120b)はガード(fix198/199)で data:|blob:|dicebear を
//     残すよう変更済み → 綱引き(嵐)は起きない。
//
//   シーン画像(512x288)は対象外。完全可逆（script を外せば元通り）。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix199:avatar-api]';
  var DICE_STYLE = 'lorelei';
  var API = 'https://gen.pollinations.ai/v1/images/generations';

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function pollKey(){ try{ var S=getS(); var k=(S&&S.cfg&&S.cfg.pollKey)||''; return String(k).trim(); }catch(e){ return ''; } }
  function diceUrl(name){ return 'https://api.dicebear.com/9.x/' + DICE_STYLE + '/svg?seed=' + encodeURIComponent(String(name||'character')); }
  function isSquareAvatar(src){ var m=/[?&]width=(\d+)&height=(\d+)/.exec(src); if(!m) return true; return m[1]===m[2]; }

  // legacy pollinations URL から prompt と model を取り出す
  function promptOf(src){ var m=/\/prompt\/([^?]+)/.exec(src); try{ return m?decodeURIComponent(m[1]):''; }catch(e){ return m?m[1]:''; } }
  function modelOf(src){ var m=/[?&]model=([^&]+)/.exec(src); return m?m[1]:'flux'; }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function keyOf(src){ return hash(promptOf(src)+'|'+modelOf(src)); }

  function persistGet(pk){ try{ return localStorage.getItem('v292av_'+pk); }catch(e){ return null; } }
  function persistSet(pk,v){ try{ localStorage.setItem('v292av_'+pk, v); }catch(e){} }

  function b64ToDataUrl(b64){
    var mime='image/png';
    if(b64.charAt(0)==='/') mime='image/jpeg';
    else if(b64.slice(0,5)==='iVBOR') mime='image/png';
    else if(b64.slice(0,6)==='R0lGOD') mime='image/gif';
    else if(b64.slice(0,4)==='UklG') mime='image/webp';
    return 'data:'+mime+';base64,'+b64;
  }

  // pk -> dataURL（ready） / 'pending' / 'dice'(=失敗→DiceBear確定)
  var cache = {};
  var jobInfo = {};   // pk -> {prompt, model, name}
  var queue = [];
  var active = 0;

  function genOne(pk){
    var info = jobInfo[pk] || {};
    var key = pollKey();
    if(!key){ cache[pk]='dice'; active--; applyAll(); pump(); return; }
    fetch(API, { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' },
      body: JSON.stringify({ model: info.model||'flux', prompt: info.prompt||'portrait', n:1, size:'384x384' }) })
      .then(function(r){ if(!r.ok) throw r.status; return r.json(); })
      .then(function(j){ var b=j&&j.data&&j.data[0]&&j.data[0].b64_json; if(!b) throw 'nob64';
        var d=b64ToDataUrl(b); cache[pk]=d; persistSet(pk,d); })
      .catch(function(){ cache[pk]='dice'; })
      .then(function(){ active--; applyAll(); pump(); });
  }
  function pump(){ while(active<1 && queue.length){ var pk=queue.shift(); if(cache[pk]==='pending'){ active++; genOne(pk); } } }

  // 1枚のアバター img を最終状態へ
  function applyOne(img){
    var pk = img.getAttribute('data-avpk'); if(!pk) return;
    var info = jobInfo[pk] || {}; var name = info.name || img.getAttribute('alt') || 'character';
    var c = cache[pk];
    if(typeof c==='string' && c.indexOf('data:')===0){ if(img.getAttribute('src')!==c){ img.onerror=null; img.src=c; } return; }
    if(c==='dice'){ var d=diceUrl(name); if(img.getAttribute('src')!==d){ img.onerror=null; img.src=d; } return; }
    // pending or not started
    if(c!=='pending'){ // start it
      var pe=persistGet(pk);
      if(pe && pe.indexOf('data:')===0){ cache[pk]=pe; if(img.getAttribute('src')!==pe){ img.onerror=null; img.src=pe; } return; }
      cache[pk]='pending'; queue.push(pk); pump();
    }
    // while pending: show DiceBear placeholder（legacy pollinations を読ませない＝queueFull嵐を出さない）
    var dp=diceUrl(name); if((img.getAttribute('src')||'').indexOf('image.pollinations.ai')>=0 || !img.getAttribute('src')){ img.onerror=null; img.src=dp; }
  }

  function fixImg(img){
    var src = img.getAttribute('src') || '';
    var hasPk = img.getAttribute('data-avpk');
    if(hasPk){ applyOne(img); return; }
    if(src.indexOf('image.pollinations.ai') < 0) return;
    if(!isSquareAvatar(src)) return;   // scene images は対象外
    var pk = keyOf(src);
    if(!jobInfo[pk]) jobInfo[pk] = { prompt: promptOf(src), model: modelOf(src), name: img.getAttribute('alt')||'character' };
    img.setAttribute('data-avpk', pk);
    applyOne(img);
  }

  function applyAll(){
    try{ var imgs=document.getElementsByTagName('img'); for(var i=0;i<imgs.length;i++){ if(imgs[i].getAttribute('data-avpk')) applyOne(imgs[i]); } }catch(e){}
  }
  function sweep(){
    try{ var imgs=document.getElementsByTagName('img'); for(var i=0;i<imgs.length;i++) fixImg(imgs[i]); }catch(e){}
  }

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
    try{ console.log(TAG,'loaded (pollKey='+(pollKey()?'set':'none')+')'); }catch(_){}
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', start); } else { start(); }

  window.__v292Dfix197 = { sweep: sweep, fixImg: fixImg, diceUrl: diceUrl, pollKey: pollKey,
    clearCache: function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('v292av_')===0) localStorage.removeItem(k); }); }catch(e){} cache={}; } };
  window.__v292Dfix199 = window.__v292Dfix197;
})();
