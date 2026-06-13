// =====================================================================
// Chronicle TRPG - v292Dfix291: セーブの書き出し/読み込み(PC↔スマホ データ移行)
// ---------------------------------------------------------------------
// おしんFB「PCのデータをスマホで遊べたり逆もできるように」。
// localStorage 一式(全スロットの物語・cast・cfg・状態・アイコン・カルテ等)を
//   1つのJSONファイルに書き出し / 読み込みで丸ごと復元できるようにする。
//   ・トップバーに「💾移行」を追加 → [📤書き出し] [📥読み込み]
//   ・書き出し: chronicle-backup-YYYYMMDD-HHMM.json をダウンロード
//   ・読み込み: ファイル選択 → 確認 → 復元 → リロード
//   ・重要: fix246がlocalStorage.get/setをスロット接尾辞へリダイレクトするため、
//     生の Storage.prototype を使って「キー名そのまま」で読み書きする(ズレ防止)。
//   ・APIキーも含まれるので書き出し時に注意を表示。
// OFF: localStorage v292SaveExportOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix291:saveexport]';
  if (window.__v292Dfix291) return;
  window.__v292Dfix291 = true;

  // fix246ラッパを回避する生アクセス
  var rawGet = Storage.prototype.getItem.bind(localStorage);
  var rawSet = Storage.prototype.setItem.bind(localStorage);
  var rawKey = Storage.prototype.key.bind(localStorage);

  function snapshot(){
    var data = {};
    var n = localStorage.length;
    for (var i = 0; i < n; i++){
      var k = rawKey(i);
      if (k == null) continue;
      data[k] = rawGet(k);
    }
    return data;
  }

  function pad(x){ return (x < 10 ? '0' : '') + x; }
  function stamp(){ var d = new Date(); return '' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); }

  function exportAll(){
    try {
      var data = snapshot();
      var keys = Object.keys(data);
      var hasKey = keys.some(function(k){ return /key|Key/.test(k); });
      var payload = { __chronicleBackup: 1, version: (function(){ try { return rawGet('chr6_active_slot'); } catch(e){ return ''; } })(), savedAt: new Date().toISOString(), count: keys.length, data: data };
      var json = JSON.stringify(payload);
      var sizeKB = Math.round(json.length / 1024);
      var msg = 'セーブを書き出します（' + keys.length + '項目 / 約' + sizeKB + 'KB）。\n\nこのファイルには物語・キャラ・アイコン・設定がすべて含まれます。' + (hasKey ? '\n⚠ APIキーも含まれます。他人と共有しないでください。' : '') + '\n\nダウンロードしますか？';
      if (!confirm(msg)) return;
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'chronicle-backup-' + stamp() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch(e){} }, 1000);
      // iOS Safari等でdownloadが無視される場合の保険: 新タブでJSONを開く
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
        var data = obj && obj.data ? obj.data : obj; // {data:{...}} か 素の{...} 両対応
        if (!data || typeof data !== 'object') throw new Error('形式が不正です');
        var keys = Object.keys(data);
        if (!keys.length) throw new Error('データが空です');
        if (!confirm('読み込むと、今このブラウザにある物語・設定がすべて上書きされます（' + keys.length + '項目）。\n先に現在のデータを書き出しておくことをおすすめします。\n\n続けますか？')) return;
        // 既存を消してから復元(古い残骸が混ざらないように)。ただしOFFフラグ等のUI設定は一応残さず全置換。
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
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.style.display = 'none';
    inp.addEventListener('change', function(){ var f = inp.files && inp.files[0]; importAll(f); try { document.body.removeChild(inp); } catch(e){} });
    document.body.appendChild(inp);
    inp.click();
  }

  function injectUI(){
    try {
      if (localStorage.getItem('v292SaveExportOff') === '1') return;
      var tb = document.getElementById('topbar');
      if (!tb){ setTimeout(injectUI, 600); return; }
      if (document.getElementById('v292-saveexport')) return;
      var span = document.createElement('span');
      span.id = 'v292-saveexport';
      span.style.cssText = 'margin-left:8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;';
      span.title = '💾 データ移行：このブラウザの全データ（物語・キャラ・設定）をファイルに書き出し／読み込み。PCで書き出し→スマホで読み込み（逆も可）で同じ続きを遊べます。';
      var btnCss = 'font-size:11px;padding:3px 7px;background:none;color:var(--dim,#aaa);border:1px solid var(--border,#444);border-radius:6px;cursor:pointer;';
      var out = document.createElement('button'); out.textContent = '📤 書出'; out.style.cssText = btnCss; out.title = 'セーブをファイルに書き出す（バックアップ／別端末へ移行）';
      var inb = document.createElement('button'); inb.textContent = '📥 読込'; inb.style.cssText = btnCss; inb.title = '書き出したファイルから復元する（上書き）';
      out.addEventListener('click', exportAll);
      inb.addEventListener('click', triggerImport);
      var lbl = document.createElement('span'); lbl.textContent = '💾移行'; lbl.style.cssText = 'font-size:10px;color:var(--dim,#888);';
      span.appendChild(lbl); span.appendChild(out); span.appendChild(inb);
      tb.appendChild(span);
      try { console.log(TAG, 'UI injected'); } catch(e){}
    } catch(e){ setTimeout(injectUI, 800); }
  }
  injectUI();

  window.__v292SaveExport = { exportAll: exportAll, importAll: importAll, snapshot: snapshot };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
