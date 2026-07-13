// =====================================================================
// Chronicle TRPG - v292Dfix199b: AIアイコンを課金版APIで生成（seed固定・キャラ単位統一）
// ★fix400(2026-07-07): applyOneにサーバーURL優先を追加(window.__v292Dfix400連携)。iOS IDB回避の根本対策。OFF/ns未取得なら従来通り。
// ★fix403(2026-07-10): ↻再生成の根治。①このセッションで作った新画像(cache=data:)はサーバーURLより優先表示
//   (fix400のサーバー優先が新画像を隠す分断の解消。サーバー側はfix402が自動アップ→次回ロードから配信で一致)
//   ②明示的な↻はレシピの見た目文+【新しいseed】で本当に作り直す(自動経路は従来どおり同seed=誤再生成保護は維持)
//   ③作り直し成功時はレシピ(v292avrec_)のseedも更新(復元/画風切替で旧絵に戻らないように)。OFF=v292Dfix403Off='1'。
// ★fix411(2026-07-10深夜): サーバー未反映のローカル新画像(fix402のpending台帳あり)はサーバーURLより
//   優先表示=「再生成→リロードで旧画像に戻る」の根治(putimg失敗/取りこぼし中でも新画像を見せ続ける)。
// ★fix412(2026-07-10深夜): 明示↻のプロンプトを「現在のキャラ設定(cast desc/ロスターappr)+世界観(tone/lore)」
//   から組み直す(固定レシピ文の使い回しをやめる)。画風PREFIXはfix338がfetch層で自動付与。
//   OFF=v292Dfix412Off='1'(従来=レシピ文+新seed)。
// ★fix424(2026-07-12): 会話ログとキャラ一覧でアイコンが別になる根治。keyFor()の手前で呼称→正名の
//   名寄せ(cast登録名へ末尾/先頭一致・一意なときだけ振替)。alt="澪"とcast"白石澪"が同一キーになる。
//   OFF=v292Dfix424Off='1'。
// ★fix403b(2026-07-10): キャラ一覧の↻根治。regenForでレシピ(v292avrec_)があれば carrier(legacy URL)を
//   待たずに直接生成キューへ積む(従来はモーダルのimgにcarrierが無くjobInfo.promptが埋まらず永遠に生成が始まらなかった)。
// ---------------------------------------------------------------------
// fix199 からの改良（おしんFB: 場所ごとに絵が違う／絵柄が前と違う）:
//   ・キャッシュを【キャラ名＋画風】単位に統一 → 会話ログ/設定/キャラ一覧で同じ1枚を共有。
//     （旧実装はプロンプト文字列単位 → 場所ごとに微妙に違う文言で別画像になっていた）
//   ・legacy URL の seed をそのまま API に渡す（実測: /v1/images は seed を尊重し
//     同seed=同一画像）。旧アイコンは seed=hash(name) で生成されていたので、
//     同プロンプト+同seed で以前の絵柄が再現される見込み。
//   ・キャッシュ接頭辞を v292av2_ に変更（seed無しで生成された旧世代を破棄）。
//   ・↻再生成ボタン / 🖌画風切替で再生成されるよう配線。
//
// 基本構造（fix199と同じ）:
//   課金版API gen.pollinations.ai/v1/images/generations（枠制限なし・b64返却）を
//   1枚ずつ直列で fetch → data:URL を img へ。localStorage キャッシュで再生成なし
//   （各キャラ1回 ~0.0011 pollen）。キー無し/失敗は DiceBear。legacy <img> は読ませない。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix199b:avatar-api]';
  var DICE_STYLE = 'lorelei';
  var API = 'https://gen.pollinations.ai/v1/images/generations';
  var LS_PREFIX = 'v292av2_';

  function getS(){ try{ return window.S || (0,eval)('S'); }catch(e){ return null; } }
  function pollKey(){ try{ var S=getS(); var k=(S&&S.cfg&&S.cfg.pollKey)||''; return String(k).trim(); }catch(e){ return ''; } }
  function artStyle(){ try{ var S=getS(); return String((S&&S.cfg&&S.cfg.artStyle)!=null ? S.cfg.artStyle : 0); }catch(e){ return '0'; } }
  function diceUrl(name){ return 'https://api.dicebear.com/9.x/' + DICE_STYLE + '/svg?seed=' + encodeURIComponent(String(name||'character')); }
  function isSquareAvatar(src){ var m=/[?&]width=(\d+)&height=(\d+)/.exec(src); if(!m) return true; return m[1]===m[2]; }

  function promptOf(src){ var m=/\/prompt\/([^?]+)/.exec(src); try{ return m?decodeURIComponent(m[1]):''; }catch(e){ return m?m[1]:''; } }
  function modelOf(src){ var m=/[?&]model=([^&]+)/.exec(src); return m?m[1]:'flux'; }
  function seedOf(src){ var m=/[?&]seed=(\d+)/.exec(src); return m? +m[1] : null; }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }

  // ===== ★fix424(2026-07-12): 呼称→正名の名寄せ（会話ログとキャラ一覧でアイコンが別になる根治） =====
  //   真因: keyFor()が「話者名の文字列そのもの」からキーを作るため、会話ログの alt="澪"（本文中の
  //     呼び名）と キャラ一覧の "白石澪"（cast登録名）が【別キー】になり、別画像として生成・
  //     キャッシュされていた（本ファイル冒頭の「場所が違っても同キャラは同じ1枚」という設計意図の穴）。
  //   修正: キーを作る前に cast(hero+npcs) の登録名へ寄せる。
  //     条件（fix409 resolveCanon と同じ思想＝誤統合を避ける）:
  //       ・2文字以上 ・cast名そのものなら不触 ・cast名の末尾or先頭に完全一致 ・【一意なときだけ】振替
  //     曖昧（複数一致）なら振替しない。cast外の存在（怪異・ロスターのみの呼称）も不触。
  //   OFF: localStorage v292Dfix424Off='1'（従来の素の文字列キーへ復帰）
  //   注: 旧キー（"澪"由来）の画像は孤児になるが破棄はしない（データ損失なし・不要になるだけ）。
  var _c424 = { at: 0, names: [], map: {} };
  function off424(){ try{ return localStorage.getItem('v292Dfix424Off') === '1'; }catch(e){ return false; } }
  function castNames424(){
    var out = [];
    try{
      var S = getS(); if(!S || !S.cast) return out;
      var h = S.cast.hero;
      if (h && h.name) out.push(String(h.name).trim());
      var ns = S.cast.npcs || [];
      for (var i=0; i<ns.length; i++){ if (ns[i] && ns[i].name) out.push(String(ns[i].name).trim()); }
    }catch(e){}
    return out.filter(function(x){ return !!x; });
  }
  // 1字の呼称は日本語の下の名前として実在する（澪・蓮・葵…）ので許可するが、
  //   一般名詞（「男」「女」等）が cast名の末尾に含まれる場合（例:「顔のない男」）の誤統合を防ぐ。
  var GENERIC424 = { '男':1,'女':1,'人':1,'子':1,'声':1,'影':1,'者':1,'客':1,'僕':1,'私':1,'俺':1 };
  function canonName(name){
    var who = String(name||'').trim();
    if (!who || off424()) return String(name||'');
    if (GENERIC424[who]) return who;                // 一般名詞は不触（誤統合防止）
    // キャッシュ（keyForはsweepで毎周期・全img分呼ばれるため）: cast署名が変わるまで再利用
    var now = Date.now();
    if (now - _c424.at > 1000){
      _c424.at = now;
      var ns = castNames424(), sig = ns.join('\u0001');
      if (sig !== _c424.sig){ _c424.sig = sig; _c424.names = ns; _c424.map = {}; }
    }
    if (Object.prototype.hasOwnProperty.call(_c424.map, who)) return _c424.map[who];
    var names = _c424.names, res = who;
    /* ★v292Dfix456(2026-07-13): 空白ゆれの吸収。
     *   モデルは「桐生 悠真」を「桐生悠真」と空白なしで書くことが多い（実測: 24T中 who に
     *   両表記が混在）。旧の前方/後方一致では中央に空白があると一致せず、**同一人物が
     *   2人に分裂**（アイコンが2枚・話者帰属が乱れる）。空白だけの差は同一人物と断定できる。
     *   OFF: localStorage v292Dfix456Off='1' */
    try {
      if (localStorage.getItem('v292Dfix456Off') !== '1'){
        var ws = /[\s\u3000]/g;
        var w0 = who.replace(ws, '');
        for (var q = 0; q < names.length; q++){
          if (names[q] !== who && names[q].replace(ws, '') === w0){ _c424.map[who] = names[q]; return names[q]; }
        }
      }
    } catch(e){}
    var exact = false, matches = [];
    for (var i=0; i<names.length; i++){
      var n = names[i];
      if (n === who){ exact = true; break; }        // 既に正名＝不触
      if (n.length <= who.length) continue;
      var suf = (n.slice(n.length - who.length) === who);              // 末尾一致（下の名前呼び: 澪→白石澪）
      var pre = (who.length >= 2) && (n.slice(0, who.length) === who); // 先頭一致（姓呼び: 中島→中島ゆか）※2字以上のみ
      if (suf || pre) matches.push(n);
    }
    if (!exact && matches.length === 1) res = matches[0];   // 一意なときだけ振替（曖昧は見送り）
    _c424.map[who] = res;
    return res;
  }

  // キャッシュキー＝キャラ名（正名へ名寄せ）＋画風（場所が違っても同キャラは同じ1枚）
  function keyFor(name){ return 'n' + hash(canonName(name) + '|' + artStyle()); }

  function persistGet(pk){ try{ return localStorage.getItem(LS_PREFIX+pk); }catch(e){ return null; } }
  function persistSet(pk,v){ try{ localStorage.setItem(LS_PREFIX+pk, v); }catch(e){} }
  function persistDel(pk){ try{ localStorage.removeItem(LS_PREFIX+pk); }catch(e){} }

  function b64ToDataUrl(b64){
    var mime='image/png';
    if(b64.charAt(0)==='/') mime='image/jpeg';
    else if(b64.slice(0,5)==='iVBOR') mime='image/png';
    else if(b64.slice(0,6)==='R0lGOD') mime='image/gif';
    else if(b64.slice(0,4)==='UklG') mime='image/webp';
    return 'data:'+mime+';base64,'+b64;
  }

  var cache = {};     // pk -> dataURL / 'pending' / 'dice'
  var freshSeed403 = {};   // ★fix403: 明示↻されたpk(次の生成だけ新seed)
  var regenPrev = {};      // ★fix197 H-3(2026-07-11): 明示↻直前の旧画像(生成失敗時の復元用)
  var jobInfo = {};   // pk -> {prompt, model, seed, name}
  var queue = [];
  var active = 0;

  // ★fix412: 明示↻用プロンプト合成=「現在のキャラ設定+世界観」。設定が無ければ''(従来のレシピ文へ)。
  // ★fix412正規化(2026-07-11): 素材の優先順位を ①ロスターappr ②cast descの外見節 ③desc短縮 の順に。
  //   descの先頭にキャラ名そのものや「外見:」「外見：」ラベルが付いていたら剥がす。
  // ★fix197 H-2(2026-07-11): 素材合成の本体をスイッチ非依存の buildCurrentAppearancePrompt に分離。
  //   fix403c(レシピ無し↻)はこれを直接使う=v292Dfix412Off でも403cは生きる。
  function buildCurrentAppearancePrompt(name){
    try{
      if (!name) return '';
      var S=null; try{ S=window.S||(0,eval)('typeof S!=="undefined"?S:null'); }catch(e){}
      function stripLabel(t){
        t=String(t||'').trim();
        if (name){ var re=new RegExp('^\\s*'+String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[：:はがのを、,]?\\s*'); t=t.replace(re,''); }
        t=t.replace(/^\s*(外見|容姿|見た目|姿|ルックス)\s*[：:]\s*/,'');
        return t.trim();
      }
      var desc='';
      // ① ロスターappr(外見に特化した自動抽出=portrait素材として最優先)
      try{ var ro=(window.__v292Dfix307api&&window.__v292Dfix307api.loadRoster())||[]; for(var j=0;j<ro.length;j++){ if(ro[j]&&ro[j].handle===name){ desc=String(ro[j].appr||''); break; } } }catch(e){}
      // ②/③ cast desc(②外見節を優先抽出・無ければ③desc全体を短縮)
      if (!desc && S && S.cast){
        var cdesc='';
        if (S.cast.hero && S.cast.hero.name===name) cdesc=String(S.cast.hero.desc||'');
        if (!cdesc){ var ns=S.cast.npcs||[]; for(var i=0;i<ns.length;i++){ if(ns[i]&&ns[i].name===name){ cdesc=String(ns[i].desc||''); break; } } }
        if (cdesc){
          var mSec=cdesc.match(/(?:外見|容姿|見た目|ルックス)\s*[：:]\s*([^\n。]+)/);
          desc = mSec ? mSec[1] : cdesc;   // 外見節が無ければdesc全体(下で短縮)
        }
      }
      if (!desc) return '';
      desc=stripLabel(desc);
      desc=desc.replace(/【[^】]*】/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
      if (!desc) return '';
      var world='';
      try{ if(S&&S.scene){ var tone=String(S.scene.tone||'').trim(); var lore=String(S.scene.lore||'').replace(/【[^】]*】/g,' ').replace(/\s+/g,' ').trim().slice(0,60); world=[tone,lore].filter(Boolean).join('、'); } }catch(e){}
      // ★fix421: 性別トークン(男性キャラが女性で生成される問題の根治)。
      //   ①S.cast[].gender(fix366と同じ正)→②desc語彙から推定→③不明なら付けない
      var gen421='';
      try{
        if (S && S.cast){
          if (S.cast.hero && S.cast.hero.name===name) gen421=String(S.cast.hero.gender||'');
          if (!gen421){ var ns421=S.cast.npcs||[]; for(var g4=0;g4<ns421.length;g4++){ if(ns421[g4]&&ns421[g4].name===name){ gen421=String(ns421[g4].gender||''); break; } } }
        }
      }catch(e){}
      if (gen421!=='男性' && gen421!=='女性'){
        var fH421=(desc.match(/(少女|娘|女性|彼女(?!ら)|巫女|シスター|王女|魔女|美女|老婆)/g)||[]).length;
        var mH421=(desc.match(/(少年|青年|男性|男子|王子|老人|紳士|髭|彼(?!女)|息子|父親|兄|弟)/g)||[]).length;
        if (mH421>fH421) gen421='男性'; else if (fH421>mH421) gen421='女性';
      }
      var gtok421 = gen421==='男性' ? ', male, 1boy, handsome man' : (gen421==='女性' ? ', female, 1girl' : '');
      return name+', '+desc+(world?('、世界観: '+world):'')+gtok421+', portrait';
    }catch(e){ return ''; }
  }

  // ★fix412ラッパ: v292Dfix412Off==='1' なら''(従来=レシピ文+新seedへ)。それ以外は素材合成本体へ委譲。
  function buildPrompt412(name){
    try{ if (localStorage.getItem('v292Dfix412Off')==='1') return ''; }catch(e){}
    return buildCurrentAppearancePrompt(name);
  }

  // ★fix197 F-2/F-3(2026-07-11): 明示↻の旧画像復元を1関数に集約。
  //   regenPrev[pk]があればcache/persistへ復元(DiceBearに落とさない)、無ければ'dice'。
  //   最後に必ずregenPrev[pk]を掃除(復元は1回限り)。3経路(APIキーなし早期return・
  //   GEN_BUDGET到達・生成失敗catch)すべてでこれを通す。
  function restorePreviousOrDice(pk){
    try {
      if (regenPrev[pk]){ cache[pk]=regenPrev[pk]; try{ persistSet(pk, regenPrev[pk]); }catch(e){} }
      else { cache[pk]='dice'; }
    } catch(e){ try{ cache[pk]='dice'; }catch(_){} }
    try { delete regenPrev[pk]; } catch(e){}
  }
  function genOne(pk){
    var info = jobInfo[pk] || {};
    var key = pollKey();
    if(!key){ restorePreviousOrDice(pk); active--; applyAll(); pump(); return; }   // ★fix197 F-2: キー無しでも明示↻の旧画像を保持
    var body = { model: info.model||'flux', prompt: info.prompt||'portrait', n:1, size:'384x384' };
    if(info.seed != null) body.seed = info.seed;   // 同seed＝同一画像（旧絵柄の再現）
    var fresh403 = false;   // ★fix403: 明示↻は「レシピの見た目文＋新seed」で本当に作り直す
    if (freshSeed403[pk]) {
      delete freshSeed403[pk];
      fresh403 = true;
      try { var rec403 = JSON.parse(localStorage.getItem('v292avrec_'+pk) || 'null'); if (rec403 && rec403.p) { body.prompt = rec403.p; if (rec403.m) body.model = rec403.m; } } catch(e){}
      try { var p412 = buildPrompt412(info.name||''); if (p412) body.prompt = p412; } catch(e){}   // ★fix412: 現在の設定+世界観を優先
      body.seed = Math.floor(Math.random()*1000000000);
    }
    fetch(API, { method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ if(!r.ok) throw r.status; return r.json(); })
      .then(function(j){ var b=j&&j.data&&j.data[0]&&j.data[0].b64_json; if(!b) throw 'nob64';
        var d=b64ToDataUrl(b); cache[pk]=d; persistSet(pk,d);
        // ★fix403: 作り直し成功→レシピのseed/prompt/modelを実際に使った値へ(復元で旧絵に戻さない)
        try { if (fresh403) { var rk403='v292avrec_'+pk, ro403=JSON.parse(localStorage.getItem(rk403)||'null'); if (ro403) { ro403.s=body.seed; ro403.p=body.prompt; ro403.m=body.model; localStorage.setItem(rk403, JSON.stringify(ro403)); } else { localStorage.setItem(rk403, JSON.stringify({ s:body.seed, p:body.prompt, m:body.model })); } } } catch(e){} })  // ★fix403c: レシピ未存在なら初回レシピを新規保存(復元/画風切替で新絵を保持)
      .catch(function(){
        // ★fix197 F-2: 明示↻の生成失敗時は共通関数で旧画像へ復元(DiceBearに落とさない)
        restorePreviousOrDice(pk);
      })
      .then(function(){ delete regenPrev[pk]; active--; applyAll(); pump(); });   // 成功時のregenPrev掃除も維持(二重deleteは無害)
  }
  // v292Dfix199f: 暴走防止の遮断器。生成は直列・最小間隔つき・セッション上限あり。
  //   万一どこかが無限再生成ループに陥っても、上限で自動停止して DiceBear に退避し、
  //   pollen を燃やし続けない（嵐クラスの不具合の最終ブレーキ）。
  var GEN_BUDGET = 15;      // 1ページセッションの生成上限（通常はキャラ数回で足りる）
  var MIN_INTERVAL = 1500;  // 生成と生成の最小間隔(ms)
  var genCount = 0, lastGenAt = 0, pumpTimer = null;
  function pump(){
    if(active >= 1 || !queue.length || pumpTimer) return;
    if(genCount >= GEN_BUDGET){
      while(queue.length){ var pkx = queue.shift(); if(cache[pkx]==='pending') restorePreviousOrDice(pkx); }   // ★fix197 F-3: 上限到達でも明示↻の旧画像を保持
      try{ console.warn(TAG, 'generation budget ('+GEN_BUDGET+') exceeded — DiceBearに退避（暴走防止）'); }catch(e){}
      applyAll(); return;
    }
    var pk = queue.shift();
    if(cache[pk] !== 'pending'){ pump(); return; }
    active++;
    var wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastGenAt));
    pumpTimer = setTimeout(function(){ pumpTimer = null; lastGenAt = Date.now(); genCount++; genOne(pk); }, wait);
  }

  function applyOne(img){
    var pk = img.getAttribute('data-avpk'); if(!pk) return;
    var info = jobInfo[pk] || {}; var name = info.name || img.getAttribute('alt') || 'character';
    // ★fix400: サーバーURL優先(iOSのIndexedDB地雷を回避)。fix400が有効かつns取得済み・当imgが未失敗なら
    //   <img src>=配信URL。読めなければonerrorで従来のローカル表示(cache/DiceBear)へ後方互換フォールバック。
    try {
      var f400 = window.__v292Dfix400;
      // ★fix403: このセッションで作った新画像(cache=data:)はサーバーURLより優先(↻の結果が即見える)
      var fresh403v = (typeof cache[pk]==='string' && cache[pk].indexOf('data:')===0) && (function(){ try { return localStorage.getItem('v292Dfix403Off')!=='1'; } catch(e){ return true; } })();
      // ★fix411: サーバー未反映のローカル新画像(pending台帳)もサーバーURLより優先(リロード後の巻き戻り防止)
      if (!fresh403v) { try { if (localStorage.getItem('v292Dfix411Off')!=='1'){ var pm411=JSON.parse(localStorage.getItem('v292Dfix402_pimg')||'{}'); if (pm411 && pm411[LS_PREFIX+pk]) { var pe411=persistGet(pk); if (pe411 && pe411.indexOf('data:')===0){ cache[pk]=pe411; fresh403v=true; } } } } catch(e){} }
      if (f400 && f400.enabled() && !img.__av400fail && !fresh403v) {
        var ss = f400.urlFor(pk);
        if (ss) {
          if (img.getAttribute('src') !== ss) {
            img.onerror = function(){ this.onerror = null; this.__av400fail = 1; try { var nm2 = this.getAttribute('alt') || (jobInfo[pk] && jobInfo[pk].name) || 'character'; var loc2 = cache[pk]; if (!(typeof loc2 === 'string' && loc2.indexOf('data:') === 0)) { var pe2 = persistGet(pk); loc2 = (pe2 && pe2.indexOf('data:') === 0) ? pe2 : ''; } this.src = loc2 || diceUrl(nm2); } catch(e){} };  // ★fix400c: 生成経路に落とさずローカル(cache/persist)→DiceBearへ。再生成による絵柄変化を防止。
            img.src = ss;
          }
          return;
        }
      }
    } catch(e){}
    var c = cache[pk];
    if(typeof c==='string' && c.indexOf('data:')===0){ if(img.getAttribute('src')!==c){ img.onerror=null; img.src=c; } return; }
    if(c==='dice'){ var d=diceUrl(name); if(img.getAttribute('src')!==d){ img.onerror=null; img.src=d; } return; }
    if(c!=='pending'){
      var pe=persistGet(pk);
      if(pe && pe.indexOf('data:')===0){ cache[pk]=pe; if(img.getAttribute('src')!==pe){ img.onerror=null; img.src=pe; } return; }
      if(info.prompt){ cache[pk]='pending'; queue.push(pk); pump(); }  // promptが無いキーは生成しない（legacy URL待ち）
    }
    // pending中: legacy pollinations を読ませない（DiceBearを仮表示）
    var dp=diceUrl(name);
    var cur=img.getAttribute('src')||'';
    if(cur.indexOf('image.pollinations.ai')>=0 || !cur){ img.onerror=null; img.src=dp; }
  }

  function fixImg(img){
    var src = img.getAttribute('src') || '';
    // v292Dfix209: legacy URLは src でなく data-av-legacy 属性でも運べる（ブラウザにfetchさせず
    //   プロンプト/seedだけ受け取る＝ロード時402の根絶。書き手側はfix66 buildCard等）。
    var legacy209 = img.getAttribute('data-av-legacy') || '';
    var carrier = (src.indexOf('image.pollinations.ai') >= 0) ? src
                : (legacy209.indexOf('image.pollinations.ai') >= 0 ? legacy209 : '');
    // v292Dfix199c: 会話ログはimg要素を使い回すため、altが変わったらタグを付け替える
    //   （旧: ミリアのタグが残ったimgがカエデに再利用され、カエデのカードにミリアの絵が出た）
    var alt0 = img.getAttribute('alt') || '';
    var pk0 = img.getAttribute('data-avpk');
    if(pk0 && alt0){
      var expect = keyFor(alt0);
      if(pk0 !== expect){
        img.setAttribute('data-avpk', expect);
        if(!jobInfo[expect]){
          if(carrier && isSquareAvatar(carrier)){
            jobInfo[expect] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: alt0 };
          } else {
            jobInfo[expect] = { name: alt0 };   // prompt未取得: legacy URL が来るまで生成しない
          }
        }
      }
    }
    if(img.getAttribute('data-avpk')){
      // v292Dfix199f: 「プロンプト変化で自動再生成」は廃止。
      //   主人公アバターは2系統のコードが【別々のプロンプト】を出すため、自動再生成が
      //   A↔Bの無限ループになり（点滅・402嵐・pollen消費）危険だった。
      //   説明変更後の作り直しは ↻ボタン（regenFor）だけで行う。
      applyOne(img); return;
    }
    if(!carrier) return;
    if(!isSquareAvatar(carrier)) return;
    var name = img.getAttribute('alt') || 'character';
    var pk = keyFor(name);
    if(!jobInfo[pk]) jobInfo[pk] = { prompt: promptOf(carrier), model: modelOf(carrier), seed: seedOf(carrier), name: name };
    img.setAttribute('data-avpk', pk);
    applyOne(img);
  }

  function applyAll(){
    try{ var imgs=document.getElementsByTagName('img'); for(var i=0;i<imgs.length;i++){ if(imgs[i].getAttribute('data-avpk')) applyOne(imgs[i]); } }catch(e){}
    // ★fix421: 会話ログのアバター(src焼き込み・data-avpk無し)にも再生成結果を即時反映。
    //   条件を「ログカード内のimg+alt一致+cacheに新data:URLあり」に絞り、他モジュールの画像に触れない。
    try{
      var logs=document.querySelectorAll('.v292-dlg-card img[alt], .dlg-av img[alt]');
      for(var L=0; L<logs.length; L++){
        var im=logs[L]; if (im.getAttribute('data-avpk')) continue;
        var al=im.getAttribute('alt')||''; if(!al) continue;
        var pkL=keyFor(al); var cv=cache[pkL];
        if (cv && typeof cv==='string' && cv.indexOf('data:')===0 && im.src!==cv) im.src=cv;
      }
    }catch(e){}
  }
  var lastStyle = artStyle();
  function sweep(){
    try{
      // 🖌画風が変わったら、タグを外して features.js に新styleのURLを再適用させる（新キーで再生成）
      var st = artStyle();
      if(st !== lastStyle){
        lastStyle = st;
        var tagged=document.querySelectorAll('img[data-avpk]');
        for(var t=0;t<tagged.length;t++){ tagged[t].removeAttribute('data-avpk'); try{ tagged[t].src=''; }catch(e){} }
      }
      var imgs=document.getElementsByTagName('img');
      for(var i=0;i<imgs.length;i++) fixImg(imgs[i]);
    }catch(e){}
  }

  // ↻ 再生成: features.js と同じクリック検知で、このキャラのキャッシュを破棄して作り直す
  function regenFor(name){
    if(!name) return;
    var pk=keyFor(name);
    try { if (localStorage.getItem('v292Dfix403Off')!=='1') freshSeed403[pk]=1; } catch(e){}   // ★fix403: 明示↻は新seed
    var rec=null; try { rec=JSON.parse(localStorage.getItem('v292avrec_'+pk)||'null'); } catch(e){}  // ★fix403b: レシピ取得
    // ★fix197 H-3(2026-07-11): 旧画像を生成成功まで保持(生成失敗時に復元)。persistDelは即時に行わない。
    try { var _pv=persistGet(pk); if(_pv && _pv.indexOf('data:')===0) regenPrev[pk]=_pv; } catch(e){}
    delete cache[pk]; delete jobInfo[pk];
    if (rec && rec.p && localStorage.getItem('v292Dfix403Off')!=='1') {
      // ★fix403b: レシピがあればcarrier(legacy URL)を待たずに直接生成キューへ(キャラ一覧からの↻の根治)
      jobInfo[pk] = { prompt: rec.p, model: rec.m||'flux', seed: (rec.s!=null?rec.s:null), name: name };
      cache[pk] = 'pending'; queue.push(pk); pump();
      return;   // imgのdata-avpk/srcは触らない(生成完了時のapplyAllが差し替える。fix403で新画像がサーバーURLより優先表示)
    }
    // ★fix403c(2026-07-11): レシピが無いキャラの一覧↻。buildPrompt412で現在のキャラ設定+世界観から
    //   プロンプトを合成できたら、carrier(legacy URL)を待たず直接生成キューへ(新seed=先頭で立てたfreshSeed403)。
    //   成功時 genOne が初回レシピ(v292avrec_)を新規保存する。OFF=v292Dfix403cOff='1'(=従来どおりcarrier待ちで不発)。
    if (localStorage.getItem('v292Dfix403Off')!=='1' && localStorage.getItem('v292Dfix403cOff')!=='1') {   // ★fix197 H-1: 親(403)OFFで子(403c)も止める
      var p412c=''; try { p412c=buildCurrentAppearancePrompt(name)||''; } catch(e){}   // ★fix197 H-2: 412Offでも403cは生きる(素材合成本体を直接)
      if (p412c) {
        jobInfo[pk] = { prompt: p412c, model: 'flux', seed: null, name: name };
        cache[pk] = 'pending'; queue.push(pk); pump();
        return;
      }
    }
    // ★fix197 H-3: 生成しない経路(carrier待ち=不発)は旧挙動どおり旧画像を破棄。
    try { persistDel(pk); delete regenPrev[pk]; } catch(e){}
    // レシピが無くbuildCurrentAppearancePromptも空: 従来どおりimgのdata-avpk除去+src=''(carrier待ち=不発)
    try{
      var imgs=document.querySelectorAll('img[data-avpk]');
      for(var i=0;i<imgs.length;i++){ if((imgs[i].getAttribute('alt')||'')===name){ imgs[i].removeAttribute('data-avpk'); try{ imgs[i].src=''; }catch(e){} } }
    }catch(e){}
  }
  try{
    document.addEventListener('click', function(ev){
      try{
        var t=ev.target; if(!t||!t.closest) return;
        var probe=t.closest('button,[role="button"],a')||t;
        var txt=(probe.textContent||'')+' '+((probe.getAttribute&&(probe.getAttribute('title')||probe.getAttribute('aria-label')))||'');
        if(txt.length>40) return;
        if(!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card=t.closest('.npc-card')||t.closest('.v100-clean')||t.closest('[class*="card"]')||t.parentNode;
        var nm=''; var img=card&&card.querySelector?card.querySelector('img[alt]'):null;
        if(img) nm=(img.getAttribute('alt')||'').trim();
        if(!nm&&card&&card.querySelector){ var ni=card.querySelector('input[type="text"]'); if(ni) nm=(ni.value||'').trim(); }
        if(nm) setTimeout(function(){ regenFor(nm); }, 300);
      }catch(e){}
    }, true);
  }catch(e){}

  function start(){
    try{
      var obs=new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){ var m=muts[i];
          if(m.type==='attributes' && m.target && m.target.tagName==='IMG'){ fixImg(m.target); }
          else if(m.addedNodes && m.addedNodes.length){ sweep(); }
        }
      });
      obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
      window.__v292Dfix199Observer=obs;
    }catch(e){}
    setInterval(sweep, 1500);
    sweep();
    try{ console.log(TAG,'loaded (pollKey='+(pollKey()?'set':'none')+', style='+artStyle()+')'); }catch(_){}
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', start); } else { start(); }

  window.__v292Dfix197 = { sweep: sweep, fixImg: fixImg, diceUrl: diceUrl, pollKey: pollKey, regenFor: regenFor, buildPrompt412: buildPrompt412, buildCurrentAppearancePrompt: buildCurrentAppearancePrompt, restorePreviousOrDice: restorePreviousOrDice,
    // v292Dfix209: 書き手(fix66等)が初期srcに使うキャッシュ済みdata:URLの取得口
    keyFor: keyFor,
    canonName: canonName,   // ★fix424: 検証口(呼称→正名)
    __test_state: function(name){ try{ var pk=keyFor(name); var c=cache[pk]; return { pk:pk, pending:(c==='pending'), dice:(c==='dice'), dataUrl:(typeof c==='string'&&c.indexOf('data:')===0), queued:(queue.indexOf(pk)>=0), hasJob:!!jobInfo[pk], jobPrompt:(jobInfo[pk]&&jobInfo[pk].prompt)||'' }; }catch(e){ return null; } },
    cachedFor: function(name){ try{ var pk=keyFor(name); var c=cache[pk]; if(typeof c==='string'&&c.indexOf('data:')===0) return c; var p=persistGet(pk); return (p&&p.indexOf('data:')===0)?p:''; }catch(e){ return ''; } },
    clearCache: function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('v292av')===0) localStorage.removeItem(k); }); }catch(e){} cache={}; jobInfo={}; } };
  window.__v292Dfix199 = window.__v292Dfix197;
})();
