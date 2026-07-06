// =====================================================================
// Chronicle TRPG - v292Dfix292: 文体ヘルスメーター(Pro長文脈劣化の見える化)
// ---------------------------------------------------------------------
// おしんFB「(Proが)劣化したら分かりやすい方法」。
// 本文の劣化サイン(句読点が減る/機械的な実況語が増える/同じ語の反復)を毎ターン
//   自動計測し、トップバーに状態バッジを出す。悪化したら⚠＋対処サジェストを表示。
//   ・fix289(暴走分析)で使った指標をそのままUI化:
//     句読点密度 / 機械語マーカー数 / 短い反復の有無 → ok / warn / danger
//   ・判定ロジックは window.__v292Health.scoreText() で公開し、fix293(自己模倣カット)が
//     「直前ターンが劣化していたら文体を立て直す」指示の判断に使う。
// OFF: localStorage v292HealthOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix292:health]';
  if (window.__v292Dfix292) return;
  window.__v292Dfix292 = true;

  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }

  // システム/観測ログ調の語(普通の物語ではまず出ない、明確に無機質なものに絞る=誤検知防止)
  var MECH = /(予測値|許容範囲内?|優先順位|観測継続|観測中|報告終了|通信遮断|自律モード|稼働(?:中|再開)|処理待ち|計測値|戦線復帰|血流遮断|誤差±|[0-9０-９]+\s*mm|[0-9０-９]+\s*秒(?:以内|以下|程度)|残り[0-9０-９]+秒|確率[0-9０-９]+|パラメータ|スペック|データ転送|演算|出力値)/g;

  function scoreText(narr){
    narr = String(narr || '');
    var clean = narr.replace(/<[^>]+>/g, '');
    if (clean.length < 60) return { level:'ok', punct:1, mech:0, rep:false, len:clean.length };
    var punct = (clean.match(/[。、！？]/g) || []).length / clean.length;
    var mech = (clean.match(MECH) || []).length;
    var rep = /([ぁ-んァ-ヶー一-龥]{2,10})\1\1/.test(clean.replace(/[。、\n\s　]/g, '')); // 同じ2〜10字が3連
    var level = 'ok';
    if (punct < 0.030 || mech >= 3 || rep) level = 'danger';
    else if (punct < 0.045 || mech >= 1) level = 'warn';
    return { level: level, punct: punct, mech: mech, rep: rep, len: clean.length };
  }

  function latestNarr(){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return '';
      var t = S.turns[S.turns.length - 1] || {};
      var n = (t.narrative || (t.plan && t.plan.narrative) || []);
      if (Array.isArray(n)) n = n.join('\n');
      return String(n || '');
    } catch(e){ return ''; }
  }
  function latestScore(){ return scoreText(latestNarr()); }

  // ---- トップバーのバッジ ----
  var COLORS = { ok:'#5fb87a', warn:'#d6a435', danger:'#e06060' };
  var LABEL = { ok:'文体：良好', warn:'⚠ 文体やや硬め', danger:'⚠ 文体が硬化' }; // v292Dfix398: ✓→良好(状態表示と分かる文言に)
  function tip(sc){
    if (sc.level === 'ok') return '文体は健全です（句読点・描写ともに自然）。\n（Proは40ターンを超えると徐々に機械的な実況調に崩れやすいので、このメーターで見張っています）';
    var why = [];
    if (sc.punct < 0.045) why.push('句読点が少なめ（密度' + sc.punct.toFixed(3) + '）');
    if (sc.mech >= 1) why.push('機械的な実況語が混入(' + sc.mech + ')');
    if (sc.rep) why.push('同じ語の反復あり');
    return '文体が硬くなってきました：' + why.join('・') + '。\n\n対処の目安:\n・🎭トーンを「濃」か「会話劇」に\n・🧠モデルを「Flash」に切替（Proは長文脈で崩れやすい）\n・物語が長い(40ターン超)なら、📁セーブで区切って新スロットで仕切り直し\n・1回だけ「やり直す」で引き直すと直ることも';
  }

  var badge = null;
  function ensureBadge(){
    if (badge && document.body.contains(badge)) return badge;
    var tb = document.getElementById('topbar'); if (!tb) return null;
    badge = document.getElementById('v292-health');
    if (!badge){
      badge = document.createElement('span');
      badge.id = 'v292-health';
      badge.style.cssText = 'margin-left:8px;font-size:11px;padding:2px 7px;border-radius:10px;cursor:help;display:inline-flex;align-items:center;white-space:nowrap;';
      badge.addEventListener('click', function(){ try { alert(tip(latestScore())); } catch(e){} });
      tb.appendChild(badge);
    }
    return badge;
  }
  var lastLen = -1, lastLevel = '';
  function refresh(force){
    try {
      if (localStorage.getItem('v292HealthOff') === '1'){ if (badge) badge.style.display = 'none'; return; }
      var S = getS(); var len = (S && S.turns) ? S.turns.length : 0;
      if (!force && len === lastLen) return; // 新ターンが来た時だけ再計算
      lastLen = len;
      var b = ensureBadge(); if (!b) return;
      var sc = latestScore();
      lastLevel = sc.level;
      b.style.display = (len > 0) ? 'inline-flex' : 'none';
      b.textContent = LABEL[sc.level];
      b.style.background = 'rgba(0,0,0,.25)';
      b.style.color = COLORS[sc.level];
      b.style.border = '1px solid ' + COLORS[sc.level];
      b.title = tip(sc);
      window.__v292HealthLast = sc;
    } catch(e){}
  }
  try { setInterval(function(){ refresh(false); }, 1500); } catch(e){}
  refresh(true);

  window.__v292Health = { scoreText: scoreText, latestScore: latestScore, latestNarr: latestNarr, refresh: refresh };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
