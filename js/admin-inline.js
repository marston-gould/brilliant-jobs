// CS-P1-002 SE-005: Admin inline scripts extracted for CSP compliance
// Cohort select-all checkbox handler
document.addEventListener('DOMContentLoaded', function() {
  var selectAll = document.getElementById('cohort-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      var checked = this.checked;
      document.querySelectorAll('.cohort-row-cb').forEach(function(cb) { cb.checked = checked; });
      if (typeof updateCohortCharts === 'function') updateCohortCharts();
    });
  }
});
