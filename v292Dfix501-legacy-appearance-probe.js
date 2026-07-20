// =====================================================================
// Chronicle TRPG - v292Dfix501: 旧外見経路(__aiAvatar)の到達性プローブ(D3・候補・既定OFF)
// ---------------------------------------------------------------------
// 目的(D3・ユーザー指示「まず計測。本文や個人情報は保存せず、回数と結果だけ記録」):
//   旧外見/アイコン経路 window.__aiAvatar (features.js fix118・genAsyncは推論型モデルで
//   max_tokens枯渇→空/length になり得る=fix497がfix461で直した同型がこちらは未修正)が、
//   現行のおしんの実プレイ config で【実際に到達するか】を、本体(features.js 600KB)を
//   触らずに外部から計測する。
//
// ★計測できる範囲(外部ラップの限界・正直に明示):
//   - D3_LEGACY_PATH_HIT     : __aiAvatar.regen / refreshAll / urlFor の呼び出し回数(=経路到達)
//   - D3_LEGACY_URLFOR       : urlForで実URLを生成した回数
//   - D3_LEGACY_ENABLED_TRUE : 呼び出し時に __aiAvatar.enabled() が真だった回数
//   ※ D3_LEGACY_EMPTY_RESULT / FINISH_REASON_LENGTH / RETRY は genAsync 内部の
//     モデル応答に依存し、外部ラップからは観測不能。これらは features.js 内部の
//     計測が必要=600KB再upload=ローカルgit移行時にまとめて入れるのが安全(本fixの範囲外)。
//
// ★一切の挙動変更なし: 元メソッドをそのまま呼ぶ透過ラッパ。返り値・例外もそのまま。
//   本文・prompt・個人情報は保存しない(呼び出し回数と真偽のみ)。
// 有効化(opt-in・既定OFF): localStorage.v292Dfix501OnV1==='1' かつ v292Dfix501Off!=='1'
// 検証口/読み出し: window.__v292Dfix501.counters() / .status()
// ※本fixは候補。実プレイでおしんが有効化→数ターン後 counters() を読めば到達性が分かる。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix501 && W.__v292Dfix501.__armed) return;
  var TAG = '[v292Dfix501:legacy-probe]';
  function off(){ try { return localStorage.getItem('v292Dfix501Off') === '1'; } catch(e){ return false; } }
  function on(){ try { if (off()) return false; return localStorage.getItem('v292Dfix501OnV1') === '1'; } catch(e){ return false; } }

  var C = { D3_LEGACY_PATH_HIT:0, D3_LEGACY_URLFOR:0, D3_LEGACY_ENABLED_TRUE:0, regen:0, refreshAll:0 };
  function bump(k){ if (C[k]!=null) C[k]++; }
  function enabledTrue(av){ try { return !!(av && typeof av.enabled==='function' && av.enabled()); } catch(e){ return false; } }

  var wrapped = false;
  function wrap(){
    if (wrapped) return true;
    var av = W.__aiAvatar;
    if (!av || typeof av !== 'object') return false;
    ['regen','refreshAll','urlFor'].forEach(function(name){
      var orig = av[name];
      if (typeof orig !== 'function' || orig.__f501) return;
      var w = function(){
        try {
          if (on()){
            bump('D3_LEGACY_PATH_HIT');
            if (name==='urlFor') bump('D3_LEGACY_URLFOR'); else bump(name);
            if (enabledTrue(av)) bump('D3_LEGACY_ENABLED_TRUE');
          }
        } catch(e){}
        return orig.apply(this, arguments);   // 透過: 挙動は一切変えない
      };
      w.__f501 = true;
      try { av[name] = w; } catch(e){}
    });
    wrapped = true;
    try { console.log(TAG, 'wrapped __aiAvatar entry points'); } catch(e){}
    return true;
  }

  // __aiAvatar は features.js ロード後に生える → 出現までポーリング(最大~20秒)
  if (!wrap()){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (wrap() || tries > 40){ try { clearInterval(iv); } catch(e){} }
    }, 500);
  }

  W.__v292Dfix501 = {
    __armed: true,
    counters: function(){ var o={}; for (var k in C) o[k]=C[k]; o.wrapped=wrapped; o.on=on(); return o; },
    status: function(){ return { armed:true, on:on(), wrapped:wrapped, aiAvatarPresent: !!(W.__aiAvatar) }; }
  };
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off(candidate)'); } catch(e){}
})();
