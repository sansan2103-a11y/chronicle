// =====================================================================
// Chronicle TRPG - v292Dfix476: 3候補生成 → VLM検品 → 選抜パイプライン
// ---------------------------------------------------------------------
// 背景(2026-07-16・設計=Fable5 / 監査=GPT-5.6):
//   新キャラのアイコン生成1回(POST /image, artStyle=6)を fetch境界(最外殻)で横取りし、
//     ① seedだけ変えた3候補を内側チェーン(fix478リトライ→fix475正規化→…)へ並列発行
//     ② Worker新設 POST /inspect で VLM検品(ハード/ソフト判定)
//     ③ ハード全通過の中で最高ソフト点の候補の「元Response」を呼び出し元へそのまま返す
//   呼び出し元(features.js/fix346/fix402/fix474)は一切変更しない=1枚返ってきたようにしか見えない。
//
//   ★index.html では fix478 より後（=より外側／最外殻）に読み込む想定。
//   ★index.html変更・デプロイは親が別途行う。本ファイルは新規1ファイルで完結。
// ---------------------------------------------------------------------
// 有効化(opt-in・既定OFF): localStorage.v292Dfix476OnV1='1' かつ v292Dfix476Off!=='1'（live評価）
// 対象: fix475 が arm 済みで detect(prompt) が truthy な workers.dev の /image POST のみ。
//   それ以外（pollinations宛/非対象/OFF/fix475不在）は完全素通し(byte-equivalent)。
// 検証口: window.__v292Dfix476 = { status(), lastRun, __rng(テスト差替), __armed }
// レシピ補正(item8): 勝者seedが seeds[0] 以外のとき、応答処理後(setTimeout 0)に
//   v292avrec_<pk>.s(=呼び出し元が seeds[0] で記録した値)を勝者seedへ上書き。書込は v292avrec_ のみ。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix476 && window.__v292Dfix476.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix476:pipeline]';
  var W = (typeof window !== 'undefined') ? window : this;

  // ---------- 有効条件（live評価・opt-in・既定OFF） ----------
  function on(){
    try {
      if (localStorage.getItem('v292Dfix476Off') === '1') return false;
      return localStorage.getItem('v292Dfix476OnV1') === '1';
    } catch(e){ return false; }
  }

  // ---------- 対象判定（fix475/478 と同一の isAvatarGen） ----------
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai/v1/images/generations') < 0 &&
          !(/workers\.dev/.test(u) && u.indexOf('/image') >= 0)) return false;
      return !!(init && init.method === 'POST' && typeof init.body === 'string');
    } catch(e){ return false; }
  }
  // パイプラインは workers.dev の /image 限定（/inspect の同一オリジンが必要）。
  function workersImage(url){
    try {
      var u = String((url && url.url) || url || '');
      return /workers\.dev/.test(u) && u.indexOf('/image') >= 0;
    } catch(e){ return false; }
  }
  function inspectUrlFor(url){
    var u = String((url && url.url) || url || '');
    var m = /^(https?:\/\/[^\/]+)/.exec(u);
    return (m ? m[1] : '') + '/inspect';
  }

  // ---------- fix475 アクセサ ----------
  function f475(){ return W.__v292Dfix475; }
  function detectKind(prompt){
    try { var d = f475() && f475().detect && f475().detect(String(prompt)); return d ? (d.kind || 'human') : null; }
    catch(e){ return null; }
  }

  // ---------- 検証口ハンドル（先に確保して pipeline から参照） ----------
  var API = {
    __armed: true,
    lastRun: null,
    __rng: null,            // テストで差替（本番はnull=Math.random）
    status: function(){ return { on: on(), armed: true, unsafeChain: unsafeChain }; }
  };
  W.__v292Dfix476 = API;

  // ---------- seed 生成 ----------
  function randSeed(){
    try { if (typeof API.__rng === 'function') return (API.__rng() | 0) || 1; } catch(e){}
    return Math.floor(Math.random() * 1000000000) + 1;
  }
  function mkSeeds(baseSeed, batch){
    if (baseSeed != null && isFinite(baseSeed)){
      return (batch === 0) ? [baseSeed, baseSeed + 101, baseSeed + 211]
                           : [baseSeed + 307, baseSeed + 409, baseSeed + 521];
    }
    return [randSeed(), randSeed(), randSeed()];
  }

  // ---------- /inspect 用ヘッダ（入口initから必要な3つだけコピー） ----------
  function copyInspectHeaders(init){
    var out = {};
    try {
      var h = init && init.headers;
      function get(name){
        if (!h) return null;
        if (typeof h.get === 'function'){ try { return h.get(name); } catch(e){ return null; } }
        for (var k in h){ if (k.toLowerCase() === name.toLowerCase()) return h[k]; }
        return null;
      }
      ['x-google-id', 'x-chronicle-pass', 'Content-Type'].forEach(function(name){
        var v = get(name); if (v != null) out[name] = v;
      });
    } catch(e){}
    if (!out['Content-Type']) out['Content-Type'] = 'application/json';
    return out;
  }

  // ---------- desc（正規化後prompt から STYLE6_TAIL(_CREATURE) を末尾除去） ----------
  function buildDesc(prompt, kind){
    var f = f475(), norm;
    try { norm = (f && typeof f.canonicalize === 'function') ? f.canonicalize(prompt) : String(prompt == null ? '' : prompt); }
    catch(e){ norm = String(prompt == null ? '' : prompt); }
    norm = String(norm == null ? '' : norm);
    var tail = (kind === 'creature') ? (f && f.STYLE6_TAIL_CREATURE) : (f && f.STYLE6_TAIL);
    if (tail){
      var t = norm.replace(/\s+$/, '');
      if (t.length >= tail.length && t.slice(t.length - tail.length) === tail){
        t = t.slice(0, t.length - tail.length).replace(/[\s,;]+$/, '');
      }
      norm = t;
    }
    if (norm.length > 800) norm = norm.slice(0, 800);
    return norm;
  }

  var _origFetch = W.fetch;

  // ---------- ラッパ順序ガード（item3・fix478 が内側に居なければ待機） ----------
  //   own props 継承（fix419c）で内側チェーンのフラグは _origFetch に伝播 → own property で判定。
  var unsafeChain = !(_origFetch && _origFetch.__v292Dfix478 === true);
  var _warnedUnsafe = false;

  // ---------- 候補タイムアウト（item2・既定40s・テストは API.__candTimeoutMs で短縮） ----------
  function candTimeoutMs(){
    try { if (typeof API.__candTimeoutMs === 'number' && API.__candTimeoutMs > 0) return API.__candTimeoutMs; } catch(e){}
    return 40000;
  }

  // ---------- 候補生成（seedだけ替えて内側チェーンへ並列発行） ----------
  //   resp は clone().json() で読み、元Response は未consumeのまま温存（勝者返却用）。
  //   各候補は candTimeoutMs() の Promise.race で包み、時間切れは {ok:false}（AbortControllerがあれば中断も試行）。
  function genCandidates(url, init, baseBody, seeds){
    var TO = candTimeoutMs();
    var reqs = seeds.map(function(seed){
      var b = Object.assign({}, baseBody, { seed: seed });
      var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var init2 = Object.assign({}, init, { body: JSON.stringify(b) });   // 入口initを破壊しない複製
      if (ac) init2.signal = ac.signal;
      var timer = null;
      var timeout = new Promise(function(resolve){
        timer = setTimeout(function(){
          try { if (ac) ac.abort(); } catch(e){}
          resolve({ ok: false, seed: seed });
        }, TO);
      });
      var real = _origFetch.call(W, url, init2).then(function(resp){
        return resp.clone().json().then(function(j){
          var b64 = j && j.data && j.data[0] && j.data[0].b64_json;
          if (resp && resp.ok && b64) return { ok: true, seed: seed, resp: resp, b64: b64 };
          return { ok: false, seed: seed };
        }, function(){ return { ok: false, seed: seed }; });
      }, function(){ return { ok: false, seed: seed }; });
      return Promise.race([real, timeout]).then(function(v){ if (timer) clearTimeout(timer); return v; });
    });
    return Promise.allSettled(reqs).then(function(settled){
      return settled.map(function(s){ return s.status === 'fulfilled' ? s.value : { ok: false }; })
                    .filter(function(c){ return c && c.ok; });
    });
  }

  // ---------- 検品（/inspect へ POST・12sタイムアウト）→ 各候補に pass/score を付与 ----------
  //   戻り値: 検品成功=candidates(スコア付与済) / 失敗(非200・タイムアウト・壊れ応答)=null
  // ---------- hard 失敗数（item1・r.hard の値が false の個数 / hard無ければ pass?0:99） ----------
  function hardFailCount(r){
    var h = r && r.hard;
    if (h && typeof h === 'object'){
      var n = 0;
      for (var k in h){ if (Object.prototype.hasOwnProperty.call(h, k) && h[k] === false) n++; }
      return n;
    }
    return (r && r.pass) ? 0 : 99;
  }

  function inspectAndScore(url, init, kind, desc, cands){
    var images = cands.slice(0, 4).map(function(c){ return c.b64; });
    var payload = { images: images, kind: kind, desc: desc };
    var headers = copyInspectHeaders(init);
    var iurl = inspectUrlFor(url);
    var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (ac){
      timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, 12000);
      if (timer && typeof timer.unref === 'function') timer.unref();
    }
    var opt = { method: 'POST', headers: headers, body: JSON.stringify(payload) };
    if (ac) opt.signal = ac.signal;
    // item6: タイマー解除は json() 解析完了後（ヘッダ受信時では解除しない）。
    return _origFetch.call(W, iurl, opt).then(function(resp){
      if (!resp || !resp.ok){ if (timer) clearTimeout(timer); return null; }
      return resp.json().then(function(j){
        if (timer) clearTimeout(timer);
        if (!j || !Array.isArray(j.results)) return null;   // 壊れ応答=検品なし扱い
        for (var i = 0; i < cands.length; i++){
          var r = j.results[i] || {};
          cands[i].pass = !!r.pass;
          cands[i].score = (typeof r.score === 'number') ? r.score : (r.pass ? 100 : 0);
          cands[i].hardFails = hardFailCount(r);
        }
        return cands;
      }, function(){ if (timer) clearTimeout(timer); return null; });
    }, function(){ if (timer) clearTimeout(timer); return null; });
  }

  function bestPass(cands){
    var best = null;
    for (var i = 0; i < cands.length; i++){
      if (cands[i].pass){ if (!best || (cands[i].score || 0) > (best.score || 0)) best = cands[i]; }
    }
    return best;
  }
  // item1: hardFails 昇順 → score 降順で選ぶ。
  function bestScore(cands){
    var best = null;
    for (var i = 0; i < cands.length; i++){
      var c = cands[i];
      if (!c) continue;
      if (!best){ best = c; continue; }
      var chf = (c.hardFails == null) ? 99 : c.hardFails;
      var bhf = (best.hardFails == null) ? 99 : best.hardFails;
      if (chf < bhf || (chf === bhf && (c.score || 0) > (best.score || 0))) best = c;
    }
    return best;
  }

  // ---------- 落選候補の body 解放（item5・勝者の body には絶対触れない） ----------
  function releaseLosers(cands, winner){
    try {
      for (var i = 0; i < cands.length; i++){
        var c = cands[i];
        if (!c || c === winner) continue;
        try { if (c.resp && c.resp.body) c.resp.body.cancel(); } catch(e){}
      }
    } catch(e){}
  }

  var _warnedCount = 0;
  function warn(msg){ try { console.warn(TAG, msg); } catch(e){} }

  // ---------- レシピseed補正（item8・応答処理後に遅延実行・書込は v292avrec_ のみ） ----------
  //   item4: (a)マッチ2件以上ならwarnして何もしない(誤爆防止) (b)t=0/250/1000msの最大3回試行で
  //   遅延書込に追随。1件マッチで補正できたら終了。既に勝者seedと同値なら成功扱い(書込不要)。
  function correctRecipeSeedDeferred(baseBody, winnerSeed){
    try {
      var s = baseBody && baseBody.seed;
      var entrySeed = (s != null && isFinite(+s)) ? +s : null;
      if (entrySeed != null && winnerSeed === entrySeed) return;   // 勝者=seeds[0]→レシピは既に正しい
      var entryPrompt = String(baseBody && baseBody.prompt == null ? '' : baseBody.prompt);
      var delays = [0, 250, 1000];
      var done = false;
      var attempt = function(i){
        if (done) return;
        var matches = [];
        try {
          for (var j = 0; j < localStorage.length; j++){
            var k = localStorage.key(j);
            if (!k || k.indexOf('v292avrec_') !== 0) continue;
            var rec = null; try { rec = JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ continue; }
            if (!rec) continue;
            if (String(rec.p) !== entryPrompt) continue;
            var rs = (rec.s == null) ? null : +rec.s;
            var isEntry = (entrySeed == null) ? (rec.s == null) : (rs === entrySeed);
            var isWinner = (rs === winnerSeed);
            if (isEntry || isWinner) matches.push({ k: k, rec: rec, isWinner: isWinner });
          }
        } catch(e){ done = true; warn('recipe seed correction failed'); return; }
        if (matches.length >= 2){
          done = true;
          warn('[fix476] recipe seed ambiguous (>=2 matches); skip correction');
          return;
        }
        if (matches.length === 1){
          done = true;
          var m = matches[0];
          if (m.isWinner) return;   // 既に勝者seedと同値=成功扱い(書込不要)
          try { m.rec.s = winnerSeed; localStorage.setItem(m.k, JSON.stringify(m.rec)); } catch(e){}
          return;
        }
        // 0件 → 呼び出し元のレシピ書込が遅れている可能性 → 次の遅延で再試行
        if (i + 1 < delays.length){
          try { var t = setTimeout(function(){ attempt(i + 1); }, delays[i + 1]); if (t && typeof t.unref === 'function') t.unref(); } catch(e){}
        }
      };
      // 呼び出し元の .then(=レシピ書込)はマイクロタスク。macrotask(setTimeout)で確実に後追い。
      try { var t0 = setTimeout(function(){ attempt(0); }, delays[0]); if (t0 && typeof t0.unref === 'function') t0.unref(); } catch(e){ attempt(0); }
    } catch(e){}
  }

  // ---------- パイプライン本体 ----------
  function pipelineCore(url, init){
    var lastRun = { seeds: [], scores: [], picked: null, rebatched: false, inspected: false, fallback: null, error: null };
    API.lastRun = lastRun;

    var baseBody = JSON.parse(String(init.body));
    var kind = detectKind(baseBody.prompt) || 'human';
    var bs = baseBody.seed;
    var baseSeed = (bs != null && isFinite(+bs)) ? +bs : null;
    var desc = buildDesc(baseBody.prompt, kind);

    var seeds1 = mkSeeds(baseSeed, 0);
    lastRun.seeds = seeds1.slice();

    return genCandidates(url, init, baseBody, seeds1).then(function(cands){
      if (!cands.length){
        // 成功0枚 → 入口リクエストを1回だけ素通し(fail-open)
        lastRun.fallback = 'no-candidates';
        warn('all candidate generations failed; passing entry request through');
        return _origFetch.call(W, url, init);
      }
      return inspectAndScore(url, init, kind, desc, cands).then(function(scored){
        if (scored === null){
          // 検品失敗 → 検品なしで最初の成功候補(fail-open)
          lastRun.fallback = 'inspect-failed';
          lastRun.picked = cands[0].seed;
          warn('[fix476] inspection unavailable; adopting first candidate');
          releaseLosers(cands, cands[0]);
          correctRecipeSeedDeferred(baseBody, cands[0].seed);
          return cands[0].resp;
        }
        lastRun.inspected = true;
        lastRun.scores = cands.map(function(c){ return c.score || 0; });
        var winner = bestPass(cands);
        if (winner){
          releaseLosers(cands, winner);
          lastRun.picked = winner.seed;
          correctRecipeSeedDeferred(baseBody, winner.seed);
          return winner.resp;
        }
        // pass 0件 → seed替えでもう1バッチ+再検品を1回だけ
        var seeds2 = mkSeeds(baseSeed, 1);
        lastRun.rebatched = true;
        lastRun.seeds = lastRun.seeds.concat(seeds2);
        return genCandidates(url, init, baseBody, seeds2).then(function(cands2){
          var afterInspect = cands2.length
            ? inspectAndScore(url, init, kind, desc, cands2)
            : Promise.resolve(null);
          return afterInspect.then(function(scored2){
            var all = cands.concat(cands2);
            lastRun.scores = all.map(function(c){ return c.score || 0; });
            var w2 = bestPass(all);
            if (!w2){
              w2 = bestScore(all);
              warn('[fix476] all candidates failed inspection; adopting best-effort');
            }
            // 全滅かつ全候補脱落(w2なし)は理論上ここに来ない(cands非空)が安全側で最初の候補
            if (!w2) w2 = cands[0];
            releaseLosers(all, w2);
            lastRun.picked = w2.seed;
            correctRecipeSeedDeferred(baseBody, w2.seed);
            return w2.resp;
          });
        });
      });
    });
  }

  // ---------- fail-open ラッパ：pipeline内のあらゆる例外→console.warn 1回+入口素通し1回 ----------
  function runPipeline(url, init){
    var p;
    try { p = pipelineCore(url, init); } catch(e){ p = Promise.reject(e); }
    return p.catch(function(e){
      try { if (API.lastRun) API.lastRun.error = String((e && e.message) || e); } catch(_){}
      warn('pipeline error; failing open');
      return _origFetch.call(W, url, init);   // 入口リクエストを1回だけ素通し
    });
  }

  // ---------- fetch ラッパ ----------
  var wrapped = function(url, init){
    if (unsafeChain){
      if (!_warnedUnsafe){ _warnedUnsafe = true; warn('fix478が内側に居ない=ロード順異常のためfix476は待機'); }
      return _origFetch.apply(this, arguments);   // 順序異常時は常に完全素通し
    }
    try {
      if (on() && isAvatarGen(url, init) && workersImage(url)){
        var f = f475();
        if (f && f.__armed && typeof f.detect === 'function'){
          var qb = null;
          try { qb = JSON.parse(String(init.body)); } catch(e){ qb = null; }
          if (qb && qb.prompt != null && f.detect(String(qb.prompt))){
            return runPipeline(url, init);
          }
        }
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, arguments);   // 非対象・OFF・例外 → 完全素通し(byte-equivalent)
  };

  // ---------- own props 全継承（fix419cの教訓：フラグ消し合い＝再ラップ地獄の防止） ----------
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix476 = true;    // 冪等フラグはラッパ関数上にも立てる
  W.fetch = wrapped;

  try { console.log(TAG, 'armed; active:', on() ? 'on' : 'off(preview)'); } catch(e){}
})();
