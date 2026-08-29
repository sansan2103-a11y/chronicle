// =====================================================================
// Chronicle TRPG - v292Dfix377: 声の錨と永続カルテ（案C: 完全自動・UIなし）
// 設計: 設計_2026-07-04_fix377_声の錨と永続カルテ.md（おしん承認 2026-07-04）
// ---------------------------------------------------------------------
// 真因: 女性キャラの一人称「俺」（セイラ・ミア）。fix366の性別注入だけでは
//       「性別→話し方」の変換がモデル任せで構造的に漏れる。一度「俺」が
//       本文に出ると履歴の自己強化で以降のターンが真似る。
// 三段構成（1ファイル・完全自動・UIなし。設定の口調欄だけ上級者の逃げ道）:
//  A) 声の錨: S.cast[].voice フィールド（追記のみ・後方互換）。
//     - 自動学習: 本人の過去セリフ(_convSays)から一人称実績を集計し、
//       性別と矛盾しない多数派(2回以上)を voice={fp,auto:1} として一度だけ保存
//       （錨＝揺れの起点を断つ。以後は不触で安定）。
//     - 人間入力が常に勝つ: 設定の口調欄(任意・1行)に入力があれば自動学習は不触。
//     - 注入: Planner.build直ラップ(fix366/363と同パターン・マーカー【口調】冪等)。
//       実例1行（本人の過去セリフの断片）を含める＝指示より実例が声を安定させる。
//  B) 永続カルテ+別名吸収: 新キーは作らず fix277準登録カルテ(ali[])を自動充填。
//     - 保守的包含ルール(fix358流): 未登録Yが「修飾語+X」(Y.endsWith(X)・X長2+)
//       なら Y を X の別名として __v292QuasiPack.addAlias で吸収。
//     - 登録キャラの短縮呼び(fix145流・完全包含)も登録名へ吸収。
//     - 既存の名寄せ(fix277b)・カード統合・状態マージ・表示ガード(fix145/358)が
//       そのまま効く＝アイコン増殖も収束（三重の安全網は不触）。
//  C) 属性自動推定+場面限定注入（未登録キャラ）:
//     - 手がかり: 呼称トークン(少女/青年…) > worldinfo desc(彼女/彼…) > 一人称実績。
//     - 確信度が足りなければ注入しない（誤爆より無言が安全）。
//     - 注入は「直近2ターンの地の文に名前が出た」キャラに限定（プロンプト肥大防止）。
//     - S.cast(人間入力)に同名がいればカルテは注入しない。
// ---------------------------------------------------------------------
// 既定: ON（fix377b 2026-07-04 おしん承認「問題ないからオンにして」で既定化。
//        旧プレビューflag v292Dfix377 は不要になった=残っていても無視・無害）。
// OFF: v292Dfix377Off='1'（全体）/ v292Dfix377COff='1'（C=推定注入のみ切る）
//      ※一度ONでsysに乗った後のOFFはリロード後に有効（fix363と同じ返却オブジェクト共有仕様）
// ロールバック: OFFスイッチ + S.cast[].voice(autoのみ)残置は無害 + fix277 aliは消しても無傷
// 検証: window.__v292Dfix377x.block() で送信なしに注入ブロックを確認可能（無料・安全）
// =====================================================================
(function(){
  'use strict';
  if (window.__f377done) return; window.__f377done = 1; // fix274教訓: 非__v292名
  var TAG = '[v292Dfix377:voice-anchor]';

  function offAll(){ try { return localStorage.getItem('v292Dfix377Off') === '1'; } catch(e){ return false; } }
  function on(){ return !offAll(); } // fix377b: 既定ON（旧プレビューflagは廃止・無視）
  function cOff(){ try { return localStorage.getItem('v292Dfix377COff') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ---------- 一人称語彙と性別整合 ----------
  var FP_ALL = ['わたくし','あたし','アタシ','わたし','私','俺','オレ','おれ','僕','ボク','ぼく','ウチ','ワシ'];
  // 部分一致の誤カウント対策(「渡した」「倒れ」等): 直後が助詞/句読点/「たち・達」のみ数える
  var FP_RE = /(わたくし|あたし|アタシ|わたし|私|俺|オレ|おれ|僕|ボク|ぼく|ウチ|ワシ)(?:たち|達)?(?=[はがもをにでとのだねよさ、。．！？!?…\s」』]|$)/g;
  var FP_MALE_ONLY = {'俺':1,'オレ':1,'おれ':1,'僕':1,'ボク':1,'ぼく':1,'ワシ':1};
  var FP_FEMALE_ONLY = {'あたし':1,'アタシ':1,'ウチ':1};
  function normGender(g){
    g = String(g || '');
    if (!g) return '';
    if (/女|female|girl|woman/i.test(g)) return '女性';
    if (/男|male|boy|man/i.test(g)) return '男性';
    return '';
  }
  function fpValidFor(fp, gender){
    if (gender === '女性' && FP_MALE_ONLY[fp]) return false;
    if (gender === '男性' && FP_FEMALE_ONLY[fp]) return false;
    return true;
  }

  // ---------- セリフ横断（別名は正名へ名寄せしてから照合） ----------
  function eachSay(cb){
    var S = getS(); if (!S || !Array.isArray(S.turns)) return;
    var fixA = window.__v292AliasFix || function(n){ return n; };
    for (var ti = 0; ti < S.turns.length; ti++){
      var t = S.turns[ti]; if (!t) continue;
      var cs = t._convSays || t.convSays; if (!Array.isArray(cs)) continue;
      for (var j = 0; j < cs.length; j++){
        var e = cs[j]; if (!e) continue;
        var w = e.who || e.name, tx = e.text || e.say || '';
        if (!w || !tx) continue;
        try { if (cb(String(fixA(String(w))), String(tx), ti) === false) return; } catch(e2){}
      }
    }
  }
  function fpCounts(name){
    var counts = {};
    eachSay(function(w, tx){
      if (w !== name) return;
      var m; FP_RE.lastIndex = 0;
      while ((m = FP_RE.exec(tx))){ counts[m[1]] = (counts[m[1]] || 0) + 1; }
    });
    return counts;
  }
  function learnFp(name, gender){
    var c = fpCounts(name), best = '', bn = 0;
    for (var fp in c){
      if (!Object.prototype.hasOwnProperty.call(c, fp)) continue;
      if (!fpValidFor(fp, gender)) continue;
      if (c[fp] > bn){ bn = c[fp]; best = fp; }
    }
    return (bn >= 2) ? { fp: best, n: bn } : null;
  }
  // 実例1行: 本人の過去セリフから fp を含む短い断片（指示より実例が声を安定させる）
  function exampleFor(name, fp){
    var out = '';
    eachSay(function(w, tx){
      if (out || w !== name) return;
      if (tx.indexOf(fp) < 0) return;
      var s = tx.replace(/[\n\r「」『』]/g, '').trim();
      var i = s.indexOf(fp);
      s = s.slice(Math.max(0, i), i + 20);
      if (s.length >= fp.length + 2) out = s;
    });
    return out;
  }

  // ---------- A: 声の錨（登録キャラの自動学習・人間入力が勝つ） ----------
  function voiceOf(p){
    var v = p && p.voice;
    if (!v) return null;
    if (typeof v === 'string') return v.trim() ? { raw: v.trim() } : null;
    if (typeof v === 'object' && (v.fp || v.style || v.raw)) return v;
    return null;
  }
  var lastLearnTurns = -1;
  function autoLearn(){
    if (!on()) return;
    var S = getS(); if (!S || !S.cast) return;
    var tl = (S.turns || []).length;
    if (tl === lastLearnTurns) return;
    lastLearnTurns = tl;
    var dirty = false;
    var all = [S.cast.hero].concat(S.cast.npcs || []);
    for (var i = 0; i < all.length; i++){
      var p = all[i]; if (!p || !p.name) continue;
      if (voiceOf(p)) continue; // 人間入力・既学習の錨は不触（揺れ防止）
      var got = learnFp(String(p.name), normGender(p.gender));
      if (got){
        p.voice = { fp: got.fp, auto: 1 };
        dirty = true;
        try { console.log(TAG, 'voice learned:', p.name, '=', got.fp, '(x' + got.n + ')'); } catch(e){}
      }
    }
    if (dirty){
      try { if (!document.hidden && S.save) (typeof S.saveC==='function'?S.saveC('fix377.autoLearn'):S.save()); } catch(e){}
    }
  }

  // ---------- B: 別名吸収（fix277 ali の自動充填・保守的包含ルール） ----------
  function castNames(){
    var out = [];
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
        var ns = S.cast.npcs || [];
        for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) out.push(String(ns[i].name)); }
      }
    } catch(e){}
    return out;
  }
  function wiChars(){
    var out = [];
    try {
      var lm = window.__longmem;
      if (!lm || !lm.raw || !lm.raw.loadWorldInfo) return out;
      var wi = lm.raw.loadWorldInfo() || [];
      for (var i = 0; i < wi.length; i++){
        var w = wi[i];
        if (w && w.type === 'character' && w.name) out.push(String(w.name));
      }
    } catch(e){}
    return out;
  }
  function wiDesc(name){
    try {
      var lm = window.__longmem;
      var wi = (lm && lm.raw && lm.raw.loadWorldInfo && lm.raw.loadWorldInfo()) || [];
      for (var i = 0; i < wi.length; i++){
        if (wi[i] && wi[i].name === name) return String(wi[i].desc || '');
      }
    } catch(e){}
    return '';
  }
  function absorbAliases(){
    if (!on()) return;
    var QP = window.__v292QuasiPack;
    if (!QP || !QP.addAlias) return;
    try {
      var cast = castNames();
      var qs = QP.store() || {};
      var seen = {}, list = [];
      var pool = wiChars().concat(Object.keys(qs));
      for (var i = 0; i < pool.length; i++){
        var n = pool[i];
        if (!n || seen[n] || cast.indexOf(n) >= 0) continue;
        seen[n] = 1; list.push(n);
      }
      var already = {};
      try {
        var m = QP.aliasMap() || {};
        for (var a in m){ if (Object.prototype.hasOwnProperty.call(m, a)) already[a] = 1; }
      } catch(e){}
      list.forEach(function(y){
        if (already[y]) return;
        // 1) 登録キャラへの吸収（境界一致のみ=マリア/アリア型の偶然包含を弾く）:
        //    短縮呼び c.startsWith(y)/c.endsWith(y)（スピカ←スピカ・ヴァレン）
        //    修飾呼び y.endsWith(c)（黒衣のセイラ→セイラ）。登録名が正名=人間入力が勝つ
        for (var i = 0; i < cast.length; i++){
          var c = cast[i];
          if (c.length >= 2 && y.length >= 2 && c !== y &&
              (y.slice(-c.length) === c || c.slice(0, y.length) === y || c.slice(-y.length) === y)){
            if (QP.addAlias(c, y)){ already[y] = 1; try { console.log(TAG, 'alias→cast:', y, '→', c); } catch(e){} }
            return;
          }
        }
        // 2) 未登録同士: Y = 修飾語 + X（Y.endsWith(X)・X長2+・Xが単独存在）→ Xが正名（fix358流）
        var cands = [];
        for (var j = 0; j < list.length; j++){
          var x = list[j];
          if (x !== y && x.length >= 2 && y.length > x.length && y.slice(-x.length) === x) cands.push(x);
        }
        if (cands.length){
          cands.sort(function(a2, b2){ return b2.length - a2.length; }); // 最長基底を正名に
          if (QP.addAlias(cands[0], y)){ already[y] = 1; try { console.log(TAG, 'alias absorbed:', y, '→', cands[0]); } catch(e){} }
        }
      });
    } catch(e){}
  }

  // ---------- C: 属性自動推定（未登録キャラ・確信度閾値・保存はfix277ストアへ追記） ----------
  function estimateGender(name){
    if (/少女|娘|姫|婆|母|姉|妹|嬢|女/.test(name)) return { g: '女性', src: 'name' };
    if (/少年|青年|爺|翁|父|兄|弟|男/.test(name)) return { g: '男性', src: 'name' };
    var d = wiDesc(name);
    if (d){
      if (/彼女|女性|少女|女の/.test(d)) return { g: '女性', src: 'desc' };
      if (/彼(?!女)|男性|少年|青年|男の/.test(d)) return { g: '男性', src: 'desc' };
    }
    return null;
  }
  function recentQuasi(){
    var out = [];
    try {
      var QP = window.__v292QuasiPack; if (!QP) return out;
      var qs = QP.store() || {};
      var S = getS();
      var cur = (S && S.turns) ? S.turns.length : 0;
      var cast = castNames();
      for (var n in qs){
        if (!Object.prototype.hasOwnProperty.call(qs, n)) continue;
        var e = qs[n];
        if (!e || !Array.isArray(e.seen)) continue;
        if (cast.indexOf(n) >= 0) continue;
        if (e.seen.length >= 2 && cur - (e.last || 0) <= 5) out.push(n);
      }
    } catch(e){}
    return out;
  }
  function updateEstimates(){
    if (!on() || cOff()) return;
    try {
      var QP = window.__v292QuasiPack; if (!QP || !QP.key) return;
      var qs = QP.store() || {};
      var dirty = false;
      recentQuasi().forEach(function(n){
        var e = qs[n]; if (!e) return;
        if (!e.est) e.est = {};
        if (!e.est.g){
          var g = estimateGender(n);
          if (g){ e.est.g = g.g; e.est.gsrc = g.src; dirty = true; }
        }
        var got = learnFp(n, e.est.g || '');
        if (got && (e.est.fp !== got.fp || e.est.fpn !== got.n)){
          e.est.fp = got.fp; e.est.fpn = got.n; dirty = true;
        }
      });
      // qs は loadQ の生きた参照。直書き保存なら fix277 の未保存分も一緒に永続化され、
      // _dropCache は不要（呼ぶと fix277 の in-memory 未保存変更を捨てる恐れ）
      if (dirty && !document.hidden){
        try { localStorage.setItem(QP.key(), JSON.stringify(qs)); } catch(e){}
      }
    } catch(e){}
  }

  // ---------- 注入ブロック組み立て（送信なしで __v292Dfix377x.block() でも確認可能） ----------
  function sceneText(S, nTurns){
    var out = '';
    try {
      var ts = S.turns || [];
      for (var i = Math.max(0, ts.length - nTurns); i < ts.length; i++){
        var t = ts[i];
        out += String((t && (t.narrative || t.text)) || '');
      }
    } catch(e){}
    return out;
  }
  function buildBlock(){
    var S = getS(); if (!S || !S.cast) return '';
    var lines = [];
    var all = [{ p: S.cast.hero, hero: true }];
    (S.cast.npcs || []).forEach(function(n){ all.push({ p: n }); });
    all.forEach(function(o){
      var p = o.p; if (!p || !p.name) return;
      var name = String(p.name) + (o.hero ? '(主人公)' : '');
      var v = voiceOf(p);
      var g = normGender(p.gender);
      if (v){
        var body, fp = v.fp || '';
        if (v.raw){
          body = v.raw;
          if (!fp){ for (var i = 0; i < FP_ALL.length; i++){ if (v.raw.indexOf(FP_ALL[i]) >= 0){ fp = FP_ALL[i]; break; } } }
        } else {
          body = '一人称「' + fp + '」' + (v.style ? ('・' + v.style) : '');
        }
        var line = name + '=' + body;
        if (fp){
          var ex = exampleFor(String(p.name), fp);
          line += ' 例:「' + (ex || (fp + 'は…')) + '」';
        }
        lines.push(line);
      } else if (g === '女性'){
        lines.push(name + '=一人称は女性のもの(私/あたし等)で固定。「俺」「僕」は使わない');
      } else if (g === '男性'){
        lines.push(name + '=一人称は男性のもの(俺/僕/私等)で固定。「あたし」は使わない');
      }
    });
    // C: 未登録キャラ（場面限定・S.castが常に勝つ・確信度不足は無言）
    if (!cOff()){
      try {
        var QP = window.__v292QuasiPack;
        var qs = QP ? (QP.store() || {}) : {};
        var scn = sceneText(S, 2);
        var castn = castNames();
        recentQuasi().forEach(function(n){
          if (lines.length >= 8) return;
          if (castn.indexOf(n) >= 0) return;
          if (scn.indexOf(n) < 0) return;
          var e = qs[n], est = e && e.est;
          if (!est) return;
          var seg = [];
          if (est.fp && (est.fpn || 0) >= 2) seg.push('一人称「' + est.fp + '」で固定');
          else if (est.g === '女性') seg.push('一人称は女性のもので固定(「俺」「僕」不可)');
          else if (est.g === '男性') seg.push('一人称は男性のもので固定');
          if (!seg.length) return;
          lines.push(n + '=' + seg.join('・'));
        });
      } catch(e){}
    }
    if (!lines.length) return '';
    var block = '\n【口調】' + lines.join('、') + '。各人の一人称と話し方は毎ターンこれに従い、地の文の代名詞も一致させる。';
    return (block.length > 600) ? (block.slice(0, 597) + '…。') : block;
  }

  // ---------- Planner.build 直ラップ（fix366/363実証パターン・_extensionsは死に経路） ----------
  function hook(){
    try {
      var P = (0,eval)('Planner');
      if (!P || typeof P.build !== 'function') return false;
      var ob = P.build;
      P.build = function(){
        var r = ob.apply(this, arguments);
        try {
          if (!on()) return r;
          if (!r || typeof r.sys !== 'string') return r;
          if (r.sys.indexOf('【口調】') >= 0) return r; // マーカー冪等
          var b = buildBlock();
          if (b) r.sys += b;
        } catch(e){}
        return r;
      };
      return true;
    } catch(e){ return false; }
  }

  // ---------- A: 設定フォームの任意入力欄（上級者の逃げ道・1行・自動が既定） ----------
  function makeRow(getVal, setVal){
    var row = document.createElement('div');
    row.className = 'v292f377-voice-row';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0;';
    var lab = document.createElement('span');
    lab.textContent = '口調(任意)';
    lab.style.cssText = 'font-size:11px;opacity:.75;white-space:nowrap;';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'v292f377-voice';
    inp.placeholder = '例: あたし・姉御肌（空欄=自動）';
    inp.style.cssText = 'flex:1;min-width:0;font-size:12px;padding:2px 6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:inherit;';
    try { inp.value = getVal() || ''; } catch(e){}
    var tm = null;
    inp.addEventListener('input', function(){
      if (tm) clearTimeout(tm);
      tm = setTimeout(function(){
        try { setVal(String(inp.value || '').trim()); } catch(e){}
      }, 600);
    });
    row.appendChild(lab); row.appendChild(inp);
    return row;
  }
  function voiceDisplay(p){
    var v = voiceOf(p);
    if (!v) return '';
    if (v.raw) return v.raw;
    if (v.auto) return ''; // 自動学習分は欄に出さない（空欄=自動、の分かりやすさ優先）
    return (v.fp || '') + (v.style ? ('・' + v.style) : '');
  }
  function setCastVoice(p, val){
    var S = getS(); if (!S || !p) return;
    if (val){ p.voice = { raw: val, manual: 1 }; }
    else if (p.voice && p.voice.manual){ delete p.voice; lastLearnTurns = -1; } // 空に戻したら自動へ
    try { if (!document.hidden && S.save) (typeof S.saveC==='function'?S.saveC('fix377.setCastVoice'):S.save()); } catch(e){}
  }
  function injectInputs(){
    if (!on()) return;
    try {
      var ov = document.getElementById('settingsOv');
      if (!ov || getComputedStyle(ov).display === 'none') return;
      var S = getS(); if (!S || !S.cast) return;
      // 主人公: cfgHDesc の直後
      var hd = document.getElementById('cfgHDesc');
      if (hd && hd.parentNode && !hd.parentNode.querySelector('.v292f377-voice-row')){
        var hrow = makeRow(
          function(){ return voiceDisplay(S.cast.hero); },
          function(val){ if (S.cast.hero) setCastVoice(S.cast.hero, val); }
        );
        hd.parentNode.insertBefore(hrow, hd.nextSibling);
      }
      // NPCカード: [data-f="desc"] の直後
      var cards = document.querySelectorAll('#npcList .npc-card');
      Array.prototype.forEach.call(cards, function(card, i){
        if (card.querySelector('.v292f377-voice-row')) return;
        var d = card.querySelector('[data-f="desc"]');
        if (!d || !d.parentNode) return;
        var row = makeRow(
          function(){ var n = (S.cast.npcs || [])[i]; return n ? voiceDisplay(n) : ''; },
          function(val){ var n = (S.cast.npcs || [])[i]; if (n) setCastVoice(n, val); }
        );
        d.parentNode.insertBefore(row, d.nextSibling);
      });
    } catch(e){}
  }

  // ---------- 起動（boot 6秒後開始=fix375流のレース回避・以後8秒ポーリング） ----------
  function tick(){
    try { autoLearn(); } catch(e){}
    try { absorbAliases(); } catch(e){}
    try { updateEstimates(); } catch(e){}
  }
  setTimeout(function(){
    tick();
    setInterval(tick, 8000);
    setInterval(injectInputs, 1500);
  }, 6000);
  if (!hook()){
    var iv = setInterval(function(){ if (hook()) clearInterval(iv); }, 1000);
    setTimeout(function(){ clearInterval(iv); }, 30000);
  }

  // ---------- 検証用API（送信なし・無料） ----------
  window.__v292Dfix377x = {
    block: buildBlock,
    learn: autoLearn,
    absorb: absorbAliases,
    estimate: updateEstimates,
    fpCounts: fpCounts,
    status: function(){
      var S = getS();
      var out = { on: on(), cOff: cOff(), cast: [], quasi: {} };
      try {
        [S.cast.hero].concat(S.cast.npcs || []).forEach(function(p){
          if (p && p.name) out.cast.push({ name: p.name, gender: p.gender || '', voice: p.voice || null });
        });
      } catch(e){}
      try {
        var QP = window.__v292QuasiPack, qs = QP ? QP.store() : {};
        for (var n in qs){ if (Object.prototype.hasOwnProperty.call(qs, n)) out.quasi[n] = { ali: qs[n].ali || [], est: qs[n].est || null, last: qs[n].last }; }
      } catch(e){}
      return out;
    }
  };
  try { console.log(TAG, 'loaded (fix377b: default ON, off=' + (offAll() ? '1' : '0') + ')'); } catch(e){}
})();
