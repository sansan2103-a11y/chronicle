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
      f831Reset('logged-in');                          /* ★fix831: ログイン成功で自動更新の抑制を解除 */
      console.log(TAG, 'logged in as', T.email);
      hideGate(); renderUI(); ensureSentinel();
    } catch(e){ console.warn(TAG,'onCredential error', e); }
  }

  function prompt(){ try { window.google.accounts.id.prompt(); } catch(e){} }

  /* ★fix831 AUTH_REFRESH_PROMPT_HYGIENE_V1（GPT 裁定 74・2026-09-07）
     目的は **「静かな更新を保証すること」ではなく、無言の連射をやめること**。
     背景（READ で確定）: ID トークンの寿命は 1 時間で、refresh token を持つ経路はこの製品に存在しない。
       それなのに refreshTick は期限切れの間 60 秒ごとに prompt() を撃ち、結果を一切観測していなかった。
       One Tap / FedCM は閉じられると指数的なクールダウンに入るので、この連射は更新を助けるどころか
       One Tap を長時間封じる方向に働く。
     契約:
       ・再試行は 10 分以上あける（**callback が来ない環境でも**この 1 点だけで連射は止まる）
       ・表示されなかった理由を console に出す（新しい永続 telemetry は作らない）
       ・連続で表示されない / 試行が上限に達したら **ユーザー操作があるまで停止**
       ・page が hidden のときは撃たない
       ・状態は page lifetime のメモリのみ（新しい localStorage key 0）
     kill: localStorage v292Dfix831Off='1' → 旧挙動（毎分 prompt・観測なし）へ戻る */
  var f831 = { last: 0, notShown: 0, attempts: 0, stopped: null };
  var F831_MIN_GAP_MS   = 10 * 60 * 1000;   /* 再試行の最小間隔 */
  var F831_MAX_NOTSHOWN = 3;                /* 「表示されなかった」が続いたら停止 */
  var F831_MAX_ATTEMPTS = 6;                /* callback が来ない環境の保険（約 1 時間ぶん） */
  function f831Off(){ return lsGet('v292Dfix831Off') === '1'; }
  function f831Visible(){ try { return document.visibilityState !== 'hidden'; } catch(e){ return true; } }
  function f831Reset(why){
    if (f831.stopped || f831.notShown || f831.attempts){
      try { console.log(TAG, 'renewal state reset (' + (why || '') + ')'); } catch(e){}
    }
    f831.last = 0; f831.notShown = 0; f831.attempts = 0; f831.stopped = null;
  }
  function f831Stop(why){
    if (f831.stopped) return;
    f831.stopped = why || 'unknown';
    try { console.warn(TAG, '自動更新を止めました（' + f831.stopped + '）。ログインボタンから手動でログインしてください。'); } catch(e){}
  }
  /* 戻り値は診断用の文字列（'prompted' 以外は prompt を呼んでいない） */
  function promptQuietly(why){
    if (f831Off()){ prompt(); return 'legacy'; }
    if (f831.stopped) return 'stopped:' + f831.stopped;
    if (!f831Visible()) return 'hidden';
    var now = Date.now();
    if (f831.last && (now - f831.last) < F831_MIN_GAP_MS) return 'cooldown';
    f831.last = now;
    f831.attempts++;
    if (f831.attempts > F831_MAX_ATTEMPTS){ f831Stop('max-attempts'); return 'stopped:max-attempts'; }
    try {
      window.google.accounts.id.prompt(function(n){
        /* ★この callback は来ないことがある（GIS / FedCM の実装差）。
             来なくても上の 10 分ギャップと試行上限だけで連射は止まる。ここは理由を足すだけ。 */
        var shown = true, reason = '';
        try {
          var nd = !!(n && typeof n.isNotDisplayed === 'function' && n.isNotDisplayed());
          var sk = !!(n && typeof n.isSkippedMoment === 'function' && n.isSkippedMoment());
          shown = !(nd || sk);
          if (nd && typeof n.getNotDisplayedReason === 'function') reason = String(n.getNotDisplayedReason() || '');
          else if (sk && typeof n.getSkippedReason === 'function') reason = String(n.getSkippedReason() || '');
        } catch(e){}
        if (shown){ f831.notShown = 0; return; }
        f831.notShown++;
        try { console.warn(TAG, 'silent renewal not displayed [' + (reason || 'unknown') + '] '
                                + f831.notShown + '/' + F831_MAX_NOTSHOWN + ' (' + (why || '') + ')'); } catch(e){}
        if (f831.notShown >= F831_MAX_NOTSHOWN) f831Stop('not-displayed:' + (reason || 'unknown'));
      });
    } catch(e){ f831.notShown++; if (f831.notShown >= F831_MAX_NOTSHOWN) f831Stop('prompt-threw'); }
    return 'prompted';
  }
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
      if (ch){ try{ st.save && (typeof st.saveC==='function'?st.saveC('fix328.sentinelCfg'):st.save()); }catch(e){} }
    } catch(e){}
  }

  /* ─── ログインUI（設定パネル内・カード型） ─── */
  function renderUI(){
    f835Notice();                    /* ★fix835: dormant でも必ず評価する（早期 return より前） */
    if (!enabled() || !workerReady) return;
    try {
      var anchor = document.getElementById('cfgProxyPass247') || document.getElementById('cfgPollKey');
      if (!anchor) return;
      var fld = (anchor.closest && (anchor.closest('.fld')||anchor.parentNode)) || anchor.parentNode;
      var box = document.getElementById('g250-settings');
      if (!box){
        box = document.createElement('div'); box.id='g250-settings'; box.className='fld';
        fld.parentNode.insertBefore(box, fld);
      }
      /* 状態が変わった時だけ描き直す（チラつき・GISボタン再生成の防止） */
      var sig = valid() ? ('in:'+(T.email||'')) : 'out';
      if (box.getAttribute('data-sig') === sig){ managePassField(); return; }
      box.setAttribute('data-sig', sig);
      if (valid()){
        box.innerHTML =
          '<label>Googleログイン</label>'
          + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border:1px solid rgba(127,127,160,.35);border-radius:8px;background:rgba(127,127,160,.08)">'
          + (T.pic?'<img src="'+T.pic+'" referrerpolicy="no-referrer" style="width:30px;height:30px;border-radius:50%;flex:0 0 auto">':'')
          + '<div style="flex:1;min-width:120px;line-height:1.35;overflow:hidden">'
          +   (T.name?'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(T.name)+'</div>':'')
          +   '<div style="font-size:11px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(T.email)+'</div>'
          + '</div>'
          + '<span style="font-size:11px;color:#2e9e6b;font-weight:600;flex:0 0 auto">✓ ログイン中</span>'
          + '<button id="g250-out" type="button" style="font-size:12px;padding:4px 12px;border:1px solid rgba(127,127,160,.55);border-radius:6px;background:transparent;color:inherit;cursor:pointer;flex:0 0 auto">ログアウト</button>'
          + '</div>';
        var ob = document.getElementById('g250-out'); if (ob) ob.onclick = signOut;
      } else {
        box.innerHTML =
          '<label>Googleログイン</label>'
          + '<div id="g250-btn-s"></div>'
          + '<div style="font-size:12px;opacity:.7;margin-top:6px">Googleアカウントでログインするだけで遊べます（合言葉は不要）</div>';
        var bs = document.getElementById('g250-btn-s');
        if (bs) initGis(function(){ try{ window.google.accounts.id.renderButton(bs,{theme:'filled_blue',size:'large',text:'signin_with',shape:'pill',width:260}); }catch(e){} });
      }
      managePassField();
    } catch(e){}
  }

  /* アクセスコード欄を既定で非表示（Googleログインが主・コードは上級者/予備）。
     ?code=リンクの自動入力は引き続き有効。上級者は明示トグルで復活可。
     削除ではなくdisplay:none（loadCfg/saveCfgの配線を壊さない）。 */
  function managePassField(){
    try {
      var pass = document.getElementById('cfgProxyPass247');
      if (!pass) return;
      var pf = (pass.closest && (pass.closest('.fld')||pass.parentNode)) || pass.parentNode;
      var reveal = lsGet('v292ShowAccessCode') === '1';
      pf.style.display = reveal ? '' : 'none';
      var box = document.getElementById('g250-settings');
      if (box){
        var link = document.getElementById('g250-code-toggle');
        if (!link){
          link = document.createElement('div'); link.id = 'g250-code-toggle';
          link.style.cssText = 'font-size:11px;opacity:.6;margin-top:8px;cursor:pointer;text-decoration:underline;display:inline-block';
          link.onclick = function(){ var cur = lsGet('v292ShowAccessCode') === '1'; lsSet('v292ShowAccessCode', cur ? '0' : '1'); managePassField(); };
          box.appendChild(link);
        }
        link.textContent = reveal ? '🔑 アクセスコード欄を隠す' : '🔑 コードで入る（上級者向け）';
      }
    } catch(e){}
  }

  /* ─── ログインゲート（未ログイン＆合言葉なしのとき中央に表示） ─── */
  /* ★fix835 AUTH_DORMANT_SILENT_WRITE_LOSS_V1（GPT 裁定 2026-09-08・候補2 を採用）
     観測（隔離ミラーで exact reproduce・run D）:
       Google ログインのみの端末（合言葉なし）で token が失効し、かつ checkWorker() が失敗していると
       workerReady=false のままなので shouldGate() が false になり、**gate も警告も出ない**。
       同時に authHeaders が付ける認証ヘッダは 0 本になるので **cloud write は必ず失敗する**。
       ユーザーから見える手掛かりは無い（console にのみ dormant のログ）＝「無言の失敗」。
     契約:
       ・**非ブロッキングの 1 行バナーを出すだけ**。gate の条件は 1 文字も変えない。
       ・pointer-events:none なので操作を一切邪魔しない。
       ・条件が解消したら自分で消える（refreshTick が通信復帰で workerReady=true にする）。
       ・**新しい localStorage key 0 / 新しい永続 telemetry 0 / 保存経路に触れない。**
     kill: localStorage v292Dfix835Off='1' → 何も表示しない（従来挙動） */
  var F835_ID = 'g250-dormant-notice';
  function f835On(){ return lsGet('v292Dfix835Off') !== '1'; }
  function f835Should(){
    try { return f835On() && enabled() && !!purl() && !ppass() && !valid() && !workerReady; }
    catch(e){ return false; }
  }
  function f835Notice(){
    try {
      var el = document.getElementById(F835_ID);
      if (!f835Should()){ if (el && el.parentNode) el.parentNode.removeChild(el); return; }
      if (el) return;
      if (!document.body) return;
      el = document.createElement('div');
      el.id = F835_ID;
      el.setAttribute('role','status');
      el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;padding:6px 12px;'
        + 'background:#5a3a12;color:#ffe6bf;font:12px/1.5 system-ui,sans-serif;text-align:center;'
        + 'pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35)';
      el.textContent = '\u26a0 \u30af\u30e9\u30a6\u30c9\u306b\u4fdd\u5b58\u3067\u304d\u3066\u3044\u307e\u305b\u3093\uff08Google\u30ed\u30b0\u30a4\u30f3\u304c\u5207\u308c\u3066\u3044\u308b\u304b\u3001\u30b5\u30fc\u30d0\u30fc\u306b\u63a5\u7d9a\u3067\u304d\u307e\u305b\u3093\uff09\u3002\u8a2d\u5b9a\u304b\u3089\u30ed\u30b0\u30a4\u30f3\u3057\u76f4\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
      document.body.appendChild(el);
    } catch(e){}
  }
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
      // 期限切れ/未ログイン: 自動選択が効くなら静かに再発行を試みる（★fix831: 連射しない・結果を見る）
      if (T) { initGis(function(){ promptQuietly('expired'); }); }
      maybeGate();
    } else {
      // 残り5分を切ったら先回りで更新（★fix831: ここも同じ hygiene を通す）
      if ((T.exp*1000) < (Date.now()+5*60*1000)) initGis(function(){ promptQuietly('pre-expiry'); });
    }
  }
  setInterval(refreshTick, 60*1000);
  setInterval(ensureSentinel, 4000);
  setInterval(renderUI, 3000);

  /* ─── 外部(fix399の同期UI等)からログインを促すAPI ─── */
  window.__v292Dfix328api = {
    login: function(){ try { if (!enabled()) return; f831Reset('user-login-request'); var g=document.getElementById('g250-gate'); if(g) g.remove(); checkWorker(function(){ initGis(function(){ showGate(); }); }); } catch(e){} },
    f831: function(){ return { off: f831Off(), last: f831.last, notShown: f831.notShown, attempts: f831.attempts, stopped: f831.stopped,
                               minGapMs: F831_MIN_GAP_MS, maxNotShown: F831_MAX_NOTSHOWN, maxAttempts: F831_MAX_ATTEMPTS }; },
    /* 診断口（fixture / 手動確認用）。hygiene の gate は全部通るので、最悪でも prompt 1 回で止まる。 */
    f831Prompt: function(why){ try { return promptQuietly(why || 'diag'); } catch(e){ return 'threw'; } },
    f831Reset: function(){ try { f831Reset('diag'); return true; } catch(e){ return false; } },
    email: function(){ return (T && T.email) || ''; },
    valid: function(){ return valid(); },
    enabled: function(){ return enabled(); },
    workerReady: function(){ return workerReady; },
    f835: function(){ return { on: f835On(), should: f835Should(), shown: !!document.getElementById(F835_ID) }; }
  };

  /* ─── 起動 ─── */
  function boot(){
    if (!enabled()){ console.log(TAG,'disabled (off or no CLIENT_ID)'); return; }
    setTimeout(ensureSentinel, 1500);
    checkWorker(function(){
      if (!workerReady){ console.log(TAG,'proxy not v4(google) yet — dormant, no gate'); return; }
      renderUI();
      if (valid()){ hideGate(); initGis(); }
      else { initGis(function(){ promptQuietly('boot'); }); maybeGate(); }
      console.log(TAG, 'loaded — worker v4 ready, ' + (valid()?('logged in: '+T.email):'awaiting login'));
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2500); // 後着保険（fix247bがURLを充填した後の再判定）
})();
