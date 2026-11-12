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
// 保存・localStorage への書き込み 0。AI の呼び出し 0。sys 0 字。fetch / parsePlan / submit を包まない。
// =====================================================================
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__v292DfixLEAK1) return;
  var VER = 'leak1-20261113';
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
    out.hasTag = s >= 0;
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

  var _log = [], _last = null, _stat = { VER: VER, turns: 0, hit: 0, label: 0, frag: 0, meta: 0, amb: 0, hold: 0, removedLines: 0, removedChars: 0, err: 0 };
  function turnNo(){ try { var S = (0, eval)('typeof S !== "undefined" ? S : null'); return S && S.turns ? S.turns.length + 1 : null; } catch(e){ return null; } }
  function norm(s){ return String(s || '').replace(/<[a-z_\/][^<>]*>/gi, '').replace(/[\s　「」『』-]/g, ''); }

  // pre(result): 生の応答（parse の前）。影=数えるだけ。適用=明らかな行を result.text から除く。hold のときは { hold:true } を返す（index.html が throw）。
  function pre(result, which){
    if (!on() || !result || typeof result.text !== 'string') return null;
    try {
      var raw = result.text, fin = (typeof result.fin === 'string') ? result.fin : null, sc = scanRaw(raw), ap = applyOn();
      var info = { which: which || 'main', fin: fin, label: sc.labels.length, meta: sc.meta.length, unsure: sc.unsure, amb: sc.amb, hold: false, cut: 0, cutChars: 0, _memo: '' };
      var memo = sc.meta.map(function(i){ return sc.lines[i]; });
      info._memo = norm(memo.join('\n'));   // 最終境界で「作業メモの残り」を数えるための照合用（メモリ内だけ。記録には出さない）
      info._body = norm(sc.lines.filter(function(l, i){ return sc.meta.indexOf(i) < 0 && sc.labels.indexOf(i) < 0; }).join('\n'));
      if (ap){
        if (fin === 'length' && sc.amb){ info.hold = true; }
        else {
          var drop = {}; sc.labels.concat(sc.meta).forEach(function(i){ drop[i] = 1; });
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
      var lines = narr.split('\n'), kinds = { label: 0, frag: 0, meta: 0 }, drop = {}, nL = 0, nC = 0, i;
      var memo = info ? info._memo : '', body = info ? info._body : '';
      for (i = 0; i < lines.length; i++){
        var l = lines[i], k = null; if (!l.trim()) continue;
        if (isLabel(l)) k = 'label'; else if (isFrag(l)) k = 'frag';
        else if (memo){ var x = norm(l); if (x.length >= 6 && memo.indexOf(x) >= 0 && body.indexOf(x) < 0) k = 'meta'; }
        if (k){ kinds[k]++; drop[i] = 1; nL++; nC += l.length; }
      }
      _stat.turns++;
      var preCut = info ? info.cut : 0;
      if (nL || preCut || (info && (info.label || info.meta || info.amb))){
        _stat.hit++; _stat.label += kinds.label; _stat.frag += kinds.frag; _stat.meta += kinds.meta; if (info && info.amb) _stat.amb++;
        record({ t: turnNo(), at: 'gate', fin: info ? info.fin : null,
          kinds: kinds, lines: nL, chars: nC,                                     // 最終境界（保存される本文）に残っていた数
          raw: info ? { label: info.label, meta: info.meta, unsure: info.unsure, amb: info.amb ? 1 : 0, cut: info.cut, cutChars: info.cutChars } : null,   // 生の応答での数
          applied: ap, hold: false });
      }
      _last = { t: turnNo(), lines: nL, chars: nC, kinds: kinds, applied: ap, preCut: preCut };
      if (!ap || !nL) return narr;
      var out = []; for (i = 0; i < lines.length; i++) if (!drop[i]) out.push(lines[i]);
      _stat.removedLines += nL; _stat.removedChars += nC;
      try { if (plan && Array.isArray(plan.narrative)) plan.narrative = plan.narrative.filter(function(pl){ if (typeof pl !== 'string') return true; if (isLabel(pl) || isFrag(pl)) return false; if (memo){ var y = norm(pl); if (y.length >= 6 && memo.indexOf(y) >= 0 && body.indexOf(y) < 0) return false; } return true; }); } catch(e2){}
      return out.join('\n').replace(/[ \t]*\n{3,}/g, '\n\n').trim();
    } catch(e){ _stat.err++; return narr; }
  }
  function record(r){ _log.push(r); if (_log.length > 60) _log.shift(); try { console.log('[v292DfixLEAK1]', JSON.stringify(r)); } catch(e){} }

  var api = { VER: VER, on: on, applyOn: applyOn, pre: pre, gate: gate,
    log: function(){ return _log.slice(); }, last: function(){ return _last; }, status: function(){ var o = {}; for (var k in _stat) o[k] = _stat[k]; o.on = on(); o.apply = applyOn(); return o; },
    core: { scanRaw: scanRaw, isLabel: isLabel, isFrag: isFrag, engDominant: engDominant, tokenLine: tokenLine, norm: norm, LABELS: LABELS.slice() } };
  if (typeof window !== 'undefined') window.__v292DfixLEAK1 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
