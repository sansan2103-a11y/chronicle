// =====================================================================
// Chronicle TRPG - v292Dfix388: 一人称話者の誤帰属を根治（会話ログ）
// ---------------------------------------------------------------------
// 実例(2026-07-05・おしん報告): 会話ログに緑アイコンの謎キャラ「私」が出た。
//   turn19の地の文 「──っ」\n誰かの息を呑む音。\nそれが自分だと気づくのに一拍遅れた。\n私だ。
//   ＝主人公アリア自身の息遣い。ところが会話ログ判別器が裸引用「──っ」の近くの
//   一人称「私」を話者名として拾い、謎キャラ化した。
// 真因: 判別器の代名詞除外リスト ALL_PRONOUNS が三人称(彼/彼女/少女/少年…)だけで、
//   一人称(私/俺/僕/あたし/自分…)が入っていない（features.js 3819-3821）。
//   三人称は守られるのに一人称が素通りしていた。
// 方針（おしん承認の根本解 = ①土台 + ②仕上げ）:
//   ①一人称話者は主人公(hero)へ振り替える（一人称＝視点人物＝主人公＝意味的に正しい帰属）。
//   ②その引用が「記号だけの息遣い」（──っ / ……っ 等、意味のある文字を含まない）なら、
//     発話ではないので会話ログから除外し地の文に還す（主人公でもカードにしない）。
//   一人称の“実発話”（例「私は行く」）は①で主人公として残す（取りこぼさない）。
// 対象: 既存の全ターン（turn19の遡及修正）＋新ターン追従。fix66.repairで再描画。
//   <say>タグ由来(rv===1)は本人申告の契約なので不触。他キャラ(NPC/主人公実名)の
//   カードには触れない（過剰除外を避ける・fix388は一人称話者だけを扱う）。
// 既定ON。OFF: localStorage v292Dfix388Off='1'。検証: __v292Dfix388x.{dryRun,status}
// バックアップ: 補正直前のchr6を chr6_bk_fix388 に保存（セッション毎上書き）。
// =====================================================================
(function(){
  'use strict';
  if (window.__f388done) return; window.__f388done = 1;
  var TAG = '[v292Dfix388:first-person-speaker]';

  // 一人称の話者名（これらは実在キャラ名ではありえない＝誤帰属のシグナル）。
  var FIRST_PERSON = ['私','わたし','わたくし','あたし','あたい','あて','俺','おれ','オレ','俺様',
                      '僕','ぼく','ボク','自分','儂','わし','ワシ','うち','小生','拙者','某','わたしたち','私達','私たち'];
  // 記号・長音・小書き仮名・約物のみ（意味のある文字を含まない＝息遣い/呻き）。
  var STRIP = /[ー－—―─\-‐-‒–—〜～…‥・、。，．！？!?,.:：;；「」『』（）()\[\]｛｝【】〈〉《》\sぁぃぅぇぉっゃゅょァィゥェォッャュョ゛-ゞ♪★☆‥※]/g;

  function off(){ try { return localStorage.getItem('v292Dfix388Off') === '1'; } catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix388') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }
  function heroName(){
    try { var S = getS(); if (S && S.cast && S.cast.hero && S.cast.hero.name) return String(S.cast.hero.name); } catch(e){}
    return '';
  }
  function isFirstPerson(who){ return FIRST_PERSON.indexOf(String(who || '').trim()) >= 0; }
  function isBreath(say){ return String(say || '').replace(STRIP, '').length === 0; }

  // 1ターン分の _convSays を検査し、修正後の配列と変更内容を返す（副作用なし）。
  function planTurn(t, hero){
    var cs = t && t._convSays;
    if (!Array.isArray(cs)) return { changed: false };
    var out = [], changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var s = cs[i];
      if (!s){ continue; }
      var who = String(s.who || '').trim();
      var say = String(s.say || '');
      if (s._rv === 1){ out.push(s); continue; }          // <say>タグ由来は不触
      if (!isFirstPerson(who)){ out.push(s); continue; }   // 一人称話者だけを扱う
      if (isBreath(say)){                                   // ②記号だけの息遣い→除外
        changed = true; changes.push({ act: 'drop', from: who, say: say.slice(0, 16) });
        continue;
      }
      if (hero){                                            // ①実発話→主人公へ振替
        s.who = hero; changed = true; changes.push({ act: 'toHero', from: who, say: say.slice(0, 16) });
      }
      out.push(s);
    }
    return { changed: changed, arr: out, changes: changes };
  }

  // 全ターンを検査して修正を適用（変更があった時だけ save + 再描画）。
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var hero = heroName();
    var anyChange = false, log = [];
    var backedUp = false;
    for (var ti = 0; ti < S.turns.length; ti++){
      var t = S.turns[ti];
      var plan = planTurn(t, hero);
      if (plan.changed){
        if (!backedUp){ try { localStorage.setItem('chr6_bk_fix388', localStorage.getItem('chr6') || ''); } catch(e){} backedUp = true; }
        t._convSays = plan.arr;
        anyChange = true;
        log.push({ turn: ti + 1, changes: plan.changes });
      }
    }
    if (anyChange){
      try { if (!document.hidden && S.save) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, 'fixed:', JSON.stringify(log)); } catch(e){}
    }
    return { changed: anyChange, log: log };
  }

  // 起動6秒後に全ターン走査 → 以後2秒ポーリング（新ターン追従）。
  var lastLen = -1;
  function tick(){
    try {
      if (off()) return;
      var S = getS();
      var len = (S && Array.isArray(S.turns)) ? S.turns.length : -1;
      // 新ターンが増えた時 or 初回に走査（既存turnの遡及も初回で処理）。
      if (len === lastLen) return;
      lastLen = len;
      repair();
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000);

  // 検証用（純粋・副作用なし）。
  window.__v292Dfix388x = {
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var hero = heroName(); var res = [];
      for (var i = 0; i < S.turns.length; i++){
        // dryRunでは配列を汚さないようディープコピーで試算
        var copy = { _convSays: (S.turns[i]._convSays || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, hero);
        if (p.changed) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    status: function(){ return { off: off(), hero: heroName() }; },
    repair: repair
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
