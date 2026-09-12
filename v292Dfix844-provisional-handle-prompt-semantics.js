// =====================================================================
// v292Dfix844 — PROVISIONAL_HANDLE_PROMPT_SEMANTICS v2.1
// ---------------------------------------------------------------------
// ②C1 裁定 BW Q42:
//   DEFAULT_OFF + EXPLICIT_CANARY_ON + OFF_OVERRIDE
//   「コードを production へ置いただけでは挙動が変わらない」
//   fix830 WS / SIG と同時投入しないこと。
//
// ■ 何を直すか（PRECANONICAL_HANDLE_FEEDBACK_LOOP の封じ込め）
//   fix307 の背景 LLM が本文から作った追跡用 handle は、
//   fix409 に無条件で【正式呼称】へ昇格され、fix445 の【呼称の固定】にも載る。
//   その結果、次の本文 LLM が「その名前が正式名だ」と教え込まれ、ループする。
//   本 fix は **その handle を強いブロックから外し、弱い【暫定呼称】欄へ移す**だけ。
//
// ■ 直さないもの（意図的に手を出さない）
//   ・fix77 store の二重キー（少女 / シオン など）＝ STATE_KEY_RECONCILIATION は対象外
//   ・cross-ledger の identity 同一視                 ＝ 権威なしに統合しない
//   ・地の文の一般名詞（「少女」）                     ＝ BACKLOG
//   ・fix192 stateBlock の旧 identity 再注入           ＝ STALE_STATEBLOCK_REINJECTION は残る
//
// ■ 絶対にしないこと
//   ・_convSays を書き換えない  ・fix307 roster を書き換えない・消さない
//   ・PART / FOLD / 近接 / 類似で判定しない（**文字列完全一致のみ**）
//   ・roster に無い handle（例: 宿の主人 / 主人公）を巻き込んで消さない
//   ・state / cast / localStorage を書かない  ・LLM を呼ばない
//
// ■ 有効化（3 段。既定では何も起きない）
//   OFF_OVERRIDE   localStorage['v292Dfix844Off']  === '1'   → 常に無効（最優先）
//   STORY_CANARY   localStorage['v292Dfix844On_slot_<slot>'] === '1'
//   GLOBAL_ON      localStorage['v292Dfix844On']   === '1'
//   どれも立っていなければ **load しても install しない**（production 挙動と byte 一致）。
//   fix379 側の off フラグも 'v292Dfix844Off' を見るため、
//   【暫定呼称】欄は OFF_OVERRIDE 単独でも注入されない（二重の安全弁）。
//
// ■ load order
//   fix307 / fix409 / fix445 / fix379 より **後**（script 末尾でよい）。
//   install は f379 registry の該当 entry を包むだけなので、
//   それらが未ロードなら install() は false を返して何もしない。
//
// ■ rollback
//   1) localStorage.setItem('v292Dfix844Off','1') → 次の生成から production 挙動
//   2) 即時に戻したい場合は window.__v292Dfix844.uninstall()
//   3) 完全撤去は index.html の script 行を削るだけ（他 fix への依存を作っていない）
//
// 検証口: window.__v292Dfix844
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix844 && window.__v292Dfix844.__armed) return;

  var M_CANON='【正式呼称】', M_LOCK='【呼称の固定】', M_PROV='【暫定呼称】';
  var _installed=false, _orig={}, _provReg=null;

  /* ---- 有効化ゲート（②C1 BW Q42: DEFAULT_OFF + EXPLICIT_CANARY_ON + OFF_OVERRIDE） ---- */
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function slot(){ return str(ls('chr6_active_slot')||'').replace(/"/g,''); }
  function offOverride(){ return ls('v292Dfix844Off')==='1'; }
  function enabled(){
    if (offOverride()) return false;                       /* 最優先で殺す */
    if (ls('v292Dfix844On')==='1') return true;            /* GLOBAL_ON */
    var s=slot();
    if (s && ls('v292Dfix844On_slot_'+s)==='1') return true; /* STORY_CANARY */
    return false;                                          /* DEFAULT_OFF */
  }

  function str(v){ return (v==null)?'':String(v); }
  function api307(){ try{ return window.__v292Dfix307api||null; }catch(e){ return null; } }
  function f445(){ try{ return window.__v292Dfix445||null; }catch(e){ return null; } }
  function reg(){ try{ return window.__f379reg || (window.__f379reg=[]); }catch(e){ return []; } }
  function getS(){ try{ var g=window.__chronicleGetState; return (typeof g==='function')?g():window.S; }catch(e){ return null; } }

  function rosterHandles(){
    var A=api307(); if(!A||typeof A.loadRoster!=='function') return [];
    var out=[],seen={};
    try{ var r=A.loadRoster()||[];
      for(var i=0;i<r.length;i++){ var h=str(r[i]&&r[i].handle).trim(); if(h&&!seen[h]){seen[h]=1;out.push(h);} }
    }catch(e){}
    return out;
  }
  function castNames(){
    var out=[],seen={}, S=getS();
    try{ if(S&&S.cast){
      var push=function(n){ n=str(n).trim(); if(n&&!seen[n]){seen[n]=1;out.push(n);} };
      if(S.cast.hero) push(S.cast.hero.name);
      (S.cast.npcs||[]).forEach(function(n){ if(n) push(n.name); });
    } }catch(e){}
    return out;
  }
  /* ACTIVE_PROVISIONAL_SET = roster handles − exact cast names（完全一致のみ） */
  function activeProvisionalSet(){
    var cast=castNames(), hs=rosterHandles(), out=[];
    for(var i=0;i<hs.length;i++){ if(cast.indexOf(hs[i])>=0) continue; out.push(hs[i]); }
    return out;
  }
  /* fix445 の rawWiChars 相当（:243-253 と同じ条件。type==='character' のみ） */
  function wiChars(){
    try{
      var slot=''; try{ slot=str(localStorage.getItem('chr6_active_slot')||'').replace(/"/g,''); }catch(e){}
      var raw=null;
      try{ raw=localStorage.getItem('chr6_v292Dfix136_wi_slot_'+slot); }catch(e){}
      if(raw==null){ try{ raw=localStorage.getItem('chr6_v292Dfix136_wi'); }catch(e){} }
      var arr=JSON.parse(raw||'[]')||[], out=[];
      for(var i=0;i<arr.length;i++){ var w=arr[i]; if(w&&w.name&&w.type==='character') out.push(str(w.name).trim()); }
      return out;
    }catch(e){ return []; }
  }

  /* ★v2.1（裁定 BU）: roster を **全部**隠すのは契約より広い。
     ACTIVE_PROVISIONAL_SET に該当する **row だけ**を一時的に除外して production 関数へ渡す。
     v2 は loadRoster を [] にしていたため、ACTIVE でない handle（cast と同名の row）の
     位置情報まで消え、【正式呼称】の並び順が変わっていた。
     「消す対象ではなかった row を消さない」だけであり、順序のために情報を復元しているのではない。 */
  function withoutProvisionalRows(fn){
    var A=api307();
    if(!A||typeof A.loadRoster!=='function') return fn();
    var prov=activeProvisionalSet();                 /* ★入替の **前**に確定させる */
    if(!prov.length) return fn();                    /* 除くものが無いなら production そのまま */
    var save=A.loadRoster;
    A.loadRoster=function(){
      var rows=[];
      try{ rows=save.apply(A, arguments)||[]; }catch(e){ return []; }
      var out=[];
      for(var i=0;i<rows.length;i++){
        var h=str(rows[i]&&rows[i].handle).trim();
        if(h && prov.indexOf(h)>=0) continue;        /* ACTIVE_PROVISIONAL の row だけ落とす */
        out.push(rows[i]);
      }
      return out;
    };
    try{ return fn(); } finally { A.loadRoster=save; }
  }

  function provisionalBlock(){
    var list=activeProvisionalSet();
    if(!list.length) return '';
    return M_PROV+'本文から抽出された追跡用の仮呼称（正式呼称ではない）: '+list.join('、')
         +'。これらを正式呼称として固定しない。';
  }

  /* 【呼称の固定】: production の関数で作り直す。文字列手術はしない。 */
  function lockTextFiltered(origText, entry){
    var orig;
    try{ orig = origText.call(entry); }catch(e){ return ''; }
    if (!orig) return orig;                       /* off / 名前不足 → production と同じ */
    var F=f445();
    if (!F || typeof F.knownHandles!=='function' || typeof F.buildLockText!=='function') return orig;
    var prov=activeProvisionalSet();
    if (!prov.length) return orig;                /* 除くものが無いなら production そのまま */
    var names;
    try{ names = F.knownHandles(getS(), (api307()? api307().loadRoster() : []), wiChars()) || []; }
    catch(e){ return orig; }
    var kept=[];
    for(var i=0;i<names.length;i++){ if(prov.indexOf(names[i])>=0) continue; kept.push(names[i]); }
    if (kept.length < 2) return '';               /* production の lockTextFn と同じ guard */
    try{ return F.buildLockText(kept); }catch(e){ return orig; }
  }

  function install(force){
    if(_installed) return true;
    if(offOverride()) return false;              /* force でも OFF_OVERRIDE は破れない */
    if(!force && !enabled()) return false;       /* DEFAULT_OFF */
    var R=reg(), hitCanon=false, hitLock=false;
    for(var i=0;i<R.length;i++){
      var e=R[i]; if(!e) continue;
      if(e.marker===M_CANON && !e.__f844){
        _orig[M_CANON]=e.text;
        (function(entry){ var o=entry.text;
          entry.text=function(){ return withoutProvisionalRows(function(){ return o.call(entry); }); };
          entry.__f844=true; })(e);
        hitCanon=true;
      } else if(e.marker===M_LOCK && !e.__f844){
        _orig[M_LOCK]=e.text;
        (function(entry){ var o=entry.text;
          entry.text=function(){ return lockTextFiltered(o, entry); };
          entry.__f844=true; })(e);
        hitLock=true;
      }
    }
    if(!hitCanon && !hitLock) return false;
    if(!_provReg){ _provReg={off:'v292Dfix844Off',marker:M_PROV,prio:4,text:provisionalBlock,__f844:true}; R.push(_provReg); }
    _installed=true; return true;
  }
  function uninstall(){
    var R=reg();
    for(var i=0;i<R.length;i++){ var e=R[i];
      if(e&&e.__f844&&_orig[e.marker]){ e.text=_orig[e.marker]; delete e.__f844; } }
    if(_provReg){ var k=R.indexOf(_provReg); if(k>=0) R.splice(k,1); _provReg=null; }
    _orig={}; _installed=false; return true;
  }

  window.__v292Dfix844={ __armed:true,
    version:'PROVISIONAL_HANDLE_PROMPT_SEMANTICS v2.1 (fix844 / DEFAULT_OFF)',
    install:install, uninstall:uninstall, installed:function(){return _installed;},
    enabled:enabled, offOverride:offOverride, gate:function(){
      return { OFF_OVERRIDE:offOverride(), GLOBAL_ON:ls('v292Dfix844On')==='1',
               STORY_CANARY:(function(){ var s=slot(); return !!(s && ls('v292Dfix844On_slot_'+s)==='1'); })(),
               slot:slot(), enabled:enabled(), installed:_installed };
    },
    activeProvisionalSet:activeProvisionalSet, rosterHandles:rosterHandles,
    castNames:castNames, wiChars:wiChars, provisionalBlock:provisionalBlock,
    MARKER_PROV:M_PROV };

  /* ---- 自動起動: ゲートが開いているときだけ。既定では何も起きない ---- */
  try{ if (enabled()) install(); }catch(e){}
})();
