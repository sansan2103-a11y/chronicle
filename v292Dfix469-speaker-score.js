// =====================================================================
// Chronicle TRPG - v292Dfix469: 話者同定「点数制＋否定証拠＋棄権」 v2
// ---------------------------------------------------------------------
// v1(2026-07-13): GPT-5.6設計の点数制。候補=登録キャストのみ。
// v2(2026-07-18): 実プレイで会話ログ誤り多発 → 実データ診断+GPT-5.6再レビューで作り直し。
//   実測した破壊例: 未登録話者「若い男」が候補に入らないため、正しい who=若い男 のカードを
//   「リカの声は震えていなかった」(直前行・完結した描写文)の105点で リカ へ"高確度"flipしていた。
//   GPT判定の要点:
//     ①originalWho(現在の割当)は必ず候補化し +60(タグ保護)。未登録whoも登録キャストと同格。
//     ②汎用人物ラベル(若い男等)は発話帰属構文に現れた場合だけ候補化。1文字ラベル(男/女)は禁止
//       (彼女/少女に部分一致して大事故=実測)。
//     ③声の証拠を分離: 台詞直後の「Xの声が低くなる」+115 / 直前の導入形「Xの声がした」+90 /
//       直前の完結した描写文「Xの声は震えていなかった。」+25(前も台詞行なら0=前の台詞への反応)。
//     ④flipは強い反証時だけ(挑戦者に局所ハード証拠 かつ 差55以上)。
//       拮抗した強い競合は【新ターンのみ】カード非表示(誤表示より欠落)。過去ターンは振替のみ。
//     ⑤確定後は凍結。全過去ターンの永続再採点を廃止(新ターンを最大3回評価して凍結)。
//   ※エコー反問(−25)とレジスタ矛盾(−15)は条件が厳格なため今回は未実装(GPT: 直後の声で足りる)。
//
// 既定ON。OFF: localStorage v292Dfix469Off='1'
// 検証口: window.__v292Dfix469 = { stats, profiles, score, decide, planTurn, repair, dryRun }
// バックアップ: 最初の変更前に chr6 → chr6_bk_fix469
// =====================================================================
(function(){
  'use strict';
  if (window.__f469done) return; window.__f469done = 2;
  var TAG = '[v292Dfix469:speaker-score]';

  function off(){ try { return localStorage.getItem('v292Dfix469Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }

  // ---------- キャラの口調カルテ（v1のまま・否定証拠専用） ----------
  var PRONOUNS = ['ウチ','うち','あたし','あたい','わたくし','わたし','私','俺','おれ','オレ','僕','ぼく','ボク','わし','儂','自分'];
  var KANSAI = /(やろ|やん|やで|せや|へん(?![どに])|ちゃう|やねん|なんや|あかん|ええ(?:で|わ|やん)|とる|しとん|おる(?:んか|で|やろ)|ちゃうか|ほんま)/;
  var POLITE_STD = /(です|ます|ですね|でしょう|ください)/;

  function profiles(S){
    var out = [];
    try {
      var list = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) list.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) list.push(n); });
      }
      list.forEach(function(c){
        // 根治: voiceは文字列とは限らず {raw:"ウチ", fp:"私", ...} のオブジェクト登録がある。
        //   String(c.voice)="[object Object]" で一人称を取り逃していた(実測: ひなた voice.raw="ウチ")。
        var voiceStr = (c.voice && typeof c.voice === 'object')
          ? String((c.voice.fp || '') + ' ' + (c.voice.raw || '') + ' ' + (c.voice.tone || c.voice.desc || ''))
          : String(c.voice || '');
        var d = String((c.desc || '') + ' ' + (c.tone || '') + ' ' + voiceStr);
        var _g = String(c.gender||''); var gnorm = /女/.test(_g)?'女':(/男/.test(_g)?'男':'');
        var p = { name: String(c.name).trim(), fp: '', kansai: false, gender: gnorm };   // fix498: 明示genderのみ(代名詞からの逆算はしない)
        // 根治: voiceオブジェクトに登録された一人称(fp/raw)を最優先で採用(PRONOUNS照合)
        try {
          if (c.voice && typeof c.voice === 'object'){
            var vr = String(c.voice.fp || c.voice.raw || '').trim();
            if (vr && PRONOUNS.indexOf(vr) >= 0) p.fp = vr;
          }
        } catch(e){}
        if (!p.fp){
          var m = d.match(/一人称[はは:：]?\s*[「『"]?([^\s」』"、。]{1,4})/);
          if (m && PRONOUNS.indexOf(m[1]) >= 0) p.fp = m[1];
        }
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

  // ---------- v2: 未登録話者の候補化 ----------
  // ①ターン内_convSaysの既存who(=originalWho含む)は無条件で候補(GPT: 絶対に落とさない)
  // ②汎用ラベルは「発話帰属構文」で本文に現れた場合だけ候補化(地の文の一般名詞を拾わない)
  // ★1文字ラベル(男/女)は禁止: 彼女/少女/長男 等に部分一致して大事故になる(実測)
  var PRONOUN_WHO = ['私','俺','僕','彼','彼女','あなた','お前','君','誰か','自分']; // fix495(B1)
  function _dropOn(){ try { return localStorage.getItem('v292Dfix469DropOn') === '1'; } catch(e){ return false; } }  // fix495(B5)
  var _stats = { wouldDrop: 0, backupFail: 0, wouldPronounFlip: 0, pronounAmbiguous: 0, pronounNoGender: 0, wouldToneFlip: 0, toneConflict: 0 };  // fix498: 代名詞ブリッジ診断 / 根治: 口調ブリッジ
  var GENERIC_LABELS = ['若い男','若い女','若者','青年','老人','老婆','老爺','少年','少女','子供','男性','女性','人影','黒衣の男','黒衣の女'];
  var ATTR_CONSTRUCT = '(の(?:声|口調|言葉|囁き|呟き|悲鳴|叫び)|[はが](?:[^。、\\n]{0,6})?(?:言|口を開|続け|答え|尋ね|叫|呟|囁|告げ|問い|返し|吐き捨て))';
  function extraTokens(t, names, narr){
    var known = {}, out = [], cand = {};
    names.forEach(function(n){ known[nospace(n)] = 1; });
    try {
      ((t && t._convSays) || []).forEach(function(c){
        var w = c && c.who ? String(c.who).trim() : '';
        if (!w || w === '???' || known[nospace(w)]) return;
        // fix495(B1): 1文字ラベル・代名詞whoを候補トークンにしない(「女」が「彼女の声…」に
        // 部分一致してvoiceAfter+115を取り、正しいwho(+60)を55差でflipする実測事故の遮断)
        if (w.length < 2 || PRONOUN_WHO.indexOf(w) >= 0) return;
        cand[w] = 1;
      });
      GENERIC_LABELS.forEach(function(g){
        if (known[g] || cand[g]) return;
        try { if (new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ATTR_CONSTRUCT).test(String(narr || ''))) cand[g] = 1; } catch(e){}
      });
      var ks = Object.keys(cand);
      ks.forEach(function(k){
        for (var j = 0; j < ks.length; j++){
          if (ks[j] !== k && ks[j].indexOf(k) >= 0) return;   // 男性⊂若い男性 → 短い方を捨てる
        }
        for (var n2 in known){ if (n2.indexOf(k) >= 0 || k.indexOf(n2) >= 0) return; } // 登録名と衝突
        out.push({ canon: k, tok: k });
      });
    } catch(e){}
    return out;
  }

  // ---------- 証拠検出 ----------
  var SPEECH = /(言っ|言う|言い|呟|囁|尋ね|問い|問う|答え|叫|返し|応じ|漏らし|告げ|呼ん|続け|笑っ|吐き捨て|口を開)/;
  var VOICE  = /^の[^。、\n]{0,4}(声|言葉|囁き|呟き|悲鳴|叫び)/;
  // 導入形: 「Xの声がした」→次(または直結する)台詞の話者。描写形: 「Xの声は震えていなかった」=完結した描写。
  var VOICE_INTRO = /^の[^。、\n]{0,4}(?:声|言葉|囁き|呟き|悲鳴|叫び)(?:が(?:した|して|する|響|聞こえ|上がっ|飛ん|割り込)|で(?:言|尋|囁|呟|叫|告げ|続け))/;
  var SUBJ   = /^[はが]/;
  var SUBJ_ACT = /^[はがも]/;
  var REACT_LEAD = /^[\s　]*(言われて|それを聞い|その言葉|その声|聞いて|返事を|問われ)/;

  // 1行の中で tok がどう出てくるか。isNext=台詞の直後行 / sandwiched=直前行だがその前も台詞行
  function evidenceIn(line, tok, isNext, sandwiched){
    var s = String(line || '');
    if (isNext && REACT_LEAD.test(s)) return null;
    var best = null, bestPt = -1, p = s.indexOf(tok);
    function offer(kind, pt){ if (pt > bestPt){ best = kind; bestPt = pt; } }
    while (p >= 0){
      var tail = s.slice(p + tok.length, p + tok.length + 14);
      if (VOICE.test(tail)){
        if (isNext) offer('voiceAfter', 115);
        else if (VOICE_INTRO.test(tail)) offer('voiceIntro', 90);
        else if (!sandwiched) offer('voiceDesc', 25);
      }
      if (SUBJ.test(tail) && SPEECH.test(s)) offer(isNext ? 'speechAfter' : 'speechBefore', isNext ? 140 : 115);
      else if (SUBJ.test(tail)) offer('subj', isNext ? 40 : 20);
      else if (isNext && SUBJ_ACT.test(tail)) offer('subj', 40);
      p = s.indexOf(tok, p + 1);
    }
    return best ? { kind: best, pts: bestPt } : null;
  }

  var PTS = { voiceAfter: 115, speechAfter: 140, voiceIntro: 90, voiceDesc: 25, speechBefore: 115 };
  var HARD = 90;   // 局所ハード証拠の下限(単一証拠で)

  // say=台詞本文, prev/next=前後の地の文, prevSand=直前行のさらに前も台詞行
  // 返り値: { sc: {name:点}, hard: {name:最大単一証拠点} }
  function score(say, prev, next, tokens, profs, prevSand){
    var sc = {}, hard = {};
    function add(n, v){ sc[n] = (sc[n] || 0) + v; }
    function markHard(n, v){ if (!hard[n] || v > hard[n]) hard[n] = v; }
    tokens.forEach(function(t){
      var e1 = evidenceIn(next, t.tok, true, false);
      if (e1){ add(t.canon, e1.pts); if (e1.pts >= HARD) markHard(t.canon, e1.pts); }
      var e0 = evidenceIn(prev, t.tok, false, !!prevSand);
      if (e0){ add(t.canon, e0.pts); if (e0.pts >= HARD) markHard(t.canon, e0.pts); }
      if (String(say || '').indexOf(t.tok) >= 0) add(t.canon, -35);   // 呼びかけ=話者でない
    });
    // 口調の否定証拠（正の同定には使わない・v1のまま）
    var text = String(say || '');
    var fps = PRONOUNS.filter(function(p){ return text.indexOf(p) >= 0; });
    profs.forEach(function(p){
      if (!p.name) return;
      if (p.fp && fps.length){
        var usesOther = fps.some(function(f){ return f !== p.fp; });
        var usesOwn = fps.indexOf(p.fp) >= 0;
        if (usesOther && !usesOwn) add(p.name, -50);
        else if (usesOwn) add(p.name, 20);
      }
      if (p.kansai){
        if (KANSAI.test(text)) add(p.name, 15);
        else if (POLITE_STD.test(text) && text.length >= 8) add(p.name, -35);
      }
    });
    return { sc: sc, hard: hard };
  }

  var TAG_BONUS = 60;    // originalWho保護(GPT: +60。+1000にすると誤タグを直せない)
  var FLIP_MARGIN = 55;  // flip条件: 挑戦者にハード証拠 かつ 差55以上

  // v2判定。isNew=読み込み後の新ターン(拮抗時の非表示を許可)
  // 返り値: {act:'keep'|'flip'|'drop', to?, score?}
  function decide(res, current, isNew){
    var sc = res.sc || res;            // 後方互換(旧API: scマップ直渡し)
    var hard = res.hard || {};
    var cur = String(current || '');
    var curScore = (sc[cur] || 0) + TAG_BONUS;
    var challenger = null;
    Object.keys(sc).forEach(function(k){
      if (k === cur) return;
      if (!challenger || sc[k] > challenger.score) challenger = { who: k, score: sc[k] };
    });
    if (!challenger || challenger.score <= 0) return { act: 'keep' };
    var challengerHard = !!hard[challenger.who];
    if (challengerHard && (challenger.score - curScore) >= FLIP_MARGIN)
      return { act: 'flip', to: challenger.who, score: challenger.score };
    if (isNew && challengerHard && challenger.score > curScore)
      return { act: 'drop', score: challenger.score };   // 拮抗した強い競合 → 誤表示より欠落
    return { act: 'keep' };
  }

  function findLine(lines, quote){
    var q = norm(quote); if (!q) return -1;
    for (var i = 0; i < lines.length; i++){
      var l = String(lines[i] || '').trim();
      if (!/^[「『]/.test(l)) continue;
      if (norm(l) === q) return i;
    }
    return -1;
  }

  // ---------- fix498(C+): 代名詞ブリッジ shadow診断(自動flipしない・記録のみ・GPT裁定) ----------
  //   heroタグ・非入力・直後行が名前なしの代名詞声・直前地の文に非heroが1人だけ明記・直前カードと一致・
  //   性別明示一致 の全AND成立時のみ wouldPronounFlip を記録する。書換・保存・カード変更は一切しない。
  var _PRON_G = { '女':'彼女', '男':'彼' };
  // ---------- fix508: 代名詞ブリッジ shadow診断の「追加専用」永続ログ ----------
  //   目的: 普段のプレイで wouldPronounFlip 検知例を貯め、後で全件を人間レビュー→自動flip解禁の材料にする。
  //   安全: 専用キー(v292Dfix469_pshadow)のみ書く。chr6/セーブ/カード/S.turns は一切触らない。
  //         slot|turnFp|i|from|cand|say で dedup(再読込で同一例を重複追記しない)。上限リングで最新200件保持。
  //         書込失敗(quota等)は握りつぶし=ゲーム/セーブ経路へ波及させない(fail-closed)。
  var _PLOG_KEY = 'v292Dfix469_pshadow', _PLOG_CAP = 200;
  function _plogKey(r){ return [r.slot, r.turnFp, r.i, r.from, r.cand, r.say].join('|'); }
  function _pshadowLog(r){
    try {
      var raw = localStorage.getItem(_PLOG_KEY);
      var db = raw ? JSON.parse(raw) : null;
      if (!db || db.v !== 1 || !Array.isArray(db.recs)) db = { v: 1, recs: [] };
      var k = _plogKey(r);
      for (var j = 0; j < db.recs.length; j++){ if (db.recs[j] && db.recs[j].k === k) return; }  // dedup: 既出は追記しない
      r.k = k; db.recs.push(r);
      if (db.recs.length > _PLOG_CAP) db.recs.splice(0, db.recs.length - _PLOG_CAP);              // リング: 古い順に落とす
      localStorage.setItem(_PLOG_KEY, JSON.stringify(db));
    } catch(e){}   // fail-closed
  }
  //   allTokens=[{canon(登録名), tok(短縮含む)}]。本文照合はtokで行い canon に写す(短縮名対応)。
  function pronounShadow(cs, i, lines, at, heroName, profs, allTokens){
    try {
      var c = cs[i];
      if (i === 0) return;                                   // card0(実発話)保護
      if (!c || c._rv === 1) return;
      if (String(c.who||'') !== heroName) return;            // heroタグのみ
      var nextLine = String(lines[at+1]||'').trim();
      var pm = nextLine.match(/^[\s　「」]*(彼女|彼)の(声|言葉|囁き|呟き|叫び|悲鳴|息|手|指|足|体|身体|喉|唇|口|視線|目)/);
      if (!pm) return;                                       // 直後が名前なしの代名詞声でなければ対象外
      var pron = pm[1];
      // 直後行に(hero含む)いずれかの名前トークンが明記→既存の名前ベース判定に任せる
      for (var a=0;a<allTokens.length;a++){ if (allTokens[a].tok && nextLine.indexOf(allTokens[a].tok)>=0) return; }
      // 直前の地の文(sayの前1〜2行)に非heroが「1人だけ」明記されているか(トークン照合→canon)
      var prevText = String(lines[at-1]||'') + ' ' + String(lines[at-2]||'');
      var named = [];
      allTokens.forEach(function(tt){
        if (!tt.tok || tt.canon === heroName) return;
        if (prevText.indexOf(tt.tok) >= 0 && named.indexOf(tt.canon) < 0) named.push(tt.canon);
      });
      if (named.length > 1){ _stats.pronounAmbiguous++; return; }   // 複数明記→棄権(直近だけで推測しない)
      if (named.length !== 1) return;
      var cand = named[0];
      var prevCardWho = String((cs[i-1] && cs[i-1].who) || '');
      if (cand !== prevCardWho) return;                      // 直前カードのwhoと一致必須
      var cg = ''; profs.forEach(function(p){ if (p.name===cand) cg=p.gender; });
      if (!cg){ _stats.pronounNoGender++; return; }          // 性別未登録→棄権(代名詞からの逆算禁止)
      if (_PRON_G[cg] !== pron){ _stats.pronounNoGender++; return; }  // 男候補+彼女/女候補+彼→棄権
      _stats.wouldPronounFlip++;                             // ★全条件成立: 記録のみ(flipしない)
      try { console.log(TAG, '[wouldPronounFlip(shadow)]', String(c.who), '→', cand, String(c.say).slice(0,14)); } catch(e){}
      // fix508: 追加専用の永続ログへ(dedup・fail-closed・chr6/セーブ非破壊)
      try {
        _pshadowLog({
          ts: Date.now(),
          slot: _activeStoreKey(),
          turnFp: (String(lines[0]||'') + String(lines[1]||'')).slice(0, 40),
          i: i,
          from: String(c.who||''),
          cand: cand,
          say: String(c.say||'').slice(0, 40),
          voice: nextLine.slice(0, 40)
        });
      } catch(e){}
    } catch(e){}
  }

  // ---------- 根治: 口調ブリッジ（方言・特徴的一人称で名前無しセリフの話者を当てる） ----------
  //   背景: fix469は名前トークンの証拠(声115〜発話140)中心。名前の無いセリフは口調(方言/一人称)
  //     が弱み(+15〜+20)でタグ保護(+60)を超えられず、モデルの誤タグ(例: ひなたの関西弁→主人公)が
  //     残る=「丸ごと別人」振替ミスの温床。ここを"特徴的口調が単一話者に一意所属"の時だけ埋める。
  //   安全設計(このモジュールの実績パターンに準拠):
  //     ①名前トークンのハード証拠が皆無の時だけ検討(名前判定を上書きしない)。
  //     ②特徴的口調(方言 or 非汎用の一人称)が"登録キャストで唯一その口調を持つ者"に一致した時だけ。
  //     ③現whoがその口調を自分の口調として使っているなら棄権(=正しい関西弁を別人化する誤爆を封鎖)。
  //     ④owner名がセリフ内に出る=引用/呼びかけの疑い→棄権。
  //     ⑤実flipが既定ON(ユーザ選択2026-07-20)。振替を止めるなら v292Dfix469ToneFlipOff='1'。
  //       常にshadowログにも記録するので、後から toneDump() で全振替を追跡・検証できる。
  //       (モジュール全体を止めるなら従来どおり v292Dfix469Off='1')
  //   ※私/わたし/僕/あたし は汎用すぎるので flip 起点にしない(引用誤爆防止)。方言と非汎用一人称のみ。
  var DISTINCTIVE_FP = ['ウチ','うち','あたい','わっち','わし','儂','おいら','オイラ','拙者','某','わたくし','俺','おれ','オレ','ボク'];
  function _toneFlipOn(){ try { return localStorage.getItem('v292Dfix469ToneFlipOff') !== '1'; } catch(e){ return true; } }  // 既定ON

  function toneOwner(say, profs, cur, tokens){
    var text = String(say || '');
    if (!text || !profs || !profs.length) return null;
    var owners = {};   // name -> reasons[]
    // (1) 特徴的一人称: テキストに現れ、登録キャストで唯一その fp を持つ者
    for (var f = 0; f < DISTINCTIVE_FP.length; f++){
      var fp = DISTINCTIVE_FP[f];
      if (text.indexOf(fp) < 0) continue;
      var holders = [];
      for (var p = 0; p < profs.length; p++){ if (profs[p].fp && profs[p].fp === fp) holders.push(profs[p].name); }
      if (holders.length === 1){ (owners[holders[0]] = owners[holders[0]] || []).push('fp:' + fp); }
    }
    // (2) 関西弁: テキストが関西弁 かつ 登録キャストで唯一 kansai の者
    if (KANSAI.test(text)){
      var kh = [];
      for (var q = 0; q < profs.length; q++){ if (profs[q].kansai) kh.push(profs[q].name); }
      if (kh.length === 1){ (owners[kh[0]] = owners[kh[0]] || []).push('kansai'); }
    }
    var ns = Object.keys(owners);
    if (ns.length === 0) return null;                 // 手がかりなし
    if (ns.length > 1){ _stats.toneConflict++; return null; }   // 競合(別々の口調が別人を指す)→棄権
    var to = ns[0];
    if (to === String(cur || '')) return null;        // 現whoが所有=確定 → flipしない(誤爆防止)
    // 現whoが「自分の特徴的口調」をこのセリフで使っているなら競合 → 棄権
    var curP = null; for (var i2 = 0; i2 < profs.length; i2++){ if (profs[i2].name === String(cur || '')){ curP = profs[i2]; break; } }
    if (curP){
      if (curP.fp && DISTINCTIVE_FP.indexOf(curP.fp) >= 0 && text.indexOf(curP.fp) >= 0) return null;
      if (curP.kansai && KANSAI.test(text)) return null;
    }
    // owner名がセリフ内にある=呼びかけ/引用の可能性 → 棄権
    if (tokens){ for (var j = 0; j < tokens.length; j++){ if (tokens[j].canon === to && tokens[j].tok && text.indexOf(tokens[j].tok) >= 0) return null; } }
    return { to: to, reasons: owners[to] };
  }

  // ---------- 根治(2): 「先輩」呼び文脈ブリッジ ----------
  //   主人公は「先輩」と呼ばれる側で、自分を「先輩」と呼ばない。主人公タグのセリフが
  //   「先輩」呼びかけなら話者は非主人公。ただし誰かは口調では決まらない→
  //   直前後カードの非主人公が"1人だけ"に絞れる時だけその人へ振替、絞れなければ棄権。
  //   ※口調ブリッジ(toneOwner)が手がかりを出せなかった時の補完。既定ON・OFF共通。
  function callsSenpai(say){
    var s = String(say || '');
    return /先輩[！!？?…。、\s]*」?\s*$/.test(s) || /[、,]\s*先輩/.test(s) || /^\s*「?先輩[！!？?、]/.test(s);
  }
  function senpaiContext(cs, i, cur, heroName){
    if (!heroName || String(cur || '') !== String(heroName)) return null;   // 主人公タグのみ
    if (!cs || !cs[i] || !callsSenpai(cs[i].say)) return null;              // 先輩呼びのみ
    var cand = {};
    [cs[i-1], cs[i+1]].forEach(function(c){
      var w = c && c.who ? String(c.who).trim() : '';
      if (w && w !== String(heroName)) cand[w] = 1;
    });
    var ks = Object.keys(cand);
    if (ks.length !== 1) return null;                                       // 0 or 2+ → 棄権
    return { to: ks[0], reasons: ['senpai-context'] };
  }

  // 口調ブリッジ shadow の永続ログ(pshadowと同型・専用キー・dedup・fail-closed・chr6非破壊)
  var _TLOG_KEY = 'v292Dfix469_toneshadow', _TLOG_CAP = 200;
  function _toneShadowLog(r){
    try {
      var raw = localStorage.getItem(_TLOG_KEY);
      var db = raw ? JSON.parse(raw) : null;
      if (!db || db.v !== 1 || !Array.isArray(db.recs)) db = { v: 1, recs: [] };
      var k = [r.slot, r.turnFp, r.i, r.from, r.to, r.say].join('|');
      for (var j = 0; j < db.recs.length; j++){ if (db.recs[j] && db.recs[j].k === k) return; }
      r.k = k; db.recs.push(r);
      if (db.recs.length > _TLOG_CAP) db.recs.splice(0, db.recs.length - _TLOG_CAP);
      localStorage.setItem(_TLOG_KEY, JSON.stringify(db));
    } catch(e){}
  }

  // ---------- 分裂防止: 名前正規化（短縮名→一意なフル登録名） ----------
  //   同一人物が「澪」「白石澪」など複数表記で別話者に分裂するのを防ぐ。
  //   ・既にフル登録名ならそのまま。特殊ラベル(不明な声/群衆/???/誰か)は触らない。
  //   ・w がちょうど1つのフル登録名の"部分(短縮)"に一致する時だけフル名へ寄せる。
  //   ・複数一致(曖昧)・未登録の別名は触らない＝別キャラを融合しない（過剰統合の事故防止）。
  function canonicalWho(who, fullNames){
    var w = String(who || '').trim();
    if (!w || !fullNames || !fullNames.length) return who;
    for (var i = 0; i < fullNames.length; i++){ if (fullNames[i] === w) return w; }   // 既にフル名
    if (w === '不明な声' || w === '群衆' || w === '???' || w === '誰か') return who;
    var hits = [];
    for (var j = 0; j < fullNames.length; j++){
      var f = String(fullNames[j] || '');
      if (f && w.length < f.length && f.indexOf(w) >= 0){ if (hits.indexOf(f) < 0) hits.push(f); } // 短縮→フル(部分一致)
    }
    if (hits.length === 1) return hits[0];   // 一意な短縮のみ正規化
    return who;
  }

  // ---------- 1ターンの計画 ----------
  // allowDrop=true は「読み込み後の新ターン」のみ(拮抗時のカード非表示を許可)
  function planTurn(t, names, tokens, profs, allowDrop){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, changes: [], arr: cs };
    var narr = String((t && (t.narrative || t.text || t.body)) || '');
    var lines = narr.split('\n');
    var allTokens = tokens.concat(extraTokens(t, names, narr));   // v2: 未登録話者も候補に
    var pText = norm((t && t.playerText) || '');
    var out = [], changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c) continue;
      if (!c.say){ out.push(c); continue; }   // fix495(F12): say欠落は不触で素通し(黙殺削除しない)
      if (c._rv === 1 || (pText && norm(c.say) === pText)){ out.push(c); continue; }
      var at = findLine(lines, c.say);
      if (at < 0){ out.push(c); continue; }                       // 本文に無い=判断材料なし→不触
      var prev = at > 0 ? lines[at - 1] : '';
      var next = (at + 1 < lines.length) ? lines[at + 1] : '';
      var prevSand = at >= 2 && /^[「『]/.test(String(lines[at - 2] || '').trim());
      // 分裂防止: 短縮名→一意なフル登録名へ正規化（別キャラ融合はしない）
      var cur0 = String(c.who || '');
      var cur = canonicalWho(cur0, names);
      if (cur !== cur0){
        changes.push({ act: 'canon', from: cur0, to: cur, say: String(c.say).slice(0, 14) });
        c.who = cur; changed = true;
      }
      var res = score(c.say, prev, next, allTokens, profs, prevSand);
      var d = decide(res, cur, !!allowDrop && _dropOn());
      // fix495(B5): 物理drop(データ削除)は既定OFF(GPT裁定)。OFF時はwouldDropとして診断のみ。
      if (allowDrop && !_dropOn()){
        try { var dd = decide(res, cur, true); if (dd.act === 'drop'){ _stats.wouldDrop++; console.log(TAG, '[wouldDrop]', cur, String(c.say).slice(0,14), dd.score); } } catch(e){}
      }
      if (d.act === 'flip' && d.to !== cur){
        changes.push({ act: 'fix', from: cur, to: d.to, score: d.score, say: String(c.say).slice(0, 14) });
        c.who = d.to; changed = true; out.push(c); continue;
      }
      if (d.act === 'drop'){
        changes.push({ act: 'drop', from: cur, say: String(c.say).slice(0, 14), score: d.score });
        changed = true; continue;
      }
      // 根治: 口調ブリッジ(+先輩文脈)。名前トークンのハード証拠が皆無の keep のときだけ検討。
      //   既定ON(振替)。停止は v292Dfix469ToneFlipOff='1'。常にshadowログに記録。
      if (d.act === 'keep' && (!res.hard || Object.keys(res.hard).length === 0)){
        var heroName = String((names && names[0]) || '');
        // ★誤爆防止(2026-07-20 実測): 口調ブリッジは「主人公 or 未登録ラベル」のカードだけ対象。
        //   既に登録NPCに付いているセリフを方言/一人称だけで別NPCへ飛ばさない
        //   (例: ナナミ(非関西)の「…やない」を 関西=ひなた へ誤flipした事故の遮断)。
        var curIsRegisteredNPC = (cur !== heroName) && names && names.indexOf(cur) >= 0;
        var pick = curIsRegisteredNPC ? null : toneOwner(c.say, profs, cur, allTokens); // ①口調(方言/一人称)=主人公/未登録のみ
        if (!pick) pick = senpaiContext(cs, i, cur, heroName);  // ②先輩呼び文脈(元々hero限定)
        if (pick){
          _stats.wouldToneFlip++;
          try { console.log(TAG, '[wouldToneFlip' + (_toneFlipOn() ? '(FLIP)' : '(shadow)') + ']', cur, '→', pick.to, '(' + pick.reasons.join(',') + ')', String(c.say).slice(0, 16)); } catch(e){}
          try { _toneShadowLog({ ts: Date.now(), slot: _activeStoreKey(), turnFp: (String(lines[0]||'') + String(lines[1]||'')).slice(0, 40), i: i, from: cur, to: pick.to, why: pick.reasons.join(','), say: String(c.say||'').slice(0, 40) }); } catch(e){}
          if (_toneFlipOn()){
            changes.push({ act: 'toneFix', from: cur, to: pick.to, why: pick.reasons.join(','), say: String(c.say).slice(0, 14) });
            c.who = pick.to; changed = true; out.push(c); continue;
          }
        }
      }
      // fix498(C+): keep判定のheroタグカードに代名詞ブリッジのshadow診断(記録のみ・書換なし)
      if (d.act === 'keep' && names && names.length) { pronounShadow(cs, i, lines, at, String(names[0]||''), profs, allTokens); }
      out.push(c);
    }
    return { changed: changed, changes: changes, arr: out };
  }

  // ---------- 適用（v2: 凍結方式。全過去ターンの永続再採点を廃止） ----------
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

  function sigOf(t){
    var cs = (t && t._convSays) || [];
    var s = cs.length + '';
    for (var i = 0; i < cs.length; i++){ s += '|' + String(cs[i] && cs[i].who || '') + ':' + String(cs[i] && cs[i].say || '').length; }
    return s;
  }

  var baseTurns = -1;
  var backedUp = false;
  var evalReg = {};        // turnIndex -> { sig, evals, frozen } (メモリのみ・セーブ不触)
  var MAX_EVALS = 3;
  // fix495(B2): スロット切替の検知(chr6_active_slot値 or S.turns配列の同一性が変わったら
  // baseTurns/evalReg/backedUpをリセット)。持ち越すと新スロットの過去ターンが「新ターン」
  // 扱いになり、拮抗カードのdrop(データ削除)が過去ターンに及ぶ実測事故があった。
  function _activeStoreKey(){
    try { var a = JSON.parse(localStorage.getItem('chr6_active_slot') || 'null');
          if (a && a !== 'default') return 'chr6_slot_' + a; } catch(e){}
    return 'chr6';
  }
  var _lastSlotKey = null, _lastTurnsRef = null, _lastT0 = null;
  function _t0fp(S){ try { var t0 = S.turns[0]; return String((t0 && (t0.narrative || t0.text || '')) || '').slice(0, 80); } catch(e){ return ''; } }
  function _slotGate(S){
    var k = _activeStoreKey(), fp = _t0fp(S);
    var changed = (_lastSlotKey !== null && k !== _lastSlotKey) ||
                  (_lastTurnsRef !== null && S.turns !== _lastTurnsRef) ||
                  (_lastT0 !== null && fp !== _lastT0);       // fix495(B2): 同一配列の中身差替(インポート/初期化)も検知(GPT: 3重検知)
    if (changed){ baseTurns = -1; evalReg = {}; backedUp = false; try { lastSig = ''; } catch(e){}
      try { console.log(TAG, 'slot/story switch detected -> state reset'); } catch(e){} }
    _lastSlotKey = k; _lastTurnsRef = S.turns; _lastT0 = fp;
    return changed;
  }

  function applyTurn(S, ti, allowDrop, tokens, profs, ns){
    var p = planTurn(S.turns[ti], ns, tokens, profs, allowDrop);
    if (p.changed){
      // fix495(B3): 控えは「アクティブスロットの実キー」から取り、控えキーもスロット別。
      // 控えが書けない場合は破壊的変更を中止(fail-closed・GPT裁定)。
      if (!backedUp){
        var _bkOk = false;
        try {
          var _ak = _activeStoreKey();
          localStorage.setItem('chr6_bk_fix469_' + _ak, localStorage.getItem(_ak) || '');
          _bkOk = true;
        } catch(e){ _stats.backupFail++; }
        if (!_bkOk){ try { console.warn(TAG, 'backup failed -> 変更中止(fail-closed)'); } catch(e){} return { changed: false, changes: [], arr: S.turns[ti]._convSays }; }
        backedUp = true;
      }
      S.turns[ti]._convSays = p.arr;
    }
    return p;
  }

  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    _slotGate(S);   // fix495(B2)
    var firstRun = (baseTurns < 0);
    if (firstRun) baseTurns = S.turns.length;
    var ns = names(S); if (ns.length < 1) return { changed: false };
    var tokens = tokensOf(ns), profs = profiles(S);
    var any = false, log = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var isNew = (ti >= baseTurns);
      var reg = evalReg[ti];
      if (reg && reg.frozen) continue;
      var sig = sigOf(S.turns[ti]);
      if (!isNew){
        // 過去ターン: 読み込み時に1回だけ「明確な誤りの振替」。以後凍結。
        if (reg) continue;
        var p0 = applyTurn(S, ti, false, tokens, profs, ns);
        evalReg[ti] = { sig: sigOf(S.turns[ti]), evals: 1, frozen: true };
        if (p0.changed){ any = true; log.push({ turn: ti + 1, changes: p0.changes }); }
        continue;
      }
      // 新ターン: シグネチャが変わったときだけ再評価。最大3回で凍結。
      if (reg && reg.sig === sig) continue;
      var p = applyTurn(S, ti, true, tokens, profs, ns);
      var nsig = sigOf(S.turns[ti]);
      var evals = (reg ? reg.evals : 0) + 1;
      evalReg[ti] = { sig: nsig, evals: evals, frozen: evals >= MAX_EVALS };
      if (p.changed){ any = true; log.push({ turn: ti + 1, changes: p.changes }); }
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
      var sig = S.turns.length + ':' + ((last && Array.isArray(last._convSays)) ? sigOf(last) : '');
      if (sig === lastSig) return;
      lastSig = sig; repair();
    } catch(e){}
  }
  try { setTimeout(tick, 4000); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix469 = { stats: _stats,
    __armed: true, __v: 2, profiles: profiles, tokensOf: tokensOf, extraTokens: extraTokens,
    score: score, decide: decide, planTurn: planTurn, repair: repair,
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var ns = names(S); if (!ns.length) return null;
      var tokens = tokensOf(ns), profs = profiles(S), res = [];
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i];
        var copy = { narrative: (t && t.narrative) || '', playerText: (t && t.playerText) || '',
                     _convSays: ((t && t._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, ns, tokens, profs, true);
        if (p.changes && p.changes.length) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    // fix508: 診断ログの読出/件数/消去(いずれもchr6・セーブ非破壊)
    pshadowDump: function(){ try { var raw = localStorage.getItem('v292Dfix469_pshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs) || []; } catch(e){ return []; } },
    pshadowCount: function(){ try { var raw = localStorage.getItem('v292Dfix469_pshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs && db.recs.length) || 0; } catch(e){ return 0; } },
    pshadowClear: function(){ try { localStorage.removeItem('v292Dfix469_pshadow'); return true; } catch(e){ return false; } },
    // 根治: 口調ブリッジの診断ログ / 実flip解禁トグル(いずれもchr6・セーブ非破壊)
    toneOwner: toneOwner,
    toneFlipOn: _toneFlipOn,
    toneDump: function(){ try { var raw = localStorage.getItem('v292Dfix469_toneshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs) || []; } catch(e){ return []; } },
    toneCount: function(){ try { var raw = localStorage.getItem('v292Dfix469_toneshadow'); var db = raw ? JSON.parse(raw) : null; return (db && db.recs && db.recs.length) || 0; } catch(e){ return 0; } },
    toneClear: function(){ try { localStorage.removeItem('v292Dfix469_toneshadow'); return true; } catch(e){ return false; } },
    toneFlipEnable: function(on){ try { if (on === false){ localStorage.setItem('v292Dfix469ToneFlipOff','1'); return false; } localStorage.removeItem('v292Dfix469ToneFlipOff'); return true; } catch(e){ return on !== false; } }
  };
  try { console.log(TAG, 'loaded v2'); } catch(e){}
})();
