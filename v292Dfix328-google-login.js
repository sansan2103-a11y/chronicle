/* v292Dfix328: Googleログインで配布（合言葉の手渡し不要）
 *
 * 仕組み:
 *   ・Google Identity Services(GIS)で「Googleでログイン」→ IDトークン(JWT)を取得。
 *   ・window.__chronicleGoogleId() が有効なトークンを返す → fix247が全API呼び出しに
 *     x-google-id ヘッダを付けてWorker(v4)へ送る。Workerがメール許可台帳で照合。
 *   ・友達は配布リンクを開いてGoogleアカウントを選ぶだけ。コード入力なし。
 *
 *   合言葉(x-chronicle-pass)も従来どおり併存（後方互換）。
 *
 * 設定:
 *   CLIENT_ID … 下のBAKED_CLIENT_ID、または localStorage v292GoogleClientId で上書き可。
 *   OFF        … localStorage v292GoogleLoginOff='1'（おしんのBYOK開発用。ログイン要求もしない）
 *   保存       … localStorage v292GoogleToken = {token,exp,email,name,pic}
 */
(function(){
  'use strict';
  if (window.__v292Dfix328) return;
  window.__v292Dfix328 = true;
  var TAG = '[v292Dfix328:google]';

  /* ★ここにGCPで発行したWebクライアントIDを焼き込む（…apps.googleusercontent.com） */
  var BAKED_CLIENT_ID = '755944735372-g4g0rl8if91m2nimo23jdf125cjhs07q.apps.googleusercontent.com';

  function lsGet(k){ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

  function CLIENT_ID(){ return (lsGet('v292GoogleClientId').trim()) || BAKED_CLIENT_ID; }
  function off(){ return lsGet('v292GoogleLoginOff')==='1'; }
  function enabled(){ return !off() && !!CLIENT_ID(); }
  function purl(){ return lsGet('v292ProxyUrl').trim().replace(/\/+$/,''); }
  function ppass(){ return lsGet('v292ProxyPass').trim(); }

  /* ─── プロキシがv4(Googleログイン対応)かを確認してから起動（デプロイ順序に依存しない安全装置） ─── */
  var workerReady = false, workerChecked = false;
  function checkWorker(cb){
    var u = purl();
    if (!u){ workerChecked = true; cb && cb(); return; }
    try {
      fetch(u + '/', { cache:'no-store' })
        .then(function(r){ return r.json(); })
        .then(function(j){ workerReady = !!(j && (+j.v >= 4) && j.google === true); workerChecked = true; cb && cb(); })
        .catch(function(){ workerChecked = true; cb && cb(); });
    } catch(e){ workerChecked = true; cb && cb(); }
  }

  /* ─── トークン保管 ─── */
  var T = null; // {token, exp, email, name, pic}
  function loadStored(){
    try { var j = JSON.parse(lsGet('v292GoogleToken')||'null'); if (j && j.token && j.exp) T = j; } catch(e){}
  }
  loadStored();
  function valid(){ return !!(T && T.token && (T.exp*1000) > (Date.now()+30000)); }
  function store(j){ T = j; lsSet('v292GoogleToken', JSON.stringify(j)); }
  function clear(){ T = null; lsDel('v292GoogleToken'); }

  /* fix247が読むトークン供給口 */
  window.__chronicleGoogleId = function(){ return (workerReady && valid()) ? T.token : ''; };
  window.__chronicleGoogleEmail = function(){ return (T && T.email) || ''; };

  function decodeJwt(jwt){
    try {
      var p = jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      while(p.length%4) p+='=';
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch(e){ return {}; }
  }

  /* ─── GISスクリプト読込 ─── */
  var gisReady = false, gisLoading = false;
  function loadGis(cb){
    if (gisReady){ cb && cb(); return; }
    if (window.google && window.google.accounts && window.google.accounts.id){ gisReady=true; cb&&cb(); return; }
    if (gisLoading){ var iv=setInterval(function(){ if(gisReady){clearInterval(iv); cb&&cb();} },150); return; }
    gisLoading = true;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = function(){ gisReady = true; cb && cb(); };
    s.onerror = function(){ gisLoading=false; console.warn(TAG,'GIS script load failed'); };
    document.head.appendChild(s);
  }

  var inited = false;
  function initGis(cb){
    loadGis(function(){
      try {
        if (!inited){
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID(),
            callback: onCredential,
            auto_select: true,
            cancel_on_tap_outside: false,
            use_fedcm_for_prompt: true
          });
          inited = true;
        }
        cb && cb();
      } catch(e){ console.warn(TAG,'init error', e); }
    });
  }

  function onCredential(resp){
    try {
      var jwt = resp && resp.credential;
      if (!jwt) return;
      var p = decodeJwt(jwt);
      store({ token: jwt, exp: p.exp||0, email: (p.email||'').toLowerCase(), name: p.name||'', pic: p.picture||'' });
      console.log(TAG, 'logged in as', T.email);
      hideGate(); renderUI(); ensureSentinel();
    } catch(e){ console.warn(TAG,'onCredential error', e); }
  }

  function prompt(){ try { window.google.accounts.id.prompt(); } catch(e){} }
  function signOut(){ try { window.google.accounts.id.disableAutoSelect(); } catch(e){} clear(); renderUI(); maybeGate(); }

  /* ─── 番兵cfg（fix247のゲート通過用・Googleモードでも必要） ─── */
  function ensureSentinel(){
    if (!enabled() || !valid()) return;
    try {
      var st = window.S; if (!st || !st.cfg) return;
      var ch=false;
      if (!st.cfg.orKey){ st.cfg.orKey='__proxy__'; ch=true; }
      if (!st.cfg.pollKey){ st.cfg.pollKey='__proxy__'; ch=true; }
      if (st.cfg.provider!=='openrouter'){ st.cfg.provider='openrouter'; ch=true; }
      if (ch){ try{ st.save && st.save(); }catch(e){} }
    } catch(e){}
  }

  /* ─── ログインUI（設定パネル内＋トップバーのピル） ─── */
  function renderUI(){
    if (!enabled() || !workerReady) return;
    // 設定パネル内
    try {
      var anchor = document.getElementById('cfgProxyPass247') || document.getElementById('cfgPollKey');
      if (anchor){
        var fld = (anchor.closest && (anchor.closest('.fld')||anchor.parentNode)) || anchor.parentNode;
        var box = document.getElementById('g250-settings');
        if (!box){
          box = document.createElement('div'); box.id='g250-settings'; box.className='fld';
          fld.parentNode.insertBefore(box, fld);
        }
        box.innerHTML = valid()
          ? '<label>Googleログイン</label><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + (T.pic?'<img src="'+T.pic+'" style="width:24px;height:24px;border-radius:50%">':'')
            + '<span style="font-size:13px">'+esc(T.email)+'</span>'
            + '<button id="g250-out" type="button" style="font-size:12px;padding:3px 10px">ログアウト</button></div>'
          : '<label>Googleログイン</label><div id="g250-btn-s"></div><div style="font-size:12px;opacity:.7;margin-top:4px">Googleアカウントでログインすると遊べます</div>';
        var ob = document.getElementById('g250-out'); if (ob) ob.onclick = signOut;
        var bs = document.getElementById('g250-btn-s');
        if (bs && !valid()) initGis(function(){ try{ window.google.accounts.id.renderButton(bs,{theme:'filled_blue',size:'medium',text:'signin_with',shape:'pill'}); }catch(e){} });
      }
    } catch(e){}
  }

  /* ─── ログインゲート（未ログイン＆合言葉なしのとき中央に表示） ─── */
  function shouldGate(){ return enabled() && workerReady && !!purl() && !ppass() && !valid(); }
  function maybeGate(){ if (shouldGate()) showGate(); else hideGate(); }
  function showGate(){
    if (document.getElementById('g250-gate')) { return; }
    var ov = document.createElement('div');
    ov.id='g250-gate';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(8,8,18,.92);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="max-width:360px;width:100%;background:#15152a;border:1px solid #2d2d49;border-radius:16px;padding:28px 24px;text-align:center;color:#d6d7ee;font:14px/1.6 system-ui,sans-serif">'
      + '<div style="font-size:20px;letter-spacing:2px;margin-bottom:6px">◈ CHRONICLE</div>'
      + '<div style="opacity:.75;margin-bottom:20px">Googleアカウントでログインして始めましょう</div>'
      + '<div id="g250-btn-g" style="display:flex;justify-content:center"></div>'
      + '<div id="g250-gate-msg" style="font-size:12px;opacity:.6;margin-top:16px"></div>'
      + '</div>';
    document.body.appendChild(ov);
    initGis(function(){
      try {
        window.google.accounts.id.renderButton(document.getElementById('g250-btn-g'),{theme:'filled_blue',size:'large',text:'signin_with',shape:'pill',width:280});
        prompt();
      } catch(e){ var m=document.getElementById('g250-gate-msg'); if(m) m.textContent='ログインボタンの表示に失敗しました。再読み込みしてください'; }
    });
  }
  function hideGate(){ var g=document.getElementById('g250-gate'); if (g) g.remove(); }

  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  /* ─── トークン更新（期限切れ前に静かに再発行） ─── */
  function refreshTick(){
    if (!enabled()) return;
    if (!workerReady){ checkWorker(function(){ if (workerReady) boot(); }); return; }
    if (!valid()){
      // 期限切れ/未ログイン: 自動選択が効くなら静かに再発行を試みる
      if (T) { initGis(function(){ prompt(); }); }
      maybeGate();
    } else {
      // 残り5分を切ったら先回りで更新
      if ((T.exp*1000) < (Date.now()+5*60*1000)) initGis(function(){ prompt(); });
    }
  }
  setInterval(refreshTick, 60*1000);
  setInterval(ensureSentinel, 4000);
  setInterval(renderUI, 3000);

  /* ─── 起動 ─── */
  function boot(){
    if (!enabled()){ console.log(TAG,'disabled (off or no CLIENT_ID)'); return; }
    setTimeout(ensureSentinel, 1500);
    checkWorker(function(){
      if (!workerReady){ console.log(TAG,'proxy not v4(google) yet — dormant, no gate'); return; }
      renderUI();
      if (valid()){ hideGate(); initGis(); }
      else { initGis(function(){ prompt(); }); maybeGate(); }
      console.log(TAG, 'loaded — worker v4 ready, ' + (valid()?('logged in: '+T.email):'awaiting login'));
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2500); // 後着保険（fix247bがURLを充填した後の再判定）
})();
