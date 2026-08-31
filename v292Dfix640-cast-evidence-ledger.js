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
 * ■fix644（2026-07-29・GPT裁定）採取の厳格化
 *   実データで、名前でないものが台帳へ入っていた:
 *     「をかざしながら宿の主人」「パチリと」「ポケット」「去年の客」
 *   直し方の原則は **「文字列の見た目ではなく、人物として使われた構文を必須にする」**。
 *   ・カタカナだから弾く方式は禁止（カエデ／ノア／ヒナが消える）
 *   ・助詞を**文字列内の部分一致**で弾く方式も禁止（「加賀」が「が」で落ちる）
 *   → 判定は候補の**前後境界と構文**で行う。実装は下の「fix644: 形状条件」節。
 *   ・「宿の主人」等の役割語は名前候補ではなく candidateType:'role-label' として別枠に採る
 *   ・台帳エントリへ candidateType / confidence を足す（既存フィールドは維持・後方互換）
 *   ・★昇格条件（fix641）は変えない（異なるターン＋異なる証拠系統2つ）
 *
 * ■fix764（2026-08-31・PHASE 4C = Entity Identity）台帳キーの引きだけを字形フォールドにする
 *   実データ: 同じ人物が「渔师」(T56)と「漁師」(T62)で出て、entries[名前] が完全一致なので
 *   **別 entry** になり、証拠が2つに割れて昇格条件（異なるターン×強証拠系統）に永久に届かなかった。
 *   直し方 = **lookup だけ** fold で引く。fold 一致する既存キーがあればそこへ蓄積する。
 *   ★格納キーと e.name は **最初に見えた表示形のまま**（fold 形は 1 バイトも保存しない・fix455/456 の教訓）。
 *   OFF: localStorage v292Dfix764Off='1'（fix764 本体の kill）で従来動作へ戻る。
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

  /* ★fix764(2026-08-31): 台帳キーの **引き** だけを字形フォールドにする（比較専用）。
     完全一致が最優先。無ければ fold 一致する既存キーを返す。どちらも無ければ入力をそのまま返す。
     ★新しいキーを fold 形で作ることは無い（返すのは常に「入力の表示形」か「既存キーの表示形」）。 */
  function f764(){ try { var f = window.__v292Dfix764; return (f && f.__armed && typeof f.fold === 'function' && !f.isOff()) ? f : null; } catch(e){ return null; } }
  function entryKey764(L, name){
    var n = String(name == null ? '' : name);
    if (!L || !L.entries) return n;
    if (Object.prototype.hasOwnProperty.call(L.entries, n)) return n;
    var f = f764(); if (!f) return n;
    var t; try { t = f.fold(n); } catch(e){ return n; }
    for (var k in L.entries){
      if (!Object.prototype.hasOwnProperty.call(L.entries, k)) continue;
      try { if (f.fold(k) === t) return k; } catch(e){}
    }
    return n;
  }
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

  /* ==================== fix644: 形状条件（GPT裁定） ====================
     ★ここは「文字列の見た目」ではなく「候補の前後境界と構文」で判定する層。
       ・カタカナだから弾く／助詞を部分一致で弾く、は**やらない**（カエデ・加賀が消える）
       ・活用断片を**含む**候補は落とす（実例「をかざしながら宿の主人」）
       ・文節が2つ以上ある候補は名前にしない。判定は
         「内容語 + ひらがなの助詞 + 内容語」という**境界の形**で見る。
         「加賀」は漢字が連なるだけなので当たらない。「山田はな」も
         『は』の後ろがひらがな＝境界ではないので当たらない。 */
  var CAND_MIN = 2, CAND_MAX = 20;
  /* 改行・句読点・引用符・タグ記号。isValidName より厳しめ（採取の入口専用） */
  var CAND_BAD_RE = /[\n\r\t　、。，．！？!?…‥「」『』（）()｛｝\[\]<>"'“”‘’　]/;
  /* 先頭が格助詞（GPT指定の6語ちょうど）。★内部の助詞は見ない */
  var CAND_LEAD_RE = /^(?:から|を|に|へ|で|と)/;
  /* 活用・接続の断片。名前や役割語には現れない */
  var CAND_INFLECT_RE = /(ながら|つつ|ている|ていた|してい|された|されて|しない|ました|ません|だった|であり|ておく|てくる|ていく|られて|らせて|かけて|ながらも)/;
  /* 文節の境界: 内容語 + ひらがなの助詞 + 内容語 */
  var CONTENT = '[一-龥々〆ヵ-ヺーA-Za-zＡ-Ｚａ-ｚ0-9０-９]';
  var CAND_BUNSETSU_RE = new RegExp(CONTENT + '[はがをにへとでもの]' + CONTENT);
  function allKana(s){ return /^[ぁ-ゖー]+$/.test(s); }

  /* 候補を分類する。type=null なら採らない。純関数（localStorage も DOM も触らない）。
     opts.declared … <say who>/<state who>/<react who> のように、モデルが
                     **明示的に人物として書いた** 候補。1文字の名前（澪・蓮）を落とさないため
                     最小長だけ緩める。形の壊れた who は declared でも落とす。 */
  function classifyCandidate(raw, opts){
    var s = normName(raw);
    var declared = !!(opts && opts.declared);
    var out = { name: s, type: null, reason: '' };
    if (!s){ out.reason = 'empty'; return out; }
    if (s.length > CAND_MAX || s.length < (declared ? 1 : CAND_MIN)){ out.reason = 'length'; return out; }
    if (CAND_BAD_RE.test(s)){ out.reason = 'punct'; return out; }
    if (CAND_LEAD_RE.test(s)){ out.reason = 'leading-particle'; return out; }
    if (!(allKana(s) && s.length <= 4) && CAND_INFLECT_RE.test(s)){ out.reason = 'inflection'; return out; }
    if (isRoleWord(s)){ out.type = 'role-label'; out.reason = 'role'; return out; }
    if (CAND_BUNSETSU_RE.test(s)){ out.reason = 'multi-bunsetsu'; return out; }
    out.type = 'name'; out.reason = 'ok';
    return out;
  }

  /* ---- 人物として使われた構文か（地の文から拾う弱い証拠の必須条件） ----
     ★「パチリと」「ポケット」を落とすのはこの層。カタカナかどうかは見ない。 */
  var PERSON_PART = '(声|手|目|瞳|眼|顔|姿|背|肩|指|腕|足|胸|髪|頬|唇|口|首|耳|息|方|隣|横|前|後ろ|傍|言葉|名|名前|表情|視線|気配|返事|問い|答え)';
  var HONORIFIC = '(さん|くん|ちゃん|様|さま|氏|先生|殿|師匠|先輩|後輩)';
  var SPEECH_V = '(言|呟|囁|答|返|叫|問|尋|訊|告|笑|微笑|頷|うなず)';
  var TOWARD_V = '(見|視|眺|呼|追|抱|振り返|睨|訊|尋|問|話しかけ|微笑|向か|近づ|触れ|渡|差し出|続け)';
  function escRe(s){ return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function personUse(prose, name){
    var p = String(prose || ''), e = escRe(name);
    if (!p || !e) return false;
    var pats = [
      e + '[はがも]',                        /* 主題・主語（カエデは／ノアが） */
      e + 'の' + PERSON_PART,                /* 人の部位・持ち物としての「の」 */
      e + HONORIFIC,                         /* 敬称 */
      e + '[、，]?\\s*と\\s*' + SPEECH_V,     /* 「…」とカエデと答えた 型の帰属 */
      e + '[をにへ]\\s*' + TOWARD_V           /* ヒナを見た／ノアに尋ねた */
    ];
    for (var i = 0; i < pats.length; i++){
      try { if (new RegExp(pats[i]).test(p)) return true; } catch(err){}
    }
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
    /* ★fix644: 前日までに書かれた台帳には candidateType / confidence が無い。
       消さずに補う（後方互換。既存フィールドには触らない）。 */
    for (var k in o.entries){
      if (!Object.prototype.hasOwnProperty.call(o.entries, k)) continue;
      var e = o.entries[k];
      if (!e || typeof e !== 'object') continue;
      if (!e.candidateType) e.candidateType = e.roleWord ? 'role-label' : 'name';
      if (typeof e.confidence !== 'number') e.confidence = confidenceOf(e);
    }
    return o;
  }
  var stats = { harvests: 0, turnsScanned: 0, writes: 0, quota: 0, errors: 0, lastReason: '',
                /* ★fix644: 何を、なぜ採らなかったか。実機で偽陰性を疑うときの唯一の手がかり */
                dropped: {} };
  function bumpDrop(reason){
    var k = String(reason || 'unknown');
    stats.dropped[k] = (stats.dropped[k] || 0) + 1;
  }
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
  /* ★fix644: 確からしさ。**昇格判定には使わない**（昇格の正本は fix641 の
     「異なるターン2つ × 強い証拠2系統」のまま）。人が台帳を読むための目安。 */
  function confidenceOf(e){
    if (!e) return 0;
    var s = strongKindsOf(e).length, t = e.distinctSeenTurns || 0;
    var c = 0.20 * Math.min(t, 3) + 0.25 * Math.min(s, 2);
    if (e.candidateType === 'role-label' || e.roleWord) c -= 0.20;
    return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
  }

  function ensureEntry(L, name, turnIdx, cls){
    var key = entryKey764(L, name);          /* ★fix764: 引きだけ fold。格納キーは表示形のまま */
    var e = L.entries[key];
    if (!e){
      var t = (cls && cls.type) || (isRoleWord(key) ? 'role-label' : 'name');
      e = L.entries[key] = {
        name: key, slotId: L.slotId,
        firstSeenTurn: turnIdx, lastTurn: -1,
        distinctSeenTurns: 0, seenTurns: [],
        evidenceKinds: [], sourceSpans: [],
        roleWord: (t === 'role-label'), resolvedTo: '', resolveCandidates: [],
        appearance: {},
        candidateType: t, confidence: 0        /* ★fix644 で追加（既存フィールドは維持） */
      };
    }
    return e;
  }

  /* 証拠を1件足す。turnIdx は昇順に来る前提（cursor が保証）。 */
  function addEvidence(L, name, kind, turnIdx, span, cls){
    if (!isKnownKind(kind)) return false;
    var e = ensureEntry(L, name, turnIdx, cls);
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
    e.confidence = confidenceOf(e);      /* ★fix644 */
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
        /* ★fix644: 解決先も「名前の形」を満たすものだけ（役割語→役割語の解決は無意味） */
        if (classifyCandidate(c).type !== 'name') continue;
        if (isValidName(c) && out.indexOf(c) < 0) out.push(c);
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

    /* ★fix644: 採取の関門はここ1箇所。declared = モデルが who 属性で
       「人物として」書いた候補（1文字の名前を落とさないため最小長だけ緩める）。 */
    function put(name, kind, at, snippet, declared){
      var n = normName(name);
      if (!n || !isValidName(n)) return;
      var cls = classifyCandidate(n, { declared: !!declared });
      if (!cls.type){ bumpDrop(cls.reason); return; }
      if (kind === 'role_word' && cls.type !== 'role-label'){ bumpDrop('not-a-role'); return; }
      if (heroName && n === heroName) return;              /* ★主人公は台帳にも積まない */
      if (addEvidence(L, n, kind, turnIdx, { at: at, text: snippet }, cls)) added++;
    }

    /* (1) <say who> = 話者の一次証拠（最強） */
    var says = listTagWho(text, 'say');
    for (i = 0; i < says.length; i++){
      put(says[i].who, 'say_who', says[i].at, text.substr(says[i].at, SPAN_CHARS), true);
    }
    /* (2) <state who> = モデルが継続追跡すると宣言した人物 */
    var states = listTagWho(text, 'state');
    for (i = 0; i < states.length; i++){
      put(states[i].who, 'state_tag', states[i].at, text.substr(states[i].at, SPAN_CHARS), true);
    }
    /* (3) <react who> = 反応しただけ＝弱 */
    var reacts = listTagWho(text, 'react');
    for (i = 0; i < reacts.length; i++){
      put(reacts[i].who, 'react', reacts[i].at, text.substr(reacts[i].at, SPAN_CHARS), true);
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
      /* ★fix644: 地の文の候補は「人物として使われた構文」が1つでもあるときだけ採る。
         「パチリと」「ポケット」はここで落ちる（カタカナかどうかは見ていない）。
         役割語は語そのものが人物を指すので (6) の経路に任せる。 */
      if (classifyCandidate(nm).type === 'name' && !personUse(prose, nm)){ bumpDrop('no-person-syntax'); continue; }
      var para = paraAt(parts, at) || prose;
      var kind = RECALL_RE.test(para) ? 'recall' : 'prose_name';
      put(nm, kind, at, prose.substr(Math.max(0, at - 8), SPAN_CHARS));
    }
    /* (6) 役割語（「宿の主人」型）＝弱。正式名への解決候補も貯める */
    /* ★fix644: 修飾部を **ひらがなを含まない内容語** に限る。
       これが「手をかざしながら宿の主人」から「をかざしながら宿の主人」を拾っていた真因。
       ひらがなを外すと、同じ文からは正しく「宿の主人」が採れる（実データで確認）。 */
    var roleRe = new RegExp('(' + CONTENT + '{1,8})の' + ROLE_TAIL, 'g'), rm;
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
    var L = load(), e = L.entries[entryKey764(L, normName(name))];   /* ★fix764 */
    if (!e) return null;
    return { name: e.name, distinctSeenTurns: e.distinctSeenTurns, seenTurns: e.seenTurns.slice(),
             strong: strongKindsOf(e), kinds: e.evidenceKinds.slice(),
             roleWord: e.roleWord, resolvedTo: e.resolvedTo, resolveCandidates: e.resolveCandidates.slice(),
             candidateType: e.candidateType, confidence: e.confidence,   /* ★fix644 */
             appearance: e.appearance, sourceSpans: e.sourceSpans.slice() };
  }
  function report(){
    var L = load(), rows = [];
    for (var k in L.entries){
      if (!Object.prototype.hasOwnProperty.call(L.entries, k)) continue;
      var e = L.entries[k];
      rows.push({ name: k, turns: e.distinctSeenTurns, strong: strongKindsOf(e),
                  kinds: e.evidenceKinds.slice(), roleWord: e.roleWord, resolvedTo: e.resolvedTo,
                  candidateType: e.candidateType, confidence: e.confidence });   /* ★fix644 */
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
    entryKey764: entryKey764,   /* ★fix764: 検証口(台帳キーの引き) */
    /* 形状条件（fix644。純関数・テストと実機の両方から呼ぶ唯一の正） */
    classifyCandidate: classifyCandidate, personUse: personUse, confidenceOf: confidenceOf,
    /* 読み出し */
    why: why, report: report, selfTest: selfTest, stats: snap, isOff: off, getState: getState
  };
  try { if (!off()) console.log(TAG, 'evidence ledger ready:', KEY()); } catch(e){}
})();
