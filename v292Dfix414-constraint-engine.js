// =====================================================================
// Chronicle TRPG - v292Dfix414: 身体・心理制約エンジン(重傷・解離・凍結の現実的コスト)
// ---------------------------------------------------------------------
// 設計書=設計書_fix414_身体心理制約エンジン_2026-07-10.md (Fable5)。案2採用=
//   fix333のcompileActorStates相当の導出をfix414内に流用拡張し、キャラ別の【制約】行を
//   keeper(fix379c __f379reg・prio2)で毎ターン注入する。<state>スキーマ・EMITは不変。
//   毎ターン store から導出し直すステートレス設計(蓄積・重複保存なし・新LSキーなし)。
// 責務: fix77=瞬間状態 / fix190=永続状態 / fix297=反応モード焼込 を維持し、fix414は
//   「導出と注入」のみ。fix333/77/297のファイル・関数は不触。Planner._extensionsは使わない。
// 既定ON(fix428/2026-07-12でON化)。全体OFF=v292Dfix414Off='1'。旧キv292Dfix414Onは不要(残存しても無害)。
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

  // ★fix428(2026-07-12): 【既定ON化】(おしん承認)。fix426がfix417にしたのと同じ手口。
  //   旧: v292Dfix414On==='1' のときだけ有効(既定OFFプレビュー)。
  //   新: 既定ON。v292Dfix414Off==='1' で従来(注入なし)へ復帰。
  //   ※毎ターン textFn から呼ばれる=live評価(fix425 #5の教訓: 読込時に1回だけ評価しない)。
  //   ※旧キー v292Dfix414On が localStorage に残っていても無害(冗長なだけ)。
  function on(){ return !off(); }   // 既定ON・Off優先・毎回評価
  function off(){ try { return localStorage.getItem('v292Dfix414Off') === '1'; } catch(e){ return false; } }
  // ★NPCQ1-C2 OWNER CANARY: 拡張は「この画面のアカウントが owner かつ active」の時だけ。/auth/me の答え(fix893 serverMe)だけを信じ、毎回評価。
  //   未応答・ログアウト・匿名・beta・none・suspended・API不在・例外 = false(= 従来の挙動と完全に同じ)。v292DfixISO1 ownerNow / v292DfixRC1 ownerGate と同じ読み口。
  function npcqOwner(){ try { var A = window.__v292Dfix893; if(!A || typeof A.serverMe !== 'function') return false; var m = A.serverMe(); if(!(m && m.entitlement === 'owner' && m.status === 'active')) return false; var P = window.__v292Dfix886; if(P && P.api && typeof P.api.active === 'function' && P.api.active()) return false; return true; } catch(e){ return false; } }
  function widenOff(){ try { if(!npcqOwner()) return true; return localStorage.getItem('v292Dfix414WidenOff') === '1'; } catch(e){ return true; } }
  function store(){ try { return window.__v292Dfix77Store || {}; } catch(e){ return {}; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ---- 状態語彙(部位ローカル文脈で判定・/g無しで再利用可) --------------
  var DISABLE = /(動かな|使えな|ほぼ動か|上がらな|力が入らな|折れ|骨折|潰れ|貫通|骨.{0,3}露出|切断|失(く|っ|わ))/;
  var WOUND   = /(裂傷|深い傷|刺さ|刺され|えぐ|抉|裂け|えぐれ|大きな傷)/;
  var LIGHT   = /(浅|掠り|かすり|小さな|軽い擦|擦り傷|軽い傷|軽傷|かすり傷)/;
  /* ★FRZ1（laneFLOW2・2026-11-11・kill: localStorage v292DfixFRZ1Off='1' で従来と同じ。v292Dfix414Off='1' は fix414 全体を止める）:
     恐怖で「足が床に縫い付いたように動かない」等を DISABLE(/動かな/)＋足 で脚の負傷と読み、
     「走行不可・移動は支え必要」を出していた（laneFLOW1 実測 A T3・B2 T5。主人公の救出行動まで縛った）。
       ・脚の「走行不可」は、脚の近くにけがの語（骨折・捻挫・ひねった・腫れ・撃たれ 等）があるか、傷の欄に脚の傷があるときだけ。
         捻挫・ひねった・腫れ・脱臼・撃たれ は「動かない」が無くても走行不可（軽く・少し等なら「移動が鈍い」）。
       ・けがの無い「動かない」は、すくみ・硬直・縫い付く等の恐怖の語があれば「即応・機転は出ない」（既存 rank6）へ。無ければ何も付けない。
       ・「立てない・歩けない」も同じ扱い（腰が抜けて立てない＝恐怖）。
       ・人違い: 「ユイはサキの足首を…」のように、部位の直前が別の人物の「Xの」なら、その部位はこの人のものではない → 数えない。 */
  function offFRZ1(){ try { return localStorage.getItem('v292DfixFRZ1Off') === '1'; } catch(e){ return false; } }
  var INJ_FRZ1    = /(骨折|折れ|潰れ|切断|貫通|捻挫|捻っ|捻り|ひねっ|ひねり|挫い|くじい|くじけ|腫れ|腫ら|脱臼|撃たれ|撃ち抜|刺さ|刺され|裂傷|裂け|えぐ|抉|噛ま|咬ま|噛みつかれ|噛み付かれ|食いちぎ|火傷|打撲|出血|流血|血を流|血が(滲|にじ|流|溢|噴|垂)|負傷|怪我|けが|傷)/;
  var SPRAIN_FRZ1 = /(捻挫|捻っ|捻り|ひねっ|ひねり|挫い|挫き|くじい|くじき|腫れ|腫ら|脱臼|撃たれ|撃ち抜)/;
  var PHYS_FRZ1   = /(朦朧|もうろう|意識が|失血|衰弱|麻痺|痺れ|しびれ|毒)/;
  var MILD_FRZ1   = /(軽く|少し|わずか|ちょっと|かるく)/;
  var FREEZE_FRZ1 = /(縫い付|縫いつ|硬直|こわば|強張|すく|竦|固ま|凍りつ|凍り付|張り付|貼り付|根が生え|震え|がくがく|ガクガク|笑って|力が抜け|腰が抜け|へたり|恐怖|怯え|おびえ)/;
  function otherOwnerFRZ1(clause, idx, self){   /* 部位の直前（10 字以内・助詞を挟まない）が「別の人物の名＋の」か */
    try {
      var head = String(clause).slice(Math.max(0, idx - 12), idx);
      var names = castNames().concat(Object.keys(store())), best = -1, who = null;
      for (var i = 0; i < names.length; i++){
        var x = String(names[i] || ''); if (!x) continue;
        var p = head.lastIndexOf(x + 'の'); if (p < 0 || head.length - (p + x.length + 1) > 10) continue;
        if (/[でにをへ]/.test(head.slice(p + x.length + 1))) continue;   /* 「ユイの隣で右足首を…」の「ユイの」は持ち主ではない */
        if (p > best || (p === best && x === self)){ best = p; who = x; }   /* いちばん近い「Xの」の X */
      }
      return !!who && who !== self;
    } catch(e){}
    return false;
  }

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
      cb(part, ctx, m.index);   /* ★FRZ1: 3 番目に位置（従来の cb は無視＝挙動同じ） */
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
    var frz = !offFRZ1();   /* ★FRZ1 */
    var kizuLeg = frz && keepClauses(kizu).some(function(c){ return new RegExp(LEG_RE).test(c) && !LIGHT.test(c); });
    function physFRZ1(t){ return INJ_FRZ1.test(t) || PHYS_FRZ1.test(t); }

    bodyClauses.forEach(function(cl){
      // ---- A: 腕/手 → 不能=使用不可 / 裂傷=細かい作業が乱れる(G-1/G-2 部位ローカル) ----
      scanPart(cl, ARM_RE, function(part, ctx, at){
        if (frz && otherOwnerFRZ1(cl, at, name)) return;   /* ★FRZ1: 「Xの腕」は X のもの */
        if (DISABLE.test(ctx)) add(1, part + '使用不可');
        else if (WOUND.test(ctx) && !LIGHT.test(ctx)) add(1.5, part + 'の細かい作業が乱れる');
      });
      // ---- B: 脚/足/膝 → 明示不能=走行不可 / 裂傷=移動が鈍い ----
      if (/(立てな|歩けな|荷重(が|に|)(かけ|できな|耐え))/.test(cl)){
        if (!frz || physFRZ1(cl) || kizuLeg || /荷重/.test(cl)) add(2, '走行不可・移動は支え必要');
        else if (FREEZE_FRZ1.test(cl)) add(6, '即応・機転は出ない(型B/C)');   /* ★FRZ1: 腰が抜けて立てない＝恐怖 */
      }
      scanPart(cl, LEG_RE, function(part, ctx, at){
        if (frz){   /* ★FRZ1: 走行不可はけががあるときだけ */
          if (otherOwnerFRZ1(cl, at, name)) return;
          var hard = /(折れ|骨折|潰れ|切断|貫通)/.test(ctx), spr = SPRAIN_FRZ1.test(ctx);
          if (hard || (spr && !MILD_FRZ1.test(ctx)) || (DISABLE.test(ctx) && (physFRZ1(ctx) || kizuLeg))) add(2, '走行不可・移動は支え必要');
          else if ((WOUND.test(ctx) && !LIGHT.test(ctx)) || spr) add(2.5, '移動が鈍い');
          else if (DISABLE.test(ctx) && FREEZE_FRZ1.test(cl)) add(6, '即応・機転は出ない(型B/C)');
          return;
        }
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
    // ---- NPCQ1(fix414 widen・既定ON・v292Dfix414WidenOff='1'で従来): 部位不明の重傷/強い恐怖 ----
    //   重傷(重傷・深手・深い傷・骨折・出血・意識朦朧 等)→ 動作1行+発話1行まで(短い発話のみ・鋭い戦術判断なし)。
    //   強い恐怖(恐怖・怯え・パニック 等)→ 1行。既存の3件/人・ブロック上限は不変。
    if (!widenOff()){
      var serious = bodyClauses.some(function(cl){
        return /(重傷|重体|致命|瀕死|深手|深い傷|深く(刺|切|斬|えぐ|抉|裂)|骨折|出血|意識[がは]?(朦朧|もうろう|遠の|混濁|薄)|朦朧|もうろう)/.test(cl) &&
               !LIGHT.test(cl) && !/(少量|わずか|微量|滲|にじ)/.test(cl) &&
               !/(治|癒|完治|回復|止ま|塞が|(て|で)(い)?ない|なかった|無い)/.test(cl.replace(/止まらな(い|く)/g, ''));
      });
      if (serious){
        add(3.5, '動きは小さく遅い(激しい連続行動は不可)');
        add(5, '長い台詞不可(短い発話のみ)');
      }
      var fearTxt = mindText.replace(/(恐怖|怯え|おびえ|パニック|恐慌)(は|が|も|を|て(い)?|で(は)?)?(ない|なく|消え|薄れ|和らい|収ま|克服)/g, '');
      if (/(恐怖|怯え|おびえ|パニック|恐慌|竦ん|すくん|泣きじゃく)/.test(fearTxt)){
        add(6, '即応・機転は出ない(型B/C)');
      }
    }
    // ★R118 Phase2-S: severity consequence lane hook（外部 fix741。未load時 no-op / flag 既定OFF）
    try{ if(window.__v292Dfix414S) window.__v292Dfix414S(bodyClauses, add); }catch(e){}
    // ★R118 Phase3-A: existing physical signal bridge hook（外部 fix742。未load時 no-op / flag 既定OFF）
    try{ if(window.__v292Dfix414P) window.__v292Dfix414P(name, cons, add); }catch(e){}
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
  //   fix428: 既定ON。v292Dfix414Off==='1' のときだけ '' を返す。
  function textFn(){
    try {
      if (off()) return '';
      if (!on()) return '';   // fix428: 既定ON(on()=!off())。従来の二重ガードはそのまま残す
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
    deriveFor: function(name, entry){ try { return deriveConstraints(name, entry); } catch(e){ return []; } },   // NPCQ1: fix192 が表示エントリで判定する口
    derive: function(name){ try { return deriveConstraints(name, store()[name]); } catch(e){ return []; } },
    preview: function(){ return buildBlock(); },
    status: function(){ return { on: on(), off: off(), names: Object.keys(store()) }; },
    lastText: function(){ return _lastText; },
    _isRecovery: function(s){ try { return isRecoveryClause(s); } catch(e){ return false; } },
    _keepClauses: function(t){ try { return keepClauses(t); } catch(e){ return []; } }
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
