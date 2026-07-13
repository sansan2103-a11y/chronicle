// =====================================================================
// Chronicle TRPG - v292Dfix469: 話者同定を「点数制＋否定証拠＋棄権」に作り直す
// ---------------------------------------------------------------------
// 背景(GPT-5.6 設計レビュー 2026-07-13):
//   「推理ルールを足す道は限界。『分からない→主人公』は、誤りを欠落として残さず
//     **確定情報に偽装する**処理。捕捉率95%で誤り0 の方が、99%捕捉で数%誤帰属より優れている。」
//
// 実測の失敗例(おしんT9): 「……私も」が朝比奈ひなた(関西弁・一人称ウチ)に付いた。正解=中島ゆか。
//   ・前後の地の文の行動主体はゆか
//   ・一人称「私」はひなたの口調と矛盾（＝否定証拠）
//
// 本fixの3点:
//   ①**点数制**: 候補ごとに加点/減点し、1位が90点以上 かつ 1位-2位≥35 のときだけ採用（GPTの設計）
//   ②**否定証拠**: 一人称・方言の矛盾は減点に使う（「私だからゆか」のような**正の同定には使わない**。
//      「私」は複数キャラが共有するため同定力が低い＝GPT指摘）
//   ③**棄権**: 決められない台詞は**会話ログにカードを出さない**（本文には残る）。
//      ★過去ターンは触らない(表示が変わると破損に見える=GPT指摘)。棄権は**読み込み後の新ターンのみ**。
//      過去ターンは「明確な誤りの振替」だけ行う（カード削除はしない）。
//
// 既定ON。OFF: localStorage v292Dfix469Off='1'
// 検証口: window.__v292Dfix469 = { profiles, score, decide, planTurn, repair, dryRun }
// バックアップ: 最初の変更前に chr6 → chr6_bk_fix469
// =====================================================================
(function(){
  'use strict';
  if (window.__f469done) return; window.__f469done = 1;
  var TAG = '[v292Dfix469:speaker-score]';

  function off(){ try { return localStorage.getItem('v292Dfix469Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }

  // ---------- キャラの口調カルテ（usual / allowed の考え方・GPT設計） ----------
  var PRONOUNS = ['ウチ','うち','あたし','あたい','わたくし','わたし','私','俺','おれ','オレ','僕','ぼく','ボク','わし','儂','自分'];
  var KANSAI = /(やろ|やん|やで|せや|へん(?![どに])|ちゃう|やねん|なんや|あかん|ええ(?:で|わ|やん)|とる|しとん|おる(?:んか|で|やろ)|ちゃうか|ほんま)/;
  var POLITE_STD = /(です|ます|ですね|でしょう|ください)/;

  // cast の desc/口調から「いつもの一人称」と「方言」を推定する（確定できないものは持たない）
  function profiles(S){
    var out = [];
    try {
      var list = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) list.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) list.push(n); });
      }
      list.forEach(function(c){
        var d = String((c.desc || '') + ' ' + (c.tone || '') + ' ' + (c.voice || ''));
        var p = { name: String(c.name).trim(), fp: '', kansai: false };
        // 「一人称は「ウチ」」「一人称:私」などを最優先、無ければ desc 中の代名詞出現
        var m = d.match(/一人称[はは:：]?\s*[「『"]?([^\s」』"、。]{1,4})/);
        if (m && PRONOUNS.indexOf(m[1]) >= 0) p.fp = m[1];
        if (!p.fp){
          for (var i = 0; i < PRONOUNS.length; i++){
            if (d.indexOf('「' + PRONOUNS[i] + '」') >= 0){ p.fp = PRONOUNS[i]; break; }
          }
        }
        if (/関西弁|大阪弁|京都弁|関西訛/.test(d)) p.kansai = true;
        out.push(p);
      });
    } catch(e){}
    return out;
  }

  // ---------- 名前トークン（fix462と同じ考え方） ----------
  var KANJI = /[一-鿿]/;
  function tokensOf(names){
    var full = names.map(nospace), out = [];
    names.forEach(function(n, i){
      var f = full[i]; if (!f) return;
      var cand = {}; cand[f] = 1;
      String(n).split(/[\s　・]+/).filter(Boolean).forEach(function(p){ if (p.length >= 2) cand[p] = 1; });
      var m = f.match(/^([一-鿿]{1,4})([ぁ-ゟァ-ー]{2,4})$/);
      if (m){ cand[m[1]] = 1; cand[m[2]] = 1; }
      if (/^[一-鿿]{3,5}$/.test(f)){ cand[f.slice(-1)] = 1; cand[f.slice(0, -1)] = 1; }
      Object.keys(cand).forEach(function(t){
        if (!t) return;
        if (t.length === 1 && !KANJI.test(t)) return;
        for (var j = 0; j < full.length; j++){
          if (j === i) continue;
          if (full[j].indexOf(t) >= 0 || t.indexOf(full[j]) >= 0) return;
        }
        out.push({ canon: names[i], tok: t });
      });
    });
    out.sort(function(a,b){ return b.tok.length - a.tok.length; });
    return out;
  }

  // ---------- 点数（GPTの表を実装） ----------
  var SPEECH = /(言っ|言う|言い|呟|囁|尋ね|問い|問う|答え|叫|返し|応じ|漏らし|告げ|呼ん|続け|笑っ)/;
  var VOICE  = /^の[^。、\n]{0,4}(声|言葉|囁き|呟き|悲鳴|叫び)/;
  var SUBJ   = /^[はが]/;
  var SUBJ_ACT = /^[はがも]/;                 // 行動主体（「ゆかも前に出た」型）。「も」は反応文では使わない
  // ★反応文の先頭語: この行の人物は「聞いた側」＝話者ではない（「言われて、澪も鼻を動かす」）
  var REACT_LEAD = /^[\s　]*(言われて|それを聞い|その言葉|その声|聞いて|返事を|問われ)/;

  // 1行の中で name(tok) がどう出てくるかを見て、証拠の種類を返す
  function evidenceIn(line, tok, isNext){
    var s = String(line || '');
    if (isNext && REACT_LEAD.test(s)) return null;      // 反応文=聞いた側。証拠にしない
    var best = null, p = s.indexOf(tok);
    while (p >= 0){
      var tail = s.slice(p + tok.length, p + tok.length + 12);
      var kind = null;
      if (VOICE.test(tail)) kind = 'voice';
      else if (SUBJ.test(tail) && SPEECH.test(s)) kind = 'subjSpeech';
      else if (SUBJ.test(tail)) kind = 'subj';
      else if (isNext && SUBJ_ACT.test(tail)) kind = 'subj';   // 直後の行動主体(「ゆかも前に出た」)
      if (kind && (!best || (kind === 'voice') || (kind === 'subjSpeech' && best !== 'voice'))) best = kind;
      p = s.indexOf(tok, p + 1);
    }
    return best;
  }

  // say=台詞本文, prev/next=前後の地の文, prof=口調カルテ
  function score(say, prev, next, tokens, profs){
    var sc = {};
    function add(n, v){ sc[n] = (sc[n] || 0) + v; }
    tokens.forEach(function(t){
      var e1 = evidenceIn(next, t.tok, true);
      if (e1 === 'voice') add(t.canon, 95);
      else if (e1 === 'subjSpeech') add(t.canon, 110);
      else if (e1 === 'subj') add(t.canon, 65);          // 直後の行動主体
      var e0 = evidenceIn(prev, t.tok, false);
      if (e0 === 'voice') add(t.canon, 105);
      else if (e0 === 'subjSpeech') add(t.canon, 100);
      else if (e0 === 'subj') add(t.canon, 45);          // 直前の明示主語
      // 呼びかけ: 台詞の中に相手の名前が出る = その人は話者ではない
      if (String(say || '').indexOf(t.tok) >= 0) add(t.canon, -35);
    });
    // 口調の否定証拠（正の同定には使わない）
    var text = String(say || '');
    var fps = PRONOUNS.filter(function(p){ return text.indexOf(p) >= 0; });
    profs.forEach(function(p){
      if (!p.name) return;
      if (p.fp && fps.length){
        var usesOther = fps.some(function(f){ return f !== p.fp; });
        var usesOwn = fps.indexOf(p.fp) >= 0;
        if (usesOther && !usesOwn) add(p.name, -50);      // ★一人称の明白な矛盾
        else if (usesOwn) add(p.name, 20);                // 自分の一人称と一致(弱い加点)
      }
      if (p.kansai){
        if (KANSAI.test(text)) add(p.name, 15);
        else if (POLITE_STD.test(text) && text.length >= 8) add(p.name, -35);   // 方言キャラが丁寧な標準語
      }
    });
    return sc;
  }

  // 採用条件(GPT): 1位>=90 かつ 1位-2位>=35。
  // 追加条件: **今の割当が明らかに劣る**とき(現在<=0点)は、1位が60点以上で60点差あれば振り替える
  //   （旧実装の「登場者0人→主人公」で機械的に主人公が入っているカードを救うため）
  function decide(sc, current){
    var arr = Object.keys(sc).map(function(k){ return { who: k, score: sc[k] }; });
    arr.sort(function(a,b){ return b.score - a.score; });
    var first = arr[0], second = arr[1] || { score: -Infinity };
    if (!first) return { who: null, top: null, conf: 'unknown' };
    if (first.score >= 90 && (first.score - second.score) >= 35) return { who: first.who, score: first.score, conf: 'high' };
    if (current != null && current !== first.who){
      var cs = (sc[current] != null) ? sc[current] : 0;
      if (cs <= 0 && first.score >= 60 && (first.score - cs) >= 60) return { who: first.who, score: first.score, conf: 'mid' };
    }
    return { who: null, top: first, conf: 'unknown' };
  }

  // 本文から台詞の行位置を探す
  function findLine(lines, quote){
    var q = norm(quote); if (!q) return -1;
    for (var i = 0; i < lines.length; i++){
      var l = String(lines[i] || '').trim();
      if (!/^[「『]/.test(l)) continue;
      if (norm(l) === q) return i;
    }
    return -1;
  }

  // ---------- 1ターンの計画 ----------
  // allowDrop = true のときだけ「棄権(カード削除)」を行う（=読み込み後の新ターンのみ）
  function planTurn(t, names, tokens, profs, allowDrop){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, changes: [], arr: cs };
    var narr = String((t && (t.narrative || t.text || t.body)) || '');
    var lines = narr.split('\n');
    var pText = norm((t && t.playerText) || '');
    var out = [], changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c || !c.say){ continue; }
      if (c._rv === 1 || (pText && norm(c.say) === pText)){ out.push(c); continue; }  // react声/SAY入力は不触
      var at = findLine(lines, c.say);
      var prev = at > 0 ? lines[at - 1] : '';
      var next = (at >= 0 && at + 1 < lines.length) ? lines[at + 1] : '';
      if (at < 0){ out.push(c); continue; }                                  // 本文に無い=判断材料なし→不触
      var cur = String(c.who || '');
      var sc = score(c.say, prev, next, tokens, profs);
      var d = decide(sc, cur);
      if (d.who && d.who !== cur){
        changes.push({ act: 'fix', from: cur, to: d.who, score: d.score, say: String(c.say).slice(0, 14) });
        c.who = d.who; changed = true; out.push(c); continue;
      }
      if (!d.who){
        // 棄権: 現在の話者に**明白な否定証拠**があるときだけカードを落とす（新ターンのみ）
        var neg = (sc[cur] != null && sc[cur] <= -30);
        if (allowDrop && neg){
          changes.push({ act: 'drop', from: cur, say: String(c.say).slice(0, 14), score: sc[cur] });
          changed = true; continue;                                          // カードを作らない
        }
      }
      out.push(c);
    }
    return { changed: changed, changes: changes, arr: out };
  }

  // ---------- 適用 ----------
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

  var baseTurns = -1;      // 読み込み時のターン数。これ以降のターンだけ「棄権」を許す
  var backedUp = false;
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    if (baseTurns < 0) baseTurns = S.turns.length;
    var ns = names(S); if (ns.length < 2) return { changed: false };
    var tokens = tokensOf(ns), profs = profiles(S);
    var any = false, log = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var allowDrop = (ti >= baseTurns);                                     // 過去ターンは削除しない
      var p = planTurn(S.turns[ti], ns, tokens, profs, allowDrop);
      if (p.changed){
        if (!backedUp){ try { localStorage.setItem('chr6_bk_fix469', localStorage.getItem('chr6') || ''); } catch(e){} backedUp = true; }
        S.turns[ti]._convSays = p.arr;
        any = true; log.push({ turn: ti + 1, changes: p.changes });
      }
    }
    if (any){
      try { if (S.save && !document.hidden) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, JSON.stringify(log)); } catch(e){}
    }
    return { changed: any, log: log };
  }

  var lastSig = '';
  function tick(){
    try {
      if (off()) return;
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      if (baseTurns < 0) baseTurns = S.turns.length;
      var last = S.turns[S.turns.length - 1];
      var sig = S.turns.length + ':' + ((last && Array.isArray(last._convSays)) ? last._convSays.length : 0);
      if (sig === lastSig) return;
      lastSig = sig; repair();
    } catch(e){}
  }
  try { setTimeout(tick, 4000); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix469 = {
    __armed: true, profiles: profiles, tokensOf: tokensOf, score: score, decide: decide,
    planTurn: planTurn, repair: repair,
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var ns = names(S); if (ns.length < 2) return null;
      var tokens = tokensOf(ns), profs = profiles(S), res = [];
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i];
        var copy = { narrative: (t && t.narrative) || '', playerText: (t && t.playerText) || '',
                     _convSays: ((t && t._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, ns, tokens, profs, true);
        if (p.changes && p.changes.length) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    }
  };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
