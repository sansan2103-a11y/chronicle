/* v292DfixFLW5-home-noop-save.js — FLOWFIX 5-C（GPT #127-PC「5：5-C（DIRTY 判定の原因）を優先して調査・Local GO」）
 * 何を直すか（合成で再現・80 の木でも同じ）:
 *   物語画面の「🏠 ホーム」は fix527 の「中身が同じなら保存しない」判定を通るが、その判定は
 *     保存先の文字列  vs  JSON.stringify({cfg,cast,scene,turns,mode})
 *   を比べていた。実際の保存（features.js の named slot 保存）は既存の body.origin（シナリオ由来の 2 key）を引き継いで書くので、
 *   シナリオから始めた物語では保存先に origin があり、メモリ側の文字列には無い → 毎回「違う」→ 毎回書く。
 *   さらに cast.av2.known の中の表示用の値（appeared など・正本には入らない）がメモリだけ違うことがある。
 *   書くと fix781 の印が DIRTY になるが、正本の中身は 1 字も変わっていないので送るものが無く、ホームには印を直す道も無い。
 *   → 何分待っても削除シートに「まだクラウドへ保存されていない変更があります」（HR1 の改名も止まる）。
 * やること（🏠 を押したときだけ）— r3（lane83・GPT #127-PG: ① だけ。② は外した）:
 *   ① 主修正（書かない）: 保存が書く形（cfg,cast,scene,turns,mode ＋ 保存先にある妥当な origin。fixORG と同じ whitelist・
 *      v292DfixOrgOff のときは origin なし・既定 slot 'chr6' は origin なし）と保存先が 1 バイトも違わなければ書かない（r1 と同じ）。
 *      それでも違うときは「意味の比較」をする: 両方を JSON で読み、意味を持たないと分かっている 2 つの差
 *        ・保存先の origin（fixORG が保存のたびに引き継ぐ provenance・正本の hash に入らない）
 *        ・cast.av2.known.<id>.appeared（表示用の sticky 印の写し・readback が毎ターン appeared 無しの形へ書き直す・正本の hash に入らない）
 *      だけを両方から外し、key の並びをそろえて比べる。保存先にこの 6 key 以外の key があれば「違う」（保存すると消えるので）。
 *      一致すれば書かない（SAME_SEMANTIC_NO_WRITE）。メモリの値はそのまま（次の普通の保存で運ばれる）。
 *   ② は r3（GPT #127-PG）で外した: ① で一致しないときは従来どおり保存し、fix781 の印には触れない（DIRTY を CLEAN に戻す道は無い）。
 *   本当に未保存の変更がある場合（押す前から DIRTY・送信中・メモリに意味のある違い・正本の hash が lastConfirmed と違う）は従来どおり警告が出る。
 *   数え口: status().stats.semNoWrite（① の意味の比較で書かなかった回数）。p2run / p2reverted は r3 では常に 0（記録の形を変えないため残す）。
 *   console には '[FLW5] home: <理由>' を 1 行（理由コードだけ・本文や名前は出さない）。
 * 変えないもの: SN1（flushForNav）・fix781・fix898・fix697・HR1・削除シートの判定（読むだけ・呼ぶだけ）。通信は増やさない
 *   （r3: hash も計算しない）。FLW5 自身が書くものは無い（① で書かない／一致しないときは従来の保存だけ）。
 * kill: localStorage v292DfixFLW5Off='1' → fix527 の従来の判定（homeClick は false を返す）。
 *       v292Dfix527NoopHomeSaveOff='1'（fix527 の「常に保存」）のときも従来の道へ戻す。
 * 検証口: window.__v292DfixFLW5 = { version, off, homeClick(btn, go), candidate(S, cur, wk), semKey(raw), status() }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixFLW5) return;
  var VERSION = 'FLW5-r3', TAG = '[FLW5]';
  var stats = { calls: 0, sameNoWrite: 0, semNoWrite: 0, saved: 0, reverted: 0, kept: 0, p2run: 0, p2reverted: 0, p2kept: 0, last: null };
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292DfixFLW5Off') === '1'; }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function marker(id){ try { var m = JSON.parse(lsg('v292Dfix402_f781g_' + id) || 'null'); return (m && typeof m === 'object') ? m : null; } catch(e){ return null; } }
  /* features.js fixORG orgValid と同じ規則（id は英数 _ - 1〜64 字、rev は 0〜2^31-1 の整数） */
  function orgValid(o){
    if (!o || typeof o !== 'object' || Object.prototype.toString.call(o) === '[object Array]') return null;
    var oid = o.scenarioId, orv = o.scenarioRev;
    if (typeof oid === 'string' && oid.length >= 1 && oid.length <= 64 && /^[A-Za-z0-9_-]+$/.test(oid) &&
        typeof orv === 'number' && isFinite(orv) && Math.floor(orv) === orv && orv >= 0 && orv <= 2147483647) return { scenarioId: oid, scenarioRev: orv };
    return null;
  }
  /* 保存（features.js named slot）が書く文字列と同じ形 */
  function candidate(S, cur, wk){
    var payload = { cfg: S.cfg, cast: S.cast, scene: S.scene, turns: S.turns, mode: S.mode };
    if (wk !== 'chr6' && lsg('v292DfixOrgOff') !== '1' && cur != null){
      var prev = null; try { prev = JSON.parse(cur); } catch(e){ prev = null; }
      var o = orgValid(prev && typeof prev === 'object' ? prev.origin : null);
      if (o) payload.origin = { scenarioId: o.scenarioId, scenarioRev: o.scenarioRev };
    }
    return JSON.stringify(payload);
  }
  /* ★r2: 意味の比較。保存の本文（JSON 文字列）を読み、意味を持たないと分かっている 2 つの差だけを外し、key の並びをそろえた文字列にする。
     読めない・object でない・保存が書かない key がある → null（＝判定できない／違う扱い）。 */
  var SAVE_KEYS = { cfg: 1, cast: 1, scene: 1, turns: 1, mode: 1, origin: 1 };
  function stable(v){
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]'){ var a = []; for (var i = 0; i < v.length; i++) a.push(stable(v[i])); return '[' + a.join(',') + ']'; }
    var ks = Object.keys(v).sort(), o = [];
    for (var j = 0; j < ks.length; j++){ if (v[ks[j]] === undefined) continue; o.push(JSON.stringify(ks[j]) + ':' + stable(v[ks[j]])); }
    return '{' + o.join(',') + '}';
  }
  function semKey(raw){
    if (typeof raw !== 'string' || !raw) return null;
    var o = null; try { o = JSON.parse(raw); } catch(e){ return null; }
    if (!o || typeof o !== 'object' || Object.prototype.toString.call(o) === '[object Array]') return null;
    var ks = Object.keys(o); for (var i = 0; i < ks.length; i++) if (!SAVE_KEYS[ks[i]]) return null;   /* 保存が書かない key → 保存すると消える＝意味の差 */
    delete o.origin;                                                                                      /* 非意味の差 1: origin */
    try { var kn = o.cast && o.cast.av2 && o.cast.av2.known;
      if (kn && typeof kn === 'object' && Object.prototype.toString.call(kn) !== '[object Array]'){
        var ids = Object.keys(kn); for (var k = 0; k < ids.length; k++){ var e = kn[ids[k]]; if (e && typeof e === 'object') delete e.appeared; } } } catch(eK){ return null; }   /* 非意味の差 2: known.*.appeared */
    try { return stable(o); } catch(eS){ return null; }
  }
  function memRaw(S){ try { return JSON.stringify({ cfg: S.cfg, cast: S.cast, scene: S.scene, turns: S.turns, mode: S.mode }); } catch(e){ return null; } }
  function fin(why, extra){ stats.last = { why: why, t: Date.now(), x: extra || null }; try { console.log(TAG, 'home:', why, 'p2run=' + stats.p2run, 'p2reverted=' + stats.p2reverted); } catch(e){} }
  var busy = false;
  /* 戻り値 true = この押下を引き受けた（go を必ず 1 回呼ぶ）／false = 従来の fix527 の道へ */
  function homeClick(btn, go){
    if (off() || lsg('v292Dfix527NoopHomeSaveOff') === '1') return false;
    var S = getS(); if (!S || typeof S.save !== 'function') return false;
    var wk = null; try { wk = (typeof window.__chr6WriteKey === 'function') ? window.__chr6WriteKey() : null; } catch(e){ wk = null; }
    if (!wk) return false;
    if (busy) return true;                                     /* 二重押し: 1 回目の流れが go を呼ぶ */
    busy = true; stats.calls++;
    var called = false; var goOnce = function(){ if (called) return; called = true; busy = false; try { go(); } catch(e){} };
    try {
      var cur = lsg(wk);
      if (cur != null && cur === candidate(S, cur, wk)){ stats.sameNoWrite++; fin('SAME_NO_WRITE'); goOnce(); return true; }
      /* ★r2 ①: 意味の比較（origin と known.*.appeared だけ外す）で一致すれば書かない */
      var curSem = (cur != null) ? semKey(cur) : null, memSem = semKey(memRaw(S));
      if (curSem != null && memSem != null && curSem === memSem){ stats.semNoWrite++; fin('SAME_SEMANTIC_NO_WRITE'); goOnce(); return true; }
      /* ★r3（GPT #127-PG）: ② は本番から外した。① で一致しないときは従来どおり保存するだけ（印には一切触れない。CLEAN に戻す道は無い） */
      var after = function(){ stats.saved++; stats.kept++; fin('SAVED'); goOnce(); };
      var r = null;
      try { r = (typeof S.saveD === 'function') ? S.saveD('fix527.injectHomeButton') : S.save(); } catch(eS){ r = null; }
      if (r && typeof r.then === 'function'){
        var capped = setTimeout(function(){ if (!called){ stats.kept++; fin('SAVE_SLOW'); goOnce(); } }, 2000);
        r.then(function(){ clearTimeout(capped); if (!called) after(); }, function(){ clearTimeout(capped); if (!called){ stats.kept++; fin('SAVE_REJECTED'); goOnce(); } });
      } else after();
    } catch(e){ fin('ERROR'); goOnce(); }
    return true;
  }
  window.__v292DfixFLW5 = { version: VERSION, off: off, homeClick: homeClick, candidate: candidate, semKey: semKey,
                            status: function(){ return { version: VERSION, off: off(), stats: JSON.parse(JSON.stringify(stats)) }; } };
})();
