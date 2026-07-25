// =====================================================================
// Chronicle TRPG - v292Dfix277: 準登録カルテ + 帰属品質パック (fix277 / 277b / 278)
// 設計: 設計_準登録カルテと帰属品質パック_fix276-279.md (おしん承認 2026-06-12)
// ---------------------------------------------------------------------
// fix277 (準登録カルテ・本丸):
//   未登録キャラが累計3ターン登場(say/react/stateタグのwho + 会話ログwho)したら
//   自動で「準登録」化。新エンジンsysの【各キャラの現在の状態】を後処理し、
//   ・キャストの状態行 = 従来通り無加工
//   ・準登録(直近5ターンに登場)の状態行 = 1人120字に圧縮して保持・合計600字で
//     最終登場が古い順に切る(sys肥大ガード=注入は窓で絞る鉄則)
//   ・それ以外のキャスト外状態行 = 除去(fix77ストアは誰のwhoでも収穫するため、
//     これまでは一度入った未登録キャラの状態が無期限でsysに居座っていた)
//   ・準登録名を列挙し「<say who>/<state who>を必ず出す」許可行を1行追加
//     (モデルが準登録の状態タグを出す→fix77が収穫→カルテが回り出す)
//   保存: localStorage 'v292Dfix277Quasi'+スロット接尾辞 = 物語データと別キー(消しても無傷)
//   OFF: localStorage v292QuasiCastOff='1'
// fix277b (別名の機械可読化):
//   キャラ説明文の「別名: A, B」行をパースし A/B→正名 に名寄せ。
//   ・fix77状態収穫の正規化(別名エントリを正名へマージ)
//   ・会話ログカードの who 正規化(index.html側がwindow.__v292AliasFixを呼ぶ)
//   ・キャラ一覧の別名カードを非表示(表示統合のみ・データは残す)
//   OFF: localStorage v292AliasOff='1'
// fix278 (キャラ一覧アイコンの会話ログ統一):
//   fix145カードのアイコンを、まず会話ログと同じ v292av2_ キャッシュ
//   (fix197 keyFor=名前+画風)から適用。キャッシュ未生成時のみ従来経路。
//   OFF: localStorage v292IconUnifyOff='1'
// ---------------------------------------------------------------------
// 可逆性: 全コンポーネント個別OFFフラグ + データは別キー保存 = ダメなら戻せる。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix277:quasi-pack]';
  if (window.__v292Dfix277Pack) return;
  window.__v292Dfix277Pack = true;

  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function offQ(){ try { return localStorage.getItem('v292QuasiCastOff') === '1'; } catch(e){ return false; } }
  function offA(){ try { return localStorage.getItem('v292AliasOff') === '1'; } catch(e){ return false; } }
  function offI(){ try { return localStorage.getItem('v292IconUnifyOff') === '1'; } catch(e){ return false; } }

  // ---- スロット接尾辞(fix246と同ロジック・ただし自前キーなので自前で付ける) ----
  function slotSfx(){
    try {
      if (typeof window.__chr6Key === 'function'){
        var k = window.__chr6Key();
        return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : '';
      }
    } catch(e){}
    return '';
  }
  function QK(){ return 'v292Dfix277Quasi' + slotSfx(); }

  var qStore = null, qKeyLoaded = '';
  function loadQ(){
    var k = QK();
    if (qStore && qKeyLoaded === k) return qStore;
    try { qStore = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch(e){ qStore = {}; }
    qKeyLoaded = k;
    return qStore;
  }
  var qDirty = false;
  function saveQ(){
    if (!qDirty || !qStore) return;
    try { localStorage.setItem(qKeyLoaded || QK(), JSON.stringify(qStore)); qDirty = false; } catch(e){}
  }

  // ---- キャスト ----
  function castNames(){
    var out = [];
    try {
      var S = getS(); if (!S || !S.cast) return out;
      if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
      (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name)); });
    } catch(e){}
    return out;
  }

  // ---- fix277b: 別名マップ(キャラ説明の「別名: A, B」行) ----
  var aliasCache = null, aliasAt = 0;
  function aliasMap(){
    if (offA()) return {};
    var now = Date.now();
    if (aliasCache && (now - aliasAt) < 5000) return aliasCache;
    var map = {};
    try {
      var S = getS();
      var people = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) people.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) people.push(n); });
      }
      people.forEach(function(p){
        var d = String(p.desc || p.description || '');
        var m = d.match(/(^|\n)[\s　]*別名[:：]([^\n]+)/);
        if (!m) return;
        m[2].split(/[、,，・\/／]/).forEach(function(a){
          a = String(a).trim();
          if (a && a !== p.name && a.length <= 12) map[a] = String(p.name);
        });
      });
      // 準登録エントリの手動別名(コンソール __v292QuasiPack.addAlias 用)
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        ((qs[n] && qs[n].ali) || []).forEach(function(a){ if (a && a !== n) map[a] = n; });
      });
    } catch(e){}
    aliasCache = map; aliasAt = now;
    return map;
  }
  function aliasFix(name){
    try { if (offA()) return name; var m = aliasMap(); return m[name] || name; } catch(e){ return name; }
  }
  window.__v292AliasFix = aliasFix; // index.html(会話ログ収穫)から呼ばれる

  // ---- fix277b: fix77状態ストアの別名エントリを正名へマージ ----
  function mergeAliasStates(){
    if (offA()) return;
    try {
      var st = window.__v292Dfix77Store; if (!st) return;
      var map = aliasMap(); var moved = 0;
      Object.keys(map).forEach(function(a){
        if (!st[a]) return;
        var c = map[a];
        var src = st[a], dst = st[c] || {};
        var newer = (src.turn || 0) >= (dst.turn || 0);
        ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu','turn'].forEach(function(k){
          if (src[k] != null && (newer || dst[k] == null)) dst[k] = src[k];
        });
        st[c] = dst; delete st[a]; moved++;
      });
      if (moved){
        try { localStorage.setItem('v292Dfix77States', JSON.stringify(st)); } catch(e){} /* fix246がスロット接尾辞へ自動リダイレクト */
        try { console.log(TAG, '別名状態を正名へマージ:', moved, '件'); } catch(e){}
      }
    } catch(e){}
  }

  // ---- fix277: 登場の記帳 ----
  var BAD = /^(それ|これ|あれ|どれ|誰か|何か|彼|彼女|自分|皆|みんな|全員|二人|三人|私|俺|僕|お前|あなた|主人公|名前|不明|\?+|？+)$/;
  /* ★fix528a(2026-07-25): 文の断片が人物名として台帳登録されるのを止める。
     実測(おしんの実セーブ smrg85jwsn6): 準登録カルテに「鏡の奥から」が1件登録されていた。
     これは人物名ではなく地の文の断片で、モデルが who 属性に句を書いた時に validName を通ってしまう。
     対策: 多字の格助詞で終わる呼称だけを弾く。「から/まで/より/へと」は日本語の人名の語尾として
     事実上使われないため、実在の人名を巻き込まない(★1字の「と」「の」等はハルト/ヤマト等を巻き込むので対象外)。
     OFF: localStorage v292Dfix528Off='1' */
  var FRAGMENT_TAIL = /(から|まで|より|へと)$/;
  /* ★fix536a(2026-07-25・30ターン実機で捕獲): プレースホルダ表記を人物として登録しない。
     実測: 30ターン走行後の準登録カルテに **「主人公（仮）」** が1件入り、fix77状態ストアにも
     空の状態エントリが作られていた(モデルが who="主人公（仮）" と書いた)。
     BAD は「主人公」の完全一致しか見ておらず、括弧つきの仮ラベルが素通りしていた。
     対策: 括弧を含む呼称と、仮ラベル語を弾く。実在の人名に括弧は使われないため巻き込みは無い。 */
  var PLACEHOLDER = /[（）()]|^(仮|仮称|未設定|名前未設定|不明な声|名無し)$|(（仮）|\(仮\))/;
  function off528(){ try { return localStorage.getItem('v292Dfix528Off') === '1'; } catch(e){ return false; } }
  function validName(n){
    n = String(n || '').trim();
    if (n.length < 2 || n.length > 12) return '';
    if (/[\s　0-9０-９a-zA-Z。、！？!?…・「」『』<>="'\/\\]/.test(n)) return '';
    if (BAD.test(n)) return '';
    if (!off528() && FRAGMENT_TAIL.test(n)) return '';
    if (!off528() && PLACEHOLDER.test(n)) return '';   // ★fix536a
    return n;
  }
  /* ★fix528b(2026-07-25・実データ再現で確定): 登録キャラの「名だけ呼び」を別人物として台帳登録しない。
     真因: noteAppear のキャスト除外は完全一致のみ。姓名を空白/中黒で分けて登録した名前
       (例「霧 涼太」「大浦 源蔵」「アリア・リュミエール」)は、地の文・セリフでは名だけ(「涼太」)で
       書かれるため、その名だけが「未登録キャラ」として準登録カルテに入る。
       さらに準登録は sys に「これらの人物も登場中は<say who=名前>を必ず出す」と注入されるので、
       モデルへ分身の使用を促す正のフィードバックになっていた(=分身が消えない構造的理由)。
     実測: smrisv41ho7 で「涼太」が seen 8ターン・会話ログ7カードを占め、主人公「霧 涼太」と
       別アイコン・別状態カードに分裂していた(fix409cはデータ層の後始末、本fixは発生源の遮断)。
     判定は極めて保守的に: (1) キャスト名が空白または中黒を含む(=姓名を分けて登録している)場合だけ、
       (2) 区切りを除いた文字列の末尾に候補が完全一致し、(3) 残りの姓部分が1〜4字、(4) 候補が一意。
       → 「朝比奈ひなた」(区切り無し)の「ひなた」等は対象外にして巻き込みを避ける。
     OFF: localStorage v292Dfix528Off='1' */
  /* この物語の現在ターン数。0 は「まだ物語がメモリに載っていない」を意味するので判定に使わない。 */
  function storyTurnCount(){ try { var S = getS(); return (S && Array.isArray(S.turns)) ? S.turns.length : 0; } catch(e){ return 0; } }
  /* ★fix528d-b: その名前がこの物語の本文・入力・会話ログのどこかに現れるか。
     fix529(キャラ一覧)と同じ判定基準。「別物語からの混入」と「正当な巻き戻し」を区別する唯一の証拠。 */
  function appearsInStory(name){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return false;
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i]; if (!t) continue;
        if (String(t.narrative || '').indexOf(name) >= 0) return true;
        if (String(t.playerText || '').indexOf(name) >= 0) return true;
        var cs = t._convSays;
        if (Array.isArray(cs)){
          for (var j = 0; j < cs.length; j++){
            var c = cs[j]; if (!c) continue;
            if (String(c.who || '').indexOf(name) >= 0) return true;
            if (String(c.say || '').indexOf(name) >= 0) return true;
          }
        }
      }
    } catch(e){}
    return false;
  }
  /* sf(suspended-future)を立てる。同時に「この物語の証拠にならない登場実績」を sfSeen へ退避する。
     ・本文に一度も出ない = 別物語からの混入 → seen を全部退避(この物語での実績はゼロが正しい)
     ・本文に出る        = 正当な巻き戻し等  → 存在しないターン番号だけ退避(実績は残す)
     どちらも削除ではなく退避。復帰は noteAppear の再観測だけが行う。 */
  function suspendFuture(e, name, cur){
    var foreign = !appearsInStory(name);
    var keep = [], drop = [];
    (e.seen || []).forEach(function(x){ (!foreign && x <= cur - 1 ? keep : drop).push(x); });
    if (drop.length) e.sfSeen = (e.sfSeen || []).concat(drop).slice(-60);
    e.seen = keep;
    e.last = keep.length ? Math.max.apply(Math, keep) : 0;
    e.sf = foreign ? 2 : 1;   // 2=別物語由来 / 1=巻き戻し等。どちらも再観測まで注入禁止
    try { console.log(TAG, 'fix528d: 注入停止(' + (foreign ? '別物語由来' : '未来ターン') + '):', name); } catch(_){}
  }
  function castPartOwner(name){
    try {
      var cs = castNames(), hit = null, n2;
      for (var i = 0; i < cs.length; i++){
        var c = String(cs[i] || '');
        if (c === name) return null;                       // 候補自身がキャスト名=判定不要
        if (!/[\s　・]/.test(c)) continue;                 // (1) 姓名を分けて登録していない名前は対象外
        n2 = c.replace(/[\s　・]/g, '');
        if (n2 === name) return c;                         // 区切りを除くと完全一致=同一人物(fix456と同じ流儀)
        if (n2.length <= name.length) continue;
        var rest = n2.length - name.length;
        /* (2) 末尾完全一致(和名「霧 涼太」→「涼太」) または 先頭完全一致(洋名「アリア・リュミエール」→「アリア」)。
           (3) 残り(姓 or 名字側)は1〜6字。実測: 「アリア」seen1 が主人公アリア・リュミエールとは別人物として
               台帳に居た(smrrcv21iph)。末尾一致だけでは洋名順(名+姓)を救えないため両方向を見る。 */
        /* ★fix528e(2026-07-25・GPT監査): 先頭一致を「中黒区切り(洋名)」だけに限定する。
           旧実装は空白区切りでも先頭一致を許したため、反例(GPT):
             登録キャラ「佐藤 太郎」が居ると、**別人の「佐藤」**まで「登録キャラの別呼び」と誤判定され、
             準登録カルテに載らなくなる(＝存在が薄くなる)。日本語の空白区切りは 姓+名 なので
             先頭は姓＝他人と衝突しやすい。中黒区切りは 名+姓(洋名)で、先頭は個人名なので衝突しにくい。
           よって: 空白区切り → 末尾一致のみ / 中黒区切り → 先頭・末尾どちらも可。 */
        var tailHit = (n2.slice(n2.length - name.length) === name);
        var headHit = (n2.slice(0, name.length) === name) && (off528() || /・/.test(c));
        if (!tailHit && !headHit) continue;
        if (rest < 1 || rest > 6) continue;
        if (hit && hit !== c) return null;                 // (4) 一意でなければ見送り
        hit = c;
      }
      return hit;
    } catch(e){ return null; }
  }
  /* ★fix528g(2026-07-25・GPT監査の非阻止指摘): `turnIdx === cur`(進行中ターン)での解除を許すのは
       **生応答の現在parse経路(harvestRaw)だけ**に限定する。将来ほかの呼出元が cur を渡すと
       「未確定ターンでも解除できる」契約になってしまうため、source で明示する。 */
  function noteAppear(name, turnIdx, opts){
    name = validName(aliasFix(name));
    if (!name) return;
    if (castNames().indexOf(name) >= 0) return;
    if (!off528() && castPartOwner(name)) return;   // ★fix528b: 登録キャラの名だけ呼び=別人物にしない
    var qs = loadQ();
    var e = qs[name] || { seen: [], ali: [] };
    /* ★fix528d-b(2026-07-25・おしん指摘の再発条件を潰す):
         「未来のターン番号」を持つ残骸は sf(suspended-future) で【再観測まで注入禁止】にする。
       なぜ一時除外では足りないか: 旧実装は quasiRecent で `last > cur-1` を弾くだけだったので、
         物語が進んで現在ターンが last に追いつくと、別物語由来の残骸がそのまま
         「最近登場した人物」として復活してしまう(例: 8ターン物語 + last=13 → 13ターン目で復活)。
       解除条件は「この物語で実際に再観測されたこと」だけ。ここ(noteAppear)は
         <say|react|state who=> と _convSays の話者からしか呼ばれない＝実観測そのもの。
       解除時に seen を「この物語に実在するターン番号」だけへ絞る。別物語の登場実績を
         引き継いだまま復活すると、初回観測で即 seen>=3 を満たして誤って準登録化するため。
         捨てる番号は削除せず e.sfSeen へ退避する(非破壊・形式追加は1キーのみ)。
       正当な巻き戻しでも、その人物が新しい進行で再登場すれば同じ経路で自動解除される。
       OFF: v292Dfix528Off='1' */
    if (!off528() && e.sf){
      /* ★fix528f(2026-07-25・GPT監査で判明した実装ミス):
           解除条件を `turnIdx <= curN - 1` にしていたが、生応答からの収穫 harvestRaw は
           **まだ S.turns へ push される前**に `turnIdx = S.turns.length`(=curN) を渡す構造なので、
           この条件は**必ず外れる**。その結果 <state>/<react> にだけ出た人物は永久に解除されず、
           正当に再登場しても復活しない経路が残っていた(会話ログ話者は後追いの syncConv で
           有効な番号が渡るため偶然解除できていた＝実行順依存)。
           → 進行中ターンの index(=curN)も「この物語の実在ターン」として許可する。
           別物語の残骸(例: 8ターン物語に last=13)は harvest からは curN 以下しか渡らないので
           これで誤解除は起きない。 */
      var curN = storyTurnCount();
      var maxOk = (opts && opts.source === 'current-parse') ? curN : (curN - 1);   // ★fix528g: curを許すのは生応答の現在parse経路だけ
      if (!(curN > 0 && turnIdx >= 0 && turnIdx <= maxOk)) return;   // この物語に実在する(進行中を含む)ターンでの観測でなければ解除しない
      delete e.sf;
      qDirty = true;
      try { console.log(TAG, 'fix528d: 再観測により復帰:', name, '@turn', turnIdx); } catch(_){}
    }
    if (e.seen.indexOf(turnIdx) < 0){
      e.seen.push(turnIdx);
      if (e.seen.length > 40) e.seen = e.seen.slice(-40);
      qDirty = true;
    }
    if ((e.last || 0) < turnIdx){ e.last = turnIdx; qDirty = true; }
    qs[name] = e;
    // 台帳の暴走防止: 60ターン以上前が最終登場のエントリは間引く(50件超のときだけ)
    try {
      var keys = Object.keys(qs);
      if (keys.length > 50){
        var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
        keys.forEach(function(k){ if (cur - ((qs[k] && qs[k].last) || 0) > 60) { delete qs[k]; qDirty = true; } });
      }
    } catch(e2){}
  }
  function harvestRaw(raw, turnIdx){
    try {
      var txt = String(raw || ''); var m;
      var re1 = /<(?:say|react|state)\b[^>]*?who="([^"]{1,24})"/g;
      while ((m = re1.exec(txt))) noteAppear(m[1], turnIdx, { source: 'current-parse' });
      var re2 = /<say\s+who='([^']{1,24})'/g; /* react声の入れ子(単引用) */
      while ((m = re2.exec(txt))) noteAppear(m[1], turnIdx, { source: 'current-parse' });
    } catch(e){}
  }

  /* ★fix537(2026-07-25・30ターン実機で捕獲): 「名乗り」で同一性が確定した時だけ、記述的な呼称を新しい名前へ紐づける。
     実測: 30ターン後、同一人物が4つの台帳すべてで別人のまま残っていた。
       会話カード(少女5枚 / シオン12枚) / 準登録カルテ(少女#3 / シオン#6) /
       ロスター(白いワンピースの少女 / シオン) / キャラ一覧(少女@29 と シオン@17)。
       本文には <say who="シオン">シオンっていうんだ……たぶん</say> という**決定的証拠**がある。
     設計原則(GPT監査): 「女将が出たから民宿の女将を表示」ではなく
       「**民宿の女将＝女将と既に確定しているから**表示」。名乗りは、その"確定"にあたる最強の証拠。
     したがって外見の類似や部分一致では一切統合せず、**本人が名乗った時だけ**別名として記録する。
     成立条件(すべて満たす時だけ・1つでも欠けたら何もしない):
       (1) そのターンに who=W のカードがあり、W が**この物語で初出**(台帳に無い or 今ターンが初seen)
       (2) その台詞が **W 自身の名乗り**である(「Wっていうんだ」「Wという」「名前はW」「私はWだ」等)
       (3) 直近3ターンに、**記述的な仮呼称 L**(少女/少年/男/女/子供/影/人影 で終わる呼称)が台帳にあり、
           その L がちょうど1つに定まる(2つ以上あれば曖昧なので見送り)
       (4) L も W も登録キャスト名ではない(登録キャラ同士は絶対に統合しない)
     やること: 既存の別名機構へ addAlias(W, L) を1件足すだけ。以降 aliasFix が who を W へ正規化し、
       fix77の状態も mergeAliasStates が W へ寄せ、キャラ一覧の重複表示も消える(全部既存の仕組み)。
     可逆性: 台帳の ali 配列に1要素増えるだけ。消せば元に戻る。ログは v292Dfix537_log。
     OFF: localStorage v292Dfix537Off='1' */
  var DESCRIPTIVE_TAIL = /(少女|少年|女|男|子供|子ども|娘|息子|影|人影|老人|老婆|青年|婦人)$/;
  function off537(){ try { return localStorage.getItem('v292Dfix537Off') === '1'; } catch(e){ return false; } }
  function namingOf(text, who){
    var t = String(text || ''), w = String(who || '');
    if (!w || w.length < 2) return false;
    var i = t.indexOf(w);
    while (i >= 0){
      var after = t.slice(i + w.length, i + w.length + 8);
      var before = t.slice(Math.max(0, i - 6), i);
      if (/^(?:って(?:いう|言う)|という|と言う|と呼(?:んで|ばれ)|です|だ(?:よ|けど)?[。、！\s]?$|だ[。、！])/.test(after)) return true;
      if (/(名前は|名は|わたしは|私は|僕は|俺は|あたしは)[\s　]*$/.test(before)) return true;
      i = t.indexOf(w, i + 1);
    }
    return false;
  }
  function detectSelfNaming(raw, turnIdx){
    try {
      if (off537() || offQ()) return;
      var txt = String(raw || ''), m, cast = castNames();
      var re = /<say\s+who="([^"]{2,24})"\s*>([\s\S]{0,200}?)<\/say>/g;
      var qs = loadQ();
      while ((m = re.exec(txt))){
        var W = validName(String(m[1] || '').trim());
        if (!W || cast.indexOf(W) >= 0) continue;                 // (4) 登録キャストは対象外
        var e = qs[W];
        var firstTime = !e || !Array.isArray(e.seen) || e.seen.length === 0 ||
                        (e.seen.length === 1 && e.seen[0] === turnIdx);
        if (!firstTime) continue;                                  // (1) この物語で初出のときだけ
        if (!namingOf(m[2], W)) continue;                          // (2) 本人の名乗り
        /* (3) 直近3ターンの記述的な仮呼称をちょうど1つ探す */
        var cands = [];
        Object.keys(qs).forEach(function(L){
          if (L === W || cast.indexOf(L) >= 0) return;
          if (!DESCRIPTIVE_TAIL.test(L)) return;
          var le = qs[L]; if (!le) return;
          var last = le.last || 0;
          if (turnIdx - last > 3) return;
          if ((le.ali || []).indexOf(W) >= 0) return;
          cands.push(L);
        });
        if (cands.length !== 1) continue;                          // 曖昧なら見送り
        var L1 = cands[0];
        var ent = qs[W] || { seen: [], ali: [] };
        ent.ali = ent.ali || [];
        if (ent.ali.indexOf(L1) < 0) ent.ali.push(L1);
        /* L 側の登場実績を W へ引き継ぐ(同一人物なので実績も同一人物のもの) */
        var le2 = qs[L1];
        if (le2 && Array.isArray(le2.seen)){
          le2.seen.forEach(function(x){ if ((ent.seen = ent.seen || []).indexOf(x) < 0) ent.seen.push(x); });
          if ((ent.last || 0) < (le2.last || 0)) ent.last = le2.last;
        }
        qs[W] = ent; qDirty = true; aliasCache = null;
        try {
          var lg = JSON.parse(localStorage.getItem('v292Dfix537_log') || '[]');
          lg.push({ ts: Date.now(), turn: turnIdx, alias: L1, canonical: W });
          localStorage.setItem('v292Dfix537_log', JSON.stringify(lg.slice(-30)));
        } catch(e2){}
        try { console.log(TAG, 'fix537: 名乗りで同一性確定:', L1, '=', W); } catch(e3){}
        try { saveQ(); normalizeConvWho('fix537:' + L1 + '=' + W); } catch(e4){}   // ★fix538
      }
    } catch(e){}
  }


  /* ★fix538(2026-07-25): 別名が確定したら、**保存済みの会話ログの話者も**正名へ寄せる。
     実測(30ターン試験): fix537 が 少女=シオン を確定させると、キャラ一覧と fix77 の状態は統合されるのに
     **保存済みカードは旧呼称のまま**だった(会話ログに2つの名前・keyForが名前ハッシュなので2つのアイコン)。
     やり方は fix409 と同じ流儀: 適用前に丸ごとバックアップを取り、ログを残し、OFFで止められる。
     対象は「明示的に宣言された別名」だけ = fix537(本人の名乗り) と キャラ説明の「別名:」行。
     推測による統合は一切しない。 OFF: localStorage v292Dfix538Off='1' */
  function off538(){ try { return localStorage.getItem('v292Dfix538Off') === '1'; } catch(e){ return false; } }
  var _bk538 = false;
  function normalizeConvWho(reason){
    try {
      if (off538()) return 0;
      var S = getS(); if (!S || !Array.isArray(S.turns)) return 0;
      var map = aliasMap(); var keys = Object.keys(map);
      if (!keys.length) return 0;
      /* 何件変わるか先に数える(0なら一切触らない=保存もバックアップもしない) */
      var n = 0;
      S.turns.forEach(function(t){
        ((t && t._convSays) || []).forEach(function(c){
          if (c && c.who && map[c.who] && map[c.who] !== c.who) n++;
        });
      });
      if (!n) return 0;
      if (!_bk538){
        try {
          var k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
          var blob = localStorage.getItem(k);
          if (blob) localStorage.setItem('chr6_bk_fix538_' + Date.now(), JSON.stringify({ key: k, blob: blob, ts: Date.now() }));
          /* 新しい順3件だけ残す */
          var bks = Object.keys(localStorage).filter(function(x){ return /^chr6_bk_fix538_\d+$/.test(x); }).sort();
          while (bks.length > 3){ localStorage.removeItem(bks.shift()); }
          _bk538 = true;
        } catch(e){ return 0; }   /* 控えが取れないなら書き換えない(fail-closed) */
      }
      var changed = [];
      S.turns.forEach(function(t, ti){
        ((t && t._convSays) || []).forEach(function(c){
          if (c && c.who && map[c.who] && map[c.who] !== c.who){
            changed.push({ turn: ti + 1, from: c.who, to: map[c.who], say: String(c.say || '').slice(0, 14) });
            c.who = map[c.who];
          }
        });
      });
      if (changed.length){
        try { if (typeof S.save === 'function') S.save(); } catch(e){}
        try {
          var lg = JSON.parse(localStorage.getItem('v292Dfix538_log') || '[]');
          lg.push({ ts: Date.now(), reason: reason || '', n: changed.length, sample: changed.slice(0, 5) });
          localStorage.setItem('v292Dfix538_log', JSON.stringify(lg.slice(-20)));
        } catch(e){}
        try { if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair(); } catch(e){}
        try { console.log(TAG, 'fix538: 会話ログの話者を正名へ統一:', changed.length, '件'); } catch(e){}
      }
      return changed.length;
    } catch(e){ return 0; }
  }

  function syncConv(){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      var n = S.turns.length;
      for (var i = Math.max(0, n - 8); i < n; i++){
        var t = S.turns[i]; if (!t || !Array.isArray(t._convSays)) continue;
        t._convSays.forEach(function(c){ if (c && c.who) noteAppear(c.who, i); });
      }
    } catch(e){}
  }

  function quasiRecent(){
    /* 準登録(累計3ターン登場)かつ直近5ターンに登場した名前を、最終登場が新しい順で返す */
    var out = [];
    var sfMarked = false;
    try {
      var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        var e = qs[n]; if (!e || !Array.isArray(e.seen)) return;
        /* ★fix528d(2026-07-25・実データで確定): 「この物語に存在しないターン番号」を最終登場に持つ
             エントリを sys 注入から外す。
           真因: 台帳キーは v292Dfix277Quasi<スロット接尾辞> だが、接尾辞は chr6_active_slot 由来。
             fix525/fix527 以前は active ポインタが全タブ共有だったため、別の物語を開いている間に
             書かれた台帳が他スロットのキーへ混入した(=別物語の登場人物が残っている)。
             さらに quasiRecent の窓判定は (cur - last) <= 5 なので、last が cur より大きい
             (=未来のターン番号を持つ残骸)と差が負になり【必ず窓内】と判定され、毎ターン
             「この人物も登場中」として sys に注入され続けていた。
           実測: smriifzelrt(8ターン)へ 桐生悠真(last13)・氷川杏子(last12)・杏子(last12)、
             smr8p8wfr8b(16ターン)へ 少女(last24) が現在も注入対象になっていた。
           対処は非破壊(注入から外すだけ・台帳は消さない)。巻き戻し直後に一時的に last>cur となる
             正当なケースでも、ターンが進めば自然に復帰する。
           ★fix528b の分身も同時に注入対象から外す(既存物語の台帳を書き換えずに効かせるため)。
           OFF: localStorage v292Dfix528Off='1' */
        if (!off528()){
          /* ★fix528d-b: 一時除外ではなく「再観測まで注入禁止」。cur===0(起動直後で物語未ロード)では
               全件が未来扱いになってしまうので、必ず cur>0 のときだけ判定する。 */
          if (cur > 0 && !e.sf && (e.last || 0) > cur - 1){
            suspendFuture(e, n, cur);                 // この物語に無いターン番号=別物語/巻き戻しの残骸
            qDirty = true; sfMarked = true;
            return;
          }
          if (e.sf) return;                         // 再観測(noteAppear)されるまで自動復活させない
          if (castPartOwner(n)) return;             // 登録キャラの名だけ呼び=分身
        }
        if (e.seen.length >= 3 && (cur - (e.last || 0)) <= 5) out.push({ name: n, last: e.last || 0 });
      });
      out.sort(function(a, b){ return b.last - a.last; });
      /* sf を立てたら永続化する(次回起動でも「再観測まで注入禁止」を維持するため)。
         台帳は物語データではない別キーなのでここでの書き込みは安全。 */
      if (sfMarked) saveQ();
    } catch(e){}
    return out;
  }

  // ---- fix277: sys後処理(状態ブロックの窓制御 + 準登録の許可行) ----
  var HEAD = '【各キャラの現在の状態';
  function surgery(sys){
    try {
      if (offQ() || typeof sys !== 'string' || !sys) return sys;
      var cast = castNames();
      var rec = quasiRecent();
      var qNames = rec.map(function(r){ return r.name; }).slice(0, 8);
      var lastOf = {}; rec.forEach(function(r){ lastOf[r.name] = r.last; });
      var permit = qNames.length
        ? '・準登録(自動・直近登場): ' + qNames.join('、') + ' — これらの人物も登場中は<say who="名前">と<state who="名前">を必ず出す(状態は引き継ぎ対象)。'
        : '';
      var hi = sys.indexOf(HEAD);
      if (hi < 0){
        return permit ? (sys + '\n\n【準登録キャラ(自動)】\n' + permit) : sys;
      }
      var lines = sys.split('\n');
      var h = -1;
      for (var i = 0; i < lines.length; i++){ if (lines[i].indexOf(HEAD) >= 0){ h = i; break; } }
      if (h < 0) return sys;
      var changed = false, qLines = [], out = lines.slice(0, h + 1);
      var j = h + 1;
      for (; j < lines.length; j++){
        var ln = lines[j];
        if (ln.charAt(0) !== '・') break; /* ブロック終端 */
        var em = ln.match(/^・(.+?)｜/);
        if (!em){ out.push(ln); continue; } /* 助言行はそのまま */
        var nm = em[1];
        if (cast.indexOf(nm) >= 0){ out.push(ln); continue; }
        if (qNames.indexOf(nm) >= 0){
          var cl = ln.length > 126 ? (ln.slice(0, 124) + '…') : ln; /* 1人120字級に圧縮 */
          if (cl !== ln) changed = true;
          qLines.push({ nm: nm, ln: cl });
          continue;
        }
        changed = true; /* キャスト外かつ準登録(直近)でない状態行は注入しない(肥大・汚染ガード) */
      }
      /* 準登録の合計600字ガード: 最終登場が古い順に切る */
      qLines.sort(function(a, b){ return (lastOf[b.nm] || 0) - (lastOf[a.nm] || 0); });
      var budget = 600, kept = [];
      qLines.forEach(function(q){ if (budget - q.ln.length >= 0){ budget -= q.ln.length; kept.push(q.ln); } else { changed = true; } });
      if (kept.length){
        /* 状態行のすぐ後(助言行の前)に入れたいが、構造単純化のためブロック末尾に追加 */
        out = out.concat(kept);
        changed = true;
      }
      if (permit){ out.push(permit); changed = true; }
      if (!changed) return sys; /* 無変更ならバイト一致で返す(回帰=sysバイト比較を保証) */
      return out.concat(lines.slice(j)).join('\n');
    } catch(e){ return sys; }
  }

  // ---- parsePlanラップ(登場収穫) ----
  function installParse(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (P.parsePlan.__v292Dfix277q) return true;
      var inner = P.parsePlan.bind(P);
      var wrapped = function(rawText, inputType){
        var plan = inner(rawText, inputType);
        try {
          if (!offQ()){
            var S = getS();
            harvestRaw(rawText, (S && S.turns) ? S.turns.length : 0);
            detectSelfNaming(rawText, (S && S.turns) ? S.turns.length : 0);   // ★fix537
            saveQ();
          }
        } catch(e){}
        return plan;
      };
      try { Object.keys(P.parsePlan).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.parsePlan[k]; }); } catch(e){} /* 旧フラグ継承(fix274と同思想・再ラップ輪の予防) */
      wrapped.__v292Dfix277q = true;
      P.parsePlan = wrapped;
      try { console.log(TAG, 'parsePlan wrapped (登場収穫)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- Planner.buildラップ(sys後処理・最外=fix192の上) ----
  function engineOn(){
    try { if (window.__v292NewEngine && typeof window.__v292NewEngine.engineOn === 'function') return !!window.__v292NewEngine.engineOn(); } catch(e){}
    try { var S = getS(); if (S && S.cfg && S.cfg.engineMode != null) return +S.cfg.engineMode === 1; return localStorage.getItem('v292EngineMode') === '1'; } catch(e){ return false; }
  }
  function installBuild(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.build !== 'function') return false;
      if (P.build.__v292Dfix277b2) return true;
      var inner = P.build.bind(P);
      var wrapped = function(mode, text){
        var r = inner(mode, text);
        try {
          if (r && typeof r.sys === 'string' && engineOn() && !offQ()){
            syncConv(); mergeAliasStates(); saveQ();
            r.sys = surgery(r.sys);
          }
        } catch(e){}
        return r;
      };
      try { Object.keys(P.build).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.build[k]; }); } catch(e){} /* fix274のsetterも継承するが二重の保険 */
      wrapped.__v292Dfix277b2 = true;
      P.build = wrapped;
      try { console.log(TAG, 'Planner.build wrapped (準登録注入)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function waitP(){
    var a = installParse();
    /* buildラップは「fix192(新エンジン)のラップ装着後」まで待つ: 先に装着するとfix192が後から外側に来て
       r.sys=buildSys()がsurgery結果を上書きする(実機で実証)。fix274セッターがフラグを継承するため
       見かけ上は装着済みに見える罠。__v292NewEngineフラグの出現=fix192装着済みの権威。30秒で諦め装着(旧エンジン運用等)。 */
    var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
    waitP._n = (waitP._n || 0) + 1;
    var ready = P && typeof P.build === 'function' && (P.build.__v292NewEngine || waitP._n > 60);
    var b = ready ? installBuild() : false;
    if (a && b) return;
    setTimeout(waitP, 500);
  })();

  // ---- fix278: キャラ一覧アイコンの会話ログ統一 + fix277b別名カード統合 ----
  function unifyCards(){
    try {
      if (offI() && offA()) return;
      var cards = document.querySelectorAll('.v292Dfix145-card');
      if (!cards.length) return;
      var f197 = window.__v292Dfix197;
      var names = {};
      cards.forEach(function(c){ names[c.getAttribute('data-name') || ''] = 1; });
      cards.forEach(function(card){
        var nm = card.getAttribute('data-name') || '';
        if (!nm) return;
        /* fix277b: 別名カードは正名カードがあれば非表示(表示統合のみ・データは残す) */
        if (!offA()){
          var canon = aliasFix(nm);
          if (canon !== nm && names[canon]){ card.style.display = 'none'; return; }
        }
        /* fix278: 会話ログと同じ v292av2_ キャッシュ(名前+画風)を最優先 */
        if (offI() || !f197 || typeof f197.cachedFor !== 'function') return;
        var url = f197.cachedFor(nm) || f197.cachedFor(aliasFix(nm));
        if (!url) return; /* キャッシュ未生成→従来経路のまま */
        var img = card.querySelector('img');
        if (img){
          if (img.getAttribute('src') !== url){ img.onerror = null; img.src = url; }
        } else {
          var wrap = card.firstChild;
          if (wrap && wrap.nodeType === 1){
            wrap.textContent = '';
            var ni = document.createElement('img');
            ni.src = url; ni.alt = nm;
            ni.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            wrap.appendChild(ni);
          }
        }
      });
    } catch(e){}
  }
  var moT = null;
  try {
    new MutationObserver(function(muts){
      var hit = false;
      for (var i = 0; i < muts.length && !hit; i++){
        var ad = muts[i].addedNodes || [];
        for (var k = 0; k < ad.length; k++){
          var nd = ad[k];
          if (nd && nd.nodeType === 1 && ((nd.className || '').indexOf('v292Dfix145') >= 0 || (nd.querySelector && nd.querySelector('.v292Dfix145-card')))){ hit = true; break; }
        }
      }
      if (!hit) return;
      if (moT) clearTimeout(moT);
      moT = setTimeout(function(){ moT = null; unifyCards(); }, 250);
    }).observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e){}

  window.__v292QuasiPack = {
    store: loadQ, key: QK, surgery: surgery, aliasMap: aliasMap, aliasFix: aliasFix,
    noteAppear: noteAppear, quasiRecent: quasiRecent, syncConv: syncConv, unifyCards: unifyCards,
    detectSelfNaming: detectSelfNaming, /* ★fix537 検証口(実経路はparsePlanラップ) */
    normalizeConvWho: normalizeConvWho,   /* ★fix538 検証口 */
    _dropCache: function(){ qStore = null; qKeyLoaded = ''; aliasCache = null; }, /* 検証用 */
    addAlias: function(canonical, alias){
      try { var qs = loadQ(); var e = qs[canonical] || { seen: [], ali: [] }; if ((e.ali = e.ali || []).indexOf(alias) < 0) e.ali.push(alias); qs[canonical] = e; qDirty = true; saveQ(); aliasCache = null; return true; } catch(e2){ return false; }
    }
  };
  try { console.log(TAG, 'loaded (fix277/277b/278)'); } catch(e){}
})();
