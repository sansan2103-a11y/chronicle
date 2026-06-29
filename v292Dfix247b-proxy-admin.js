/* v292Dfix247b: プロキシ設定の管理者一元化(プレイヤー導線の簡素化)
 *   設計書「プロキシ管理_admin一元化_設計書_2026-06-29.md」の実装。
 *   ・プロキシURLはビルド既定(DEFAULT_PROXY_URL)を権威にする=プレイヤーは触らない。
 *     上級者(v292ProxyShowUrl='1')のときだけ手動URL欄を表示・尊重。
 *   ・合言葉欄を「アクセスコード」に改称(中身=v292ProxyPass流用)。admin.htmlで発行した個人コードを貼るだけ。
 *   ・?code=XXXX のリンクで開くと自動でアクセスコードを保存し、クエリを除去(露出最小)。
 *   既存 fix247 のコア(URL/合言葉の解決・fetch/XHR書換)は不触。on()= purl()&&ppass() のまま
 *   ＝URLを既定で埋めることで「コードを入れれば有効」になる。
 *   OFF: localStorage v292Dfix247bOff='1'(旧2欄の手動挙動に戻る)
 */
(function(){
  'use strict';
  if (window.__v292Dfix247b) return; window.__v292Dfix247b = true;
  var TAG = '[v292Dfix247b]';
  var DEFAULT_PROXY_URL = 'https://novel-proxy.sansan2103.workers.dev';
  function off(){ try { return localStorage.getItem('v292Dfix247bOff') === '1'; } catch(e){ return false; } }
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  if (off()) { try{ console.log(TAG,'disabled'); }catch(e){} return; }

  // (1) プロキシURLはビルド既定を権威に。上級者(手動URL)のときだけ尊重。
  function ensureUrl(){
    try {
      if (lsg('v292ProxyShowUrl') === '1') return;           // 上級者=手動URLを温存
      if (lsg('v292ProxyUrl') !== DEFAULT_PROXY_URL) lss('v292ProxyUrl', DEFAULT_PROXY_URL); // 既定を権威(URL変更も次回ロードで伝播)
    } catch(e){}
  }
  ensureUrl();

  // (2) ?code= 自動取り込み → アクセスコード(=v292ProxyPass)へ保存し、URLからクエリ除去
  (function importCode(){
    try {
      var q = new URLSearchParams(location.search);
      var code = (q.get('code') || '').trim();
      if (!code) return;
      lss('v292ProxyPass', code); ensureUrl();
      q.delete('code');
      var qs = q.toString();
      try { history.replaceState(null, '', location.pathname + (qs ? ('?'+qs) : '') + location.hash); } catch(e){}
      (function toast(){
        if (!document.body) { setTimeout(toast, 200); return; }
        var t = document.createElement('div');
        t.textContent = 'アクセスコードを設定しました';
        t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;background:#2a2a4a;color:#cfc9e6;border:1px solid #4a4a72;border-radius:8px;padding:8px 14px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.4)';
        document.body.appendChild(t); setTimeout(function(){ try{ t.remove(); }catch(e){} }, 2600);
      })();
      try { console.log(TAG, 'access code imported from URL'); } catch(e){}
    } catch(e){}
  })();

  // (3) 設定UI: URL欄を隠す(上級者のみ表示)＋合言葉欄を「アクセスコード」に改称＋保存値を表示
  function styleUI(){
    try {
      var showUrl = lsg('v292ProxyShowUrl') === '1';
      var urlInput = document.getElementById('cfgProxyUrl247');
      if (urlInput) {
        var ufld = (urlInput.closest && urlInput.closest('.fld')) || urlInput.parentNode;
        if (ufld && ufld.style) ufld.style.display = showUrl ? '' : 'none';
        if (showUrl && !urlInput.value) urlInput.value = lsg('v292ProxyUrl') || DEFAULT_PROXY_URL;
      }
      var passInput = document.getElementById('cfgProxyPass247');
      if (passInput) {
        var pfld = (passInput.closest && passInput.closest('.fld')) || passInput.parentNode;
        var lbl = pfld && pfld.querySelector ? pfld.querySelector('label') : null;
        if (lbl && lbl.textContent.indexOf('アクセスコード') < 0) lbl.textContent = 'アクセスコード（配布されたコード）';
        if (!passInput.__v247b) { passInput.__v247b = 1; passInput.placeholder = '配布されたコードを貼り付け'; if (!passInput.value) passInput.value = lsg('v292ProxyPass') || ''; }
      }
    } catch(e){}
  }
  try { setInterval(styleUI, 1000); } catch(e){}
  styleUI();

  window.__v292Dfix247bapi = { DEFAULT_PROXY_URL: DEFAULT_PROXY_URL, ensureUrl: ensureUrl };
  try { console.log(TAG, 'loaded (URL baked / ?code import / access-code label)'); } catch(e){}
})();
