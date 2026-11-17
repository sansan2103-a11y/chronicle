// =====================================================================
// Chronicle - v292DfixLEAK3: 本文に漏れた「内部出力と特定できる狭い形」の行だけを取り除く（★LEAK3・GPT #127-VV ■4・2026-11-17・既定 OFF）
// ---------------------------------------------------------------------
// 実測（試験物語）: smoke43 腕 N T8 の sys 見出しと指示文の復唱（【世界設定・参照データ】以下は… ほか 6 行）／
//   smoke43 腕 A3 T2 の内部 JSON 風の断片（relationship": "… ／ unresolved": "…）／smoke42 A3 T1 の括弧のト書き（（…流れです））。
// ★r2（独立レビュー: On で自作 40 例中 15 例の正常な本文を消した）: 消すのは「sys 側の文と実際に一致する」行だけに絞った。
//   ・見出しだけの行: sys でしか使わない固有の見出し（SYS_ONLY）だけ。物語にも出る見出し（【開始時の状況】【キャラ属性】…）は数えるだけ。
//   ・見出し＋文の行: 文の先頭 10 字（句読点・空白を除く）が、sys でその見出しの直後に来る文、または sys の文の先頭と一致するときだけ。
//   ・見出しの直後に続く行: 上の 2 つのどちらか、または行の先頭 10 字が sys の文の先頭と一致する行だけ。一致しない行が来たら止め、以降は数えるだけ。
//   ・JSON の鍵: 行頭の開き引用符が欠けた「鍵": "値」の断片だけ。鍵はコードで JSON の鍵として使っているものだけ（推定の 5 個は数えるだけ）。
//     きちんと引用符で始まる "goal": "…" のような行は消さない（数えるだけ）。
//   sys の文の一覧（SYS_PREFIX・SYS_HEAD_TEXT）は tools/build_sys_corpus.py が ff11d6f のコードから作った写し。
// ★r3（再レビュー: 新しい 22 例中 17 例で正常な行を消した）:
//   ・sys の文の一覧は、各見出しの直後に sys で続く指示文（SYS_HEAD_TEXT・15 見出し）だけにした。作例・シナリオの種・UI・コード断片を含んでいた
//     全体の一覧（SYS_PREFIX）は使わない（tools/build_sys_corpus.py に絞り方）。
//   ・見出し＋文（同じ行・次の行）は、その見出し自身の SYS_HEAD_TEXT とだけ照合する。
//   ・固有の見出し（SYS_ONLY）が 1 行だけで出たときは数えるだけ。消すのは、見出しにその見出しの sys の文が続く（同じ行か次の行）とき、
//     または一致した行が 2 行以上つながった塊のときだけ。
//   ・開き引用符が欠けた鍵の断片は、前後 2 行以内に別の内部の印（消す見出しの塊・別の鍵の断片）があるときだけ消す。単独なら数えるだけ。
// 取り除く（v292DfixLEAK3On='1' のときだけ。既定は影＝数えるだけ）:
//   (i)  sys 見出しの行: 行頭が fix459 の MARKERS（本文生成の sys のブロック見出しの登録表）の文字列と完全一致する行。
//        見出しの中身が 4 字以下（【口調】【関係】など、物語の札にもあり得る短い語）のときは、続く文に指示の語があるときだけ。
//        その直後に続く「指示文の復唱」の行（別の【…】で始まる行・指示の語を含む行。「」『』を含まない・120 字以下）もまとめて。
//        物語の行が 1 行でも来たら、そこで止める。
//   (ii) 内部 JSON 風の断片の行: 行の全体が「鍵": "値」の並びで、鍵が下の一覧のどれか。前後の行が JSON の形（{ } [ ] や別の "鍵":）のときは
//        物語の中の JSON の表示かもしれないので取り除かず、数えるだけ。
// 数えるだけ（取り除かない）: 括弧だけの行で終わりが「流れです／予定です／場面です／形です／展開です」等の書き手の説明調のもの、
//   短い見出しで指示の語が続かない行、JSON の形の中の行。
// 取り除くと本文が空になる回は、何も取り除かない（元を残す・数える）。「」『』で始まる行・<say の行には触れない。
// 呼び出し: LEAK1.gate の入口（最終境界・保存と表示の直前）。LEAK1 の kill とは独立。
// 止める: v292DfixLEAK3Off='1'（影も含めて何もしない）。記録はメモリだけ（件数・字数・種類。本文は残さない）。
// 観測: window.__v292DfixLEAK3.stats() / .log()
// =====================================================================
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__v292DfixLEAK3) return;
  var VER = 'leak3-20261117-r3';
  /* 出どころ: v292Dfix459-sys-v2.js の MARKERS_FIX190_DET・MARKERS・MARKERS_CARDS952・MARKERS_MEM958（ff11d6f の literal をそのまま。試験で突き合わせる） */
  var HEADERS = ["【状態の出力・拡張（永続フィールド／fix190）】", "【各キャラの永続状態（傷・関係・未解決／必ず踏まえる）】", "【プレイヤー入力＝主人公の発話】", "【プレイヤー入力＝主人公の行動】", "【プレイヤー入力＝描写の指定】", "【良い1ターンの形】", "【この場面の種（説明はせず、言動と展開に滲ませる）】", "【出力の形式（これだけは形式として守る）】", "【展開を前に進める・優先順位】", "【セリフと物音の区別】", "【守ること】", "【プレイヤーの種】", "【キャラ属性】", "【話者厳守】", "【口調】", "【調整タグ】", "【悲鳴・うめきの話者帰属】", "【痛覚】", "【状態の出力（fix77・必須）】", "【各キャラの現在の状態】", "【各キャラの現在の状態（引き継ぐ。傷/関係/未解決は治療・和解まで保持し勝手に消さない）】", "【正式呼称】", "【本文形式】", "【反応と身体（統合・最優先）】", "【出力の掟】", "【世界の掟】", "【呼称の固定】", "【ダッシュ】", "【whoに使う名前】", "【文体の基本ルール】", "【NPCの登場】", "【展開の推進ルール】", "【境界線ルール（内部管理と地の文の分離・最優先）】", "【描写の作り方（説明せず\"見せる\"・最優先）】", "【この一手で前面に出す人物】", "【本文の長さ】", "【文体ノブ】", "【制約】", "【読ませ方】", "【表記】", "【キャラの反応】", "【口調訂正】", "【関係】", "【打ち明け】", "【NPC間の関係】", "【移動タグ】", "【開始ルール】", "【開始時の状況】", "【要約】", "【身体状態・正史(絶対に覆らない)】", "【世界設定・参照データ】", "【世界設定ここまで】", "【場面の一貫性】", "【設定カード（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】", "【記憶（この物語で確定している事実。常に踏まえ、本文に説明書きとして混ぜない）】"];
  /* 鍵の一覧の出どころ:
       fix135（長期記憶の JSON）: summary・worldinfo・events・turnIdx・event・importance（name・type・desc は物語の中の JSON の表示にも普通に出る語なので入れない）
       fix335（おまかせの JSON）: setting・era_tech・stance・lack_desire・relationship・opening_pressure・secret・world_rule・mood_tone
       fix823（設定の補完の JSON）: personality・coreDesire・coreFear・wound
       状態の欄（傷・関係・未解決・本能・目的・からだ・こころ）の英語の名前: unresolved・instinct・goal・body・mind（★コードに JSON 鍵としては無い。
         実測の漏れ unresolved": に合わせた推定。README の「不確かな点」） */
  var JKEYS = ['summary', 'worldinfo', 'events', 'turnIdx', 'event', 'importance', 'setting', 'era_tech', 'stance', 'lack_desire', 'relationship',
    'opening_pressure', 'secret', 'world_rule', 'mood_tone', 'personality', 'coreDesire', 'coreFear', 'wound'];
  var JKEYS_GUESS = ['unresolved', 'instinct', 'goal', 'body', 'mind'];   /* ★r2: 推定（コードに JSON 鍵として無い）→ 数えるだけ */
  /* sys でしか使わない固有の見出し（見出しだけの行でも消してよいもの）。HEADERS のうち、物語の札・題にもなる語は入れない */
  var SYS_ONLY = ["【状態の出力・拡張（永続フィールド／fix190）】", "【各キャラの永続状態（傷・関係・未解決／必ず踏まえる）】", "【プレイヤー入力＝主人公の発話】", "【プレイヤー入力＝主人公の行動】", "【プレイヤー入力＝描写の指定】", "【良い1ターンの形】", "【この場面の種（説明はせず、言動と展開に滲ませる）】", "【出力の形式（これだけは形式として守る）】", "【展開を前に進める・優先順位】", "【セリフと物音の区別】", "【プレイヤーの種】", "【話者厳守】", "【調整タグ】", "【悲鳴・うめきの話者帰属】", "【状態の出力（fix77・必須）】", "【各キャラの現在の状態（引き継ぐ。傷/関係/未解決は治療・和解まで保持し勝手に消さない）】", "【本文形式】", "【反応と身体（統合・最優先）】", "【出力の掟】", "【whoに使う名前】", "【展開の推進ルール】", "【境界線ルール（内部管理と地の文の分離・最優先）】", "【描写の作り方（説明せず\"見せる\"・最優先）】", "【文体ノブ】", "【口調訂正】", "【移動タグ】", "【身体状態・正史(絶対に覆らない)】", "【世界設定・参照データ】", "【設定カード（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】", "【記憶（この物語で確定している事実。常に踏まえ、本文に説明書きとして混ぜない）】"];
  var NPRE = 10;
  var SYS_HEAD_TEXT = {"【プレイヤーの種】": ["プレイヤがDOSAY", "入力に現れた固有名詞"], "【NPCの登場】": ["場面の空気を読むこと", "人がいて自然な状況街"], "【この一手で前面に出す人物】": ["背景の人物の区別をや"], "【展開を前に進める・優先順位】": ["指示が衝突したら①破"], "【セリフと物音の区別】": ["声に出した言葉だけが"], "【話者厳守】": ["主人公が話しかけた直"], "【キャラの反応】": ["場にいるキャラは出来"], "【調整タグ】": ["本文をすべて書き終え"], "【打ち明け】": ["場が落ち着いている今"], "【NPC間の関係】": ["この場に複数のNPC"], "【各キャラの現在の状態】": ["節を反応の前提にする"], "【制約】": ["負傷者の行動には必ず", "恐怖動揺による能力の"], "【痛覚】": ["直前に重傷骨折断裂切"], "【世界設定・参照データ】": ["以下はこの物語で設定"], "【場面の一貫性】": ["確定した時刻場所階建"]};
  var RX_INSTR = /タグ|本文|地の?文|出力|必須|厳守|禁止|すること|こと[。．]|ルール|指示|sys/;   /* 影の数え（続きの行）だけに使う */
  var Q = '["“”]', V = '[^"“”「」『』<>\\n]{0,120}', KALL = JKEYS.concat(JKEYS_GUESS).join('|');
  /* 行頭の開き引用符が欠けた断片（実測の形）: 鍵": "値 */
  var RX_JFRAG = new RegExp('^\\s*(' + KALL + ')' + Q + '\\s*[:：]\\s*' + Q + '?' + V + Q + '?\\s*[,，]?\\s*$');
  /* 引用符がそろった形（物語の画面表示にもある）: 数えるだけ */
  var RX_JQUOTED = new RegExp('^\\s*[{\\[]?\\s*' + Q + '(' + KALL + ')' + Q + '\\s*[:：]\\s*' + Q + '?' + V + Q + '?\\s*[,，]?\\s*[}\\]]?\\s*$');
  var RX_JSONISH = /^\s*(?:[{}\[\]],?\s*$|["“][A-Za-z_][A-Za-z0-9_]*["”]\s*:)/;
  var RX_STAGE = /^\s*[（(][^「」（）()]{2,80}(?:流れ|予定|場面|形|展開|段取り|ところ)です[。]?[）)]\s*$/;
  var HSET = {}, SSET = {}, KSET = {}, KGUESS = {};
  HEADERS.forEach(function(h){ HSET[h] = 1; }); SYS_ONLY.forEach(function(h){ SSET[h] = 1; });
  JKEYS.forEach(function(k){ KSET[k] = 1; }); JKEYS_GUESS.forEach(function(k){ KGUESS[k] = 1; });
  var NORM = /[\s　、。・，．,.:：;；「」『』（）()【】〔〕\[\]<>＜＞"“”'’!！?？…—\-ー=＝\/／★※]/g;
  function norm(x){ return String(x || '').replace(/【[^】]{1,80}】/g, '').replace(NORM, ''); }
  /* その見出し自身の sys の文と先頭 NPRE 字が一致するか（r3: 一覧全体とは照合しない） */
  function headTextMatch(h, rest){ var n = String(rest || '').replace(NORM, ''); if (n.length < NPRE) return false; var p = n.slice(0, NPRE), a = SYS_HEAD_TEXT[h];
    if (a) for (var i = 0; i < a.length; i++) if (a[i] === p) return true; return false; }

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292DfixLEAK3Off') === '1'; }
  function applyOn(){ return !off() && ls('v292DfixLEAK3On') === '1'; }
  function talkLine(t){ return /^\s*[「『]/.test(t) || /<say\b/i.test(t) || /<\/say>/i.test(t); }

  /* 行頭の見出し: { h, rest, known } か null */
  function headOf(line){ var m = /^\s*★?\s*(【[^】\n]{1,80}】)(.*)$/.exec(String(line || '')); if (!m) return null; return { h: m[1], rest: m[2], known: HSET[m[1]] === 1 }; }
  /* 行の分類（r3）:
       'HT'   … 登録の見出し＋その見出しの sys の文（同じ行）＝それだけで消してよい
       'SH'   … 固有の見出しだけの行（単独では数えるだけ。後ろにその見出しの sys の文が続くと消す）
       'HU'   … 登録の見出しで始まるが一致しない行（数えるだけ）
       null   … 見出しの行でない */
  function headClass(line){
    var t = String(line || ''); if (t.length > 300 || talkLine(t)) return null;
    var hd = headOf(t); if (!hd || !hd.known) return null;
    if (/[「『」』]/.test(hd.rest)) return 'HU';
    if (!hd.rest.trim()) return SSET[hd.h] === 1 ? 'SH' : 'HU';
    return headTextMatch(hd.h, hd.rest) ? 'HT' : 'HU';
  }
  function headerVerdict(line){ var c = headClass(line); return c === 'HT' ? 'yes' : (c ? 'unsure' : null); }
  /* 見出し h の直後の行が、h 自身の sys の文の続きか */
  function ownText(h, line){ var t = String(line || ''); if (!t.trim() || t.length > 300 || talkLine(t) || /[「」『』]/.test(t) || headOf(t)) return false; return headTextMatch(h, t); }
  function followLine(line){ return false; }   /* r3: 一覧全体との照合はしない（互換のため残す） */
  /* JSON の断片: 'frag'（開き引用符が欠けた形・確かな鍵）/ 'fragGuess'（同じ形・推定の鍵）/ 'quoted'（引用符のそろった形）/ null */
  function jsonClass(line){
    var t = String(line || ''); if (t.length > 200 || talkLine(t)) return null;
    var m = RX_JFRAG.exec(t); if (m) return KSET[m[1]] === 1 ? 'frag' : 'fragGuess';
    return RX_JQUOTED.test(t) ? 'quoted' : null;
  }
  function jsonVerdict(line){ var c = jsonClass(line); return c === 'frag' ? 'yes' : (c ? 'unsure' : null); }
  function isJson(line){ return jsonVerdict(line) === 'yes'; }
  function isStage(line){ return RX_STAGE.test(String(line || '')); }

  /* 純関数: 行ごとの判定。返り値 { drop:{i:kind}, shadow:{i:kind} } */
  function scan(narr){
    var lines = String(narr || '').split('\n'), drop = {}, shadow = {}, i, j;
    function nb(k, dir){ for (var x = k + dir; x >= 0 && x < lines.length; x += dir) if (lines[x].trim()) return x; return -1; }
    /* (i) 見出しの塊 */
    for (i = 0; i < lines.length; i++){
      if (!lines[i].trim() || drop[i] || shadow[i]) continue;
      var c = headClass(lines[i]); if (!c) continue;
      if (c === 'HU'){ shadow[i] = 'header-unsure'; continue; }
      var hd = headOf(lines[i]), blk = [i], cur = hd.h, ok = (c === 'HT');
      for (j = nb(i, 1); j >= 0; j = nb(j, 1)){
        var c2 = headClass(lines[j]);
        if (c2 === 'HT' || c2 === 'SH'){ blk.push(j); cur = headOf(lines[j]).h; if (c2 === 'HT') ok = true; continue; }
        if (ownText(cur, lines[j])){ blk.push(j); ok = true; continue; }
        break;
      }
      /* 消すのは: 見出し＋その sys の文（同じ行 HT か、見出しの次の行）を含む塊だけ。固有の見出しだけ（SH のみ）は数えるだけ */
      if (ok){ blk.forEach(function(k){ drop[k] = (k === i ? 'header' : 'recite'); });
        /* 塊の直後に続く、一致しない指示調・見出し調の行は数えるだけ */
        for (j = nb(blk[blk.length - 1], 1); j >= 0; j = nb(j, 1)){ var t = lines[j]; if (t.length > 160 || talkLine(t) || /[「」『』]/.test(t)) break; if (headOf(t) || RX_INSTR.test(t)) shadow[j] = 'recite-unsure'; else break; } }
      else blk.forEach(function(k){ shadow[k] = 'header-unsure'; });
      i = blk[blk.length - 1];
    }
    /* (ii) 鍵の断片: 前後 2 行以内（空行を除く）に別の内部の印（消す見出しの塊・別の鍵の断片）があるときだけ */
    for (i = 0; i < lines.length; i++){
      if (!lines[i].trim() || drop[i] || shadow[i]) continue;
      var jc = jsonClass(lines[i]); if (!jc){ if (isStage(lines[i])) shadow[i] = 'stage'; continue; }
      if (jc !== 'frag'){ shadow[i] = 'json-unsure'; continue; }
      var near = false, ctx = false, k2, d, x;
      for (d = -1; d <= 1; d += 2){ x = i; for (k2 = 0; k2 < 2; k2++){ x = nb(x, d); if (x < 0) break;
        if (drop[x] === 'header' || drop[x] === 'recite') near = true;
        var jx = jsonClass(lines[x]); if (jx === 'frag' || jx === 'fragGuess') near = true;
        if (k2 === 0 && RX_JSONISH.test(lines[x])) ctx = true; } }
      if (near && !ctx) drop[i] = 'json'; else shadow[i] = ctx ? 'json-in-json' : 'json-alone';
    }
    return { lines: lines, drop: drop, shadow: shadow };
  }

  var _log = [], _st = { VER: VER, turns: 0, hit: 0, header: 0, recite: 0, json: 0, shadowHeader: 0, shadowJson: 0, stage: 0, removedLines: 0, removedChars: 0, wouldRemoveLines: 0, emptyGuard: 0, err: 0, shadowRecite: 0 };
  function rec(r){ _log.push(r); if (_log.length > 60) _log.shift(); }
  /* LEAK1.gate の入口から呼ばれる。返り値は本文（影・kill・空になる回はそのまま） */
  function gate(narr, plan){
    if (off() || typeof narr !== 'string') return narr;
    try {
      _st.turns++;
      var sc = scan(narr), lines = sc.lines, kinds = { header: 0, recite: 0, json: 0, shadowHeader: 0, shadowJson: 0, shadowRecite: 0, stage: 0 }, dL = 0, dC = 0, i;
      for (i in sc.drop){ kinds[sc.drop[i]]++; dL++; dC += lines[i].length; }
      for (i in sc.shadow){ var s = sc.shadow[i]; if (s === 'header-unsure') kinds.shadowHeader++; else if (s === 'json-in-json' || s === 'json-unsure' || s === 'json-alone') kinds.shadowJson++; else if (s === 'recite-unsure') kinds.shadowRecite++; else kinds.stage++; }
      var any = dL || kinds.shadowHeader || kinds.shadowJson || kinds.shadowRecite || kinds.stage;
      if (!any) return narr;
      _st.hit++; _st.shadowHeader += kinds.shadowHeader; _st.shadowJson += kinds.shadowJson; _st.stage += kinds.stage; _st.shadowRecite += kinds.shadowRecite; _st.wouldRemoveLines += dL;
      var ap = applyOn(), out = narr, guard = false;
      if (ap && dL){
        var keep = []; for (i = 0; i < lines.length; i++) if (!sc.drop[i]) keep.push(lines[i]);
        var cand = keep.join('\n').replace(/[ \t]*\n{3,}/g, '\n\n').trim();
        if (!cand){ guard = true; _st.emptyGuard++; }
        else {
          out = cand; _st.header += kinds.header; _st.recite += kinds.recite; _st.json += kinds.json; _st.removedLines += dL; _st.removedChars += dC;
          try { if (plan && Array.isArray(plan.narrative)){ var gone = {}; for (i in sc.drop) gone[lines[i].trim()] = 1;
            plan.narrative = plan.narrative.filter(function(pl){ return typeof pl !== 'string' || gone[pl.trim()] !== 1; }); } } catch(e2){}
        }
      }
      rec({ at: Date.now(), kinds: kinds, lines: dL, chars: dC, applied: ap && !guard && dL > 0, emptyGuard: guard });
      return out;
    } catch(e){ _st.err++; return narr; }
  }
  var api = { VER: VER, gate: gate, applyOn: applyOn, off: off,
    stats: function(){ var o = {}; for (var k in _st) o[k] = _st[k]; o.apply = applyOn(); o.off = off(); return o; },
    log: function(){ return _log.slice(); },
    core: { scan: scan, headClass: headClass, headerVerdict: headerVerdict, ownText: ownText, followLine: followLine, jsonClass: jsonClass, jsonVerdict: jsonVerdict, isJson: isJson, isStage: isStage, SYS_HEAD_TEXT: SYS_HEAD_TEXT, HEADERS: HEADERS.slice(), SYS_ONLY: SYS_ONLY.slice(), JKEYS: JKEYS.slice(), JKEYS_GUESS: JKEYS_GUESS.slice(), NPRE: NPRE } };
  if (typeof window !== 'undefined') window.__v292DfixLEAK3 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
