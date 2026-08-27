// Chronicle TRPG - v292Dfix77: 状態の記憶（state memory）
// 目的: fix76 の土台(からだ/こころ/本能)を「ターンを跨いで覚える」層。モデルに各キャラの
//   現在状態を <state> タグで吐かせ、解析して保存し、次ターンの system に再投入する。
//   これで前ターンの傷・恐怖・喪失が次ターンも効き続ける（=淡々リセットの解消）。
// 設計（おしんと合意）:
//   ・モデルは本文末に、状態が動いたキャラだけ次形式で出力:
//       <state who="名前" からだ="…" こころ="…" 本能="…"/>
//   ・3軸は自由記述（眼球貫通・腸が出る等の固有の傷もそのまま保持できる）
//   ・解析して store に保存（localStorage 永続）、表示からは必ず剥がす
//   ・次ターン: 保存済み状態を system に「各キャラの現在の状態」として注入
// 実装の要点（実機検証済み）:
//   ・parsePlan(rawString) は <state> を plan.narrative(配列) にそのまま通す＝parseExtension で
//     拾える。core は剥がさないので、ここで剥がさないと表示に漏れる→必ず strip する。
//   ・emit 指示と現在状態の注入は _extensions(system)。capture+strip は _parseExtensions。
// 互換: 純追加。<state> は fix77 が必ず strip するので表示漏れ無し。
// flag: window.__v292Dfix77Active
(function v292Dfix77(){
  'use strict';
  if (window.__v292Dfix77Active) return;
  window.__v292Dfix77Active = true;
  var TAG = '[v292Dfix77:state-memory]';
  var LSKEY = 'v292Dfix77States';
  /* ★fix539(2026-07-25・GPT監査P0): S の取得は index.html が提供する正式APIを第一経路にする。
     背景: 間接eval 頼みの取得が実機で無言のまま null を返し、判定が丸ごと空振りした
     (実測: normalizeConvWho が 0 件。詳細は index.html の fix539 コメント)。
     fix538b の「一度取れた S を覚える」永続キャッシュは、別スロットの S を握り続ける危険があるため撤去。
     以降の3経路は index.html が古いキャッシュのときだけ使う移行期の後方互換。 */
  function note539(feature, reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note(feature, reason, err); } catch(e){}
  }
  function getS77(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix77'); if (a) return a; } catch(e){ note539('fix77', 'getter-threw', e); }
    } else { note539('fix77', 'getter-missing'); }
    /* ここから下は index.html が fix539 より古いキャッシュのときだけ通る移行期の後方互換。
       ★fix539b(GPT裁定): 正式APIが失敗したのにフォールバックが救えた場合は必ず記録する
       (「getterは失敗するのに旧経路は成功する」が再捕獲できれば機序特定の決定打になる)。 */
    /* ★fix539c: window.S を lexical S より先に見る。理由は2つ:
         (1) GPTが示した統一形もこの順序。(2) **読取専用フォレンジックの土台**。
         配信JSを new Function へ流してモックwindowを渡す検証手法では、bare S は
         **本物のページの const S へ解決してしまう**(実測: モック7ターンのはずが本物38ターンを返した)。
         window.S を先に見れば、モックを渡した時にモックが勝つ。本番では window.S は
         undefined なので、この順序変更で本番の挙動は変わらない。 */
    try { if (window.S){ note539('fix77', 'rescued-by-window'); return window.S; } } catch(e){}
    try { if (typeof S !== 'undefined' && S){ note539('fix77', 'rescued-by-lexical'); return S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('fix77', 'rescued-by-eval'); return u; }
          note539('fix77', 'legacy-eval-null'); }
    catch(e){ note539('fix77', 'legacy-eval-threw', e); }
    return null;
  }
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  // ---- store（キャラ名 -> {karada,kokoro,honno,turn}）localStorage 永続 ----
  var store = (function(){ try { return JSON.parse(localStorage.getItem(LSKEY)||'{}') || {}; } catch(e){ return {}; } })();
  // v292Dfix223f: 既存ストアの値頭タグ断片(「<関係:」等)を一度だけ浄化(過去ターンの捕捉残骸)
  (function sanitize223f(){
    try{
      var changed=false;
      var clean=function(v){ if(v==null) return v; var x=String(v).replace(/^[\s　]*<\/?[^>\s:：]{1,12}[:：]?\s*/,'').replace(/[<>]/g,'').replace(/\s+/g,' ').trim(); if(x!==v) changed=true; return x; };
      Object.keys(store).forEach(function(n){ var s=store[n]; if(!s||typeof s!=='object') return;
        ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu'].forEach(function(k){ if(s[k]!=null) s[k]=clean(s[k]); });
      });
      if(changed){ localStorage.setItem(LSKEY, JSON.stringify(store)); }
    }catch(e){}
  })();
  /* ★fix532(2026-07-25・GPT監査がB-2の前提条件として先行を指名):
       このストアは**ページ読み込み時に1回だけ**読まれ `store` の参照が固定される。
       一方 fix246 は setItem のたびに 'v292Dfix77States' へ**その時点のアクティブスロット接尾辞**を付ける。
       つまり読み込み後にアクティブスロットが変わると、**前の物語の状態が丸ごと新しい物語のキーへ書かれる**。
       (features.js:5970 loadSlot は location.reload() しないため、この経路が成立しうる)
       実測の裏付け: 離島16ターンの物語の状態ストアに、廃墟遊園地の物語の5人だけが入っていた。
     現状 fix527(物語IDをURLで持つ)が「別idへの chr6_active_slot 書換」を遮断しているので**通常は休眠**だが、
     コードとしては残っているため、状態収穫を強化する前にここで塞ぐ(GPTの指名どおり)。
     方式: 読み込み時の接尾辞を覚え、**書き込み直前に食い違いを検出したら、書かずに新しい接尾辞のストアを
       読み直す**(自己修復)。前の物語のメモリ内容は破棄する = 別物語のものなのでそれが正しい。
     非破壊: 消すのはメモリ上の中身だけで localStorage は一切消さない。参照は保つ(他fixが掴んでいるため)。
     OFF: localStorage v292Dfix532Off='1' */
  function curSfx(){
    try {
      if (typeof window.__chr6Key === 'function'){ var k = window.__chr6Key(); return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : ''; }
      var a = JSON.parse(localStorage.getItem('chr6_active_slot') || 'null');
      return (a && a !== 'default') ? ('_slot_' + a) : '';
    } catch(e){ return ''; }
  }
  function off532(){ try { return localStorage.getItem('v292Dfix532Off') === '1'; } catch(e){ return false; } }
  var loadedSfx = curSfx();
  var stats = { slotMismatchReloads: 0, stateUpdatesDroppedOnReload: 0 };
  function persist(){
    try {
      if (!off532()){
        var now = curSfx();
        if (now !== loadedSfx){
          var fresh = {};
          try { fresh = JSON.parse(localStorage.getItem(LSKEY) || '{}') || {}; } catch(e2){ fresh = {}; }
          var dropped = Object.keys(store).length;
          Object.keys(store).forEach(function(k){ delete store[k]; });
          Object.keys(fresh).forEach(function(k){ store[k] = fresh[k]; });
          loadedSfx = now;
          /* ★fix532b(GPT非阻止指摘): 切替直後に捕捉した最初の<state>は、この読み直しで一緒に破棄されうる。
             データ混入より安全なので許容するが、B-2(状態候補選択)を出す前に実測できるよう診断値を残す。
             読出: window.__v292Dfix532.stats() */
          stats.slotMismatchReloads++;
          stats.stateUpdatesDroppedOnReload += dropped;
          try { console.log(TAG, 'fix532: 物語切替を検出 → 前の物語の状態を書かずにストアを読み直した', now, stats); } catch(_){}
          return;
        }
      }
      localStorage.setItem(LSKEY, JSON.stringify(store));
    } catch(e){}
  }
  window.__v292Dfix77Store = store;
  /* ★R118F Phase B(RULING118F-PREP Q3): 共有guarded commit(単一書込みゲート)。
     - raw persist(=setItem直呼び)は公開しない。公開するのは fix532 guard を必ず通る commit のみ。
     - 書き先スロットは persist 内部(curSfx)で導出。呼び出し側からキー指定は不可。
     - 引数 extStore は同一性検査のみに使う: fix77 の store と別オブジェクトなら書かない
       (caller支給の異物storeで上書きさせない・fail-closed)。
     - semantic ownership は変えない(fix190 の傷/関係/未解決はfix190のまま)。 */
  window.__v292Dfix77CommitStats = { committed: 0, foreignStoreRejected: 0 };
  window.__v292Dfix77Commit = function(extStore){
    try {
      if (extStore != null && extStore !== store){
        window.__v292Dfix77CommitStats.foreignStoreRejected++;
        return false;
      }
      persist();
      window.__v292Dfix77CommitStats.committed++;
      return true;
    } catch(e){ return false; }
  };
  window.__v292Dfix532 = { loadedSfx: function(){ return loadedSfx; }, curSfx: curSfx, off: off532,
    stats: function(){ return { slotMismatchReloads: stats.slotMismatchReloads, stateUpdatesDroppedOnReload: stats.stateUpdatesDroppedOnReload }; } };

  function attr(tag, name){
    var m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
    return m ? m[1].trim() : '';
  }

  // ---- (capture+strip) parseExtension: narrative 中の <state> を拾って保存、本文から除去 ----
  function captureState(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var re = /<state\b[^>]*?\/?>/g;
      var found = 0, m;
      // v292Dfix203: 読み元を ctx.raw（生テキスト）に変更。reactionVoiceExt(fix157①・
      //   _parseExtensions#3)が<react>処理時に<state>行ごとnarrativeから除去するため、
      //   narrative読みでは3軸(からだ/こころ/本能)が一度も保存されなかった
      //   （実測: 全キャラ3軸空・<react>共存rawで再現・拡張二分探索で犯人確定）。
      //   fix190(傷/関係/未解決)と同方式のraw読みなら上流の除去に影響されない。
      var src = (ctx && typeof ctx.raw === 'string' && ctx.raw) ? ctx.raw : plan.narrative.join('\n');
      re.lastIndex = 0;
      while ((m = re.exec(src)) !== null){
        var tag = m[0];
        var who = attr(tag,'who');
        if (who){
          var cur = store[who] || {};
          var ka = attr(tag,'からだ'), ko = attr(tag,'こころ'), ho = attr(tag,'本能');
          if (ka) cur.karada = ka;
          if (ko) cur.kokoro = ko;
          if (ho) cur.honno = ho;
          var mo = attr(tag,'目的'); if (mo) cur.mokuteki = mo; /* v292Dfix223b: いまの目的(瞬間・毎ターン更新可) */
          cur.turn = (function(){ var st=getS77(); return (st&&st.turns)?st.turns.length:0; })();   /* ★fix539 */
          store[who] = cur;
          found++;
        }
      }
      // narrativeからの<state>除去は安全網として従来通り（表示漏れ防止）
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line !== 'string') return line;
        return line.replace(re, '').trim();
      }).filter(function(l){ return l && String(l).trim().length > 0; });
      if (found > 0){ persist(); try { console.log(TAG,'captured',found,'state(s) [raw]'); } catch(_){} }
    } catch(e){ try { console.warn(TAG,'capture err:', e && e.message); } catch(_){} }
    return plan;
  }
  captureState.__v292Dfix77 = true;

  // ---- (emit + feedback) system 追記 ----
  var EMIT =
    '\n\n【状態の出力（fix77・必須）】\n' +
    '本文の最後に、今ターンで状態が動いたキャラだけ次形式で1行ずつ出力する（変化が無いキャラは省略可）:\n' +
    '<state who="名前" からだ="…" こころ="…" 本能="…"/>\n' +
    '・who は cast の名前。3軸は今この瞬間の状態を簡潔な自由記述で。\n' +
    '・このタグは本文（地の文・セリフ）には絶対に含めない。必ず本文の後に独立して置く。';

  function buildStatesBlock(){
    var names = Object.keys(store);
    if (!names.length) return '';
    var lines = [];
    names.forEach(function(n){
      var s = store[n]; if (!s) return;
      var parts = [];
      if (s.karada) parts.push('からだ:'+s.karada);
      if (s.kokoro) parts.push('こころ:'+s.kokoro);
      if (s.honno)  parts.push('本能:'+s.honno);
      if (parts.length) lines.push(n + '｜' + parts.join('／'));
    });
    if (!lines.length) return '';
    return '\n\n【各キャラの現在の状態（前ターンからの継続・必ず踏まえる）】\n' +
      lines.join('\n') +
      '\n・この状態を反応の前提にする。回復イベント無しに改善・平常化させない。';
  }

  function stateExt(ctx){
    try { if (ctx && typeof ctx.sys === 'string') return ctx.sys + EMIT + buildStatesBlock(); } catch(e){}
    return ctx && ctx.sys;
  }
  stateExt.__v292Dfix77 = true;

  // ---- install + selfHeal ----
  function install(){
    var P = getPlanner();
    if (!P){ setTimeout(install, 200); return false; }
    P._extensions = P._extensions || [];
    P._parseExtensions = P._parseExtensions || [];
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix77; })) P._extensions.push(stateExt);
    if (!P._parseExtensions.some(function(f){ return f && f.__v292Dfix77; })) P._parseExtensions.push(captureState);
    try { console.log(TAG,'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions) || !Array.isArray(P._parseExtensions)) return;
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix77; })) P._extensions.push(stateExt);
    if (!P._parseExtensions.some(function(f){ return f && f.__v292Dfix77; })) P._parseExtensions.push(captureState);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  setTimeout(install, 400); setTimeout(install, 1500); setTimeout(install, 4000);
  setInterval(selfHeal, 2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
