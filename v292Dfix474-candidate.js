// =====================================================================
// Chronicle TRPG - v292Dfix474: アイコン候補方式（候補表示→採用→元へ戻す）
// ---------------------------------------------------------------------
// ★2026-07-15・GPT-5.6 設計指示（条件付きGO）を実装:
//   ・候補は localStorage でも chr6av でもなく、**別IndexedDB `chr6cand`** に保存（Blob）。
//     → fix399/fix402 の同期対象に原理的に混ざらない。QuotaExceeded の心配もない。
//   ・baseline は「候補セッション開始時の本画像・レシピ・chr6.avatar」の**不変スナップショット**（chr6cand内）。
//     `v292av2_<pk>_bak` のような本番キーは作らない。
//   ・採用は **journal付き疑似トランザクション**（PREPARED→MAIN→RECIPE→VERIFIED→COMMITTED）。
//     途中失敗や起動時の未完了journalは **baselineへロールバック**。
//   ・採用のコミットは **localStorage.setItem('v292av2_<pk>') の通常経路**で行う（調査で確定）:
//       fix346→IndexedDB(chr6av) 保存 ＋ fix402→サーバーへ putimg ＋ fix411→ローカル優先。
//     これで **リロード後・cloud pull後も採用画像が残る**（fix400のサーバーURLも新画像になる）。
//   ・候補は provider=together / fallback=false / 384x384 / SHA一致 でなければ保存・採用しない。
//   ・fingerprint（activeSlot/pk/名前/説明hash/artStyle）が採用時に一致しなければ採用拒否。
//   ・UI は fix474 が注入（fix145 本体は変更しない）。
//
// opt-in: localStorage v292Dfix474OnV1='1'（**既定OFF**）。
// 検証口: window.__v292Dfix474
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix474 && window.__v292Dfix474.__armed) return;
  var TAG = '[v292Dfix474:candidate]';
  var CAND_DB = 'chr6cand', CAND_VER = 1;
  var LS_IMG = 'v292av2_', LS_REC = 'v292avrec_';

  function onV1(){ try { return localStorage.getItem('v292Dfix474OnV1') === '1'; } catch(e){ return false; } }

  // ---- 小道具 ----
  function getS(){ try { return window.S || (0,eval)('S'); } catch(e){ return null; } }
  function artStyle(){ try { var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); } catch(e){ return '0'; } }
  function canonName(n){ try { var f=window.__v292Dfix197||window.__v292Dfix199; if (f&&f.canonName) return f.canonName(n); } catch(e){} return String(n||''); }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }
  function pkOf(name){ return 'n' + hash(canonName(name) + '|' + artStyle()); }
  function activeSlot(){ try { return JSON.parse(localStorage.getItem('chr6_active_slot')||'"chr6"'); } catch(e){ return 'chr6'; } }
  function sessionId(){
    try { var k='v292Dfix474_sid'; var v=sessionStorage.getItem(k); if(!v){ v=Date.now().toString(36)+Math.random().toString(36).slice(2,8); sessionStorage.setItem(k,v);} return v; }
    catch(e){ return 'nosession'; }
  }
  function descOf(name){
    try { var S=getS(); if(!S||!S.cast) return '';
      if (S.cast.hero && S.cast.hero.name===name) return String(S.cast.hero.desc||'');
      var a=S.cast.npcs||[]; for(var i=0;i<a.length;i++){ if(a[i]&&a[i].name===name) return String(a[i].desc||''); }
    } catch(e){} return '';
  }
  function fingerprint(name){
    return { slot: activeSlot(), pk: pkOf(name), name: canonName(name), artStyle: artStyle(), descHash: hash(descOf(name)) };
  }
  function fpEqual(a,b){ return a&&b&&a.slot===b.slot&&a.pk===b.pk&&a.name===b.name&&a.artStyle===b.artStyle&&a.descHash===b.descHash; }

  function sha256Hex(buf){
    return crypto.subtle.digest('SHA-256', buf).then(function(h){
      var b=new Uint8Array(h), s=''; for(var i=0;i<b.length;i++) s+=(b[i]<16?'0':'')+b[i].toString(16); return s;
    });
  }
  function dataUrlToBuf(u){ var b64=String(u).split(',')[1]||''; var bin=atob(b64), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return a.buffer; }
  function bufToDataUrl(buf, mime){ var b=new Uint8Array(buf), s=''; for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]); return 'data:'+(mime||'image/jpeg')+';base64,'+btoa(s); }
  function blobToDataUrl(blob){ return new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){res(fr.result);}; fr.onerror=function(){rej(fr.error);}; fr.readAsDataURL(blob); }); }
  function imgSize(dataUrl){ return new Promise(function(res){ var im=new Image(); im.onload=function(){res({w:im.naturalWidth,h:im.naturalHeight});}; im.onerror=function(){res({w:0,h:0});}; im.src=dataUrl; }); }

  // ---- chr6cand IndexedDB ----
  function openDB(){
    return new Promise(function(res,rej){
      try {
        var r=indexedDB.open(CAND_DB, CAND_VER);
        r.onupgradeneeded=function(e){ var db=e.target.result;
          if(!db.objectStoreNames.contains('records'))  db.createObjectStore('records', {keyPath:'id'});
          if(!db.objectStoreNames.contains('baseline')) db.createObjectStore('baseline', {keyPath:'key'});
          if(!db.objectStoreNames.contains('journal'))  db.createObjectStore('journal',  {keyPath:'id'});
        };
        r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); };
      } catch(e){ rej(e); }
    });
  }
  function tx(store, mode, fn){
    return openDB().then(function(db){ return new Promise(function(res,rej){
      var t=db.transaction(store, mode), st=t.objectStore(store), out;
      try { out=fn(st); } catch(e){ rej(e); return; }
      t.oncomplete=function(){ try{db.close();}catch(_){} res(out&&out.__req!==undefined ? out.__req.result : out); };
      t.onerror=function(){ try{db.close();}catch(_){} rej(t.error); };
      t.onabort=function(){ try{db.close();}catch(_){} rej(t.error||new Error('abort')); };
    }); });
  }
  function reqVal(req){ return new Promise(function(res){ req.onsuccess=function(){res(req.result);}; req.onerror=function(){res(undefined);}; }); }
  function put(store, val){ return tx(store,'readwrite',function(st){ st.put(val); }); }
  function get(store, key){ return openDB().then(function(db){ return new Promise(function(res){ var q=db.transaction(store,'readonly').objectStore(store).get(key); q.onsuccess=function(){ try{db.close();}catch(_){}; res(q.result); }; q.onerror=function(){ try{db.close();}catch(_){}; res(undefined); }; }); }); }
  function del(store, key){ return tx(store,'readwrite',function(st){ st.delete(key); }); }
  function allByPk(store, pk){ return openDB().then(function(db){ return new Promise(function(res){ var out=[]; var c=db.transaction(store,'readonly').objectStore(store).openCursor(); c.onsuccess=function(e){ var cur=e.target.result; if(cur){ if(!pk||cur.value.pk===pk) out.push(cur.value); cur.continue(); } else { try{db.close();}catch(_){}; res(out); } }; c.onerror=function(){ try{db.close();}catch(_){}; res(out); }; }); }); }

  // ---- 候補の import（生成結果 or fixture）----
  //   provider=together / fallback=false / 384x384 / SHA一致 を満たさなければ拒否。
  function importCandidate(name, dataUrl, meta){
    if (onV1()===false) return Promise.reject(new Error('fix474 OFF'));
    meta = meta || {};
    if (meta.provider !== 'together') return Promise.reject(new Error('provider must be together (got '+meta.provider+')'));
    if (meta.fallback === true || meta.fallback === '1' || meta.fallback === 1) return Promise.reject(new Error('fallback candidate rejected'));
    var buf = dataUrlToBuf(dataUrl);
    return Promise.all([ sha256Hex(buf), imgSize(dataUrl) ]).then(function(r){
      var sha=r[0], sz=r[1];
      if (sz.w!==384 || sz.h!==384) throw new Error('size must be 384x384 (got '+sz.w+'x'+sz.h+')');
      if (meta.sha256 && meta.sha256 !== sha) throw new Error('sha mismatch');
      var mime = (String(dataUrl).match(/^data:([^;]+)/)||[])[1] || 'image/jpeg';
      var blob = new Blob([buf], {type:mime});
      var rec = {
        id: 'cand_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        sessionId: sessionId(), slotId: activeSlot(), pk: pkOf(name), characterName: canonName(name),
        characterFingerprint: fingerprint(name),
        blob: blob, sha256: sha, bytes: buf.byteLength, width: 384, height: 384, mime: mime,
        appearancePrompt: meta.appearancePrompt||'', fullPrompt: meta.fullPrompt||'',
        promptVersion: meta.promptVersion||'', styleVersion: meta.styleVersion||'',
        styleTailSha256: meta.styleTailSha256||'',
        seed: meta.seed, provider: 'together', fallback: false,
        model: meta.model||'', steps: meta.steps!=null?meta.steps:null,
        createdAt: Date.now()
      };
      return put('records', rec).then(function(){ return rec.id; });
    });
  }

  // ---- baseline のスナップショット（セッション×pk に1回だけ）----
  function baselineKey(pk){ return sessionId()+'|'+activeSlot()+'|'+pk; }
  function snapshotBaseline(name){
    var pk=pkOf(name), key=baselineKey(pk);
    return get('baseline', key).then(function(exist){
      if (exist) return exist;
      var img=null, rec=null, av=null;
      try { img = localStorage.getItem(LS_IMG+pk); } catch(e){}
      try { rec = localStorage.getItem(LS_REC+pk); } catch(e){}
      try { var S=getS(); if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name===name) av=S.cast.hero.avatar||null; else { var a=S.cast.npcs||[]; for(var i=0;i<a.length;i++){ if(a[i]&&a[i].name===name){ av=a[i].avatar||null; break; } } } } } catch(e){}
      var snap={ key:key, pk:pk, slotId:activeSlot(), sessionId:sessionId(), img:img, rec:rec, avatar:av, createdAt:Date.now() };
      return put('baseline', snap).then(function(){ return snap; });
    });
  }

  // ---- 採用（journal付き疑似トランザクション）----
  function adopt(candId){
    if (onV1()===false) return Promise.reject(new Error('fix474 OFF'));
    var rec, jrn={ id:'j_'+candId, candId:candId, state:'PREPARED', ts:Date.now() };
    return get('records', candId).then(function(r){
      if(!r) throw new Error('candidate not found');
      rec=r;
      // fingerprint 一致確認（別スロット/改名/設定変更後の候補は拒否）
      var fp=fingerprint(rec.characterName);
      if(!fpEqual(fp, rec.characterFingerprint)) throw new Error('fingerprint mismatch (slot/pk/name/desc/style changed)');
      if(rec.provider!=='together' || rec.fallback===true) throw new Error('non-together/fallback candidate cannot be adopted');
      return snapshotBaseline(rec.characterName);
    }).then(function(baseline){
      if(!baseline) throw new Error('baseline missing');
      return blobToDataUrl(rec.blob).then(function(dataUrl){
        return sha256Hex(dataUrlToBuf(dataUrl)).then(function(sha){
          if(sha!==rec.sha256) throw new Error('candidate sha changed');
          return put('journal', jrn).then(function(){
            // MAIN: 本キーへ書く（通常経路 → fix346 IDB + fix402 putimg）
            var recipe = JSON.stringify({ p: rec.fullPrompt||rec.appearancePrompt, s: rec.seed, m: rec.model||'flux' });
            try { localStorage.setItem(LS_IMG+rec.pk, dataUrl); } catch(e){ throw new Error('main write failed: '+e); }
            jrn.state='MAIN_IMAGE_WRITTEN'; return put('journal', jrn);
          }).then(function(){
            var recipe = JSON.stringify({ p: rec.fullPrompt||rec.appearancePrompt, s: rec.seed, m: rec.model||'flux' });
            try { localStorage.setItem(LS_REC+rec.pk, recipe); } catch(e){ throw new Error('recipe write failed: '+e); }
            jrn.state='RECIPE_WRITTEN'; return put('journal', jrn);
          }).then(function(){
            // VERIFIED: 通常経路が反映されたか（cache/persist を close→reopen で再読込）
            var cur=''; try { cur = localStorage.getItem(LS_IMG+rec.pk)||''; } catch(e){}
            return sha256Hex(dataUrlToBuf(cur)).then(function(sha2){
              if(sha2!==rec.sha256) throw new Error('verify failed: stored image sha != candidate');
              jrn.state='VERIFIED'; return put('journal', jrn);
            });
          }).then(function(){
            jrn.state='COMMITTED'; jrn.committedAt=Date.now(); return put('journal', jrn);
          }).then(function(){
            // 表示更新（fix197 の再スイープ）
            try { var f=window.__v292Dfix197||window.__v292Dfix199; if(f&&f.sweep) f.sweep(); } catch(e){}
            return { ok:true, pk:rec.pk };
          });
        });
      });
    }).catch(function(err){
      // 失敗 → baseline へ復元
      return restore(rec?rec.characterName:'').then(function(){ throw err; }, function(){ throw err; });
    });
  }

  // ---- 元へ戻す（baseline から byte-for-byte 復元）----
  function restore(name){
    if(!name) return Promise.resolve(false);
    var pk=pkOf(name), key=baselineKey(pk);
    return get('baseline', key).then(function(b){
      if(!b) return false;
      try { if(b.img==null) localStorage.removeItem(LS_IMG+pk); else localStorage.setItem(LS_IMG+pk, b.img); } catch(e){}
      try { if(b.rec==null) localStorage.removeItem(LS_REC+pk); else localStorage.setItem(LS_REC+pk, b.rec); } catch(e){}
      try { var S=getS(); if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name===name) S.cast.hero.avatar=b.avatar; else { var a=S.cast.npcs||[]; for(var i=0;i<a.length;i++){ if(a[i]&&a[i].name===name){ a[i].avatar=b.avatar; break; } } } } } catch(e){}
      try { var f=window.__v292Dfix197||window.__v292Dfix199; if(f&&f.sweep) f.sweep(); } catch(e){}
      return true;
    });
  }

  function discard(candId){ return del('records', candId); }
  function listCandidates(name){ return allByPk('records', pkOf(name)); }

  // ---- 起動時: 未完了 journal があれば baseline へロールバック ----
  function recoverJournals(){
    return allByPk('journal', null).then(function(js){
      var pend = js.filter(function(j){ return j.state && j.state!=='COMMITTED'; });
      return Promise.all(pend.map(function(j){
        return get('records', j.candId).then(function(rec){
          var nm = rec? rec.characterName : null;
          return (nm? restore(nm): Promise.resolve()).then(function(){ return del('journal', j.id); });
        });
      })).then(function(){ if(pend.length) try{ console.warn(TAG,'未完了journal '+pend.length+'件をbaselineへロールバック'); }catch(e){} });
    }).catch(function(){});
  }

  // ---- UI（fix474 が注入。fix145 本体は変更しない）----
  function el(tag, css, txt){ var e=document.createElement(tag); if(css)e.style.cssText=css; if(txt!=null)e.textContent=txt; return e; }
  function activeName(){ try { var S=getS(); return (S&&S.cast&&S.cast.hero&&S.cast.hero.name)||''; } catch(e){ return ''; } }

  function openModal(name){
    closeModal();
    var ov=el('div','position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center');
    ov.id='v292Dfix474-ov'; ov.onclick=function(e){ if(e.target===ov) closeModal(); };
    var mo=el('div','background:#14151c;color:#eee;max-width:900px;width:92%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px;font:13px sans-serif');
    mo.onclick=function(e){ e.stopPropagation(); };
    var h=el('div','font-size:16px;color:#a0a0ff;margin-bottom:8px', '🎨 アイコン候補: '+name);
    mo.appendChild(h);
    var body=el('div'); mo.appendChild(body);
    ov.appendChild(mo); document.body.appendChild(ov);
    render(name, body);
  }
  function closeModal(){ var o=document.getElementById('v292Dfix474-ov'); if(o&&o.parentNode) o.parentNode.removeChild(o); }

  function render(name, body){
    body.innerHTML='';
    var pk=pkOf(name);
    var cur=el('div','margin:8px 0'); 
    var curImg=el('img','width:120px;height:120px;border-radius:8px;border:1px solid #444;object-fit:cover');
    try { curImg.src = localStorage.getItem(LS_IMG+pk) || ''; } catch(e){}
    cur.appendChild(el('div','color:#9aa;margin-bottom:4px','現在のアイコン')); cur.appendChild(curImg);
    body.appendChild(cur);
    var revBtn=el('button','margin:6px 8px 12px 0;padding:6px 10px;background:#4a4a6a;color:#fde;border:1px solid #669;border-radius:6px;cursor:pointer','↩ 元へ戻す');
    revBtn.onclick=function(){ restore(name).then(function(ok){ alert(ok?'採用前の状態へ戻しました':'戻せる履歴がありません'); render(name, body); }); };
    body.appendChild(revBtn);
    body.appendChild(el('hr','border-color:#333'));
    body.appendChild(el('div','color:#9aa;margin:6px 0','候補（採用するまで現在のアイコンは変わりません）'));
    var grid=el('div','display:flex;flex-wrap:wrap;gap:12px'); body.appendChild(grid);
    listCandidates(name).then(function(cs){
      if(!cs.length){ grid.appendChild(el('div','color:#777','候補がありません。「候補を作る」で生成してください。')); return; }
      cs.sort(function(a,b){return a.createdAt-b.createdAt;});
      cs.forEach(function(c){
        var card=el('div','width:200px;border:1px solid #333;border-radius:8px;padding:8px');
        var url; try{ url=URL.createObjectURL(c.blob); }catch(e){ url=''; }
        var im=el('img','width:184px;height:184px;border-radius:6px;object-fit:cover'); im.src=url;
        card.appendChild(im);
        var meta=el('div','font-size:11px;color:#9aa;margin:4px 0','seed '+c.seed+' / '+c.provider+' / fb '+(c.fallback?'1':'0')+' / '+(c.model||'?')+' / steps '+(c.steps!=null?c.steps:'?'));
        card.appendChild(meta);
        var row=el('div','display:flex;gap:6px');
        var ad=el('button','flex:1;padding:6px;background:#3a5a3a;color:#dfd;border:1px solid #585;border-radius:6px;cursor:pointer','採用');
        ad.onclick=function(){ if(!confirm('この候補を採用します。よろしいですか？')) return; adopt(c.id).then(function(){ alert('採用しました'); try{URL.revokeObjectURL(url);}catch(e){} render(name, body); }, function(err){ alert('採用に失敗（元へ戻しました）: '+(err&&err.message||err)); render(name, body); }); };
        var dz=el('button','padding:6px 8px;background:#5a3a3a;color:#fdd;border:1px solid #855;border-radius:6px;cursor:pointer','破棄');
        dz.onclick=function(){ discard(c.id).then(function(){ try{URL.revokeObjectURL(url);}catch(e){} render(name, body); }); };
        row.appendChild(ad); row.appendChild(dz); card.appendChild(row);
        grid.appendChild(card);
      });
    });
  }

  function injectBtn(){
    try {
      if (!onV1()) return;
      if (document.querySelector('.v292Dfix474-btn')) return;
      var host=document.getElementById('npcList'); if(!host||!host.parentNode) return;
      var b=el('button','display:block;width:100%;box-sizing:border-box;margin:4px 0 10px;padding:8px 10px;background:#3a4a5a;border:1px solid #69a;color:#def;border-radius:6px;cursor:pointer;font-size:13px','🖼 アイコン候補を見る（主人公）');
      b.className='v292Dfix474-btn';
      b.onclick=function(e){ e.preventDefault(); var n=activeName(); if(!n){ alert('主人公が見つかりません'); return; } openModal(n); };
      host.parentNode.insertBefore(b, host);
    } catch(e){}
  }
  try { if(onV1()){ setTimeout(injectBtn,1500); setInterval(injectBtn,4000); } } catch(e){}

  window.__v292Dfix474 = {
    __armed:true, onV1:onV1,
    importCandidate:importCandidate, listCandidates:listCandidates,
    snapshotBaseline:snapshotBaseline, adopt:adopt, discard:discard, restore:restore,
    pkOf:pkOf, fingerprint:fingerprint, sessionId:sessionId,
    _openDB:openDB, _get:get, _put:put, _del:del, openModal:openModal, injectBtn:injectBtn,
    status:function(){ return { onV1:onV1(), sessionId:sessionId(), slot:activeSlot() }; }
  };
  if (onV1()) { try { recoverJournals(); } catch(e){} try { console.log(TAG,'armed (opt-in ON)'); } catch(e){} }
  else { try { console.log(TAG,'loaded (既定OFF・v292Dfix474OnV1=1で有効)'); } catch(e){} }
})();
