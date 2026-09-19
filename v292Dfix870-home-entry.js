// =====================================================================
// Chronicle TRPG - v292Dfix870: HOME_THREE_CTA_V1（home 専用・lane 12 / GPT 裁定 #L12entry）
// ---------------------------------------------------------------------
// ■ これは何か
//   HOME の入口を裁定どおりの 3 本立てにする。**DOM は 1 つも壊さず・消さず**、
//   既に在るものを並べ替え／畳み、新しい CTA を 2 つだけ足す。
//     [1] ✎ シナリオを作る          … 既存 #scBtn（aside の先頭へ移す。label は sp5 のまま）
//     [2] ▶ シナリオから始める      … 新規 #startScBtn（Scenario 0 件なら hidden）
//     [3] ▶ 続きから遊ぶ            … 新規 #contBtn（Story 0 件なら hidden）
//   そして「＋ 新しい物語を始める」（#newBtn）を **公開の主導線から降ろす**:
//     既定で閉じた <details>「その他の開始方法」の中へ移し、label を「空の物語から始める」へ。
//
// ■ 壊さない約束（1 つでも破ったら実装ミス）
//   NODE_PRESERVATION      … #newBtn / #newCard / #scBtn の **node・id・class・handler を触らない**。
//                            移動と textContent だけ。削除も置換も再生成もしない。
//                            → home.html の document delegation（`t.id==='newBtn'`）はそのまま効く。
//   NO_NEW_NAVIGATION      … URL 式を 1 つも書かない。
//                            [3] は `data-open="<id>"` を付けるだけで、既存の
//                            `t.closest('[data-open]') → openStory(id)`（home.html）に拾わせる。
//                            [2] は fix825 の既存 API `__v292Dfix825.api.openList()` を呼ぶだけ。
//                            **常に一覧を開く**。Scenario がちょうど 1 件でも直接 start しない（裁定）。
//   READ_ONLY_STORE        … localStorage へ 1 バイトも書かない。Scenario 件数は fix820 の
//                            list()（= chr6_scenario_meta）を読むだけ。fix820 が off / 不在なら **0 件扱い**。
//   NOTE_POSITION_UNTOUCHED… #note（fix662: 警告は画面最上部）には指 1 本触れない。
//   SINGLE_APPLY           … 入口は apply() 1 本だけ。描画のたびにこれを呼ぶ。
//
// ■ kill switch
//   localStorage['v292Dfix870Off'] = '1' → apply() が restore() 側へ分岐し、
//   #newBtn / #scBtn を **元の位置・元の label** へ戻し、新 CTA 2 つを hidden にし、
//   <details> を畳んで空にする。読み込み前から '1' なら DOM は sp5 のまま（何もしない）。
//
// 検証口: window.__v292Dfix870 = { version, apply, state }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix870) return;
  var TAG = '[v292Dfix870:home-entry]';
  var VERSION = 'v292Dfix870-20260919-home-entry-v1.0';

  var LABEL_NEWBTN_DEMOTED = '空の物語から始める';
  var LABEL_NEWCARD_ORIG   = '新しい物語を始める';
  var SUMMARY_TEXT         = 'その他の開始方法';
  var CTA_START_TEXT       = '▶ シナリオから始める';
  var CTA_CONT_TEXT        = '▶ 続きから遊ぶ';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix870Off') === '1'; }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* 元の姿（最初に 1 度だけ記録する。以後 restore() はここへ戻す） */
  var ORIG = { captured: false, newBtnParent: null, newBtnNext: null, newBtnLabel: '',
               scBtnParent: null, scBtnNext: null };
  var S = { applied: false, applies: 0, restores: 0, observing: false };

  function capture(){
    if (ORIG.captured) return true;
    var nb = el('newBtn'), sc = el('scBtn');
    if (!nb || !sc) return false;
    ORIG.newBtnParent = nb.parentNode; ORIG.newBtnNext = nb.nextSibling; ORIG.newBtnLabel = nb.textContent;
    ORIG.scBtnParent = sc.parentNode;  ORIG.scBtnNext = sc.nextSibling;
    ORIG.captured = true;
    return true;
  }

  /* ---------- 件数（読むだけ） ---------- */
  function scenarioCount(){
    /* fix820 が authority。off / 不在 / 読めない = 0 件（= [2] は出さない・fail-closed） */
    try {
      var st = window.__v292Dfix820;
      if (!st || typeof st.list !== 'function') return 0;
      var r = st.list();
      if (!r || !r.ok || Object.prototype.toString.call(r.scenarios) !== '[object Array]') return 0;
      return r.scenarios.length;
    } catch(e){ return 0; }
  }
  function latestStory(){
    /* chr6_slots_meta を読むだけ。lastOpenedAt（無ければ updatedAt → createdAt）が最新の 1 件。 */
    try {
      var raw = lsg('chr6_slots_meta'); if (raw == null) return null;
      var a = JSON.parse(raw);
      if (Object.prototype.toString.call(a) !== '[object Array]') return null;
      var best = null, bestKey = '';
      for (var i = 0; i < a.length; i++){
        var m = a[i];
        if (!m || typeof m !== 'object' || !m.id) continue;
        var k = String(m.lastOpenedAt || m.updatedAt || m.createdAt || '');
        if (best === null || k.localeCompare(bestKey) > 0){ best = m; bestKey = k; }
      }
      return best;
    } catch(e){ return null; }
  }
  function storyCount(){
    try {
      var raw = lsg('chr6_slots_meta'); if (raw == null) return 0;
      var a = JSON.parse(raw);
      if (Object.prototype.toString.call(a) !== '[object Array]') return 0;
      var n = 0;
      for (var i = 0; i < a.length; i++) if (a[i] && typeof a[i] === 'object' && a[i].id) n++;
      return n;
    } catch(e){ return 0; }
  }

  /* ---------- 新 CTA（1 度だけ作る。以後は使い回す） ---------- */
  function mkBtn(id, text){
    var b = el(id);
    if (b) return b;
    b = document.createElement('button');
    b.className = 'newbtn';                 /* 既存 #newBtn / #scBtn と同じ見た目 */
    b.id = id;
    b.style.marginTop = '8px';
    b.textContent = text;
    return b;
  }
  function mkDetails(){
    var d = el('f870more');
    if (d) return d;
    d = document.createElement('details');
    d.id = 'f870more';
    d.style.marginTop = '10px';
    var sm = document.createElement('summary');
    sm.id = 'f870summary';
    sm.textContent = SUMMARY_TEXT;
    sm.style.cursor = 'pointer';
    sm.style.fontSize = '12px';
    sm.style.opacity = '.8';
    d.appendChild(sm);
    return d;                                /* open 属性を付けない = 既定で閉じている */
  }

  /* ---------- #newCard（home.html の render() が毎回作り直す）---------- */
  function newCardTextNode(){
    var c = el('newCard'); if (!c) return null;
    for (var i = 0; i < c.childNodes.length; i++){
      var n = c.childNodes[i];
      if (n.nodeType === 3 && String(n.nodeValue).replace(/\s+/g, '') === LABEL_NEWCARD_ORIG) return n;
      if (n.nodeType === 3 && String(n.nodeValue).replace(/\s+/g, '') === LABEL_NEWBTN_DEMOTED) return n;
    }
    return null;
  }
  function paintNewCard(on){
    var n = newCardTextNode(); if (!n) return false;
    var want = on ? LABEL_NEWBTN_DEMOTED : LABEL_NEWCARD_ORIG;
    if (n.nodeValue !== want) n.nodeValue = want;
    return true;
  }

  /* ---------- enhance / restore ---------- */
  function enhance(){
    var nb = el('newBtn'), sc = el('scBtn');
    var aside = sc ? sc.parentNode : null;
    if (!nb || !sc || !aside) return false;

    /* [1] #scBtn を aside の先頭へ */
    if (aside.firstElementChild !== sc) aside.insertBefore(sc, aside.firstChild);

    /* [2][3] #scBtn の直後へ（順序 = scBtn → startScBtn → contBtn） */
    var start = mkBtn('startScBtn', CTA_START_TEXT);
    var cont  = mkBtn('contBtn', CTA_CONT_TEXT);
    if (start.parentNode !== aside || sc.nextSibling !== start) aside.insertBefore(start, sc.nextSibling);
    if (cont.parentNode !== aside || start.nextSibling !== cont) aside.insertBefore(cont, start.nextSibling);
    if (!start.__f870wired){
      start.addEventListener('click', function(){
        /* 常に一覧。ちょうど 1 件でも直接 start しない（裁定 #L12entry）。 */
        try { window.__v292Dfix825.api.openList(); }
        catch(e){ try { console.warn(TAG, 'openList unavailable'); } catch(_){} }
      }, false);
      start.__f870wired = true;
    }
    /* cont は handler を持たない。data-open を既存 delegation に拾わせる（NO_NEW_NAVIGATION）。 */

    /* 可視条件 */
    var scn = scenarioCount(), stn = storyCount(), latest = latestStory();
    start.hidden = (scn === 0);
    if (latest && latest.id){ cont.setAttribute('data-open', String(latest.id)); cont.hidden = (stn === 0); }
    else { cont.removeAttribute('data-open'); cont.hidden = true; }

    /* #newBtn を「その他の開始方法」の中へ（#ttlData より後ろ・データ節の下） */
    var d = mkDetails();
    if (!d.parentNode){
      var ttlData = el('ttlData');
      var anchor = ttlData || null;
      /* ttlData の後ろにある .data ブロックの直後へ置く（データ節の下 = #ttlData より後ろ） */
      if (anchor){
        var after = anchor.nextElementSibling;
        while (after && after.className === 'data') { anchor = after; after = after.nextElementSibling; }
        aside.insertBefore(d, anchor.nextSibling);
      } else {
        aside.appendChild(d);
      }
    }
    if (nb.parentNode !== d) d.appendChild(nb);
    if (nb.textContent !== LABEL_NEWBTN_DEMOTED) nb.textContent = LABEL_NEWBTN_DEMOTED;
    paintNewCard(true);
    S.applied = true;
    return true;
  }

  function restore(){
    var nb = el('newBtn'), sc = el('scBtn');
    if (ORIG.captured){
      if (sc && ORIG.scBtnParent) ORIG.scBtnParent.insertBefore(sc, ORIG.scBtnNext);
      if (nb && ORIG.newBtnParent){
        ORIG.newBtnParent.insertBefore(nb, ORIG.newBtnNext);
        if (nb.textContent !== ORIG.newBtnLabel) nb.textContent = ORIG.newBtnLabel;
      }
    }
    var start = el('startScBtn'), cont = el('contBtn'), d = el('f870more');
    if (start) start.hidden = true;
    if (cont){ cont.hidden = true; cont.removeAttribute('data-open'); }
    if (d){ d.removeAttribute('open'); }
    /* ★hidden にするだけでは **element の並び**が元に戻らない。
       enhance() は 3 本を aside の先頭へ置くので、そのまま hidden にすると
       「見えない node 2 つが先頭に居座る」状態になり、#newBtn が先頭でなくなる。
       自分で作った node なので、末尾へ寄せて元の並びを完全に再現する
       （既存 node は 1 つも動かさない）。 */
    var aside = nb ? nb.parentNode : (sc ? sc.parentNode : null);
    if (aside){
      if (start && start.parentNode === aside) aside.appendChild(start);
      if (cont && cont.parentNode === aside) aside.appendChild(cont);
      if (d && d.parentNode === aside && !d.contains(nb)) aside.appendChild(d);
    }
    paintNewCard(false);
    S.applied = false;
    return true;
  }

  /* ---------- 単一の入口 ---------- */
  function apply(){
    if (!capture()) return { ok: false, code: 'HOST_DOM_MISSING' };
    var killed = off();
    var r = killed ? restore() : enhance();
    if (killed) S.restores++; else S.applies++;
    return { ok: !!r, killed: killed, applied: S.applied };
  }

  /* home.html の render() は #grid を innerHTML で作り直す（#newCard が毎回新品になる）。
     aside は作り直されないので、ここで見るのは #grid だけでよい。 */
  function observe(){
    if (S.observing) return;
    var grid = el('grid'); if (!grid || typeof MutationObserver !== 'function') return;
    try {
      new MutationObserver(function(){ apply(); }).observe(grid, { childList: true });
      S.observing = true;
    } catch(e){}
  }

  function wire(){
    apply();
    observe();
    try { console.log(TAG, 'loaded (' + (off() ? 'OFF: restored to original entry' : 'three-CTA entry applied') + ')'); } catch(e){}
  }

  window.__v292Dfix870 = {
    version: VERSION,
    apply: apply,
    state: function(){
      var start = el('startScBtn'), cont = el('contBtn'), d = el('f870more'), nb = el('newBtn');
      return { off: off(), applied: S.applied, applies: S.applies, restores: S.restores, observing: S.observing,
               scenarios: scenarioCount(), stories: storyCount(),
               startHidden: start ? !!start.hidden : null, contHidden: cont ? !!cont.hidden : null,
               contTarget: cont ? cont.getAttribute('data-open') : null,
               detailsOpen: d ? d.hasAttribute('open') : null,
               newBtnInDetails: !!(nb && d && d.contains(nb)), newBtnLabel: nb ? nb.textContent : null };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, false); else wire();
})();
