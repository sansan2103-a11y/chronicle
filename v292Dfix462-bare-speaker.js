// =====================================================================
// Chronicle TRPG - v292Dfix462: 裸セリフの話者が主人公に吸われる問題の根治
// ---------------------------------------------------------------------
// 症状(おしん報告 2026-07-13・slot smrg85jwsn6 T4):
//   ・関西弁の台詞「……なんか、匂いせえへん？」が 主人公(白石澪) の発言になる
//   ・呼びかけ「……澪」も主人公の発言になる
//   ・中島ゆか が会話ログの話者に一度も出ない = NPCの台詞が主人公へ吸われる
//
// 真因(2026-07-13・実応答の傍受で確定):
//   (1) モデルは半分ほどのセリフを <say who> で囲まず、地の文に裸の「」で書く
//       (実測: 生応答4本すべてに裸セリフ。sys v2/旧sys どちらでも発生 = fix459の副作用ではない)
//   (2) index.html の裸引用フォールバック(fix218b)は話者候補 _cands218 に
//       **登録名のフルネームしか入れていない**(白石澪 / 朝比奈ひなた / 中島ゆか)。
//       ところが地の文は短縮名(澪 / ひなた / ゆか)で書かれるため候補が1人も見つからず、
//       「登場者0人 → 主人公」の既定にフォールバックする = 全部が主人公の発言になる。
//
// 修正方針(index.html は触らない・保存済みデータも壊さない):
//   ・_convSays のうち **who が主人公** のカードだけを対象に、
//     地の文(narrative)内の同じ「」行の前後から**短縮名を含む話者手がかり**を探し、
//     明確な手がかり(Xの声 / Xは〜言った / Xが〜)があればその人物へ振り替える。
//   ・手がかりが無ければ触らない(誤帰属より現状維持)。_rv(react声)カードは不触。
//
// 既定ON。OFF: localStorage v292Dfix462Off='1'
// 検証口: window.__v292Dfix462x = { dryRun, repair, tokensOf, resolve, planTurn }
// バックアップ: 最初の変更前に chr6 を chr6_bk_fix462 へ退避(セッション毎1回)
// =====================================================================
(function(){
  'use strict';
  if (window.__f462done) return; window.__f462done = 1;
  var TAG = '[v292Dfix462:bare-speaker]';

  function off(){ try { return localStorage.getItem('v292Dfix462Off') === '1'; } catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix462') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }

  // ---------- pure: 名前トークン ----------
  var KANJI = /[一-鿿]/;
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }

  // 登録名から「地の文で使われうる呼び名」を作る。
  //   白石澪       -> 白石澪 / 白石 / 澪
  //   朝比奈ひなた -> 朝比奈ひなた / 朝比奈 / ひなた
  //   氷川 杏子    -> 氷川杏子 / 氷川 / 杏子
  // 他の登録名と衝突するトークン・1文字かなは捨てる(誤検出防止)。
  function tokensOf(names){
    var full = names.map(function(n){ return nospace(n); });
    var out = [];
    names.forEach(function(n, i){
      var f = full[i];
      if (!f) return;
      var cand = {};
      cand[f] = 1;
      var sp = String(n).split(/[\s　・]+/).filter(Boolean);
      if (sp.length >= 2){ sp.forEach(function(p){ cand[p] = 1; }); }
      var m = f.match(/^([一-鿿]{1,4})([ぁ-ゟァ-ー]{2,4})$/);   // 漢字+かな
      if (m){ cand[m[1]] = 1; cand[m[2]] = 1; }
      if (/^[一-鿿]{3,5}$/.test(f)){                                            // 全漢字(白石澪→白石/澪)
        cand[f.slice(-1)] = 1; cand[f.slice(0, -1)] = 1;                        // 姓は2〜4字が通例。中間の切片は作らない
      }
      Object.keys(cand).forEach(function(t){
        if (!t) return;
        if (t.length === 1 && !KANJI.test(t)) return;
        var clash = 0;
        for (var j = 0; j < full.length; j++){
          if (j === i) continue;
          if (full[j].indexOf(t) >= 0 || t.indexOf(full[j]) >= 0) clash = 1;
        }
        if (clash) return;
        out.push({ canon: names[i], tok: t });
      });
    });
    out.sort(function(a, b){ return b.tok.length - a.tok.length; });
    return out;
  }

  // ---------- pure: 話者の解決 ----------
  var SPEECH = /(言っ|言う|言い|呟|囁|尋ね|問い|問う|答え|叫|返し|応じ|漏らし|告げ|呼ん|続け|笑っ|声)/;
  var VOICE  = /^の[^。、\n]{0,3}(声|言葉|囁き|呟き|悲鳴|叫び)/;   // 「ゆかの声が」
  var SUBJ   = /^[はが]/;                                          // 「ひなたは」「ひなたが」(「も」は反応の主語=話者でないので除く)

  function findLine(lines, quote){
    var q = norm(quote);
    if (!q) return -1;
    for (var i = 0; i < lines.length; i++){
      var l = String(lines[i] || '').trim();
      if (!/^[「『]/.test(l)) continue;
      if (norm(l) === q) return i;
    }
    return -1;
  }

  // w = {voice, verb, subj} の重み。0 は「手がかりにしない」。
  function scanLine(line, tokens, w){
    var best = null;
    var s = String(line || '');
    tokens.forEach(function(t){
      var p = s.indexOf(t.tok);
      while (p >= 0){
        var tail = s.slice(p + t.tok.length, p + t.tok.length + 10);
        var sc = 0;
        if (VOICE.test(tail)) sc = w.voice;                            // 「Xの声が」= 最強
        else if (SUBJ.test(tail) && SPEECH.test(s)) sc = w.verb;       // 「Xは…言った」
        else if (SUBJ.test(tail)) sc = w.subj;                         // 「Xは/が…した」(行動主体)
        if (sc > 0 && (!best || sc > best.score || (sc === best.score && p >= best.pos))){
          best = { who: t.canon, score: sc, pos: p };                  // 同点なら後ろの出現(直近の主語)
        }
        p = s.indexOf(t.tok, p + 1);
      }
    });
    return best;
  }

  // 本文に見つからないカード(=モデルが<say>タグで書き、地の文には残っていない)を
  // 前後のカード位置で挟んだ窓の中から解決する。手がかりは「Xの声」「Xは…言った」だけ(強い証拠のみ)。
  function resolveWindow(lines, lo, hi, tokens){
    var best = null;
    for (var i = lo; i <= hi && i < lines.length; i++){
      if (i < 0) continue;
      var l = String(lines[i] || '');
      if (/^[\s　]*[「『]/.test(l.trim())) continue;                  // セリフ行は手がかりにしない
      // 「Xの声が」(voice=5) は「Xは…言う」(verb=4)より強い。
      // ★実測(おしんT4): 「澪はもう一度…自分が次に何を言うかで」の“言う”が発話動詞に誤ヒットし、
      //   本物の手がかり「ゆかの声が」に競り勝って主人公のままになった → voice を上に置いて根治。
      var r = scanLine(l, tokens, { voice: 5, verb: 4, subj: 1 });    // 裸の主語だけでは決めない
      if (r && r.score >= 4 && (!best || r.score > best.score || (r.score === best.score))) best = r;   // 強い手がかり優先・同点は後ろの行
    }
    return best;
  }

  function resolve(narrative, quote, tokens){
    var lines = String(narrative || '').split('\n');
    var i = findLine(lines, quote);
    if (i < 0) return null;
    var cands = [];
    // 直後の行: 発話動詞つきの主語 or 「Xの声」だけを信じる。
    //   「言われて、澪も鼻を動かす」型(=反応)を話者にしないため subj は 1(閾値未満)。
    var nx  = scanLine(lines[i + 1] || '', tokens, { voice: 6, verb: 5, subj: 1 });
    if (nx) cands.push(nx);
    // 直前の行: 行動主体がそのまま話者、が日本語の通例。
    var pv  = scanLine(lines[i - 1] || '', tokens, { voice: 4, verb: 4, subj: 3 });
    if (pv) cands.push(pv);
    var pv2 = scanLine(lines[i - 2] || '', tokens, { voice: 3, verb: 3, subj: 1 });
    if (pv2) cands.push(pv2);
    if (!cands.length) return null;
    cands.sort(function(a, b){ return b.score - a.score; });
    return { who: cands[0].who, score: cands[0].score };
  }

  // ---------- ターン単位の計画(副作用は c.who のみ) ----------
  function planTurn(t, hero, tokens){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, changes: [] };
    var narr = String((t && (t.narrative || t.text || t.body)) || '');
    if (!narr) return { changed: false, changes: [] };
    var lines = narr.split('\n');
    var pText = norm((t && t.playerText) || '');
    // 各カードが地の文のどの行かを先に索引化(見つからなければ -1)
    var at = [];
    for (var k = 0; k < cs.length; k++){ at.push(cs[k] && cs[k].say ? findLine(lines, cs[k].say) : -1); }
    var changed = false, changes = [];
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c || !c.say) continue;
      if (c._rv === 1) continue;                                      // react声=本人申告
      if (String(c.who || '') !== hero) continue;                     // 主人公に吸われたカードだけ
      if (pText && norm(c.say) === pText) continue;                   // プレイヤーのSAY入力=本人申告
      var r = null;
      if (at[i] >= 0){
        r = resolve(narr, c.say, tokens);
      } else {
        // 地の文に無いカード: 前後のカードで挟んだ窓を見る
        var lo = 0, hi = lines.length - 1, j;
        for (j = i - 1; j >= 0; j--){ if (at[j] >= 0){ lo = at[j] + 1; break; } }
        for (j = i + 1; j < cs.length; j++){ if (at[j] >= 0){ hi = at[j] - 1; break; } }
        if (lo <= hi) r = resolveWindow(lines, lo, hi, tokens);
      }
      if (!r || r.score < 3) continue;                                // 明確な手がかりのみ
      if (r.who === hero) continue;                                   // 主人公が正しい
      changes.push({ from: c.who, to: r.who, score: r.score, say: String(c.say).slice(0, 16) });
      c.who = r.who;
      changed = true;
    }
    return { changed: changed, changes: changes };
  }

  // ---------- 実適用 ----------
  function names(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); });
      }
    } catch(e){}
    return out.filter(Boolean);
  }

  var backedUp = false;
  function backup(){
    if (backedUp) return;
    try { localStorage.setItem('chr6_bk_fix462', localStorage.getItem('chr6') || ''); } catch(e){}
    backedUp = true;
  }

  function repair(){
    if (off()) return { changed: false };
    // ★fix469(2026-07-13): 話者同定は fix469(点数制＋否定証拠＋棄権)に一本化した。
    //   補正器が2つあると互いの結果を上書きし合う(GPT-5.6指摘)。fix469 が生きていれば本fixは何もしない。
    try {
      if (window.__v292Dfix469 && window.__v292Dfix469.__armed && localStorage.getItem('v292Dfix469Off') !== '1') return { changed: false, ceded: true };
    } catch(e){}
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var ns = names(S);
    if (ns.length < 2) return { changed: false };
    var hero = ns[0], tokens = tokensOf(ns);
    var any = false, log = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var p = planTurn(S.turns[ti], hero, tokens);
      if (p.changed){
        if (!any) backup();
        any = true;
        log.push({ turn: ti + 1, changes: p.changes });
      }
    }
    if (any){
      try { if (S.save && !document.hidden) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, 'speaker re-attributed:', JSON.stringify(log)); } catch(e){}
    }
    return { changed: any, log: log };
  }

  // ---------- 起動 + ターン追従 ----------
  var lastSig = '';
  function sig(){
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return '';
    var last = S.turns[S.turns.length - 1];
    var n = (last && Array.isArray(last._convSays)) ? last._convSays.length : 0;
    return S.turns.length + ':' + n;
  }
  function tick(){
    try {
      if (off()) return;
      var s = sig();
      if (!s || s === lastSig) return;
      lastSig = s;
      repair();
    } catch(e){}
  }
  try { setTimeout(tick, 3000); setInterval(tick, 2500); } catch(e){}

  // ---------- 検証口 ----------
  window.__v292Dfix462x = {
    __armed: true,
    tokensOf: tokensOf,
    resolve: resolve,
    planTurn: planTurn,
    repair: repair,
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var ns = names(S); if (ns.length < 2) return null;
      var hero = ns[0], tokens = tokensOf(ns), res = [];
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i];
        var copy = { narrative: (t && (t.narrative || t.text || t.body)) || '',
                     _convSays: ((t && t._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, hero, tokens);
        if (p.changes && p.changes.length) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
