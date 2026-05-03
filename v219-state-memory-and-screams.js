/* v219-state-memory-and-screams: long-term char state + situation-driven scream + continue fix */
(function v219(){
  'use strict';
  if (window.__v219Active) return;
  window.__v219Active = true;

  var LOC = {
    '図書館': /図書館|書架|書庫|本棚/,
    '森': /森|樹海|木立/,
    '洞窟': /洞窟|岩穴|地底/,
    '城': /城|王宮/,
    '酒場': /酒場|宿屋|宿/,
    '神殿': /神殿|聖堂|教会/,
    '部屋': /部屋|寢室|ベッドルーム/,
    '床下': /廀下|通路/,
    '地下室': /地下室|地下牢|牢狱/
  };

  var CLO = {
    '服が破れている': /服が[^\n]{0,10}(破れ|裂け|引き裂か)/,
    '半裸': /(半裸|背着|下着姿)/,
    '全裸': /(全裸|裸|何も身に[^\n]{0,5}着け)/,
    '服が乱れている': /(服|衣服)が[^\n]{0,10}乱れ/,
    '濡れている': /(濡れ[てた]|びしょ濡れ|ずぶ濡れ)/
  };

  var REST = {
    '両手を縛られている': /(両?手[をが])[^\n]{0,10}(縛|拘束|繋|結ば)/,
    '足を縛られている': /(両?足[をが])[^\n]{0,10}(縛|拘束|繋)/,
    '猿轄': /(猿轄|口を塞|口を封)/,
    '吊るされている': /(吊られ|吊るさ|宙吊り)/,
    '押さえつけられている': /(押さえつけ|床に倒|地面に倒)/
  };

  var INJ = {
    '出血': /(血が[^\n]{0,5}(流|滴|溢|噴)|血まみれ|流血)/,
    '打撲': /(打撲|殴られ|蹴られ|顔[をが][^\n]{0,5}腫れ)/,
    '擦り傷': /(擦り傷|引っ掛[きか]れ|擦りむ)/,
    '切り傷': /(切り傷|刺し傷|切られ|刺され)/,
    '気絶': /(気絶|意識を[^\n]{0,5}失|気を失)/
  };

  var EVT = {
    '怪異に襲われた': /(怪異|化け物|魔物)[^\n]{0,15}(襲|掴|押し倒|捕)/,
    '弄ばれた': /(弄[ばれればはん]|玩具にさ|嬬)/,
    '助けに来た': /(助けに来|救出|駆けつけ)/,
    '逃げ出した': /(逃げ[出だ]|脱出|逃走)/,
    '泣き出した': /(泣[いきく][だてた]|噟咽|涙[があ])/
  };

  function read(){ try { return JSON.parse(localStorage.getItem('chr6')||'{}'); } catch(e){ return {}; } }

  function ensureState(c){
    if (!c.state){
      c.state = { location:'', clothing:'', restraints:[], injuries:[], mentalProfile:{fear:c.stress||0,trust:c.trust||50,tension:0,despair:0}, trauma:[], recentEvents:[], lastUpdate:0 };
    }
    if (!c.state.restraints) c.state.restraints = [];
    if (!c.state.injuries) c.state.injuries = [];
    if (!c.state.trauma) c.state.trauma = [];
    if (!c.state.recentEvents) c.state.recentEvents = [];
    if (!c.state.mentalProfile) c.state.mentalProfile = {fear:0,trust:50,tension:0,despair:0};
    return c.state;
  }

  function updateChar(c, narr){
    if (!c || !c.name || !narr) return false;
    var st = ensureState(c);
    var changed = false;
    if (narr.indexOf(c.name) < 0) return false;
    var idx = narr.indexOf(c.name);
    var passage = narr.substring(Math.max(0,idx-100), Math.min(narr.length,idx+300));
    Object.keys(LOC).forEach(function(k){ if (LOC[k].test(passage) && st.location !== k){ st.location = k; changed = true; }});
    Object.keys(CLO).forEach(function(k){ if (CLO[k].test(passage) && st.clothing !== k){ st.clothing = k; changed = true; }});
    Object.keys(REST).forEach(function(k){ if (REST[k].test(passage) && st.restraints.indexOf(k) < 0){ st.restraints.push(k); changed = true; }});
    Object.keys(INJ).forEach(function(k){ if (INJ[k].test(passage) && st.injuries.indexOf(k) < 0){ st.injuries.push(k); changed = true; }});
    Object.keys(EVT).forEach(function(k){
      if (EVT[k].test(passage)){
        if (st.recentEvents[st.recentEvents.length-1] !== k){ st.recentEvents.push(k); if (st.recentEvents.length > 5) st.recentEvents.shift(); changed = true; }
        if (['弄ばれた','怪異に襲われた','気絶した'].indexOf(k) >= 0 && st.trauma.indexOf(k) < 0){ st.trauma.push(k); changed = true; }
      }
    });
    var fearM = (passage.match(/恐怖|怯え|震え|戰栗|怖[いく]/g)||[]).length;
    var despM = (passage.match(/絶望|諲め|もう駄目|もう無理/g)||[]).length;
    if (fearM > 0){ st.mentalProfile.fear = Math.min(100, st.mentalProfile.fear + fearM*5); changed = true; }
    if (despM > 0){ st.mentalProfile.despair = Math.min(100, st.mentalProfile.despair + despM*8); changed = true; }
    if (typeof c.stress === 'number') st.mentalProfile.fear = Math.max(st.mentalProfile.fear, c.stress);
    if (typeof c.trust === 'number') st.mentalProfile.trust = c.trust;
    if (changed) st.lastUpdate = Date.now();
    return changed;
  }

  function updateAll(){
    var s = read();
    var turns = s.turns || [];
    if (turns.length === 0) return;
    var last = turns[turns.length-1];
    if (!last || !last.narrative) return;
    var changed = false;
    var all = [];
    if (s.cast && s.cast.hero) all.push(s.cast.hero);
    if (s.cast && s.cast.npcs) all = all.concat(s.cast.npcs);
    all.forEach(function(c){ if (updateChar(c, last.narrative)) changed = true; });
    if (changed){
      try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){}
      console.log('[v219] states updated');
    }
  }

  function buildStateBlock(){
    var s = read();
    if (!s.cast) return null;
    var lines = ['# 🧠 キャラクター継続状態（絶対遵守）', ''];
    var any = false;
    function describe(c, role){
      if (!c || !c.name || !c.state) return;
      any = true;
      var st = c.state;
      lines.push('**' + c.name + '** (' + role + (c.gender ? '・' + c.gender : '') + ')：');
      if (st.location) lines.push('- 場所：' + st.location);
      if (st.clothing) lines.push('- 服装：' + st.clothing);
      if (st.restraints && st.restraints.length) lines.push('- 拘束：' + st.restraints.join('、'));
      if (st.injuries && st.injuries.length) lines.push('- 怠我：' + st.injuries.join('、'));
      var mp = st.mentalProfile || {};
      var psy = [];
      if (mp.fear) psy.push('恐怖' + mp.fear);
      if (mp.tension) psy.push('緊張' + mp.tension);
      if (mp.despair) psy.push('絶望' + mp.despair);
      if (typeof mp.trust === 'number') psy.push('信頼' + mp.trust);
      if (psy.length) lines.push('- 心理：' + psy.join('、'));
      if (st.trauma && st.trauma.length) lines.push('- 累積トラウマ：' + st.trauma.join('、'));
      if (st.recentEvents && st.recentEvents.length) lines.push('- 直近：' + st.recentEvents.slice(-3).join(' → '));
      lines.push('');
    }
    if (s.cast.hero) describe(s.cast.hero, '主人公');
    (s.cast.npcs || []).forEach(function(n){ describe(n, 'NPC'); });
    if (!any) return null;
    lines.push('## 状態の継続性ルール');
    lines.push('- 上記の状態は **継続している現実**');
    lines.push('- 服が破れている・裸のキャラを **勝手に着直させない**');
    lines.push('- 拘束されているキャラを **勝手に解放しない**');
    lines.push('- 怠我は時間が経っても治らない');
    lines.push('- 心理状態は急変させず、徐々に変動');
    lines.push('- 累積トラウマは完全に忘れさせない');
    return lines.join('\n');
  }

  var SCREAM = ['','','# 😱 悲鳴・絶叫の出し方（重要）','','## 原則：強制ノルマではなく **自然な状況で** 出す','','次のような **瞬間** には必ず悲鳴・呯き・嘆願を入れる：','- 触手・手・武器が **体に触れた瞬間**','- 痛みを **受けた直後**','- 拘束が **強められた瞬間**','- 視覚的恐怖を **目撃した瞬間**','- 性的接触の **始まり・絶頂・苦痛**','- 抵抗・絶望が **限界に達した時**','','## 強度の自動調整','- **軽い痛み・驚き**：「うっ……」「あっ」「ひゃっ」','- **中程度の苦痛・恐怖**：「いやっ！」「やめて！」「痛い……！」','- **激痛・絶叫**：「ぎゃあああ！」「いやぁぁぁぁ！」「あぁああっ！」','- **絶望・嘆願**：「やめて……お願い……」「もう、もう……」','- **極限の絶叫**：「ひぃいいいいい！」「ああああああっ！」','','## 良い使い方の例','','✅ 触手が体に絡みついた瞬間、','スピカ「ひぃっ……！」と短く息を命んだ。','触手の力が強まると、','スピカ「いや、いやだ、やめて……！」と弱々しく嘆願した。','','✅ 鞭が肌を打った直後、','セシリア「あぁあああっ！」という悲鳴が部屋に響いた。','','✅ 視界に怪異の本体が映った瞬間、','ミコト「ひぃいい……！」と恐怖で震え上がった。','','## ❌ 悪い使い方','- ❌ 何も起こっていないのに突然「ぎゃあああ」','- ❌ 同じ悲鳴を毎ターン繰り返す','- ❌ 強度が状況と合わない','','## 必須','- 苦痛・恐怖・絶頂・拘束等の **適切な状況では必ず** 悲鳴','- 状況の **強度に応じた長音・記号** を使う','- 同じ悲鳴の連発を避け、バリエーションを出す'].join('\n');

  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(url);
    if (!isApi) return origFetch(input, init);
    if (init && init.body){
      try {
        var body = JSON.parse(init.body);
        if (body.messages){
          var sb = buildStateBlock();
          for (var i = 0; i < body.messages.length; i++){
            if (body.messages[i].role === 'system'){
              var c = body.messages[i].content || '';
              if (sb){
                c = c.replace(/\n\n# 🧠 キャラクター継続状態[\s\S]*?(?=\n\n#|$)/g, '');
                c = c + '\n\n' + sb;
              }
              if (c.indexOf('# 😱 悲鳴・絶叫の出し方') < 0){ c = c + SCREAM; }
              body.messages[i].content = c;
              break;
            }
          }
          init.body = JSON.stringify(body);
        }
      } catch(e){}
    }
    return origFetch(input, init);
  };

  function watchContinue(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var label = (btn.textContent || '').trim();
      if (/続きを書く/.test(label)){
        var beforeCount = (read().turns || []).length;
        console.log('[v219] continue clicked, turns=', beforeCount);
        setTimeout(function(){
          var afterCount = (read().turns || []).length;
          if (afterCount === beforeCount){ console.warn('[v219] continue did not progress!'); }
        }, 30000);
      }
    }, true);
  }

  function init(){
    setTimeout(updateAll, 1500);
    setInterval(updateAll, 6000);
    watchContinue();
    console.log('[v219] active: state memory + screams + continue watch');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v219 = { updateChar: updateChar, updateAll: updateAll, buildStateBlock: buildStateBlock, ensureState: ensureState, LOC: LOC, CLO: CLO, REST: REST, INJ: INJ };
})();
