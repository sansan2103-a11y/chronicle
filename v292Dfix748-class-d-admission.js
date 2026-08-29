// =====================================================================
// Chronicle TRPG - v292Dfix748: CLASS D ADMISSION（Phase C / GWS 結線の共通土台）
//
//   裁定（Phase C Class D contract）:
//     BUSY / SLOT_ISOLATION_RUNTIME_HOLD のとき
//       ・target write 0
//       ・companion write 0
//       ・silent success 禁止
//       ・enclosing semantic operation を成功扱いしない
//     低レベル sync hook を **そのまま Promise 化しない**。
//     「その mutation を意味的に所有し、Promise を扱える最上位 operation」で
//     admission を取り、その内側の同期 writer は同期のまま走らせる。
//
//   このモジュールが提供するのは 2 つだけ:
//     run(label, fn)   … Class D admission。fn は **同期**。戻りは常に Promise。
//     inTransaction()  … いま admission の内側か（同期・boolean）。
//
//   sync writer は inTransaction() を見て
//     required() && !inTransaction()  → **書かずに hold を返す**
//   とすることで、「上位が lock を取っていないのに書いてしまう」経路を塞ぐ。
//
//   ★このモジュール自身は localStorage へ 1 バイトも書かない。
//   ★kill switch は fail-open にしない（GWS 側の serializationRequired() に従うだけ）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixDAdm) return;

  var BUILD = 'fix748.0';
  var ACTIVE = null;                  /* いま保持している ownership token（同時に1つ） */
  var STATS = { admitted:0, held:0, nested:0, legacy:0, syncRefused:0, cSkipped:0, cDeferred:0,
                heldByReason: {}, syncRefusedBy: {}, cSkippedBy: {} };
  var LOG = [], LOG_MAX = 40;

  function gws(){ try { return window.__v292DfixGWS || null; } catch(e){ return null; } }
  function note(rec){ try { rec.at = Date.now(); LOG.push(rec); if (LOG.length > LOG_MAX) LOG.shift(); } catch(e){} }
  function bump(map, k){ try { var s = String(k || '?'); map[s] = (map[s] || 0) + 1; } catch(e){} }

  /* GWS による直列化が必要か。必要でなければ legacy と 1 バイトも変わらない。 */
  function required(){
    var G = gws();
    if (!G || typeof G.serializationRequired !== 'function') return false;
    try { return !!G.serializationRequired(); } catch(e){ return false; }
  }

  /* いま Class D admission の内側か。★同期・boolean。
     token は GWS の lock callback 内でしか発行されないので、
     「同じタブだから」では true にならない（裁定: 汎用 reentrant 禁止）。 */
  function inTransaction(){
    var G = gws();
    if (!G || typeof G.isLockOwner !== 'function') return false;
    try { return !!(ACTIVE && G.isLockOwner(ACTIVE)); } catch(e){ return false; }
  }

  function holdOf(label, x){
    var o = { ran:false, ok:false, code:'CLASS_D_ADMISSION_HOLD', label:String(label || '?'),
              reason: (x && x.reason) || 'BUSY',
              isolation: (x && x.isolation) || null,
              isolationDetail: (x && x.isolationDetail) || null,
              policy: (x && x.policy) || 'TURN_MUTATION_BUSY_HOLD',
              wrote: 0, mutated: false };
    STATS.held++; bump(STATS.heldByReason, o.reason);
    note({ act:'hold', label:o.label, reason:o.reason, isolation:o.isolation });
    return o;
  }

  /* Class D admission。
     ・fn は同期関数（戻り値は何でもよい）。**Promise を返させない**。
     ・戻りは常に Promise<{ran:true,result} | {ran:false,...}>。
     ・既に admission の内側なら lock を取り直さず、そのまま実行する（nested）。 */
  function run(label, fn){
    if (typeof fn !== 'function')
      return Promise.resolve({ ran:false, ok:false, code:'CLASS_D_ADMISSION_BAD_FN', wrote:0 });
    var G = gws();
    if (!G || typeof G.runTurnMutation !== 'function' || !required()){
      STATS.legacy++;
      return Promise.resolve({ ran:true, result: fn(), serialized:false, legacy:true });
    }
    if (inTransaction()){
      STATS.nested++;
      return Promise.resolve({ ran:true, result: fn(), serialized:true, nested:true });
    }
    return G.runTurnMutation(function(tok){
      var prev = ACTIVE;
      ACTIVE = tok;
      try { return fn(); }
      finally { ACTIVE = prev; }        /* ★lock を出たら必ず落とす */
    }).then(function(x){
      if (x && x.ran === true){
        STATS.admitted++;
        note({ act:'admitted', label:String(label || '?') });
        return { ran:true, result: x.result, serialized:true };
      }
      return holdOf(label, x);
    }, function(e){
      return holdOf(label, { reason:'ADMISSION_THREW', policy:'TURN_MUTATION_BUSY_HOLD',
                             isolationDetail: String(e && e.message || e) });
    });
  }

  /* sync writer 用: 「いま書いてよいか」の同期判定。
     required() なのに admission の外なら **書かせない**（Class D の write0）。
     戻り: null = 書いてよい / {hold:...} = 書いてはいけない */
  function syncGuard(who){
    if (!required()) return null;                 /* legacy: 従来どおり */
    if (inTransaction()) return null;             /* 上位 admission の内側 */
    STATS.syncRefused++; bump(STATS.syncRefusedBy, who);
    note({ act:'sync-refused', who:String(who || '?'),
           why:'Class D writer が admission の外から呼ばれた。書かずに hold する' });
    return { hold:true, code:'CLASS_D_SYNC_WRITE_REFUSED', who:String(who || '?'),
             reason:'NOT_IN_ADMISSION', wrote:0, mutated:false };
  }

  /* ============================ CLASS C ============================
     裁定 Class C contract:
       BUSY → SKIP_THIS_PERSIST。ただし許されるのは
         RECOMPUTATION_SOURCE（その write を完全に失っても正しい値を再構成できる durable source）
         RECOMPUTATION_TRIGGER（BUSY で skip した後、実際に再構成/persist を再試行する契機）
       の **両方**を提示できる writer だけ。「冪等」「timer がある」だけでは proof にならない。
     ★Class C と Class D の違いはただ 1 点:
         Class D … skip したら **上位の semantic operation も成功させない**
         Class C … skip しても上位は成功でよい。値は TRIGGER で必ず追いつく
     ★各 writer は register() で SOURCE / TRIGGER を宣言する。宣言の無い writer は
       skipGuard が **Class D 相当の hold** を返す（fail-closed。黙って skip させない）。 */
  var CREG = {};                       /* who -> { source, trigger, note } */
  var CQ = Promise.resolve();          /* 自 context 内の deferred Class C persist の待ち行列 */
  function registerC(who, source, trigger, note){
    if (!who || !source || !trigger) return false;
    CREG[String(who)] = { source: String(source), trigger: String(trigger), note: note || null };
    return true;
  }
  /* sync な Class C persist 用の同期判定。
     戻り: null = 書いてよい / {skip:true,...} = この 1 回の persist を飛ばす（メモリは進めてよい）
           / {hold:true,...} = 宣言が無いので Class D 相当で止める */
  function skipGuard(who){
    if (!required()) return null;
    if (inTransaction()) return null;
    var reg = CREG[String(who)];
    if (!reg){
      STATS.syncRefused++; bump(STATS.syncRefusedBy, who);
      note({ act:'classC-unregistered', who:String(who || '?'),
             why:'RECOMPUTATION_SOURCE / TRIGGER の宣言が無い Class C writer は skip させない（fail-closed）' });
      return { hold:true, code:'CLASS_C_UNREGISTERED_WRITER', who:String(who || '?'),
               reason:'NO_RECOMPUTATION_PROOF', wrote:0, mutated:false };
    }
    STATS.cSkipped++; bump(STATS.cSkippedBy, who);
    note({ act:'classC-skip', who:String(who || '?'),
           source: reg.source, trigger: reg.trigger,
           why:'admission 外なのでこの 1 回の persist を飛ばす。値は TRIGGER で追いつく' });
    return { skip:true, code:'CLASS_C_PERSIST_SKIPPED', who:String(who || '?'),
             source: reg.source, trigger: reg.trigger, wrote:0 };
  }
  /* ★★裁定11 GATE1 で判明した設計欠陥の修正:
     旧 skipGuard は「admission の外なら常に skip」だったため、
     同期の Class C writer（boot 時の正規化など）は **C1 active 中に一度も書けない**。
     これは SKIP_THIS_PERSIST（＝BUSY のときだけ飛ばす）ではなく「常に飛ばす」であり、
     TRIGGER が何回来ても収束しない。

     persistC(who, fn) はこれを正す:
       ・admission の内側        … その場で fn() を実行（従来どおり同期）
       ・admission の外・lock 空 … runC で **実際に lock を取って書く**（同一 tick では書かないが必ず書く）
       ・admission の外・BUSY    … そこで初めて SKIP_THIS_PERSIST
     戻り値は常に同期（Promise を caller へ漏らさない）。 */
  function persistC(who, fn){
    if (typeof fn !== 'function') return { skip:true, code:'CLASS_C_BAD_FN', wrote:0 };
    if (!required()){ fn(); return { wrote:1, legacy:true }; }
    if (inTransaction()){ fn(); return { wrote:1, nested:true }; }
    var reg = CREG[String(who)];
    if (!reg){
      STATS.syncRefused++; bump(STATS.syncRefusedBy, who);
      note({ act:'classC-unregistered', who:String(who || '?'),
             why:'RECOMPUTATION_SOURCE / TRIGGER の宣言が無い Class C writer は走らせない（fail-closed）' });
      return { hold:true, code:'CLASS_C_UNREGISTERED_WRITER', who:String(who || '?'),
               reason:'NO_RECOMPUTATION_PROOF', wrote:0 };
    }
    /* ★同期契約は保つ。lock 取得は非同期に走らせ、BUSY のときだけ skip する。
       ★boot barrier PENDING は「BUSY」ではなく「まだ誰も書いてよい時刻ではない」状態なので、
         barrier が settle してから **1 回だけ**やり直す。
         これが無いと、boot 時に走る Class C 正規化は毎回 barrier に弾かれて一度も書けず、
         「TRIGGER が来ても収束しない」（＝裁定11 GATE1 が要求する再収束が成立しない）。 */
    STATS.cDeferred = (STATS.cDeferred || 0) + 1;
    var label = 'CLASS_C:' + String(who);
    /* ★裁定11 GATE1 で判明: 同じ context 内で deferred な Class C persist が同時に複数走ると、
       ifAvailable の取り合いで **自分たち同士で BUSY になり**、ほとんどが落ちる。
       GWS は「別 context との直列化」の仕組みなので、自 context 内は素直に 1 本の待ち行列にする。
       （lock を長く握るわけではない。1 件ずつ順に取りに行くだけ） */
    function barrierPending(x){
      return !!(x && x.reason && String(x.reason).indexOf('BOOT_RECOVERY_BARRIER') === 0);
    }
    CQ = CQ.then(function(){ return runC(label, fn); }).then(function(x){
      if (x && x.ran === true) return;
      if (barrierPending(x)){
        var G = gws();
        STATS.cBarrierRetry = (STATS.cBarrierRetry || 0) + 1;
        note({ act:'classC-barrier-retry', who:String(who || '?'), reason: x.reason });
        var wait = (G && typeof G.whenBootSettled === 'function')
                     ? G.whenBootSettled() : Promise.resolve(null);
        return wait.then(function(){ return runC(label, fn); }).then(function(y){
          if (y && y.ran === true) return;
          note({ act:'classC-skip-deferred', who:String(who || '?'),
                 source: reg.source, trigger: reg.trigger,
                 why:'barrier settle 後も BUSY だったので飛ばした。値は TRIGGER で追いつく' });
        });
      }
      note({ act:'classC-skip-deferred', who:String(who || '?'),
             source: reg.source, trigger: reg.trigger,
             why:'lock が BUSY だったのでこの 1 回の persist を飛ばした。値は TRIGGER で追いつく' });
    }, function(){});
    return { deferred:true, code:'CLASS_C_PERSIST_DEFERRED', who:String(who || '?'),
             source: reg.source, trigger: reg.trigger, wrote:0 };
  }

  /* async な Class C entry。BUSY は失敗ではなく skip。 */
  function runC(label, fn){
    if (typeof fn !== 'function')
      return Promise.resolve({ ran:false, ok:false, code:'CLASS_C_BAD_FN', wrote:0 });
    var G = gws();
    if (!G || typeof G.runRecomputable !== 'function' || !required()){
      STATS.legacy++;
      return Promise.resolve({ ran:true, result: fn(), serialized:false, legacy:true });
    }
    if (inTransaction()){
      STATS.nested++;
      return Promise.resolve({ ran:true, result: fn(), serialized:true, nested:true });
    }
    return G.runRecomputable(function(tok){
      var prev = ACTIVE; ACTIVE = tok;
      try { return fn(); } finally { ACTIVE = prev; }
    }).then(function(x){
      if (x && x.ran === true){ STATS.admitted++; return { ran:true, result:x.result, serialized:true }; }
      STATS.cSkipped++; bump(STATS.cSkippedBy, label);
      note({ act:'classC-skip-async', label:String(label || '?'), reason:(x && x.reason) || 'BUSY' });
      return { ran:false, ok:true, code:'CLASS_C_PERSIST_SKIPPED', label:String(label || '?'),
               reason:(x && x.reason) || 'BUSY', policy:'SKIP_THIS_PERSIST', wrote:0 };
    }, function(e){
      STATS.cSkipped++;
      return { ran:false, ok:true, code:'CLASS_C_PERSIST_SKIPPED', reason:'THREW',
               detail:String(e && e.message || e), policy:'SKIP_THIS_PERSIST', wrote:0 };
    });
  }

  /* 画面に出す一行。**内部コードをそのまま見せない**。 */
  function humanReason(x){
    var r = (x && x.reason) || '';
    if (r === 'CROSS_CONTEXT_BUSY')
      return '別のタブで物語データを更新中です。少し待ってからもう一度お試しください。';
    if (r === 'SLOT_ISOLATION_RUNTIME_HOLD')
      return '保存先の物語を確定できないため、この操作は行いませんでした。ページを開き直してからお試しください。';
    if (r === 'NOT_IN_ADMISSION')
      return 'この操作は保存の順番待ちに入れなかったため、行いませんでした。もう一度お試しください。';
    if (r === 'WEB_LOCKS_UNAVAILABLE')
      return 'この環境では保存の順番待ちが使えないため、この操作は行いませんでした。';
    if (String(r).indexOf('BOOT_RECOVERY_BARRIER') === 0)
      return '起動時の後片づけが終わるまで待ってください。';
    return 'この操作は行いませんでした（保存の順番待ちに入れませんでした）。';
  }

  window.__v292DfixDAdm = {
    BUILD: BUILD,
    required: required,
    inTransaction: inTransaction,
    run: run,
    syncGuard: syncGuard,
    /* Class C */
    runC: runC,
    registerC: registerC,
    skipGuard: skipGuard,
    persistC: persistC,
    classCRegistry: function(){ try { return JSON.parse(JSON.stringify(CREG)); } catch(e){ return null; } },
    humanReason: humanReason,
    stats: function(){ try { return JSON.parse(JSON.stringify(STATS)); } catch(e){ return null; } },
    log: function(){ return LOG.slice(); },
    /* 観測用。token そのものは返さない（forge 防止） */
    _debug: function(){ return { hasToken: !!ACTIVE, inTxn: inTransaction(), required: required() }; }
  };
  try { console.log('[v292Dfix748]', 'class D admission armed', BUILD); } catch(e){}
})();
