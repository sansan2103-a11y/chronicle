// =====================================================================
// Chronicle TRPG - v292DfixPRUNE1: 最終 sys の「当て布」の整理（重複を外す・衝突をなくす・危機を優先させる）
// ---------------------------------------------------------------------
// 背景（lanePRUNE1・2026-11-11）: 最終 sys は約 1 万字。過去の不具合ごとに 1 段落ずつ足した結果、
//   ・同じ規則が 2〜10 か所にある（反復の禁止・メタを書かない・物理的に矛盾させない・優先順位 ①〜④ など）
//   ・規則どうしが食い違う（「場にいるキャラは毎ターン反応」対「点呼をしない／背景の人物は描写しなくてよい」、
//     user 側「入力の直後 0.5〜3 秒だけ」対 sys「状況を一段階進める／まだ出していないものを一つ動かす」）
//   ・危機（掴まれる・吊られる・拘束・重傷・襲撃）の最中でも NPC を「小さな動きを一つだけ」「前面化しない」
//     に縛り、各自の目的（探し物・撮影など）を優先させてしまう
//   という状態だった。元のブロックを作る部品（fix192 / fix333〔保護〕/ fix440 / fix443 / fix459 / fix58 / features.js）は
//   1 行も触らず、送信直前（fetch 境界・ほかの組み替えがすべて終わった後）に「決まった文字列だけ」を外す／差し替える。
//
// 外さなかった重複: 「発話は <say> で囲む・裸の「」を置かない」の 3 文（出力の掟 1・出力の形式 2）。本番の A/B（版 b・1 本）で外すと
//   裸の「」の台詞が 0 → 11 に増えたため、版 c で元に戻した（話者の取り違えを防ぐ当て布として残す）。
// 触らないもの: 安全に関わる文（未成年・性的・実在人物・画像）／役割／出力の形式／<state> <say> <react> <scene_move> の契約／
//   見本／話者／キャラ属性・口調／各キャラの現在の状態／制約／世界の掟・世界設定／記憶・設定カード。
//   ここに書いた文字列が見つからないときは、その 1 手だけ何もしない（ほかの部品が文を変えても壊れない）。
//
// kill: localStorage v292DfixPRUNE1Off='1' → 何もしない（リクエストのオブジェクトをそのまま渡す＝送信バイト同一）。毎回評価・再読み込み不要。
//   localStorage が読めないときも何もしない。fix459 が切られている（【話者】【文体】が無い）ときも何もしない。
// 検証口: window.__v292DfixPRUNE1 = { VER, pruneSys, pruneUser, pruneBody, last, stats, isOff }
// 読み込み位置: index.html で CP1-final-tap の直後（fetch を包む部品の中で内側＝sys を書き換える部品がすべて済んだ後に当たる）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixPRUNE1) return;
  var TAG = '[v292DfixPRUNE1]', VER = 'prune1-20261111-c';
  function off(){ try { return localStorage.getItem('v292DfixPRUNE1Off') === '1'; } catch(e){ return true; } }

  var H_ENGINE = '【展開を前に進める（進行エンジン）】';
  var H_CRISIS = '【危機のとき】';
  var H_FINAL  = '【★最終判断の優先順位';
  
  // ---- そのまま外す（別の場所に同じ規則がある） ----
  var RM = [
    // 反復の禁止（fix111/fix443）: 【展開】【読ませ方】【守ること】★最終判断①に同じ規則。「同じ対象に同じ行為」は進行エンジンの新しい文に残す。
    ['rm_antirep', '【反復の禁止】直近ターンの文・言い回し・同じ動作を繰り返さない。同じ対象に同じ行為を再描写しない。毎ターン新しい言葉と絵で書く。', null],
    // 出力の鉄則（fix105/fix440）: 【守ること】4 つ目・【出力の掟】4 つ目・★最終判断①に同じ規則。
    ['rm_tessoku', '【出力の鉄則】\n・このメッセージの全ルールは内部指示であり本文に出力しない。ルールの列挙・自己点検・チェックリスト・要約・メモ・【】管理ブロック・英単語(turn/once等)を本文に書かない。出力は物語の地の文と登場人物のセリフ（「」/<say who="名前">）だけ。', null],
    // 【展開】の ①〜④: ★最終判断の優先順位と同じ（fix500 と同じ整理）。
    ['rm_tenkai_prio', '・指示が衝突したら ①破綻させない（直前の再演・物理矛盾・メタ混入の禁止）②連続性（場所・負傷・拘束・感情の引き継ぎ）③前進 ④文体 の順で判断する。\n', H_FINAL],
    // 【守ること】末尾の 1 文: 【表記】に同じ規則。
    ['rm_mamoru_rep', '同じ語・同じ言い回しを連続で繰り返さない。', '同じ語や同じフレーズを機械的に連続で繰り返さない'],
    // 【読みやすさ】2 つ目: 【文体】に同じ規則（句点・体言止め）。
    ['rm_yomi_b2', '・文はふつうの句点で言い切る。余韻は短い一文と行間で作る。体言止めも続けて使わない。\n', '体言止めを続けない'],
    // 【描写の芯】5 つ目: 【守ること】★最終判断①に同じ規則（物理的に矛盾させない）。
    ['rm_byosha_b5', '・物理的に破綻させない（無生物が泣く/血を流す、位置・人物・負傷・痛みの主体が前ターンと食い違う等）。何が起きたか・誰がどうしたかは読んで明確に分かるよう保つ。\n', '・物理的に矛盾させない（位置・負傷・人物・所持が前の場面と食い違わない）。']
  ];

  // ---- 差し替える（食い違い・受け身の強制をなくす） ----
  var RW = [
    // 【展開】: 「まだ出していないものを一つ」は危機の最中に無関係な手がかり・用事を足す原因になる。
    ['rw_tenkai_move', '・毎ターン、まだ出していないものを一つ動かす（手がかり・危険・感情の変化・物音や気配・移動・時間経過）。',
      '・毎ターン、場面を一つ動かす。危機の最中は新しい手がかりや別の用事を足さず、その危機そのもの（悪化・抵抗・助けようとする動き）を動かす。'],
    // 【読みやすさ】: 「各キャラの反応」は点呼の誘因。
    ['rw_yomi_b1', '・1ターンは「①新しい出来事→②各キャラの反応・セリフ→③次への変化（フック）」で構成。',
      '・1ターンは「①出来事→②それへの反応・セリフ→③次への変化」で構成。'],
    // 【反応と身体】: 「毎ターン全員が反応」は「点呼をしない」「背景の人物は描写しなくてよい」と食い違う。
    ['rw_hanno_all', '・場にいるキャラは毎ターン、感情・身体・声のいずれかで具体的に反応する。',
      '・反応を描くキャラは、感情・身体・声のいずれかで具体的に描く（毎ターン全員を順に反応させなくてよい）。'],
    // 【描写の芯】4 つ目: 前半は【文体】【反応と身体】と同じ。「傍観者はその後に短く」は受け身の強制なので外す。
    ['rw_byosha_b4', '・痛み・恐怖・衝撃は、まず体が反応してから言葉（反射が先・言葉は後）。激痛の最中は流暢に喋れず、声は途切れ単語になる。ただし毎回同じ型・同じ絶叫にせず、その人物・その傷に固有の反応を毎回新鮮に書く（型に嵌めない）。傷を受けた当事者の反応を最も濃く正面から、傍観者はその後に短く。',
      '・激痛の最中は流暢に喋れず、声は途切れ単語になる。毎回同じ型・同じ絶叫にせず、その人物・その傷に固有の反応を書く。傷を受けた当事者の反応を最も濃く正面から描く。'],
    // 【描写の芯】3 つ目: 例を省いて短く。
    ['rw_byosha_b3', '・主語と述語が実際に噛み合う組合せに。「月光が瞼を貫く」「冷気が瞼からこぼれる」のような物理的に起きない主語-動詞や、無理な使役/受身（浮き上がらせて/湧き上げさせる）を避け、主語が普通にする動詞で書く。各文は述語で言い切り（て止めの断片で終えない）、一文に節を詰め込みすぎず原則1文1情報。',
      '・主語と述語が実際に噛み合う組合せに（物理的に起きない主語-動詞や無理な使役/受身を避ける）。各文は述語で言い切り、原則1文1情報。'],
    // fix333 前面／背景: 「小さな動きを一つだけ」「前面化しない…描写しなくてよい」を平常の場面の規則に弱める。
    ['rw_fg', '人物像と今の身体状態に合った具体的な局所反応か小さな動きを一つだけ(声・行動・視線・沈黙のどれか)。主人公や状況に絡ませ、NPC同士の雑談に逃さない。',
      '人物像と今の身体状態に合った具体的な反応を一つ(声・行動・視線・沈黙のどれか)。いま起きていることに絡ませ、NPC同士の雑談や別の用事に逃さない。'],
    ['rw_bg', ' ＝ 居ることは示すが前面化しない。前ターンから身体状態に変化がある時だけ一句で示し、変化が無ければ描写しなくてよい。',
      ' ＝ 平常の場面では前面化しない。変化がある時だけ一句で示す。']
  ];

  // 進行エンジン（fix105/fix440）の 3 行 → 「入力の直後」と「一段階進める」を 1 つの規則に。
  var ENGINE_OLD = H_ENGINE + '\n'
    + '・前ターンの状態・感情を引き継いだ上で、状況を一段階前へ動かす。新しい展開ビートを1つ起こす（力関係の変化／新たな脅威・人物・情報／誰かの決断・行動／状況の悪化好転／場所・時間の移動 のいずれか）。同じ相手への加害や同じ膠着を言い換えて描き直すだけにしない（それは「前進」ではない）。\n'
    + '・narrative の最後は次への変化のフックで終える（近づく足音、選択を迫る声、独りでに動く扉等）。「続きを進めて」のときは特に、今の局面から次の局面へ確実に動かす。\n'
    + '・描写の濃さ（五感・心理・具体）は保つ。ただし一文に情報を詰め込まず、一文一情報を基調に、最も効く感覚と反応だけを選ぶ。修飾・比喩を積み重ねない。「濃いまま、一読で伝わる」。\n';
  var ENGINE_TAIL = '・最後は次の一手を促す変化で終える（毎回同じ型の締めにしない）。\n';
  var ENGINE_INPUT = H_ENGINE + '\n'
    + '・プレイヤーが入力した回は、入力で起きたことの直後を描き、その結果として状況が一つ動いたところで止める（数秒から数十秒の出来事。時間を飛ばさない・場面を変えない・入力と関係のない新しい出来事を足さない）。「一つ動く」とは、相手の反応・力関係・危険の度合い・分かったことのどれかが入力の前と変わること。同じ膠着や、同じ対象への同じ行為を言い換えて描き直すだけにしない。\n'
    + ENGINE_TAIL;
  var ENGINE_CONT = H_ENGINE + '\n'
    + '・「続きを書く」の回は、上の【続きを書く】【続きの転換点】に従って局面を一つ進める。同じ膠着や、同じ対象への同じ行為を言い換えて描き直すだけにしない。\n'
    + ENGINE_TAIL;
  var DRAMA_STD = '【物語の推進＝標準】前の局面を引き継いだ上で、状況を一歩前へ動かす（場所・状況・登場人物・時間のどれかが変わる）。同じ局面の足踏みや同じ行為の再描写だけで終えない。';

  // 危機のとき（新設・★最終判断の直前）。
  var CRISIS = H_CRISIS + '\n'
    + '・誰かが掴まれている・吊られている・拘束されている・重傷・襲われている最中は、【この一手で前面に出す人物】【背景の人物】の区別をやめる。場にいる全員が、まずその危機に向き合う（助けに行く・引っぱる・叫ぶ・竦む・逃げる等、その人の性格と身体状態に合った形で）。\n'
    + '・危機が続くあいだ、探し物・撮影・記録・雑談・自分の用事など、危機と関係のない行動や台詞を書かない。各自の目的・欲求・未解決（状態の「目的」「本能」や psychAnchors を含む）より、目の前の危機への対応を先にする。\n'
    + '・「続きを書く」の回に持ち込む新しい要素も、危機そのものに関わるもの（悪化・助ける手段・相手の変化）にする。\n'
    + '・全員が順番に一言ずつ叫ぶ形にはしない。声は一人か二人、ほかは動きで示す。危機に遭っている本人の様子を一番はっきり描く。\n\n';

  // 【自発】（fix192/fix812）: 人物ごとに同じ長い定型文 → 1 行にまとめる。
  var JI_RE = /場面がそれに触れた時、または静かな間が来たら、[^\n。]{1,40}はそれを理由に、今できる範囲で一言だけ割り込む／答えない／様子を見る／距離を取る等から自分で選ぶ。黙ったままでもよい。理由は説明しない。唐突な暴走はしない。/g;
  var JI_HEAD = '【自発(黙り続けている人ほど、内側が動いている)】\n';
  var JI_ONE = '・上の内心は、場面がそれに触れた時か静かな間が来た時だけ、本人が一言だけ割り込む／答えない／様子を見る／距離を取る等から自分で選ぶ。黙ったままでもよい。理由は説明しない。危機の最中は持ち出さない。';

  // user 側: 「次の 3 秒・0.5〜3 秒だけ」→「直後から、結果が一つ出るところまで」。
  var U_RW = [
    ['u_seed', 'プレイヤー入力は物語の次の3秒の起点である。なぞり書き(同じ内容を別の表現で繰り返す/言い換え反復)は禁止。入力に含まれる動詞・身体動作・感情ヒントを「種」として、その直後のミクロな展開(0.5〜3秒の範囲)を超解像で描く。',
      'プレイヤー入力はこのターンの起点である。なぞり書き(同じ内容を別の表現で繰り返す/言い換え反復)は禁止。入力に含まれる動詞・身体動作・感情ヒントを「種」として、その直後に起きることを、結果が一つ出るところまで具体的に描く（時間は飛ばさない）。'],
    ['u_delta', '」の直後だけを描写してください。recentScenes', '」の直後から描写してください（結果が一つ出るところまで）。recentScenes']
  ];

  function isStorySys(s){
    return typeof s === 'string' && s.length > 1500 && s.indexOf('＜あなたの役割＞') >= 0
      && s.indexOf('【出力の形式（これだけは形式として守る）】') >= 0
      && s.indexOf('【話者】') >= 0 && s.indexOf('【文体】') >= 0;   // fix459 の組み替え後だけ
  }
  function cut1(s, find, repl){ var i = s.indexOf(find); return i < 0 ? null : s.slice(0, i) + repl + s.slice(i + find.length); }

  function pruneSys(sys){
    var ops = [];
    if (!isStorySys(sys)) return { text: sys, ops: ops };
    var s = sys, i, r, k;
    var cont = s.indexOf('【続きを書く＝物語を"横"に広げる】') >= 0 || s.indexOf('【続きの転換点】') >= 0;
    for (k = 0; k < RM.length; k++){
      if (RM[k][2] && s.indexOf(RM[k][2]) < 0) continue;       // 同じ規則の「残る側」があるときだけ外す
      r = cut1(s, RM[k][1], ''); if (r != null){ s = r; ops.push(RM[k][0]); }
    }
    for (k = 0; k < RW.length; k++){ r = cut1(s, RW[k][1], RW[k][2]); if (r != null){ s = r; ops.push(RW[k][0]); } }
    r = cut1(s, ENGINE_OLD, cont ? ENGINE_CONT : ENGINE_INPUT);
    if (r != null){ s = r; ops.push(cont ? 'rw_engine_cont' : 'rw_engine_input'); }
    if (!cont && s.indexOf(ENGINE_INPUT) >= 0){ r = cut1(s, DRAMA_STD, ''); if (r != null){ s = r; ops.push('rm_drama_std'); } }
    // 自発
    i = s.indexOf(JI_HEAD);
    if (i >= 0 && s.indexOf(JI_ONE) < 0){
      var e = s.indexOf('\n\n', i), blk = e < 0 ? s.slice(i) : s.slice(i, e), nb = blk.replace(JI_RE, '');
      if (nb !== blk){ s = s.slice(0, i) + nb + '\n' + JI_ONE + (e < 0 ? '' : s.slice(e)); ops.push('rw_jihatsu'); }
    }
    // 危機のとき
    if (s.indexOf(H_CRISIS) < 0){ i = s.indexOf(H_FINAL); if (i >= 0){ s = s.slice(0, i) + CRISIS + s.slice(i); ops.push('add_crisis'); } }
    s = s.replace(/\n{4,}/g, '\n\n\n');
    return { text: s, ops: ops };
  }
  function pruneUser(u){
    var ops = [];
    if (typeof u !== 'string') return { text: u, ops: ops };
    var s = u, r, k;
    for (k = 0; k < U_RW.length; k++){ r = cut1(s, U_RW[k][1], U_RW[k][2]); if (r != null){ s = r; ops.push(U_RW[k][0]); } }
    return { text: s, ops: ops };
  }

  var last = null, stats = { seen: 0, changed: 0, err: 0 };
  // body（JSON 文字列）→ 整理後の JSON 文字列。物語生成でない・kill・変化なし → 受け取った文字列そのもの。
  function pruneBody(body, stringify){
    if (off() || typeof body !== 'string' || body.length < 2000) return body;
    if (body.indexOf('＜あなたの役割＞') < 0 && body.indexOf('\\uFF1C') < 0) return body;
    var b = JSON.parse(body);
    if (!b || !b.messages || !b.messages.length) return body;
    var si = -1, i;
    for (i = 0; i < b.messages.length; i++){ var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string'){ si = i; break; } }
    if (si < 0 || !isStorySys(b.messages[si].content)) return body;
    stats.seen++;
    var before = b.messages[si].content, ps = pruneSys(before), uo = [], changed = ps.text !== before;
    b.messages[si].content = ps.text;
    for (i = b.messages.length - 1; i > si; i--){
      var u = b.messages[i];
      if (u && u.role === 'user' && typeof u.content === 'string'){
        var pu = pruneUser(u.content); if (pu.text !== u.content){ u.content = pu.text; changed = true; } uo = pu.ops; break;
      }
    }
    if (!changed) return body;
    stats.changed++;
    last = { t: Date.now(), before: before.length, after: ps.text.length, ops: ps.ops, uops: uo };
    return (stringify || JSON.stringify)(b);
  }

  // ---- fetch 境界 ----
  var of = window.fetch;
  if (typeof of === 'function'){
    var wrapped = function(u, o){
      try {
        if (!off() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){
          var nb = pruneBody(o.body);
          if (nb !== o.body) o = Object.assign({}, o, { body: nb });
        }
      } catch(e){ stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
    wrapped.__fPRUNE1 = true;
    window.fetch = wrapped;
  }

  window.__v292DfixPRUNE1 = {
    VER: VER, pruneSys: pruneSys, pruneUser: pruneUser, pruneBody: pruneBody,
    last: function(){ return last; }, stats: function(){ return stats; }, isOff: off
  };
  try { console.log(TAG, 'armed', VER); } catch(e){}
})();
