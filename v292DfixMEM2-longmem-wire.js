/* v292DfixMEM2 — 長期記憶の配線（laneMEM2・2026-11-17・GPT #127-VR 1・既定 OFF・独立した 2 つの腕）
 * 背景（mem1/DIAG.md）: __longmem（fix135/136/137）は 3 ターンごとに AI で作られ保存されているが、features.js の build の包みが足す sys の文は、
 *   fix192（新エンジン）が r.sys = buildSys(...) で作り直すので届かない。本文の全文が AI に渡るのは fix58 userExt の recentScenes（直近 2 ターン）だけ。
 * 腕 A（v292DfixMEM2aOn='1'・kill v292DfixMEM2aOff='1'）: この物語の長期記憶（あらすじ・重要な出来事）を、fix58 userExt の user JSON の背景の欄
 *   memoryNotes（earlierFacts の直後・無ければ storySoFar の直後）へ「参考の覚え書き」として渡す。本文は最大 800 字（新しい出来事を優先して詰める）。
 *   sys には足さない。新しい禁止文は足さない。タグ・内部指示らしい文字列は除く。
 *   物語の一致: document の権限キー（__chronicleDocumentStoryKey = chr6_slot_<id>）から接尾辞を作り、その接尾辞つきのキーだけを直接読む。
 *     fix246 が動いていない・fix783 が kill・権限キーが無い／slot でない・fix697 の storyId と食い違う・保存本体の場所と S の場所が食い違う・
 *     最後に作ったターンが今のターンより先（リセット後の残り）→ 何も足さない（見送りの理由を数える）。
 * 腕 C（v292DfixMEM2cOn='1'・kill v292DfixMEM2cOff='1'）: fix58 userExt の recentScenes を直近 2 → 4 ターンにする（recentN()）。
 * ★r2（レビュー 2026-11-17 の条件）:
 *   (1) 別の物語の記憶の混入: fix246 は読み込みのたびに、接尾辞なしの共通鍵（既定の物語 chr6 の記憶）を、今の物語の鍵が空なら移す（印は残らない）。
 *       そこで腕 A は「このページで、この物語 id の記憶が空の状態から fix135 によって作られた」と MEM2 自身がメモリの中で確かめた記憶だけを渡す。
 *       読み込みの時点で記憶の鍵がすでにある（前の回に作ったもの・共通鍵から移されたもの）ときは、このページでは見送る（NOT_SESSION_BUILT）。
 *       記憶が消えて（fix135 の reset）空に戻れば、また空の状態からの観察を始める。印は保存しない（localStorage・保存本体・cfg・cast に書かない）。
 *   (2) fix697 の storyId が読めない・null のときは見送る（ID_UNKNOWN・fail-closed）。
 *   (3) 日本語の内部の印（【内部】【システム】【指示】…・（AIへの指示：…）・[[…]]・LEAK1 の内部ラベルの語）を除く。
 * どちらも OFF（既定）のとき、fix58 は今と同じオブジェクト・同じ数を使う＝送信バイト同一。保存・通信・AI 呼び出しは増やさない（読むだけ）。
 * 計測: window.__v292DfixMEM2.stats()（腕ごとの適用回数・足した字数・見送り理由）／.last()（直近の送信で足した覚え書きの字数と先頭 80 字・C のターン数）。
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixMEM2) return;
  var VER = 'mem2r3-20261117';
  var RULE = 'これまでの出来事の覚え書き（参考。プレイヤーの入力・確定した設定・直近の本文と食い違う場合はそちらを優先）';
  var MAX = 800, SUM_MIN = 60;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  /* ★MEMTRIAL（GPT #127-WF (3)・試用の間だけの条件。kill ではない）: 腕 A・MEM3b・MEM3・MEM4 は、端末の鍵に加えて、
     この page の /auth/me の答え（fix893 serverMe）が Owner（entitlement 'owner'・status が無いか 'active'＝fix905 と同じ判定）のときだけ働く。
     答えがまだ無い・分からない・失敗・Owner 以外 → 働かない（fail-closed・理由を数える）。新しい判定・新しい保存は作らない（読むだけ）。
     一般向けに ON にするときは、下の TRIAL_OWNER_ONLY を false にする（この 1 か所だけ。fix135 の MEM3 もここを見る）。 */
  var TRIAL_OWNER_ONLY = true, trialSt = {};
  function trialWhy(){ try { var A = window.__v292Dfix893; if (!A || typeof A.serverMe !== 'function') return 'NO_ACCOUNT_API'; var me = A.serverMe();
      if (!me) return 'NO_SERVER_ME'; if (me.entitlement !== 'owner') return 'NOT_OWNER'; if (me.status && me.status !== 'active') return 'NOT_ACTIVE'; return null; } catch(e){ return 'THREW'; } }
  function trialOk(feat){ if (!TRIAL_OWNER_ONLY) return true; try { var A1m = window.__v292DfixACCT1; if (A1m && typeof A1m.want === 'function' && A1m.want('mem') === true) return true; } catch(eA1m){}   /* ★ALLON-MEM: ACCT1 が mem を ON と答えたアカウント（ログイン中の owner・beta）は通す。kill は ACCT1 の kill・項目の kill */ try { var A1 = window.__v292DfixACCT1; if (A1 && typeof A1.all === 'function' && A1.all() === true) return true; } catch(eA1){}   /* ★ACCT1 r3: 全員の旗（acct1all）が ON のときだけ。来ない今は今のまま */ var w = trialWhy(); if (w && feat){ var m = trialSt[feat] || (trialSt[feat] = {}); m[w] = (m[w] || 0) + 1; } return !w; }
  window.__v292DfixMEMTrial = { ok: function(feat){ return trialOk(feat); }, ownerOnly: function(){ return TRIAL_OWNER_ONLY; }, stats: function(){ return JSON.parse(JSON.stringify(trialSt)); } };
  /* ★MEMTALLY（GPT #127-WF (a)）: 端末の 1 本の鍵 v292DfixMEMTally に、日別（端末の日付）で数だけ足す。
     数えるもの: inj（覚え書きを渡した回数）・skip{理由コード}（見送り）・loss（MEM4 の trusted → untrusted）・inv（印の無効化）・nrej{理由コード}（通知の不採用）。
     本文・記憶の中身・物語名・物語 id（hash も）・アカウント id・秘密は入れない。理由コードは英大文字・数字・_ だけ（それ以外は OTHER）。
     出来事が起きたその場で +1（メモリの stats を写さない＝再読み込みでも重複しない）。書くのは腕 A が働く（鍵 ON・Owner）かつ kill v292DfixMEMTallyOff が無いときだけ。
     OFF・kill では読まない・書かない。書けない（容量不足など）ときは握りつぶす。14 日より古い日は書くときに消す。端末だけの鍵（物語の鍵ではない・同期の除外・復元の対象外）。 */
  var TK = 'v292DfixMEMTally', TDAYS = 14;
  function tday(t){ var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function tcode(c){ c = String(c == null ? '' : c); return /^[A-Z0-9_]{1,40}$/.test(c) ? c : 'OTHER'; }
  function tally(field, code){
    try {
      if (lsg('v292DfixMEMTallyOff') === '1' || !aOn()) return;
      var now = Date.now(), day = tday(now), o = null; try { o = JSON.parse(lsg(TK) || 'null'); } catch(eP){ o = null; }
      if (!o || o.v !== 1 || !o.d || typeof o.d !== 'object' || Array.isArray(o.d)) o = { v: 1, d: {} };
      var cut = tday(now - (TDAYS - 1) * 864e5); Object.keys(o.d).forEach(function(k){ if (!/^\d{4}-\d\d-\d\d$/.test(k) || k < cut) delete o.d[k]; });
      var r = o.d[day]; if (!r || typeof r !== 'object') r = o.d[day] = { inj: 0, skip: {}, loss: 0, inv: 0, nrej: {} };
      if (code === undefined) r[field] = (+r[field] || 0) + 1; else { var m = (r[field] && typeof r[field] === 'object') ? r[field] : (r[field] = {}); var c = tcode(code); m[c] = (+m[c] || 0) + 1; }
      try { localStorage.setItem(TK, JSON.stringify(o)); } catch(eS){}
    } catch(e){}
  }
  function acct1(n){ try { var A = window.__v292DfixACCT1; return !!(A && typeof A.want === 'function' && A.want(n) === true); } catch(e){ return false; } }   /* ★ACCT1: Owner のアカウントなら端末の鍵が無くても（項目 mem・kill v292DfixACCT1Off / v292DfixACCT1MemOff） */
  function aKey(){ return lsg('v292DfixMEM2aOff') !== '1' && (lsg('v292DfixMEM2aOn') === '1' || acct1('mem')); }
  function aOn(){ return aKey() && trialOk(); }   /* ★MEMTRIAL: 鍵に加えて Owner の確認（腕 A・MEM3b・MEM4 はここを通る） */
  function cOn(){ return lsg('v292DfixMEM2cOff') !== '1' && lsg('v292DfixMEM2cOn') === '1'; }
  function m3bOn(){ return lsg('v292DfixMEM3bOff') !== '1' && (lsg('v292DfixMEM3bOn') === '1' || acct1('mem')) && trialOk(); }   /* ★ACCT1 */   /* ★MEM3b（既定 OFF・腕 A が ON のときだけ効く） */
  var st = { a: { calls: 0, applied: 0, chars: 0, skip: {} }, c: { calls: 0, applied: 0, turns: 0 } };
  var lastA = null, lastC = null;
  /* ★r2 (1): この物語の記憶が「このページで空から作られた」かを、メモリだけで追う */
  var LMK = ['chr6_v292Dfix135_sum', 'chr6_v292Dfix136_wi', 'chr6_v292Dfix137_ev', 'chr6_v292Dfix135_last'];
  var trust = { dk: null, state: 'n/a', since: 0 };   /* state: clean（空を見た）／trusted（空から作られた）／untrusted（読み込み時に既にあった）／n/a */
  function docSfx(){ var dk = window.__chronicleDocumentStoryKey; var m = (typeof dk === 'string') ? /^chr6_slot_([A-Za-z0-9_-]{1,80})$/.exec(dk) : null; return m ? { dk: dk, id: m[1], sfx: '_slot_' + m[1] } : null; }
  function memEmpty(sfx){ for (var i = 0; i < LMK.length; i++){ if (lsg(LMK[i] + sfx) != null) return false; } return true; }
  function lbOf(sfx){ var v = parseInt(lsg('chr6_v292Dfix135_last' + sfx) || '-1', 10); return (v >= 0) ? v : -1; }
  /* ★MEM4（案 A・記憶の所属証明・GPT #127-VV 3・既定 OFF: v292DfixMEM4On='1'・kill v292DfixMEM4Off='1'・腕 A が ON のときだけ）
     MEM2 が見届けた作り直し（空から作られた／信用している版から作り直された）にだけ、別の鍵 v292DfixMEM4_slot_<id> へ印を書く。
     印 = { v:1, acct（アカウント ID）, sid（物語 id）, dev（この端末の乱数 id）, lb（作ったターン）, h（4 つの鍵の中身の hash）, chain（'empty'|'chained'）, at }。
     読み込み時に記憶があるときは、印が acct・sid・dev・lb・h のすべてで今と一致したときだけ信用する（再読み込みの後も渡る）。
     印が無い・壊れている・アカウントが分からない／違う・端末が違う・版や中身がずれている（印だけ古い・更新途中・移行・復元）→ 信用しない（理由を数える）。
     信用中に中身が変わったとき、作ったターン（lb）が進んでいれば作り直しとして印を付け直す。lb が進まずに中身が変わったら信用をやめる。
     記憶が全部消えたら（fix135 の reset）印も消す。古い記憶を後から正規と認めることはしない（印を付けるのは見届けた作り直しだけ）。
     OFF（既定）・腕 A が OFF のときは、印も端末 id も読まない・書かない（従来の track のまま）。 */
  /* ★MEM4 r2（レビューのすり抜け A・B）:
     A: 空を見た後・信用中の書き込みを信用するのは、このページの fix135 が作り直しを終えたこと（保存の直後の知らせ〔__v292DfixMEM4Done〕）を見届け、
        その知らせの接尾辞・ターン（lb）・4 つの鍵の中身の hash・場所（loc）が今と一致したときだけ。復元・別のタブ・storage の書き込み・切り替え途中の書き込みは
        知らせが無い（または中身が合わない）ので信用しない（M4_UNSEEN_WRITER）。
     B: 端末ごとの版の通し番号（v292DfixMEM4Seq＝どの物語にも属さない端末の鍵。物語 id は hash で持つ）を印に入れる。印を付けるたびに番号が進むので、
        snapshot などで古い記憶と古い印が一緒に戻っても、番号が今の版と合わない（M4_SEQ_MISMATCH／M4_SEQ_UNKNOWN）。
     アカウントはサーバーで確かめた値だけ（fix893 serverMe）。 */
  var M4K = 'v292DfixMEM4_slot_', M4D = 'v292DfixMEM4Dev', M4Q = 'v292DfixMEM4Seq', M4Q_MAX = 200;
  var t4 = { dk: null, state: 'n/a', why: null, lb: -1, h: null, stamped: false, since: 0, dn: 0 }, m4st = { stamped: 0, restamped: 0, verified: 0, rejected: {}, removed: 0, done: 0, notifyRej: {}, invalidated: 0 };
  var m4done = null, m4dseq = 0;   /* このページで見届けた fix135 の作り直しの完了（最後の 1 件） */
  function m4On(){ return aOn() && lsg('v292DfixMEM4Off') !== '1' && (lsg('v292DfixMEM4On') === '1' || acct1('mem')); }   /* ★ACCT1 */
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function lsr(k){ try { localStorage.removeItem(k); } catch(e){} }
  function m4acct(){ try { var F = window.__v292Dfix893; var me = (F && typeof F.serverMe === 'function') ? F.serverMe() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch(e){ return null; } }   /* ★r2: サーバーで確かめた値だけ */
  function m4dev(create){ var v = lsg(M4D); if (v && /^[A-Za-z0-9]{16,40}$/.test(v)) return v; if (!create) return null;
    var s = ''; try { var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a); for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); } catch(e){ for (var j = 0; j < 24; j++) s += Math.floor(Math.random() * 16).toString(16); }
    return lss(M4D, s) ? s : null; }
  function m4hash(sfx){ var raw = LMK.map(function(k){ var v = lsg(k + sfx); return v == null ? '\u0000' : v; }).join('\u0001');
    var a = 2166136261, b = 5381; for (var i = 0; i < raw.length; i++){ var c = raw.charCodeAt(i); a ^= c; a = (a * 16777619) >>> 0; b = ((b * 33) ^ c) >>> 0; } return a.toString(36) + '.' + b.toString(36) + '.' + raw.length; }
  function m4idh(id){ var a = 2166136261; for (var i = 0; i < id.length; i++){ a ^= id.charCodeAt(i); a = (a * 16777619) >>> 0; } return 'h' + a.toString(36) + '.' + id.length; }   /* ★r2 B: 通し番号の表は物語 id をそのまま持たない */
  function m4seqGet(){ try { var o = JSON.parse(lsg(M4Q) || 'null'); if (o && typeof o.g === 'number' && o.s && typeof o.s === 'object') return o; } catch(e){} return null; }
  function m4seqNext(id){ var q = m4seqGet() || { g: 0, s: {} }; var n = Math.max(q.g + 1, Date.now()); q.g = n; q.s[m4idh(id)] = n;
    var ks = Object.keys(q.s); if (ks.length > M4Q_MAX){ ks.sort(function(x, y){ return q.s[x] - q.s[y]; }); for (var i = 0; i < ks.length - M4Q_MAX; i++) delete q.s[ks[i]]; }
    return lss(M4Q, JSON.stringify(q)) ? n : 0; }
  function m4seqDrop(id){ var q = m4seqGet(); if (q && q.s[m4idh(id)] != null){ delete q.s[m4idh(id)]; lss(M4Q, JSON.stringify(q)); } }
  function m4blobLoc(sfx){ try { var b = JSON.parse(lsg('chr6' + sfx) || 'null'); return (b && b.scene) ? (b.scene.loc || null) : null; } catch(e){ return null; } }
  function m4curLoc(){ try { var s = (typeof S !== 'undefined' && S) ? S : window.S; return (s && s.scene) ? (s.scene.loc || null) : null; } catch(e){ return null; } }
  /* ★r2 A: fix135 が保存の直後に呼ぶ（このページの作り直しだけ）。その時点の 4 つの鍵の hash を控える。OFF のときは何も読まない（MEM4 の鍵の確認だけ）
     ★r3（#127-VX ②③①）: 受け手で 2 つ確かめ、合わなければ知らせを使わない（m4done を作らない）。
       ② NOTIFY_OTHER_STORY: S.turns と、知らせの接尾辞の本体 chr6<sfx> の turns で、ターン数・最初と最後のターンの narrative（先頭 200 字）のどれかが、無い・違う（r4 でターン数と最後のターンを足した）
          （切り替えの中間状態で、S＝前の物語のまま fix135 が前の物語の記憶を今の slot に書いた形。場所が無い物語でも止まる）
       ③ NOTIFY_PARTIAL_SAVE: 知らせの r（fix135 が保存しようとした結果）のとおりに 4 つの鍵が保存されていない（容量不足などで一部だけ書けた）。
          fix135 の保存の形と同じ切り方（summary 800 字・worldinfo 40 件・events 20 件・作ったターン）で比べる。r が無い知らせも使わない
       ① 知らせの時点の accountId（serverMe）を控え、印を付けるときに今の値と違えば付けない（NOTIFY_ACCT_CHANGED） */
  var m4nrej = null;   /* ★r3: 最後に使わなかった知らせの理由（見送りの理由に出す） */
  /* ★r4: 物語の照合 = ターン数・最初のターンの narrative の先頭 200 字・最後のターンの narrative の先頭 200 字。どれかが無い（空・文字列でない）と null（使わない）。
     本体の保存が S より遅れて合わないときも使わない（安全側・次の作り直しで取り直す） */
  function m4fp(t){ if (!Array.isArray(t) || !t.length) return null; var a = t[0], z = t[t.length - 1];
    if (!a || typeof a.narrative !== 'string' || !a.narrative || !z || typeof z.narrative !== 'string' || !z.narrative) return null;
    return t.length + '\u0001' + a.narrative.slice(0, 200) + '\u0001' + z.narrative.slice(0, 200); }
  function m4fpS(){ try { var s = (typeof S !== 'undefined' && S) ? S : window.S; return m4fp(s && s.turns); } catch(e){ return null; } }
  function m4fpB(sfx){ try { var b = JSON.parse(lsg('chr6' + sfx) || 'null'); return m4fp(b && b.turns); } catch(e){ return null; } }
  function m4savedAsIntended(sfx, r, lb){ try { if (!r || typeof r !== 'object') return false;
      if (lsg('chr6_v292Dfix135_last' + sfx) !== String(lb)) return false;
      if (r.summary && lsg('chr6_v292Dfix135_sum' + sfx) !== String(r.summary || '').slice(0, 800)) return false;
      if (r.worldinfo && r.worldinfo.length && lsg('chr6_v292Dfix136_wi' + sfx) !== JSON.stringify((r.worldinfo || []).slice(0, 40))) return false;
      if (r.events && r.events.length && lsg('chr6_v292Dfix137_ev' + sfx) !== JSON.stringify((r.events || []).slice(0, 20))) return false;
      return true; } catch(e){ return false; } }
  window.__v292DfixMEM4Done = function(o){ try { if (!m4On() || !o || !o.ok) return; m4st.done++;
    var sfx0 = String(o.sfx || ''), fS = m4fpS(), fB = m4fpB(sfx0);
    if (fS == null || fB == null || fS !== fB){ m4done = null; m4nrej = 'NOTIFY_OTHER_STORY'; m4st.notifyRej[m4nrej] = (m4st.notifyRej[m4nrej] || 0) + 1; tally('nrej', m4nrej); return; }
    if (!m4savedAsIntended(sfx0, o.r, o.lb)){ m4done = null; m4nrej = 'NOTIFY_PARTIAL_SAVE'; m4st.notifyRej[m4nrej] = (m4st.notifyRej[m4nrej] || 0) + 1; tally('nrej', m4nrej); return; }
    m4dseq++; m4nrej = null;
    m4done = { n: m4dseq, sfx: sfx0, loc: (o.loc == null ? null : String(o.loc)), lb: +o.lb, h: m4hash(sfx0), acct: m4acct() }; } catch(e){ m4done = null; } };
  function m4seen(d, lb, h){ var x = m4done; if (!x || x.n <= t4.dn) return false; if (x.sfx !== d.sfx || x.lb !== lb || x.h !== h) return false;
    var bl = m4blobLoc(d.sfx), cl = m4curLoc(); if (x.loc != null && ((bl != null && bl !== x.loc) || (cl != null && cl !== x.loc))) return false; return true; }
  function m4rej(code){ m4st.rejected[code] = (m4st.rejected[code] || 0) + 1; return code; }
  function m4stamp(d, chain){ var acct = m4acct(), dev = m4dev(true); if (!acct || !dev){ t4.stamped = false; return false; }
    if (t4.dacct && t4.dacct !== acct){ t4.stamped = false; m4st.notifyRej.NOTIFY_ACCT_CHANGED = (m4st.notifyRej.NOTIFY_ACCT_CHANGED || 0) + 1; tally('nrej', 'NOTIFY_ACCT_CHANGED'); return false; }   /* ★r3 ①: 知らせの時点のアカウントと違えば付けない */
    var n = m4seqNext(d.id); if (!n){ t4.stamped = false; return false; }
    var rec = { v: 2, acct: acct, sid: d.id, dev: dev, n: n, lb: t4.lb, h: t4.h, chain: chain, at: Date.now() }; if (!lss(M4K + d.id, JSON.stringify(rec))){ t4.stamped = false; return false; }
    t4.stamped = true; if (chain === 'empty') m4st.stamped++; else m4st.restamped++; return true; }
  function m4verify(d, lb, h){ var r = null; try { r = JSON.parse(lsg(M4K + d.id) || 'null'); } catch(e){ return 'BAD_STAMP'; } if (!r) return 'NO_STAMP'; if (r.v !== 2) return 'BAD_STAMP';
    var acct = m4acct(); if (!acct) return 'ACCT_UNKNOWN'; if (String(r.acct) !== acct) return 'ACCT_MISMATCH'; if (String(r.sid) !== d.id) return 'SID_MISMATCH';
    var dev = m4dev(false); if (!dev || String(r.dev) !== dev) return 'DEV_MISMATCH';
    var q = m4seqGet(), qn = q ? q.s[m4idh(d.id)] : null; if (qn == null) return 'SEQ_UNKNOWN'; if (r.n !== qn) return 'SEQ_MISMATCH';   /* ★r2 B */
    if (r.lb !== lb) return 'LB_MISMATCH'; if (r.h !== h) return 'HASH_MISMATCH'; return 'OK'; }
  /* ★MEM4 r5（#127-VX ④⑤）: 信用していない（untrusted・check の）間に、印があり、その hash か作ったターンが今の記憶と違うと分かったら、印と通し番号の行を消す。
     信用を落とした直後（認証されない作り直し・別の書き手・保存途中）と、その後に認証されない作り直しが保存された後のどちらも含む。
     こうすると、最後に認証された版（記憶と印の組）を snapshot などで戻しても、通し番号の行が無いので SEQ_UNKNOWN で認証しない。
     印の hash と作ったターンが今の記憶と合う（別のアカウント・別の端末・物語 id 違い・アカウント待ち）ときは消さない。MEM4 が ON（かつ腕 A が ON）のときだけ動く */
  function m4inval(){
    try {
      if (t4.state === 'trusted' || t4.state === 'clean' || t4.state === 'n/a') return;
      var d = docSfx(); if (!d || memEmpty(d.sfx)) return;
      var raw = lsg(M4K + d.id); if (raw == null) return; var r = null; try { r = JSON.parse(raw); } catch(eP){ return; }
      if (!r || typeof r !== 'object') return;
      if (r.h === m4hash(d.sfx) && r.lb === lbOf(d.sfx)) return;
      lsr(M4K + d.id); m4seqDrop(d.id); m4st.invalidated = (m4st.invalidated || 0) + 1; tally('inv');
    } catch(e){}
  }
  function track4(){ var pdk = t4.dk, ps = t4.state; var s4 = track4a(); if (ps === 'trusted' && s4 === 'untrusted' && t4.dk === pdk) tally('loss'); m4inval(); return s4; }   /* ★MEMTALLY: 同じ物語の trusted → untrusted を 1 回だけ数える */
  function track4a(){
    try {
      var d = docSfx(); if (!d){ t4 = { dk: null, state: 'n/a', why: null, lb: -1, h: null, stamped: false, since: 0 }; return 'n/a'; }
      var empty = memEmpty(d.sfx);
      if (t4.dk !== d.dk) t4 = { dk: d.dk, state: empty ? 'clean' : 'check', why: null, lb: -1, h: null, stamped: false, since: Date.now(), dn: m4dseq };
      if (empty){ if (t4.state !== 'clean'){ t4.state = 'clean'; t4.why = null; t4.since = Date.now(); } t4.dn = m4dseq; m4nrej = null;   /* ★r2 A: 空を見るたびに、それまでの知らせは使えなくする */
        if (lsg(M4K + d.id) != null){ lsr(M4K + d.id); m4seqDrop(d.id); m4st.removed++; } return 'clean'; }
      var lb = lbOf(d.sfx), h = m4hash(d.sfx);
      if (t4.state === 'clean'){ if (lb >= 0){
          if (m4seen(d, lb, h)){ t4.state = 'trusted'; t4.lb = lb; t4.h = h; t4.dn = m4done.n; t4.dacct = m4done.acct || null; t4.since = Date.now(); m4stamp(d, 'empty'); }   /* ★r2 A: 見届けた fix135 の完了と一致したときだけ */
          else { t4.state = 'untrusted'; t4.why = m4rej(m4nrej || 'UNSEEN_WRITER'); } }   /* ★r3: 使わなかった知らせがあれば、その理由 */
        return t4.state; }
      if (t4.state === 'check'){ var v = m4verify(d, lb, h);
        if (v === 'OK'){ t4.state = 'trusted'; t4.lb = lb; t4.h = h; t4.stamped = true; t4.why = null; t4.dn = m4dseq; m4st.verified++; }
        else if (v === 'ACCT_UNKNOWN'){ t4.why = v; }   /* アカウントが分かるまで待つ（その間は渡さない） */
        else { t4.state = 'untrusted'; t4.why = m4rej(v); }
        return t4.state; }
      if (t4.state === 'trusted'){
        if (h !== t4.h){ if (lb > t4.lb && m4seen(d, lb, h)){ t4.lb = lb; t4.h = h; t4.dn = m4done.n; t4.dacct = m4done.acct || null; m4stamp(d, 'chained'); }   /* ★r2 A: 作り直しも見届けたものだけ */
          else { t4.state = 'untrusted'; t4.why = m4rej(lb > t4.lb ? (m4nrej || 'UNSEEN_WRITER') : 'CHANGED_NO_REBUILD'); } }
        else if (!t4.stamped) m4stamp(d, 'empty');   /* アカウントが後から分かったとき、見届けた版に印を付ける */
      }
    } catch(e){ t4.state = 'untrusted'; t4.why = 'THREW'; }
    return t4.state;
  }
  function track(){
    if (m4On()) return track4();   /* ★MEM4 */
    try {
      var d = docSfx(); if (!d){ trust = { dk: null, state: 'n/a', since: 0 }; return trust.state; }
      if (trust.dk !== d.dk){ trust = { dk: d.dk, state: memEmpty(d.sfx) ? 'clean' : 'untrusted', since: Date.now() }; return trust.state; }
      var empty = memEmpty(d.sfx);
      if (empty){ if (trust.state !== 'clean'){ trust.state = 'clean'; trust.since = Date.now(); } }
      else if (trust.state === 'clean' && lbOf(d.sfx) >= 0){ trust.state = 'trusted'; trust.since = Date.now(); }
    } catch(e){ trust.state = 'untrusted'; }
    return trust.state;
  }
  track();   /* 読み込みの時点（fix246 の移行の後・fix135 の最初の確認〔3 秒後〕より前）の姿を記録 */
  try { setInterval(track, 1500); } catch(e){}
  function skip(code){ st.a.skip[code] = (st.a.skip[code] || 0) + 1; tally('skip', code); lastA = { applied: false, why: code, chars: 0, head80: '', at: Date.now() }; return null; }
  /* タグ・内部指示らしい文字列を除く */
  function clean(s){
    s = String(s == null ? '' : s);
    s = s.replace(/<[^<>]*>/g, ' ').replace(/<[^<>]*$/g, ' ');
    s = s.replace(/\b(?:react|state|say|summary|scene_move|think)\b\s+[A-Za-z_]+\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, ' ');
    s = s.replace(/\b[A-Za-z_]+\s*=\s*"[^"]*"/g, ' ');
    s = s.replace(/-{3,}[^\n]*-{3,}/g, ' ').replace(/[<>]/g, ' ');
    /* ★r2 (3): 日本語の内部の印。印の後ろの同じ文も内部の情報とみなして除く */
    /* ★r3（再レビューの条件 1）: 内部の印と分かる形だけ。①括弧の中身が印の語だけ（【内部】・（注））②印の語の直後に：/: が続く（（AIへの指示：…）・【注：…】）。
       【…】［…］〔…〕の①は、印の後ろの同じ文も内部の情報とみなして除く。丸括弧の①と②は括弧の中だけを除く。「（メモを取りながら）」「【注目】」などの普通の描写は残す */
    s = s.replace(new RegExp('[【\\[［〔]\\s*' + JP_MW + '\\s*[】\\]］〕][^。\\n]*。?', 'g'), ' ');
    s = s.replace(new RegExp('[【\\[［〔（(]\\s*' + JP_MW + '\\s*[：:][^】\\]］〕）)]{0,120}[】\\]］〕）)]', 'g'), ' ');
    s = s.replace(new RegExp('[（(]\\s*' + JP_MW + '\\s*[）)]', 'g'), ' ');
    s = s.replace(/\[\[[^\]]*\]\]/g, ' ');
    labels().forEach(function(w){ if (w) s = s.split(w).join(' '); });
    s = s.replace(/\b[A-Za-z_]+\s*[=＝]\s*[^\s、。]+/g, ' ');
    s = s.replace(/[\r\n\t]+/g, ' ').replace(/[ 　]{2,}/g, ' ').trim();
    return s;
  }
  var JP_MARK = '内部|システム|指示|注意書き|メモ|注|ルール|設定上|裏設定|メタ|GM|ＧＭ|sys|SYS|プロンプト|出力|形式|タグ|ラベル';
  var JP_MW = '(?:(?:AI|ＡＩ)(?:への|へ)?)?(?:' + JP_MARK + ')';   /* ★r3: 印の語（前に「AIへの」が付いてもよい）。これだけで括弧を閉じるか、直後に：/: が続くときだけ除く */
  /* LEAK1 の内部ラベルの語（共有。無ければ同じ語の写し） */
  var LABELS0 = ['状態ラベル', '移動タグ', '話者タグ', '状態タグ', '反応タグ', 'sayタグ', 'stateタグ', '状態の出力', '出力の形式'];
  function labels(){ try { var L = window.__v292DfixLEAK1; if (L && L.core && Array.isArray(L.core.LABELS) && L.core.LABELS.length) return L.core.LABELS; } catch(e){} return LABELS0; }
  function curState(st0){ if (st0 && Array.isArray(st0.turns)) return st0; try { if (window.S && Array.isArray(window.S.turns)) return window.S; } catch(e){} return null; }
  /* この物語の長期記憶を読む（接尾辞つきのキーを直接）。合わなければ null と見送りの理由 */
  function readMem(S){
    var dk = window.__chronicleDocumentStoryKey;
    if (typeof dk !== 'string' || !dk) return skip('NO_DOC_KEY');
    var m = /^chr6_slot_([A-Za-z0-9_-]{1,80})$/.exec(dk); if (!m) return skip('NOT_SLOT');
    var id = m[1], sfx = '_slot_' + id;
    if (window.__v292Dfix246 !== 1) return skip('NO_SLOT_ISO');
    if (lsg('v292Dfix783Off') === '1') return skip('F783_OFF');
    try { var F = window.__v292Dfix697; var sid = (F && typeof F.status === 'function') ? F.status().storyId : null; if (sid == null || sid === '') return skip('ID_UNKNOWN'); if (String(sid) !== id) return skip('ID_MISMATCH'); } catch(e){ return skip('ID_UNKNOWN'); }   /* ★r2 (2): 読めない・null は見送る */
    try { var b = JSON.parse(lsg(dk) || 'null'); var bl = b && b.scene ? (b.scene.loc || null) : null, sl = S.scene ? (S.scene.loc || null) : null; if (bl && sl && bl !== sl) return skip('LOC_MISMATCH'); } catch(e){}
    var ts = track(); if (ts !== 'trusted') return skip(ts === 'clean' ? 'NOT_BUILT_YET' : (m4On() ? ('M4_' + (t4.why || (ts === 'check' ? 'CHECK' : 'UNTRUSTED'))) : 'NOT_SESSION_BUILT'));   /* ★r2 (1)・★MEM4: 見送りの理由 M4_* */
    var cur = S.turns.length - 1, lb = parseInt(lsg('chr6_v292Dfix135_last' + sfx) || '-1', 10);
    if (!(lb >= 0)) return skip('NO_MEMORY');
    if (lb > cur) return skip('STALE_FUTURE');
    var sum = '', ev = [];
    try { sum = String(lsg('chr6_v292Dfix135_sum' + sfx) || ''); } catch(e){}
    try { var e0 = JSON.parse(lsg('chr6_v292Dfix137_ev' + sfx) || '[]'); if (Array.isArray(e0)) ev = e0; } catch(e){ ev = []; }
    var wi = [];
    if (m3bOn() || exp1On()){ try { var w0 = JSON.parse(lsg('chr6_v292Dfix136_wi' + sfx) || '[]'); if (Array.isArray(w0)) wi = w0; } catch(e){ wi = []; } }   /* ★MEM3b: 人物の表を読むだけ（書かない） */
    return { sum: sum, ev: ev, cur: cur, lb: lb, wi: wi };
  }
  /* ★MEM3b（laneMEM3・2026-11-17・既定 OFF: v292DfixMEM3bOn='1'・kill v292DfixMEM3bOff='1'）: 覚え書きの組み立ての順を変える。
     実測（mem2/LONGMEM_GRADE.md）: 確定事実（名乗った勤め先 など）は、作り直しで summary から落ちても、人物の表（worldinfo）には残っていた（fix135 は worldinfo を前の版と merge する）。
     MEM2 は summary と出来事しか渡していなかった。そこで ① あらすじ（520 字まで）② 人物の表の character の行（6 行・240 字まで・各 70 字まで）③ 出来事（残りに、新しい順）の順に詰める。
     人物の行は表の説明をそのまま写すだけ（推測で埋めない・行を合わせない）。名前が（ で始まる行・説明に「未登録キャラ」がある行（抽出側の注記）・同じ説明の重複は外す。保存・表には何も書かない。 */
  var M3B_SUM = 520, M3B_PPL = 240, M3B_ROW = 70, M3B_ROWS = 6, M3B_EV_MIN = 200;   /* ★MEM3 r2: 出来事の枠を最低 200 字ぶん先に取る */
  var lastParts = null;
  var RULE3B = '出来事は起きた順に並ぶ。同じ事柄の行が複数あるときは、番号の大きい（後の）行が今の値。';   /* ★MEM3 r4（r3 の出来事は起きたターンの値のまま＝古い値と新しい値の行が並びうる） */
  /* ★MEM3 r2: あらすじを limit 字に詰める。「確定：…未定：…」の形なら、先に「未定：」の部を削り、「確定：」の部を残す */
  /* ★MEM3 r6/r7 (c): 「確定：…経過：…未定：…」の形で枠を超えるとき、確定は削らず、残りを経過と未定で分ける（未定に最低 120 字か全文。経過から詰める）。
     確定だけで枠を超えるときは r5 と同じ詰め方（未定・経過は入らない）。r6 は確定も削って未定の枠を作っていたが、確定（長く有効な事実）を優先する（r7・README）。 */
  var M3B_PEND_MIN = 120;
  function trimSum3(sum, limit){
    var a = sum.indexOf('確定：'), b = sum.indexOf('経過：'), u = sum.indexOf('未定：');
    if (!(a === 0 && b > a && u > b)) return null;
    var fx = sum.slice(a, b).replace(/[\s、]+$/, ''), pr = sum.slice(b, u).replace(/[\s、]+$/, ''), pd = sum.slice(u).replace(/[\s、]+$/, '');
    var rem = limit - fx.length - 2; if (rem < 12) return null;
    var pdA = Math.min(pd.length, Math.max(Math.min(M3B_PEND_MIN, rem), rem - pr.length - 1)), prA = rem - pdA - 1;
    var parts = [fx]; if (prA >= 16) parts.push(prA >= pr.length ? pr : trimPlain(pr, prA)); parts.push(pdA >= pd.length ? pd : trimPlain(pd, pdA));
    var t = parts.join(' '); return t.length > limit ? t.slice(0, limit) : t;
  }
  function trimSum(sum, limit){
    if (sum.length <= limit) return sum;
    var t3 = trimSum3(sum, limit); if (t3 != null) return t3;   /* ★MEM3 r6/r7 (c) */
    var u = sum.indexOf('未定：');
    if (u > 0){ var fixed = sum.slice(0, u).replace(/[\s、]+$/, ''); var rest = sum.slice(u); if (fixed.length + 1 <= limit){ var room = limit - fixed.length - 1; return room >= 12 ? (fixed + ' ' + trimPlain(rest, room)) : fixed; } sum = fixed; }
    return trimPlain(sum, limit);
  }
  function trimPlain(s, limit){ if (s.length <= limit) return s; var cut = s.slice(0, limit - 1), k = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、')); return (k >= Math.min(SUM_MIN, limit >> 1) ? cut.slice(0, k + 1) : cut) + '…'; }
  /* ★EXP1: 覚え書きの「経験と習得」の節（部品が条件を見る。OFF・無いときは ''）と、その分の枠 LIM */
  var LIM = MAX;
  function exp1On(){ try { var X = window.__v292DfixEXP1; return !!(X && typeof X.on === 'function' && X.on()); } catch(e){ return false; } }
  function exp1Sec(mem){ try { var X = window.__v292DfixEXP1; return (X && typeof X.section === 'function') ? (X.section(mem && mem.wi, clean) || '') : ''; } catch(e){ return ''; } }
  function compose3b(mem){
    /* 出来事（新しい順）: まず最低 200 字ぶん（1 件目はそれを超えても 1 件は入れる）を確保 */
    var evs = mem.ev.filter(function(e){ return e && typeof e.turnIdx === 'number' && e.turnIdx <= mem.cur && e.event; }).map(function(e){ return { t: e.turnIdx, imp: e.importance || 0, s: clean(e.event) }; }).filter(function(e){ return e.s; });
    evs.sort(function(a, b){ return (b.t - a.t) || (b.imp - a.imp); });
    var head = '出来事：', ln = function(e){ return '\n・T' + (e.t + 1) + ' ' + e.s; }, pick = [], eu = 0, ei = 0;
    for (; ei < evs.length; ei++){ var l0 = ln(evs[ei]); if (pick.length && head.length + eu + l0.length > M3B_EV_MIN) break; if (l0.length > M3B_EV_MIN) l0 = l0.slice(0, M3B_EV_MIN - head.length - 1) + '…'; pick.push({ t: evs[ei].t, line: l0 }); eu += l0.length; }
    var evRes = pick.length ? head.length + eu : 0;
    /* 人物の表（240 字まで・残りの範囲で） */
    var seen = {}, rows = [], pl = 0, pplCap = Math.min(M3B_PPL, LIM - evRes - 1 - 60);
    (mem.wi || []).forEach(function(w){ if (!w || w.type !== 'character' || !w.name || rows.length >= M3B_ROWS) return; var n = clean(w.name), d = clean(w.desc); if (!n || /^[（(]/.test(String(w.name)) || /未登録キャラ/.test(String(w.desc || '')) || !d || seen[d]) return; seen[d] = 1;
      var line = '\n・' + n + '：' + d; if (line.length > M3B_ROW) line = line.slice(0, M3B_ROW - 1) + '…'; if (pl + line.length > pplCap) return; rows.push(line); pl += line.length; });
    var PH = '人物（記録した説明。本文で変わっていれば本文が優先）：', pt = rows.length ? PH + rows.join('') : '';
    if (pt && PH.length + pl > pplCap + PH.length) pt = '';
    /* あらすじ（残りで・520 字まで・「確定：」の部を優先して残す） */
    var sum = clean(mem.sum), sumTxt = '', sroom = LIM - evRes - (pt ? pt.length + 1 : 0) - (evRes ? 1 : 0) - 'あらすじ：'.length;
    if (sum && sroom >= 20) sumTxt = 'あらすじ：' + trimSum(sum, Math.min(M3B_SUM, sroom));
    /* 余りがあれば、出来事をさらに新しい順に足す */
    var used = (sumTxt ? sumTxt.length : 0) + (pt ? pt.length + (sumTxt ? 1 : 0) : 0) + (evRes ? evRes + ((sumTxt || pt) ? 1 : 0) : 0);
    for (; ei < evs.length && pick.length; ei++){ var l1 = ln(evs[ei]); if (used + l1.length > LIM) break; pick.push({ t: evs[ei].t, line: l1 }); eu += l1.length; used += l1.length; }
    pick.sort(function(a, b){ return a.t - b.t; });
    var evTxt = pick.length ? head + pick.map(function(e){ return e.line; }).join('') : '';
    var text = [sumTxt, pt, evTxt].filter(Boolean).join('\n'); st.a.m3b = (st.a.m3b || 0) + 1;
    if (text.length > LIM) text = text.slice(0, LIM);
    lastParts = { sum: { chars: sumTxt.length, kept: sumTxt ? (/未定：/.test(sumTxt) ? 'both' : (/確定：/.test(sumTxt) ? 'fixedOnly' : 'plain')) : 'none', pendingChars: sumTxt.indexOf('未定：') >= 0 ? sumTxt.length - sumTxt.indexOf('未定：') : 0 }, people: { chars: pt.length, rows: pt ? rows.length : 0 }, events: { chars: evTxt.length, count: pick.length, available: evs.length }, total: text.length };
    return text;
  }
  /* 本文（最大 800 字）: 新しい出来事を優先して入れ、残りにあらすじ */
  function compose(mem){
    if (m3bOn()) return compose3b(mem);   /* ★MEM3b（OFF は従来と同じ組み立て） */
    var evs = mem.ev.filter(function(e){ return e && typeof e.turnIdx === 'number' && e.turnIdx <= mem.cur && e.event; })
      .map(function(e){ return { t: e.turnIdx, imp: e.importance || 0, s: clean(e.event) }; }).filter(function(e){ return e.s; });
    evs.sort(function(a, b){ return (b.t - a.t) || (b.imp - a.imp); });
    var head = '出来事：', pick = [], used = 0;
    for (var i = 0; i < evs.length; i++){ var line = '\n・T' + (evs[i].t + 1) + ' ' + evs[i].s; if (used + head.length + line.length > LIM) break; pick.push(evs[i]); used += line.length; }
    pick.sort(function(a, b){ return a.t - b.t; });
    var evTxt = pick.length ? (head + pick.map(function(e){ return '\n・T' + (e.t + 1) + ' ' + e.s; }).join('')) : '';
    var room = LIM - evTxt.length - (evTxt ? 1 : 0) - 'あらすじ：'.length, sum = clean(mem.sum), sumTxt = '';
    if (sum && room >= SUM_MIN){ if (sum.length > room){ var cut = sum.slice(0, room - 1), k = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、')); sum = (k >= SUM_MIN ? cut.slice(0, k + 1) : cut) + '…'; } sumTxt = 'あらすじ：' + sum; }
    var text = [sumTxt, evTxt].filter(Boolean).join('\n');
    return text.length > LIM ? text.slice(0, LIM) : text;
  }
  /* 腕 A: fix58 userExt から呼ばれる。OFF・見送りのときは parsed をそのまま（同じオブジェクト）返す */
  function applyA(parsed, state){
    if (!aOn()){ if (aKey()) trialOk('a'); return parsed; }   /* ★MEMTRIAL: 鍵は ON だが Owner の確認が取れない回を数える（送信は OFF と同じ） */
    st.a.calls++;
    try {
      var S = curState(state); if (!S || !parsed || typeof parsed !== 'object') { skip('NO_STATE'); return parsed; }
      var mem = readMem(S); if (!mem) return parsed;
      var e1sec = exp1Sec(mem); LIM = MAX - (e1sec ? e1sec.length + 1 : 0); var text; try { text = compose(mem); } finally { LIM = MAX; } if (e1sec) text = text ? (text + '\n' + e1sec) : e1sec; if (!text){ skip('EMPTY'); return parsed; }   /* ★EXP1: 節の分だけ先に枠を小さくする（OFF は LIM = MAX で同じ組み立て） */
      var rule = m3bOn() ? (RULE + RULE3B) : RULE;   /* ★MEM3 r4: MEM3b ON のときだけ、出来事の読み方を書式の説明として 1 文足す（OFF は従来と同じ文字列） */
      var o = {}, k, placed = false, after = Object.prototype.hasOwnProperty.call(parsed, 'earlierFacts') ? 'earlierFacts' : (Object.prototype.hasOwnProperty.call(parsed, 'storySoFar') ? 'storySoFar' : null);
      if (!after){ o.memoryNotes = { rule: rule, text: text }; placed = true; }
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'memoryNotes') continue; o[k] = parsed[k]; if (k === after){ o.memoryNotes = { rule: rule, text: text }; placed = true; } }
      if (!placed) o.memoryNotes = { rule: rule, text: text };
      st.a.applied++; st.a.chars += text.length; tally('inj');
      lastA = { applied: true, why: null, chars: text.length, head80: text.slice(0, 80), at: Date.now(), parts: m3bOn() ? lastParts : null };   /* ★MEM3 r2: MEM3b の内訳（あらすじ／人物／出来事の字数と件数） */
      return o;
    } catch(e){ skip('THREW'); return parsed; }
  }
  /* 腕 C: fix58 userExt の recentScenes のターン数 */
  function recentN(){ if (!cOn()) return 2; st.c.calls++; st.c.applied++; st.c.turns += 4; lastC = { turns: 4, at: Date.now() }; return 4; }
  window.__v292DfixMEM2 = {
    VER: VER, aOn: aOn, cOn: cOn, m3bOn: m3bOn, applyA: applyA, recentN: recentN, clean: clean, MAX: MAX, RULE: RULE,
    tally: function(){ try { var o = JSON.parse(lsg(TK) || 'null'); return (o && o.v === 1 && o.d && typeof o.d === 'object') ? o : null; } catch(e){ return null; } },   /* ★MEMTALLY: 読むだけ（呼んだときだけ読む・UI なし） */
    stats: function(){ var o = JSON.parse(JSON.stringify(st)); o.trust = { state: trust.state }; o.trial = JSON.parse(JSON.stringify(trialSt)); if (m4On()) o.m4 = { state: t4.state, why: t4.why, stamped: t4.stamped, counts: JSON.parse(JSON.stringify(m4st)) }; return o; },   /* ★MEM4: 数と理由だけ（acct・dev・hash は出さない） */
    m4On: m4On,
    trust: function(){ track(); return { state: trust.state, since: trust.since }; },
    last: function(){ return { a: lastA ? JSON.parse(JSON.stringify(lastA)) : null, c: lastC ? JSON.parse(JSON.stringify(lastC)) : null }; }
  };
})();
