// =====================================================================
// Chronicle TRPG - v292Dfix379: wrap-keeper（build wrap喪失レースの根治）
// v2(fix381同時): ブロックレジストリ化。以後のsys注入fixは window.__f379reg に
//   {off:'OFFキー', marker:'冪等マーカー', text:function(){return '\n【…】…';}} を
//   push するだけで、喪失レースを気にせず毎ターン確実に注入される。
// v3(2026-07-05): 優先度付き注入予算。sys注入ブロックが今後増えても合計サイズが
//   構造的に上限を超えないようにする（長期プレイのsys肥大防止）。
//   ・レジストリentryに任意フィールド prio を追加（1=必須/2=標準/3=任意・未指定=2）。
//   ・wrap内で候補を全部集めてから予算BUDGET内に収める。超過分はprio3→2の順に
//     レジストリ登録の逆順で除外（prio1は予算に関係なく必ず注入）。
//   ・除外時 console.log で dropped を通知。採用分はレジストリ順のまま追加（順序不変）。
//   ・後方互換: prio未指定の既存push(fix381/382/385等)は2として扱う。
// ---------------------------------------------------------------------
// 真因(2026-07-04実測): boot後にPlanner.buildが差し替えられるタイミング次第で、
//   fix363(種)/fix366(キャラ属性)/fix376(話者厳守)/fix377(口調)のbuildラップが
//   まるごと失われるロードがある（各fixの再試行は30秒で打ち切り＝差し替えを検知できない）。
// 対策: 2秒ポーリングで P.build.__f379 マーカーを監視し、消えていたら再ラップ。
//   各ブロックは元fixと同一文言・同一マーカー冪等・各fixのOFFスイッチを尊重。
//   元fixのラップが生きていれば sys マーカーで二重追加は起きない（共存安全）。
// OFF: localStorage v292Dfix379Off='1'（keeperのみ停止。各fix本体のOFFは従来どおり）
// =====================================================================
(function(){
  'use strict';
  if (window.__f379done) return; window.__f379done = 1;
  var TAG = '[v292Dfix379:wrap-keeper]';
  // 注入予算（文字数）。実測sys6.5k + 緊急圧縮9k基準に対し、注入ブロック合計の上限を
  // 保守的に1200字へ据える。prio1(必須)は予算外で常に注入、prio2/3が予算内で競合する。
  var BUDGET = 1200;
  function off(){ try { return localStorage.getItem('v292Dfix379Off') === '1'; } catch(e){ return false; } }
  function offK(k){ try { return !!k && localStorage.getItem(k) === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  var SEED = '\n【プレイヤーの種】プレイヤーがDO/SAY/STORYで書き込む内容は、この物語の種である。入力に現れた固有名詞・場所・小道具・意図・思いつきは使い捨てにせず物語の記憶として拾い上げ、のちの展開で芽吹かせて意味を持たせる。入力を素通りさせたり打ち消したりせず、その方向へ世界を確かに動かして応える。';
  var SPK = '\n【話者厳守】主人公が話しかけた直後の返答セリフは、返答した本人の<say 名前>タグで書く（主人公のタグに入れない）。万一セリフを地の文の「」で書く場合は、直前の文に必ずその話者の名前を書く。';
  function genderBlock(){
    try {
      var S = getS(); if (!S || !S.cast) return '';
      var parts = [];
      var h = S.cast.hero;
      if (h && h.gender && (h.name || '').length) parts.push(h.name + '(主人公)=' + h.gender);
      (S.cast.npcs || []).forEach(function(n){ if (n && n.name && n.gender) parts.push(n.name + '=' + n.gender); });
      if (!parts.length) return '';
      return '\n【キャラ属性】' + parts.join('、') + '。各キャラの一人称・言葉遣い・地の文の代名詞(彼/彼女)は、この性別と人物像に必ず一致させる。';
    } catch(e){ return ''; }
  }
  // ---- ブロックレジストリ（fix381以降もここに登録するだけで喪失レース知らず） ----
  // prio: 1=必須(予算外で常に注入) / 2=標準 / 3=任意。未指定は2として扱う。
  window.__f379reg = window.__f379reg || [];
  var reg = window.__f379reg;
  reg.push({ off: 'v292Dfix363Off', marker: '【プレイヤーの種】', prio: 2, text: function(){ return SEED; } });
  reg.push({ off: 'v292Dfix366Off', marker: '【キャラ属性】', prio: 1, text: genderBlock });
  reg.push({ off: 'v292Dfix376Off', marker: '【話者厳守】', prio: 1, text: function(){ return SPK; } });
  reg.push({ off: 'v292Dfix377Off', marker: '【口調】', prio: 1, text: function(){
    try { return (window.__v292Dfix377x && window.__v292Dfix377x.block) ? window.__v292Dfix377x.block() : ''; } catch(e){ return ''; }
  } });

  // 予算に基づいて採用/除外を決める。返り値は「採用する候補の配列（レジストリ順）」。
  // cands = [{ idx, entry, text, prio, size }]（レジストリ順で渡すこと）。
  function budgetSelect(cands){
    // prio1 は無条件採用。残りの予算 = BUDGET - Σ(prio1 size)。
    var i, c;
    var used = 0;
    var dropped = {}; // idx -> true
    for (i = 0; i < cands.length; i++){
      c = cands[i];
      if (c.prio === 1) used += c.size;
    }
    var remain = BUDGET - used;
    if (remain < 0) remain = 0;
    // prio2/3 を積む。合計が remain を超える場合、prio の大きい方(3→2)から、
    // かつレジストリ登録の逆順で除外していく。
    var nonEssential = [];
    for (i = 0; i < cands.length; i++){
      c = cands[i];
      if (c.prio !== 1) nonEssential.push(c);
    }
    var sumNon = 0;
    for (i = 0; i < nonEssential.length; i++) sumNon += nonEssential[i].size;
    if (sumNon > remain){
      // 除外順: prio 降順（3を先に）、同prioなら idx 降順（登録の逆順）。
      var order = nonEssential.slice().sort(function(a, b){
        if (a.prio !== b.prio) return b.prio - a.prio;
        return b.idx - a.idx;
      });
      var cut = sumNon;
      for (i = 0; i < order.length && cut > remain; i++){
        c = order[i];
        dropped[c.idx] = true;
        cut -= c.size;
        try { console.log(TAG, 'budget: dropped', c.entry.marker, c.size); } catch(e){}
      }
    }
    // 採用分をレジストリ順で返す。
    var out = [];
    for (i = 0; i < cands.length; i++){
      c = cands[i];
      if (!dropped[c.idx]) out.push(c);
    }
    return out;
  }

  function ensure(){
    if (off()) return;
    try {
      var P = window.Planner || (0,eval)('typeof Planner!=="undefined" ? Planner : null');
      if (!P || typeof P.build !== 'function' || P.build.__f379) return;
      var ob = P.build;
      var w = function(){
        var r = ob.apply(this, arguments);
        try {
          if (off() || !r || typeof r.sys !== 'string') return r;
          // (a) 各entryを順に評価して候補を集める（この時点ではr.sysに足さない）。
          var cands = [];
          for (var i = 0; i < reg.length; i++){
            var en = reg[i];
            try {
              if (!en || offK(en.off)) continue;
              if (en.marker && r.sys.indexOf(en.marker) >= 0) continue; // 冪等: 既に乗っていればスキップ
              var t = en.text ? en.text() : '';
              if (!t) continue;
              var pr = (en.prio === 1 || en.prio === 2 || en.prio === 3) ? en.prio : 2; // 未指定=2
              cands.push({ idx: i, entry: en, text: t, prio: pr, size: t.length });
            } catch(e2){}
          }
          // (b) 予算内に収める。
          var chosen = budgetSelect(cands);
          // (c) 採用分をレジストリ順のまま r.sys へ追加。
          for (var j = 0; j < chosen.length; j++){
            r.sys += chosen[j].text;
          }
        } catch(e){}
        return r;
      };
      w.__f379 = 1;
      try { w._f363mark = true; } catch(e){} // fix363のarmWrapに二重ラップさせない
      P.build = w;
      try { console.log(TAG, 're-armed Planner.build (' + reg.length + ' blocks)'); } catch(e){}
    } catch(e){}
  }
  ensure();
  setInterval(ensure, 2000);
  try { console.log(TAG, 'loaded v3 (off=' + (off() ? '1' : '0') + ', budget=' + BUDGET + ')'); } catch(e){}
  // 検証用（node単体テストからも参照可能）
  try { window.__f379x = { budgetSelect: budgetSelect, BUDGET: BUDGET, reg: reg }; } catch(e){}
})();
