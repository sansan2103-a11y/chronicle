// =====================================================================
// Chronicle TRPG - v292Dfix291: セーブの書き出し/読み込み(PC↔スマホ移行)
//   + v292Dfix294: 既存の「セーブ」管理モーダルに統合(おしんFB「セーブの中にまとめて」)
// localStorage 一式を1つのJSONに書き出し/読み込みで丸ごと移行。fix246回避で生Storage使用。
// OFF: localStorage v292SaveExportOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix291:saveexport]';
  if (window.__v292Dfix291) return;
  window.__v292Dfix291 = true;

  var rawGet = Storage.prototype.getItem.bind(localStorage);
  var rawSet = Storage.prototype.setItem.bind(localStorage);
  var rawKey = Storage.prototype.key.bind(localStorage);

  function snapshot(){
    var data = {}, n = localStorage.length;
    for (var i = 0; i < n; i++){ var k = rawKey(i); if (k == null) continue; data[k] = rawGet(k); }
    return data;
  }
  function pad(x){ return (x < 10 ? '0' : '') + x; }
  function stamp(){ var d = new Date(); return '' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }

  function exportAll(){
    try {
      var data = snapshot(), keys = Object.keys(data);
      var hasKey = keys.some(function(k){ return /key|Key/.test(k); });
      var payload = { __chronicleBackup: 1, kind: 'full', savedAt: new Date().toISOString(), count: keys.length, data: data };
      var json = JSON.stringify(payload), sizeKB = Math.round(json.length / 1024);
      var msg = '【端末まるごと書き出し】\n全スロットの物語・キャラ・アイコン・設定をまとめて書き出します（' + keys.length + '項目 / 約' + sizeKB + 'KB）。\n別の端末で「まるごと読込」すると同じ続きを遊べます。' + (hasKey ? '\n\n⚠ APIキーも含まれます。他人と共有しないでください。' : '') + '\n\nダウンロードしますか？';
      if (!confirm(msg)) return;
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'chronicle-full-' + stamp() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch(e){} }, 1000);
      setTimeout(function(){ try { if (/iP(hone|ad|od)/.test(navigator.userAgent)){ var w = window.open(url, '_blank'); if (!w) alert('ダウンロードが始まらない場合は、ポップアップを許可するか、PCで書き出してください。'); } } catch(e){} }, 1200);
      try { console.log(TAG, 'exported', keys.length, 'keys', sizeKB + 'KB'); } catch(e){}
    } catch(e){ alert('書き出しに失敗しました: ' + (e && e.message)); }
  }

  function importAll(file){
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var obj = JSON.parse(String(reader.result || '{}'));
        var data = obj && obj.data ? obj.data : obj;
        if (!data || typeof data !== 'object') throw new Error('形式が不正です');
        var keys = Object.keys(data);
        if (!keys.length) throw new Error('データが空です');
        if (obj && obj._meta && !obj.__chronicleBackup){
          if (!confirm('このファイルは「現在スロットのエクスポート（物語だけ）」のようです。\nここは“まるごと読込”です。スロット単位の取込は各スロットの「JSON取込」を使ってください。\n\nそれでもまるごと読み込みますか？')) return;
        }
        if (!confirm('【まるごと読み込み】\n今このブラウザにある物語・設定がすべて上書きされます（' + keys.length + '項目）。\n先に現在のデータを書き出しておくのがおすすめです。\n\n続けますか？')) return;
        try { localStorage.clear(); } catch(e){}
        keys.forEach(function(k){ try { rawSet(k, data[k]); } catch(e){} });
        alert('読み込みました。ページを再読み込みします。');
        location.reload();
      } catch(e){ alert('読み込みに失敗しました: ' + (e && e.message)); }
    };
    reader.onerror = function(){ alert('ファイルの読み取りに失敗しました。'); };
    reader.readAsText(file);
  }

  function triggerImport(){
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json'; inp.style.display = 'none';
    inp.addEventListener('change', function(){ var f = inp.files && inp.files[0]; importAll(f); try { document.body.removeChild(inp); } catch(e){} });
    document.body.appendChild(inp); inp.click();
  }

  function integrate(modal){
    try {
      if (localStorage.getItem('v292SaveExportOff') === '1') return;
      if (!modal || modal.querySelector('#v292-migrate')) return;
      var tb = modal.querySelector('.v30-toolbar');
      if (!tb) return;
      var ex = document.createElement('button');
      ex.id = 'v292-migrate'; ex.className = 'v30-btn'; ex.textContent = '📦 端末まるごと書出';
      ex.title = '全スロット＋アイコン＋設定をまとめて1ファイルに書き出し（別端末への移行・完全バックアップ）。';
      ex.addEventListener('click', exportAll);
      var im = document.createElement('button');
      im.className = 'v30-btn'; im.textContent = '📥 まるごと読込';
      im.title = '「端末まるごと書出」で作ったファイルから全データを復元（上書き）';
      im.addEventListener('click', triggerImport);
      var ref = tb.querySelector('[data-act="export-current"]');
      if (ref){ tb.insertBefore(ex, ref.nextSibling); tb.insertBefore(im, ex.nextSibling); }
      else { tb.insertBefore(ex, tb.firstChild); tb.insertBefore(im, ex.nextSibling); }
      try { console.log(TAG, 'integrated into save modal'); } catch(e){}
    } catch(e){}
  }

  try {
    new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++){
        var ad = muts[i].addedNodes || [];
        for (var k = 0; k < ad.length; k++){
          var n = ad[k];
          if (n && n.nodeType === 1){
            var modal = (n.classList && n.classList.contains('v30-modal')) ? n : (n.querySelector ? n.querySelector('.v30-modal') : null);
            if (modal) integrate(modal);
          }
        }
      }
    }).observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e){}
  try { var m0 = document.querySelector('.v30-modal'); if (m0) integrate(m0); } catch(e){}

  window.__v292SaveExport = { exportAll: exportAll, importAll: importAll, snapshot: snapshot, integrate: integrate };
  try { console.log(TAG, 'loaded (fix294)'); } catch(e){}
})();
