// =====================================================================
// Chronicle TRPG - v292Dfix442: 「伝承モチーフ」= 🎲空欄補完に世界の伝承構造を借りる
// ---------------------------------------------------------------------
// おしん要望(2026-07-12):
//   🎲の空欄補完のとき、世界各地に実在する不思議な物語や伝承から、
//   相性のよい「伝承モチーフ」を自然に取り入れられるようにしたい。
//
// ★設計思想: 「有名な怪談をそのまま出す」のではない。借りるのは **構造** だけ。
//   怪異が成立する条件 / 禁忌 / 代償 / 象徴 / 契約 / 反復される行為 /
//   境界を越える規則 / 正体を知ったときの変化 / 名前・鏡像・影・贈り物・食事・扉 の意味。
//   元ネタの固有名詞・登場人物・筋書きのコピーは禁止。
//
// 優先順位(モデルへ明示する): 1.ユーザー入力 2.入力同士の整合 3.空欄補完に必要な要素
//   4.伝承モチーフ 5.モデル独自の創作。伝承のためにユーザー入力を変えてはならない。
//   伝承は必須ではない(合わなければ純創作)。使用は原則1件・最大2件。
//
// ---------------------------------------------------------------------
// ■ 実装経路(実コード読解で確定・推測なし)
//   fix436 の run() は **レキシカルな** buildFillPrompt を呼ぶ:
//       var p = buildFillPrompt(fields);      // ← window.__v292Dfix436.buildFillPrompt ではない
//   したがって window.__v292Dfix436.buildFillPrompt を差し替えても
//   **実送信には1バイトも効かない(死に経路)**。fix313/366 の _extensions と同じ罠。
//
//   → よって fix442 は **送信境界(XHR.send)でプロンプトを書き換える**。
//     fix441 が sys書き換えを fetch 境界へ移した教訓と同じ形。
//     fix436 の request() は XHR(openrouter.ai/api/v1/chat/completions・fix247がプロキシへ書換)。
//     fix442 は index.html 最後尾 = fix247 の send ラッパの **外側** に乗る。
//     body を触ってから内側(fix247→native)へ渡すので、URL/ヘッダ書換とは干渉しない。
//
//   対象の識別は fix436 の空欄補完プロンプト固有の署名のみ:
//       user に '## 埋めるべき空欄' かつ sys に 'TRPGのシナリオ設計者'
//   → **通常の物語生成(Planner.build系・fetch経路)は一切通らない。sysは1バイトも増えない。**
//
//   加えて window.__v292Dfix436.buildFillPrompt も同じ pure 関数でラップする
//   (検証口が実送信と同じ文字列を返すようにするため。実効経路は send 側)。
//
// ■ fix436 との非競合
//   - fix436 のファイルは1文字も変更しない。collectFields/buildFillPrompt/applyFill は
//     そのまま使う(再実装しない)。空欄判定・書込保護(filled/writable)は fix436 のまま。
//   - fix442 が OFF、または shouldUseFolklore()=false のとき、
//     プロンプトは fix436 が作ったものと **文字列一致**(何も足さない)。
//
// 冪等: window.__v292Dfix442 (検証口オブジェクトを兼ねる)
// OFF : localStorage v292Dfix442Off='1' (live評価。伝承ブロックが完全に消える)
// ロールバック: scriptタグ削除 or OFFスイッチ
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix442) return;

  var TAG    = '[v292Dfix442:folklore]';
  var MARKER = '【伝承モチーフ】';          // 冪等マーカー(sysに1回だけ)
  var SIG_USER = '## 埋めるべき空欄';       // fix436の空欄補完プロンプト署名(user)
  var SIG_SYS  = 'TRPGのシナリオ設計者';    // 同(sys)

  function off(){ try { return localStorage.getItem('v292Dfix442Off') === '1'; } catch(e){ return false; } }
  function trim(v){ return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }

  // ===================================================================
  // 語彙表(将来ここを辞書/RAGに差し替えられる。今回は巨大辞書もWeb検索も入れない)
  // ===================================================================
  // 伝承・超常・幻想の気配(1件でもあれば伝承モチーフは有効)
  var KW_FOLK = [
    '怪異','怪談','幽霊','亡霊','霊','心霊','呪い','呪術','呪文','祟り','妖怪','鬼','天狗','座敷',
    '神隠し','神社','鳥居','巫女','神話','神々','神性','祭','祀','供物','供養','葬','墓','遺骨',
    '異界','黄泉','冥界','あの世','化物','化け物','怪物','儀式','儀礼','禁忌','タブー','まじない',
    '迷信','俗信','信仰','教団','カルト','伝承','伝説','民話','昔話','寓話','童話','都市伝説','ネットロア',
    '魔法','魔術','魔導','魔女','魔物','呪符','精霊','妖精','悪魔','天使','竜','ドラゴン','吸血鬼','人狼',
    'ホラー','恐怖','怪奇','不気味','オカルト','超常','超自然','幻想','ダークファンタジー',
    '廃校','廃墟','肝試し','七不思議','いわく','曰く','祈り','願掛け','鏡像','人形','幽体','憑'
  ];
  // ハードSF・科学考証寄りの気配(強いほど伝承を切る)
  var KW_HARD = [
    { w: 'ハードsf', s: 3 }, { w: 'ハード・sf', s: 3 }, { w: '科学考証', s: 3 },
    { w: 'リアルsf', s: 3 }, { w: '宇宙船', s: 2 }, { w: '宇宙ステーション', s: 2 },
    { w: '恒星間', s: 2 }, { w: 'コロニー', s: 1 }, { w: '軌道', s: 1 }, { w: '人工知能', s: 1 },
    { w: 'ai', s: 1 }, { w: 'アンドロイド', s: 1 }, { w: 'ロボット', s: 1 }, { w: '量子', s: 1 },
    { w: 'ナノ', s: 1 }, { w: 'サイバー', s: 1 }, { w: 'アルゴリズム', s: 1 }, { w: '故障', s: 1 },
    { w: '船内', s: 1 }, { w: '惑星', s: 1 }, { w: '探査', s: 1 }, { w: 'sf', s: 1 }
  ];
  // 「超常は起きない」と明言された場合(伝承を切る)
  var KW_NOSUPER = [
    '超常現象は起きない','怪異は登場しない','オカルト要素なし','超常要素なし','completely realistic',
    'ノンフィクション','ドキュメンタリー','現実にしか起きない','超自然は存在しない'
  ];
  var KW_HORROR  = ['怪異','怪談','幽霊','亡霊','心霊','呪い','祟り','妖怪','ホラー','恐怖','怪奇','不気味','オカルト','肝試し','七不思議','廃校','廃墟','死体','惨劇'];
  var KW_FANTASY = ['魔法','魔術','魔導','魔女','魔物','精霊','妖精','竜','ドラゴン','帝国','王国','剣と','異世界','錬金'];
  var KW_MYSTERY = ['ミステリ','推理','探偵','事件','謎解き','犯人'];
  var KW_HIST    = ['中世','古代','戦国','江戸','明治','大正','幕末','近世'];
  var ERA_MAP = [
    { w: '近未来', v: '近未来' }, { w: '未来', v: '未来' }, { w: '宇宙時代', v: '未来' },
    { w: '現代', v: '現代' }, { w: '現在', v: '現代' }, { w: '令和', v: '現代' }, { w: '平成', v: '現代' },
    { w: '昭和', v: '昭和' }, { w: '大正', v: '大正' }, { w: '明治', v: '明治' },
    { w: '幕末', v: '幕末' }, { w: '江戸', v: '江戸' }, { w: '戦国', v: '戦国' },
    { w: '中世', v: '中世' }, { w: '近世', v: '近世' }, { w: '近代', v: '近代' }, { w: '古代', v: '古代' }
  ];
  var KW_JP = ['日本','和風','神社','鳥居','巫女','妖怪','座敷','和室','畳','江戸','昭和','明治','大正','令和','平成','戦国','幕末','都道府県'];

  function countKw(text, list){
    var n = 0;
    for (var i = 0; i < list.length; i++){
      if (text.indexOf(list[i]) >= 0) n++;
    }
    return n;
  }
  function scoreKw(text, list){
    var n = 0;
    for (var i = 0; i < list.length; i++){
      if (text.indexOf(list[i].w) >= 0) n += list[i].s;
    }
    return n;
  }

  // ===================================================================
  // ① inferContext(fields) — 時代/地域/ジャンル/現実度/ホラー度 を推定(pure)
  //    入力済みの欄(filled)だけを見る。空欄は見ない。
  // ===================================================================
  function inferContext(fields){
    var parts = [], i, f;
    for (i = 0; i < (fields || []).length; i++){
      f = fields[i];
      if (!f || !f.key || !f.filled) continue;
      if (!trim(f.value)) continue;
      parts.push(String(f.value));
    }
    var raw  = parts.join(' \n ');
    var text = raw.toLowerCase();

    var folk    = countKw(text, KW_FOLK);
    var hard    = scoreKw(text, KW_HARD);
    var nosuper = countKw(text, KW_NOSUPER);
    var horror  = countKw(text, KW_HORROR);
    var fantasy = countKw(text, KW_FANTASY);
    var mystery = countKw(text, KW_MYSTERY);
    var hist    = countKw(text, KW_HIST);

    // 時代(明示語のみ。推測で断定しない)
    var era = '';
    for (i = 0; i < ERA_MAP.length; i++){
      if (text.indexOf(ERA_MAP[i].w) >= 0){ era = ERA_MAP[i].v; break; }
    }
    // 地域(明示語のみ。無ければ空 = 特定しない)
    var region = countKw(text, KW_JP) > 0 ? '日本' : '';

    // ジャンル(最頻。判定不能なら空)
    var genre = '';
    var best = 0;
    if (horror  > best){ best = horror;  genre = '怪異・ホラー'; }
    if (fantasy > best){ best = fantasy; genre = 'ファンタジー'; }
    if (hard >= 3 && hard > best){ best = hard; genre = 'SF'; }
    if (mystery > best){ best = mystery; genre = 'ミステリ'; }
    if (hist > best && !genre){ best = hist; genre = '歴史'; }

    // 現実度
    var realism = '';
    if (fantasy > 0) realism = '超常・魔法が制度として存在する世界';
    else if (folk > 0) realism = '現実に準拠しつつ、超常は例外として起こりうる';
    else if (hard >= 3) realism = '科学的整合を重んじる現実';
    // ホラー度
    var hlv = horror >= 3 ? '高' : (horror === 2 ? '中' : (horror === 1 ? '低' : ''));

    return {
      seeded: parts.length > 0,
      era: era, region: region, genre: genre, realism: realism, horror: hlv,
      scores: { folk: folk, hard: hard, nosuper: nosuper, horror: horror, fantasy: fantasy, mystery: mystery, hist: hist },
      textLen: raw.length
    };
  }

  // ===================================================================
  // ② shouldUseFolklore(ctx) — 伝承モチーフが有効か(pure)
  //    ・伝承/超常/幻想の気配が1つでもあれば true
  //    ・ハードSF(score>=3)で伝承の気配ゼロ → false
  //    ・「超常は起きない」明言で伝承の気配ゼロ → false
  //    ・それ以外(種なし・判定不能) → true(ブロック側で「合わなければ使うな」と指示済み)
  // ===================================================================
  function shouldUseFolklore(ctx){
    if (!ctx || !ctx.scores) return true;
    if (ctx.scores.folk > 0) return true;                 // 伝承と相性がある
    if (ctx.scores.nosuper > 0) return false;             // 超常否定が明言されている
    if (ctx.scores.hard >= 3) return false;               // ハードSF = 伝承と無関係
    return true;
  }

  // ===================================================================
  // ③ buildFolkloreBlock(ctx) — モデルへ渡す伝承指示ブロック(pure)
  //    ★実在の怪談名・神話名・固有名詞は1つも書かない(ハードコード禁止)
  //    ★「学園」「制服」「現代日本」等の設定誘導語を書かない(世界を歪めない)
  // ===================================================================
  function buildFolkloreBlock(ctx){
    var L = [];
    L.push(MARKER);

    // 推定前提(検出できたものだけ。断定しない)
    var hints = [];
    if (ctx && ctx.era)     hints.push('- 時代: ' + ctx.era);
    if (ctx && ctx.region)  hints.push('- 地域・文化圏: ' + ctx.region);
    if (ctx && ctx.genre)   hints.push('- ジャンル: ' + ctx.genre);
    if (ctx && ctx.realism) hints.push('- 現実度: ' + ctx.realism);
    if (ctx && ctx.horror)  hints.push('- ホラー度: ' + ctx.horror);
    if (hints.length){
      L.push('## 補完の前提（確定情報からの推定。確定情報と食い違う推定は捨てる）');
      L.push(hints.join('\n'));
    }

    L.push('## 伝承モチーフ（任意・原則1件・最大2件）');
    L.push('- 空欄の補完に有効なときにかぎり、世界各地に実在する 神話・創世神話・英雄神話／民話・昔話・童話・寓話／伝説・地方伝説・地名伝承／怪談・幽霊譚・妖怪譚・怪異譚／都市伝説・現代伝説・ネットロア／民間信仰・俗信・迷信／禁忌・タブー・呪い・まじない／儀礼・祭礼・葬送習俗／宗教説話・異界訪問譚・神隠し などから、確定情報と噛み合う伝承モチーフを参考にしてよい。');
    L.push('- 1回の補完で参考にしてよいのは 原則1件・最大2件 まで。3件以上を混ぜた「ごった煮」は禁止。');
    L.push('- 借りるのは物語ではなく **構造** だけ: 怪異が成立する条件／禁忌／代償／象徴／契約／反復される行為／境界を越えるときの規則／正体を知ったときに起こる変化／名前・鏡像・影・贈り物・食事・扉などが持つ意味。');
    L.push('- 構造の例（そのまま使わず、必ずこの世界固有の設定へ翻案する）: 名前を呼ぶと怪異との接続が成立する／贈り物を受け取ると異界から帰れなくなる／禁じられた部屋を見ると立場が逆転する／鏡像が本人より先に動く／死者への供物を生者が食べると死者の側に数えられる。');
    L.push('- 元ネタの固有名詞・登場人物・地名・筋書きを **そのままコピー・移植しない**。ルール・象徴・代償・構造だけを取り出し、確定情報の世界の言葉と論理に置き換える。');
    L.push('- 地域・文化圏が推定できる場合はその文化圏の伝承を優先し、推定できない場合は世界中の伝承から選ぶ。特定の文化に偏らせない。');
    L.push('- 実在性に確信が持てない話を「◯◯地方に実在する伝説」「古くから伝わる風習」などと **実在として断定しない**。確信が無い場合は、特定地域や実在の出典を明示せず、伝承風の創作として扱う。出典名・元ネタ名・「◯◯の伝説より」といった注記は出力に一切書かない。');
    L.push('- 伝承モチーフは必須ではない。確定情報と噛み合わないなら **使わずに純粋な創作で補完する**。');

    L.push('## 優先順位（上が絶対。下は上を侵さない）');
    L.push('1. ユーザーが入力した確定情報（正史。変更・否定・言い換え・上書きをしない）');
    L.push('2. 確定情報どうしの整合性');
    L.push('3. 空欄を埋めるために必要な要素');
    L.push('4. 伝承モチーフ');
    L.push('5. モデル独自の創作');
    L.push('伝承に寄せるために確定情報を書き換えてはならない（例: 確定した死者を生存させる／確定した設定を別の言葉に言い換える／確定情報に無い事実を確定情報の欄へ足す、はすべて禁止）。確定情報に書かれていない部分だけを、伝承の構造を借りて豊かにする。');

    return L.join('\n');
  }

  // ===================================================================
  // ④ augmentPrompt(p, fields) — fix436のプロンプトへ伝承ブロックを追記(pure)
  //    OFF / shouldUseFolklore=false → p を **一切変更しない**(同一オブジェクトを返す)
  // ===================================================================
  function augmentPrompt(p, fields){
    if (!p || typeof p.sys !== 'string') return p;
    if (off()) return p;
    if (p.sys.indexOf(MARKER) >= 0) return p;              // 冪等
    var ctx = inferContext(fields || []);
    if (!shouldUseFolklore(ctx)) return p;                 // 伝承を使わない → 1バイトも足さない

    var block = buildFolkloreBlock(ctx);
    var out = {};
    for (var k in p){ if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k]; }
    out.sys = p.sys + '\n\n' + block;
    out.folklore = true;
    out.folkloreCtx = ctx;
    out.folkloreBlock = block;
    return out;
  }

  // ===================================================================
  // parseKnownFromPrompt — 送信本文の「## 確定情報」節から fields を復元(pure)
  //    DOMが取れない/変化した場合のフォールバック。
  //    fix436の書式: '- <label> [<key>]: <value>'
  // ===================================================================
  function parseKnownFromPrompt(userText){
    var out = [];
    if (typeof userText !== 'string' || !userText) return out;
    var head = userText.indexOf('## 確定情報');
    if (head < 0) return out;
    var tail = userText.indexOf(SIG_USER);
    var body = (tail > head) ? userText.slice(head, tail) : userText.slice(head);
    var lines = body.split('\n');
    var re = /^-\s*(.+?)\s*\[([A-Za-z0-9_]+)\]\s*:\s*([\s\S]*)$/;
    for (var i = 0; i < lines.length; i++){
      var m = re.exec(trim(lines[i]));
      if (!m) continue;
      var v = trim(m[3]);
      if (!v) continue;
      out.push({ key: m[2], label: m[1], value: v, filled: true, writable: true });
    }
    return out;
  }

  // 送信時に見る fields: DOM が正(fix436と同じ収集器)。取れなければ本文から復元。
  function fieldsForSend(userText){
    var f = null;
    try {
      if (window.__v292Dfix436 && typeof window.__v292Dfix436.collectFields === 'function' && typeof document !== 'undefined'){
        f = window.__v292Dfix436.collectFields(document);
      }
    } catch(e){ f = null; }
    if (f && f.length){
      for (var i = 0; i < f.length; i++){ if (f[i] && f[i].filled && trim(f[i].value)) return f; }
    }
    var pf = parseKnownFromPrompt(userText);
    if (pf.length) return pf;
    return f || [];
  }

  // ===================================================================
  // ★実効経路: XHR送信境界で body を書き換える
  //    fix436 の run() はレキシカルな buildFillPrompt を呼ぶため、
  //    公開APIの差し替えは実送信に効かない(死に経路)。ここが唯一の実効点。
  // ===================================================================
  function isFillBody(s){
    if (typeof s !== 'string' || s.length < 40) return false;
    if (s.indexOf(SIG_USER) < 0) return false;      // fix436の空欄補完プロンプト以外は触らない
    if (s.indexOf('messages') < 0) return false;
    return true;
  }

  var LAST = null;   // 直近に書き換えた実body(検証用)

  function rewriteBody(s){
    if (off()) return s;
    if (!isFillBody(s)) return s;
    var o;
    try { o = JSON.parse(s); } catch(e){ return s; }
    if (!o || !o.messages || !o.messages.length) return s;
    var sys = null, usr = null, i;
    for (i = 0; i < o.messages.length; i++){
      var m = o.messages[i];
      if (!m || typeof m.content !== 'string') continue;
      if (m.role === 'system' && sys === null) sys = m;
      if (m.role === 'user'   && usr === null) usr = m;
    }
    if (!sys || !usr) return s;
    if (sys.content.indexOf(SIG_SYS) < 0) return s;     // fix436のsys以外は触らない
    if (sys.content.indexOf(MARKER) >= 0) return s;     // 冪等

    var p = augmentPrompt({ sys: sys.content, user: usr.content }, fieldsForSend(usr.content));
    if (!p || p.sys === sys.content) return s;          // 伝承なし → 元のまま(文字列一致)
    sys.content = p.sys;
    var out;
    try { out = JSON.stringify(o); } catch(e){ return s; }
    LAST = { sys: p.sys, user: usr.content, ctx: p.folkloreCtx, addedChars: p.folkloreBlock.length + 2 };
    try { console.log(TAG, 'folklore injected into 🎲 fill prompt (+' + LAST.addedChars + ' chars)'); } catch(e){}
    return out;
  }

  function armSend(){
    try {
      if (typeof XMLHttpRequest === 'undefined' || !XMLHttpRequest.prototype) return false;
      var cur = XMLHttpRequest.prototype.send;
      if (typeof cur !== 'function') return false;
      if (cur.__f442) return true;                       // 自分(または own props 継承済みの外側)が居る
      var inner = cur;
      var w = function(body){
        var b = body;
        try { if (typeof b === 'string') b = rewriteBody(b); } catch(e){ b = body; }
        if (arguments.length === 0) return inner.apply(this, arguments);
        return inner.call(this, b);
      };
      // fix419c教訓: 内側関数の own props を全継承(他fixのラップ検出フラグを消さない)
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
      } catch(e){}
      w.__f442 = true;
      XMLHttpRequest.prototype.send = w;
      return true;
    } catch(e){ return false; }
  }

  // ===================================================================
  // 補助: fix436 の公開API(検証口)も同じ pure 関数でラップして整合させる
  //   ※これは実送信経路ではない(死に経路)。実効は上の armSend()。
  // ===================================================================
  var WRAPPED_BFP = null;
  function armExport(){
    try {
      var f436 = window.__v292Dfix436;
      if (!f436 || typeof f436.buildFillPrompt !== 'function') return false;
      var cur = f436.buildFillPrompt;
      if (cur.__f442) return true;
      var inner = cur;
      var w = function(fields){
        var p = inner.apply(this, arguments);
        if (!p) return p;                                 // null = 全欄埋まり → 生成しない
        try { return augmentPrompt(p, fields); } catch(e){ return p; }
      };
      try {
        var ks = Object.keys(inner);
        for (var i = 0; i < ks.length; i++){ try { w[ks[i]] = inner[ks[i]]; } catch(e){} }
      } catch(e){}
      w.__f442 = true;
      f436.buildFillPrompt = w;
      WRAPPED_BFP = w;
      return true;
    } catch(e){ return false; }
  }

  // 起動: sendは即 arm(スクリプト評価時点でXHRは存在する)。exportはfix436の後。
  armSend();
  armExport();
  (function keeper(){
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      try { armSend(); armExport(); } catch(e){}
      if (ticks > 50) clearInterval(iv);                  // 約30秒で停止(有限)
    }, 600);
    window.__v292Dfix442_stopKeeper = function(){ try { clearInterval(iv); } catch(e){} };
  })();
  try { console.log(TAG, 'armed', off() ? '(OFF)' : '(ON)'); } catch(e){}

  // 検証口(冪等ガードを兼ねる)
  window.__v292Dfix442 = {
    inferContext: inferContext,
    shouldUseFolklore: shouldUseFolklore,
    buildFolkloreBlock: buildFolkloreBlock,
    augmentPrompt: augmentPrompt,
    parseKnownFromPrompt: parseKnownFromPrompt,
    rewriteBody: rewriteBody,
    isFillBody: isFillBody,
    off: off,
    armSend: armSend,
    armExport: armExport,
    MARKER: MARKER,
    KW: { folk: KW_FOLK, hard: KW_HARD, nosuper: KW_NOSUPER },
    last: function(){ return LAST; },
    _state: function(){
      var s = false;
      try { s = !!(XMLHttpRequest.prototype.send && XMLHttpRequest.prototype.send.__f442); } catch(e){}
      return { sendArmed: s, exportArmed: !!WRAPPED_BFP, off: off() };
    }
  };
})();
