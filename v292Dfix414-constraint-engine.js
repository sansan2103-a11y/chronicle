// =====================================================================
// Chronicle TRPG - v292Dfix414: 身体・心理制約エンジン(重傷・解離・凍結の現実的コスト)
// ---------------------------------------------------------------------
// 設計書=設計書_fix414_身体心理制約エンジン_2026-07-10.md (Fable5)。案2採用=
//   fix333のcompileActorStates相当の導出をfix414内に流用拡張し、キャラ別の【制約】行を
//   keeper(fix379c __f379reg・prio2)で毎ターン注入する。<state>スキーマ・EMITは不変。
//   毎ターン store から導出し直すステートレス設計(蓄積・重複保存なし・新LSキーなし)。
// 責務: fix77=瞬間状態 / fix190=永続状態 / fix297=反応モード焼込 を維持し、fix414は
//   「導出と注入」のみ。fix333/77/297のファイル・関数は不触。Planner._extensionsは使わない。
// 既定=プレビューOFF。先行ON=localStorage v292Dfix414On='1'。全体OFF=v292Dfix414Off='1'。
// 検証口: window.__v292Dfix414x = { derive(name), preview(), status(), lastText() }。
//
// 2026-07-11 GPT-5.6監査E節根治(Opus4.8):
//   E-1 回復語の文単位「丸ごと除外」廃止→状態×極性判定(isRecoverySentence)。否定形/動作停止/
//       視覚の塞がりは除外しない。傷系名詞+回復語 だけを回復として除外(迷ったら残す=安全側)。
//   E-2 軽傷と機能不能を分離(不能=使用不可 / 裂傷のみ=低下・移動鈍い。浅い/掠りは制約なし)。
//   E-3 ハードキャップ(2名版でも300字超→1名→248字で区切り単位切詰め)。
//   E-4 対象限定(S.cast + 直近8ターン登場者のみ。storeの過去人物を除外)。
//   E-5 注入ヘッダを圧縮(~50字)。全体目標180字前後。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix414) return; window.__v292Dfix414 = true;
  var TAG = '[v292Dfix414:constraint-engine]';

  function on(){ try { return localStorage.getItem('v292Dfix414On') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix414Off') === '1'; } catch(e){ return false; } }
  function store(){ try { return window.__v292Dfix77Store || {}; } catch(e){ return {}; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ---- E-1: 回復文の判定(丸ごと除外の廃止・状態×極性) ----------------
  //   回復語を含む文でも、否定形・動作停止・視覚の塞がりは「未回復=制約継続」として残す。
  //   傷系名詞(傷/裂傷/出血/血/痛み)+回復語 だけを回復として除外。迷ったら残す(安全側)。
  function isRecoverySentence(s){
    s = String(s || '');
    if (!s) return false;
    // 否定形ガード: 「止まっていない/治りそうにない/回復する気配ない」等 → 除外しない
    if (/(止|治|塞)ま?っ?て(い|)ない|回復(して|する気配)(い|)ない|治り(そうに|)ない/.test(s)) return false;
    // 追加ガード: 活用の「が」挿入(塞がって)や「そうにない」を網羅 → 未回復として残す
    if (/(治|塞が|止ま|引い|癒え)[^。]{0,3}(ていない|てない|そうにない|そうもない)/.test(s)) return false;
    // 動作停止「(足|脚|手|腕)が止ま」は回復ではない → 除外しない
    if (/(足|脚|手|腕)が止ま/.test(s)) return false;
    // 視界/目/眼の塞がりは視覚制約側で拾う → 回復扱いしない(除外しない)
    if (/(視界|目|眼)が?.{0,4}塞が/.test(s)) return false;
    // 傷系名詞 + 回復語(直前0〜6字) だけを回復として除外
    if (/(傷|裂傷|出血|血|痛み)[^。]{0,6}(塞が(っ|り|)|止ま(っ|り|)|治(っ|り|る|)|引い(た|て)|回復)/.test(s)) return true;
    // 明確な治癒文
    if (/(すっかり|完全に|もう(すっかり|)|だいぶ)[^。]{0,6}(治|回復|良くな|癒え)/.test(s)) return true;
    return false;  // 迷ったら除外しない = 制約を残す(安全側)
  }
  // 文分割 → 回復文を除いた配列(制約が残る文のみ)。
  function keepSentences(text){
    return String(text || '').split(/[。\n]/).filter(function(s){
      return s && !isRecoverySentence(s);
    });
  }

  // ---- F-1: 導出器 deriveConstraints(name, stateEntry) ----------------
  //   入力: fix77 store の {karada, kokoro, kizu}。文単位で回復文を除いた上でカテゴリ判定。
  // rank(小さいほど重い): 1部位不能 > 1.5部位低下 > 2移動不能 > 2.5移動鈍化 >
  //   3出血 > 4視覚 > 5発話 > 6こころ
  var DISABLE = /(動かな|使えな|ほぼ動か|上がらな|力が入らな|折れ|骨折|潰れ|貫通|骨.{0,3}露出|切断|失(く|っ|わ))/;
  var LIGHT   = /(浅|掠り|かすり|小さな|軽い擦|擦り傷)/;
  var WOUND   = /(裂傷|深い傷|刺さ|刺され|えぐ|抉|裂け|えぐれ|大きな傷)/;
  function deriveConstraints(name, entry){
    entry = entry || {};
    var karada = String(entry.karada || '');
    var kizu   = String(entry.kizu   || '');
    var kokoro = String(entry.kokoro || '');
    var bodySents = keepSentences(karada + '。' + kizu);   // 物理系(からだ+傷)
    var mindText  = keepSentences(kokoro + '。' + karada).join('。');  // こころ系
    var cons = [], seen = {};
    function add(rank, text){ if (seen[text]) return; seen[text] = 1; cons.push({ rank: rank, text: text }); }

    bodySents.forEach(function(s){
      var light = LIGHT.test(s);
      // ---- A: 腕/手 → 不能=使用不可 / 裂傷=細かい作業が乱れる ----
      var mArm = s.match(/(左|右)?(腕|手)[^。]{0,10}/);
      if (mArm){
        var arm = (mArm[1] || '') + mArm[2];
        if (!light && DISABLE.test(s)){
          add(1, arm + '使用不可');
        } else if (!light && WOUND.test(s)){
          add(1.5, arm + 'の細かい作業が乱れる');
        }
      }
      // ---- B: 脚/足/膝 → 明示不能=走行不可 / 裂傷=移動が鈍い ----
      if (/(立てな|歩けな|荷重(が|に|)(かけ|できな|耐え)|(脚|足|膝)[^。]{0,10}(折れ|骨折|潰れ|切断|貫通))/.test(s)){
        add(2, '走行不可・移動は支え必要');
      } else if (!light && /(脚|足|膝)/.test(s) && WOUND.test(s)){
        add(2.5, '移動が鈍い');
      }
      // ---- C: 出血(継続/重症) → 長い行動で意識が揺らぐ ----
      if (/(大量|多量|止まらな)[^。]{0,6}出血|出血[^。]{0,8}(止まらな|止まって(い|)ない|続い|続く|ひど|激し)|血だまり|失血|大量出血/.test(s)){
        add(3, '長い行動で意識が揺らぐ');
      }
      // ---- D: 視覚 → 距離感・精密動作の低下 ----
      if (/(目|眼|視界)[^。]{0,8}(失|見えな|潰|塞が|血で|かすん|ぼやけ|霞ん)/.test(s)){
        add(4, '距離感・精密動作の低下');
      }
      // ---- E: 発話(喉/首/肺/胸の重損) → 長い台詞不可。小さ/浅は出さない ----
      if (/(喉|首|肺|胸)/.test(s) && /(潰|貫|裂傷|絞ま|塞が)/.test(s) && !/(小さ|浅)/.test(s)){
        add(5, '長い台詞不可(短い発話のみ)');
      }
    });
    // ---- F: こころ由来 → 即応・機転は出ない(型B/C) ----
    if (/(解離|現実感が(薄|な)|頭が真っ白|凍りつ|固ま|震えが止ま|身がすく)/.test(mindText)){
      add(6, '即応・機転は出ない(型B/C)');
    }
    cons.sort(function(a, b){ return a.rank - b.rank; });
    return cons.slice(0, 3);   // 3件超は重い順に3件まで
  }

  // ---- E-4: 対象限定 = S.cast(hero+npcs) + 直近8ターン登場者 ------------
  function castNames(){
    var names = [], seen = {};
    function add(n){ n = String(n || '').trim(); if (n && !seen[n]){ seen[n] = true; names.push(n); } }
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) add(S.cast.hero.name);
        var ns = S.cast.npcs || [];
        for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) add(ns[i].name); }
      }
    } catch(e){}
    return names;
  }
  function turnText(t){
    if (!t) return '';
    var parts = [];
    if (t.narrative)  parts.push(String(t.narrative));
    if (t.playerText) parts.push(String(t.playerText));
    if (t.text)       parts.push(String(t.text));
    if (t.body)       parts.push(String(t.body));
    var cs = t._convSays;
    if (Array.isArray(cs)){ for (var i = 0; i < cs.length; i++){ if (cs[i] && cs[i].say) parts.push(String(cs[i].say)); } }
    return parts.join('\n');
  }
  // 対象名の集合(空なら=Sが無い異常系→制限しない fail-open で制約は維持)。
  function targetSet(){
    var set = {}, any = false;
    castNames().forEach(function(n){ set[n] = true; any = true; });
    try {
      var S = getS();
      if (S && Array.isArray(S.turns) && S.turns.length){
        var turns = S.turns, txt = '';
        for (var i = Math.max(0, turns.length - 8); i < turns.length; i++){ txt += turnText(turns[i]) + '\n'; }
        Object.keys(store()).forEach(function(n){ if (n && txt.indexOf(n) >= 0){ set[n] = true; any = true; } });
      }
    } catch(e){}
    return any ? set : null;   // null = 制限なし(fail-open)
  }

  // ---- F-2: 注入文の合成(E-5 圧縮ヘッダ) -----------------------------
  var HEADER =
    '\n【制約】負傷者の行動には必ずコストを描く(無償の冷静さ・全能力維持は禁止)。現在: ';
  var _lastText = '';

  function collectAll(){
    var st = store(), out = [], tset = targetSet();
    Object.keys(st).forEach(function(name){
      if (tset && !tset[name]) return;   // E-4: 対象外(store居残りの過去人物)を除外
      var cons = deriveConstraints(name, st[name]);
      if (cons.length) out.push({ name: name, cons: cons });
    });
    // 重傷度順: 制約数の多い順、同数なら最も重いrank(小)が先。
    out.sort(function(a, b){
      if (b.cons.length !== a.cons.length) return b.cons.length - a.cons.length;
      return a.cons[0].rank - b.cons[0].rank;   // cons は rank 昇順済み
    });
    return out;
  }
  function fmt(list){
    return list.map(function(c){
      return c.name + ': ' + c.cons.map(function(x){ return x.text; }).join('・');
    }).join(' ／ ');
  }
  // E-3: 248字で区切り単位(。/／/・)切詰め。
  function capAt248(block){
    if (block.length <= 248) return block;
    var cut = block.slice(0, 248);
    var idx = -1;
    ['。', '／', '・'].forEach(function(d){ var p = cut.lastIndexOf(d); if (p > idx) idx = p; });
    if (idx > HEADER.length) cut = cut.slice(0, idx);
    return cut;
  }
  function buildBlock(){
    try {
      var all = collectAll();
      if (!all.length){ _lastText = ''; return ''; }
      var block = HEADER + fmt(all);
      // E-3 ハードキャップ: 300字超→2名→1名→248字切詰め。
      if (block.length > 300) block = HEADER + fmt(all.slice(0, 2));
      if (block.length > 300) block = HEADER + fmt(all.slice(0, 1));
      if (block.length > 248) block = capAt248(block);
      _lastText = block;
      return block;
    } catch(e){ _lastText = ''; return ''; }
  }

  // ---- keeper text 関数(ステートレス・毎回 store から導出) ------------
  //   既定OFF先行: v292Dfix414On!=='1' なら '' を返す。全体OFF も '' 。
  function textFn(){
    try {
      if (off()) return '';
      if (!on()) return '';   // 既定=プレビューOFF
      return buildBlock();
    } catch(e){ return ''; }
  }

  // ---- keeper 登録(__f379reg・prio2・marker='【制約】') -----------------
  (function register(){
    try {
      window.__f379reg = window.__f379reg || [];
      var reg = window.__f379reg;
      var MARKER = '【制約】';
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; }  // 二重登録回避
      reg.push({ off: 'v292Dfix414Off', marker: MARKER, prio: 2, text: textFn });
      try { console.log(TAG, 'registered to __f379reg (prio2)'); } catch(_){}
    } catch(e){}
  })();

  // ---- F-4: 検証口 ----------------------------------------------------
  window.__v292Dfix414x = {
    derive: function(name){ try { return deriveConstraints(name, store()[name]); } catch(e){ return []; } },
    preview: function(){ return buildBlock(); },
    status: function(){ return { on: on(), off: off(), names: Object.keys(store()) }; },
    lastText: function(){ return _lastText; }
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
