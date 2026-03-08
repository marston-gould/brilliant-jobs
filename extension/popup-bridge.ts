// popup-bridge.ts — Compatibility shims and unified log
// Must load BEFORE popup.js (creates dummy elements it expects)
// Then popup.js loads
// Then popup-post.js handles overrides

(function() {
  // Create dummy elements for log IDs that popup.js references
  ['h-log','s-log','j-log','d-log'].forEach(id => {
    if (!document.getElementById(id)) {
      const dummy = document.createElement('div');
      dummy.id = id;
      dummy.style.display = 'none';
      document.body.appendChild(dummy);
    }
  });

  // s-harvest-hint needs to exist as a real element
  if (!document.getElementById('s-harvest-hint')) {
    const hint = document.createElement('div');
    hint.id = 's-harvest-hint';
    hint.style.display = 'none';
    document.body.appendChild(hint);
  }
})();
