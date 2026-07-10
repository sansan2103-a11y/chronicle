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
// 検証口: window.__v292Dfix414x = { derive(name), preview(), status() }。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix414) return; window.__v292Dfix414 = true;
  var TAG = '[v292Dfix414:constraint-engine]';

  function on(){ try { return localStorage.getItem('v292Dfix414On') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix414Off') === '1'; } catch(e){ return false; } }
  function store(){ try { return window.__v292Dfix77Store || {}; } catch(e){ return {}; } }

  // ---- F-1: 導出器 deriveConstraints(name, stateEntry) ----------------
  //   入力: fix77 store の {karada, kokoro, kizu}。
  //   回復・否定文脈の誤検出防止: 文単位(。/改行区切り)で、回復語を含む文を対象から除外。
  var RECOVER = /(治り|治った|回復|止まった|引いた|塞がった)/;
  function cleanText(text){
    // 回復・治癒の書かれた文をマッチ対象から落とす。文境界は '。' 復元して [^。] 制約を保つ。
    return String(text || '').split(/[。\n]/).filter(function(s){
      return s && !RECOVER.test(s);
    }).join('。');
  }
  // rank(小さいほど重い): 1部位不能 > 2移動 > 3出血 > 4視覚 > 5発話 > 6こころ
  function deriveConstraints(name, entry){
    entry = entry || {};
    var karada = String(entry.karada || '');
    var kizu   = String(entry.kizu   || '');
    var kokoro = String(entry.kokoro || '');
    var body = cleanText(karada + '。' + kizu);        // 物理系(からだ+傷)
    var mind = cleanText(kokoro + '。' + karada);       // こころ系(こころ+からだの硬直/凍りつ)
    var cons = [];
    // 1. 部位不能 → 「<部位>使用不可」
    var m1 = body.match(/(左|右)(腕|手|脚|足|目|眼)[^。]{0,10}(動かな|使えな|ほぼ動か|上がらな|力が入らな|折れ|潰れ|裂傷|貫通|骨.{0,3}露出|失)/);
    if (m1) cons.push({ rank: 1, text: m1[1] + m1[2] + '使用不可' });
    // 2. 移動 → 「走行不可・移動は支え必要」
    if (/(脚|足|膝)[^。]{0,10}(折れ|裂|貫通|動かな|力が入らな)|立てな|歩けな/.test(body)) cons.push({ rank: 2, text: '走行不可・移動は支え必要' });
    // 3. 出血重症 → 「長い行動で意識が揺らぐ」
    if (/(大量|止まらな)[^。]{0,4}出血|血だまり|失血/.test(body)) cons.push({ rank: 3, text: '長い行動で意識が揺らぐ' });
    // 4. 視覚 → 「距離感・精密動作の低下」
    if (/(目|眼|視界)[^。]{0,8}(失|見えな|潰|塞が|血で)/.test(body)) cons.push({ rank: 4, text: '距離感・精密動作の低下' });
    // 5. 発話 → 「長い台詞不可(短い発話のみ)」
    if (/(喉|首|肺|胸)[^。]{0,8}(潰|貫|裂|絞ま)|呼吸が浅/.test(body)) cons.push({ rank: 5, text: '長い台詞不可(短い発話のみ)' });
    // 6. こころ由来 → 「即応・機転は出ない(型B/C)」
    if (/(解離|現実感が(薄|な)|頭が真っ白|凍りつ|固ま)/.test(mind)) cons.push({ rank: 6, text: '即応・機転は出ない(型B/C)' });
    // 3件超は重い順(rank昇順)に3件まで。
    cons.sort(function(a, b){ return a.rank - b.rank; });
    return cons.slice(0, 3);
  }

  // ---- F-2: 注入文の合成 ----------------------------------------------
  //   禁止語彙(ポリヴェーガル/dorsal-vagal/心拍閾値/モルヒネ/fawn/注意狭窄の断定)は使わない。
  //   A/B/Cは「型の例」としてのみ提示(強制しない=キャラ差はモデル/fix297に委ねる)。
  var HEADER =
    '\n\n【制約】負傷・打撃を受けた者の行動には必ずコストを描く。静かな反応でもよいが、' +
    '無償の冷静さ・全能力維持は禁止(例: 痛みを抑え込む→注意が狭まり細かい作業が乱れる/' +
    '感情が平板になる→鋭い機転は出ない/身がすくむ→発話・動作が短く途切れる)。\n現在の制約: ';

  function collectAll(){
    var st = store(), out = [];
    Object.keys(st).forEach(function(name){
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
  function buildBlock(){
    try {
      var all = collectAll();
      if (!all.length) return '';
      var block = HEADER + fmt(all);
      // E節: 【制約】ブロックは最大300字。超過時は重傷度の高い2名までに切詰め。
      if (block.length > 300) block = HEADER + fmt(all.slice(0, 2));
      return block;
    } catch(e){ return ''; }
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
    status: function(){ return { on: on(), off: off(), names: Object.keys(store()) }; }
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
