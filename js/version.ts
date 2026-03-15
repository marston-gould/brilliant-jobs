<<<<<<< HEAD
var BJ_VERSION = 'v9.57';
=======
var BJ_VERSION = 'v9.56';
>>>>>>> b298dc3103325f62f4b7a8a26a1dc32a74d36f14
(function(): void {
  function populateVersion(): void {
    document.querySelectorAll('.bj-version, [id$="-version"]').forEach(function(el: Element): void {
      el.textContent = BJ_VERSION;
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateVersion);
  } else {
    populateVersion();
  }
})();
