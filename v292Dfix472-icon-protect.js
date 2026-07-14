// =====================================================================
// Chronicle TRPG - v292Dfix472: 承認済みアイコンの保護（上書き・削除の禁止）
// ---------------------------------------------------------------------
// ★2026-07-14（おしん指示）:
//   旧4人（カエデ / クレア / ハル / ミリア）の style6 アイコンを「正」として復元した。
//   これらは **再生成も上書きも禁止**。「絵柄をそろえ直す」や自動再生成で消えないように保護する。
//
// 仕組み: アバター画像の保存経路は必ず
//   fix197(genOne) → persistSet → localStorage.setItem('v292av2_<key>', dataURL) → (fix346 が IndexedDB へ)
//   なので、**localStorage.setItem / removeItem を最外側でラップ**して、保護キーへの
//   「異なる値の書き込み」と「削除」を **黙って無視** する（同じ値の再書き込みは通す＝冪等）。
//   レシピ（v292avrec_<key>）も同様に保護する。
//
// 保護リスト: localStorage `v292avProtect`（JSON配列）。未設定なら既定の4キー。
//   追加/解除は window.__v292Dfix472.add('v292av2_xxx') / .remove('v292av2_xxx')
// OFF: localStorage v292Dfix472Off='1'（保護を完全に解除）
// 検証口: window.__v292Dfix472.status() / .list() / .blocked
// ※ index.html では fix346 より後に読み込むこと（最外側になる必要がある）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix472 && window.__v292Dfix472.__armed) return;
  var TAG = '[v292Dfix472:icon-protect]';

  // 既定の保護キー（2026-07-14 おしん承認・style6の旧4人）
  var DEFAULT_KEYS = ['v292av2_nggsqbg', 'v292av2_ngdew9t', 'v292av2_n6cse2e', 'v292av2_nfn21rj'];

  var _set = localStorage.setItem.bind(localStorage);      // fix346 のラッパ（=IDBへ流す本体）
  var _del = localStorage.removeItem.bind(localStorage);
  var _get = localStorage.getItem.bind(localStorage);

  function off(){ try { return _get('v292Dfix472Off') === '1'; } catch(e){ return false; } }

  function list(){
    try {
      var raw = _get('v292avProtect');
      if (!raw) return DEFAULT_KEYS.slice();
      var a = JSON.parse(raw);
      return (Array.isArray(a) && a.length) ? a : DEFAULT_KEYS.slice();
    } catch(e){ return DEFAULT_KEYS.slice(); }
  }
  function save(a){ try { _set('v292avProtect', JSON.stringify(a)); } catch(e){} }

  // 保護対象か（画像キー本体 と そのレシピ）
  function guarded(k){
    if (typeof k !== 'string') return null;
    var L = list();
    for (var i = 0; i < L.length; i++){
      var pk = L[i];                                   // 'v292av2_xxxx'
      if (k === pk) return pk;
      var suffix = pk.replace(/^v292av2_/, '');
      if (k === 'v292avrec_' + suffix) return pk;      // レシピも保護
    }
    return null;
  }

  var blocked = { writes: 0, deletes: 0, last: '' };

  localStorage.setItem = function(k, v){
    try {
      if (!off()){
        var pk = guarded(k);
        if (pk){
          var cur = null; try { cur = _get(k); } catch(e){}
          if (cur != null && String(cur) !== String(v)){   // 中身が変わる書き込みだけを止める
            blocked.writes++; blocked.last = k;
            try { console.warn(TAG, '保護キーへの上書きを阻止:', k); } catch(e){}
            return;                                        // 黙って無視（例外は投げない＝呼び出し側を壊さない）
          }
        }
      }
    } catch(e){}
    return _set(k, v);
  };

  localStorage.removeItem = function(k){
    try {
      if (!off() && guarded(k)){
        blocked.deletes++; blocked.last = k;
        try { console.warn(TAG, '保護キーの削除を阻止:', k); } catch(e){}
        return;
      }
    } catch(e){}
    return _del(k);
  };

  window.__v292Dfix472 = {
    __armed: true,
    blocked: blocked,
    list: list,
    add: function(k){ var a = list(); if (a.indexOf(k) < 0){ a.push(k); save(a); } return a; },
    remove: function(k){ var a = list().filter(function(x){ return x !== k; }); save(a); return a; },
    status: function(){ return { off: off(), keys: list(), blockedWrites: blocked.writes, blockedDeletes: blocked.deletes }; }
  };
  try { console.log(TAG, 'armed. 保護キー=' + list().length + '件'); } catch(e){}
})();
