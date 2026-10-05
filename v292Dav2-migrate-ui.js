/* v292Dav2-migrate-ui — minimal Owner migration UI (GPT 915 Q2) — offline candidate, NOT DEPLOYED
 * Owner rollout only (entry hidden behind the existing local flag v292Dav2On; the server allowlist / migration allowlist stay the
 * final authority). Explicit steps only — no automatic migration, adoption or generation; no client id minting:
 *   LEG  : 「Asset v2 移行を準備」 → __chronicleAssetV2.migrate()  (S9a; warning: older app versions can no longer save this story)
 *   PREP : per non-DELETED character — 「今の絵を候補として確保」 (secureCharacter) / candidate 「この絵にする」 (adoptCandidate) /
 *          「新しく描く」 (ensureFirst, only when nothing exists) ; readiness list ; 「Asset v2へ切り替える」 only when every
 *          character is secured → switchToSchema2(report)  (S9b; incomplete → no write)
 * Kill: localStorage v292Dav2Off = '1' (data plane refuses) or v292Dav2mOff = '1' (this UI only).
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__chronicleAv2MigrateUI) return;
  var TAG = '[av2-mig-ui]';
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function shown(){ return lsg('v292Dav2On') === '1' && lsg('v292Dav2Off') !== '1' && lsg('v292Dav2mOff') !== '1'; }
  function A(){ return window.__chronicleAssetV2 || null; }
  function M(){ return window.__v292Dav2Map || null; }
  function F(){ return window.__v292Dfix697 || null; }
  function S(){ try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('av2m') : null; } catch(e){ return null; } }
  var LOG = []; function note(o){ try { o.t = Date.now(); LOG.push(o); if (LOG.length > 100) LOG.shift(); } catch(e){} }
  /* document stage: 'LEG' | 'PREP' | 'S2' | null (undecidable / no document) */
  function stage(){
    try {
      var m = M(); if (!m || typeof m.docSchema2 !== 'function') return null;
      var d = m.docSchema2(); if (d === null) return null;
      var a = A(); var st = a && a.status ? a.status() : null; if (!st || !st.storyId) return null;
      if (d === true) return 'S2';
      return st.mode === 'PREP' ? 'PREP' : 'LEG';
    } catch(e){ return null; }
  }
  var WARN = 'この物語を Asset v2 の方式へ移す準備をします。\n準備の後は、更新していない古いアプリ（古い端末）ではこの物語を保存できなくなります。\nよろしいですか？';
  var WARN_SW = '「Asset v2」へ切り替えます。\n切り替えの後は、絵は Asset v2 の絵だけを表示します（古い方式の絵は消しませんが、表示には使いません）。\n古いアプリ（更新していない端末）ではこの物語を保存できません。\nよろしいですか？';
  var CODE = { NOT_SECURED: 'まだ準備できていないキャラクターがいます', NOT_CONFIRMED: '反映を確認できませんでした', WAIVE_NOT_APPLICABLE: '先に「今の絵を候補として確保」を試してください', MIGRATION_NOT_SECURED: 'まだ確保していないキャラクターがいます', AV2_SWITCH_UNAVAILABLE: 'この account では切り替えが有効になっていません',
    REGISTRATION_IN_PROGRESS: '保存の確認中です。少し待ってからお試しください', REGISTRATION_BLOCKED: '登録内容が拒否されています。先に名前などを直してください', REBASE_REQUIRED: 'サーバー側の物語が更新されています。内容の確認が必要です',
    LOCAL_NOT_SYNCED: '保存が終わってからお試しください', REGISTRATION_PENDING: '新しいキャラクターの登録が終わってからお試しください', SERVER_NOT_PREPARED: 'サーバー側でまだ準備されていません',
    SERVER_ALREADY_SCHEMA2: '別の端末で切り替え済みです。物語を開き直してください', CONFLICT: 'サーバー側が更新されていました。もう一度お試しください', NOT_APPLIED: '反映を確認できませんでした',
    READ_FAIL: 'サーバーに接続できませんでした', SERVER_UNAVAILABLE: 'この account では古い絵を取り込めません', DEVICE_UNAVAILABLE: 'この account では古い絵を取り込めません',
    SERVER_UNKNOWN: '取り込みの結果を確認できませんでした', DEVICE_UNKNOWN: '取り込みの結果を確認できませんでした', NO_LEGACY_KEY: '古い絵の場所が分かりません', IN_PROGRESS: '処理中です',
    OUTCOME_UNKNOWN: '結果を確認できませんでした', ALREADY: '既にこの絵です', ADOPTED: 'この絵にしました', ADOPTED_CONFIRMED: 'この絵にしました', IMPORTED: '候補として確保しました', NOTHING_TO_SECURE: '古い絵はありません（確保済み扱い）',
    CREATED: '絵を作りました', CREATED_CONFIRMED: '絵を作りました', EXISTS: '既に絵があります', PROFILE_REVIEW_REQUIRED: '外見の情報を確認してから作ってください（下の「外見を設定」）', UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW: '外見の情報が無いので、この操作では絵を作りません。下の「外見を設定」で外見を確定してから「新しく描く」を押してください', CANDIDATES_PENDING: '候補の絵があります。候補から選んでください',
    GENERATION_FAILED: '絵を作れませんでした', BUDGET: '今月の画像生成の上限に達しています', AV2_FLAG_OFF: 'この端末ではこの操作はできません', AV2_OFF: 'この端末ではこの操作はできません' };
  function say(res){ return (res && CODE[res.code]) || (res && res.ok ? 'できました' : 'できませんでした'); }
  /* ★cand_sideport_authority r6 (audit D C-1): appearance editor for the migration row (PREP + schema2). Suggestions (cast.desc / legacy
     chrAiAv4 text) are shown as reference only; profile.appearance is written only by the explicit 「この外見で確定」 → setProfile
     (side-port helper: fresh canonical × persisted slot, delta only). After PERSISTED_EQUALS_READBACK the page reloads once (fix733 TYPE A),
     never while a generation is in flight or the composer holds a draft. */
  function showProfileEditor(row, rw, msg){
    var old = row.querySelector('[data-av2-mig="profile-editor"]'); if (old){ old.style.display = old.style.display === 'none' ? '' : 'none'; return; }
    var ed = document.createElement('div'); ed.setAttribute('data-av2-mig', 'profile-editor'); ed.style.cssText = 'margin:6px 0 2px 0;padding:6px;border:1px solid #444;border-radius:6px;background:#15151c;font-size:12px;color:#ccc;';
    var sug = (A() && typeof A().suggestAppearance === 'function') ? (A().suggestAppearance(rw.id) || {}) : {};
    var ttl = document.createElement('div'); ttl.textContent = '外見の設定（絵の根拠になる文。保存するまで何も生成しません）'; ed.appendChild(ttl);
    var gsel = document.createElement('select'); gsel.setAttribute('data-av2-prof', 'gender'); gsel.style.cssText = 'background:#1a1a22;color:#eee;border:1px solid #555;border-radius:4px;font-size:12px;margin:4px 6px 0 0;';
    [['', '性別: 未設定'], ['女性', '性別: 女性'], ['男性', '性別: 男性']].forEach(function(o){ var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; gsel.appendChild(op); });
    gsel.value = (sug.current && sug.current.gender) || sug.gender || ''; ed.appendChild(gsel);
    var ta = document.createElement('textarea'); ta.setAttribute('data-av2-prof', 'appearance'); ta.rows = 3; ta.maxLength = 400; ta.placeholder = '例: 黒髪の短髪、細身、灰色の着物、左頬に古い傷';
    ta.style.cssText = 'display:block;width:96%;margin-top:4px;background:#1a1a22;border:1px solid #555;color:#eee;padding:4px;border-radius:4px;font-size:12px;';
    ta.value = (sug.current && sug.current.appearance) || ''; ed.appendChild(ta);
    var refs = []; if (sug.desc) refs.push(['設定の説明文（参考）', sug.desc]); if (sug.legacy) refs.push(['以前のAIアイコン用の外見文（参考・自動推定なので要確認）', sug.legacy]);
    refs.forEach(function(r){ var rb = document.createElement('div'); rb.setAttribute('data-av2-prof', 'suggestion'); rb.style.cssText = 'margin-top:4px;color:#aaa;';
      var lab = document.createElement('div'); lab.textContent = r[0]; rb.appendChild(lab); var tx = document.createElement('div'); tx.style.cssText = 'white-space:pre-wrap;color:#999;border-left:2px solid #555;padding-left:6px;'; tx.textContent = r[1]; rb.appendChild(tx);
      var cp = btn('この文を編集欄へ入れる', '#3a3a4a'); cp.setAttribute('data-av2-prof', 'copy'); cp.onclick = function(){ ta.value = r[1].slice(0, 400); ta.focus(); }; rb.appendChild(cp); ed.appendChild(rb); });
    var pmsg = document.createElement('span'); pmsg.style.cssText = 'margin-left:6px;color:#e0c080;';
    var okB = btn('この外見で確定', '#3a5a4a'); okB.setAttribute('data-av2-prof', 'confirm');
    okB.onclick = function(){ if (okB.disabled) return; var okc = false; try { okc = window.confirm('「' + (rw.name || '') + '」の外見をこの内容で確定します。\n（絵の生成はまだ行いません）'); } catch(e){} if (!okc) return;
      okB.disabled = true; pmsg.textContent = '…';
      A().setProfile(rw.id, { gender: gsel.value, appearance: ta.value, ownerConfirmed: true }, function(res){
        note({ kind: 'UI_MIG_SET_PROFILE', cid: rw.id, ok: !!(res && res.ok), code: res && res.code }); okB.disabled = false;
        if (!res || !res.ok){ pmsg.textContent = (res && CODE[res.code]) || (res && res.code === 'EMPTY_APPEARANCE' ? '外見の文を入力してください' : (res && res.code === 'LOCAL_NOT_SYNCED' ? '保存が終わってからお試しください' : 'できませんでした')); return; }
        var busy = false; try { var S0 = window.__chronicleGetState ? window.__chronicleGetState('av2mig') : null; busy = !!(S0 && S0.inFlight); var inp = document.getElementById('inp'); if (inp && String(inp.value || '').trim()) busy = true; } catch(e){}
        if (res.mirror === 'PERSISTED_EQUALS_READBACK' && !busy){ pmsg.textContent = '外見を保存しました（反映のため再読み込みします）'; msg.textContent = pmsg.textContent; setTimeout(function(){ try { location.reload(); } catch(e){} }, 1200); return; }
        pmsg.textContent = busy ? 'サーバーには保存されました。生成や入力が終わったら、ページを再読み込みしてください' : 'サーバーには保存されました。この端末の表示を揃えるため、ページを再読み込みしてください'; msg.textContent = pmsg.textContent; }); };
    ed.appendChild(okB); ed.appendChild(pmsg); row.appendChild(ed);
  }
  function btn(label, bg){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'background:' + bg + ';border:1px solid #666;color:#fff;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;margin:4px 6px 0 0;'; return b; }
  var thumbs = {};
  function thumb(assetId, img){
    if (thumbs[assetId]){ img.src = thumbs[assetId]; return; }
    var f = F(); if (!f || typeof f.assetV2Read !== 'function') return;
    f.assetV2Read('asset.get', { asset_id: assetId }, function(r){
      var type = r && String(r.type || '').split(';')[0].trim().toLowerCase();
      if (!r || r.status !== 200 || !r.bytes || !/^image\/(png|jpeg|webp)$/.test(type)) return;
      var u8 = new Uint8Array(r.bytes), s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      thumbs[assetId] = 'data:' + type + ';base64,' + btoa(s); img.src = thumbs[assetId];
    });
  }
  /* ---------- panel ---------- */
  var panel = null, busy = false;
  function close(){ if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
  function open(){
    close();
    panel = document.createElement('div'); panel.setAttribute('data-av2-ui', 'migrate'); panel.id = 'v292Dav2-migrate';
    panel.style.cssText = 'position:fixed;inset:6% 4%;z-index:2147483001;background:#16161e;color:#eee;border:1px solid #806040;border-radius:10px;padding:14px;overflow:auto;font-size:13px;line-height:1.6;box-shadow:0 4px 24px rgba(0,0,0,.6);';
    var x = btn('閉じる', '#444'); x.style.float = 'right'; x.onclick = close; panel.appendChild(x);
    var body = document.createElement('div'); body.setAttribute('data-av2-mig', 'body'); panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
    render(body);
  }
  function msgLine(body, text){ var m = body.querySelector('[data-av2-mig="msg"]'); if (!m){ m = document.createElement('div'); m.setAttribute('data-av2-mig', 'msg'); m.style.cssText = 'margin:8px 0;color:#e0c080;'; body.insertBefore(m, body.firstChild); } m.textContent = text || ''; }
  function render(body){
    var st = stage();
    body.innerHTML = '';
    var h = document.createElement('div'); h.style.cssText = 'font-weight:bold;font-size:15px;margin-bottom:6px;'; body.appendChild(h);
    if (st === 'LEG'){
      h.textContent = 'Asset v2 への移行（まだ準備していません）';
      var p = document.createElement('div'); p.textContent = '準備すると、サーバーが各キャラクターに番号を付けます。この段階では表示は今のままです。'; body.appendChild(p);
      var w = document.createElement('div'); w.style.cssText = 'color:#f0a080;margin:6px 0;'; w.textContent = '注意: 準備の後は、更新していない古いアプリではこの物語を保存できなくなります。'; body.appendChild(w);
      var b = btn('Asset v2 移行を準備', '#3a5a4a'); b.setAttribute('data-av2-mig', 'prepare');
      b.onclick = function(){ if (busy) return; var ok = false; try { ok = window.confirm(WARN); } catch(e){} if (!ok) return;
        var r = A().migrate(); note({ kind: 'UI_PREPARE', ok: !!(r && r.ok), code: r && r.code }); msgLine(body, r && r.ok ? '準備を始めました。保存の確認が終わると一覧が出ます' : say(r));
        setTimeout(function(){ if (panel) render(body); }, 4000); };
      body.appendChild(b); return;
    }
    if (st === 'S2'){ h.textContent = 'この物語は Asset v2 に切り替え済みです'; return; }
    if (st !== 'PREP'){ h.textContent = '物語の状態を確認しています…'; setTimeout(function(){ if (panel) render(body); }, 1500); return; }
    h.textContent = 'Asset v2 への移行（準備済み）';
    var w2 = document.createElement('div'); w2.style.cssText = 'color:#f0a080;margin:4px 0;'; w2.textContent = 'この物語は、更新していない古いアプリでは保存できません。'; body.appendChild(w2);
    var list = document.createElement('div'); list.textContent = '読み込み中…'; body.appendChild(list);
    A().migrationStatus(function(res){
      if (!panel) return;
      list.textContent = '';
      if (!res || !res.ok){ list.textContent = say(res); return; }
      res.rows.forEach(function(rw){
        var row = document.createElement('div'); row.setAttribute('data-av2-mig-row', rw.id); row.setAttribute('data-secured', rw.secured ? '1' : '0'); row.setAttribute('data-state', rw.state || '');
        row.style.cssText = 'border-top:1px solid #333;padding:8px 0;';
        var t = document.createElement('div'); t.innerHTML = '';
        t.textContent = (rw.name || '(名前なし)') + (rw.hero ? '（主人公）' : '') + (rw.status === 'DEPARTED' ? '（退場）' : '') + ' — ' +
          (rw.pointer ? '絵あり（確保済み）' : rw.candidates.length ? ('候補 ' + rw.candidates.length + ' 枚' + (rw.secured ? '（確保済み）' : '')) :
            rw.state === 'NO_LEGACY_IMAGE' ? '古い絵なし' : rw.state === 'OWNER_WAIVED' ? '古い絵は移さない（Owner の選択）' : (rw.unavailable ? '未確保（この account では古い絵を移せません）' : '未確保')) +
          (rw.device ? ' / この端末に古い絵あり' : '');
        row.appendChild(t);
        var msg = document.createElement('span'); msg.style.cssText = 'margin-left:6px;color:#e0c080;';
        if (!rw.pointer && !rw.secured && !rw.unavailable && rw.state !== 'OWNER_WAIVED'){
          var sb = btn('今の絵を候補として確保', '#3a4a6a'); sb.setAttribute('data-av2-mig', 'secure');
          sb.onclick = function(){ sb.disabled = true; msg.textContent = '…'; A().secureCharacter(rw.id, function(r){ msg.textContent = say(r); note({ kind: 'UI_SECURE', cid: rw.id, ok: !!(r && r.ok), code: r && r.code }); setTimeout(function(){ if (panel) render(body); }, 300); }); };
          row.appendChild(sb);
        }
        rw.candidates.forEach(function(c){
          var box = document.createElement('span'); box.style.cssText = 'display:inline-block;margin:4px 8px 0 0;text-align:center;';
          var im = document.createElement('img'); im.setAttribute('data-av2-ui', 'thumb'); im.alt = ''; im.style.cssText = 'width:56px;height:56px;border-radius:6px;background:#333;display:block;'; thumb(c.asset_id, im);
          var ab = btn('この絵にする', '#5a4a2a'); ab.setAttribute('data-av2-mig', 'adopt'); ab.setAttribute('data-asset', c.asset_id);
          ab.onclick = function(){ ab.disabled = true; msg.textContent = '…'; A().adoptCandidate(rw.id, c.asset_id, function(r){ msg.textContent = say(r); note({ kind: 'UI_ADOPT', cid: rw.id, ok: !!(r && r.ok), code: r && r.code }); setTimeout(function(){ if (panel) render(body); }, 300); }); };
          box.appendChild(im); box.appendChild(ab); row.appendChild(box);
        });
        if (rw.canWaive){                                                     // GPT 917 Q2: explicit per-character waiver (legacy bytes are kept)
          var wb = btn('この絵は移さない', '#5a3a3a'); wb.setAttribute('data-av2-mig', 'waive');
          wb.onclick = function(){ var ok = false; try { ok = window.confirm('「' + (rw.name || '') + '」の現在の絵は Asset v2 へ移せません。\nこの絵を引き継がずに移行を続けますか？\n移行後も古いデータ自体は削除しませんが、新しい肖像としては使用されません。'); } catch(e){} if (!ok) return;
            A().waiveCharacter(rw.id, function(r){ msg.textContent = r && r.ok ? '移さないことにしました' : say(r); note({ kind: 'UI_WAIVE', cid: rw.id, ok: !!(r && r.ok), code: r && r.code }); setTimeout(function(){ if (panel) render(body); }, 300); }); };
          row.appendChild(wb);
        }
        if (!rw.pointer && !rw.candidates.length && (rw.state === 'NO_LEGACY_IMAGE' || rw.unavailable)){
          var eb = btn('新しく描く', '#3a5a4a'); eb.setAttribute('data-av2-mig', 'ensure');
          eb.onclick = function(){ var ok = false; try { ok = window.confirm('「' + (rw.name || '') + '」の絵を新しく作ります。\n外見の情報がある場合だけ画像生成を1回使います。よろしいですか？'); } catch(e){} if (!ok) return;
            eb.disabled = true; msg.textContent = '…';
            /* ★av2f client (GPT #31-b): never confirmEmptyProfile; an empty profile stops here (provider call 0) and the Owner sets
               the appearance below (PREP: the character list card is not augmented, so the editor lives here — audit D C-1). */
            A().ensureFirst(rw.id, {}, function(r){
              msg.textContent = say(r); note({ kind: 'UI_MIG_ENSURE', cid: rw.id, ok: !!(r && r.ok), code: r && r.code });
              if (r && !r.ok && (r.code === 'UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW' || r.code === 'PROFILE_REVIEW_REQUIRED')){ eb.disabled = false; showProfileEditor(row, rw, msg); return; }
              setTimeout(function(){ if (panel) render(body); }, 300); }); };
          row.appendChild(eb);
        }
        if (!rw.pointer && rw.state !== 'OWNER_WAIVED_DONE'){                 /* ★r6: appearance review is independent of the legacy picture */
          var pb = btn('外見を設定', '#3a4a5a'); pb.setAttribute('data-av2-mig', 'profile');
          pb.onclick = function(){ showProfileEditor(row, rw, msg); };
          row.appendChild(pb);
        }
        row.appendChild(msg); list.appendChild(row);
      });
      var n = res.rows.filter(function(r){ return r.ready; }).length;
      var foot = document.createElement('div'); foot.style.cssText = 'border-top:1px solid #555;margin-top:8px;padding-top:8px;';
      var rd = document.createElement('div'); rd.setAttribute('data-av2-mig', 'ready'); rd.setAttribute('data-all', res.allReady ? '1' : '0');
      rd.textContent = '準備できた ' + n + ' / ' + res.rows.length + '（確保 / 古い絵なし / 移さない）' + (res.allReady ? '（切り替えられます）' : '（全員の準備ができると切り替えられます）'); foot.appendChild(rd);
      var sw = btn('Asset v2へ切り替える', res.allReady ? '#6a4a2a' : '#333'); sw.setAttribute('data-av2-mig', 'switch');
      if (!res.allReady){ sw.disabled = true; sw.style.opacity = '.5'; }
      var fm = document.createElement('span'); fm.style.cssText = 'margin-left:6px;color:#e0c080;';
      sw.onclick = function(){ if (sw.disabled) return; var ok = false; try { ok = window.confirm(WARN_SW); } catch(e){} if (!ok) return;
        sw.disabled = true; fm.textContent = '…';
        A().migrationStatus(function(r0){                                   // fresh status right before the one write
          if (!r0 || !r0.ok || !r0.allReady){ fm.textContent = r0 && r0.ok ? CODE.NOT_SECURED : say(r0); sw.disabled = false; return; }
          A().switchToSchema2(r0.report, function(r){ note({ kind: 'UI_SWITCH', ok: !!(r && r.ok), code: r && r.code }); fm.textContent = r && r.ok ? '切り替えました' : say(r); if (!(r && r.ok)) sw.disabled = false; setTimeout(function(){ if (panel) render(body); }, 500); });
        }); };
      foot.appendChild(sw); foot.appendChild(fm); body.appendChild(foot);
    });
  }
  /* ---------- entry (local flag only; hidden on schema-2 / undecidable documents) ---------- */
  var entry = null;
  function sweep(){
    var want = shown() && (stage() === 'LEG' || stage() === 'PREP');
    if (!want){ if (entry && entry.parentNode) entry.parentNode.removeChild(entry); entry = null; return; }
    if (entry && entry.parentNode) return;
    entry = btn('Asset v2 移行', '#4a3a5a'); entry.id = 'v292Dav2-migrate-entry'; entry.setAttribute('data-av2-ui', 'migrate-entry');
    entry.style.cssText += 'position:fixed;left:10px;bottom:56px;z-index:2147483000;opacity:.85;';
    entry.onclick = function(){ open(); };
    (document.body || document.documentElement).appendChild(entry);
  }
  function start(){ setInterval(sweep, 1500); sweep(); }
  window.__chronicleAv2MigrateUI = { open: open, close: close, stage: stage, log: function(){ return LOG.slice(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
