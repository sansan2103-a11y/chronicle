/* =====================================================================
 * v292DfixPLACE2-hero-move.js — 主人公の現在地と同行の読み直し（PLACE2・2026-11-23・既定 OFF）
 * ---------------------------------------------------------------------
 * ■なぜ（quality/READ1_MEMORY_POV_NOTE.md §1・実記録 read1/realai_out RD1_A_ON1/ON2 の T7・T8）:
 *   (1) PLACE1 は主人公の移動を DO の入力からしか拾わない（STORY の入力・AI の本文は読まない）→ いまの場面の場所が古いまま残る。
 *   (2) STORY「柾が重い腰を上げて二人と一緒に灯台へ戻る」を、柾がこの場を去った（gone）と読んだ → 一緒に来た人が「この場にいない」になる。
 * ■やること（PLACE1 の build の中から呼ぶ・保存しない・新しい台帳なし・sys の字数は増やさない）:
 *   A. STORY の入力（PLACE1 が作った出来事を受け取って直す）:
 *      ・「一緒に／ともに／共に／連れて／揃って／並んで／みんなで／二人で…」＋移動で、連れの中に主人公（名前・主人公・二人／三人／みんな 等の数）が
 *        入っていると読めるとき → その人の退出（gone 等）を、主人公が同じ行き先へ移った（その人を連れて）に替える。
 *        連れの中に主人公が入っているか分からないときは、その出来事を捨てる（いまの状態を変えない＝推測で動かさない）。
 *      ・主語が主人公の文（「透は灯室へ上がる」「主人公が…へ戻る」）は、DO と同じ読み方（PLACE1 の parseInput）で主人公の移動を拾う。
 *   B. そのターンの AI の本文: 主語が主人公（名前か一人称）か、主人公を含む組（「三人は」「透と志保は」）の文で、移動を言い切った文
 *      （SCENE1 b の HERO_MOVE の語。打ち消し・未遂・仮定・意思は除く）から、行き先を PLACE1 の読み方（行き先の確かめ）で拾う。
 *      その回の入力で主人公の移動が決まっていれば、本文では動かさない（入力が上・PLACE1 r3 と同じ）。
 *      連れは、同じ文に名前の出る登録人物だけ。名前の出ない人は今の状態のまま（残ったとも一緒とも決めない）。
 *   語の一覧は増やさない: 移動の語は SCENE1 b の HERO_MOVE、連れの語は SCENE1 b の GROUP、部屋の中の行き先（机・窓辺・席…）は SCENE1 b の INROOM、行き先の確かめは PLACE1 の parseInput を使う。
 * ■鍵: v292DfixPLACE2On='1'（既定 OFF）・kill v292DfixPLACE2Off='1'（常に勝つ）。OFF・kill では PLACE1 は 1 字も変わらない。
 * ■診断: window.__v292DfixPLACE2.stats()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixPLACE2) return;
  var VER = 'place2-20261123-r1', ST = { inFixed: 0, inDropped: 0, inHero: 0, narrHero: 0, narrSkipInput: 0, narrNoPlace: 0 };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return lsg('v292DfixPLACE2Off') !== '1'; }   /* 20261123: 全員 既定 ON（実 AI 18 本: 同行の人を誤って「いない」にする誤り OFF 6 ターン → ON 0・誤って場所を動かした 0）。止めるのは kill v292DfixPLACE2Off='1' */
  function str(v) { return String(v == null ? '' : v); }
  function P1() { try { return root.__v292DfixPLACE1 || null; } catch (e) { return null; } }
  function Z1() { try { return root.__v292DfixSCENE1 || null; } catch (e) { return null; } }
  function heroMoveRe() { var z = Z1(); return (z && z.heroMoveRe instanceof RegExp) ? z.heroMoveRe : null; }
  function groupRe() { var z = Z1(); return (z && z.groupRe instanceof RegExp) ? z.groupRe : null; }
  function inRoomRe() { var z = Z1(); return (z && z.inRoomRe instanceof RegExp) ? z.inRoomRe : null; }
  var IRR = /(?:ない|なかった|ず[、。に]|ようと|うと(?:言|思|考|誘|提案|決め)|と言い出|つもり|たい|たら|なら|れば|かもしれ|だろう|そうに|ふり|かけた|かける)/;   /* 打ち消し・未遂・意思・誘い・仮定 */
  var HERO_WORD = /(?:主人公|二人|ふたり|三人|四人|みんな|皆|全員|一同|僕ら|僕たち|俺ら|俺たち|私たち|わたしたち|我々)/;
  function esc(s) { return str(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function maskQ(t) { return str(t).replace(/「[^」]*」|『[^』]*』/g, '〃'); }
  function sents(t) { return maskQ(t).replace(/<[^>]*>/g, ' ').split(/[。！？!?\n]+/).map(function (x) { return x.replace(/^[\s　〃]+|[\s　]+$/g, ''); }).filter(Boolean); }
  /* 行き先が PLACE1 の読み方で場所として通るか（「先」「奥」「〜の方」などは通らない）。通れば場所の文字列 */
  function placeOk(dst, hero, ctx) {
    var P = P1(); if (!P || typeof P.parseInput !== 'function' || !dst) return '';
    try { var ev = P.parseInput(dst + 'へ行く', hero, ctx, false) || []; for (var i = 0; i < ev.length; i++) if (ev[i] && ev[i].kind === 'hero') return ev[i].place; } catch (e) {}
    return '';
  }
  function heroIn(s, hero, ctx) {   /* 連れ・主語の中に主人公が入っているか */
    if (!s) return false; if (hero && s.indexOf(hero) >= 0) return true; if (HERO_WORD.test(s)) return true;
    return /(?:^|[、と])(?:自分|私|わたし|俺|僕|あたし)(?:と|も|が|は|、|$)/.test(s);
  }
  function namesIn(s, ctx, hero) { var out = []; (ctx.names || []).forEach(function (n) { if (n && n !== hero && s.indexOf(n) >= 0) out.push(n); }); return out; }
  /* A. 入力の出来事を直す（PLACE1 の parseInput の結果を受け取る）。typ: 'DO'|'STORY' */
  function fixInput(evs, text, typ, ctx, hero) {
    if (!on() || !Array.isArray(evs) || str(typ).toUpperCase() !== 'STORY') return evs;
    var G = groupRe(), out = [], tx = maskQ(text);
    evs.forEach(function (e) {
      if (e && e.kind === 'person' && /^(?:gone|spot|sent)$/.test(str(e.mode)) && G && G.test(str(e.ev) || tx)) {
        if (IRR.test(str(e.ev))) { ST.inDropped++; return; }   /* 「みんなで戻ろうと言い出す」は動いていない */
        var ev = str(e.ev), with1 = ev.match(/^(.*?)(?:と(?:一緒に|ともに|共に|二人で|三人で|四人で)|を連れて|連れ立って|揃って|そろって|並んで|みんなで|皆で)/);
        var comp = with1 ? with1[1] : ev;
        if (heroIn(comp, hero, ctx) || heroIn(ev.replace(/^[^、。]{0,12}?(?:が|は)/, ''), hero, ctx)) {
          var dm = ev.match(/(?:一緒に|ともに|共に|連れて|連れ立って|揃って|そろって|並んで|みんなで|皆で|二人で|三人で|四人で)([^、。をはが]{1,16}?)(?:へ|まで|に)(?:[^、。へ]{0,10}?に)?(?:戻|行|向か|出|帰|上が|下り|降り|入|移)/);
          var pl = placeOk(dm ? dm[1] : str(e.place).replace(/^.*(?:と|で)(?=[^と]{2,}$)/, ''), hero, ctx);   /* 行き先は連れの語の後ろから取る（「二人と一緒に灯台へ」→ 灯台） */
          if (pl) { out.push({ kind: 'hero', place: pl, with: (e.who || []).slice().concat(namesIn(ev, ctx, hero)).filter(function (v, i, a) { return a.indexOf(v) === i; }), ev: e.ev, p2: 'with' }); ST.inFixed++; return; }
        }
        var named = namesIn(comp, ctx, hero);
        if (with1 && named.length && !heroIn(comp, hero, ctx) && comp.replace(/[、と]/g, '').replace(new RegExp(named.map(esc).join('|'), 'g'), '').replace(/^[^、。]{0,12}?(?:が|は)/, '').replace(/(?:さん|ちゃん|くん|君)/g, '').length <= 12) { out.push(e); return; }   /* 連れが名前の出る登録人物だけ（主人公は入らない）→ PLACE1 のまま（その人たちは出ていった） */
        ST.inDropped++; return;   /* 連れに主人公が入るか分からない・行き先が読めない → この出来事は捨てる（いまの状態を変えない） */
      }
      out.push(e);
    });
    /* 「A は主人公を連れて P へ…」＝主人公も P へ（A と一緒） */
    if (!out.some(function (e) { return e && e.kind === 'hero'; })) sents(text).forEach(function (s) {
      var m = s.match(/^(?:([^、。]{1,12}?)(?:は|が))?[^。]*?([^、。をはが]{1,12}?)を連れて[、]?([^、。をはが]{1,16}?)(?:へ|まで)([^。]*)$/); if (!m || IRR.test(s)) return;
      if (!heroIn(m[2], hero, ctx) && !ctx.isSelf(m[2])) return; var HM = heroMoveRe(); if (!HM || !HM.test(m[0].slice(m[0].lastIndexOf(m[3])))) return;
      var pl = placeOk(m[3], hero, ctx); if (!pl) return;
      out.push({ kind: 'hero', place: pl, with: m[1] ? namesIn(m[1], ctx, hero) : [], ev: s.slice(0, 40), p2: 'taken' }); ST.inTaken = (ST.inTaken || 0) + 1; });
    /* 主語が主人公の STORY の文: DO と同じ読み方で主人公の移動を拾う */
    if (!out.some(function (e) { return e && e.kind === 'hero'; })) {
      var P = P1(); sents(text).forEach(function (s) {
        var m = s.match(/^([^、。]{1,12}?)(?:は|が)(.+)$/); if (!m) return;
        var sj = m[1]; if (!(ctx.isSelf(sj) || sj === '主人公' || (heroIn(sj, hero, ctx) && /と|二人|三人|みんな|全員/.test(sj)))) return;
        if (IRR.test(m[2])) return;
        try { (P.parseInput(m[2], hero, ctx, false) || []).forEach(function (h) { if (h && h.kind === 'hero') { h.with = (h.with || []).concat(namesIn(sj, ctx, hero)); h.p2 = 'story-hero'; out.push(h); ST.inHero++; } }); } catch (e2) {}
      });
    }
    return out;
  }
  /* B. そのターンの本文から主人公の移動（いちばん後ろの 1 つ）。inputHero: その回の入力で主人公の移動が決まったか */
  function narrHero(narr, ctx, hero, inputHero) {
    if (!on()) return [];
    if (inputHero) { ST.narrSkipInput++; return []; }
    var HM = heroMoveRe(); if (!HM) return [];
    var ss = sents(Array.isArray(narr) ? narr.join('\n') : narr), found = null;
    ss.forEach(function (s) {
      var m = s.match(/^(?:[^、。]{0,10}、)?([^、。をにで]{1,16}?)(?:は|が)(.+)$/); if (!m) return;
      var sj = m[1], rest = m[2];
      var self = ctx.isSelf(sj) || (hero && sj === hero) || (heroIn(sj, hero, ctx) && /と|二人|ふたり|三人|四人|みんな|全員|一同|たち|ら$/.test(sj));
      if (!self) return;
      var hm = HM.exec(rest); if (!hm || hm[0].charAt(0) === 'を') return;   /* 「〜を出て」は行き先が無いので読まない */
      var tail = rest.slice(hm.index); if (IRR.test(tail.slice(0, 16)) || IRR.test(rest.slice(0, hm.index).slice(-6))) return;   /* 打ち消し・未遂・仮定・意思 */
      if (/^(?:へ|に)向かって[^。]{0,16}(?:呼|叫|声を)/.test(tail)) return;   /* 「二階へ向かって呼ぶ」は動いていない（SCENE1 r5 と同じ） */
      var pre = rest.slice(0, hm.index), d = pre.match(/([^、。をはがでとにへ]{2,16})$/); if (!d) { ST.narrNoPlace++; return; }
      var IR = inRoomRe(), dd = d[1].replace(/^.*(?:ながら|[てで])(?=[^てで、]{2,}$)/, ''); if (!IR || IR.test(dd)) { ST.narrInRoom = (ST.narrInRoom || 0) + 1; return; }   /* 「机に向かった」「窓辺へ行った」は部屋の中の動き（SCENE1 b の INROOM） */
      var pl = placeOk(dd, hero, ctx); if (!pl) { ST.narrNoPlace++; return; }
      found = { kind: 'hero', place: pl, with: namesIn(sj + rest, ctx, hero), ev: s.slice(0, 40), narr: true, p2: 'narr' };
    });
    if (found) { ST.narrHero++; return [found]; }
    return [];
  }
  root.__v292DfixPLACE2 = { VER: VER, on: on, fixInput: fixInput, narrHero: narrHero, stats: function () { return JSON.parse(JSON.stringify({ ver: VER, on: on(), st: ST })); } };
})(typeof window !== 'undefined' ? window : globalThis);
