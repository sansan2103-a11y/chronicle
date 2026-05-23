// =====================================================================
// Chronicle TRPG — v292Dfix90: Planner extension de-duplication
// ---------------------------------------------------------------------
//  Problem: several fixes hot-swap themselves via
//    Planner._extensions = Planner._extensions.filter(...)
//  which creates a NEW array and drops every OTHER fix's array-level
//  self-heal flag (arr.__v292DfixNN). Their setInterval reinstallers then
//  see the flag missing and re-push their extension WITHOUT removing the
//  copy that's already present → duplicates accumulate during play
//  (e.g. gender enforcement sys=32 → sys=38), and the console fills with
//  "... reinstalled" spam that buries real errors.
//
//  Fix: a light periodic pass that removes EXACT-duplicate references
//  from Planner._extensions and Planner._parseExtensions, IN PLACE
//  (splice — never reassign, so the array identity and existing flags are
//  preserved and no reinstall cascade is triggered). Keeps the first
//  occurrence, so ordering is unchanged. Running an extension once vs.
//  twice is semantically identical for these pure transforms, so dropping
//  the redundant copies is safe. This does NOT touch any existing
//  interval/filter — it only bounds the accumulation.
// =====================================================================
(function(){
  if (window.__v292Dfix90Active) return;
  window.__v292Dfix90Active = true;
  var TAG = '[v292Dfix90]';

  function getPlanner(){
    if (window.Planner) return window.Planner;
    try { return (typeof Planner !== 'undefined') ? Planner : null; } catch(e){ return null; }
  }

  // Remove later exact-duplicate references in place. Returns # removed.
  function dedupeInPlace(arr){
    if (!Array.isArray(arr)) return 0;
    var seen = [];
    var removed = 0;
    for (var i = 0; i < arr.length; i++){
      if (seen.indexOf(arr[i]) !== -1){
        arr.splice(i, 1);   // in place: preserves array identity + flag props
        i--;
        removed++;
      } else {
        seen.push(arr[i]);
      }
    }
    return removed;
  }

  function pass(){
    var P = getPlanner();
    if (!P) return;
    var a = dedupeInPlace(P._extensions);
    var b = dedupeInPlace(P._parseExtensions);
    if (a + b > 0){
      try { console.log(TAG, 'deduped', a, '_extensions +', b, '_parseExtensions (in place)'); } catch(_){}
    }
  }

  // Run shortly after load (let fixes install), then keep it bounded.
  setTimeout(pass, 1500);
  setInterval(pass, 4000);

  // Manual trigger for diagnostics
  window.__v292Dfix90 = { pass: pass, dedupeInPlace: dedupeInPlace };
  console.log(TAG, 'extension de-dup active (in-place, ref-identity)');
})();
