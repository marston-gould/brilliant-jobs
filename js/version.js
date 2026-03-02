var BJ_VERSION = 'v6.26';
(function() {
  function populateVersion() {
    // Populate all .bj-version elements
    document.querySelectorAll(".bj-version, [id$=\"-version\"]").forEach(function(el) {
      el.textContent = BJ_VERSION;
    });
    // Populate all .bj-year elements
    var year = new Date().getFullYear();
    document.querySelectorAll(".bj-year").forEach(function(el) {
      el.textContent = year;
    });
    // Console log
    console.log("[BJ] " + BJ_VERSION);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populateVersion);
  } else {
    populateVersion();
  }
})();
