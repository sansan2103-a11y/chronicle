// =====================================================================
// Chronicle - v292DfixNUM1: 序盤のプレイヤー入力の数・約束を終盤まで残す（laneLEAK1・2026-11-13・GPT #127-SW 3）
// 鍵 localStorage v292DfixNUM1On='1'（既定 OFF）／kill v292DfixNUM1Off='1'（On より優先）。FACTS1 の kill（v292DfixFACTS1Off='1'）のときも出さない。
// ---------------------------------------------------------------------
// 現象: earlierFacts（FACTS1/FACTS2）は合計 600 字・新しい行を優先するので、12 ターン目には 1〜2 ターン目の入力の行が窓から落ちる
//       （実測 prod4 K3_O: T12 の earlierFacts は 3 ターン目の行から。T1 の「銀貨三十枚」「薬瓶が五本」が無い）。
// 直し: earlierFacts.items の先頭に、窓から落ちたターンの「プレイヤーの入力にある数量・約束」だけを最大 5 行・合計 200 字で足す。
//   ・拾うのはプレイヤーの入力だけ（AI が書いた本文の数は対象外）。入力の語をそのまま写す（言い換えない）。
//   ・「N ターン目の入力の時点」と書き、今の数だとは言わない。同じ物について後の入力（数・受け渡し・消費）があれば「後の入力を優先：物=M ターン目」と付ける。
//     後の入力の行そのものは窓に残っていればそれを使い、落ちていればそのターンの行も同じ形で出す（新しい入力を先に予算へ入れる）。
//   ・約束・期限は、後の入力で果たした／取り消したことが分かるものは出さない。
//   ・その数（数＋助数詞）と物の名前が直近 2 ターンの本文に近く並んで出ている回は、その項目を出さない（毎ターンの言い直しを誘わない）。
//   ・保存しない。毎回その時点の S.turns から作り直す（取消・やり直しで消えたターンは入らない）。sys 0 字。AI の呼び出し 0。
// ★NUM2（laneNUM2・2026-11-13・GPT #127-SY 4）: 保存済みの本文で決定的に読める変化（物の名前＋消費・受渡し・紛失・補充の動詞が同じ文の同じ区切りにある）を
//   「本文の記述：薬瓶=8ターン目に消費（今の数は不明）」の形で添える。引き算はしない・本文の数を今の数として渡さない（変化があった事実と、今の数が決まらないことだけ）。
//   ・後の入力が優先: その物の最後の入力より前のターンの本文の記述は出さない。入力と同じターンの本文は、入力に同じ種類の動詞があれば出さない（入力の言い直しとみなす）。
//   ・台詞（「」『』）・括弧（）の中・否定（飲まず／渡さない）・未遂（〜かけ／〜ようと）・仮定（〜たら／〜なら）・依頼（〜てください）は数えない。
//   ・「別の／他の」が付く物、名前の前に入力に無い 2 字以上の持ち主・種類（「葡萄酒の瓶」）が付く物は別の物とみなす（人物の名前は同じ物）。
//   ・行数・字数の上限（5 行・200 字）は同じ。保存なし・sys 0 字。
// =====================================================================
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__v292DfixNUM1Core) return;
  var VER = 'num2-20261113';
  var MAX_LINES = 5, MAX_CHARS = 200, CL_MAX = 18, PER_TURN = 3, PR_MAX = 30;
  var NUM = '[0-9０-９〇一二三四五六七八九十百千万]+';
  var CTR = '本|個|枚|冊|巻|斤|脚|台|匹|頭|羽|着|通|束|袋|箱|錠|発|粒|杯|瓶|缶|切れ|丁|振り|つ|名|人|円|両|ゴールド|ドル|キロ|グラム|リットル|部|点|輪|株|隻|艘|挺|張|組|樽|皿|膳|軒|席|個室|部屋';
  var RX_Q = new RegExp('(' + NUM + ')\\s*(' + CTR + ')', 'g');
  var SMALL = /^[一二三四五六七八九1-9１-９]$/;
  var CHG = /(払|渡|預|受け取|受取|もら|貰|使|飲|食べ|失く|無く|なく(?:し|す)|落と|捨|割|壊|売|買|返|配|分け|納め|持ち帰|置い|置き|しまっ|しまう|しまい|仕舞|入れ|減|増|足し|残|消え|点かな|切れ)/;
  var RX_PROMISE = new RegExp('約束|誓|必ず|取り置き|取りに来|迎えに|待ってて|待っていて|返します|返すから|戻ります|戻るから|戻ってくる'
    + '|(?:[0-9０-９一二三四五六七八九十]+時(?:半|[0-9０-９一二三四五六七八九十]+分)?|日没|夜明け|正午|明日|今夜|今晩|明朝)[^、。「」]{0,8}(?:までに?|には|を過ぎ|で[^、。「」]{0,4}閉)');
  var RX_DONE = /約束(?:どおり|通り|を果た|は果た|を守)|返した|返し終|渡した|届けた|納め|取りに来た|受け取りに来|引き取|迎えに来た|迎えに行った|戻ってきた|戻った|間に合|済ませ|済んだ|果たし|払った|支払|終え|終わっ|終わり|取り消|やめにし|破っ/;
  var RX_CONT = /続きを(?:自然に)?進めて|^続きを書/;

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ if (ls('v292DfixNUM1Off') === '1') return false; if (ls('v292DfixFACTS1Off') === '1') return false; return ls('v292DfixNUM1On') === '1'; }
  function str(x){ return String(x == null ? '' : x); }
  function plain(narr){ var t = Array.isArray(narr) ? narr.join('\n') : str(narr); return t.replace(/<[^>]*>/g, ' '); }
  function toks(s){ return (str(s).match(/[一-鿿々]{2,}|[ァ-ヶー]{2,}/g) || []); }

  // 入力 1 つから数量の言及を拾う → [{ key, num, ctr, clause, q }]
  function mentions(text){
    var t = str(text).replace(/\s+/g, ' ').trim(), out = [], m;
    RX_Q.lastIndex = 0;
    while ((m = RX_Q.exec(t)) !== null){
      var num = m[1], ctr = m[2], s = m.index, e = s + m[0].length, after = t.slice(e, e + 4), before = t.slice(0, s);
      if ((ctr === '人' || ctr === '名') && SMALL.test(num)) continue;                    // 二人で／三人で（人数の言い回し）は拾わない。十人以上は拾う
      if (ctr === 'つ' && /^(?:に(?:分|割|折|裂)|目)/.test(after)) continue;               // 二つに分かれ／一つ目
      if (ctr === '本' && /^(?:道|気|調子|槍|立ち)/.test(after)) continue;
      if (ctr === '部' && /^(?:屋|室|分|員|長|活)/.test(after)) continue;
      if (ctr === '台' && /^(?:所|本|詞|風)/.test(after)) continue;
      if (ctr === '点' && /^(?:け|か|い|灯|火)/.test(after)) continue;
      if (ctr === '通' && /^(?:り|っ|じ|す|る|行|路)/.test(after)) continue;
      if (/^(?:ぶん|分(?![か-ん])|ほど先|ずつ)/.test(after) && ctr !== 'つ') { /* 三本ぶん＝長さ */ if (/^(?:ぶん|分)/.test(after)) continue; }
      if (/[一二三四五六七八九十]$/.test(before) ) continue;
      // 物の名前: 数の直前（区切り 、。「」 から数の手前まで。助詞を外す）。無ければ数の直後の「の＋名詞」
      var cut = Math.max(before.lastIndexOf('、'), before.lastIndexOf('。'), before.lastIndexOf('「'), before.lastIndexOf('」'), before.lastIndexOf('『'), before.lastIndexOf('』'), before.lastIndexOf(' '));
      var segC = before.slice(cut + 1);                                                    // 写す範囲の頭
      var seg = segC.replace(/(?:約|計|全部で|合わせて|合計|残り|あと|もう|たった|ちょうど|それぞれ)$/, ''), lastP = (seg.match(/([がをはもにでとの])$/) || [])[1] || '';
      seg = seg.replace(/[がをはもにでとの\s]+$/, '');
      var key = seg.split(/には|では|から|まで|[はにでをともへのがや]/).pop() || '';
      if ((lastP === 'に' || lastP === 'で') && /は/.test(seg)){ var tp = seg.slice(0, seg.lastIndexOf('は')).split(/には|では|から|まで|[にでをともへのがや]/).pop(); if (tp) key = tp; }   // 「通行証は一行に一枚」→ 通行証
      if (key.length > 8) key = key.slice(-8);
      if (!/[一-鿿々ァ-ヶ]/.test(key) || /[ぁ-ん]$/.test(key.replace(/[りんきち]$/, '').slice(-1)) && !/^[おご]?[一-鿿々ァ-ヶー]+[りんきち]?$|^お[一-鿿ぁ-ん]{1,4}$/.test(key) || new RegExp(NUM + '(?:' + CTR + ')').test(key)) key = '';
      if (key && !/^[おご]?[一-鿿々ァ-ヶー]+[りんきち]?$/.test(key)){ var kr = key.match(/[一-鿿々ァ-ヶー]{2,}$/) || key.match(/[一-鿿々ァ-ヶー]{2,}(?=[ぁ-ん]{0,2}$)/); if (kr) key = kr[0]; }   // 「古い地図帳」→ 地図帳（後の入力とつなぐため、名詞の芯だけにする）
      if (!key){ var am = t.slice(e).match(/^(?:の|ある|入りの)([一-鿿々ァ-ヶー]{1,8})/); if (am) key = am[1]; }
      var cs = Math.max(cut + 1, s - 12), kp = key ? before.lastIndexOf(key) : -1;
      if (kp >= cs && (s - cs > 10 || new RegExp(NUM + '\\s*(?:' + CTR + ')').test(before.slice(cs, kp)))) cs = kp;   // 物の名前から写す（長い前置き・別の数を含む前置きは落とす）
      var clause = t.slice(cs, e).replace(/^[と、\s]+/, '');
      if (!segC.trim() && key) clause = t.slice(s, Math.min(t.length, e + 1 + key.length + 1)).replace(/[、。「」].*$/, '');   // 「三本の鍵」
      if (clause.length > CL_MAX) clause = clause.slice(-CL_MAX);
      out.push({ key: key, num: num, ctr: ctr, q: num + ctr, clause: clause, seg: segC });
    }
    return out;
  }
  function promiseClause(text){
    var t = str(text).replace(/\s+/g, ' ').trim(), parts = t.split(/(?<=[。！？])|(?=「)|(?<=」)/), i;
    for (i = 0; i < parts.length; i++){ var p = parts[i].replace(/^[「『]|[」』]$/g, '').trim(); if (p && RX_PROMISE.test(p)) return p.length > PR_MAX ? (p.slice(0, PR_MAX - 1) + '…') : p; }
    return RX_PROMISE.test(t) ? (t.length > PR_MAX ? t.slice(0, PR_MAX - 1) + '…' : t) : '';
  }

  // ---- NUM2: 本文（と入力）の変化の検出（決定的・狭い） ----
  //   物の名前（入力の語そのもの。言い換え・代名詞・末字だけの一致は見ない）の後ろ、同じ文・同じ区切りの中に動詞があるときだけ数える。
  //   区切り: 名前の後ろの最初の「、」まで。次の区切りに別の「〜を」が無ければ、その区切りの終わりまで（「チケットを一枚、美羽に手渡した」）。
  var NB = [   // [種類, 動詞の頭]。後ろに否定・未遂・仮定・依頼が続くものは数えない（NEG_AFTER）
    ['消費', /飲み干|飲み下|飲み込|飲ん|飲ませ|飲む|飲みき|飲み(?=[、。])|あおっ|あおる|呷っ|呷る|使い切|使いき|使い果|使っ|使う|使い(?=[、。])|食べ|かじっ|かじる|かじり|齧|平らげ|割れ|割っ|砕け|燃え尽|撃ち尽|射尽|尽き|射かけ|射た|射っ|放っ|放つ|撃っ|撃ち|振りかけ|塗っ|注ぎ込|注いだ/g],
    ['受渡し', /手渡|渡し|渡す|渡さ|渡っ|預け|受け取|差し出|譲っ|譲り渡|譲る|返し|返す|返さ|配っ|配る|配り|分け与|払っ|払い|払う|売っ|売る|売り|預かっ|預かる/g],
    ['紛失', /落とし|落とす|落ちて|落ちた|落ち(?=[、。])|失くし|失くす|失くな|無くし|無くな|なくし|なくな|失っ|失う|失い|盗ま|盗ん|奪わ|奪い|奪っ|置き忘|捨て|取り落|流され|紛失/g],
    ['補充', /補充|買い足|買い込|買っ|買う|買い(?=[、。])|拾っ|拾う|拾い上|手に入れ|足し|増え|増や|詰め直|もらっ|貰っ|もらう|貰う|追加|仕入れ/g]
  ];
  var BAD_PRE = { '返': /(?:引き|言い|繰り|振り|折り|裏|見|追い|跳ね|くり|生き|思い|折|照り|寝)$/, '渡': /見$/, '払': /(?:咳|追い|振り|取り)$/, '配': /気$/, '落': /(?:目|線|影|肩|声|腰|度|気|命|力|泥|汚れ)を$/, 'な': /い$/, '足': /(?:付け|継ぎ)$/ };
  var BAD_NEXT = { '渡し': /^船/, '割れ': /^目/, '撃ち': /^合/, '放っ': /^て(?:お|置)/ };
  var MOVE_IN = /しまう|しまっ|しまい|仕舞|入れ|置い|置き|置く|残し|残す|持た|持っ|運|積|載せ/;   // 入力だけで見る（移動）
  var NEG_AFTER = /^[ぁ-ゖ]{0,3}?(?:[ずぬ]|ない|なかっ|なけ|なく|ません|まい|かけ|ようと|そうと|そうに|そうな|つもり|たら|だら|れば|なら|ても|でも|ましょう|てくれ|でくれ|てほし|でほし|てください|でください|て下さい|べき|たい|たく)/;
  var NEG_BEFORE = /(?:もし|仮に|まだ)$/;
  var DIFF_PRE = /(?:別の|他の|ほかの|違う|よその)$/;
  var STATE_MOD = /^(?:空|残り|最後|最初|手持ち|自分|あたし|わたし|わたくし|僕|俺|私|彼|彼女|みんな|皆|全員|予備)$/;
  var CONTAINER = /(?:瓶|缶|樽|筒|壺|タンク|ボトル|ボンベ|徳利|弾倉|マガジン|カートリッジ)$/;
  var COUNT_CLS = { '消費': 1, '紛失': 1, '補充': 1 };
  function strip(t){ return str(t).replace(/「[^」]*」|『[^』]*』|（[^）]*）|\([^)]*\)/g, '、'); }   // 台詞・引用・括弧の中は見ない（区切りに置き換える）
  function sentences(narr, isInput){
    var t = Array.isArray(narr) ? narr.join('\n') : str(narr); t = t.replace(/<[^>]*>/g, ' ');
    var L = t.split('\n').filter(function(l){ return !/^\s*〔[^〕]*〕/.test(l); }).join('\n');   // 話者の印の行（台詞）は見ない
    if (!isInput) L = strip(L);
    return L.split(/[。！？!?\n]+/).filter(function(x){ return x.trim(); });
  }
  function findKey(s, key){   // その物の名前が、別の語の一部でなく出ている所（「鍵束」「薪籠」の鍵・薪は数えない）
    var out = [], p = s.indexOf(key);
    while (p >= 0){ if (!/[一-鿿々]/.test(s.charAt(p + key.length))) out.push({ i: p, len: key.length }); p = s.indexOf(key, p + key.length); }
    return out;
  }
  function sameThing(s, o, ctx, cast){   // 名前の前の修飾で「別の物」と分かるものを外す
    var pre = s.slice(0, o.i);
    if (DIFF_PRE.test(pre)) return false;
    var m = pre.match(/([一-鿿々ァ-ヶー]+)の$/), key = s.substr(o.i, o.len);
    if (m && !STATE_MOD.test(m[1]) && (cast || []).indexOf(m[1]) < 0){
      if (m[1].length >= 2 && str(ctx).indexOf(m[1]) < 0) return false;                                  // 「葡萄酒の瓶」＝入力に無い種類・持ち主
      var cp = str(ctx).indexOf('の' + key), cm = cp > 0 ? str(ctx).slice(0, cp).match(/([一-鿿々ァ-ヶー]+)$/) : null;
      if (cm && cm[1] !== m[1] && !STATE_MOD.test(cm[1])) return false;                                      // 入力は「銀の指輪」、本文は「金の指輪」
    }
    return true;
  }
  function verbsIn(s, from, to, res){
    var win = s.slice(from, Math.min(s.length, to + 1)), lim = to - from, k;   // 1 字多く見る（「落ち、」の先読み用）。動詞の頭は区切りの中だけ
    for (k = 0; k < NB.length; k++){
      var rx = NB[k][1], mm; rx.lastIndex = 0;
      while ((mm = rx.exec(win)) !== null){
        if (mm.index >= lim) break;
        var at = from + mm.index, end = at + mm[0].length, before = s.slice(Math.max(0, at - 4), at), after = s.slice(end, end + 8), h = mm[0].charAt(0) === 'な' ? 'な' : (mm[0].match(/[返渡払配落足]/) || [''])[0];
        if (NEG_AFTER.test(after) || NEG_BEFORE.test(before)) continue;
        if (h && BAD_PRE[h] && BAD_PRE[h].test(s.slice(Math.max(0, at - 4), at + mm[0].indexOf(h)))) continue;
        if (BAD_NEXT[mm[0]] && BAD_NEXT[mm[0]].test(after)) continue;
        if (/^(?:落と|落ち)/.test(mm[0]) && /[へに]$/.test(before) && !/(?:地面|床|谷|谷底|川|海|崖|溝|穴|底|外|闇|水)[へに]$/.test(before)) continue;   // 「革袋へ落とした」＝入れる（紛失ではない）
        res[NB[k][0]] = 1;
      }
    }
  }
  function emptyIn(ctx, key){ var c = str(ctx), p = c.indexOf(key); while (p >= 0){ if (/空の?$/.test(c.slice(Math.max(0, p - 2), p)) || /^[はがも]?空/.test(c.slice(p + key.length, p + key.length + 2))) return true; p = c.indexOf(key, p + 1); } return false; }
  function classesIn(text, key, ctx, cast, isInput){   // → { 消費:1, … }（その物について、同じ文の同じ区切りに動詞があるもの）
    var res = {}, ss = sentences(text, isInput), a, b;
    if (!key) return res;
    for (a = 0; a < ss.length; a++){
      var s = ss[a], occ = findKey(s, key);
      for (b = 0; b < occ.length; b++){
        var o = occ[b]; if (!sameThing(s, o, ctx, cast)) continue;
        var st = o.i + o.len, c1 = s.indexOf('、', st), hi = c1 < 0 ? s.length : c1;
        if (CONTAINER.test(key) && !emptyIn(ctx, key) && /空の$|空$/.test(s.slice(Math.max(0, o.i - 2), o.i))) res['消費'] = 1;   // 「空の薬瓶」
        if (s.charAt(st) === 'の') continue;                                                               // 「荷馬車の車輪」「薬瓶の栓」＝名前が別の物の修飾（曖昧なので数えない）
        if (c1 >= 0){ var c2 = s.indexOf('、', c1 + 1), seg = s.slice(c1 + 1, c2 < 0 ? s.length : c2); if (!/[をがは]/.test(seg)) hi = c2 < 0 ? s.length : c2; }   // 次の区切りに別の主語・目的語が無いときだけ延ばす
        hi = Math.min(hi, st + 30);
        if (CONTAINER.test(key) && !emptyIn(ctx, key)){   // 入れ物が空になった（「空の薬瓶」「瓶が空になった」）。入力で最初から空と書かれている物は除く
          if (/^[はがを]?(?:空にな|空にし|空っぽ)/.test(s.slice(st, st + 6))) res['消費'] = 1;
        }
        verbsIn(s, st, hi, res);
        if (isInput && MOVE_IN.test(s.slice(st, hi))) res['移動'] = 1;
      }
    }
    return res;
  }

  // build(turns, items, currentInput) → { lines:[…], dbg:{…} }   turns = S.turns（このターンを送る時点）／items = いまの earlierFacts.items
  function build(turns, items, currentInput, opt){
    turns = Array.isArray(turns) ? turns : []; items = Array.isArray(items) ? items : []; opt = opt || {};
    var N = turns.length, dbg = { cand: 0, visible: 0, repeat: 0, done: 0, over: 0, narr: 0 }, cast = Array.isArray(opt.cast) ? opt.cast : [];
    if (N <= 2) return { lines: [], dbg: dbg, detail: [] };
    var vis = {}, i, j;
    items.forEach(function(r){ var m = str(r).match(/^(\d+)ターン目/); if (m) vis[+m[1]] = str(r); });
    var recent = plain((turns[N - 1] || {}).narrative) + '\n' + plain((turns[N - 2] || {}).narrative);
    // 全ターンの入力（直近 2 ターンも「後の入力」として見る）
    var T = [];
    for (i = 0; i < N; i++){ var pt = str((turns[i] || {}).playerText).replace(/\s+/g, ' ').trim(); if (RX_CONT.test(pt)) pt = ''; T.push({ n: i + 1, text: pt, ms: pt ? mentions(pt) : [], pr: pt ? promiseClause(pt) : '' }); }
    // 名前の無い数（「一本を」「五個は」）は、同じ助数詞で直前に出た物につなぐ
    var lastByCtr = {};
    T.forEach(function(t){ t.ms.forEach(function(m){ if (m.key) lastByCtr[m.ctr] = m.key; else if (lastByCtr[m.ctr]) { m.key = lastByCtr[m.ctr]; m.linked = true; } }); });
    function laterTurns(key, n, ctr, seg){   // その物について n ターン目より後の入力（数の言及／名前＋受け渡しの語）
      var out = []; if (!key) return out;
      for (var a = 0; a < T.length; a++){ var t = T[a]; if (t.n <= n || !t.text) continue;
        if (t.ms.some(function(m){ return m.key === key || (ctr && m.ctr === ctr && share(seg, m.seg)); }) || (CHG.test(t.text) && (t.text.indexOf(key) >= 0 || share(seg, t.text)))) out.push(t.n); }
      return out;
    }
    function share(a, b){   // 数の手前の語どうしが 2 字以上（漢字かカタカナを含む）重なる＝同じ物の話とみなす（つなぎ過ぎる側に倒す）
      a = str(a); b = str(b); for (var x = 0; x + 2 <= a.length; x++){ var w = a.substr(x, 2); if (/[一-鿿々ァ-ヶ]/.test(w) && !/[はがをにでともへのや、。]/.test(w) && b.indexOf(w) >= 0) return true; } return false;
    }
    function near(hay, key, q){   // 直近の本文で、その数と物の名前が近く（20 字以内）に出ているか
      var p = hay.indexOf(q); while (p >= 0){ if (hay.slice(Math.max(0, p - 20), p + q.length + 20).indexOf(key) >= 0) return true; p = hay.indexOf(q, p + 1); } return false;
    }
    function anyCls(text){ var r = {}, k, rx; for (k = 0; k < NB.length; k++){ rx = NB[k][1]; rx.lastIndex = 0; if (rx.test(str(text))) r[NB[k][0]] = 1; rx.lastIndex = 0; } return r; }
    function narrAfter(key, n, later, ctx){   // NUM2: その物の最後の入力のターンから後の本文で、決定的に読める変化 → [{ t, cls:[…] }]
      var from = later.length ? later[later.length - 1] : n, out = [], j;
      var ctxAll = [ctx].concat(later.map(function(x){ return T[x - 1] ? T[x - 1].text : ''; })).join('／');
      for (j = from; j <= N; j++){
        var c = classesIn((turns[j - 1] || {}).narrative, key, ctxAll, cast, false), ks = Object.keys(c);
        if (j === from && ks.length){ var ic = anyCls(T[j - 1] ? T[j - 1].text : ''); ks = ks.filter(function(x){ return !ic[x]; }); }   // 入力と同じターン: 入力に同じ種類の動詞があれば、入力の言い直しとみなす
        if (ks.length) out.push({ t: j, cls: NB.map(function(x){ return x[0]; }).filter(function(x){ return ks.indexOf(x) >= 0; }) });
      }
      return out;
    }
    var cands = [], seenKQ = {}, firstOf = {};
    for (i = 0; i <= N - 3; i++){
      var t = T[i]; if (!t.text) continue;
      var row = vis[t.n], seen = {};
      t.ms.forEach(function(m){
        if (!m.key || m.linked || seen[m.key + m.q]) return; seen[m.key + m.q] = 1; dbg.cand++;
        var isFirst = !firstOf[m.key]; if (isFirst) firstOf[m.key] = t.n;
        if (seenKQ[m.key + '|' + m.q]){ dbg.repeat++; return; } seenKQ[m.key + '|' + m.q] = 1;                       // 同じ物・同じ数の言い直し（前の入力で出した）
        if (row && row.indexOf(m.q) >= 0 && row.indexOf(m.key) >= 0){ dbg.visible++; return; }                 // その入力の行が窓に残っている
        if (near(recent, m.key, m.q)){ dbg.repeat++; return; }                   // 直近の本文・今回の入力にもう出ている
        var lt = laterTurns(m.key, t.n, m.ctr, m.seg);
        var nar = narrAfter(m.key, t.n, lt, t.text); if (nar.length) dbg.narr++;
        cands.push({ n: t.n, kind: 'q', key: m.key, clause: m.clause, later: lt, newest: lt.length === 0, first: isFirst, nar: nar });
      });
      if (t.pr){
        dbg.cand++;
        var tk = toks(t.text), done = false;
        for (j = i + 1; j < N; j++){ var u = T[j].text; if (!u) continue; if (/約束(?:どおり|通り|を果た|は果た|を守)/.test(u) || (RX_DONE.test(u) && tk.some(function(w){ return u.indexOf(w) >= 0; }))) { done = true; break; } }
        if (done) dbg.done++;
        else if (row && row.indexOf(t.pr.replace(/…$/, '').slice(0, 12)) >= 0) dbg.visible++;
        else cands.push({ n: t.n, kind: 'p', clause: t.pr });
      }
    }
    // 予算に入れる順: 果たしていない約束（新しい順）→ その物の最後の言及と最初の言及（新しい順）→ 途中の言及（新しい順）
    // NUM2: 同じ物の本文の記述は、その物の一番新しい入力の行にだけ書く（古い行は「後の入力を優先」でそこを指す）。新しい行が予算で落ちたら古い行に戻す（下）
    cands.forEach(function(c){ if (c.kind !== 'q') return; c.narShow = !!(c.nar && c.nar.length) && !cands.some(function(d){ return d.kind === 'q' && d.key === c.key && d.n > c.n && d.nar && d.nar.length; }); });
    function pr(c){ return c.kind === 'p' ? 0 : (c.narShow ? 1 : ((c.newest || c.first) ? 2 : 3)); }   // NUM2: 本文の記述を持つ行を、約束の次に予算へ入れる（今の数が分からない物を先に知らせる）
    cands.sort(function(a, b){ return pr(a) - pr(b) || b.n - a.n; });
    var groups = {}, order = [], used = 0;
    function render(g){
      var qs = g.q.map(function(c){ return c.clause; }), lat = [], nar = [];
      g.q.forEach(function(c){ if (c.later.length) lat.push(c.key + '=' + c.later.slice(-1).join('・') + 'ターン目'); });
      g.q.forEach(function(c){ if (!c.narShow) return; var last = c.nar.slice(-2), cls = {}, cnt = false;
        last.forEach(function(x){ x.cls.forEach(function(k){ cls[k] = 1; if (COUNT_CLS[k]) cnt = true; }); });
        nar.push(c.key + '=' + last.map(function(x){ return x.t; }).join('・') + 'ターン目に' + Object.keys(cls).join('・') + (cnt ? '（今の数は不明）' : '')); });
      var s = g.n + 'ターン目の入力の時点';
      if (qs.length) s += '：' + qs.join('／') + '（今の数とは限らない' + (lat.length ? '。後の入力を優先：' + lat.join('、') : '') + (nar.length ? '。本文の記述：' + nar.join('、') : '') + '）';
      if (g.p) s += (qs.length ? '・' : '：') + '約束・期限「' + g.p + '」（果たした入力はまだ無い）';
      return s;
    }
    for (i = 0; i < cands.length; i++){
      var c = cands[i], g = groups[c.n], isNew = !g;
      if (isNew){ if (order.length >= MAX_LINES){ dbg.over++; continue; } g = { n: c.n, q: [], p: '' }; }
      var before = isNew ? 0 : render(g).length;
      if (c.kind === 'p'){ if (g.p){ continue; } g.p = c.clause; }
      else { if (g.q.length >= PER_TURN){ dbg.over++; continue; } g.q.push(c); }
      var after = render(g).length;
      if (used - before + after > MAX_CHARS){ if (c.kind === 'p') g.p = ''; else g.q.pop(); dbg.over++; continue; }
      used += after - before; if (isNew){ groups[c.n] = g; order.push(c.n); }
    }
    order.sort(function(a, b){ return a - b; });
    order.slice().reverse().forEach(function(n){ groups[n].q.forEach(function(c){   // 本文の記述を持つ新しい行が選ばれなかった物: 選ばれた一番新しい行に戻す（字数に収まるときだけ）
      if (c.narShow || !c.nar || !c.nar.length) return;
      if (order.some(function(m){ return groups[m].q.some(function(d){ return d.key === c.key && d.narShow; }); })) return;
      var b0 = render(groups[n]).length; c.narShow = true; var a0 = render(groups[n]).length;
      if (used - b0 + a0 > MAX_CHARS){ c.narShow = false; dbg.over++; } else used += a0 - b0; }); });
    return { lines: order.map(function(n){ return render(groups[n]); }), dbg: dbg, detail: order.map(function(n){ var g = groups[n]; return { n: n, q: g.q.map(function(c){ return { key: c.key, clause: c.clause, later: c.later.slice(), nar: c.narShow ? c.nar.map(function(x){ return { t: x.t, cls: x.cls.slice() }; }) : [], narAll: (c.nar || []).map(function(x){ return x.t; }) }; }), p: g.p }; }) };
  }

  var _last = null;
  // apply(parsed, state, factsRule) → parsed（earlierFacts.items の先頭に足す。earlierFacts が無ければ storySoFar の直後に作る）
  function apply(parsed, state, factsRule){
    _last = null;
    try {
      if (!on() || !parsed) return parsed;
      var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
      var items = (parsed.earlierFacts && Array.isArray(parsed.earlierFacts.items)) ? parsed.earlierFacts.items : [];
      var cast = []; try { var C = state && state.cast; if (C){ if (C.hero && C.hero.name) cast.push(str(C.hero.name)); (Array.isArray(C.npcs) ? C.npcs : []).forEach(function(x){ if (x && x.name) cast.push(str(x.name)); }); } } catch(eC){}
      var r = build(turns, items, parsed.currentInput && parsed.currentInput.text, { cast: cast });
      _last = { turns: turns.length, lines: r.lines.slice(), chars: r.lines.join('').length, dbg: r.dbg };
      if (!r.lines.length) return parsed;
      if (parsed.earlierFacts && Array.isArray(parsed.earlierFacts.items)){ parsed.earlierFacts.items = r.lines.concat(parsed.earlierFacts.items); return parsed; }
      var o = {}, k, placed = false;
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue; o[k] = parsed[k]; if (k === 'storySoFar'){ o.earlierFacts = { rule: str(factsRule), items: r.lines }; placed = true; } }
      if (!placed) o.earlierFacts = { rule: str(factsRule), items: r.lines };
      return o;
    } catch(e){ return parsed; }
  }
  var api = { VER: VER, on: on, build: build, apply: apply, mentions: mentions, promiseClause: promiseClause, classesIn: classesIn, last: function(){ return _last; }, MAX_LINES: MAX_LINES, MAX_CHARS: MAX_CHARS };
  if (typeof window !== 'undefined'){ window.__v292DfixNUM1Core = api; window.__v292DfixNUM1 = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
