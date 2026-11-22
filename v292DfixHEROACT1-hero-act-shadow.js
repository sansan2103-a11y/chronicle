/* =====================================================================
 * v292DfixHEROACT1-hero-act-shadow.js — 入力に無い主人公の発話・行動を数えるだけ（★HEROACT1・shadow・GPT #127-VB 2(1)・2026-11-16・Local）
 * ---------------------------------------------------------------------
 * ■やること（書き換えない・sys/user に何も足さない・AI を呼ばない・保存データに触れない）
 *   このページで新しく生まれたターン（fix732 の isNew）の本文と会話カードを読み、プレイヤーの入力に無い主人公の
 *     ・発話（会話カードの主人公の台詞のうち、その回の SAY 入力の写しでないもの）
 *     ・行動（地の文で主人公が主語の文のうち、選択を代行する語〔受け取る・開ける・泊まる・坂を上る・向かう・頷く 等〕があり、入力に同じ語が無いもの）
 *   を次の 3 つに分けて数える。
 *     short    短い反応（記号を除いて 10 字以内・決断の語なし）＝ HEROVOICE A の自然な反応。違反に数えない
 *     decision 重要な決断（泊まる・開ける・受け取る・同意する・移動を決める 等）＝ 確実な違反として集計する
 *     unclear  判断困難（決断の語の無い、短くない主人公の台詞）＝ 別に数えるだけ
 *   主人公の心情・感覚の地の文は読まない（判定できないので数えない＝見逃しとして扱う）。
 * ■記録: localStorage 'v292DfixHEROACT1Log_v1' に { t: ターン番号, k: 入力の種類, s/d/u: 件数, a: 行動の件数 } だけ（最大 200 件）。
 *   本文・台詞・入力・名前・物語 ID は残さない。
 * ■鍵: ON localStorage v292DfixHEROACT1On='1'（既定 OFF）。kill v292DfixHEROACT1Off='1'（On より優先）。OFF のときは何もしない（3 秒ごとの確認は鍵を読むだけ）。
 * ■検証口: window.__v292DfixHEROACT1 = { VER, on, scan(turn, ctx), log(), clearLog(), stats() }
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixHEROACT1) return;
  var VER = 'heroact1-20261116-a', LOGK = 'v292DfixHEROACT1Log_v1', LOG_MAX = 200;
  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  var on0A = on; on = function(){ return ls('v292DfixHEROACT1Off') !== '1' && (DEFAULT_ON_A || on0A()); }; var DEFAULT_ON_A = true;   /* ★ALLON-A: 全員の既定 ON（kill v292DfixHEROACT1Off が勝つ） */
  function on(){ return ls('v292DfixHEROACT1Off') !== '1' && (ls('v292DfixHEROACT1On') === '1' || acct1('heroact1')); }
  function acct1(n){ try { var A = root.__v292DfixACCT1; return !!(A && typeof A.want === 'function' && A.want(n) === true); } catch(e){ return false; } }   /* ★ACCT1 r3: Owner のアカウントなら端末の鍵が無くても PC と同じ */
  function str(v){ return v == null ? '' : String(v); }
  function ns(s){ return str(s).replace(/[\s　]/g, ''); }
  function core(s){ return ns(s).replace(/[「」『』。、，,.！？!?…‥・ー〜~―—\-]/g, ''); }
  // 主人公の台詞の決断の語（同意・受け取り・宿泊・移動の決定・依頼）
  var SAY_DEC = /泊ま|泊め|受け取|もらいます|もらってい|貰います|開けます|開けよう|開ける(?:ね|よ|わ)|開けて(?:み|い)|行きます|行こう|行く(?:よ|ね|わ|から)|帰ります|帰ろう|残ります|残る(?:よ|ね|わ)|決めた|決めます|引き受け|任せて|お願いします|やります|そうします|わかりました|分かりました|わかった|分かった|了解|いいよ|いいです(?:よ|ね)?$|上がります|入ります|見てきます|売ります|残します|手放し/;
  // 地の文の主人公の行動の決断の語
  var ACT_DEC = /受け取|手に取|開け|押し開|開い|泊ま|(?:坂|石段|階段|道)を(?:上|登|下|降|戻)|上がっていく|上っていく|下っていく|降りていく|向かった|向かう|向かい始|歩き出|踏み入|入って(?:いく|いっ)|出ていく|出ていっ|決め|頷い|頷く|うなず|首を(?:縦|横)に|断っ|断る|引き受け|受け入れ/;
  var ATTEMPT = /ようとし|かけ(?:た|て)|つもり|たら|なら|れば|ふり/;
  var NOT_DONE = /^(?:っ|い|う|く|け)?(?:た|る)?(?:前|あと|後|ところ|まま)|^(?:ら|わ)?な(?:い|かっ)[^。]{0,6}(?:のを|のに|ことに)/;   // 「受け取る前に」「受け取らないのを見て」
  var ATTRIB = /^(?:っ|い)?た[一-鿿ぁ-ゖァ-ヺ]/;                                                              // 「受け取った鍵」＝前の出来事の言い直し
  var POLITE_END = /(?:ます|ました|ません|です|でした)(?:ね|よ|か|けど)?$/;                                    // 丁寧形で言い切る台詞は会話（短くても short にしない）
  var Q_HERO = function(hero){ var h = ns(hero).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp('「([^」]{1,80})」と' + h + '(?:は|が)(?:言|答え|告げ|呟|つぶや|返|口に|切り出)|' + h + '(?:は|が)「([^」]{1,80})」と'); };
  function kindOf(say){ var sc = core(say); if (SAY_DEC.test(ns(say))) return 'decision'; return (sc.length <= 10 && !POLITE_END.test(sc)) ? 'short' : 'unclear'; }
  function heroSubj(sent, hero){
    var h = ns(hero); if (!h) return false; var s = ns(sent), k = s.indexOf(h);
    while (k >= 0){ var pre = k > 0 ? s.charAt(k - 1) : '', post = s.slice(k + h.length, k + h.length + 1);
      if ((k === 0 || /[、。」]/.test(pre)) && /^[はがも]$/.test(post)) return true; k = s.indexOf(h, k + 1); }
    return false;
  }
  function sentences(t){ return str(t).replace(/「[^」]*」|『[^』]*』/g, '〃').split(/[。！？!?\n]+/).map(function(x){ return x.trim(); }).filter(Boolean); }
  // turn: { inputType, playerText, narrative(string|array), says:[{who,say}] }  ctx: { hero }
  function scan(turn, ctx){
    var out = { s: 0, d: 0, u: 0, a: 0, items: [] };
    try {
      var hero = str(ctx && ctx.hero), typ = str(turn && turn.inputType).toUpperCase(), inp = str(turn && turn.playerText);
      if (!hero) return out;
      var cont = /続きを(?:自然に)?進めて|^続きを書/.test(inp); if (cont) inp = '';
      var inC = core(inp), seenSay = {};
      (Array.isArray(turn.says) ? turn.says : []).forEach(function(c){
        if (!c || ns(c.who) !== ns(hero)) return;
        var sc = core(c.say); if (!sc) return;
        if (typ === 'SAY' && inC && (inC.indexOf(sc) >= 0 || sc.indexOf(inC) >= 0)) return;   // その回の入力の写し
        var kind = kindOf(c.say); seenSay[sc] = 1;
        out[kind.charAt(0)]++; out.items.push({ k: kind, via: 'say' });
      });
      var narr = Array.isArray(turn.narrative) ? turn.narrative.join('\n') : str(turn.narrative);
      var QH = Q_HERO(hero);   // 地の文の「…」と凪が言った（カードに無い主人公の台詞）
      narr.split(/\n/).forEach(function(ln){ var re = new RegExp(QH.source, 'g'), m; while ((m = re.exec(ln))){ var q = m[1] || m[2], qc = core(q); if (!qc || seenSay[qc]) continue;
        if (typ === 'SAY' && inC && (inC.indexOf(qc) >= 0 || qc.indexOf(inC) >= 0)) continue; seenSay[qc] = 1; var k2 = kindOf(q); out[k2.charAt(0)]++; out.items.push({ k: k2, via: 'say' }); } });
      sentences(narr).forEach(function(sn){
        if (!heroSubj(sn, hero)) return;
        var m = ACT_DEC.exec(sn); if (!m) return;
        if (ATTEMPT.test(sn.slice(m.index))) return;
        var rest = sn.slice(m.index + m[0].length); if (NOT_DONE.test(rest) || ATTRIB.test(rest)) return;
        var kj = m[0].match(/[一-鿿]/g), stem = kj ? kj[kj.length - 1] : m[0].slice(0, 2);   // 動きの漢字（押し開け→開・受け取→取）
        if (stem && inp.indexOf(stem) >= 0) return;                                            // 入力に同じ行動がある
        out.d++; out.a++; out.items.push({ k: 'decision', via: 'act' });
      });
    } catch(e){}
    return out;
  }
  var stat = { turns: 0, s: 0, d: 0, u: 0, a: 0, err: 0 };
  function readLog(){ try { var a = JSON.parse(ls(LOGK) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function writeLog(r){ try { var a = readLog(); a.push(r); while (a.length > LOG_MAX) a.shift(); root.localStorage.setItem(LOGK, JSON.stringify(a)); } catch(e){} }
  function getS(){ try { var a = root.__chronicleGetState ? root.__chronicleGetState('heroact1') : null; if (a) return a; } catch(e){} try { return root.S || (0, eval)('typeof S!=="undefined"?S:null'); } catch(e2){ return null; } }
  var seen = (typeof WeakSet === 'function') ? new WeakSet() : null;
  function tick(){
    if (!on() || !seen) return;
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns) || !S.cast || !S.cast.hero) return;
      var W = root.__v292Dfix732Scope; if (!W || typeof W.isNew !== 'function') return;        // 新しいターンが分からないときは何もしない
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i]; if (!t || seen.has(t) || !W.isNew(t)) continue;
        if (!Array.isArray(t._convSays)) continue;                                              // カードがまだ出来ていない
        seen.add(t);
        var says = t._convSays.map(function(c){ return { who: c && c.who, say: c && c.say }; });
        var r = scan({ inputType: t.inputType, playerText: t.playerText, narrative: t.narrative, says: says }, { hero: S.cast.hero.name });
        stat.turns++; stat.s += r.s; stat.d += r.d; stat.u += r.u; stat.a += r.a;
        if (r.s || r.d || r.u) writeLog({ t: i + 1, k: str(t.inputType).slice(0, 5), s: r.s, d: r.d, u: r.u, a: r.a });
      }
    } catch(e){ stat.err++; }
  }
  try { if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(tick, 3000); } catch(e){}
  root.__v292DfixHEROACT1 = { VER: VER, on: on, scan: scan, log: readLog, clearLog: function(){ try { root.localStorage.removeItem(LOGK); } catch(e){} }, stats: function(){ var o = {}; for (var k in stat) o[k] = stat[k]; o.on = on(); return o; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.__v292DfixHEROACT1;
})(typeof window !== 'undefined' ? window : globalThis);
