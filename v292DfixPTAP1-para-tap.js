/* v292DfixPTAP1-para-tap.js — ★PTAP1（2026-11-28・Owner「文章の修正を AI ダンジョンみたいに文章タップからの編集ができれば手軽」）
 * 展開の描写の段落を押すと、その段落に枠と「✎ ここを直す」の小さなボタンが出る。ボタンを押すと、今までの「本文を編集」の画面が
 * その段落を選んだ状態で開く（保存・取り消しは今までの UI.saveEdit / EDIT01 のまま。新しい保存の経路は作らない）。
 * 本文の DOM（.narr-block の中）には何も足さない・書き換えない（枠とボタンは body の直下に重ねて置く）。
 * 文字を選択している最中・ボタンやリンクの上では何もしない。スクロール・10 秒・ほかの場所を押すと消える。
 * kill: localStorage v292DfixPTAP1Off='1'（毎回評価・読み込み直し不要）。診断: window.__v292DfixPTAP1.stats() */
(function () {
  'use strict';
  var G = window; if (G.__v292DfixPTAP1) return;
  var VER = 'ptap1-20261128-b', LABEL = '✎ ここを直す';
  var st = { taps: 0, opens: 0, found: 0, miss: 0, err: 0 };
  function off() { try { return G.localStorage.getItem('v292DfixPTAP1Off') === '1'; } catch (e) { return false; } }
  var box = null, chip = null, cur = null, timer = null;
  function css() {
    if (document.getElementById('v292DfixPTAP1-css')) return;
    var s = document.createElement('style'); s.id = 'v292DfixPTAP1-css';
    s.textContent = '.ptap1-box{position:absolute;z-index:40;pointer-events:none;border:1px solid rgba(196,144,64,.75);border-radius:6px;background:rgba(196,144,64,.08)}'
      + '.ptap1-chip{position:absolute;z-index:41;padding:5px 12px;font:13px/1.2 "Hiragino Kaku Gothic ProN","Hiragino Sans",sans-serif;border:1px solid rgba(196,144,64,.9);border-radius:14px;background:#1b1b2a;color:#ececf4;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5)}';
    document.head.appendChild(s);
  }
  function hide() {
    try { if (box && box.parentNode) box.parentNode.removeChild(box); if (chip && chip.parentNode) chip.parentNode.removeChild(chip); } catch (e) {}
    box = chip = cur = null; if (timer) { clearTimeout(timer); timer = null; }
  }
  function show(p) {
    css(); hide(); cur = p;
    var r = p.getBoundingClientRect(), sx = G.pageXOffset || 0, sy = G.pageYOffset || 0;
    box = document.createElement('div'); box.className = 'ptap1-box';
    box.style.left = (r.left + sx - 4) + 'px'; box.style.top = (r.top + sy - 2) + 'px'; box.style.width = (r.width + 8) + 'px'; box.style.height = (r.height + 4) + 'px';
    chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ptap1-chip'; chip.textContent = LABEL; chip.setAttribute('data-ptap1', 'go');
    document.body.appendChild(box); document.body.appendChild(chip);
    var cw = chip.offsetWidth || 110, ch = chip.offsetHeight || 28, vw = document.documentElement.clientWidth || 360;
    var left = Math.min(Math.max(8, r.right + sx - cw), sx + vw - cw - 8), top = r.bottom + sy + 4;
    if (r.bottom + ch + 8 > (G.innerHeight || 600)) top = r.top + sy - ch - 4;   /* 画面の下端なら段落の上に出す */
    chip.style.left = left + 'px'; chip.style.top = top + 'px';
    timer = setTimeout(hide, 10000);
  }
  function plain(p) { return String(p.textContent || '').replace(/\s+/g, ' ').trim(); }
  function locate(v, txt) {   /* 編集欄の本文の中で、その段落の始まりと終わりを探す（見つからなければ null） */
    var keys = [txt.slice(0, 14), txt.slice(0, 8), txt.slice(1, 9)], i = -1;
    for (var k = 0; k < keys.length && i < 0; k++) if (keys[k] && keys[k].length >= 4) i = v.indexOf(keys[k]);
    if (i < 0) return null;
    var s = v.lastIndexOf('\n', i); s = s < 0 ? 0 : s + 1;
    var e = v.indexOf('\n', i); if (e < 0) e = v.length;
    return [s, e];
  }
  function openAt(p) {
    var block = p && p.closest ? p.closest('.narr-block') : null, eb = block ? block.querySelector('.edit-btn') : null, txt = p ? plain(p) : '';
    hide(); if (!eb) return;
    st.opens++; eb.click();
    setTimeout(function () {
      try {
        var ta = document.getElementById('editTa'); if (!ta) return;
        var v = String(ta.value || ''), r = locate(v, txt);
        if (!r) { st.miss++; return; }
        st.found++;
        ta.focus(); ta.setSelectionRange(r[0], r[1]);
        var lines = v.slice(0, r[0]).split('\n').length - 1, total = v.split('\n').length || 1;
        ta.scrollTop = Math.max(0, (ta.scrollHeight * (lines / total)) - ta.clientHeight / 3);
      } catch (e) { st.err++; }
    }, 40);
  }
  document.addEventListener('click', function (ev) {
    try {
      if (off()) { if (cur) hide(); return; }
      var t = ev.target; if (!t || !t.closest) return;
      if (chip && (t === chip || t.closest('[data-ptap1="go"]'))) { ev.preventDefault(); ev.stopPropagation(); openAt(cur); return; }
      var p = t.closest('.narr-block p');
      if (!p || t.closest('button,a,textarea,input,select,.edit-btn')) { if (cur) hide(); return; }
      var sel = ''; try { sel = String(G.getSelection ? G.getSelection() : ''); } catch (e2) {}
      if (sel) return;                      /* 文字を選んでいる最中は出さない */
      if (cur === p) { hide(); return; }    /* 同じ段落をもう一度押すと消える */
      if (!p.closest('.narr-block').querySelector('.edit-btn')) return;
      st.taps++; show(p);
    } catch (e) { st.err++; }
  }, false);
  G.addEventListener('scroll', function () { if (cur) hide(); }, true);
  G.addEventListener('resize', function () { if (cur) hide(); });
  G.__v292DfixPTAP1 = { VER: VER, on: function () { return !off(); }, stats: function () { return JSON.parse(JSON.stringify(st)); }, locate: locate, hide: hide };
})();
