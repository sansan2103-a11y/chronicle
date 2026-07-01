// =====================================================================
// Chronicle TRPG - v292Dfix338: 画風の体系整理 × ジャンル連動 × 画風統一
// ---------------------------------------------------------------------
// 背景(おしん実観察 2026-07-01): おまかせ生成した1キャスト内で画風が混ざる
//   (スピカ/シズクは暗い実写・ゴシックで同系なのにナナだけアニメ調に浮く)。
// DeepResearch(5角度)の結論:
//   ・Fluxは前方トークンを強く重み付け=末尾スタイル語(suffix)は最弱。現行は
//     "外見 + STYLE_SUFFIX" と末尾付与 → 各キャラの外見語に負けて画風が浮く。
//   ・キャラ外見にアニメ示唆語(anime/漫画/cartoon等)が混ざると共通スタイルを
//     上書きしてアニメ側へ引っ張る(SDのassociation effect)。
//   ・Fluxは重み記法もnegative promptも無視 → 効くのは「位置(前方)・中立語・hex」。
// → 本modは画像生成fetchをラップし、最終プロンプトを一箇所で整形:
//     ①旧suffix除去で外見を復元 ②外見からスタイル語を除去 ③画風プレフィックス
//     (hexパレット付)を先頭に前置き。cast/非cast/怪異すべてに効く。
//   さらに画風を4→5種に整理(従来→「ダーク」に改称・「SF」を新規追加)、
//   おまかせのジャンル(現代怪異/DF/SF/人間ドラマ)から既定画風を自動セット(上書き可)。
//
// 全コア不触・fetchラップと後付けDOM/設定のみ。★プレビュー制(既定は無効)。
//   有効化: localStorage v292Dfix338='1'（おしんが検証→良ければ既定化）。
//   これで friends のライブ挙動は既定不変=安全にA/B。
// index.html末尾(fix336の後)で読み込む。avatar生成fetch(fix197)より後でよい
//   (ラップは parse時に設置され、生成ループはDOMContentLoaded後に走るため間に合う)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix338) return; window.__v292Dfix338 = {};
  var TAG='[v292Dfix338:artstyle]';
  function on(){ try{ return localStorage.getItem('v292Dfix338')==='1'; }catch(e){ return false; } }

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function getCfg(){ try{ var S=getS(); return (S&&S.cfg)||null; }catch(e){ return null; } }
  function artIdx(){ try{ var c=getCfg(); var v=c&&c.artStyle; return (v==null)?3:(+v); }catch(e){ return 3; } }

  // ------- 5画風(append-only=既存セーブのindex 0-3を保持) -------
  // 0 anime / 1 realistic / 2 watercolor / 3 dark(旧darkfantasy=「従来」) / 4 sf(新)
  var LABELS=['アニメ','リアル','水彩','ダーク','SF'];
  var STYLE_TITLE='AIアイコンの絵柄。アニメ=明るいセル / リアル=暖色の写実 / 水彩=淡く優しい / '
    +'ダーク=退色ゴシック(怪異・ダークファンタジー向き) / SF=寒色シネマティック。'
    +'切替で全キャラ作り直し。世界のジャンルから自動で既定が選ばれ、ここでいつでも上書きできます';
  // 人物ポートレート用プレフィックス(前置き=Fluxで最も強い位置・hexでパレット固定)
  var PREFIX=[
    /*anime*/      'High-quality anime illustration, clean cel shading, crisp linework, vibrant saturated palette, head-and-shoulders character portrait, visible clothing',
    /*realistic*/  'Realistic digital painting, soft natural window light, warm muted palette hex #C89B7B hex #6B7A8F, gentle catch-lights, grounded semi-realism, head-and-shoulders character portrait, visible clothing, highly detailed',
    /*watercolor*/ 'Soft watercolor illustration, delicate transparent washes, gentle bleeding edges, pale low-saturation palette hex #D9C9B0 hex #A9B7C6, tender nostalgic mood, head-and-shoulders character portrait, visible clothing',
    /*dark*/       'Dark painterly character portrait, desaturated muted palette hex #2B2B33 hex #6E5A5A, deep shadows and dim moody lighting, pale skin, somber gothic horror atmosphere, dark shadowy background, head-and-shoulders, visible clothing, high quality',
    /*sf*/         'Cinematic science-fiction character portrait, cool teal and cyan palette hex #1B3B4B hex #3FB0C8, rim light with subtle underlight, sleek high-tech materials, dark high-contrast background, head-and-shoulders, visible clothing, highly detailed'
  ];
  // 人外(怪異/怪物)用=人型強制語を外し、色調・雰囲気だけ継ぐ
  var PREFIX_CREATURE=[
    /*anime*/      'High-quality anime creature concept art, clean detailed rendering, vibrant palette, non-human creature, full creature body visible',
    /*realistic*/  'Realistic creature concept art, cinematic lighting, muted palette hex #6B7A8F, highly detailed, non-human creature, no human face',
    /*watercolor*/ 'Soft watercolor creature illustration, delicate washes, pale palette hex #A9B7C6, ethereal, non-human creature',
    /*dark*/       'Dark creature concept art, desaturated palette hex #2B2B33, deep shadows, dim moody lighting, somber gothic horror atmosphere, non-human creature, monster design, no human face',
    /*sf*/         'Cinematic sci-fi creature concept art, cool teal palette hex #1B3B4B, rim light, biomechanical detail, dark background, non-human creature, no human face'
  ];

  // ------- プロンプト整形 -------
  // 旧suffixの開始点(features.js STYLE_SUFFIX / fix197 STYLE_SUFFIX_284 の先頭語)。
  // ここから末尾までを切り落として「外見コア」を復元する。
  var OLD_SUFFIX_START=/,\s*(high[- ]quality anime|clean detailed anime|high quality anime art style|realistic digital painting|soft watercolor|dark fantasy anime|dark fantasy)/i;
  // 我々のPREFIXが既に付いている場合の冪等化(先頭一致を剥がす)
  function stripOwnPrefix(s){
    for(var k=0;k<PREFIX.length;k++){ if(s.indexOf(PREFIX[k])===0) return s.slice(PREFIX[k].length).replace(/^[.\s,]+/,''); }
    for(var j=0;j<PREFIX_CREATURE.length;j++){ if(s.indexOf(PREFIX_CREATURE[j])===0) return s.slice(PREFIX_CREATURE[j].length).replace(/^[.\s,]+/,''); }
    return s;
  }
  // 外見コアからスタイル示唆語(=画風を勝手に上書きする犯人)を除去。物理的特徴は残す。
  function stripStyleWords(s){
    return s
      .replace(/\b(anime|manga|cartoon|chibi|2d)\b/gi,'')
      .replace(/\bcel[- ]shad(?:ed|ing)\b/gi,'')
      .replace(/\bin the style of[^,.。]*/gi,'')
      .replace(/アニメ調|アニメ風|アニメ絵|漫画風|漫画調|劇画調|劇画|ちびキャラ|デフォルメ調/g,'')
      .replace(/\s{2,}/g,' ').replace(/(^|[\s、])[,，]+/g,'$1').trim();
  }
  function isCreaturePrompt(raw){ return /creature concept art|non-human creature|monster design|no human face|no human body/i.test(raw); }

  function transformPrompt(raw){
    try{
      var idx=artIdx(); if(idx<0||idx>4) idx=3;
      var s=String(raw||''); if(!s) return raw;
      var creature=isCreaturePrompt(s);
      s=stripOwnPrefix(s);
      var m=OLD_SUFFIX_START.exec(s);
      if(m) s=s.slice(0,m.index);
      // 我々のcreature語が本文に混ざっていたら除去(旧creature suffix由来)
      s=s.replace(/,?\s*(non-human creature|monster design|no human face|no human body|creature concept art|full creature body visible)/gi,'');
      var core=stripStyleWords(s).replace(/[\s,，、]+$/,'').trim();
      if(!core) core='character';
      var pre=(creature?PREFIX_CREATURE:PREFIX)[idx];
      return pre+'. '+core;
    }catch(e){ return raw; }
  }
  window.__v292Dfix338.transformPrompt=transformPrompt; // test用

  // ------- 画像生成fetchをラップ(avatar=384x384 のみ整形) -------
  var _fetch=window.fetch;
  function isAvatarGen(url,init){
    try{
      var u=String(url||'');
      if(u.indexOf('gen.pollinations.ai')>=0 && u.indexOf('/images/generations')>=0){
        var b=init&&init.body; if(typeof b==='string' && b.indexOf('384x384')>=0) return 'post';
        return false;
      }
      if(u.indexOf('image.pollinations.ai/prompt/')>=0 && /width=384&height=384/.test(u)) return 'get';
    }catch(e){}
    return false;
  }
  window.fetch=function(url,init){
    try{
      if(on()){
        var kind=isAvatarGen(url,init);
        if(kind==='post' && init && typeof init.body==='string'){
          var j=JSON.parse(init.body);
          if(j && j.prompt){ j.prompt=transformPrompt(j.prompt); init=Object.assign({},init,{body:JSON.stringify(j)}); }
        } else if(kind==='get'){
          var mm=/\/prompt\/([^?]+)(\?.*)$/.exec(String(url));
          if(mm){ var dec=''; try{ dec=decodeURIComponent(mm[1]); }catch(_e){ dec=mm[1]; }
            var np=transformPrompt(dec);
            url=String(url).slice(0,mm.index)+'/prompt/'+encodeURIComponent(np)+mm[2];
          }
        }
      }
    }catch(e){ try{ console.warn(TAG,'wrap error',e); }catch(_){} }
    return _fetch.call(this,url,init);
  };

  // ------- 画風セレクタを5種に整理(従来→ダーク改称・SF追加) -------
  function patchSelector(){
    try{
      var sel=document.getElementById('v292-style-sel'); if(!sel) return;
      // option 3 のラベルを「ダーク」に
      var o3=sel.querySelector('option[value="3"]'); if(o3 && o3.textContent!=='ダーク') o3.textContent='ダーク';
      // SF(value 4)を追加
      if(!sel.querySelector('option[value="4"]')){
        var o=document.createElement('option'); o.value='4'; o.textContent='SF'; sel.appendChild(o);
      }
      sel.title=STYLE_TITLE;
      // 現在値を反映(index4等)
      try{ var c=getCfg(); if(c&&c.artStyle!=null) sel.value=String(+c.artStyle); }catch(_){}
    }catch(e){}
  }

  // ------- 全キャストのアイコンを現在の画風で作り直す -------
  function regenAllCast(){
    try{
      var f=window.__v292Dfix197||window.__v292Dfix199;
      if(f && typeof f.regenFor==='function'){
        var names={};
        try{ var S=getS(); if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name) names[S.cast.hero.name]=1; (S.cast.npcs||[]).forEach(function(n){ if(n&&n.name) names[n.name]=1; }); } }catch(_){}
        Object.keys(names).forEach(function(nm){ try{ f.regenFor(nm); }catch(_){} });
      }
      // fix197 sweep が data-avpk を外して新画風で再取得する(styleキー変化と同経路)
    }catch(e){}
  }
  window.__v292Dfix338.regenAllCast=regenAllCast;

  // ------- ジャンル→既定画風(おまかせから呼ばれる・上書き可) -------
  var GENRE_STYLE={ mh:3 /*現代怪異→ダーク*/, df:3 /*DF→ダーク*/, sf:4 /*SF→SF*/, hd:1 /*人間ドラマ→リアル*/ };
  function onGenre(g){
    try{
      if(!on()) return;
      var idx=GENRE_STYLE[g]; if(idx==null) return;
      var c=getCfg(); if(!c) return;
      c.artStyle=idx;
      try{ var S=getS(); if(S&&typeof S.save==='function') S.save(); }catch(_){}
      patchSelector();
      try{ var sel=document.getElementById('v292-style-sel'); if(sel) sel.value=String(idx); }catch(_){}
      try{ if(window.__aiAvatar&&window.__aiAvatar.refreshAll) window.__aiAvatar.refreshAll(); }catch(_){}
      try{ console.log(TAG,'genre',g,'→ style',idx,LABELS[idx]); }catch(_){}
    }catch(e){}
  }
  window.__v292Dfix338.onGenre=onGenre;
  window.__v292Dfix338.on=on;

  // セレクタは features.js が最大~10秒かけて注入するのでポーリングで追従(冪等)
  var n=0; var iv=setInterval(function(){ n++; if(on()) patchSelector(); if(n>60) clearInterval(iv); }, 400);
  try{ console.log(TAG,'loaded; active:', on()?'on':'off(preview)'); }catch(_){}
})();
