// v276e-cast-lock.js
// 目的: v276 character-mind の出力キーを「実際のキャスト名」に強制する。
//
// 観測された問題 (2026-05-10):
//   キャスト ミコト / ユキ / ケイト に対して Hermes 4 が
//   米子 / 雪華 / 久仁子 など創作した「フル日本語名」をキーにして返す。
//
// 原因:
//   1) v276c の SCHEMA_EXAMPLE 内にある「リナ / カエデ / スピカ など」という
//      具体的フル日本語名の例が、Hermes 4 にとって「期待される名前フォーマット」の
//      バイアスになり、実際のキャスト (カタカナ) を無視して別名を生成してしまう。
//   2) v276 の buildMindRequest は cast hint を user message に「登場キャラ候補」
//      という弱い表現で含めているだけ。hard constraint ではない。
//   3) post-parse 時にキー検証が無いため、不正なキーがそのまま __v276Mind に格納。
//
// 対策 (2 段):
//   A. fetch hook (最外側) で、送信 body の system / user に
//      「キャストロック」ルールを強く明示。具体的に「米子・雪華・久仁子・リナ・カエデ・
//      スピカ」を NG 例として列挙。実キャスト名のみ列挙して「これ以外を作るな」。
//   B. window.__v276bRepair を wrap し、parse 後のキーを cast roster に remap。
//      完全一致 → 部分一致 → 文字 overlap → 順序対応 → drop。
//
// チェーン (install 後):
//   caller → window.fetch (= v276e wrapper, 最外側)
//     → v276d wrapper (post-receive: extractAndStoreMind, __v276bRepair 経由)
//       → v276c wrapper (pre-send: SCHEMA_EXAMPLE/BANLIST 追加)
//         → 元の fetch
//
//   応答パスでは v276d が __v276bRepair を呼ぶ。我々はそれを wrap してキー remap。
//
// 哲学:
//   おしんさんの「制約より刺激」哲学は値の中身に対するもので、外形 (キー名) の
//   一致は厳格に守る。むしろここを締めることで、値の自由度が活きる。
//
// ガード: window.__v276eActive

(function v276e(){
  'use strict';
  if (window.__v276eActive) return;
  window.__v276eActive = true;
  console.log('[v276e] cast-lock init');

  var FORBIDDEN_EXAMPLES = '米子・雪華・久仁子・リナ・カエデ・スピカ・ヨネコ・セツカ・クニコ';

  // === Cast roster 取得 ===
  function getCastRoster(){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var names = [];
      if (s.cast){
        if (s.cast.hero && s.cast.hero.name){
          names.push(String(s.cast.hero.name).trim());
        }
        if (Array.isArray(s.cast.npcs)){
          s.cast.npcs.forEach(function(n){
            if (n && n.name) names.push(String(n.name).trim());
          });
        } else {
          // fallback: legacy shape
          Object.keys(s.cast).forEach(function(k){
            if (k === 'hero' || k === 'npcs') return;
            var c = s.cast[k];
            if (c && c.name) names.push(String(c.name).trim());
          });
        }
      }
      return names.filter(function(n){ return !!n; });
    } catch(e){ return []; }
  }

  // === Lock instruction (system 末尾用) ===
  function buildLockSystem(roster){
    if (!roster.length) return '';
    var listed = roster.map(function(n, i){ return '  ' + (i + 1) + '. 「' + n + '」'; }).join('\n');
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【キャストロック — 厳守 (v276e)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '出力 JSON のトップレベルキーは、以下に列挙する **実在キャラ名そのまま** のみ。',
      '',
      '今のシーンの実在キャスト:',
      listed,
      '',
      '【絶対禁止】',
      '・上記の名前を漢字化・カタカナ化・愛称化・別名化すること',
      '・上記以外の新しい名前を発明すること (例: ' + FORBIDDEN_EXAMPLES + ' などは厳禁)',
      '・ナラティブ中で別の呼び方 (兄、姉、お兄さん、彼、彼女) が出てきても、',
      '  出力 JSON のキーは上記の名前そのまま',
      '・例文 ("<キャラA>" / "<キャラB>" / "リナ" / "カエデ" / "スピカ") のような',
      '  プレースホルダ・例示名は絶対にキーに使わない',
      '',
      '【シーンに登場していないキャラ】',
      'キーごと省略する (空文字列で埋めない / 別名で穴埋めしない)',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  // === Lock instruction (user 末尾用 — recency bias 最大化) ===
  function buildLockUser(roster){
    if (!roster.length) return '';
    return [
      '',
      '[再確認 — 出力直前に必読]',
      '出力する JSON のキーは次の名前そのまま、これ以外を作ってはいけない:',
      roster.map(function(n){ return '  ・「' + n + '」'; }).join('\n'),
      '禁止例: { "米子": "..." } / { "雪華": "..." } / { "リナ": "..." } など、',
      '上記以外の名前を新たに発明することは失敗。'
    ].join('\n');
  }

  // === 送信 body 改変 ===
  function modifyOutgoingBody(body){
    try {
      var roster = getCastRoster();
      if (!roster.length) return body;
      var sysAdd = buildLockSystem(roster);
      var usrAdd = buildLockUser(roster);
      var msgs = Array.isArray(body.messages) ? body.messages.slice() : [];

      // system に追加 (LAST system message に append; 無ければ unshift)
      var lastSysIdx = -1;
      for (var i = 0; i < msgs.length; i++){
        if (msgs[i].role === 'system') lastSysIdx = i;
      }
      if (lastSysIdx >= 0){
        msgs[lastSysIdx] = {
          role: 'system',
          content: msgs[lastSysIdx].content + '\n' + sysAdd
        };
      } else {
        msgs.unshift({ role: 'system', content: sysAdd });
      }

      // 最後の user message に append (recency)
      for (var j = msgs.length - 1; j >= 0; j--){
        if (msgs[j].role === 'user'){
          msgs[j] = {
            role: 'user',
            content: msgs[j].content + '\n' + usrAdd
          };
          break;
        }
      }
      body.messages = msgs;
      return body;
    } catch(e){
      console.warn('[v276e] body modify failed', e);
      return body;
    }
  }

  // === Fuzzy match: returned key → roster name ===
  function fuzzyMatch(key, roster){
    if (!key) return null;
    var k = String(key).trim();
    // 1. exact
    for (var i = 0; i < roster.length; i++){
      if (roster[i] === k) return roster[i];
    }
    // 2. substring (双方向)
    for (var i = 0; i < roster.length; i++){
      if (roster[i].indexOf(k) >= 0 || k.indexOf(roster[i]) >= 0) return roster[i];
    }
    // 3. char overlap >= 50%
    var bestScore = 0, best = null;
    for (var i = 0; i < roster.length; i++){
      var rn = roster[i];
      var common = 0;
      for (var c = 0; c < rn.length; c++){
        if (k.indexOf(rn.charAt(c)) >= 0) common++;
      }
      var score = common / Math.max(rn.length, 1);
      if (score > bestScore && score >= 0.5){
        bestScore = score;
        best = rn;
      }
    }
    return best;
  }

  // === Parse 後 mind keys を roster に remap ===
  function remapMind(parsed){
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
    var roster = getCastRoster();
    if (!roster.length) return parsed;
    var keys = Object.keys(parsed);
    var rosterUsed = {};
    var out = {};
    var unmapped = [];

    // Pass 1: exact / fuzzy 一致を優先
    keys.forEach(function(k){
      var hit = fuzzyMatch(k, roster);
      if (hit && !rosterUsed[hit]){
        out[hit] = parsed[k];
        rosterUsed[hit] = true;
        if (hit !== k) console.log('[v276e] fuzzy remap:', k, '→', hit);
      } else {
        unmapped.push({ k: k, v: parsed[k] });
      }
    });

    // Pass 2: 残りを順序対応 (LLM が完全に別名を返した場合のフォールバック)
    if (unmapped.length){
      var remaining = roster.filter(function(n){ return !rosterUsed[n]; });
      if (unmapped.length <= remaining.length){
        for (var i = 0; i < unmapped.length; i++){
          out[remaining[i]] = unmapped[i].v;
          rosterUsed[remaining[i]] = true;
          console.warn('[v276e] positional remap:', unmapped[i].k, '→', remaining[i]);
        }
      } else {
        unmapped.forEach(function(u){
          console.warn('[v276e] dropped unknown key:', u.k);
        });
      }
    }

    var changed = JSON.stringify(out) !== JSON.stringify(parsed);
    if (changed){
      console.log('[v276e] remapped: [' + keys.join(',') + '] → [' + Object.keys(out).join(',') + ']');
    }
    return out;
  }

  // === __v276bRepair を wrap (応答 parse → remap) ===
  function installRepairWrap(){
    if (typeof window.__v276bRepair !== 'function') return false;
    if (window.__v276bRepair.__v276eWrapped) return true;
    var orig = window.__v276bRepair;
    var wrapped = function(text){
      var parsed = orig(text);
      return remapMind(parsed);
    };
    wrapped.__v276eWrapped = true;
    window.__v276bRepair = wrapped;
    console.log('[v276e] __v276bRepair wrapped');
    return true;
  }
  installRepairWrap();
  var rTries = 0;
  var rIv = setInterval(function(){
    if (installRepairWrap() || ++rTries > 30) clearInterval(rIv);
  }, 500);

  // === fetch hook (最外側) ===
  function isMindCall(url, opts){
    if (typeof url !== 'string') return false;
    if (url.indexOf('openrouter.ai') < 0) return false;
    if (!opts || !opts.headers) return false;
    var title = opts.headers['X-Title'] || opts.headers['x-title'];
    return typeof title === 'string' && title.indexOf('v276 character-mind') >= 0;
  }

  function installFetchWrap(){
    var top = window.fetch;
    if (typeof top !== 'function') return;
    if (top.__v276eInstalled) return;

    var wrapped = function(url, opts){
      if (!isMindCall(url, opts) || !opts || !opts.body){
        return top.apply(this, arguments);
      }
      try {
        var body = JSON.parse(opts.body);
        body = modifyOutgoingBody(body);
        var newOpts = Object.assign({}, opts, { body: JSON.stringify(body) });
        console.log('[v276e] cast-lock applied to outgoing mind request');
        return top.call(this, url, newOpts);
      } catch(e){
        console.warn('[v276e] body parse failed, sending original', e);
        return top.apply(this, arguments);
      }
    };
    wrapped.__v276eInstalled = true;
    wrapped.__wrappedFetch = top;
    window.fetch = wrapped;
    console.log('[v276e] fetch wrapper installed (outer)');
  }
  // 即時 install
  installFetchWrap();
  // safety net: v276d の install (3000ms) より後にもう一度
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(installFetchWrap, 3500);
    }, { once: true });
  } else {
    setTimeout(installFetchWrap, 3500);
  }
  setTimeout(installFetchWrap, 6000);

  // === Public API ===
  window.__v276e = {
    getCastRoster: getCastRoster,
    fuzzyMatch: fuzzyMatch,
    remapMind: remapMind,
    modifyOutgoingBody: modifyOutgoingBody,
    reinstall: function(){
      try {
        if (window.fetch && window.fetch.__v276eInstalled && window.fetch.__wrappedFetch){
          window.fetch = window.fetch.__wrappedFetch;
          console.log('[v276e] previous wrapper detached for reinstall');
        }
      } catch(e){
        console.warn('[v276e] detach failed', e);
      }
      installFetchWrap();
    }
  };
  console.log('[v276e] init complete');
})();
