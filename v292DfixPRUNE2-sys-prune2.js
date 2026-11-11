// =====================================================================
// Chronicle TRPG - v292DfixPRUNE2: 最終 sys／user の整理・第 2 弾（話者の規則を 1 か所に・見本と種を絞る・user 側の指示を短く）
// ---------------------------------------------------------------------
// 背景（lanePRUNE2・2026-11-11）: PRUNE1（a085c42）は食い違いの解消が主で、字数は約 4% しか減らなかった。
//   棚卸し（lanePRUNE1 INVENTORY.md §10）で「さらに削れる候補」とした部分を、独立した 3 つのスイッチに分けて整理する。
//   元のブロックを作る部品（fix192 / fix306 / fix363 / fix379 / fix459 / fix512 / fix514 / features.js）は 1 行も触らず、
//   PRUNE1 と同じく送信直前（fetch 境界）で「決まった文字列だけ」を外す／差し替える。
//
// P2a 話者・書式（kill v292DfixPRUNE2aOff）: <say> の決まりが 4 ブロック（【出力の形式】2 項・【話者】・【出力の掟】・【話者タグの徹底】）に
//     重複していたのを、末尾の【話者タグの徹底（最優先）】1 か所にまとめる（箇条書き＋短い例 1 つ）。【出力の形式】には核の 1 文だけ残す。
//     解析が依存するもの（<say who="登録名">…</say>／who は完全な登録名／<react> の 声 は短い声だけ／<react> <state> は本文の後ろ／
//     特殊ラベル「不明な声」「群衆」／セリフでない「」は囲まない）はすべて残す。見出し 4 つは 1 字も変えない。
//     3 つの錨（【出力の形式】の 2 項・【出力の掟】の 1 項・fix514 のブロック）が全部そろったときだけ当てる（1 つでも無ければ P2a 全体が何もしない）。
// P2b 見本と種（kill v292DfixPRUNE2bOff）: 見本 A を外す（見本 B とミニ見本は残す）／【プレイヤーの種】【NPCの登場】を 1〜2 文に／
//     「自分自身を『先輩』と呼ばない」を呼称に依らない文へ（P2a が当たった回は P2a のブロックが同じ文を持つ）。
// P2c user 側（kill v292DfixPRUNE2cOff）: 末尾の【プレイヤー入力の逐語反映 — 厳守】を短く（逐語反映の保証は残す）／psychAnchors の注記から決まり文句の列挙を外す。
//
// kill: 上の 3 つ（個別）と v292DfixPRUNE2Off='1'（全部）。'1' のスイッチの手は 1 つも当てない。3 つとも止まっていれば
//   リクエストのオブジェクトをそのまま渡す（送信バイト同一）。毎回評価・再読み込み不要。localStorage が読めないときも何もしない。
//   fix459 が切られている（【話者】が無い）sys・物語生成でない送信にも何もしない。見つからない文は、その 1 手だけ何もしない。
// PRUNE1 との関係: 触る文字列は重ならない。PRUNE1→PRUNE2 でも PRUNE2→PRUNE1 でも結果は同じ（ユニットで確認）。2 回当てても変わらない。
// 検証口: window.__v292DfixPRUNE2 = { VER, pruneSys, pruneUser, pruneBody, last, stats, flags }
// 読み込み位置: index.html で CP1-final-tap の直後・PRUNE1 の直前（＝PRUNE1 の後・tap の前に当たる）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixPRUNE2) return;
  var TAG = '[v292DfixPRUNE2]', VER = 'prune2-20261111-a';
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return '!'; } }
  // { a, b, c } = そのスイッチが有効か
  function flags(){
    var all = ls('v292DfixPRUNE2Off');
    if (all === '1' || all === '!') return { a: false, b: false, c: false };
    return { a: ls('v292DfixPRUNE2aOn') === '1' && ls('v292DfixPRUNE2aOff') !== '1', b: ls('v292DfixPRUNE2bOn') === '1' && ls('v292DfixPRUNE2bOff') !== '1', /* 出荷 2026-11-11: P2a・P2b は既定 OFF（実 AI 比較が 1 本ずつで保留）。On キーで端末ごとに試せる。P2c だけ既定 ON */ c: ls('v292DfixPRUNE2cOff') !== '1' };
  }

  function cnt(s, f){ var n = 0, i = 0; while ((i = s.indexOf(f, i)) >= 0){ n++; i += f.length; } return n; }
  function cut1(s, find, repl){ var i = s.indexOf(find); return i < 0 ? null : s.slice(0, i) + repl + s.slice(i + find.length); }

  // ================= P2a 話者・書式 =================
  var H_FMT = '【出力の形式（これだけは形式として守る）】', H_SPK = '【話者】', H_OKITE = '【出力の掟】', H_END = '【話者タグの徹底（最優先）】';
  // 【出力の形式】の <say> の 2 項（fix192＋fix512）: 先頭と末尾で挟んで 1 文に（fix512 の ON/OFF で中身が変わっても当たる）
  var A_FMT_S = '・登場キャラが声に出すセリフは【必ず】<say who="名前">…</say> で囲む';
  var A_FMT_E = '逆に、セリフでない「」（回想・呼び名・看板の文字・比喩の引用）はタグで囲まない。\n';
  var A_FMT_NEW = '・声に出たセリフは【必ず】本文の中で <say who="登録名">…</say> で書き、裸の「」だけのセリフを置かない（細則は末尾の【話者タグの徹底】に 1 か所でまとめてある）。\n';
  // 【出力の掟】2 項目（fix459 blockB）
  var A_OKITE = '・キャラの発話は必ず <say who="名前"> で囲む。裸の「」だけのセリフを地の文に置かない。\n';
  // 【話者】2・3 項目（fix459 blockA）: 末尾のブロックに同じ規則がある
  var A_SPK2 = '・登録キャラを「女」「男」「老人」「民俗学者」などの役割名・属性名や、名字だけ・空白を抜いた表記で who に書かない（地の文でそう呼ぶのは自由）。\n';
  var A_SPK3 = '・主人公が話しかけた直後の返答は、返答した本人の<say>で書く（主人公のタグに入れない）。\n';
  // 末尾のブロック（fix514）
  var A_END_OLD = H_END
    + '声に出された発話はすべて <say who="登録名">セリフ</say> で囲む。'
    + 'whoは登場キャストの完全登録名から完全一致で選ぶ（短縮名・名字だけ・名前だけ・愛称・役職名・「主人公」「彼」「彼女」は不可）。'
    + '会話・叫び・囁き・悲鳴・呻き・笑い声・声に出した独り言・途切れた声・「……っ」「え？」のような短い反応にも必ず付ける。'
    + 'whoには視点人物や地の文の主語ではなく、その言葉を実際に発声した本人を入れる（一人称・視点・外見・肉体・声質に惑わされない）。'
    + '鏡の中の別存在が話した=その存在／他人の声を真似た=真似した本人／憑依者が話した=発話を支配する人格／人格交代中=その時点で発話中の人格／正体を特定できない声=「不明な声」／匿名の多数=「群衆」。'
    + '声に出していない内心・思考・記憶・幻覚内の言葉・地の文には <say> も「」も使わない（声に出した独り言だけは通常の発話として <say who="登録名"> で囲む）。'
    + '名前のない裸の「」を本文に書かない。出力を終える前に、全ての発話に完全登録名のwhoが付いているか確認する。';
  var A_END_NEW = H_END + '\n'
    + '・声に出た言葉はすべて、本文の中で <say who="登録名">セリフ</say> で書く（会話・返事・叫び・呼びかけ・悲鳴・呻き・囁き・笑い声・独り言・「……っ」「え？」のような短い声も例外なく）。名前のない裸の「」のセリフを書かない。同じセリフを「」と <say> とで二重に書かない。\n'
    + '・who は実際に発声した本人の完全な登録名（完全一致。短縮名・名字だけ・愛称・役職名・「主人公」「彼」「彼女」は不可）。視点人物や地の文の主語ではない。声の主は口調・一人称・方言で見分ける。呼びかけるセリフの who は、呼ばれた相手ではなく呼んだ本人。主人公が話しかけたら、相手は本人の <say> でその場で返事する（主人公のタグに入れない）。\n'
    + '・登録のない存在（怪異・敵・謎の声）が喋ったときも、本文で使っている呼び名を who にして囲む。特定できない声=「不明な声」／匿名の多数=「群衆」／鏡の中の別存在=その存在／声真似=真似した本人／憑依・人格交代=その時点で発話している人格。\n'
    + '・文の途中のセリフもタグにする。例）相手は扉に手をかけたまま <say who="相手">待って。奥に誰かいる</say> と囁いた。\n'
    + '・声に出していない内心・思考・記憶には <say> も「」も使わない。セリフでない「」（回想・呼び名・看板の文字・引用）は囲まない。\n'
    + '・出力の前に、すべての発話に完全な登録名の who が付いているか確かめる。';

  function applyA(s, ops){
    // 錨が全部（ちょうど 1 回ずつ）そろったときだけ当てる
    if (cnt(s, A_END_OLD) !== 1 || cnt(s, A_OKITE) !== 1 || cnt(s, A_FMT_S) !== 1 || cnt(s, A_FMT_E) !== 1) return s;
    var hf = s.indexOf(H_FMT), i0 = s.indexOf(A_FMT_S), i1 = s.indexOf(A_FMT_E);
    if (hf < 0 || i0 < hf || i1 <= i0) return s;
    var mid = s.slice(i0, i1 + A_FMT_E.length);
    if (mid.length < 250 || mid.length > 900 || mid.indexOf('\n【') >= 0 || mid.indexOf('<state') >= 0 || mid.indexOf('<react') >= 0) return s;
    if (s.indexOf(H_OKITE) < 0 || s.indexOf(H_SPK) < 0) return s;
    var r;
    s = s.slice(0, i0) + A_FMT_NEW + s.slice(i1 + A_FMT_E.length); ops.push('a_fmt');
    r = cut1(s, A_OKITE, ''); s = r; ops.push('a_okite');
    r = cut1(s, A_END_OLD, A_END_NEW); s = r; ops.push('a_end');
    r = cut1(s, A_SPK2, ''); if (r != null){ s = r; ops.push('a_spk2'); }
    r = cut1(s, A_SPK3, ''); if (r != null){ s = r; ops.push('a_spk3'); }
    return s;
  }

  // ================= P2b 見本と種 =================
  var B_EXA = '─見本A（', B_EXB = '─見本B（';
  var B_SEED_OLD = '【プレイヤーの種】プレイヤーがDO/SAY/STORYで書き込む内容は、この物語の種である。入力に現れた固有名詞・場所・小道具・意図・思いつきは使い捨てにせず物語の記憶として拾い上げ、のちの展開で芽吹かせて意味を持たせる。入力を素通りさせたり打ち消したりせず、その方向へ世界を確かに動かして応える。';
  var B_SEED_NEW = '【プレイヤーの種】入力に現れた固有名詞・場所・小道具・意図は使い捨てにせず、のちに場面がそれに触れたとき意味を持たせる（危機の最中に無理に持ち出さない）。';
  var B_NPC_OLD = '【NPCの登場】場面の空気を読むこと。人がいて自然な状況（街・店・宿・捜査・社交・群衆・緊迫など）では、雰囲気の描写だけで済ませず、まだ誰も絡んでいなければ未登録の人物を一人前へ出し、言葉や行動で関わらせる。情報・関係・緊張・選択肢のいずれかに寄与させること。再登場しそうな重要人物には名前を与える（一覧に残り一貫させるため）。ただし既に登場中・直近で出したNPCが居る場合や、親密な二人だけ・一人きりの静かな場面では無理に増やさない。中心キャラの焦点は薄めない。創作したNPCは状況次第で言葉を発し、生きた人物として絡ませてよい。';
  var B_NPC_NEW = '【NPCの登場】人がいて自然な状況（街・店・宿・捜査・社交・群衆など）で、まだ誰も絡んでいなければ、未登録の人物を一人だけ前へ出し、言葉や行動で関わらせる。再登場しそうな人物には名前を与える。既に登場中・直近で出したNPCが居る場面、二人だけ・一人きりの静かな場面、危機の最中には増やさない。';
  var B_SENPAI_OLD = '自分自身を「先輩」と呼ばない（「先輩」と呼ぶのは後輩側）。';
  var B_SENPAI_NEW = '呼びかけるセリフの who は、呼ばれた相手ではなく呼んだ本人。';

  function applyB(s, ops){
    var r, i0, i1, mid;
    // 見本 A: 「─見本A（」から「─見本B（」の直前まで（トーンごとに中身が違うので位置で外す）。A と B がちょうど 1 つずつあるときだけ。
    if (cnt(s, B_EXA) === 1 && cnt(s, B_EXB) === 1){
      i0 = s.indexOf(B_EXA); i1 = s.indexOf(B_EXB);
      if (i1 > i0){
        mid = s.slice(i0, i1);
        if (mid.length >= 100 && mid.length <= 1200 && mid.indexOf('【') < 0 && /\n\n$/.test(mid)){ s = s.slice(0, i0) + s.slice(i1); ops.push('b_exA'); }
      }
    }
    if (cnt(s, B_SEED_OLD) === 1){ s = cut1(s, B_SEED_OLD, B_SEED_NEW); ops.push('b_seed'); }
    if (cnt(s, B_NPC_OLD) === 1){ s = cut1(s, B_NPC_OLD, B_NPC_NEW); ops.push('b_npc'); }
    if (cnt(s, B_SENPAI_OLD) === 1){ s = cut1(s, B_SENPAI_OLD, B_SENPAI_NEW); ops.push('b_senpai'); }
    return s;
  }

  // ================= P2c user 側 =================
  var BAR = '━━━━━━━━━━━━━━━━━━━━━━━━━';
  var C_VERB_OLD = [
    BAR,
    '【プレイヤー入力の逐語反映 — 厳守】',
    BAR,
    'プレイヤーが SAY (発話) / DO (行動) / STORY (展開) で書いた本文は、',
    '**そのままの言い回し・固有名詞・順序** で narrative に反映すること。',
    '',
    '・SAY 入力 → 該当キャラの台詞として、引用形式で逐語的に登場させる',
    '  (要約・言い換え・敬体↔常体の自動変換は禁止)',
    '・DO 入力 → 該当キャラの行動として、地の文に逐語的に書き込む',
    '・STORY 入力 → 場面/出来事として、地の文に逐語的に組み込む',
    '・プレイヤーが指定した固有名詞・状態・場所・小道具は省略不可',
    '',
    'narrative は、プレイヤー入力で起きること（入力が「続きを自然に進めて」等の"継続の合図"なら、直前ターンの状態・感情・未完の動きを引き継いだ上での【次の展開】）を今ターンの起点にする。',
    '直前ターン(recentScenes)の本文を再演・コピー・言い換えして書き始めてはならない。継続の合図のときも同じ場面・同じ文を書き直さず、状況を必ず次の段階へ前進させる。',
    BAR
  ].join('\n');
  var C_VERB_NEW = [
    BAR,
    '【プレイヤー入力の逐語反映 — 厳守】',
    'プレイヤーが SAY / DO / STORY で書いた本文は、そのままの言い回し・固有名詞・順序で narrative に反映する。',
    '・SAY → 該当キャラの台詞として、引用形式で逐語的に（要約・言い換え・敬体↔常体の変換をしない）',
    '・DO → 該当キャラの行動として／STORY → 場面の出来事として、地の文に逐語的に組み込む',
    '・入力にある固有名詞・状態・場所・小道具を省かない',
    'narrative は、この入力で起きることを今ターンの起点にする（入力が「続きを自然に進めて」等の"継続の合図"なら、直前ターンの状態・感情・未完の動きを引き継いだ次の展開）。recentScenes の本文を再演・コピー・言い換えして書き始めない。',
    BAR
  ].join('\n');
  // psychAnchors.note（fix24。fix313 の作り直しも同じ文）: 決まり文句の列挙（「息を呑む」等）を外す・「場面が触れたとき」に
  var C_PSY_OLD = '各キャラの恐怖・欲望・傷は narrative の地の文に間接的に滲ませる。クリシェ反応(鼓動が速まる/息を呑む/身体が冷える 等)ではなく、そのキャラ固有の身体記憶・連想・過去の傷との結びつきで表現する。';
  var C_PSY_NEW = '各キャラの恐怖・欲望・傷は、場面がそれに触れたとき narrative の地の文に間接的に滲ませる。ありきたりな身体反応ではなく、そのキャラ固有の身体記憶・連想・過去の傷との結びつきで表現する。';

  function isStorySys(s){
    return typeof s === 'string' && s.length > 1500 && s.indexOf('＜あなたの役割＞') >= 0
      && s.indexOf(H_FMT) >= 0 && s.indexOf(H_SPK) >= 0;   // fix459 の組み替え後だけ
  }
  function pruneSys(sys, fl){
    var ops = []; fl = fl || flags();
    if (!isStorySys(sys) || (!fl.a && !fl.b)) return { text: sys, ops: ops };
    var s = sys;
    if (fl.a) s = applyA(s, ops);
    if (fl.b) s = applyB(s, ops);
    return { text: s, ops: ops };
  }
  function pruneUser(u, fl){
    var ops = []; fl = fl || flags();
    if (typeof u !== 'string' || !fl.c) return { text: u, ops: ops };
    var s = u;
    if (cnt(s, C_VERB_OLD) === 1){ s = cut1(s, C_VERB_OLD, C_VERB_NEW); ops.push('c_verbatim'); }
    if (cnt(s, C_PSY_OLD) === 1){ s = cut1(s, C_PSY_OLD, C_PSY_NEW); ops.push('c_psynote'); }
    return { text: s, ops: ops };
  }

  var last = null, stats = { seen: 0, changed: 0, err: 0 };
  // body（JSON 文字列）→ 整理後の JSON 文字列。物語生成でない・kill・変化なし → 受け取った文字列そのもの。
  function pruneBody(body, stringify){
    var fl = flags();
    if ((!fl.a && !fl.b && !fl.c) || typeof body !== 'string' || body.length < 2000) return body;
    if (body.indexOf('＜あなたの役割＞') < 0 && body.indexOf('\\uFF1C') < 0) return body;
    var b = JSON.parse(body);
    if (!b || !b.messages || !b.messages.length) return body;
    var si = -1, i;
    for (i = 0; i < b.messages.length; i++){ var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string'){ si = i; break; } }
    if (si < 0 || !isStorySys(b.messages[si].content)) return body;
    stats.seen++;
    var before = b.messages[si].content, ps = pruneSys(before, fl), uo = [], ub = 0, ua = 0, changed = ps.text !== before;
    b.messages[si].content = ps.text;
    for (i = b.messages.length - 1; i > si; i--){
      var u = b.messages[i];
      if (u && u.role === 'user' && typeof u.content === 'string'){
        var pu = pruneUser(u.content, fl); ub = u.content.length; ua = pu.text.length;
        if (pu.text !== u.content){ u.content = pu.text; changed = true; } uo = pu.ops; break;
      }
    }
    if (!changed) return body;
    stats.changed++;
    last = { t: Date.now(), before: before.length, after: ps.text.length, ubefore: ub, uafter: ua, ops: ps.ops, uops: uo, flags: fl };
    return (stringify || JSON.stringify)(b);
  }

  // ---- fetch 境界 ----
  var of = window.fetch;
  if (typeof of === 'function'){
    var wrapped = function(u, o){
      try {
        if (o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){
          var nb = pruneBody(o.body);
          if (nb !== o.body) o = Object.assign({}, o, { body: nb });
        }
      } catch(e){ stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
    wrapped.__fPRUNE2 = true;
    window.fetch = wrapped;
  }

  window.__v292DfixPRUNE2 = {
    VER: VER, pruneSys: pruneSys, pruneUser: pruneUser, pruneBody: pruneBody,
    last: function(){ return last; }, stats: function(){ return stats; }, flags: flags
  };
  try { console.log(TAG, 'armed', VER); } catch(e){}
})();
