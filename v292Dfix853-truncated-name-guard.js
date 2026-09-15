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
          var r;
          try{ r=filterRaw(raw); }catch(e){ return orig(plan, ctx); }   /* fail-open */
          if(!r.blocked.length) return orig(plan, ctx);
          var prev=ctx.raw;
          try{
            ctx.raw=r.text;
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

  if(!wrap()){
    var tries=0;
    var iv=setInterval(function(){ tries++; if(wrap()||tries>60) clearInterval(iv); }, 300);
  }
  /* fix77 の selfHeal が 2 秒ごとに走るため、取りこぼしても次の tick で包み直す */
  setInterval(function(){ try{ wrap(); }catch(e){} }, 2000);
  try{ console.log(TAG,'loaded'); }catch(_){}
})();
