// =====================================================================
// Chronicle TRPG - v292Dfix277: 準登録カルテ + 帰属品質パック (fix277 / 277b / 278)
// 設計: 設計_準登録カルテと帰属品質パック_fix276-279.md (おしん承認 2026-06-12)
// ---------------------------------------------------------------------
// fix277 (準登録カルテ・本丸):
//   未登録キャラが累計3ターン登場(say/react/stateタグのwho + 会話ログwho)したら
//   自動で「準登録」化。新エンジンsysの【各キャラの現在の状態】を後処理し、
//   ・キャストの状態行 = 従来通り無加工
//   ・準登録(直近5ターンに登場)の状態行 = 1人120字に圧縮して保持・合計600字で
//     最終登場が古い順に切る(sys肥大ガード=注入は窓で絞る鉄則)
//   ・それ以外のキャスト外状態行 = 除去(fix77ストアは誰のwhoでも収穫するため、
//     これまでは一度入った未登録キャラの状態が無期限でsysに居座っていた)
//   ・準登録名を列挙し「<say who>/<state who>を必ず出す」許可行を1行追加
//     (モデルが準登録の状態タグを出す→fix77が収穫→カルテが回り出す)
//   保存: localStorage 'v292Dfix277Quasi'+スロット接尾辞 = 物語データと別キー(消しても無傷)
//   OFF: localStorage v292QuasiCastOff='1'
// fix277b (別名の機械可読化):
//   キャラ説明文の「別名: A, B」行をパースし A/B→正名 に名寄せ。
//   ・fix77状態収穫の正規化(別名エントリを正名へマージ)
//   ・会話ログカードの who 正規化(index.html側がwindow.__v292AliasFixを呼ぶ)
//   ・キャラ一覧の別名カードを非表示(表示統合のみ・データは残す)
//   OFF: localStorage v292AliasOff='1'
// fix278 (キャラ一覧アイコンの会話ログ統一):
//   fix145カードのアイコンを、まず会話ログと同じ v292av2_ キャッシュ
//   (fix197 keyFor=名前+画風)から適用。キャッシュ未生成時のみ従来経路。
//   OFF: localStorage v292IconUnifyOff='1'
// ---------------------------------------------------------------------
// 可逆性: 全コンポーネント個別OFFフラグ + データは別キー保存 = ダメなら戻せる。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix277:quasi-pack]';
  if (window.__v292Dfix277Pack) return;
  window.__v292Dfix277Pack = true;

  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function offQ(){ try { return localStorage.getItem('v292QuasiCastOff') === '1'; } catch(e){ return false; } }
  function offA(){ try { return localStorage.getItem('v292AliasOff') === '1'; } catch(e){ return false; } }
  function offI(){ try { return localStorage.getItem('v292IconUnifyOff') === '1'; } catch(e){ return false; } }

  // ---- スロット接尾辞(fix246と同ロジック・ただし自前キーなので自前で付ける) ----
  function slotSfx(){
    try {
      if (typeof window.__chr6Key === 'function'){
        var k = window.__chr6Key();
        return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : '';
      }
    } catch(e){}
    return '';
  }
  function QK(){ return 'v292Dfix277Quasi' + slotSfx(); }

  var qStore = null, qKeyLoaded = '';
  function loadQ(){
    var k = QK();
    if (qStore && qKeyLoaded === k) return qStore;
    try { qStore = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch(e){ qStore = {}; }
    qKeyLoaded = k;
    return qStore;
  }
  var qDirty = false;
  function saveQ(){
    if (!qDirty || !qStore) return;
    try { localStorage.setItem(qKeyLoaded || QK(), JSON.stringify(qStore)); qDirty = false; } catch(e){}
  }

  // ---- キャスト ----
  function castNames(){
    var out = [];
    try {
      var S = getS(); if (!S || !S.cast) return out;
      if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
      (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name)); });
    } catch(e){}
    return out;
  }

  // ---- fix277b: 別名マップ(キャラ説明の「別名: A, B」行) ----
  var aliasCache = null, aliasAt = 0;
  function aliasMap(){
    if (offA()) return {};
    var now = Date.now();
    if (aliasCache && (now - aliasAt) < 5000) return aliasCache;
    var map = {};
    try {
      var S = getS();
      var people = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) people.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) people.push(n); });
      }
      people.forEach(function(p){
        var d = String(p.desc || p.description || '');
        var m = d.match(/(^|\n)[\s　]*別名[:：]([^\n]+)/);
        if (!m) return;
        m[2].split(/[、,，・\/／]/).forEach(function(a){
          a = String(a).trim();
          if (a && a !== p.name && a.length <= 12) map[a] = String(p.name);
        });
      });
      // 準登録エントリの手動別名(コンソール __v292QuasiPack.addAlias 用)
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        ((qs[n] && qs[n].ali) || []).forEach(function(a){ if (a && a !== n) map[a] = n; });
      });
    } catch(e){}
    aliasCache = map; aliasAt = now;
    return map;
  }
  function aliasFix(name){
    try { if (offA()) return name; var m = aliasMap(); return m[name] || name; } catch(e){ return name; }
  }
  window.__v292AliasFix = aliasFix; // index.html(会話ログ収穫)から呼ばれる

  // ---- fix277b: fix77状態ストアの別名エントリを正名へマージ ----
  function mergeAliasStates(){
    if (offA()) return;
    try {
      var st = window.__v292Dfix77Store; if (!st) return;
      var map = aliasMap(); var moved = 0;
      Object.keys(map).forEach(function(a){
        if (!st[a]) return;
        var c = map[a];
        var src = st[a], dst = st[c] || {};
        var newer = (src.turn || 0) >= (dst.turn || 0);
        ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu','turn'].forEach(function(k){
          if (src[k] != null && (newer || dst[k] == null)) dst[k] = src[k];
        });
        st[c] = dst; delete st[a]; moved++;
      });
      if (moved){
        try { localStorage.setItem('v292Dfix77States', JSON.stringify(st)); } catch(e){} /* fix246がスロット接尾辞へ自動リダイレクト */
        try { console.log(TAG, '別名状態を正名へマージ:', moved, '件'); } catch(e){}
      }
    } catch(e){}
  }

  // ---- fix277: 登場の記帳 ----
  var BAD = /^(それ|これ|あれ|どれ|誰か|何か|彼|彼女|自分|皆|みんな|全員|二人|三人|私|俺|僕|お前|あなた|主人公|名前|不明|\?+|？+)$/;
  function validName(n){
    n = String(n || '').trim();
    if (n.length < 2 || n.length > 12) return '';
    if (/[\s　0-9０-９a-zA-Z。、！？!?…・「」『』<>="'\/\\]/.test(n)) return '';
    if (BAD.test(n)) return '';
    return n;
  }
  function noteAppear(name, turnIdx){
    name = validName(aliasFix(name));
    if (!name) return;
    if (castNames().indexOf(name) >= 0) return;
    var qs = loadQ();
    var e = qs[name] || { seen: [], ali: [] };
    if (e.seen.indexOf(turnIdx) < 0){
      e.seen.push(turnIdx);
      if (e.seen.length > 40) e.seen = e.seen.slice(-40);
      qDirty = true;
    }
    if ((e.last || 0) < turnIdx){ e.last = turnIdx; qDirty = true; }
    qs[name] = e;
    // 台帳の暴走防止: 60ターン以上前が最終登場のエントリは間引く(50件超のときだけ)
    try {
      var keys = Object.keys(qs);
      if (keys.length > 50){
        var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
        keys.forEach(function(k){ if (cur - ((qs[k] && qs[k].last) || 0) > 60) { delete qs[k]; qDirty = true; } });
      }
    } catch(e2){}
  }
  function harvestRaw(raw, turnIdx){
    try {
      var txt = String(raw || ''); var m;
      var re1 = /<(?:say|react|state)\b[^>]*?who="([^"]{1,24})"/g;
      while ((m = re1.exec(txt))) noteAppear(m[1], turnIdx);
      var re2 = /<say\s+who='([^']{1,24})'/g; /* react声の入れ子(単引用) */
      while ((m = re2.exec(txt))) noteAppear(m[1], turnIdx);
    } catch(e){}
  }
  function syncConv(){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      var n = S.turns.length;
      for (var i = Math.max(0, n - 8); i < n; i++){
        var t = S.turns[i]; if (!t || !Array.isArray(t._convSays)) continue;
        t._convSays.forEach(function(c){ if (c && c.who) noteAppear(c.who, i); });
      }
    } catch(e){}
  }

  function quasiRecent(){
    /* 準登録(累計3ターン登場)かつ直近5ターンに登場した名前を、最終登場が新しい順で返す */
    var out = [];
    try {
      var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        var e = qs[n]; if (!e || !Array.isArray(e.seen)) return;
        if (e.seen.length >= 3 && (cur - (e.last || 0)) <= 5) out.push({ name: n, last: e.last || 0 });
      });
      out.sort(function(a, b){ return b.last - a.last; });
    } catch(e){}
    return out;
  }

  // ---- fix277: sys後処理(状態ブロックの窓制御 + 準登録の許可行) ----
  var HEAD = '【各キャラの現在の状態';
  function surgery(sys){
    try {
      if (offQ() || typeof sys !== 'string' || !sys) return sys;
      var cast = castNames();
      var rec = quasiRecent();
      var qNames = rec.map(function(r){ return r.name; }).slice(0, 8);
      var lastOf = {}; rec.forEach(function(r){ lastOf[r.name] = r.last; });
      var permit = qNames.length
        ? '・準登録(自動・直近登場): ' + qNames.join('、') + ' — これらの人物も登場中は<say who="名前">と<state who="名前">を必ず出す(状態は引き継ぎ対象)。'
        : '';
      var hi = sys.indexOf(HEAD);
      if (hi < 0){
        return permit ? (sys + '\n\n【準登録キャラ(自動)】\n' + permit) : sys;
      }
      var lines = sys.split('\n');
      var h = -1;
      for (var i = 0; i < lines.length; i++){ if (lines[i].indexOf(HEAD) >= 0){ h = i; break; } }
      if (h < 0) return sys;
      var changed = false, qLines = [], out = lines.slice(0, h + 1);
      var j = h + 1;
      for (; j < lines.length; j++){
        var ln = lines[j];
        if (ln.charAt(0) !== '・') break; /* ブロック終端 */
        var em = ln.match(/^・(.+?)｜/);
        if (!em){ out.push(ln); continue; } /* 助言行はそのまま */
        var nm = em[1];
        if (cast.indexOf(nm) >= 0){ out.push(ln); continue; }
        if (qNames.indexOf(nm) >= 0){
          var cl = ln.length > 126 ? (ln.slice(0, 124) + '…') : ln; /* 1人120字級に圧縮 */
          if (cl !== ln) changed = true;
          qLines.push({ nm: nm, ln: cl });
          continue;
        }
        changed = true; /* キャスト外かつ準登録(直近)でない状態行は注入しない(肥大・汚染ガード) */
      }
      /* 準登録の合計600字ガード: 最終登場が古い順に切る */
      qLines.sort(function(a, b){ return (lastOf[b.nm] || 0) - (lastOf[a.nm] || 0); });
      var budget = 600, kept = [];
      qLines.forEach(function(q){ if (budget - q.ln.length >= 0){ budget -= q.ln.length; kept.push(q.ln); } else { changed = true; } });
      if (kept.length){
        /* 状態行のすぐ後(助言行の前)に入れたいが、構造単純化のためブロック末尾に追加 */
        out = out.concat(kept);
        changed = true;
      }
      if (permit){ out.push(permit); changed = true; }
      if (!changed) return sys; /* 無変更ならバイト一致で返す(回帰=sysバイト比較を保証) */
      return out.concat(lines.slice(j)).join('\n');
    } catch(e){ return sys; }
  }

  // ---- parsePlanラップ(登場収穫) ----
  function installParse(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (P.parsePlan.__v292Dfix277q) return true;
      var inner = P.parsePlan.bind(P);
      var wrapped = function(rawText, inputType){
        var plan = inner(rawText, inputType);
        try {
          if (!offQ()){
            var S = getS();
            harvestRaw(rawText, (S && S.turns) ? S.turns.length : 0);
            saveQ();
          }
        } catch(e){}
        return plan;
      };
      try { Object.keys(P.parsePlan).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.parsePlan[k]; }); } catch(e){} /* 旧フラグ継承(fix274と同思想・再ラップ輪の予防) */
      wrapped.__v292Dfix277q = true;
      P.parsePlan = wrapped;
      try { console.log(TAG, 'parsePlan wrapped (登場収穫)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- Planner.buildラップ(sys後処理・最外=fix192の上) ----
  function engineOn(){
    try { if (window.__v292NewEngine && typeof window.__v292NewEngine.engineOn === 'function') return !!window.__v292NewEngine.engineOn(); } catch(e){}
    try { var S = getS(); if (S && S.cfg && S.cfg.engineMode != null) return +S.cfg.engineMode === 1; return localStorage.getItem('v292EngineMode') === '1'; } catch(e){ return false; }
  }
  function installBuild(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.build !== 'function') return false;
      if (P.build.__v292Dfix277b2) return true;
      var inner = P.build.bind(P);
      var wrapped = function(mode, text){
        var r = inner(mode, text);
        try {
          if (r && typeof r.sys === 'string' && engineOn() && !offQ()){
            syncConv(); mergeAliasStates(); saveQ();
            r.sys = surgery(r.sys);
          }
        } catch(e){}
        return r;
      };
      try { Object.keys(P.build).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.build[k]; }); } catch(e){} /* fix274のsetterも継承するが二重の保険 */
      wrapped.__v292Dfix277b2 = true;
      P.build = wrapped;
      try { console.log(TAG, 'Planner.build wrapped (準登録注入)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function waitP(){
    var a = installParse();
    /* buildラップは「fix192(新エンジン)のラップ装着後」まで待つ: 先に装着するとfix192が後から外側に来て
       r.sys=buildSys()がsurgery結果を上書きする(実機で実証)。fix274セッターがフラグを継承するため
       見かけ上は装着済みに見える罠。__v292NewEngineフラグの出現=fix192装着済みの権威。30秒で諦め装着(旧エンジン運用等)。 */
    var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
    waitP._n = (waitP._n || 0) + 1;
    var ready = P && typeof P.build === 'function' && (P.build.__v292NewEngine || waitP._n > 60);
    var b = ready ? installBuild() : false;
    if (a && b) return;
    setTimeout(waitP, 500);
  })();

  // ---- fix278: キャラ一覧アイコンの会話ログ統一 + fix277b別名カード統合 ----
  function unifyCards(){
    try {
      if (offI() && offA()) return;
      var cards = document.querySelectorAll('.v292Dfix145-card');
      if (!cards.length) return;
      var f197 = window.__v292Dfix197;
      var names = {};
      cards.forEach(function(c){ names[c.getAttribute('data-name') || ''] = 1; });
      cards.forEach(function(card){
        var nm = card.getAttribute('data-name') || '';
        if (!nm) return;
        /* fix277b: 別名カードは正名カードがあれば非表示(表示統合のみ・データは残す) */
        if (!offA()){
          var canon = aliasFix(nm);
          if (canon !== nm && names[canon]){ card.style.display = 'none'; return; }
        }
        /* fix278: 会話ログと同じ v292av2_ キャッシュ(名前+画風)を最優先 */
        if (offI() || !f197 || typeof f197.cachedFor !== 'function') return;
        var url = f197.cachedFor(nm) || f197.cachedFor(aliasFix(nm));
        if (!url) return; /* キャッシュ未生成→従来経路のまま */
        var img = card.querySelector('img');
        if (img){
          if (img.getAttribute('src') !== url){ img.onerror = null; img.src = url; }
        } else {
          var wrap = card.firstChild;
          if (wrap && wrap.nodeType === 1){
            wrap.textContent = '';
            var ni = document.createElement('img');
            ni.src = url; ni.alt = nm;
            ni.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            wrap.appendChild(ni);
          }
        }
      });
    } catch(e){}
  }
  var moT = null;
  try {
    new MutationObserver(function(muts){
      var hit = false;
      for (var i = 0; i < muts.length && !hit; i++){
        var ad = muts[i].addedNodes || [];
        for (var k = 0; k < ad.length; k++){
          var nd = ad[k];
          if (nd && nd.nodeType === 1 && ((nd.className || '').indexOf('v292Dfix145') >= 0 || (nd.querySelector && nd.querySelector('.v292Dfix145-card')))){ hit = true; break; }
        }
      }
      if (!hit) return;
      if (moT) clearTimeout(moT);
      moT = setTimeout(function(){ moT = null; unifyCards(); }, 250);
    }).observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e){}

  window.__v292QuasiPack = {
    store: loadQ, key: QK, surgery: surgery, aliasMap: aliasMap, aliasFix: aliasFix,
    noteAppear: noteAppear, quasiRecent: quasiRecent, syncConv: syncConv, unifyCards: unifyCards,
    _dropCache: function(){ qStore = null; qKeyLoaded = ''; aliasCache = null; }, /* 検証用 */
    addAlias: function(canonical, alias){
      try { var qs = loadQ(); var e = qs[canonical] || { seen: [], ali: [] }; if ((e.ali = e.ali || []).indexOf(alias) < 0) e.ali.push(alias); qs[canonical] = e; qDirty = true; saveQ(); aliasCache = null; return true; } catch(e2){ return false; }
    }
  };
  try { console.log(TAG, 'loaded (fix277/277b/278)'); } catch(e){}
})();
