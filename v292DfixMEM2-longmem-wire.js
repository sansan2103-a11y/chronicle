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
  function aOn(){ return lsg('v292DfixMEM2aOff') !== '1' && lsg('v292DfixMEM2aOn') === '1'; }
  function cOn(){ return lsg('v292DfixMEM2cOff') !== '1' && lsg('v292DfixMEM2cOn') === '1'; }
  function m3bOn(){ return lsg('v292DfixMEM3bOff') !== '1' && lsg('v292DfixMEM3bOn') === '1'; }   /* ★MEM3b（既定 OFF・腕 A が ON のときだけ効く） */
  var st = { a: { calls: 0, applied: 0, chars: 0, skip: {} }, c: { calls: 0, applied: 0, turns: 0 } };
  var lastA = null, lastC = null;
  /* ★r2 (1): この物語の記憶が「このページで空から作られた」かを、メモリだけで追う */
  var LMK = ['chr6_v292Dfix135_sum', 'chr6_v292Dfix136_wi', 'chr6_v292Dfix137_ev', 'chr6_v292Dfix135_last'];
  var trust = { dk: null, state: 'n/a', since: 0 };   /* state: clean（空を見た）／trusted（空から作られた）／untrusted（読み込み時に既にあった）／n/a */
  function docSfx(){ var dk = window.__chronicleDocumentStoryKey; var m = (typeof dk === 'string') ? /^chr6_slot_([A-Za-z0-9_-]{1,80})$/.exec(dk) : null; return m ? { dk: dk, id: m[1], sfx: '_slot_' + m[1] } : null; }
  function memEmpty(sfx){ for (var i = 0; i < LMK.length; i++){ if (lsg(LMK[i] + sfx) != null) return false; } return true; }
  function lbOf(sfx){ var v = parseInt(lsg('chr6_v292Dfix135_last' + sfx) || '-1', 10); return (v >= 0) ? v : -1; }
  function track(){
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
  function skip(code){ st.a.skip[code] = (st.a.skip[code] || 0) + 1; lastA = { applied: false, why: code, chars: 0, head80: '', at: Date.now() }; return null; }
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
    var ts = track(); if (ts !== 'trusted') return skip(ts === 'clean' ? 'NOT_BUILT_YET' : 'NOT_SESSION_BUILT');   /* ★r2 (1) */
    var cur = S.turns.length - 1, lb = parseInt(lsg('chr6_v292Dfix135_last' + sfx) || '-1', 10);
    if (!(lb >= 0)) return skip('NO_MEMORY');
    if (lb > cur) return skip('STALE_FUTURE');
    var sum = '', ev = [];
    try { sum = String(lsg('chr6_v292Dfix135_sum' + sfx) || ''); } catch(e){}
    try { var e0 = JSON.parse(lsg('chr6_v292Dfix137_ev' + sfx) || '[]'); if (Array.isArray(e0)) ev = e0; } catch(e){ ev = []; }
    var wi = [];
    if (m3bOn()){ try { var w0 = JSON.parse(lsg('chr6_v292Dfix136_wi' + sfx) || '[]'); if (Array.isArray(w0)) wi = w0; } catch(e){ wi = []; } }   /* ★MEM3b: 人物の表を読むだけ（書かない） */
    return { sum: sum, ev: ev, cur: cur, lb: lb, wi: wi };
  }
  /* ★MEM3b（laneMEM3・2026-11-17・既定 OFF: v292DfixMEM3bOn='1'・kill v292DfixMEM3bOff='1'）: 覚え書きの組み立ての順を変える。
     実測（mem2/LONGMEM_GRADE.md）: 確定事実（名乗った勤め先 など）は、作り直しで summary から落ちても、人物の表（worldinfo）には残っていた（fix135 は worldinfo を前の版と merge する）。
     MEM2 は summary と出来事しか渡していなかった。そこで ① あらすじ（520 字まで）② 人物の表の character の行（6 行・240 字まで・各 70 字まで）③ 出来事（残りに、新しい順）の順に詰める。
     人物の行は表の説明をそのまま写すだけ（推測で埋めない・行を合わせない）。名前が（ で始まる行・説明に「未登録キャラ」がある行（抽出側の注記）・同じ説明の重複は外す。保存・表には何も書かない。 */
  var M3B_SUM = 520, M3B_PPL = 240, M3B_ROW = 70, M3B_ROWS = 6, M3B_EV_MIN = 200;   /* ★MEM3 r2: 出来事の枠を最低 200 字ぶん先に取る */
  var lastParts = null;
  /* ★MEM3 r2: あらすじを limit 字に詰める。「確定：…未定：…」の形なら、先に「未定：」の部を削り、「確定：」の部を残す */
  function trimSum(sum, limit){
    if (sum.length <= limit) return sum;
    var u = sum.indexOf('未定：');
    if (u > 0){ var fixed = sum.slice(0, u).replace(/[\s、]+$/, ''); var rest = sum.slice(u); if (fixed.length + 1 <= limit){ var room = limit - fixed.length - 1; return room >= 12 ? (fixed + ' ' + trimPlain(rest, room)) : fixed; } sum = fixed; }
    return trimPlain(sum, limit);
  }
  function trimPlain(s, limit){ if (s.length <= limit) return s; var cut = s.slice(0, limit - 1), k = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、')); return (k >= Math.min(SUM_MIN, limit >> 1) ? cut.slice(0, k + 1) : cut) + '…'; }
  function compose3b(mem){
    /* 出来事（新しい順）: まず最低 200 字ぶん（1 件目はそれを超えても 1 件は入れる）を確保 */
    var evs = mem.ev.filter(function(e){ return e && typeof e.turnIdx === 'number' && e.turnIdx <= mem.cur && e.event; }).map(function(e){ return { t: e.turnIdx, imp: e.importance || 0, s: clean(e.event) }; }).filter(function(e){ return e.s; });
    evs.sort(function(a, b){ return (b.t - a.t) || (b.imp - a.imp); });
    var head = '出来事：', ln = function(e){ return '\n・T' + (e.t + 1) + ' ' + e.s; }, pick = [], eu = 0, ei = 0;
    for (; ei < evs.length; ei++){ var l0 = ln(evs[ei]); if (pick.length && head.length + eu + l0.length > M3B_EV_MIN) break; if (l0.length > M3B_EV_MIN) l0 = l0.slice(0, M3B_EV_MIN - head.length - 1) + '…'; pick.push({ t: evs[ei].t, line: l0 }); eu += l0.length; }
    var evRes = pick.length ? head.length + eu : 0;
    /* 人物の表（240 字まで・残りの範囲で） */
    var seen = {}, rows = [], pl = 0, pplCap = Math.min(M3B_PPL, MAX - evRes - 1 - 60);
    (mem.wi || []).forEach(function(w){ if (!w || w.type !== 'character' || !w.name || rows.length >= M3B_ROWS) return; var n = clean(w.name), d = clean(w.desc); if (!n || /^[（(]/.test(String(w.name)) || /未登録キャラ/.test(String(w.desc || '')) || !d || seen[d]) return; seen[d] = 1;
      var line = '\n・' + n + '：' + d; if (line.length > M3B_ROW) line = line.slice(0, M3B_ROW - 1) + '…'; if (pl + line.length > pplCap) return; rows.push(line); pl += line.length; });
    var PH = '人物（記録した説明。本文で変わっていれば本文が優先）：', pt = rows.length ? PH + rows.join('') : '';
    if (pt && PH.length + pl > pplCap + PH.length) pt = '';
    /* あらすじ（残りで・520 字まで・「確定：」の部を優先して残す） */
    var sum = clean(mem.sum), sumTxt = '', sroom = MAX - evRes - (pt ? pt.length + 1 : 0) - (evRes ? 1 : 0) - 'あらすじ：'.length;
    if (sum && sroom >= 20) sumTxt = 'あらすじ：' + trimSum(sum, Math.min(M3B_SUM, sroom));
    /* 余りがあれば、出来事をさらに新しい順に足す */
    var used = (sumTxt ? sumTxt.length : 0) + (pt ? pt.length + (sumTxt ? 1 : 0) : 0) + (evRes ? evRes + ((sumTxt || pt) ? 1 : 0) : 0);
    for (; ei < evs.length && pick.length; ei++){ var l1 = ln(evs[ei]); if (used + l1.length > MAX) break; pick.push({ t: evs[ei].t, line: l1 }); eu += l1.length; used += l1.length; }
    pick.sort(function(a, b){ return a.t - b.t; });
    var evTxt = pick.length ? head + pick.map(function(e){ return e.line; }).join('') : '';
    var text = [sumTxt, pt, evTxt].filter(Boolean).join('\n'); st.a.m3b = (st.a.m3b || 0) + 1;
    if (text.length > MAX) text = text.slice(0, MAX);
    lastParts = { sum: { chars: sumTxt.length, kept: sumTxt ? (/未定：/.test(sumTxt) ? 'both' : (/確定：/.test(sumTxt) ? 'fixedOnly' : 'plain')) : 'none' }, people: { chars: pt.length, rows: pt ? rows.length : 0 }, events: { chars: evTxt.length, count: pick.length, available: evs.length }, total: text.length };
    return text;
  }
  /* 本文（最大 800 字）: 新しい出来事を優先して入れ、残りにあらすじ */
  function compose(mem){
    if (m3bOn()) return compose3b(mem);   /* ★MEM3b（OFF は従来と同じ組み立て） */
    var evs = mem.ev.filter(function(e){ return e && typeof e.turnIdx === 'number' && e.turnIdx <= mem.cur && e.event; })
      .map(function(e){ return { t: e.turnIdx, imp: e.importance || 0, s: clean(e.event) }; }).filter(function(e){ return e.s; });
    evs.sort(function(a, b){ return (b.t - a.t) || (b.imp - a.imp); });
    var head = '出来事：', pick = [], used = 0;
    for (var i = 0; i < evs.length; i++){ var line = '\n・T' + (evs[i].t + 1) + ' ' + evs[i].s; if (used + head.length + line.length > MAX) break; pick.push(evs[i]); used += line.length; }
    pick.sort(function(a, b){ return a.t - b.t; });
    var evTxt = pick.length ? (head + pick.map(function(e){ return '\n・T' + (e.t + 1) + ' ' + e.s; }).join('')) : '';
    var room = MAX - evTxt.length - (evTxt ? 1 : 0) - 'あらすじ：'.length, sum = clean(mem.sum), sumTxt = '';
    if (sum && room >= SUM_MIN){ if (sum.length > room){ var cut = sum.slice(0, room - 1), k = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、')); sum = (k >= SUM_MIN ? cut.slice(0, k + 1) : cut) + '…'; } sumTxt = 'あらすじ：' + sum; }
    var text = [sumTxt, evTxt].filter(Boolean).join('\n');
    return text.length > MAX ? text.slice(0, MAX) : text;
  }
  /* 腕 A: fix58 userExt から呼ばれる。OFF・見送りのときは parsed をそのまま（同じオブジェクト）返す */
  function applyA(parsed, state){
    if (!aOn()) return parsed;
    st.a.calls++;
    try {
      var S = curState(state); if (!S || !parsed || typeof parsed !== 'object') { skip('NO_STATE'); return parsed; }
      var mem = readMem(S); if (!mem) return parsed;
      var text = compose(mem); if (!text){ skip('EMPTY'); return parsed; }
      var o = {}, k, placed = false, after = Object.prototype.hasOwnProperty.call(parsed, 'earlierFacts') ? 'earlierFacts' : (Object.prototype.hasOwnProperty.call(parsed, 'storySoFar') ? 'storySoFar' : null);
      if (!after){ o.memoryNotes = { rule: RULE, text: text }; placed = true; }
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'memoryNotes') continue; o[k] = parsed[k]; if (k === after){ o.memoryNotes = { rule: RULE, text: text }; placed = true; } }
      if (!placed) o.memoryNotes = { rule: RULE, text: text };
      st.a.applied++; st.a.chars += text.length;
      lastA = { applied: true, why: null, chars: text.length, head80: text.slice(0, 80), at: Date.now(), parts: m3bOn() ? lastParts : null };   /* ★MEM3 r2: MEM3b の内訳（あらすじ／人物／出来事の字数と件数） */
      return o;
    } catch(e){ skip('THREW'); return parsed; }
  }
  /* 腕 C: fix58 userExt の recentScenes のターン数 */
  function recentN(){ if (!cOn()) return 2; st.c.calls++; st.c.applied++; st.c.turns += 4; lastC = { turns: 4, at: Date.now() }; return 4; }
  window.__v292DfixMEM2 = {
    VER: VER, aOn: aOn, cOn: cOn, m3bOn: m3bOn, applyA: applyA, recentN: recentN, clean: clean, MAX: MAX, RULE: RULE,
    stats: function(){ var o = JSON.parse(JSON.stringify(st)); o.trust = { state: trust.state }; return o; },
    trust: function(){ track(); return { state: trust.state, since: trust.since }; },
    last: function(){ return { a: lastA ? JSON.parse(JSON.stringify(lastA)) : null, c: lastC ? JSON.parse(JSON.stringify(lastC)) : null }; }
  };
})();
