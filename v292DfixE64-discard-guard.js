/* v292DfixE64-discard-guard.js（2026-10-24・Lane E6・チケット E6-4・r4・Local only・既定 OFF＝Owner opt-in）
 * ─ 1 つのターンの中で「parse したのに捨てた応答」の取り込みを残さない ─
 *
 * 背景（E6-4・本番 r6 で実測）: G.submit は 1 回目の応答を Planner.parsePlan に通してから書き直し（fix216 再掲／fix235 短すぎ、
 *   fix797 矛盾）を頼むことがある。parse の取り込み（fix77/fix190 の <state>、fix58/fix61 の <summary>、fix277 の登場収穫、
 *   fix27 の直近 60 行メモリ）は parse のたびに即座に効き、fix77/fix277 はその場で端末キーへ書く（＝同期でサーバーの sidecar にも行く）。
 *
 * ■ 対象（parse が書き換えると実測できた 4 つだけ）
 *     store = fix77/fix190 の state store（window.__v292Dfix77Store・同じオブジェクト）と端末キー 'v292Dfix77States'（fix246 が物語の key へ振替）
 *     sum   = S.rollingSummary（有無と値）
 *     f27   = fix27 の行メモリ（window.__v292Dfix27History.lines・同じ配列）
 *     quasi = fix277 の準登録台帳（__v292QuasiPack.store() の同じオブジェクトと端末キー）
 * ■ G.submit から呼ぶ口（すべて既存の流れの中・新しい parse の包み・新しい保存先は無し）
 *   begin()            ターンの最初の parse の前。OFF なら null（以下は呼ばれない＝G.submit は本番と同じ関数を呼ぶ）。
 *   first(fn)          最初の parse（TURN_PARSE の admission の中）。直前を base、直後を cur として写す。
 *   hold()             書き直しの依頼を送る直前（fix235 は G.submit、fix797 は api(...) の包みの call の直前）。
 *                      端末キーを base の値へ戻して待つ（メモリは 1 回目のまま）。書き直しの待ち時間に、採用前の 1 回目の state が
 *                      端末キー→同期→サーバー sidecar へ確定しないようにする（r2: GPT #127-MC M1③）。端末キーが cur のままのときだけ。
 *   alt(path, fn, ok)  書き直しの parse（TURN_PARSE_REWRITE の admission の中）。
 *                      ・対象ごとに「今の値が cur のまま」なら base へ戻す。
 *                      ・cur から動いていたら（間に別の書込）: store/quasi は人物（名前）ごとの 3 者比較で、1 回目が変えて今も 1 回目の値のままの
 *                        人物だけ base へ戻す（他の書込は残す）。1 回目が変えた人物を別の書込も変えていたら「安全に戻せない」→ 書き直しを parse
 *                        せず null を返す（G.submit は書き直しを採らず 1 回目を採る＝本文と state が同じ応答に由来）。sum は動いていれば
 *                        1 回目の値はもう無いのでそのまま。f27 は 1 回目が足した行のかたまりだけを抜く（見つからなければ戻せない扱い）。
 *                      ・戻した後で parse。採る（ok）なら cur を更新。採らないなら base へ戻してから「今採っている応答」をもう一度 parse して
 *                        1 回目の取り込みを作り直す（r2: CP1 の G6 が parse ごとに写す「parse 直後の store」と今の store を一致させるため。
 *                        こうしないと CP1 の取消の撤回が 1 回目だけが変えた人物を見落とす）。
 *                      ・parse・戻しで例外が出たら書き直しの直前の値（メモリ）へ戻し、端末キーは 1 回目の値へ戻す。parse の例外はそのまま投げる。
 *   settle()           fix797 の後（どちらの書き直しも終わった後・ターン確定の前）。hold したのに書き直しを parse しなかった（通信失敗など）
 *                      ときだけ、端末キーを 1 回目の値（cur）へ戻す（＝本番と同じ保存内容）。
 *   api(base)          fix797 に渡す api を包む（call の直前に hold）。
 *   D2（GPT #127-ME）: 書き直しの parse の前に安全に戻せない（同じ人物を別の書込も変えた・戻す書込の失敗・書き直しの parse の例外）とき、
 *     A = fix216/235（1 回目そのものは有効）: 書き直しを採らず 1 回目を採る（本文・状態とも 1 回目＋別の書込）。
 *     B = fix797（1 回目は矛盾として棄却済み）: 1 回目へ落ちない。aborted() を立て、G.submit が既存の失敗の経路（入力を戻して再試行の通知）で
 *         このターンを中断する。確定しないので finally の end() が取り込みを外す（項目単位）。end() が端末キーを安全に戻せなければ停止（stop）:
 *         この物語の新しい生成を G.submit の入口で止める。kill でも解除されない（解除は回復の後に v292DfixE64Stop を消す）。
 *   end()              G.submit の finally。ターンが確定しなかったとき（CP1 の取消・保留・例外）だけ、この回の取り込みを 1 回目の前へ戻す。
 *   fix797 も 4 つ全部を戻す（r2: GPT #127-MC M3。r1 の「fix27 だけ」の既定と v292DfixE64Full797 は廃止）。
 * ■ スイッチ（CP1 と同じ形・storage 不可は OFF）
 *   実効 ON = v292DfixE64On==='1' かつ v292DfixE64Off!=='1' かつ 匿名でない（__v292Dfix886.api.active() が false）
 *            かつ Owner（__v292Dfix893.serverMe() が entitlement==='owner' && status==='active'）。判定はターンの最初に 1 回。
 *   kill は書き直しの直前にも見る（kill が常に勝つ＝その後は何も戻さない。hold 中なら端末キーだけ 1 回目の値へ戻す）。
 * ■ 診断 window.__v292DfixE64: .VER .gate() .on() .last() .stats()（件数と理由コードだけ。名前・本文・要約は入れない）
 * ■ r4（GPT #127-MG ①②）: Stop は「生成停止」＋「汚染されたかもしれない state の保存停止」。保存の停止は保存の共通の出口
 *   v292DfixE64-save-tap.js（fetch のほぼ最内）が行う。begin() はその tap が居るページでだけ動く（居なければ E64 は OFF と同じ）。
 *   stop() は印 v292DfixE64Stop（v:2 = 物語ごとの list。口座・物語 key・理由・時刻・このターンの間に送った state 書込の数・飛行中の数）を
 *   tap に書かせる。書けなかったときもこのページはメモリの印で止まる（tap はこのページの state 書込をすべて止める）。
 *   止める判定（生成も保存も）: 印の物語 key がこのページの物語 key と同じ、かつ 印の口座と今の口座が「両方分かっていて違う」ではない。
 *   印が壊れている・物語 key が分からない → 止める側。kill（v292DfixE64Off）・CP1・Owner かどうかでは解除されない。
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixE64) return;
  var VER = '20261024-bundle45-e64-d', GATE_VER = 'owner-r43e-20261024';
  var stats = { begun: 0, alt: 0, accepted: 0, rejected: 0, threw: 0, unsafe: 0, killedAtAlt: 0, held: 0, settled: 0, reparsed: 0, restored: {}, merged: {}, moved: {}, missing: {}, errors: 0 };
  var last = null, latest = null;
  function bump(o, k){ o[k] = (o[k] || 0) + 1; }

  function ownerGate(){
    try { var A = window.__v292Dfix893; if (!A || typeof A.serverMe !== 'function') return false; var me = A.serverMe(); return !!(me && me.entitlement === 'owner' && me.status === 'active'); } catch(e){ return false; }
  }
  function anonActive(){
    try { var P = window.__v292Dfix886; return !!(P && P.api && typeof P.api.active === 'function' && P.api.active()); } catch(e){ return true; }
  }
  function killed(){ try { return localStorage.getItem('v292DfixE64Off') === '1'; } catch(e){ return true; } }
  function gate(){
    var kill, opt;
    try { kill = localStorage.getItem('v292DfixE64Off'); opt = localStorage.getItem('v292DfixE64On'); } catch(e){ return 'killed'; }
    if (kill === '1') return 'killed';
    if (opt !== '1') return 'unset';
    if (anonActive()) return 'anon';
    return ownerGate() ? 'owner' : 'not-owner';
  }

  function getS(){ try { var g = window.__chronicleGetState; if (typeof g === 'function') return g('E64'); } catch(e){} return null; }
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return undefined; } }
  function lsPut(k, v){ if (v === undefined) return; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }   /* 例外は呼び出し側へ */
  /* 戻すときの端末キー書込: 失敗したら（容量など）キーを消してから書き直す（戻す値は今の値より短いときだけ）。それでもだめなら元の値を戻して例外 */
  function lsPutSafe(k, v){
    if (v === undefined) return;
    try { lsPut(k, v); return; } catch(e1){}
    var old = lsGet(k);
    if (v === null || (typeof old === 'string' && v.length <= old.length)) {
      try { localStorage.removeItem(k); if (v !== null) localStorage.setItem(k, v); return; }
      catch(e2){ try { if (typeof old === 'string') localStorage.setItem(k, old); } catch(e3){} }
    }
    var er = new Error('E64_LS_RESTORE_FAILED'); er.code = 'E64_LS_RESTORE_FAILED'; throw er;
  }
  /* ---- 停止（GPT #127-ME D2-B）: 捨てた応答の取り込みを端末キーから安全に外せなかったとき、この物語の新しい生成を止める。
     kill（v292DfixE64Off）やゲートの状態に関係なく効く（解除は Owner が回復した後に v292DfixE64Stop を消すことだけ）。 */
  var stopMem = null;
  function docKey(){ try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string') ? k : null; } catch(e){ return null; } }
  function tapObj(){ try { var T = window.__v292DfixE64SaveTap; return (T && T.installed === true && T.guard >= 2 && typeof T.mark === 'function' && typeof T.stoppedDoc === 'function' && typeof T.hold === 'function' && typeof T.release === 'function') ? T : null; } catch(e){ return null; } }
  function acctNow(){ try { var A = window.__v292Dfix893; var me = (A && typeof A.serverMe === 'function') ? A.serverMe() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch(e){ return null; } }
  function stop(code){
    var since = (latest && latest.t0) || 0;
    stopMem = { story: docKey(), acct: acctNow(), code: String(code || 'stop'), at: Date.now() }; stats.stopped = (stats.stopped || 0) + 1;
    var T = tapObj(), r = null;
    if (T) { try { r = T.mark({ story: stopMem.story, acct: stopMem.acct, code: stopMem.code, at: stopMem.at, since: since }); } catch(e){ r = null; } }
    if (r) { stopMem.marker = !!r.persisted; stopMem.sentInTurn = r.sentInTurn; stopMem.inflight = r.inflight; }
    else {   /* tap が居ない（begin() が tap を要求するので通常は来ない）: 印だけ書く（既存の list に足す） */
      try { var L = []; try { var o = JSON.parse(localStorage.getItem('v292DfixE64Stop') || 'null'); if (o && o.v === 2 && Array.isArray(o.list)) L = o.list; } catch(e0){}
        L.push({ story: stopMem.story || '*', acct: stopMem.acct, code: stopMem.code, at: stopMem.at }); localStorage.setItem('v292DfixE64Stop', JSON.stringify({ v: 2, list: L })); stopMem.marker = true; } catch(e){ stopMem.marker = false; }
    }
    notifyStop();
  }
  function stopped(){
    var k = docKey();
    if (stopMem && (!stopMem.story || stopMem.story === k)) return true;
    var T = tapObj(); if (T) { try { return T.stoppedDoc(k) === true; } catch(e){ return true; } }
    var m; try { m = localStorage.getItem('v292DfixE64Stop'); } catch(e){ return false; }
    if (m === null || m === undefined) return false;
    try { var j = JSON.parse(m), a = acctNow();
      if (j && j.v === 2 && Array.isArray(j.list)) return j.list.some(function(x){ return !x || !x.story || x.story === '*' || !k || (x.story === k && !(x.acct && a && x.acct !== a)); });
      if (j && j.v === 1 && typeof j.story === 'string' && j.story) return j.story === k;
    } catch(e){}
    return true;   /* 印が壊れている＝止める側 */
  }
  function notifyStop(){
    var msg = 'このターンの記録を安全に元へ戻せなかったため、この物語の続き（新しいターンとサーバーへの保存）を止めています。保存されている物語は消えていません。再読み込みや停止スイッチでは再開しません。統括の確認と復旧のあとで再開してください。';
    try { if (typeof window.showToast === 'function') window.showToast(msg, true); } catch(e){}
    try { var U = (typeof UI !== 'undefined' && UI) ? UI : window.UI; if (U && typeof U.setStatus === 'function') U.setStatus(msg, true); } catch(e){}   /* index の UI は const（window には載らない） */
  }
  function json(o){ try { return JSON.stringify(o); } catch(e){ return undefined; } }
  function refill(obj, src){ Object.keys(obj).forEach(function(k){ delete obj[k]; }); var c = JSON.parse(src); Object.keys(c).forEach(function(k){ obj[k] = c[k]; }); }
  /* 名前ごとの 3 者比較（store / quasi 共通）: base=1 回目の前、cur=1 回目の直後、now=今。戻り { obj, unsafe } */
  /* 項目ごとの 3 者比較（end() で、同じ人物を 1 回目と別の書込の両方が変えたときだけ使う）: 今も 1 回目の値の項目は 1 回目の前へ、それ以外は今のまま */
  function field3(b, c, n){
    if (b === undefined) b = {}; if (c === undefined) c = {};
    if (!b || !c || !n || typeof b !== 'object' || typeof c !== 'object' || typeof n !== 'object' || Array.isArray(n)) return n;
    var o = {}, ks = {}; [n, b, c].forEach(function(x){ Object.keys(x).forEach(function(k){ ks[k] = 1; }); });
    Object.keys(ks).forEach(function(k){ var bj = json(b[k]), cj = json(c[k]), nj = json(n[k]);
      if (bj !== cj && nj === cj) { if (b.hasOwnProperty(k)) o[k] = b[k]; } else if (n.hasOwnProperty(k)) o[k] = n[k]; });
    return o;
  }
  function merge3(baseJ, curJ, nowObj, fieldLevel){
    var b = JSON.parse(baseJ), c = JSON.parse(curJ), n = JSON.parse(json(nowObj)), out = {}, unsafe = false, keys = {};
    Object.keys(n).forEach(function(k){ keys[k] = 1; }); Object.keys(b).forEach(function(k){ keys[k] = 1; }); Object.keys(c).forEach(function(k){ keys[k] = 1; });
    Object.keys(keys).forEach(function(k){
      var bj = json(b[k]), cj = json(c[k]), nj = json(n[k]);
      if (bj === cj) { if (n.hasOwnProperty(k)) out[k] = n[k]; return; }          /* 1 回目が触っていない＝今のまま */
      if (nj === cj) { if (b.hasOwnProperty(k)) out[k] = b[k]; return; }          /* 1 回目の値のまま＝1 回目の前へ */
      if (nj === bj) { if (n.hasOwnProperty(k)) out[k] = n[k]; return; }          /* もう戻っている */
      unsafe = true; if (n.hasOwnProperty(k)) out[k] = fieldLevel ? field3(b[k], c[k], n[k]) : n[k];   /* 両方が変えた＝人物単位では安全に戻せない（end() は項目単位で 1 回目の値だけ外す） */
    });
    /* 並び: now の順を基本に、base にしか無い名前は後ろへ（キーの順は保存の中身に出るので、戻せる場合は base の順を優先） */
    var ord = {}; Object.keys(b).forEach(function(k){ if (out.hasOwnProperty(k)) ord[k] = out[k]; }); Object.keys(out).forEach(function(k){ if (!ord.hasOwnProperty(k)) ord[k] = out[k]; });
    return { j: json(ord), unsafe: unsafe };
  }
  var T = {
    store: {
      snap: function(){ var o = window.__v292Dfix77Store; if (!o || typeof o !== 'object') return null; var j = json(o); if (j === undefined) return null; return { ref: o, j: j, ls: lsGet('v292Dfix77States'), k: 'v292Dfix77States' }; },
      same: function(a, b){ return !!(a && b && a.ref === b.ref && a.j === b.j && a.ls === b.ls); },
      putMem: function(x, j){ refill(x.ref, j); }, ls: true
    },
    quasi: {
      snap: function(){ var Q = window.__v292QuasiPack; if (!Q || typeof Q.store !== 'function' || typeof Q.key !== 'function') return null; var k = Q.key(); var o = Q.store(); if (!k || !o || typeof o !== 'object') return null; var j = json(o); if (j === undefined) return null; return { ref: o, k: k, j: j, ls: lsGet(k) }; },
      same: function(a, b){ return !!(a && b && a.ref === b.ref && a.k === b.k && a.j === b.j && a.ls === b.ls); },
      putMem: function(x, j){ refill(x.ref, j); }, ls: true
    },
    sum: {
      snap: function(){ var S = getS(); if (!S) return null; var has = Object.prototype.hasOwnProperty.call(S, 'rollingSummary'); return { ref: S, has: has, v: has ? S.rollingSummary : undefined }; },
      same: function(a, b){ return !!(a && b && a.ref === b.ref && a.has === b.has && a.v === b.v); },
      putVal: function(x){ if (x.has) x.ref.rollingSummary = x.v; else delete x.ref.rollingSummary; }
    },
    f27: {
      snap: function(){ var H = window.__v292Dfix27History; if (!H || !Array.isArray(H.lines)) return null; return { ref: H.lines, a: H.lines.slice() }; },
      same: function(a, b){ if (!(a && b && a.ref === b.ref && a.a.length === b.a.length)) return false; for (var i = 0; i < a.a.length; i++) if (a.a[i] !== b.a[i]) return false; return true; },
      putArr: function(x, arr){ x.ref.length = 0; for (var i = 0; i < arr.length; i++) x.ref.push(arr[i]); }
    }
  };
  var ALL = ['store', 'sum', 'f27', 'quasi'];
  function snapAll(){ var o = {}; ALL.forEach(function(n){ try { o[n] = T[n].snap(); } catch(e){ o[n] = null; } }); return o; }
  /* fix27: base の後ろに 1 回目が足した行のかたまり（先頭は上限 60 で切られうる） */
  function f27Added(b, c){
    for (var j = 0; j <= b.length; j++){ var tail = b.slice(j); var ok = tail.length <= c.length; for (var i = 0; ok && i < tail.length; i++) if (tail[i] !== c[i]) ok = false; if (ok) return c.slice(tail.length); }
    return null;
  }
  /* 1 つの対象を「1 回目の前」へ戻す計画を作る（書かない）。戻り { kind:'base'|'merge'|'keep'|'unsafe'|'missing', mem?, arr?, val? } */
  function planBack(n, base, cur, now, held, fieldLevel){
    if (!base || !cur || !now) return { kind: 'missing' };
    var heldSame = (held !== undefined && (n === 'store' || n === 'quasi') && now.ref === cur.ref && now.j === cur.j && now.ls === held);   /* hold で端末キーだけ base にしてある＝動いていない */
    var atBase = (n === 'f27') ? (now.a.length === base.a.length && now.a.every(function(v, i){ return v === base.a[i]; })) : (n === 'sum') ? (now.has === base.has && now.v === base.v) : (now.ref === base.ref && now.j === base.j);
    if (atBase && !T[n].same(now, cur)) return { kind: 'keep' };                   /* もう 1 回目の前の値（CP1 の撤回・取消の後など） */
    if (heldSame || T[n].same(now, cur)) {
      if (n === 'f27') return { kind: 'base', arr: base.a.slice() };
      if (n === 'sum') return { kind: 'base', val: base };
      return { kind: 'base', mem: base.j, ls: base.ls };
    }
    if (n === 'sum') return { kind: 'keep' };                                      /* 別の書込が要約を変えた＝1 回目の要約はもう無い */
    if (n === 'f27') {
      var add = f27Added(base.a, cur.a); if (!add) return { kind: 'unsafe' };
      if (!add.length) return { kind: 'keep' };
      var a = now.a, at = -1;
      for (var s = a.length - add.length; s >= 0 && at < 0; s--){ var hit = true; for (var t = 0; t < add.length; t++) if (a[s + t] !== add[t]) { hit = false; break; } if (hit) at = s; }
      if (at < 0) return { kind: 'unsafe' };
      return { kind: 'merge', arr: a.slice(0, at).concat(a.slice(at + add.length)) };
    }
    if (now.ref !== cur.ref) return { kind: 'unsafe' };                            /* 物語の切替などで別のオブジェクト */
    var m = merge3(base.j, cur.j, now.ref, fieldLevel);
    if (m.unsafe) return { kind: 'unsafe', mem: m.j };                             /* mem = 戻せる人物だけ戻した形（end() だけが使う） */
    return { kind: 'merge', mem: m.j };
  }
  /* 端末キーを書く規則: 今の端末キーがメモリの写し（または E64 が hold した値）のときだけ、戻したメモリに合わせる。
     それ以外（CP1 G6 が採用まで試行の前の値に保っている等）は触らない。 */
  function lsMirror(x, held){ return !!x && (x.ls === x.j || (held != null && x.ls === held)); }

  function begin(){
    var g = gate();
    if (g !== 'owner') return null;
    var T0 = tapObj();
    if (!T0) { stats.noTap = (stats.noTap || 0) + 1; return null; }   /* r4: 保存を止められないページでは E64 を動かさない */
    /* r5（GPT #127-MI 案 b）: 最初の parse の前から、決着（settle / end）まで、この物語の state 書込を保留する */
    var S00 = getS(); var sh = null; try { sh = T0.hold({ story: docKey(), acct: acctNow(), turns: (S00 && Array.isArray(S00.turns)) ? S00.turns.length : -1 }); } catch(eh){ sh = null; }
    if (!sh || !sh.id) { stats.noHold = (stats.noHold || 0) + 1; return null; }
    stats.holdNotPersisted = (stats.holdNotPersisted || 0) + (sh.persisted ? 0 : 1);
    stats.begun++;
    var S0 = getS();
    var ctx = { base: null, cur: null, n: 0, reparse: null, held: {}, didAlt: false, S: S0, n0: (S0 && Array.isArray(S0.turns)) ? S0.turns.length : -1, ended: false, t0: Date.now(), sh: sh };
    latest = ctx;
    ctx.releaseSave = function(info){ var h = ctx.sh; ctx.sh = null; if (h) { try { T0.release(h.id, info); } catch(er){ stats.errors++; } stats.holdReleased = (stats.holdReleased || 0) + 1; } };
    function release(){   /* hold した端末キーを 1 回目の値（cur）へ。誰かが書いた後なら触らない */
      ['store', 'quasi'].forEach(function(n){ var h = ctx.held[n]; if (h === undefined) return; try { var c = ctx.cur && ctx.cur[n]; if (c && lsGet(c.k) === h) lsPut(c.k, c.ls); } catch(e){ stats.errors++; } delete ctx.held[n]; });
    }
    ctx.first = function(fn){
      ctx.base = snapAll();
      var p = fn();
      ctx.cur = snapAll(); ctx.reparse = fn;
      last = { path: 'first', alt: 0 };
      return p;
    };
    ctx.hold = function(){
      try {
        if (!ctx.base || !ctx.cur || killed()) return;
        ['store', 'quasi'].forEach(function(n){
          var b = ctx.base[n], c = ctx.cur[n]; if (!b || !c || ctx.held[n] !== undefined) return;
          if (b.ls === c.ls) return;                                                 /* 1 回目が端末キーを書いていない（または CP1 が戻した） */
          if (lsGet(c.k) !== c.ls) return;                                           /* 1 回目の後で誰かが書いた＝触らない */
          lsPut(c.k, b.ls); ctx.held[n] = (b.ls === undefined ? null : b.ls); stats.held++;
        });
      } catch(e){ stats.errors++; }
    };
    ctx.settle = function(){ if (ctx.abort) return; if (Object.keys(ctx.held).length){ release(); stats.settled++; } };   /* B で中断するときは 1 回目の値へ戻さない（end() が外す）。r5: 保存の保留は end()（ターンの確定・戻しの後）で解く */   /* B で中断するときは 1 回目の値へ戻さない（end() が外す） */
    ctx.aborted = function(){ return !!ctx.abort; };
    ctx.abortError = function(){ var e = new Error('書き直しの記録を安全に確定できなかったため、このターンは取りやめました。もう一度送ってください。'); e.code = ctx.abort || 'E64_ABORT'; return e; };
    ctx.api = function(base){ return { call: function(){ ctx.hold(); return base.call.apply(base, arguments); } }; };
    /* path: 'rw216'（fix216/fix235）| 'fix797'。fn = その parse。accept(plan) = G.submit がその応答を採る条件（G.submit と同じ式） */
    ctx.alt = function(path, fn, accept){
      if (!ctx.base || !ctx.cur || killed()) { if (killed()) { stats.killedAtAlt++; release(); } return fn(); }
      stats.alt++; ctx.n++; ctx.didAlt = true;
      var rec = { path: path, alt: ctx.n, t: {} };
      var pre = snapAll(), plans = {}, unsafe = false;
      var heldVals = {}; Object.keys(ctx.held).forEach(function(k){ heldVals[k] = ctx.held[k]; });
      ALL.forEach(function(n){ var p = planBack(n, ctx.base[n], ctx.cur[n], pre[n], heldVals[n]); plans[n] = p; rec.t[n] = p.kind; if (p.kind === 'unsafe') unsafe = true; if (p.kind === 'missing') bump(stats.missing, n); if (p.kind === 'merge') bump(stats.merged, n); if (p.kind === 'keep' || p.kind === 'merge') bump(stats.moved, n); });
      function back(n, p){   /* 計画どおり 1 つの対象を書く */
        var x = pre[n]; if (!x) return;
        if (n === 'f27') { if (p.arr) T.f27.putArr(x, p.arr); return; }
        if (n === 'sum') { if (p.kind === 'base') T.sum.putVal(p.val); return; }
        if (!p.mem) return;
        var mir = lsMirror(x, heldVals[n]);
        T[n].putMem(x, p.mem);
        if (mir) lsPut(x.k, p.kind === 'base' ? p.ls : p.mem);
      }
      function toPre(){   /* 書き直しの直前（メモリ）へ。端末キーは 1 回目の値（hold 中なら release）か書き直しの直前の値 */
        ALL.forEach(function(n){ var x = pre[n]; if (!x) return; try {
          if (n === 'f27') T.f27.putArr(x, x.a); else if (n === 'sum') T.sum.putVal(x);
          else { T[n].putMem(x, x.j); var h = heldVals[n]; var c = ctx.cur[n]; lsPut(x.k, (h !== undefined && x.ls === h && c) ? c.ls : x.ls); }
        } catch(e){ stats.errors++; } });
        ctx.held = {};
      }
      var B = (path === 'fix797');   /* D2-B: 1 回目は矛盾として棄却済み＝1 回目へ落ちない（このターンを中断する）。A（rw216）は 1 回目そのものは有効 */
      if (unsafe) { stats.unsafe++; if (B) { ctx.abort = 'E64_CONFLICT_ABORT'; rec.ok = 'unsafe-abort-turn'; last = rec; return null; } release(); rec.ok = 'unsafe-keep-first'; last = rec; return null; }   /* A: 書き直しを parse しない＝G.submit は 1 回目を採る */
      try { ALL.forEach(function(n){ back(n, plans[n]); bump(stats.restored, n); }); }
      catch(e){ stats.errors++; if (B) { ctx.abort = 'E64_RESTORE_FAILED_ABORT'; rec.ok = 'restore-failed-abort-turn'; last = rec; return null; } toPre(); rec.ok = 'restore-failed-keep-first'; last = rec; return null; }
      ctx.held = {};
      var mid = snapAll();                                  /* 戻した直後＝書き直しを parse する直前の「1 回目が無かった」状態 */
      var p;
      try { p = fn(); }
      catch(e){ stats.threw++;
        /* CP1 が試行を取消した（口座・物語の切替など）ときは、CP1 が試行の前へ戻す。ここで 1 回目へ戻すと取消された試行の state が残るので
           mid（＝1 回目も書き直しも無い状態）のままにする。それ以外の例外は 1 回目を採る流れなので書き直しの直前へ戻す。 */
        if (e && e.code === 'CP1_INTERRUPTED') { ctx.cancelled = true; rec.ok = 'threw-cp1-cancel-keep-mid'; } else if (B) { ctx.abort = 'E64_REWRITE_PARSE_THREW_ABORT'; rec.ok = 'threw-abort-turn'; } else { toPre(); rec.ok = 'threw'; }
        last = rec; throw e; }
      var ok = false; try { ok = !!accept(p); } catch(e2){ ok = false; }
      if (ok){ ctx.cur = snapAll(); ctx.reparse = fn; stats.accepted++; rec.ok = 'accepted'; last = rec; return p; }
      /* 採らない: mid へ戻し、今採っている応答をもう一度 parse して取り込みを作り直す（CP1 G6 の「parse 直後の写し」と今の値を一致させる） */
      stats.rejected++; rec.ok = 'rejected';
      try {
        ALL.forEach(function(n){ var x = mid[n]; if (!x) return;
          if (n === 'f27') T.f27.putArr(x, x.a); else if (n === 'sum') T.sum.putVal(x); else { T[n].putMem(x, x.j); lsPut(x.k, x.ls === undefined ? undefined : x.ls); } });
        if (typeof ctx.reparse === 'function') { ctx.reparse(); stats.reparsed++; rec.reparsed = 1; }
        var now = snapAll(); rec.sameAsFirst = ALL.every(function(n){ var a = now[n], c = ctx.cur[n]; if (!a || !c) return true; if (n === 'f27' || n === 'sum') return T[n].same(a, c); return a.j === c.j; });
      } catch(e3){ stats.errors++;
        try { ALL.forEach(function(n){ var x = mid[n]; if (!x) return; if (n === 'f27') T.f27.putArr(x, x.a); else if (n === 'sum') T.sum.putVal(x); else { T[n].putMem(x, x.j); lsPut(x.k, x.ls); } }); } catch(e4){ stats.errors++; }
        rec.ok = (e3 && e3.code === 'CP1_INTERRUPTED') ? 'rejected-reparse-cp1-cancel-keep-mid' : 'rejected-reparse-failed-keep-mid'; ctx.cancelled = true; last = rec; throw e3; }
        /* 作り直しに失敗したら mid のまま（1 回目の state も書き直しの state も残さない＝不採用の state を永続化しない側）。例外は投げる（G.submit の既存の catch へ） */
      last = rec;
      return p;
    };
    /* G.submit の finally から。そのターンが確定しなかった（S.turns が増えていない）なら、この回の parse の取り込みを 1 回目の前へ戻す
       （CP1 の取消・admission の保留・確定前の例外など。CP1 G6 は store だけを戻すので、要約・行メモリ・準登録台帳もここで戻す）。
       確定した・新しいターンが始まった・物語が変わったときは何もしない。安全に戻せない対象があれば戻さずに数える。 */
    ctx.end = function(){ try { endInner(); } finally { var ci = null; try { var S2 = getS(); if (!ctx.abort && S2 && S2 === ctx.S && Array.isArray(S2.turns) && S2.turns.length > ctx.n0) ci = { turns: S2.turns.length }; } catch(ec){} ctx.releaseSave(ci); } };   /* r6: 確定したターン数を渡す（離れる途中なら tap が確定時の指紋を印に残す） */   /* r5: 戻し・停止のあとで保留を解く（停止なら Stop が保存を止め続ける） */
    var endInner = function(){
      try {
        if (ctx.ended) return; ctx.ended = true;
        if (latest !== ctx || !ctx.base || !ctx.cur) return;
        var S1 = getS(); if (!S1 || S1 !== ctx.S || !Array.isArray(S1.turns) || S1.turns.length !== ctx.n0) return;
        var now = snapAll(), rec = { path: 'end-uncommitted', t: {} }, plans = {}, bad = false, lsFail = false; if (ctx.abort) rec.abort = ctx.abort;
        var hv = {}; Object.keys(ctx.held).forEach(function(k){ hv[k] = ctx.held[k]; });
        ALL.forEach(function(n){ var p = planBack(n, ctx.base[n], ctx.cur[n], now[n], hv[n], true); plans[n] = p; rec.t[n] = (p.kind === 'unsafe' && p.mem) ? 'field' : p.kind; if (p.kind === 'unsafe' && !p.mem) bad = true; });
        ALL.forEach(function(n){ var p = plans[n], x = now[n]; if (!x || p.kind === 'keep' || p.kind === 'missing' || (p.kind === 'unsafe' && !p.mem)) return;
          try { if (n === 'f27') T.f27.putArr(x, p.arr); else if (n === 'sum') { if (p.kind === 'base') T.sum.putVal(p.val); }
                else if (p.mem) { var mir = lsMirror(x, hv[n]); T[n].putMem(x, p.mem); if (mir) lsPutSafe(x.k, p.kind === 'base' ? p.ls : p.mem); } } catch(e){ stats.errors++; rec.t[n] = 'err'; lsFail = true; } });
        ctx.held = {}; stats.endReverted = (stats.endReverted || 0) + 1; if (bad) stats.endUnsafe = (stats.endUnsafe || 0) + 1; rec.ok = lsFail ? 'stopped' : bad ? 'partial-unsafe' : 'reverted'; last = rec;
        if (lsFail) stop('E64_END_LS_RESTORE_FAILED');   /* 端末キーに捨てた取り込みが残ったかもしれない＝この物語の生成を止める */
      } catch(e){ stats.errors++; try { stop('E64_END_THREW'); } catch(e2){} }
    };
    return ctx;
  }

  window.__v292DfixE64 = {
    VER: VER, GATE_VER: GATE_VER, begin: begin, gate: gate, on: function(){ return gate() === 'owner'; },
    last: function(){ try { return JSON.parse(JSON.stringify(last)); } catch(e){ return null; } },
    stats: function(){ try { return JSON.parse(JSON.stringify(stats)); } catch(e){ return null; } },
    stopped: stopped, notifyStop: notifyStop, stopInfo: function(){ return stopMem ? { code: stopMem.code, marker: stopMem.marker, sentInTurn: stopMem.sentInTurn, inflight: stopMem.inflight } : null; }
  };
})();
