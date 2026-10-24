/* v292DfixE64-save-tap.js（2026-10-24・Lane E6・E6-4 r4・GPT #127-MG ①②・Local only）
 * ─ E64Stop（この物語の続きを止めた印）がある物語の「汚染されたかもしれない state」を Worker へ保存させない、保存の共通の出口 ─
 *
 * 置き場所: index.html は v292DfixCP1-final-tap.js の直後、home.html は v292Dvault2-copygate.js の直後（どちらも fetch のほぼ最内）。
 *   fetch の包みは後から読まれたものほど外側になるので、ここは fix697（putcanonical / putstory）・fix402 / fix399（put / forceput）・
 *   fix702（promotestory）・fix781 の再送・自動同期のタイマーなど、/save へ送るすべての経路が最後に通る（新しい保存の経路は作らない）。
 * 読み込み時に包む条件（それ以外は何もしない＝fetch の包みも global も増えない＝bundle44-b と同じ）:
 *   localStorage に v292DfixE64Stop がある（kill v292DfixE64Off・CP1・Owner かどうかに関係なく）
 *   または v292DfixE64On==='1' かつ v292DfixE64Off!=='1'（E64 を使ってよい状態。E64 本体は、この tap が居ないページでは動かない）。
 * 止めるもの: /save への POST のうち、物語の state を運ぶ op（put / forceput / putstory / putcanonical / promotestory / fork）で、
 *   宛先が Stop の対象（口座 + 物語 id + 端末の正本 key）に当たるもの。
 *     putstory / putcanonical / promotestory / fork … body の id（または slotId）が対象の物語 id。
 *     put / forceput … 送る package（pkg.ls）に対象の物語の端末キーが入っている（package は口座全体の写しなので、
 *       対象の物語の汚れた端末キーを運ぶ。中身を削って送ると削除の伝播になりうるので、削らずに送らない）。
 *   対象が分からない（body が文字列でない・JSON でない・id が無い・印が壊れている・印を端末へ書けなかった）ときは送らない側。
 *   口座: 印に記録した口座と今の口座（__v292Dfix893.serverMe().accountId）が両方分かっていて違うときだけ「別口座」として当てない。
 *   読み出し（get / getstory / listshadow / commitstate / meta など）・画像・シナリオ・削除・題名などは止めない。
 * 止めた送信: fetch を呼ばずに reject（e.code='E64_STOPPED'・e.terminal=true）。呼び出し側は失敗として扱う（成功扱いにしない）。
 *   画面に平易な通知を出す（15 秒に 1 回まで）。
 * 記録: 送った state 書込の時刻と飛行中の数を覚え、Stop のときに印へ「このターンの間に送った数・その時点で飛行中だった数」を残す
 *   （0 でなければ、Stop の前にサーバーの sidecar へ汚れが届いた可能性がある＝復旧のときに確かめる材料）。
 * 診断: window.__v292DfixE64SaveTap = { ver, installed, guard, stats(), targets(), holds(), mark(), stoppedDoc() }（件数・理由・物語 key だけ）
 * ★r5（GPT #127-MI 案 b）: ターンの保留（hold）。E64 が動くターンは、最初の parse の前（begin）からそのターンの終わり（G.submit の finally で呼ぶ end
 *   = ターンの確定〔S.save〕の後、または取りやめ・取消の戻しの後）まで、その物語の state 書込（上と同じ op・同じ判定）を送らない（reject・e.code='E64_HELD'）。
 *   送らなかった本文は覚えない・後で送らない（解除後は既存の同期が「今の確定した state」を送る）。通知は出さない（既存の未同期表示に任せる）。
 *   保留の印 v292DfixE64Hold（v:1 list。物語 key・口座・タブ id・ページ id・開始時刻・生存確認の時刻・開始時のターン数・その物語の本文と state キーの指紋）を端末に置くので、
 *   同じブラウザの別タブ（このファイルが動いているページ）の送信も止まる。保留していたページが無くなった（同じタブの再読み込み・移動、
 *   または 180 秒生存確認が無い）ときは、次に開いたページ（または次の送信）が確かめる: 開始時と指紋が同じなら印を消す。
 *   r6（#127-MK J4）: ターン数が増えていても、それだけでは消さない。保留していたページが確定の後に印へ残した「確定したターン数と指紋」と
 *   今の本文のターン数・指紋が一致するときだけ消す。それ以外（確かめられない場合を含む）は E64Stop に移す（送らない側）。
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixE64SaveTap) return;
  var KEY = 'v292DfixE64Stop';
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return undefined; } }
  var HKEY = 'v292DfixE64Hold', STALE_MS = 180000, HB_MS = 5000;
  var mk0 = lsg(KEY), hk0 = lsg(HKEY), on0 = lsg('v292DfixE64On'), off0 = lsg('v292DfixE64Off');
  if (!((mk0 !== null && mk0 !== undefined) || (hk0 !== null && hk0 !== undefined) || (on0 === '1' && off0 !== '1'))) return;   /* 印なし かつ OFF / kill: 何もしない */
  var inner = window.fetch;
  if (typeof inner !== 'function') return;
  var VER = 'e64tap-r5-20261024';
  var ST = { calls: 0, blocked: 0, held: 0, errors: 0, sent: 0, why: {}, holds: 0, released: 0, resolvedClean: 0, resolvedStop: 0, holdMs: [] };
  var STATE = { put: 1, forceput: 1, putstory: 1, putcanonical: 1, promotestory: 1, fork: 1 };
  var mem = [];            /* このページで止めた対象（印が書けなくても残る） */
  var pageClosed = false;  /* 印を端末へ書けなかった: このページでは state 書込をすべて止める */
  var flying = 0, sentAt = [];

  function idOf(story){ if (story === 'chr6') return 'chr6'; var m = /^chr6_slot_(.+)$/.exec(String(story || '')); return m ? m[1] : '*'; }
  function acctNow(){ try { var A = window.__v292Dfix893; var me = (A && typeof A.serverMe === 'function') ? A.serverMe() : null; if (me && me.accountId) return String(me.accountId); } catch(e){} return null; }
  function norm(x){ if (!x || typeof x !== 'object') return null; var s = (typeof x.story === 'string' && x.story) ? x.story : '*';
    return { story: s, id: s === '*' ? '*' : idOf(s), acct: (typeof x.acct === 'string' && x.acct) ? x.acct : null, code: String(x.code || 'stop'), at: +x.at || 0 }; }
  /* 端末の印を読む。壊れていたら「対象不明」1 件として扱う（送らない側） */
  function readMarker(){
    var raw = lsg(KEY);
    if (raw === null) return [];
    if (raw === undefined) return [{ story: '*', id: '*', acct: null, code: 'E64_MARKER_UNREADABLE', at: 0 }];
    try {
      var j = JSON.parse(raw), out = [];
      if (j && j.v === 2 && Array.isArray(j.list)) { j.list.forEach(function(x){ var n = norm(x); out.push(n || { story: '*', id: '*', acct: null, code: 'E64_MARKER_BAD', at: 0 }); }); return out; }
      if (j && j.v === 1 && typeof j.story === 'string' && j.story) return [norm({ story: j.story, code: j.code, at: j.at })];
    } catch(e){}
    return [{ story: '*', id: '*', acct: null, code: 'E64_MARKER_BAD', at: 0 }];
  }
  function targets(){
    var a = acctNow(), out = [];
    mem.concat(readMarker()).forEach(function(t){ if (t && !(t.acct && a && t.acct !== a)) out.push(t); });   /* 別口座と確かな印だけ外す */
    if (pageClosed) out.push({ story: '*', id: '*', acct: null, code: 'E64_STOP_NOT_PERSISTED', at: 0 });
    return out;
  }
  function stoppedDoc(docKey){
    var ts = targets(); if (!ts.length) return false;
    var id = (typeof docKey === 'string' && docKey) ? idOf(docKey) : '*';
    for (var i = 0; i < ts.length; i++) if (ts[i].id === '*' || id === '*' || ts[i].id === id) return true;
    return false;
  }
  function keyOf(k, id){ k = String(k); if (id === 'chr6') return k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k); return k.indexOf(id) >= 0; }
  function isSave(u){
    try { var s = (typeof u === 'string') ? u : (u && typeof u.url === 'string') ? u.url : String(u); s = s.split('#')[0].split('?')[0]; return /\/save$/.test(s); } catch(e){ return true; }
  }
  function method(u, o){ try { return String((o && o.method) || (u && typeof u === 'object' && u.method) || 'GET').toUpperCase(); } catch(e){ return 'POST'; } }
  /* list の対象に当たれば理由を返す（pre = 'E64_STOP_' | 'E64_HELD_'） */
  function matchList(j, op, list, pre){
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.id === '*') return pre + 'TARGET_UNKNOWN';
      if (op === 'put' || op === 'forceput') {
        var ls = j.pkg && j.pkg.ls;
        if (!ls || typeof ls !== 'object') return pre + 'PKG_UNKNOWN';
        for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k) && keyOf(k, t.id)) return pre + 'PKG';
      } else {
        var id = (j.id != null) ? String(j.id) : (j.slotId != null) ? String(j.slotId) : null;
        if (id === null) return pre + 'ID_UNKNOWN';
        if (id === t.id || id === 'chr6_slot_' + t.id) return pre + 'STORY';
      }
    }
    return null;
  }
  /* 戻り: null = 送る（state 書込でない／対象外） / { pass, w } = 送る（w = state 書込の記録用） / { why, held } = 止める */
  function decide(u, o){
    if (!isSave(u) || method(u, o) !== 'POST') return null;
    var ts = targets(), hs = holdTargets(), body = o && o.body, j = null;
    if (!ts.length && !hs.length) {   /* 止めている・保留している物語が無い: 中身は読まず（op の名前だけ）送った記録だけ取る */
      var m = (typeof body === 'string') ? /"op"\s*:\s*"([A-Za-z0-9_.]+)"/.exec(body.slice(0, 256)) : null;
      return (m && STATE[m[1]]) ? { pass: true, w: true } : null;
    }
    if (typeof body === 'string') { try { j = JSON.parse(body); } catch(e){ j = null; } }
    var op = j && typeof j.op === 'string' ? j.op : null;
    if (!j || !op) return ts.length ? { why: 'E64_STOP_BODY_UNKNOWN' } : { why: 'E64_HELD_BODY_UNKNOWN', held: true };
    if (!STATE[op]) return null;
    var w = matchList(j, op, ts, 'E64_STOP_'); if (w) return { why: w };
    w = matchList(j, op, hs, 'E64_HELD_'); if (w) return { why: w, held: true };
    return { pass: true, w: true };
  }
  var noteAt = 0, banner = null;
  function notify(){
    var now = Date.now(); if (now - noteAt < 15000) return; noteAt = now;
    var msg = 'この物語は安全のため止めています（前のターンの記録を元へ戻せなかったため）。いまの変更はサーバーへ保存していません。物語は消えていません。統括の確認と復旧のあとで再開してください。';
    var shown = false;
    try { var U = (typeof UI !== 'undefined' && UI) ? UI : window.UI; if (U && typeof U.setStatus === 'function') { U.setStatus(msg, true); shown = true; } } catch(e){}   /* index の UI は const（window には載らない） */
    try { if (typeof window.showToast === 'function') { window.showToast(msg, true); shown = true; } } catch(e){}
    if (!shown) try {
      if (!banner && document.body) { banner = document.createElement('div'); banner.id = 'v292DfixE64-stop-note'; banner.setAttribute('role', 'alert');
        banner.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483000;padding:10px 12px;border-radius:8px;background:#5a1d1d;color:#fff;font-size:14px;line-height:1.5;'; document.body.appendChild(banner); }
      if (banner) banner.textContent = msg;
    } catch(e){}
    try { console.warn('[v292DfixE64] save stopped (E64Stop)'); } catch(e){}
  }
  function heldErr(why){ var e = new Error('[v292DfixE64] save not sent: this story\'s turn is not settled yet [E64_HELD:' + why + ']'); try { e.code = 'E64_HELD'; e.reason = why; e.terminal = true; } catch(_e){} return e; }
  function stopErr(why){ var e = new Error('[v292DfixE64] save not sent: this story is stopped [E64_STOPPED:' + why + ']'); try { e.code = 'E64_STOPPED'; e.reason = why; e.terminal = true; } catch(_e){} return e; }

  var tap = function(u, o){
    var d = null;
    try { ST.calls++; d = decide(u, o); }
    catch(e){ ST.errors++; try { d = targets().length ? { why: 'E64_STOP_TAP_ERROR' } : holdTargets().length ? { why: 'E64_HELD_TAP_ERROR', held: true } : null; } catch(e2){ d = { why: 'E64_STOP_TAP_ERROR' }; } }
    if (d && !d.pass && d.held) { ST.held++; ST.why[d.why] = (ST.why[d.why] || 0) + 1; return Promise.reject(heldErr(d.why)); }   /* 保留: 通知しない（既存の未同期表示） */
    if (d && !d.pass) { ST.blocked++; ST.why[d.why] = (ST.why[d.why] || 0) + 1; notify(); return Promise.reject(stopErr(d.why)); }
    var pr = inner.apply(this, arguments);   /* 引数は受け取ったまま */
    if (d && d.w) {
      ST.sent++; sentAt.push(Date.now()); if (sentAt.length > 50) sentAt.shift(); flying++;
      try { Promise.resolve(pr).then(function(){ flying--; }, function(){ flying--; }); } catch(e){ flying--; }
    }
    return pr;
  };
  try { Object.keys(inner).forEach(function(k){ tap[k] = inner[k]; }); } catch(e){}
  tap.__v292DfixE64SaveTap = true;
  window.fetch = tap;

  /* E64 本体の stop() から呼ぶ: 印を端末へ書く（複数の物語を覚える）。書けなければこのページは state 書込をすべて止める */
  function mark(e){
    var n = norm(e) || { story: '*', id: '*', acct: null, code: 'stop', at: Date.now() };
    var since = +(e && e.since) || 0;
    n.sentInTurn = sentAt.filter(function(t){ return t >= since; }).length; n.inflight = flying;
    mem.push(n);
    var ok = false;
    try {
      var list = readMarker().filter(function(x){ return !(x.story === n.story && x.acct === n.acct); });
      list.push(n);
      var s = JSON.stringify({ v: 2, list: list.map(function(x){ return { story: x.story, acct: x.acct, code: x.code, at: x.at, sentInTurn: x.sentInTurn, inflight: x.inflight }; }) });
      localStorage.setItem(KEY, s); ok = (lsg(KEY) === s);
    } catch(err){ ok = false; }
    if (!ok && !(e && e.noClose)) pageClosed = true;   /* r5: 保留の決着（noClose）はその物語だけをメモリで止める（印は保留のまま残る） */
    return { persisted: ok, sentInTurn: n.sentInTurn, inflight: n.inflight };
  }
  /* ---- r5: ターンの保留 ---- */
  function rnd(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  var TAB = (function(){ try { var t = sessionStorage.getItem('v292DfixE64Tab'); if (!t) { t = rnd(); sessionStorage.setItem('v292DfixE64Tab', t); } return t; } catch(e){ return rnd(); } })();
  var PAGE = rnd(), hseq = 0, hmem = {}, hbTimer = null;
  function h32(s, h){ h = h >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function fp(v){ if (v === null || v === undefined) return 'null'; v = String(v); return v.length + ':' + h32(v, 2166136261) + h32(v, 0x9747b28c); }
  function isStateKey(k, id){
    if (id === 'chr6') return k === 'chr6' || k === 'v292Dfix77States' || k === 'v292Dfix277Quasi' || /^(v292Dfix77States|v292Dfix277Quasi).*_slot_chr6$/.test(k);
    return k === 'chr6_slot_' + id || (/^(v292Dfix77States|v292Dfix277Quasi)/.test(k) && k.indexOf(id) >= 0);
  }
  /* その物語の本文・state・準登録台帳のキーの指紋（中身は持たない） */
  function stateFp(id){ var o = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && isStateKey(k, id)) o[k] = fp(localStorage.getItem(k)); } } catch(e){ return null; } return o; }
  function sameFp(a, b){ if (!a || !b) return false; var ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join('\n') !== kb.join('\n')) return false; for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false; return true; }
  function readHolds(){
    var raw = lsg(HKEY); if (raw === null) return [];
    if (raw === undefined) return [{ id: 'unreadable', story: '*', acct: null, bad: true }];
    try { var j = JSON.parse(raw); if (j && j.v === 1 && Array.isArray(j.list)) return j.list.map(function(x){ return (x && typeof x.id === 'string' && typeof x.story === 'string') ? x : { id: 'bad', story: '*', acct: null, bad: true }; }); } catch(e){}
    return [{ id: 'bad', story: '*', acct: null, bad: true }];
  }
  function writeHolds(list){ try { var good = list.filter(function(x){ return !x.bad; }); if (!good.length) localStorage.removeItem(HKEY); else localStorage.setItem(HKEY, JSON.stringify({ v: 1, list: good })); return true; } catch(e){ return false; } }
  /* 保留していたページが無くなった印を決着させる: 指紋が開始時と同じなら消す、違えば（または確かめられなければ）E64Stop へ移す */
  function resolveHold(x){
    var same = false;
    if (!x.bad && x.story !== '*') { try { same = confirmedCommit(x) || sameFp(stateFp(idOf(x.story)), x.base); } catch(e){ same = false; } }
    if (!same) {
      var r = mark({ story: x.story, acct: x.acct, code: x.bad ? 'E64_HOLD_MARKER_BAD' : 'E64_HOLD_ABANDONED', at: Date.now(), since: +x.at || 0, noClose: true });
      if (!r || !r.persisted) { ST.resolveDeferred = (ST.resolveDeferred || 0) + 1; return; }   /* Stop を端末に書けない: 保留の印を残す（次の送信・次のページでもう一度。このページではメモリの印でその物語を止める） */
      ST.resolvedStop++;
    }
    else ST.resolvedClean++;
    var list = readHolds().filter(function(y){ return y.id !== x.id && !(x.bad && y.bad); }); writeHolds(list);
  }
  /* 保留を始めたターンが確定済みか（本文のターン数が開始時より多い） */
  /* r6（GPT #127-MK J4）: ターン数が増えただけでは解除しない。保留していたページが end()（確定の後）で記録した「確定したターン数と、
     その時の本文・states77・準登録台帳の指紋」と、今の本文のターン数・指紋が一致するときだけ「安全に確定した」とみなす */
  function bodyTurns(story){ try { var b = localStorage.getItem(story); if (!b) return -1; var d = JSON.parse(b); return (d && Array.isArray(d.turns)) ? d.turns.length : -1; } catch(e){ return -1; } }
  function confirmedCommit(x){
    var d = x && x.done; if (!d || typeof d.turns !== 'number' || !(d.turns > x.turns) || !d.fp) return false;
    return bodyTurns(x.story) === d.turns && sameFp(stateFp(idOf(x.story)), d.fp);
  }
  function orphan(x, now){ if (hmem[x.id]) return false; if (x.bad) return true; if (x.tab === TAB && x.page !== PAGE) return true; return !(now - (+x.hb || 0) <= STALE_MS); }
  function holdTargets(){
    var a = acctNow(), now = Date.now(), out = [];
    Object.keys(hmem).forEach(function(k){ out.push(hmem[k]); });
    readHolds().forEach(function(x){ if (hmem[x.id]) return; if (orphan(x, now)) { try { resolveHold(x); } catch(e){} return; } out.push(x); });
    return out.filter(function(t){ return !(t.acct && a && t.acct !== a); }).map(function(t){ return { story: t.story, id: t.story === '*' ? '*' : idOf(t.story) }; });
  }
  function beat(){ try { var list = readHolds(), ch = false, now = Date.now(); list.forEach(function(x){ if (hmem[x.id]) { x.hb = now; ch = true; } }); if (ch) writeHolds(list); } catch(e){} }
  function hold(e){
    var story = (e && typeof e.story === 'string' && e.story) ? e.story : '*';
    var id = PAGE + ':' + (++hseq), now = Date.now();
    var ent = { id: id, story: story, acct: (e && e.acct) ? String(e.acct) : null, tab: TAB, page: PAGE, at: now, hb: now, turns: (e && typeof e.turns === 'number') ? e.turns : -1, base: story === '*' ? null : stateFp(idOf(story)) };
    hmem[id] = ent; ST.holds++;
    var ok = false; try { var list = readHolds().filter(function(x){ return x.id !== id; }); list.push(ent); ok = writeHolds(list) && String(lsg(HKEY) || '').indexOf(id) >= 0; } catch(err){ ok = false; }
    ent.persisted = ok;
    if (!hbTimer) { try { hbTimer = setInterval(beat, HB_MS); } catch(e2){} }
    return { id: id, persisted: ok };
  }
  /* ページを離れる途中（再読み込み・移動）にターンが終わった（送信の中断で finally が走った）ときは、端末の保留の印を消さない:
     次に開いたページが、ターンが確定したか・キーが開始時のままかを確かめて決着させる（離れる途中の書込が完了したとは限らないため） */
  var leaving = false, kept = [], leaveTimer = null;
  function flushKept(){ if (!kept.length) return; var ids = kept.slice(); kept = []; try { var list = readHolds(), l2 = list.filter(function(y){ return ids.indexOf(y.id) < 0; }); if (l2.length !== list.length) writeHolds(l2); } catch(e){} }
  /* beforeunload は送信の中断より先に来る（再読み込みでは pagehide より前に finally が走るのを実測）。離れるのを取りやめた（確認の画面で
     「留まる」）ときは 1.5 秒後に元へ戻し、その間に解いた保留の印を消す。pagehide は確実に離れるとき。bfcache から戻ったら元へ戻す */
  try {
    window.addEventListener('beforeunload', function(){ leaving = true; if (leaveTimer) clearTimeout(leaveTimer); leaveTimer = setTimeout(function(){ leaveTimer = null; leaving = false; flushKept(); }, 1500); }, true);
    window.addEventListener('pagehide', function(){ leaving = true; if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } }, true);
    window.addEventListener('pageshow', function(ev){ if (ev && ev.persisted) { leaving = false; flushKept(); } }, true);
  } catch(e){}
  function release(id, info){
    var x = hmem[id]; if (!x) return false; delete hmem[id]; ST.released++;
    if (leaving && info && typeof info.turns === 'number' && info.turns > x.turns && x.story !== '*') {   /* r6: 離れる途中に確定した: 確定時の指紋を印に残す */
      try { var dn = { turns: info.turns, fp: stateFp(idOf(x.story)) }; var ls0 = readHolds(); ls0.forEach(function(y){ if (y.id === id) y.done = dn; }); writeHolds(ls0); } catch(e){}
    }
    if (leaving) { ST.keptOnLeave = (ST.keptOnLeave || 0) + 1; kept.push(id); return true; }
    try { ST.holdMs.push(Date.now() - x.at); if (ST.holdMs.length > 40) ST.holdMs.shift(); } catch(e){}
    try { var list = readHolds(), l2 = list.filter(function(y){ return y.id !== id; }); if (l2.length !== list.length) writeHolds(l2); } catch(e){}
    if (!Object.keys(hmem).length && hbTimer) { try { clearInterval(hbTimer); } catch(e){} hbTimer = null; }
    return true;
  }
  try { holdTargets(); } catch(e){}   /* 読み込み時: 無くなったページの保留を決着させる */

  window.__v292DfixE64SaveTap = {
    ver: VER, installed: true, guard: 2,
    stats: function(){ try { return JSON.parse(JSON.stringify({ calls: ST.calls, blocked: ST.blocked, held: ST.held, errors: ST.errors, sent: ST.sent, why: ST.why, flying: flying, pageClosed: pageClosed, holds: ST.holds, released: ST.released, resolvedClean: ST.resolvedClean, resolvedStop: ST.resolvedStop, resolveDeferred: ST.resolveDeferred || 0, keptOnLeave: ST.keptOnLeave || 0, holdMs: ST.holdMs, active: Object.keys(hmem).length })); } catch(e){ return null; } },
    holds: function(){ try { return holdTargets().map(function(t){ return { story: t.story }; }); } catch(e){ return [{ story: '*' }]; } },
    hold: hold, release: release,
    targets: function(){ try { return targets().map(function(t){ return { story: t.story, code: t.code }; }); } catch(e){ return [{ story: '*', code: 'ERR' }]; } },
    stoppedDoc: function(k){ try { return stoppedDoc(k); } catch(e){ return true; } },
    mark: mark, notify: notify
  };
  /* 止めた物語のページを開いたら、送る前から分かるように一度だけ知らせる（物語のページだけ。home では保存を止めたときだけ） */
  try { window.addEventListener('load', function(){ setTimeout(function(){ try {
    var E = window.__v292DfixE64; if (typeof window.__chronicleDocumentStoryKey === 'string' && E && typeof E.stopped === 'function' && E.stopped()) E.notifyStop();
  } catch(e){} }, 1500); }); } catch(e){}
})();
