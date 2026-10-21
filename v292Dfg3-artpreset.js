/* =====================================================================
 * v292Dfg3-artpreset.js — FG-3: S2（Asset v2）の物語の「画風」を 3 択にする（GPT #127-FR）
 * ---------------------------------------------------------------------
 * 正本はサーバー：物語の canonical body.cfg.artPreset（'beautiful' | 'cool' | 'dark'）。PC / iPhone で共有。
 *   Worker が ensure_first / regenerate のときに自分で読み、key が無ければ dark（＝ FG-3 前と同じ絵柄）、
 *   3 値以外なら 400 ART_PRESET_UNKNOWN（provider 0）。この client は「選ぶ UI」と「保存」だけを受け持つ。
 *
 * 1. S2 の物語（__v292Dav2Map.docSchema2() === true）で、かつ Worker が features.artPresetV1 を名乗るときだけ：
 *    旧 8 択の 🖌 画風（#v292-style-sel・fix338）を隠し、同じ場所に 3 択（デフォルト／クール／ダーク）を出す。
 *    選ぶと S.cfg.artPreset を書いて通常の保存（S.saveD）に乗せる（fix697 → putcanonical）。それ以外は何もしない。
 *    ・key の無い物語は「ダーク」と表示するだけで、開いただけでは 1 バイトも書かない（一括更新・移行の書込なし）。
 *    ・未知の値は「（不明な設定）」と表示し、選び直したときだけ書く。
 *    ・画風を変えても、採用済みの絵は作り直さない（この module は生成を呼ばない。次に作る絵から変わる）。
 *    ・新しい物語の作成準備中（bav2 の prep）は変更を受け付けない。
 *    旧形式の物語・判定前（null）・Worker が未対応 → 旧 8 択をそのまま（BUNDLE31c と同じ）。
 * 2. S2 の物語では、旧来の絵の作り直し（キャラ一覧の「↻ アイコン再生成」「🎨 外見を作り直す」、設定の主人公 / NPC の ⟳）を
 *    隠し、押されても旧経路へ渡さない（window の capture で止める＝fix145 / fix197 / fix437 / features.js の document の
 *    listener より先）。主人公のカードには Asset v2 の操作（最初の絵を作る・候補から選ぶ）への案内を出す。
 *    旧形式の物語では何もしない。
 * kill: localStorage v292Dfg3Off = '1'（UI も止めるのも全部やめ、BUNDLE31c と同じ）。観測口: window.__v292Dfg3.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292Dfg3) return;
  function g(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var KILLED = g('v292Dfg3Off') === '1';
  var KEYS = ['beautiful', 'cool', 'dark'];
  var LABEL = { beautiful: 'デフォルト', cool: 'クール', dark: 'ダーク' };
  var TITLE = '絵の雰囲気（この物語のキャラの絵に使います）。デフォルト＝やわらかく上品 / クール＝くっきり都会的 / ダーク＝暗く重い雰囲気。変えても今の絵はそのまま。次に作る絵から変わります';
  var st = { ui: 0, changes: 0, refusedPrep: 0, legacyHidden: 0, blockedClicks: 0, heroGuide: 0, lastValue: null, mode: null };
  var LOG = []; function note(o) { try { o.t = Date.now(); LOG.push(o); if (LOG.length > 60) LOG.shift(); } catch (e) {} }
  function doc() { try { var m = window.__v292Dav2Map; return (m && typeof m.docSchema2 === 'function') ? m.docSchema2() : null; } catch (e) { return null; } }
  function supported() {   /* server が artPreset を扱えると名乗っているか（true / false / null=まだ分からない） */
    try { var F = window.__v292Dfix893; if (!F || typeof F.features !== 'function') return null; var f = F.features(); if (!f) return null; return f.artPresetV1 === true; } catch (e) { return null; }
  }
  function state() { try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('fg3') : null; } catch (e) { return null; } }
  function cur() { var S = state(); if (!S || !S.cfg) return { has: false, v: undefined }; var has = Object.prototype.hasOwnProperty.call(S.cfg, 'artPreset') && S.cfg.artPreset !== undefined; return { has: has, v: has ? S.cfg.artPreset : undefined }; }
  function shown(v) { if (v === undefined) return 'dark'; return (typeof v === 'string' && KEYS.indexOf(v) >= 0) ? v : ''; }
  function preparing() { try { var B = window.__v292Dbav2; return !!(B && typeof B.preparing === 'function' && B.preparing()); } catch (e) { return false; } }

  /* ---------- 1. 画風 3 択 ---------- */
  var WRAP_ID = 'v292-artpreset-wrap', SEL_ID = 'v292-artpreset-sel', NOTE_ID = 'v292-artpreset-note';
  function legacyWrap() { var s = document.getElementById('v292-style-sel'); return (s && s.parentNode && s.parentNode !== document.body) ? s.parentNode : null; }
  function unhideLegacy() { var w = document.querySelector('[data-fg3-hidden="1"]'); if (w) { w.style.display = w.getAttribute('data-fg3-prev-display') || ''; w.removeAttribute('data-fg3-hidden'); w.removeAttribute('data-fg3-prev-display'); } }
  function removeMine() { var m = document.getElementById(WRAP_ID); if (m && m.parentNode) m.parentNode.removeChild(m); }
  function build(lw) {
    var wrap = document.createElement('span'); wrap.id = WRAP_ID; wrap.className = lw.className || '';
    wrap.classList.remove('v243-foldable');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:6px;font-size:12px;color:var(--dim,#888);';
    var lab = document.createElement('span'); lab.textContent = '🖌 画風';
    var sel = document.createElement('select'); sel.id = SEL_ID; sel.title = TITLE;
    sel.style.cssText = 'background:var(--s2,#222);color:var(--tx,#eee);border:1px solid var(--border,#444);border-radius:6px;padding:3px 6px;font-size:12px;cursor:pointer;';
    for (var i = 0; i < KEYS.length; i++) { var o = document.createElement('option'); o.value = KEYS[i]; o.textContent = LABEL[KEYS[i]]; sel.appendChild(o); }
    sel.addEventListener('change', onChange);
    wrap.appendChild(lab); wrap.appendChild(sel);
    return wrap;
  }
  function syncValue(sel) {
    var c = cur(), v = shown(c.v);
    var unk = sel.querySelector('option[value=""]');
    if (v === '') { if (!unk) { unk = document.createElement('option'); unk.value = ''; unk.textContent = '（不明な設定）'; unk.disabled = true; sel.insertBefore(unk, sel.firstChild); } }
    else if (unk) unk.parentNode.removeChild(unk);
    if (document.activeElement !== sel && sel.value !== v) sel.value = v;
  }
  function flash(msg) {
    try { var w = document.getElementById(WRAP_ID); if (!w) return; var n = document.getElementById(NOTE_ID);
      if (!n) { n = document.createElement('span'); n.id = NOTE_ID; n.style.cssText = 'margin-left:6px;font-size:11px;color:#e0c080;'; w.appendChild(n); }
      n.textContent = msg; clearTimeout(n.__t); n.__t = setTimeout(function () { try { n.textContent = ''; } catch (e) {} }, 6000); } catch (e) {}
  }
  function onChange(ev) {
    var sel = ev && ev.target; if (!sel) return;
    var v = sel.value;
    if (KEYS.indexOf(v) < 0) { syncValue(sel); return; }
    if (preparing()) { st.refusedPrep++; syncValue(sel); flash('物語の準備中です。少し待ってから選んでください'); return; }
    if (doc() !== true || supported() !== true) { syncValue(sel); return; }
    var S = state(); if (!S || !S.cfg) { syncValue(sel); return; }
    var c = cur(); if (c.has && c.v === v) return;   /* 同じ値なら書かない */
    S.cfg.artPreset = v; st.changes++; st.lastValue = v;
    try { if (typeof S.saveD === 'function') S.saveD('fg3.artPreset'); else if (typeof S.save === 'function') S.save(); } catch (e) {}
    note({ kind: 'CHANGE', v: v });
    flash('次に作る絵から「' + LABEL[v] + '」になります（今の絵はそのまま）');
  }
  /* ★B37-F (GPT #127-HF F・kill: localStorage v292DfixB37fOff='1' → 従来どおり ⚙ 設定 > 詳細設定 の旧 8 択の隣)
     S2 の物語だけ、3 択（デフォルト／クール／ダーク）を物語画面の「🎛 調整」（topbar の折りたたみ・fix243）の中に置く。
     保存は従来どおり onChange → S.cfg.artPreset → 通常の保存（S.saveD → fix697 → putcanonical）。PC / iPhone は通常の保存で揃う。
     採用済みの絵は作り直さない・自動で採用しない（この module は生成を呼ばない）。旧形式の物語では何もしない（applyUI の早期 return）。 */
  function b37fOn() { return g('v292DfixB37fOff') !== '1'; }
  function b37place(mine) {
    var bar = document.getElementById('topbar'); if (!bar) return false;
    if (mine.parentNode !== bar) {
      var tg = document.getElementById('v243-toggle');
      /* 「🎛 調整」の直後（fix243 の折りたたみの対象になる位置）に置く */
      if (tg && tg.parentNode === bar) bar.insertBefore(mine, tg.nextSibling); else bar.appendChild(mine);
      mine.classList.remove('v880-knob'); mine.style.marginLeft = '6px'; mine.setAttribute('data-b37f', 'topbar'); st.b37moved = (st.b37moved || 0) + 1;
    }
    if (!mine.classList.contains('v243-foldable')) mine.classList.add('v243-foldable');   /* 「🎛 調整」を閉じると隠れる（fix243 の CSS） */
    return true;
  }
  function applyUI() {
    var d = doc(), sup = supported(); st.mode = { doc: d, sup: sup };
    if (d !== true || sup !== true) { removeMine(); unhideLegacy(); return; }   /* 旧形式・判定前・未対応 = BUNDLE31c と同じ */
    var lw = legacyWrap(); var mine = document.getElementById(WRAP_ID);
    if (!lw) { if (!mine) return; }   /* 旧 8 択がまだ作られていない（features.js が後から注入）→ 次の tick */
    if (lw && lw.getAttribute('data-fg3-hidden') !== '1') { lw.setAttribute('data-fg3-prev-display', lw.style.display || ''); lw.style.display = 'none'; lw.setAttribute('data-fg3-hidden', '1'); st.legacyHidden++; }
    if (!mine) { mine = build(lw); st.ui++; }
    if (b37fOn()) { b37place(mine); }   /* ★B37-F: 物語の「🎛 調整」（topbar）に置く */
    else {
    if (lw && lw.nextSibling !== mine) { lw.parentNode.insertBefore(mine, lw.nextSibling); }   /* fix880 が旧 8 択を動かしても隣に付いていく */
    if (lw && lw.classList.contains('v880-knob') && !mine.classList.contains('v880-knob')) { mine.classList.add('v880-knob'); mine.style.marginLeft = ''; }
    }
    var sel = document.getElementById(SEL_ID); if (sel) syncValue(sel);
  }

  /* ---------- 2. S2 の物語では旧来の絵の作り直しを出さない・通さない ---------- */
  var LEGACY_TXT = /アイコン再生成|外見を作り直す/;
  function isLegacyRegenControl(t) {
    if (!t || !t.closest) return null;
    var b = t.closest('button,[role="button"],a,[data-v100-act],[data-v100-npc]'); if (!b) return null;
    if (b.closest('[data-av2-ui],[data-av2-pick]')) return null;                    /* Asset v2 の操作は対象外 */
    if (b.getAttribute('data-v100-act') === 'hero-regen' || b.hasAttribute('data-v100-npc')) return b;   /* 設定の ⟳（主人公 / NPC） */
    var txt = (b.textContent || '').trim();
    if (txt.length <= 40 && LEGACY_TXT.test(txt) && b.closest('.v292Dfix145-card')) return b;           /* キャラ一覧の旧ボタン */
    return null;
  }
  var GUIDE = 'この物語の絵は、ここの「最初の絵を作る」「候補から選ぶ」「外見を設定」で作ります（旧来の「アイコン再生成」は使いません）';
  function hideLegacyRegen() {
    if (doc() !== true) return;
    try {
      var cards = document.querySelectorAll('.v292Dfix145-card');
      for (var i = 0; i < cards.length; i++) {
        var bs = cards[i].querySelectorAll('button');
        for (var j = 0; j < bs.length; j++) { var b = bs[j]; if (b.closest('[data-av2-ui]')) continue; var t = (b.textContent || '').trim(); if (t.length <= 40 && LEGACY_TXT.test(t) && b.style.display !== 'none') { b.style.display = 'none'; b.setAttribute('data-fg3-legacy', '1'); } }
        var sec = cards[i].closest('.v292Dfix145-section'); var secT = sec && sec.firstElementChild ? (sec.firstElementChild.textContent || '') : '';
        if (/^\s*⭐/.test(secT) && !cards[i].querySelector('[data-fg3-hero-guide]')) {   /* 主人公のカード（fix145 の「⭐ 主役」の欄） */
          var gd = document.createElement('div'); gd.setAttribute('data-fg3-hero-guide', '1'); gd.style.cssText = 'margin-top:4px;font-size:11px;color:#9ab;'; gd.textContent = GUIDE;
          var col = cards[i].lastElementChild || cards[i]; col.appendChild(gd); st.heroGuide++;
        }
      }
      var hv = document.querySelectorAll('[data-v100-act="hero-regen"], .v100-npc-btn[data-v100-npc]');
      for (var k = 0; k < hv.length; k++) { var el = hv[k]; if (el.tagName === 'BUTTON' && el.style.display !== 'none') { el.style.display = 'none'; el.disabled = true; el.setAttribute('data-fg3-legacy', '1'); } el.onclick = null; }
      var hav = document.getElementById('heroAvSettings');
      if (hav) { var ds = hav.querySelectorAll('div'); for (var q = 0; q < ds.length; q++) { if (/^⟳ で(再)?生成$/.test((ds[q].textContent || '').trim())) ds[q].style.display = 'none'; }
        if (!hav.querySelector('[data-fg3-hero-guide]')) { var g2 = document.createElement('div'); g2.setAttribute('data-fg3-hero-guide', '1'); g2.style.cssText = 'font-size:11px;color:#9ab;margin-top:2px;'; g2.textContent = '絵は 👥 キャラ の「最初の絵を作る」「候補から選ぶ」で作ります'; var info = hav.querySelector('.v100-info') || hav; info.appendChild(g2); } }
    } catch (e) {}
  }
  function onClick(ev) {
    try {
      if (KILLED) return;
      var b = isLegacyRegenControl(ev.target); if (!b) return;
      if (doc() !== true) return;                                                  /* 旧形式・判定前は従来どおり（判定前は旧経路側が自分で止める） */
      ev.stopImmediatePropagation(); ev.preventDefault();
      st.blockedClicks++; note({ kind: 'LEGACY_REGEN_BLOCKED', t: (b.textContent || '').trim().slice(0, 20) });
      hideLegacyRegen();
    } catch (e) {}
  }
  if (!KILLED) { try { window.addEventListener('click', onClick, true); } catch (e) {} }

  /* ---------- 実行（features.js / fix880 / fix145 が後から DOM を作るので追従。書込はしない） ---------- */
  var n = 0, pend = false;
  function tick() { if (KILLED) return; try { applyUI(); } catch (e) {} try { hideLegacyRegen(); } catch (e) {} }
  function loop() { n++; tick(); if (n < 240) setTimeout(loop, n < 40 ? 250 : 1000); }
  if (!KILLED) {
    loop();
    try { var mo = new MutationObserver(function () { if (pend) return; pend = true; setTimeout(function () { pend = false; tick(); }, 60); });
      var startMo = function () { if (document.body) mo.observe(document.body, { childList: true, subtree: true }); };
      if (document.body) startMo(); else document.addEventListener('DOMContentLoaded', startMo, { once: true }); } catch (e) {}
    try { window.addEventListener('chr:account-me', function () { tick(); }); } catch (e) {}
  }
  window.__v292Dfg3 = { version: 'fg3-r1', keys: KEYS.slice(0), labels: JSON.parse(JSON.stringify(LABEL)),
    status: function () { var c = cur(); return { killed: KILLED, doc: doc(), supported: supported(), has: c.has, value: c.v === undefined ? null : c.v, shown: shown(c.v), ui: st.ui, changes: st.changes, refusedPrep: st.refusedPrep, legacyHidden: st.legacyHidden, blockedClicks: st.blockedClicks, heroGuide: st.heroGuide, log: LOG.slice(-10) }; } };
})();
