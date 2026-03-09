var BJ_VERSION = "v7.91";
(function() {
  function populateVersion() {
    document.querySelectorAll('.bj-version, [id$="-version"]').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populateVersion);
  } else {
    populateVersion();
  }
})();
