/* v292DfixLD1-preset-portrait — Lane D (UX-05): show the portrait that was ADOPTED FOR THE CURRENT ART PRESET.
 * (GPT #127-IJ Design GO + Gate conditions D2/D3)  OFFLINE CANDIDATE — NOT DEPLOYED.
 *
 * What it does (display only):
 *   - the Worker's portrait.list answer (Lane D1 Worker) carries adopted_by_preset[] = the newest ADOPTED image per character x art preset
 *     (registry preset ids, plus profile_match = does the character's CURRENT appearance profile still produce the prompt of that image)
 *     and current_preset. This module remembers that answer (it wraps the READ port's portrait.list callback only) and tells
 *     v292Dav2-portrait.js pictureFor() which image to show: the current preset's adopted image if there is one (and it is not stale), else the pointer image.
 *   - UI CONTRACT (one rule, every surface):
 *       S1  shown image = pointer image                      -> nothing extra ("採用中" = the pointer = what you see).
 *       S2  shown image = current preset's adopted image, pointer is a different image
 *                                                             -> note NOTE_DIFF; in the picker the shown image is "採用中（この画風）", the pointer one "最後に採用した絵".
 *       S3  no usable adopted image for this preset          -> pointer image, and if the pointer image is known to belong to ANOTHER preset
 *                                                               (or the preset's image is stale after an appearance change): the unified label NOTE
 *                                                               「この画風の絵はまだありません（別の画風の絵を表示中）」. Never generated, never adopted automatically.
 *       S4  the pointer image's preset is not recorded (LEGACY_DEVICE_COPY ...) -> shown as before, NO claim, never guessed (data-av2-preset="unknown").
 *     Surfaces: every <img> that v292Dav2-portrait.js applyImg() handles (キャラ一覧 .v292Dfix145-card, 会話ログ .v292-dlg-card/.dlg-av, .npc-card, .v100-clean)
 *     gets data-av2-preset / data-av2-fallback / tooltip; the character card shows the note as text; the 拡大ビュー (fix777 lightbox, it copies the img src)
 *     gets the note under the picture; the 候補一覧 (openPicker) shows the note on top and re-labels 採用中 per rule S2.
 *   - appearance profile (GPT D2-3): a profile whose appearance has changed since the image was made (profile_match === false) is NEVER shown as
 *     "the preset's adopted image" (rule S3 applies, reason profile_changed); and right after setProfile() the cached list is treated as dirty
 *     (pointer image) until a fresh read arrives. A profile change itself never selects, adopts or restores any image.
 * What it never does: generate, write the pointer, adopt, discard, touch the appearance profile, call any write op, save anything, reload.
 *   The only network it can cause is the existing read ops portrait.list / asset.get.
 * Seam: ONE line in v292Dav2-portrait.js pictureFor (applied by apply_d.py):   var p = listed.by[ident.id]; try{ ... __v292DfixLD1.pick(...) }catch(e){}
 * Flags: localStorage v292DfixLD1On = '1' (opt-in, default OFF).  Kill: localStorage v292DfixD1Off = '1' (wins over the opt-in).
 *   OFF or killed => this file installs nothing (the hook finds no .pick) => zero behaviour change.  Turning it on/off needs a reload.
 *   Worker kill: env CHR_AV2_PRESET_VIEW_OFF='1' (no extra fields => this module sees nothing => pointer image as before).
 * Observation: window.__v292DfixLD1.status()
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixLD1) return;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  var KILLED = lsg('v292DfixD1Off') === '1';
  var ON = !KILLED && lsg('v292DfixLD1On') === '1';
  if (!ON){ window.__v292DfixLD1 = { version: 'ld1-r2', on: false, killed: KILLED, status: function(){ return { on: false, killed: KILLED }; } }; return; }

  var NOTE = 'この画風の絵はまだありません（別の画風の絵を表示中）';                       // unified fallback label (GPT D2-7)
  var NOTE_DIFF = 'この画風で採用した絵を表示しています（最後に採用した絵とは別の絵です）';   // S2
  /* ONE table: cfg.artPreset key  <->  UI label (v292Dfg3-artpreset.js LABEL)  <->  stored registry preset id (Worker ART_PRESET_IDS) (GPT D2-4).
     The pin UI shows 「デフォルト」 for the stored key 'beautiful' = chronicle_beautiful_novel_v1@1. checkTable() compares it with the live <select>. */
  var TABLE = [ { key: 'beautiful', label: 'デフォルト', id: 'chronicle_beautiful_novel_v1@1' },
                { key: 'cool',      label: 'クール',     id: 'chronicle_cool_stylish_v1@1' },
                { key: 'dark',      label: 'ダーク',     id: 'chronicle_dark_vn_v1@1' } ];
  var IDS = {}, LABEL = {}, KEY_OF_ID = {};
  TABLE.forEach(function(t){ IDS[t.key] = t.id; LABEL[t.key] = t.label; KEY_OF_ID[t.id] = t.key; });
  var PRESET_RE = /^[A-Za-z0-9_.@-]{1,80}$/;
  function own(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  var stats = { captured: 0, noExtra: 0, pickAdopted: 0, pickFallback: 0, pickUnknown: 0, pickPointer: 0, pickBase: 0, pickStale: 0, pickDirty: 0, installTries: 0, installed: false, profileHook: false, dirtied: 0, sweeps: 0 };
  var lists = {};   // story_id -> { at, current, dirty, byPreset: { cid: { presetId: {asset_id, rev, pm} } }, assetPreset: { asset_id: presetId }, cidOfAsset: { asset_id: cid } }
  var last = {};    // story_id|cid -> { mode: 'adopted'|'fallback'|'pointer'|'unknown'|'dirty', want, from, shown, pointer, differs, reason }

  /* ---------- table self-check against the live pin UI (read only) ---------- */
  function checkTable(){
    var sel = document.getElementById('v292-artpreset-sel');
    if (!sel) return { selectFound: false, ok: null };
    var seen = {}; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value) seen[sel.options[i].value] = sel.options[i].textContent;
    var ok = TABLE.every(function(t){ return seen[t.key] === t.label; }) && Object.keys(seen).length === TABLE.length;
    return { selectFound: true, ok: ok, options: seen };
  }

  /* ---------- capture: remember the extra fields of portrait.list (read port wrapper; nothing else is touched) ---------- */
  function capture(storyId, r){
    var j = r && r.status === 200 ? r.j : null;
    if (!storyId || !j || !Array.isArray(j.portraits)) return;                          // failure: keep whatever portrait.js decides; never replace good data with nothing
    if (!Array.isArray(j.adopted_by_preset)){ delete lists[storyId]; stats.noExtra++; return; }   // old / killed Worker -> behave exactly as before
    var by = {}, ap = {}, co = {};
    j.portraits.forEach(function(p){ if (p && typeof p.character_id === 'string' && typeof p.asset_id === 'string') co[p.asset_id] = p.character_id; });
    j.adopted_by_preset.forEach(function(e){
      if (!e || typeof e.character_id !== 'string' || typeof e.asset_id !== 'string' || typeof e.preset !== 'string' || !PRESET_RE.test(e.preset)) return;
      (by[e.character_id] = by[e.character_id] || {})[e.preset] = { asset_id: e.asset_id, rev: e.rev, pm: e.profile_match === false ? false : (e.profile_match === true ? true : null) };
      ap[e.asset_id] = e.preset; co[e.asset_id] = e.character_id;
    });
    lists[storyId] = { at: Date.now(), current: (typeof j.current_preset === 'string' && PRESET_RE.test(j.current_preset)) ? j.current_preset : null, dirty: false, byPreset: by, assetPreset: ap, cidOfAsset: co };
    stats.captured++;
  }
  function curStory(){ try { var P = window.__chronicleAv2Portrait; var s = P && P.status ? P.status() : null; return s && s.storyId ? String(s.storyId) : null; } catch(e){ return null; } }
  function refreshPortraits(){ try { var P = window.__chronicleAv2Portrait; if (P && typeof P.refresh === 'function') P.refresh(); } catch(e){} }   // portrait.list READ only
  function markDirty(){ var sid = curStory(); if (sid && lists[sid]){ lists[sid].dirty = true; stats.dirtied++; } }
  function install(){
    var F = window.__v292Dfix697, okRead = false;
    if (F && typeof F.assetV2Read === 'function'){
      if (F.assetV2Read.__ld1) okRead = true;
      else {
        var orig = F.assetV2Read;
        var w = function(op, args, cb){
          if (op !== 'portrait.list' || typeof cb !== 'function') return orig.apply(this, arguments);
          var sid = args && args.story_id;
          return orig.call(this, op, args, function(r, err){ try { capture(sid, r); } catch(e){} return cb(r, err); });
        };
        w.__ld1 = true;
        try { F.assetV2Read = w; } catch(e){}
        okRead = F.assetV2Read === w;
      }
    }
    /* profile hook (GPT D2-3): after the Owner confirms a new appearance the cached per-preset list is stale. Mark it dirty (= pointer image, today's behaviour)
       and re-read portrait.list. Wrapping only observes; arguments and the callback result pass through untouched. */
    var A = window.__chronicleAssetV2, okProf = false;
    if (A && typeof A.setProfile === 'function'){
      if (A.setProfile.__ld1) okProf = true;
      else {
        var sp = A.setProfile;
        var wp = function(cid, input, cb){
          markDirty();
          var args = Array.prototype.slice.call(arguments);
          if (typeof cb === 'function') args[2] = function(){ try { markDirty(); refreshPortraits(); } catch(e){} return cb.apply(this, arguments); };
          return sp.apply(this, args);
        };
        wp.__ld1 = true;
        try { A.setProfile = wp; } catch(e){}
        okProf = A.setProfile === wp;
      }
    }
    stats.profileHook = okProf;
    return okRead && okProf;
  }
  (function tryInstall(){ stats.installed = install(); if (!stats.installed && ++stats.installTries < 180) setTimeout(tryInstall, stats.installTries < 120 ? 500 : 5000); })();

  /* ---------- which preset is "current"? the device's own choice first (it may not have reached the server yet), then the server's ---------- */
  function wantPreset(L){
    try {
      var S = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('ld1') : null;
      if (S && S.cfg){
        if (own(S.cfg, 'artPreset') && S.cfg.artPreset !== undefined){ var v = S.cfg.artPreset; return (typeof v === 'string' && own(IDS, v)) ? IDS[v] : null; }
        return IDS.dark;                                                                // key missing = dark (same rule as the Worker's generation)
      }
    } catch(e){}
    return L && L.current ? L.current : null;
  }

  /* ---------- the seam called from pictureFor():  pick(story_id, character_id, pointerEntry) -> {asset_id, rev} ---------- */
  function pick(storyId, cid, base){
    var key = storyId + '|' + cid, L = lists[storyId];
    if (!L || !base){ delete last[key]; stats.pickBase++; return base; }
    if (L.dirty){ last[key] = { mode: 'dirty', want: null, from: null, shown: base.asset_id, pointer: base.asset_id, differs: false, reason: 'dirty' }; stats.pickDirty++; return base; }
    var want = wantPreset(L);
    if (!want){ delete last[key]; stats.pickBase++; return base; }
    var mine = L.byPreset[cid] && L.byPreset[cid][want], reason = null;
    if (mine && mine.pm === false){ mine = null; reason = 'profile_changed'; stats.pickStale++; }   // appearance changed since: never auto-restored
    if (mine){
      var differs = mine.asset_id !== base.asset_id;
      last[key] = { mode: 'adopted', want: want, from: want, shown: mine.asset_id, pointer: base.asset_id, differs: differs, reason: null }; stats.pickAdopted++;
      return differs ? { asset_id: mine.asset_id, rev: mine.rev } : base;
    }
    var bp = L.assetPreset[base.asset_id] || null;                                      // the preset of the picture we are about to show (null = not recorded: never guessed)
    if (bp && bp !== want){ last[key] = { mode: 'fallback', want: want, from: bp, shown: base.asset_id, pointer: base.asset_id, differs: false, reason: reason || 'none' }; stats.pickFallback++; }
    else if (bp){ last[key] = { mode: 'pointer', want: want, from: bp, shown: base.asset_id, pointer: base.asset_id, differs: false, reason: reason }; stats.pickPointer++; }
    else { last[key] = { mode: 'unknown', want: want, from: null, shown: base.asset_id, pointer: base.asset_id, differs: false, reason: reason }; stats.pickUnknown++; }
    return base;
  }

  /* ---------- DOM: attributes + small labels (display only) ---------- */
  function noteFor(st){ return !st ? null : (st.mode === 'fallback' ? NOTE : (st.mode === 'adopted' && st.differs ? NOTE_DIFF : null)); }
  function setAttr(el, k, v){ if (v === null || v === undefined){ if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v)); }
  function sweepImgsAndCards(sid){
    var imgs = document.querySelectorAll('img[data-av2-id]');
    for (var i = 0; i < imgs.length; i++){
      var img = imgs[i], st = last[sid + '|' + img.getAttribute('data-av2-id')];
      var mode = st ? st.mode : null;
      setAttr(img, 'data-av2-preset', mode);
      setAttr(img, 'data-av2-differs', st && st.mode === 'adopted' && st.differs ? '1' : null);
      if (mode === 'fallback'){
        setAttr(img, 'data-av2-fallback', '1'); setAttr(img, 'data-av2-fallback-reason', st.reason);
        if (!img.title || img.title === NOTE || img.title === NOTE_DIFF){ if (img.title !== NOTE) img.title = NOTE; }
      } else {
        setAttr(img, 'data-av2-fallback', null); setAttr(img, 'data-av2-fallback-reason', null);
        if (st && st.mode === 'adopted' && st.differs && (!img.title || img.title === NOTE_DIFF || img.title === NOTE)){ if (img.title !== NOTE_DIFF) img.title = NOTE_DIFF; }
        else if (img.title === NOTE || img.title === NOTE_DIFF) img.removeAttribute('title');
      }
    }
    var cards = document.querySelectorAll('.v292Dfix145-card[data-av2-cid]');
    for (var c = 0; c < cards.length; c++){
      var card = cards[c], cid = card.getAttribute('data-av2-cid'), txt = noteFor(last[sid + '|' + cid]);
      var have = card.querySelector('[data-ld1-note]');
      if (txt){
        if (have && have.textContent !== txt) have.textContent = txt;
        if (!have){
          var n = document.createElement('div'); n.setAttribute('data-ld1-note', '1'); n.setAttribute('data-av2-ui', 'preset-note');
          n.style.cssText = 'margin-top:4px;font-size:11px;color:#e0c080;'; n.textContent = txt;
          var col = card.children[1] || card, box = col.querySelector('[data-av2-ui="card"]');
          if (box) col.insertBefore(n, box); else col.appendChild(n);
        }
      } else if (have && have.parentNode) have.parentNode.removeChild(have);
    }
  }
  /* 候補一覧: only labels / a note / hiding the redundant adopt button of the shown image — no click handler of portrait.js is touched or called */
  function sweepPicker(sid){
    var pk = document.getElementById('v292Dav2-picker'); if (!pk) return;
    var L = lists[sid], cells = pk.querySelectorAll('[data-av2-pick-item]'); if (!L || !cells.length) return;
    var ptrCell = pk.querySelector('[data-av2-pick-item][data-current="1"]'), cid = ptrCell ? L.cidOfAsset[ptrCell.getAttribute('data-av2-pick-item')] : null;
    var st = cid ? last[sid + '|' + cid] : null, txt = noteFor(st);
    var top = pk.querySelector('[data-ld1-picker-note]'), msg = pk.querySelector('[data-av2-pick="msg"]');
    if (txt && msg){
      if (!top){ top = document.createElement('div'); top.setAttribute('data-ld1-picker-note', '1'); top.style.cssText = 'font-size:11px;color:#e0c080;margin:2px 0 4px;'; msg.parentNode.insertBefore(top, msg.nextSibling); }
      if (top.textContent !== txt) top.textContent = txt;
    } else if (top && top.parentNode) top.parentNode.removeChild(top);
    for (var i = 0; i < cells.length; i++){
      var cell = cells[i], aid = cell.getAttribute('data-av2-pick-item'), isPtr = cell.getAttribute('data-current') === '1';
      var im = cell.querySelector('img'), btn = cell.querySelector('button[data-av2-pick="adopt"]'), lab = null, kids = cell.children;
      for (var k = 0; k < kids.length; k++) if (kids[k].tagName === 'DIV' && !kids[k].hasAttribute('data-ld1-lab')) lab = kids[k];   // portrait.js's own 採用中 label (pointer cell)
      var mine = cell.querySelector('[data-ld1-lab]');
      var shownHere = !!(st && st.mode === 'adopted' && st.differs && aid === st.shown);
      var ptrDemoted = !!(st && st.mode === 'adopted' && st.differs && isPtr);
      if (lab){ if (lab.__ld1o === undefined) lab.__ld1o = lab.textContent; var want = ptrDemoted ? '最後に採用した絵' : lab.__ld1o; if (lab.textContent !== want) lab.textContent = want; }
      if (im){ if (im.__ld1o === undefined) im.__ld1o = im.style.outline; var wo = ptrDemoted ? '1px dashed #806040' : (shownHere ? '2px solid #e0c080' : im.__ld1o); if (im.style.outline !== wo) im.style.outline = wo; }
      if (shownHere){
        if (!mine){ mine = document.createElement('div'); mine.setAttribute('data-ld1-lab', '1'); mine.style.cssText = 'font-size:11px;color:#e0c080;'; mine.textContent = '採用中（この画風）'; cell.insertBefore(mine, btn || null); }
        if (btn && btn.style.display !== 'none'){ btn.__ld1d = btn.style.display; btn.style.display = 'none'; btn.setAttribute('data-ld1-hidden', '1'); }
      } else {
        if (mine && mine.parentNode) mine.parentNode.removeChild(mine);
        if (btn && btn.hasAttribute('data-ld1-hidden')){ btn.style.display = btn.__ld1d || ''; btn.removeAttribute('data-ld1-hidden'); }
      }
    }
  }
  /* 拡大ビュー (fix777 lightbox copies the clicked img's src): put the same note under the enlarged picture */
  function onClickCapture(ev){
    try {
      var t = ev && ev.target; if (!t || t.tagName !== 'IMG') return;
      var mode = t.getAttribute('data-av2-preset'), txt = mode === 'fallback' ? NOTE : (mode === 'adopted' && t.getAttribute('data-av2-differs') === '1' ? NOTE_DIFF : null);
      if (!txt) return;
      setTimeout(function(){
        var ov = document.getElementById('v292Dfix777-overlay'); if (!ov || ov.querySelector('[data-ld1-lightbox-note]')) return;
        var n = document.createElement('div'); n.setAttribute('data-ld1-lightbox-note', '1');
        n.style.cssText = 'color:#e0c080;font-size:12px;max-width:90vw;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.9);pointer-events:none;'; n.textContent = txt;
        var big = ov.querySelector('img'); if (big && big.nextSibling) ov.insertBefore(n, big.nextSibling); else ov.appendChild(n);
      }, 0);
    } catch(e){}
  }
  var swPending = false;
  function sweep(){
    swPending = false; stats.sweeps++;
    var sid = curStory(); if (!sid) return;
    try { sweepImgsAndCards(sid); sweepPicker(sid); } catch(e){}
  }
  function schedSweep(){ if (swPending) return; swPending = true; setTimeout(sweep, 60); }
  setInterval(sweep, 800);
  try { var mo = new MutationObserver(schedSweep); mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-current'] }); } catch(e){}
  try { document.addEventListener('click', onClickCapture, true); } catch(e){}

  window.__v292DfixLD1 = {
    version: 'ld1-r2', on: true, killed: false, pick: pick, table: TABLE.map(function(t){ return { key: t.key, label: t.label, id: t.id }; }), checkTable: checkTable,
    labelOfId: function(id){ var k = KEY_OF_ID[id]; return k ? LABEL[k] : null; },
    status: function(){ var o = {}; Object.keys(lists).forEach(function(s){ var L = lists[s]; o[s] = { at: L.at, current: L.current, dirty: L.dirty, chars: Object.keys(L.byPreset).length, presets: Object.keys(L.assetPreset).length }; });
      return { on: true, killed: false, stats: JSON.parse(JSON.stringify(stats)), lists: o, last: JSON.parse(JSON.stringify(last)), table: checkTable(), want: (function(){ var s = curStory(); return s ? wantPreset(lists[s]) : null; })() }; }
  };
  try { console.log('[ld1] loaded (on)'); } catch(e){}
})();
