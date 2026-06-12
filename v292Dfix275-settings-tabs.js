/* v292Dfix275: 設定モーダルのタブ化(🌍世界/👤キャラ/⚙システム)。
   設計: DOM移動なし・隠すのは専用CSSクラス(.v275-hide)のみ。インラインdisplayに一切触れない
   (プロバイダ切替やfix248の非表示機構と非干渉、保存は従来通り全欄一括=値消失なし)。
   タブ割当は.secヘッダを境界に動的判定(要素追加にもMutationObserverで追従)。
   OFF: localStorage v292SettingsTabsOff='1' */
(function(){
  try { if (localStorage.getItem('v292SettingsTabsOff') === '1') return; } catch(e){}
  var css = document.createElement('style');
  css.textContent = '#settingsPanel .v275-hide{display:none !important} #v275tabs button:hover{border-color:#7a7ac0 !important}';
  (document.head||document.documentElement).appendChild(css);
  function arm(){
    var p = document.getElementById('settingsPanel');
    var body = p && p.querySelector('.mpanel-body');
    if (!body) { setTimeout(arm, 600); return; }
    if (document.getElementById('v275tabs')) return;
    function classify(){
      var tab = 'sys';
      Array.prototype.forEach.call(body.children, function(c){
        if (c.id === 'v275tabs') return;
        if (c.classList && c.classList.contains('sec')) {
          var s = (c.textContent||'').trim();
          if (/主人公|NPC/.test(s)) tab = 'chr';
          else if (/世界|シーン/.test(s)) tab = 'wld';
          else tab = 'sys';
        }
        c.setAttribute('data-v275', tab);
      });
    }
    var cur = 'wld';
    try { cur = localStorage.getItem('v292SettingsTab') || 'wld'; } catch(e){}
    var bar = document.createElement('div'); bar.id = 'v275tabs';
    bar.style.cssText = 'display:flex;gap:6px;position:sticky;top:0;z-index:5;background:#15152a;padding:8px 0;margin-bottom:10px;border-bottom:1px solid #2d2d49';
    var defs = [['wld','🌍 世界'],['chr','👤 キャラ'],['sys','⚙ システム']];
    function render(){
      Array.prototype.forEach.call(body.children, function(c){
        if (c.id === 'v275tabs') return;
        if (c.classList) c.classList.toggle('v275-hide', c.getAttribute('data-v275') !== cur);
      });
      Array.prototype.forEach.call(bar.children, function(b){
        b.style.background = (b.getAttribute('data-t') === cur) ? '#3a3a5e' : 'transparent';
      });
    }
    defs.forEach(function(tt){
      var b = document.createElement('button'); b.setAttribute('data-t', tt[0]); b.type = 'button'; b.textContent = tt[1];
      b.style.cssText = 'flex:1;padding:7px 4px;border-radius:8px;border:1px solid #34344f;background:transparent;color:#d6d7ee;cursor:pointer;font-size:13px';
      b.onclick = function(ev){ try { ev.preventDefault(); } catch(_){} cur = tt[0]; try { localStorage.setItem('v292SettingsTab', cur); } catch(_){} render(); };
      bar.appendChild(b);
    });
    classify();
    body.insertBefore(bar, body.firstChild);
    try { new MutationObserver(function(){ classify(); render(); }).observe(body, { childList: true }); } catch(e){}
    render();
    try { console.log('[v292Dfix275] settings tabs armed'); } catch(e){}
  }
  arm();
})();
