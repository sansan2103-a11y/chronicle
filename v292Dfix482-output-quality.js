// =====================================================================
// Chronicle TRPG - v292Dfix482: 展開の描写の出口ガード(反復ループ崩壊・ルビ記法漏れ)
// v2 — GPT-5.6監査(2026-07-18・Chronicle実装監査スレッド)の重大指摘を全反映
// ---------------------------------------------------------------------
// ■ 症状(2026-07-17・おしん実プレイのスクショで実測。DS V4 Flash)
//   (a) 反復ループ崩壊: 地の文の1文の中で「いっぱい」が約30回連続する等。
//   (b) ルビ記法の漏れ: 「夜陰《夜陰》」「別種《べっ》」等の青空文庫式ルビ。
//
// ■ v1からの変更(GPT-5.6監査の反映)
//   【重大1】常時の反復折り畳みを廃止。折り畳みは「崩壊判定が立ち、再生成でも
//     直らなかった場合」だけ、病的な閾値(ユニット6回以上/1字30連超)を超えたrunに
//     限定して実施(実閾値: 2字語は9回〜・3字語は7回〜・4〜6字語は6回〜が崩壊扱い。
//     反復回数と削除量の両方で判定=短い語の6〜8回は許容)。「お願い×4」等の正常反復は不触。
//     2字ユニットを先に判定し、ユニット長の誤認(まだ×8→4字×4)も解消。
//     '<' '>' '《' を含むユニットは畳まない(タグ保護)。
//   【重大2】《》は「確信できるルビ」だけ削除: ①直前と同字(夜陰《夜陰》)
//     ②漢字直後のかなルビ(夜陰《やいん》・｜今日《きょう》は｜ごと) ③空《》。
//     それ以外(《契約》等の強調・非ルビ)は【原文のまま残す】。展開もしない。
//   【重大3→案A】自動再生成は【既定OFF】のopt-in(v292Dfix482RetryOn='1'・検証端末のみON)。
//     ON時も60秒レートリミット。fix80との共通試行予算(案B)は次段で実装予定。
//     再送initはマーカー冪等な内側チェーンを通る(fix441/443/459/483/84すべて
//     マーカー/フラグ冪等を実測済=二重適用なし)。
//   【重大4】__f482 は JSON body に入れない。init オブジェクトの非送信プロパティ
//     __f482Retry に変更(fix84が参照。ネットワークへは一切漏れない)。
//   【重大5】対象を「Chronicleの物語生成」だけに限定: chat/completions かつ
//     system 先頭メッセージに Chronicle 固有ブロック(【出力の形式/良い1ターンの形/
//     守ること】)を含むものだけ。他のchat/completionsは完全素通し。
//   【中1】Response再構築: 再生成品は res2.ok の時だけ採用。ヘッダは
//     content-length/encoding を落とし content-type を明示。無変更なら元のResponseを
//     そのまま返す(再生成採用かつ無修復なら res2 をそのまま返す)。
//   【中2】採用判定を辞書式に: degenerate → dupRatio → maxReps → removable。
//   【軽微】seen=Object.create(null) / stats.degenerateはRetryOffでも計上 /
//     lastに first/retry/adopted の3評価を記録。
//   再生成サンプリングは temp0.7/top_p0.9/freq0.5(0.7は固有名詞揺れ→話者帰属への
//     副作用があるため監査推奨値0.5へ)。
//
// ■ 読込位置: index.html 最後尾(fix456の後)=fetchラッパの最外殻。
//   ⚠ fix419c: inner の own props を全継承。冪等フラグは関数上。
// 冪等 : window.__v292Dfix482.__armed / fetch関数上 _f482
// OFF  : localStorage v292Dfix482Off='1'      … 全停止
//        localStorage v292Dfix482RetryOff='1' … 再生成だけ停止(ルビ修復は生きる)
// 検証口: window.__v292Dfix482 = { detectRuns, collapsePathological, stripRuby,
//         assess, sanitizeRuby, better, isChronicleNarrative, stats, last }
// ロールバック: OFFスイッチ or scriptタグ削除
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix482 && G.__v292Dfix482.__armed) return;
  var TAG = '[v292Dfix482:output-quality]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix482Off') === '1'; }
  // 自動再生成は【既定OFF】のopt-in(GPT-5.6再監査・案A=条件付きGOの条件)。
  // ON: v292Dfix482RetryOn='1'(検証端末のみ)。RetryOff='1'は強制停止(ONより優先)。
  function retryOn(){ return ls('v292Dfix482RetryOff') !== '1' && ls('v292Dfix482RetryOn') === '1'; }

  // ===================================================================
  // pure関数群(nodeテスト対象。DOM/localStorage不使用)
  // ===================================================================

  // 病的閾値(これ未満の反復は正常表現として一切触らない)
  var MULTI_MIN_REPS  = 6;    // 2〜6字ユニットの連続回数(お願い×4〜5は正常)
  var SINGLE_MAX_RUN  = 30;   // 1字連続の許容上限(悲鳴・長音は30連まで演出)
  var SINGLE_KEEP     = 8;    // 病的な1字連続を畳んだ後に残す回数
  var MULTI_KEEP      = 3;    // 病的なユニット反復を畳んだ後に残す回数

  var RE_MONO = /^(.)\1*$/;               // ユニットが同一文字だけ
  function unitSkip(u){                    // タグ・括弧を含むユニットは不触
    return RE_MONO.test(u) || u.indexOf('<') >= 0 || u.indexOf('>') >= 0
        || u.indexOf('《') >= 0 || u.indexOf('》') >= 0;
  }

  // 検知と修復を同一ロジックで(applyがfalseなら計測のみ・textは不変)
  //   2字ユニット→3〜6字ユニット→1字連続 の順(ユニット長の誤認を防ぐ)
  function scanRuns(text, apply){
    var r = { text: text, removable: 0, removableMulti: 0, removableSingle: 0,
              runs: 0, maxRepsMulti: 0, maxSingleRun: 0 };
    if (typeof text !== 'string' || !text) return r;
    var out = text;
    function multi(re, keep){
      out = out.replace(re, function(m, u){
        if (unitSkip(u)) return m;
        var reps = m.length / u.length;
        if (reps < MULTI_MIN_REPS) return m;               // 正常反復は不触
        r.runs++; r.maxRepsMulti = Math.max(r.maxRepsMulti, reps);
        r.removableMulti += m.length - u.length * keep;
        if (!apply) return m;
        return new Array(keep + 1).join(u);
      });
    }
    multi(/(..)\1{4,}/g, MULTI_KEEP);          // 2字ユニット(先に判定=誤認防止)
    multi(/(.{3,6}?)\1{3,}/g, MULTI_KEEP);     // 3〜6字ユニット
    out = out.replace(/(.)\1{11,}/g, function(m, c){
      r.maxSingleRun = Math.max(r.maxSingleRun, m.length);
      if (m.length <= SINGLE_MAX_RUN) return m;            // 悲鳴・長音は演出として保持
      r.runs++;
      r.removableSingle += m.length - SINGLE_KEEP;
      if (!apply) return m;
      return new Array(SINGLE_KEEP + 1).join(c);
    });
    r.text = apply ? out : text;
    r.removable = r.removableMulti + r.removableSingle;
    return r;
  }
  function detectRuns(text){ return scanRuns(text, false); }
  // タグ(<...>)全体をプレースホルダへ退避してから畳む=タグ本体・属性内は構造的に不触
  function collapsePathological(text){
    if (typeof text !== 'string' || !text) return scanRuns(text, true);
    var tags = [];
    var protectedText = text.replace(/<[^<>\n]{0,80}>/g, function(tag){
      tags.push(tag);
      return '\uE000' + (tags.length - 1) + '\uE001';
    });
    var r = scanRuns(protectedText, true);
    r.text = r.text.replace(/\uE000(\d+)\uE001/g, function(_, i){ return tags[+i] || ''; });
    return r;
  }

  // --- ルビ除去(確信できるルビだけ。その他の《》は原文保持) -------------
  var RE_KANA_ONLY = /^[ぁ-ゖァ-ヺー・゛゜]{1,12}$/;  // かな+長音のみ
  var RE_CJK_TAIL  = /[一-鿿々〆ヶ]$/;                // 直前が漢字か
  function stripRuby(text){
    var n = 0;
    if (typeof text !== 'string' || !text) return { text: text, count: 0 };
    // ｜漢字《かな》 → 漢字 (青空文庫式のルビ起点｜ごと除去)
    var out = text.replace(/｜([一-鿿々〆ヶ]{1,12})《([^《》\n]{1,12})》/g, function(m, base, inner){
      if (RE_KANA_ONLY.test(inner)){ n++; return base; }
      return m;
    });
    out = out.replace(/《([^《》\n]{0,20})》/g, function(m, inner, pos, whole){
      // pos/whole は「この replace が走査中の文字列」基準(=｜パス適用後)で常に正しい
      var before = whole.slice(Math.max(0, pos - 12), pos);
      if (!inner){ n++; return ''; }                                        // 空《》
      if (inner.length <= 12 && before.slice(-inner.length) === inner){     // 夜陰《夜陰》
        n++; return '';
      }
      if (RE_KANA_ONLY.test(inner) && RE_CJK_TAIL.test(before)){            // 漢字《かな》
        n++; return '';
      }
      return m;   // ルビと確信できないものは原文のまま(展開もしない)
    });
    if (n === 0) return { text: text, count: 0 };
    return { text: out, count: n };
  }
  function sanitizeRuby(text){
    var r = stripRuby(text);
    return { text: r.text, changed: r.count > 0 && r.text !== text, ruby: r.count };
  }

  // --- ★fix482m（Offline 候補・GPT 裁定 2026-10-09「明白なマークアップ残骸」）-----------
  //   LLM の道具呼び出し・会話制御の記法が本文へ漏れたものだけを検出する（実測: 15T の T12 末尾に </parameter>）。
  //   Chronicle 自身のタグ（say / react / state / br 等）・《》・「」・HTML 風の一般語は対象外。
  //   修復は「その記法トークンだけ」を外す（前後の文は 1 文字も変えない）。トークンだけの行は行ごと消す。
  //   検出数は assess().markup に載せるだけ（degenerate にしない＝再生成の引き金にしない）。
  //   OFF: localStorage v292Dfix482mOff='1'（検出・修復とも止める。従来と byte 一致）
  var MARKUP_NAMES = 'parameter|invoke|function_calls|function_results|antml:[a-z_]+|tool_calls?|tool_use|tool_result|tool_response|function_call';
  var RE_MARKUP = new RegExp(
      '<\\/?(?:' + MARKUP_NAMES + ')(?:\\s+name="[^"\\n<>]{0,60}")?\\s*\\/?>'     // <parameter name="x"> / </parameter> / <invoke ...>
    + '|<\\|(?:im_start|im_end|im_sep|endoftext|eot_id|start_header_id|end_header_id|eom_id|begin_of_text|end_of_text)\\|>'   // 会話制御トークン
    + '|\\[\\/?INST\\]|<<\\/?SYS>>',
    'g');
  function markupOff(){ return ls('v292Dfix482mOff') === '1'; }
  function detectMarkup(text){
    if (typeof text !== 'string' || !text) return { count: 0, tokens: [] };
    var m = text.match(RE_MARKUP) || [];
    return { count: m.length, tokens: m.slice(0, 8) };
  }
  function stripMarkup(text){
    if (typeof text !== 'string' || !text) return { text: text, count: 0 };
    var n = 0;
    var out = text.split('\n').map(function(line){
      var had = false;
      var l2 = line.replace(RE_MARKUP, function(){ n++; had = true; return ''; });
      return (had && !l2.trim()) ? null : l2;                  // 記法だけの行は行ごと
    }).filter(function(l){ return l !== null; }).join('\n');
    return n ? { text: out, count: n } : { text: text, count: 0 };
  }

  // --- ★fix971（QA127S 実プレイ観測・2026-10-15）state 属性の断片だけの行を外す ----------------------------
  //   実測（本番 BUNDLE7 r4・QA 物語 smv92e8vv1f T2）: 本文の末尾に「<関係=主人公である宗一への信頼"/>」が
  //   そのまま表示された。モデルが <state …> の属性名をタグ名のように書いた断片で、buildProsePlan（state/react/summary
  //   タグと半角英字の属性行だけを外す）にも fix482m（道具呼び出しの記法だけ）にも掛からない。
  //   対象は「行の全体が、state の属性ラベル（からだ/こころ/本能/目的/傷/関係/未解決）＋ '=' で始まる断片」だけ:
  //     ・'<ラベル=' で始まり '>'／'/>' で閉じてそこで行が終わる（例: <関係=…"/>）、または
  //       'ラベル="…"' の後に '/>' か '>' だけが続いて行が終わる（例: 関係="…"/>）行
  //     ・<state / <say / <react を含む行・地の文・セリフ（「」）を含む行は触らない
  //   行ごと外す（他の行は 1 文字も変えない）。断片の中身を state として救済はしない（帰属が不明なため）。
  //   OFF: localStorage v292Dfix971Off='1'（従来と byte 一致）
  /* ★GPT #127-T: 断片「だけ」の行に限る。閉じ（> または />）の後ろに文字が続く行・閉じていない行・断片と本文が同じ行に
     ある行は、安全に分けられないので触らない（不変）。 */
  var RE_STATE_FRAG = /^\s*(?:<\s*(?:からだ|こころ|本能|目的|傷|関係|未解決)\s*=[^<>\n]*\/?>|(?:からだ|こころ|本能|目的|傷|関係|未解決)\s*=\s*"[^"<>\n]*"\s*\/?>)\s*$/;
  function fragOff(){ return ls('v292Dfix971Off') === '1'; }
  function stripStateFrag(text){
    if (typeof text !== 'string' || !text) return { text: text, count: 0 };
    var n = 0;
    var out = text.split('\n').filter(function(line){
      if (/<state\b|<say\b|<react\b|「|」/.test(line)) return true;
      if (RE_STATE_FRAG.test(line)){ n++; return false; }
      return true;
    }).join('\n');
    return n ? { text: out, count: n } : { text: text, count: 0 };
  }

  // --- ★fix482s（GPT #127-A Q3・2026-10-15）高確度の構造異常だけを「取り直し候補」にする ----------
  //   対象は 2 種だけ:
  //    ① 本文に漏れた道具呼び出し・会話制御の記法（RE_MARKUP と同じ集合）。ただし
  //       ``` 囲み・`…`・「」『』の中にあるものは正当な引用・コードとして数えない（certain にしない）。
  //    ② 明確な途中切れ: finish_reason が長さ打ち切り（length / max_tokens）／本文の末尾が「、」等で
  //       終わる／閉じていない <say>・タグ・括弧で終わる／{ で始まる JSON が閉じずに終わる。
  //   判定しないもの: 歴史的仮名遣いだけ・句点が無いだけ（末尾が普通の文字で終わるものは suspect として
  //     記録だけ＝再生成の引き金にしない）。
  //   再生成そのものは既存 fix482 の経路（retryOn=opt-in・fix494 共通予算・60 秒制限）を通るだけ。
  //   新しい再送枠・費用は作らない。OFF: localStorage v292Dfix482sOff='1'（従来と同じ動き）。
  function structOff(){ return ls('v292Dfix482sOff') === '1'; }
  var RE_TRAIL_TAGS = /(?:\s*<(?:react|state)\b[^<>]*\/?>\s*|\s*<\/(?:react|state)>\s*)+$/;
  function maskQuoted(text){
    // 正当な引用・コードの範囲を空白で塗る（位置は保つ）
    return String(text)
      .replace(/```[\s\S]*?```/g, function(m){ return m.replace(/[^\n]/g, ' '); })
      .replace(/`[^`\n]{1,200}`/g, function(m){ return m.replace(/./g, ' '); })
      .replace(/「[^「」]{0,400}」/g, function(m){ return m.replace(/[^\n]/g, ' '); })
      .replace(/『[^『』]{0,400}』/g, function(m){ return m.replace(/[^\n]/g, ' '); });
  }
  function proseOf(content){
    // 返り値: { prose, jsonCut }（JSON 形式なら narrative、素の形式なら末尾の react/state タグを外した本文）
    var s = String(content == null ? '' : content).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    var t = s.trim();
    if (t.charAt(0) === '{'){
      try {
        var j = JSON.parse(t);
        var nv = j && (j.narrative != null ? j.narrative : (j.plan && j.plan.narrative));
        if (Array.isArray(nv)) nv = nv.filter(function(x){ return typeof x === 'string'; }).join('\n');
        return { prose: (typeof nv === 'string') ? nv : null, jsonCut: false };
      } catch(e){
        return { prose: null, jsonCut: !/\}\s*$/.test(t) };
      }
    }
    return { prose: t.replace(RE_TRAIL_TAGS, ''), jsonCut: false };
  }
  var RE_END_COMMA = /[、，,]$/;
  var RE_TERMINAL  = /[。．！？!?…‥」』）)】〕〉》"'”’〜ー―—\-.~♪☆★]$/;
  function structural(content, finish){
    var r = { certain: false, markup: 0, markupQuoted: 0, trunc: null, suspect: null };
    if (typeof content !== 'string' || !content) return r;
    // ① 漏れた記法
    var all = (content.match(RE_MARKUP) || []).length;
    if (all){
      var bare = (maskQuoted(content).match(RE_MARKUP) || []).length;
      r.markup = bare; r.markupQuoted = all - bare;
    }
    // ② 途中切れ
    var f = String(finish || '').toLowerCase();
    if (f === 'length' || f === 'max_tokens' || f === 'max_output_tokens') r.trunc = 'finish_length';
    else {
      var p = proseOf(content);
      if (p.jsonCut) r.trunc = 'json_cut';
      else if (typeof p.prose === 'string'){
        var q = p.prose.replace(/\s+$/, '');
        if (q){
          var tailLine = q.slice(q.lastIndexOf('\n') + 1);
          var endsWithTag = /<[^<>]*>$/.test(q);                                        // </say> や …/> で終わる＝文の終わりとして扱う
          if (/<[a-zA-Z][^<>]*$/.test(tailLine)) r.trunc = 'open_tag';              // <say who="… で終わる
          else if (endsWithTag) { /* 完結したタグで終わる＝途中切れとみなさない */ }
          else if (/<say\b[^<>]*>(?:(?!<\/say>)[\s\S])*$/.test(q) && !RE_TERMINAL.test(q)) r.trunc = 'open_say'; // </say> も終端記号も無いまま終わる
          else if (RE_END_COMMA.test(q)) r.trunc = 'comma';
          else {
            var tail = q.slice(-200);
            var oq = (tail.match(/「/g) || []).length - (tail.match(/」/g) || []).length;
            var lastOpen = Math.max(q.lastIndexOf('「'), q.lastIndexOf('『'));
            var lastClose = Math.max(q.lastIndexOf('」'), q.lastIndexOf('』'));
            if (oq > 0 && lastOpen > lastClose && q.length - lastOpen <= 200) r.trunc = 'open_bracket';
            else if (!RE_TERMINAL.test(q)) r.suspect = 'no_terminal';             // 記録だけ（再生成しない）
          }
        }
      }
    }
    r.certain = (r.markup > 0) || !!r.trunc;
    return r;
  }
  function adoptRetry(aR, sR, aF, sF){
    if (sF && sF.certain){
      if (sR && sR.certain) return false;                 // 取り直しても構造異常なら初回のまま
      if (aR.degenerate && !aF.degenerate) return false;  // 取り直しで新たに崩壊したら初回のまま
      return true;
    }
    return better(aR, aF);
  }

  // --- 文単位の重複率 --------------------------------------------------
  function dupSentenceRatio(text){
    var parts = String(text || '').split(/[。．！？!?]/)
      .map(function(s){ return s.trim(); })
      .filter(function(s){ return s.length >= 4; });
    if (parts.length < 4) return 0;
    var seen = Object.create(null), uniq = 0;
    for (var i = 0; i < parts.length; i++){ if (!seen[parts[i]]){ seen[parts[i]] = 1; uniq++; } }
    return 1 - (uniq / parts.length);
  }

  // --- 崩壊判定(病的閾値ベース) ---------------------------------------
  function assess(text){
    var d = detectRuns(text);
    var dup = dupSentenceRatio(text);
    var degenerate = (d.maxRepsMulti >= MULTI_MIN_REPS && d.removableMulti >= 12)
                  || (d.removableMulti >= 40)
                  || (d.maxSingleRun > SINGLE_MAX_RUN)
                  || (dup > 0.5);
    var r = { degenerate: degenerate, removable: d.removable, removableMulti: d.removableMulti,
             maxReps: d.maxRepsMulti, maxSingleRun: d.maxSingleRun, dupRatio: dup };
    if (!markupOff()){ var mk = detectMarkup(text); if (mk.count) r.markup = mk.count; }   /* ★fix482m: 計測のみ（degenerate にしない＝再生成の引き金にしない。GPT #125-BF: 自動 LLM 再生成は禁止） */
    return r;
  }

  // --- 採用判定(辞書式: degenerate → dupRatio → maxReps → removable) ---
  function better(a2, a1){
    if (a2.degenerate !== a1.degenerate) return !a2.degenerate;
    if (Math.abs(a2.dupRatio - a1.dupRatio) > 0.05) return a2.dupRatio < a1.dupRatio;
    if (a2.maxReps !== a1.maxReps) return a2.maxReps < a1.maxReps;
    return a2.removable < a1.removable;
  }

  // --- 対象判定: Chronicleの物語生成だけ(重大5) ------------------------
  var SYS_SIG = /【(出力の形式|良い1ターンの形|守ること)/;
  function isChronicleNarrative(url, init){
    try {
      if (typeof url !== 'string' || url.indexOf('chat/completions') < 0) return false;
      if (!init || typeof init.body !== 'string') return false;
      if (init.body.indexOf('"messages"') < 0) return false;
      var body = JSON.parse(init.body);
      var m0 = body && body.messages && body.messages[0];
      return !!(m0 && m0.role === 'system' && typeof m0.content === 'string'
                && SYS_SIG.test(m0.content));
    } catch(e){ return false; }
  }

  // ===================================================================
  // fetch境界(ブラウザ実行時のみ)
  // ===================================================================
  var stats = { checked: 0, degenerate: 0, retried: 0, retryFixed: 0,
                rubyFixed: 0, collapsed: 0, rateLimitSkips: 0, budgetSkips: 0, errors: 0 };
  // ★fix494(2026-07-19): fix80との共通リトライ予算。物理送信の実境界(このwrapperのinner.call)で
  //   1消費し、1論理ターンの物理送信を最大3回に固定。init上の非送信プロパティ(JSON bodyには入れない)。
  var BUDGET_KEY = '__chronicleAttemptBudget', BUDGET_MAX = 3;
  function getBudget(init, create){
    if (!init || typeof init !== 'object') return null;
    var b = init[BUDGET_KEY];
    if (!b && create){ b = init[BUDGET_KEY] = { remaining: BUDGET_MAX, sent: 0, limit: BUDGET_MAX }; }
    return b || null;
  }
  var last = null;
  var lastRetryAt = 0;
  var RETRY_COOLDOWN_MS = 60000;   // 課金暴発ガード: 再生成は60秒に1回まで

  function extract(raw){
    try {
      var i = raw.indexOf('{');
      if (i < 0) return null;
      var json = JSON.parse(raw.slice(i));
      var ch = json && json.choices && json.choices[0];
      if (ch && ch.message && typeof ch.message.content === 'string'){
        return { pad: raw.slice(0, i), json: json, content: ch.message.content };
      }
    } catch(e){}
    return null;
  }
  function finishOf(json){   /* ★fix482s: 取れる時だけ（無ければ null。推測しない） */
    try {
      var c = json && json.choices && json.choices[0];
      return (c && (c.finish_reason || c.native_finish_reason || c.stop_reason)) || null;
    } catch(e){ return null; }
  }
  function rebuild(ex, content){
    ex.json.choices[0].message.content = content;
    return ex.pad + JSON.stringify(ex.json);
  }
  function safeHeaders(res){
    var h;
    try { h = new Headers(res.headers); } catch(e){ h = new Headers(); }
    try { h.delete('content-length'); h.delete('content-encoding'); h.delete('transfer-encoding'); } catch(e){}
    try { h.set('content-type', 'application/json; charset=utf-8'); } catch(e){}
    return h;
  }

  function makeRetryInit(init, why){
    try {
      var body = JSON.parse(init.body);
      body.temperature = 0.7;
      body.top_p = 0.9;
      body.frequency_penalty = 0.5;   // 0.7は固有名詞揺れ→話者帰属への副作用(監査指摘5)
      body.presence_penalty = 0.3;
      if (body.messages && body.messages[0] && body.messages[0].role === 'system'
          && typeof body.messages[0].content === 'string'
          && body.messages[0].content.indexOf('【再生成】') < 0){
        body.messages[0].content += (why === 'structural')   /* ★fix482s: 構造異常の取り直し文言（崩壊時の文言は従来のまま） */
          ? '\n【再生成】直前の出力は途中で切れていたか、内部の記法が混じっていた。物語の本文だけを最後の文まで書き切り、そのあとに決まったタグを置く。'
          : '\n【再生成】直前の出力は同じ語の機械的な繰り返しで壊れていた。同じ語や同じ言い回しを続けて繰り返さず、普通の文章で書き直す。';
      }
      var init2 = {};
      for (var k in init){ if (Object.prototype.hasOwnProperty.call(init, k)) init2[k] = init[k]; }
      init2.body = JSON.stringify(body);
      init2.__f482Retry = true;   // 非送信プロパティ(JSON bodyには入れない=重大4)
      return init2;
    } catch(e){ return null; }
  }

  function install(){
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    if (window.fetch._f482 === true) return;
    var inner = window.fetch;
    // ★fix494(GPT再監査): inner が native(=最内層)の時だけ物理送信を計上。多重ラップ順序に非依存。
    var innerIsNative = !(inner && (inner.__fix80 || inner._f482));

    var wrapped = async function(input, init){
      var url = (input && input.url) || String(input || '');
      if (off() || !isChronicleNarrative(url, init)){
        var bpass = getBudget(init, false);   // ★fix494: 非対象は既存予算のみ消費(作成しない)
        /* ★fix503: fix482は予算非所有(読むだけ)。減算はfix80の送信経路のみ=二重減算の根治(GPT監査) */
        return inner.apply(this, arguments);
      }

      // ★fix494: 物語生成=対象。予算を用意し初回送信を1消費(実境界=このinner.call)。
      var budget = getBudget(init, true);
      /* ★fix503: fix482は予算非所有。初回送信の計上は内側fix80が行う(二重減算の根治) */
      var res = await inner.call(this, input, init);

      try {
        stats.checked++;
        var raw = await res.clone().text();
        var ex = extract(raw);
        if (!ex) return res;                        // 形式が想定外なら素通し

        var aFirst = assess(ex.content);
        var adoptedRes = res, adoptedRaw = raw, adoptedEx = ex, aAdopted = aFirst;
        var usedRetry = false, aRetry = null;
        var sFirst = null, sRetry = null;                 /* ★fix482s */
        if (!structOff()){
          sFirst = structural(ex.content, finishOf(ex.json));
          if (sFirst.certain) stats.structural = (stats.structural || 0) + 1;
          else if (sFirst.suspect) stats.structSuspect = (stats.structSuspect || 0) + 1;
        }
        var sCertain = !!(sFirst && sFirst.certain);

        if (aFirst.degenerate) stats.degenerate++;  // RetryOffでも計上(軽微指摘)

        if ((aFirst.degenerate || sCertain) && res.ok && retryOn()){
          var now = Date.now();
          if (budget && budget.remaining <= 0){
            stats.budgetSkips++;                    // ★fix494: 共通予算切れ→再生成しない(物理送信の暴発根絶)
          } else if (now - lastRetryAt < RETRY_COOLDOWN_MS){
            stats.rateLimitSkips++;                 // 課金暴発ガード(60秒レートリミット)
          } else {
            var init2 = makeRetryInit(init, (sCertain && !aFirst.degenerate) ? 'structural' : undefined);
            if (init2){
              lastRetryAt = now;
              stats.retried++;
              /* ★fix503: fix482は予算非所有。再生成送信の計上も内側fix80が行う(二重減算の根治) */
              try {
                var res2 = await inner.call(this, input, init2);
                if (res2 && res2.ok){               // 再生成品はokの時だけ採用候補(中1)
                  var raw2 = await res2.clone().text();
                  var ex2 = extract(raw2);
                  if (ex2){
                    aRetry = assess(ex2.content);
                    if (sCertain) sRetry = structural(ex2.content, finishOf(ex2.json));
                    if (sCertain ? adoptRetry(aRetry, sRetry, aFirst, sFirst) : better(aRetry, aFirst)){
                      adoptedRes = res2; adoptedRaw = raw2; adoptedEx = ex2;
                      aAdopted = aRetry; usedRetry = true;
                      if (!aRetry.degenerate && !(sRetry && sRetry.certain)) stats.retryFixed++;
                    }
                  }
                }
              } catch(e){ /* 再生成失敗は無視して初回応答で続行 */ }
            }
          }
        }

        // 修復: ①確信ルビ除去(常時・外科的) ②病的runの折り畳み(崩壊が残る時だけ)
        var content = adoptedEx.content;
        var ruby = sanitizeRuby(content);
        content = ruby.text;
        var mkFixed = 0;                                          /* ★fix482m: 明白な記法トークンだけ外す */
        if (!markupOff()){ var mk = stripMarkup(content); if (mk.count){ content = mk.text; mkFixed = mk.count; stats.markupFixed = (stats.markupFixed || 0) + 1; } }
        if (!fragOff()){ var sf = stripStateFrag(content); if (sf.count){ content = sf.text; stats.stateFragFixed = (stats.stateFragFixed || 0) + sf.count; } }   /* ★fix971 */
        var collapsed = false;
        if (aAdopted.degenerate){
          var c = collapsePathological(content);
          if (c.text !== content){ content = c.text; collapsed = true; }
        }
        var changed = (content !== adoptedEx.content);
        if (ruby.changed) stats.rubyFixed++;
        if (collapsed) stats.collapsed++;

        last = { first: aFirst, retry: aRetry, adoptedRetry: usedRetry,
                 ruby: ruby.ruby, collapsed: collapsed, markup: mkFixed };
        if (sFirst){ last.structFirst = sFirst; last.structRetry = sRetry; }   /* ★fix482s（OFF 時は従来と同形） */
        if (sFirst && (sFirst.certain || sFirst.suspect)){
          try { console.log(TAG, 'structural:', JSON.stringify({ first: sFirst, retry: sRetry, adopted: usedRetry, retryOn: retryOn() })); } catch(e){}
        }

        if (!changed) return adoptedRes;            // 無変更なら採用Responseをそのまま返す

        try { console.log(TAG, 'repaired:', JSON.stringify({
          deg: aAdopted.degenerate, retry: usedRetry, ruby: ruby.ruby, collapsed: collapsed, markup: mkFixed })); } catch(e){}
        return new Response(rebuild(adoptedEx, content), {
          status: adoptedRes.status, statusText: adoptedRes.statusText,
          headers: safeHeaders(adoptedRes) });
      } catch(e){
        stats.errors++;
        try { console.warn(TAG, 'guard error (passthrough):', e && e.message); } catch(_){}
        return res;
      }
    };
    try { Object.keys(inner).forEach(function(k){ wrapped[k] = inner[k]; }); } catch(e){} // fix419c
    wrapped._f482 = true;
    window.fetch = wrapped;
    try { console.log(TAG, 'armed v2 (outermost fetch guard)'); } catch(e){}
  }

  // --- sys予防線(keeper __f379reg・prio2) ------------------------------
  var MARKER = '【表記】';
  var TEXT = '\n' + MARKER + '\n'
    + '・ルビ記法《…》・青空文庫式の注記・伏せ字を使わない。\n'
    + '・同じ語や同じフレーズを機械的に連続で繰り返さない(強調でも2回まで)。\n';
  (function register(){
    if (typeof window === 'undefined') return;
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; }
      reg.push({ off: 'v292Dfix482Off', marker: MARKER, prio: 1, text: function(){ return TEXT; } }); // fix496(A2): prio1化(71字・予算超過で後登録から脱落していた実測への対処。予算は拡大しない=GPT裁定)
      try { console.log(TAG, 'keeper registered (prio1, ' + TEXT.length + ' chars)'); } catch(e){}
    } catch(e){}
  })();

  install();

  G.__v292Dfix482 = {
    __armed: true,
    detectRuns: detectRuns,
    collapsePathological: collapsePathological,
    stripRuby: stripRuby,
    sanitizeRuby: sanitizeRuby,
    dupSentenceRatio: dupSentenceRatio,
    detectMarkup: detectMarkup,
    stripMarkup: stripMarkup,
    stripStateFrag: stripStateFrag,
    assess: assess,
    better: better,
    isChronicleNarrative: isChronicleNarrative,
    makeRetryInit: makeRetryInit,
    structural: structural, proseOf: proseOf, adoptRetry: adoptRetry, finishOf: finishOf,   /* ★fix482s */
    stats: stats,
    get last(){ return last; }
  };
  if (typeof module !== 'undefined' && module.exports){
    module.exports = G.__v292Dfix482;
  }
})();
