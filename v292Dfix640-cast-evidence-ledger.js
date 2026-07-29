/* v292Dfix640-cast-evidence-ledger.js (2026-07-29)
 * ─ 「本文に何度も出てくる人物が cast へ登録されない」を直すための **証拠台帳** ─
 *
 * ■このfixの立場
 *   採取して分類して貯めるだけ。**昇格はしない**（昇格は fix641）。
 *   物語データ（S.cast / S.turns / _convSays / who / 本文 / DOM）は **1バイトも書かない**。
 *   書くのは自前キー `v292Dfix640Evid_slot_<slotId>` だけ。
 *
 * ■なぜ台帳を新設するのか（fix277 準登録カルテを使わない理由）
 *   fix277 のカルテは **他物語のデータが混ざった前歴** がある。
 *   その過去汚染を昇格判定へ持ち込まないため、**読みも書きもしない**（GPT指示）。
 *   `distinctSeenTurns` は**この台帳キーの中だけ**で数える＝スロットをまたいで合算されない。
 *
 * ■証拠の一次ソース
 *   `turn.plan.narrative`（★段落の**配列**。fix608 の実測 165/165）。ここに `<say who="…">` が生きている。
 *   画面用の `turn.narrative` はタグが剥がされていて話者の一次証拠が残っていない。
 *   抽出規則は fix606 の partsOf/textOf/evidenceSource を **live参照**する（正本を2つ作らない）。
 *
 * ■証拠の強さ（GPT裁定の表をそのまま実装）
 *   強: say_who / state_tag / introduction / appearance_stable
 *   弱: prose_name / react / recall / role_word
 *   ・`_convSays[].who` は **強証拠にしない**（fix620 が後から書き換えられる派生値＝推測のロンダリング）
 *   ・モデル出力プロトコルに「登録キャスト追加タグ」は存在しない（<say>/<state>/<react> の3つだけ）。
 *     最も近いのは fix77 が人物カルテとして収穫する `<state who>` なので、これを強に置いた。
 *
 * ■軽さ
 *   ターン確定（UI.appendTurn ラップ＝fix616 と同じ観測点）でそのターンだけ採取。
 *   起動時に cursor→turns.length を1回だけ追いつき採取。周期スイープは置かない。
 *   **1ターンは必ず1回だけ走査される**（cursor が保証）。
 *
 * 冪等: window.__v292Dfix640
 * OFF : localStorage v292Dfix640Off='1'（採取を止める。台帳は消さない）
 * 読出: window.__v292Dfix640.ledger() / .report() / .why('名前') / .selfTest()
 *       window.__v292Dfix640.harvestPending()  … 未採取ターンを今すぐ採る（冪等）
 *       window.__v292Dfix640.reset()           … 台帳を捨てる（物語データは無傷）
 */
(function v292Dfix640(){
  'use strict';
  if (window.__v292Dfix640 && window.__v292Dfix640.__armed) return;
  var TAG = '[v292Dfix640:cast-evidence]';

  /* ============================ 基本 ============================ */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix640Off') === '1'; }

  function note539(reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note('fix640', reason, err); } catch(e){}
  }
  /* S の取得は fix539 の正式APIが第一経路。window.S は**新設しない**（休眠コードを起こすため）。 */
  function getState(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix640'); if (a) return a; } catch(e){ note539('getter-threw', e); }
    } else { note539('getter-missing'); }
    try { if (window.S){ note539('rescued-by-window'); return window.S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('rescued-by-eval'); return u; }
          note539('legacy-eval-null'); }
    catch(e){ note539('legacy-eval-threw', e); }
    return null;
  }

  function slotId(){
    try {
      var k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
      k = String(k || 'chr6');
      return k.replace(/^chr6_slot_/, '') || 'chr6';
    } catch(e){ return 'chr6'; }
  }
  function KEY(){ return 'v292Dfix640Evid_slot_' + slotId(); }

  /* 単一書き手ゲート（fix307 と同方針）: 古い世代のタブは自前キーを書かない */
  function canSave(){
    try { var ep = +(lsg('chr6_epoch') || 0); if (window.__chrEpoch && ep > window.__chrEpoch) return false; } catch(e){}
    return true;
  }

  /* ============================ 証拠の種類 ============================ */
  var STRONG = { say_who:1, state_tag:1, introduction:1, appearance_stable:1 };
  var WEAK   = { prose_name:1, react:1, recall:1, role_word:1 };
  function isStrong(k){ return STRONG[k] === 1; }
  function isKnownKind(k){ return STRONG[k] === 1 || WEAK[k] === 1; }

  /* ============================ 本文の取り出し ============================ */
  /* fix606 と同じ抽出規則を使う。live参照が取れないときだけ同等の自前実装に落ちる。 */
  function f606(){ try { return window.__v292Dfix606 || null; } catch(e){ return null; } }
  function partsOf(v){
    var f = f606();
    if (f && typeof f.partsOf === 'function'){ try { return f.partsOf(v); } catch(e){} }
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)){
      var a = [];
      for (var i = 0; i < v.length; i++){
        var e = v[i];
        if (typeof e === 'string') a.push(e);
        else if (e && typeof e === 'object'){
          if (typeof e.text === 'string') a.push(e.text);
          else if (typeof e.say === 'string') a.push(e.say);
        }
      }
      return a;
    }
    return [];
  }
  var JOIN = '\n';
  function evidenceText(turn){
    var f = f606();
    if (f && typeof f.evidenceSource === 'function'){
      try { var es = f.evidenceSource(turn); if (es && typeof es.text === 'string') return es.text; } catch(e){}
    }
    var pn = partsOf(turn && turn.plan && turn.plan.narrative).join(JOIN);
    var tn = partsOf(turn && turn.narrative).join(JOIN);
    if (pn && pn.indexOf('<say') >= 0) return pn;
    if (tn && tn.indexOf('<say') >= 0) return tn;
    return pn || tn;
  }
  /* 地の文（管理タグを落とす）。
     ★「最初の <state> から後ろを全部切る」方式は使わない。段落の順序は保証されておらず、
       管理タグの後ろに地の文が続くと**証拠ごと捨ててしまう**（実測でこの取りこぼしを踏んだ）。
       要素単位で落とす。<say> は中身が台詞なので中身だけ残す。 */
  function proseOf(text){
    var s = String(text || '');
    s = s.replace(/<react\b[\s\S]*?\/>/g, ' ')
         .replace(/<state\b[\s\S]*?\/>/g, ' ')
         .replace(/<summary\b[\s\S]*?(?:\/>|<\/summary>)/g, ' ')
         .replace(/<\/?say\b[^<>]*>/g, '')
         .replace(/<[^<>]*>/g, ' ');
    return s;
  }

  /* ============================ 名前の妥当性 ============================ */
  var PLACEHOLDER = /^(主人公|相手|プレイヤー|自分|ナレーター|語り手|不明|誰か|何者か|それ|あれ|これ|敵|味方)$/;
  function normName(x){ return String(x == null ? '' : x).replace(/[\u3000\s]+$/,'').replace(/^[\u3000\s]+/,''); }
  function isGenericLive(n){
    try { var f = window.__v292Dfix487; if (f && typeof f.isGeneric === 'function') return !!f.isGeneric(n); } catch(e){}
    return false;
  }
  function isValidName(n){
    var s = normName(n);
    if (!s) return false;
    if (s.length > 24) return false;
    if (/[<>"'\n\r\t「」『』（）()｛｝\[\]、。！？!?…]/.test(s)) return false;
    if (/^[\s\u3000]*$/.test(s)) return false;
    if (/^[?？]+$/.test(s)) return false;
    if (PLACEHOLDER.test(s)) return false;
    if (isGenericLive(s)) return false;
    return true;
  }

  /* ---- 役割語 ----
     実名の誤検出（隼人・麻子など「人」「子」で終わる名前）を避けるため、
     パターン側は直前の「の」を必須にする。 */
  var ROLE_EXACT = ('少女|少年|男|女|男性|女性|老人|老婆|老爺|子供|子ども|青年|女子|男子|' +
    '主人|店主|店員|女将|番頭|主|客|旅人|村人|町人|兵士|衛兵|門番|司祭|神父|巫女|医者|看護師|' +
    '警官|刑事|教師|先生|生徒|学生|運転手|車掌|案内人|使用人|下男|下女|' +
    '仲居|女中|板前|料理人|給仕|執事|メイド|神主|住職|尼|僧|巡査|駅員|船頭|漁師|農夫|職人|' +
    '教授|博士|隊長|団長|社長|課長|部長|校長|署長|館長|主任|上司|同僚|友人|恋人|婚約者|' +
    '母|父|母親|父親|姉|妹|兄|弟|祖母|祖父|息子|娘|夫|妻|' +
    '怪異|化け物|化物|怪物|妖怪|亡霊|幽霊|霊|人影|影|声|群衆|通行人|人々|住人|住民').split('|');
  var ROLE_TAIL = '(主人|店主|店員|女将|番頭|主|少女|少年|男|女|老人|子供|客|者|声|影|人物|存在|使い|従者|弟子)';
  var ROLE_TAIL_RE = new RegExp('の' + ROLE_TAIL + '$');
  var ROLE_MOD_RE  = new RegExp('^(若い|年老いた|年配の|背の高い|背の低い|小柄な|痩せた|太った|黒い|白い|赤い|長身の|老いた|幼い|見知らぬ|名も無き|名もなき)' + ROLE_TAIL);
  function isRoleWord(n){
    var s = normName(n);
    if (!s) return false;
    for (var i = 0; i < ROLE_EXACT.length; i++){ if (s === ROLE_EXACT[i]) return true; }
    if (ROLE_TAIL_RE.test(s)) return true;
    if (ROLE_MOD_RE.test(s)) return true;
    if (/(らしき|のような|風の)/.test(s)) return true;
    return false;
  }

  /* ============================ 台帳 ============================ */
  var MAX_ENTRIES = 120, MAX_SPANS = 6, MAX_SEEN = 20, MAX_PROMO = 200, SPAN_CHARS = 40;

  function blank(){
    return { v: 1, slotId: slotId(), cursor: 0, updated: 0,
             entries: {}, promotions: [], blocked: [] };
  }
  function load(){
    var raw = lsg(KEY());
    if (!raw) return blank();
    var o = null;
    try { o = JSON.parse(raw); } catch(e){ return blank(); }
    if (!o || typeof o !== 'object' || o.v !== 1) return blank();
    if (o.slotId !== slotId()) return blank();          /* 別スロットの台帳は使わない */
    if (!o.entries || typeof o.entries !== 'object') o.entries = {};
    if (!Array.isArray(o.promotions)) o.promotions = [];
    if (!Array.isArray(o.blocked)) o.blocked = [];
    if (typeof o.cursor !== 'number' || !(o.cursor >= 0)) o.cursor = 0;
    return o;
  }
  var stats = { harvests: 0, turnsScanned: 0, writes: 0, quota: 0, errors: 0, lastReason: '' };
  function save(L){
    if (!canSave()) { stats.lastReason = 'epoch-blocked'; return false; }
    L.updated = Date.now();
    prune(L);
    var okw = lss(KEY(), JSON.stringify(L));
    if (okw) stats.writes++; else { stats.quota++; stats.lastReason = 'ls-write-failed'; }
    return okw;
  }
  function prune(L){
    var names = Object.keys(L.entries);
    if (names.length > MAX_ENTRIES){
      /* 弱い順・古い順に落とす（強い証拠を持つものを残す） */
      names.sort(function(a, b){
        var A = L.entries[a], B = L.entries[b];
        var sa = strongKindsOf(A).length, sb = strongKindsOf(B).length;
        if (sa !== sb) return sa - sb;
        if (A.distinctSeenTurns !== B.distinctSeenTurns) return A.distinctSeenTurns - B.distinctSeenTurns;
        return (A.lastTurn || 0) - (B.lastTurn || 0);
      });
      var drop = names.length - MAX_ENTRIES;
      for (var i = 0; i < drop; i++) delete L.entries[names[i]];
    }
    if (L.promotions.length > MAX_PROMO) L.promotions = L.promotions.slice(-MAX_PROMO);
  }
  function strongKindsOf(e){
    var out = [];
    var ks = (e && e.evidenceKinds) || [];
    for (var i = 0; i < ks.length; i++){ if (isStrong(ks[i]) && out.indexOf(ks[i]) < 0) out.push(ks[i]); }
    return out;
  }

  function ensureEntry(L, name, turnIdx){
    var e = L.entries[name];
    if (!e){
      e = L.entries[name] = {
        name: name, slotId: L.slotId,
        firstSeenTurn: turnIdx, lastTurn: -1,
        distinctSeenTurns: 0, seenTurns: [],
        evidenceKinds: [], sourceSpans: [],
        roleWord: isRoleWord(name), resolvedTo: '', resolveCandidates: [],
        appearance: {}
      };
    }
    return e;
  }

  /* 証拠を1件足す。turnIdx は昇順に来る前提（cursor が保証）。 */
  function addEvidence(L, name, kind, turnIdx, span){
    if (!isKnownKind(kind)) return false;
    var e = ensureEntry(L, name, turnIdx);
    if (e.evidenceKinds.indexOf(kind) < 0) e.evidenceKinds.push(kind);
    if (span && e.sourceSpans.length < MAX_SPANS){
      e.sourceSpans.push({ turn: turnIdx, kind: kind, at: span.at,
                           text: String(span.text || '').slice(0, SPAN_CHARS) });
    }
    /* ★回想だけのターンは「そのターンに居た」とは数えない（fix408 の実害の型）。 */
    if (kind !== 'recall' && turnIdx > e.lastTurn){
      e.lastTurn = turnIdx;
      e.distinctSeenTurns++;
      e.seenTurns.push(turnIdx);
      if (e.seenTurns.length > MAX_SEEN) e.seenTurns.shift();
    }
    return true;
  }

  /* ============================ 抽出器 ============================ */
  function listTagWho(text, tag){
    var out = [], re = new RegExp('<' + tag + '\\b[^>]*?who\\s*=\\s*(["\'])([\\s\\S]*?)\\1', 'g'), m;
    while ((m = re.exec(text)) !== null){ out.push({ who: m[2], at: m.index }); }
    return out;
  }
  var RECALL_RE = /(回想|思い出|かつて|昔|あの日|記憶|写真|夢の中|夢で|噂|伝説|語り草|生前)/;
  /* ★名前として拾ってよい文字。ひらがなを外すのは「佐々木が帳場から…」のように
     助詞ごと飲み込むのを止めるため（実測でこの誤りを踏んだ）。
     ひらがなだけの名前は拾えなくなるが、**拾い過ぎるより拾わない方**を選ぶ。 */
  var NAMECH = '[一-龥々〆ヵヶァ-ヶーA-Za-zＡ-Ｚａ-ｚ・]';
  var INTRO_RES = [
    '(?:私|僕|俺|わたし|わたくし|あたし)は(' + NAMECH + '{1,12})(?:と申します|と言います|といいます|です|だ)',
    '(' + NAMECH + '{1,12})(?:と申します|と名乗った|と名乗る|と呼ばれている|という名の|という名前の)',
    '(?:名前は|名は|姓は)(' + NAMECH + '{1,12})'
  ];
  var APPEAR_RE = /([一-龥ぁ-んァ-ヶー]{1,6})(髪|瞳|眼|目|肌|背丈|背|服|衣|着物|外套|コート|眼鏡|帽子|傷跡|傷|声)/g;
  var APPEAR_WINDOW = 40;

  /* 段落単位で回想かどうかを見る（連結後の位置 → その段落） */
  function paraAt(parts, at){
    var pos = 0;
    for (var i = 0; i < parts.length; i++){
      var len = String(parts[i] == null ? '' : parts[i]).length;
      if (at < pos + len) return String(parts[i] == null ? '' : parts[i]);
      pos += len + JOIN.length;
    }
    return '';
  }

  function knownNames(L, extra){
    var out = [];
    if (Array.isArray(extra)) for (var i = 0; i < extra.length; i++){ if (extra[i]) out.push(normName(extra[i])); }
    for (var k in L.entries){ if (Object.prototype.hasOwnProperty.call(L.entries, k)) out.push(k); }
    var seen = {}, res = [];
    for (var j = 0; j < out.length; j++){ var n = out[j]; if (n && !seen[n]){ seen[n] = 1; res.push(n); } }
    return res;
  }

  /* features.js §8 の純粋関数（カタカナ名抽出）を借りる。自前実装で推測を増やさない。 */
  function katakanaNames(text){
    try {
      var a = window.__v292 && window.__v292.autoBootstrap;
      if (a && typeof a.extractKatakanaNames === 'function') return a.extractKatakanaNames(text) || [];
    } catch(e){}
    return [];
  }

  /* 役割語 → 正式名の一意解決 */
  function collectResolutions(prose, role){
    var out = [], esc = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pats = [
      new RegExp(esc + '(?:の|、|，)\\s*(' + NAMECH + '{1,12})', 'g'),
      new RegExp(esc + '(?:は|が)\\s*(' + NAMECH + '{1,12})(?:と名乗|という|と申)', 'g'),
      new RegExp('(' + NAMECH + '{1,12})という' + esc, 'g')
    ];
    for (var i = 0; i < pats.length; i++){
      var m;
      while ((m = pats[i].exec(prose)) !== null){
        var c = normName(m[1]);
        if (isValidName(c) && !isRoleWord(c) && out.indexOf(c) < 0) out.push(c);
      }
    }
    return out;
  }

  /* ---- 1ターンぶんの採取（★走査は1回・読み取りのみ） ---- */
  function harvestTurn(L, turn, turnIdx, heroName, castNames){
    if (!turn || typeof turn !== 'object') return 0;
    var text = evidenceText(turn);
    if (!text) return 0;
    var parts = partsOf(turn && turn.plan && turn.plan.narrative);
    if (!parts.length) parts = partsOf(turn && turn.narrative);
    var prose = proseOf(text);
    var added = 0, i, j;

    function put(name, kind, at, snippet){
      var n = normName(name);
      if (!n || !isValidName(n)) return;
      if (heroName && n === heroName) return;              /* ★主人公は台帳にも積まない */
      if (addEvidence(L, n, kind, turnIdx, { at: at, text: snippet })) added++;
    }

    /* (1) <say who> = 話者の一次証拠（最強） */
    var says = listTagWho(text, 'say');
    for (i = 0; i < says.length; i++){
      put(says[i].who, 'say_who', says[i].at, text.substr(says[i].at, SPAN_CHARS));
    }
    /* (2) <state who> = モデルが継続追跡すると宣言した人物 */
    var states = listTagWho(text, 'state');
    for (i = 0; i < states.length; i++){
      put(states[i].who, 'state_tag', states[i].at, text.substr(states[i].at, SPAN_CHARS));
    }
    /* (3) <react who> = 反応しただけ＝弱 */
    var reacts = listTagWho(text, 'react');
    for (i = 0; i < reacts.length; i++){
      put(reacts[i].who, 'react', reacts[i].at, text.substr(reacts[i].at, SPAN_CHARS));
    }
    /* (4) 明示的な人物紹介＝強 */
    for (i = 0; i < INTRO_RES.length; i++){
      var re = new RegExp(INTRO_RES[i], 'g'), m;
      while ((m = re.exec(prose)) !== null){
        var cand = normName(m[1]);
        if (!isValidName(cand) || isRoleWord(cand)) continue;
        put(cand, 'introduction', m.index, prose.substr(m.index, SPAN_CHARS));
      }
    }
    /* (5) 地の文の名前（既知名＋§8のカタカナ名）＝弱。回想段落なら recall へ落とす */
    var cands = knownNames(L, castNames).concat(katakanaNames(prose));
    var seenC = {};
    for (i = 0; i < cands.length; i++){
      var nm = normName(cands[i]);
      if (!nm || seenC[nm]) continue;
      seenC[nm] = 1;
      if (!isValidName(nm)) continue;
      var at = prose.indexOf(nm);
      if (at < 0) continue;
      var para = paraAt(parts, at) || prose;
      var kind = RECALL_RE.test(para) ? 'recall' : 'prose_name';
      put(nm, kind, at, prose.substr(Math.max(0, at - 8), SPAN_CHARS));
    }
    /* (6) 役割語（「宿の主人」型）＝弱。正式名への解決候補も貯める */
    var roleRe = new RegExp('([一-龥ぁ-んァ-ヶー]{1,8})の' + ROLE_TAIL, 'g'), rm;
    var roles = [];
    while ((rm = roleRe.exec(prose)) !== null){ if (roles.indexOf(rm[0]) < 0) roles.push(rm[0]); }
    for (i = 0; i < ROLE_EXACT.length; i++){
      var re0 = ROLE_EXACT[i];
      if (prose.indexOf(re0) < 0 || roles.indexOf(re0) >= 0) continue;
      /* ★「宿の主人」から「主人」「主」まで台帳へ増やさない。
         既に採った長い役割語の一部でしかないものは別エントリにしない（台帳のノイズ源）。 */
      var sub = false;
      for (j = 0; j < roles.length; j++){ if (roles[j].length > re0.length && roles[j].indexOf(re0) >= 0){ sub = true; break; } }
      if (!sub) roles.push(re0);
    }
    for (i = 0; i < roles.length; i++){
      var r = roles[i];
      if (!L.entries[r] && roles.length > 24) continue;    /* 保険: 役割語で台帳を溢れさせない */
      var rat = prose.indexOf(r);
      put(r, 'role_word', rat, prose.substr(Math.max(0, rat - 8), SPAN_CHARS));
    }
    /* (7) 役割語の一意解決 + 外見の一貫性 */
    for (var key in L.entries){
      if (!Object.prototype.hasOwnProperty.call(L.entries, key)) continue;
      var e = L.entries[key];
      if (e.roleWord && prose.indexOf(key) >= 0){
        var res = collectResolutions(prose, key);
        for (j = 0; j < res.length; j++){ if (e.resolveCandidates.indexOf(res[j]) < 0) e.resolveCandidates.push(res[j]); }
        e.resolvedTo = (e.resolveCandidates.length === 1) ? e.resolveCandidates[0] : '';
      }
      var pat = prose.indexOf(key);
      if (pat >= 0){
        var win = prose.slice(Math.max(0, pat - APPEAR_WINDOW), pat + key.length + APPEAR_WINDOW);
        var ar = new RegExp(APPEAR_RE.source, 'g'), am;
        while ((am = ar.exec(win)) !== null){
          if (!am[1]) continue;
          /* ★「ミナの長い黒髪」と「長い黒髪の女」を同じトークンにする。
             修飾語の直前に「の」があれば、そこまでは所有・所属なので落とす
             （落とさないと同じ外見が別トークンになり、一貫性を永久に検出できない）。 */
          var mod = am[1].replace(/^.*の/, '');
          if (!mod) continue;
          var tok = mod + am[2];
          if (!e.appearance[tok] && Object.keys(e.appearance).length >= 8) continue;
          var lst = e.appearance[tok] || (e.appearance[tok] = []);
          if (lst.indexOf(turnIdx) < 0) lst.push(turnIdx);
          if (lst.length > 4) lst.shift();
          /* ★同じ外見トークンが**別々の2ターン**で出たときだけ「安定した外見記述」＝強 */
          if (lst.length >= 2 && e.evidenceKinds.indexOf('appearance_stable') < 0 && !e.roleWord){
            addEvidence(L, key, 'appearance_stable', turnIdx,
                        { at: pat, text: win.slice(0, SPAN_CHARS) });
            added++;
          }
        }
      }
    }
    return added;
  }

  /* ============================ 走らせる ============================ */
  function heroNameOf(st){
    try { return normName(st && st.cast && st.cast.hero && st.cast.hero.name); } catch(e){ return ''; }
  }
  var _fastSlot = null, _fastTurns = -1;   /* 描画ごとの空振りで localStorage を触らないための記憶 */

  /* 未採取のターンだけを採る。冪等（cursor が「1ターン1回」を保証する）。 */
  function harvestPending(opts){
    opts = opts || {};
    var res = { ok: false, scanned: 0, reason: '', ledger: null };
    if (off() && !opts.force){ res.reason = 'off'; return res; }
    var st = getState();
    if (!st){ res.reason = 'no-state'; return res; }
    var turns = Array.isArray(st.turns) ? st.turns : [];
    /* ★描画のたびに呼ばれても localStorage を触らない安い門番。
       同じスロットでターン数が変わっていなければ、JSON.parse すらしない。 */
    if (!opts.dryRun && _fastSlot === slotId() && _fastTurns === turns.length){
      res.ok = true; res.reason = 'up-to-date'; return res;
    }
    var L = load();
    res.ledger = L;
    /* 物語リセット・新規作成でターンが減ったら台帳を作り直す（前の物語の証拠を引き継がない） */
    if (turns.length < L.cursor){ L = blank(); res.ledger = L; }
    if (turns.length === L.cursor){
      _fastSlot = slotId(); _fastTurns = turns.length;
      res.ok = true; res.reason = 'up-to-date'; return res;
    }
    var hero = heroNameOf(st), n = 0;
    var castNames = [];
    try {
      var ns = st.cast && st.cast.npcs;
      if (Array.isArray(ns)) for (var c = 0; c < ns.length; c++){ if (ns[c] && ns[c].name) castNames.push(normName(ns[c].name)); }
    } catch(e){}
    for (var i = L.cursor; i < turns.length; i++){
      try { harvestTurn(L, turns[i], i, hero, castNames); n++; }
      catch(e){ stats.errors++; }
    }
    L.cursor = turns.length;
    stats.harvests++; stats.turnsScanned += n;
    if (!opts.dryRun){ save(L); _fastSlot = slotId(); _fastTurns = turns.length; }
    res.ok = true; res.scanned = n;
    return res;
  }

  /* ターン確定の瞬間（fix616 と同じ観測点）。ここでは push 済みの S.turns を見る。 */
  function install(){
    var U = null;
    try { U = window.UI || (0,eval)('typeof UI!=="undefined"?UI:null'); } catch(e){ U = null; }
    if (!U) return false;
    if (U.__v292Dfix640) return true;
    try {
      if (typeof U.appendTurn === 'function'){
        var oa = U.appendTurn.bind(U);
        U.appendTurn = function(turn, idx){
          try { harvestPending({}); } catch(e){ stats.errors++; }
          return oa(turn, idx);
        };
      }
      /* 取りこぼし用の追いつき（未採取が無ければカーソル比較だけで即 return） */
      if (Array.isArray(U._renderHooks)){
        U._renderHooks.push(function fix640Hook(){
          try { harvestPending({}); } catch(e){ stats.errors++; }
        });
      }
    } catch(e){ stats.errors++; }
    U.__v292Dfix640 = true;
    try { console.log(TAG, 'armed (appendTurn + render catch-up)'); } catch(e){}
    return true;
  }
  if (!install()){
    var tries = 0;
    var iv = setInterval(function(){ tries++; if (install() || tries > 120) clearInterval(iv); }, 250);
  }
  try { setTimeout(function(){ try { harvestPending({}); } catch(e){} }, 1500); } catch(e){}

  /* ============================ 読み出し ============================ */
  function ledger(){ return load(); }
  function why(name){
    var L = load(), e = L.entries[normName(name)];
    if (!e) return null;
    return { name: e.name, distinctSeenTurns: e.distinctSeenTurns, seenTurns: e.seenTurns.slice(),
             strong: strongKindsOf(e), kinds: e.evidenceKinds.slice(),
             roleWord: e.roleWord, resolvedTo: e.resolvedTo, resolveCandidates: e.resolveCandidates.slice(),
             appearance: e.appearance, sourceSpans: e.sourceSpans.slice() };
  }
  function report(){
    var L = load(), rows = [];
    for (var k in L.entries){
      if (!Object.prototype.hasOwnProperty.call(L.entries, k)) continue;
      var e = L.entries[k];
      rows.push({ name: k, turns: e.distinctSeenTurns, strong: strongKindsOf(e),
                  kinds: e.evidenceKinds.slice(), roleWord: e.roleWord, resolvedTo: e.resolvedTo });
    }
    rows.sort(function(a, b){ return (b.strong.length - a.strong.length) || (b.turns - a.turns); });
    return { key: KEY(), slotId: L.slotId, cursor: L.cursor, entries: rows,
             promotions: L.promotions.slice(), blocked: L.blocked.slice(), stats: snap() };
  }
  function reset(){ _fastSlot = null; _fastTurns = -1; try { localStorage.removeItem(KEY()); } catch(e){} return blank(); }
  function snap(){ try { return JSON.parse(JSON.stringify(stats)); } catch(e){ return null; } }
  function selfTest(){
    var st = getState();
    return { off: off(), key: KEY(), stateReachable: !!st,
             turns: (st && Array.isArray(st.turns)) ? st.turns.length : -1,
             cursor: load().cursor, names: Object.keys(load().entries), stats: snap() };
  }

  window.__v292Dfix640 = {
    __armed: true,
    /* 台帳 */
    ledger: ledger, load: load, save: save, reset: reset, KEY: KEY, slotId: slotId,
    /* 採取 */
    harvestPending: harvestPending, harvestTurn: harvestTurn, evidenceText: evidenceText, proseOf: proseOf,
    /* 分類（fix641 はここを唯一の正として参照する） */
    isStrong: isStrong, isKnownKind: isKnownKind, strongKindsOf: strongKindsOf,
    STRONG_KINDS: Object.keys(STRONG), WEAK_KINDS: Object.keys(WEAK),
    isValidName: isValidName, isRoleWord: isRoleWord, normName: normName,
    /* 読み出し */
    why: why, report: report, selfTest: selfTest, stats: snap, isOff: off, getState: getState
  };
  try { if (!off()) console.log(TAG, 'evidence ledger ready:', KEY()); } catch(e){}
})();
