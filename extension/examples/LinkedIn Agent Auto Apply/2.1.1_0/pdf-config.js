// pdf-config.js - Configure PDF.js to use local worker
(function() {
  'use strict';
  
  // Configure PDF.js to use local worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
    console.log("📚 PDF.js loaded successfully for proper PDF text extraction");
  } else {
    console.log("⚠️ PDF.js failed to load, will use fallback extraction");
  }
})(); 