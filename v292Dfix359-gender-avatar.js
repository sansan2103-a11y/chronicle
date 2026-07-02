// =====================================================================
// Chronicle TRPG - v292Dfix359: 性別設定をアイコンに強制反映
// 背景(2026-07-02 おしん指摘「女性を選んでるキャラが男性っぽい。選ぶ意味がない」):
//   真因=AI外見判定(features.js内fix118系・chrAiAv4:<名前>::<descHash>に英語
//   プロンプトを書く)が**キャラの性別設定(S.cast[].gender)を一切受け取らない**。
//   説明文が中性的だとLLMが男性像に寄せる→ツカサ/フユ/アサヒ(全員女性設定)が
//   全員男性プロンプトになっていた(実測)。
// 対策: アイコン生成fetch(384x384)をラップし、送信プロンプトを
//   「キャスト各員のchrAiAv4キャッシュ値と先頭一致」で誰の分か特定→
//   その子の性別設定と矛盾する語を強制置換(man→woman等)+性別語が無ければ前置。
//   キャッシュ自体は書き換えない(判定再実行にも自然に追従・冪等)。
//   fix338(画風prefix)より外側で走るので、整形後に画風が乗る=順序も安全。
// 対象: 性別が「女性」or「男性」のキャスト(未設定はそのまま)。未登録キャラは不触。
// OFF: localStorage v292Dfix359Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix359) return; window.__v292Dfix359 = true;
  var TAG = '[v292Dfix359:genderAv]';
  function off(){ try{ return localStorage.getItem('v292Dfix359Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }

  // 性別と矛盾する語を置換(長い句から先に・\bでwoman/human等の誤爆なし)
  function enforceGender(p, gender){
    if (gender === '女性') {
      var had = /\b(female|woman|girl|lady)\b|女性|少女|娘/i.test(p);
      p = p.replace(/\bmiddle-aged man\b/gi, 'middle-aged woman')
           .replace(/\byoung man\b/gi, 'young woman')
           .replace(/\bold man\b/gi, 'old woman')
           .replace(/\bman\b/gi, 'woman')
           .replace(/\bmale\b/gi, 'female')
           .replace(/\bboy\b/gi, 'girl')
           .replace(/\bhe\b/gi, 'she')
           .replace(/\bhis\b/gi, 'her')
           .replace(/\bhim\b/gi, 'her')
           .replace(/男性|青年/g, '女性')
           .replace(/少年/g, '少女');
      if (!had && !/\b(female|woman|girl)\b|女性|少女/i.test(p)) p = 'female, ' + p;
      return p;
    }
    if (gender === '男性') {
      var hadM = /\b(male|man|boy)\b|男性|少年/i.test(p);
      p = p.replace(/\bmiddle-aged woman\b/gi, 'middle-aged man')
           .replace(/\byoung woman\b/gi, 'young man')
           .replace(/\bold woman\b/gi, 'old man')
           .replace(/\bwoman\b/gi, 'man')
           .replace(/\bfemale\b/gi, 'male')
           .replace(/\bgirl\b/gi, 'boy')
           .replace(/\bshe\b/gi, 'he')
           .replace(/\bher\b/gi, 'his')
           .replace(/女性/g, '男性')
           .replace(/少女/g, '少年');
      if (!hadM && !/\b(male|man|boy)\b|男性|少年/i.test(p)) p = 'male, ' + p;
      return p;
    }
    return p;
  }

  // このプロンプトがどのキャストの分か: chrAiAv4キャッシュ値との先頭一致で特定
  function ownerGender(prompt){
    try {
      var S = getS(); if (!S || !S.cast) return null;
      var cast = [];
      if (S.cast.hero && S.cast.hero.name) cast.push(S.cast.hero);
      (S.cast.npcs||[]).forEach(function(n){ if (n && n.name) cast.push(n); });
      for (var i = 0; i < cast.length; i++) {
        var c = cast[i];
        var g = c.gender;
        if (g !== '女性' && g !== '男性') continue;
        for (var j = 0; j < localStorage.length; j++) {
          var k = localStorage.key(j);
          if (!k || k.indexOf('chrAiAv4:' + c.name + '::') !== 0) continue;
          var v = String(localStorage.getItem(k) || '');
          if (!v) continue;
          var head = v.slice(0, 40);
          if (head && prompt.indexOf(head) >= 0) return g;
        }
      }
    } catch(e){}
    return null;
  }

  function transform(prompt){
    try {
      var g = ownerGender(String(prompt||''));
      if (!g) return prompt;
      var np = enforceGender(String(prompt), g);
      if (np !== prompt) { try{ console.log(TAG, 'gender enforced ('+g+')'); }catch(_){} }
      return np;
    } catch(e){ return prompt; }
  }
  window.__v292Dfix359 = { enforceGender: enforceGender, transform: transform };

  // アイコン生成fetch(384x384)だけラップ(fix338と同じ判定・こちらが外側で先に走る)
  var _fetch = window.fetch;
  window.fetch = function(url, init){
    try {
      if (!off()) {
        var u = String(url||'');
        if (u.indexOf('gen.pollinations.ai') >= 0 && u.indexOf('/images/generations') >= 0
            && init && typeof init.body === 'string' && init.body.indexOf('384x384') >= 0) {
          var j = JSON.parse(init.body);
          if (j && j.prompt) { j.prompt = transform(j.prompt); init = Object.assign({}, init, {body: JSON.stringify(j)}); }
        } else if (u.indexOf('image.pollinations.ai/prompt/') >= 0 && /width=384&height=384/.test(u)) {
          var mm = /\/prompt\/([^?]+)(\?.*)$/.exec(u);
          if (mm) {
            var dec = ''; try { dec = decodeURIComponent(mm[1]); } catch(_e){ dec = mm[1]; }
            var np = transform(dec);
            if (np !== dec) url = u.slice(0, mm.index) + '/prompt/' + encodeURIComponent(np) + mm[2];
          }
        }
      }
    } catch(e){ try{ console.warn(TAG, 'wrap error', e); }catch(_){} }
    return _fetch.call(this, url, init);
  };

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
