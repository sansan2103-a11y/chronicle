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
//   E-1 回復語の文単位「丸ごと除外」廃止→状態×極性判定(isRecoveryClause)。否定形/動作停止/
//       視覚の塞がりは除外しない。傷系名詞+回復語 だけを回復として除外(迷ったら残す=安全側)。
//   E-2 軽傷と機能不能を分離(不能=使用不可 / 裂傷のみ=低下・移動鈍い。浅い/掠りは制約なし)。
//   E-3 ハードキャップ(2名版でも300字超→1名→248字で区切り単位切詰め)。
//   E-4 対象限定(S.cast + 直近8ターン登場者のみ。storeの過去人物を除外)。
//   E-5 注入ヘッダを圧縮(~50字)。全体目標180字前後。
//
// 2026-07-11 GPT-5.6再監査G節根治(Opus4.8・過剰/過少マッチの部位混同を解消):
//   G-1 部位×状態を1マッチ単位で同時導出。matchAll+部位ローカル文脈(、/。/連体接続で境界)で
//       部位ごとに個別判定。「右手は無傷だが左腕は骨折して動かない」→左腕のみ使用不可。
//   G-2 LIGHT(浅い/軽い/擦り)判定を各部位マッチのローカル文脈に限定。文全体に効かせない。
//       「右手に浅い擦り傷、左腕は骨折」→右手は無制約・左腕は重い制約。
//   G-3 回復判定は「が、/しかし/一方/ものの/ただし/だが/けれど」で節分割してから節単位で実施。
//       「右腕の傷は塞がったが、左脚の裂傷は悪化」→左脚の制約は残す(右腕節だけ回復除外)。
//   G-4 「血の気が引いた」は回復扱いしない。回復=傷系主語×回復語の明確対応のみ
//       (出血が止まった/腫れが引いた/痛みが引いた/傷が塞がった 等)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix414) return; window.__v292Dfix414 = true;
  var TAG = '[v292Dfix414:constraint-engine]';

  function on(){ try { return localStorage.getItem('v292Dfix414On') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix414Off') === '1'; } catch(e){ return false; } }
  function store(){ try { return window.__v292Dfix77Store || {}; } catch(e){ return {}; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ---- 状態語彙(部位ローカル文脈で判定・/g無しで再利用可) --------------
  var DISABLE = /(動かな|使えな|ほぼ動か|上がらな|力が入らな|折れ|骨折|潰れ|貫通|骨.{0,3}露出|切断|失(く|っ|わ))/;
  var WOUND   = /(裂傷|深い傷|刺さ|刺され|えぐ|抉|裂け|えぐれ|大きな傷)/;
  var LIGHT   = /(浅|掠り|かすり|小さな|軽い擦|擦り傷|軽い傷|軽傷|かすり傷)/;

  // ---- G-3: 節分割器(逆接の接続詞で分割・主語のがは割らない) ------------
  //   「だが/が、」等の逆接のみ分割。連体/主語の「が」(左腕が骨折)は割らない。
  function splitSentences(text){ return String(text || '').split(/[。\n]/); }
  function splitClauses(sentence){
    return String(sentence || '').split(/(?:だが、?|が、|しかし、?|一方(?:で)?、?|ものの、?|ただし、?|けれど、?|けど、?)/);
  }

  // ---- G-4: 回復判定(節単位・傷系主語×回復語の明確対応のみ) --------------
  //   血の気が引いた/否定形/動作停止/視覚塞がりは回復扱いしない(制約継続)。
  function isRecoveryClause(s){
    s = String(s || '');
    if (!s) return false;
    // G-4: 「血の気が引いた」は回復でない(恐怖反応)
    if (/血の気/.test(s)) return false;
    // 否定形ガード: 「止まっていない/治りそうにない/回復する気配ない」等 → 回復でない
    if (/(止|治|塞)ま?っ?て(い|)ない|回復(して|する気配)(い|)ない|治り(そうに|)ない/.test(s)) return false;
    if (/(治|塞が|止ま|引い|癒え)[^。]{0,3}(ていない|てない|そうにない|そうもない)/.test(s)) return false;
    // 動作停止「(足|脚|手|腕)が止ま」は回復ではない
    if (/(足|脚|手|腕)が止ま/.test(s)) return false;
    // 視界/目/眼の塞がりは視覚制約側で拾う → 回復扱いしない
    if (/(視界|目|眼)が?.{0,4}塞が/.test(s)) return false;
    // 明確対応: 傷系主語 × 回復語(主語を血の気/一般の血と混同しない)
    if (/(出血)[^。]{0,4}(止ま(っ|り)|止んだ|止んで)/.test(s)) return true;
    if (/(腫れ|腫脹)[^。]{0,4}(引い(た|て)|引く|ひい(た|て))/.test(s)) return true;
    if (/(痛み|痛)[^。]{0,4}(引い(た|て)|治ま(っ|り)|和らい|消え(た|て))/.test(s)) return true;
    if (/(傷|裂傷|切り傷|切創)[^。]{0,4}(塞が(っ|り)|塞がった|癒え|治(っ|り|った|る))/.test(s)) return true;
    // 明確な全快文
    if (/(すっかり|完全に|もう(すっかり|)|だいぶ)[^。]{0,6}(治|回復|良くな|癒え)/.test(s)) return true;
    return false;  // 迷ったら回復にしない = 制約を残す(安全側)
  }

  // 文→逆接節に割り、回復節を除いた「残る節」の配列(G-3)。
  function keepClauses(rawText){
    var kept = [];
    splitSentences(rawText).forEach(function(sent){
      splitClauses(sent).forEach(function(cl){
        cl = String(cl || '').trim();
        if (!cl) return;
        if (isRecoveryClause(cl)) return;
        kept.push(cl);
      });
    });
    return kept;
  }

  // ---- G-1/G-2: 部位ローカル文脈の切り出し(、/。/改行で境界・前後窓) ------
  function localCtxComma(text, idx, mlen){
    var before = text.slice(0, idx);
    var lb = Math.max(before.lastIndexOf('、'), before.lastIndexOf('，'),
                      before.lastIndexOf('。'), before.lastIndexOf('\n'));
    var startC = lb + 1;
    var after = text.slice(idx + mlen);
    var rel = after.search(/[。、，\n]/);
    var endC = (rel < 0) ? text.length : (idx + mlen + rel);
    var s = Math.max(startC, idx - 14);
    var e = Math.min(endC, idx + mlen + 20);
    return text.slice(s, e);
  }
  // 部位語を matchAll し、部位ごとにローカル文脈を渡す(部位混同の根治)。
  function scanPart(clause, reSrc, cb){
    var re = new RegExp(reSrc, 'g'), m;
    while ((m = re.exec(clause))){
      var side = m[1] || '', word = m[2], part = side + word;
      var ctx = localCtxComma(clause, m.index, m[0].length);
      cb(part, ctx);
      if (re.lastIndex === m.index) re.lastIndex++;   // ゼロ幅ループ回避
    }
  }
  var ARM_RE = '(左|右|両)?(腕|手首|手|拳|肘)';
  var LEG_RE = '(左|右|両)?(太もも|ふくらはぎ|足首|脚|足|膝)';

  // ---- F-1: 導出器 deriveConstraints(name, stateEntry) ----------------
  //   入力: fix77 store の {karada, kokoro, kizu}。回復節を除いた各節を、部位ローカルで判定。
  // rank(小さいほど重い): 1部位不能 > 1.5部位低下 > 2移動不能 > 2.5移動鈍化 >
  //   3出血 > 4視覚 > 5発話 > 6こころ
  function deriveConstraints(name, entry){
    entry = entry || {};
    var karada = String(entry.karada || '');
    var kizu   = String(entry.kizu   || '');
    var kokoro = String(entry.kokoro || '');
    var bodyClauses = keepClauses(karada + '。' + kizu);          // 物理系(からだ+傷)
    var mindText    = keepClauses(kokoro + '。' + karada).join('。'); // こころ系
    var cons = [], seen = {};
    function add(rank, text){ if (seen[text]) return; seen[text] = 1; cons.push({ rank: rank, text: text }); }

    bodyClauses.forEach(function(cl){
      // ---- A: 腕/手 → 不能=使用不可 / 裂傷=細かい作業が乱れる(G-1/G-2 部位ローカル) ----
      scanPart(cl, ARM_RE, function(part, ctx){
        if (DISABLE.test(ctx)) add(1, part + '使用不可');
        else if (WOUND.test(ctx) && !LIGHT.test(ctx)) add(1.5, part + 'の細かい作業が乱れる');
      });
      // ---- B: 脚/足/膝 → 明示不能=走行不可 / 裂傷=移動が鈍い ----
      if (/(立てな|歩けな|荷重(が|に|)(かけ|できな|耐え))/.test(cl)){
        add(2, '走行不可・移動は支え必要');
      }
      scanPart(cl, LEG_RE, function(part, ctx){
        if (DISABLE.test(ctx) || /(折れ|骨折|潰れ|切断|貫通)/.test(ctx)) add(2, '走行不可・移動は支え必要');
        else if (WOUND.test(ctx) && !LIGHT.test(ctx)) add(2.5, '移動が鈍い');
      });
      // ---- C: 出血(継続/重症) → 長い行動で意識が揺らぐ(部位非依存・節内でOK) ----
      if (/(大量|多量|止まらな)[^。]{0,6}出血|出血[^。]{0,8}(止まらな|止まって(い|)ない|続い|続く|ひど|激し)|血だまり|失血|大量出血/.test(cl)){
        add(3, '長い行動で意識が揺らぐ');
      }
      // ---- D: 視覚 → 距離感・精密動作の低下 ----
      if (/(目|眼|視界)[^。]{0,8}(失|見えな|潰|塞が|血で|かすん|ぼやけ|霞ん)/.test(cl)){
        add(4, '距離感・精密動作の低下');
      }
      // ---- E: 発話(喉/首/肺/胸の重損) → 長い台詞不可。手首/足首の「首」は除外 ----
      var hasNeck = /(喉|肺|胸)/.test(cl) || /(?:^|[^手足])首/.test(cl);
      if (hasNeck && /(潰|貫|裂傷|絞ま|塞が)/.test(cl) && !/(小さ|浅)/.test(cl)){
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
    lastText: function(){ return _lastText; },
    _isRecovery: function(s){ try { return isRecoveryClause(s); } catch(e){ return false; } },
    _keepClauses: function(t){ try { return keepClauses(t); } catch(e){ return []; } }
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
