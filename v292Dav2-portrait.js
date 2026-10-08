/* v292Dav2-portrait — Asset v2 client PRESENTATION PLANE (C2)  — offline candidate, NOT DEPLOYED
 * GPT 911 = GO (C1 CLOSED): portrait.list / asset.get, bytes → data URL, asset_id-keyed IDB cache (record carries story_id),
 *   schema-2 speaker placeholder, legacy portrait guards (in the legacy modules, conditioned ONLY on the canonical-derived
 *   document predicate __v292Dav2Map.docSchema2()), pending / blocked / conflict reason display, addBinding UI,
 *   explicit DELETE UI (local retire happens in the data plane only after the server readback).
 * Read / render NEVER depends on the local flag v292Dav2On (D5): an assetSchema-2 document always takes this path.
 * Invariants (HANDOFF §4 / U1-U7):
 *   - never generates: a missing / unavailable picture shows the local placeholder (no provider call, no ensure_first here)
 *   - identity: explicit binding (exact NFC/trim) or the card's own cast entry; never fuzzy name matching
 *   - only image/png|jpeg|webp bytes are rendered (data: URL built locally from the server bytes)
 * Kill: localStorage v292Dav2pOff = '1' stops this module's DOM work (the legacy guards stay; schema-2 documents then show
 *   whatever the legacy DOM wrote — no generation, because the legacy guards are independent of this kill).
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__chronicleAv2Portrait) return;
  var TAG = '[av2p]';
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function killed(){ return lsg('v292Dav2pOff') === '1'; }
  function M(){ return window.__v292Dav2Map || null; }
  function A(){ return window.__chronicleAssetV2 || null; }
  function F(){ return window.__v292Dfix697 || null; }
  function doc(){ try { var m = M(); return (m && typeof m.docSchema2 === 'function') ? m.docSchema2() : false; } catch(e){ return false; } }
  function sid(){ try { var f = F(); var s = f && f.status ? f.status().storyId : null; return s || window.__chronicleDocumentStoryKey || null; } catch(e){ return null; } }
  function state(){ try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('av2p') : null; } catch(e){ return null; } }
  function key(s){ return String(s == null ? '' : s).normalize('NFC').trim(); }
  function own(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  var LOG = []; function note(o){ try { o.t = Date.now(); LOG.push(o); if (LOG.length > 200) LOG.shift(); } catch(e){} }
  var stats = { list: 0, listFail: 0, get: 0, getFail: 0, badType: 0, idbHit: 0, idbPut: 0, memHit: 0, set: 0, sweeps: 0 };
  var IMG_TYPES = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };

  /* ---------- story model (local, canonical-derived): cast entries with ids + sidecar retired + bindings ---------- */
  function model(){
    var S = state(), id = sid();
    if (!S || !S.cast || typeof S.cast !== 'object' || !S.cast.av2 || !id) return null;
    var c = S.cast, a = c.av2, ents = [];
    var addE = function(e, hero){ if (e && typeof e === 'object' && typeof e.character_id === 'string') ents.push({ id: e.character_id, name: key(e.name), status: e.status || 'ACTIVE', hero: !!hero }); };
    addE(c.hero, true);
    (Array.isArray(c.npcs) ? c.npcs : []).forEach(function(n){ addE(n, false); });
    (Array.isArray(a.retired) ? a.retired : []).forEach(function(r){ if (!ents.some(function(x){ return x.id === r.character_id; })) addE(r, false); });
    return { story_id: String(id), ents: ents, bindings: (a.bindings && typeof a.bindings === 'object') ? a.bindings : {} };
  }
  function entById(m, cid){ for (var i = 0; i < m.ents.length; i++) if (m.ents[i].id === cid) return m.ents[i]; return null; }
  /* U2: a label resolves ONLY through an explicit binding (exact after NFC/trim) */
  function resolveLabel(m, label){
    var k = key(label);
    if (k && own(m.bindings, k)){ var e = entById(m, m.bindings[k]); if (e) return { kind: 'REGISTERED', id: e.id, historical: e.status === 'DELETED' }; }
    return { kind: 'UNREGISTERED', label: k };
  }
  /* charlist card: the card IS a cast entry (built from it) → its own id, only if the current name is unique among entries */
  function cardEntry(m, name){
    var k = key(name), hit = m.ents.filter(function(e){ return e.name === k && e.status !== 'DELETED'; });
    return hit.length === 1 ? hit[0] : null;
  }

  /* ---------- deterministic local placeholder (no network) — speaker_identity.mjs placeholderImage ---------- */
  var phCache = {};
  function placeholderImage(label){
    var n = String(label || '?'); if (phCache[n]) return phCache[n];
    var h = 0; for (var i = 0; i < n.length; i++) h = ((h << 5) - h + n.charCodeAt(i)) | 0;
    var hue = Math.abs(h) % 360; var ch = n.charAt(0) || '?'; if ('<&"\''.indexOf(ch) >= 0) ch = '?';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="hsl(' + hue + ',20%,26%)"/>' +
              '<text x="32" y="43" text-anchor="middle" font-size="30" font-family="sans-serif" fill="rgba(255,255,255,.7)">' + ch + '</text></svg>';
    return (phCache[n] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  /* ---------- IDB cache: db chr6av2 / store assets (keyPath asset_id); record carries story_id (R15) ---------- */
  var DBN = 'chr6av2', ST = 'assets', dbp = null;
  function idb(){
    if (dbp) return dbp;
    dbp = new Promise(function(res, rej){
      try { var r = indexedDB.open(DBN, 1);
        r.onupgradeneeded = function(){ var d = r.result; if (!d.objectStoreNames.contains(ST)) d.createObjectStore(ST, { keyPath: 'asset_id' }); };
        r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); };
      } catch(e){ rej(e); }
    });
    dbp.catch(function(){ dbp = null; });
    return dbp;
  }
  function idbGet(assetId){
    return idb().then(function(d){ return new Promise(function(res){ try { var q = d.transaction(ST, 'readonly').objectStore(ST).get(assetId); q.onsuccess = function(){ res(q.result || null); }; q.onerror = function(){ res(null); }; } catch(e){ res(null); } }); })['catch'](function(){ return null; });
  }
  function idbPut(rec){
    return idb().then(function(d){ return new Promise(function(res){ try { var tx = d.transaction(ST, 'readwrite'); tx.objectStore(ST).put(rec); tx.oncomplete = function(){ res(true); }; tx.onerror = function(){ res(false); }; } catch(e){ res(false); } }); })['catch'](function(){ return false; });
  }

  /* ---------- server reads (fix697 read port: portrait.list / asset.get only) ---------- */
  var listed = null, listInFlight = false, lastRegOk = -1;
  var LIST_MAX_AGE = 180000, LIST_RETRY_MS = 15000;
  function wantList(m){
    if (!listed || listed.story_id !== m.story_id) return true;
    var age = Date.now() - listed.at;
    if (listed.error) return age > LIST_RETRY_MS;
    var r = A() && A().status ? A().status().reg : null;              // a new registration → its pointer may exist now
    if (r && r.ok !== lastRegOk){ lastRegOk = r.ok; return true; }
    return age > LIST_MAX_AGE;
  }
  function fetchList(m){
    var f = F(); if (!f || typeof f.assetV2Read !== 'function' || listInFlight) return;
    listInFlight = true; stats.list++;
    f.assetV2Read('portrait.list', { story_id: m.story_id }, function(r, err){
      listInFlight = false;
      var j = r && r.j;
      if (err || !r || r.status !== 200 || !j || !Array.isArray(j.portraits)){
        stats.listFail++; listed = { story_id: m.story_id, at: Date.now(), error: err || ('HTTP_' + (r && r.status)), by: {} };
        note({ kind: 'LIST_FAIL', why: listed.error }); return schedule();
      }
      var by = {}; j.portraits.forEach(function(p){ if (p && typeof p.character_id === 'string' && typeof p.asset_id === 'string') by[p.character_id] = { asset_id: p.asset_id, rev: p.rev }; });
      listed = { story_id: m.story_id, at: Date.now(), error: null, by: by };
      note({ kind: 'LIST_OK', n: Object.keys(by).length }); schedule();
    });
  }
  var mem = {}, getting = {}, getFailed = {};
  function toDataUrl(buf, type){
    var u8 = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return 'data:' + type + ';base64,' + btoa(s);
  }
  function loadAsset(assetId, storyId){
    if (mem[assetId] || getting[assetId] || getFailed[assetId]) return;
    getting[assetId] = true;
    idbGet(assetId).then(function(rec){
      if (rec && typeof rec.data === 'string' && rec.data.indexOf('data:image/') === 0){ stats.idbHit++; mem[assetId] = rec.data; getting[assetId] = false; return schedule(); }
      var f = F(); if (!f || typeof f.assetV2Read !== 'function'){ getting[assetId] = false; return; }
      stats.get++;
      f.assetV2Read('asset.get', { asset_id: assetId }, function(r, err){
        getting[assetId] = false;
        var type = r && String(r.type || '').split(';')[0].trim().toLowerCase();
        if (err || !r || r.status !== 200 || !r.bytes){ stats.getFail++; getFailed[assetId] = Date.now(); note({ kind: 'GET_FAIL', asset_id: assetId, status: r && r.status, err: err || null }); return schedule(); }
        if (!IMG_TYPES[type]){ stats.badType++; getFailed[assetId] = Date.now(); note({ kind: 'GET_BAD_TYPE', asset_id: assetId, type: type }); return schedule(); }
        var data = toDataUrl(r.bytes, type);
        mem[assetId] = data;
        idbPut({ asset_id: assetId, story_id: String(storyId), type: type, size: r.bytes.byteLength, data: data, t: Date.now() }).then(function(ok){ if (ok) stats.idbPut++; });
        schedule();
      });
    });
  }
  /* desired picture for an identity — never generates */
  function pictureFor(m, ident){
    if (ident.kind !== 'REGISTERED') return { state: 'unreg', src: placeholderImage(ident.label), title: '未登録の話者' };
    var e = entById(m, ident.id) || { name: '?' };
    if (!listed || listed.story_id !== m.story_id) return { state: 'loading', src: placeholderImage(e.name), title: '' };
    if (listed.error) return { state: 'unavail', src: placeholderImage(e.name), title: '画像を読み込めません' };
    var p = listed.by[ident.id];
    if (!p) return { state: 'none', src: placeholderImage(e.name), title: 'まだ絵がありません' };
    if (mem[p.asset_id]){ stats.memHit++; return { state: 'ok', src: mem[p.asset_id], title: '' }; }
    if (getFailed[p.asset_id]){
      if (Date.now() - getFailed[p.asset_id] > 60000) delete getFailed[p.asset_id];   // re-read later (read only; never generation)
      return { state: 'unavail', src: placeholderImage(e.name), title: '画像を読み込めません' };
    }
    loadAsset(p.asset_id, m.story_id);
    return { state: 'loading', src: placeholderImage(e.name), title: '' };
  }

  /* ---------- DOM ---------- */
  var PORTRAIT_SCOPE = '.v292-dlg-card,.dlg-av,.v292Dfix145-card,.npc-card,.v100-clean';
  function isPortraitImg(img){
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest && img.closest('[data-av2-ui]')) return false;
    var alt = img.getAttribute('alt'); if (!alt || !key(alt)) return false;
    if (img.hasAttribute('data-av2') || img.hasAttribute('data-avpk') || img.hasAttribute('data-av-legacy') || img.hasAttribute('data-av2-cid')) return true;
    var src = img.getAttribute('src') || '';
    if (/image\.pollinations\.ai|api\.dicebear\.com|\/prompt\//.test(src) || img.getAttribute('data-gen') === '1') return true;
    return !!(img.closest && img.closest(PORTRAIT_SCOPE));
  }
  function applyImg(m, img){
    var cid = img.getAttribute('data-av2-cid');
    var ident = null;
    if (cid){ var e = entById(m, cid); ident = e ? { kind: 'REGISTERED', id: e.id, historical: e.status === 'DELETED' } : null; }
    if (!ident) ident = resolveLabel(m, img.getAttribute('alt'));
    var pic = pictureFor(m, ident);
    if (img.getAttribute('src') !== pic.src){ try { img.onerror = null; img.src = pic.src; stats.set++; } catch(e){} }
    if (img.getAttribute('data-av2') !== pic.state) img.setAttribute('data-av2', pic.state);
    if (ident.kind === 'REGISTERED'){ if (img.getAttribute('data-av2-id') !== ident.id) img.setAttribute('data-av2-id', ident.id); }
    else if (img.hasAttribute('data-av2-id')) img.removeAttribute('data-av2-id');
    if (img.hasAttribute('data-avpk')) img.removeAttribute('data-avpk');
    if (pic.title && img.title !== pic.title) img.title = pic.title;
  }

  /* charlist (fix145) cards: own identity + v2 actions; legacy regeneration buttons hidden */
  var MSG = { ok_bind: '呼び名を追加しました', ok_del: '削除しました', BINDING_REBIND: 'その呼び名は別のキャラクターに使われています',
              BAD_BINDING_KEY: 'この呼び名は使えません', AV2_FLAG_OFF: 'この端末ではこの操作はできません', AV2_OFF: 'この端末ではこの操作はできません',
              REGISTRATION_IN_PROGRESS: '保存の確認中です。少し待ってからお試しください', LOCAL_BINDINGS_STALE: '保存が終わってからお試しください',
              LOCAL_NOT_SYNCED: '保存が終わってからお試しください', REBASE_REQUIRED: 'サーバー側の物語が更新されています。内容の確認が必要です',
              CONFLICT: 'サーバー側が更新されていました。もう一度お試しください', NOT_APPLIED: '反映を確認できませんでした。もう一度お試しください',
              BINDING_TO_DELETED: '削除済みのキャラクターには追加できません', HERO_NOT_DELETABLE: '主人公は削除できません', ALREADY_DELETED: '既に削除されています',
              /* ensure_first (GPT 913 Q3) */
              ok_first: '絵を作りました', EXISTS: '既に絵があります', CREATED_CONFIRMED: '絵を作りました', REGISTRATION_BLOCKED: '登録内容が拒否されています。先に名前などを直してください',
              PROFILE_REVIEW_REQUIRED: '外見の情報を確認してから作ってください（下の「外見を設定」）', CANDIDATES_PENDING: '候補の絵があります。候補から選んでください',
              /* ★av2f client (GPT #31-b): empty profile never renders from 「最初の絵を作る」 */
              UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW: '外見の情報が無いので、この操作では絵を作りません。「外見を設定」してから作るか、「新しいデザインを生成（候補のみ）」を使ってください',
              CANDIDATE_CREATED: '候補を1枚作りました（まだ採用していません）。「候補から選ぶ」で確認してください', EXPLICIT_NEW_DRAW_REQUIRED: '明示的な指示が必要です',
              EMPTY_APPEARANCE: '外見の文を入力してください', OWNER_CONFIRM_REQUIRED: '確認が必要です', LOCAL_NOT_SYNCED: '保存が終わってからお試しください', SERVER_NOT_SCHEMA2: 'この物語では使えません',
              REGISTRATION_PENDING: '登録の確認が終わってからお試しください', CHARACTER_DELETED: '削除済みのキャラクターです', UNKNOWN_CHARACTER_ID: 'このキャラクターは登録されていません', ok_profile: '外見を保存しました。「最初の絵を作る」で絵を作れます',
              /* ★cand_sideport_authority R3-1 */ APPLIED_SERVER_MOVED: '保存されましたが、別の端末も更新しています。ページを再読み込みしてください', NOT_CANONICAL_ROW: 'この物語はサーバー側で編集できない状態です（非表示または削除済み）', READBACK_FAIL: '保存結果を確認できませんでした。ページを再読み込みしてください', 'canonical-deleted': 'この物語は削除されています', 'not-canonical': 'この物語はまだサーバーの正本になっていません',
              IN_FLIGHT: '作成中です。少し待ってから確認してください', IN_PROGRESS: '作成中です', LOST_RACE: '別の操作で絵が決まりました',
              BUDGET: '今月の画像生成の上限に達しています', RATE_LIMITED: '少し時間をおいてからお試しください', GENERATION_FAILED: '絵を作れませんでした',
              OUTCOME_UNKNOWN: '結果を確認できませんでした。しばらくしてから表示を確認してください', READ_FAIL: 'サーバーに接続できませんでした',
              ASSET_V2_UNAVAILABLE: 'この物語では使えません', NOT_FOUND: 'この物語では使えません' };
  function msgFor(res, okKey){ if (res && res.ok) return MSG[okKey]; return (res && MSG[res.code]) || 'できませんでした'; }
  /* ★cand_sideport_authority (audit D7 / D3-a): after a side-port write the document must be re-read (fix733 TYPE A: ordinary pushes are held
     until reload). On PERSISTED_EQUALS_READBACK reload once; on any other mirror outcome tell the Owner to reload (the server has the change). */
  function afterSidePort(res, msgEl){
    if (!res || res.noop) return;
    if (!res.ok){ if (res.code === 'APPLIED_SERVER_MOVED' && msgEl) msgEl.textContent = MSG.APPLIED_SERVER_MOVED; return; }
    /* ★R3-3: never reload while a generation is in flight or the composer holds an unsent draft — tell the Owner instead */
    var busy = false; try { var S0 = window.__chronicleGetState ? window.__chronicleGetState('av2ui') : null; busy = !!(S0 && S0.inFlight); var inp = document.getElementById('inp'); if (inp && String(inp.value || '').trim()) busy = true; } catch(e){}
    if (res.mirror === 'PERSISTED_EQUALS_READBACK' && !busy){ if (msgEl) msgEl.textContent = (msgEl.textContent || '') + '（反映のため再読み込みします）'; setTimeout(function(){ try { location.reload(); } catch(e){} }, 1200); return; }
    if (msgEl){ msgEl.textContent = busy ? 'サーバーには保存されました。生成や入力が終わったら、ページを再読み込みしてください' : 'サーバーには保存されました。この端末の表示を揃えるため、ページを再読み込みしてください'; msgEl.title = String(res.mirror || ''); }
  }
  function mkBtn(label, bg){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'background:' + bg + ';border:1px solid #666;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin:4px 6px 0 0;'; return b; }
  function augmentCard(m, card){
    var name = card.getAttribute('data-name') || '';
    var e = cardEntry(m, name);
    /* ensure_first entry state: shown only for a registered, non-DELETED entry whose list is known and has NO pointer; disabled while
       a registration is pending / blocked / conflicting (the card is rebuilt when that state changes) */
    var a0 = A(); var regBusy = !!(a0 && ((a0.pending && a0.pending()) || (a0.blocked && a0.blocked()) || (a0.conflict && a0.conflict())));
    var noPtr = !!(e && listed && listed.story_id === m.story_id && !listed.error && !own(listed.by, e.id));
    var ck = name + '|' + m.story_id + '|' + (e ? e.id : '') + '|' + (noPtr ? 1 : 0) + '|' + (regBusy ? 1 : 0);
    if (card.__av2Key === ck) return;
    card.__av2Key = ck; card.__av2Name = name; card.__av2Story = m.story_id;
    var img = card.querySelector('img[alt]');
    if (e){ card.setAttribute('data-av2-cid', e.id); if (img) img.setAttribute('data-av2-cid', e.id); }
    else { card.removeAttribute('data-av2-cid'); if (img) img.removeAttribute('data-av2-cid'); }
    Array.prototype.forEach.call(card.querySelectorAll('button'), function(b){
      if (/アイコン再生成|外見を作り直す/.test(b.textContent || '')) b.style.display = 'none';        // legacy generation entry points
    });
    var old = card.querySelector('[data-av2-ui="card"]'); if (old) old.parentNode.removeChild(old);
    if (!e) return;
    var box = document.createElement('div'); box.setAttribute('data-av2-ui', 'card'); box.style.cssText = 'margin-top:6px;font-size:11px;color:#bbb;';
    var msg = document.createElement('span'); msg.style.cssText = 'margin-left:4px;color:#e0c080;';
    var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = '呼び名'; inp.maxLength = 80;
    inp.style.cssText = 'width:8em;background:#1a1a22;border:1px solid #555;color:#eee;padding:3px 6px;border-radius:4px;font-size:11px;';
    inp.onclick = function(ev){ ev.stopPropagation(); };
    var addB = mkBtn('呼び名を追加', '#3a4a6a');
    addB.onclick = function(ev){ ev.stopPropagation(); var v = inp.value; if (!key(v)) return;
      addB.disabled = true; msg.textContent = '…';
      A().addBinding(v, e.id, function(res){ addB.disabled = false; msg.textContent = msgFor(res, 'ok_bind'); msg.title = (res && res.code) || ''; note({ kind: 'UI_ADD_BINDING', ok: !!(res && res.ok), code: res && res.code }); if (res && res.ok) inp.value = ''; afterSidePort(res, msg); schedule(); }); };
    box.appendChild(inp); box.appendChild(addB);
    var pkB = mkBtn('候補から選ぶ', '#4a4a2a'); pkB.setAttribute('data-av2-pick', '1');          // GPT 917 Q3: minimal candidate picker
    pkB.onclick = function(ev){ ev.stopPropagation(); openPicker(e, name, msg); };
    box.appendChild(pkB);
    if (noPtr){
      var efB = mkBtn('最初の絵を作る', '#3a5a4a'); efB.setAttribute('data-av2-ef', '1');
      if (regBusy){ efB.disabled = true; efB.style.opacity = '.5'; efB.title = '保存の確認が終わるまで使えません'; }
      /* ★av2f client (GPT #31-b): no 「このまま作りますか」 dialog any more — an empty profile is answered by the server with
         UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW (provider call 0) and the card then shows the two explicit ways forward. */
      var runEF = function(){
        efB.disabled = true; msg.textContent = '…';
        A().ensureFirst(e.id, {}, function(res){
          note({ kind: 'UI_ENSURE_FIRST', ok: !!(res && res.ok), code: res && res.code, calls: res && res.calls });
          msg.textContent = (res && res.ok) ? (MSG[res.code] || MSG.ok_first) : msgFor(res); msg.title = (res && res.code) || '';
          if (res && res.ok){ listed = null; card.__av2Key = null; } else efB.disabled = false;
          if (res && !res.ok && (res.code === 'UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW' || res.code === 'PROFILE_REVIEW_REQUIRED')) showProfileTools(true);
          schedule(); });
      };
      efB.onclick = function(ev){ ev.stopPropagation(); if (efB.disabled) return;
        var okc = false; try { okc = window.confirm('「' + name + '」の最初の絵を作ります。\n外見の情報がある場合だけ画像生成を1回使います。よろしいですか？'); } catch(e1){}
        if (!okc) return; runEF(); };
      box.appendChild(efB);
    }
    /* ★av2f client (GPT #31-b): 「外見を設定」 (review suggestion → Owner edits → explicit confirm → setProfile) and
       「新しいデザインを生成（候補のみ）」 (newDraw: explicit_new_draw, candidate only, never adopted). Shown for every registered entry. */
    var tools = null;
    function showProfileTools(open){
      if (tools){ tools.style.display = open ? '' : 'none'; return; }
      if (!open) return;
      tools = document.createElement('div'); tools.setAttribute('data-av2-ui', 'profile'); tools.style.cssText = 'margin-top:6px;padding:6px;border:1px solid #444;border-radius:6px;background:#15151c;';
      tools.onclick = function(ev){ ev.stopPropagation(); };
      var sug = A().suggestAppearance(e.id) || {};
      var ttl = document.createElement('div'); ttl.style.cssText = 'color:#ddd;margin-bottom:4px;'; ttl.textContent = '外見の設定（絵の根拠になる文。保存するまで何も生成しません）'; tools.appendChild(ttl);
      var gsel = document.createElement('select'); gsel.setAttribute('data-av2-prof', 'gender'); gsel.style.cssText = 'background:#1a1a22;color:#eee;border:1px solid #555;border-radius:4px;font-size:11px;margin-right:6px;';
      [['', '性別: 未設定'], ['女性', '性別: 女性'], ['男性', '性別: 男性']].forEach(function(o){ var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; gsel.appendChild(op); });
      gsel.value = (sug.current && sug.current.gender) || sug.gender || '';                    // cast.gender = prefill only (canonical value)
      tools.appendChild(gsel);
      var ta = document.createElement('textarea'); ta.setAttribute('data-av2-prof', 'appearance'); ta.rows = 3; ta.maxLength = 400; ta.placeholder = '例: 黒髪の短髪、細身、灰色の着物、左頬に古い傷';
      ta.style.cssText = 'display:block;width:96%;margin-top:4px;background:#1a1a22;border:1px solid #555;color:#eee;padding:4px;border-radius:4px;font-size:11px;';
      ta.value = (sug.current && sug.current.appearance) || '';                                 // ONLY a previously confirmed appearance is prefilled
      tools.appendChild(ta);
      var refs = [];
      if (sug.desc) refs.push(['設定の説明文（参考）', sug.desc]);
      if (sug.legacy) refs.push(['以前のAIアイコン用の外見文（参考・自動推定なので要確認）', sug.legacy]);
      refs.forEach(function(r){
        var rb = document.createElement('div'); rb.setAttribute('data-av2-prof', 'suggestion'); rb.style.cssText = 'margin-top:4px;color:#aaa;font-size:11px;';
        var lab = document.createElement('div'); lab.textContent = r[0]; rb.appendChild(lab);
        var tx = document.createElement('div'); tx.style.cssText = 'white-space:pre-wrap;color:#999;border-left:2px solid #555;padding-left:6px;'; tx.textContent = r[1]; rb.appendChild(tx);
        var cp = mkBtn('この文を編集欄へ入れる', '#3a3a4a'); cp.setAttribute('data-av2-prof', 'copy');
        cp.onclick = function(ev){ ev.stopPropagation(); ta.value = r[1].slice(0, 400); ta.focus(); };   // Owner action: goes into the EDIT box, never straight to the profile
        rb.appendChild(cp); tools.appendChild(rb);
      });
      var pmsg = document.createElement('span'); pmsg.style.cssText = 'margin-left:4px;color:#e0c080;';
      var okB = mkBtn('この外見で確定', '#3a5a4a'); okB.setAttribute('data-av2-prof', 'confirm');
      okB.onclick = function(ev){ ev.stopPropagation(); if (okB.disabled) return;
        var okc = false; try { okc = window.confirm('「' + name + '」の外見をこの内容で確定します。\n（絵の生成はまだ行いません）'); } catch(e1){}
        if (!okc) return;
        okB.disabled = true; pmsg.textContent = '…';
        A().setProfile(e.id, { gender: gsel.value, appearance: ta.value, ownerConfirmed: true }, function(res){
          note({ kind: 'UI_SET_PROFILE', ok: !!(res && res.ok), code: res && res.code });
          okB.disabled = false; pmsg.textContent = (res && res.ok) ? MSG.ok_profile : msgFor(res); pmsg.title = (res && res.code) || '';
          if (res && res.ok){ msg.textContent = MSG.ok_profile; var efB2 = card.querySelector('[data-av2-ef]'); if (efB2) efB2.disabled = false; afterSidePort(res, pmsg); } });
      };
      tools.appendChild(okB);
      var ndB = mkBtn('新しいデザインを生成（候補のみ）', '#5a3a3a'); ndB.setAttribute('data-av2-nd', '1');
      ndB.onclick = function(ev){ ev.stopPropagation(); if (ndB.disabled) return;
        /* wording follows the CURRENT confirmed profile (re-read: the Owner may have just confirmed one); the flag sent is the same
           explicit_new_draw === true either way — it is the Owner's explicit draw, and the server records grounded / ungrounded itself */
        var now = A().suggestAppearance(e.id) || {}; var hasApp = !!(now.current && now.current.appearance);
        var okc = false; try { okc = window.confirm(hasApp
          ? '「' + name + '」の確定済みの外見をもとに、新しい候補を1枚作ります。\n画像生成を1回使います。候補を作るだけで、絵として採用はしません（採用は「候補から選ぶ」で行います）。よろしいですか？'
          : '「' + name + '」の外見の情報なしで、AIが考えたデザインを候補として1枚作ります。\n画像生成を1回使います。候補を作るだけで、絵として採用はしません（採用は「候補から選ぶ」で行います）。よろしいですか？'); } catch(e1){}
        if (!okc) return;
        ndB.disabled = true; pmsg.textContent = '…';
        A().newDraw(e.id, { ownerExplicit: true }, function(res){
          note({ kind: 'UI_NEW_DRAW', ok: !!(res && res.ok), code: res && res.code, calls: res && res.calls });
          ndB.disabled = false; pmsg.textContent = (res && res.ok) ? MSG.CANDIDATE_CREATED : msgFor(res); pmsg.title = (res && res.code) || '';
          if (res && res.ok) msg.textContent = MSG.CANDIDATE_CREATED;                           // no adopt, no card rebuild: the pointer did not change
        });
      };
      tools.appendChild(ndB); tools.appendChild(pmsg);
      box.appendChild(tools);
    }
    var tgB = mkBtn('外見を設定', '#3a4a5a'); tgB.setAttribute('data-av2-prof', 'toggle');
    tgB.onclick = function(ev){ ev.stopPropagation(); showProfileTools(!tools || tools.style.display === 'none'); };
    box.appendChild(tgB);
    if (!e.hero){
      var delB = mkBtn('削除', '#6a3a3a');
      delB.onclick = function(ev){ ev.stopPropagation();
        var okc = false; try { okc = window.confirm('「' + name + '」を削除します。\n削除すると元に戻せません。過去の会話の表示には残ります。'); } catch(e1){}
        if (!okc) return;
        delB.disabled = true; msg.textContent = '…';
        A().deleteCharacter(e.id, function(res){ delB.disabled = false; msg.textContent = msgFor(res, 'ok_del'); msg.title = (res && res.code) || ''; note({ kind: 'UI_DELETE', ok: !!(res && res.ok), code: res && res.code });
          afterSidePort(res, msg);
          if (res && res.ok && res.mirror !== 'PERSISTED_EQUALS_READBACK'){ try { if (window.__charlist && typeof window.__charlist.open === 'function') setTimeout(function(){ window.__charlist.open(); }, 300); } catch(e2){} } }); };
      box.appendChild(delB);
    }
    box.appendChild(msg);
    var col = card.children[1] || card; col.appendChild(box);
  }

  /* ---------- GPT 917 Q3: candidate picker (explicit adopt → readback → pointer confirmed → display refresh; never re-sent) ---------- */
  var picker = null;
  function closePicker(){ if (picker && picker.parentNode) picker.parentNode.removeChild(picker); picker = null; }
  function thumbInto(assetId, img){
    if (mem[assetId]){ img.src = mem[assetId]; return; }
    var f = F(); if (!f || typeof f.assetV2Read !== 'function') return;
    f.assetV2Read('asset.get', { asset_id: assetId }, function(r){
      var type = r && String(r.type || '').split(';')[0].trim().toLowerCase();
      if (!r || r.status !== 200 || !r.bytes || !IMG_TYPES[type]) return;
      img.src = toDataUrl(r.bytes, type);
    });
  }
  var PMSG = { ADOPTED: 'この絵にしました', ALREADY: '既にこの絵です', ADOPTED_CONFIRMED: 'この絵にしました', CONFLICT: '別の操作で絵が変わっていました。もう一度開いて選んでください',
               NOT_CONFIRMED: '反映を確認できませんでした', OUTCOME_UNKNOWN: '結果を確認できませんでした', READ_FAIL: 'サーバーに接続できませんでした', IN_PROGRESS: '処理中です',
               AV2_FLAG_OFF: 'この端末ではこの操作はできません', AV2_OFF: 'この端末ではこの操作はできません', REGISTRATION_IN_PROGRESS: '保存の確認中です。少し待ってからお試しください',
               REGISTRATION_BLOCKED: '登録内容が拒否されています。先に名前などを直してください', REBASE_REQUIRED: 'サーバー側の物語が更新されています。内容の確認が必要です' };
  function openPicker(e, name, cardMsg){
    closePicker();
    picker = document.createElement('div'); picker.setAttribute('data-av2-ui', 'picker'); picker.id = 'v292Dav2-picker';
    picker.style.cssText = 'position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:2147483002;width:min(92vw,460px);max-height:76vh;overflow:auto;background:#16161e;color:#eee;border:1px solid #806040;border-radius:10px;padding:12px;font-size:13px;box-shadow:0 4px 24px rgba(0,0,0,.6);';
    picker.onclick = function(ev){ ev.stopPropagation(); };
    var x = mkBtn('閉じる', '#444'); x.style.float = 'right'; x.onclick = closePicker; picker.appendChild(x);
    var h = document.createElement('div'); h.style.cssText = 'font-weight:bold;margin-bottom:6px;'; h.textContent = '「' + name + '」の候補'; picker.appendChild(h);
    var st = document.createElement('div'); st.setAttribute('data-av2-pick', 'msg'); st.style.cssText = 'color:#e0c080;margin:4px 0;'; st.textContent = '読み込み中…'; picker.appendChild(st);
    var list = document.createElement('div'); picker.appendChild(list);
    (document.body || document.documentElement).appendChild(picker);
    A().listCandidates(e.id, function(res){
      if (!picker) return;
      if (!res || !res.ok){ st.textContent = (res && PMSG[res.code]) || 'できませんでした'; return; }
      st.textContent = res.items.length ? '' : '候補はありません';
      var mk = function(assetId, current){
        var cell = document.createElement('span'); cell.setAttribute('data-av2-pick-item', assetId); cell.setAttribute('data-current', current ? '1' : '0');
        cell.style.cssText = 'display:inline-block;margin:6px 10px 0 0;text-align:center;vertical-align:top;';
        var im = document.createElement('img'); im.alt = ''; im.setAttribute('data-av2-ui', 'thumb'); im.style.cssText = 'width:72px;height:72px;border-radius:8px;background:#333;display:block;' + (current ? 'outline:2px solid #e0c080;' : '');
        thumbInto(assetId, im); cell.appendChild(im);
        if (current){ var lb = document.createElement('div'); lb.textContent = '採用中'; lb.style.cssText = 'font-size:11px;color:#e0c080;'; cell.appendChild(lb); }
        else {
          var b = mkBtn('この絵にする', '#5a4a2a'); b.setAttribute('data-av2-pick', 'adopt');
          b.onclick = function(){ Array.prototype.forEach.call(list.querySelectorAll('button'), function(z){ z.disabled = true; }); st.textContent = '…';
            A().adoptCandidate(e.id, assetId, function(r){
              note({ kind: 'UI_PICK_ADOPT', ok: !!(r && r.ok), code: r && r.code });
              st.textContent = (r && PMSG[r.code]) || (r && r.ok ? 'この絵にしました' : 'できませんでした');
              if (r && r.ok){ listed = null; Array.prototype.forEach.call(document.querySelectorAll('.v292Dfix145-card'), function(c){ c.__av2Key = null; }); schedule(); if (cardMsg) cardMsg.textContent = st.textContent; setTimeout(closePicker, 600); }
              /* not ok: no automatic re-send (a stale rev stays stale until the Owner opens the picker again) */
            }); };
          cell.appendChild(b);
        }
        list.appendChild(cell);
      };
      if (res.current) mk(res.current.asset_id, true);
      res.items.forEach(function(it){ mk(it.asset_id, false); });
    });
  }

  /* pending / blocked / conflict — three states never mixed; internal codes are not shown */
  var chip = null;
  function statusText(){
    var a = A(); if (!a) return null;
    var c = a.conflict ? a.conflict() : null, b = a.blocked ? a.blocked() : null, p = a.pending ? a.pending() : null;
    if (c) return { k: 'conflict', t: 'サーバー側の物語が更新されています。内容の確認が必要です' };
    if (b && b.reason === 'EMPTY_NAME') return { k: 'blocked', t: '名前のない登場人物があります。名前を入力するとクラウドに登録されます' };   /* ★fixBND */
    if (b) return { k: 'blocked', t: 'この登録内容は拒否されています。名前などを変更してください' + (b.key ? '（「' + b.key + '」は既に使われている名前です）' : '') };
    if (p) return (p.polls || 0) >= 5 ? { k: 'pending_stalled', t: '保存状態を確定できません。この物語では操作を続けず、内容を確認してください' } : { k: 'pending', t: '保存結果を確認しています' };   /* F-FZ1 / GPT: a permanent pending is an explicit stop, not a silent 「確認中」 */
    return null;
  }
  function renderChip(on){
    var st = on ? statusText() : null;
    if (!st){ if (chip && chip.parentNode) chip.parentNode.removeChild(chip); chip = null; return; }
    if (!chip){
      chip = document.createElement('div'); chip.setAttribute('data-av2-ui', 'status'); chip.id = 'v292Dav2-status';
      chip.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;max-width:min(92vw,420px);background:rgba(30,30,40,.94);color:#f0e0c0;border:1px solid #806040;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.4);';
      (document.body || document.documentElement).appendChild(chip);
    }
    if (chip.getAttribute('data-k') === st.k && chip.__t === st.t) return;
    chip.setAttribute('data-k', st.k); chip.__t = st.t; chip.textContent = st.t;
    if (st.k === 'pending_stalled'){
      var rb = mkBtn('もう一度確認する', '#3a4a6a');                       // explicit readback only (never a write)
      rb.onclick = function(ev){ ev.stopPropagation(); try { A().reconcile(); } catch(e){} };
      chip.appendChild(document.createElement('br')); chip.appendChild(rb);
    }
  }

  /* ---------- legacy AI-prompt avatar path (features.js fix118, opt-in) — wrapped, not edited ---------- */
  var wrapped118 = false;
  function wrap118(){
    var o = window.__aiAvatar; if (wrapped118 || !o || o.__av2wrapped) return wrapped118;
    var en = o.enabled, uf = o.urlFor, ra = o.refreshAll, rg = o.regen;
    if (typeof en === 'function') o.enabled = function(){ if (doc() === true) return false; return en.apply(this, arguments); };
    if (typeof uf === 'function') o.urlFor = function(name, fallbackUrl){ if (doc() !== false) return fallbackUrl; return uf.apply(this, arguments); };
    if (typeof ra === 'function') o.refreshAll = function(){ if (doc() === true) return; return ra.apply(this, arguments); };
    if (typeof rg === 'function') o.regen = function(){ if (doc() !== false) return; return rg.apply(this, arguments); };
    o.__av2wrapped = true; wrapped118 = true; return true;
  }

  /* ---------- sweep ---------- */
  var pendingSweep = false, lastDoc = null;
  function schedule(){ if (pendingSweep) return; pendingSweep = true; setTimeout(function(){ pendingSweep = false; sweep(); }, 40); }
  function sweep(){
    wrap118();
    if (killed()) return;
    var d = doc();
    if (d !== lastDoc){ lastDoc = d; note({ kind: 'DOC', schema2: d }); }
    if (d !== true){ renderChip(d === false); return; }   /* ★av2d: a prepared (S9a, still schema 1) story registers ids too → its pending / blocked / conflict reason is shown; only per-story records exist, so a plain legacy story shows nothing */
    var m = model(); if (!m) return;
    stats.sweeps++;
    if (wantList(m)) fetchList(m);
    try {
      var cards = document.querySelectorAll('.v292Dfix145-card');
      for (var c = 0; c < cards.length; c++) augmentCard(m, cards[c]);
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) if (isPortraitImg(imgs[i])) applyImg(m, imgs[i]);
    } catch(e){ note({ kind: 'SWEEP_THREW', e: String(e).slice(0, 80) }); }
    renderChip(true);
  }
  function start(){
    try {
      var mo = new MutationObserver(function(muts){
        if (doc() !== true || killed()) return;
        for (var i = 0; i < muts.length; i++){ var mu = muts[i];
          if (mu.type === 'childList' && mu.addedNodes && mu.addedNodes.length){ schedule(); return; }
          if (mu.type === 'attributes' && mu.target && mu.target.tagName === 'IMG' && isPortraitImg(mu.target)){ schedule(); return; } }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt'] });
    } catch(e){}
    setInterval(sweep, 1200);
    sweep();
  }
  window.__chronicleAv2Portrait = {
    status: function(){ return { doc: doc(), killed: killed(), storyId: sid(), listed: listed ? { story_id: listed.story_id, at: listed.at, error: listed.error, n: Object.keys(listed.by || {}).length } : null,
                                 mem: Object.keys(mem).length, stats: JSON.parse(JSON.stringify(stats)), wrapped118: wrapped118, log: LOG.slice(-20) }; },
    refresh: function(){ listed = null; getFailed = {}; schedule(); return true; },
    resolve: function(label){ var m = model(); return m ? resolveLabel(m, label) : null; },
    placeholderImage: placeholderImage
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
