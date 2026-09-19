// =====================================================================
// Chronicle TRPG - v292Dfix873: SCENARIO_CREATOR_DEPTH_V1（home 専用・lane 13 / GPT 裁定 #L13entry）
// ---------------------------------------------------------------------
// ■ これは何か
//   「＋ シナリオを作る」を押したときに、いきなり全項目のエディタを出すのをやめ、
//   **深さを 3 つだけ**選ばせる。3 つとも行き着く先は **同じ fix820.create()**（schema 変更 0）。
//     [1] おまかせで作る      … OMAKASE_CREATE → 下書きを見せる → 始める / 少し直す
//     [2] 物語の種から作る    … 世界・主人公を一言ずつ → EXPAND_EXISTING → 同じ確認カード
//     [3] しっかり作る        … 今までの SC_EDIT（1 バイトも変えない）
//
// ■ 壊さない約束（1 つでも破ったら実装ミス）
//   NO_FIX825_REWRITE  … fix825 の node / handler / view / overlay を書き換えない。
//                        入口は #scView への **capture phase** listener 1 つだけで、
//                        [data-sc-act="new"] を拾って stopPropagation する（fix825 は bubble phase）。
//                        kill 中はこの listener が何もしないので、click は素通りで従来の openNew() に届く。
//   OWN_CONTAINER      … 描画は自前の #sc873View（#scView の兄弟）だけ。class 'mid' を **付けない**
//                        （fix825 wire() が section.mid から listSec を拾うため）。
//                        .card / [data-open] / [data-v] / #newCard / #playBtn も使わない。
//   OVERLAY_NOT_MINE   … #scOverlay に触らない（confirm / review / offer / fix872 衝突ダイアログは fix825 の持ち物）。
//                        closeOverlay() 相当を 1 度も呼ばない。
//   ADOPT_BEFORE_SAVE  … 確認カードが **採用の瞬間**。候補は fix825 の S.candidate に居るだけで、
//                        「▶」を押すまで store には 1 バイトも書かない（AI EXPAND != SAVE / fix825 契約）。
//   NO_STORY_BEFORE_ADOPTION … fix819.instantiate は api.start() 経由だけ。確認カードを見る前には呼ばれない。
//   LS_WRITE_0         … localStorage へ 1 バイトも書かない（読むのは自分の kill key だけ）。
//                        auth 系 key（v292ProxyUrl / v292ProxyPass / v292GoogleToken 等）は **読まない**。
//   NO_CODES_NO_AUTH   … 画面に内部 code を出さない。「Google ログイン」「アクセスコード」「合言葉」
//                        「プロキシ」を creator の文面に **1 度も**出さない（公開導線の目標）。
//   TRANSPORT_AUTHORITY … AI 可否は fix823 が呼び出し時に自分で見る。fix873 は再計算しない。
//                        3 枚のカードは **auth 状態で出し分けない**（隠さない・無効化しない）。
//   ONE_CLICK_ONE_GENERATION … 「🎲 別の案を作る」は 1 click = 1 生成。生成中は disabled。自動再試行 0。
//   FIX872_UNTOUCHED   … 同期（cloudRev 0 / dirty）は fix820.create() がやる。fix873 は meta を触らない。
//
// 検証口: window.__v292Dfix873 = { version, state, api }
// kill: localStorage['v292Dfix873Off'] = '1' → 深さ選択を出さず、従来どおり SC_EDIT へ直行。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix873) return;
  var TAG = '[v292Dfix873:scenario-creator]';
  var VERSION = 'v292Dfix873-20260919-creator-v1.0';

  var DEFAULT_TITLE = '新しい物語';

  /* ---------- 文面（GPT 裁定 #L13entry でそのまま確定した文字列） ---------- */
  var COPY = {
    head: 'どうやって作りますか？',
    cards: [
      { key: 'OMAKASE', t: 'おまかせで作る',     d: '何も決めなくて大丈夫。Chronicleがシナリオ案を作ります。' },
      { key: 'SEED',    t: '物語の種から作る',   d: '世界と主人公をひとことずつ。残りをChronicleが広げます。' },
      { key: 'FULL',    t: 'しっかり作る',       d: '世界やキャラを細かく決めます。必要なところはAIにも任せられます。' }
    ],
    foot: 'どれを選んでも、できあがるのは同じ「シナリオ」です。',
    back: '← もどる',
    seedHead: '物語の種',
    seedLore: 'どんな世界ですか？',
    seedHero: 'どんな主人公ですか？',
    seedNpc: 'いっしょに出る人（任意）',
    seedGo: 'つづける',
    genOmakase: 'シナリオを組み立てています…',
    genSeed: '物語を広げています…',
    revHead: 'できました',
    revTitle: 'タイトル',
    start: '▶ このシナリオで始める',
    tweak: '✎ 少し直す',
    again: '🎲 別の案を作る',
    revNote: '「▶」を押すと、このシナリオが保存されて物語が始まります。',
    randomNote: '自動生成を使えなかったため、ランダムに作りました。',
    seedKept: '自動補完を今は使えません。入力した内容はそのまま残しています。',
    seedKeptGo: '✎ 自分で書きつづける',
    failHead: 'うまく作れませんでした',
    failBody: 'もう一度ためすか、自分で作ることもできます。',
    retry: 'もう一度ためす',
    manual: '✎ 自分で作る'
  };
  /* 画面に出してはいけない語（自己検査。harness も同じ表を使う） */
  var FORBIDDEN = ['Google', 'ログインし', 'アクセスコード', '合言葉', 'プロキシ', 'proxy', 'token', 'API'];

  /* ---------- deps（呼ぶだけ・無ければ黙って従来動作） ---------- */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix873Off') === '1'; }
  function M825(){ var m = window.__v292Dfix873TestHook825 || window.__v292Dfix825; return (m && m.api) ? m : null; }
  function A(){ var m = M825(); return m ? m.api : null; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function esc(t){ return str(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* ---------- state（memory only。LS / sessionStorage / 新 key 0） ---------- */
  var S = {
    installed: false, view: null,           /* null | 'PICK' | 'SEED' | 'GEN' | 'REVIEW' | 'FAIL' | 'SEEDKEPT' */
    mode: null,                             /* 'OMAKASE' | 'SEED' */
    busy: false, gens: 0, picks: 0,
    candidate: null, report: null, title: '',
    seed: { lore: '', hero: '', npc: '', title: '' },
    lastFail: null                          /* code は **画面に出さない**。console / state 用 */
  };

  var host = null;                          /* #sc873View */

  /* ---------- style（新しい <style> 1 枚。#scStyle は 1 バイトも触らない） ---------- */
  function injectStyle(){
    if (el('sc873Style')) return;
    var s = document.createElement('style'); s.id = 'sc873Style';
    s.textContent =
      '#sc873View{flex:1;min-width:0}' +
      '.sc873-cards{display:flex;flex-direction:column;gap:8px;margin:4px 0 12px}' +
      '.sc873-card{display:block;width:100%;text-align:left;padding:14px;border:1px solid var(--line);' +
        'border-radius:10px;background:var(--panel);color:var(--tx);cursor:pointer;font:inherit}' +
      '.sc873-card:hover{border-color:var(--acc2)}' +
      '.sc873-card:disabled{opacity:.45;cursor:default}' +
      '.sc873-ct{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.sc873-cd{font-size:12.5px;color:var(--dim);line-height:1.55;margin-top:4px}' +
      '.sc873-foot{font-size:12px;color:var(--dim);line-height:1.6;padding:2px 0 8px}' +
      '.sc873-gen{padding:34px 0;text-align:center;color:var(--dim);font-size:13.5px}' +
      '.sc873-rev{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:14px;margin:4px 0 12px}' +
      '.sc873-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px;line-height:1.6;margin-top:10px}' +
      '@media(max-width:420px){.sc873-grid{grid-template-columns:1fr;gap:2px 0}}' +
      '.sc873-k{color:var(--dim);font-size:11.5px;white-space:nowrap}' +
      '.sc873-v{overflow-wrap:anywhere;word-break:break-word}' +
      '.sc873-cta{padding:11px 16px;font-size:14px}' +
      '.sc873-note{font-size:12px;color:var(--dim);line-height:1.6;margin-top:8px}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- container ---------- */
  function scView(){ return el('scView'); }
  function ensureHost(){
    if (host && host.parentNode) return host;
    var sc = scView(); if (!sc || !sc.parentNode) return null;
    host = el('sc873View');
    if (!host){
      host = document.createElement('div');
      host.id = 'sc873View';                 /* ★class 'mid' を付けない（fix825 wire() の listSec 誤認防止） */
      sc.parentNode.insertBefore(host, sc.nextSibling);
    }
    return host;
  }
  /* 自分を出す = #scView を隠す（これで fix825 の expand() が review overlay を出さない） */
  function showSelf(){
    injectStyle();
    var h = ensureHost(), sc = scView();
    if (!h || !sc) return false;
    sc.hidden = true; h.hidden = false;
    return true;
  }
  /* 自分を畳んで fix825 へ返す */
  function handBack(){
    var sc = scView();
    if (host) { host.hidden = true; host.innerHTML = ''; }
    if (sc) sc.hidden = false;
    S.view = null;
  }

  /* ---------- render ---------- */
  function headHtml(title){
    return '<div class="sc-head"><div class="sc-h1">' + esc(title) + '</div>' +
           '<button class="sc-btn" data-c873="back">' + esc(COPY.back) + '</button></div>';
  }
  function renderPick(){
    if (!showSelf()) return;
    S.view = 'PICK';
    var h = headHtml('シナリオを作る');
    h += '<div class="sc873-foot">' + esc(COPY.head) + '</div><div class="sc873-cards">';
    for (var i = 0; i < COPY.cards.length; i++){
      var c = COPY.cards[i];
      h += '<button class="sc873-card" data-c873="pick" data-c873-k="' + esc(c.key) + '">' +
           '<span class="sc873-ct">' + esc(c.t) + '</span>' +
           '<span class="sc873-cd">' + esc(c.d) + '</span></button>';
    }
    h += '</div><div class="sc873-foot">' + esc(COPY.foot) + '</div>';
    host.innerHTML = h;
  }
  function fieldHtml(k, label, v){
    return '<div class="sc-f sc-wide"><label for="sc873_' + esc(k) + '">' + esc(label) + '</label>' +
           '<input id="sc873_' + esc(k) + '" type="text" data-c873-f="' + esc(k) + '" value="' + esc(v) + '"></div>';
  }
  function renderSeed(){
    if (!showSelf()) return;
    S.view = 'SEED';
    var h = headHtml(COPY.seedHead);
    h += '<div class="sc-form">' +
      fieldHtml('lore', COPY.seedLore, S.seed.lore) +
      fieldHtml('hero', COPY.seedHero, S.seed.hero) +
      fieldHtml('npc', COPY.seedNpc, S.seed.npc) +
      '</div>' +
      '<div class="sc-acts"><button class="sc-btn sc-primary sc873-cta" data-c873="seedGo">' + esc(COPY.seedGo) + '</button></div>';
    host.innerHTML = h;
  }
  function renderGen(){
    if (!showSelf()) return;
    S.view = 'GEN';
    host.innerHTML = headHtml('シナリオを作る') +
      '<div class="sc873-gen">' + esc(S.mode === 'SEED' ? COPY.genSeed : COPY.genOmakase) + '</div>';
  }
  function row(label, v){
    if (!trim(v)) return '';
    return '<div class="sc873-k">' + esc(label) + '</div><div class="sc873-v">' + esc(v) + '</div>';
  }
  function renderReview(){
    if (!showSelf()) return;
    S.view = 'REVIEW';
    var c = S.candidate || {}, sc = isObj(c.scene) ? c.scene : {};
    var cast = isObj(c.cast) ? c.cast : {}, hero = isObj(cast.hero) ? cast.hero : {};
    var npcs = isArr(cast.npcs) ? cast.npcs : [];
    var g = '';
    g += row('世界', sc.lore);
    g += row('舞台', sc.loc);
    g += row('雰囲気', sc.tone);
    g += row('目的', sc.obj);
    g += row('主人公', trim(hero.name) + (trim(hero.desc) ? '／' + hero.desc : ''));
    for (var i = 0; i < npcs.length; i++){
      var n = isObj(npcs[i]) ? npcs[i] : {};
      g += row('登場人物 ' + (i + 1), trim(n.name) + (trim(n.desc) ? '／' + n.desc : ''));
    }
    g += row('はじまり', c.startCondition);
    var isRandom = !!(S.report && S.report.generationMode === 'RANDOM_FALLBACK');
    var h = headHtml(COPY.revHead);
    h += '<div class="sc873-rev">' +
      '<div class="sc-f sc-wide"><label for="sc873_title">' + esc(COPY.revTitle) + '</label>' +
      '<input id="sc873_title" type="text" data-c873-f="title" value="' + esc(S.title) + '"></div>' +
      '<div class="sc873-grid">' + g + '</div>' +
      (isRandom ? '<div class="sc873-note">' + esc(COPY.randomNote) + '</div>' : '') +
      '</div>';
    h += '<div class="sc-acts">' +
      '<button class="sc-btn sc-start sc873-cta" data-c873="start">' + esc(COPY.start) + '</button>' +
      '<button class="sc-btn sc873-cta" data-c873="tweak">' + esc(COPY.tweak) + '</button>' +
      '<button class="sc-btn" data-c873="again"' + (S.busy ? ' disabled' : '') + '>' + esc(COPY.again) + '</button>' +
      '</div>';
    h += '<div class="sc873-note">' + esc(COPY.revNote) + '</div>';
    h += '<div data-c873-msg></div>';
    host.innerHTML = h;
  }
  /* 種を入れたのに AI が使えなかった → **入力を 1 文字も捨てない**で SC_EDIT へ渡す */
  function renderSeedKept(){
    if (!showSelf()) return;
    S.view = 'SEEDKEPT';
    host.innerHTML = headHtml(COPY.seedHead) +
      '<div class="sc873-rev"><div class="sc873-v">' + esc(COPY.seedKept) + '</div></div>' +
      '<div class="sc-acts"><button class="sc-btn sc-primary sc873-cta" data-c873="toEdit">' + esc(COPY.seedKeptGo) + '</button></div>';
  }
  function renderFail(){
    if (!showSelf()) return;
    S.view = 'FAIL';
    host.innerHTML = headHtml(COPY.failHead) +
      '<div class="sc873-rev"><div class="sc873-v">' + esc(COPY.failBody) + '</div></div>' +
      '<div class="sc-acts">' +
      '<button class="sc-btn sc-primary sc873-cta" data-c873="retry"' + (S.busy ? ' disabled' : '') + '>' + esc(COPY.retry) + '</button>' +
      '<button class="sc-btn sc873-cta" data-c873="toEdit">' + esc(COPY.manual) + '</button>' +
      '</div>';
  }
  function setCardMsg(text){
    if (!host) return;
    var box = host.querySelector('[data-c873-msg]');
    if (box) box.innerHTML = text ? '<div class="sc-msg sc-err">' + esc(text) + '</div>' : '';
  }

  /* ---------- title 自動補完（AI call 0。候補の中身から作るだけ） ---------- */
  function deriveTitle(cand){
    var c = isObj(cand) ? cand : {};
    var cast = isObj(c.cast) ? c.cast : {}, hero = isObj(cast.hero) ? cast.hero : {};
    var sc = isObj(c.scene) ? c.scene : {};
    if (trim(hero.name)) return trim(hero.name) + 'の物語';
    if (trim(sc.loc)) return trim(sc.loc) + 'の物語';
    return DEFAULT_TITLE;
  }

  /* ---------- 生成 ---------- */
  function seededDraft(){
    var a = A(); if (!a) return null;
    var d = a.draft(); if (!d) return null;
    d.scene.lore = S.seed.lore;
    d.cast.hero.desc = S.seed.hero;
    /* ★NPC slot は「名前が入っているときだけ」作る。
       名前の無い slot は fix820.validate が NPC_WITHOUT_NAME で落とすし、
       EXPAND_EXISTING は slot を消せない（裁定 26）ので、作らないのが唯一安全な選択。 */
    d.cast.npcs = [];
    if (trim(S.seed.npc)) d.cast.npcs.push({ name: trim(S.seed.npc), desc: '', personality: '', coreDesire: '', coreFear: '', wound: '', gender: '' });
    if (trim(S.seed.title)) d.title = trim(S.seed.title);
    return d;
  }
  function generate(){
    var a = A();
    if (!a || S.busy) return;
    S.busy = true; S.candidate = null; S.report = null;
    renderGen();
    var mode = (S.mode === 'SEED') ? 'EXPAND_EXISTING' : 'OMAKASE_CREATE';
    var done = false;
    a.expand(mode, function(res){
      if (done) return; done = true;
      S.busy = false; S.gens++;
      if (!res || !res.ok){
        S.lastFail = (res && res.code) || 'EXPAND_FAILED';
        try { console.warn(TAG, 'GENERATION_FAILED', S.lastFail); } catch(e){}
        /* ★裁定 #L13entry: 種を入れているときは RANDOM_FALLBACK が **構造的に起きない**
           （fix823: explicitSeedCount > 0 → omakaseZero = false → finishRandom が即 fail）。
           だから「ランダムで作り直す」ことはせず、**入力を保ったまま** SC_EDIT へ渡す。 */
        if (S.mode === 'SEED') return renderSeedKept();
        return renderFail();
      }
      if (res.noBlanks || !res.candidate){
        /* 埋める空欄が無い = 種がそのまま完成形。SC_EDIT へ渡す（write 0） */
        if (S.mode === 'SEED') return toEdit();
        S.lastFail = 'NO_BLANKS';
        return renderFail();
      }
      S.candidate = res.candidate; S.report = res.report || {};
      S.title = deriveTitle(res.candidate);
      renderReview();
    });
  }

  /* ---------- 採用 → 保存 → 開始 ---------- */
  function applyTitle(){
    var a = A(); if (!a) return;
    var d = a.draft(); if (!d) return;
    d.title = trim(S.title) || DEFAULT_TITLE;
    a.setDraft(d);                       /* draft だけ。store write 0・SC_EDIT を再描画 */
  }
  function doStart(){
    var a = A(); if (!a || S.busy) return;
    /* ★採用（suppressEnrichOffer）: 「始める」の途中に ✒ offer overlay を割り込ませない */
    var ac = a.acceptCandidate({ suppressEnrichOffer: true });
    if (!ac || !ac.ok){ S.lastFail = (ac && ac.code) || 'ACCEPT_FAILED'; return renderFail(); }
    applyTitle();
    var sv = a.save();
    if (!sv || !sv.ok){
      /* 保存できない理由は fix825 の利用者向け文面をそのまま見せる（code は出さない）。
         直す場所はエディタなので「✎ 少し直す」へ誘導する。 */
      S.lastFail = (sv && sv.code) || 'SAVE_FAILED';
      try { console.warn(TAG, 'SAVE_FAILED', S.lastFail); } catch(e){}
      S.candidate = null;
      renderReview();
      setCardMsg(saveFailText());
      return;
    }
    var st = a.start();
    if (!st || !st.ok){
      S.lastFail = (st && st.code) || 'START_FAILED';
      try { console.warn(TAG, 'START_FAILED', S.lastFail); } catch(e){}
      /* gate 等は fix825 が自分の文面 / 自分の overlay で面倒を見る。ここは SC_EDIT へ返すだけ。 */
      return handBack();
    }
    handBack();
  }
  /* fix825 の state().lastErrorCode ではなく、利用者向けの短い一文だけを出す（code 0） */
  function saveFailText(){
    return 'このままでは保存できませんでした。「' + COPY.tweak + '」で直してください。';
  }
  function doTweak(){
    var a = A(); if (!a || S.busy) return;
    var ac = a.acceptCandidate();        /* ここは従来どおり（✒ offer を出してよい） */
    if (!ac || !ac.ok){ S.lastFail = (ac && ac.code) || 'ACCEPT_FAILED'; return renderFail(); }
    applyTitle();
    handBack();                          /* 未保存のまま SC_EDIT を見せる */
  }
  function toEdit(){ handBack(); }

  /* ---------- 入口 ---------- */
  function openPick(){
    if (off()) return { ok: false, code: 'OFF' };
    var a = A(); if (!a) return { ok: false, code: 'FIX825_UNAVAILABLE' };
    var r = a.openNew();                 /* draft を空に（store write 0・view = SC_EDIT） */
    if (r && r.ok === false) return r;
    S.picks++; S.mode = null; S.busy = false;
    S.candidate = null; S.report = null; S.title = '';
    S.seed = { lore: '', hero: '', npc: '', title: '' };
    renderPick();
    return { ok: true };
  }
  function pick(key){
    if (S.busy) return;
    if (key === 'FULL'){ S.mode = 'FULL'; return handBack(); }   /* 今までの SC_EDIT に 1 バイトも触らない */
    if (key === 'SEED'){ S.mode = 'SEED'; return renderSeed(); }
    S.mode = 'OMAKASE'; return generate();
  }
  function seedGo(){
    if (S.busy) return;
    var a = A(); if (!a) return;
    var d = seededDraft(); if (!d) return;
    a.setDraft(d);                        /* 種を draft へ（store write 0） */
    generate();
  }

  /* ---------- wiring ---------- */
  function onHostClick(e){
    var t = e.target;
    var b = t && t.closest && t.closest('[data-c873]');
    if (!b) return;
    e.preventDefault();
    var act = b.getAttribute('data-c873');
    switch (act){
      case 'back':
        if (S.view === 'SEED' || S.view === 'REVIEW' || S.view === 'FAIL' || S.view === 'SEEDKEPT'){
          if (S.busy) return;
          S.candidate = null; S.report = null;
          return renderPick();
        }
        return backToList();
      case 'pick':   return pick(b.getAttribute('data-c873-k'));
      case 'seedGo': return seedGo();
      case 'start':  return doStart();
      case 'tweak':  return doTweak();
      case 'again':  if (!S.busy) generate(); return;
      case 'retry':  if (!S.busy) generate(); return;
      case 'toEdit': return toEdit();
    }
  }
  function onHostInput(e){
    var t = e.target, k = t && t.getAttribute && t.getAttribute('data-c873-f');
    if (!k) return;
    if (k === 'title') S.title = t.value;
    else if (S.seed.hasOwnProperty(k)) S.seed[k] = t.value;
  }
  function backToList(){
    var a = A();
    handBack();
    if (a) a.openList();
  }
  /* ★capture phase。fix825 の root listener（bubble）より先に走り、stopPropagation で止める。
     kill 中 / 依存不在のときは **何もしない**ので、click は素通りで従来の openNew() に届く。 */
  function onScViewCaptureClick(e){
    if (off()) return;
    var t = e.target;
    var b = t && t.closest && t.closest('[data-sc-act="new"]');
    if (!b) return;
    if (!A()) return;
    e.preventDefault(); e.stopPropagation();
    openPick();
  }
  function install(){
    if (S.installed) return;
    var sc = scView();
    if (!sc){ try { console.log(TAG, 'loaded (host DOM not present; inactive)'); } catch(e){} return; }
    sc.addEventListener('click', onScViewCaptureClick, true);   /* ★capture */
    var h = ensureHost();
    if (h){
      h.hidden = true;
      h.addEventListener('click', onHostClick, false);
      h.addEventListener('input', onHostInput, false);
    }
    S.installed = true;
    try { console.log(TAG, 'loaded (' + (off() ? 'OFF: depth chooser hidden' : 'depth chooser active') + ')'); } catch(e){}
  }

  window.__v292Dfix873 = {
    version: VERSION,
    state: function(){
      return { off: off(), installed: S.installed, view: S.view, mode: S.mode, busy: S.busy,
               gens: S.gens, picks: S.picks, hasCandidate: !!S.candidate, title: S.title,
               seed: { lore: S.seed.lore, hero: S.seed.hero, npc: S.seed.npc },
               lastFail: S.lastFail,
               deps: { fix825: !!A(), hostEl: !!el('sc873View') } };
    },
    /* fixture / 診断用: DOM を通さず同じ core を呼ぶ */
    api: { openPick: openPick, pick: pick, seedGo: seedGo, generate: generate,
           start: doStart, tweak: doTweak, toEdit: toEdit, back: backToList,
           setTitle: function(t){ S.title = str(t); return { ok: true }; },
           setSeed: function(o){ if (isObj(o)) { for (var k in o){ if (S.seed.hasOwnProperty(k)) S.seed[k] = str(o[k]); } } return { ok: true }; },
           candidate: function(){ return S.candidate ? JSON.parse(JSON.stringify(S.candidate)) : null; },
           deriveTitle: deriveTitle, forbiddenWords: function(){ return FORBIDDEN.slice(); },
           install: install }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, false); else install();
})();
