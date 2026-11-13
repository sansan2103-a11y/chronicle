// =====================================================================
// Chronicle - v292DfixLEAK1: 本文に混ざる「物語でない行」の検査（laneLEAK1・2026-11-13・GPT #127-SW 2）
// ---------------------------------------------------------------------
// 症状（実 AI の試験物語で実測）
//   (1) 内部ラベルの行  「（状態ラベル）」「（移動タグ）」… sys の見出し語（【移動タグ】／状態ラベル（からだ= …））をモデルがタグの代わりに書いた行。
//   (2) タグの断片だけの行「/>」「</state>」… 既存の言語フィルタ（かなの無い行を落とす）が落とすので保存には残らない。かなを含む断片だけが残りうる。
//   (3) 書き手の作業メモ  "Actually let me redo the state tags properly." で始まる英語まじりの検討文。タグ領域の後ろに続き、finish=length で切れる。
//       かなを 1 字でも含む行（日本語を引用した行）は既存の言語フィルタを通るので保存される。
// 動き
//   影（鍵なし・常時）: 件数だけを記録する（ターン番号・種別・行数・文字数・finish）。本文は 1 字も記録しない。本文・保存・送信は変えない。
//   適用（localStorage v292DfixLEAK1Apply='1'・既定 OFF）: 「明らかな」行だけを取り除く。
//       ・生の応答（parse の前）: 内部ラベルだけの行／タグ領域の後ろ（またはタグの無い応答の末尾）にまとまった作業メモ。
//       ・保存・表示の直前（最終境界）: 内部ラベルだけの行／タグの断片だけの行／作業メモの残り。
//       ・物語の文と区別できない行は取り除かない。英文を含む行・括弧つきの行を一律には扱わない。
//       ・finish=length で、作業メモがあるのに本文との境界を決められない回は hold（index.html が throw → 既存の失敗の経路＝入力を戻す・再試行ボタン。
//         parse 0・保存 0・自動の再送 0。再試行の回数・費用の制御は変えない）。
//   kill（v292DfixLEAK1Off='1'）: 影も止める（何も記録しない・何も変えない）。
// ★laneNUM2（2026-11-13・GPT #127-SY 5・6）
//   ・限定 Apply: 適用で取り除くのは 2 種だけにした。①単独行の既知の内部専用ラベル（LABELS とタグ名の行。属性の並び「からだ=… / こころ=…」の行は含めない）
//     ②タグ領域（最初のタグ行より後ろ）にある、内部語を含むまとまりの中の英語が主の行（とその残り）。
//     タグの断片・属性の並び・日本語が主のメモ行・タグの無い応答の末尾のメモは、数えるだけで取り除かない。finish=length で境界を決められない回の hold は従来どおり。
//   ・jp_meta（案 A・影だけ・取り除かない）: 本文の最後の行（独立した段落）が、台詞・括弧の外で、読み手への依頼（〜てください 等）と、
//     書き手視点の語（直前ターン・この返答・本文・描写・読者 等）または受け取り方の語（理解して・違和感 等）を両方含むとき、件数・字数だけを数える。
// 保存・localStorage への書き込み 0。AI の呼び出し 0。sys 0 字。fetch / parsePlan / submit を包まない。
// =====================================================================
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__v292DfixLEAK1) return;
  var VER = 'leak1-20261113-r3';
  var STRUCT = 'react|state|scene_move|summary';
  // 内部専用ラベル（sys・クライアントに実在する固定の語だけ）
  var LABELS = ['状態ラベル', '移動タグ', '話者タグ', '状態タグ', '反応タグ', 'sayタグ', 'stateタグ', '状態の出力', '出力の形式'];
  var ATTRS = 'who|to|ev|からだ|こころ|本能|目的|傷|関係|未解決|反応|声';
  var RX_LABEL = new RegExp('^[（(【\\[〔《<＜]?\\s*(?:' + LABELS.join('|') + '|(?:' + STRUCT + '|say)(?:\\s*(?:tags?|タグ))?)\\s*[）)】\\]〕》>＞]?\\s*[:：]?$', 'i');
  var RX_ATTRLINE = new RegExp('^(?:(?:' + ATTRS + ')\\s*[=＝]\\s*(?:"[^"\\n]*"|[^=＝\\s/／、,|｜][^=＝/／、,|｜\\n]{0,40}?)\\s*(?:[/／、,|｜]\\s*|\\s+|$)){2,}\\/?>?$');
  var RX_FRAG = [
    /^(?:\/>\s*)+>?$/,                                                    // "/>" ">" だけ
    new RegExp('^<\\/(?:' + STRUCT + '|say)\\s*>$', 'i'),                // </state> だけ
    /^<(?:react|state|summary)\b[^>]*$/i,                               // 閉じていない <state …（行末まで閉じない）
    // ※ 1 行まるごとの完成したタグ（<scene_move …/> など）は断片にしない。scene_move は最終境界の後ろ（S.save の fix645）が本文から外して記録する正規の経路。
    new RegExp('^(?:' + ATTRS + ')\\s*=\\s*"[^"\\n]*"?\\s*\\/?>?$')       // 属性 1 個だけの行（複数行タグの切れ端）
  ];
  // 作業メモの内部語（物語には出ない組み合わせだけ）
  var RX_TOKEN = new RegExp('scene_move|\\b(?:state|say|react|summary)\\s+tags?\\b|状態タグ|移動タグ|状態ラベル|話者タグ|sayタグ|stateタグ', 'i');
  var RX_INLINE = new RegExp('<\\/?(?:' + STRUCT + '|say)\\b[^<>]*\\/?>|<(?:' + STRUCT + ')\\b[^>]*$', 'gi');   // 行の中の（閉じた／行末で切れた）タグ。内部語・英語の判定はこれを除いた残りで行う
  var RX_TAGLINE = new RegExp('^\\s*<\\/?(?:' + STRUCT + ')\\b', 'i');
  var RX_STRUCT1 = new RegExp('<(?:' + STRUCT + ')\\b', 'i');

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ return ls('v292DfixLEAK1Off') !== '1'; }
  function applyOn(){ return on() && ls('v292DfixLEAK1Apply') === '1'; }

  function isLabel(line){ var t = String(line || '').trim(); if (!t || t.length > 40) return false; return RX_LABEL.test(t) || RX_ATTRLINE.test(t); }
  function isKnownLabel(line){ var t = String(line || '').trim(); if (!t || t.length > 40) return false; return RX_LABEL.test(t); }   // 限定 Apply ①（属性の並びの行は含めない）
  // jp_meta（影だけ）: 本文の最後の行が読み手への説明・依頼かどうか（台詞・括弧の外だけを見る）
  var RX_JP_REQ = /(?:て|で)(?:ください|下さい|ほしい|欲しい)|お願いします|ご了承|ご理解|お含みおき/;
  var RX_JP_WRITER = /プレイヤー|読者|読み手|本文|描写|場面設定|地の文|ナレーション|このターン|前のターン|直前(?:の)?ターン|次のターン|返答|この応答|出力|文章|メタ/;
  var RX_JP_TAKE = /受け取って|受け止めて|解釈して|理解して|理解しておいて|捉えて|違和感|想定して|扱って|読み替えて/;
  var RX_JP_INDIRECT = /(?:て|で)(?:ください|下さい|ほしい|欲しい)[^。]{0,3}(?:と|って)(?:言|頼|告げ|書|叫|囁|呟|答え|笑|伝え|願|祈|念|声)/;
  function jpMeta(narr){
    var ls = String(narr || '').split('\n'), i = ls.length - 1;
    while (i >= 0 && !ls[i].trim()) i--;
    if (i < 0) return null;
    var line = ls[i].trim();
    if (/^[「『（(〔<＜]/.test(line)) return null;                                     // 台詞・括弧・話者の印で始まる行は見ない
    var t = line.replace(/「[^」]*」|『[^』]*』|（[^）]*）|\([^)]*\)/g, '');
    if (!RX_JP_REQ.test(t) || RX_JP_INDIRECT.test(t)) return null;
    if (!RX_JP_WRITER.test(t) && !RX_JP_TAKE.test(t)) return null;
    return { line: i, chars: line.length };
  }
  // ★LEAK1 r3（QAB run1 の実測：適用 ON でも画面に残った 2 型）
  //   stf = 状態の欄の書き出し（「→こころ:…」のように、行頭が矢印＋状態の欄名＋コロン）。物語の文がこの形で始まることはない。
  //   chk = 自己点検の塊（「本文終わり」「【逐語反映チェック】」「- 入力DO: …」「（注記：…本文/タグ…）」）。強い印（本文終わり・逐語反映チェック・入力〇〇: の箇条）が 1 つでもある返答だけで落とす。
  var RX_STF = /^\s*[→⇒]\s*(?:こころ|からだ|本能|目的|関係|傷|未解決|所在|場所|服装|持ち物)\s*[:：]/;
  var RX_CHK_STRONG = /^\s*\**\s*(?:本文(?:終わり|ここまで|終了)|【?\s*逐語反映チェック\s*】?)\s*\**\s*$|^\s*[-・*]\s*入力\s*(?:DO|SAY|STORY|行動|台詞|出来事)\s*[:：]/;
  var RX_CHK_WEAK = /^\s*[-・*]\s*「[^」]{1,20}」\s*[→⇒]\s*(?:実際に|本文|使用)|^\s*[（(]\s*注記\s*[:：].*(?:本文|タグ)/;
  function isStf(line){ return RX_STF.test(String(line || '')); }
  function chkLines(lines){ var strong = false, out = {}; for (var i = 0; i < lines.length; i++){ var t = lines[i]; if (RX_CHK_STRONG.test(t)){ strong = true; out[i] = 1; } else if (RX_CHK_WEAK.test(t)) out[i] = 1; } return strong ? out : {}; }
  function isFrag(line){ var t = String(line || '').trim(); if (!t) return false; for (var i = 0; i < RX_FRAG.length; i++) if (RX_FRAG[i].test(t)) return true; return false; }
  function counts(t){ var s = String(t || ''); return { L: (s.match(/[A-Za-z]/g) || []).length, J: (s.match(/[ぁ-ゖァ-ヺ一-鿿々〆]/g) || []).length }; }
  function bare(line){ return String(line || '').replace(RX_INLINE, ' '); }
  function engDominant(line){ var c = counts(bare(line)); return c.L >= 12 && c.L / (c.L + c.J) >= 0.5; }
  function storyShaped(line){ var t = String(line || '').trim(); return /^[「『]/.test(t) || /<say\b[^>]*>[^<]*<\/say>/.test(t) || /^/.test(t); }
  function tokenLine(line){ return RX_TOKEN.test(bare(line)) && !storyShaped(line); }

  // 生の応答を行で見る。返り値: { lines, labels:[行番号], meta:[行番号], unsure:n, amb:bool, hasTag:bool }
  //   行の種類: 空行／内部ラベル／タグ行（行頭が構造タグ・タグの断片）／メモ候補（内部語の行・英語が主の行。行の中のタグは除いて判定）／その他（物語の文とみなす）
  //   A 域 = 最初のタグ行より前（本文）。B 域 = 最初のタグ行より後ろ（タグ領域）。
  //   B 域: メモ候補があり、その中に内部語の行が 1 つ以上あれば、最初の候補から末尾までを作業メモとする（途中の下書きタグも含む）。
  //         最初の候補より後ろに「その他」の行があれば amb（決められない）＝候補の行だけを作業メモとする。
  //   A 域: 末尾に続くメモ候補のまとまり（先頭が英語主・内部語あり・2 行以上か 80 字以上）だけ。あれば B 域も全部メモの続きとして扱う。
  function scanRaw(raw){
    var lines = String(raw || '').split('\n'), n = lines.length, i, kind = [];
    var out = { lines: lines, labels: [], meta: [], unsure: 0, amb: false, hasTag: false };
    for (i = 0; i < n; i++){
      var l = lines[i];
      if (!l.trim()) kind.push('blank');
      else if (isLabel(l)){ kind.push('label'); out.labels.push(i); }
      else if (RX_TAGLINE.test(l) || isFrag(l)) kind.push('tag');
      else if (tokenLine(l)) kind.push('tok');
      else if (engDominant(l)) kind.push('eng');
      else kind.push('other');
    }
    var s = kind.indexOf('tag'), endA = s >= 0 ? s : n, run = [], chars = 0, tokA = false, k;
    out.hasTag = s >= 0; out.kind = kind; out.endA = endA;
    for (i = endA - 1; i >= 0; i--){ k = kind[i]; if (k === 'blank' || k === 'label') continue; if (k === 'tok' || k === 'eng'){ run.unshift(i); chars += lines[i].length; if (k === 'tok') tokA = true; } else break; }
    var memoA = !!(run.length && tokA && engDominant(lines[run[0]]) && (run.length >= 2 || chars >= 80));
    var cand = [], tokB = false, m = -1, others = 0;
    for (i = endA; i < n; i++){ k = kind[i]; if (k === 'tok' || k === 'eng'){ cand.push(i); if (k === 'tok') tokB = true; if (m < 0) m = i; } else if (k === 'other' && (m >= 0 || memoA)) others++; }
    if (memoA){
      out.meta = run.slice();
      if (others === 0){ for (i = endA; i < n; i++) if (kind[i] !== 'blank' && kind[i] !== 'label') out.meta.push(i); }
      else { out.meta = out.meta.concat(cand); out.amb = true; out.unsure = others; }
    } else if (cand.length && tokB){
      if (others === 0){ for (i = m; i < n; i++) if (kind[i] !== 'blank' && kind[i] !== 'label') out.meta.push(i); }
      else { out.meta = cand.slice(); out.amb = true; out.unsure = others; }
    }
    return out;
  }

  var _log = [], _last = null, _stat = { VER: VER, turns: 0, hit: 0, label: 0, frag: 0, meta: 0, amb: 0, hold: 0, removedLines: 0, removedChars: 0, err: 0, jpmeta: 0, jpChars: 0 };
  function turnNo(){ try { var S = (0, eval)('typeof S !== "undefined" ? S : null'); return S && S.turns ? S.turns.length + 1 : null; } catch(e){ return null; } }
  function norm(s){ return String(s || '').replace(/<[a-z_\/][^<>]*>/gi, '').replace(/[\s　「」『』-]/g, ''); }

  // pre(result): 生の応答（parse の前）。影=数えるだけ。適用=明らかな行を result.text から除く。hold のときは { hold:true } を返す（index.html が throw）。
  function pre(result, which){
    if (!on() || !result || typeof result.text !== 'string') return null;
    try {
      var raw = result.text, fin = (typeof result.fin === 'string') ? result.fin : null, sc = scanRaw(raw), ap = applyOn();
      var info = { which: which || 'main', fin: fin, label: sc.labels.length, meta: sc.meta.length, unsure: sc.unsure, amb: sc.amb, hold: false, cut: 0, cutChars: 0, _memo: '' };
      var memo = sc.meta.map(function(i){ return sc.lines[i]; });
      // 限定 Apply の対象: ①既知の内部専用ラベルだけの行 ②タグ領域（最初のタグ行より後ろ）の作業メモのうち英語が主の行
      var apLab = sc.labels.filter(function(i){ return isKnownLabel(sc.lines[i]); });
      var apEng = sc.hasTag ? sc.meta.filter(function(i){ return i >= sc.endA && (sc.kind[i] === 'eng' || sc.kind[i] === 'tok') && engDominant(sc.lines[i]); }) : [];
      info.apLabel = apLab.length; info.apEng = apEng.length;
      info._memo = norm(apEng.map(function(i){ return sc.lines[i]; }).join('\n'));   // 最終境界で「英語の作業メモの残り」を数えるための照合用（メモリ内だけ。記録には出さない）
      info._memoAll = norm(memo.join('\n'));                                            // 影の数え用（従来の作業メモ全体）
      info._body = norm(sc.lines.filter(function(l, i){ return sc.meta.indexOf(i) < 0 && sc.labels.indexOf(i) < 0; }).join('\n'));
      if (ap){
        if (fin === 'length' && sc.amb){ info.hold = true; }
        else {
          var drop = {}; apLab.concat(apEng).forEach(function(i){ drop[i] = 1; });
          var keep = [], cutN = 0, cutC = 0;
          for (var i = 0; i < sc.lines.length; i++){ if (drop[i]){ cutN++; cutC += sc.lines[i].length; } else keep.push(sc.lines[i]); }
          if (cutN){ result.text = keep.join('\n').replace(/\s+$/, ''); info.cut = cutN; info.cutChars = cutC; }
        }
      }
      try { Object.defineProperty(result, '__leak1', { value: info, enumerable: false, configurable: true, writable: true }); } catch(e1){}
      if (info.hold){ _stat.hold++; record({ t: turnNo(), at: 'pre', fin: fin, kinds: { label: info.label, meta: info.meta, amb: 1 }, lines: 0, chars: 0, applied: true, hold: true }); }
      return info;
    } catch(e){ _stat.err++; return null; }
  }

  // gate(narr, result, plan): 保存・表示の直前（最終境界）。返り値は本文（影=そのまま／適用=明らかな行を除いたもの）。
  function gate(narr, result, plan){
    if (!on() || typeof narr !== 'string') return narr;
    try {
      var info = (result && result.__leak1) || null, ap = applyOn();
      var lines = narr.split('\n'), kinds = { label: 0, attr: 0, frag: 0, meta: 0, jpmeta: 0, stf: 0, chk: 0 }, drop = {}, nL = 0, nC = 0, dL = 0, dC = 0, i, chk = chkLines(lines);
      var memo = info ? info._memo : '', memoAll = info ? (info._memoAll || info._memo) : '', body = info ? info._body : '';
      function rem(x){ return x.length >= 6 && memo && memo.indexOf(x) >= 0 && body.indexOf(x) < 0; }
      for (i = 0; i < lines.length; i++){
        var l = lines[i], k = null, ok = false; if (!l.trim()) continue;
        if (isStf(l)){ k = 'stf'; ok = true; }                                             // ★r3 状態の欄の書き出し
        else if (chk[i]){ k = 'chk'; ok = true; }                                          // ★r3 自己点検の塊
        else if (isKnownLabel(l)){ k = 'label'; ok = true; }                              // 限定 Apply ①
        else if (isLabel(l)) k = 'attr';                                                   // 属性の並びの行（数えるだけ）
        else if (isFrag(l)) k = 'frag';                                                    // タグの断片（数えるだけ）
        else if (memoAll){ var x = norm(l); if (x.length >= 6 && memoAll.indexOf(x) >= 0 && body.indexOf(x) < 0){ k = 'meta'; ok = rem(x); } }   // 作業メモの残り（英語のメモだけ限定 Apply ②）
        if (k){ kinds[k]++; nL++; nC += l.length; if (ok){ drop[i] = 1; dL++; dC += l.length; } }
      }
      var jm = jpMeta(narr), jpC = 0;
      if (jm && !drop[jm.line] && !(lines[jm.line] && (isLabel(lines[jm.line]) || isFrag(lines[jm.line])))){ kinds.jpmeta = 1; jpC = jm.chars; }
      _stat.turns++;
      var preCut = info ? info.cut : 0;
      if (nL || preCut || (info && (info.label || info.meta || info.amb))){
        _stat.hit++; _stat.label += kinds.label + kinds.attr; _stat.frag += kinds.frag; _stat.meta += kinds.meta; _stat.stf = (_stat.stf || 0) + kinds.stf; _stat.chk = (_stat.chk || 0) + kinds.chk; if (info && info.amb) _stat.amb++;
      }
      if (kinds.jpmeta){ _stat.jpmeta++; _stat.jpChars += jpC; }
      if (nL || preCut || kinds.jpmeta || (info && (info.label || info.meta || info.amb))){
        record({ t: turnNo(), at: 'gate', fin: info ? info.fin : null,
          kinds: kinds, lines: nL, chars: nC,                                     // 最終境界（保存される本文）に残っていた数（jp_meta は別の欄）
          jp: kinds.jpmeta ? { lines: 1, chars: jpC } : null,                     // jp_meta 候補（影だけ・取り除かない・本文は残さない）
          raw: info ? { label: info.label, meta: info.meta, unsure: info.unsure, amb: info.amb ? 1 : 0, cut: info.cut, cutChars: info.cutChars, apLabel: info.apLabel || 0, apEng: info.apEng || 0 } : null,   // 生の応答での数
          applied: ap, removed: ap ? dL : 0, hold: false });
      }
      _last = { t: turnNo(), lines: nL, chars: nC, kinds: kinds, applied: ap, preCut: preCut, removed: ap ? dL : 0, jpChars: jpC };
      if (!ap || !dL) return narr;
      var out = []; for (i = 0; i < lines.length; i++) if (!drop[i]) out.push(lines[i]);
      _stat.removedLines += dL; _stat.removedChars += dC;
      try { if (plan && Array.isArray(plan.narrative)) plan.narrative = plan.narrative.filter(function(pl){ if (typeof pl !== 'string') return true; if (isKnownLabel(pl)) return false; var y = norm(pl); if (rem(y)) return false; return true; }); } catch(e2){}
      return out.join('\n').replace(/[ \t]*\n{3,}/g, '\n\n').trim();
    } catch(e){ _stat.err++; return narr; }
  }
  function record(r){ _log.push(r); if (_log.length > 60) _log.shift(); try { console.log('[v292DfixLEAK1]', JSON.stringify(r)); } catch(e){} }

  var api = { VER: VER, on: on, applyOn: applyOn, pre: pre, gate: gate,
    log: function(){ return _log.slice(); }, last: function(){ return _last; }, status: function(){ var o = {}; for (var k in _stat) o[k] = _stat[k]; o.on = on(); o.apply = applyOn(); return o; },
    core: { scanRaw: scanRaw, isLabel: isLabel, isKnownLabel: isKnownLabel, isFrag: isFrag, engDominant: engDominant, tokenLine: tokenLine, norm: norm, jpMeta: jpMeta, LABELS: LABELS.slice() } };
  if (typeof window !== 'undefined') window.__v292DfixLEAK1 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
