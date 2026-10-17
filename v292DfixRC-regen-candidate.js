/* v292DfixRC: キャラ一覧の「↻ アイコン再生成」を「候補 → 明示採用」にする（GPT #127-BS・#127-BT）
 *
 * 目的: ↻ を押しても、採用中のアイコン（端末・サーバ）を変えない。新しい絵は「候補」として別の場所に置き、
 *   利用者が［この絵にする］を押したときだけ、物語・人物ごとのキー（pk_s）へ CAS で採用する。
 *
 * 守ること
 *   ・候補の生成中・失敗・［やめる］・リロード・切替のどれでも、採用中の画像・レシピ・variant・外見の素材を変えない。
 *     候補は cache[] / persist / data-avpk / fix523 の送信経路に入れない（このモジュールの IndexedDB と UI の <img> だけ）。
 *   ・人物の識別は hero（主人公）／npc:<id>（id が ^npc\d{13}$ で物語内に重複なし）だけ。
 *     それ以外（位置文字の id・重複・roster だけの人物・同名）は、**有料の生成を始める前に**止めて案内する。
 *   ・Asset v2 の物語（docSchema2 true）は従来の経路へ素通し（このモジュールは何もしない）。
 *   ・採用: 候補を作った時と epoch・物語・人物・画風が同じか確認 → ジャーナル sending → manifest で base rev →
 *     putimg（CAS・storyId 付き）→ 成功後に端末へ反映。409 は自動で送り直さない（競合として止める）。
 *   ・起動時: sending のジャーナルが残っていれば manifest の hash と照合（一致＝採用済みとして取り込む・不一致＝候補に戻す）。再送しない。
 *   ・採用した絵を知った端末は、manifest の取得に失敗しても従来のキーへ戻らない（台帳は消さない）。
 *
 * キー: pk_s = 'r1_' + token + '_a' + 画風 + '_s' + hash(storyId)
 *   ・'r1_' で始まる＝従来の 'n…' と名前空間が分かれる。
 *   ・末尾 '_s'+hash(storyId) は Worker の svImgSuffix と同じ式＝Vault で隠した物語の画像として扱われる。
 *
 * kill: localStorage v292DfixRCOff='1'（クリックを横取りせず、scopedFor は常に '' ＝ BUNDLE16 と同じ動き）。
 */
(function(){
  'use strict';
  if (window.__v292DfixRC) return;
  var TAG = '[v292DfixRC]';
  var LED = 'v292DfixRC_led', JRN = 'v292DfixRC_j', PREFIX = 'v292av2_';
  var POLL = 'https://gen.pollinations.ai/v1/images/generations';
  var NPC_ID_RE = /^npc\d{13}$/;
  var stats = { intercepted: 0, blocked: 0, generated: 0, genFail: 0, adopted: 0, conflict: 0, discovered: 0, recovered: 0, passThrough: 0 };

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsd(k){ try { localStorage.removeItem(k); } catch(e){} }
  function on(){ return lsg('v292DfixRCOff') !== '1'; }
  function getS(){ try { return window.__chronicleGetState ? window.__chronicleGetState() : (window.S || null); } catch(e){ return null; } }
  function f197(){ var f = window.__v292Dfix197; return (f && f.keyFor) ? f : null; }
  function f523(){ var f = window.__v292Dfix523; return (f && f.__armed && f.putScoped) ? f : null; }
  function f946(){ try { var F = window.__v292Dfix946; return (F && F.__armed && F.on() && F.m3On()) ? F : null; } catch(e){ return null; } }
  function fenced(){ try { var F = f946(); return !!(F && F.fenced()); } catch(e){ return false; } }
  function epoch(){ try { var F = f946(); return F ? String(F.epoch()) : '0'; } catch(e){ return '0'; } }
  function av2Doc(){ try { var M = window.__v292Dav2Map; return (M && typeof M.docSchema2 === 'function') ? M.docSchema2() : false; } catch(e){ return false; } }
  function hash(s){ var h = 0; s = String(s); for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h).toString(36); }
  function storyId(){
    try { var q = new URLSearchParams(location.search).get('story'); if (q) return String(q); } catch(e){}
    var raw = lsg('chr6_active_slot'); return String(raw || '').replace(/^"|"$/g, '');
  }
  function artNow(){ try { var f = f197(); if (f && f.artStyleNow) return String(f.artStyleNow()); } catch(e){} return '0'; }
  function canon(n){ try { var f = f197(); var c = f && f.canonName ? f.canonName(n) : n; return f && f.resolveVariant764 ? f.resolveVariant764(c) : c; } catch(e){ return String(n || ''); } }
  function pkS(sid, token, art){ return 'r1_' + token + '_a' + art + '_s' + hash(sid); }
  /* ★r2（GPT #127-BX 案 A）：採用キーから画風を外す。画風（cfg.artStyle）は端末ごとの設定で、物語の正本に入らない
     （fix697／fix719 の allowlist が除外）。画風をキーに含めると、端末で画風が違うだけで別のキーを探してしまう（本番 BUNDLE17 で実測：iPhone a0／PC a6）。
     新しく採用した絵は ax に保存する。BUNDLE17 で書かれた a<数字> のキーは読み取りだけ互換にする（移行・削除・複製はしない）。 */
  function pkX(sid, token){ return 'r1_' + token + '_ax_s' + hash(sid); }

  /* ---------- 人物の識別（名前だけで推測しない） ---------- */
  function resolve(nameCanon){
    var S = getS(); var c = S && S.cast; if (!c) return { ok: false, why: 'nocast' };
    var nm = String(nameCanon || '').trim(); if (!nm) return { ok: false, why: 'noname' };
    var hits = [];
    try { if (c.hero && c.hero.name && canon(String(c.hero.name).trim()) === nm) hits.push({ token: 'hero' }); } catch(e){}
    var npcs = c.npcs || [], idCount = {};
    npcs.forEach(function(n){ if (n && n.id != null) idCount[String(n.id)] = (idCount[String(n.id)] || 0) + 1; });
    npcs.forEach(function(n){
      try { if (n && n.name && canon(String(n.name).trim()) === nm) hits.push({ token: 'npc', id: String(n.id == null ? '' : n.id) }); } catch(e){}
    });
    if (hits.length === 0) return { ok: false, why: 'unregistered' };
    if (hits.length > 1) return { ok: false, why: 'ambiguous' };
    var h = hits[0];
    if (h.token === 'hero') return { ok: true, token: 'hero' };
    if (!NPC_ID_RE.test(h.id) || idCount[h.id] !== 1) return { ok: false, why: 'unstable-id' };
    return { ok: true, token: h.id };
  }

  /* ---------- 台帳（採用した絵。いったん知ったら消さない） ---------- */
  function ledger(){ try { return JSON.parse(lsg(LED) || '{}') || {}; } catch(e){ return {}; } }
  function ledKey(sid, token, art){ return sid + '|' + token + '|' + art; }
  function ledSet(sid, token, art, ent){ var m = ledger(); m[ledKey(sid, token, art)] = ent; lss(LED, JSON.stringify(m)); }
  var ledCache = null, ledCacheAt = 0;
  function ledFast(){ var now = Date.now(); if (!ledCache || now - ledCacheAt > 500){ ledCache = ledger(); ledCacheAt = now; } return ledCache; }

  /* fix197.keyFor から呼ばれる（毎回の描画で呼ばれるので軽く）。keyFor は呼ばない（再帰しない）。 */
  function scopedFor(nameCanon, art){
    try {
      if (!on()) return '';
      var sid = storyId(); if (!sid) return '';
      var m = ledFast(), pre = sid + '|', any = false;
      for (var k in m){ if (k.indexOf(pre) === 0){ any = true; break; } }
      if (!any) return '';
      if (av2Doc() === true) return '';
      var r = resolve(nameCanon); if (!r.ok) return '';
      /* 優先順：ax（画風に依存しない採用）→ L（manifest で 1 件だけ見つかった旧 a<数字> のキー）→ この端末が BUNDLE17 で採用した a<今の画風> */
      var e = m[ledKey(sid, r.token, 'x')] || m[ledKey(sid, r.token, 'L')] || m[ledKey(sid, r.token, String(art))];
      return (e && e.pk) ? e.pk : '';
    } catch(e){ return ''; }
  }

  /* ---------- 候補の置き場（IndexedDB・このモジュール専用） ---------- */
  var dbP = null;
  function db(){
    if (dbP) return dbP;
    dbP = new Promise(function(res, rej){
      try { var rq = indexedDB.open('chr6rc', 1);
        rq.onupgradeneeded = function(){ try { rq.result.createObjectStore('cand', { keyPath: 'slot' }); } catch(e){} };
        rq.onsuccess = function(){ res(rq.result); }; rq.onerror = function(){ rej(rq.error); };
      } catch(e){ rej(e); }
    });
    return dbP;
  }
  function candSlot(ep, sid, token, art){ return ep + '|' + sid + '|' + token + '|' + art; }
  function candGet(slot){ return db().then(function(d){ return new Promise(function(res){ try { var t = d.transaction('cand', 'readonly').objectStore('cand').get(slot); t.onsuccess = function(){ var v = t.result; if (v && Date.now() - v.at > 24 * 3600 * 1000){ candDel(slot); v = null; } res(v || null); }; t.onerror = function(){ res(null); }; } catch(e){ res(null); } }); }).catch(function(){ return null; }); }
  function candPut(v){ return db().then(function(d){ return new Promise(function(res){ try { var t = d.transaction('cand', 'readwrite'); t.objectStore('cand').put(v); t.oncomplete = function(){ res(true); }; t.onerror = function(){ res(false); }; } catch(e){ res(false); } }); }).catch(function(){ return false; }); }
  function candDel(slot){ return db().then(function(d){ return new Promise(function(res){ try { var t = d.transaction('cand', 'readwrite'); t.objectStore('cand').delete(slot); t.oncomplete = function(){ res(true); }; t.onerror = function(){ res(false); }; } catch(e){ res(false); } }); }).catch(function(){ return false; }); }

  /* ---------- 候補の生成（採用中の画像・レシピ・variant には触らない） ---------- */
  function pollKey(){ try { var f = f197(); return f && f.pollKey ? String(f.pollKey() || '') : ''; } catch(e){ return ''; } }
  function buildBody(name, attempt){
    var nm = canon(name);
    try {
      var a766 = window.__v292Dfix766, r767 = window.__v292Dfix767;
      /* この端末に外見の record が無いときだけ作る（従来の初回生成 genOne と同じ ensureFor。既にある record は変えない）。
         無いままだと日本語の素材文になり、p8d で止まって候補を作れない（ほかの端末で作った絵を取り込んだだけの端末で起きる） */
      try { if (a766 && a766.__armed && a766.on() && !a766.get(nm) && typeof a766.ensureFor === 'function'){ a766.ensureFor(nm); stats.recordCreated = (stats.recordCreated || 0) + 1; } } catch(eE){}
      if (a766 && a766.__armed && a766.on() && r767 && r767.__armed && a766.get(nm)){
        var rc = r767.buildRecipe(nm);
        if (rc && rc.sampling){
          rc = JSON.parse(JSON.stringify(rc));
          rc.sampling.variantIndex = (+rc.sampling.variantIndex || 0) + 1 + attempt;   // メモリ上だけ（bumpVariant は呼ばない）
          var pb = r767.toProviderBody(rc);
          if (pb && pb.prompt){ var b = { model: 'flux', prompt: pb.prompt, n: 1, size: '384x384', seed: pb.seed }; if (pb.imgProvider) b.imgProvider = pb.imgProvider; if (pb.style420) b.style420 = pb.style420; return b; }
        }
      }
    } catch(e){}
    try { var f = f197(); var p = f && f.buildCurrentAppearancePrompt ? (f.buildCurrentAppearancePrompt(nm) || '') : '';
      if (p) return { model: 'flux', prompt: p, n: 1, size: '384x384', seed: Math.floor(Math.random() * 1000000000) + 1 }; } catch(e){}
    return null;
  }
  var CJK = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/;
  function generate(name, ctx){
    var key = pollKey(); if (!key) return Promise.resolve({ ok: false, why: 'nokey' });
    var body = buildBody(name, ctx.attempt || 0); if (!body) return Promise.resolve({ ok: false, why: 'nomaterial' });
    /* 送る前に止める: 日本語が残る指示文（外見の英語化ができていない）は送らない（p8d に頼らず、費用 0 で止める） */
    if (CJK.test(String(body.prompt || ''))){ stats.cjkBlocked = (stats.cjkBlocked || 0) + 1; return Promise.resolve({ ok: false, why: 'nomaterial' }); }
    /* 送る前に止める: 物語・アカウントが切り替わった */
    if (storyId() !== ctx.sid || fenced()) return Promise.resolve({ ok: false, why: 'switched' });
    var ep0 = epoch();
    return fetch(POLL, { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ if (!r.ok) throw r.status; return r.json(); })
      .then(function(j){
        var b = j && j.data && j.data[0] && j.data[0].b64_json; if (!b) throw 'nob64';
        if (epoch() !== ep0 || fenced() || storyId() !== ctx.sid) return { ok: false, why: 'switched' };
        var mime = b.charAt(0) === '/' ? 'image/jpeg' : 'image/png';
        stats.generated++;
        return { ok: true, data: 'data:' + mime + ';base64,' + b, prompt: body.prompt, seed: body.seed, model: body.imgProvider || body.model };
      })
      .catch(function(e){ stats.genFail++; return { ok: false, why: 'genfail' }; });
  }

  /* ---------- 採用（サーバの CAS 成功後に端末へ） ---------- */
  function journal(){ try { return JSON.parse(lsg(JRN) || 'null'); } catch(e){ return null; } }
  function adopt(cand){
    return new Promise(function(done){
      var F = f523(), G = f197();
      if (!F || !G) return done({ ok: false, why: 'notready' });
      if (fenced() || av2Doc() === true) return done({ ok: false, why: 'notready' });
      var sid = storyId(), art = artNow(), r = resolve(canon(cand.name));
      if (cand.ep !== epoch() || cand.sid !== sid || cand.art !== art || !r.ok || r.token !== cand.token) return done({ ok: false, why: 'changed' });
      var pk = pkX(sid, cand.token), hsh = F.hashFull(cand.data);   // ★r2：保存先は画風に依存しない ax
      F.fetchManifest(function(man){
        if (!man) return done({ ok: false, why: 'offline' });
        if (cand.ep !== epoch()) return done({ ok: false, why: 'changed' });
        var srv = man[PREFIX + pk]; var base = srv ? (+srv.rev || 0) : 0;
        lss(JRN, JSON.stringify({ cid: cand.id, slot: cand.slot, pk: pk, sid: sid, token: cand.token, art: art, ax: 1, hash: hsh, state: 'sending', at: Date.now() }));
        F.putScoped(pk, cand.data, base, sid, function(res){
          if (res && res.ok && res.j && res.j.imageRev != null){
            try { F.revSetExt(pk, res.j.imageRev); } catch(e){}
            try { F.markRecv(pk); } catch(e){}
            ledSet(sid, cand.token, 'x', { pk: pk, rev: res.j.imageRev, hash: hsh, at: Date.now() }); ledCache = null;
            G.adoptLocal(pk, cand.data);
            lsd(JRN); candDel(cand.slot); stats.adopted++;
            try { G.sweep && G.sweep(); } catch(e){}
            return done({ ok: true });
          }
          if (res && res.status === 409){ stats.conflict++; lsd(JRN); return done({ ok: false, why: 'conflict' }); }
          /* 応答が分からない（切断など）: ジャーナルは残し、次の起動で manifest と照合する。ここでは再送しない */
          return done({ ok: false, why: 'unknown' });
        });
      });
    });
  }
  /* 起動時: sending のジャーナルを manifest と照合（再送しない） */
  function recover(){
    var J = journal(); if (!J || J.state !== 'sending') return;
    var F = f523(), G = f197(); if (!F || !G) return;
    F.fetchManifest(function(man){
      if (!man) return;   // 分からないときは何もしない（ジャーナルを残す）
      var srv = man[PREFIX + J.pk];
      if (srv && String(srv.hash) === String(J.hash)){
        try { F.revSetExt(J.pk, +srv.rev || 0); } catch(e){}
        ledSet(J.sid, J.token, J.ax ? 'x' : J.art, { pk: J.pk, rev: +srv.rev || 0, hash: J.hash, at: Date.now() }); ledCache = null;
        candGet(J.slot).then(function(c){ if (c && c.data && J.sid === storyId() && (J.ax || J.art === artNow())){ try { F.markRecv(J.pk); } catch(e){} G.adoptLocal(J.pk, c.data); } candDel(J.slot); });
        stats.recovered++; lsd(JRN);
        try { G.sweep && G.sweep(); } catch(e){}
      } else { lsd(JRN); }   // 採用されていない → 候補は残したまま（自動では送り直さない）
    });
  }
  /* 物語を開いたとき: 今の物語の人物について、ほかの端末で採用された pk_s を manifest から知る（台帳へ追加のみ） */
  function discover(){
    if (!on() || av2Doc() === true || fenced()) return;
    var F = f523(), G = f197(); if (!F || !G) return;
    var S = getS(), c = S && S.cast; if (!c) return;
    var sid = storyId(), art = artNow(); if (!sid) return;
    F.fetchManifest(function(man){
      if (!man || storyId() !== sid) return;
      var names = []; try { if (c.hero && c.hero.name) names.push(c.hero.name); (c.npcs || []).forEach(function(n){ if (n && n.name) names.push(n.name); }); } catch(e){}
      var added = 0, m = ledger(), suf = '_s' + hash(sid);
      function up(token, tag, pk, srv){
        var lk = ledKey(sid, token, tag), cur = m[lk];
        if (!cur || cur.pk !== pk || (+srv.rev || 0) > (+cur.rev || 0)){ m[lk] = { pk: pk, rev: +srv.rev || 0, hash: String(srv.hash || ''), at: Date.now() }; added++; }
      }
      names.forEach(function(n){
        var r = resolve(canon(n)); if (!r.ok) return;
        /* ★r2：ax があればそれだけを使う */
        var px = pkX(sid, r.token), sx = man[PREFIX + px];
        if (sx){ up(r.token, 'x', px, sx); return; }
        /* ★r2：ax が無いときだけ、BUNDLE17 の a<数字> を画風を問わず探す（この物語のこの人物に限る）。
           1 件だけなら使う。2 件以上なら自動では選ばない（競合として数えるだけ。台帳も表示も変えない） */
        var pre = PREFIX + 'r1_' + r.token + '_a', found = [];
        for (var k in man){
          if (k.indexOf(pre) !== 0 || k.length <= pre.length + suf.length || k.slice(-suf.length) !== suf) continue;
          if (/^\d+$/.test(k.slice(pre.length, k.length - suf.length))) found.push(k);
        }
        if (found.length === 1){ up(r.token, 'L', found[0].slice(PREFIX.length), man[found[0]]); }
        else if (found.length > 1){ stats.legacyConflict = (stats.legacyConflict || 0) + 1; }
      });
      if (added){ lss(LED, JSON.stringify(m)); ledCache = null; stats.discovered += added; try { G.sweep && G.sweep(); } catch(e){} try { F.recvSweep && F.recvSweep(); } catch(e){} }
    });
  }

  /* ---------- 画面 ---------- */
  var MSG = {
    unregistered: 'この人物はキャラ設定に登録されていないため、絵を選び直せません。キャラ設定で登録すると選べるようになります。',
    ambiguous: '同じ名前の人物が複数いるため、絵を選び直せません。名前を区別してください。',
    'unstable-id': 'この人物はキャラ設定の登録情報が古い形式のため、絵を選び直せません。キャラ設定で一度登録し直すと選べるようになります。',
    nocast: '物語の読み込みが終わっていません。少し待ってからもう一度押してください。',
    noname: '人物を特定できませんでした。',
    nomaterial: 'この人物は外見の材料がないため、新しい絵を作れません。キャラ設定で外見を書くと作れるようになります。',
    nokey: '画像を作る準備ができていません。少し待ってからもう一度押してください。',
    genfail: '新しい絵を作れませんでした。今の絵はそのままです。',
    switched: '途中で物語かアカウントが切り替わったため、作った絵は使いません。今の絵はそのままです。',
    offline: '通信できなかったため、採用しませんでした。今の絵はそのままです。',
    changed: '物語・人物・画風のどれかが変わったため、この候補は採用できません。今の絵はそのままです。',
    conflict: 'ほかの端末で、この人物の絵が先に変わりました。今回は採用しませんでした。最新の絵を表示します。',
    unknown: '採用の結果を確認できませんでした。次に開いたときに確認します（自動で送り直すことはしません）。',
    notready: 'いまは採用できません。少し待ってからもう一度お試しください。'
  };
  var ov = null;
  try { var st0 = document.createElement('style'); st0.textContent = 'dialog[data-fixrc]::backdrop{background:rgba(0,0,0,.6)}'; (document.head || document.documentElement).appendChild(st0); } catch(e){}
  function el(tag, css, txt){ var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  var uiEpoch = 0;   /* 画面を閉じた・開き直した → それ以前に始めた生成の結果は使わない（古い job が新しい候補を置き換えない） */
  function close(){ uiEpoch++; try { if (ov && typeof ov.close === 'function' && ov.open) ov.close(); } catch(e){} try { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); } catch(e){} ov = null; }
  /* キャラ一覧は <dialog> の showModal（最前面の層）で開いているため、こちらも showModal で重ねる（div では下に隠れる） */
  function frame(title){
    close();
    var useDlg = typeof HTMLDialogElement !== 'undefined';
    ov = el(useDlg ? 'dialog' : 'div', useDlg
      ? 'border:none;padding:0;background:transparent;max-width:440px;width:calc(100% - 32px);margin:auto;position:fixed;inset:0;height:fit-content;max-height:calc(100% - 32px);overflow:auto;outline:none'
      : 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px');
    ov.setAttribute('data-fixrc', '1');
    var box = el('div', 'background:#1d1d2b;color:#ececf4;border:1px solid #4a4a6a;border-radius:12px;width:100%;box-sizing:border-box;padding:16px;font-size:14px;line-height:1.6');
    box.appendChild(el('div', 'font-weight:600;margin-bottom:10px', title));
    ov.appendChild(box); ov.addEventListener('click', function(ev){ if (ev.target === ov) close(); });
    if (useDlg){ ov.addEventListener('cancel', function(ev){ ev.preventDefault(); close(); }); }
    document.body.appendChild(ov);
    if (useDlg){ try { ov.showModal(); } catch(e){ ov.setAttribute('open', ''); } }
    return box;
  }
  function btn(txt, bg, fn){ var b = el('button', 'margin:4px;padding:8px 12px;border-radius:8px;border:1px solid #555;background:' + bg + ';color:#fff;font-size:14px;cursor:pointer', txt); b.addEventListener('click', function(ev){ ev.stopPropagation(); fn(b); }); return b; }
  function message(name, why){ stats.blocked++; var box = frame(name); box.appendChild(el('div', '', MSG[why] || MSG.notready)); var row = el('div', 'text-align:right;margin-top:10px'); row.appendChild(btn('閉じる', '#4a4a6a', close)); box.appendChild(row); }
  function imgBox(label, src){ var w = el('div', 'flex:1;text-align:center'); w.appendChild(el('div', 'font-size:12px;color:#aaa;margin-bottom:4px', label)); var im = el('img', 'width:140px;height:140px;object-fit:cover;border-radius:10px;background:#2a2a3a'); if (src) im.src = src; im.setAttribute('data-fixrc-img', label); w.appendChild(im); return { w: w, im: im }; }

  function openFlow(name){
    var nm = canon(name), r = resolve(nm);
    if (!r.ok) return message(name, r.why);
    var sid = storyId(), art = artNow(), ep = epoch(), slot = candSlot(ep, sid, r.token, art);
    var cur = ''; try { cur = f197().cachedFor(name) || ''; } catch(e){}
    var box = frame(name + ' の絵');
    var row = el('div', 'display:flex;gap:10px;margin-bottom:8px');
    var a = imgBox('今の絵', cur), b = imgBox('候補', '');
    row.appendChild(a.w); row.appendChild(b.w); box.appendChild(row);
    var note = el('div', 'font-size:12px;color:#aaa;min-height:1.6em', '');
    box.appendChild(note);
    var btns = el('div', 'text-align:right;margin-top:8px'); box.appendChild(btns);
    var current = null, attempt = 0, busy = false;
    function render(keepNote){
      btns.innerHTML = '';
      if (busy){ note.textContent = '新しい絵を作っています…（今の絵はそのままです）'; btns.appendChild(btn('閉じる', '#4a4a6a', close)); return; }
      if (current){
        if (!keepNote) note.textContent = '［この絵にする］を押すまで、今の絵は変わりません。採用した絵は、この物語のこの人物だけに使われます。';
        btns.appendChild(btn('この絵にする', '#5a7a4a', function(){ doAdopt(); }));
        btns.appendChild(btn('もう一度', '#6a4a5a', function(){ attempt++; gen(); }));
        btns.appendChild(btn('やめる', '#4a4a6a', function(){ candDel(slot); close(); }));
      } else {
        btns.appendChild(btn('新しい絵を作る', '#6a4a5a', function(){ gen(); }));
        btns.appendChild(btn('閉じる', '#4a4a6a', close));
      }
    }
    var myEpoch = uiEpoch, genSeq = 0;
    function gen(){
      busy = true; render(); var mySeq = ++genSeq;
      generate(name, { sid: sid, attempt: attempt }).then(function(res){
        if (uiEpoch !== myEpoch || mySeq !== genSeq){ stats.staleDropped = (stats.staleDropped || 0) + 1; return; }   // 閉じた・開き直した後に届いた古い結果は捨てる
        busy = false;
        if (!res.ok){ note.textContent = MSG[res.why] || MSG.genfail; render(true); if (res.why === 'nomaterial' || res.why === 'nokey') { btns.innerHTML = ''; btns.appendChild(btn('閉じる', '#4a4a6a', close)); } return; }
        current = { slot: slot, id: 'c' + Date.now().toString(36), ep: ep, sid: sid, token: r.token, art: art, name: nm, data: res.data, prompt: res.prompt, seed: res.seed, model: res.model, at: Date.now() };
        candPut(current); b.im.src = current.data; render();
      });
    }
    function doAdopt(){
      if (!current) return; busy = true; note.textContent = '採用しています…'; btns.innerHTML = '';
      adopt(current).then(function(res){
        busy = false;
        if (res.ok){ note.textContent = '採用しました。'; a.im.src = current.data; current = null; btns.innerHTML = ''; btns.appendChild(btn('閉じる', '#4a4a6a', close)); return; }
        note.textContent = MSG[res.why] || MSG.notready; render(true);
        if (res.why === 'conflict'){ try { var F = f523(); F && F.recvSweep && F.recvSweep(); } catch(e){} }
      });
    }
    candGet(slot).then(function(c){ if (c && c.data){ current = c; b.im.src = c.data; render(); } else { gen(); } });
  }

  /* ---------- ↻ の横取り（window の capture＝fix197・fix437・fix145 より先） ---------- */
  function onClick(ev){
    try {
      if (!on()) return;
      var t = ev.target; if (!t || !t.closest) return;
      var probe = t.closest('button,[role="button"],a'); if (!probe) return;
      var txt = (probe.textContent || '').trim(); if (txt.length > 40 || !/アイコン再生成/.test(txt)) return;
      if (av2Doc() === true || fenced()){ stats.passThrough++; return; }   // Asset v2・fence 中は従来の経路（このモジュールは何もしない）
      var card = t.closest('.npc-card') || t.closest('.v100-clean') || t.closest('[class*="card"]') || t.parentNode;
      var nm = ''; var img = card && card.querySelector ? card.querySelector('img[alt]') : null;
      if (img) nm = (img.getAttribute('alt') || '').trim();
      if (!nm && card && card.querySelector){ var ni = card.querySelector('input[type="text"]'); if (ni) nm = (ni.value || '').trim(); }
      if (!nm) return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      stats.intercepted++;
      if (av2Doc() !== false){ message(nm, 'nocast'); return; }   // 判定不能（読み込み中）: 生成も削除もしない
      openFlow(nm);
    } catch(e){}
  }
  try { window.addEventListener('click', onClick, true); } catch(e){}

  function boot(){ if (!on()) return; setTimeout(function(){ try { recover(); } catch(e){} }, 3000); setTimeout(function(){ try { discover(); } catch(e){} }, 4500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.__v292DfixRC = {
    __armed: true, version: 'fixRC-r2', on: on, scopedFor: scopedFor, resolve: resolve, pkS: pkS, storyId: storyId,
    discover: discover, recover: recover, openFlow: openFlow, ledger: ledger, journal: journal,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); }
  };
})();
