// =====================================================================
// Chronicle TRPG - v292Dfix318: 📏長さ / 👻怪異 をセーブ(スロット)ごとに管理
//   背景: 他のセレクタ(進行/反応/セリフ/アイコン/画風/エンジン/トーン/モデル)はS.cfgで
//     スロット別保存＋fix317で切替同期済。だが📏長さ(localStorage v100_outputLen)と
//     👻怪異(localStorage v292Dfix308Mode)は全スロット共通のグローバル設計だった。
//   要望(おしん): この2つもセーブごとに分けたい。
//   設計(コア＆fix192/fix308不触): 値をS.cfg.outLen/creepyModeにスロット別保存。
//     - 変更時: その値をS.cfg＋グローバルキーに書き、S.save()でスロットに保存。
//     - 切替時: 読み込んだスロットのcfg値(無ければfix318ロード時のグローバル値=既存セーブへ
//       現状を初期値継承)を、fix192/fix308が読むグローバルキー＋DOM＋S.cfgへ反映。
//     fix192(getLen)/fix308(mode)はグローバルキーを読むので、それをアクティブスロットの値に
//     ミラーするだけで「読みは不触のまま」スロット別になる。
//   OFF: localStorage v292Dfix318Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix318:perslot-len-creepy]';
  if(window.__v292Dfix318) return; window.__v292Dfix318=true;

  function off(){ try{ return localStorage.getItem('v292Dfix318Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、S.cfg.outLen/creepyMode と global LS(v100_outputLen / v292Dfix308Mode) が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function activeKey(){
    if(!f783Off()){
      try{ var dk=window.__chronicleDocumentStoryKey; if(typeof dk==='string'&&dk) return dk; }catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try{ return (typeof window.__chr6Key==='function')?window.__chr6Key():'chr6'; }catch(e){ return 'chr6'; }
  }
  function blobCfg(){ try{ var _k=activeKey(); if(!_k) return null; var d=JSON.parse(localStorage.getItem(_k)||'{}'); return (d&&d.cfg)||null; }catch(e){ return null; } }
  function persist(){ try{ var s=getS(); if(s&&typeof s.save==='function') (typeof s.saveD==='function'?s.saveD('fix318.persist'):s.save()); }catch(e){} }
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ localStorage.setItem(k, v); }catch(e){} }

  // fix318ロード時のグローバル値＝既存セーブへ継承する初期値
  var ITEMS=[
    {dom:'v292-len-sel',    glob:'v100_outputLen',    cfg:'outLen',     def:(lsg('v100_outputLen')||'standard')},
    {dom:'v292-creepy-sel', glob:'v292Dfix308Mode',   cfg:'creepyMode', def:(lsg('v292Dfix308Mode')||'std')}
  ];

  // 切替時: 読み込んだスロットの値をグローバルキー＋DOM＋S.cfgに反映
  function applyForSlot(){
    if(off()) return;
    /* ■fix783: authority 無しなら bc=null → 全項目が def へ落ちて global/DOM を書いてしまうので、
       ここで早期 return する(=読まない/書かない)。 */
    if(activeKey()===null) return;
    var s=getS(); var bc=blobCfg();
    ITEMS.forEach(function(it){
      try{
        var has=bc && Object.prototype.hasOwnProperty.call(bc, it.cfg);
        var v=has?bc[it.cfg]:it.def;            // 無ければ初期値(現状を継承)
        if(s&&s.cfg) s.cfg[it.cfg]=v;           // スロットの所有にする
        lss(it.glob, v);                        // fix192/fix308が読むキーへミラー
        var el=document.getElementById(it.dom); // 表示も合わせる(該当optionがある時だけ)
        if(el){ for(var i=0;i<el.options.length;i++){ if(el.options[i].value===String(v)){ el.value=String(v); break; } } }
      }catch(e){}
    });
    // ★persist()は呼ばない。applyForSlotはグローバルキー＋DOM＋S.cfg(メモリ)を合わせるだけ。
    //   理由: 起動時の初回検知でS.save()すると、コアがアクティブスロットを読み込む前の
    //   既定スロットのS(=別物語)をアクティブスロットへ上書きしてセーブ破損を起こした(実機確認)。
    //   値はスロットblobに既にあり、fix192/fix308はグローバルキーを読むので保存は不要。
    //   変更時はbindChangeがそのスロットへ正しく保存する(その時S=アクティブで一致)。
  }

  // 変更時: そのスロットの値として保存(S.cfg＋グローバル＋save)。
  //   ※既存のfix192/fix308のchangeハンドラ(グローバル書込み/怪異の再生成)はそのまま動く。
  function bindChange(){
    ITEMS.forEach(function(it){
      var el=document.getElementById(it.dom);
      if(!el || el.__v292f318bound) return;
      el.__v292f318bound=true;
      el.addEventListener('change', function(){
        try{ var s=getS(); if(s&&s.cfg) s.cfg[it.cfg]=el.value; lss(it.glob, el.value); persist(); }catch(e){}
      });
    });
  }
  try{ setInterval(bindChange, 1000); }catch(e){} bindChange();

  // 物語シグネチャ監視(fix317と同型)で切替検知
  function hashN(s){ var h=0,i; s=String(s||''); for(i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return h; }
  function sig(){ var s=getS(); var sc=(s&&s.scene)||{}; return (activeKey()||'')+'|'+(sc.loc||'')+'|'+hashN((sc.lore||'')+''+(sc.tone||'')); }
  var last=null, primed=false;
  function check(){
    if(off()) return;
    if(activeKey()===null) return;                  /* ■fix783: authority 無し document は no-op */
    var s=getS(); if(!s||!s.scene) return;
    var cur=sig();
    if(!primed){ last=cur; primed=true;
      // ★初回は「S.sceneがアクティブスロットのblobと一致(=コアの読込完了)」を確認してからだけ適用。
      //   不一致なら触らない(起動中の中間状態でglobal/DOMをいじらない)。persistは元から呼ばない。
      try{ var _k=activeKey(); var bs=_k?((JSON.parse(localStorage.getItem(_k)||'{}').scene)||{}):{}; if(s.scene&&bs.loc&&s.scene.loc===bs.loc) applyForSlot(); }catch(e){}
      return;
    }
    if(cur!==last){ last=cur; applyForSlot(); }
  }
  try{ setInterval(check, 350); }catch(e){} check();

  window.__v292Dfix318api={ applyForSlot:applyForSlot, sig:sig, items:ITEMS };
  try{ console.log(TAG,'loaded; inherit-defaults=', ITEMS.map(function(i){return i.cfg+':'+i.def;}).join(',')); }catch(e){}
})();
