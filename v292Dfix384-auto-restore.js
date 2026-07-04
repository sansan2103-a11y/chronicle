// =====================================================================
// Chronicle TRPG - v292Dfix384: 「AI自動に戻す」ボタン（fix382の対）
// おしん依頼 2026-07-04「手動で触ったら自動停止、をまたAI自動に戻せるボタンを」
// ---------------------------------------------------------------------
// 挙動: セリフセレクタを手動で触ってslot別Touchedフラグが立っている時【だけ】、
//   セレクタの直後に小さな「🤖自動」ボタンを出す。クリックでフラグ削除
//   （=fix382のAI自動調整が再開）してボタンは消える。
//   普段（自動運転中）は何も表示しない＝UIを増やさない・没入感を削がない。
// 表示条件: fix382プレビューON かつ Touchedフラグあり。1.5sポーリング(fix372流)。
// 既定ON。OFF: localStorage v292Dfix384Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__f384done) return; window.__f384done = 1;
  var TAG = '[v292Dfix384:auto-restore]';
  function off(){ try { return localStorage.getItem('v292Dfix384Off') === '1'; } catch(e){ return false; } }
  function f382on(){
    try { return localStorage.getItem('v292Dfix382') === '1' && localStorage.getItem('v292Dfix382Off') !== '1'; } catch(e){ return false; }
  }
  function slotSfx(){ try { if (typeof window.__chr6Key === 'function'){ var k = window.__chr6Key(); return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : ''; } } catch(e){} return ''; }
  function touchedKey(){ return 'v292Dfix382Touched' + slotSfx(); }
  function touched(){ try { return localStorage.getItem(touchedKey()) === '1'; } catch(e){ return false; } }
  function findDialogueSelect(){
    var sels = document.querySelectorAll('select');
    for (var i = 0; i < sels.length; i++){
      var el = sels[i];
      var opts = Array.prototype.map.call(el.options || [], function(o){ return o.textContent; }).join('');
      if (opts.indexOf('控えめ') < 0 || opts.indexOf('濃いめ') < 0) continue;
      var box = el.closest ? (el.closest('span,label,div') || el.parentNode) : el.parentNode;
      var around = box ? String(box.textContent || '') : '';
      if (around.indexOf('セリフ') >= 0) return el;
    }
    return null;
  }
  function tick(){
    try {
      var btn = document.querySelector('.v292f384-btn');
      var show = !off() && f382on() && touched();
      if (!show){ if (btn && btn.parentNode) btn.parentNode.removeChild(btn); return; }
      if (btn) return;
      var sel = findDialogueSelect(); if (!sel || !sel.parentNode) return;
      var b = document.createElement('button');
      b.className = 'v292f384-btn';
      b.type = 'button';
      b.textContent = '🤖自動';
      b.title = 'セリフ量をAIの自動調整に戻す（手動固定を解除）';
      b.style.cssText = 'margin-left:4px;font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;cursor:pointer;vertical-align:middle;';
      b.addEventListener('click', function(ev){
        try { ev.preventDefault(); ev.stopPropagation(); } catch(e){}
        try { localStorage.removeItem(touchedKey()); } catch(e){}
        try { if (b.parentNode) b.parentNode.removeChild(b); } catch(e){}
        try { console.log(TAG, '手動固定を解除→AI自動調整を再開 (' + touchedKey() + ')'); } catch(e){}
      }, true);
      sel.parentNode.insertBefore(b, sel.nextSibling);
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 1500); }, 4000);
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
