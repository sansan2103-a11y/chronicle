/* v292Dfix247: APIプロキシ切替（Chronicle公開化PoC）
 *
 * 目的: 秘密鍵をブラウザに置かずに遊べるようにする。
 *   設定の「プロキシURL」と「合言葉」が両方入っていれば → 全API呼び出しを
 *   Cloudflare Worker(novel-proxy)経由に書き換える。空なら従来どおり直叩き(BYOK)。
 *
 * 書き換える宛先（ネットワーク境界で一括インターセプト）:
 *   openrouter.ai/api/v1/chat/completions      → <proxy>/openrouter.ai   (本文/longmem/🎲生成/アバター記述)
 *   gen.pollinations.ai/v1/images/generations  → <proxy>/image           (AIアイコン)
 *   gen.pollinations.ai/v1/models              → <proxy>/                (キー検証→ok:true)
 *
 * 設計メモ:
 *   ・プロキシURLのパスに 'openrouter.ai' マーカーを残す → 既存のfetchラッパ群
 *     (prompt-cap/max_tokens/fix23のurl.indexOf('openrouter.ai')判定)がそのまま効く。
 *     ラップ順序に依存しない互換の核なので消さないこと。
 *   ・Authorizationヘッダは送らない(Workerが自分の鍵を付ける)。代わりにx-chronicle-pass。
 *   ・各サブシステムのゲート(cfg.orKey/cfg.pollKey/provider==='openrouter'の存在チェック)を
 *     通すため、プロキシON時はcfgに番兵'__proxy__'を自動充填(空欄のときだけ)。
 *     値自体は使われない(ヘッダごと置換されるため)。
 *   ・設定はlocalStorageグローバル(v292ProxyUrl/v292ProxyPass)=スロット非依存。
 *     スロット新規作成でcfgが初期化されても番兵が再充填されるので壊れない。
 *   ・OFF: localStorage v292ProxyOff='1'
 */
(function(){
  'use strict';
  if (window.__v292Dfix247) return;
  window.__v292Dfix247 = true;
  var TAG = '[v292Dfix247:proxy]';
  function off(){ try{ return localStorage.getItem('v292ProxyOff')==='1'; }catch(e){ return false; } }
  function purl(){ try{ return (localStorage.getItem('v292ProxyUrl')||'').trim().replace(/\/+$/,''); }catch(e){ return ''; } }
  function ppass(){ try{ return (localStorage.getItem('v292ProxyPass')||'').trim(); }catch(e){ return ''; } }
  function on(){ return !off() && !!(purl() && ppass()); }

  /* ─── URL書き換え表 ─── */
  function mapUrl(u){
    if (!on() || typeof u !== 'string') return null;
    if (u.indexOf('openrouter.ai/api/v1/chat/completions') !== -1) return purl() + '/openrouter.ai';
    if (u.indexOf('gen.pollinations.ai/v1/images/generations') !== -1) return purl() + '/image';
    if (u.indexOf('gen.pollinations.ai/v1/models') !== -1) return purl() + '/';
    return null;
  }

  /* ─── fetchラッパ ───
   * プロキシ宛はヘッダを丸ごと再構築(Authorization/HTTP-Referer/X-Titleを送らない。
   * 余計なカスタムヘッダはWorker側CORS許可に無いのでpreflightで死ぬ)。 */
  var _fetch = window.fetch;
  window.fetch = function(url, opts){
    try {
      var m = mapUrl(url);
      if (m){
        url = m;
        opts = Object.assign({}, opts || {});
        opts.headers = { 'Content-Type': 'application/json', 'x-chronicle-pass': ppass() };
      }
    } catch(e){}
    return _fetch.call(this, url, opts);
  };

  /* ─── XHRラッパ(features.js 🎲生成/genAsync + longmem) ─── */
  var _open = XMLHttpRequest.prototype.open;
  var _setH = XMLHttpRequest.prototype.setRequestHeader;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, u){
    try {
      var m = mapUrl(u);
      this.__p247 = !!m;
      if (m){ arguments[1] = m; }
    } catch(e){}
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name){
    try {
      if (this.__p247 && String(name).toLowerCase() === 'authorization') return; // 鍵は送らない
    } catch(e){}
    return _setH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(){
    try {
      if (this.__p247 && !this.__p247h){ this.__p247h = true; _setH.call(this, 'x-chronicle-pass', ppass()); }
    } catch(e){}
    return _send.apply(this, arguments);
  };

  /* ─── 番兵cfg充填(各ゲート通過用) ───
   * longmemはlocalStorageのcfg.orKeyを直接読むので、メモリだけでなく保存にも届ける。
   * 充填は「プロキシON かつ 該当欄が空」のときだけ。ユーザー自身の鍵は上書きしない。 */
  function ensureSentinel(){
    if (!on()) return;
    try {
      var st = window.S;
      if (!st || !st.cfg) return;
      var ch = false;
      if (!st.cfg.orKey){ st.cfg.orKey = '__proxy__'; ch = true; }
      if (!st.cfg.pollKey){ st.cfg.pollKey = '__proxy__'; ch = true; }
      if (st.cfg.provider !== 'openrouter'){ st.cfg.provider = 'openrouter'; ch = true; }
      if (ch){ try { st.save && st.save(); } catch(e){} console.log(TAG, 'sentinel cfg filled'); }
    } catch(e){}
  }
  setInterval(ensureSentinel, 4000);
  setTimeout(ensureSentinel, 1500);

  /* ─── 設定UI: アイコンAPI欄(cfgPollKey)の下にプロキシ2欄を注入 ─── */
  function injectUI(){
    try {
      var pk = document.getElementById('cfgPollKey');
      if (!pk || document.getElementById('cfgProxyUrl247')) return;
      var fld = pk.closest ? (pk.closest('.fld') || pk.parentNode) : pk.parentNode;
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="fld"><label>プロキシURL（公開プレイ用・入力で全APIがプロキシ経由になる）</label>' +
        '<input type="text" id="cfgProxyUrl247" placeholder="https://novel-proxy.〇〇.workers.dev（空欄=自分の鍵で直接）"></div>' +
        '<div class="fld"><label>プロキシ合言葉</label>' +
        '<input type="password" id="cfgProxyPass247" placeholder="配布された合言葉"></div>';
      while (wrap.firstChild) fld.parentNode.insertBefore(wrap.firstChild, fld.nextSibling);
      var u = document.getElementById('cfgProxyUrl247');
      var p = document.getElementById('cfgProxyPass247');
      u.value = purl(); p.value = ppass();
      u.addEventListener('input', function(){ try{ localStorage.setItem('v292ProxyUrl', u.value.trim()); }catch(e){} ensureSentinel(); });
      p.addEventListener('input', function(){ try{ localStorage.setItem('v292ProxyPass', p.value.trim()); }catch(e){} ensureSentinel(); });
      console.log(TAG, 'settings UI injected');
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUI);
  else injectUI();
  setTimeout(injectUI, 3000); // 後着保険

  console.log(TAG, 'loaded — proxy ' + (on() ? 'ON → ' + purl() : 'off (BYOK direct)'));
})();
