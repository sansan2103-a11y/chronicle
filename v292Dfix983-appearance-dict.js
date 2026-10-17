/* v292Dfix983 — I-0 B：設定文（日本語）から外見の英語句を「決まった語の対応表」で作る（Local 設計・未配信）
 *
 * 目的：fix766 の 12 軸 enum では落ちてしまう外見（服の色と種類・小物・目元・ほくろ・八重歯・表情など）を、
 *       LLM を使わず決定的に英語句へ変える。同じ設定文からは、いつも同じ句が出る。
 * 方針（GPT #127-BC／#127-BE）：
 *   - 対応表が主軸。fix461（LLM 英訳）は、対応表で拾えなかった外見の文だけの補助・比較。
 *   - 外見の文を黙って落とさない：拾えなかった部分は unmapped[] に必ず残す（件数を計測し、補助経路へ渡せる）。
 *   - chrAiAv4 の記録は使わない。名前・日本語は句に入れない（p8d 準拠）。
 *   - 保存しない（純関数）。fix766 の記録・キー・seed は変えない。
 * 公開：window.__v292Dfix983 = { extract(desc, gender), VERSION }   ／ node: module.exports 同じ
 */
(function (root) {
  'use strict';
  var VERSION = 'fix983-r12';

  /* ---------- 色・修飾 ---------- */
  var COLORS = [
    [/明るい茶色?|明るめの茶色?|ライトブラウン/, 'light brown'], [/焦げ茶色?|こげ茶色?|ダークブラウン/, 'dark brown'],
    [/茶色がかった/, 'brownish'], [/栗色/, 'chestnut brown'], [/琥珀色?/, 'amber'], [/深緑|濃い緑/, 'dark green'], [/藤色|薄紫/, 'lilac'], [/緋色?|真紅|深紅/, 'scarlet'],
    [/オレンジ色?|橙色?/, 'orange'], [/白銀/, 'silvery white'], [/薄いピンク|淡いピンク/, 'pale pink'], [/ダークグレー|濃い灰色|チャコール/, 'charcoal gray'], [/褐色/, 'dark brown'], [/墨染め/, 'black'], [/白髪まじり|白髪混じり/, 'salt-and-pepper'], [/赤茶色?/, 'auburn'],
    [/黒い?|黒色/, 'black'], [/白い?|白色/, 'white'], [/紺色?|ネイビー/, 'navy'], [/グレー|灰色/, 'gray'],
    [/茶色|茶/, 'brown'], [/赤い?/, 'red'], [/青い?/, 'blue'], [/緑色?/, 'green'], [/金色?/, 'golden'], [/銀色?/, 'silver'],
    [/ピンク/, 'pink'], [/紫色?/, 'purple'], [/ベージュ/, 'beige'], [/黄色い?/, 'yellow'], [/水色/, 'light blue'],
    [/柔らかい色の?|淡い色の?|パステル/, 'soft pastel'], [/無地の?/, 'plain'], [/派手な/, 'flashy'], [/地味な/, 'plain'],
    [/オーバーサイズの?|大きめの|大きな|ぶかぶかの/, 'oversized'], [/細身の/, 'slim'], [/良い|上等な|高そうな/, 'fine'],
    [/作業用の/, 'work'], [/毛玉のついた/, 'pilled'], [/履き潰した|くたびれた|使い込んだ/, 'worn-out'], [/整えた|きちんとした/, 'neat'],
    [/木綿の/, 'cotton'], [/革の|レザーの?/, 'leather'], [/鉄の/, 'iron'], [/銀の/, 'silver'], [/金の/, 'gold'], [/着崩した/, 'loosely worn'], [/つぎはぎ(?:だらけ)?の/, 'patched'],
    [/擦り切れた|すり切れた|ぼろぼろの|ボロボロの/, 'frayed'], [/油で汚れた|汚れた/, 'stained'], [/半袖の?/, 'short-sleeved'], [/長袖の?/, 'long-sleeved'], [/星形の/, 'star-shaped'], [/歩きやすい/, 'comfortable'], [/古い/, 'old'], [/薄手の/, 'thin'], [/厚手の/, 'thick']
  ];
  var BASIC = ['chestnut brown','amber','dark green','lilac','scarlet','orange','silvery white','pale pink','charcoal gray','light brown','dark brown','brownish','auburn','black','white','navy','gray','brown','red','blue','green','golden','silver','pink','purple','beige','yellow','light blue','soft pastel'];
  function modsBefore(text, idx) {             // item の直前（最大 12 字）にある色・修飾を順に拾う
    var pre = text.slice(Math.max(0, idx - 12), idx), out = [], used = [];
    COLORS.forEach(function (c) {
      var re = new RegExp(c[0].source, 'g'), m;
      while ((m = re.exec(pre))) {
        var s = m.index, e = s + m[0].length;
        if (used.some(function (u) { return s < u[1] && e > u[0]; })) continue;
        used.push([s, e]); out.push([s, c[1]]);
      }
    });
    out.sort(function (a, b) { return a[0] - b[0]; });
    var words = []; out.forEach(function (o) { if (words.indexOf(o[1]) < 0) words.push(o[1]); });
    // 区切り（、や）の後ろだけを有効にする：別の品物の色を拾わない
    var cut = Math.max(pre.lastIndexOf('、'), pre.lastIndexOf('，'), pre.lastIndexOf('と'), pre.lastIndexOf('に'), pre.lastIndexOf('を'));
    words = []; var haveColor = false, ambiguousHit = false;
    out.forEach(function (o) {
      if (o[0] <= cut || words.indexOf(o[1]) >= 0) return;
      var isColor = BASIC.indexOf(o[1]) >= 0;
      if (isColor && haveColor) {                  // 「グレーや紺のパーカー」→ 'gray or navy'（どちらかに決めない・GPT #127-BH）
        for (var q = words.length - 1; q >= 0; q--) if (BASIC.indexOf(words[q].split(' or ')[0]) >= 0) { words[q] = words[q] + ' or ' + o[1]; break; }
        ambiguousHit = true; return;
      }
      if (isColor) haveColor = true; words.push(o[1]);
    });
    return { words: words, from: cut >= 0 ? idx - pre.length + cut + 1 : idx - pre.length, ambiguous: ambiguousHit };
  }

  /* ---------- 服・小物（色の修飾を前に付ける） ---------- */
  var ITEMS = [
    // [正規表現, 英語, 欄]
    [/パーカー/, 'hoodie', 'top'], [/スウェット/, 'sweatshirt', 'top'], [/Tシャツ|ティーシャツ/, 'T-shirt', 'top'],
    [/ニット帽/, 'knit cap', 'acc'], [/ニット(?!帽)|セーター/, 'knit sweater', 'top'], [/カーディガン/, 'cardigan', 'top'], [/ブラウス/, 'blouse', 'top'],
    [/ワイシャツ|シャツ/, 'shirt', 'top'], [/ベスト/, 'vest', 'top'], [/ジャケット/, 'jacket', 'top'], [/コート/, 'coat', 'top'],
    [/パンツスーツ/, 'pantsuit', 'top'], [/スーツ/, 'suit', 'top'], [/トレンチコート/, 'trench coat', 'top'], [/レザージャケット|革ジャン/, 'leather jacket', 'top'], [/サファリジャケット/, 'safari jacket', 'top'],
    [/ブレザー/, 'blazer', 'top'], [/タンクトップ/, 'tank top', 'top'], [/ローブ/, 'robe', 'top'], [/マント|外套|ケープ/, 'cloak', 'top'], [/甲冑|鎧/, 'armor', 'top'], [/胸当て/, 'breastplate', 'top'],
    [/作業着|作業つなぎ|(?:^|[のに、])つなぎ(?:服)?(?=[、。をにで]|$)/, 'work coveralls', 'top'], [/ナース服/, 'nurse uniform', 'top'], [/燕尾服/, 'tailcoat', 'top'], [/ボディスーツ/, 'bodysuit', 'top'], [/メイド服/, 'maid uniform', 'top'],
    [/割烹着/, 'kappogi apron smock', 'top'], [/布をまとった衣装|布を巻いた衣装/, 'flowing draped cloth costume', 'top'], [/衣装/, 'costume', 'top'], [/墨染めの衣|法衣|袈裟/, 'black buddhist monk robes', 'top'], [/(?:^|[のにをと、])帯(?=[をにでのと、。]|$)/, 'obi sash', 'top'], [/腕カバー/, 'arm covers', 'acc'], [/白衣/, 'WHITE_COAT', 'top'], [/制服/, 'school uniform', 'top'], [/学ラン/, 'gakuran school uniform', 'top'],
    [/セーラー服/, 'sailor school uniform', 'top'], [/着物|和服/, 'kimono', 'top'], [/浴衣/, 'yukata', 'top'], [/作務衣/, 'samue work clothes', 'top'],
    [/エプロン|前掛け/, 'apron', 'top'], [/ジャージ/, 'track jacket', 'top'],
    [/ワンピース/, 'one-piece dress', 'top'], [/ドレス/, 'dress', 'top'], [/防火服|防護服/, 'protective uniform', 'top'],
    [/ショートパンツ|短パン/, 'shorts', 'bottom'], [/デニム|ジーンズ|ジーパン/, 'jeans', 'bottom'], [/ロングスカート/, 'long skirt', 'bottom'],
    [/スカート/, 'skirt', 'bottom'], [/半ズボン/, 'shorts', 'bottom'], [/パンツ|ズボン|スラックス/, 'pants', 'bottom'], [/袴/, 'hakama', 'bottom'],
    [/スニーカー/, 'sneakers', 'shoes'], [/ローファー/, 'loafers', 'shoes'], [/ブーツ/, 'boots', 'shoes'], [/下駄|草履|草鞋/, 'sandals', 'shoes'],
    [/靴下/, 'socks', 'shoes'], [/長靴/, 'rubber boots', 'shoes'], [/裸足/, 'barefoot', 'shoes'],
    [/銀縁(?:の)?眼鏡|銀縁(?:の)?メガネ/, 'silver-rimmed glasses', 'acc'], [/黒縁(?:の)?眼鏡|黒縁(?:の)?メガネ/, 'black-rimmed glasses', 'acc'],
    [/片眼鏡|モノクル/, 'monocle', 'acc'], [/丸眼鏡/, 'round glasses', 'acc'], [/眼鏡|メガネ|めがね/, 'glasses', 'acc'], [/手袋/, 'gloves', 'acc'], [/リュック|バックパック/, 'backpack', 'acc'],
    [/トートバッグ/, 'tote bag', 'acc'], [/バッグ|鞄|かばん/, 'bag', 'acc'], [/腕時計|(?:^|[にのを、])時計(?!職人|塔|台|屋)/, 'wristwatch', 'acc'], [/名札/, 'name tag', 'acc'],
    [/イヤホン|ヘッドホン/, 'earphones', 'acc'], [/マフラー/, 'scarf', 'acc'], [/帽子|キャップ/, 'cap', 'acc'], [/ネクタイ/, 'necktie', 'acc'],
    [/ネックレス/, 'necklace', 'acc'], [/ピアス|イヤリング/, 'piercings', 'acc'], [/ヘアピン|髪留め/, 'hair clip', 'acc'], [/リボン/, 'ribbon', 'acc'],
    [/ネイル/, 'nail polish', 'acc'], [/リップ|口紅/, 'lipstick', 'acc'], [/ゴーグル/, 'goggles', 'acc'], [/ねじり鉢巻|鉢巻/, 'twisted headband', 'acc'],
    [/ランドセル/, 'randoseru school backpack', 'acc'], [/杖/, 'staff', 'acc'], [/短剣|ナイフ/, 'dagger', 'acc'], [/双剣/, 'twin swords', 'acc'], [/(?:腰|背)に[^、。]{0,6}(?:剣|刀)|刀を(?:差|帯|携|佩)|剣を(?:帯|携|背負|佩)|帯刀/, 'sword', 'acc'], [/絆創膏/, 'adhesive bandage', 'acc'],
    [/麦わら帽子/, 'straw hat', 'acc'], [/カチューシャ/, 'headband', 'acc'], [/シュシュ/, 'scrunchie', 'acc'], [/髪飾り/, 'hair ornament', 'acc'], [/腕輪|ブレスレット/, 'bracelet', 'acc'],
    [/数珠/, 'prayer beads', 'acc'], [/タオル/, 'towel around the neck', 'acc'], [/アイライン/, 'heavy eyeliner', 'acc']
  ];
  var CAMERA = [/フィルムカメラ/, 'film camera'], DSLR = [/一眼レフ?|デジタル一眼/, 'DSLR camera'];

  /* 職業・種族が見た目をはっきり決めるものだけ（服装の手がかりが他に無いときに使う） */
  var ROLE_LOOK = [
    [/巫女/, 'top', 'white and red miko shrine maiden outfit'], [/メイド/, 'top', 'maid uniform'], [/看護師|ナース/, 'top', 'nurse uniform'],
    [/騎士/, 'top', 'knight armor'], [/警察官|巡査|警官/, 'top', 'police uniform'], [/消防士/, 'top', 'firefighter uniform'],
    [/医師|医者|救急医/, 'top', 'white lab coat'], [/住職|僧侶|和尚/, 'top', 'buddhist monk robes'], [/神主|神職/, 'top', 'white shinto priest robes'],
    [/板前|料理人|シェフ/, 'top', 'white chef uniform'], [/救急隊員|救急隊長|救急隊/, 'top', 'paramedic uniform'], [/学生服|高校生|中学生|女子高生|男子高校生/, 'top', 'school uniform'],
    [/アンドロイド|人造人間/, 'species', 'android'], [/ロボット|機械人形/, 'species', 'robot'], [/サイボーグ|義体/, 'species', 'cyborg'], [/吸血鬼|ヴァンパイア/, 'species', 'vampire'], [/エルフ/, 'species', 'elf'], [/(?:^|[はがも])鬼(?:族|の一族|の娘|の青年|の女|の男)?(?:である|だ|で|。|$)/, 'species', 'oni with small horns']
  ];

  /* ---------- 髪 ---------- */
  var HAIR_STYLE = [
    [/ショートボブ/, 'short bob'], [/ボブ/, 'bob cut'], [/セミロング/, 'shoulder-length'], [/ロングヘア|長髪|長い髪|肩より長い髪/, 'long'],
    [/肩甲骨まで/, 'long'], [/肩まで|肩にかかる/, 'shoulder-length'], [/顎まで|あごまで/, 'chin-length'],
    [/短髪|短い|ショートヘア|ショート(?!パンツ)/, 'short'], [/坊主頭?|丸刈り/, 'buzz-cut'], [/スキンヘッド/, 'shaved head'],
    [/癖毛|くせ毛|癖のある|天然パーマ/, 'slightly wavy messy'], [/ストレート/, 'straight'], [/ポニーテール/, '+in a ponytail'],
    [/ゆるく一つに束ね|ゆるく束ね/, '+loosely tied back in a single low ponytail'], [/雑に束ね/, '+messily tied back'], [/一つに束ね|一つ結び/, '+tied back in a single ponytail'],
    [/固く結い|きっちり結い|固く結っ/, '+tightly tied up'], [/束ね|結っ|結い|結わえ/, '+tied up'], [/おさげ|三つ編み/, '+in braids'], [/お団子/, '+in a bun'],
    [/耳にかけ/, '+tucked behind the ears'], [/前髪は?眉の上で揃え|ぱっつん/, '+with straight-cut bangs above the eyebrows'], [/前髪/, '+with bangs'],
    [/柔らかい|柔らかく|ふわふわ/, 'soft'], [/ぼさぼさ|ボサボサ|無造作/, 'messy'], [/ツインテール|二つ結び|ツインテ/, '+in twin tails'], [/サイドテール/, '+in a side ponytail'],
    [/おかっぱ/, 'blunt bob'], [/オールバック/, 'slicked-back'], [/七三分け/, 'neatly side-parted'], [/ウェーブ|波打つ/, 'wavy'], [/ショートカット|短く切った|短く刈った|刈り上げ/, 'short'], [/ロングストレート/, 'long straight'], [/ロング/, 'long'], [/ゆるい|ゆるく(?!束ね|一つ)/, 'loose'], [/腰まで(?:ある)?/, 'very long waist-length'], [/色素の薄い/, 'pale'],
    [/後ろで一つに結び|後ろで一つに結っ|後ろで結/, '+tied back in a single ponytail'], [/きっちり(?:まとめ|結い|結っ)/, '+tightly tied up'], [/白い紙で束ね|和紙で束ね|紙で束ね/, '+tied back with a white paper ribbon'], [/ハーフアップ/, '+in a half-up style'],
    [/ミディアム/, 'medium-length'], [/染めた/, 'dyed'], [/剃髪|剃り上げ/, 'shaved head'], [/禿げ上が|禿げ頭|禿げ|禿頭/, 'bald'], [/髷|ちょんまげ/, '+in a topknot'], [/編んだ|編み込み/, '+braided'], [/まとめ/, '+tied up'], [/ある長い|長い/, 'long'], [/伸ばした/, 'long']
  ];
  var HAIR_COLOR = [
    [/明るい茶色|明るい茶/, 'light brown'], [/焦げ茶|こげ茶/, 'dark brown'], [/茶色がかった/, 'brownish'], [/白髪まじり|白髪混じり|に白髪/, 'graying salt-and-pepper'],
    [/赤毛/, 'red'], [/白髪/, 'white'], [/銀髪/, 'silver'], [/金髪/, 'blonde'], [/赤毛|赤髪/, 'red'], [/茶髪|茶色/, 'brown'], [/黒髪|黒い髪|黒/, 'black']
  ];
  var HAIR_CUE = /髪|ヘア|ボブ|前髪|癖毛|くせ毛|束ね|結い|結っ|結び|坊主|短髪|長髪|セミロング|ショート(?!パンツ)|ポニーテール|三つ編み|お団子|ツインテール|サイドテール|おかっぱ|オールバック|七三分け|剃髪|禿げ|髷|赤毛|編んだ/;

  /* ---------- 目・顔・特徴・表情・雰囲気 ---------- */
  var EYES = [
    [/丸い大きな目|大きな丸い目|大きく丸い目/, 'large round eyes'], [/大きめの?|大きな/, null], [/丸い目/, 'round eyes'], [/垂れ目|たれ目/, 'gentle droopy eyes'],
    [/切れ長/, 'narrow almond-shaped eyes'], [/つり目|吊り目/, 'sharp upturned eyes'], [/焦げ茶色?の瞳/, 'dark brown eyes'], [/黒い?瞳/, 'black eyes'],
    [/茶色の瞳/, 'brown eyes'], [/青い?瞳|碧眼/, 'blue eyes'], [/(?:まつ毛|睫毛)が?(?:やや|少し)?長[いく]|長いまつ毛|長い睫毛/, 'long eyelashes'],
    [/目元が優しい|優しい目|柔らかな目/, 'kind gentle eyes'], [/気だるげな目(?:つき)?|眠そうな目/, 'sleepy half-lidded eyes'], [/ぱっちりした目|ぱっちり/, 'big bright eyes'],
    [/疲れた目/, 'tired eyes'], [/鋭い目(?:つき|元)?/, 'sharp eyes'], [/無機質な/, 'emotionless'], [/落ち着いた目/, 'calm eyes'], [/鋭い目|眼光/, 'sharp eyes'], [/父に似た目/, null]
  ];
  var FACE = [
    [/童顔|幼く可愛い顔立ち|幼い顔立ち/, 'youthful baby face'], [/中性的な顔/, 'androgynous face'], [/丸い顔|丸顔/, 'round face'],
    [/小さな顔|小顔/, 'small face'], [/柔らかな口元/, 'soft lips'], [/面長/, 'long face'], [/彫りの深い/, 'deep-set features'],
    [/色白|白い肌/, 'fair pale skin'], [/日焼けした肌|日焼け(?:した)?|日に焼けた/, 'tanned skin'], [/薄化粧/, 'light natural makeup'],
    [/隈(?!取)|クマ/, 'dark circles under the eyes'], [/乾いた唇/, 'dry lips'], [/皺だらけ|しわだらけ|皺の深い/, 'deeply wrinkled'], [/焼けた肌|褐色の肌/, 'tanned brown skin'],
    [/太い眉/, 'thick eyebrows'], [/白い眉/, 'white eyebrows'], [/汚れた頬/, 'smudged cheeks']
  ];
  var FEATURES = [
    [/左目の下に泣きぼくろ|左目下の泣きぼくろ/, 'beauty mark under the left eye'], [/右目の下に泣きぼくろ|右目下の泣きぼくろ/, 'beauty mark under the right eye'],
    [/泣きぼくろ/, 'beauty mark under one eye'], [/ほくろ/, 'small mole'], [/八重歯/, 'visible snaggletooth'], [/そばかす/, 'freckles'],
    [/尖った耳|とがった耳|エルフ耳/, 'pointed elf ears'], [/(?<!象)牙(?!城)/, 'small fangs'], [/(?:頭|額)に[^、。]{0,4}角|角が生え|角を生や|二本の角|一本角/, 'horns'], [/隈取り?/, 'red kabuki-style face paint'], [/刀傷|切り傷/, 'old blade scar'], [/眉に?ピアス/, 'eyebrow piercing'], [/火傷の(?:痕|跡)/, 'burn scars'], [/(?:歯が)?一本抜け/, 'a missing front tooth'],
    [/右頬(?:に)?(?:大きな)?傷/, 'scar on the right cheek'], [/左頬(?:に)?(?:大きな)?傷/, 'scar on the left cheek'], [/(?:左|右)目の上(?:に)?(?:古い)?傷/, 'old scar above one eye'], [/鼻に絆創膏/, 'adhesive bandage on the nose'],
    [/擦り傷/, 'scraped knees'], [/継ぎ目/, 'visible mechanical panel seams'], [/濃い顎髭|顎髭|あごひげ/, 'thick beard'], [/白い口髭|白い口ひげ/, 'white mustache'], [/口髭|口ひげ/, 'mustache'], [/首筋(?:に)?(?:パネルの)?継ぎ目/, 'visible mechanical panel seams on the neck'],
    [/袖を余らせ/, 'oversized sleeves covering the hands'], [/額にかけ/, 'FOREHEAD'],
    [/左眉の傷/, 'scar across the left eyebrow'], [/右眉の傷/, 'scar across the right eyebrow'], [/頬の傷/, 'scar on the cheek'], [/傷跡|古傷/, 'facial scar'],
    [/右目(?:が)?白濁/, 'clouded white right eye'], [/左目(?:が)?白濁/, 'clouded white left eye'], [/眼帯/, 'eye patch'],
    [/右肘以下は義手|右腕は義手/, 'prosthetic right forearm'], [/左肘以下は義手|左腕は義手/, 'prosthetic left forearm'], [/義手/, 'prosthetic arm'],
    [/無精髭|無精ひげ/, 'stubble'], [/髭|ひげ/, 'beard'], [/小さな丸い背中|丸い背中|腰が曲が/, 'slightly hunched back'], [/細い指/, null], [/肩幅/, 'broad shoulders'], [/背筋は?真っ直ぐ|姿勢が良い/, 'upright posture'],
    [/鉛筆をかんざし代わりに挿す|鉛筆をかんざし/, 'a pencil stuck in the hair like a hairpin'], [/かんざし|簪/, 'kanzashi hairpin'],
    [/袖をまくった/, 'SLEEVES'], [/左手薬指(?:が)?欠損/, 'missing left ring finger'], [/右手(?:の)?指(?:が)?欠損|指(?:が)?欠損/, 'missing finger']
  ];
  var EXPRESSION = [
    [/笑うと八重歯が見える/, 'cheerful smile showing a snaggletooth'], [/笑うと/, null], [/元気|明るい性格|快活/, '~bright energetic expression'],
    [/柔らかな雰囲気/, 'soft gentle expression'], [/穏やか/, '~soft gentle expression'], [/落ち着いて|落ち着いた/, '~calm composed expression'], [/無表情|表情が乏しい/, 'blank expression'],
    [/冷静/, '~cool composed expression'], [/気が強い/, '~strong-willed confident expression'], [/ぶっきらぼう/, '~gruff stern expression'],
    [/照れ屋|控えめ|優しく/, '~shy gentle expression'], [/少年らしい雰囲気/, 'boyish look'], [/笑顔が柔らかい|穏やかな笑顔|柔らかな笑顔/, 'soft warm smile'], [/疲れた表情/, 'tired expression'],
    [/(?:穏やかな|柔らかな)表情/, 'calm gentle expression'], [/笑顔/, 'smiling']
  ];
  var BUILD = [   // fix766 にも同じ情報がある（bodyBuild）。句には「小柄」等の見た目の手がかりだけ短く入れる
    [/小柄/, 'petite'], [/華奢/, 'slender delicate frame'], [/すらりとした|スラッとした/, 'tall slender figure'], [/大柄/, 'large burly build'],
    [/痩せ型|細身|痩せて(?:いる)?|痩せた/, 'slim build'], [/がっしり/, 'sturdy build'], [/筋骨隆々|筋肉質/, 'muscular build'], [/太い腕/, 'thick muscular arms']
  ];

  /* ---------- 非外見の文（落としてよい）の判定 ---------- */
  var NON_APPEARANCE = /手当て|一人称|口調|話す|声は|声が|性格|出身|学科|大学院?|高校\d|年生|修士|契約者|得意|専攻|呼ぶ|呼び|仮入会|伝承研|上司|部下|幼馴染|一人娘|妻|娘|息子|失踪|事故|秘密|プレイヤー|知らない|巻き戻|匂い|登録者|委員|部$|美術部|吹奏楽部|生活|世話|清掃|旅|心得|目撃|経営|店主|司書|住職|刑事|医|教諭|隊長|隊員|消防士|店員|配信者|古物商|女将|若衆|薬売り|授業|一人暮らし|引っ越|アパート|入学|進学|料理|応急処置|成長|英雄|知識|間違われる|行動|放って|慣れ|敏感|聞く|弱く|怖い|無頓着|清潔感|持ち歩く|入って|題材|取材|言い回し|標準語|関西弁|丁寧語|ございます/;
  var APPEARANCE_CUE = new RegExp([HAIR_CUE.source, '目|瞳|睫毛|まつ毛|眉|肌|色白|日焼|日に焼|顔|口元|唇|ほくろ|八重歯|傷|隈|眼鏡|メガネ|cm|身長|体型|細身|痩せ|小柄|大柄|華奢|すらり|肩幅|服|着て|着け|着物|パーカー|シャツ|ニット|セーター|カーディガン|ブラウス|スカート|パンツ|デニム|スウェット|ベスト|コート|スーツ|制服|白衣|エプロン|前掛け|手袋|義手|スニーカー|靴|ローファー|ネイル|化粧|雰囲気|童顔|顔立ち|カメラ|リュック|バッグ|かんざし|時計|名札|イヤホン|白濁|髭|姿勢|背筋|指|耳|頬|歯|鼻|牙|角|ブーツ|ローブ|マント|外套|鎧|胸当て|帽|リボン|飾り|装|衣|帯|つなぎ|作業着|ジャケット|燕尾服|ワンピース|ドレス|剣|刀|杖|ゴーグル|ランドセル|裸足|絆創膏|火傷|皺|筋肉|腕|背中|笑顔|表情|ナース服|メイド|割烹着|数珠|タオル|シュシュ|カチューシャ|ネックレス|ピアス|口紅|アイライン|ブレザー|タンクトップ'].join('|'));

  function kanjiNum(t) {             // 〇一二…九・十・百 の組み合わせ（例：四十八→48・八十→80・百二→102）
    var D = '〇一二三四五六七八九', n = 0, cur = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i), d = D.indexOf(c);
      if (d >= 0) cur = d;
      else if (c === '十') { n += (cur || 1) * 10; cur = 0; }
      else if (c === '百') { n += (cur || 1) * 100; cur = 0; }
      else return null;
    }
    return n + cur;
  }
  function ageOf(desc) {
    var d = String(desc || '');
    var m = d.match(/(?:^|[^\d])(\d{1,3})\s*歳/); if (m) return { years: +m[1] };
    m = d.match(/数え(?:年)?で?([〇一二三四五六七八九十百]{1,4}|\d{1,3})/); if (m) { var kk = /\d/.test(m[1]) ? +m[1] : kanjiNum(m[1]); if (kk) return { years: kk }; }
    m = d.match(/(?:^|[^〇一二三四五六七八九十百齢])([〇一二三四五六七八九十百]{1,4})歳/); if (m) { var k = kanjiNum(m[1]); if (k != null && k > 0 && k < 130) return { years: k }; }
    m = d.match(/([二三四五六七八九])十代(前半|後半|半ば)?/); if (m) return { decade: ('一二三四五六七八九'.indexOf(m[1]) + 1) * 10, part: m[2] === '半ば' ? '' : (m[2] || '') };
    m = d.match(/(\d)0代(前半|後半|半ば)?/); if (m) return { decade: +m[1] * 10, part: m[2] === '半ば' ? '' : (m[2] || '') };
    m = d.match(/([二三四五六七八九])十がらみ/); if (m) return { decade: ('一二三四五六七八九'.indexOf(m[1]) + 1) * 10, part: '' };
    return null;
  }

  function splitClauses(desc) {
    return String(desc || '').replace(/（[^）]*）|\([^)]*\)/g, '、').replace(/「[^」]*」/g, '、')
      .split(/[。．\n]|\s\/\s|：/).map(function (s) { return s.trim(); }).filter(Boolean)
      .reduce(function (a, s) { return a.concat(s.split(/[、，,]/)); }, []).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function covers(spans, s, e) { return spans.some(function (u) { return s < u[1] && e > u[0]; }); }
  function scan(text, table, spans, onHit) {
    table.forEach(function (row) {
      var re = new RegExp(row[0].source, 'g'), m;
      while ((m = re.exec(text))) {
        var s = m.index, e = s + m[0].length; if (!m[0].length) { re.lastIndex++; continue; }
        if (covers(spans, s, e)) continue;
        spans.push([s, e]); if (row[1]) onHit(row, m, s);
      }
    });
  }
  function push(arr, v) { if (v && arr.indexOf(v) < 0) arr.push(v); }

  function extract(desc, gender, name) {
    var ctx = String(desc || ''), nameOf = name ? String(name).trim() : '';
    var F = { hair: [], hairColor: [], eyes: [], face: [], features: [], expression: [], build: [], top: [], bottom: [], shoes: [], acc: [], alt: [], sleeves: false, roleTop: [], species: [], onForehead: false, ambiguous: [] };
    var unmapped = [], appearanceClauses = 0, dropped = [];
    splitClauses(desc).forEach(function (cl) {
      var probe = cl.replace(/目撃|一部始終|傷の手当て|手当て/g, '');
      // 年齢・性別だけの文、名前だけの文、読み仮名は「扱い済み」（年齢は subject() が使う）
      if (/^(?:見た目は?)?[\d一二三四五六七八九十]+(?:歳|代)(?:前半|後半|ほど|くらい)?の?(?:男性|女性|男子|女子|男の子|女の子|少年|少女)?$/.test(probe) || /^[\d一二三四五六七八九十]+代(?:前半|後半)?の(?:男性|女性)$/.test(probe) || (nameOf && probe === nameOf)) { dropped.push(cl); return; }
      // 外見の手がかりが無い文でも、表情・職業の見た目は拾う（外見の記述が無いキャラの救済）
      var preSpans = [], hitAny = false;
      var RELATIONAL = /父|母|妻|夫|娘|息子|兄|姉|弟|妹|祖父|祖母|上司|部下|一族|家は|家系|知り合い|友人|恋人/;
      if (!APPEARANCE_CUE.test(probe) && !NON_APPEARANCE.test(probe) && !RELATIONAL.test(probe)) {
        scan(cl, EXPRESSION, preSpans, function (r) { push(F.expression, r[1]); hitAny = true; });
        ROLE_LOOK.forEach(function (r) { var mm = cl.match(r[0]); if (mm && /^(?:$|[、。]|で(?!は)|だ|である|として|長|の(?:女|男|少|青|娘|青年|若者)|見習い|風|姿)/.test(cl.slice(mm.index + mm[0].length))) { (r[1] === 'species' ? push(F.species, r[2]) : push(F.roleTop, r[2])); hitAny = true; } });
        if (hitAny) { dropped.push(cl); return; }
      }
      var isApp = APPEARANCE_CUE.test(probe);
      // 外見の手がかりも、非外見の手がかりも無い文は「不明」：黙って落とさず、補助経路（fix461 系）へ回す
      if (!isApp && !NON_APPEARANCE.test(probe) && !/^[^\u3040-\u30ff\u3400-\u9fff]*$/.test(probe) && probe.replace(/[^\u3040-\u30ff\u3400-\u9fff]/g, '').length >= 3) { unmapped.push({ clause: cl, rest: cl, kind: 'unknown' }); return; }
      if (!isApp) { dropped.push(cl); return; }
      if (NON_APPEARANCE.test(cl) && !/髪|服|着|パーカー|眼鏡|顔|肌|cm/.test(probe)) { dropped.push(cl); return; }
      appearanceClauses++;
      var spans = [];
      // 句の先頭の数字（年齢・身長・体重）は fix766 が扱う
      cl.replace(/\d+\s*(歳|cm|kg|センチ)(ほど|くらい)?|身長/g, function (m, a, b, off) { spans.push([off, off + m.length]); return m; });
      var alt = /^私服は|^普段は|^休日は/.test(cl) && (F.top.length || F.bottom.length);   // 別の服装：最初の服装を正とする
      scan(cl, EXPRESSION, spans, function (r, m) { push(F.expression, r[1]); if (/八重歯/.test(m[0])) push(F.features, 'visible snaggletooth'); });
      scan(cl, FEATURES, spans, function (r) { if (r[1] === 'SLEEVES') F.sleeves = true; else if (r[1] === 'FOREHEAD') F.onForehead = true; else push(F.features, r[1]); });
      var cams = [];
      [CAMERA, DSLR].forEach(function (r) { var m = cl.match(r[0]); if (m && !covers(spans, m.index, m.index + m[0].length)) { spans.push([m.index, m.index + m[0].length]); cams.push(r[1]); } });
      if (cams.length) push(F.acc, cams.join(' and ') + (/首から|首に/.test(cl) ? ' hanging from the neck' : ''));
      var lastField = null;
      ITEMS.forEach(function (row) {
        var re = new RegExp(row[0].source, 'g'), m;
        while ((m = re.exec(cl))) {
          var s = m.index, e = s + m[0].length; if (covers(spans, s, e)) continue;
          spans.push([s, e]);
          var orAlt = s > 0 && cl.charAt(s - 1) === 'や' && F[row[2]].length && lastField === row[2];   // 「パーカーやスウェット」→ 最初の品だけ
          lastField = row[2];
          var md = modsBefore(cl, s); spans.push([md.from, s]);
          var en = row[1];
          if (en === 'WHITE_COAT') { en = /巫女|袴|神主|神職/.test(ctx) ? 'white kimono top' : 'white lab coat'; md.words = md.words.filter(function (w) { return w !== 'white'; }); }
          if (row[2] === 'shoes' && /左右違う/.test(cl)) { en = 'mismatched ' + en; cl.replace(/左右違う/, function (x, o) { spans.push([o, o + x.length]); return x; }); }
          var item = (md.words.length ? md.words.join(' ') + ' ' : '') + en;
          if (md.ambiguous) push(F.ambiguous, cl);
          if (orAlt && !alt) { var arr = F[row[2]]; arr[arr.length - 1] = arr[arr.length - 1] + ' or ' + item; push(F.ambiguous, cl); }
          else push(alt ? F.alt : F[row[2]], item);
        }
      });
      var hasHair = HAIR_CUE.test(cl);
      if (hasHair) {
        scan(cl, HAIR_COLOR, spans, function (r) { push(F.hairColor, r[1]); });
        if (!F.hairColor.length) cl.replace(/髪|ヘア|三つ編み|ツインテール|サイドテール|ボブ|ショートカット/g, function (m0, off) { var md = modsBefore(cl, off), c = md.words.filter(function (w) { return BASIC.indexOf(w) >= 0; }); if (c.length && !F.hairColor.length) { push(F.hairColor, c[0]); spans.push([md.from, off]); } return m0; });
        scan(cl, HAIR_STYLE, spans, function (r) { push(F.hair, r[1]); });
        cl.replace(/髪|ヘア|毛/g, function (m, off) { spans.push([off, off + m.length]); return m; });
      }
      scan(cl, EYES, spans, function (r) { push(F.eyes, r[1]); });
      // 一般形：〈色〉の瞳／〈色〉い目 → '<color> eyes'（表に無い色の組み合わせも拾う）
      cl.replace(/瞳|(?:い|の)目(?!つき|元|撃)/g, function (m0, off) { if (covers(spans, off, off + m0.length)) return m0; var md = modsBefore(cl, off), c = md.words.filter(function (w) { return BASIC.indexOf(w) >= 0; }); if (c.length) { push(F.eyes, c[0] + ' eyes'); spans.push([md.from, off + m0.length]); } return m0; });
      scan(cl, FACE, spans, function (r) { push(F.face, r[1]); });
      scan(cl, BUILD, spans, function (r) { push(F.build, r[1]); });
      if (!RELATIONAL.test(probe)) ROLE_LOOK.forEach(function (r) { var m = cl.match(r[0]); if (m && /^(?:$|[、。]|で(?!は)|だ|である|として|長|の(?:女|男|少|青|娘|青年|若者)|見習い|風|姿)/.test(cl.slice(m.index + m[0].length)) && !covers(spans, m.index, m.index + m[0].length)) { spans.push([m.index, m.index + m[0].length]); (r[1] === 'species' ? push(F.species, r[2]) : push(F.roleTop, r[2])); } });
      cl.replace(/見た目は?|職人|\d+歳ほど|ほど/g, function (m0, off) { spans.push([off, off + m0.length]); return m0; });
      // 残り（拾えなかった外見の語）
      var chars = cl.split(''); spans.forEach(function (u) { for (var i = Math.max(0, u[0]); i < Math.min(chars.length, u[1]); i++) chars[i] = ' '; });
      var STOP = /(?:^|\s)(?:少し|やや|かなり|とても|ほど|くらい|代わりに|作業中は?|挿す|着けている|着けて|着ている|下げている|下げて|首から|私服は|普段は|見える|見え|雑に|大きめ|大きい|細い|長い|短い|同年代より|だが|病弱|ではない|ない|だ|体型|体格|服装|外見|持ち物|祖父|祖母|父|母|形見|救急セット|裁縫道具|ある|いる|して|した|歩き|歩きやすい|左右違う)(?=\s|$)/g;
      var rest = chars.join('').replace(/[\s・、，,／\/]+/g, ' ');
      rest = rest.replace(/首から|首に|祖父|祖母|形見|下げている|下げて|着けている|着けて|着ている|ている|ていた|ていて/g, ' ');
      for (var k = 0; k < 3; k++) rest = rest.replace(/[をにでのとはがやもへ]/g, ' ').replace(/\s+/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
      var content = rest.replace(/[^぀-ヿ㐀-鿿A-Za-z0-9]/g, '');
      if (content.length >= 2) unmapped.push({ clause: cl, rest: rest });
    });
    return { desc: String(desc || ''), fields: F, age: ageOf(desc), gender: gender || '', appearanceClauses: appearanceClauses, unmapped: unmapped, dropped: dropped };
  }

  /* 句を組み立てる（fix767 の属性語の後ろに置く想定・名前と日本語は入らない） */
  function phrase(x) {
    var F = x.fields, out = [];
    F.species.forEach(function (v) { out.push(v); });
    if (F.hair.length || F.hairColor.length) {
      var col = F.hairColor[0] || '';
      var core = F.hair.filter(function (h) { return h.charAt(0) !== '+'; });
      var tail = F.hair.filter(function (h) { return h.charAt(0) === '+'; }).map(function (h) { return h.slice(1); });
      if (core.indexOf('short bob') >= 0) core = core.filter(function (h) { return h !== 'short'; });
      if (core.some(function (h) { return /bald|shaved head/.test(h); })) { out.push('bald head' + (tail.length ? ' ' + tail.join(', ') : '')); core = null; }
      if (core) out.push(([core.join(' '), col].filter(Boolean).join(' ') + ' hair' + (tail.length ? ' ' + tail.join(', ') : '')).replace(/\s+/g, ' ').trim());
    }
    F.eyes.forEach(function (v) { out.push(v); });
    F.face.forEach(function (v) { out.push(v); });
    F.features.forEach(function (v) { out.push(v); });
    F.build.forEach(function (v) { out.push(v); });
    /* 職業からの服装（roleTop）は書かれていない服の推測なので使わない（記録のみ） */
    var wear = F.top.concat(F.bottom); if (wear.length) out.push('wearing ' + wear.join(' and ') + (F.sleeves ? ' with rolled-up sleeves' : ''));
    F.shoes.forEach(function (v) { out.push(v); });
    F.acc.forEach(function (v) { out.push(F.onForehead && /goggles/.test(v) ? v + ' pushed up on the forehead' : v); });
    var ex = F.expression.filter(function (e) { return e.charAt(0) !== '~'; }); if (ex.length) out.push(ex[0]);   // 性格から推した表情（~）は使わない（捏造扱い・GPT #127-BH）
    var s = out.join(', ');
    if (/[぀-ヿ㐀-鿿]/.test(s)) throw new Error('fix983: CJK leaked');
    return s;
  }
  /* 年齢の固定（GPT #127-BE【2】）：18 歳以上なら girl／boy ではなく woman／man。数字の年齢を明記する。 */
  function subject(x) {
    var a = x.age, g = /女/.test(x.gender) ? 'female' : (/男/.test(x.gender) ? 'male' : '');
    if (!g && x.desc) { var fm = /女性|女子|少女|女の子|娘(?:だ|である)?$/.test(x.desc), ml = /男性|男子|少年|男の子/.test(x.desc); if (fm !== ml) g = fm ? 'female' : 'male'; }
    if (!a || !g) return null;
    if (a.years != null) {
      var y = a.years;
      if (y >= 18) return y + '-year-old ' + (y < 26 ? 'young ' : '') + (g === 'female' ? 'woman' : 'man');
      if (y >= 13) return y + '-year-old teenage ' + (g === 'female' ? 'girl' : 'boy');
      return y + '-year-old ' + (g === 'female' ? 'girl' : 'boy');
    }
    var p = a.part === '前半' ? 'early ' : (a.part === '後半' ? 'late ' : '');
    return (g === 'female' ? 'woman' : 'man') + ' in ' + (g === 'female' ? 'her ' : 'his ') + p + a.decade + 's';
  }


  /* ================= 二段構え（GPT #127-BH）：対応表 ＋ fix461 キャッシュの検証つき補完 =================
     ・fix461 は新しく呼ばない。渡されたキャッシュ文字列（tagsFor の値）だけを使う。無ければ対応表だけ。
     ・補完の句は「対応表がまだ出していない項目」だけ。落とした句は理由つきで記録する。
     ・日本語・名前らしい語が混ざった句は、その句だけ落とす（対応表の結果は巻き添えにしない）。 */
  var CAT = [
    ['subject', /\b\d+[- ]?year[- ]?old\b|\b(?:man|woman|girl|boy|male|female|person|lady|gentleman)\b(?!.*\b(?:hair|eyes|shirt|uniform)\b)/i],
    ['hair', /ringlets|\bcurls\b|wolf cut|two-block|\bhair\b|\bbob\b|ponytail|braid|bangs|fringe|\bbun\b|twin ?tails|\bbald\b|shaved head|buzz ?cut|crew ?cut|topknot|undercut/i],
    ['eyes', /blindfold|\beyes?\b|eyelash|\bpupils?\b|\biris(?:es)?\b|heterochromia|eye patch/i],
    ['shoes', /sneakers|\bshoes\b|\bboots\b|loafers|\bsocks\b|sandals|barefoot|geta|zori/i],
    ['bottom', /\bpants\b|jeans|denim|skirt|shorts|trousers|sweatpants|hakama|slacks|leggings/i],
    ['top', /hoodie|shirt|sweater|cardigan|blouse|\bvest\b|jacket|\bcoat\b|\bsuit\b|uniform|kimono|yukata|\brobes?\b|apron|dress|armor|armour|cloak|cape|tunic|sweatshirt|scrubs|overalls|coveralls|poncho|habit|kappogi|haori|tailcoat|corset|chainmail|tank top|blazer|bodysuit|\bobi\b|\bsash\b|garments?\b|clothes\b|outfit|attire/i],
    ['acc', /lipstick|name tag|earphones|headphones|tote|glasses|spectacles|monocle|gloves|\bbag\b|backpack|\bwatch\b|necklace|earrings?|piercings?|\bhat\b|\bcap\b|scarf|camera|headband|ribbon|\btie\b|necktie|hairpin|hair (?:clip|ornament|tie)|bracelet|beads|goggles|stethoscope|headscarf|veil|hood\b|mask|cross\b|sword|staff|dagger/i],
    ['features', /\bmole\b|beauty mark|\bscars?\b|freckles|tooth|teeth|\bfangs?\b|snaggletooth|tattoo|prosthetic|\bbeard\b|stubble|mustache|moustache|burn|wrinkles|missing|ears?\b|horns?|tail\b|seams?/i],
    ['face', /\bface\b|\bskin\b|complexion|makeup|\blips\b|mouth|cheeks?|dark circles|eyebrows?|brows?\b|nose\b|jaw/i],
    ['build', /\bbuild\b|slender|\bslim\b|\btall\b|petite|muscular|broad|burly|\bthin\b|stocky|lanky|\bshort stature|small frame|hunched|posture/i],
    ['expression', /expression|smil|\bgrin|frown|scowl|\bcalm\b|gentle (?:atmosphere|air|aura)|cheerful|stern|serious look/i]
  ];
  var JUNK = /\b\d+\s?(?:cm|kg|centimeters?|kilograms?)\b|\bstudent\b|\bclub\b|\bmember\b|contractor|streamer|shopkeeper|owner of|captain|\bclerk\b|\bdoctor\b|physician|\bnurse\b|\bpriest\b|monk\b(?!.*robes)|firefighter|paramedic|\bteacher\b|detective|\bseller\b|merchant|travel|skilled|\bvoice\b|\bfriend\b|daughter|\bson\b|\bwife\b|husband|\bfather|\bmother|\b(?:first|second|third)[- ]year\b|\bgrade\b|smartphone|\bphone\b|notebook|notepad|recorder|\bknown\b|\bworks? (?:as|at|for|in)\b|\blives?\b|\bfrom the (?:city|town|village|countryside|north|south)\b|resembl|\boccult\b|\bschool nurse\b|antique|librarian|\bhigh school\b|university|college|\bsecret\b|personality|\bshy\b|\bkind\b(?! gentle eyes)|\bloves?\b|\blikes?\b|\bhates?\b|\bspeaks?\b|dialect|\bcontract|\byears? old\b|\bage\b|\bappears? (?:in|to be)\b|\bapparent\b|serving|chairman|retire|peering|\bdespite\b|\bsurgeon\b|reporter|\bCEO\b|\bassassin\b|\bsamurai\b|\bronin\b|\bin a field\b|\bwalking\b|\bdivorced\b|hospital ward|seventh-generation|household|\bunclear\b|\bunknown\b/i;
  var CAP_OK = /^(?:T-shirt|T|DSLR|V|A|I|Japanese|Western|Chinese|Victorian|Gothic|Edo|Taisho|LED|Noh|Kabuki|Shinto|Buddhist|Sendai)$/;
  var FIXES = [
    [/\bfangs?\b/i, function (d) { return /八重歯/.test(d) && !/牙/.test(d) ? 'snaggletooth' : null; }],
    [/\bneutral face\b/i, function (d) { return /中性的/.test(d) ? 'androgynous face' : null; }],
    [/\btear mole\b|\bteardrop mole\b|\bcrying mole\b/i, function () { return 'beauty mark'; }],
    [/\bwhite skin\b/i, function () { return 'fair pale skin'; }]
  ];
  var CREATURE_GUARD = /creature|monster|no human|silhouette|faceless|no face|devoid of|apparition|wraith|specter|spectre|shadowy figure|made of (?:pure )?darkness|shadow (?:stretching|rising|standing|creeping|looming)/i;
  function catOf(ph) { for (var i = 0; i < CAT.length; i++) if (CAT[i][1].test(ph)) return CAT[i][0]; return 'other'; }
  function dictCats(F) {
    var c = {};
    if (F.hair.length || F.hairColor.length) c.hair = 1; if (F.eyes.length) c.eyes = 1; if (F.top.length) c.top = 1;
    if (F.bottom.length) c.bottom = 1; if (F.shoes.length) c.shoes = 1; if (F.expression.length) c.expression = 1; if (F.build.length) c.build = 1;
    if (F.face.length) c.face = 1; if (F.expression.some(function (e) { return e.charAt(0) !== '~'; })) c.expression = 1; else delete c.expression; return c;
  }
  var BASIC_COLOR_RE = /\b(black|white|gray|grey|silver|blonde?|golden|brown|chestnut|auburn|red|scarlet|orange|pink|purple|lilac|blue|green|navy|platinum|beige)\b/i;
  function colorOf(t) { var m = String(t || '').match(BASIC_COLOR_RE); return m ? m[1].toLowerCase().replace('grey', 'gray').replace(/^blond$/, 'blonde') : ''; }
  var KANA = {'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko','さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to','な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho','ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'o','ん':'n','が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo','だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo','ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po'};
  function romaji(t) {      // ひらがな／カタカナ → 大まかなローマ字（名前の漏れ検出用。完全でなくてよい）
    var h = String(t || '').replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }).replace(/ー/g, '');
    var o = ''; for (var i = 0; i < h.length; i++) { var c = h.charAt(i), n = h.charAt(i + 1);
      if (n && 'ゃゅょ'.indexOf(n) >= 0 && KANA[c]) { var b = KANA[c].replace(/i$/, ''), v = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' }[n]; o += (/^(sh|ch|j)$/.test(b) ? b : b + 'y') + v; i++; continue; }
      if (c === 'っ' && KANA[n]) { o += KANA[n].charAt(0); continue; }
      o += KANA[c] || ' '; }
    return o.replace(/\s+/g, ' ').trim();
  }
  function nameTokens(desc, name) {   // 名前と読み仮名から、漏れを検出する語（3 文字以上）を作る
    var src = [String(name || '')], m, re = /[（(]([ぁ-んァ-ヶー\s]+)[）)]/g; while ((m = re.exec(String(desc || '')))) src.push(m[1]);
    var out = []; src.forEach(function (t) { romaji(t).split(/\s+/).forEach(function (w) { if (w.length >= 3) out.push(w.toLowerCase()); }); });
    return out;
  }
  // 体格・表情は、LLM が書き足しやすい。設定文に手がかりが無いときは使わない
  var BODY_CUE = /背が|背の|背丈|身長|体格|体型|体つき|細身|痩|筋肉|筋骨|骨太|骨ばっ|肩幅|胸板|巨漢|小柄|大柄|華奢|すらり|ひょろ|太め|太った|太鼓腹|ぽっちゃり|恰幅|cm|センチ|長身|短身|中肉/;
  var EXPR_CUE = /表情|笑|顔つき|目つき|微笑|睨|むっつり|仏頂面|無愛想|にこにこ|泣き|怒/;

  /* LLM 主（mode:'llm'）：fix461 の句を掃除して主に使い、対応表は「LLM に無い項目」の補完と色の食い違いの判定に使う */
  function composeLlm(desc, gender, name, en461, opts) {
    var x = extract(desc, gender, name), F = x.fields, MAX = (opts && opts.maxLen) || 420;
    var log = { version: VERSION, mode: 'llm', unmapped: x.unmapped.map(function (u) { return { clause: u.clause, kind: u.kind || 'appearance' }; }), ambiguous: F.ambiguous.slice(),
                cache: 'hit', llmUsed: [], llmDropped: [], dictAdded: [], conflicts: [], truncated: [], uncovered: false };
    var kept = [], cats = {}, NAMES = nameTokens(desc, name), descNoName = String(desc || '').split(String(name || '\u0000')).join(' ').replace(/[（(][^）)]*[）)]/g, ' '), phIdx = 0;
    String(en461).split(/\s*[,;]\s*|\.\s+|\s+and\s+/).map(function (t) { return t.replace(/^\s*(?:and|with|a|an|the)\s+/i, '').replace(/^(?:(?:a|an)\s+)?(?:\d+[- ]year[- ]old\s+|young\s+|old\s+|elderly\s+|middle-aged\s+)?(?:man|woman|girl|boy|person|male|female|lady)\s+(?:with|wearing|in)\s+/i, '').replace(/[.\s]+$/, '').trim(); }).filter(Boolean).forEach(function (ph) {
      if (/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/.test(ph)) { log.llmDropped.push({ p: ph, why: 'cjk' }); return; }
      var lower = ph.toLowerCase();
      if (NAMES.some(function (w) { return new RegExp('\\b' + w + '\\b').test(lower); })) { log.llmDropped.push({ p: ph, why: 'name' }); return; }   // 登場人物の名前（読み仮名・カタカナ名のローマ字）
      if (JUNK.test(ph) || /\bfrom [A-Z][a-z]+/.test(ph)) { log.llmDropped.push({ p: ph, why: 'non-visual' }); return; }
      if (CREATURE_GUARD.test(ph)) { log.llmDropped.push({ p: ph, why: 'creature-word' }); return; }
      // 大文字の語：句ごと捨てず、その語だけ外す（例：Hakata obi → obi）。外した語は記録する
      var firstPh = (phIdx++ === 0);
      var caps = (ph.match(/\b[A-Z][a-z]+\b/g) || []).filter(function (w, i) { return !(firstPh && i === 0 && ph.indexOf(w) === 0) && !CAP_OK.test(w); });
      if (caps.length) { var before = ph; caps.forEach(function (w) { ph = ph.replace(new RegExp('\\b' + w + '\\b[- ]?', 'g'), ''); }); ph = ph.replace(/\s+/g, ' ').trim(); log.llmUsed.push({ capStripped: before + ' -> ' + ph }); if (ph.replace(/[^a-z]/gi, '').length < 3) { log.llmDropped.push({ p: before, why: 'cap-only' }); return; } }
      FIXES.forEach(function (f) { if (f[0].test(ph)) { var r = f[1](desc); if (r) { log.llmUsed.push({ fix: ph + ' -> ' + ph.replace(f[0], r) }); ph = ph.replace(f[0], r); } } });
      var c = catOf(ph);
      if (c === 'subject') { log.llmDropped.push({ p: ph, why: 'subject' }); return; }
      if (c === 'build' && !BODY_CUE.test(descNoName)) { log.llmDropped.push({ p: ph, why: 'unsupported-build' }); return; }
      if (c === 'expression' && !EXPR_CUE.test(descNoName)) { log.llmDropped.push({ p: ph, why: 'unsupported-expression' }); return; }
      if (c === 'other' && !/\s/.test(ph)) { log.llmDropped.push({ p: ph, why: 'single-word-other' }); return; }   // 1 語だけ（polite など）は落とす。2 語以上の未分類は小物・衣類の可能性が高いので残す
      // 色の食い違い（髪・目）：対応表が色を確定していて、LLM が別の色を言うときは LLM の句を使わない
      if (c === 'hair' && F.hairColor.length) { var dc = colorOf(F.hairColor[0]), lc = colorOf(ph); if (dc && lc && dc !== lc && !(dc === 'brown' && /chestnut|auburn|light brown|dark brown/.test(ph))) { log.conflicts.push({ p: ph, dict: F.hairColor[0] }); return; } }
      if (c === 'eyes') { var de = F.eyes.map(colorOf).filter(Boolean)[0], le = colorOf(ph); if (de && le && de !== le) { log.conflicts.push({ p: ph, dict: de + ' eyes' }); return; } }
      if ((c === 'bottom' || c === 'shoes') && F[c === 'bottom' ? 'bottom' : 'shoes'].length) {   // 下衣・靴は 1 つが普通：対応表と違う品なら使わない（例：sweatpants と shorts の矛盾）
        var dn = F[c === 'bottom' ? 'bottom' : 'shoes'].join(' ').toLowerCase(), hn = (ph.toLowerCase().match(/[a-z]+$/) || [''])[0].replace(/s$/, '');
        if (hn && dn.indexOf(hn) < 0) { log.conflicts.push({ p: ph, dict: dn }); return; }
      }
      if (/\bor\b/i.test(ph)) log.ambiguous.push('llm:' + ph);
      kept.push(ph); cats[c] = 1; log.llmUsed.push({ p: ph, cat: c });
    });
    // 対応表で補う：LLM に無い項目だけ。色の食い違いで落とした項目は対応表の句を入れる
    var dparts = []; try { dparts = phrase(x) ? phrase(x).split(', ') : []; } catch (e) { log.dictError = String(e && e.message || e); }
    var keptL = kept.join(' | ').toLowerCase();
    dparts.forEach(function (d) {
      var c = catOf(d); if (c === 'other' || c === 'subject') c = 'features';
      var dw = d.toLowerCase().replace(/^wearing /, '').match(/[a-z]{4,}/g) || [];
      var covered = dw.length && dw.filter(function (w) { return keptL.indexOf(w.replace(/s$/, '')) >= 0; }).length / dw.length >= 0.5;
      if (cats[c] && (c !== 'features' && c !== 'acc')) return;
      if (covered) return;
      kept.push(d); log.dictAdded.push({ p: d, cat: c });
    });
    var out = [], len = 0;
    kept.forEach(function (p) { if (len + p.length + 2 <= MAX) { out.push(p); len += p.length + 2; } else log.truncated.push(p); });
    return { subject: subject(x), phrase: out.join(', '), fields: F, log: log };
  }
  /* ===== r11B（GPT #127-BL 選択肢 B）=====
     ・年齢は規則で読まない（本人以外・過去・前世・見た目の年齢を取り違えた r10 の教訓）。数字の年齢も計算しない。
     ・fix461 の英文が主。掃除は最小：日本語・登場人物名・非外見の語・人外判定語・明確な誤訳だけ。落とした句は理由つきで記録。
     ・主語（年齢・性別）は LLM の主語句から職業語だけ外して使う。無いときは返さない（fix767 が設定由来の ageBand か、年齢を断定しない主語にする）。
     ・キャッシュが無いときは対応表の外見句だけ（年齢は扱わない）。 */
  var JOB_WORDS = /\b(?:former |retired |apprentice |young |head )?(?:surgeon|doctor|physician|nurse|paramedic|firefighter|police ?officer|detective|reporter|journalist|teacher|clerk|CEO|president|captain|chief|manager|employee|worker|mechanic|blacksmith|fisherman|samurai|ronin|witch|guide|merchant|seller|streamer|student|sophomore|freshman|volunteer|office lady|housewife|mother|father|wife|husband|onmyoji|ruler|lord|engineer|programmer|technician|master|owner)s?\b/gi;
  function stripJobs(t) { return t.replace(JOB_WORDS, function (m) { return /student|sophomore|freshman/i.test(m) ? m : ''; }).replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim(); }
  var SUBJ_NOUN = /\b(?:child|kid|toddler|boy|girl|man|woman|men|women|male|female|person|teenager|lady|gentleman|robot|android|cyborg|beastman|beastfolk|elf|dwarf|spirit|ghost|creature)\b/i;
  function composeB(desc, gender, name, en461, opts) {
    var MAX = (opts && opts.maxLen) || 420;
    var log = { version: VERSION, mode: 'B', cache: en461 ? 'hit' : 'none', llmUsed: [], llmDropped: [], truncated: [], ambiguous: [] };
    if (!en461) {   // キャッシュ無し：対応表の外見句だけ。主語は返さない
      var x0 = extract(desc, gender, name), dp = ''; try { dp = phrase(x0); } catch (e) { log.dictError = String(e && e.message || e); }
      log.unmapped = x0.unmapped.map(function (u) { return { clause: u.clause, kind: u.kind || 'appearance' }; });
      return { subject: null, phrase: dp, fields: x0.fields, log: log };
    }
    var NAMES = nameTokens(desc, name), subject = null, kept = [], idx = 0;
    String(en461).split(/\s*[,;]\s*|\.\s+|\s+and\s+(?=(?:a|an|the)\s)/).map(function (t) { return t.replace(/[.\s]+$/, '').trim(); }).filter(Boolean).forEach(function (ph0) {
      var first = (idx++ === 0), ph = ph0;
      if (/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/.test(ph)) { log.llmDropped.push({ p: ph0, why: 'cjk' }); return; }
      var lower = ph.toLowerCase();
      if (NAMES.some(function (w) { return new RegExp('\\b' + w + '\\b').test(lower); })) { log.llmDropped.push({ p: ph0, why: 'name' }); return; }
      // 主語句：最初の句（または主語名詞を含む短い句）。職業語だけ外す
      if (!subject && (first || /^(?:a|an)\s/i.test(ph)) && SUBJ_NOUN.test(ph) && ph.split(/\s+/).length <= 9 && !/\bhair\b|\beyes\b|wearing/i.test(ph)) {
        var sj0 = ph.replace(/^(?:a|an|the)\s+/i, '').replace(/\b(?:named|called)\b.*$/i, '').trim();
        var sj = stripJobs(sj0).trim();
        /* ★r12：職業語が句の末尾から外れたとき、その職業を修飾していた語（emergency team captain の emergency team など）が主語名詞のあとに
           取り残される。末尾の職業語を外した場合だけ、主語名詞より後ろの取り残しを落とす（職業語の無い句・前置詞句・種族語は変えない）。 */
        var mJ = sj0.match(new RegExp('(?:' + JOB_WORDS.source + ')\\s*$', 'i'));
        if (mJ && !/student|sophomore|freshman/i.test(mJ[0])) { var mS = sj.match(SUBJ_NOUN);
          if (mS) { var cut = mS.index + mS[0].length, rest = sj.slice(cut).trim(); if (rest && !/^(?:in|of|aged|around|about|over|under|near|past)\b/i.test(rest)) { log.llmUsed.push({ subjectTrim: sj + ' -> ' + sj.slice(0, cut).trim() }); sj = sj.slice(0, cut).trim(); } } }
        if (sj && SUBJ_NOUN.test(sj)) { subject = sj; log.llmUsed.push({ subject: ph0 + (sj !== ph0 ? ' -> ' + sj : '') }); return; }
      }
      if (JUNK.test(ph) || /\bfrom [A-Z][a-z]+/.test(ph)) { log.llmDropped.push({ p: ph0, why: 'non-visual' }); return; }
      if (CREATURE_GUARD.test(ph)) { log.llmDropped.push({ p: ph0, why: 'creature-word' }); return; }
      var caps = (ph.match(/\b[A-Z][a-z]+\b/g) || []).filter(function (w, i) { return !(first && i === 0 && ph.indexOf(w) === 0) && !CAP_OK.test(w); });
      if (caps.length) { caps.forEach(function (w) { ph = ph.replace(new RegExp('\\b' + w + '\\b[- ]?', 'g'), ''); }); ph = ph.replace(/\s+/g, ' ').trim(); log.llmUsed.push({ capStripped: ph0 + ' -> ' + ph }); if (ph.replace(/[^a-z]/gi, '').length < 3) { log.llmDropped.push({ p: ph0, why: 'cap-only' }); return; } }
      FIXES.forEach(function (f) { if (f[0].test(ph)) { var r = f[1](desc); if (r) { log.llmUsed.push({ fix: ph + ' -> ' + ph.replace(f[0], r) }); ph = ph.replace(f[0], r); } } });
      ph = ph.replace(/^(?:a|an|the)\s+/i, '');
      if (/\bor\b/i.test(ph)) log.ambiguous.push(ph);
      kept.push(ph); log.llmUsed.push({ p: ph });
    });
    var out = [], len = 0;
    kept.forEach(function (p) { if (len + p.length + 2 <= MAX) { out.push(p); len += p.length + 2; } else log.truncated.push(p); });
    var x = extract(desc, gender, name);   // RANDOM_FILL 抑制の判断用（fields）だけ。年齢は使わない
    return { subject: subject, phrase: out.join(', '), fields: x.fields, log: log };
  }
  function compose(desc, gender, name, en461, opts) {
    if (!opts || opts.mode !== 'r9') return composeB(desc, gender, name, en461, opts);
    if (en461 && (!opts || opts.mode !== 'dict')) return composeLlm(desc, gender, name, en461, opts);
    opts = opts || {};
    var MAX = opts.maxLen || 420;
    var x = extract(desc, gender, name), F = x.fields;
    var log = { version: VERSION, unmapped: x.unmapped.map(function (u) { return { clause: u.clause, kind: u.kind || 'appearance' }; }), ambiguous: F.ambiguous.slice(),
                cache: en461 ? 'hit' : 'none', llmUsed: [], llmDropped: [], truncated: [], uncovered: false };
    var dictPhrase = '';
    try { dictPhrase = phrase(x); } catch (e) { log.dictError = String(e && e.message || e); dictPhrase = ''; }
    var have = dictCats(F), extra = [], dparts = dictPhrase ? dictPhrase.split(', ') : [];
    var needFill = x.unmapped.length > 0;
    if (en461 && needFill) {
      var dl = dictPhrase.toLowerCase();
      String(en461).split(/\s*[,;]\s*|\.\s+|\s+and\s+/).map(function (t) { return t.replace(/^\s*(?:and|with|a|an|the)\s+/i, '').replace(/^(?:(?:a|an)\s+)?(?:\d+[- ]year[- ]old\s+|young\s+|old\s+|elderly\s+|middle-aged\s+)?(?:man|woman|girl|boy|person|male|female|lady)\s+(?:with|wearing|in)\s+/i, '').replace(/[.\s]+$/, '').trim(); }).filter(Boolean).forEach(function (ph) {
        if (/[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(ph)) { log.llmDropped.push({ p: ph, why: 'cjk' }); return; }
        var caps = (ph.match(/\b[A-Z][a-z]+\b/g) || []).filter(function (w, i) { return !(i === 0 && ph.indexOf(w) === 0) && !CAP_OK.test(w); });
        if (caps.length) { log.llmDropped.push({ p: ph, why: 'name-like:' + caps.join('/') }); return; }
        if (JUNK.test(ph) || /\bfrom [A-Z][a-z]+/.test(ph)) { log.llmDropped.push({ p: ph, why: 'non-visual' }); return; }
        if (CREATURE_GUARD.test(ph)) { log.llmDropped.push({ p: ph, why: 'creature-word' }); return; }   // fix484 の人外判定語を人物の句へ入れない
        FIXES.forEach(function (f) { if (f[0].test(ph)) { var r = f[1](desc); if (r) { log.llmUsed.push({ fix: ph + ' -> ' + ph.replace(f[0], r) }); ph = ph.replace(f[0], r); } } });
        var c = catOf(ph);
        if (c === 'subject') { log.llmDropped.push({ p: ph, why: 'subject' }); return; }
        // 対応表の句の語をすべて含む、より詳しい句なら、その句と置き換える（例：beard → salt-and-pepper beard）
        var norm = function (t) { return t.toLowerCase().replace(/eyepatch/g, 'eye patch').replace(/sword scar/g, 'blade scar').replace(/\b([a-z]+?)s\b/g, '$1'); };
        var lp = norm(ph), refined = false;
        for (var di = 0; di < dparts.length; di++) {
          var dw = norm(dparts[di]).replace(/^wearing /, '').match(/[a-z][a-z-]+/g) || [];
          if (dw.length && dw.every(function (w) { return lp.indexOf(w) >= 0; }) && lp.length > norm(dparts[di]).length) { log.llmUsed.push({ refine: dparts[di] + ' -> ' + ph }); dparts[di] = ph; refined = true; break; }
        }
        if (refined) return;
        if (have[c]) { log.llmDropped.push({ p: ph, why: 'dict-covers:' + c }); return; }
        var kw = ph.toLowerCase().match(/[a-z]{4,}/g) || [], STOPW = /^(?:under|below|above|with|visible|when|smiling|left|right|large|small|slightly|very|their|from|over|around|wearing|hanging)$/;
        kw = kw.filter(function (w) { return !STOPW.test(w); });
        var hitN = kw.filter(function (w) { return dl.indexOf(w) >= 0 || dl.indexOf(w.replace(/s$/, '')) >= 0; }).length;
        if (kw.length && hitN / kw.length >= 0.5) { log.llmDropped.push({ p: ph, why: 'dup' }); return; }
        if (c === 'other') { log.llmDropped.push({ p: ph, why: 'unknown-category' }); return; }
        if (/\bor\b/i.test(ph)) log.ambiguous.push('llm:' + ph);
        extra.push(ph); log.llmUsed.push({ p: ph, cat: c });
      });
    }
    if (needFill && !en461) log.uncovered = true;   // 補完できない外見の文が残った（観測用）
    // 長さの上限：対応表の句を優先順で残し、補完は後ろから切る
    var parts = dparts.concat(extra);
    var out = [], len = 0;
    parts.forEach(function (p) { if (len + p.length + 2 <= MAX) { out.push(p); len += p.length + 2; } else log.truncated.push(p); });
    return { subject: subject(x), phrase: out.join(', '), fields: F, log: log };
  }

  /* ★r12（GPT #127-BM）：顔アイコン（人型・胸から上）用の構図フィルタ。指示文だけを整える。設定の原文・保存には触らない。
     ・下衣・靴、構図を引かせる大きな持ち物（トート・リュック・スーツケース等）は省く。普通の bag／strap／小物は残す。
     ・身長の語は省く。体格は、胸から上でも見える特徴（muscular・stocky・plump など）だけ残す。
     ・髪・目・顔・上衣・首元・装飾・表情を含む句は、そのまま残す（誤って消さない側に倒す）。
     ・人外の経路（fix767 nonHumanBody）では使わない。kill：v292Dfix983FrameOff='1'。 */
  var FR_KEEP = /\b(?:hair|bob|bangs|fringe|ponytail|pigtails?|twintails?|braids?|bun|eyes?|eyelash(?:es)?|lashes|brows?|eyebrows?|face|faced|facial|cheeks?|cheeked|nose|mouth|lips?|teeth|tooth|fangs?|snaggletooth|mole|beauty mark|freckles?|scars?|skin|complexion|ears?|earrings?|glasses|spectacles|monocle|hat|cap|beret|hood|hoodie|hoody|sweater|sweatshirt|jumper|shirt|t-shirt|tee|blouse|jacket|blazer|coat|vest|waistcoat|cardigan|parka|kimono|yukata|haori|robes?|uniform|dress|collar|tie|necktie|bowtie|scarf|muffler|necklace|choker|pendant|headphones|earphones|earbuds|hairpin|hair clip|ribbon|headband|mask|eyepatch|bandages?|apron|armou?r|cloak|cape|shawl|stole|tattoos?|neck|shoulders?|strap|pencil|veil|crown|tiara|horns?|wings?|makeup|lipstick|beard|mustache|moustache|stubble|wrinkles?|smile|smiling|grin|expression|gaze|look|baby face|turtleneck|sleeves?|sleeveless|gloves?|bracelets?|wristband|watch|rings?|overalls|camisole|tank top|suit|gakuran|sailor)\b/i;
  var FR_LOWER = /\b(?:pants|trousers|jeans|slacks|shorts|sweatpants|joggers|leggings|tights|stockings|socks|skirts?|miniskirt|hakama|culottes|denim|shoes|sneakers|boots|sandals|heels|loafers|slippers|geta|zori|footwear|tote(?: bag)?|backpack|rucksack|knapsack|suitcase|briefcase|duffel|luggage|large bag|big bag)\b/i;
  var FR_BODY = /\b(?:build|stature|frame|figure|physique|height|body|tall|short|petite|tiny|diminutive|towering|slender|slim|thin|lean|skinny|lanky|plump|chubby|stocky|muscular|heavyset|burly|broad|frail|gaunt|portly|stout|sturdy|brawny|hefty|robust|energetic)\b|\d+\s?cm\b/i;
  var FR_VISIBLE_BUILD = /\b(?:muscular|stocky|plump|chubby|heavyset|burly|broad[- ]shouldered|frail|gaunt|portly|stout|sturdy|brawny|hefty|robust)\b/gi;
  function frameFilter(phrase) {
    var keep = [], dropped = [], trimmed = [];
    String(phrase || '').split(/\s*,\s*/).filter(Boolean).forEach(function (p) {
      if (FR_KEEP.test(p)) { keep.push(p); return; }
      if (FR_LOWER.test(p)) { dropped.push({ p: p, why: 'off-frame' }); return; }
      if (FR_BODY.test(p)) {
        var vis = p.match(FR_VISIBLE_BUILD);
        if (vis && vis.length) { var t = vis.map(function (w) { return w.toLowerCase(); }).join(' ') + ' build'; keep.push(t); trimmed.push(p + ' -> ' + t); }
        else dropped.push({ p: p, why: 'height-or-full-body-build' });
        return;
      }
      keep.push(p);
    });
    return { phrase: keep.join(', '), dropped: dropped, trimmed: trimmed };
  }
  function visibleBuild(word) { return !!(word && /^(?:stocky|muscular|heavyset|frail)$/i.test(word)); }   // fix766 bodyBuild の語のうち、胸から上でも見えるもの
  function neutralSubject(gender) { return /女/.test(gender || '') ? 'female character' : (/男/.test(gender || '') ? 'male character' : 'character'); }
  var api = { frameFilter: frameFilter, visibleBuild: visibleBuild, neutralSubject: neutralSubject, compose: compose, catOf: catOf, VERSION: VERSION, extract: extract, phrase: phrase, subject: subject, splitClauses: splitClauses };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.__v292Dfix983 = api;
})(typeof window !== 'undefined' ? window : this);
