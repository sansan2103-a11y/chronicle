/* ============================================================================
 * v292Dfix243: トップバー折りたたみ(モバイルで縦幅を食う問題の解消)
 *
 * おしん報告: iPhoneだとトップバーが画面のかなりの範囲を占める(コントロール多数=
 *   折り返して2〜3段)。最新版は調整ノブ8個(進行/反応/セリフ/アイコン/画風/エンジン/
 *   長さ/トーン)に加え機能ボタン10個超(描写画/キャラ生成/シナリオ/判定/タグ/状態/
 *   シーン管理/関係/メモリ/シーン)が並ぶ。
 *
 * 方針(おしん選択=「調整ノブをトグルで開閉」): 「⚙ 調整」トグルを1つ置き、二次的な
 *   コントロール(ノブ全部+機能ボタン全部)をその開閉下に隠す。常時表示はロゴ/セーブ/
 *   キャラ/設定+トグルのみ。狭い画面(<=700px=スマホ)では初期状態で閉じる。PCは開く。
 *   状態はlocalStorage('v292TopbarOpen')に記憶。後から注入されるボタンも巡回で畳み対象化。
 * OFF: localStorage v292TopbarCollapseOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix243]';
  try { if (localStorage.getItem('v292TopbarCollapseOff') === '1') return; } catch(e){}
  if (window.__v292Dfix243) return; window.__v292Dfix243 = 1;

  var KEY = 'v292TopbarOpen';

  function injectStyle(){
    if (document.getElementById('v243-style')) return;
    var css = [
      '#topbar.v243-collapsed .v243-foldable{display:none !important;}',
      '#v243-toggle{cursor:pointer;font:inherit;background:var(--s2,#17172a);color:var(--tx,#e0def0);',
      '  border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;padding:6px 10px;',
      '  white-space:nowrap;display:inline-flex;align-items:center;gap:4px;}',
      '#v243-toggle:hover{background:var(--s3,#1f1f35);}',
      '#v243-toggle .v243-caret{font-size:.8em;opacity:.8;}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'v243-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  function isOpen(){
    try { var v = localStorage.getItem(KEY); if (v === '1') return true; if (v === '0') return false; } catch(e){}
    // 既定: 広い画面=開く / 狭い画面(スマホ)=閉じる
    return (window.innerWidth || 9999) > 700;
  }
  function setOpen(v){ try { localStorage.setItem(KEY, v ? '1' : '0'); } catch(e){} apply(); }

  // 常時表示する要素か(ロゴ/ステータス/セーブ/キャラ/設定/トグル自身)
  function isAlwaysVisible(el){
    if (!el) return true;
    if (el.id === 'v243-toggle') return true;
    if (el.id === 'topStatus') return true;
    if (el.id === 'v30-topbar-btn') return true;        // 📁 セーブ
    if (el.tagName === 'H1') return true;               // ◈ CHRONICLE
    var t = (el.textContent || '').replace(/\s+/g, '');
    if (/^👥?キャラ$/.test(t)) return true;             // 👥 キャラ
    if (/^⚙?設定$/.test(t)) return true;                // ⚙ 設定
    return false;
  }

  function tagFoldables(){
    var bar = document.getElementById('topbar');
    if (!bar) return null;
    var kids = Array.prototype.slice.call(bar.children);
    kids.forEach(function(c){
      if (isAlwaysVisible(c)) { c.classList.remove('v243-foldable'); }
      else { c.classList.add('v243-foldable'); }
    });
    return bar;
  }

  function ensureToggle(bar){
    var tg = document.getElementById('v243-toggle');
    if (tg) return tg;
    tg = document.createElement('button');
    tg.id = 'v243-toggle';
    tg.type = 'button';
    tg.addEventListener('click', function(){ setOpen(!isOpen()); });
    // セーブボタンの直後に置く(無ければ先頭付近)
    var anchor = document.getElementById('v30-topbar-btn');
    if (anchor && anchor.parentNode === bar) bar.insertBefore(tg, anchor.nextSibling);
    else bar.insertBefore(tg, bar.children[2] || null);
    return tg;
  }

  function apply(){
    var bar = tagFoldables();
    if (!bar) return;
    var tg = ensureToggle(bar);
    var open = isOpen();
    bar.classList.toggle('v243-collapsed', !open);
    var n = bar.querySelectorAll('.v243-foldable').length;
    tg.innerHTML = '⚙ 調整 <span class="v243-caret">' + (open ? '▴' : '▾ ' + n) + '</span>';
    tg.title = open ? '調整コントロールを隠す' : (n + '個の調整コントロールを開く');
  }

  function boot(){
    var bar = document.getElementById('topbar');
    if (!bar || bar.children.length < 4){ setTimeout(boot, 300); return; }
    injectStyle();
    apply();
    // 後から注入されるボタン/ノブを畳み対象に取り込む(他パッチのsetInterval再注入対策)
    try { setInterval(apply, 2000); } catch(e){}
    try {
      var mo = new MutationObserver(function(){ apply(); });
      mo.observe(bar, { childList: true });
    } catch(e){}
    try { console.log(TAG, 'topbar collapse armed; foldables=', bar.querySelectorAll('.v243-foldable').length); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
