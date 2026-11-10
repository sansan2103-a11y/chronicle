/* v292DfixRESCUE1 — 保存されなかったターンの控え（fix945 ③ v292Dfix945_rescue_<id>）の「掃除・確認・入力欄へ戻す」
 * GPT #127-RY ④-2: 「退避機能も、ただ控えを作るだけでは不十分。利用者が何を退避したか確認でき、元の物語を壊さずに復旧できること」
 *
 * ■この部品がすること（LOCAL 候補）
 *   (1) 書く口 store(id, rec): fix945 の退避はここを通してだけ書く（この部品が無い・止まっている＝退避を書かない）。
 *       ・アカウントの印 acct（/auth/me の accountId の 16 桁ハッシュ。生の ID は残さない）を中身に持たせる。アカウントが分からない時は書かない。
 *       ・Vault で非表示（hidden-locked）と分かっている物語は書かない（CopyGate も新しい複製を断る＝二重）。
 *       ・上限: 1 物語 1 件（同じ key へ上書き＝最新 1 件）・端末全体で 3 件・合計 450,000 字・1 件 200,000 字・14 日。超えた分は古い順に捨てる。
 *   (2) 掃除 sweep(): 起動時・/auth/me の答え・アカウントの変化・Vault の答え・15 秒ごと（画面が見えている間）に、退避 key だけを見て消す:
 *       ・Vault で非表示（CopyGate が答えた hidden）       → 消す
 *       ・物語が削除された（chr6_slots_meta の deleted:true、または本体 chr6_slot_<id> が端末に無い）→ 消す
 *         （fix587 の削除計画は sideStoreKeys の部分一致で退避 key を元から含む。これは取りこぼしの保険）
 *       ・別のアカウント（acct が今のアカウントと違う・acct が無い旧形式）→ 消す
 *       ・ログアウト（この画面の /auth/me が 401・logout()・別タブのログアウト）→ 全部消す
 *       ・期限切れ・壊れている・件数/容量の上限超え → 古い順に消す
 *       判定できない時（/auth/me の答え待ち・通信失敗・Vault の答え待ち）は消さないし、見せない。
 *   (3) 画面（index.html だけ・小さく）: 開いている物語に、今のアカウントの退避があり、Vault で見えてよく、このタブが「古い」でないときだけ、
 *       入力欄の上に控えめな帯「保存されなかったターンの控えがあります（n ターン）」→「見る」で読み取り専用の一覧:
 *       「コピー」（全文をクリップボードへ）・各ターンの「入力欄に戻す」・「この控えを捨てる」（2 回押し）。
 *       ★物語へは書き戻さない（S.turns / 本体 / marker / クラウドに 1 バイトも書かない。保存の経路を使わない）。
 *       「入力欄に戻す」は、押した瞬間に退避を読み直し、アカウント・Vault・「古い」でないことを確かめ直してから、入力欄が空の時だけ
 *       入力の文とモード（DO/SAY/STORY）を戻す。送信はプレイヤーが押す（＝今の最新の物語に対して、正式な G.submit → S.save → CAS で作り直す）。
 *   ★「最新の物語の末尾に控えのターンをそのまま足す」はしない（案のみ）。理由: 控えのターンは古い内容を前提に書かれた本文で、
 *     別タブで進んだターンと矛盾しうる・状態（関係・記憶・キャラの状態）は控えに無い・確認済み版を手で進める経路が要る。
 * ■止める: localStorage v292DfixRESCUE1Off='1'（この部品を止める＝帯・掃除・書く口が無い＝fix945 は退避を書かない＝SAVEGUARD1 と同じ）
 * ■検証口: window.__v292DfixRESCUE1
 */
(function v292DfixRESCUE1(){
  'use strict';
  if (window.__v292DfixRESCUE1) return;
  var BUILD = 'rescue1.a';
  var PFX = 'v292Dfix945_rescue_';
  var MAX_N = 3, MAX_TOTAL = 450000, MAX_ONE = 200000, MAX_TURNS = 20, TTL = 14 * 24 * 3600 * 1000;
  var ID_RE = /^[A-Za-z0-9]+$/;
  var LS = null; try { LS = window.localStorage; } catch (e) {}
  function lsg(k){ try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function lsd(k){ try { LS.removeItem(k); return lsg(k) == null; } catch (e) { return false; } }
  function lss(k, v){ LS.setItem(k, v); return lsg(k) === v; }   /* 例外はそのまま上へ（CopyGate の SecurityError・容量不足） */
  if (lsg('v292DfixRESCUE1Off') === '1') return;
  var isIndex = /\/index(\.html)?$|\/$/.test(location.pathname || '') && !/\/home(\.html)?$/.test(location.pathname || '');
  var st = { stored: 0, refused: {}, swept: {}, sweeps: 0, renders: 0, restored: 0, copied: 0, discarded: 0, lastSweep: null };
  function bump(o, k){ o[k] = (o[k] || 0) + 1; }

  /* ---- アカウント（fix893 の /auth/me の答え。localStorage では決めない） ---- */
  function tagOf(id){ var h1 = 0x811c9dc5, h2 = 0x01000193; id = String(id); for (var i = 0; i < id.length; i++){ var c = id.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; } return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8); }
  function markAcct(){ try { var o = JSON.parse(lsg('v292Dfix837_sess') || 'null'); return (o && o.sid === 'cookie' && o.acct) ? String(o.acct) : null; } catch (e) { return null; } }
  var outWhy = null;   /* この document で「ログアウト」と確かに分かった理由（me-401 / logout / other-tab-logout） */
  function acct(){
    var F = window.__v292Dfix893;
    if (!F || F.active !== true) return { known: true, tag: 'local' };            /* アカウントの無い配信先（*.pages.dev 以外） */
    if (outWhy) return { known: false, out: true, why: outWhy };
    var m = null; try { m = F.serverMe(); } catch (e) {}
    if (!m || !m.accountId) return { known: false, why: 'pending' };
    var mk = markAcct();
    if (mk && mk !== String(m.accountId)) return { known: false, why: 'other-tab-account' };   /* 別タブで別アカウントになった: 見せない（次の起動で掃除） */
    return { known: true, tag: tagOf(m.accountId) };
  }
  /* ---- Vault（CopyGate の答え。答えが無い間は「不明」） ---- */
  function vault(id){
    var C = window.__v292Dvault2CopyGate;
    if (!C || typeof C.status !== 'function') return 'visible';                     /* CopyGate の無い配信先 */
    var s = null; try { s = C.status(); } catch (e) { return 'unknown'; }
    if (!s) return 'unknown';
    if (s.effective === 'novault') return 'visible';
    if (s.effective !== 'vault') return 'unknown';
    return (s.hidden || []).indexOf(id) >= 0 ? 'hidden' : 'visible';
  }
  function hiddenNow(){ var C = window.__v292Dvault2CopyGate; try { var s = C && C.status(); if (s && s.effective === 'vault') return s.hidden || []; } catch (e) {} return null; }
  /* ---- 物語の有無（削除・墓標） ---- */
  /* 削除 = meta の墓標（deleted:true。DL2 は本体を残すのでこれで見る）、または本体も meta の行も無い（fix587 の物理削除後の孤児）。
     本体が無くても meta に生きた行があるあいだは消さない（起動中の読み込み待ちなど）。meta が読めないときも消さない。 */
  function deletedIds(){ var o = { __ok: false, __live: {} }; try { var m = JSON.parse(lsg('chr6_slots_meta') || '[]'); if (Array.isArray(m)){ o.__ok = true; m.forEach(function (e){ if (!e || e.id == null) return; if (e.deleted === true) o[String(e.id)] = 1; else o.__live[String(e.id)] = 1; }); } } catch (e) {} return o; }
  function storyGone(id, dead){ if (dead[id]) return true; return !!(dead.__ok && !dead.__live[id] && lsg('chr6_slot_' + id) == null); }
  /* ---- 退避の列挙 ---- */
  function keys(){ var out = []; try { for (var i = 0; i < LS.length; i++){ var k = LS.key(i); if (k && k.indexOf(PFX) === 0) out.push(k); } } catch (e) {} return out; }
  function parse(raw){ try { var o = JSON.parse(raw); return (o && typeof o === 'object' && Array.isArray(o.turns)) ? o : null; } catch (e) { return null; } }
  function list(){ return keys().map(function (k){ var raw = lsg(k) || ''; var o = parse(raw); return { key: k, id: k.slice(PFX.length), rec: o, len: raw.length, at: (o && +o.at) || 0 }; }); }
  function currentId(){ try { var m = /[?&]story=([A-Za-z0-9]+)/.exec(location.search || ''); if (m) return m[1]; } catch (e) {} try { var p = JSON.parse(lsg('chr6_active_slot') || 'null'); return (p && p !== 'default') ? String(p) : null; } catch (e) { return null; } }

  /* ---- (2) 掃除 ---- */
  function sweep(why){
    st.sweeps++; var a = acct(), hid = hiddenNow(), dead = deletedIds(), now = Date.now(), res = { why: why, removed: [] };
    function drop(e, r){ if (lsd(e.key)){ bump(st.swept, r); res.removed.push(r); } }
    var keep = [];
    list().forEach(function (e){
      if (!ID_RE.test(e.id) || !e.rec || e.rec.storyId !== e.id) return drop(e, 'broken');
      if (a.out) return drop(e, 'logout');
      if (hid && hid.indexOf(e.id) >= 0) return drop(e, 'vault-hidden');
      if (storyGone(e.id, dead)) return drop(e, 'story-deleted');
      if (!(e.at > 0) || now - e.at > TTL || e.at - now > 600000) return drop(e, 'expired');
      if (a.known && (typeof e.rec.acct !== 'string' || e.rec.acct !== a.tag)) return drop(e, 'other-account');
      keep.push(e);
    });
    /* 件数・容量の上限（新しい順に残す） */
    keep.sort(function (x, y){ return y.at - x.at; });
    var tot = 0;
    keep.forEach(function (e, i){ tot += e.len; if (i >= MAX_N || tot > MAX_TOTAL) drop(e, 'cap'); });
    st.lastSweep = { t: now, why: why, removed: res.removed.length };
    if (res.removed.length) try { console.log('[RESCUE1] swept ' + res.removed.length + ' (' + res.removed.join(',') + ') on ' + why); } catch (e) {}
    return res;
  }

  /* ---- (1) 書く口（fix945 から呼ばれる） ---- */
  function slim(t){ var n = (t && t.narrative != null) ? t.narrative : ''; if (Array.isArray(n)) n = n.join('\n'); return { inputType: (t && typeof t.inputType === 'string') ? t.inputType.slice(0, 10) : null, playerText: (t && t.playerText != null) ? String(t.playerText) : '', narrative: String(n) }; }
  function store(id, src){
    try {
      if (!id || !ID_RE.test(String(id)) || id === 'default') { bump(st.refused, 'bad-id'); return null; }
      var a = acct(); if (!a.known){ bump(st.refused, 'acct-' + (a.why || 'unknown')); return null; }
      var v = vault(id); if (v !== 'visible'){ bump(st.refused, 'vault-' + v); return null; }
      var turns = (src && Array.isArray(src.turns)) ? src.turns.map(slim) : [];
      var inp = (src && src.pendingInput) ? String(src.pendingInput).slice(0, 4000) : null;
      if (!turns.length && !inp){ bump(st.refused, 'empty'); return null; }
      var from = (src && +src.fromTurn) || 0, cut = 0;
      if (turns.length > MAX_TURNS){ cut = turns.length - MAX_TURNS; turns = turns.slice(cut); }
      var rec = { v: 2, storyId: String(id), acct: a.tag, at: Date.now(), why: (src && src.why) || null, fromTurn: from + cut, memTurns: (src && +src.memTurns) || null,
                  turns: turns, pendingInput: inp, trimmed: cut > 0, build: (src && src.build) || null, r1: BUILD };
      var js = JSON.stringify(rec);
      while (js.length > MAX_ONE && rec.turns.length > 1){ rec.turns.shift(); rec.fromTurn++; rec.trimmed = true; js = JSON.stringify(rec); }
      if (js.length > MAX_ONE){ bump(st.refused, 'too-big'); return null; }
      if (!lss(PFX + id, js)){ bump(st.refused, 'readback'); return null; }
      st.stored++;
      sweep('store');
      if (lsg(PFX + id) !== js){ bump(st.refused, 'capped'); return null; }
      return rec;
    } catch (e){ bump(st.refused, 'threw:' + String((e && e.name) || e).slice(0, 24)); return null; }
  }

  /* ---- (3) 画面 ---- */
  function readMine(id){
    if (!id) return { ok: false, why: 'no-story' };
    var a = acct(); if (!a.known) return { ok: false, why: 'acct-' + (a.why || 'unknown') };
    if (vault(id) !== 'visible') return { ok: false, why: 'vault-' + vault(id) };
    try { var X = window.__v292Dfix945; if (X && typeof X.isStale === 'function' && X.isStale(id)) return { ok: false, why: 'tab-stale' }; } catch (e) { return { ok: false, why: 'stale?' }; }
    var rec = parse(lsg(PFX + id) || 'null');
    if (!rec || rec.storyId !== id) return { ok: false, why: 'none' };
    if (rec.acct !== a.tag) return { ok: false, why: 'other-account' };
    if (storyGone(id, deletedIds())) return { ok: false, why: 'story-deleted' };
    return { ok: true, rec: rec };
  }
  function plain(s){
    s = String(s == null ? '' : s);
    s = s.replace(/<say\s+who\s*=\s*"([^"]*)"\s*>([\s\S]*?)<\/say>/g, function (_, w, t){ t = String(t).trim(); return w + (/^[「『]/.test(t) ? t : '「' + t + '」'); });
    return s.replace(/<[^>]{0,200}>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  var MODE = { DO: '行動', SAY: '台詞', STORY: '描写' };
  function asText(rec){
    var out = [];
    rec.turns.forEach(function (t, i){ out.push('［' + (rec.fromTurn + i + 1) + ' ターン目・' + (MODE[t.inputType] || '入力') + '］ ' + (t.playerText || '（入力なし）')); out.push(plain(t.narrative)); out.push(''); });
    if (rec.pendingInput) out.push('［送っていない入力］ ' + rec.pendingInput);
    return out.join('\n').trim();
  }
  var hiddenThisView = false, ov = null;
  function el(tag, css, txt){ var d = document.createElement(tag); if (css) d.style.cssText = css; if (txt != null) d.textContent = txt; return d; }
  var BTN = 'margin:0 0 0 8px;padding:3px 10px;font:inherit;font-size:12px;border-radius:6px;border:1px solid #6a6a7a;background:#2a2a36;color:#ddd;cursor:pointer';
  function removeBand(){ try { var b = document.getElementById('v292DfixRESCUE1-band'); if (b) b.remove(); } catch (e) {} }
  function closeView(){ try { if (ov) ov.remove(); } catch (e) {} ov = null; }
  function render(why){
    if (!isIndex || !document.body) return;
    st.renders++;
    var id = currentId(), r = readMine(id);
    if (!r.ok || hiddenThisView){ removeBand(); if (!r.ok) closeView(); return; }
    var n = r.rec.turns.length, label = '保存されなかったターンの控えがあります（' + (n ? n + ' ターン' : '入力 1 件') + '）';
    var band = document.getElementById('v292DfixRESCUE1-band');
    if (!band){
      var host = document.getElementById('composer'); if (!host) return;
      band = el('div', 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:0 0 6px 0;padding:5px 10px;border:1px solid #5a5a2a;border-radius:8px;background:rgba(80,80,30,.25);color:#e8e2b0;font-size:12px;line-height:1.5');
      band.id = 'v292DfixRESCUE1-band'; band.setAttribute('role', 'status');
      var sp = el('span', 'flex:1 1 auto'); sp.setAttribute('data-r1', 'label'); band.appendChild(sp);
      var bo = el('button', BTN, '見る'); bo.setAttribute('data-r1', 'open'); bo.onclick = function (){ openView(); }; band.appendChild(bo);
      var bl = el('button', BTN, 'あとで'); bl.setAttribute('data-r1', 'later'); bl.onclick = function (){ hiddenThisView = true; removeBand(); }; band.appendChild(bl);
      host.insertBefore(band, host.firstChild);
    }
    band.querySelector('[data-r1="label"]').textContent = label;
  }
  function msg(box, t){ var m = box.querySelector('[data-r1="msg"]'); if (m) m.textContent = t || ''; }
  function openView(){
    var id = currentId(), r = readMine(id); if (!r.ok){ render('open-refused'); return; }
    closeView();
    var rec = r.rec;
    ov = el('div', 'position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px');
    ov.id = 'v292DfixRESCUE1-view'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    var box = el('div', 'background:#1b1b22;color:#e6e6e6;border:1px solid #555;border-radius:10px;max-width:720px;width:100%;max-height:86vh;display:flex;flex-direction:column;font:14px/1.6 system-ui,sans-serif');
    var hd = el('div', 'padding:10px 14px;border-bottom:1px solid #333;font-weight:600', '保存されなかったターンの控え（読むだけ・物語には入っていません）');
    var note = el('div', 'padding:6px 14px;font-size:12px;opacity:.8', '別のタブで物語が先に進んだため、このターンは保存されませんでした。続けたいときは「入力欄に戻す」で入力を戻し、最新の物語で送り直してください。');
    var body = el('div', 'padding:8px 14px;overflow:auto;flex:1 1 auto'); body.setAttribute('data-r1', 'body');
    rec.turns.forEach(function (t, i){
      var row = el('div', 'margin:0 0 12px 0;padding:8px;border:1px solid #333;border-radius:8px');
      var h = el('div', 'font-size:12px;opacity:.85;margin-bottom:4px;display:flex;align-items:center;flex-wrap:wrap');
      h.appendChild(el('span', 'flex:1 1 auto', (rec.fromTurn + i + 1) + ' ターン目・' + (MODE[t.inputType] || '入力') + '：' + (t.playerText || '（入力なし）')));
      if (t.playerText){ var bi = el('button', BTN, '入力欄に戻す'); bi.setAttribute('data-r1', 'restore'); bi.setAttribute('data-r1-i', String(i)); bi.onclick = function (){ restore(i, box); }; h.appendChild(bi); }
      row.appendChild(h);
      row.appendChild(el('div', 'white-space:pre-wrap;word-break:break-word', plain(t.narrative)));
      body.appendChild(row);
    });
    if (rec.pendingInput){ var pr = el('div', 'margin:0 0 12px 0;padding:8px;border:1px dashed #555;border-radius:8px;font-size:13px;display:flex;align-items:center;flex-wrap:wrap'); pr.appendChild(el('span', 'flex:1 1 auto', '送っていない入力：' + rec.pendingInput)); var bp = el('button', BTN, '入力欄に戻す'); bp.setAttribute('data-r1', 'restore'); bp.setAttribute('data-r1-i', 'p'); bp.onclick = function (){ restore('p', box); }; pr.appendChild(bp); body.appendChild(pr); }
    var ft = el('div', 'padding:8px 14px;border-top:1px solid #333;display:flex;flex-wrap:wrap;align-items:center;gap:6px');
    var m = el('span', 'flex:1 1 100%;font-size:12px;color:#e8d080;min-height:1em'); m.setAttribute('data-r1', 'msg'); ft.appendChild(m);
    var bc = el('button', BTN, 'コピー'); bc.setAttribute('data-r1', 'copy'); bc.onclick = function (){ copy(box); }; ft.appendChild(bc);
    var bd = el('button', BTN, 'この控えを捨てる'); bd.setAttribute('data-r1', 'discard'); bd.onclick = function (){ if (bd.getAttribute('data-arm') !== '1'){ bd.setAttribute('data-arm', '1'); bd.textContent = 'もう一度押すと捨てます'; return; } discard(box); }; ft.appendChild(bd);
    var bx = el('button', BTN, '閉じる'); bx.setAttribute('data-r1', 'close'); bx.onclick = closeView; ft.appendChild(bx);
    box.appendChild(hd); box.appendChild(note); box.appendChild(body); box.appendChild(ft); ov.appendChild(box);
    ov.addEventListener('click', function (e){ if (e.target === ov) closeView(); });
    document.body.appendChild(ov);
  }
  function copy(box){
    var r = readMine(currentId()); if (!r.ok){ msg(box, 'この控えはもう表示できません。'); render('copy-refused'); return; }
    var text = asText(r.rec), done = function (ok){ if (ok){ st.copied++; msg(box, 'コピーしました。'); } else msg(box, 'コピーできませんでした。本文を長押し（または選択）してコピーしてください。'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(function (){ done(true); }, function (){ done(fallbackCopy(text)); }); return; } } catch (e) {}
    done(fallbackCopy(text));
  }
  function fallbackCopy(text){ try { var ta = el('textarea', 'position:fixed;left:-9999px;top:0'); ta.value = text; ta.setAttribute('readonly', ''); document.body.appendChild(ta); ta.select(); var ok = document.execCommand && document.execCommand('copy'); ta.remove(); return !!ok; } catch (e) { return false; } }
  function restore(i, box){
    /* 押した瞬間に読み直す（古い一覧のまま戻さない）。このタブが「古い」・別アカウント・Vault で隠れた・物語が消えた → 戻さない */
    var r = readMine(currentId()); if (!r.ok){ msg(box, r.why === 'tab-stale' ? 'このタブは古くなっています。再読み込みしてから戻してください。' : 'この控えはもう使えません。'); render('restore-refused'); return; }
    var rec = r.rec, t = (i === 'p') ? { playerText: rec.pendingInput, inputType: null } : rec.turns[+i];
    if (!t || !t.playerText){ msg(box, '戻せる入力がありません。'); return; }
    var inp = document.getElementById('inp'); if (!inp){ msg(box, '入力欄が見つかりません。'); return; }
    if (String(inp.value || '').trim()){ msg(box, '入力欄に文があるため戻しませんでした（消さないため）。入力欄を空にしてからもう一度押すか、「コピー」を使ってください。'); return; }
    try { var g = window.G || (0, eval)('typeof G!=="undefined"?G:null'); if (t.inputType && /^(DO|SAY|STORY)$/.test(t.inputType) && g && typeof g.setMode === 'function') g.setMode(t.inputType); } catch (e) {}   /* index の G は const（window に無い）ので fix945 と同じ読み方 */
    inp.value = String(t.playerText); try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    st.restored++; closeView();
    try { inp.focus(); } catch (e) {}
    try { if (typeof showToast === 'function') showToast('控えの入力を入力欄に戻しました。送信すると、最新の物語の続きとして作り直します。'); } catch (e) {}
  }
  function discard(box){
    var id = currentId(), r = readMine(id); if (!r.ok){ msg(box, 'この控えはもう使えません。'); render('discard-refused'); return; }
    if (lsd(PFX + id)){ st.discarded++; closeView(); removeBand(); try { if (typeof showToast === 'function') showToast('控えを捨てました。'); } catch (e) {} }
    else msg(box, '捨てられませんでした。');
  }
  function cycle(why){ try { sweep(why); } catch (e) {} try { render(why); } catch (e) {} }

  /* ---- 合図 ---- */
  window.addEventListener('chr:account-me', function (){ cycle('account-me'); });
  window.addEventListener('chr:account-flags', function (){
    try { var F = window.__v292Dfix893, w = F && typeof F.flagsWhy === 'function' ? F.flagsWhy() : null;
      if (w === 'me-401' || w === 'logout' || w === 'other-tab-logout') outWhy = w;
      if (w === 'other-tab-account'){ removeBand(); closeView(); }
    } catch (e) {}
    cycle('account-flags');
  });
  window.addEventListener('chr:vault2-blocked', function (){ setTimeout(function (){ cycle('vault2-blocked'); }, 0); });
  window.addEventListener('storage', function (e){ try { if (!e || e.key == null || e.key.indexOf(PFX) === 0 || e.key === 'v292Dfix837_sess' || e.key === 'chr6_slots_meta') render('storage'); } catch (x) {} });
  document.addEventListener('visibilitychange', function (){ if (document.visibilityState === 'visible') cycle('visible'); });
  (function tick(){ setTimeout(function (){ try { if (document.visibilityState !== 'hidden') cycle('tick'); } catch (e) {} tick(); }, 15000); })();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function (){ cycle('dom'); }); else setTimeout(function (){ cycle('boot'); }, 0);
  setTimeout(function (){ cycle('boot+3s'); }, 3000);

  window.__v292DfixRESCUE1 = {
    armed: true, BUILD: BUILD, PFX: PFX, limits: { MAX_N: MAX_N, MAX_TOTAL: MAX_TOTAL, MAX_ONE: MAX_ONE, MAX_TURNS: MAX_TURNS, TTL: TTL },
    store: store, sweep: sweep, render: render, open: openView,
    mine: function (id){ var r = readMine(id || currentId()); return r.ok ? { ok: true, turns: r.rec.turns.length, at: r.rec.at, fromTurn: r.rec.fromTurn } : r; },   /* 本文は返さない */
    list: function (){ return list().map(function (e){ return { id: e.id, len: e.len, at: e.at, acctMatch: e.rec ? e.rec.acct === acct().tag : null, turns: e.rec ? e.rec.turns.length : null }; }); },   /* 本文は返さない */
    status: function (){ var a = acct(); return { build: BUILD, page: isIndex ? 'index' : 'other', acct: { known: a.known, out: !!a.out, why: a.why || null }, stats: JSON.parse(JSON.stringify(st)) }; }
  };
})();
