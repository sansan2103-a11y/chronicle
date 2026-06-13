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

  // v292Dfix283: 非キャスト(自動抽出キャラ)の「外見だけ」をAI(本文と同じモデル)に一文抽出させてから
  //   画像生成する。longmem descは場面文混じり(「カエデに担がれて運ばれる」「四人並んで」)で、
  //   そのまま渡すとfluxが全身/群衆/情景を描く(fix282の不安定の真因)。外見一文に純化して安定化。
  //   ・抽出結果は別キー localStorage 'v292appr_'+pk に永続(各キャラ初回1回のみAI呼び出し)=非破壊
  //   ・AI不可/失敗時は longmem desc(fix281/282相当)にフォールバック=退行しない
  //   OFF: v292AppearanceAIOff (AI抽出だけ止めてfix282挙動へ) / v292PortraitAnchorOff (全体OFF)
  function descFor283(name){
    var d = '';
    try {
      var wi = (window.__longmem && window.__longmem.raw && typeof window.__longmem.raw.loadWorldInfo === 'function') ? window.__longmem.raw.loadWorldInfo() : [];
      (wi || []).forEach(function(w){ if (w && w.name === name && !d) d = String(w.desc || w.description || ''); });
      if (!d) (wi || []).forEach(function(w){ if (w && w.name && !d && (String(w.name).indexOf(name) >= 0 || name.indexOf(String(w.name)) >= 0)) d = String(w.desc || w.description || ''); });
    } catch(e){}
    return d;
  }
  var apprPending = {};   // pk -> true (AI抽出の二重起動防止)
  function resolveAppearance(pk, info, cb){
    // キャスト or 全体OFF: AI抽出しない(従来 info.prompt 経路へ)
    try {
      var f66x = window.__v292Dfix66;
      var nonCast = info.name && f66x && typeof f66x.isCast === 'function' && !f66x.isCast(info.name);
      if (localStorage.getItem('v292PortraitAnchorOff') === '1' || !nonCast){ cb('', ''); return; }
    } catch(e){ cb('', ''); return; }
    var desc = descFor283(info.name);
    // 外見キャッシュ(別キー)
    var cachedAppr = null; try { cachedAppr = localStorage.getItem('v292appr_' + pk); } catch(e){}
    if (cachedAppr){ cb(cachedAppr, desc); return; }
    // AI抽出OFF / Api不在 / desc無し → descフォールバック
    var apiOk = window.Api && typeof window.Api.call === 'function';
    if (localStorage.getItem('v292AppearanceAIOff') === '1' || !apiOk || !desc){ cb('', desc); return; }
    if (apprPending[pk]){ cb('', desc); return; } // 抽出中は今回descで描く(次回キャッシュ反映)
    apprPending[pk] = true;
    var sysA = ['キャラクターの容姿を画像生成プロンプト用に日本語一文で書き出してください。', '・髪(色/長さ/型)、目、年齢層、性別、肌、服装、際立つ身体的特徴のみ。', '・物語の出来事/動作/場所/他の人物/心情/比喩は一切書かない。', '・「〜が〜する」のような文でなく、名詞句中心で簡潔に。出力は一文のみ(説明や記号で囲まない)。'].join('\n');
    var userA = 'キャラ名: ' + info.name + '\n説明文:\n' + String(desc).slice(0, 300) + '\n\nこのキャラの容姿(一文):';
    var done = false;
    var to = setTimeout(function(){ if (done) return; done = true; apprPending[pk] = false; cb('', desc); }, 20000); // 保険: 20秒で諦めdescへ
    try {
      window.Api.call(sysA, userA, 200, { allowShort: true }).then(function(r){
        if (done) return; done = true; clearTimeout(to); apprPending[pk] = false;
        var t = (((r && r.text) || '')).replace(/<[^>]+>/g, '').trim().split(/\r?\n/)[0].replace(/^["「『\s]+|["」』\s]+$/g, '').slice(0, 110);
        if (t && t.length >= 3){ try { localStorage.setItem('v292appr_' + pk, t); } catch(e){} cb(t, desc); }
        else cb('', desc);
      }).catch(function(){ if (done) return; done = true; clearTimeout(to); apprPending[pk] = false; cb('', desc); });
    } catch(e){ if (!done){ done = true; clearTimeout(to); apprPending[pk] = false; cb('', desc); } }
  }

  function genOne(pk){
    var info = jobInfo[pk] || {};
    var key = pollKey();
    if(!key){ cache[pk]='dice'; active--; applyAll(); pump(); return; }
    resolveAppearance(pk, info, function(appr, desc){
      var prompt280 = info.prompt || 'portrait';
      try {
        /* v292Dfix283: 非キャストは「AI抽出した外見一文」を最優先ソースに(無ければdesc→info.prompt)。
           アニメ調+バストアップ構図(fix282)で包む。キャスト(desc=外見文)は無加工=回帰ゼロ。 */
        if (localStorage.getItem('v292PortraitAnchorOff') !== '1' && info.name){
          var f66x = window.__v292Dfix66;
          if (f66x && typeof f66x.isCast === 'function' && !f66x.isCast(info.name)){
            var base281 = (appr || desc || String(prompt280)).slice(0, appr ? 110 : 80);
            prompt280 = 'アニメ調のキャラクターイラスト、一人の人物のバストアップ（胸から上）、顔を大きくはっきり描く、' + base281 + '、単独、無地の暗い背景。背景に風景や群衆を描かない。写真ではなくアニメのイラスト。anime illustration, not photo';
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
    });
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
    try{ localStorage.removeItem('v292appr_'+pk); }catch(e){} /* v292Dfix283: ↻時はAI外見キャッシュも破棄して再抽出 */
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
    clearAppearance: function(name){ try{ localStorage.removeItem('v292appr_'+keyFor(name)); }catch(e){} }, /* v292Dfix283: AI外見キャッシュ破棄(↻で外見も引き直す用) */
    clearCache: function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('v292av')===0||k.indexOf('v292appr_')===0) localStorage.removeItem(k); }); }catch(e){} cache={}; jobInfo={}; } };
  window.__v292Dfix199 = window.__v292Dfix197;
})();
