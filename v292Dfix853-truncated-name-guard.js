/* v292Dfix853 — TRUNCATED_NAME_GUARD (identity integrity)
 * ------------------------------------------------------------------
 * 問題（CONFIRMED_RUNTIME_LIVE / story smu2q10ls8k）:
 *   モデルが既知キャラ「菅野」の名前を切り詰めた <say who="野"> / <state who="野"> を出力し、
 *   fix77 captureState が who を**無検査で** store[who] へ登録 → fix333 presentNames() が
 *   「cast に無い store キー」を準登録 NPC として拾う → ghost「野」が前面化枠に 2 回侵入し、
 *   地の文にも 1 回出た。
 *   ★fix640/fix641 の cast 昇格ゲートは正しく働いており（promotions に 野 は無い）、
 *     漏れているのは **fix77 の store 登録経路だけ**。
 *
 * 方針（②C1 裁定 TRUNCATED_NAME_GUARD に従う）:
 *   ・新しい fuzzy identity engine を作らない。
 *   ・「1 文字だから拒否」のような一般規則を決め打ちしない。
 *   ・suffix/substring だけで既存人物へ**自動 merge しない**（誤 merge より abstention）。
 *   ・優先順位 1: 既存 cast/roster/name authority との**明確な衝突**を検出
 *              2: structured evidence 不足なら新規登録を **fail-closed**
 *              3: 既存 identity resolver（fix640 証拠台帳）を**再利用**する
 *
 * 判定（decide）— 新規 who に対してのみ動く:
 *   1. cast(hero/npcs) に居る          → 通す（cast は権威）
 *   2. 既に store キーとして確立している → 通す（既存キーは決して消さない）
 *   3. authority = cast ∪ 既存 store キー と**明確に衝突**するか？
 *        衝突 = 「authority のどれかの真部分文字列」または「authority のどれかを真に含む」
 *        衝突なし → 通す（従来どおり。新規固有名も、名前を持たない存在
 *                    ＝「異形」「謎の声」等の役割ラベルも一切影響を受けない）
 *        衝突あり → 4 へ
 *   4. 救済条件（fix640 台帳＝既存 identity resolver をそのまま読む）を全部満たすか？
 *        ・entry が存在する
 *        ・roleWord !== true かつ candidateType !== 'role-label'
 *        ・evidenceKinds に 'say_who' 以外（prose_name 等）が 1 つ以上ある
 *        満たす → 通す（別人として成立する独立証拠あり。1 文字名でも通る）
 *        満たさない → **BLOCK**（abstention。merge はしない・cast も roster も触らない）
 *
 * 実装: Planner._parseExtensions 内の fix77 captureState を包み、**その呼び出しの間だけ**
 *   ctx.raw から該当 <state> タグを外す（RR-1 と同じ shadow swap・finally で必ず復元）。
 *   store への書き込み自体が起きないので、永続化も他 consumer への波及も発生しない。
 *
 * 不変条件: 新 persistent schema 0 / 新 save format 0 / 新 localStorage キー 0 /
 *   SYS 新文面 0 / SYS 増分 0 byte / cast・roster・hero 経路不変 / 既存 store キー削除 0 /
 *   <say> は一切書き換えない（地の文・会話ログを壊さない）。
 * kill: localStorage['v292Dfix853Off'] = '1'
 */
(function(){
  var TAG='[v292Dfix853]';
  var W=(typeof window!=='undefined')?window:this;
  if(W.__v292Dfix853) return;
  W.__v292Dfix853=true;

  function lsg(k){ try{ return W.localStorage.getItem(k); }catch(e){ return null; } }
  function off(){ return lsg('v292Dfix853Off')==='1'; }
  function getS(){ try{ return W.__state||W._state||W.S||null; }catch(e){ return null; } }
  function store(){ try{ return W.__v292Dfix77Store||{}; }catch(e){ return {}; } }

  function slotId(){
    try{
      var m=String(W.location&&W.location.href||'').match(/[?&]story=([A-Za-z0-9_-]+)/);
      if(m) return m[1];
    }catch(e){}
    try{ var a=lsg('chr6_active'); if(a) return String(a).replace(/^"|"$/g,''); }catch(e){}
    try{ var S=getS(); if(S&&S.id) return String(S.id); }catch(e){}
    return '';
  }
  /* 既存 identity resolver（fix640 証拠台帳）をそのまま読む。書き込みはしない。 */
  function ledgerEntry(n){
    try{
      var sid=slotId(); if(!sid) return null;
      var L=JSON.parse(lsg('v292Dfix640Evid_slot_'+sid)||'null');
      if(!L||!L.entries) return null;
      return L.entries[n]||null;
    }catch(e){ return null; }
  }
  function hasIndependentEvidence(n){
    var e=ledgerEntry(n); if(!e) return false;
    /* 役割ラベルと判定されているものは「別人としての固有名」の証拠にはしない */
    if(e.roleWord===true) return false;
    if(String(e.candidateType||'')==='role-label') return false;
    var kinds=e.evidenceKinds||[];
    for(var i=0;i<kinds.length;i++){
      var k=String(kinds[i]||'');
      if(k && k!=='say_who') return true;      /* prose_name 等＝別人として成立する独立証拠 */
    }
    return false;
  }
  function castNames(){
    var out=[];
    try{ var S=getS(); if(!S||!S.cast) return out;
      if(S.cast.hero&&S.cast.hero.name) out.push(String(S.cast.hero.name));
      if(Object.prototype.toString.call(S.cast.npcs)==='[object Array]')
        S.cast.npcs.forEach(function(n){ if(n&&n.name) out.push(String(n.name)); });
    }catch(e){}
    return out;
  }

  var audit=[]; W.__v292Dfix853Audit=audit;

  function decide(n){
    n=String(n==null?'':n).replace(/^[\s　]+|[\s　]+$/g,'');
    if(!n) return {block:false, reason:'empty'};
    var cast=castNames();
    if(cast.indexOf(n)>=0) return {block:false, reason:'cast'};
    var keys=[]; try{ keys=Object.keys(store()); }catch(e){}
    if(keys.indexOf(n)>=0) return {block:false, reason:'established'};
    var auth=cast.concat(keys), col=[];
    for(var i=0;i<auth.length;i++){
      var a=String(auth[i]||'');
      if(!a || a===n || col.indexOf(a)>=0) continue;
      /* 明確な衝突は 2 方向。どちらも「同じ人物の別表記」である蓋然性が高い。
         (1) n が authority の真部分文字列（例: 野 ⊂ 菅野）＝ 切り詰め
         (2) n が authority を真に含む（例: 菅野の声 ⊃ 菅野）＝ 装飾つき重複 */
      if(n.length<a.length && a.indexOf(n)>=0){ col.push(a); continue; }
      if(a.length<n.length && n.indexOf(a)>=0){ col.push(a); continue; }
    }
    if(!col.length) return {block:false, reason:'no-collision'};
    if(hasIndependentEvidence(n)) return {block:false, reason:'independent-evidence', collides:col};
    return {block:true, reason:'NAME_FRAGMENT_COLLISION', collides:col};
  }
  W.__v292Dfix853decide=decide;

  var STATE_RE=/<state\b[^>]*?\/?>/g;
  function whoOf(tag){
    var m=String(tag).match(/who\s*=\s*"([^"]*)"/);
    if(m) return m[1];
    m=String(tag).match(/who\s*=\s*'([^']*)'/);
    return m?m[1]:'';
  }
  function filterRaw(raw){
    var blocked=[];
    STATE_RE.lastIndex=0;
    var out=String(raw).replace(STATE_RE, function(tag){
      var d=decide(whoOf(tag));
      if(d.block){ blocked.push({who:whoOf(tag), collides:d.collides}); return ''; }
      return tag;
    });
    return {text:out, blocked:blocked};
  }
  W.__v292Dfix853filter=filterRaw;

  /* ★v292DfixA4 r（GPT #127-NN §6 A4_RESCOPING・Local 試作・kill: localStorage v292DfixA4Off='1'）:
     まだ行が無い <state who="X"> の X が「既にいる主人公」へ一意に当たるときだけ、X の新しい人物行を作らない。
       一意に当たる = (a) fix853 自身の decide() が block を返し、衝突相手（collides）が全部、主人公の名前（空白を除いて同じ）
                     (b) 主人公の名前の空白違い（「朝霧蓮」）／アプリのラベル「主人公」で、登録 NPC に同じもの（空白を除いて）がいない
     そのときは tag を主人公の名前の tag に書き換え、からだ・傷 だけを渡す（こころ・本能・目的・関係・未解決は渡さない）。
     からだ・傷 が無ければ tag を外す。書き換えは fix77 captureState と fix190 captureExt の呼び出しの間だけ（ctx.raw の shadow swap）。
     登録 NPC へ当たる切れた名前（「早瀬」→「早瀬 透」など）・衝突相手が 2 人以上・既にある行（既存セーブ）・主人公が無い／名前が無い・
     fix853 OFF・kill・例外 → 従来どおり（1 バイトも変えない）。新しい判定器は足さない（decide をそのまま使う）。既存の行は消さない・まとめない。 */
  function offA4r(){ try{ return W.localStorage.getItem('v292DfixA4Off')==='1'; }catch(e){ return true; } }
  function nsA4r(x){ return String(x==null?'':x).replace(/[\s\u3000]+/g,''); }
  function heroOfA4r(who){
    try{
      var S=getS(); if(!S||!S.cast||!S.cast.hero) return null;
      var hn=S.cast.hero.name?String(S.cast.hero.name):''; if(!hn||/["<>]/.test(hn)) return null;
      var w=String(who==null?'':who).replace(/^[\s\u3000]+|[\s\u3000]+$/g,''); if(!w||w===hn) return null;
      var keys=[]; try{ keys=Object.keys(store()); }catch(e){}
      if(keys.indexOf(w)>=0) return null;                                   /* 既にある行は従来どおり */
      var npcs=[]; try{ if(Object.prototype.toString.call(S.cast.npcs)==='[object Array]') S.cast.npcs.forEach(function(n){ if(n&&n.name) npcs.push(String(n.name)); }); }catch(e){}
      if(npcs.indexOf(w)>=0) return null;                                    /* 登録 NPC そのもの */
      var hk=nsA4r(hn), x=nsA4r(w);
      if(x===hk||x==='主人公'){
        for(var i=0;i<npcs.length;i++){ if(nsA4r(npcs[i])===x) return null; }   /* 一意でない */
        return hn;
      }
      var d=decide(w); if(!d||d.block!==true||!d.collides||!d.collides.length) return null;
      for(var j=0;j<d.collides.length;j++){ if(nsA4r(d.collides[j])!==hk) return null; }   /* 主人公以外にも当たる＝従来どおり */
      return hn;
    }catch(e){ return null; }
  }
  function attrA4r(tag,k){ try{ var m=String(tag).match(new RegExp(k+'\\s*=\\s*"([^"]*)"')); return m?m[1].trim():''; }catch(e){ return ''; } }
  function routeA4r(raw){
    var routed=[];
    STATE_RE.lastIndex=0;
    var out=String(raw).replace(STATE_RE, function(tag0){
      var who=whoOf(tag0), hn=heroOfA4r(who); if(!hn) return tag0;
      var tag=tag0; try{ var X=W.__v292Dfix938x; if(X&&typeof X.norm==='function'&&!X.off()) tag=X.norm(tag0); }catch(_n){}
      var ka=attrA4r(tag,'からだ'), ki=attrA4r(tag,'傷');
      routed.push({who:who, to:hn, karada:!!ka, kizu:!!ki});
      if(!ka&&!ki) return '';
      return '<state who="'+hn+'"'+(ka?' からだ="'+ka+'"':'')+(ki?' 傷="'+ki+'"':'')+'/>';
    });
    return {text:out, routed:routed};
  }
  var auditA4r=W.__v292DfixA4r={ routed:0, calls:[], last:null };
  function noteA4r(where, r){ try{ auditA4r.routed+=r.routed.length; auditA4r.last={ where:where, routed:r.routed }; if(auditA4r.calls.length<40) auditA4r.calls.push({ t:Date.now(), where:where, routed:r.routed }); }catch(_a){} }
  W.__v292DfixA4rRoute=routeA4r;

  /* ★v292Dfix853p（GPT #127-NT §1・NPC_STATE_CORRUPTION P1 の分割案・kill: localStorage v292Dfix853pOff='1'）:
     853 が止める <state who=X> のうち、既存の fix830 resolver が「登録 NPC 1 人の、区切りで分かれた丸ごと 1 パート（PART_EXACT）
     ／作者が書いた別名（ALIAS_EXACT）／異体字（FOLDED_EXACT）」と答えるものだけは止めない（PC の並びで通るのと同じ）。
     統合はしない（fix830 裁定 74 のまま）。「壁」⊂「真壁 誠」・「瀬」・「真壁 誠の声」など、それ以外の衝突は全ての並びで従来どおり止める。
     並び替えはしない。新しい判定器・保存キー・sys の文面・通信は無い。fix830 が無い／OFF／例外 → 従来どおり止める。 */
  function off853p(){ try{ return W.localStorage.getItem('v292Dfix853pOff')==='1'; }catch(e){ return true; } }
  var diag853p=W.__v292Dfix853p={ passed:0, kept:0, last:[] };
  function partNpc853p(who){
    try{
      if(off853p()) return '';
      var R=W.__v292Dfix830; if(!R||typeof R.resolve!=='function') return '';
      var S=getS(); var hn=(S&&S.cast&&S.cast.hero&&S.cast.hero.name)?String(S.cast.hero.name):'';
      var npcs=[]; try{ if(Object.prototype.toString.call(S.cast.npcs)==='[object Array]') S.cast.npcs.forEach(function(n){ if(n&&n.name) npcs.push(String(n.name)); }); }catch(e){}
      var r=R.resolve(who, (hn?[hn]:[]).concat(npcs));
      if(!r||!r.matched||r.ambiguous) return '';
      if(r.kind!=='PART_EXACT' && r.kind!=='ALIAS_EXACT' && r.kind!=='FOLDED_EXACT') return '';
      if(r.matched===hn || npcs.indexOf(r.matched)<0) return '';
      return r.matched;
    }catch(e){ return ''; }
  }

  function wrap(){
    try{
      var P=W.Planner; if(!P||!P._parseExtensions||!P._parseExtensions.length) return false;
      for(var i=0;i<P._parseExtensions.length;i++){
        var f=P._parseExtensions[i];
        if(!f||!f.__v292Dfix77) continue;
        if(f.__f853) return true;                       /* 既に包んである */
        var orig=f;
        var wrapped=function(plan, ctx){
          if(off()) return orig(plan, ctx);
          var raw=(ctx && typeof ctx.raw==='string') ? ctx.raw : null;
          if(raw===null) return orig(plan, ctx);         /* raw が無い経路は一切触らない */
          var a4r=null;                                   /* ★v292DfixA4 r: 主人公へ一意に当たる tag の書き換え（先に行う） */
          try{ if(!offA4r()){ a4r=routeA4r(raw); if(a4r.routed.length) noteA4r('fix77', a4r); else a4r=null; } }catch(_e4){ a4r=null; }
          var r;
          try{ r=filterRaw(a4r ? a4r.text : raw); }catch(e){ return orig(plan, ctx); }   /* fail-open */
          if(r.blocked.length && !off853p()){                  /* ★v292Dfix853p: 登録 NPC の丸ごと 1 パートだけ通す */
            try{
              var pass853p={}, nb=[];
              r.blocked.forEach(function(b){ var m=partNpc853p(b.who); if(m) pass853p[b.who]=m; else nb.push(b); });
              if(nb.length!==r.blocked.length){
                STATE_RE.lastIndex=0;
                var src853p=(a4r ? a4r.text : raw);
                var txt853p=String(src853p).replace(STATE_RE, function(tag){ var w=whoOf(tag); if(pass853p[w]) return tag; var d=decide(w); return d.block ? '' : tag; });
                diag853p.passed+=(r.blocked.length-nb.length); diag853p.kept+=nb.length;
                if(diag853p.last.length<20) diag853p.last.push(Object.keys(pass853p).map(function(k){ return k+'→'+pass853p[k]; }).join(','));
                r={text:txt853p, blocked:nb};
              }
            }catch(_p){}
          }
          if(!r.blocked.length && !a4r) return orig(plan, ctx);
          var prev=ctx.raw;
          try{
            ctx.raw=r.text;
            if(!r.blocked.length) return orig(plan, ctx);
            audit.push({t:Date.now(), turn:(function(){ try{ var S=getS(); return (S&&S.turns)?S.turns.length:-1; }catch(e){ return -1; } })(),
                        blocked:r.blocked});
            try{ console.warn(TAG,'blocked ghost state key(s):', r.blocked.map(function(b){return b.who+'⊂'+(b.collides||[]).join(',');}).join(' / ')); }catch(_){}
            return orig(plan, ctx);
          } finally { try{ ctx.raw=prev; }catch(_){} }
        };
        /* fix77 の selfHeal が「__v292Dfix77 を持つ関数が居ない」と判断して素の captureState を
           再 push しないよう、タグを必ず引き継ぐ。own property は無条件にコピーする。 */
        try{ Object.getOwnPropertyNames(orig).forEach(function(k){
          if(k==='length'||k==='name'||k==='prototype') return;
          try{ wrapped[k]=orig[k]; }catch(_e){}
        }); }catch(_e2){}
        wrapped.__v292Dfix77=true; wrapped.__f853=true;
        P._parseExtensions[i]=wrapped;
        try{ console.log(TAG,'captureState wrapped'); }catch(_){}
        return true;
      }
    }catch(e){ try{ console.warn(TAG,'wrap err', e&&e.message); }catch(_){} }
    return false;
  }
  W.__v292Dfix853wrap=wrap;
  /* ★v292DfixA4 r: fix190 captureExt も同じ書き換えの間だけ呼ぶ（主人公の別名の空の行を先に作らせない）。書き換えが無い回は素通し。 */
  function wrap190A4r(){
    try{
      var P=W.Planner; if(!P||!P._parseExtensions||!P._parseExtensions.length) return false;
      for(var i=0;i<P._parseExtensions.length;i++){
        var f=P._parseExtensions[i];
        if(!f||!f.__v292Dfix190) continue;
        if(f.__a4r) return true;
        var orig=f;
        var wrapped=function(plan, ctx){
          if(off()||offA4r()) return orig(plan, ctx);
          var raw=(ctx && typeof ctx.raw==='string') ? ctx.raw : null;
          if(raw===null) return orig(plan, ctx);
          var a; try{ a=routeA4r(raw); }catch(e){ return orig(plan, ctx); }
          if(!a.routed.length) return orig(plan, ctx);
          noteA4r('fix190', a);
          var prev=ctx.raw;
          try{ ctx.raw=a.text; return orig(plan, ctx); } finally { try{ ctx.raw=prev; }catch(_){} }
        };
        try{ Object.getOwnPropertyNames(orig).forEach(function(k){
          if(k==='length'||k==='name'||k==='prototype') return;
          try{ wrapped[k]=orig[k]; }catch(_e){}
        }); }catch(_e2){}
        wrapped.__v292Dfix190=true; wrapped.__a4r=true;
        P._parseExtensions[i]=wrapped;
        return true;
      }
    }catch(e){}
    return false;
  }

  if(!wrap()){
    var tries=0;
    var iv=setInterval(function(){ tries++; if(wrap()||tries>60) clearInterval(iv); }, 300);
  }
  /* fix77 の selfHeal が 2 秒ごとに走るため、取りこぼしても次の tick で包み直す */
  setInterval(function(){ try{ wrap(); }catch(e){} try{ wrap190A4r(); }catch(e2){} }, 2000);
  if(!wrap190A4r()){ var t4=0; var iv4=setInterval(function(){ t4++; if(wrap190A4r()||t4>60) clearInterval(iv4); }, 300); }
  try{ console.log(TAG,'loaded'); }catch(_){}
})();
