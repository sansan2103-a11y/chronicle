// =====================================================================
// Chronicle TRPG - v292Dfix334: 入口ハブ(Phase A) — 空白フォームで始めない
// 背景(おしん2026-07-01「最初に世界観とキャラを空欄フォームに全部書かせるのが
//   一番のハードルで、友達が誰も遊び始めてくれない」+DeepResearch入口摩擦研究):
//   現状の空状態は「⚙設定からAPIキーと世界設定を入力してください」だけ=導線ゼロ+
//   プロキシ認証なのに"APIキー"文言が誤解を生む。→空状態でも常に始める導線を出す
//   入口ハブに。①API文言撤去 ②開始/世界を作る導線 ③おまかせ枠(Phase Bで生成を接続)。
// 設計: 純UI。コア(G.startScene / UI.openSettings / hasKeyゲート)は不触=既存の
//   開始ゲートに一切触れない(友達のプロキシ認証パスを壊さない)。表示文字列と導線だけ改善。
//   UI._showIntroをラップして空状態を再スキン+起動時ポーリング。
//   ★既定OFF(友達のライブ入口は不変)。プレビュー=localStorage v292Dfix334='1'。
//   将来おまかせ生成(Phase B)は #v334-omakase ボタンにフックするだけで載る。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix334) return; window.__v292Dfix334 = true;
  var TAG='[v292Dfix334:entryhub]';
  function on(){ try{ return localStorage.getItem('v292Dfix334')==='1'; }catch(e){ return false; } }

  // inject style once
  try{
    var st=document.createElement('style'); st.id='v292-fix334-style';
    st.textContent=[
      '#welcome .v334-hub{margin-top:20px;display:flex;flex-direction:column;gap:12px;align-items:center}',
      '#welcome .v334-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}',
      '#welcome .v334-btn{min-width:190px;padding:11px 18px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;border:1px solid var(--border,rgba(139,118,240,.35));background:var(--s2,#17172a);color:var(--tx,#e0dcf0);transition:filter .15s,background .15s}',
      '#welcome .v334-btn:hover{filter:brightness(1.15)}',
      '#welcome .v334-btn.primary{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc,#8b76f0)}',
      '#welcome .v334-btn.omakase{border-color:rgba(139,118,240,.5)}',
      '#welcome .v334-hint{font-size:11px;color:var(--dim,#888);line-height:1.6;max-width:440px;text-align:center}',
      '#welcome .v334-soon{font-size:10px;color:var(--dim,#888);opacity:.8;margin-left:6px}'
    ].join('\n');
    (document.head||document.documentElement).appendChild(st);
  }catch(e){}

  function getUI(){ try{ return window.UI||(typeof UI!=='undefined'?UI:null); }catch(e){ return null; } }
  function getS(){ try{ return window.S||(0,eval)('S'); }catch(e){ return null; } }
  function worldReady(){
    try{ var S=getS(); if(!S||!S.cfg) return false;
      var p=S.cfg.provider||'anthropic';
      var hasKey = p==='novelai'?S.cfg.naiKey : p==='openrouter'?S.cfg.orKey : S.cfg.key;
      return !!hasKey;   // 既存ゲートと同じ判定を"表示用"に読むだけ(ゲート自体は不触)
    }catch(e){ return false; }
  }

  function reskin(){
    if(!on()) return;
    var wl=document.getElementById('welcome'); if(!wl) return;
    if(getS() && getS().turns && getS().turns.length>0) return; // 物語進行中は出さない
    var msg=document.getElementById('welcomeMsg');
    var acts=document.getElementById('welcomeActions');
    var ready=worldReady();
    // ①API文言撤去: 空状態メッセージを差し替え(友達はプロキシ認証=キー不要)
    if(msg && !ready){
      msg.innerHTML='<span style="color:var(--tx)">物語を始めましょう。</span><br>'
        +'<span class="v334-hint" style="display:inline-block;margin-top:8px">'
        +'世界とキャラクターを用意すると、すぐに遊び始められます。'
        +'自分で作っても、AIにおまかせで用意してもらってもOKです。</span>';
    }
    // ②③導線: 空状態でも常に始める道を出す(今は導線ゼロ)
    if(acts){
      acts.style.display='block';
      // 既存のquickStarts(world readyの時の例示)は温存。ハブ行を1つだけ足す(冪等)。
      if(!document.getElementById('v334-hub')){
        var hub=document.createElement('div'); hub.id='v334-hub'; hub.className='v334-hub';
        var row=document.createElement('div'); row.className='v334-row';
        // ▶ この世界で始める (world readyのみ・既存G.startSceneを呼ぶだけ=ゲート不触)
        if(ready){
          var bStart=document.createElement('button'); bStart.className='v334-btn primary';
          bStart.textContent='▶ この世界で始める';
          bStart.onclick=function(){ try{ (window.G||G).startScene(); }catch(e){} };
          row.appendChild(bStart);
        }
        // ✏️ 世界を作る/設定 (既存 openSettings)
        var bMake=document.createElement('button'); bMake.className='v334-btn'+(ready?'':' primary');
        bMake.textContent='✏️ 世界とキャラを作る';
        bMake.onclick=function(){ try{ getUI().openSettings(); }catch(e){} };
        row.appendChild(bMake);
        // 🎲 おまかせ (Phase B接続点・今は近日ラベル)
        var bOma=document.createElement('button'); bOma.className='v334-btn omakase'; bOma.id='v334-omakase';
        bOma.innerHTML='🎲 おまかせで用意<span class="v334-soon">近日</span>';
        bOma.onclick=function(){
          // Phase Bで window.__v334Omakase() が定義されたらそれを呼ぶ。未定義なら案内。
          try{ if(typeof window.__v334Omakase==='function'){ window.__v334Omakase(); return; } }catch(e){}
          try{ getUI().setStatus('おまかせ生成(AIが世界とキャラを自動生成)は近日追加します'); }catch(e){}
        };
        row.appendChild(bOma);
        hub.appendChild(row);
        acts.appendChild(hub);
      } else {
        // 既に作ってある: readyに応じてstartボタンの有無だけ整える
        var existStart=document.querySelector('#v334-hub .primary');
      }
    }
    try{ console.log(TAG, 'reskinned; worldReady=', ready); }catch(_){}
  }

  function install(){
    var UI=getUI(); if(!UI||typeof UI._showIntro!=='function') return false;
    if(UI.__v334wrap) return true;
    var orig=UI._showIntro.bind(UI);
    UI._showIntro=function(){ var r=orig.apply(this,arguments); try{ reskin(); }catch(e){} return r; };
    UI.__v334wrap=true;
    try{ console.log(TAG,'_showIntro wrapped; hub:', on()?'on':'off(default)'); }catch(_){}
    return true;
  }
  (function poll(){ poll._n=(poll._n||0)+1; if(!install() && poll._n<80) setTimeout(poll,400); })();
  try{ setInterval(function(){ try{ if(on()) reskin(); }catch(e){} }, 1500); }catch(e){}
  // 起動直後にも一度
  setTimeout(function(){ try{ reskin(); }catch(e){} }, 1200);

  window.__v292Dfix334api={ on:on, reskin:reskin, worldReady:worldReady };
  try{ console.log(TAG,'loaded'); }catch(_){}
})();
