/* v292DfixCP1-final-tap.js (2026-10-22 CONT-02-FIX CP1-R4・GPT #127-JY ② → R5 #127-KA ③ → R6 #127-KK ③ 変更なし（VER のみ。読み込み時 OFF/kill で何も包まない判定は r4 から同じ）・Local only)
 * ─ CP1「今の場面に誰がいるか」の送信直前の観測口（tap）。純粋な観測器 ─
 *
 * 置き場所: index.html の v292Dfix950-card-delivery-probe.js の直後（= vault2-sendgate / fix950 のすぐ外側＝ほぼ最内）。
 *   fetch の包みは後から読まれたものほど外側になるので、ここで包むと fix459 / fix441 / KP1 / fix247 / fix80 / fix84 / BF1 など
 *   すべての書き換えが終わった「実際に送る body」を見る（fix950 と同じ考え方）。
 * 絶対条件:
 *   1. 送る中身を 1 バイトも変えない。fetch の引数は受け取った参照のまま内側へ渡す。body は文字列の参照を CP1 本体の hook に渡すだけ。
 *   2. 読み込み時に CP1 が ON（localStorage v292DfixCP1On='1' かつ v292DfixCP1Off≠'1'）のときだけ包む。
 *      OFF / kill で読み込んだページでは何もしない（fetch の包みも global も増えない）。
 *   3. 判定・記録は CP1 本体（window.__v292DfixCP1FinalHook）が送信の後（setTimeout 0）で行う。例外はすべて握りつぶす（fail-open）。
 * 診断: window.__v292DfixCP1Tap = { ver, installed, calls, errors }（ON で読み込んだときだけ）
 * ★bundle43-a r2（GPT #127-LA §2）: CP1 本体の hook が { block: true } を返したとき（CP1 を使ったターンの途中でアカウント・物語・Owner 権限が
 *   変わった）だけ、その送信を出さずに reject する（古い生成を新しい側へ続けない）。それ以外は r6 と同じ（中身は 1 バイトも変えない・例外は握る）。
 *   guard=1 は「このガードを持つ tap」の印（CP1 本体はこれが無い tap と組み合わさったら CP1 全体を OFF にする＝§3）。
 * ★bundle43-a r3（GPT #127-LC H2）: hook が { watch: true } を返した送信（CP1 を使ったターンの本文生成）だけ、応答が返った時点で
 *   window.__v292DfixCP1AfterHook に確かめ、{ discard: true } なら応答をアプリへ渡さず reject する（側が変わったターンの本文を保存させない）。
 *   それ以外の送信は r2 と同じ（inner の Promise をそのまま返す）。guard=2 がこの版の印。
 * ★bundle43-a r5（GPT #127-LI G5・G6）: (1) onFinal が返した帰属（ref＝その要求を出した Api.call の呼び出し）をそのまま onAfter へ渡す
 *   （応答の時点で「今の試行」を取り直さない）。(2) 止めた・捨てたときの Error に理由コードを付ける（e.code = 'CP1_INTERRUPTED'・e.reason・
 *   e.terminal = true。fix265 の再送条件〔HTTP 5xx / Failed to fetch 等〕には当たらない文面）。(3) Worker の /save への書込のうち物語の state を
 *   運ぶもの（put / putstory / putcanonical / commitstate / forceput）だけ、CP1 本体の window.__v292DfixCP1SaveHook が { block: true } を返したら
 *   送らずに reject する（hold 中・採用前の仮の state が保存先に書かれてしまった試行の決着前）。読み出しや他の要求には触らない。guard=3 がこの版の印。
 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixCP1Tap) return;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  if (!(lsg('v292DfixCP1Off') !== '1' && lsg('v292DfixCP1On') === '1')) return;   /* OFF / kill: 何もしない */
  var inner = window.fetch;
  if (typeof inner !== 'function') return;
  var T = { ver: 'cp1-r43e-20261024', installed: false, calls: 0, errors: 0, guard: 3, blocked: 0, discarded: 0, saveBlocked: 0 };
  function cpErr(msg, code){ var e = new Error(msg + ' [CP1_INTERRUPTED:' + String(code || 'INTERRUPTED') + ']'); try { e.code = 'CP1_INTERRUPTED'; e.reason = String(code || 'INTERRUPTED'); e.terminal = true; } catch(_e){} return e; }
  var tap = function(u, o){
    var stop = null, watch = null, wref = null, code = null, hold = null;
    try {
      if (o && typeof o.body === 'string' && String(o.method || '').toUpperCase() === 'POST'){
        var hs = window.__v292DfixCP1SaveHook;
        if (typeof hs === 'function'){ var vs = hs(u, o.body); if (vs && vs.block === true) hold = String(vs.why || 'HOLD'); }
        var h = window.__v292DfixCP1FinalHook;
        if (hold === null && typeof h === 'function'){ T.calls++; var v = h(u, o.body); if (v && v.block === true){ stop = String(v.why || 'changed'); code = v.code || null; } else if (v && v.watch === true){ watch = o.body; wref = v.ref || null; } }
      }
    } catch(e){ T.errors++; }
    if (hold !== null){ T.saveBlocked++; return Promise.reject(cpErr('[v292DfixCP1] save held: ' + hold, hold)); }   /* r5 G6: 物語の state を運ぶ書込を送らない */
    if (stop !== null){ T.blocked++; return Promise.reject(cpErr('[v292DfixCP1] request not sent: ' + stop, code)); }   /* r2: 送らない（中身は変えない） */
    var pr = inner.apply(this, arguments);   /* ★引数は受け取ったまま（参照も同一） */
    if (watch === null) return pr;
    return Promise.resolve(pr).then(function(res){   /* r3 H2: 応答が返った時点で側が変わっていたら、アプリへ渡さない */
      var d = null, dc = null;
      try { var a = window.__v292DfixCP1AfterHook; if (typeof a === 'function'){ var w = a(u, watch, wref); if (w && w.discard === true){ d = String(w.why || 'changed'); dc = w.code || null; } } } catch(e2){ T.errors++; }
      if (d !== null){ T.discarded++; throw cpErr('[v292DfixCP1] response discarded: ' + d, dc); }
      return res;
    });
  };
  try { Object.keys(inner).forEach(function(k){ tap[k] = inner[k]; }); } catch(e){}
  tap.__v292DfixCP1Tap = true;
  window.fetch = tap;
  T.installed = true;
  window.__v292DfixCP1Tap = T;
})();
