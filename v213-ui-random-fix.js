/* v213-ui-random-fix: mobile gender-radio CSS fix + gender-aware random name */
(function v213(){
  'use strict';
  if (window.__v213Active) return;
  window.__v213Active = true;

  function injectCSS(){
    if (document.getElementById('v213-style')) return;
    var s = document.createElement('style');
    s.id = 'v213-style';
    s.textContent = [
      'label[class*="rad"], label:has(> input[type="radio"][name^="v108g"]),',
      'label:has(> input[type="radio"][value="女性"]),',
      'label:has(> input[type="radio"][value="男性"]),',
      'label:has(> input[type="radio"][value=""]) {',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  white-space: nowrap !important;',
      '  word-break: keep-all !important;',
      '  flex-shrink: 0 !important;',
      '  min-width: max-content !important;',
      '  margin-right: 12px !important;',
      '  padding: 4px 6px !important;',
      '}',
      '.fld:has(input[type="radio"][value="女性"]),',
      '.fld:has(input[type="radio"][value="男性"]) {',
      '  display: flex !important;',
      '  flex-wrap: wrap !important;',
      '  align-items: center !important;',
      '  gap: 8px !important;',
      '}',
      '@media (max-width: 600px) {',
      '  label:has(> input[type="radio"][value="女性"]),',
      '  label:has(> input[type="radio"][value="男性"]),',
      '  label:has(> input[type="radio"][value=""]) {',
      '    font-size: 13px !important;',
      '    margin-right: 8px !important;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function patchGenderLabels(){
    var radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(function(r){
      var v = r.value;
      var name = r.name || '';
      var isGenderRadio = (v === '女性' || v === '男性' || v === '') &&
                          (/g_|gender|v108g/i.test(name) || /女性|男性/.test(r.parentElement && r.parentElement.textContent || ''));
      if (!isGenderRadio) return;
      var label = r.closest('label') || r.parentElement;
      if (!label) return;
      label.style.cssText += ';display:inline-flex;align-items:center;white-space:nowrap;word-break:keep-all;flex-shrink:0;min-width:max-content;margin-right:8px;';
    });
  }

  var MALE_NAMES = ['アスト','レオン','ロイド','ジーク','ヴィクター','ガルド','ボルド','ヘクター','セルジオ','ガストン','ハンス','クラウス','ヴァルド','ライアス','ガレス','ルーカス','マキシム','フェルディナント','エドガー','アレクシス','カイル','レイヴン','ダグラス','ノエル','ヴァルガ','ガロン','ザック','グレイ','トマス','ハロルド','クリスト','蒼真','武蔵','源','义','虎太郎','龍','獅子王','遼','雷','焰','黒鉄','刀','ヴァルガ卿','アスト公','ガレス侯','ヘクター伯','エドガー卿','フェルディナント大公'];
  var FEMALE_NAMES = ['アイラ','リリス','セレナ','アリア','セシリア','レイア','エマ','ソフィア','ローザ','ヴェラ','アンネ','クララ','ベル','ナナ','シエル','ニーナ','リタ','エレン','イーディス','ジゼル','ヴィクトリア','カミラ','エルザ','イザベラ','マルゴ','フィオナ','イヴ','ステラ','フローラ','ルーシー','メリッサ','ヘレナ','ミコト','カエデ','ユリ','ハナ','リン','ミナ','スズ','モモ','アヤ','アイリ','雪','椿','蓮華','瑠璃','緋花','撫子','茨','静','凛','咲','リリス嬢','セレナ姫','アリア姫君','エマ嬢','ヴィクトリア女王','カミラ夫人'];
  var NEUTRAL_NAMES = ['灰','朔','蓮','影','幻','黒','紅','蒼','銀','零','宵','夜','焰','暁','シャドウ','エコー','ノクス','レイ','フェイト','クロウ','スパロウ','ホロウ'];

  function pickName(gender){
    var pool;
    if (gender === '女性') pool = FEMALE_NAMES;
    else if (gender === '男性') pool = MALE_NAMES;
    else pool = NEUTRAL_NAMES.concat(MALE_NAMES.slice(0,10), FEMALE_NAMES.slice(0,10));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function validatePair(name, gender){
    if (!name || !gender) return true;
    if (gender === '男性' && FEMALE_NAMES.indexOf(name) >= 0) return false;
    if (gender === '女性' && MALE_NAMES.indexOf(name) >= 0) return false;
    if (gender === '女性' && /(卿|公|侯|伯|大公)$/.test(name)) return false;
    if (gender === '男性' && /(嬢|姫|夫人|女王)$/.test(name)) return false;
    return true;
  }

  function patchRandomFill(){
    var origRandomFill;
    try { origRandomFill = eval('UI.randomFill'); } catch(e){ return false; }
    if (!origRandomFill || origRandomFill.__v213Patched) return false;

    var wrapper = function(){
      try { origRandomFill.apply(this, arguments); } catch(e){ console.warn('[v213] origRandomFill err', e); }
      var s2; try { s2 = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ s2 = {}; }
      var changed = false;
      function fixCharacter(c){
        if (!c) return;
        var targetGender = c.gender;
        if (!targetGender || (targetGender !== '女性' && targetGender !== '男性')){
          targetGender = Math.random() < 0.5 ? '女性' : '男性';
          c.gender = targetGender;
          changed = true;
        }
        if (!c.name || !validatePair(c.name, targetGender)){
          c.name = pickName(targetGender);
          changed = true;
        }
        if (c.desc){
          var newDesc = c.desc.replace(/性別[:：]\s*[男女][性]?。?/, '性別: ' + targetGender + '。');
          if (!/性別[:：]/.test(c.desc)){
            newDesc = '性別: ' + targetGender + '。' + c.desc;
          }
          if (newDesc !== c.desc){ c.desc = newDesc; changed = true; }
        }
      }
      if (s2.cast){
        if (s2.cast.hero) fixCharacter(s2.cast.hero);
        (s2.cast.npcs || []).forEach(function(n){ fixCharacter(n); });
      }
      if (changed){
        try { localStorage.setItem('chr6', JSON.stringify(s2)); } catch(e){}
        console.log('[v213] post-fixed gender/name pairs');
        try { eval('UI.renderAll()'); } catch(e){}
      }
    };
    wrapper.__v213Patched = true;
    try {
      window.__v213_wrappedRandomFill = wrapper;
      eval('UI.randomFill = window.__v213_wrappedRandomFill');
      console.log('[v213] UI.randomFill wrapped');
      return true;
    } catch(e){ return false; }
  }

  function scanAndFix(){
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return; }
    if (!s.cast) return;
    var changed = false;
    function fix(c){
      if (!c || !c.name || !c.gender) return;
      if (!validatePair(c.name, c.gender)){
        var clearMismatch = (c.gender === '女性' && /(卿|公|侯|伯|大公)$/.test(c.name)) ||
                            (c.gender === '男性' && /(嬢|姫|夫人|女王)$/.test(c.name));
        if (clearMismatch){
          c.gender = (c.gender === '女性') ? '男性' : '女性';
          if (c.desc){
            c.desc = c.desc.replace(/性別[:：]\s*[男女][性]?。?/, '性別: ' + c.gender + '。');
          }
          changed = true;
        }
      }
    }
    if (s.cast.hero) fix(s.cast.hero);
    (s.cast.npcs || []).forEach(fix);
    if (changed){ try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){} }
  }

  function init(){
    injectCSS();
    setTimeout(function(){
      patchGenderLabels();
      patchRandomFill();
      scanAndFix();
    }, 1500);
    setInterval(function(){
      patchGenderLabels();
      patchRandomFill();
      scanAndFix();
    }, 4000);
    var mo = new MutationObserver(function(){ patchGenderLabels(); });
    mo.observe(document.body, { childList: true, subtree: true });
    console.log('[v213] active: UI fix + gender-aware random');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__v213 = { pickName: pickName, validatePair: validatePair, MALE_NAMES: MALE_NAMES, FEMALE_NAMES: FEMALE_NAMES, scanAndFix: scanAndFix };
})();
