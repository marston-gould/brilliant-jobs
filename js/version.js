var BJ_VERSION = "v11.34";
(function() {
  var el = document.getElementById("nav-version");
  if (el) el.textContent = BJ_VERSION;
  document.querySelectorAll(".bj-version").forEach(function(v) {
    v.textContent = BJ_VERSION;
  });
})();
