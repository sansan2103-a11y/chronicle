// =====================================================================
// Chronicle TRPG - v292DfixPRUNE3: 「足さずに、今ある文を直す・まとめる」束（実験・既定 OFF）
// ---------------------------------------------------------------------
// 背景（lanePRUNE3・2026-11-15・棚卸し prune3/REPORT）: NPC が「まだ言われていない拒否に先回りして答える」「複数人への問いに代表して答える」。
//   最終 sys では「進めよ」が入力の回 8 文・続きの回 13 文あり（★最終判断③は衝突のたびに「進める」を勝たせる）、
//   状態ブロック末尾の「依頼の場面では入力を待たず NPC から話してよい」と「主人公の台詞を書かない」が引っ張り合い、
//   止める場所（＝プレイヤーの番）がどこにも書かれていない。
// 方式: PRUNE1／PRUNE2 と同じ。送信直前（fetch 境界）で、決まった文字列だけを置き換える。元の部品は 1 行も変えない。
//   読み込み位置は HEROVOICE1 の直後（＝fetch の包みでは HEROVOICE1 の外側・ACTOR1／PRUNE2／PRUNE1 の内側）。
//   → PRUNE1・PRUNE2・ACTOR1 が済んだ sys を見て、HEROVOICE1（A／B の置き換え）はこの後に当たる。
//   HEROVOICE1 が探す文（fix417 の S417・AGENCY1 の文・独白の文・CONT1 の SCONT／SCONTL）は 1 字も変えず、回数も変えない。
// 部分（どれも見つからなければその 1 手だけ何もしない）:
//   P1 「進める」の意味を進行エンジンの 1 か所で決める（返事が要る所で止めてよい・それは足踏みではない）。役割・【展開】の同じ意味の文を落とし、★最終判断③は参照だけ。
//   P2 状態ブロック末尾の「入力を待たず…」2 行（fix192:276-277）を 1 行に。待たずに話してよいのは主人公への問い・頼みがまだ出ていない時だけ。
//   P3 続きの回の「進めよ」（contLine・【続きを書く】・【続きの転換点】・進行エンジンの続きの行・【危機のとき】の続きの行）を 1 ブロックに。
//      参照先の無い「上の進行レベルに従って」を消す。user の「（時間は飛ばさない）」「直後から…結果が一つ出るところまで」は続きの回だけ sys に合わせる。
//   P4 fix512「主人公が話しかけたら、相手のキャラはその場で <say> で返事する」→ その人らしく応じる・複数人への問いには自分の分だけ。
//   P10 役割の「一人称視点の」を外す（GQ2 で三人称叙述に決まっている）。
// 鍵: localStorage v292DfixPRUNE3On='1' で ON（既定 OFF）。v292DfixPRUNE3Off='1' は On より強い（何もしない＝送信バイト同一）。
//     v292DfixPRUNE3Parts='P1,P2'（カンマ区切り）でその部分だけ。無い・空なら全部。毎回評価・再読み込み不要。localStorage が読めない → 何もしない。
// 検証口: window.__v292DfixPRUNE3 = { VER, pruneSys, pruneUser, pruneBody, parts, last, stats }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixPRUNE3) return;
  var TAG = '[v292DfixPRUNE3]', VER = 'prune3-20261115-a';
  var ALL = ['P1', 'P2', 'P3', 'P4', 'P10'];
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return '__ERR__'; } }
  function parts(){
    var off = ls('v292DfixPRUNE3Off'), on = ls('v292DfixPRUNE3On');
    if (off === '__ERR__' || off === '1' || on !== '1') return [];
    var p = ls('v292DfixPRUNE3Parts');
    if (!p || p === '__ERR__') return ALL.slice();
    var want = String(p).split(',').map(function(x){ return x.trim().toUpperCase(); });
    return ALL.filter(function(x){ return want.indexOf(x) >= 0; });
  }
  function hvMode(){ try { var H = window.__v292DfixHEROVOICE1; return (H && typeof H.mode === 'function') ? H.mode() : 'C'; } catch(e){ return 'C'; } }
  function cnt(h, n){ var c = 0, k = 0; while ((k = h.indexOf(n, k)) >= 0){ c++; k += n.length; } return c; }
  function rep1(s, a, b){ return cnt(s, a) === 1 ? s.replace(a, function(){ return b; }) : null; }   // ちょうど 1 回のときだけ

  // ---- P1 ----
  var P1 = [
    ['p1_role', 'それを膨らませて場面を一つ前へ進めます。', 'それを膨らませて描きます。'],
    ['p1_tenkai1', '・毎ターン、場面を一つ動かす。危機の最中は', '・危機の最中は'],
    ['p1_tenkai3', '・説明を長く続けず、行動・会話・物音・視界・沈黙で前へ進める。', '・説明を長く続けず、行動・会話・物音・視界・沈黙で描く。'],
    ['p1_engine_in', '・プレイヤーが入力した回は、入力で起きたことの直後を描き、その結果として状況が一つ動いたところで止める（数秒から数十秒の出来事。時間を飛ばさない・場面を変えない・入力と関係のない新しい出来事を足さない）。「一つ動く」とは、相手の反応・力関係・危険の度合い・分かったことのどれかが入力の前と変わること。同じ膠着や、同じ対象への同じ行為を言い換えて描き直すだけにしない。',
      '・プレイヤーが入力した回は、入力で起きたことの直後を描き、状況が一つ動いたところで止める（数秒から数十秒。時間を飛ばさない・場面を変えない・入力と関係のない出来事を足さない）。「一つ動く」とは、相手の反応・力関係・危険の度合い・分かったことのどれかが入力の前と変わること。主人公の返事・決断が要る所まで来たら、そこで止めてよい（足踏みではない）。'],
    ['p1_engine_end', '・最後は次の一手を促す変化で終える（毎回同じ型の締めにしない）。', '・終わりは、プレイヤーが次の一手を選べる所にする（毎回同じ型の締めにしない）。'],
    ['p1_final3', '③前進：状況を必ず次の段階へ動かす（同じ場面の描き直し・足踏み・一文だけの要約で終えない）。', '③前進：【展開を前に進める】【続きを書く】の意味で一つ動かす（返事待ちで止めるのは足踏みではない）。']
  ];
  // ---- P2（fix192:276-279。licExc〔NPCQ1〕の括弧はそのまま運ぶ）----
  var P2_RE = /・関係・未解決は各キャラが自分から動き、主人公や他キャラに話しかける動機になる。傷・恐怖・対立・依頼の場面では、入力を待たずNPCの側から言葉を発してよい(（ただし[^）\n]*）)?。\n(?:・主人公以外のNPCは、各自の目的・関係・状況に応じて、入力を待たず自律的に行動してよい。目的が衝突しても、対立・協力・妥協などの選択は人物ごとに異なる。|・各キャラは自分の「目的」に向かって、入力を待たず自分から動いてよい（目的が衝突するキャラ同士は自然に対立する）。)/;
  function p2Line(lic, m){
    return '・関係・未解決・目的は、各NPCが自分から動き話しかける動機になる。入力を待たずNPCから話してよいのは、主人公への問い・頼みがまだ出ていない時だけ' + (lic || '') +
      '。主人公（や同行者）への問い・頼みが出たら、' + (m === 'A' ? '主人公の決断や選択は書かず' : '主人公の返事は書かず') + '、そこで区切る。';
  }
  // ---- P3 ----
  var H_CONT = '【続きを書く＝物語を"横"に広げる】', H_HINT = '【続きの転換点】', YOKO = ' 重要な原則：';
  var CONTLINE = '（プレイヤーは「続きを書く」を押した。あなたが物語を一歩進める番。受け身で待たず、上の進行レベルに従って能動的に動かす。グロや痛みの強度を上げるだけ＝"縦"は前進ではない。新しい要素＝"横"で世界を広げる。）';
  var ENGINE_CONT = '・「続きを書く」の回は、上の【続きを書く】【続きの転換点】に従って局面を一つ進める。同じ膠着や、同じ対象への同じ行為を言い換えて描き直すだけにしない。\n';
  var CRISIS_CONT = '・「続きを書く」の回に持ち込む新しい要素も、危機そのものに関わるもの（悪化・助ける手段・相手の変化）にする。\n';
  var SCONT = '決定的な行動（救出・脱出・攻撃・重大な決断）は書かず、知覚と身体の反射までにとどめて次の一手をプレイヤーに残す。';   // HEROVOICE1 が探す（変えない）
  var SCONTL = '主人公に重要な台詞も言わせない。';                                                                            // 同上
  var U_SEED = '入力に含まれる動詞・身体動作・感情ヒントを「種」として、その直後に起きることを、結果が一つ出るところまで具体的に描く（時間は飛ばさない）。';
  var U_SEED_C = '「続きを書く」の合図なので、直前の場面から、sys の【続きを書く】に従って局面が一つ動くところまで具体的に描く。';
  var U_DELTA = '」の直後から描写してください（結果が一つ出るところまで）。';
  var U_DELTA_C = '」の合図で、直前の場面の続きから、局面が一つ動くところまで描写してください。';
  function contBlock(width, tailHero){
    return H_CONT + width + '\n' +
      '・前ターン末の発言・動作・各キャラの状態（負傷・拘束等）を冒頭で引き継いでから動かす。前進は世界とNPCの側で起こす：NPCの試み・新たな脅威・発見・環境の変化・人や物の登場・場所の移動・時間経過・関係の変化・思いがけない申し出から選び、直近数ターンと同じ種類は避ける。\n' +
      '・"縦"（同じ行為・同じ被害の強度を上げるだけ）や、同じ膠着の言い換えは前進ではない。\n' +
      '・進行中の危機（宙吊り・拘束・追跡・負傷の悪化など）はこの回で解決させない。持ち込む要素も危機そのもの（悪化・助ける手段・相手の変化）にし、決着はプレイヤーの次の入力に残す。\n' +
      '・起きる出来事は主人公の五感で具体的に描き、「〜寸前まで追い込まれる」のような要約で済ませない。\n' +
      '・主人公はプレイヤーの分身なので、' + tailHero + 'NPCが主人公に問い・頼みを向けたら、そこで止めてよい。';
  }
  function p3(s0, ops){
    // 先に、見出しの名前を本文で引く 2 文（進行エンジンの続きの行・contLine）を外す。ブロックがまとめられないときは外さない（元の s0 を返す）。
    var s = s0, o2 = [], r = rep1(s, ENGINE_CONT, ''); if (r != null){ s = r; o2.push('p3_engine_cont'); }
    r = rep1(s, CONTLINE, ''); if (r != null){ s = r; o2.push('p3_contline'); }
    var i = s.indexOf(H_CONT), j = s.indexOf('\n' + H_HINT) + 1;
    if (i < 0 || j <= 0 || cnt(s, H_CONT) !== 1 || cnt(s, H_HINT) !== 1 || cnt(s, SCONT) !== 1) return s0;
    var ie = s.indexOf('\n', i); if (ie < 0) ie = s.length;
    var line = s.slice(i, ie), y = line.indexOf(YOKO), k = line.indexOf(SCONT);
    if (y < 0 || k < 0) return s0;
    var width = line.slice(H_CONT.length, y);
    var tail = SCONT + (line.indexOf(SCONT + SCONTL) >= 0 ? SCONTL : '');
    var je = s.indexOf('\n', j); if (je < 0) je = s.length;
    if (j < ie || /\S/.test(s.slice(ie, j))) return s0;   // 想定の並び（続きを書く → 空行 → 転換点）でないときは何もしない
    // 続きを書くの行・間の空行・転換点の行を、1 つのブロックに置き換える
    s = s.slice(0, i) + contBlock(width, tail) + s.slice(je);
    ops.push('p3_block'); o2.forEach(function(x){ ops.push(x); });
    return s;
  }
  // ---- P4・P10 ----
  var P4_OLD = '主人公が話しかけたら、相手のキャラはその場で <say who="名前"> で返事する。';
  var P4_NEW = '主人公が話しかけた相手は、その人らしく応じる（返事・ためらい・沈黙のどれでも）。複数人への問いには、各自が自分の分だけ答える。';
  var P10_OLD = 'あなたは一人称視点の物語TRPGの語り手です。', P10_NEW = 'あなたは物語TRPGの語り手です。';

  function isStorySys(s){
    return typeof s === 'string' && s.length > 1500 && s.indexOf('＜あなたの役割＞') >= 0
      && s.indexOf('【出力の形式（これだけは形式として守る）】') >= 0 && s.indexOf('【話者】') >= 0;
  }
  function pruneSys(sys, P, mode){
    var ops = [];
    if (!isStorySys(sys) || !P || !P.length) return { text: sys, ops: ops };
    var s = sys, r, k, cont = sys.indexOf(H_CONT) >= 0;
    if (P.indexOf('P3') >= 0){
      if (cont) s = p3(s, ops);
      r = rep1(s, CRISIS_CONT, ''); if (r != null){ s = r; ops.push('p3_crisis'); }
    }
    if (P.indexOf('P1') >= 0){
      for (k = 0; k < P1.length; k++){
        if (P1[k][0] === 'p1_final3' && s.indexOf('【展開を前に進める（進行エンジン）】') < 0) continue;   // 参照先が無いときは③を変えない
        r = rep1(s, P1[k][1], P1[k][2]); if (r != null){ s = r; ops.push(P1[k][0]); }
      }
    }
    if (P.indexOf('P2') >= 0){
      var m = s.match(P2_RE);
      if (m && cnt(s, m[0]) === 1){ s = s.replace(m[0], function(){ return p2Line(m[1], mode); }); ops.push('p2'); }
    }
    if (P.indexOf('P4') >= 0){ r = rep1(s, P4_OLD, P4_NEW); if (r != null){ s = r; ops.push('p4'); } }
    if (P.indexOf('P10') >= 0){ r = rep1(s, P10_OLD, P10_NEW); if (r != null){ s = r; ops.push('p10'); } }
    return { text: s, ops: ops };
  }
  function pruneUser(u, P, cont){
    var ops = [];
    if (typeof u !== 'string' || !cont || !P || P.indexOf('P3') < 0) return { text: u, ops: ops };
    var s = u, r = rep1(s, U_SEED, U_SEED_C); if (r != null){ s = r; ops.push('p3_u_seed'); }
    r = rep1(s, U_DELTA, U_DELTA_C); if (r != null){ s = r; ops.push('p3_u_delta'); }
    return { text: s, ops: ops };
  }

  var last = null, stats = { seen: 0, changed: 0, err: 0 };
  function pruneBody(body, stringify){
    var P = parts();
    if (!P.length || typeof body !== 'string' || body.length < 2000) return body;
    if (body.indexOf('＜あなたの役割＞') < 0 && body.indexOf('\\uFF1C') < 0) return body;
    var b = JSON.parse(body);
    if (!b || !b.messages || !b.messages.length) return body;
    var si = -1, i;
    for (i = 0; i < b.messages.length; i++){ var x = b.messages[i]; if (x && x.role === 'system' && typeof x.content === 'string'){ si = i; break; } }
    if (si < 0 || !isStorySys(b.messages[si].content)) return body;
    stats.seen++;
    var before = b.messages[si].content, cont = before.indexOf(H_CONT) >= 0, ps = pruneSys(before, P, hvMode()), uo = [], changed = ps.text !== before;
    b.messages[si].content = ps.text;
    for (i = b.messages.length - 1; i > si; i--){
      var u = b.messages[i];
      if (u && u.role === 'user' && typeof u.content === 'string'){ var pu = pruneUser(u.content, P, cont); if (pu.text !== u.content){ u.content = pu.text; changed = true; } uo = pu.ops; break; }
    }
    if (!changed) return body;
    stats.changed++;
    last = { t: Date.now(), before: before.length, after: ps.text.length, ops: ps.ops, uops: uo, parts: P };
    return (stringify || JSON.stringify)(b);
  }

  var of = window.fetch;
  if (typeof of === 'function'){
    var wrapped = function(u, o){
      try {
        if (o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u)) && parts().length){
          var nb = pruneBody(o.body);
          if (nb !== o.body) o = Object.assign({}, o, { body: nb });
        }
      } catch(e){ stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
    wrapped.__fPRUNE3 = true;
    window.fetch = wrapped;
  }
  window.__v292DfixPRUNE3 = { VER: VER, pruneSys: pruneSys, pruneUser: pruneUser, pruneBody: pruneBody, parts: parts,
    last: function(){ return last; }, stats: function(){ return stats; } };
  try { console.log(TAG, 'armed', VER); } catch(e){}
})();
