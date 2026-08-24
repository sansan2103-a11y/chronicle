/* v292Dfix636-npc-presence-evidence.js (2026-07-29)
 * ─ 登録NPCが「会話ログで喋っているのに、モデルには居ないことにされる」のを直す ─
 *
 * ■真因（静的に確定・2026-07-29 の監査）
 *   登場判定が **2経路にあって、証拠の集合が食い違っている**。
 *
 *   (a) モデルへ渡る側 = features.js の fix95（Planner.build ラップ）
 *         「登録NPCは、名前が **プレイヤー入力＋直近8ターンの narrative/playerText** に
 *           出るまで休眠。出たら sticky に appeared=true」
 *         → 参照しているのは `t.playerText` と `t.narrative` **だけ**。
 *   (b) 画面に出る側 = fix145 の findLastTurnForName
 *         fix520 で **`t._convSays`（確定した話者・フルネーム名寄せ済）も証拠に加えた**。
 *
 *   この差が実害になるのが「姓＋名で登録し、本文では下の名前で書かれる」型。
 *   実例（fix573 のコメントに残っている 2026-07-26 の実機）:
 *     登録名「白石澪」／本文は「澪」→ `ctx.indexOf('白石澪')` は永久に外れる。
 *     会話ログの who は fix390/fix514 が「白石澪」へ名寄せするので **証拠はある**のに、
 *     fix95 はそれを見ないので、そのNPCは **登録済みなのにモデルへ渡らない**。
 *   結果＝おしんの症状3「複数キャラが同席すると一部が存在しない扱いになる
 *          （会話に参加しない・描写から消える・後から初登場扱い）」。
 *
 * ■このfixがやること（**証拠を1つ揃えるだけ**。判定ロジックは作らない）
 *   `S.turns[*]._convSays[*].who` が登録NPC名と **完全一致** したら、そのNPCの
 *   `appeared = true`（fix95 が既に持っている sticky フラグ）を立てる。
 *   ・部分一致・短縮名・別名では**絶対に立てない**（おしん指示「類似する別個体を強制統合しない」）
 *   ・向きは常に安全側 = 「居ることにする」だけ。**誰も除外しない**
 *   ・fix95 / features.js は1バイトも触らない
 *   ・`_convSays` も `who` も `say` も DOM も書き換えない
 *
 * ■なぜ `who` の完全一致だけなのか
 *   `who` は「このカードを誰が喋ったか」の**確定値**であり、fix520 が画面側で既に
 *   存在証拠として採用している。同じものを同じ強さで使うので、新しい推測は増えない。
 *
 * 冪等: window.__v292Dfix636
 * OFF : localStorage v292Dfix636Off='1'
 * 読出: window.__v292Dfix636.scan({dryRun:true})  … 何が立つかを見るだけ（書かない）
 *       window.__v292Dfix636.stats() / .selfTest()
 */
(function v292Dfix636(){
  'use strict';
  if (window.__v292Dfix636 && window.__v292Dfix636.__armed) return;
  var TAG = '[v292Dfix636:npc-presence]';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix636Off') === '1'; }

  function note539(reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note('fix636', reason, err); } catch(e){}
  }
  function getState(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix636'); if (a) return a; } catch(e){ note539('getter-threw', e); }
    } else { note539('getter-missing'); }
    try { if (window.S){ note539('rescued-by-window'); return window.S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('rescued-by-eval'); return u; }
          note539('legacy-eval-null'); }
    catch(e){ note539('legacy-eval-threw', e); }
    return null;
  }

  var stats = { runs: 0, promoted: 0, lastNames: [], saves: 0 };

  function norm(x){ return String(x == null ? '' : x).trim(); }

  /* 会話ログの確定話者を集める（読み取りのみ） */
  function convWhoSet(turns){
    var set = {};
    if (!turns || !turns.length) return set;
    for (var i = 0; i < turns.length; i++){
      var cs = turns[i] && turns[i]._convSays;
      if (!cs || !cs.length) continue;
      for (var j = 0; j < cs.length; j++){
        var w = norm(cs[j] && cs[j].who);
        if (w) set[w] = true;
      }
    }
    return set;
  }

  /* opts.dryRun=true なら1バイトも書かない */
  function scan(opts){
    opts = opts || {};
    var res = { ok: false, dryRun: !!opts.dryRun, candidates: [], promoted: [], reason: '' };
    if (off() && !opts.force){ res.reason = 'off'; return res; }
    var st = getState();
    if (!st || !st.cast || !Array.isArray(st.cast.npcs)){ res.reason = 'no-cast'; return res; }
    var turns = Array.isArray(st.turns) ? st.turns : [];
    if (!turns.length){ res.reason = 'no-turns'; return res; }
    var who = convWhoSet(turns);
    res.ok = true;
    for (var i = 0; i < st.cast.npcs.length; i++){
      var n = st.cast.npcs[i];
      if (!n || !norm(n.name)) continue;
      if (n.appeared === true) continue;         /* 既に登場扱い＝何もしない */
      var nm = norm(n.name);
      if (!who[nm]) continue;                     /* ★完全一致だけ。部分一致はしない */
      res.candidates.push(nm);
      if (opts.dryRun) continue;
      n.appeared = true;
      res.promoted.push(nm);
    }
    if (!opts.dryRun && res.promoted.length){
      stats.promoted += res.promoted.length;
      stats.lastNames = res.promoted.slice(0, 10);
      try { if (typeof st.save === 'function'){ st.save(); stats.saves++; } } catch(e){}
      try { console.warn(TAG, '会話ログに確定話者として出ている登録NPCを登場扱いにしました:',
                         res.promoted.join('、')); } catch(e){}
    }
    return res;
  }

  /* ★★fix732(RULING85 §13-§19) — NORMAL_LOAD_HISTORICAL_MUTATION_CONTAINMENT
     自動経路（タイマ / render フック / appendTurn）は
     **このセッション中に生成されたターンだけ**を対象にする。
     判定は turns.length の差分ではなく、唯一の新ターン生成口
     （index.html の S.turns.push(turn)）で登録された provenance を使う。
     → hydration 0→1 / 逐次 hydration / restore 後の regrow を新ターンと誤認しない。
     → 全 module が同一 registry を見るので module 間で baseline がズレない。
     scope module が居ない場合は false ＝ 何も自動処理しない fail-closed。
     heuristics: 変更 0 / explicit API: 全ターン対象のまま保持 / new-turn logic: 保持。 */
  function _f732New(t){
    try { var W = window.__v292Dfix732Scope; return !!(W && typeof W.isNew === 'function' && W.isNew(t)); }
    catch(e){ return false; }
  }

  /* ★★fix732(RULING85 §13-§19) — fix636 の採用形
       ・historical turns: automatic では走査も昇格もしない（NORMAL_LOAD_AUTO_REPAIR は撤去）
       ・session-new turns: exact _convSays[].who evidence による昇格は **残す**
         （fix95 は playerText / recent narrative、fix636 は dialogue speaker と証拠が別。
          「NPC が新ターンで喋ったが narrative / playerText に名前が出ない」ケースは
          fix95 では拾えないため、ここを消すと機能欠落になる）
       ・explicit scan({}) は従来どおり全 historical capability を保持
       判定規則（登録 NPC 名と who の完全一致のみ）は scan() と同一。走査対象だけが違う。 */
  function scanNewTurns(){
    var res = { ok: false, newTurns: 0, candidates: [], promoted: [], reason: '' };
    if (off()){ res.reason = 'off'; return res; }
    var st = getState();
    if (!st || !st.cast || !Array.isArray(st.cast.npcs)){ res.reason = 'no-cast'; return res; }
    var turns = Array.isArray(st.turns) ? st.turns : [];
    var fresh = [];
    for (var i = 0; i < turns.length; i++){ if (_f732New(turns[i])) fresh.push(turns[i]); }
    res.newTurns = fresh.length;
    if (!fresh.length){ res.reason = 'no-session-new-turns'; return res; }
    var who = convWhoSet(fresh);                 /* scan() と同じ関数を再利用（byte 不変） */
    res.ok = true;
    for (var j = 0; j < st.cast.npcs.length; j++){
      var n = st.cast.npcs[j];
      if (!n || !norm(n.name)) continue;
      if (n.appeared === true) continue;
      var nm = norm(n.name);
      if (!who[nm]) continue;                    /* ★完全一致だけ。部分一致はしない */
      res.candidates.push(nm);
      n.appeared = true;
      res.promoted.push(nm);
    }
    if (res.promoted.length){
      stats.promoted += res.promoted.length;
      stats.lastNames = res.promoted.slice(0, 10);
      try { if (typeof st.save === 'function'){ st.save(); stats.saves++; } } catch(e){}
      try { console.warn(TAG, '新ターンの確定話者として出ている登録NPCを登場扱いにしました:',
                         res.promoted.join('、')); } catch(e){}
    }
    return res;
  }

  function tick(){
    if (off()) return;
    stats.runs++;
    try { stats.lastNewTurnScan = scanNewTurns(); }
    catch(e){ try { console.warn(TAG, 'scan err:', e && e.message); } catch(_){} }
  }

  /* ---- 取り付け: 毎ターンの render 後（他fixと同じ hook）＋起動時に1回 ---- */
  function arm(){
    var U = null;
    try { U = window.UI || (0,eval)('typeof UI!=="undefined"?UI:null'); } catch(e){ U = null; }
    if (!U || !Array.isArray(U._renderHooks)) return false;
    if (U.__v292Dfix636Hook) return true;
    U._renderHooks.push(function fix636Hook(){ tick(); });
    U.__v292Dfix636Hook = true;
    try { console.log(TAG, 'armed (render hook)'); } catch(e){}
    return true;
  }
  if (!arm()){
    var tries = 0;
    var iv = setInterval(function(){ tries++; if (arm() || tries > 120) clearInterval(iv); }, 250);
  }
  try { setTimeout(tick, 1500); } catch(e){}   /* 既存の物語も開いた時点で1回だけ手当てする */

  function selfTest(){
    var st = getState();
    return {
      off: off(),
      stateReachable: !!st,
      npcs: (st && st.cast && Array.isArray(st.cast.npcs)) ? st.cast.npcs.length : -1,
      dormant: (st && st.cast && Array.isArray(st.cast.npcs))
        ? st.cast.npcs.filter(function(n){ return n && n.name && n.appeared !== true; })
                      .map(function(n){ return n.name; }) : [],
      wouldPromote: scan({ dryRun: true, force: true }).candidates,
      stats: JSON.parse(JSON.stringify(stats))
    };
  }

  window.__v292Dfix636 = {
    __armed: true,
    scan: scan, scanNewTurns: scanNewTurns, tick: tick, convWhoSet: convWhoSet, getState: getState,
    isSessionNew: _f732New,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    selfTest: selfTest, isOff: off
  };
})();
