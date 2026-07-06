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
  function _rec391S(pk,p,s,m){try{if(localStorage.getItem('v292Dfix391Off')!=='1')localStorage.setItem('v292avrec_'+pk,JSON.stringify({p:p,s:(s!=null?s:null),m:m||'flux'}));}catch(e){}}
  function _rec391L(pk,jo){try{if(localStorage.getItem('v292Dfix391')==='1'&&jo){var r=localStorage.getItem('v292avrec_'+pk);if(r){var R=JSON.parse(r);if(R){if(R.p)jo.prompt=R.p;if(R.s!=null)jo.seed=R.s;if(R.m)jo.model=R.m;}}}}catch(e){}}

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function pollKey(){ try{ var S=getS(); var k=(S&&S.cfg&&S.cfg.pollKey)||''; return String(k).trim(); }catch(e){ return ''; } }
  function getApi(){ try{ return window.Api || (0,eval)('Api'); }catch(e){ return null; } } /* v292Dfix283b: Apiはindex.htmlのconst(window非公開)→S同様eval経由で取得 */
  function artStyle(){ try{ var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); }catch(e){ return '0'; } }
  /* v292Dfix284: 登録キャラと画風を完全統一するため、features.jsのSTYLE_SUFFIX/STYLE_LISTを同値で複製。
     自動抽出キャラのアイコンも「外見+この画風サフィックス」=登録キャラと同じ式で生成する。
     (features.js側 STYLE_SUFFIX を変更したらここも合わせること) */
  var STYLE_LIST_284 = ['anime', 'realistic', 'watercolor', 'darkfantasy'];
  var STYLE_SUFFIX_284 = {
    anime: ', high quality anime art style, clean detailed anime illustration, head and shoulders, visible clothing, vibrant',
    realistic: ', realistic digital painting, head and shoulders, visible clothing, cinematic lighting, highly detailed',
    watercolor: ', soft watercolor illustration, head and shoulders, visible clothing, delicate brushwork, artistic',
    darkfantasy: ', dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality'
  }; /* v292Dfix285: features.js STYLE_SUFFIX と同値(顔アップ緩和+服見せ) */
  function styleSuffix284(isCreature){ try{ var i = +artStyle(); var k = STYLE_LIST_284[i] || 'darkfantasy'; var s = STYLE_SUFFIX_284[k] || STYLE_SUFFIX_284.darkfantasy;
    if (isCreature){ /* v292Dfix286: 人外は人型強制語(顔/肩/青白い肌/portrait/服)を除去しcreature向けに差し替え。色調・雰囲気(暗さ/画風)は維持。 */
      s = s.replace(/character portrait/g, 'creature concept art').replace(/, head and shoulders/g, ', full creature body visible').replace(/, visible clothing/g, '').replace(/, detailed face/g, ', highly detailed').replace(/, pale skin/g, '').replace(/portrait/g, 'creature art');
      s += ', non-human creature, monster design, no human face, no human body';
    }
    return s; }catch(e){ return STYLE_SUFFIX_284.darkfantasy; } }
  /* v292Dfix286: 外見抽出文の先頭 [人外]/[人間] タグを解釈。clean=タグ除去本文, creature=人外フラグ */
  function parseAppr286(raw){ var t = String(raw||''); var m = /^\s*[\[【]\s*(人外|人間|非人間|怪異|妖怪)\s*[\]】]\s*/.exec(t); var cre = !!(m && m[1] !== '人間'); var clean = t.replace(/^\s*[\[【][^\]】]{1,8}[\]】]\s*/, '').trim(); return { clean: clean, creature: cre }; }
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

  /* v292Dfix347: 生成失敗時に「既にある良い絵」を守るガード。
     ・↻/画風切替で消した直前の絵を退避しておき、上流(課金API)失敗時は低品質フォールバックで
       上書きせず元の絵へ復元する(おしんFB: 作り直しが走ると良い絵が壊れる)。
     ・新キー(画風切替後)で失敗した時は、同名キャラの他画風キャッシュがあればそれを使う。
     OFF: v292Dfix347Off='1' で従来動作(無料GET→dice)。 */
  var prevGood347 = {};
  function guard347Off(){ try{ return localStorage.getItem('v292Dfix347Off')==='1'; }catch(e){ return false; } }
  function sameNameCache347(name){
    try{
      if(!name) return '';
      for(var st=0; st<10; st++){
        var pk2='n'+hash(String(name)+'|'+st);
        var v=persistGet(pk2);
        if(v && v.indexOf('data:')===0) return v;
      }
    }catch(e){}
    return '';
  }

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
      if (localStorage.getItem('v292PortraitAnchorOff') === '1' || !nonCast){ cb('', '', false); return; }
    } catch(e){ cb('', ''); return; }
    var desc = descFor283(info.name);
    // 外見キャッシュ(別キー)
    var cachedAppr = null; try { cachedAppr = localStorage.getItem('v292appr_' + pk); } catch(e){}
    if (cachedAppr){ var pc286 = parseAppr286(cachedAppr); cb(pc286.clean, desc, pc286.creature); return; }
    // AI抽出OFF / Api不在 / desc無し → descフォールバック
    var _api = getApi(); var apiOk = _api && typeof _api.call === 'function';
    if (localStorage.getItem('v292AppearanceAIOff') === '1' || !apiOk || !desc){ cb('', desc, false); return; }
    if (apprPending[pk]){ cb('', desc, false); return; } // 抽出中は今回descで描く(次回キャッシュ反映)
    apprPending[pk] = true;
    var sysA = ['キャラクター/存在の容姿を画像生成プロンプト用に日本語一文で書き出してください。', '・最初に種別を判定し、文頭に必ず [人間] または [人外] と付ける(人外=妖怪/怪異/化け物/精霊/亡霊/動物/人形/物体など人型でない存在)。', '・[人間]なら: 髪(色/長さ/型)、目、年齢層、性別、肌、服装、際立つ身体的特徴。', '・[人外]なら: その姿形・色・質感・大きさ・異形の特徴を具体的に(無理に人型・髪・年齢・性別に当てはめない)。', '・物語の出来事/動作/場所/他の人物/心情/比喩は一切書かない。', '・名詞句中心で簡潔に。出力は「[種別]容姿」の一文のみ。'].join('\n'); /* v292Dfix286: 文頭に[人間]/[人外]の種別タグを付けさせる */ /* v292Dfix285: 人外(怪異/妖怪等)も認識して異形として描けるよう拡張 */
    var userA = 'キャラ名: ' + info.name + '\n説明文:\n' + String(desc).slice(0, 300) + '\n\nこのキャラの容姿(一文):';
    var done = false;
    var to = setTimeout(function(){ if (done) return; done = true; apprPending[pk] = false; cb('', desc, false); }, 20000); // 保険: 20秒で諦めdescへ
    try {
      _api.call(sysA, userA, 200, { allowShort: true }).then(function(r){
        if (done) return; done = true; clearTimeout(to); apprPending[pk] = false;
        var t = (((r && r.text) || '')).replace(/<[^>]+>/g, '').trim().split(/\r?\n/)[0].replace(/^["「『\s]+|["」』\s]+$/g, '').slice(0, 120);
        var pr286 = parseAppr286(t);
        if (pr286.clean && pr286.clean.length >= 3){ try { localStorage.setItem('v292appr_' + pk, t); } catch(e){} cb(pr286.clean, desc, pr286.creature); }
        else cb('', desc, false);
      }).catch(function(){ if (done) return; done = true; clearTimeout(to); apprPending[pk] = false; cb('', desc, false); });
    } catch(e){ if (!done){ done = true; clearTimeout(to); apprPending[pk] = false; cb('', desc, false); } }
  }

  function genOne(pk){
    var info = jobInfo[pk] || {};
    var key = pollKey();
    if(!key){ cache[pk]='dice'; active--; applyAll(); pump(); return; }
    resolveAppearance(pk, info, function(appr, desc, isCreature){
      var prompt280 = info.prompt || 'portrait';
      try {
        /* v292Dfix283: 非キャストは「AI抽出した外見一文」を最優先ソースに(無ければdesc→info.prompt)。
           fix286: 人外(isCreature)は画風の人型強制語をcreature向けに差し替え。キャスト(登録)は無加工=回帰ゼロ。 */
        if (localStorage.getItem('v292PortraitAnchorOff') !== '1' && info.name){
          var f66x = window.__v292Dfix66;
          if (f66x && typeof f66x.isCast === 'function' && !f66x.isCast(info.name)){
            var base281 = (appr || desc || String(prompt280)).slice(0, appr ? 120 : 80);
            /* v292Dfix284: 画風を登録キャラと完全統一(おしんFB:雰囲気が違いすぎる→登録の有料経路に合わせる)。
               独自のアニメ調/バストアップ文言を廃し、features.jsと同一のSTYLE_SUFFIX[画風]を付ける
               =登録キャラと同じ式(外見+画風)。AI抽出外見(fix283b)で外見のみになったので素直に同じ雰囲気の人物画になる。 */
            prompt280 = base281 + styleSuffix284(isCreature);
          }
        }
      } catch(e280){}
      var body = { model: info.model||'flux', prompt: prompt280, n:1, size:'384x384' };
      if(info.seed != null) body.seed = info.seed;   // 同seed＝同一画像（旧絵柄の再現）
      /* v292Dfix337b: 課金APIがハング/停止(412)しても確実に無料経路へ落ちるよう10秒タイムアウト。
         課金アカウント停止時に/imageがpendingのまま返らずフォールバックが起動しない件の対処。 */
      var _ac = (typeof AbortController!=='undefined') ? new AbortController() : null;
      var _to = _ac ? setTimeout(function(){ try{ _ac.abort(); }catch(e){} }, 10000) : null;
      fetch(API, { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify(body), signal: _ac?_ac.signal:undefined })
        .then(function(r){ if(_to){ clearTimeout(_to); } if(!r.ok) throw r.status; return r.json(); })
        .then(function(j){ var b=j&&j.data&&j.data[0]&&j.data[0].b64_json; if(!b) throw 'nob64';
          var d=b64ToDataUrl(b); cache[pk]=d; persistSet(pk,d); _rec391S(pk,prompt280,(body&&body.seed!=null?body.seed:null),(body&&body.model)); delete prevGood347[pk]; })
        .catch(function(){
          /* v292Dfix347: 上流失敗時、まず既存の良い絵を復元(低品質上書き防止) */
          try{
            if(!guard347Off()){
              var _prev347 = prevGood347[pk] || sameNameCache347(info.name);
              if(_prev347){ cache[pk]=_prev347; persistSet(pk,_prev347); delete prevGood347[pk]; try{ console.warn(TAG,'v292Dfix347: 生成失敗→既存の絵で復元 ('+(info.name||pk)+')'); }catch(_e0){} return; }
            }
          }catch(_e347){}
          /* v292Dfix337: 課金API失敗(例: HTTP412 アカウント停止/請求上限)時は無料経路
             image.pollinations.ai へフォールバック→b64化して既存表示経路に載せる。無料も
             ダメな時だけdice。おしんのPollinations課金停止でアイコンが出なくなった件の緩和。 */
          try{
            var _seed = (info.seed!=null) ? info.seed : Math.floor(Math.random()*1e6);
            var _free = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt280)
                      + '?width=384&height=384&seed=' + _seed + '&nologo=true&model=' + (info.model||'flux');
            return fetch(_free).then(function(r){ if(!r.ok) throw r.status; return r.blob(); })
              .then(function(blob){ return new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){ res(fr.result); }; fr.onerror=rej; fr.readAsDataURL(blob); }); })
              .then(function(dataUrl){ if(dataUrl && dataUrl.indexOf('data:image')===0){ cache[pk]=dataUrl; persistSet(pk,dataUrl); _rec391S(pk,prompt280,(typeof _seed!=='undefined'?_seed:null),(info&&info.model)); } else { cache[pk]='dice'; } })
              .catch(function(){ cache[pk]='dice'; });
          }catch(_e){ cache[pk]='dice'; }
        })
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
      if(info.prompt){
        /* v292Dfix348: fix346のIDB水和完了前は生成を予約しない。
           水和前はpersistGetがnull=キャッシュ有りキャラにも再生成が走り、生成失敗時に
           低品質フォールバックで上書きされていた(リロード毎に絵が壊れる主犯=水和レース)。
           readyは失敗時もtrueになるためデッドロックしない。fix346不在なら従来通り。 */
        var f346=window.__v292Dfix346;
        if(f346 && typeof f346.ready==='function' && !f346.ready()) return;
        cache[pk]='pending'; queue.push(pk); pump();
      }  // promptが無いキーは生成しない（legacy URL待ち）
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
            jobInfo[expect] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: alt0 }; _rec391L(expect,jobInfo[expect]);
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
    if(!jobInfo[pk]) jobInfo[pk] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: name }; _rec391L(pk,jobInfo[pk]);
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
    try{ var _pg347=persistGet(pk); if(_pg347 && _pg347.indexOf('data:')===0) prevGood347[pk]=_pg347; }catch(e){} /* v292Dfix347: 破棄前に退避 */
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
