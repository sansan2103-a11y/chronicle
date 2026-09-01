/* ============================================================================
 * v292Dfix246: per-storyストアのスロット分離(スロット間の状態混入の根治)
 *
 * 問題(2026-06-08実証): スロットを行き来すると別物語の状態が混ざる。
 *   実害=slot_Cの港町テスト(クジラ)がslot_Aのカエデ状態欄に出た。真因=以下の
 *   per-story ストアが固定キー(__chr6Key非対応・グローバル)で、全スロット共有:
 *     - v292Dfix77States            (fix77 キャラ状態 — 自動回復なし=主犯)
 *     - chr6_v292Dfix104_dlg         (会話ログ抽出キャッシュ)
 *     - chr6_v292Dfix135_sum / _last (longmem 要約 / 最終ビルド)
 *     - chr6_v292Dfix136_wi          (longmem worldinfo=キャラ一覧の自動抽出)
 *     - chr6_v292Dfix137_ev          (longmem 重要イベント)
 *   セーブ本体(chr6_slot_*)は既にスロット分離済(fix205/225/230)だが、これらの
 *   キャッシュ類が残党だった。
 *
 * 方式: localStorage.getItem/setItem/removeItem を薄くラップし、上記6キーへの
 *   アクセスだけ「base + スロット接尾辞」へリダイレクトする(他キーは素通し)。
 *     接尾辞 = __chr6Key()がchr6_slot_a → '_slot_a' / default(chr6) → '' (=既存と互換)
 *   各サブシステムのコードは無改変のまま、読み書きが自動でスロット単位になる。
 *   longmemの自前reset()やfix77のクリアもラッパ経由でactiveスロットだけに効く。
 *
 * 一回限りの移行: 既存のグローバルキー(=現active=slotの内容)をactiveスロットの
 *   接尾辞キーへコピーし、グローバル側を消す(=他スロットは各自のターンから再構築)。
 *   これでactiveスロットは現状維持・他スロットは混入なしのクリーン状態から始まる。
 *
 * 注意: localStorage.key()/length は実キー(接尾辞付き)を返す。fix93の物語リセットの
 *   v292Dfix77States完全一致は接尾辞付きにマッチするよう別途broaden(features.js)。
 *   完全リセットのallAppKeys(/^chr6/ | /^v292Dfix/)は接尾辞付きでもマッチ=影響なし。
 * OFF: localStorage v292StoreSlotIsoOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix246]';
  if (window.__v292Dfix246) return;
  // 原メソッドは常に捕獲(OFFでも移行判定にだけ使う場合がある)
  var _get, _set, _rem;
  try {
    _get = localStorage.getItem.bind(localStorage);
    _set = localStorage.setItem.bind(localStorage);
    _rem = localStorage.removeItem.bind(localStorage);
  } catch(e){ return; }
  try { if (_get('v292StoreSlotIsoOff') === '1') return; } catch(e){}
  window.__v292Dfix246 = 1;

  // スロット分離する per-story 固定キー(完全一致)
  var KEYS = {
    'v292Dfix77States': 1,
    'chr6_v292Dfix104_dlg': 1,
    'chr6_v292Dfix135_sum': 1,
    'chr6_v292Dfix135_last': 1,
    'chr6_v292Dfix136_wi': 1,
    'chr6_v292Dfix137_ev': 1
  };

  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: suffix() は getItem/setItem/removeItem の**都度**評価されるので、別タブが物語を
       開いて共有ポインタが動いた瞬間、per-story 6キー(fix77States / fix104_dlg /
       fix135_sum / _last / fix136_wi / fix137_ev)への読み書きがまるごと別 story の
       接尾辞へ逸れた(実測: ct_fix783_multitab.mjs R3)。
     対処: fix694 document authority(__chronicleDocumentStoryKey)を第一経路にする。
     ★例外(裁定): ここだけは authority 無しのとき **no-op にしない**。このモジュールは
       localStorage の global wrapper なので、null で「触らない」を選ぶと接尾辞の形が
       変わり別キーを読み書きすることになる。従来経路(__chr6Key)へ fallback する。
       なお index.html は authority 無しなら fix694 が home へ replace するため、
       この fallback が使われるのは fix694 OFF 等の退避状態だけ。
     kill: localStorage v292Dfix783Off='1' → 旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return _get('v292Dfix783Off') === '1'; } catch(e){ return false; } }
  function suffix(){
    try {
      if (!f783Off()){
        var dk = window.__chronicleDocumentStoryKey;
        if (typeof dk === 'string' && dk) return (dk === 'chr6') ? '' : dk.replace(/^chr6/, '');
      }
      if (typeof window.__chr6Key === 'function'){
        var k = window.__chr6Key();
        return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : '';   // 'chr6_slot_a' → '_slot_a'
      }
      var a = JSON.parse(_get('chr6_active_slot') || 'null');
      return (a && a !== 'default') ? ('_slot_' + a) : '';
    } catch(e){ return ''; }
  }
  function redirect(k){ return (KEYS[k] && suffix()) ? (k + suffix()) : k; }

  // ---- 一回限りの移行: グローバル → activeスロット接尾辞 ----
  // suffix()=='' (defaultスロット)なら何もしない(base=active)。
  try {
    var sfx = suffix();
    if (sfx){
      var migrated = [];
      Object.keys(KEYS).forEach(function(base){
        var dst = base + sfx;
        var gv = _get(base);
        if (gv != null && _get(dst) == null){
          try { _set(dst, gv); _rem(base); migrated.push(base); } catch(e){}
        } else if (gv != null && _get(dst) != null){
          // 既にスロット側がある=移行不要。グローバル(他スロットへの汚染源)は除去。
          try { _rem(base); } catch(e){}
        }
      });
      if (migrated.length) try { console.log(TAG, 'migrated to', sfx, ':', migrated.join(',')); } catch(e){}
    }
  } catch(e){}

  // ---- リダイレクトラッパー設置 ----
  try {
    localStorage.getItem = function(k){ return _get(redirect(k)); };
    localStorage.setItem = function(k, v){ return _set(redirect(k), v); };
    localStorage.removeItem = function(k){ return _rem(redirect(k)); };
    try { console.log(TAG, 'store slot-isolation armed; suffix="' + suffix() + '"'); } catch(e){}
  } catch(e){}
})();
