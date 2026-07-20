// =====================================================================
// Chronicle TRPG - v292Dfix499: 無料GETフォールバックの画風正規化（D5・GET側の最終境界）
// ---------------------------------------------------------------------
// 背景(2026-07-20・監査fix497後):
//   画風の最終決定=fix484(既定ON・最内fetchラッパ)が「gen.pollinations.ai / workers.dev
//   の /image POST」だけを canonical STYLE6_TAIL へ正規化している。しかし
//   image.pollinations.ai の無料GET(?width=384…)はfix484の対象外(POST限定)。
//   その無料GETを発行する fix491(freefallback) は fix475/fix484 より【外側】に読み込まれる
//   ため、body.prompt を canonical化される【前】に読み取ってGET URLを組む。加えて内側の
//   fix338 GET分岐が旧ART6_TAIL(semi-realistic)を再注入し得る。結果、POST本経路は
//   canonical(dark anime・v2)なのに、クライアント無料GETフォールバックだけ旧tail
//   (pale skin=v1 / semi-realistic / tail無し)へドリフトする。
//   ※現行の主経路(POST)とWorker v28サーバ側フォールバック(fix484通過後のcanonicalな
//     プロンプトをサーバが使う)は既にcanonical。本fixが閉じるのは「クライアント側で
//     無料GETが発火する潜在経路(serverFb=false時・旧経路)」の残ドリフト。
//
// 方針(GPT承認方針=各経路を個別改変せず最終境界で一度だけ正規化):
//   fix484が POST の最終境界であるのと対をなす「GET の最終境界」を1枚追加する。
//   ・配置=最内(index.htmlで fix484 の【直前】に読み込む)。全ての外側ラッパが発行する
//     無料GET(fix491・fix487以外の旧経路)は、その _origFetch チェーンを通じて必ずここを
//     最後に通過する＝送信直前の最終境界になる。
//   ・対象= image.pollinations.ai/prompt/… の【非POST(GET) かつ width=384】(=アイコン)。
//     SEE(512x288)・シルエット(fix487・width=512)・チャット等は対象外(byte等価で素通し)。
//   ・正規化=独自のtailテーブルを持たず、実行時に fix484.canonicalize を再利用する
//     (STYLE6_TAIL の三重定義=ドリフト事故の回避)。fix484不在 or kill(v292Dfix484Off)時は
//     GET側も無変更で素通し=POSTと歩調を合わせる。
//   ・触るのは URLパスの prompt セグメントのみ。width/height/model/seed/nologo 等の
//     クエリはbyte単位で保持=seed/生成パラメータ/画像同一性は不変。
//   ・人間/人外の分類は fix484 の detect/CREATURE_RE と同一判定=POSTと一致(分類は変えない)。
//   ・冪等: 2回適用してもURLは変化しない(canonical冪等 + encodeURIComponent安定 + クエリ保持)。
//   ・fail-open: 例外時は必ず元リクエストで送信。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix499OnV1==='1' かつ v292Dfix499Off!=='1'
// 冪等ガード: window.__v292Dfix499.__armed
// 検証口: window.__v292Dfix499 = { isAvatarFreeGet, normalizeUrl, canonicalOf, active, status }
// ※このファイルは document に一切触れない(Nodeサンドボックスでテスト可能)。
// =====================================================================
// ★改番(2026-07-20): 当初fix498候補だったが、並行セッションが同時刻にfix498番号を
//   別用途(会話ログ誤振り分け抑制+代名詞ブリッジ・fix459/fix469改変)で本番デプロイ済みのため、
//   衝突回避で本モジュールをfix499へ改番。D5(画像GET画風正規化)の内容は不変。
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix499 && W.__v292Dfix499.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix499:freeget-canon]';
  var PROMPT_MARK = 'image.pollinations.ai/prompt/';

  // ---------- スイッチ(live評価・opt-in・既定OFF) ----------
  function off(){ try { return localStorage.getItem('v292Dfix499Off') === '1'; } catch(e){ return false; } }
  function on(){
    try {
      if (off()) return false;
      return localStorage.getItem('v292Dfix499OnV1') === '1';
    } catch(e){ return false; }
  }
  // POSTの正規化(fix484)が生きている時だけGET側も正規化する=歩調合わせ。
  function canonSource(){
    try {
      var f = W.__v292Dfix484;
      if (!f || !f.__armed || typeof f.canonicalize !== 'function') return null;
      if (typeof f.active === 'function' && !f.active()) return null;   // fix484 kill中はGET側も止める
      return f;
    } catch(e){ return null; }
  }
  function active(){ return on() && !!canonSource(); }

  // ---------- 対象判定: image.pollinations.ai/prompt の GET かつ width=384(=アイコン) ----------
  //   POST(gen.pollinations / workers.dev)は fix484 が担当=ここでは触らない。
  //   SEE(width=512&height=288)・シルエット(fix487・width=512)は width!=384 で自動除外。
  function isAvatarFreeGet(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf(PROMPT_MARK) < 0) return false;
      // メソッド: 明示POSTは除外。未指定/GET/HEADのうち GET相当のみ対象。
      var m = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
      if (m !== 'GET') return false;
      // 画像サイズ=384(アイコン)のみ。width指定が無いURLは対象外(安全側)。
      if (!/[?&]width=384(?:&|$)/.test(u)) return false;
      return true;
    } catch(e){ return false; }
  }

  // ---------- prompt抽出→canonical→URL再構築 ----------
  //   触るのはパスの prompt セグメントのみ。'?' 以降のクエリはそのまま連結(byte保持)。
  function canonicalOf(prompt){
    var f = canonSource();
    if (!f) return { prompt: prompt, matched: null };
    try {
      var res = f.canonicalize(String(prompt == null ? '' : prompt));
      return { prompt: res && res.prompt != null ? res.prompt : prompt, matched: res ? res.matched : null };
    } catch(e){ return { prompt: prompt, matched: null }; }
  }

  function normalizeUrl(u){
    var s = String(u == null ? '' : u);
    var pi = s.indexOf(PROMPT_MARK);
    if (pi < 0) return s;
    var head = s.slice(0, pi + PROMPT_MARK.length);   // '…image.pollinations.ai/prompt/'
    var rest = s.slice(pi + PROMPT_MARK.length);
    var qi = rest.indexOf('?');
    var encPrompt = (qi < 0) ? rest : rest.slice(0, qi);
    var query = (qi < 0) ? '' : rest.slice(qi);        // '?' 込みでbyte保持
    var decoded;
    try { decoded = decodeURIComponent(encPrompt); } catch(e){ return s; }   // 壊れたエンコード=触らない
    var res = canonicalOf(decoded);
    if (!res.matched) return s;                        // 非art6(marker/cfg無し)=無変更で素通し
    var reenc = encodeURIComponent(res.prompt);
    if (reenc === encPrompt) return s;                 // 既にcanonical(冪等)=byte等価で素通し
    return head + reenc + query;
  }

  // ---------- fetch ラッパ(最内) ----------
  var _origFetch = W.fetch;
  var wrapped = function(url, init){
    try {
      if (on() && isAvatarFreeGet(url, init)){
        var u0 = String((url && url.url) || url || '');
        var u1 = normalizeUrl(u0);
        if (u1 !== u0){
          // Request オブジェクトで来た場合も文字列URLへ正規化して送る(init は保持)。
          return _origFetch.call(this, u1, init);
        }
      }
    } catch(e){ try { console.warn(TAG, 'wrap error', e); } catch(_){} }
    return _origFetch.apply(this, arguments);
  };
  // own props 全継承(fix419cの教訓: フラグ消し合い=再ラップ地獄の防止)
  try {
    Object.getOwnPropertyNames(_origFetch).forEach(function(k){
      if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(_origFetch, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped, 'name', { value: (_origFetch && _origFetch.name) || 'fetch', configurable: true }); } catch(e){}
    if (_origFetch && _origFetch.prototype) { try { wrapped.prototype = _origFetch.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix499 = true;
  W.fetch = wrapped;

  // ---------- 検証口 ----------
  W.__v292Dfix499 = {
    __armed: true,
    isAvatarFreeGet: isAvatarFreeGet,
    normalizeUrl: normalizeUrl,
    canonicalOf: canonicalOf,
    active: active,
    on: on,
    status: function(){ return { armed: true, on: on(), fix484: !!canonSource(), active: active() }; }
  };
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off(preview)', 'fix484:', !!canonSource()); } catch(e){}
})();
