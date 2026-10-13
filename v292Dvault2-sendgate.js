/* ============================================================================
 * v292Dvault2-sendgate — Vault v2 ExternalSendGate (lane B OFFLINE CANDIDATE r2, NOT FOR DEPLOY)
 * GPT VAULT_V2_LANEB_20260930_02 Q10 / _03 Q13 / _04 Q19 / _05 Q21 Q23 Q25: STORY_DERIVED_EXTERNAL_SEND
 *   - cached VISIBLE never authorises an external send
 *   - proxy paths (/, /openrouter.ai, /image, /inspect, /avatar-inspect): attach body.chrStoryId so the
 *     worker checks CURRENT visibility per request (worker vault2SendGate)
 *   - direct third-party sends (fetch / XHR / DOM <img>): fresh probe (op vault2visible) right before the send;
 *     hidden / unknown / probe failure => send 0
 *   - r2 (_05 Q21): '__none__' ONLY from a document proven non-story (HOME). A story document whose story id
 *     cannot be resolved sends NOTHING to third parties unless a fresh probe says the account has no vault; the
 *     proxy request then carries NO chrStoryId, so the worker refuses it (409) for any vault account.
 *   - r2 (_05 addendum): third-party CSS url() is ALWAYS stripped synchronously (style Proxy + setters + CSSOM +
 *     observer backstop). It is re-applied only when a fresh probe answers "this account has no vault" — so for a
 *     vault account no third-party CSS image is ever fetched, visible story or not (no observer / forced-layout race).
 *   - r2 (_05 Q25): input retention. A send blocked by this gate leaves: provider 0 / turn 0 / save 0 /
 *     input exactly as typed / busy released / automatic retry 0 (in-client latch) / one neutral notice.
 *   - on a definitive negative (hidden, or HOME of a vault account): document kill (CSP meta + fail-fast).
 *     Unknown / probe failure blocks the send but does not kill (the user can send again).
 *   - r4 (_07 Q33): build mode V2_CLIENT_MODE. 'compat' = PRE_ACTIVATION_COMPAT_ONLY (a worker's explicit bad-op counts as
 *     'no vault', so the gate can ship before the worker flag); 'strict' = bad-op is no answer (send 0). ARM only with strict.
 *   - r3 (_06 Q27): the kill event carries the story id when known, so CopyGate learns it synchronously.
 *   - Q28 (_06): 'no vault' is ONLY an explicit hasVault:false from a fresh vault2visible answer (or the explicit
 *     bad-op answer of a worker without vault2, where no vault can exist and the worker does not gate).
 *     Probe failure / timeout / malformed answer => not answered => send 0.
 * Load position: the FIRST script in <head> (before fix654 / fix893) so every later wrapper wraps this one.
 * Kill (QA only): localStorage v292Dvault2GateOff='1'.
 * SG-H1 (2026-10-11, Session A, GPT #125-CR part 1 = OPTION_A): minimal rebase onto production hr1 + CopyGate AB7.
 *   - principal: the document's account is learned once (an /auth/me answer that passes through this layer, or one
 *     own /auth/me call) and every probe carries expectAcct (worker OG2: 409 VAULT2_PRINCIPAL_MISMATCH). A different
 *     account later in the same document, a probe answer for another acct, or a mismatch => send 0 (shut).
 *   - staleness: a probe answer is used only if the document identity, the account and the gate generation (kill /
 *     account change / chr:vault2-blocked) are unchanged since the probe started; an in-flight probe is shared only
 *     for 1 s. A send already handed to the network cannot be recalled (not claimed).
 *   - no other behaviour change (proxy chrStoryId, direct fresh probe, HOME '__none__', K4/K5/K6 as r2/r4).
 * SG-H2 (2026-10-11, GPT #125-CS S7): every proxy send also states the document account (chrExpectAcct); worker OG3
 *   refuses it before provider work when the session account differs (another tab switched the login), vault or not.
 *   A story document whose account is not yet known waits for it (one /auth/me); unknown and not anonymous => send 0.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__v292Dvault2Gate) return;
  var LS = null; try { LS = window.localStorage; } catch (e) {}
  function lsGet(k) { try { return LS ? Storage.prototype.getItem.call(LS, k) : null; } catch (e) { return null; } }
  if (lsGet('v292Dvault2GateOff') === '1') return;

  var V2_CLIENT_MODE = 'strict';   /* build constant: 'compat' (PRE_ACTIVATION_COMPAT_ONLY) | 'strict' (ships with ARM) */
  var WORKER = 'https://novel-proxy.sansan2103.workers.dev';
  var SEND_PATHS = { '/': 1, '/openrouter.ai': 1, '/image': 1, '/inspect': 1, '/avatar-inspect': 1 };
  var THIRD_PARTY = /^(https?:)?\/\/([a-z0-9-]+\.)*(anthropic\.com|openrouter\.ai|pollinations\.ai|together\.xyz|together\.ai|fireworks\.ai|googleapis\.com\/v1beta)(\/|$|:)/i;
  var TP_HINT = /pollinations|anthropic|openrouter|together|fireworks|googleapis/i;
  var HOME = '__home__';
  var nativeFetch = window.fetch.bind(window);
  var XO = XMLHttpRequest.prototype.open, XSend = XMLHttpRequest.prototype.send;
  var imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  var imgSrcsetDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'srcset');
  var setAttr = Element.prototype.setAttribute;
  var getAttr = Element.prototype.getAttribute;
  var innerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  var outerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  var insAdj = Element.prototype.insertAdjacentHTML;
  var styleSetProp = CSSStyleDeclaration.prototype.setProperty;
  var tcDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  var insRule = CSSStyleSheet.prototype.insertRule, repSync = CSSStyleSheet.prototype.replaceSync, rep = CSSStyleSheet.prototype.replace;

  var gen = 0; var acct = { doc: null, anon: false, mismatch: false, learning: null };
  var st = { killed: false, probes: 0, allowed: 0, denied: 0, heldImgs: 0, heldCss: 0, cssReapplied: 0, blockSeq: 0, latched: false, inSubmit: 0, restored: 0, log: [] };
  function note(k, d) { try { st.log.push([Date.now(), k, d]); if (st.log.length > 200) st.log.shift(); } catch (e) {} }

  /* ---- document identity. HOME only when proven by the path; everything else is a story document (fail-closed) ---- */
  function docKind() { try { return /\/home(\.html)?$/i.test(location.pathname) ? 'home' : 'story'; } catch (e) { return 'story'; } }
  function storyId() {
    try {
      var k = window.__chronicleDocumentStoryKey;
      if (typeof k === 'string') { if (k === 'chr6') return 'default'; if (k.indexOf('chr6_slot_') === 0) return k.slice(10); }
      var q = new URL(location.href).searchParams.get('story');
      if (q && /^[A-Za-z0-9_-]{1,80}$/.test(q)) return q;
    } catch (e) {}
    return null;
  }
  /* send identity: HOME => '__none__'; story document => its id, or null (= unresolved, fail-closed) */
  function sendIdentity() { return docKind() === 'home' ? '__none__' : storyId(); }
  function onPagesDev() { try { return location.protocol === 'https:' && /\.pages\.dev$/.test(location.hostname); } catch (e) { return false; } }
  function proxyPath(url) {
    var s = String(url || '');
    try {
      var u = new URL(s, location.href);
      if (u.origin === location.origin && u.pathname.indexOf('/api/') === 0) return u.pathname.slice(4) || '/';
      if (s.indexOf(WORKER) === 0) return u.pathname || '/';
    } catch (e) {}
    return null;
  }
  function isThirdParty(url) { return THIRD_PARTY.test(String(url || '')); }

  /* ---- document kill: CSP meta (browser-enforced for every later load path) + fail-fast ---- */
  /* sid: the story this kill is about when known (the document story / the id the refused request carried).
     r3 (_06 Q27): CopyGate adds it to its hidden set synchronously on this event. */
  function kill(reason, sid) {
    if (st.killed) return; st.killed = true; gen++; note('kill', reason);
    try {
      var m = document.createElement('meta');
      m.httpEquiv = 'Content-Security-Policy';
      m.content = "img-src 'self' data: blob: " + WORKER + "; connect-src 'self' " + WORKER + "; media-src 'self' data: blob:";
      (document.head || document.documentElement).appendChild(m);
    } catch (e) {}
    var known = (typeof sid === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(sid) && sid !== '__none__') ? sid : null;
    try { window.dispatchEvent(new CustomEvent('chr:vault2-blocked', { detail: { kind: 'kill', storyId: known } })); } catch (e) {}
  }
  /* a blocked send: counts, latches (no automatic retry reaches the network until the current submit ends) */
  var latchTimer = null;
  function markBlocked(reason) {
    st.blockSeq++; st.latched = true; note('blocked', reason);
    if (!st.inSubmit) { try { clearTimeout(latchTimer); } catch (e) {} latchTimer = setTimeout(function () { if (!st.inSubmit) st.latched = false; }, 4000); }
  }
  function blockedErr(reason) { markBlocked(reason); return new TypeError('send-blocked'); }
  function stopNow(reason) { return Promise.reject(blockedErr(reason)); }
  /* a refused send answers like the worker's own refusal: a definitive 4xx (never a network error / 5xx that the
     app would retry). No network is used. */
  function refusal(reason) {
    markBlocked(reason);
    return new Response(JSON.stringify({ ok: false, error: 'いまは送信できません', errorCode: 'SEND_BLOCKED', vault2Send: true, retryable: false }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }
  function shut() { return st.killed || st.latched || acct.mismatch; }
  /* SG-H1 principal: learn the document account once; a different one later in this document shuts all sends */
  function learnAcct(j, status) {
    try {
      if (j && j.accountId) { var a = String(j.accountId); if (acct.doc === null || acct.anon) { acct.doc = a; acct.anon = false; } else if (acct.doc !== a) { acct.mismatch = true; gen++; note('acct-switch', 'me'); } }
      else if (status === 401 && acct.doc === null) acct.anon = true;
    } catch (e) {}
  }
  function ensureAcct() {
    if (acct.doc !== null || acct.anon) return Promise.resolve(acct.doc);
    if (acct.learning) return acct.learning;
    var url = onPagesDev() ? '/api/auth/me' : WORKER + '/auth/me';
    acct.learning = nativeFetch(url, { method: 'GET', credentials: 'same-origin', headers: { 'x-chronicle-csrf': '1' } })
      .then(function (r) { return r.json().then(function (j) { learnAcct(j, r.status); }, function () { learnAcct(null, r.status); }); }, function () {})
      .then(function () { acct.learning = null; return acct.doc; });
    return acct.learning;
  }
  try { window.addEventListener('chr:vault2-blocked', function () { gen++; }); } catch (e) {}

  /* ---- fresh probe (SG-H2b, #125-CU): a send may only use a probe whose network request is dispatched AFTER that send
   *      was requested. Requests made before the batch's probe request leaves join it; once it has been sent, any new
   *      request starts a new probe. A finished or already-sent answer is never reused for a later request. ---- */
  var pend = {};
  function probe(ident) {
    var key = ident === '__none__' || ident == null ? HOME : ident;
    var b = pend[key];
    if (b && !b.sent) return b.p;
    b = { sent: false }; pend[key] = b;
    b.p = ensureAcct().then(function () { return new Promise(function (r) { setTimeout(r, 0); }); }).then(function () {
      b.sent = true; if (pend[key] === b) delete pend[key];
      return probeNow(key);
    });
    return b.p;
  }
  function probeNow(key) {
    if (acct.mismatch || (acct.doc === null && !acct.anon)) return Promise.resolve({ answered: false });
    st.probes++;
    var url = onPagesDev() ? '/api/save' : WORKER + '/save';
    var headers = { 'Content-Type': 'application/json' };
    if (onPagesDev()) headers['x-chronicle-csrf'] = '1';
    var ids = key === HOME ? [] : [key];
    var ac = null, to = null; try { ac = new AbortController(); to = setTimeout(function () { try { ac.abort(); } catch (e) {} }, 8000); } catch (e) {}   // timeout => not answered => send 0
    var pb = { op: 'vault2visible', ids: ids }; if (acct.doc) pb.expectAcct = acct.doc;
    var p = nativeFetch(url, { method: 'POST', credentials: 'same-origin', headers: headers, body: JSON.stringify(pb), signal: ac ? ac.signal : undefined })
      .then(function (r) {
        if (r.status === 400) return r.json().then(function (j) { return (V2_CLIENT_MODE === 'compat' && j && j.errorCode === 'bad-op') ? { answered: true, hasVault: false, visible: true } : { answered: false }; }, function () { return { answered: false }; });   // strict: bad-op = no answer
        if (!r.ok) return { answered: false };
        return r.json().then(function (j) {
          if (!(j && j.ok && Array.isArray(j.visible))) return { answered: false };
          if (acct.doc && j.acct !== undefined && String(j.acct) !== acct.doc) { acct.mismatch = true; gen++; note('acct-switch', 'probe'); return { answered: false }; }
          return { answered: true, hasVault: j.hasVault === true, visible: key !== HOME && j.visible.indexOf(key) >= 0 };
        }, function () { return { answered: false }; });
      }, function () { return { answered: false }; })
      .then(function (a) { try { clearTimeout(to); } catch (e) {} return a; });
    return p;
  }
  /* send decision. HOME / unresolved story id: only "no vault"; a story id: visible now */
  function decide(ident, a) {
    var ok = !!(a && a.answered) && ((ident === '__none__' || ident == null) ? a.hasVault === false : a.visible === true);
    if (ok) st.allowed++; else {
      st.denied++;
      if (a && a.answered && a.hasVault === true) kill(ident === '__none__' ? 'home-vault-account' : ident == null ? 'unresolved-story-vault-account' : 'probe-negative', ident);
    }
    return ok;
  }
  function gatedDirect(reason) { var ident = sendIdentity(), g0 = gen; return probe(ident).then(function (a) { if (gen !== g0 || sendIdentity() !== ident || acct.mismatch) { st.denied++; note('blocked', 'stale-answer'); return false; } return decide(ident, a); }); }

  /* ---- proxy response: vault2 send-gate refusals become a neutral non-retryable error (never "HTTP 5xx") ---- */
  function inspectProxy(r, sid) {
    if (r.status !== 409 && r.status !== 503) return r;
    return r.clone().json().then(function (j) {
      if (j && j.vault2Send === true) {
        if (j.errorCode === 'STORY_UNAVAILABLE') kill('proxy-STORY_UNAVAILABLE', sid);
        return refusal('proxy-' + j.errorCode);          // 503 (state unknown) is also answered as a definitive 409
      }
      return r;
    }, function () { return r; });
  }
  function withStoryId(body, sid) {
    try { var b = JSON.parse(body); if (b && typeof b === 'object' && !Array.isArray(b)) { if (sid !== undefined) b.chrStoryId = sid; else delete b.chrStoryId; if (acct.doc) b.chrExpectAcct = acct.doc; else delete b.chrExpectAcct; return JSON.stringify(b); } } catch (e) {}
    return body;
  }
  /* SG-H2: the document account must be known (or the session proven anonymous) before a proxy send */
  function acctReady() { return ensureAcct().then(function () { return !acct.mismatch && (acct.doc !== null || acct.anon); }); }

  /* ---- K1 fetch ---- */
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
    var pp = proxyPath(url);
    if (pp !== null && SEND_PATHS[pp] && init && typeof init.body === 'string') {
      if (shut()) return Promise.resolve(refusal('shut-proxy' + pp));
      var ident = sendIdentity();
      if (ident === null) {       // story document, id unresolved: send only after a fresh "no vault", and WITHOUT chrStoryId
        return probe(null).then(function (a) {
          if (!decide(null, a)) return refusal('unresolved-story-id');
          return nativeFetch(input, Object.assign({}, init, { body: withStoryId(init.body, undefined) })).then(inspectProxy);
        });
      }
      return acctReady().then(function (ok) {
        if (!ok) return refusal('proxy-acct-unknown');
        return nativeFetch(input, Object.assign({}, init, { body: withStoryId(init.body, ident) })).then(function (r) { return inspectProxy(r, ident); });
      });
    }
    if (isThirdParty(url)) {
      if (shut()) return stopNow('shut-direct');
      return gatedDirect().then(function (ok) { if (ok) return nativeFetch(input, init); throw blockedErr('probe-negative'); });
    }
    var res = nativeFetch(input, init);
    if (pp === '/auth/me') res.then(function (r) { r.clone().json().then(function (j) { learnAcct(j, r.status); }, function () { learnAcct(null, r.status); }); }).catch(function () {});
    if (pp === '/save') {    // a story write refused as hidden => kill further external sends immediately
      var wid = null; try { var wb = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; wid = wb && (wb.id || wb.slotId) || null; } catch (e) {}
      res.then(function (r) { if (r.status === 409) r.clone().json().then(function (j) { if (j && j.errorCode === 'STORY_UNAVAILABLE') kill('save-409', wid); }).catch(function () {}); }).catch(function () {});
    }
    return res;
  };

  /* ---- K2 XHR ---- */
  function xhrFail(xhr, reason) { markBlocked(reason); setTimeout(function () { try { xhr.dispatchEvent(new Event('error')); xhr.dispatchEvent(new Event('loadend')); } catch (e) {} }, 0); }
  XMLHttpRequest.prototype.open = function (method, url) { this.__v2url = String(url || ''); return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this, url = this.__v2url || '', pp = proxyPath(url);
    if (pp !== null && SEND_PATHS[pp] && typeof body === 'string') {
      if (shut()) return xhrFail(xhr, 'shut-xhr-proxy');
      var ident = sendIdentity();
      try { xhr.addEventListener('load', function () { try { if ((xhr.status === 409 || xhr.status === 503) && /"vault2Send":true/.test(xhr.responseText || '')) { if (/STORY_UNAVAILABLE/.test(xhr.responseText)) kill('xhr-proxy-409', ident); markBlocked('xhr-proxy-' + xhr.status); } } catch (e) {} }); } catch (e) {}
      if (ident === null) {
        probe(null).then(function (a) { if (decide(null, a)) XSend.call(xhr, withStoryId(body, undefined)); else xhrFail(xhr, 'xhr-unresolved-story-id'); });
        return;
      }
      acctReady().then(function (ok) { if (ok) XSend.call(xhr, withStoryId(body, ident)); else xhrFail(xhr, 'xhr-proxy-acct-unknown'); });
      return;
    }
    if (isThirdParty(url)) {
      if (shut()) return xhrFail(xhr, 'shut-xhr-direct');
      gatedDirect().then(function (ok) { if (ok) XSend.call(xhr, body); else xhrFail(xhr, 'xhr-probe-negative'); });
      return;
    }
    return XSend.apply(xhr, arguments);
  };

  /* ---- K4 DOM image loads (<img>): placeholder, fresh probe, original only on a positive answer ---- */
  var PH = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  function gateImg(el, value, set) {
    if (!isThirdParty(value)) return set.call(el, value);
    if (st.killed) { note('blocked', 'img-killed'); return set.call(el, PH); }
    st.heldImgs++;
    set.call(el, PH);
    try { setAttr.call(el, 'data-v2-held', '1'); } catch (e) {}
    gatedDirect().then(function (ok) { if (ok && !st.killed) set.call(el, value); else note('blocked', 'img-probe-negative'); });
  }
  if (imgSrcDesc && imgSrcDesc.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: imgSrcDesc.enumerable, get: imgSrcDesc.get, set: function (v) { gateImg(this, String(v), imgSrcDesc.set); } });
  if (imgSrcsetDesc && imgSrcsetDesc.set) Object.defineProperty(HTMLImageElement.prototype, 'srcset', { configurable: true, enumerable: imgSrcsetDesc.enumerable, get: imgSrcsetDesc.get, set: function (v) { if (TP_HINT.test(String(v))) { note('blocked', 'srcset-third-party'); return; } imgSrcsetDesc.set.call(this, v); } });

  /* ---- K5 CSS: third-party url() never reaches the style engine for a vault account ---- */
  var URL_RE = /url\(\s*(["']?)([^)"']+)\1\s*\)/gi;
  function hasTpCss(v) { var m, re = new RegExp(URL_RE.source, 'gi'); v = String(v); while ((m = re.exec(v))) if (isThirdParty(m[2])) return true; return false; }
  function stripCss(v) { return String(v).replace(new RegExp(URL_RE.source, 'gi'), function (m, q, u) { return isThirdParty(u) ? 'none' : m; }); }
  var bypass = false;
  function tpUrls(v) { var m, out = [], re = new RegExp(URL_RE.source, 'gi'); v = String(v); while ((m = re.exec(v))) if (isThirdParty(m[2])) out.push(m[2]); return out; }
  var approved = Object.create(null);   /* url -> count: re-applied after a fresh "no vault"; consumed once by the observer */
  /* re-apply after a fresh "no vault" answer (non-vault accounts keep their background art) */
  function heldCss(v, apply, why) {
    st.heldCss++; note('held', why);
    if (st.killed) return;
    var ident = sendIdentity();
    probe(ident).then(function (a) {
      if (a && a.answered && a.hasVault === false && !st.killed) {
        tpUrls(v).forEach(function (u) { approved[u] = (approved[u] || 0) + 1; });
        bypass = true; try { apply(); st.cssReapplied++; } finally { bypass = false; }
      }
      else note('blocked', 'css-' + why);          // vault account (visible or not) / unknown: stays stripped
    });
  }
  /* style Proxy: el.style.backgroundImage = 'url(...)' (Chromium: named-property interceptor, no accessor to hook) */
  var proxies = new WeakMap();
  function styleProxy(el, real) {
    var p = proxies.get(real); if (p) return p;
    p = new Proxy(real, {
      get: function (t, k) { var v = t[k]; return (typeof v === 'function') ? v.bind(t) : v; },
      set: function (t, k, v) {
        if (!bypass && typeof v === 'string' && hasTpCss(v)) { t[k] = stripCss(v); heldCss(v, function () { t[k] = v; }, 'style.' + String(k)); return true; }
        t[k] = v; return true;
      }
    });
    proxies.set(real, p); return p;
  }
  [HTMLElement.prototype, SVGElement.prototype, (typeof MathMLElement !== 'undefined' ? MathMLElement.prototype : null)].forEach(function (proto) {
    if (!proto) return; var d = Object.getOwnPropertyDescriptor(proto, 'style'); if (!d || !d.get) return;
    Object.defineProperty(proto, 'style', { configurable: true, enumerable: d.enumerable,
      get: function () { var real = d.get.call(this); return real ? styleProxy(this, real) : real; },
      set: function (v) { var el = this; if (!bypass && v != null && hasTpCss(v)) { d.set.call(el, stripCss(v)); heldCss(v, function () { d.set.call(el, v); }, 'style='); return; } d.set.call(el, v); } });
  });
  CSSStyleDeclaration.prototype.setProperty = function (p, v) {
    var t = this, a = arguments;
    if (!bypass && v != null && hasTpCss(v)) { styleSetProp.call(t, p, stripCss(v), a[2]); heldCss(v, function () { styleSetProp.call(t, p, v, a[2]); }, 'setProperty'); return; }
    return styleSetProp.apply(t, a);
  };
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase(), el = this;
    if (el instanceof HTMLImageElement && n === 'src') return gateImg(el, String(value), function (v) { setAttr.call(this, 'src', v); });
    if (el instanceof HTMLImageElement && n === 'srcset' && TP_HINT.test(String(value))) { note('blocked', 'srcset-attr'); return; }
    if (n === 'style' && !bypass && hasTpCss(value)) { setAttr.call(el, name, stripCss(value)); heldCss(value, function () { setAttr.call(el, 'style', value); }, 'style-attr'); return; }
    return setAttr.apply(el, arguments);
  };
  /* stylesheets: CSSOM and <style> text */
  CSSStyleSheet.prototype.insertRule = function (rule, idx) { if (hasTpCss(rule)) { note('blocked', 'insertRule'); st.heldCss++; return insRule.call(this, stripCss(rule), idx); } return insRule.apply(this, arguments); };
  if (repSync) CSSStyleSheet.prototype.replaceSync = function (t) { return repSync.call(this, hasTpCss(t) ? stripCss(t) : t); };
  if (rep) CSSStyleSheet.prototype.replace = function (t) { return rep.call(this, hasTpCss(t) ? stripCss(t) : t); };
  if (tcDesc && tcDesc.set) Object.defineProperty(Node.prototype, 'textContent', { configurable: true, enumerable: tcDesc.enumerable, get: tcDesc.get, set: function (v) { if (this instanceof HTMLStyleElement && v != null && hasTpCss(v)) { note('blocked', 'style-text'); st.heldCss++; return tcDesc.set.call(this, stripCss(v)); } return tcDesc.set.call(this, v); } });
  /* HTML strings: third-party <img src> become data-v2-src and are re-applied through the gated setter; url() stripped */
  var IMG_RE = /(<img\b[^>]*?\s)(src|srcset)(\s*=\s*)(["'])([^"']*)\4/gi;
  function rewriteHtml(html) {
    return String(html).replace(IMG_RE, function (m, pre, attr, eq, q, url) { return isThirdParty(url) ? pre + 'data-v2-' + attr + eq + q + url + q : m; })
      .replace(new RegExp(URL_RE.source, 'gi'), function (m, q, u) { return isThirdParty(u) ? 'none' : m; });
  }
  function rehydrate(root) {
    try { var list = root.querySelectorAll ? root.querySelectorAll('img[data-v2-src]') : []; for (var i = 0; i < list.length; i++) { var el = list[i], u = getAttr.call(el, 'data-v2-src'); el.removeAttribute('data-v2-src'); el.src = u; } } catch (e) {}
  }
  function wrapHtmlSetter(desc, name) {
    if (!desc || !desc.set) return;
    Object.defineProperty(Element.prototype, name, { configurable: true, enumerable: desc.enumerable, get: desc.get, set: function (v) { var s = String(v); if (TP_HINT.test(s)) { desc.set.call(this, rewriteHtml(s)); rehydrate(name === 'outerHTML' ? (this.parentNode || document) : this); } else desc.set.call(this, v); } });
  }
  wrapHtmlSetter(innerDesc, 'innerHTML'); wrapHtmlSetter(outerDesc, 'outerHTML');
  Element.prototype.insertAdjacentHTML = function (pos, html) { var s = String(html); if (TP_HINT.test(s)) { insAdj.call(this, pos, rewriteHtml(s)); rehydrate(this.parentNode || this); return; } return insAdj.apply(this, arguments); };
  /* backstop: any inline style that still carries a third-party url() (a path not hooked above) */
  function scanStyle(el) {
    try {
      var v = getAttr.call(el, 'style'); if (!v || !hasTpCss(v)) return;
      var us = tpUrls(v);
      if (us.every(function (u) { return approved[u] > 0; })) { us.forEach(function (u) { approved[u]--; }); return; }   // re-applied by us after "no vault"
      setAttr.call(el, 'style', stripCss(v));
      heldCss(v, function () { setAttr.call(el, 'style', v); }, 'observer');
    } catch (e) {}
  }
  try {
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'attributes') scanStyle(r.target);
        else if (r.addedNodes) for (var j = 0; j < r.addedNodes.length; j++) { var n = r.addedNodes[j]; if (n.nodeType === 1) { scanStyle(n); var q = n.querySelectorAll ? n.querySelectorAll('[style*="url("]') : []; for (var k = 0; k < q.length; k++) scanStyle(q[k]); } }
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
  } catch (e) {}

  /* ---- K6 input retention (story documents): wrap G.submit / G.cont / G.retry like fix892 ---- */
  var NOTICE_ID = 'v292Dvault2-notice';
  var COPY = 'いまは送信できませんでした。入力した文はそのまま残しています。';
  function notice() {
    try {
      var n = document.getElementById(NOTICE_ID); if (n) n.parentNode.removeChild(n);
      var d = document.createElement('div'); d.id = NOTICE_ID; setAttr.call(d, 'role', 'status');
      setAttr.call(d, 'style', 'position:fixed;left:0;right:0;bottom:0;z-index:99997;background:#2b3a4a;color:#e3efff;font-size:13px;line-height:1.6;padding:10px 12px;text-align:center;font-family:system-ui,sans-serif;');
      d.appendChild(document.createTextNode(COPY));
      (document.body || document.documentElement).appendChild(d);
      var rm = function () { try { if (d.parentNode) d.parentNode.removeChild(d); } catch (e) {} };
      setTimeout(rm, 20000);
      try { var inp = document.getElementById('inp'); if (inp) inp.addEventListener('input', rm, { once: true }); } catch (e) {}
    } catch (e) {}
  }
  function getG() { try { return (typeof G !== 'undefined' && G) ? G : null; } catch (e) { return null; } }
  function getUI() { try { return (typeof UI !== 'undefined' && UI) ? UI : null; } catch (e) { return null; } }
  var wrapped = false;
  function wrapG() {
    if (wrapped) return true;
    var g = getG(); if (!g) return false;
    ['submit', 'cont', 'retry'].forEach(function (name) {
      var orig = g[name];
      if (typeof orig !== 'function' || orig.__v2g) return;
      var w = async function () {
        if (st.killed) { note('blocked', 'entry-' + name); note('submit-exit', name + ':killed'); notice(); return; }       // nothing starts: input untouched
        /* fail-fast before the turn starts (UX only — the worker stays the authority for every send): a fresh probe
           for vault accounts; a "no vault" answer is trusted for 60 s to spare non-vault accounts a round trip. */
        if (!(st.noVaultUntil > Date.now())) {
          var ident = sendIdentity(), a = await probe(ident);
          if (a && a.answered && a.hasVault === false) st.noVaultUntil = Date.now() + 60000;
          if (a && a.answered && !decide(ident, a)) { note('blocked', 'precheck-' + name); note('submit-exit', name + ':precheck'); notice(); return; }
        }
        var inp = document.getElementById('inp'); var snap = inp ? inp.value : null;
        var seq0 = st.blockSeq; st.inSubmit++; note('submit-enter', name);
        try { return await orig.apply(this, arguments); }
        finally {
          st.inSubmit--; note('submit-exit', name + ':' + (st.blockSeq - seq0) + ':' + (inp ? JSON.stringify(String(inp.value).slice(0, 20)) : 'noinp'));
          if (st.blockSeq !== seq0) {
            try { if (inp && snap != null && String(inp.value).trim() === '') { inp.value = snap; st.restored++; } } catch (e) {}
            try { var ui = getUI(); if (ui && typeof ui.setLoading === 'function') ui.setLoading(false); if (ui && typeof ui.setStatus === 'function') ui.setStatus(COPY, true); } catch (e) {}
            notice();
          }
          if (!st.inSubmit) st.latched = false;
        }
      };
      w.__v2g = true; w.__orig = orig; g[name] = w;
    });
    wrapped = true; return true;
  }
  function entryEl(t) { try { var el = t && t.closest ? t.closest('[onclick]') : null; return (el && /\bG\.(submit|cont|retry)\(/.test(getAttr.call(el, 'onclick') || '')) ? el : null; } catch (e) { return null; } }
  function capBlock(ev) { if (!st.killed) return; try { ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation(); } catch (e) {} note('blocked', 'entry-capture'); notice(); }
  if (docKind() === 'story') {
    try {
      document.addEventListener('click', function (ev) { if (entryEl(ev.target)) capBlock(ev); }, true);
      document.addEventListener('keydown', function (ev) { try { var t = ev.target; if (t && t.id === 'inp' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) capBlock(ev); } catch (e) {} }, true);
      document.addEventListener('DOMContentLoaded', function () { try { wrapG(); } catch (e) {} });
    } catch (e) {}
    var nb = 0; (function boot() { nb++; try { if (wrapG()) return; } catch (e) {} if (nb < 400) setTimeout(boot, nb < 120 ? 100 : 1000); })();
  }

  window.__v292Dvault2Gate = { status: function () { return { mode: V2_CLIENT_MODE, killed: st.killed, latched: st.latched, probes: st.probes, allowed: st.allowed, denied: st.denied, heldImgs: st.heldImgs, heldCss: st.heldCss, cssReapplied: st.cssReapplied, blockSeq: st.blockSeq, restored: st.restored, wrapped: wrapped, gen: gen, acctKnown: acct.doc !== null, acctAnon: acct.anon, acctMismatch: acct.mismatch, build: 'SG-H2b', doc: docKind(), storyId: storyId(), log: st.log.slice(-40) }; }, kill: kill };
})();
