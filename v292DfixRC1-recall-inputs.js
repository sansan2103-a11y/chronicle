/* v292DfixRC1-recall-inputs.js (2026-10-22 QUOTE-01-L1 / GPT #127-JS binding ruling ・ r2 = GPT #127-KA)
 * ─ 想起を求める入力のときだけ、この物語の「本当にあった入力・台詞」を user JSON に `playerInputs` として足す ─
 *
 * 背景（QUOTE01_REPORT / A/B）: 新エンジンでモデルに渡る本文由来の文脈は recentScenes（直近 2 ターン）と storySoFar だけ。
 *   「最初に会った日、僕が何を探していると言ったか」(b23) では初日の本物の発言が文脈に無く、モデルは作者設定を過去の発言に付け替えて捏造した。
 *   A/B（b23 r2・f2t9 r3、各 OFF 8 / RC1 8）で RC1 r1 は捏造 8/8→2/8・8/8→0/8、本物の引用 0→8・0→8。
 *
 * r1 → r2（GPT #127-KA。検索の仕組みは増やさず、規則だけを最小限に直した）:
 *   ① 置き場所: 本番でも A/B で測った形（playerInputs は storySoFar の「直後」）に揃えた。r1 は fix58 より先に走る通常の順序で
 *      storySoFar の「直前」になっていた。r2 は storySoFar がまだ無く fix58 が後に控えているとき、storySoFar の席（空文字）を先に作って
 *      その直後に置く。fix58 は storySoFar を代入で上書きするだけなので（キーの位置は動かない）、最終の並びは
 *      …storySoFar, playerInputs, recentScenes… になる（fix58 の後に走る順序でも同じ）。値は fix58 が書く。増分の字数は位置に依らない。
 *      RC1 は 3 秒ごとに自分を fix58 の直前へ置き直す（間に他の拡張が挟まると、その拡張のキーが席より後ろに回り OFF と並びが変わるため）。
 *   ② 発火: 強い手掛かり（覚え／前に＋言・話・聞…）か、発話の動詞（言った・話した・聞いた・書いた・約束 等）に「問い」（？・か。・っけ・
 *      よね・でしょう・何て/何と/なんて 等）か「過去を指す語」（前に・以前・この前・あの時・最初・初日・昔・昨日 等）が添うときだけ。
 *      r1 の「最初/初日/あの時/以前/この前」単独の発火（「最初の扉を開ける」）と、動詞だけの発火（「三島さんに礼を言った」「緒方さんの言ったとおり
 *      箱を開ける」「約束の時間まで」）をやめた＝ふつうの会話・行動の入力では入らない（user は byte 同一）。「お話しした」も拾う。
 *   ③ (a) 初日ルール: 入力が始まりを明示するとき（最初/初日/一日目/初めて会った・来た・話した/出会った日）だけ。「あの日」「初めて見る」は対象外。
 *   ④ 内容語: 登場人物名に加えて、保存済み _convSays の話者ラベル（cast 外の「司書」など）も名前として内容語から外す（「司書さん」で
 *      司書を含む入力が全部当たっていた）。「〜さん/様/くん…」の付いた語は呼びかけとして内容語にしない（cast 外・役職名でも同じ）。
 *      1 字の漢字語は前後が漢字でない所だけ一致（「礼」が「失礼」に当たらない）。「もう一度」等の切れ端は語にしない。
 *      保存済み候補の 5 件以上に現れる語（DF_MAX=4 超）は特定の発言を指さないので使わない。
 *   ⑤ (b) 一致の弱い項目は入れない（初日ルールの項目を除く）: 2 字以上の内容語が 1 つ以上、または 1 字の漢字語が 2 つ以上一致した項目だけ
 *      （「探」1 字だけの一致で無関係な台詞が入っていた）。1,000 字は上限であって目標ではない。関係する項目が 2 件なら 2 件。
 *   ⑥ (c) 呼びかけ相手: cast の NPC 名に加えて話者ラベル（「司書さん」→ 司書）で判定する。相手の台詞は一致数が同じなら先に並べる。
 *      一致語の無い相手の台詞（ADDR_N=3 件・新しい順）は、入力に内容語が 1 つも無く、過去を指す語があるとき（「前に話してくれたこと」型）だけ
 *      （「三島さん、今なんて言った？」で古い台詞を足さない）。
 *   ⑦ 話者の確かさ: NPC_SPOKEN は話者の根拠が強い台詞だけ。_convSayMeta が揃っていれば fix915/fix922 と同じ基準
 *      （sourceKind 'say-tag'・tagMappingConfidence 'exact'・speakerRevision 0・sourceWhoRaw = who）。meta が無い／長さが合わない旧ターンは、
 *      plan.narrative / plan._structuredNarrative に同じ話者の <say> があり、その中に台詞があるときだけ（fix192 B0 と同じ考え方）。
 *      それ以外（bare-inferred・harvest・推測昇格・後段で書き換え・'???' 等）は入れない。印を付けて渡す案は取らない（形を変えずに済む・誤帰属を渡さない）。
 *   ⑧ PLAYER_INPUT と NPC_SPOKEN を混ぜない: 主人公名（全体・前半・後半・(心)付き）・「あなた/主人公/私/僕/俺」の話者は NPC_SPOKEN にしない。
 *      そのターンの入力に含まれる台詞（6 字以上・入力の写し）も NPC_SPOKEN にしない（fix915 player-echo と同じ）。
 *
 *   材料: この物語の S.turns だけ（ctx.state ＝ Planner.build が渡す現在の S）。build のたびに読む＝EDIT-01/01b の編集・削除後の
 *     最新の playerText / _convSays / _convSayMeta / plan を使い、消した台詞は戻らない（plan は根拠の確認にだけ使い、台詞の出どころにはしない）。
 *     scene.objective / lore / cards / 要約など作者設定・派生物は入れない。直近 2 ターン（recentScenes）は対象外。
 *   形: PLAYER_INPUT = {turn, kind, type, text}、NPC_SPOKEN = {turn, kind, who, text}（r1・A/B と同形）。text は 200 字で切る。
 *   上限: user の増分 ≤ 1,000 字・≤ 8 件。sys は触らない。保存しない（S・localStorage に書かない）。
 * ★r42 Owner だけの opt-in: v292DfixRC1On='1' かつ /auth/me（window.__v292Dfix893.serverMe()）が entitlement owner・status active、匿名経路でない、のときだけ有効（呼び出しごとに評価・fail-closed）。
 * kill v292DfixRC1Off='1'（常に優先）。非 Owner・未ログイン・/auth/me 不達・匿名は opt-in でも OFF。OFF は user/sys とも byte 同一（配列の並べ直しもしない）。
 * 診断: window.__v292DfixRC1 = { VER, on, needsRecall, early, contentWords, candidates, select, last, … }
 * 冪等: window.__v292DfixRC1
 */
(function(){
  'use strict';
  if (window.__v292DfixRC1) return;
  var TAG = '[v292DfixRC1]', VER = 'r2';
  var MAX = 1000;       /* user の増分（字）の上限。目標ではない */
  var MAX_N = 8;        /* 項目数の上限 */
  var EARLY_N = 4;      /* 始まりを明示したとき先頭から採るターン数 */
  var EARLY_NPC_N = 2;  /* そのうち NPC_SPOKEN を一致なしで採る件数 */
  var ADDR_N = 3;       /* 内容語が無い入力で、呼びかけ相手の台詞を採る上限（新しい順） */
  var TEXT_CAP = 200;   /* 1 項目の text の上限（超えたら「…」） */
  var RECENT_N = 2;     /* fix58 の recentScenes と同じ窓。ここに入るターンは対象外 */
  var DF_MAX = 4;       /* 候補のこれより多くに現れる語は「特定の発言を指さない」ので使わない */
  /* 発火条件 = 発話・記憶の手掛かり（小さく保つ）。※「〜する前に」「約束させる」「話したがらない」は除外（r1 で実物語の写しが誤発火） */
  var STRONG = [ /覚え/, /前に(?:言|聞|話|書|約束|頼|伝|教|会|見せ|渡し)/ ];          /* これだけで発火 */
  var CUES = [                                                                             /* 発話の動詞: 問い か 過去を指す語 と一緒のときだけ発火 */
    /言った/, /言って(?:た|い)/, /言われ/, /仰った/, /仰って/, /おっしゃ/,
    /書いた/, /書いて(?:た|い)/, /書き留め/, /聞いた/, /約束(?!させ|する|して|しろ|しよう|させよう)/, /話し(?:し)?た(?!がら|く)/, /頼んだ/, /伝えた/, /教えた/, /教えてくれた/
  ];
  var Q_RE = /[?？]|か[。！!\s　]*$|っけ|よね|でしょう|だろう|何て|何と|なんて|なんと|どんな|何を|何が/;
  var PAST_RE = /前に|以前|この前|この間|こないだ|あの時|あのとき|あの日|最初|初日|一日目|昔|かつて|先日|昨日/;
  var EARLY_RE = /最初|初日|一日目|(?:初めて|はじめて)(?:会|お会|来|話|出会)|出会った(?:日|とき|時|頃)/;
  /* 内容語から除く語（手掛かり語・機能語・人称・汎用語） */
  var STOP = { '覚':1,'最初':1,'初日':1,'初':1,'前':1,'以前':1,'言':1,'書':1,'聞':1,'約束':1,'話':1,'頼':1,'伝':1,'教':1,'日':1,'時':1,'何':1,'誰':1,'僕':1,'私':1,'俺':1,'君':1,'貴方':1,'貴女':1,'人':1,'会':1,'思':1,'事':1,'方':1,'今':1,'中':1,'上':1,'下':1,'気':1,'一':1,'二':1,'三':1,'目':1,'手':1,'自分':1,'様子':1,'本当':1,'確':1,'出':1,'来':1,'見':1,'行':1,'入':1,'持':1,'知':1,'分':1,'度':1,'回':1,'間':1,'後':1,'先':1,'為':1,'所':1,'者':1,'物':1,'様':1,'達':1,'等':1,'頃':1,'件':1,'点':1,'通':1,'名':1,'音':1,
               '一日目':1,'出会':1,'一度':1,'何度':1,'今度':1,'仰':1 };
  var SUFFIX = /(さん|くん|君|ちゃん|様|先生|殿)$/;
  var SELF_WHO = /^(あなた|貴方|主人公|プレイヤー|私|僕|俺|わたし|ぼく|おれ)$/;
  var KANJI = /[一-龥々]/;

  /* ★r42 RC1-OWNER (GPT #127-KO): Owner だけの opt-in。BF1-OWNER（v292Dsmrc1 __bf1Owner/__bf1Anon・v292DfixBF1 ownerGate）と同じ読み口・同じ fail-closed。
     ON = !kill && optIn==='1' && !匿名経路 && Owner（window.__v292Dfix893.serverMe(): entitlement==='owner' && status==='active'）。
     呼び出しごとに評価（読み込み時に固定しない）。/auth/me 未応答（null）・失敗・非 Owner・API 不在・例外・storage 不可 → OFF。書くもの: なし。 */
  function ownerGate(){
    try {
      var A = window.__v292Dfix893;
      if (!A || typeof A.serverMe !== 'function') return false;              /* account API 不在 = fail-closed */
      var me = A.serverMe();                                                  /* server 由来の cache（未応答 = null） */
      return !!(me && me.entitlement === 'owner' && me.status === 'active');
    } catch(e){ return false; }
  }
  function anonActive(){
    try { var P = window.__v292Dfix886; return !!(P && P.api && typeof P.api.active === 'function' && P.api.active()); } catch(e){ return true; }   /* 判定不能 = 匿名扱い = OFF */
  }
  /* 戻り: 'killed' | 'unset' | 'anon' | 'owner' | 'not-owner' */
  function gate(){
    var kill, opt;
    try { kill = localStorage.getItem('v292DfixRC1Off'); opt = localStorage.getItem('v292DfixRC1On'); } catch(e){ return 'killed'; }   /* storage 不可 = OFF */
    if (kill === '1') return 'killed';
    if (opt !== '1') return 'unset';
    if (anonActive()) return 'anon';
    return ownerGate() ? 'owner' : 'not-owner';
  }
  function on(){ return gate() === 'owner'; }
  function getS(){ try { if (typeof window.__chronicleGetState === 'function'){ var s = window.__chronicleGetState('fixRC1'); if (s) return s; } } catch(e){} try { return (0, eval)('typeof S !== "undefined" ? S : null'); } catch(e2){ return null; } }
  function getP(){ return window.Planner || (function(){ try { return (0, eval)('typeof Planner !== "undefined" ? Planner : null'); } catch(e){ return null; } })(); }
  function str(v){ return (v == null) ? '' : String(v); }
  function nrm(s){ return str(s).replace(/[\s　]/g, ''); }
  function nfc(s){ s = str(s); try { s = s.normalize('NFC'); } catch(e){} return s.trim(); }
  function pn(s){ return str(s).replace(/[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/g, ''); }   /* EDIT-01 の norm と同じ文字集合 */
  function cap(s){ s = str(s).replace(/\r\n?/g, '\n').trim(); return s.length > TEXT_CAP ? s.slice(0, TEXT_CAP - 1) + '…' : s; }
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }

  function anyRe(list, t){ for (var i = 0; i < list.length; i++){ if (list[i].test(t)) return true; } return false; }
  function needsRecall(text){ text = str(text); if (!text) return false; if (anyRe(STRONG, text)) return true; return anyRe(CUES, text) && (Q_RE.test(text) || PAST_RE.test(text)); }
  function isEarly(text){ return EARLY_RE.test(str(text)); }
  function unclearWho(w){ w = nrm(w); return !w || /^[?？]+$/.test(w) || /謎の声|不明|誰か|声$/.test(w) || /^(\?|？)/.test(w); }
  function heroOf(S){ return nrm(S && S.cast && S.cast.hero && S.cast.hero.name); }
  /* 主人公（または自称）の話者 = PLAYER_INPUT 側のもの。NPC_SPOKEN にしない。主人公名の前半・後半（「木暮律」の「律」、「霧 涼太」の「涼太」）も主人公扱い（安全側） */
  function selfWho(who, S){
    var w = nrm(who).replace(/[(（][^)）]*[)）]$/, ''), h = heroOf(S);
    if (!w) return true;
    if (h && (w === h || h.indexOf(w) === 0 || h.slice(h.length - w.length) === w)) return true;
    return SELF_WHO.test(w);
  }
  function monologue(who){ return /[(（]心[)）]$/.test(nrm(who)); }
  /* 保存済み _convSays の話者ラベル（cast 外の「司書」など）。主人公・不明話者は除く */
  function speakerLabels(S){
    var out = {}, turns = (S && Array.isArray(S.turns)) ? S.turns : [];
    for (var i = 0; i < turns.length; i++){ var cs = turns[i] && Array.isArray(turns[i]._convSays) ? turns[i]._convSays : []; for (var j = 0; j < cs.length; j++){ var w = cs[j] && cs[j].who; if (!w || unclearWho(w) || selfWho(w, S)) continue; w = nrm(w).replace(/[(（][^)）]*[)）]$/, ''); if (w) out[w] = 1; } }
    return out;
  }
  /* 名前扱いの語（内容語にしない）: cast の名前（姓・名・全体・前後の部分）＋話者ラベル */
  function nameSet(S){
    var names = {}, add = function(n){ n = str(n).trim(); if (!n) return; var full = nrm(n); names[full] = 1; n.split(/[\s　]+/).forEach(function(p){ if (p) names[p] = 1; });
      for (var k = 2; k < full.length; k++){ names[full.slice(0, k)] = 1; names[full.slice(full.length - k)] = 1; } };   /* 空白なしの姓名（三島灯子）→ 三島／灯子 も名前扱い */
    try { if (S && S.cast){ add(S.cast.hero && S.cast.hero.name); (S.cast.npcs || []).forEach(function(n){ add(n && n.name); }); } } catch(e){}
    var lb = speakerLabels(S); for (var l in lb) if (has(lb, l)) add(l);
    return names;
  }
  var ADDR_FOLLOW = /^(さん|くん|ちゃん|さま|どの)/;
  function contentWords(text, S){
    var out = [], seen = {}, m, re = /[一-龥々]+|[ァ-ヴー]{2,}|[A-Za-z0-9]{2,}/g, names = nameSet(S);
    text = str(text).replace(/(?:もう)?[一何今]度/g, '、');   /* 「もう一度聞かせて」の「一度聞」のような言い回しの切れ端を語にしない */
    while ((m = re.exec(text))){
      var w = m[0].replace(SUFFIX, '');
      if (w !== m[0] || ADDR_FOLLOW.test(text.slice(m.index + m[0].length))) continue;   /* 「司書さん」「三島様」= 呼びかけ（名前扱い・内容語にしない） */
      if (!w || STOP[w] || names[w] || seen[w]) continue;
      seen[w] = 1; out.push(w);
    }
    return out;
  }
  /* 一致: 1 字の漢字語は前後が漢字でない所だけ（「礼」は「失礼」に当たらない）。それ以外は部分一致 */
  function hit(w, text){
    text = str(text);
    if (w.length !== 1 || !KANJI.test(w)) return text.indexOf(w) >= 0;
    var p = -1;
    while ((p = text.indexOf(w, p + 1)) >= 0){ if (!KANJI.test(text.charAt(p - 1) || '') && !KANJI.test(text.charAt(p + 1) || '')) return true; }
    return false;
  }
  /* 一致の重み: 2 字以上の語 = 2・1 字の漢字語 = 1。項目は重み 2 以上で「一致あり」 */
  function score(words, text){ var n = 0; for (var i = 0; i < words.length; i++){ if (hit(words[i], text)) n += (words[i].length >= 2 ? 2 : 1); } return n; }
  var MIN_SC = 2;
  /* 呼びかけ相手: cast の NPC 名（部分を含む）＋話者ラベル（2 字以上）が入力に出ているもの。値 = その話者の正規化名 */
  function addressees(text, S){
    var out = {}; text = nrm(text);
    try { (S && S.cast && S.cast.npcs || []).forEach(function(n){ var nm = nrm(n && n.name); if (!nm) return; var hitN = text.indexOf(nm) >= 0; if (!hitN){ for (var k = 2; k < nm.length && !hitN; k++){ if (text.indexOf(nm.slice(0, k)) >= 0 || text.indexOf(nm.slice(nm.length - k)) >= 0) hitN = true; } } if (hitN) out[nm] = 1; }); } catch(e){}
    var lb = speakerLabels(S); for (var l in lb) if (has(lb, l) && l.length >= 2 && text.indexOf(l) >= 0) out[l] = 1;
    return out;
  }
  /* 話者の根拠（⑦）。meta が揃っていれば fix915/fix922 の強い根拠と同じ基準。無ければ plan の <say who> に台詞があること */
  var SAY_RE = /<say\b([^>]*)>([\s\S]*?)<\/say>|([^]*)([\s\S]*?)/gi;
  function tagEvidence(turn, who, say){
    var plan = turn && turn.plan, texts = [], k = pn(say), w = nfc(who), i, m;
    if (!plan || typeof plan !== 'object' || !k) return false;
    if (Array.isArray(plan.narrative)) texts = texts.concat(plan.narrative.map(str)); else if (typeof plan.narrative === 'string') texts.push(plan.narrative);
    if (Array.isArray(plan._structuredNarrative)) plan._structuredNarrative.forEach(function(x){ if (x && typeof x.text === 'string') texts.push(x.text); });
    for (i = 0; i < texts.length; i++){
      SAY_RE.lastIndex = 0;
      while ((m = SAY_RE.exec(texts[i]))){
        var tw = m[1] !== undefined ? ((m[1].match(/who\s*=\s*["']([^"']*)["']/) || [])[1] || '') : str(m[3]);
        var body = m[2] !== undefined ? m[2] : m[4];
        if (nfc(tw) === w && pn(body).indexOf(k) >= 0) return true;
      }
    }
    return false;
  }
  function provenance(turn, j, c){
    var cs = turn._convSays, meta = turn._convSayMeta;
    if (Array.isArray(meta) && meta.length === cs.length){
      var e = meta[j];
      if (!e || typeof e !== 'object') return 'no-meta-entry';
      if (e.sourceKind !== 'say-tag') return str(e.sourceKind || 'unknown');
      if (e.tagMappingConfidence !== 'exact') return 'tag-' + str(e.tagMappingConfidence || 'none');
      if ((+e.speakerRevision || 0) > 0) return 'speaker-revised';
      if (nfc(e.sourceWhoRaw) !== nfc(c.who)) return 'who-mismatch';
      return 'ok';
    }
    return tagEvidence(turn, c.who, c.say) ? 'ok' : 'legacy-unverified';
  }

  /* 候補を作る: 直近 RECENT_N ターンを除く全ターンの PLAYER_INPUT と、根拠の強い NPC_SPOKEN */
  function candidates(S, why){
    var turns = (S && Array.isArray(S.turns)) ? S.turns : [];
    var hi = Math.max(0, turns.length - RECENT_N), out = [];
    why = why || {};
    for (var i = 0; i < hi; i++){
      var t = turns[i]; if (!t) continue;
      var pt = str(t.playerText).trim(), ptK = pn(pt);
      if (pt) out.push({ turn: i + 1, kind: 'PLAYER_INPUT', type: str(t.inputType || ''), text: cap(pt) });
      var cs = Array.isArray(t._convSays) ? t._convSays : [];
      for (var j = 0; j < cs.length; j++){
        var c = cs[j]; if (!c || typeof c.say !== 'string') continue;
        var say = c.say.trim(); if (!say) continue;
        var who = str(c.who).trim(), r = null, sk = pn(say);
        if (unclearWho(who)) r = 'unclear';
        else if (selfWho(who, S) || monologue(who)) r = 'self';                          /* 主人公・自称・心の声 = PLAYER_INPUT 側（relabel しない） */
        else if (ptK && sk && (sk === ptK || (sk.length >= 6 && ptK.indexOf(sk) >= 0))) r = 'player-echo';   /* 入力の写し */
        else { var pv = provenance(t, j, c); if (pv !== 'ok') r = 'prov:' + pv; }
        if (r){ why[r] = (why[r] || 0) + 1; continue; }
        out.push({ turn: i + 1, kind: 'NPC_SPOKEN', who: who, text: cap(say), ci: j });
      }
    }
    return out;
  }
  function byTurn(a, b){ return a.turn - b.turn || (a.kind === b.kind ? (a.ci || 0) - (b.ci || 0) : (a.kind === 'PLAYER_INPUT' ? -1 : 1)); }
  /* 優先順に並べる。early = 始まりを明示したときの先頭 EARLY_N ターン（PLAYER_INPUT 全部 → NPC_SPOKEN を EARLY_NPC_N 件）。
     その後は一致のある項目だけ（一致数の多い順・同数なら呼びかけ相手の台詞が先・古い順）。内容語が無い入力でだけ呼びかけ相手の台詞（新しい順） */
  function prioritize(cands, text, S){
    var early = isEarly(text), words0 = contentWords(text, S), adr = addressees(text, S), out = [], rest = [], i;
    var df = {}, words = [], common = [];
    words0.forEach(function(w){ var n = 0; for (var q = 0; q < cands.length; q++) if (hit(w, cands[q].text)) n++; df[w] = n; if (n > DF_MAX) common.push(w); else if (n > 0) words.push(w); });
    var addrFallback = words0.length === 0 && PAST_RE.test(str(text));
    for (i = 0; i < cands.length; i++){ var c = cands[i]; c.wsc = score(words, c.text); if (c.wsc < MIN_SC) c.wsc = 0; c.adr = (c.kind === 'NPC_SPOKEN' && adr[nrm(c.who)]) ? 1 : 0; c.sc = c.wsc * 2 + c.adr; c.early = early && c.turn <= EARLY_N; if (c.early) out.push(c); else rest.push(c); }
    out.sort(byTurn);
    var npcN = 0; out = out.filter(function(c){ if (c.kind !== 'NPC_SPOKEN') return true; if (npcN < EARLY_NPC_N){ npcN++; return true; } c.early = false; rest.push(c); return false; });
    rest = rest.filter(function(c){ return c.wsc > 0 || (addrFallback && c.adr); });
    rest.sort(function(a, b){ if (b.sc !== a.sc) return b.sc - a.sc; if (a.wsc > 0 || b.wsc > 0) return byTurn(a, b); return b.turn - a.turn || (b.ci || 0) - (a.ci || 0); });
    return { list: out.concat(rest), words: words, common: common, early: early, addrFallback: addrFallback, addressees: Object.keys(adr) };
  }
  function strip(c){ var o = { turn: c.turn, kind: c.kind }; if (c.kind === 'PLAYER_INPUT') o.type = c.type; else o.who = c.who; o.text = c.text; return o; }   /* PLAYER_INPUT: {turn,kind,type,text} / NPC_SPOKEN: {turn,kind,who,text}（A/B と同形） */
  /* ① storySoFar の直後に置く。storySoFar がまだ無く fix58 が後に控えているときは、storySoFar の席を先に作る（値は fix58 が上書きする） */
  function fix58Pending(){
    try { var P = getP(), a = P && P._userExtensions; if (!Array.isArray(a) || a.__v292Dfix58 !== true) return false; var i = a.indexOf(userExt); return i >= 0 && i < a.length - 1; } catch(e){ return false; }
  }
  function seat(parsed, pending){ if (has(parsed, 'storySoFar') || !pending) return parsed; var o = {}, k; for (k in parsed) if (has(parsed, k)) o[k] = parsed[k]; o.storySoFar = ''; return o; }
  function place(parsed, entries){
    var out = {}, placed = false, k;
    for (k in parsed){ if (!has(parsed, k)) continue; out[k] = parsed[k]; if (k === 'storySoFar'){ out.playerInputs = entries; placed = true; } }
    if (!placed) out.playerInputs = entries;
    return out;
  }
  /* 予算内で選ぶ（JSON.stringify(…, null, 2) の増分で測る＝実際の user の増分。席の空文字は fix58 が上書きするので数えない） */
  function select(S, text, parsed, pending){
    var why = {}, cands = candidates(S, why), pr = prioritize(cands, text, S), base = seat(parsed || { currentInput: { text: text } }, !!pending);
    var baseLen = JSON.stringify(base, null, 2).length, picked = [], i, addrN = 0;
    var delta = function(arr){ return JSON.stringify(place(base, arr.slice().sort(byTurn).map(strip)), null, 2).length - baseLen; };
    for (i = 0; i < pr.list.length && picked.length < MAX_N; i++){
      var c = pr.list[i], fb = !c.early && !c.wsc;
      if (fb && addrN >= ADDR_N) continue;
      var cand = picked.concat([c]);
      if (delta(cand) <= MAX){ picked = cand; if (fb) addrN++; }
    }
    picked = picked.slice().sort(byTurn);
    return { entries: picked.map(strip), delta: picked.length ? delta(picked) : 0, words: pr.words, common: pr.common, early: pr.early, addrFallback: pr.addrFallback, addressees: pr.addressees, candidates: cands.length, ranked: pr.list.length, excluded: why, base: base };
  }

  var last = null;
  function userExt(ctx){
    if (!on()) return ctx.user;
    try {
      var parsed = JSON.parse(ctx.user);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.currentInput) return ctx.user;   /* 新エンジンの user JSON だけ */
      if (has(parsed, 'playerInputs')) return ctx.user;                                                               /* 二重注入しない */
      var text = str(parsed.currentInput.text);
      if (!needsRecall(text)){ last = { ver: VER, fired: false, turns: (ctx.state && ctx.state.turns) ? ctx.state.turns.length : null }; return ctx.user; }
      var S = ctx.state || getS();
      if (!S || !Array.isArray(S.turns)) return ctx.user;
      var pending = !has(parsed, 'storySoFar') && fix58Pending();
      var r = select(S, text, parsed, pending);
      last = { ver: VER, fired: true, turns: S.turns.length, n: r.entries.length, delta: r.delta, words: r.words, common: r.common, early: r.early, addrFallback: r.addrFallback, addressees: r.addressees, candidates: r.candidates, excluded: r.excluded,
               pos: has(parsed, 'storySoFar') ? 'after-storySoFar' : (pending ? 'seat-before-fix58' : 'append'), entries: r.entries.map(function(e){ return e.turn + ':' + e.kind + (e.who ? ':' + e.who : ''); }) };
      if (!r.entries.length) return ctx.user;
      return JSON.stringify(place(r.base, r.entries), null, 2);
    } catch(e){ try { console.warn(TAG, 'userExt error:', e && e.message); } catch(_e){} return ctx.user; }
  }
  userExt.__v292DfixRC1 = true;
  /* ① の席が OFF と同じ並びになるよう、RC1 を fix58（配列の末尾に自分を保つ）の直前に置く。間に他の拡張（例: 後から入る fixCTX）が
     挟まると、その拡張が足すキーが storySoFar の席より後ろに回るため。RC1 自身は純関数でキーを 1 つ足すだけなので、動かしても他に影響しない。
     fix58 と同じ 3 秒ごとに確かめる（fix58 は末尾、RC1 は末尾の 1 つ手前を取るので取り合いにならない）。RC1 が末尾にいる間（読み込み直後）は動かさない。
     OFF / kill のときは何もしない（配列の順も bundle41-a のまま）。 */
  function ensureBeforeFix58(){
    try {
      if (!on()) return;                                                                                  /* OFF / kill: 配列にも触らない */
      var P = getP(), a = P && P._userExtensions; if (!Array.isArray(a) || a.__v292Dfix58 !== true) return;
      var i = a.indexOf(userExt), t = a.length - 1; if (i < 0 || i >= t - 1) return;
      a.splice(i, 1); a.splice(a.length - 1, 0, userExt);
    } catch(e){}
  }
  function install(){
    var P = getP();
    if (!P || typeof P.build !== 'function'){ setTimeout(install, 300); return; }
    P._userExtensions = P._userExtensions || [];
    if (!P._userExtensions.some(function(f){ return f && f.__v292DfixRC1; })) P._userExtensions.push(userExt);
    ensureBeforeFix58(); setInterval(ensureBeforeFix58, 3000);
  }
  window.__v292DfixRC1 = { VER: VER, MAX: MAX, MAX_N: MAX_N, EARLY_N: EARLY_N, EARLY_NPC_N: EARLY_NPC_N, ADDR_N: ADDR_N, TEXT_CAP: TEXT_CAP, RECENT_N: RECENT_N, DF_MAX: DF_MAX, MIN_SC: MIN_SC, STRONG: STRONG, CUES: CUES, Q_RE: Q_RE, PAST_RE: PAST_RE, EARLY_RE: EARLY_RE,
    on: on, gate: gate, needsRecall: needsRecall, early: isEarly, contentWords: contentWords, addressees: addressees, provenance: provenance, candidates: candidates, select: select, place: place, last: function(){ return last; }, __userExt: userExt };
  install();
  try { console.log(TAG, VER, 'loaded (Owner-only opt-in v292DfixRC1On=1; kill v292DfixRC1Off=1)'); } catch(e){}
})();
