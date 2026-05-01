/* v119: simplify NPC psych profile — hide 4 separate fields */
(function v119(){
  'use strict';
  var TAG = '[v119]';
  if (window.__v119Active) return;
  window.__v119Active = true;

  /* Inject CSS to hide the 4 psych profile fields and the section header */
  function ensureStyle(){
    if (document.getElementById('v119-style')) return;
    var st = document.createElement('style');
    st.id = 'v119-style';
    var css = '';
    /* The original game has 心理プロファイル section with these labels */
    /* We hide them by matching their label text via :has() if supported, else JS */
    css += '.v119-hidden { display: none !important; }';
    /* Make the kept desc field bigger (since psych is gone, give more space) */
    css += '#cfgHDesc, .npc-card textarea { min-height: 80px; }';
    /* Compact the placeholder hints */
    css += '.npc-card .v119-hint { font-size: 11px; color: var(--dim); margin-top: -6px; margin-bottom: 8px; line-height: 1.4; }';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* Find and hide the 4 psych fields by their label text */
  var PSYCH_LABELS = ['性格特性', '核心的欲求', '核心的恐怖', '傷・過去'];
  var SECTION_LABEL = '心理プロファイル';

  function hidePsychFields(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return;
    /* Walk through elements with text matching psych labels and hide their containing field block */
    var walker = document.createTreeWalker(ov, NodeFilter.SHOW_ELEMENT, null);
    var node;
    var nodes = [];
    while (node = walker.nextNode()) nodes.push(node);
    nodes.forEach(function(el){
      if (el.children.length === 0 && el.textContent){
        var t = el.textContent.trim();
        /* Match label that starts with one of the psych keywords */
        for (var i = 0; i < PSYCH_LABELS.length; i++){
          if (t.indexOf(PSYCH_LABELS[i]) === 0){
            /* Hide this element + the next sibling textarea/input */
            el.classList.add('v119-hidden');
            /* Walk up to find a "field" wrapper */
            var p = el.parentElement;
            while (p && !/fld|field|row|input/i.test(p.className) && p !== ov){
              p = p.parentElement;
            }
            if (p && p !== ov){
              p.classList.add('v119-hidden');
            }
            /* Also hide the next textarea/input sibling */
            var sib = el.nextElementSibling;
            while (sib && (sib.tagName === 'TEXTAREA' || sib.tagName === 'INPUT' || sib.tagName === 'BR')){
              sib.classList.add('v119-hidden');
              sib = sib.nextElementSibling;
            }
            break;
          }
        }
        /* Also hide section header */
        if (t === SECTION_LABEL){
          el.classList.add('v119-hidden');
        }
      }
    });
    /* Also: enhance the desc textarea placeholder to suggest writing everything in one place */
    var heroDesc = document.getElementById('cfgHDesc');
    if (heroDesc && !heroDesc.dataset.v119){
      heroDesc.placeholder = '例: 18歳、家を追われた令嬢。礼儀正しいが芯が強い。失った妹の真実を求めて旅に出た。';
      heroDesc.dataset.v119 = '1';
    }
    document.querySelectorAll('.npc-card textarea').forEach(function(ta){
      if (ta.dataset.v119) return;
      if (!ta.placeholder || ta.placeholder.length < 8){
        ta.placeholder = '例: 老兵士、片足が不自由。皮肉屋だが面倒見が良い。過去に部下を見捨てた負い目がある。';
      }
      ta.dataset.v119 = '1';
    });
  }

  /* Hook openSettings to apply hiding after render */
  function hookOpen(){
    if (typeof UI !== 'object' || !UI || UI.__v119Hooked) return;
    if (typeof UI.openSettings === 'function'){
      var orig = UI.openSettings.bind(UI);
      UI.openSettings = function(){
        var r = orig.apply(this, arguments);
        setTimeout(function(){ ensureStyle(); hidePsychFields(); }, 200);
        setTimeout(hidePsychFields, 600);
        return r;
      };
    }
    if (typeof UI._renderNpcList === 'function'){
      var orig2 = UI._renderNpcList.bind(UI);
      UI._renderNpcList = function(){
        var r = orig2.apply(this, arguments);
        setTimeout(hidePsychFields, 100);
        return r;
      };
    }
    if (typeof UI.addNpc === 'function'){
      var orig3 = UI.addNpc.bind(UI);
      UI.addNpc = function(){
        var r = orig3.apply(this, arguments);
        setTimeout(hidePsychFields, 200);
        return r;
      };
    }
    UI.__v119Hooked = true;
    console.log(TAG, 'hooks installed');
  }

  function init(){
    ensureStyle();
    hookOpen();
    hidePsychFields();
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 800);
  setTimeout(init, 2500);

  console.log(TAG, 'v119 active: psych fields simplified');
})();
