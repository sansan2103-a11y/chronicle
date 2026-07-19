// =====================================================================
// Chronicle TRPG - v292Dfix483: 生成遮断器の上限を管理者設定と同期
// ---------------------------------------------------------------------
// 管理者画面(admin v3.1)で設定した「アイコン生成の回数上限」(Worker config.genBudget)を
// 起動時に GET <proxy>/ から読み取り、localStorage v292GenBudget へ保存する。
// fix197(fix199f遮断器)が liveGenBudget() でこれをライブ参照する。
//   '0'=無制限(遮断器オフ・非推奨) / 正の整数=その回数 / 未設定=既定30。
// OFF: localStorage.v292Dfix483gbOff='1' (fix495: beat-director(同番号483)とOFFスイッチ/冪等フラグが衝突していたため gb 接尾辞へ分離。ビート停止のつもりで予算同期まで止まる事故の根治)
// 冪等: window.__v292Dfix483gb
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix483gb) return; window.__v292Dfix483gb = true;   // fix495: 483衝突分離
  var TAG = '[v292Dfix483:genbudget-sync]';
  function off(){ try { return localStorage.getItem('v292Dfix483gbOff') === '1' || localStorage.getItem('v292Dfix483Off') === '1'; } catch(e){ return true; } }   // fix495: 483衝突分離(旧キーv292Dfix483Offは1リリースの間 後方互換で尊重=GPT裁定)
  try {
    if (off()) return;
    var purl = '';
    try { purl = (localStorage.getItem('v292ProxyUrl') || '').trim().replace(/\/+$/, ''); } catch(e){}
    if (!purl) return;   // プロキシ未設定(自分の鍵で直接)なら既定のまま
    setTimeout(function(){
      fetch(purl + '/?_=' + Date.now()).then(function(r){ return r.json(); }).then(function(j){
        try {
          if (j && j.genBudget != null && isFinite(+j.genBudget)) {
            var v = Math.max(0, Math.min(999, Math.floor(+j.genBudget)));
            localStorage.setItem('v292GenBudget', String(v));
            console.log(TAG, 'synced genBudget=' + v + (v === 0 ? ' (無制限)' : ''));
          } else {
            localStorage.removeItem('v292GenBudget');   // 管理者未設定=既定へ
          }
        } catch(e){}
      }).catch(function(){ /* オフライン等は静かに既定のまま */ });
    }, 2500);
  } catch(e){}
})();
