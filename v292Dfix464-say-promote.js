// =====================================================================
// Chronicle TRPG - v292Dfix464: 裸セリフを受信時に <say> へ昇格（話者ミスの上流根治）
// ---------------------------------------------------------------------
// 背景(fix462で確定): モデルはセリフの一部を <say who> で囲まず地の文に裸の「」で書く。
//   index.html の裸引用フォールバックは話者候補が登録名フルネームのみ → 短縮名(澪/ひなた)が
//   拾えず「登場者0人→主人公」に落ちる = NPCの台詞が主人公へ吸われる。
//   fix462 は**出来上がったカードを直す**下流の手当て。本fixは**上流**で、
//   応答を受け取った瞬間に裸セリフへ話者タグを付け、そもそも誤帰属を起こさせない。
//
// 効果:
//   ・会話ログの話者が正しくなる（fix462 に頼らない）
//   ・**モデルが次ターンで読む履歴(_convSays/recentDialogues)も正しくなる**（誤りの自己強化を断つ）
//   ・状態追跡(<state>)や関係ゲージなど、話者を使う全機能が正しい入力を得る
//
// 方式: fetch境界(応答受信直後)で choices[0].message.content を書き換える。
//   ・対象は「行全体が「…」だけの裸セリフ」のみ（地の文中の引用は触らない）
//   ・話者は fix462 の解決器(前後の行の「Xの声が」「Xは…言った」)で決める
//   ・**強い手がかり(score>=4)のときだけ**タグ化。曖昧なら裸のまま（従来動作＋fix462が受ける）
//   ・既に <say> が付いている行、<react>/<state> 以降は不触
//
// 既定ON。OFF: localStorage v292Dfix464Off='1'
// 検証口: window.__v292Dfix464 = { promote, stats }
// =====================================================================
(function(){
  'use strict';
  if (window.__f464done) return; window.__f464done = 1;
  var TAG = '[v292Dfix464:say-promote]';

  function off(){ try { return localStorage.getItem('v292Dfix464Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  var stats = { turns: 0, promoted: 0, left: 0, last: [] };

  function names(){
    var out = [];
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); });
      }
    } catch(e){}
    return out.filter(Boolean);
  }

  // 本体(pure)。text=モデルの生応答。tokens=fix462のトークン表。
  function promote(text, tokens, resolve){
    var s = String(text || '');
    if (!s || !tokens || !tokens.length || typeof resolve !== 'function') return { text: s, promoted: 0, left: 0, log: [] };
    // <react/<state 以降は触らない
    var cut = s.search(/<react|<state/);
    var head = (cut >= 0) ? s.slice(0, cut) : s;
    var tail = (cut >= 0) ? s.slice(cut) : '';
    var lines = head.split('\n');
    var promoted = 0, left = 0, log = [];
    for (var i = 0; i < lines.length; i++){
      var l = lines[i];
      var t = String(l || '').trim();
      if (!t) continue;
      if (t.indexOf('<say') >= 0 || t.indexOf('<') === 0) continue;          // 既にタグ / 他のタグ行
      var m = t.match(/^[「『]([^」』]{2,})[」』]$/);                          // 行全体が裸のセリフ
      if (!m) continue;
      var say = m[1];
      var r = null;
      try { r = resolve(head, t, tokens); } catch(e){ r = null; }
      if (!r || r.score < 4 || !r.who){ left++; continue; }                   // 強い手がかりだけ採用
      lines[i] = l.replace(t, '<say who="' + r.who + '">' + say + '</say>');
      promoted++;
      log.push({ who: r.who, score: r.score, say: say.slice(0, 14) });
    }
    return { text: lines.join('\n') + tail, promoted: promoted, left: left, log: log };
  }

  // ---- fetch境界（応答受信直後） ----
  function isStoryCall(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (!/workers\.dev|openrouter/.test(u)) return false;
      if (!init || init.method !== 'POST' || typeof init.body !== 'string') return false;
      return init.body.indexOf('"messages"') >= 0;    // 物語生成(chat)のみ。画像は対象外
    } catch(e){ return false; }
  }

  var of = window.fetch;
  var wrapped = function(url, init){
    var p = of.apply(this, [url, init]);
    if (off() || !isStoryCall(url, init)) return p;
    return p.then(function(res){
      if (!res || !res.ok) return res;
      return res.clone().text().then(function(txt){
        try {
          var j = JSON.parse(txt);
          var c = j && j.choices && j.choices[0] && j.choices[0].message;
          if (!c || typeof c.content !== 'string') return res;
          var x = window.__v292Dfix462x;
          if (!x || typeof x.tokensOf !== 'function' || typeof x.resolve !== 'function') return res;
          var ns = names();
          if (ns.length < 2) return res;
          var r = promote(c.content, x.tokensOf(ns), x.resolve);
          stats.turns++; stats.promoted += r.promoted; stats.left += r.left; stats.last = r.log;
          if (!r.promoted) return res;
          c.content = r.text;
          try { console.log(TAG, '裸セリフ→タグ昇格:', r.promoted, '件 / 見送り', r.left, '件', JSON.stringify(r.log)); } catch(e){}
          return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: res.headers });
        } catch(e){ try { console.warn(TAG, 'skip:', e && e.message); } catch(_){} return res; }
      }).catch(function(){ return res; });
    });
  };
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}   // fix419教訓: own props全継承
  wrapped.__f464 = true;
  window.fetch = wrapped;

  window.__v292Dfix464 = { __armed: true, promote: promote, stats: function(){ return stats; }, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
