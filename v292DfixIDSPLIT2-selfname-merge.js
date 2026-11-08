// =====================================================================
// Chronicle TRPG - v292DfixIDSPLIT2: 名前の無い呼び名（少女／裸足の少女 など）の人が「登録キャラの名前」を名乗ったとき、
//                  はっきりした証拠がそろう場合だけ同じ人として扱う（★Owner だけのカナリア・LOCAL ONLY）
// ---------------------------------------------------------------------
// 由来: IDSPLIT1（知人試験アカウントの物語で捕獲。登録NPCがずっと「少女」「裸足の少女」と書かれ、
//   fix307 の自動抽出で別人として一覧に出た。のちの裸の台詞「わたし、＜登録名＞……！」は fix469 が「少女」へ flip し、
//   会話ログに 2 人として並んだ）。IDSPLIT2 は GPT 裁定 #127-RE ③（Owner CANARY・条件付き GO）に合わせて条件を締めた版。
//
// ■ 誰に効くか（npcq1 C2 / fix414 npcqOwner と同じ読み口・同じ fail-closed・毎回評価）
//   有効 = 画面のアカウントが owner かつ active（window.__v292Dfix893.serverMe()）で、匿名経路（__v292Dfix886.api.active()）ではない時だけ。
//   それ以外（beta・none・suspended・ログアウト・/auth/me 未応答・API 不在・例外・storage 不可）は**何もしない**（観測もしない）。
//   kill: localStorage v292DfixIDSPLIT2Off='1'（この file と fix469 の ★IDSPLIT2 分岐の両方が止まる）
//
// ■ 結び付ける（＝別名を 1 件足す）のは、次の全部がそろうときだけ。1 つでも欠けたら「観測だけ」（メモリ上に理由を記録・表示もデータも変えない）
//   (1) 新しいターンの会話カードの話者 W が「記述的な呼び名」（fix537 と同じ語尾: 少女/少年/娘/婦人/老人/影…）で、登録名・主人公・代名詞ではない
//   (2) その台詞が「一人称＋登録NPCのフルネーム」型の本人の名乗り（わたし、N／わたしはN／名前はN／Nっていうの／Nです）で、名乗っている登録NPCがちょうど 1 人
//       ・名だけ（ミナ）・部分一致・疑問（N？）・三人称の言及（Nって子／Nっていう子／Nのこと／Nを／Nさん／その子はNっていうの）は対象外
//       ・主人公の名前の名乗りは対象外（主人公への結び付けはしない）
//   (3) 同じ場面: W がそのターンの地の文（台詞の外）に出ている
//   (4) 候補が 1 人: そのターンに同じ種類の別の呼び名の話者がいない／地の文に「二人の少女」「もう一人の少女」「少女たち」等が無い／
//       ロスター(fix307)に同じ種類の呼び名が 2 つ以上無い／主人公や N 以外の登録NPCの説明が同じ種類（少女 等）に当てはまらない
//   (5) 説明が合う: N の説明に W の種類の語（少女 等）があるか、性別と年齢層の両方が一致する。性別・年齢層・役職（司書/巫女…）に食い違いが無い
//       （W・ロスターの外見・N の説明と性別欄で比べる）
//   (6) 別人を示す情報が無い: そのターンの地の文に N の名前（2 字以上の部分）が出ていない／直近 3 ターンの地の文で N と W が同じ文に並んでいない／
//       ロスターに N の名前の別項目が無い／登録NPCに同じ名前（読み仮名違い等）が 2 人いない／W が既に別の人の別名になっていない
//   (7) 記憶を上書きしない: W（やロスター呼び名）と N の両方に fix77 の状態があるときは結び付けない（統合で N の状態が上書きされるため）
// ■ 結び付けたときにすること（既存の仕組みに 1 件ずつ足すだけ。新しい推論器・新しい保存キーは作らない）
//   ・fix277 別名台帳へ addAlias(N, W)（とロスターの呼び名 1 件）を足す（fix537 と同じ置き場）
//   ・fix538 normalizeConvWho で会話ログの話者を N へ寄せる（控え chr6_bk_fix538_<時刻> を取ってから）
//   ・以降は既存の fix537b（一覧の自動抽出カードを出さない・データは消さない）／ aliasFix ／ mergeAliasStates が受け持つ
//   ・fix469 の ★IDSPLIT2 分岐: この台帳の「登録NPCを正名とする記述的な別名」は、Owner の画面に限り別人の候補にせず N の手がかりにする
// ■ しないこと
//   ・アイコン／asset v2 への書き込み・削除、キャラ（cast）・ロスター・状態の書き換え、データの削除
//   ・読み込み時の過去ターンの自動書き換え（fix730/731 の契約）。過去は repairPast({apply:true}) の明示呼び出しだけ（これも Owner だけ）
//   ・sys（AI への指示文）の変更、fix845（観測専用）・fix537 の動作変更
// 検証口: window.__v292DfixIDSPLIT2 = { gate, on, baseOf, selfNamedCast, isDescriptor, assess, scanTurn, aliasFor, repairPast, state, tick }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixIDSPLIT2 && window.__v292DfixIDSPLIT2.__armed) return;
  var TAG = '[v292DfixIDSPLIT2:selfname-merge]';

  /* ---------- gate（npcq1 C2 と同じ） ---------- */
  function anonActive(){ try { var P = window.__v292Dfix886; return !!(P && P.api && typeof P.api.active === 'function' && P.api.active()); } catch(e){ return true; } }
  /* 戻り: 'killed' | 'anon' | 'no-api' | 'unknown' | 'not-owner' | 'owner' */
  function gate(){
    try { if (localStorage.getItem('v292DfixIDSPLIT2Off') === '1') return 'killed'; } catch(e){ return 'killed'; }
    if (anonActive()) return 'anon';
    try {
      var A = window.__v292Dfix893;
      if (!A || typeof A.serverMe !== 'function') return 'no-api';
      var m = A.serverMe();
      if (!m) return 'unknown';
      return (m.entitlement === 'owner' && m.status === 'active') ? 'owner' : 'not-owner';
    } catch(e){ return 'unknown'; }
  }
  function on(){ return gate() === 'owner'; }

  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('IDSPLIT2') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  function s(x){ return String(x == null ? '' : x); }
  function nfkc(x){ x = s(x); try { return x.normalize('NFKC'); } catch(e){ return x; } }
  /* 名前の比較形: NFKC → 末尾の読み仮名括弧を外す → 空白を除く。「雫 ユナ(しずく ゆな)」→「雫ユナ」 */
  var READING = /[(（][\sぁ-ゖァ-ヺー・゛゜]+[)）]\s*$/;
  function stripReading(name){ return nfkc(name).replace(/^\s+|\s+$/g, '').replace(READING, '').replace(/^\s+|\s+$/g, ''); }
  function baseOf(name){ return stripReading(name).replace(/[\s　]/g, ''); }
  /* 名前の部分（2 字以上）。「雫 ユナ」→ 雫ユナ, ユナ（1 字の姓「雫」は一般語と衝突しうるので使わない） */
  function partsOf(name){
    var out = [], b = baseOf(name);
    if (b.length >= 2) out.push(b);
    stripReading(name).split(/[\s　・]+/).forEach(function(p){ if (p.length >= 2 && out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  function castOf(S){
    var hero = null, npcs = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) hero = { name: s(S.cast.hero.name).trim(), base: baseOf(S.cast.hero.name), desc: s(S.cast.hero.desc), gender: s(S.cast.hero.gender) };
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) npcs.push({ name: s(n.name).trim(), base: baseOf(n.name), parts: partsOf(n.name), desc: s(n.desc) + ' ' + s(n.personality), gender: s(n.gender) }); });
      }
    } catch(e){}
    return { hero: hero, heroBase: hero ? hero.base : '', npcs: npcs };
  }
  function isCastName(w, C){
    var b = baseOf(w); if (!b) return false;
    if (C.hero && b === C.heroBase) return true;
    for (var i = 0; i < C.npcs.length; i++){ if (C.npcs[i].name === w || C.npcs[i].base === b) return true; }
    return false;
  }

  /* ---------- 記述的な呼び名（fix537 と同じ語尾。新しい語彙は足さない） ---------- */
  var DESCRIPTIVE_TAIL = /(少女|少年|女|男|子供|子ども|娘|息子|影|人影|老人|老婆|青年|婦人)$/;
  var PRONOUN_WHO = ['私','俺','僕','彼','彼女','あなた','お前','君','誰か','自分'];
  function isDescriptor(w, C){
    w = s(w).trim();
    if (!w || w.length < 2 || w.length > 16) return false;
    if (/^[?？]+$/.test(w) || PRONOUN_WHO.indexOf(w) >= 0) return false;
    if (C && isCastName(w, C)) return false;
    return DESCRIPTIVE_TAIL.test(w);
  }
  function coreOf(w){ var m = s(w).trim().match(DESCRIPTIVE_TAIL); return m ? m[1] : ''; }
  /* 呼び名の種類 → 性別(f/m)・年齢層(young/adult/old) */
  var CORE_ATTR = { '少女': { g: 'f', a: 'young' }, '少年': { g: 'm', a: 'young' }, '女': { g: 'f' }, '男': { g: 'm' }, '子供': { a: 'young' }, '子ども': { a: 'young' },
    '娘': { g: 'f', a: 'young' }, '息子': { g: 'm' }, '影': {}, '人影': {}, '老人': { a: 'old' }, '老婆': { g: 'f', a: 'old' }, '青年': { g: 'm', a: 'adult' }, '婦人': { g: 'f', a: 'adult' } };
  /* 同じ種類と見なす語（「候補が 1 人か」「説明に種類の語があるか」の判定用） */
  var CORE_WORDS = { '少女': /(少女|女の子|娘)/, '少年': /(少年|男の子)/, '娘': /(娘|少女|女の子)/, '子供': /(子供|子ども|幼い|幼児|少女|少年)/, '子ども': /(子供|子ども|幼い|幼児|少女|少年)/,
    '老人': /(老人|老爺|老婆|老女|翁|媼)/, '老婆': /(老婆|老女|媼)/, '青年': /青年/, '婦人': /(婦人|女性)/, '女': /(女性|女の|少女|娘|婦人|老婆)/, '男': /(男性|男の|少年|青年|老爺)/, '息子': /息子/ };
  var F_MARK = /(少女|女性|女の子|娘|彼女|老婆|老女|婦人|女将|姫|王女|巫女|魔女|修道女|シスター|母親|姉|妹|妻|令嬢|嬢)/;
  var M_MARK = /(少年|男性|男の子|青年|老爺|彼(?!女)|息子|父親|兄|弟|夫|王子|爺)/;
  var YOUNG_MARK = /(少女|少年|子供|子ども|幼い|幼女|幼児|十代|10代|女の子|男の子|小学生|中学生|高校生)/;
  var OLD_MARK = /(老人|老婆|老爺|老女|老齢|初老|年老|老いた|白髪|高齢|翁|媼)/;
  var ADULT_MARK = /(中年|壮年|二十代|三十代|四十代|五十代|20代|30代|40代|50代|成人|大人の(?:女|男))/;
  var ROLES = /(司書|兵士|騎士|巫女|魔女|魔術師|魔法使い|店主|女将|看護師|医者|医師|刑事|探偵|教師|生徒|学生|メイド|侍女|修道女|シスター|王女|姫|王子|盗賊|商人|給仕|用務員|警官|警察官|神官|僧侶|研究員|助手|記者|歌姫|踊り子|占い師|狩人|漁師|鍛冶師|料理人|使用人|執事|奴隷|囚人|旅人|吟遊詩人|聖女|暗殺者|傭兵|船長|船員|番人|門番|墓守)/g;
  function attrsOfText(t, genderField){
    t = s(t);
    var g = '', gf = s(genderField);
    if (/女/.test(gf)) g = 'f'; else if (/男/.test(gf)) g = 'm';
    if (!g){ var f = F_MARK.test(t), m = M_MARK.test(t); if (f && !m) g = 'f'; else if (m && !f) g = 'm'; }
    var ages = []; if (YOUNG_MARK.test(t)) ages.push('young'); if (OLD_MARK.test(t)) ages.push('old'); if (ADULT_MARK.test(t)) ages.push('adult');
    var a = ages.length === 1 ? ages[0] : '';
    var roles = []; (t.match(ROLES) || []).forEach(function(r){ if (roles.indexOf(r) < 0) roles.push(r); });
    return { g: g, a: a, roles: roles };
  }
  /* W の種類と N の説明が合うか。{ ok, positive, why } */
  function consistency(W, handles, rosterApprs, N){
    var core = coreOf(W), ca = CORE_ATTR[core] || {};
    var na = attrsOfText(N.desc, N.gender);
    var side = { g: ca.g || '', a: ca.a || '', roles: [] };
    handles.concat([W]).forEach(function(h){ (s(h).match(ROLES) || []).forEach(function(r){ if (side.roles.indexOf(r) < 0) side.roles.push(r); }); });
    rosterApprs.forEach(function(ap){
      var ra = attrsOfText(ap, '');
      if (ra.g && side.g && ra.g !== side.g) side.conflictSelf = 1;
      if (ra.g && !side.g) side.g = ra.g;
      if (ra.a && !side.a) side.a = ra.a;
      ra.roles.forEach(function(r){ if (side.roles.indexOf(r) < 0) side.roles.push(r); });
    });
    if (side.conflictSelf) return { ok: false, why: 'roster-self-inconsistent' };
    if (side.g && na.g && side.g !== na.g) return { ok: false, why: 'gender-mismatch:' + side.g + '/' + na.g };
    if (side.a && na.a && side.a !== na.a) return { ok: false, why: 'age-mismatch:' + side.a + '/' + na.a };
    if (side.roles.length && na.roles.length){
      var shared = side.roles.some(function(r){ return na.roles.indexOf(r) >= 0; });
      if (!shared) return { ok: false, why: 'role-mismatch:' + side.roles.join('/') + '|' + na.roles.join('/') };
    }
    var cw = CORE_WORDS[core];
    var positive = !!(cw && cw.test(N.desc)) || !!(side.g && na.g && side.a && na.a);
    if (!positive) return { ok: false, why: 'desc-weak' };
    return { ok: true, why: 'consistent' };
  }

  /* ---------- 名乗りの形（台詞の中） ---------- */
  var FP = '(?:わたくし|わたし|私|あたし|あたい|ぼく|僕|ボク|おれ|俺|オレ|うち|ウチ|自分)';
  var BEFORE = new RegExp('(?:' + FP + '(?:は|が|、|,|…|\\.|―|ー)*|(?:わたし|私|あたし|僕|俺|自分)?の?(?:名前|名)(?:は|が)[、,]?)$');
  var PUNCT_END = '(?:[。、,!！…‥.〜~ー―」』)）]|$)';
  /* 「って いう/言う」「という」の後は 文末・約物・の・ん だけ（「っていう子」「という名前の子」は言及＝名乗りではない） */
  var AFTER_NAMING = new RegExp('^(?:って(?:いう|言う)(?:の|ん|' + PUNCT_END + ')|って(?:いい|言い)ます|という(?:の|ん|' + PUNCT_END + ')|と(?:いい|言い|申し)ます|と申す|です' + PUNCT_END + '|でございます|だ(?:よ|' + PUNCT_END + ')|なの' + PUNCT_END + ')');
  var AFTER_END = new RegExp('^' + PUNCT_END);
  var AFTER_REF = /^(?:の|を|に|へ|が|も|は|や|と(?!(?:いう|いい|言い|申))|って(?!(?:いう|言う|いい|言い)))|^(?:さん|ちゃん|くん|君|様|さま|殿|氏|先輩|先生|たち|達|じゃ|では|でしょ|だった|かも)/;
  function namingAt(t, i, len){
    var before = t.slice(Math.max(0, i - 12), i);
    var after = t.slice(i + len, i + len + 10);
    if (AFTER_REF.test(after)) return false;
    /* 疑問（N？／Nなの？／Nですか）は名乗りではない（文の終わりまでに ? があれば見送る） */
    var rest = t.slice(i + len); var cut = rest.search(/[。!！]/); var sent = cut >= 0 ? rest.slice(0, cut) : rest.slice(0, 16);
    if (/[?？]|ですか|なのか/.test(sent)) return false;
    if (BEFORE.test(before) && (AFTER_END.test(after) || AFTER_NAMING.test(after))) return true;   // わたし、N……！
    if (AFTER_NAMING.test(after)){
      /* 「Nっていうの」「Nです」型は台詞の頭か約物の直後だけ（「その子はNっていうの」「あなた、Nです」は拾わない） */
      var pc = before.charAt(before.length - 1);
      if (!pc || /[。.!！…‥―ー「『（(]/.test(pc)) return true;
    }
    return false;
  }
  /* 台詞が名乗っている登録 NPC。{ name } か { ambiguous:[…] } か null。主人公の名前は数えない */
  function selfNamed(say, C){
    var t = nfkc(say).replace(/[\s　]/g, '');
    if (!t) return null;
    var hits = [], heroHit = false;
    function scan(b){
      if (!b || b.length < 2) return false;
      var i = t.indexOf(b);
      while (i >= 0){
        var nx = t.charAt(i + b.length);
        if (!(nx && /[ァ-ヺ一-鿿]/.test(nx) && /[ァ-ヺ一-鿿]$/.test(b))) { if (namingAt(t, i, b.length)) return true; }   // 「雫ユナコ」は雫ユナではない
        i = t.indexOf(b, i + 1);
      }
      return false;
    }
    if (C.hero && scan(C.heroBase)) heroHit = true;
    for (var k = 0; k < C.npcs.length; k++){
      var b = C.npcs[k].base;
      if (C.heroBase && b === C.heroBase) continue;
      if (scan(b) && hits.indexOf(C.npcs[k].name) < 0) hits.push(C.npcs[k].name);
    }
    if (!hits.length) return heroHit ? { hero: true } : null;
    if (hits.length > 1 || heroHit) return { ambiguous: hits };
    return { name: hits[0] };
  }

  /* ---------- 場面の材料 ---------- */
  function narrOf(t){ return s((t && (t.narrative || t.text || t.body)) || ''); }
  function outsideQuotes(narr){ return s(narr).replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '').replace(/「[^」]*」|『[^』]*』/g, ''); }
  function sentencesOf(text){ return s(text).split(/[。！？!?\n]/).filter(function(x){ return x.trim(); }); }
  function rosterOf(){ try { var api = window.__v292Dfix307api; var a = (api && typeof api.loadRoster === 'function') ? api.loadRoster() : []; return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function aliasFix(n){ try { return (typeof window.__v292AliasFix === 'function') ? window.__v292AliasFix(n) : n; } catch(e){ return n; } }
  function displayHandle(w){ try { var f = window.__v292Dfix445; return (f && typeof f.canonLive === 'function') ? s(f.canonLive(w)) : ''; } catch(e){ return ''; } }
  function store77(){ try { var X = window.__v292Dfix850x; if (X && typeof X.realStore === 'function'){ var r = X.realStore(); if (r && typeof r === 'object') return r; } } catch(e){} try { return window.__v292Dfix77Store || {}; } catch(e){ return {}; } }
  function hasState(st, n){ var e = st && st[n]; if (!e || typeof e !== 'object') return false; return ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu'].some(function(k){ return e[k] != null && s(e[k]).trim() !== ''; }); }
  function escRe(x){ return s(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* W を含む記述的なロスター呼び名（同じ種類のもの）。fix445「芯 + 修飾つき」と同じ考え方 */
  function rosterSameKind(w, C, roster){
    var core = coreOf(w), out = [];
    roster.forEach(function(r){
      var h = r && r.handle ? s(r.handle).trim() : '';
      if (!h || !isDescriptor(h, C) || coreOf(h) !== core) return;
      if (out.indexOf(h) < 0) out.push(h);
    });
    return out;
  }

  /* 1 枚のカードについて判定する（副作用なし）。{ merge:{who,to,aliases,cards} } か { observe:{…why} } か null（対象外） */
  function assess(S, ti, ci, ctx){
    var C = ctx && ctx.C || castOf(S);
    var t = S.turns[ti], cs = (t && t._convSays) || [], c = cs[ci];
    if (!c || !c.say) return null;
    var W = s(c.who).trim();
    if (!isDescriptor(W, C)) return null;
    var sn = selfNamed(c.say, C);
    if (!sn || sn.hero) return sn && sn.hero ? { observe: { who: W, why: 'hero-name' } } : null;
    if (sn.ambiguous) return { observe: { who: W, why: 'ambiguous-name:' + sn.ambiguous.join('/') } };
    var Nn = sn.name, N = null;
    for (var k = 0; k < C.npcs.length; k++){ if (C.npcs[k].name === Nn) N = C.npcs[k]; }
    var O = function(why){ return { observe: { who: W, to: Nn, why: why } }; };
    if (!N) return O('no-npc');
    /* (6) 登録NPCに同じ比較形の名前が 2 人 */
    if (C.npcs.filter(function(x){ return x.base === N.base; }).length > 1) return O('duplicate-cast-name');
    var cur = aliasFix(W);
    if (cur && cur !== W) return O(cur === Nn ? 'already-merged' : 'already-alias-of-other');
    var narr = narrOf(t), out = outsideQuotes(narr), core = coreOf(W);
    /* (3) 同じ場面: W（または W の芯「少女」等・2 字以上）がそのターンの地の文に出ている。
       実機: 会話カードの話者は fix445 でロスターの呼び名「裸足の少女」になり、地の文は「少女は…」と書くことが多い */
    var coreOk = core.length >= 2 && W !== core;
    if (out.indexOf(W) < 0 && !(coreOk && out.indexOf(core) >= 0)) return O('not-in-scene-narration');
    /* (4) 候補が 1 人 */
    for (var j = 0; j < cs.length; j++){
      var w2 = cs[j] ? s(cs[j].who).trim() : '';
      if (!w2 || w2 === W || isCastName(w2, C)) continue;
      if (displayHandle(w2) === W || displayHandle(W) === w2) continue;   // 同じ人の表示形（少女 ⇔ 裸足の少女）
      if (isDescriptor(w2, C) && (coreOf(w2) === core || (CORE_WORDS[core] && CORE_WORDS[core].test(w2)))) return O('another-same-kind-speaker:' + w2);
    }
    var plural = new RegExp('(?:二人|ふたり|2人|２人|三人|3人|数人|何人か|何人も)の[^。\\n]{0,6}' + escRe(core) + '|' + escRe(core) + '(?:たち|達|ら(?![し]))|(?:もう一人|もうひとり|別|他|ほか|もう片方|片方)の[^。\\n]{0,6}' + escRe(core) + '|双子');
    if (plural.test(out)) return O('plural-in-scene');
    var roster = rosterOf(), same = rosterSameKind(W, C, roster);
    if (same.length > 1) return O('roster-two-same-kind:' + same.join('/'));
    var cw = CORE_WORDS[core];
    if (cw && C.hero && cw.test(C.hero.desc)) return O('hero-fits-kind');
    for (var q = 0; q < C.npcs.length; q++){
      var o2 = C.npcs[q]; if (o2.name === Nn) continue;
      if (cw && cw.test(o2.desc)) return O('other-cast-fits-kind:' + o2.name);
    }
    /* (6) 別人を示す情報 */
    for (var p = 0; p < N.parts.length; p++){ if (out.indexOf(N.parts[p]) >= 0) return O('npc-named-in-scene'); }
    for (var tb = Math.max(0, ti - 3); tb < ti; tb++){
      var sents = sentencesOf(outsideQuotes(narrOf(S.turns[tb])));
      for (var si = 0; si < sents.length; si++){
        if (sents[si].indexOf(W) < 0) continue;
        for (var p2 = 0; p2 < N.parts.length; p2++){ if (sents[si].indexOf(N.parts[p2]) >= 0) return O('named-together-recently@T' + (tb + 1)); }
      }
    }
    for (var r = 0; r < roster.length; r++){
      var rh = roster[r] && roster[r].handle ? baseOf(roster[r].handle) : '';
      if (rh && (rh === N.base || N.parts.indexOf(rh) >= 0)) return O('roster-has-same-name');
    }
    /* 別名にする呼び名: W ＋（ロスター/表示の呼び名が同じ種類でちょうど 1 つならそれ） */
    var aliases = [W], handles = [];
    /* W が「裸足の少女」のような修飾つきなら、芯の「少女」も同じ人の別名にする（fix469 は芯の語を別人の候補にするため。2 字以上の芯だけ） */
    if (coreOk && isDescriptor(core, C)){
      var cc = aliasFix(core);
      if (cc && cc !== core && cc !== Nn) return O('core-alias-of-other');
      aliases.push(core);
    }
    var cand = [];
    [displayHandle(W)].concat(same).forEach(function(h){ if (h && h !== W && h.indexOf(W) >= 0 && isDescriptor(h, C) && coreOf(h) === core && cand.indexOf(h) < 0) cand.push(h); });
    if (cand.length > 1) return O('roster-two-handles:' + cand.join('/'));
    if (cand.length === 1){
      var ch = aliasFix(cand[0]);
      if (ch && ch !== cand[0] && ch !== Nn) return O('handle-alias-of-other');
      aliases.push(cand[0]); handles.push(cand[0]);
    }
    /* (5) 説明が合う */
    var apprs = [];
    roster.forEach(function(r){ var rh2 = r && r.handle ? s(r.handle).trim() : ''; if (rh2 && (handles.indexOf(rh2) >= 0 || rh2 === W) && r.appr) apprs.push(s(r.appr)); });   // W 自身がロスターの呼び名ならその外見も比べる
    var cons = consistency(W, handles, apprs, N);
    if (!cons.ok) return O(cons.why);
    /* (7) 記憶（fix77 の状態）を上書きしない */
    var st = store77();
    if (hasState(st, Nn) && aliases.some(function(a){ return hasState(st, a); })) return O('state-merge-would-overwrite');
    return { merge: { who: W, to: Nn, aliases: aliases, cards: [ci] } };
  }

  /* 1 ターン分（副作用なし） */
  function scanTurn(S, ti){
    var C = castOf(S), t = S.turns[ti], cs = (t && t._convSays) || [];
    var merges = {}, observe = [];
    if (!Array.isArray(cs) || !C.npcs.length) return { merges: [], observe: [] };
    for (var i = 0; i < cs.length; i++){
      var r = assess(S, ti, i, { C: C });
      if (!r) continue;
      if (r.observe){ r.observe.turn = ti + 1; r.observe.card = i; observe.push(r.observe); continue; }
      var m = r.merge, prev = merges[m.who];
      if (prev && prev !== '!' && prev.to !== m.to){ observe.push({ turn: ti + 1, card: i, who: m.who, to: m.to, why: 'one-label-two-names' }); merges[m.who] = '!'; continue; }
      if (prev === '!') continue;
      if (prev){ prev.cards.push(i); continue; }
      merges[m.who] = m;
    }
    var out = [];
    Object.keys(merges).forEach(function(w){ if (merges[w] !== '!'){ merges[w].turn = ti + 1; out.push(merges[w]); } });
    /* 同じ N に別の呼び名が同じターンで 2 つ → 曖昧 */
    var byN = {}; out.forEach(function(m){ (byN[m.to] = byN[m.to] || []).push(m); });
    var res = [];
    out.forEach(function(m){ if (byN[m.to].length > 1) observe.push({ turn: ti + 1, who: m.who, to: m.to, why: 'two-labels-one-name' }); else res.push(m); });
    return { merges: res, observe: observe };
  }

  /* ---------- 状態（メモリだけ。localStorage へは書かない） ---------- */
  var st = { events: [], observed: [], ticks: 0, lastReason: 'init', baseTurns: -1, gate: '' };
  function note(arr, o){ try { arr.push(o); while (arr.length > 40) arr.shift(); } catch(e){} }

  function applyMerges(props, reason){
    var qp = window.__v292QuasiPack; if (!qp || typeof qp.addAlias !== 'function') { st.lastReason = 'no-quasipack'; return 0; }
    var n = 0;
    props.forEach(function(p){ p.aliases.forEach(function(a){ try { if (aliasFix(a) !== p.to && qp.addAlias(p.to, a)) n++; } catch(e){} }); });
    var moved = 0;
    try { if (typeof qp.normalizeConvWho === 'function') moved = qp.normalizeConvWho('IDSPLIT2:' + reason) || 0; } catch(e){}   // 既存 fix538（控え → 書換 → 保存 → fix66 再描画）
    /* 表示だけ: fix538 の fix66.repair() は既に描いた会話カードの名前を描き直さない（実機 E2E: 次のターンまで「裸足の少女」のまま）。
       fix469 repair() と同じ 2 行（カードを外して fix66 に描き直させる）。データには触らない */
    if (moved){ try { var cards = document.querySelectorAll('.v292-dlg-card'); for (var ci = 0; ci < cards.length; ci++){ if (cards[ci].parentNode) cards[ci].parentNode.removeChild(cards[ci]); } if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair(); } catch(e){} }
    props.forEach(function(p){ note(st.events, { ts: Date.now(), reason: reason, turn: p.turn, who: p.who, to: p.to, aliases: p.aliases.slice(), cards: p.cards.length, relabeled: moved }); });
    try { console.log(TAG, '名乗りで同一人物と確定:', JSON.stringify(props.map(function(p){ return p.aliases.join('/') + '=' + p.to; })), 'relabeled=', moved); } catch(e){}
    return n;
  }

  /* fix469 から呼ばれる: 呼び名 w が「この台帳で登録NPCを正名とする記述的な別名」なら、その正名（今回の候補 names に入っているもの）。Owner の画面だけ */
  function aliasFor(w, names){
    try {
      w = s(w).trim(); if (!w || !on()) return '';
      var qp = window.__v292QuasiPack; if (!qp || typeof qp.store !== 'function') return '';
      var S = getS(), C = castOf(S);
      if (!isDescriptor(w, C)) return '';
      var to = s(aliasFix(w)).trim(); if (!to || to === w) return '';
      var ent = (qp.store() || {})[to]; if (!ent || !Array.isArray(ent.ali) || ent.ali.indexOf(w) < 0) return '';   // 台帳の別名だけ（キャラ説明の「別名:」行は対象外）
      if (C.hero && (to === C.hero.name || baseOf(to) === C.heroBase)) return '';
      var isNpc = C.npcs.some(function(n){ return n.name === to; }); if (!isNpc) return '';
      for (var i = 0; i < (names || []).length; i++){ if (s(names[i]).trim() === to) return to; }
    } catch(e){}
    return '';
  }

  /* 新しいターンだけ自動で見る（読み込み時点の過去ターンは触らない） */
  var lastSig = '', lastRef = null, lastKey = null;
  function docKey(){ try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string') ? k : ''; } catch(e){ return ''; } }
  function tick(){
    try {
      st.ticks++;
      var g = gate(); st.gate = g;
      if (g !== 'owner'){ st.lastReason = 'gate:' + g; return; }
      var S = getS(); if (!S || !Array.isArray(S.turns)) { st.lastReason = 'no-state'; return; }
      if (S.inFlight){ st.lastReason = 'in-flight'; return; }
      var k = docKey();
      if (lastRef !== S.turns || lastKey !== k){ lastRef = S.turns; lastKey = k; st.baseTurns = S.turns.length; lastSig = ''; st.lastReason = 'base=' + st.baseTurns; return; }
      var ti = S.turns.length - 1;
      if (ti < st.baseTurns || ti < 0){ st.lastReason = 'no-new-turn'; return; }
      var t = S.turns[ti];
      var sig = S.turns.length + ':' + ((t && t._convSays) || []).map(function(c){ return c ? s(c.who) : ''; }).join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      var r = scanTurn(S, ti);
      r.observe.forEach(function(a){ note(st.observed, Object.assign({ ts: Date.now() }, a)); });
      if (!r.merges.length){ st.lastReason = (r.observe.length ? 'observed@T' : 'nothing@T') + (ti + 1); return; }
      applyMerges(r.merges, 'T' + (ti + 1));
      st.lastReason = 'applied@T' + (ti + 1);
    } catch(e){ st.lastReason = 'error:' + s(e && e.message).slice(0, 60); }
  }

  /* 過去ターン（いま開いている物語の保存済み分）の明示修復。既定は提案だけ（書かない）。Owner だけ */
  function repairPast(opts){
    opts = opts || {};
    var g = gate(); if (g !== 'owner') return { ok: false, why: 'gate:' + g };
    var S = getS(); if (!S || !Array.isArray(S.turns)) return { ok: false, why: 'no-state' };
    if (S.inFlight) return { ok: false, why: 'in-flight' };
    var all = [], obs = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var r = scanTurn(S, ti);
      r.merges.forEach(function(p){ all.push(p); });
      r.observe.forEach(function(a){ obs.push(a); });
    }
    /* 同じ呼び名が別ターンで別の登録名を名乗っていたら、その呼び名は見送る */
    var to = {}; all.forEach(function(p){ to[p.who] = (to[p.who] && to[p.who] !== p.to) ? '!' : p.to; });
    var props = [], seen = {};
    all.forEach(function(p){ if (to[p.who] === '!'){ obs.push({ turn: p.turn, who: p.who, to: p.to, why: 'label-names-two-across-turns' }); return; } if (seen[p.who]) return; seen[p.who] = 1; props.push(p); });
    if (!opts.apply) return { ok: true, dryRun: true, proposals: props, observe: obs };
    var n = applyMerges(props, 'repairPast');
    return { ok: true, applied: n, proposals: props, observe: obs };
  }

  try { setTimeout(function(){ tick(); setInterval(tick, 2500); }, 4500); } catch(e){}
  window.__v292DfixIDSPLIT2 = { __armed: true, gate: gate, on: on, baseOf: baseOf,
    selfNamedCast: function(say, S){ var r = selfNamed(say, castOf(S || getS())); return r && r.name ? r.name : ''; },
    isDescriptor: function(w, S){ return isDescriptor(w, castOf(S || getS())); },
    assess: function(ti, ci, S){ return assess(S || getS(), ti, ci); }, scanTurn: function(ti, S){ return scanTurn(S || getS(), ti); },
    aliasFor: aliasFor, repairPast: repairPast,
    state: function(){ return { gate: gate(), lastReason: st.lastReason, baseTurns: st.baseTurns, ticks: st.ticks, events: st.events.slice(), observed: st.observed.slice() }; },
    tick: tick };
  try { console.log(TAG, 'loaded (gate=' + gate() + ')'); } catch(e){}
})();
