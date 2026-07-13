// =====================================================================
// Chronicle TRPG - v292Dfix445: 呼称の固定（同一存在の呼び名の増殖を止める）
// ---------------------------------------------------------------------
// ★真因（おしんの実スロット smrg85jwsn6・T9 の実データで確定）:
//   モデルが「同じ存在」を毎ターン違う呼び名で呼ぶ。
//     ・fix307ロスター(v292Dfix307Roster_slot_smrg85jwsn6) には 2件だけ:
//         祭壇の根(怪異) / 影の存在(人物)
//     ・ところが キャラ一覧の「👻 物語登場（自動抽出）」には 謎の影 / 人影 が別々に並ぶ
//       → この一覧のソースは fix145 collectChars() の
//          window.__longmem.raw.loadWorldInfo() の type==='character'
//          （＝fix135/136 longmem worldinfo・LSキー chr6_v292Dfix136_wi。fix246 が
//            スロット接尾辞つきキーへリダイレクトする）
//          ＋ fix307 の wiシムが足すロスター handle。
//          ＝ 台帳は「longmem wi / fix307ロスター / cast」の3系統に分裂しており、
//             モデルが呼び名を変えるたびに wi 側へ新エントリが増える。
//     ・_convSays[].who にも 人影 が出る（会話ログ側にも別話者として増える）
//   → 表示の名寄せ（対症）だけでは追いつかない。発生源＝モデルへ「既出の呼称一覧」を
//      毎ターン渡し、新しい呼び名を作らせないのが根治。
//
// 症状2: 朝比奈ひなた と ひなた が会話ログに別話者として並ぶ（cast名への吸収漏れ）。
// 症状3: モデル自身が who を誤る（実データ T9）:
//     <say who="澪">触れてはいけないのに——…</say>
//     その声は、耳で聞いたのではなかった。澪の背骨の内側を直接震わせる振動——…
//   → 怪異の台詞なのに who="澪"（澪は受け手）。
//     「ひな——」(who=ひなた) + 「声が出るより先に、澪の膝が床を蹴っていた。」→ 話者は澪。
//
// 実装（3層。既存 .js は一切書き換えない・単独完結）:
//   A) 【呼称の固定】sysブロック（keeper __f379reg・prio2・200字以内）＝増殖の根治
//   B) 近似名の正規化（pure canonHandle/buildCanonMap）
//        既定＝【表示のみ】: (b1) loadWorldInfo シムでキャラ一覧/longmem文脈の重複を畳む
//                            (b2) 会話ログの話者ラベル(.dlg-name)を正名で表示
//        データ書換は別スイッチ v292Dfix445Merge='1'（退避 chr6_bk_fix445_<ts> 必須）
//   C) 話者誤帰属の限定補正（pure fixSpeakers・R1呼びかけ / R2外部の声）
//        S.save ラップで【新ターンだけ】・確信が持てないときは何もしない
//        退避: t.__f445prev（+ 初回データ変更時に chr6_bk_fix445_<ts>）
//
// 冪等ガード: window.__v292Dfix445
// OFF: localStorage v292Dfix445Off='1'（全停止・live評価・リロード不要）
//   サブ: v292Dfix445LabelOff='1'(b2のみ停止) / v292Dfix445WiOff='1'(b1のみ停止)
//         v292Dfix445SpkOff='1'(Cのみ停止) / v292Dfix445Merge='1'(データ書換を有効化)
// 検証口: window.__v292Dfix445 = { canonHandle, buildCanonMap, knownHandles,
//         buildLockText, fixSpeakers, normalizeWiList, status, mergeNow }（pure・node可）
// ⚠ fix419c の教訓: ラッパーは内側関数の own props を全継承すること
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix445 && G.__v292Dfix445.__armed) return;   // 冪等
  var TAG = '[v292Dfix445:handle-lock]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix445Off') === '1'; }                 // 全停止
  function offLabel(){ return ls('v292Dfix445LabelOff') === '1'; }       // b2のみ
  function offWi(){ return ls('v292Dfix445WiOff') === '1'; }             // b1のみ
  function offSpk(){ return ls('v292Dfix445SpkOff') === '1'; }           // Cのみ
  function mergeOn(){ return ls('v292Dfix445Merge') === '1'; }           // データ書換(既定OFF)
  function getS(){ try { return G.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ===================================================================
  // 0. 語彙（一般名詞の芯）
  // ===================================================================
  // 一般名詞【単体】は cast へ吸収しない（fix424 GENERIC424 と同じ思想）。
  var GENERIC = { '男':1,'女':1,'人':1,'子':1,'声':1,'影':1,'者':1,'客':1,'僕':1,'私':1,'俺':1 };
  // 「芯」＝それ単体で存在を指す一般名詞。B の統合は【片方が芯だけ】のときに限る。
  var CORES = ['影','声','男','女','人','子','者','客','存在','怪異','人物','少年','少女',
               '子供','老人','男性','女性','幽霊','亡霊','化け物'];
  var CORE_SET = {}; (function(){ for (var i=0;i<CORES.length;i++) CORE_SET[CORES[i]] = 1; })();
  function isCore(n){ return !!CORE_SET[String(n||'')]; }

  function s(x){ return String(x == null ? '' : x); }
  function trim(x){ return s(x).replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''); }
  // 匿名/心の声/react由来は呼称として扱わない
  function badHandle(n){
    n = trim(n);
    if (!n) return true;
    if (/^[\?？]+$/.test(n)) return true;
    if (/[（(]\s*心\s*[）)]/.test(n)) return true;
    if (n.length > 16) return true;
    return false;
  }

  // ===================================================================
  // A/B. pure: 正名マップ
  // ===================================================================
  // cast吸収: who が cast名の【末尾一致】(下の名前呼び: ひなた→朝比奈ひなた) または
  //   【先頭一致】(姓呼び・2字以上) で一意に決まるときだけ振替。
  //   ・1字名(澪)は弾かない（fix424の教訓）
  //   ・一般名詞単体(男/女/影…)は候補にしない（「顔のない男」への誤吸収防止＝fix409の事故型）
  function castMatch(name, castNames){
    var n = trim(name);
    if (!n || GENERIC[n]) return '';
    var hit = [], i;
    /* ★v292Dfix456(2026-07-13): 空白ゆれ（「桐生悠真」⇔「桐生 悠真」）は同一人物。
     *   前方/後方一致では中央の空白を吸収できず同一人物が分裂していた。OFF=v292Dfix456Off */
    try {
      if (localStorage.getItem('v292Dfix456Off') !== '1'){
        var ws456 = /[\s\u3000]/g, n456 = n.replace(ws456, '');
        for (i = 0; i < (castNames || []).length; i++){
          var c456 = trim(castNames[i]);
          if (!c456) continue;
          if (c456 === n) return '';                       // 既に正名＝不触
          if (c456.replace(ws456, '') === n456) return c456;
        }
      }
    } catch(e){}
    for (i = 0; i < (castNames || []).length; i++){
      var c = trim(castNames[i]);
      if (!c) continue;
      if (c === n) return '';                                  // 既に正名＝不触
      if (c.length <= n.length) continue;
      var suf = (c.slice(c.length - n.length) === n);          // 末尾一致
      var pre = (n.length >= 2) && (c.slice(0, n.length) === n); // 先頭一致(2字以上のみ)
      if (suf || pre) hit.push(c);
    }
    return (hit.length === 1) ? hit[0] : '';                   // 一意なときだけ
  }

  // 未登録同士の統合。
  //   ・統合は「片方が芯だけ（修飾語なし）」のときに限定する。
  //       影 と 謎の影 → 統合    /  謎の影 と 祭壇の影 → 統合しない
  //       観覧車の少女 と 孤児院の少女 → 統合しない（fix409の事故ケース）
  //   ・過剰統合ガード: 芯 b に対して修飾つきの候補が【2件以上】ある場合、b は曖昧なハブに
  //     なるので、そのグループは【一切統合しない】。
  //     （影 / 謎の影 / 祭壇の影 が並ぶとき、b 経由で 謎の影＝祭壇の影 になるのを防ぐ）
  //   ・統合先は【先に登場したほう】（ord 昇順・同値ならリスト順）。
  //
  // nonCast: [{ name, ord }]（ord=初出の順序。小さいほど先）
  // 返り値: { 別名: 正名, ... }（変更のあるものだけ）
  function buildCanonMap(castNames, nonCast){
    var map = {}, i, j;
    var list = [];
    for (i = 0; i < (nonCast || []).length; i++){
      var e = nonCast[i];
      var nm = trim(e && e.name != null ? e.name : e);
      if (!nm || badHandle(nm)) continue;
      var ord = (e && typeof e.ord === 'number') ? e.ord : (1e9 + i);
      var dup = false;
      for (j = 0; j < list.length; j++){ if (list[j].name === nm){ dup = true; break; } }
      if (!dup) list.push({ name: nm, ord: ord, i: list.length });
    }
    // (1) cast吸収
    var rest = [];
    for (i = 0; i < list.length; i++){
      var c = castMatch(list[i].name, castNames);
      if (c) map[list[i].name] = c;
      else rest.push(list[i]);
    }
    // (2) 芯だけ ↔ 修飾つき の統合
    function earlier(a, b){
      if (a.ord !== b.ord) return (a.ord < b.ord) ? a : b;
      return (a.i <= b.i) ? a : b;
    }
    for (i = 0; i < rest.length; i++){
      var b = rest[i];
      if (!isCore(b.name)) continue;                    // 芯だけの名前が起点
      var others = [];
      for (j = 0; j < rest.length; j++){
        var o = rest[j];
        if (o.name === b.name) continue;
        if (isCore(o.name)) continue;                   // 芯どうし(影と声)は統合しない
        if (o.name.indexOf(b.name) < 0) continue;       // 芯を含むか（部分文字列）
        if (map[o.name]) continue;                      // すでに cast へ吸収済み
        others.push(o);
      }
      if (others.length !== 1) continue;                // 0件=何もしない / 2件以上=曖昧ハブ→触らない
      var win = earlier(b, others[0]);
      var lose = (win === b) ? others[0] : b;
      if (!map[lose.name]) map[lose.name] = win.name;
    }
    // (3) 連鎖解決（深さ3まで）
    for (var k in map){
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var t = map[k], d = 0;
      while (map[t] && map[t] !== t && d < 3){ t = map[t]; d++; }
      if (t !== k) map[k] = t; else delete map[k];
    }
    return map;
  }

  // 単体版（テスト/外部用）。known = { cast:[], nonCast:[{name,ord}] }
  function canonHandle(name, known){
    var n = trim(name);
    if (!n) return s(name);
    known = known || {};
    var map = buildCanonMap(known.cast || [], known.nonCast || []);
    return map[n] || n;
  }

  // ===================================================================
  // 素材収集（live）
  // ===================================================================
  function slotSfx(){
    try {
      if (typeof G.__chr6Key === 'function'){
        var k = G.__chr6Key();
        return (k && k !== 'chr6') ? String(k).replace(/^chr6/, '') : '';
      }
    } catch(e){}
    return '';
  }
  function activeSlotKey(){
    try { if (typeof G.__chr6Key === 'function') return G.__chr6Key() || 'chr6'; } catch(e){}
    return 'chr6';
  }
  // fix307ロスター: LSキー = 'v292Dfix307Roster' + slotSfx()（実コードで確認）
  //   要素 = { handle, kind, importance, appr, firstTurn, lastTurn }
  function loadRoster(){
    try {
      var api = G.__v292Dfix307api;
      if (api && typeof api.loadRoster === 'function') return api.loadRoster() || [];
    } catch(e){}
    try { return JSON.parse(ls('v292Dfix307Roster' + slotSfx()) || '[]') || []; } catch(e){ return []; }
  }
  // longmem worldinfo（キャラ一覧「物語登場（自動抽出）」の実ソース）
  //   LSキー = 'chr6_v292Dfix136_wi'（fix246 がスロット接尾辞へリダイレクト）
  //   ⚠ __longmem.raw.loadWorldInfo() は【呼ばない】(b1で自分がシムするため再帰する)
  function rawWiChars(){
    try {
      var arr = JSON.parse(ls('chr6_v292Dfix136_wi') || '[]') || [];
      var out = [];
      for (var i = 0; i < arr.length; i++){
        var w = arr[i];
        if (w && w.name && w.type === 'character') out.push(trim(w.name));
      }
      return out;
    } catch(e){ return []; }
  }
  function castNamesOf(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(trim(S.cast.hero.name));
        var np = S.cast.npcs || [];
        for (var i = 0; i < np.length; i++){ if (np[i] && np[i].name) out.push(trim(np[i].name)); }
      }
    } catch(e){}
    return out.filter(function(x){ return !!x; });
  }

  // 素材 → { cast:[], nonCast:[{name,ord}] }
  //   ord: 未登録who=初出ターンindex / ロスター=firstTurn / wi=最後尾
  //   ＝「先に登場したものを正」（B の統合方向を決める）
  function collectSources(S, roster, wiNames){
    var cast = castNamesOf(S), i;
    var castSet = {}; for (i = 0; i < cast.length; i++) castSet[cast[i]] = 1;
    var seen = {}, nonCast = [];
    function add(name, ord){
      var n = trim(name);
      if (!n || badHandle(n) || castSet[n] || seen[n]) return;
      seen[n] = 1;
      nonCast.push({ name: n, ord: (typeof ord === 'number') ? ord : 1e6 });
    }
    // (2) fix307ロスター（firstTurn で順序づけ）
    var rs = roster || [];
    for (i = 0; i < rs.length; i++){
      if (!rs[i] || !rs[i].handle) continue;
      add(rs[i].handle, (typeof rs[i].firstTurn === 'number' && rs[i].firstTurn >= 0) ? rs[i].firstTurn : 1e5 + i);
    }
    // (3) 過去の _convSays[].who のうち未登録のもの（先に登場したものを正）
    try {
      var turns = (S && S.turns) || [];
      for (var ti = 0; ti < turns.length; ti++){
        var cs = turns[ti] && turns[ti]._convSays;
        if (!Array.isArray(cs)) continue;
        for (var ci = 0; ci < cs.length; ci++){
          if (!cs[ci] || cs[ci]._rv) continue;
          add(cs[ci].who, ti);
        }
      }
    } catch(e){}
    // (4) longmem worldinfo のキャラ名（キャラ一覧の自動抽出の実ソース）
    var wn = wiNames || [];
    for (i = 0; i < wn.length; i++) add(wn[i], 2e6 + i);
    return { cast: cast, nonCast: nonCast };
  }

  // 正名リスト（cast → 未登録の正名。統合で消えた別名は含まない）
  function knownHandles(S, roster, wiNames){
    var src = collectSources(S, roster, wiNames);
    var map = buildCanonMap(src.cast, src.nonCast);
    var out = [], seen = {}, i;
    for (i = 0; i < src.cast.length; i++){
      if (!seen[src.cast[i]]){ seen[src.cast[i]] = 1; out.push(src.cast[i]); }
    }
    var rest = src.nonCast.slice().sort(function(a, b){ return a.ord - b.ord; });
    for (i = 0; i < rest.length; i++){
      var n = map[rest[i].name] || rest[i].name;
      if (!seen[n]){ seen[n] = 1; out.push(n); }
    }
    return out;
  }
  function liveKnown(){
    return knownHandles(getS(), loadRoster(), rawWiChars());
  }

  // ===================================================================
  // A. 【呼称の固定】sysブロック（keeper prio2・200字以内）
  // ===================================================================
  var MARKER = '【呼称の固定】';
  var MAX_NAMES = 8, MAX_NAME_LEN = 12, MAX_TEXT = 200;

  function composeLock(names){
    return '\n' + MARKER + '既出の存在は必ずこの呼称で呼ぶ: ' + names.join('、') +
           '。同じ存在に別の呼称を作らない。<say who>もこの一覧から選ぶ。本当に新しい存在にだけ新しい呼称を付ける。';
  }
  // names -> sys文字列（空なら ''）。必ず MAX_TEXT 字以内（超えるなら末尾から名前を削る）。
  function buildLockText(names){
    var pick = [], seen = {}, i;
    for (i = 0; i < (names || []).length && pick.length < MAX_NAMES; i++){
      var n = trim(names[i]);
      if (!n) continue;
      if (n.length > MAX_NAME_LEN) n = n.slice(0, MAX_NAME_LEN);   // 各12字まで
      if (seen[n]) continue;
      seen[n] = 1; pick.push(n);
    }
    if (!pick.length) return '';
    var t = composeLock(pick);
    while (t.length > MAX_TEXT && pick.length > 1){                // 予算保護
      pick.pop();
      t = composeLock(pick);
    }
    if (t.length > MAX_TEXT) return '';    // 起こらないはずだが安全側
    return t;
  }
  function lockTextFn(){                    // keeper text()（副作用なし）
    try {
      if (off()) return '';
      var names = liveKnown();
      if (names.length < 2) return '';      // 主人公しか居ない＝注入不要
      return buildLockText(names);
    } catch(e){ return ''; }
  }
  (function registerKeeper(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; }  // 二重登録回避
      reg.push({ off: 'v292Dfix445Off', marker: MARKER, prio: 2, text: lockTextFn });
      try { console.log(TAG, 'keeper registered (prio2, <=' + MAX_TEXT + ' chars)'); } catch(_){}
    } catch(e){ try { console.warn(TAG, 'keeper reg err:', e && e.message); } catch(_){} }
  })();

  // ===================================================================
  // C. 話者誤帰属の限定補正（pure）
  // ===================================================================
  // 発話ユニット: <say who="X">…</say> もしくは 「…」
  var RE_UTT = /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>|「([^」]*)」/g;
  // R1: 呼びかけ断片（「ひな——」「澪…」）＝短い断片＋伸ばし/三点リーダで終わる
  var RE_CALL = /^[^\s　。、！？!?]{1,5}\s*[—ー―\-‐–…‥・、,]+$/;
  // R2: "外から来る声" マーカー（「その声は震えていた」のような通常文には当てない）
  var RE_EXT = /耳で聞いたので|耳で聞いたもので|耳が聞いたので|頭の中に直接|頭に直接|脳に直接|その声は[^。]{0,24}(ではなかっ|ではない|でなかっ)|声というより|言葉というより/;
  // 主語/所有の助詞（「澪の膝が」「澪が」）
  var SUBJ = 'のがはも';

  function normQ(x){ return s(x).replace(/[\s　。、！？!?…‥・「」『』―—\-～〜]/g, ''); }
  function stripTags(x){ return s(x).replace(/<[^>]*>/g, ' '); }
  function esc(x){ return s(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function cloneCS(c){
    if (!c || typeof c !== 'object') return c;
    var o = {}; for (var k in c){ if (Object.prototype.hasOwnProperty.call(c, k)) o[k] = c[k]; }
    return o;
  }
  // prose の中で name が「主語/所有」として現れるか（澪の / 澪が / 澪は）
  function nameAsSubject(prose, name){
    if (!name) return false;
    var re = new RegExp(esc(name) + '[' + SUBJ + ']');
    return re.test(s(prose));
  }
  function nameAppears(text, name){ return !!name && s(text).indexOf(name) >= 0; }

  // narrative(文字列 or 配列) から発話ユニットと「直後の地の文」を取り出す（pure）
  function parseUtterances(narrative){
    var text = Array.isArray(narrative) ? narrative.join('\n') : s(narrative);
    var units = [], m;
    RE_UTT.lastIndex = 0;
    while ((m = RE_UTT.exec(text)) !== null){
      var isTag = (m[1] != null);
      units.push({
        who:   isTag ? trim(m[1]) : null,
        say:   isTag ? trim(m[2]) : trim(m[3]),
        start: m.index,
        end:   m.index + m[0].length
      });
      if (m[0] === '') RE_UTT.lastIndex++;   // 無限ループ保険
    }
    for (var i = 0; i < units.length; i++){
      var to = (i + 1 < units.length) ? units[i + 1].start : text.length;
      var gap = stripTags(text.slice(units[i].end, to));
      // 直後の地の文＝最初の非空行（最大160字）
      var lines = gap.split('\n'), prose = '';
      for (var j = 0; j < lines.length; j++){
        var ln = trim(lines[j]);
        if (ln){ prose = ln.slice(0, 160); break; }
      }
      units[i].prose = prose;
    }
    return { text: text, units: units };
  }

  // 1発話の判定（pure）。振替先を返す。触らないなら ''。
  //   ctx = { cast:[], nonCast:[], turnText:'' }
  function fixSpeaker(say, who, prose, ctx){
    ctx = ctx || {};
    var cast = ctx.cast || [], nonCast = ctx.nonCast || [];
    var all = cast.concat(nonCast);
    who = trim(who); say = trim(say); prose = trim(prose);
    if (!who || !prose) return '';

    // ---- R1: 呼びかけ（自分の名を呼ぶ話者は居ない） ----
    if (RE_CALL.test(say)){
      var frag = say.replace(/[\s　—ー―\-‐–…‥・、,]+$/, '');
      // 断片が who の先頭一致＝ who は【呼ばれている側】
      if (frag && who.indexOf(frag) === 0 && frag !== who){
        var c1 = [], i;
        for (i = 0; i < all.length; i++){
          if (all[i] === who) continue;
          if (nameAsSubject(prose, all[i])) c1.push(all[i]);   // 別の存在＋発話/身体動作の主語
        }
        if (c1.length === 1) return c1[0];    // 一意のときだけ
        return '';
      }
    }

    // ---- R2: 外から来る声（who が cast なのに、声は耳/身体の外から直接） ----
    if (RE_EXT.test(prose)){
      var isCast = false, k;
      for (k = 0; k < cast.length; k++){ if (cast[k] === who){ isCast = true; break; } }
      if (isCast){
        var c2 = [], tt = s(ctx.turnText || prose), j;
        for (j = 0; j < nonCast.length; j++){
          if (nonCast[j] === who) continue;
          if (nameAppears(tt, nonCast[j])) c2.push(nonCast[j]);
        }
        if (c2.length === 1) return c2[0];    // 候補が一意に定まるときだけ
      }
    }
    return '';
  }

  // narrative + _convSays → 補正済みの【新しい配列】（非破壊）＋変更ログ
  //   ctx = { cast:[], nonCast:[] }
  function fixSpeakers(narrative, convSays, ctx){
    var out = (convSays || []).map(cloneCS);
    var changes = [];
    if (!out.length) return { list: out, changes: changes };
    var p = parseUtterances(narrative);
    var units = p.units;
    if (!units.length) return { list: out, changes: changes };
    var c2 = { cast: (ctx && ctx.cast) || [], nonCast: (ctx && ctx.nonCast) || [], turnText: stripTags(p.text) };

    // 発話ユニット → _convSays を順に突き合わせ（fix427 findCS と同流儀）
    var pos = 0;
    for (var u = 0; u < units.length; u++){
      var qn = normQ(units[u].say);
      if (!qn) continue;
      var hit = -1;
      for (var j = pos; j < out.length; j++){
        var e = out[j];
        if (!e || e._rv) continue;
        var en = normQ(e.say);
        if (!en) continue;
        if (en === qn || (en.length >= 4 && qn.length >= 4 && (qn.indexOf(en) === 0 || en.indexOf(qn) === 0))){ hit = j; break; }
      }
      if (hit < 0) continue;
      pos = hit + 1;
      var cur = trim(out[hit].who);
      var nw = fixSpeaker(units[u].say, cur, units[u].prose, c2);
      if (nw && nw !== cur){
        changes.push({ idx: hit, from: cur, to: nw, say: s(out[hit].say).slice(0, 20) });
        out[hit].who = nw;
      }
    }
    return { list: out, changes: changes };
  }

  // ===================================================================
  // 退避（セーブ本体のバックアップ）
  // ===================================================================
  var _bkDone = false, _lastBkTs = 0;
  function backupOnce(reason){
    if (_bkDone) return true;
    try {
      var ak = activeSlotKey();
      var blob = ls(ak) || '';
      var ts = Date.now(); if (ts <= _lastBkTs) ts = _lastBkTs + 1; _lastBkTs = ts;
      var key = 'chr6_bk_fix445_' + ts;
      var payload = JSON.stringify({ key: ak, blob: blob, ts: ts, reason: s(reason) });
      try { localStorage.setItem(key, payload); } catch(e){ return false; }
      var ok = false;
      try {
        var rb = ls(key);
        if (rb){ var o = JSON.parse(rb); ok = !!(o && o.key === ak && o.blob === blob); }   // read-back検証
      } catch(e){ ok = false; }
      if (!ok){ try { localStorage.removeItem(key); } catch(e){} return false; }
      pruneBackups(3);
      _bkDone = true;
      try { console.log(TAG, 'backup saved:', key, '(' + reason + ')'); } catch(_){}
      return true;
    } catch(e){ return false; }
  }
  function pruneBackups(keep){
    try {
      var keys = [], i;
      for (i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (k && /^chr6_bk_fix445_\d+$/.test(k)) keys.push(k);
      }
      var PFX = 'chr6_bk_fix445_';
      keys.sort(function(a, b){ return (parseInt(b.slice(PFX.length), 10) || 0) - (parseInt(a.slice(PFX.length), 10) || 0); });
      for (i = keep; i < keys.length; i++){ try { localStorage.removeItem(keys[i]); } catch(e){} }
    } catch(e){}
  }

  // ===================================================================
  // D. 設置
  // ===================================================================
  // ---- C: S.save ラップ（新ターンだけ・書き込み前） ----
  var _lastLen = -1;
  function processNewTurn(){
    if (off() || offSpk()) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    if (_lastLen < 0){ _lastLen = S.turns.length; return; }   // 初観測＝履歴は触らない
    if (S.turns.length <= _lastLen) return;                   // 新ターンではない
    _lastLen = S.turns.length;
    var t = S.turns[S.turns.length - 1];
    if (!t || t.__f445) return;
    t.__f445 = 1;
    var cs = t._convSays;
    if (!Array.isArray(cs) || !cs.length) return;

    var src = collectSources(S, loadRoster(), rawWiChars());
    var map = buildCanonMap(src.cast, src.nonCast);
    var nonCanon = [], i, n;
    for (i = 0; i < src.nonCast.length; i++){
      n = map[src.nonCast[i].name] || src.nonCast[i].name;
      if (src.cast.indexOf(n) < 0 && nonCanon.indexOf(n) < 0) nonCanon.push(n);
    }
    var r = fixSpeakers(t.narrative, cs, { cast: src.cast, nonCast: nonCanon });
    if (!r.changes.length) return;
    if (!backupOnce('speaker-fix')){ try { console.warn(TAG, 'backup failed - speaker fix aborted'); } catch(_){} return; }
    t.__f445prev = cs.map(cloneCS);          // ★退避（ロールバック可能）
    t._convSays = r.list;
    try {
      for (i = 0; i < r.changes.length; i++){
        console.log(TAG, 'speaker fixed:', r.changes[i].from, '->', r.changes[i].to, '|', r.changes[i].say);
      }
    } catch(_){}
    try {
      var cards = document.querySelectorAll('.v292-dlg-card');
      for (i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
      if (G.__v292Dfix66 && G.__v292Dfix66.repair) G.__v292Dfix66.repair();
    } catch(e){}
  }
  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f445save) return true;
    var os = S.save;
    var w = function(){
      try { processNewTurn(); } catch(e){ try { console.warn(TAG, 'save wrap err:', e && e.message); } catch(_){} }
      return os.apply(this, arguments);
    };
    try { Object.keys(os).forEach(function(k){ w[k] = os[k]; }); } catch(e){}   // fix419c: own props 全継承
    S.save = w;
    S.__f445save = true;
    try { console.log(TAG, 'S.save wrap installed'); } catch(_){}
    return true;
  }
  (function pollS(){ pollS._n = (pollS._n || 0) + 1; if (wrapSave()) return; if (pollS._n > 80) return; setTimeout(pollS, 400); })();

  // ---- b1: loadWorldInfo シム（表示のみ・データ不触） ----
  // キャラ一覧「👻 物語登場（自動抽出）」= fix145 collectChars() が
  //   window.__longmem.raw.loadWorldInfo() の type==='character' を読む。ここを畳む。
  //   （fix307 の wiシムは lm.raw.__v292Dfix307wi フラグで再install を判定するので、
  //     こちらが外側に重なっても再ラップ合戦にはならない）
  function normalizeWiList(list, map, castNames){
    var out = [], seen = {}, i;
    for (i = 0; i < (castNames || []).length; i++) seen[castNames[i]] = 1;
    for (i = 0; i < (list || []).length; i++){
      var e = list[i];
      if (!e || !e.name || e.type !== 'character'){ out.push(e); continue; }
      var nm = trim(e.name);
      var canon = (map && map[nm]) ? map[nm] : nm;
      if (canon !== nm){
        if (seen[canon]) continue;                                  // 正名が既にある→別名エントリは畳む
        var c = {}; for (var k in e){ if (Object.prototype.hasOwnProperty.call(e, k)) c[k] = e[k]; }
        c.name = canon; seen[canon] = 1; out.push(c); continue;     // 正名へ寄せて1件だけ残す
      }
      if (seen[nm]) continue;
      seen[nm] = 1; out.push(e);
    }
    return out;
  }
  function installWiShim(){
    try {
      var lm = G.__longmem;
      if (!lm || !lm.raw || typeof lm.raw.loadWorldInfo !== 'function') return false;
      if (lm.raw.__v292Dfix445wi) return true;
      var prev = lm.raw.loadWorldInfo;
      var w = function(){
        var base = prev.apply(this, arguments) || [];
        try {
          if (off() || offWi()) return base;
          var names = [], i;
          for (i = 0; i < base.length; i++){ if (base[i] && base[i].name && base[i].type === 'character') names.push(trim(base[i].name)); }
          var src = collectSources(getS(), loadRoster(), names);
          var map = buildCanonMap(src.cast, src.nonCast);
          return normalizeWiList(base, map, src.cast);
        } catch(e){ return base; }
      };
      try { Object.keys(prev).forEach(function(k){ w[k] = prev[k]; }); } catch(e){}   // fix419c
      lm.raw.loadWorldInfo = w;
      lm.raw.__v292Dfix445wi = true;
      try { console.log(TAG, 'worldinfo normalize shim installed'); } catch(_){}
      return true;
    } catch(e){ return false; }
  }
  try { setInterval(installWiShim, 2000); } catch(e){}
  installWiShim();

  // ---- b2: 会話ログの話者ラベル(.dlg-name)を正名で表示（DOMのみ・データ不触） ----
  var _labelSig = '';
  function sweepLabels(){
    try {
      if (off() || offLabel() || typeof document === 'undefined') return;
      var els = document.querySelectorAll('.v292-dlg-card .dlg-name');
      if (!els || !els.length) return;
      var src = collectSources(getS(), loadRoster(), rawWiChars());
      var map = buildCanonMap(src.cast, src.nonCast);
      var n = 0;
      for (var i = 0; i < els.length; i++){
        var cur = trim(els[i].textContent);
        if (!cur) continue;
        var canon = map[cur];
        if (canon && canon !== cur){ els[i].textContent = canon; n++; }
      }
      if (n){
        var sig = String(els.length) + ':' + n;
        if (sig !== _labelSig){ _labelSig = sig; try { console.log(TAG, 'labels normalized:', n); } catch(_){} }
      }
    } catch(e){}
  }
  try { setInterval(sweepLabels, 2000); } catch(e){}

  // ---- B(データ書換・別スイッチ v292Dfix445Merge='1'): 全ターンの who を正名へ ----
  function mergeNow(){
    if (off() || !mergeOn()) return { changed: false, reason: 'off' };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var src = collectSources(S, loadRoster(), rawWiChars());
    var map = buildCanonMap(src.cast, src.nonCast);
    var plan = [], ti, ci, i;
    for (ti = 0; ti < S.turns.length; ti++){
      var cs = S.turns[ti] && S.turns[ti]._convSays;
      if (!Array.isArray(cs)) continue;
      for (ci = 0; ci < cs.length; ci++){
        var w = cs[ci] && trim(cs[ci].who);
        if (w && map[w] && map[w] !== w) plan.push({ ti: ti, ci: ci, from: w, to: map[w] });
      }
    }
    if (!plan.length) return { changed: false, log: [] };
    if (!backupOnce('merge')) return { changed: false, backupFailed: true };
    for (i = 0; i < plan.length; i++){
      var t = S.turns[plan[i].ti];
      if (!t.__f445mprev) t.__f445mprev = (t._convSays || []).map(cloneCS);   // 退避
      t._convSays[plan[i].ci].who = plan[i].to;
    }
    try { if (S.save) S.save(); } catch(e){}
    try {
      var cards = document.querySelectorAll('.v292-dlg-card');
      for (i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
      if (G.__v292Dfix66 && G.__v292Dfix66.repair) G.__v292Dfix66.repair();
    } catch(e){}
    try { console.log(TAG, 'merged (data):', JSON.stringify(plan)); } catch(_){}
    return { changed: true, log: plan };
  }
  try { setTimeout(function(){ try { if (mergeOn()) mergeNow(); } catch(e){} }, 9000); } catch(e){}

  // ===================================================================
  // 検証口
  // ===================================================================
  G.__v292Dfix445 = {
    __armed: true,
    // pure
    canonHandle:      canonHandle,
    buildCanonMap:    buildCanonMap,
    castMatch:        castMatch,
    knownHandles:     knownHandles,
    buildLockText:    buildLockText,
    collectSources:   collectSources,
    parseUtterances:  parseUtterances,
    fixSpeaker:       fixSpeaker,
    fixSpeakers:      fixSpeakers,
    normalizeWiList:  normalizeWiList,
    // live
    lockText:         lockTextFn,
    mergeNow:         mergeNow,
    sweepLabels:      sweepLabels,
    MARKER:           MARKER,
    MAX_TEXT:         MAX_TEXT,
    status: function(){
      var S = getS(), names = [], txt = '';
      try { names = liveKnown(); } catch(e){}
      try { txt = lockTextFn(); } catch(e){}
      return {
        off: off(), offWi: offWi(), offLabel: offLabel(), offSpk: offSpk(), merge: mergeOn(),
        slot: activeSlotKey(),
        known: names,
        sysLen: txt.length,
        sysText: txt,
        roster: loadRoster().length,
        wi: rawWiChars().length,
        turns: (S && S.turns) ? S.turns.length : 0
      };
    }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ', merge=' + (mergeOn() ? '1' : '0') + ')'); } catch(e){}
})();
