var BJ_VERSION = 'v10.47';
// Populate version display elements after DOM is ready
(function() {
  var el = document.getElementById('nav-version');
  if (el) el.textContent = BJ_VERSION;
  document.querySelectorAll('.bj-version').forEach(function(v: Element) { v.textContent = BJ_VERSION; });
})();
