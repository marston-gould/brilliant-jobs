var BJ_VERSION = 'v8.50';
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
