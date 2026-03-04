var BJ_VERSION = 'v6.81';
(function() {
  function populateVersion() {
    // Populate all .bj-version elements
    document.querySelectorAll(".bj-version, [id$=\"-version\"]").forEach(function(el) {
      el.textContent = BJ_VERSION;
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateVersion);
  } else {
    populateVersion();
  }
})();
