// v265-death-persistence.js
// 目的: 「死亡したキャラが推論で蘇生する」バグの修正
//
// 観測:
//   v259 の state-inference は narrative 全文を見て alive/conscious/canSpeak/canAct を判定。
//   後のターンで死亡キャラが言及されると (回想/亡霊として登場/カエデが見る幻覚等) ,
//   LLM が「生きている」と誤判定し alive=true を返してしまう。
//   v259/v260/v264 の applyInferredStates は無条件で boolean を上書きするので、
//   死者が「健康・HP100」に戻ってしまう。
//
// 修正方針:
//   - applyInferredStates / applyExtendedFields を再 wrap
//   - 死亡 sticky: alive=false / condition=死亡 が一度立ったら、
//     明示的な蘇生キーワード (蘇生/復活/生き返/魂が戻/再生する) が narrative にない限り
//     alive=true への上書きを拒否
//   - condition 同様: 死亡→健康 は明示蘇生時のみ許可
//   - hpEstimate も死亡キャラは 0 を維持
//   - bodyParts/restraints は v264 が既にガード済み (intact化拒否) なので追加不要
//
// ガード: window.__v265Active

(function v265() {
  'use strict';
  if (window.__v265Active) {
    console.log('[v265] already active, skip');
    return;
  }
  window.__v265Active = true;
  console.log('[v265] death-persistence init');

  var REVIVAL_RX = /(蘇生|蘇って|復活|生き返|魂が戻|再生する|息を吹き返|目を開ける.{0,10}(再び|もう一度))/;

  function getLatestNarrative() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var turns = s.turns || [];
      // 直近 3 ターン分の narrative を結合 (蘇生キーワード検出用)
      return turns.slice(-3).map(function (t) { return t && t.narrative || ''; }).join('\n');
    } catch (e) { return ''; }
  }

  function hasRevivalContext() {
    var narr = getLatestNarrative();
    return REVIVAL_RX.test(narr);
  }

  // ========================================================================
  // applyInferredStates (v259) を wrap して死亡 sticky を実装
  // ========================================================================
  function patch() {
    if (!window.__v259) return false;
    if (window.__v265Patched) return true;

    // v259 の applyInferredStates は callInference 内 closure から直接呼ばれるため、
    // window.__v259 経由では公開されていない。代わりに setItem hook で
    // 「死亡キャラの alive=true 上書き」を検知して revert する。

    try {
      var proto = Storage.prototype;
      if (proto.setItem.__v265Hooked) {
        window.__v265Patched = true;
        return true;
      }
      var origSet = proto.setItem;
      proto.setItem = function (key, value) {
        if (key === 'chr6' && typeof value === 'string') {
          try {
            var newState = JSON.parse(value);
            var oldRaw = origSet.call.bind(origSet); // bind self
            var oldStr = window.localStorage.getItem('chr6') || '{}';
            var oldState = JSON.parse(oldStr);
            var revived = false;
            // hero
            if (newState.cast && newState.cast.hero) {
              var h = newState.cast.hero;
              var oldH = oldState.cast && oldState.cast.hero;
              if (revertDeathIfNeeded(h, oldH)) revived = true;
            }
            // npcs
            if (newState.cast && Array.isArray(newState.cast.npcs)) {
              newState.cast.npcs.forEach(function (n) {
                if (!n || !n.name) return;
                var oldN = (oldState.cast && oldState.cast.npcs || []).find(function (x) {
                  return x && x.name === n.name;
                });
                if (revertDeathIfNeeded(n, oldN)) revived = true;
              });
            }
            if (revived) {
              value = JSON.stringify(newState);
              if (!window.__v265Reverts) window.__v265Reverts = 0;
              window.__v265Reverts++;
            }
          } catch (e) {}
        }
        return origSet.call(this, key, value);
      };
      proto.setItem.__v265Hooked = true;
      window.__v265Patched = true;
      console.log('[v265] death-persistence setItem hook installed');
      return true;
    } catch (e) {
      return false;
    }
  }

  function revertDeathIfNeeded(newChar, oldChar) {
    if (!newChar || !newChar.state) return false;
    if (!oldChar || !oldChar.state) return false;
    var os = oldChar.state, ns = newChar.state;
    var wasDead = os.alive === false || os.condition === '死亡';
    if (!wasDead) return false;
    var nowAlive = ns.alive === true && ns.condition !== '死亡';
    if (!nowAlive) return false;
    // 蘇生キーワードが直近 narrative にあれば許可
    if (hasRevivalContext()) {
      console.log('[v265] revival context detected for', newChar.name, '— allowing');
      return false;
    }
    // 蘇生コンテキスト無し → 死亡状態を維持
    ns.alive = false;
    ns.conscious = false;
    ns.canSpeak = false;
    ns.canAct = false;
    ns.condition = '死亡';
    ns.hpEstimate = 0;
    if (typeof os.diedAtTurn === 'number') ns.diedAtTurn = os.diedAtTurn;
    console.log('[v265] reverted dead character to deceased state:', newChar.name);
    return true;
  }

  patch();
  var tries = 0;
  var iv = setInterval(function () {
    if (patch() || ++tries > 30) clearInterval(iv);
  }, 500);

  // 起動時に既存 state を一度チェックして、既に蘇生してしまっている死亡キャラは元に戻す
  // (本セッション開始前に蘇生済みの場合の復旧)
  setTimeout(function () {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      if (!s.cast) return;
      var revived = false;
      // injuryLog から「死亡」相当のキーワードが含まれているか確認
      function hadDeath(c) {
        if (!c.state) return false;
        if (typeof c.state.diedAtTurn === 'number') return true;
        var log = c.state.injuryLog || [];
        return log.some(function (e) { return /死亡|死んだ|事切れ|絶命|喰われた/.test(e.cause || ''); });
      }
      var allChars = [s.cast.hero].concat(s.cast.npcs || []).filter(Boolean);
      allChars.forEach(function (c) {
        if (!c.state) return;
        if (hadDeath(c) && c.state.alive === true && !hasRevivalContext()) {
          c.state.alive = false;
          c.state.conscious = false;
          c.state.canSpeak = false;
          c.state.canAct = false;
          c.state.condition = '死亡';
          c.state.hpEstimate = 0;
          revived = true;
          console.log('[v265] startup-restored deceased state for:', c.name);
        }
      });
      if (revived) {
        window.__v259Writing = true;
        try { localStorage.setItem('chr6', JSON.stringify(s)); } finally {
          setTimeout(function () { window.__v259Writing = false; }, 250);
        }
        try { if (window.__v259 && window.__v259.postProcessAllTurns) window.__v259.postProcessAllTurns(); } catch (e) {}
      }
    } catch (e) {}
  }, 3000);

  console.log('[v265] init complete');
})();
