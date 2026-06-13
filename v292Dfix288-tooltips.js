// =====================================================================
// Chronicle TRPG - v292Dfix288: トップバー各セレクタにホバー説明(ツールチップ)
// ---------------------------------------------------------------------
// おしんFB「セレクタにマウスをあてると説明が出るように。いじれる所が多いので
//   初めての人にも会話劇にしたら何が変わるか等が分かるようにしたい」。
// 各 select の title(役割+選択肢の要約) と各 option の title(個別の意味) を付与。
//   ・title属性=ブラウザ標準のツールチップ。selectのtitleは確実に出る。
//     optionのtitleはOS/ブラウザ依存で出ないことがあるため、selectのtitleにも
//     全選択肢の要約を入れて「1ホバーで全部わかる」ようにする。
//   ・MutationObserver+intervalで動的生成/再生成された後でも付け直す。
//   ・既存のtitle(mkSelが付ける簡易説明)は、より詳しいこちらで上書き。
// OFF: localStorage v292TooltipsOff='1'
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix288:tooltips]';
  if (window.__v292Dfix288) return;
  window.__v292Dfix288 = true;

  // id → { self:セレクタ全体の説明, opts:{ value:選択肢の説明 } }
  var TIP = {
    'v292-drama-sel': {
      self: '📖 進行：1ターンで物語をどれだけ前に進めるか。\nオフ=今の場面を維持／弱め=半歩〜一歩／標準=一段階はっきり／強め=複数の展開を一気に',
      opts: {
        '0': 'オフ：場面を進めず、今の状況の描写を足すだけ（停滞気味だがじっくり）',
        '1': '弱め：新しい要素を1つ控えめに。半歩〜一歩ずつ進む',
        '2': '標準：新要素を1つ持ち込み、状況を一段階はっきり進める（おすすめ）',
        '3': '強め：新要素を2つ以上、複数の展開を一気に動かして大胆に転がす'
      }
    },
    'v292-react-sel': {
      self: '💬 反応：登場キャラの反応（身体の動き・感情・声）をどれだけ濃く描くか。\n控えめ=最小限／標準=要所で／濃いめ=厚く',
      opts: {
        '0': '控えめ：キャラの反応は最小限。テンポ重視',
        '1': '標準：要所でキャラの反応を描く',
        '2': '濃いめ：身体反応・感情・声を細かく厚く描く'
      }
    },
    'v292-dlg-sel': {
      self: '🗨 セリフ：キャラのセリフの量。\n控えめ=地の文中心／標準=要所で会話／濃いめ=掛け合い多め',
      opts: {
        '0': '控えめ：会話は最小限、地の文（描写）中心',
        '1': '標準：要所でキャラを喋らせる',
        '2': '濃いめ：キャラ同士の掛け合いを増やし、会話で関係や次の展開を見せる'
      }
    },
    'v292-avatar-sel': {
      self: '🎨 アイコン：キャラアイコンの作り方。\n標準=シンプルな自動アイコン（無料）／AI=AIが描くポートレート（高品質・少額課金）',
      opts: {
        '0': '標準：シンプルな自動生成アイコン（無料・記号的）',
        '1': 'AI：AIがキャラの外見を絵に描く（高品質・1キャラ初回のみ少額課金）'
      }
    },
    'v292-style-sel': {
      self: '🖌 画風：AIアイコンの絵柄。切替で全キャラ即反映（作り直し不要）。',
      opts: {
        '0': 'アニメ：明るく鮮やかなアニメ調',
        '1': 'リアル：写実寄りのデジタル絵画調',
        '2': '水彩：柔らかい水彩イラスト調',
        '3': '従来：以前のダークファンタジー調（暗め・陰のある雰囲気）'
      }
    },
    'v292-engine-sel': {
      self: '⚙ エンジン：物語生成のしくみ。\n新βが推奨（トーン・長さ・サスペンス等の調整が効く）',
      opts: {
        '0': '従来：旧エンジン（昔のプロンプト）',
        '1': '新β：新エンジン（推奨。トーン/長さ/状態管理などが効く）'
      }
    },
    'v292-len-sel': {
      self: '📏 長さ：1ターンで書く本文の量。',
      opts: {
        'short': '短：3〜6文ほどでサッと。テンポ重視',
        'standard': '標準：5〜10文ほど。バランス型',
        'long': '長文：10〜16文。情景→身体感覚→感情→行動を層で厚く描く'
      }
    },
    'v292-tone-sel': {
      self: '🎭 トーン：物語の語り口・雰囲気。\n静=静かな緊張／動=疾走と戦闘／濃=濃密な恐怖と痛み／会話劇=セリフ主導の掛け合い／緊迫=サスペンス（脅威の接近・謎・不意の危機）',
      opts: {
        'shizuka': '静：静かな緊張。間と気配でじわじわ',
        'dou': '動：疾走と交戦。スピードとアクション',
        'koi': '濃：密度の高い恐怖と痛み。匂い・湿度・痛みの帰結まで描く',
        'kaiwa': '会話劇：セリフが物語を運ぶ。キャラ同士の掛け合い・対立・本音が主役',
        'suspense': '緊迫：サスペンス。脅威が段階的に迫り、謎を小出しにし、油断した頃に不意の危機（理不尽な即死はナシ）'
      }
    },
    'v292-model-sel': {
      self: '🧠 モデル：文章を書くAI。\nFlash=高速・安価で十分賢い（普段向き）／Pro=心理描写と状況把握が一段上（修羅場・濃い場面向き・やや遅め＆高コスト）',
      opts: {
        'deepseek/deepseek-v4-flash': 'DS V4 Flash：速い・安い・十分賢い。普段使いにおすすめ',
        'deepseek/deepseek-v4-pro': 'DS V4 Pro：心理の深さ・状況追跡が一段上。ここぞの修羅場や濃い場面に。やや遅く約4倍のコスト'
      }
    }
  };

  function applyTips(){
    try {
      if (localStorage.getItem('v292TooltipsOff') === '1') return;
      Object.keys(TIP).forEach(function(id){
        var sel = document.getElementById(id);
        if (!sel) return;
        var spec = TIP[id];
        if (sel.getAttribute('title') !== spec.self) sel.setAttribute('title', spec.self);
        // 各option
        var os = sel.options || [];
        for (var i = 0; i < os.length; i++){
          var o = os[i];
          var t = spec.opts[o.value];
          if (t && o.getAttribute('title') !== t) o.setAttribute('title', t);
        }
      });
    } catch(e){}
  }

  // 初回 + 動的生成/再生成に追従
  var t = null;
  function schedule(){ if (t) return; t = setTimeout(function(){ t = null; applyTips(); }, 200); }
  try {
    new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++){
        var ad = muts[i].addedNodes || [];
        for (var k = 0; k < ad.length; k++){
          var n = ad[k];
          if (n && n.nodeType === 1 && ((n.tagName === 'SELECT') || (n.querySelector && n.querySelector('select')))){ schedule(); return; }
        }
      }
    }).observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e){}
  try { setInterval(applyTips, 2000); } catch(e){} /* セレクタ後着ロード/再描画の保険 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyTips); else applyTips();

  window.__v292Dfix288Tooltips = { apply: applyTips, TIP: TIP };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
