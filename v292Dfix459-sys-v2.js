// =====================================================================
// Chronicle TRPG - v292Dfix459: sys プロンプトの棚卸し v2（重複クラスタA〜Dの統合）
// ---------------------------------------------------------------------
// ★背景（2026-07-13・実sys傍受で実測）: 実sys = 8,317字 / 27ブロック。
//   同じことを言うブロックが4クラスタに分かれて散在していた。
//     A 話者の同一性  : 【話者厳守】【正式呼称】【呼称の固定】【whoに使う名前】【悲鳴・うめきの話者帰属】(5)
//     B 出力形式の契約: 【出力の掟】【本文形式】【境界線ルール】(3)
//     C 展開・進行    : 【展開を前に進める・優先順位】【展開の推進ルール】(2) + 【良い1ターンの形】の重複項目
//     D 文体・密度    : 【文体の基本ルール】【描写の作り方】【ダッシュ】(3)
//
// ★設計（GPT-5.6の助言＋今日の実測教訓）:
//   ・1ブロック = 目的1つ / 命令3〜6個 / 150〜400字（細分化しすぎると重要度が平坦化して埋もれる）
//   ・**見本(few-shot)は削らない**。品質の源泉であり、ここを削ると文章が痩せる（実測: 見本の書き癖は指示より強い）。
//   ・**元のブロックを作っているモジュールは1行も触らない**。送信直前(fetch境界)で sys を組み替えるだけ。
//     → OFFにすれば**その瞬間から**今までのプロンプトに完全に戻る（デプロイ不要）。
//
// ★OFFスイッチ（コンソールに貼るだけ・リロード不要）
//   localStorage.v292Dfix459Off  = '1'   … 全部やめて旧sysに戻す
//   localStorage.v292Dfix459AOff = '1'   … A（話者）だけ旧に戻す
//   localStorage.v292Dfix459BOff = '1'   … B（出力形式）だけ
//   localStorage.v292Dfix459COff = '1'   … C（展開）だけ
//   localStorage.v292Dfix459DOff = '1'   … D（文体）だけ
//
// 検証口: window.__v292Dfix459.last()  … { before, after, blocksBefore, blocksAfter }
// 冪等  : window.__v292Dfix459 / 送信bodyには __f459 マーカーが1つだけ入る
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix459 && window.__v292Dfix459.__armed) return;
  var TAG = '[v292Dfix459:sys-v2]';

  function flag(k){ try { return localStorage.getItem(k) === '1'; } catch(e){ return false; } }
  function off(){ return flag('v292Dfix459Off'); }

  // ---- 既知マーカー（これだけをブロック境界として扱う。本文中の【短い】等では切らない） ----
  var MARKERS = [
    '【プレイヤー入力＝主人公の発話】',
    '【プレイヤー入力＝主人公の行動】',
    '【プレイヤー入力＝描写の指定】',
    '【良い1ターンの形】',
    '【この場面の種（説明はせず、言動と展開に滲ませる）】',
    '【出力の形式（これだけは形式として守る）】',
    '【展開を前に進める・優先順位】',
    '【セリフと物音の区別】',
    '【守ること】',
    '【プレイヤーの種】',
    '【キャラ属性】',
    '【話者厳守】',
    '【口調】',
    '【調整タグ】',
    '【悲鳴・うめきの話者帰属】',
    '【痛覚】',
    '【状態の出力（fix77・必須）】',
    '【各キャラの現在の状態】',
    '【各キャラの現在の状態（引き継ぐ。傷/関係/未解決は治療・和解まで保持し勝手に消さない）】',
    '【正式呼称】',
    '【本文形式】',
    '【反応と身体（統合・最優先）】',
    '【出力の掟】',
    '【世界の掟】',
    '【呼称の固定】',
    '【ダッシュ】',
    '【whoに使う名前】',
    '【文体の基本ルール】',
    '【NPCの登場】',
    '【展開の推進ルール】',
    '【境界線ルール（内部管理と地の文の分離・最優先）】',
    '【描写の作り方（説明せず"見せる"・最優先）】',
    '【この一手で前面に出す人物】',
    '【本文の長さ】',
    '【文体ノブ】',
    // fix496(A1): 後発keeperブロックの境界を認識させる。未知マーカーだとparseが直前ブロックへ
    // 吸収し、直前がdrop対象なら道連れ削除された(実測: dropAの【whoに使う名前】直後の【表記】、
    // dropDの【ダッシュ】直後の【読ませ方】が毎ターン消失→fix482/467/414がモデルに届かず)。
    // これら8つはdropA/B/C/Dのどれにも無いため、認識後は生存してモデルへ届く(GPT裁定GO)。
    '【制約】',
    '【読ませ方】',
    '【表記】',
    '【キャラの反応】',
    '【口調訂正】',
    '【関係】',
    '【打ち明け】',
    '【NPC間の関係】'
  ];

  function parse(sys){
    var hits = [];
    for (var i = 0; i < MARKERS.length; i++){
      var m = MARKERS[i], from = 0, at;
      while ((at = sys.indexOf(m, from)) >= 0){ hits.push({ at: at, mk: m }); from = at + m.length; }
    }
    hits.sort(function(a, b){ return a.at - b.at; });
    var blocks = [];
    for (var j = 0; j < hits.length; j++){
      var end = (j + 1 < hits.length) ? hits[j + 1].at : sys.length;
      blocks.push({ mk: hits[j].mk, at: hits[j].at, end: end, text: sys.slice(hits[j].at, end) });
    }
    return { head: hits.length ? sys.slice(0, hits[0].at) : sys, blocks: blocks };
  }

  // ---- 動的情報の取り出し（旧ブロックから名前の一覧を拾う） ----
  function castNames(){
    try {
      var f = window.__v292Dfix456;
      if (f && typeof f.castNames === 'function'){ var a = f.castNames(); if (a && a.length) return a; }
    } catch(e){}
    try {
      var S = window.S || (0,eval)('typeof S!=="undefined"?S:null');
      var out = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); });
      }
      return out;
    } catch(e){ return []; }
  }
  function knownHandles(txt){
    // 【呼称の固定】…呼ぶ: A、B、C。   /  【正式呼称】…作らない: A、B
    var m = /呼ぶ:\s*([^。]+)。/.exec(txt) || /作らない:\s*([^。\n]+)/.exec(txt);
    if (!m) return [];
    return m[1].split(/[、,]/).map(function(s){ return s.trim(); }).filter(function(s){ return s; });
  }

  // ---- ★fix459c: 役割名 → 登録名 の対応表を作る（実測: sys v2 だけだと
  //   モデルが登録NPCを <say who="看護師"> のように役割名で呼ぶことがあった）。
  //   各NPCの説明文に出てくる役割語のうち、**cast全体で1人にしか出てこない語**だけを対応表にする。
  var ROLE_WORDS = ['看護師','医師','医者','女将','店主','主人','老人','湯守','灯台守','漁師','船長','刑事','警官','教師','先生','記者','学者','民俗学者','司書','巫女','神主','僧侶','運転手','料理人','受付','執事','メイド','村長','町長','駅員','郵便配達員','配達員','若女将','看板娘','店員','マスター','バーテンダー','住職','宮司','管理人','大家','社長','部長','課長','秘書','弁護士','看守','兵士','傭兵','騎士','魔女','占い師'];
  function roleMap(){
    try {
      var S = window.S || (0,eval)('typeof S!=="undefined"?S:null');
      if (!S || !S.cast) return [];
      var list = [];
      if (S.cast.hero && S.cast.hero.name) list.push({ n: String(S.cast.hero.name).trim(), d: String(S.cast.hero.desc || '') });
      (S.cast.npcs || []).forEach(function(x){ if (x && x.name) list.push({ n: String(x.name).trim(), d: String(x.desc || '') }); });
      var pairs = [];
      for (var i = 0; i < ROLE_WORDS.length; i++){
        var w = ROLE_WORDS[i], hit = [];
        for (var j = 0; j < list.length; j++){ if (list[j].d.indexOf(w) >= 0) hit.push(list[j].n); }
        if (hit.length === 1) pairs.push(w + '＝' + hit[0]);
        if (pairs.length >= 6) break;
      }
      return pairs;
    } catch(e){ return []; }
  }

  // ===================== 新ブロック =====================
  function blockA(oldTexts){
    var cast = castNames();
    var known = [];
    for (var i = 0; i < oldTexts.length; i++){
      knownHandles(oldTexts[i]).forEach(function(n){ if (n && known.indexOf(n) < 0 && cast.indexOf(n) < 0) known.push(n); });
    }
    var t = '\n【話者】\n'
      + '・<say>/<react>/<state> の who は、登録キャラなら登録名の表記そのまま（空白も含めて）書く'
      + (cast.length ? '：' + cast.join('／') : '') + '。\n'
      + '・登録キャラを「女」「男」「老人」「民俗学者」などの役割名・属性名や、名字だけ・空白を抜いた表記で who に書かない（地の文でそう呼ぶのは自由）。\n'
      + '・主人公が話しかけた直後の返答は、返答した本人の<say>で書く（主人公のタグに入れない）。\n';
    var rm = roleMap();
    if (rm.length) t += '・次の人物を役割名で who に書かない（本人の登録名で書く）：' + rm.join('／') + '。\n';
    if (known.length) t += '・既に出ている名前の無い存在は、この呼び名のまま呼ぶ（新しい呼び名を作らない）：' + known.slice(0, 12).join('／') + '。\n';
    t += '・悲鳴・うめき・嗚咽は、いま痛み・危機・拘束にある当人に付ける。近くにいるだけの第三者に付けない。「彼」「彼女」は直前に行動・負傷した人物を指す。\n'
      + '・地の文で「Xの口から」「Xの喉から」「Xの息が」と出る声は、必ずXに帰属する。';
    return t;
  }

  function blockB(){
    return '\n【出力の掟】\n'
      + '・状態ラベル（からだ= / こころ= / 本能= / 目的= / 傷= / 関係= / 未解決=）は内部管理の記法。地の文・セリフに絶対に書かない。使ってよいのは本文の後ろに置く <state> タグの中だけ。\n'
      + '・キャラの発話は必ず <say who="名前"> で囲む。裸の「」だけのセリフを地の文に置かない。\n'
      + '・「直前までの状況」等の見出し・要約ヘッダを書かない。人物名を《》や空欄で伏せない。読点ごとの断片的な改行をしない。\n'
      + '・語り部に徹する。読者に話しかけない／自分の作業を報告しない（「物語を進行させました」「入力をどうぞ」等は禁止）。箇条書きで仕様を説明しない。出力は物語の地の文と<say>のセリフだけ。\n'
      + '・字面の似た名前を取り違えない。各文で「誰が」「誰の視点か」を保つ。';
  }

  function blockC(){
    return '\n【展開】\n'
      + '・指示が衝突したら ①破綻させない（直前の再演・物理矛盾・メタ混入の禁止）②連続性（場所・負傷・拘束・感情の引き継ぎ）③前進 ④文体 の順で判断する。\n'
      + '・毎ターン、まだ出していないものを一つ動かす（手がかり・危険・感情の変化・物音や気配・移動・時間経過）。\n'
      + '・直前のターンと同じモチーフ（同じ物音・同じ台詞・同じ小道具）の繰り返しで場面を埋めない。\n'
      + '・説明を長く続けず、行動・会話・物音・視界・沈黙で前へ進める。';
  }

  function blockD(){
    return '\n【文体】\n'
      + '・平易で自然な日本語の小説の文体。難解な語彙・凝った比喩・翻訳調を避け、一文は短めに区切る。緊張感や情景は損なわない。\n'
      + '・出来事は説明・要約で片づけず、具体的な動作・物音・手触り・におい・温度で"見せる"。名詞化や分類でまとめない。\n'
      + '・痛み・恐怖・衝撃は、まず体が反応してから言葉になる。冷静なキャラでも微小な揺れを一つ描く（奥歯を噛む・一瞬の硬直・指の強張り）。\n'
      + '・セリフは短く生で、その人物固有の機微を出す。状況説明をセリフで代弁させない。\n'
      + '・ダッシュ「——」は原則つかわない（多くても1ターンに1回）。間や余韻は句点・短い一文・改行で作る。「……」は2回まで。体言止めを続けない。\n'
      + '・地の文にMarkdown（**、*、#、行頭の・/-）を使わない。数値の精密さや俯瞰的な分析で距離を作らない。';
  }

  // 【良い1ターンの形】から、C/D/反応と身体 と重複する項目を落とす
  function trimGoodTurn(txt){
    var out = txt;
    // 2. 新しい要素…（C と重複）
    out = out.replace(/\n?2\. 新しい要素を持ち込んで[\s\S]*?(?=\n3\. )/, '\n');
    // 3. 五感…（D と重複）
    out = out.replace(/\n?3\. 五感のある地の文で描く。[\s\S]*?(?=\n4\. )/, '');
    out = out.replace(/\n4\. /, '\n2. ');   // 抜けた番号を詰める
    out = out.replace(/\n\n+/g, '\n');
    return out;
  }

  // ===================== 組み立て =====================
  var last = null;
  function rewrite(sys){
    if (off() || typeof sys !== 'string' || sys.length < 500) return sys;
    if (sys.indexOf('【話者】') >= 0 && sys.indexOf('【文体】') >= 0) return sys;   // 冪等
    var A = !flag('v292Dfix459AOff'), B = !flag('v292Dfix459BOff'),
        C = !flag('v292Dfix459COff'), D = !flag('v292Dfix459DOff');

    var p = parse(sys);
    if (!p.blocks.length) return sys;

    var dropA = ['【話者厳守】','【正式呼称】','【呼称の固定】','【whoに使う名前】','【悲鳴・うめきの話者帰属】'];
    var dropB = ['【本文形式】','【境界線ルール（内部管理と地の文の分離・最優先）】','【出力の掟】'];
    var dropC = ['【展開の推進ルール】','【展開を前に進める・優先順位】'];
    var dropD = ['【文体の基本ルール】','【描写の作り方（説明せず"見せる"・最優先）】','【ダッシュ】'];

    var aSrc = [];
    var kept = [];
    for (var i = 0; i < p.blocks.length; i++){
      var b = p.blocks[i];
      if (A && dropA.indexOf(b.mk) >= 0){ aSrc.push(b.text); continue; }
      if (B && dropB.indexOf(b.mk) >= 0) continue;
      if (C && dropC.indexOf(b.mk) >= 0) continue;
      if (D && dropD.indexOf(b.mk) >= 0) continue;
      if (C && b.mk === '【良い1ターンの形】'){ kept.push(trimGoodTurn(b.text)); continue; }
      kept.push(b.text);
    }

    var addon = '';
    if (A) addon += blockA(aSrc);
    if (B) addon += '\n' + blockB();
    if (C) addon += '\n' + blockC();
    if (D) addon += '\n' + blockD();

    var out = p.head + kept.join('') + addon + '\n';
    last = { before: sys.length, after: out.length, blocksBefore: p.blocks.length, blocksAfter: kept.length + (A?1:0) + (B?1:0) + (C?1:0) + (D?1:0) };
    try { console.log(TAG, 'sys ' + last.before + '→' + last.after + '字 / ' + last.blocksBefore + '→' + last.blocksAfter + 'ブロック'); } catch(e){}
    return out;
  }

  // ---- fetch 境界（送信直前）で書き換える。fix441 より外側 = 最終形を掴む ----
  var of = window.fetch;
  var wrapped = function(u, o){
    try {
      if (!off() && o && o.method === 'POST' && o.body && /workers\.dev|openrouter/.test(String(u))){
        var b = JSON.parse(String(o.body));
        if (b && b.messages && b.messages.length){
          for (var i = 0; i < b.messages.length; i++){
            var m = b.messages[i];
            if (m && m.role === 'system' && typeof m.content === 'string' && m.content.length > 1500){
              var nv = rewrite(m.content);
              if (nv !== m.content){ m.content = nv; o = Object.assign({}, o, { body: JSON.stringify(b) }); }
              break;
            }
          }
        }
      }
    } catch(e){ try { console.warn(TAG, 'rewrite skipped:', e && e.message); } catch(_){} }
    return of.apply(this, [u, o]);
  };
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
  wrapped.__f459 = true;
  window.fetch = wrapped;

  window.__v292Dfix459 = {
    __armed: true,
    rewrite: rewrite,
    parse: parse,
    last: function(){ return last; },
    isOff: off
  };
  try { console.log(TAG, 'armed (sys v2 at send boundary)'); } catch(e){}
})();
