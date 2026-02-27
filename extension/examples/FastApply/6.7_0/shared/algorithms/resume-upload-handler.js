// shared/algorithms/resume-upload-handler.js
// Resume Upload Variations Handler

/**
 * RESUME UPLOAD VARIATIONS HANDLER
 * ==================================
 *
 * Resume uploads come in many flavors:
 * - Standard file input (<input type="file">)
 * - Drag and drop zones
 * - Click to upload buttons (that trigger hidden file inputs)
 * - Third-party services (LinkedIn, Indeed, Dropbox)
 * - URL submission
 * - Copy/paste text
 * - Parse and fill individual fields
 *
 * This module detects and handles all of these.
 */

// ============================================================================
// PART 1: UPLOAD MECHANISM TAXONOMY
// ============================================================================

export const UploadMechanism = {
  // Standard file inputs
  FILE_INPUT_VISIBLE: 'file_input_visible',
  FILE_INPUT_HIDDEN: 'file_input_hidden',

  // Drag and drop
  DROP_ZONE: 'drop_zone',
  DROP_ZONE_WITH_CLICK: 'drop_zone_with_click',

  // Third-party
  LINKEDIN_IMPORT: 'linkedin_import',
  INDEED_IMPORT: 'indeed_import',
  DROPBOX_IMPORT: 'dropbox_import',
  GOOGLE_DRIVE_IMPORT: 'google_drive_import',

  // Alternative inputs
  URL_INPUT: 'url_input',
  TEXT_PASTE: 'text_paste',
  FORM_FIELDS: 'form_fields',

  // Compound
  MULTIPLE_OPTIONS: 'multiple_options',

  // Problematic
  UNKNOWN: 'unknown',
  UNSUPPORTED: 'unsupported',
};

// ============================================================================
// PART 2: UPLOAD DETECTOR
// ============================================================================

export class UploadDetector {
  /**
   * Detect all upload mechanisms on the page
   * @param {Object} accessibilityTree - Accessibility tree from read_page
   * @param {string} pageContent - HTML content of the page
   * @returns {Array} Array of UploadTarget objects
   */
  detectUploadMechanisms(accessibilityTree, pageContent) {
    const targets = [];

    // Detect visible file inputs
    targets.push(...this.detectVisibleFileInputs(accessibilityTree));

    // Detect hidden file inputs with trigger buttons
    targets.push(...this.detectHiddenFileInputs(accessibilityTree, pageContent));

    // Detect drag and drop zones
    targets.push(...this.detectDropZones(accessibilityTree, pageContent));

    // Detect third-party import buttons
    targets.push(...this.detectThirdPartyImports(accessibilityTree, pageContent));

    // Detect URL inputs
    targets.push(...this.detectUrlInputs(accessibilityTree));

    // Detect text paste areas
    targets.push(...this.detectTextPasteAreas(accessibilityTree, pageContent));

    // Sort by confidence and filter duplicates
    return this.deduplicateAndSort(targets);
  }

  detectVisibleFileInputs(tree) {
    const targets = [];
    const allNodes = this.flattenTree(tree);

    for (const node of allNodes) {
      if (this.isFileInput(node) && this.isVisible(node)) {
        const label = this.getLabel(node, tree);
        const isResumeField = this.isResumeField(label, node);

        if (isResumeField) {
          targets.push({
            mechanism: UploadMechanism.FILE_INPUT_VISIBLE,
            fileInputRef: node.ref,
            acceptedFormats: this.parseAcceptAttribute(node.attributes?.accept),
            maxFileSize: this.parseMaxSize(node),
            label,
            isRequired: node.attributes?.required === 'true',
            hasExistingUpload: this.hasExistingFile(node, tree),
            confidence: 0.9,
          });
        }
      }
    }

    return targets;
  }

  detectHiddenFileInputs(tree, pageContent) {
    const targets = [];
    const allNodes = this.flattenTree(tree);

    const hiddenFileInputs = allNodes.filter(node =>
      this.isFileInput(node) && !this.isVisible(node)
    );

    for (const hiddenInput of hiddenFileInputs) {
      const triggerButton = this.findTriggerButton(hiddenInput, tree, pageContent);

      if (triggerButton) {
        const label = this.getLabel(hiddenInput, tree) || this.getLabel(triggerButton, tree);

        if (this.isResumeField(label, hiddenInput) || this.isResumeField(label, triggerButton)) {
          targets.push({
            mechanism: UploadMechanism.FILE_INPUT_HIDDEN,
            fileInputRef: hiddenInput.ref,
            triggerRef: triggerButton.ref,
            acceptedFormats: this.parseAcceptAttribute(hiddenInput.attributes?.accept),
            label,
            isRequired: hiddenInput.attributes?.required === 'true',
            confidence: 0.85,
          });
        }
      }
    }

    return targets;
  }

  detectDropZones(tree, pageContent) {
    const targets = [];

    const dropZonePatterns = [
      /drop[-_]?zone/i,
      /drag[-_]?drop/i,
      /file[-_]?drop/i,
      /upload[-_]?area/i,
      /droparea/i,
    ];

    const visualCues = [
      /drag\s*(and|&)?\s*drop/i,
      /drop\s*(your\s*)?(file|resume|cv)/i,
      /drag\s*(your\s*)?(file|resume|cv)/i,
    ];

    const allNodes = this.flattenTree(tree);

    for (const node of allNodes) {
      const classes = node.attributes?.class || '';
      const id = node.attributes?.id || '';
      const text = node.name || '';

      let isDropZone = dropZonePatterns.some(p => p.test(classes) || p.test(id));
      isDropZone = isDropZone || visualCues.some(p => p.test(text));

      const nodeHtml = this.getNodeHtml(node, pageContent);
      isDropZone = isDropZone || /ondrop|ondragover|ondragenter/i.test(nodeHtml || '');

      if (isDropZone && this.isVisible(node)) {
        const hasClick = /onclick|click/i.test(nodeHtml || '') ||
                        node.role === 'button' ||
                        classes.includes('clickable');

        targets.push({
          mechanism: hasClick ? UploadMechanism.DROP_ZONE_WITH_CLICK : UploadMechanism.DROP_ZONE,
          dropZoneRef: node.ref,
          dropZoneSelector: this.buildSelector(node),
          label: this.extractDropZoneLabel(node, tree),
          isRequired: false,
          confidence: 0.75,
        });
      }
    }

    return targets;
  }

  detectThirdPartyImports(tree, pageContent) {
    const targets = [];
    const allNodes = this.flattenTree(tree);

    const importServices = [
      {
        name: 'linkedin',
        patterns: [/linkedin/i, /apply\s*with\s*linkedin/i, /import\s*from\s*linkedin/i],
        mechanism: UploadMechanism.LINKEDIN_IMPORT,
      },
      {
        name: 'indeed',
        patterns: [/indeed/i, /import\s*from\s*indeed/i],
        mechanism: UploadMechanism.INDEED_IMPORT,
      },
      {
        name: 'dropbox',
        patterns: [/dropbox/i, /import\s*from\s*dropbox/i],
        mechanism: UploadMechanism.DROPBOX_IMPORT,
      },
      {
        name: 'google_drive',
        patterns: [/google\s*drive/i, /import\s*from\s*google/i, /gdrive/i],
        mechanism: UploadMechanism.GOOGLE_DRIVE_IMPORT,
      },
    ];

    for (const node of allNodes) {
      if (node.role !== 'button' && node.role !== 'link') continue;

      const text = (node.name || '').toLowerCase();
      const classes = (node.attributes?.class || '').toLowerCase();
      const id = (node.attributes?.id || '').toLowerCase();

      for (const service of importServices) {
        const matches = service.patterns.some(p =>
          p.test(text) || p.test(classes) || p.test(id)
        );

        if (matches) {
          targets.push({
            mechanism: service.mechanism,
            importButtonRef: node.ref,
            importService: service.name,
            label: node.name,
            confidence: 0.8,
          });
        }
      }
    }

    return targets;
  }

  detectUrlInputs(tree) {
    const targets = [];
    const allNodes = this.flattenTree(tree);

    const urlPatterns = [
      /resume[-_]?url/i,
      /cv[-_]?url/i,
      /linkedin[-_]?(profile[-_]?)?(url)?/i,
      /portfolio[-_]?url/i,
    ];

    for (const node of allNodes) {
      if (node.role !== 'textbox') continue;

      const type = node.attributes?.type;
      const name = node.attributes?.name || '';
      const id = node.attributes?.id || '';
      const placeholder = node.attributes?.placeholder || '';
      const label = this.getLabel(node, tree) || '';

      const combinedText = `${name} ${id} ${placeholder} ${label}`.toLowerCase();

      const isUrlInput = type === 'url' || urlPatterns.some(p => p.test(combinedText));

      if (isUrlInput) {
        targets.push({
          mechanism: UploadMechanism.URL_INPUT,
          urlInputRef: node.ref,
          label: label || placeholder,
          confidence: 0.7,
        });
      }
    }

    return targets;
  }

  detectTextPasteAreas(tree, pageContent) {
    const targets = [];
    const allNodes = this.flattenTree(tree);

    const pastePatterns = [
      /paste[-_]?resume/i,
      /paste[-_]?cv/i,
      /copy[-_]?paste/i,
      /resume[-_]?text/i,
      /cv[-_]?text/i,
    ];

    for (const node of allNodes) {
      if (node.role !== 'textbox') continue;

      const isMultiline = node.attributes?.multiline === 'true' ||
                         (node.attributes?.rows && parseInt(node.attributes.rows) > 3);

      if (!isMultiline) continue;

      const name = node.attributes?.name || '';
      const id = node.attributes?.id || '';
      const placeholder = node.attributes?.placeholder || '';
      const label = this.getLabel(node, tree) || '';

      const combinedText = `${name} ${id} ${placeholder} ${label}`.toLowerCase();

      const isPasteArea = pastePatterns.some(p => p.test(combinedText)) ||
                         (combinedText.includes('resume') && combinedText.includes('text'));

      if (isPasteArea) {
        targets.push({
          mechanism: UploadMechanism.TEXT_PASTE,
          textAreaRef: node.ref,
          label: label || placeholder,
          confidence: 0.65,
        });
      }
    }

    return targets;
  }

  // ---- Helper Methods ----

  flattenTree(node, result = []) {
    if (!node) return result;
    result.push(node);
    for (const child of node.children || []) {
      this.flattenTree(child, result);
    }
    return result;
  }

  isFileInput(node) {
    return node.attributes?.type === 'file' ||
           (node.role === 'button' && node.attributes?.['aria-label']?.toLowerCase().includes('upload'));
  }

  isVisible(node) {
    const style = node.attributes?.style || '';
    const classes = node.attributes?.class || '';

    if (/display:\s*none/i.test(style)) return false;
    if (/visibility:\s*hidden/i.test(style)) return false;
    if (node.attributes?.hidden === 'true') return false;
    if (/\bhidden\b/i.test(classes)) return false;

    return true;
  }

  isResumeField(label, node) {
    const searchText = [
      label,
      node.name,
      node.attributes?.name,
      node.attributes?.id,
      node.attributes?.placeholder,
      node.attributes?.['aria-label'],
    ].filter(Boolean).join(' ').toLowerCase();

    return /resume|cv|curriculum|vitae/i.test(searchText);
  }

  getLabel(node, tree) {
    if (node.attributes?.['aria-label']) {
      return node.attributes['aria-label'];
    }

    if (node.attributes?.['aria-labelledby']) {
      const labelNode = this.findNodeByRef(tree, node.attributes['aria-labelledby']);
      if (labelNode?.name) return labelNode.name;
    }

    if (node.attributes?.id) {
      const labels = this.flattenTree(tree).filter(n =>
        n.role === 'label' && n.attributes?.for === node.attributes?.id
      );
      if (labels.length > 0 && labels[0].name) {
        return labels[0].name;
      }
    }

    return node.name;
  }

  findNodeByRef(tree, ref) {
    const nodes = this.flattenTree(tree);
    return nodes.find(n => n.ref === ref) || null;
  }

  parseAcceptAttribute(accept) {
    if (!accept) return undefined;
    return accept.split(',').map(s => s.trim());
  }

  parseMaxSize(node) {
    const maxSize = node.attributes?.['data-max-size'] ||
                   node.attributes?.['data-max-file-size'];
    if (maxSize) {
      return parseInt(maxSize, 10);
    }
    return undefined;
  }

  hasExistingFile(node, tree) {
    return false;
  }

  findTriggerButton(hiddenInput, tree, pageContent) {
    const inputId = hiddenInput.attributes?.id;
    if (inputId) {
      const nodes = this.flattenTree(tree);
      for (const node of nodes) {
        if (node.role === 'button') {
          const onclick = node.attributes?.onclick || '';
          const dataTarget = node.attributes?.['data-target'] || '';

          if (onclick.includes(inputId) || dataTarget === inputId || dataTarget === `#${inputId}`) {
            return node;
          }
        }
      }
    }

    const inputParent = this.findParent(hiddenInput, tree);
    if (inputParent) {
      const siblings = inputParent.children || [];
      for (const sibling of siblings) {
        if (sibling.role === 'button' && this.isUploadButton(sibling)) {
          return sibling;
        }
      }
    }

    return null;
  }

  findParent(node, tree) {
    return null;
  }

  isUploadButton(node) {
    const text = (node.name || '').toLowerCase();
    const classes = (node.attributes?.class || '').toLowerCase();

    return /upload|browse|choose|select/i.test(text) ||
           /upload|browse|file/i.test(classes);
  }

  getNodeHtml(node, pageContent) {
    return null;
  }

  buildSelector(node) {
    const id = node.attributes?.id;
    if (id) return `#${id}`;

    const classes = node.attributes?.class;
    if (classes) {
      return '.' + classes.split(' ').filter(Boolean).join('.');
    }

    return node.role || '*';
  }

  extractDropZoneLabel(node, tree) {
    return node.name || this.getLabel(node, tree);
  }

  deduplicateAndSort(targets) {
    const seen = new Set();
    const unique = targets.filter(t => {
      const key = t.fileInputRef || t.dropZoneRef || t.importButtonRef || t.urlInputRef || t.textAreaRef;
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });

    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}

// ============================================================================
// PART 3: UPLOAD EXECUTOR
// ============================================================================

export class UploadExecutor {
  constructor(browserTools) {
    this.browserTools = browserTools;
  }

  /**
   * Execute upload based on detected mechanism
   */
  async executeUpload(target, file) {
    switch (target.mechanism) {
      case UploadMechanism.FILE_INPUT_VISIBLE:
        return this.uploadViaFileInput(target, file);

      case UploadMechanism.FILE_INPUT_HIDDEN:
        return this.uploadViaHiddenInput(target, file);

      case UploadMechanism.DROP_ZONE:
      case UploadMechanism.DROP_ZONE_WITH_CLICK:
        return this.uploadViaDropZone(target, file);

      case UploadMechanism.LINKEDIN_IMPORT:
      case UploadMechanism.INDEED_IMPORT:
        return this.handleThirdPartyImport(target);

      case UploadMechanism.URL_INPUT:
        return this.uploadViaUrl(target, file);

      case UploadMechanism.TEXT_PASTE:
        return this.uploadViaTextPaste(target, file);

      default:
        return {
          success: false,
          mechanism: target.mechanism,
          error: `Unsupported upload mechanism: ${target.mechanism}`,
        };
    }
  }

  async uploadViaFileInput(target, file) {
    try {
      if (target.acceptedFormats && target.acceptedFormats.length > 0) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!target.acceptedFormats.some(f => f.toLowerCase() === ext || f === file.mimeType)) {
          return {
            success: false,
            mechanism: target.mechanism,
            error: `File format ${ext} not accepted. Accepted: ${target.acceptedFormats.join(', ')}`,
          };
        }
      }

      await this.browserTools.uploadFile(target.fileInputRef, file.path);
      await this.browserTools.wait(1000);

      const verified = await this.verifyUpload(target);

      return {
        success: verified,
        mechanism: target.mechanism,
        fileName: file.name,
        error: verified ? undefined : 'Upload could not be verified',
      };
    } catch (error) {
      return {
        success: false,
        mechanism: target.mechanism,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  async uploadViaHiddenInput(target, file) {
    try {
      const directResult = await this.uploadViaFileInput(
        { ...target, mechanism: UploadMechanism.FILE_INPUT_VISIBLE },
        file
      );

      if (directResult.success) {
        return { ...directResult, mechanism: target.mechanism };
      }

      return {
        success: false,
        mechanism: target.mechanism,
        needsUserAction: true,
        userActionMessage: 'Please select the file when the file dialog opens',
      };
    } catch (error) {
      return {
        success: false,
        mechanism: target.mechanism,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  async uploadViaDropZone(target, file) {
    try {
      const dropZoneCoords = await this.browserTools.getElementCoordinates(target.dropZoneRef);

      if (!dropZoneCoords) {
        if (target.mechanism === UploadMechanism.DROP_ZONE_WITH_CLICK) {
          return this.uploadViaClickableDropZone(target, file);
        }

        return {
          success: false,
          mechanism: target.mechanism,
          error: 'Could not locate drop zone',
        };
      }

      await this.browserTools.uploadImageToCoordinates(
        file.path,
        [dropZoneCoords.x, dropZoneCoords.y]
      );

      await this.browserTools.wait(1500);

      const verified = await this.verifyUpload(target);

      return {
        success: verified,
        mechanism: target.mechanism,
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        mechanism: target.mechanism,
        error: error instanceof Error ? error.message : 'Drag and drop failed',
      };
    }
  }

  async uploadViaClickableDropZone(target, file) {
    try {
      await this.browserTools.click(target.dropZoneRef);
      await this.browserTools.wait(500);

      return {
        success: false,
        mechanism: target.mechanism,
        needsUserAction: true,
        userActionMessage: 'Please select the file when the file dialog opens',
      };
    } catch (error) {
      return {
        success: false,
        mechanism: target.mechanism,
        error: error instanceof Error ? error.message : 'Click upload failed',
      };
    }
  }

  async handleThirdPartyImport(target) {
    return {
      success: false,
      mechanism: target.mechanism,
      needsUserAction: true,
      userActionMessage: `Please complete the ${target.importService} import process`,
    };
  }

  async uploadViaUrl(target, file) {
    return {
      success: false,
      mechanism: target.mechanism,
      needsUserAction: true,
      userActionMessage: 'Please enter a URL where your resume is hosted',
    };
  }

  async uploadViaTextPaste(target, file) {
    try {
      let resumeText;

      if (file.content) {
        resumeText = await this.extractTextFromFile(file.content, file.name);
      } else {
        resumeText = await this.browserTools.readFileAsText(file.path);
      }

      if (!resumeText) {
        return {
          success: false,
          mechanism: target.mechanism,
          error: 'Could not extract text from resume',
        };
      }

      await this.browserTools.setFormValue(target.textAreaRef, resumeText);

      return {
        success: true,
        mechanism: target.mechanism,
        fileName: file.name,
      };
    } catch (error) {
      return {
        success: false,
        mechanism: target.mechanism,
        error: error instanceof Error ? error.message : 'Text paste failed',
      };
    }
  }

  async verifyUpload(target) {
    await this.browserTools.wait(1000);

    const pageContent = await this.browserTools.getPageContent();

    const successIndicators = [
      /file\s*uploaded/i,
      /upload\s*(successful|complete)/i,
      /resume\s*uploaded/i,
      /remove\s*(file|resume)/i,
      /delete\s*(file|resume)/i,
      /✓|✔|check/i,
    ];

    return successIndicators.some(p => p.test(pageContent));
  }

  async extractTextFromFile(content, fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (ext === 'txt') {
      return new TextDecoder().decode(content);
    }

    throw new Error(`Text extraction not implemented for .${ext} files`);
  }
}

// ============================================================================
// PART 4: COMPLETE UPLOAD HANDLER
// ============================================================================

export class ResumeUploadHandler {
  constructor(browserTools) {
    this.detector = new UploadDetector();
    this.executor = new UploadExecutor(browserTools);
  }

  /**
   * Detect and execute resume upload
   */
  async uploadResume(accessibilityTree, pageContent, resumeFile) {
    // Step 1: Detect all available upload mechanisms
    const targets = this.detector.detectUploadMechanisms(accessibilityTree, pageContent);

    if (targets.length === 0) {
      return {
        success: false,
        error: 'No resume upload mechanism detected on this page',
      };
    }

    // Step 2: Try upload mechanisms in order of confidence
    for (const target of targets) {
      // Skip mechanisms that always require user action
      if ([
        UploadMechanism.LINKEDIN_IMPORT,
        UploadMechanism.INDEED_IMPORT,
        UploadMechanism.DROPBOX_IMPORT,
        UploadMechanism.GOOGLE_DRIVE_IMPORT,
      ].includes(target.mechanism)) {
        continue;
      }

      const result = await this.executor.executeUpload(target, resumeFile);

      if (result.success) {
        return {
          success: true,
          usedMechanism: target.mechanism,
        };
      }

      if (result.needsUserAction) {
        continue;
      }
    }

    // Step 3: If no automated method worked, report best available option
    const bestTarget = targets[0];

    return {
      success: false,
      error: 'Automated upload failed',
      needsUserAction: true,
      userActionMessage: this.getUserActionMessage(bestTarget),
      alternativeMechanisms: targets,
    };
  }

  getUserActionMessage(target) {
    switch (target.mechanism) {
      case UploadMechanism.FILE_INPUT_VISIBLE:
      case UploadMechanism.FILE_INPUT_HIDDEN:
        return 'Please click the upload button and select your resume file';

      case UploadMechanism.DROP_ZONE:
      case UploadMechanism.DROP_ZONE_WITH_CLICK:
        return 'Please drag your resume file to the upload area or click to browse';

      case UploadMechanism.LINKEDIN_IMPORT:
        return 'Please click "Apply with LinkedIn" to import your profile';

      case UploadMechanism.URL_INPUT:
        return 'Please enter the URL where your resume is hosted';

      case UploadMechanism.TEXT_PASTE:
        return 'Please paste your resume content into the text area';

      default:
        return 'Please manually upload your resume using the available method';
    }
  }
}

export default {
  UploadMechanism,
  UploadDetector,
  UploadExecutor,
  ResumeUploadHandler,
};
