// =====================================================================
// Chronicle TRPG - v292Dfix417: 反応系の統合ブロック（Phase2 S2・M1解消）
//   設計書=設計書_Phase2_プロンプト統合再設計_2026-07-11.md §3（Fable5設計・Opus実装）。
//   目的: 反応系の分散（fix192本体/304/324/330/381/416a）のうち、矛盾の当事者と純粋
//     重複の4つ（304/330/381/416a）を1ブロックへ統合し、fix330「叫び・うめきを標準反応に
//     しない」とfix381/416a「まず声で反応」の綱引き（矛盾M1）を「キャラ別反応型」へ一本化する。
//   機構:
//     ・有効時のみ window.__v292SupersededMarkers に {'【キャラの反応】':1,'【痛覚】':1} を設定
//       → keeper v4(fix379) が fix381/416a の登録をスキップ（両ファイルは不触）。
//     ・window.__v292ReactUnified = true → fix330 / fix304 の直ラップが注入スキップ（各ファイルの
//       冒頭ガードで判定）。
//     ・統合ブロックを keeper レジストリ(__f379reg・prio2・marker='【反応と身体】')へ登録。
//   既定OFF（プレビュー）: v292Dfix417On='1' で有効・v292Dfix417Off='1' が最優先で無効。
//     OFFのときは superseded も __v292ReactUnified も設定しない＝330/304/381/416aが従来どおり動く。
//   冪等ガード: window.__v292Dfix417。ES5風。localStorage は読取のみ。
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix417) return;               // 冪等（二重実行回避）
  var TAG = '[v292Dfix417:reaction-unified]';
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function enabled(){ return ls('v292Dfix417On') === '1' && ls('v292Dfix417Off') !== '1'; } // 既定OFF・Off優先
  // ★fix425(2026-07-12): 監査#5/#6の根治。
  //   #5: 旧実装は enabled() を【読み込み時に1回だけ】評価していた。
  //       ONで読み込み→後からOFFにすると superseded だけが残り、fix381【キャラの反応】と
  //       fix416a【痛覚】まで道連れで消える（反応系が全部落ちる）。→ 毎ターン評価に変更。
  //   #6: keeper v4 を切る(v292Dfix379V4Off='1')と keeper が superseded を無視するため、
  //       417の統合ブロックと 381/416a が【二重に】乗る。→ v4無効時は417自体を出さない。
  function v4on(){ return ls('v292Dfix379V4Off') !== '1'; }
  function off425(){ return ls('v292Dfix425Off') === '1'; }
  // 実効判定: 425がOFFなら旧動作(読み込み時評価)に復帰
  function eff(){ return off425() ? _loadEnabled : (enabled() && v4on()); }
  var _loadEnabled = enabled();

  var MARKER = '【反応と身体（統合・最優先）】'; // 本文ヘッダ全文=keeper冪等がBLOCK自身に必ず命中する(二重ラップ時の二重注入防止)

  // 統合ブロック本文（設計書§3-2の4項テキストを一字一句そのまま）
  var BLOCK =
    '\n【反応と身体（統合・最優先）】\n' +
    '・重い受傷・脅威・実効的な拘束下では、状態相応の能力上限を出す。長い流暢な会話、広い状況把握、複数手順の最適化、精密で持続する動作を同時に成立させない。性格と技能は残った選択肢の使い方を変えるだけで、失った能力を戻さない。\n' +
    '・反応の「型」はそのキャラの性格・口調から選ぶ。声に出す人は悲鳴・うめき・叫び（「声」なので<say>タグ）で、こらえる人は途切れる息・強張り・震えなど身体で反応する。どちらの型でも、受傷や衝撃の直後はまず反応を描き、無反応で流さない。静かさは「抑えている」ことが伝わって初めて成立する。\n' +
    '・場にいるキャラは毎ターン、感情・身体・声のいずれかで具体的に反応する。反応の強さは場面の強度に比例させ、平穏な場面に激情を足さない。同じ反応を同じ描写で反復しない。\n' +
    '・身体行為は、支え・実効的拘束・使える手足・距離・向き・遮蔽と矛盾させない。主人公には身体上の制約だけを適用し、内面・台詞・意図は決めない。指示名や内部語を本文・台詞に出さない。\n' +
    '・受傷・恐怖・拘束の根拠が本文や状態に無い場合、それらを新たに仮定して制約を強めない。';

  // ★fix425: 旧OFF時は「何もせず return」だったため、フラグを後から変えてもリロードするまで
  //   効かなかった(#5)。425では常に登録し、eff() が false のあいだ全ての効果を無効化する
  //   （superseded=false / __v292ReactUnified=false / 統合ブロック本文='' ）。
  //   → リロード不要でON/OFFが切り替わる。425をOFFにすると従来の読み込み時評価に戻る。
  if (off425() && !_loadEnabled){
    G.__v292Dfix417 = true;                  // 旧動作: ガードだけ立てて何もしない
    try { console.log(TAG, 'inactive (legacy: v292Dfix425Off=1 & 417 off at load)'); } catch(e){}
    return;
  }
  G.__v292Dfix417 = true;

  // (1) superseded設定(動的): keeper v4 が fix381【キャラの反応】/fix416a【痛覚】をスキップ。
  //     keeper は毎ターン window.__v292SupersededMarkers[marker] を読むので、getter で live 評価する。
  G.__v292SupersededMarkers = G.__v292SupersededMarkers || {};
  ['【キャラの反応】', '【痛覚】'].forEach(function(mk){
    try {
      Object.defineProperty(G.__v292SupersededMarkers, mk, {
        configurable: true, enumerable: true,
        get: function(){ return eff() ? 1 : 0; }
      });
    } catch(e){ G.__v292SupersededMarkers[mk] = eff() ? 1 : 0; }   // defineProperty不可なら静的
  });
  // (2) fix330 / fix304 の直ラップに注入スキップさせる(動的)
  try {
    Object.defineProperty(G, '__v292ReactUnified', {
      configurable: true, enumerable: true,
      get: function(){ return eff(); }
    });
  } catch(e){ G.__v292ReactUnified = eff(); }

  // (3) keeperレジストリへ統合ブロックを登録（prio2・marker冪等）
  (function register(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; } // 二重登録回避
      // ★fix425: eff() が false のあいだは空文字を返す＝keeperが採用しない(サイズも消費しない)。
      reg.push({ off: 'v292Dfix417Off', marker: MARKER, prio: 2, text: function(){ return eff() ? BLOCK : ''; } });
      try { console.log(TAG, 'registered to __f379reg (prio2)'); } catch(_){}
    } catch(e){}
  })();

  try { console.log(TAG, 'active: reaction unified (superseded 【キャラの反応】/【痛覚】)'); } catch(e){}
})();
