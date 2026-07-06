// =====================================================================
// Chronicle TRPG - v292Dfix393: 絵柄をそろえ直す（統一テンプレで全キャラ描き直し）
// おしん依頼(2026-07-06): キャラのアイコンが画風バラバラ。原因=features.js内に
//   似顔絵プロンプトの組み立て経路が複数あり、キャラごとに形が違う（一部に"anime
//   portrait of"等の画風語が混入・一部は地の文説明そのまま）。「そろえる」は不揃いな
//   説明文のまま描き直すので揃わない。
// 方針(fix197非破壊・単独モジュール):
//   ボタン「🎨 絵柄をそろえ直す」を押すと、全キャストについて
//   ①desc を AI(本文モデル)で「英語の見た目一文」に純化抽出（画風語を含めない）
//   ②統一テンプレ = <見た目一文> + <同一の画風サフィックス(darkfantasy)> で全員同形に
//   ③Worker /image(プロキシ経由・キーはWorkerが付与) で生成
//   ④結果を fix197 のキャッシュ(v292av2_+pk)＋レシピ(v292avrec_+pk)へ保存
//   ⑤fix197.sweep() で表示反映
//   → 見た目は各キャラ固有・形式と画風は完全統一＝そろう。fix391で以後は消えても再現。
// コスト: 押した時だけ生成（1人あたり画像1枚+抽出1コール≒コンマ数円）。確認ダイアログ付き。
// プレビュー: 既定はボタン非表示。localStorage v292Dfix393='1' でボタン表示。
//   全OFF: v292Dfix393Off='1'。検証: window.__v292Dfix393x.{unifyAll,dryRun,status}。
// =====================================================================
(function(){
  'use strict';
  if (window.__f393done) return; window.__f393done = 1;
  var TAG = '[v292Dfix393:restyle-unify]';
  // features.js / fix197 と同値の darkfantasy(闇アニメ系) サフィックス（全員これで統一）
  var STYLE_SUFFIX = ', dark fantasy anime character portrait, head and shoulders, visible clothing, detailed face, dim moody lighting, muted desaturated colors, dark shadowy background, pale skin, somber gothic horror atmosphere, high quality';
  var API = 'https://gen.pollinations.ai/v1/images/generations'; // fix247がプロキシ /image へ書換
  var LS_AV = 'v292av2_', LS_REC = 'v292avrec_';

  function preview(){ try { return localStorage.getItem('v292Dfix393') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix393Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function getApi(){ try { return window.Api || (0,eval)('typeof Api!=="undefined"?Api:null'); } catch(e){ return null; } }
  function fix197(){ return window.__v292Dfix197 || window.__v292Dfix199 || null; }
  function keyFor(name){ var f=fix197(); return (f&&f.keyFor)?f.keyFor(name):('n'+hash(String(name||'')+'|0')); }
  function pollKey(){ try { var S=getS(); return String((S&&S.cfg&&S.cfg.pollKey)||'').trim(); } catch(e){ return ''; } }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h); }
  function seedFor(name){ return hash(String(name||'')) % 1000000000; }

  function b64ToDataUrl(b64){
    var mime='image/png';
    if(b64.charAt(0)==='/') mime='image/jpeg';
    else if(b64.slice(0,5)==='iVBOR') mime='image/png';
    else if(b64.slice(0,6)==='R0lGOD') mime='image/gif';
    else if(b64.slice(0,4)==='UklG') mime='image/webp';
    return 'data:'+mime+';base64,'+b64;
  }

  // キャスト（hero + npcs）を {name, desc} で収集
  function castList(){
    var out=[]; var S=getS();
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push({ name:String(S.cast.hero.name), desc:String(S.cast.hero.desc||'') });
        var ns=S.cast.npcs||[];
        for (var i=0;i<ns.length;i++){ if (ns[i]&&ns[i].name) out.push({ name:String(ns[i].name), desc:String(ns[i].desc||'') }); }
      }
    } catch(e){}
    return out;
  }

  // desc → 英語の見た目一文（画風語を含めない・純外見）。失敗時は '' を返す。
  function extractAppearance(name, desc){
    return new Promise(function(resolve){
      var api=getApi();
      if (!api || typeof api.call!=='function' || !String(desc).trim()){ resolve(''); return; }
      var sys=[ 'You output ONE concise English appearance line for a character image prompt.',
        'Describe ONLY physical looks: hair (color/length/style), eyes, age range, sex, skin, clothing, distinctive features.',
        'Use noun phrases. Do NOT include story events, actions, place, mood, or any art-style/medium words (no "anime", "portrait", "realistic", etc.).',
        'Output only the one English line.' ].join('\n');
      var user='Character: '+name+'\nDescription:\n'+String(desc).slice(0,400)+'\n\nAppearance (one English line):';
      var done=false; var to=setTimeout(function(){ if(!done){ done=true; resolve(''); } }, 20000);
      try {
        api.call(sys, user, 200, { allowShort:true }).then(function(r){
          if (done) return; done=true; clearTimeout(to);
          var t=(((r&&r.text)||'')).replace(/<[^>]+>/g,'').trim().split(/\r?\n/)[0].replace(/^["'「『\s]+|["'」』\s]+$/g,'').slice(0,160);
          resolve(t||'');
        }).catch(function(){ if(!done){ done=true; clearTimeout(to); resolve(''); } });
      } catch(e){ if(!done){ done=true; clearTimeout(to); resolve(''); } }
    });
  }

  // 統一プロンプトを組み立て
  function buildPrompt(apprEn, name){
    var head = apprEn && apprEn.length>=3 ? apprEn : ('a character named '+name);
    return head + STYLE_SUFFIX;
  }

  // 1キャラを統一プロンプトで生成 → キャッシュ+レシピ保存
  function genOne(name, desc, onProgress){
    return extractAppearance(name, desc).then(function(apprEn){
      var pk=keyFor(name);
      var prompt=buildPrompt(apprEn, name);
      var seed=seedFor(name);
      var body={ model:'flux', prompt:prompt, n:1, size:'384x384', seed:seed };
      var key=pollKey();
      var headers={ 'Content-Type':'application/json' };
      if (key) headers['Authorization']='Bearer '+key; // プロキシONならfix247が外してWorkerが付与
      return fetch(API, { method:'POST', headers:headers, body:JSON.stringify(body) })
        .then(function(r){ if(!r.ok) throw r.status; return r.json(); })
        .then(function(j){ var b=j&&j.data&&j.data[0]&&(j.data[0].b64_json||j.data[0].base64); if(!b) throw 'nob64';
          var d=b64ToDataUrl(b);
          try { localStorage.setItem(LS_AV+pk, d); } catch(e){}                 // fix346ラッパでIDBへ
          try { localStorage.setItem(LS_REC+pk, JSON.stringify({p:prompt,s:seed,m:'flux'})); } catch(e){} // fix391レシピ
          if (onProgress) onProgress(name, true);
          return true;
        })
        .catch(function(err){ if (onProgress) onProgress(name, false, err); return false; });
    });
  }

  // 全キャラを直列で描き直し
  function unifyAll(opts){
    opts=opts||{};
    if (off()) { alert('この機能は無効化されています(v292Dfix393Off)'); return; }
    var cast=castList();
    if (!cast.length){ alert('キャラが見つかりません'); return; }
    if (!opts.skipConfirm){
      var est=(cast.length*0.15).toFixed(1);
      if (!confirm('登場キャラ '+cast.length+'人 の絵柄を同じ形にそろえて描き直します。\n1人あたり約0.1〜0.2円・合計 約'+est+'円ぶんの生成が発生します。\n\nよろしいですか？')) return;
    }
    var btn=document.querySelector('.v292Dfix393-btn');
    var i=0, okN=0, ngN=0;
    function step(){
      if (i>=cast.length){
        try { var f=fix197(); if (f&&f.sweep) f.sweep(); } catch(e){}
        if (btn){ btn.disabled=false; btn.textContent='🎨 絵柄をそろえ直す'; }
        alert('完了: 成功 '+okN+' / 失敗 '+ngN+'（'+cast.length+'人）\n反映まで数秒かかることがあります。');
        try { console.log(TAG, 'done ok='+okN+' ng='+ngN); } catch(e){}
        return;
      }
      var c=cast[i++];
      if (btn){ btn.textContent='そろえ中… ('+i+'/'+cast.length+') '+c.name; }
      genOne(c.name, c.desc, function(nm, ok){ if(ok)okN++; else ngN++; }).then(function(){
        setTimeout(step, 1500); // 直列・最小間隔（レート回避）
      });
    }
    if (btn){ btn.disabled=true; }
    step();
  }

  // 生成せずに、何が作られるかだけ確認（無料・検証用）
  function dryRun(){
    var cast=castList();
    return Promise.all(cast.map(function(c){
      return extractAppearance(c.name, c.desc).then(function(a){ return { name:c.name, pk:keyFor(c.name), seed:seedFor(c.name), promptLen: buildPrompt(a,c.name).length, apprOk: !!(a&&a.length>=3) }; });
    }));
  }

  // ---- ボタン注入（画風セレクタ横）----
  function injectBtn(){
    try {
      if (off()) return;   // ボタンは既定表示（押す=確認ダイアログ+生成なので安全・iPhoneでもスイッチ不要）
      if (document.querySelector('.v292Dfix393-btn')) return;
      var sel=document.getElementById('v292-style-sel');
      var anchor=sel ? (sel.closest('label')||sel.parentNode) : null;
      if (!anchor || !anchor.parentNode) return;
      var b=document.createElement('button');
      b.className='v292Dfix393-btn';
      b.textContent='🎨 絵柄をそろえ直す';
      b.title='全キャラの似顔絵を同じ形・同じ画風で描き直して統一します（押した時だけ生成）';
      b.style.cssText='margin:0 4px; padding:6px 10px; background:#5a3a5a; border:1px solid #916; color:#fde; border-radius:6px; cursor:pointer; font-size:13px;';
      b.onclick=function(e){ e.preventDefault(); unifyAll(); };
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
      try { console.log(TAG, 'button injected'); } catch(e){}
    } catch(e){}
  }
  setTimeout(injectBtn, 1200); setTimeout(injectBtn, 3000); setInterval(injectBtn, 4000);

  window.__v292Dfix393x = { unifyAll: unifyAll, dryRun: dryRun, status: function(){ return { preview:preview(), off:off(), cast:castList().map(function(c){return c.name;}) }; } };
  try { console.log(TAG, 'loaded (preview='+(preview()?'1':'0')+', off='+(off()?'1':'0')+')'); } catch(e){}
})();
