var BJ_VERSION = "v10.79";
(function() {
  var el = document.getElementById("nav-version");
  if (el) el.textContent = BJ_VERSION;
  document.querySelectorAll(".bj-version").forEach(function(v) {
    v.textContent = BJ_VERSION;
  });
})();
