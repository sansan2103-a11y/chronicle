// =====================================================================
// Chronicle TRPG - v292Dfix950: 設定カード／記憶の「届いたか」検出器（影モード・記録のみ）
//   旧仮称 fix900（2026-10-14 Local 調査）。本番に v292Dfix900-hydrate-ui-gate.js が既にあり、
//   window.__v292Dfix900 と kill キー v292Dfix900Off が衝突するため fix950 へ改番した（配信版 r1）。
//   r2（2026-10-14）: カード選択器を fix901 から fix951 へ改番したのに合わせ、読む公開口を __v292Dfix951 に変えた（これ以外は r1 と同一）。
// ---------------------------------------------------------------------
// ★目的（GPT 裁定 #125-GP 第 1 段 / #125-GQ 配信条件）:
//   送信直前の組み替え（fix459 など）で【設定カード】【記憶】や未登録見出しのブロックが
//   直前の drop 対象ブロックに吸収されて道連れ削除されていないかを、送信ごとに判定して件数で記録する。
//
// ★絶対条件:
//   1. 送る中身を 1 バイトも変えない。fetch の引数（url / init）は受け取った参照のまま内側へ渡す。
//      body は JSON.parse で読むだけ。書き戻さない。
//   2. カード本文・カード名・GM 秘密・入力文・人物名を、どこにも出さない。
//      - 記録（メモリ内リング 20 件）に残すのは: 件数・到達/消失の判定・文字数・処理段階・
//        吸収先の見出し名（= fix459 の MARKERS に登録済みのコード定数だけ）。
//      - localStorage / sessionStorage / IndexedDB / ネットワーク / sendBeacon へは一切書かない。
//      - console へ出すのは上と同じ「件数・判定・字数・登録済み見出し名」だけ（同じ症状につき 1 回）。
//      - 送信前の sys は対応づけのためだけに関数内のメモリに最大 4 件・最長 300 秒だけ持つ。
//        公開口（last / history / stats / analyze）からは読めない。
//   3. 例外はすべて握りつぶす。検出器の失敗で送信が止まることはない（fail-open）。
//
// ★仕組み（二つの tap）:
//   送信前 … Api._preCallHooks に「読むだけ」の hook を足す（何も返さない → index.html の
//            preCall 分岐で system / userContent / maxTok は変わらない）。
//   送信後 … 読み込み時に window.fetch を包む（inner tap）。index.html では vault2-copygate の直後
//            （= sendgate の 1 つ外側・ほぼ最内）に置く。fix459 / fix441 / fix247 / fix80 など全部の
//            書き換えが終わった「実際に送る sys」を見る。
//   両者を user メッセージの指紋（FNV-1a 32bit。指紋も外へは出さない）で対応づける。
//   送信の経路でやるのは「body の文字列を受け取って setTimeout(0) に積む」ことだけ。判定（fix459 の
//   parse を含む）は送信を内側へ渡した後に行うので、送信を遅らせない。送信前側の解析は再送で使い回す。
//
// ★文字コード: 判定に使う見出しの文字列は \u エスケープで書く（script の文字コード解釈に依存しない）。
//
// ★OFF（kill switch）: localStorage.v292Dfix950Off = '1'（送信ごとに live 評価。即素通し・記録 0）
// 検証口（読むだけ）: window.__v292Dfix950.stats() / .last() / .history() / .analyze(pre, post)
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix950 && window.__v292Dfix950.__armed) return;
  var VERSION = 'fix950-r2-20261014';
  var TAG = '[v292Dfix950:card-probe]';
  var RING = 20;          // 記録の件数
  var PEND_MAX = 4;       // 送信前 sys を持つ件数
  var PEND_TTL = 300000;  // 送信前 sys を持つ時間（ms）。fix80 の再送（最大 3 回）を含めて対応づけるため

  function off(){ try { return localStorage.getItem('v292Dfix950Off') === '1'; } catch(e){ return false; } }

  // 監視対象（見出しの先頭一致）。fix313:41 / fix314:30 のリテラルの先頭部分。
  //   cards  = 「【設定カード」
  //   memory = 「【記憶（この物語で確定している事実」
  var WATCH = [
    { id: 'cards',  mark: '\u3010\u8a2d\u5b9a\u30ab\u30fc\u30c9', itemRe: /^\u25a0 ([^\uff1a\n]{1,80})/ },   // ■ 名前：
    { id: 'memory', mark: '\u3010\u8a18\u61b6\uff08\u3053\u306e\u7269\u8a9e\u3067\u78ba\u5b9a\u3057\u3066\u3044\u308b\u4e8b\u5b9f', itemRe: null }
  ];
  var BLOCK_SEP = '\n\n\u3010';   // '\n\n【'

  function isTextGen(u, o){
    try {
      if (!o || typeof o.body !== 'string') return false;
      if (String(o.method || '').toUpperCase() !== 'POST') return false;
      var s = String(u && u.url ? u.url : u || '');
      if (s.indexOf('/image') >= 0 || s.indexOf('/img') >= 0 || s.indexOf('/save') >= 0 || s.indexOf('/inspect') >= 0 || s.indexOf('/avatar-inspect') >= 0) return false;
      return s.indexOf('openrouter') >= 0 || /workers\.dev/.test(s);
    } catch(e){ return false; }
  }
  function readMsgs(body){
    try {
      var b = JSON.parse(body);
      if (!b || !b.messages || !b.messages.length) return null;
      var sys = null, user = '';
      for (var i = 0; i < b.messages.length; i++){
        var m = b.messages[i];
        if (!m || typeof m.content !== 'string') continue;
        if (m.role === 'system' && sys === null) sys = m.content;
        if (m.role === 'user') user = m.content;
      }
      return (sys === null) ? null : { sys: sys, user: user };
    } catch(e){ return null; }
  }
  // 指紋（FNV-1a 32bit）。対応づけにだけ使う。記録・出力には含めない。
  function fp(s){
    var h = 0x811c9dc5; s = String(s || '');
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return h;
  }

  // モジュールが足すブロックは '\n\n【…】' で始まる。次の '\n\n【' までを 1 ブロックとみなす。
  function extract(sys, mark){
    var at = sys.indexOf(mark);
    if (at < 0) return null;
    var nx = sys.indexOf(BLOCK_SEP, at + mark.length);
    var end = nx >= 0 ? nx : sys.length;
    return { at: at, end: end, text: sys.slice(at, end) };
  }
  // 項目名は「照合のためだけ」に関数内で使い、返り値・記録には入れない。
  function items(text, re){
    if (!re) return [];
    var out = [], lines = text.split('\n');
    for (var i = 0; i < lines.length; i++){ var m = lines[i].match(re); if (m) out.push(m[1]); }
    return out;
  }
  function parse459(sys){
    try {
      var f = window.__v292Dfix459;
      if (!f || typeof f.parse !== 'function') return null;
      return f.parse(sys);
    } catch(e){ return null; }
  }
  // 吸収先 = fix459 の登録見出し（コード定数）。登録外の文字列は返さない。
  function owner(p, at){
    if (!p) return null;
    for (var i = 0; i < p.blocks.length; i++){
      var b = p.blocks[i];
      if (b.at <= at && at < b.end) return (b.at === at) ? '(own-block)' : String(b.mk);
    }
    return '(head)';
  }
  // fix459 のブロックの途中にある '\n\n【未登録見出し】' = 吸収されている見出し。
  //   見出しの文字列そのものは利用者の文（カード本文など）の可能性があるので出さない。
  //   返すのは { host: 吸収先の登録見出し, hc: その見出しの字数, h: 照合用（関数内だけで使い、記録しない） }。
  function hitchhikers(p){
    var out = [];
    if (!p) return out;
    var re = /\n\n(\u3010[^\u3010\u3011\n]{1,60}\u3011)/g;
    for (var i = 0; i < p.blocks.length; i++){
      var b = p.blocks[i], m;
      re.lastIndex = 0;
      while ((m = re.exec(b.text))) out.push({ host: String(b.mk), hc: m[1].length, h: m[1] });
    }
    return out;
  }

  // 送信前側の解析（fix459 の parse を含むので重い）。同じ送信前 sys に対しては 1 回だけ行い、
  // fix80 の再送（最大 3 回）では使い回す。返り値は関数内だけで使う（項目名・見出しを含むので公開しない）。
  function preSide(pre){
    pre = String(pre || '');
    var pPre = pre ? parse459(pre) : null;
    var info = { len: pre.length, watch: [], hh: hitchhikers(pPre) };
    for (var w = 0; w < WATCH.length; w++){
      var a = extract(pre, WATCH[w].mark);
      info.watch.push(a ? { chars: a.text.length, items: items(a.text, WATCH[w].itemRe), into: owner(pPre, a.at) } : null);
    }
    return info;
  }
  function postSide(info, post){
    post = String(post || '');
    var res = { v: 2, at: Date.now(), stage: 'pre:Api.call-hook/post:fetch-inner', preLen: info.len, postLen: post.length,
                watch: {}, hitchhikersLost: 0, hitchhikerHosts: [], hitchhikerChars: 0, selected: 0, selectedLostCount: 0, verdict: 'OK' };
    for (var w = 0; w < WATCH.length; w++){
      var W = WATCH[w], a = info.watch[w], z = extract(post, W.mark);
      var r = { inPre: !!a, inPost: !!z, preChars: a ? a.chars : 0, postChars: z ? z.text.length : 0,
                preItems: 0, postItems: 0, lostCount: 0, absorbedInto: null, headerLost: false, verdict: 'absent' };
      if (a){
        // 見出しが消えても、項目（■ 行）が別ブロックの一部として生き残ることがある。
        // そのため送信後は見出しの有無に関係なく、送信 sys 全体から項目を探す。
        var ia = a.items, iz = items(z ? z.text : post, W.itemRe);
        r.preItems = ia.length;
        for (var k = 0; k < ia.length; k++){ if (iz.indexOf(ia[k]) >= 0) r.postItems++; else r.lostCount++; }
        r.absorbedInto = a.into;
        if (!z){ r.headerLost = true; r.verdict = r.postItems ? 'PARTIAL' : 'DROPPED'; }
        else if (r.lostCount || r.postChars < r.preChars * 0.9) r.verdict = 'PARTIAL';
        else r.verdict = 'OK';
      }
      res.watch[W.id] = r;
      if (r.verdict === 'DROPPED' || r.verdict === 'PARTIAL') res.verdict = 'LOSS';
    }
    var hh = info.hh;
    for (var h = 0; h < hh.length; h++){
      if (post.indexOf(hh[h].h) < 0){
        res.hitchhikersLost++;
        res.hitchhikerChars += hh[h].hc;
        if (res.hitchhikerHosts.indexOf(hh[h].host) < 0 && res.hitchhikerHosts.length < 5) res.hitchhikerHosts.push(hh[h].host);
      }
    }
    if (res.hitchhikersLost) res.verdict = 'LOSS';
    // カード選択器（Local 案 fix951＝旧仮称 fix901。本番には未配信）が「選んだ」と記録したカードが、実際に送る sys に全部あるか。
    //   名前は照合にだけ使い、件数だけを残す。選択器が無い本番では何もしない。
    try {
      var sel = window.__v292Dfix951 && window.__v292Dfix951.lastSelection && window.__v292Dfix951.lastSelection();
      if (sel && sel.names && sel.names.length && sel.at && (Date.now() - sel.at) < 60000){
        res.selected = sel.names.length;
        var cardsZ = extract(post, WATCH[0].mark);
        for (var s = 0; s < sel.names.length; s++){
          if (!cardsZ || cardsZ.text.indexOf('\u25a0 ' + sel.names[s]) < 0) res.selectedLostCount++;
        }
        if (res.selectedLostCount) res.verdict = 'LOSS';
      }
    } catch(e){}
    return res;
  }
  // 公開用（コンソールで手元の文字列を試すため）。返り値に項目名・見出し・本文は入らない。
  function analyze(pre, post){ return postSide(preSide(pre), post); }

  // ---- 記録（メモリ内のみ） ----
  var hist = [];
  var stats = { hookCalls: 0, posts: 0, paired: 0, pairedTurns: 0, unpaired: 0, ok: 0, loss: 0,
                cardsDropped: 0, cardsPartial: 0, memoryDropped: 0, memoryPartial: 0, hitchhikerLoss: 0, selectedLoss: 0,
                errors: 0, lastMs: 0, maxMs: 0 };
  var warned = {};
  var pend = [];  // { key, sys, t, used, info }  ※関数内だけ。公開しない

  function prune(now){
    for (var i = pend.length - 1; i >= 0; i--){ if ((now - pend[i].t) > PEND_TTL) pend.splice(i, 1); }
    while (pend.length > PEND_MAX) pend.shift();
  }
  function push(res){ hist.push(res); if (hist.length > RING) hist.shift(); }

  function record(res){
    push(res);
    if (res.verdict === 'OK') stats.ok++; else stats.loss++;
    var c = res.watch.cards, m = res.watch.memory;
    if (c && c.verdict === 'DROPPED') stats.cardsDropped++;
    if (c && c.verdict === 'PARTIAL') stats.cardsPartial++;
    if (m && m.verdict === 'DROPPED') stats.memoryDropped++;
    if (m && m.verdict === 'PARTIAL') stats.memoryPartial++;
    if (res.hitchhikersLost) stats.hitchhikerLoss++;
    if (res.selectedLostCount) stats.selectedLoss++;
    if (res.verdict !== 'OK'){
      var key = [c && c.verdict, m && m.verdict, res.hitchhikersLost ? 1 : 0, res.selectedLostCount ? 1 : 0].join('|');
      if (!warned[key]){
        warned[key] = 1;
        try {
          console.warn(TAG, 'block lost before send (record-only; request body unchanged)', JSON.stringify({
            cards:  c && { v: c.verdict, preChars: c.preChars, postChars: c.postChars, preItems: c.preItems, postItems: c.postItems, into: c.absorbedInto },
            memory: m && { v: m.verdict, preChars: m.preChars, postChars: m.postChars, into: m.absorbedInto },
            hitchhikersLost: res.hitchhikersLost, hitchhikerHosts: res.hitchhikerHosts, selectedLostCount: res.selectedLostCount }));
        } catch(_){}
      }
    }
  }

  function copyProps(from, to){ try { Object.keys(from).forEach(function(k){ to[k] = from[k]; }); } catch(e){} }
  function nowMs(){ try { return (window.performance && performance.now) ? performance.now() : Date.now(); } catch(e){ return Date.now(); } }

  // 送信 1 回分の判定。送信の経路からは切り離して（setTimeout 0）後で行う = 送信を遅らせない。
  function onPost(body){
    var t0 = nowMs();
    var mm = readMsgs(body);
    if (!mm) return;
    stats.posts++;
    var now = Date.now();
    prune(now);
    var key = fp(mm.user), pre = null, i;
    for (i = pend.length - 1; i >= 0; i--){ if (pend[i].key === key){ pre = pend[i]; break; } }
    var how = 'key';
    if (!pre && pend.length){
      // 予備の対応づけ: 5 秒以内の直前の送信前 sys で、先頭 120 字が一致するときだけ（別用途の送信との取り違えを防ぐ）
      var last = pend[pend.length - 1];
      if ((now - last.t) < 5000 && last.sys.slice(0, 120) === mm.sys.slice(0, 120)){ pre = last; how = 'recent'; }
    }
    if (pre){
      stats.paired++;
      if (!pre.used){ pre.used = true; stats.pairedTurns++; }
      if (!pre.info) pre.info = preSide(pre.sys);
      var res = postSide(pre.info, mm.sys);
      res.paired = how;
      record(res);
    } else {
      stats.unpaired++;
      // 送信前 sys が無い（Api.call を通らない送信など）: 送信 sys にカード/記憶の見出しがあるかだけを記録する。
      var lone = postSide(preSide(''), mm.sys); lone.paired = 'none';
      lone.postOnly = { cards: mm.sys.indexOf(WATCH[0].mark) >= 0, memory: mm.sys.indexOf(WATCH[1].mark) >= 0 };
      push(lone);
    }
    var dt = nowMs() - t0;
    stats.lastMs = Math.round(dt * 100) / 100;
    if (dt > stats.maxMs) stats.maxMs = Math.round(dt * 100) / 100;
  }
  function later(body){
    var run = function(){ try { onPost(body); } catch(e){ stats.errors++; } };
    try { setTimeout(run, 0); } catch(e){ stats.errors++; }
  }

  // ---- inner tap（読み込み時に装着 = その時点の最内に近い所） ----
  var innerOrig = window.fetch;
  var tapInstalled = false;
  if (typeof innerOrig === 'function'){
    var inner = function(u, o){
      try { if (!off() && isTextGen(u, o)) later(o.body); } catch(e){ stats.errors++; }   // body は文字列（不変）を受け取るだけ
      return innerOrig.apply(this, arguments);   // ★引数は受け取ったまま（参照も同一）
    };
    copyProps(innerOrig, inner);
    inner.__f950inner = true;
    window.fetch = inner;
    tapInstalled = true;
  }

  // ---- 送信前 sys の取得: Api._preCallHooks に「読むだけ」の hook を足す ----
  //   hook は何も返さない（undefined）ので system / userContent / maxTok は変わらない（index.html の preCall 分岐に入らない）。
  function preHook(ctx){
    try {
      if (!off() && ctx && typeof ctx.system === 'string' && ctx.system.length > 200){
        stats.hookCalls++;
        var now = Date.now();
        pend.push({ key: fp(ctx.userContent), sys: ctx.system, t: now, used: false });
        prune(now);
      }
    } catch(e){ stats.errors++; }
    // 何も返さない
  }
  preHook.__f950 = true;
  var hookInstalled = false;
  function installHook(){
    try {
      var A = window.Api || (typeof Api !== 'undefined' ? Api : null);   // eslint-disable-line no-undef
      if (!A) return false;
      if (!Array.isArray(A._preCallHooks)) return false;               // 初期化を待つ。自分では作らない
      for (var i = 0; i < A._preCallHooks.length; i++){ if (A._preCallHooks[i] && A._preCallHooks[i].__f950) { hookInstalled = true; return true; } }
      A._preCallHooks.push(preHook);
      hookInstalled = true;
      return true;
    } catch(e){ return false; }
  }
  installHook();
  try { setInterval(installHook, 2000); } catch(e){}   // 配列が作り直されても付け直す（冪等）

  window.__v292Dfix950 = {
    __armed: true,
    version: VERSION,
    analyze: analyze,
    installHook: installHook,
    last: function(){ return hist.length ? hist[hist.length - 1] : null; },
    history: function(){ return hist.slice(); },
    stats: function(){
      var o = {}; for (var k in stats) o[k] = stats[k];
      o.version = VERSION; o.off = off(); o.tapInstalled = tapInstalled; o.hookInstalled = hookInstalled; o.pendHeld = pend.length;
      return o;
    },
    isOff: off
  };
  try { console.log(TAG, 'armed', VERSION, '(record-only; inner fetch tap + Api._preCallHooks reader)'); } catch(e){}
})();
