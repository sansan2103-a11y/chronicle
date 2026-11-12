// =====================================================================
// Chronicle TRPG - v292DfixSEVDRV: SEVERE1 / DRIVE1 / EX192 の判定（純関数）
// ---------------------------------------------------------------------
// laneCAST1（2026-11-13・LOCAL 試作・未出荷）: GPT #127-SU ⑤ の裁定で、同じファイルにあった天候・時刻・出来事の控え
//   （旧機能・鍵ごと）を撤去した。このファイルは、残す 3 つ（どれも既定 OFF・短期比較用）の判定だけを旧ファイルからそのまま移したもの。
//   判定の中身は 1 字も変えていない（SEVERE1 r2 / DRIVE1 r2 / EX192）。載せるのは v292Dfix192（状態ブロック・見本）。
//   ・追加の AI 呼び出しはしない。保存・store・セーブ形式は変えない。
// 鍵（毎回評価・再読込不要。すべて既定 OFF＝送信バイト同一）:
//   SEVERE1: localStorage v292DfixSEVERE1On='1'（kill v292DfixSEVERE1Off='1' が常に優先）
//   DRIVE1 : v292DfixDRIVE1On='1'（kill v292DfixDRIVE1Off='1'）
//   EX192  : v292DfixEX192On='1'（案 A）または '2'（案 B）（kill v292DfixEX192Off='1'）
// 検証口: window.__v292DfixSevDrvCore
// =====================================================================
(function(root){
  'use strict';
  var VER = 'sevdrv-20261113-r1';
  function lsGet(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function severeOn(){ return lsGet('v292DfixSEVERE1Off') !== '1' && lsGet('v292DfixSEVERE1On') === '1'; }
  function driveOn(){ return lsGet('v292DfixDRIVE1Off') !== '1' && lsGet('v292DfixDRIVE1On') === '1'; }
  function ex192(){ if (lsGet('v292DfixEX192Off') === '1') return ''; var v = lsGet('v292DfixEX192On'); return v === '1' ? 'A' : (v === '2' ? 'B' : ''); }

  function esc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function maskNames(t, names){ (names || []).slice().sort(function(a, b){ return String(b).length - String(a).length; }).forEach(function(n){ if (n && String(n).length) t = t.split(String(n)).join('〇'); }); return t; }
  // 地の文の文だけ（「」『』（）<say> と状態タグの行は除く）
  function splitNarr(narr, names){
    var ls = Array.isArray(narr) ? narr : String(narr || '').split('\n'), t = '';
    for (var a = 0; a < ls.length; a++){
      var l = String(ls[a] == null ? '' : ls[a]);
      if (/^\s*<(react|state|summary|scene_move)\b/.test(l)) continue;
      t += l.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/<[^>]*>/g, ' ') + '\n';
    }
    t = maskNames(t, names);
    var buf = '', depth = 0, out = [];
    for (var i = 0; i < t.length; i++){
      var c = t.charAt(i);
      if (c === '「' || c === '『' || c === '（' || c === '('){ depth++; buf = ''; continue; }
      if (c === '」' || c === '』' || c === '）' || c === ')'){ if (depth > 0) depth--; buf = ''; continue; }
      if (depth > 0) continue;
      if (c === '。' || c === '！' || c === '？' || c === '\n'){ if (c !== '\n') buf += c; var x = buf.replace(/\s+/g, ' ').trim(); if (x) out.push(x); buf = ''; continue; }
      buf += c;
    }
    var x2 = buf.replace(/\s+/g, ' ').trim(); if (x2) out.push(x2);
    return out;
  }

  // ---- SEVERE1 r2: 能力の制約（感情は指定しない） ----
  //   根拠は 傷（fix190 の永続の記録。治療状況を含む）と からだ（fix77 の瞬間値）。語が無ければ認定しない。
  //   U = 意識不明（覚醒の根拠が描かれるまで自発的な会話・意図的な行動はできない）
  //   S = 重い出血・衰弱（意識・姿勢・運動・会話量に制約）
  var UNCON_RE = /意識(?:が|は)?(?:な[しい]|無[しい])|意識(?:が|は)?戻(?:ら|って(?:い)?な)|意識を失|意識不明|気を失|失神|昏倒|昏睡|気絶/;
  var UNCON_NOT = /意識(?:が|は|も)?(?:戻っ(?:た|ている|てき)|はっきりし|ある|あり|清明)|(?:目|眼)を(?:開け|覚ま)|目覚め|覚醒し/;
  var SEV_RE = /大量(?:の)?出血|出血多量|出血(?:が|は)?(?:激し|止まら|多[いく]|続|継続|ひど|酷)|血が(?:止まら|噴)|失血|瀕死|虫の息|危篤|重体|衰弱(?:が|は)?(?:激し|ひど|酷|著し|している|しきっ)|呼吸(?:が|は)?(?:弱|浅く途切|止ま)|脈(?:が|は)?(?:弱|触れな)|心肺停止/;
  var SEV_NOT = /(?:出血|血)(?:が|は|も)?(?:止ま(?:った|ってい)|収ま(?:った|ってい)|おさま(?:った|ってい))|止血(?:済|した|された|できた|が済|完了)|手当て(?:済|が済|を終え)|(?:呼吸|脈)(?:が|は|も)?(?:落ち着(?:いた|いてい)|安定し)|容体(?:が|は)安定/g;
  var AWAKE_KA = /立(?:って|ち上が|ち尽)|歩(?:い|き|く)|走(?:っ|り|る)|座(?:って|り直)|話し(?:て|かけ)|喋|見つめ|見上げ|見据え|頷|うなず|握り返|身を起こ|振り返/;
  // sevClass(ka, ki) → 'U' | 'S' | ''（値だけからの判定。その後の本文の回復は recovered() で別に見る）
  function sevClass(ka, ki){
    ka = String(ka || ''); ki = String(ki || '');
    if (!ka && !ki) return '';
    var uKa = UNCON_RE.test(ka) && !UNCON_NOT.test(ka), uKi = UNCON_RE.test(ki) && !UNCON_NOT.test(ki);
    if (uKa) return 'U';
    if (uKi && !(ka && AWAKE_KA.test(ka)) && !UNCON_NOT.test(ka)) return 'U';   // 傷の記録は意識なし、からだ は起きて動いている → 食い違い＝認定しない
    var raw = ka + '／' + ki, both = raw.replace(SEV_NOT, '／');
    if (both !== raw && /止血|(?:出血|血)(?:が|は|も)?(?:止ま|収ま|おさま)|手当て/.test(raw)) both = both.replace(/大量(?:の)?出血|出血多量|出血(?:が|は)?(?:激し|止まら|多[いく]|続|継続|ひど|酷)[ぁ-ん]*|血が(?:止まら|噴)[ぁ-ん]*|失血/g, '／');   // 止血・手当て済みと書かれた記録の出血は数えない
    if (SEV_RE.test(both)) return 'S';
    return '';
  }
  function severe(v){ return sevClass(v, '') !== ''; }
  // その後の本文（値が書かれたターンより後の地の文で、その人の名と同じ文）に、覚醒／治療が描かれたか
  var AWAKE_RE = /目を開け|目を覚ま|意識が戻|意識を取り戻|気がつい|気が付い|息を吹き返|起き上が|身を起こ|薄く目を|瞼(?:が|を)(?:開|持ち上)/;
  var TREAT_RE = /血が止ま|出血が(?:止|収|おさ)ま|止血(?:が|を)?(?:終え|済|でき|した)|包帯を巻き終え|手当て(?:が|を)?(?:終え|済)|縫合(?:が|を)?(?:終え|済)|傷口を(?:縫い終え|塞)/;
  function seenAfter(state, name, sinceTurnIdx, re){
    try {
      var turns = (state && state.turns) || [], nm = String(name || ''); if (!nm) return false;
      for (var i = Math.max(0, (sinceTurnIdx | 0) + 1); i < turns.length; i++){
        var ss = splitNarr(turns[i] && turns[i].narrative, []);
        for (var k = 0; k < ss.length; k++) if (ss[k].indexOf(nm) >= 0 && re.test(ss[k])) return true;
      }
    } catch(e){}
    return false;
  }
  function recovered(state, name, sinceTurnIdx){ return seenAfter(state, name, sinceTurnIdx, AWAKE_RE) || seenAfter(state, name, sinceTurnIdx, TREAT_RE); }
  // sevNow(state, name, entryTurn, ka, ki) → 'U' | 'S' | ''（その後の本文の覚醒・治療を反映）
  function sevNow(state, name, entryTurn, ka, ki){
    var c = sevClass(ka, ki); if (!c) return '';
    if (c === 'U'){ if (seenAfter(state, name, entryTurn, AWAKE_RE)) { c = sevClass(String(ka || '').replace(UNCON_RE, '／'), String(ki || '').replace(UNCON_RE, '／')); } }
    if (c === 'S' && seenAfter(state, name, entryTurn, TREAT_RE)) c = '';   // 治療が描かれた → 制約の行からは外す（傷の記録はそのまま残る）
    return c;
  }
  function severeLine(uNames, sNames){
    var p = [];
    if (uNames && uNames.length) p.push('意識不明の人物（いま該当：' + uNames.join('・') + '）は、目を覚ます・意識が戻る根拠が本文に描かれるまで、自発的に話したり意図して動いたりできない');
    if (sNames && sNames.length) p.push('重い出血・衰弱のある人物（いま該当：' + sNames.join('・') + '）は、意識・姿勢・動き・話せる量に制約がある（落ち着いた態度でいてもよいが、損傷を無かったことにしない）');
    if (!p.length) return '';
    return '・' + p.join('。') + '。治療や回復が描かれたら、その程度に応じて状態を更新する。';
  }

  // ---- DRIVE1 r2: 本能・目的 が「主人公の指示・返事を待つ」だけの定型のとき ----
  //   待つ句を除いた残りに別の中身（自分の行動・狙い）があれば、その値は落とさない。
  function driveSpans(v, hero){
    var h = hero ? esc(String(hero)) : null;
    var who = '(?:主人公|あなた|君|きみ|相手|皆|みんな|誰か' + (h ? '|' + h + '(?:さん|くん|君|ちゃん|様)?' : '') + ')';
    return [
      new RegExp('(?:' + who + '(?:の|から(?:の)?|に))?(?:次の|つぎの)?指示(?:を|が)?(?:求め|待|仰|欲し|ほし|もらい)[ぁ-ん]*', 'g'),
      new RegExp('(?:' + who + '(?:の|に|へ))?(?:判断|決断|決定|命令|合図)(?:を|に)?(?:委ね|任せ|待|求め|仰)[ぁ-ん]*', 'g'),
      new RegExp('(?:' + who + '(?:に|が))?決めて(?:もらい|ほし|欲し|くれるのを待)[ぁ-ん]*', 'g'),
      new RegExp(who + '(?:の|が)(?:次の)?(?:言葉|返事|返答|答え|反応|出方|動き|一言)(?:を)?(?:待|窺|うかが)[ぁ-ん]*', 'g')
    ];
  }
  function drive(v, hero){
    v = String(v || ''); if (!v) return false;
    var rest = v, hit = false;
    driveSpans(v, hero).forEach(function(re){ rest = rest.replace(re, function(){ hit = true; return '／'; }); });
    if (!hit) return false;
    rest = rest.replace(/[\s　・、。,，．.／\/（）()「」:：\-ー―]/g, '').replace(/(?:ている|ていた|ながら|つつ|まま|だけ|ただ|じっと|黙って|静かに|その場で|次の|いる|する|こと|たい|の|を|に|は|が|て|で|と|も)/g, '');
    return rest.length < 3;   // 待つ以外の中身が残るなら落とさない
  }

  // ---- EX192: fix192 のミニ見本（自発の掛け合い）の差し替え（置き換えだけ。行数は増やさない） ----
  //   いまの見本は相手 B が「……ねえ、あんたが決めて」と決定を主人公へ渡す。差し替えは「自分の目的・恐怖・立場に応じて判断し、実行できる範囲で動く」姿を 1 つ示す。
  var EX192 = {
    A: [   // 案 A: 台詞あり（B は自分の恐れから判断し、できる範囲のことを自分で始める）
      '─ミニ見本（自発の掛け合いの例。台詞はこの場面だけのもので、型として使い回さない。短いのは抜粋なので、本文の長さの参考にはしない）─',
      '<say who="相手A">手当てが先よ。歩かせる気？</say>',
      '<say who="相手B">ここに居る方が危ない。……出口を見てくる。戻るまでに縛り終えて</say>',
      '相手Bは返事を待たずに戸口へ向かう。相手Aは布を裂く手を止めない。',
      '<react who="相手A" 反応="自分の役目（止血）を続ける" 声="<say who=\'相手A\'>縛り終えるまで、この人は動かさない</say>"/>'
    ].join('\n'),
    B: [   // 案 B: B の台詞を置かず、地の文で「立場と恐れから判断して動く」姿を示す
      '─ミニ見本（自発の掛け合いの例。人物は自分の目的・恐れ・立場から判断し、実行できる範囲で動く。短いのは抜粋なので、本文の長さの参考にはしない）─',
      '<say who="相手A">手当てが先よ。歩かせる気？</say>',
      '相手Bは首を振り、物音のする戸口を確かめに行く。言い争うより先に、いま自分にできること——荷をまとめる——に手をつけた。',
      '相手Aは布を裂く手を止めない。二人はそれぞれの理由で、別々に動き出している。',
      '<react who="相手A" 反応="自分の役目（止血）を続ける" 声="<say who=\'相手A\'>縛り終えるまで、この人は動かさない</say>"/>'
    ].join('\n')
  };

  root.__v292DfixSevDrvCore = { VER: VER, severeOn: severeOn, driveOn: driveOn, ex192: ex192, EX192: EX192,
    severe: severe, sevClass: sevClass, sevNow: sevNow, recovered: recovered, severeLine: severeLine,
    drive: drive, splitNarr: splitNarr };
})(typeof window !== 'undefined' ? window : globalThis);
