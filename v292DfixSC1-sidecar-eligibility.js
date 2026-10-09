/* ★v292DfixSC1 — SIDECAR_ROLLBACK / PERSISTED_ELIGIBILITY / PRE_GENERATION_PROVENANCE_GATE / STALE_ASYNC_WRITE_PREVENTION
   （GPT 正式裁定「Astra 巻き戻し・sidecar 整合性研究 → 自律実装指示」2026-10-09。Offline 候補。本番 HOLD）
   r2: 独立レビュー（7 件 + 3 件）の反映版。
   r3: GPT #125-BF 必須修正（厳密な履歴一致・手編集は保守的に失効・退避は上限超過でも捨てない・取消の保存失敗中は生成停止・OFF の意味の明記）。

   適格性 = 「その値を作ったターンが、いまの本文の履歴に実在するか」。
   ・目印（anchor）= fix926 turnId と同じ材料（playerText + 本文全体）の **厳密一致**。
     正規化は決定的・限定的: NFC、空白・改行の除去、句読点・記号（。、．，・…‥ダッシュ類 〜 ！？ 括弧類 引用符）の除去だけ。
     漢字・かな・英字・数字・否定・人名・出来事の文字は 1 文字でも違えば不一致（似た文章でも別履歴）。
     確認できない値は未確認として保持し、自動では戻さない。手編集で文字が変われば、そのターン由来の値は保守的に失効（再付け替えしない）。
   ・states77（fix77 / fix190 / fix325 / fix277 が書く。読み手は 20 以上）:
       entry._sc1t / _sc1a … commit 時に entry.turn と、そのターンの目印。
       entry._sc1p[f] = [起点ターン, 値hash, 起点ターンの目印hash] … 項目ごとの起点（値が変わったターン）。
     判定（項目ごと）:
       - entry.turn < 本文長 かつ _sc1t===turn の目印が一致 → 全項目そのまま。
       - entry.turn ≥ 本文長（取消・短い本文）→ 起点が本文内に実在する項目は残す。起点が分からない項目（旧データ）
         と起点が取り消された項目だけ退避。→ 以前から続く 傷/関係/未解決 を巻き添えにしない。
       - 目印が一致しない（同じ番号で別履歴）→ 起点の目印が一致する項目だけ残し、他は退避。
       - _sc1t が turn と違う（fix277 の別名統合・fix325 の再導出・旧データ）→ メタデータ無し扱い（長さだけ判定）。
     不適格な値は消さず、同じ entry の _sc1x（最大 3 層）へ移す。見える項目しか読まない全読み手で「生成に入れない」が成立。
     起点の目印が再び一致したら（redo・保存失敗後の再読込）項目単位で戻す。
   ・roster307（fix307 が書く。firstTurn/lastTurn は抽出カーソルのターン）:
       原本は書き換えない。読み手（api.loadRoster）へだけ「今の履歴で見えてよい形」を返す（view）。
       抽出結果を適用する直前（同じ書込 transaction の中）だけ、隠れている外見を _sc1x へ移す（再抽出で古い外見が復活しない）。
       隠れた人物の呼称は抽出プロンプトの既存台帳には残す（同一人物に別の呼称を作らせない）。
   ・生成: TURN_BUILD の内側で照合 → 生成中に本文の先頭が変われば PARSE / REWRITE / COMMIT を止める。
     生成中（自動再送の待ち時間を含む）は取消・やり直し・二重送信を受け付けない（世代の取り違えを根元で防ぐ）。
   ・fix307 抽出: 開始時より本文が短くなった／開始時の最終ターンが変わった時だけ捨てる（先へ進んだだけなら書く）。

   しないこと: 値の推測・補完・「不明」の正常化・傷/関係/未解決の解決・lastTurn の切り詰め・旧セーブの一括修復・
     新 Store・新 localStorage key・Worker/Schema 変更・LLM 呼び出し。
   書き込み: admission（fix748 Class D）の内側だけ。起動時はメモリ上の見え方だけ直す。
   適用範囲: v292DfixSC1On='1' かつ v292DfixSC1Stories に物語 id（それ以外は旧動作）。
   kill: localStorage v292DfixSC1Off='1' → 全フック素通り（旧動作）。退避済みの値は自動では戻らず、_sc1x / _sc1o に保持されたまま。 */
(function v292DfixSC1(){
  if (window.__v292DfixSC1) return;
  var TAG = '[v292DfixSC1]';
  var VER = 'sc1-r3s';
  var F77 = ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu','からだ','こころ','本能','目的','傷','関係','未解決'];
  var XCAP = 3;
  var stats = { reconcile: 0, inv77: 0, invField77: 0, restoredField77: 0, staleGen: 0, staleRoster: 0, refusedBusy: 0,
                stamps77: 0, stamps307: 0, persist77: 0, apprArchived307: 0, reborn307: 0, saveFailKept: 0, restamped: 0, errors: 0 };
  var log = [];
  function note(o){ try { o.t = Date.now(); log.push(o); if (log.length > 60) log.shift(); } catch(e){} }
  /* ★r3 適用範囲（GPT #125-BF: 既存 46T を含む実セーブへ自動適用しない・初回は Owner の QA 物語に限定）:
     動くのは「この端末で v292DfixSC1On='1'」かつ「この document の物語 id が v292DfixSC1Stories（カンマ区切り）に載っている」時だけ。
     範囲外の物語・未設定の端末では全フック素通り＝旧動作（保存値も 1 バイトも変えない）。kill v292DfixSC1Off='1' は常に最優先。 */
  function storyId(){
    try { var k = window.__chronicleDocumentStoryKey; if (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) return k.slice(10); } catch(e){}
    return null;
  }
  function inScope(){
    try {
      if (localStorage.getItem('v292DfixSC1On') !== '1') return false;
      var id = storyId(); if (!id) return false;
      var list = String(localStorage.getItem('v292DfixSC1Stories') || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
      return list.indexOf(id) >= 0;
    } catch(e){ return false; }
  }
  function off(){ try { if (localStorage.getItem('v292DfixSC1Off') === '1') return true; } catch(e){ return true; } return !inScope(); }
  function getS(){ try { if (window.S) return window.S; } catch(e){} try { return (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function getG(){ try { if (window.G) return window.G; } catch(e){} try { return (0,eval)('typeof G!=="undefined"?G:null'); } catch(e){ return null; } }
  function turnsOf(){ var s = getS(); return (s && Array.isArray(s.turns)) ? s.turns : null; }
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---- 目印（厳密一致） ---- */
  function h32(str){ var h = 5381; str = String(str); for (var i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; } return (h >>> 0).toString(16); }
  function f32(str){ var h = 0x811c9dc5; str = String(str); for (var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
  function H(str){ return h32(str) + f32(str); }                        /* 64bit 相当（衝突を実用上無視できる長さ） */
  function narrText(t){ var n = t && t.narrative; if (Array.isArray(n)) n = n.join('\n'); return String(n == null ? '' : n); }
  var RE_NORM = /[\s　。、．，,.・･…‥—―–‐－\-〜～~！？!?「」『』（）()【】［］\[\]〈〉“”"'’‘]/g;
  function norm(s){ s = String(s == null ? '' : s); try { s = s.normalize('NFC'); } catch(e){} return s.replace(RE_NORM, ''); }
  function anchor(t){
    if (!t || typeof t !== 'object') return null;
    return 's2:' + H(norm(t.playerText || '')) + ':' + H(norm(narrText(t)));
  }
  function match(a, t){ return !!(a && t) && String(a).indexOf('s2:') === 0 && anchor(t) === a; }
  function ah(t){ var a = anchor(t); return a ? h32(a) : null; }        /* 項目起点用の短い目印（完全一致・不一致は保守側＝退避） */
  function head(){
    if (off()) return null;
    var T = turnsOf(); if (!T) return null;
    return T.length + '|' + (T.length ? anchor(T[T.length - 1]) : 'empty');
  }
  /* fix307 用: 開始時の先頭が今の履歴の祖先なら（先へ進んだだけなら）古くない */
  function mark(){ if (off()) return null; var T = turnsOf(); if (!T) return null; return { len: T.length, a: T.length ? anchor(T[T.length - 1]) : null }; }
  function staleSince(m){
    if (!m || off()) return false;
    var T = turnsOf(); if (!T) return false;
    if (T.length < m.len) return true;
    if (m.len > 0 && !match(m.a, T[m.len - 1])) return true;
    return false;
  }

  /* ---- 退避の層（最新 XCAP 層は自動復元の候補。それより古い層は _sc1o へ畳む＝値は捨てない・自動復元しない） ---- */
  function pushLayer(e, x, kind){
    var L = [x].concat(Array.isArray(e._sc1x) ? e._sc1x : []);
    if (L.length > XCAP){
      var over = L.slice(XCAP); L = L.slice(0, XCAP);
      e._sc1o = Array.isArray(e._sc1o) ? e._sc1o : [];
      over.forEach(function(o){ e._sc1o.push(o); });                    /* 原本は全部残す（上限超過時の明示動作） */
      stats.overflow = (stats.overflow || 0) + over.length;
    }
    e._sc1x = L;
  }

  /* ---- states77 ---- */
  function visible77(e){ var v = {}, n = 0; F77.forEach(function(f){ if (e[f] != null && e[f] !== '') { v[f] = e[f]; n++; } }); return n ? v : null; }
  function originOk(e, f, T){                                           /* 項目 f の起点が今の履歴に実在するか（不明なら false） */
    var p = e._sc1p && e._sc1p[f];
    if (!p || p[1] !== h32(String(e[f]))) return false;
    return typeof p[0] === 'number' && p[0] < T.length && p[2] === ah(T[p[0]]);
  }
  function judge77(e, T){                                               /* null = 全部そのまま / {why, drop:[fields]} */
    if (!e || typeof e !== 'object') return null;
    var v = visible77(e); if (!v) return null;
    if (typeof e.turn !== 'number') return null;                       /* turn を持たない旧 entry */
    var stamped = !!(e._sc1a && e._sc1t === e.turn);
    var why = null;
    if (e.turn >= T.length) why = 'LEN';
    else if (stamped && !match(e._sc1a, T[e.turn])) why = 'ANCHOR';
    if (!why) return null;
    var drop = Object.keys(v).filter(function(f){ return !originOk(e, f, T); });
    return drop.length ? { why: why, drop: drop } : { why: why, drop: [], keepAll: true };
  }
  function inv77(e, j, T){
    if (!j.drop.length){ delete e._sc1a; delete e._sc1t; return false; }    /* 起点が全部実在＝値は全部残す（entry の目印だけ外す） */
    var v = {}, p = {};
    j.drop.forEach(function(f){ v[f] = e[f]; if (e._sc1p && e._sc1p[f]) p[f] = e._sc1p[f]; delete e[f]; if (e._sc1p) delete e._sc1p[f]; });
    var x = { t: e.turn, a: e._sc1a || null, at: T.length, why: j.why, v: v, p: p };
    pushLayer(e, x, '77');
    delete e._sc1a; delete e._sc1t;
    stats.inv77++; stats.invField77 += j.drop.length;
    return true;
  }
  function restore77(e, T){
    if (!e || typeof e !== 'object' || !Array.isArray(e._sc1x) || !e._sc1x.length) return false;
    var n = 0;
    e._sc1x.forEach(function(x){
      if (!x || !x.v) return;
      var whole = !!(x.a && typeof x.t === 'number' && x.t < T.length && match(x.a, T[x.t]));   /* redo・保存失敗後の再読込 */
      Object.keys(x.v).forEach(function(f){
        if (e[f] != null && e[f] !== '') return;                          /* 新しい値がある項目は戻さない */
        var p = x.p && x.p[f];
        var ok = whole || !!(p && typeof p[0] === 'number' && p[0] < T.length && p[2] === ah(T[p[0]]));
        if (!ok) return;
        e[f] = x.v[f]; if (p){ e._sc1p = e._sc1p || {}; e._sc1p[f] = p; }
        delete x.v[f]; n++;
      });
      if (whole && e.turn === x.t){ e._sc1a = x.a; e._sc1t = x.t; }
    });
    e._sc1x = e._sc1x.filter(function(x){ return x && x.v && Object.keys(x.v).length; });
    if (!e._sc1x.length) delete e._sc1x;
    stats.restoredField77 += n;
    return n > 0;
  }
  function stampEntry(e, idx, T){                                       /* commit 直後: そのターンで動いた entry に目印と項目起点 */
    var a = anchor(T[idx]), ha = h32(a), n = 0;
    if (e.turn === idx && (e._sc1a !== a || e._sc1t !== idx)){ e._sc1a = a; e._sc1t = idx; n++; }
    var v = visible77(e); if (!v) return n;
    e._sc1p = e._sc1p || {};
    Object.keys(v).forEach(function(f){
      var hv = h32(String(v[f])), p = e._sc1p[f];
      if (!p || p[1] !== hv){ e._sc1p[f] = (e.turn === idx) ? [idx, hv, ha] : [null, hv, null]; n++; }   /* 起点が分からない変化は null（不明） */
    });
    return n;
  }

  /* ---- roster307（原本は書き換えない＝view） ---- */
  function bornHidden(e, T){
    var ct = T.length - 1;
    if (typeof e.firstTurn === 'number' && e.firstTurn > ct) return true;
    if (e._sc1b && typeof e.firstTurn === 'number' && !match(e._sc1b, T[e.firstTurn])) return true;
    return false;
  }
  function apprHidden(e, T){
    var ct = T.length - 1;
    if (!e.appr) return false;
    if (typeof e.lastTurn === 'number' && e.lastTurn > ct) return true;
    if (e._sc1a && typeof e.lastTurn === 'number' && !match(e._sc1a, T[e.lastTurn])) return true;
    return false;
  }
  function viewRoster(arr, keepHandles){
    try {
      if (off() || !Array.isArray(arr)) return arr;
      var T = turnsOf(); if (!T) return arr;
      var out = [];
      arr.forEach(function(e){
        if (!e || typeof e !== 'object' || !e.handle){ out.push(e); return; }
        var bh = bornHidden(e, T), hh = apprHidden(e, T);
        if (bh && !keepHandles) return;                                 /* 今の履歴にまだ居ない人物 */
        if (bh || hh){ var c = {}; for (var k in e) c[k] = e[k]; c.appr = ''; out.push(c); return; }
        out.push(e);
      });
      return out;
    } catch(e){ stats.errors++; return arr; }
  }
  function preMerge(arr, ct){                                           /* 抽出の適用直前（同じ書込 transaction）: 隠れている外見を退避 */
    try {
      if (off() || !Array.isArray(arr)) return 0;
      var T = turnsOf(); if (!T) return 0;
      var n = 0;
      arr.forEach(function(e){
        if (!e || !e.handle || !apprHidden(e, T)) return;
        pushLayer(e, { appr: e.appr, lastTurn: e.lastTurn, a: e._sc1a || null, at: T.length }, '307');
        e.appr = ''; delete e._sc1a; n++;
      });
      stats.apprArchived307 += n;
      return n;
    } catch(e){ stats.errors++; return 0; }
  }
  function stampRoster(arr, ct){
    try {
      if (off() || !Array.isArray(arr)) return 0;
      var T = turnsOf(); if (!T || ct < 0 || ct >= T.length) return 0;
      var a = anchor(T[ct]), n = 0;
      arr.forEach(function(e){
        if (!e || !e.handle || e.lastTurn !== ct) return;
        if (e._sc1a !== a){ e._sc1a = a; n++; }
        if (bornHidden(e, T)){                                          /* 別履歴（または取り消し）で生まれた呼称が、今の履歴で改めて抽出された */
          pushLayer(e, { firstTurn: e.firstTurn, b: e._sc1b || null, at: T.length }, '307');
          e.firstTurn = ct; e._sc1b = a; stats.reborn307++; n++;
        } else if (e.firstTurn === ct && !e._sc1b){ e._sc1b = a; n++; }
      });
      stats.stamps307 += n;
      return n;
    } catch(e){ stats.errors++; return 0; }
  }
  function api307(){ try { return window.__v292Dfix307api || null; } catch(e){ return null; } }

  /* ---- 照合本体 ---- */
  var bootDirty = false;
  function reconcile77(store, T){
    var r = { inv: 0, res: 0 };
    Object.keys(store).forEach(function(n){
      var e = store[n]; if (!e || typeof e !== 'object') return;
      if (restore77(e, T)) r.res++;
      var j = judge77(e, T);
      if (j && inv77(e, j, T)) r.inv++;
    });
    return r;
  }
  function reconcile(opts){
    opts = opts || {};
    try {
      if (off()) return { off: true };
      var T = turnsOf(); if (!T) return { noS: true };
      stats.reconcile++;
      var r = { len: T.length, inv77: 0, res77: 0, persisted77: false, reason: opts.reason || '' };
      var store = window.__v292Dfix77Store;
      if (store && typeof store === 'object'){
        var x = reconcile77(store, T); r.inv77 = x.inv; r.res77 = x.res;
        if (!opts.persist && (r.inv77 || r.res77)) bootDirty = true;      /* 起動時はメモリだけ → 次の admission で保存 */
        if (opts.persist && (r.inv77 || r.res77 || bootDirty)){
          try { r.persisted77 = !!(window.__v292Dfix77Commit && window.__v292Dfix77Commit(store)); if (r.persisted77){ stats.persist77++; bootDirty = false; } } catch(e){}
        }
      }
      if (r.inv77 || r.res77) note({ ev: 'reconcile', r: r });
      return r;
    } catch(e){ stats.errors++; note({ ev: 'reconcile-error', m: String(e && e.message) }); return { error: true }; }
  }
  function onCommitted(){
    try {
      if (off()) return 0;
      var T = turnsOf(), store = window.__v292Dfix77Store; if (!T || !T.length || !store) return 0;
      var idx = T.length - 1, n = 0;
      Object.keys(store).forEach(function(k){ var e = store[k]; if (e && typeof e === 'object') n += stampEntry(e, idx, T); });
      if (n){ stats.stamps77 += n; try { if (window.__v292Dfix77Commit) window.__v292Dfix77Commit(store); } catch(e){} }
      return n;
    } catch(e){ stats.errors++; return 0; }
  }

  /* ---- 取消・やり直しの前後（fix302 wrapper から同期で。admission の内側） ---- */
  var pre = null, diverged = null;
  var DIVERGED_MSG = '取り消しを保存できていません。保存が回復するまで新しいターン・取り消し・やり直しは行えません（画面下の［再保存］など）。';
  function divergedNow(){ if (!diverged) return false; if (!saveFailed()){ diverged = null; note({ ev: 'diverged-cleared' }); return false; } return true; }
  function beforeRollback(fn){
    try { pre = off() ? null : { fn: String(fn || ''), len: (turnsOf() || []).length, k77: localStorage.getItem('v292Dfix77States') }; }
    catch(e){ pre = null; }
  }
  function bodyDurableLen(){
    try {
      var k = (typeof window.__chronicleDocumentStoryKey === 'string' && window.__chronicleDocumentStoryKey) ||
              (typeof window.__chr6Key === 'function' && window.__chr6Key()) || 'chr6';
      var b = JSON.parse(localStorage.getItem(k) || 'null');
      return (b && Array.isArray(b.turns)) ? b.turns.length : null;
    } catch(e){ return null; }
  }
  function saveFailed(){
    try { var F = window.__v292Dfix543; if (F && typeof F.unsaved === 'function'){ var u = F.unsaved(); if (u && u.active) return true; } } catch(e){}
    var T = turnsOf(), d = bodyDurableLen();                              /* 取消は利用者操作で稀＝1 回の本文 parse は許容 */
    return !!(T && d != null && d !== T.length);
  }
  function afterRollback(fn){
    var r = reconcile({ persist: true, reason: 'after-' + String(fn || 'rollback') });
    try {
      if (!off() && pre && saveFailed()){
        /* 本文の保存が失敗した: sidecar の保存値だけを巻き戻した状態で確定させない（メモリは巻き戻したまま） */
        if (pre.k77 != null) localStorage.setItem('v292Dfix77States', pre.k77);
        stats.saveFailKept++; note({ ev: 'save-failed-sidecar-kept', fn: pre.fn, len: pre.len });
        diverged = Date.now();                                          /* 本文の保存が回復するまで生成・取消・やり直しを止める */
        if (r && typeof r === 'object') r.saveFailedSidecarKept = true;
      }
    } catch(e){ stats.errors++; }
    pre = null;
    return r;
  }

  /* ---- 本文の手編集: 目印は付け替えない（r3）。空白・句読点だけの編集は正規化で一致のまま、
     文字が変わる編集はそのターン由来の値が未確認（保守的に失効・原本保持）。 ---- */

  /* ---- 生成の世代 ---- */
  var pendingGen = null, busy = null;
  var STALE = 'SC1_STALE_GENERATION';
  var BUSY_MSG = '物語を生成中です。応答が届いてから操作してください。';
  function staleNow(){ return !!(pendingGen && head() !== pendingGen); }
  function isBusy(){ return !!(busy && (Date.now() - busy) < 200000); }   /* 生成の最長待ち（150 秒 + 再送）を超えたら解除 */
  function refuse(what, msg){
    if (msg) stats.refusedDiverged = (stats.refusedDiverged || 0) + 1; else stats.refusedBusy++;
    note({ ev: msg ? 'refused-diverged' : 'refused-busy', what: what });
    msg = msg || BUSY_MSG;
    try { var U = window.UI || (0,eval)('typeof UI!=="undefined"?UI:null'); if (U && typeof U.setStatus === 'function') U.setStatus(msg, true); } catch(e){}
    try { if (typeof window.showToast === 'function') window.showToast(msg, true); } catch(e){}
  }
  function wireRun(){
    var g = getG(); if (!g || typeof g._dadmRun !== 'function') return false;
    if (!g._dadmRun.__sc1){
      var orig = g._dadmRun;
      var run = function(label, fn){
        if (off() || typeof fn !== 'function') return orig.call(this, label, fn);
        if (label === 'TURN_BUILD'){
          var inB = fn;
          fn = function(){ try { reconcile({ persist: true, reason: 'pre-generation' }); pendingGen = head(); } catch(e){ stats.errors++; } return inB.apply(this, arguments); };
        } else if (label === 'TURN_PARSE' || label === 'TURN_PARSE_REWRITE' || label === 'TURN_COMMIT'){
          if (staleNow()){
            stats.staleGen++; note({ ev: 'stale-generation', label: label, at: 'pre-admission' });
            return Promise.resolve({ ran: false, label: label, reason: STALE, wrote: 0 });
          }
          var inP = fn;
          fn = function(){
            if (staleNow()){ stats.staleGen++; note({ ev: 'stale-generation', label: label, at: 'in-admission' }); throw new Error(STALE); }
            var r = inP.apply(this, arguments);
            if (label === 'TURN_COMMIT' && r === true){ onCommitted(); pendingGen = null; }
            return r;
          };
        }
        return orig.call(this, label, fn);
      };
      run.__sc1 = true; g._dadmRun = run;
    }
    /* 生成中（自動再送の待ちを含む）は二重送信・取消・やり直しを受けない */
    if (typeof g.submit === 'function' && !g.submit.__sc1){
      var os = g.submit;
      g.submit = async function(){
        if (off()) return os.apply(this, arguments);
        if (isBusy()){ refuse('submit'); return; }
        if (divergedNow()){ refuse('submit', DIVERGED_MSG); return; }
        busy = Date.now();
        try { return await os.apply(this, arguments); }
        finally { busy = null; pendingGen = null; }
      };
      g.submit.__sc1 = true;
    }
    ['undoGws', 'retry'].forEach(function(nm){
      if (typeof g[nm] !== 'function' || g[nm].__sc1) return;
      var o = g[nm];
      g[nm] = function(){ if (!off() && isBusy()){ refuse(nm); return Promise.resolve(); } if (!off() && divergedNow()){ refuse(nm, DIVERGED_MSG); return Promise.resolve(); } return o.apply(this, arguments); };
      g[nm].__sc1 = true;
    });
    try {
      var A = window.__v292DfixDAdm;
      if (A && typeof A.humanReason === 'function' && !A.humanReason.__sc1){
        var hr = A.humanReason;
        A.humanReason = function(x){
          var s = String((x && x.reason) || '') + ' ' + String((x && x.isolationDetail) || '');
          if (s.indexOf(STALE) >= 0) return '生成中に取り消し／やり直しがあったため、この応答は使いませんでした。もう一度送ってください。';
          return hr.apply(this, arguments);
        };
        A.humanReason.__sc1 = true;
      }
    } catch(e){}
    return true;
  }
  (function w(){ w._n = (w._n || 0) + 1; if (wireRun()) return; if (w._n > 120) return; setTimeout(w, 500); })();
  function boot(){ try { reconcile({ persist: false, reason: 'boot' }); } catch(e){} }
  try { window.addEventListener('chr:engine-booted', function(){ setTimeout(boot, 0); }); } catch(e){}
  try { var EB = window.__chrEngineBoot; if (typeof EB !== 'function' || EB.__ran === true) setTimeout(boot, 0); } catch(e){}   /* 既に boot 済み（fix926 と同じ判定） */

  /* OFF（v292DfixSC1Off='1'）の意味: 全フック素通り＝旧動作。退避済みの値は _sc1x / _sc1o に残ったまま（読み手は見えない項目を
     読まないので sys へは戻らない）。退避済みの未来状態を無条件に戻す関数は持たない（GPT #125-BF）。 */

  window.__v292DfixSC1 = { VER: VER, off: off, anchor: anchor, match: match, head: head, mark: mark, staleSince: staleSince,
    reconcile: reconcile, beforeRollback: beforeRollback, afterRollback: afterRollback, onCommitted: onCommitted,
    viewRoster: viewRoster, preMerge: preMerge, stampRoster: stampRoster, wireRun: wireRun, STALE: STALE, norm: norm,
    noteStaleRoster: function(){ stats.staleRoster++; },
    inScope: inScope, stats: function(){ return JSON.parse(JSON.stringify(stats)); }, log: function(){ return log.slice(); },
    _pending: function(){ return pendingGen; }, _busy: function(){ return busy; }, _diverged: function(){ return diverged; } };
  try { console.log(TAG, 'loaded', VER); } catch(e){}
})();
