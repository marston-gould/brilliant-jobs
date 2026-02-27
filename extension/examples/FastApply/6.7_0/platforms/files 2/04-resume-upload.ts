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

export enum UploadMechanism {
  // Standard file inputs
  FILE_INPUT_VISIBLE = 'file_input_visible',
  FILE_INPUT_HIDDEN = 'file_input_hidden',    // Hidden, triggered by button
  
  // Drag and drop
  DROP_ZONE = 'drop_zone',
  DROP_ZONE_WITH_CLICK = 'drop_zone_with_click',
  
  // Third-party
  LINKEDIN_IMPORT = 'linkedin_import',
  INDEED_IMPORT = 'indeed_import',
  DROPBOX_IMPORT = 'dropbox_import',
  GOOGLE_DRIVE_IMPORT = 'google_drive_import',
  
  // Alternative inputs
  URL_INPUT = 'url_input',
  TEXT_PASTE = 'text_paste',
  FORM_FIELDS = 'form_fields',            // Parse and fill individual fields
  
  // Compound
  MULTIPLE_OPTIONS = 'multiple_options',   // Multiple methods available
  
  // Problematic
  UNKNOWN = 'unknown',
  UNSUPPORTED = 'unsupported',
}

export interface UploadTarget {
  mechanism: UploadMechanism;
  
  // For file inputs
  fileInputRef?: string;
  acceptedFormats?: string[];
  maxFileSize?: number;
  
  // For drop zones
  dropZoneRef?: string;
  dropZoneSelector?: string;
  
  // For triggers (buttons that open file dialog)
  triggerRef?: string;
  triggerSelector?: string;
  
  // For URL inputs
  urlInputRef?: string;
  
  // For text paste
  textAreaRef?: string;
  
  // For third-party imports
  importButtonRef?: string;
  importService?: string;
  
  // Metadata
  label?: string;
  isRequired?: boolean;
  currentFileName?: string;
  hasExistingUpload?: boolean;
  
  // Confidence
  confidence: number;
}

export interface UploadResult {
  success: boolean;
  mechanism: UploadMechanism;
  fileName?: string;
  error?: string;
  needsUserAction?: boolean;
  userActionMessage?: string;
}

// ============================================================================
// PART 2: UPLOAD DETECTOR
// ============================================================================

export class UploadDetector {
  
  /**
   * Detect all upload mechanisms on the page
   */
  detectUploadMechanisms(
    accessibilityTree: any,
    pageContent: string
  ): UploadTarget[] {
    const targets: UploadTarget[] = [];
    
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
  
  /**
   * Detect visible file inputs
   */
  private detectVisibleFileInputs(tree: any): UploadTarget[] {
    const targets: UploadTarget[] = [];
    
    const fileInputs = this.findNodesByAttributes(tree, {
      role: 'button', // File inputs often report as buttons in a11y tree
      // or look for specific patterns
    });
    
    // Also search for input[type=file] patterns
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
  
  /**
   * Detect hidden file inputs triggered by buttons
   */
  private detectHiddenFileInputs(tree: any, pageContent: string): UploadTarget[] {
    const targets: UploadTarget[] = [];
    const allNodes = this.flattenTree(tree);
    
    // Find hidden file inputs
    const hiddenFileInputs = allNodes.filter(node => 
      this.isFileInput(node) && !this.isVisible(node)
    );
    
    for (const hiddenInput of hiddenFileInputs) {
      // Find the trigger button
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
  
  /**
   * Detect drag and drop upload zones
   */
  private detectDropZones(tree: any, pageContent: string): UploadTarget[] {
    const targets: UploadTarget[] = [];
    
    // Pattern 1: Elements with drag/drop event handlers or classes
    const dropZonePatterns = [
      /drop[-_]?zone/i,
      /drag[-_]?drop/i,
      /file[-_]?drop/i,
      /upload[-_]?area/i,
      /droparea/i,
    ];
    
    // Pattern 2: Visual cues in the content
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
      
      // Check class/id patterns
      let isDropZone = dropZonePatterns.some(p => p.test(classes) || p.test(id));
      
      // Check visual cues
      isDropZone = isDropZone || visualCues.some(p => p.test(text));
      
      // Check for ondrop/ondragover attributes in raw HTML
      const nodeHtml = this.getNodeHtml(node, pageContent);
      isDropZone = isDropZone || /ondrop|ondragover|ondragenter/i.test(nodeHtml || '');
      
      if (isDropZone && this.isVisible(node)) {
        // Check if it also has click functionality
        const hasClick = /onclick|click/i.test(nodeHtml || '') || 
                        node.role === 'button' ||
                        classes.includes('clickable');
        
        targets.push({
          mechanism: hasClick ? UploadMechanism.DROP_ZONE_WITH_CLICK : UploadMechanism.DROP_ZONE,
          dropZoneRef: node.ref,
          dropZoneSelector: this.buildSelector(node),
          label: this.extractDropZoneLabel(node, tree),
          isRequired: false, // Usually not marked required
          confidence: 0.75,
        });
      }
    }
    
    return targets;
  }
  
  /**
   * Detect third-party import buttons (LinkedIn, Indeed, etc.)
   */
  private detectThirdPartyImports(tree: any, pageContent: string): UploadTarget[] {
    const targets: UploadTarget[] = [];
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
  
  /**
   * Detect URL input for resume
   */
  private detectUrlInputs(tree: any): UploadTarget[] {
    const targets: UploadTarget[] = [];
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
  
  /**
   * Detect text paste areas for resume content
   */
  private detectTextPasteAreas(tree: any, pageContent: string): UploadTarget[] {
    const targets: UploadTarget[] = [];
    const allNodes = this.flattenTree(tree);
    
    const pastePatterns = [
      /paste[-_]?resume/i,
      /paste[-_]?cv/i,
      /copy[-_]?paste/i,
      /resume[-_]?text/i,
      /cv[-_]?text/i,
    ];
    
    for (const node of allNodes) {
      // Look for large textareas
      if (node.role !== 'textbox') continue;
      
      const isMultiline = node.attributes?.multiline === 'true' || 
                         node.attributes?.rows && parseInt(node.attributes.rows) > 3;
      
      if (!isMultiline) continue;
      
      const name = node.attributes?.name || '';
      const id = node.attributes?.id || '';
      const placeholder = node.attributes?.placeholder || '';
      const label = this.getLabel(node, tree) || '';
      
      const combinedText = `${name} ${id} ${placeholder} ${label}`.toLowerCase();
      
      // Check if this is for resume content
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
  
  private flattenTree(node: any, result: any[] = []): any[] {
    result.push(node);
    for (const child of node.children || []) {
      this.flattenTree(child, result);
    }
    return result;
  }
  
  private findNodesByAttributes(tree: any, attrs: Record<string, string>): any[] {
    const results: any[] = [];
    const nodes = this.flattenTree(tree);
    
    for (const node of nodes) {
      let matches = true;
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'role') {
          if (node.role !== value) matches = false;
        } else if (node.attributes?.[key] !== value) {
          matches = false;
        }
      }
      if (matches) results.push(node);
    }
    
    return results;
  }
  
  private isFileInput(node: any): boolean {
    return node.attributes?.type === 'file' ||
           (node.role === 'button' && node.attributes?.['aria-label']?.toLowerCase().includes('upload'));
  }
  
  private isVisible(node: any): boolean {
    // Check common hidden patterns
    const style = node.attributes?.style || '';
    const classes = node.attributes?.class || '';
    
    if (/display:\s*none/i.test(style)) return false;
    if (/visibility:\s*hidden/i.test(style)) return false;
    if (node.attributes?.hidden === 'true') return false;
    if (/\bhidden\b/i.test(classes)) return false;
    
    return true;
  }
  
  private isResumeField(label: string | undefined, node: any): boolean {
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
  
  private getLabel(node: any, tree: any): string | undefined {
    // Check aria-label
    if (node.attributes?.['aria-label']) {
      return node.attributes['aria-label'];
    }
    
    // Check aria-labelledby
    if (node.attributes?.['aria-labelledby']) {
      const labelNode = this.findNodeByRef(tree, node.attributes['aria-labelledby']);
      if (labelNode?.name) return labelNode.name;
    }
    
    // Check for associated label
    if (node.attributes?.id) {
      // Would need to find label[for=id]
      const labels = this.flattenTree(tree).filter(n => 
        n.role === 'label' && n.attributes?.for === node.attributes?.id
      );
      if (labels.length > 0 && labels[0].name) {
        return labels[0].name;
      }
    }
    
    // Use node name
    return node.name;
  }
  
  private findNodeByRef(tree: any, ref: string): any | null {
    const nodes = this.flattenTree(tree);
    return nodes.find(n => n.ref === ref) || null;
  }
  
  private parseAcceptAttribute(accept: string | undefined): string[] | undefined {
    if (!accept) return undefined;
    return accept.split(',').map(s => s.trim());
  }
  
  private parseMaxSize(node: any): number | undefined {
    // Would look for data-max-size or similar attributes
    const maxSize = node.attributes?.['data-max-size'] || 
                   node.attributes?.['data-max-file-size'];
    if (maxSize) {
      return parseInt(maxSize, 10);
    }
    return undefined;
  }
  
  private hasExistingFile(node: any, tree: any): boolean {
    // Check if there's already a file name displayed nearby
    // This would look for sibling elements showing a filename
    return false; // Simplified
  }
  
  private findTriggerButton(hiddenInput: any, tree: any, pageContent: string): any | null {
    // Strategy 1: Button that references the input ID
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
    
    // Strategy 2: Find button with upload-related text near the input
    const inputParent = this.findParent(hiddenInput, tree);
    if (inputParent) {
      const siblings = inputParent.children || [];
      for (const sibling of siblings) {
        if (sibling.role === 'button' && this.isUploadButton(sibling)) {
          return sibling;
        }
      }
    }
    
    // Strategy 3: Look in raw HTML for label[for] or onclick patterns
    // (would use pageContent)
    
    return null;
  }
  
  private findParent(node: any, tree: any): any | null {
    // Simplified - would need parent tracking
    return null;
  }
  
  private isUploadButton(node: any): boolean {
    const text = (node.name || '').toLowerCase();
    const classes = (node.attributes?.class || '').toLowerCase();
    
    return /upload|browse|choose|select/i.test(text) ||
           /upload|browse|file/i.test(classes);
  }
  
  private getNodeHtml(node: any, pageContent: string): string | null {
    // Would extract the HTML for this node from pageContent
    return null;
  }
  
  private buildSelector(node: any): string {
    const id = node.attributes?.id;
    if (id) return `#${id}`;
    
    const classes = node.attributes?.class;
    if (classes) {
      return '.' + classes.split(' ').filter(Boolean).join('.');
    }
    
    return node.role || '*';
  }
  
  private extractDropZoneLabel(node: any, tree: any): string | undefined {
    return node.name || this.getLabel(node, tree);
  }
  
  private deduplicateAndSort(targets: UploadTarget[]): UploadTarget[] {
    // Remove duplicates (same element, different detection method)
    const seen = new Set<string>();
    const unique = targets.filter(t => {
      const key = t.fileInputRef || t.dropZoneRef || t.importButtonRef || t.urlInputRef || t.textAreaRef;
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });
    
    // Sort by confidence descending
    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}

// ============================================================================
// PART 3: UPLOAD EXECUTOR
// ============================================================================

export class UploadExecutor {
  private browserTools: BrowserTools;
  
  constructor(browserTools: BrowserTools) {
    this.browserTools = browserTools;
  }
  
  /**
   * Execute upload based on detected mechanism
   */
  async executeUpload(
    target: UploadTarget,
    file: {
      path: string;
      name: string;
      mimeType: string;
      content?: ArrayBuffer;  // For in-memory files
    }
  ): Promise<UploadResult> {
    
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
  
  /**
   * Upload via visible file input
   */
  private async uploadViaFileInput(
    target: UploadTarget,
    file: { path: string; name: string; mimeType: string }
  ): Promise<UploadResult> {
    try {
      // Validate file format
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
      
      // Use upload_image tool or direct file input
      await this.browserTools.uploadFile(target.fileInputRef!, file.path);
      
      // Wait for upload processing
      await this.browserTools.wait(1000);
      
      // Verify upload success
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
  
  /**
   * Upload via hidden file input (click trigger first)
   */
  private async uploadViaHiddenInput(
    target: UploadTarget,
    file: { path: string; name: string; mimeType: string }
  ): Promise<UploadResult> {
    try {
      // For hidden inputs, we can often set the file directly
      // without clicking the trigger button
      
      // Method 1: Try direct upload to hidden input
      const directResult = await this.uploadViaFileInput(
        { ...target, mechanism: UploadMechanism.FILE_INPUT_VISIBLE },
        file
      );
      
      if (directResult.success) {
        return { ...directResult, mechanism: target.mechanism };
      }
      
      // Method 2: Click trigger, then handle file dialog
      // Note: This often requires user interaction
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
  
  /**
   * Upload via drag and drop
   */
  private async uploadViaDropZone(
    target: UploadTarget,
    file: { path: string; name: string; mimeType: string }
  ): Promise<UploadResult> {
    try {
      // Get drop zone coordinates
      const dropZoneCoords = await this.browserTools.getElementCoordinates(target.dropZoneRef!);
      
      if (!dropZoneCoords) {
        // Try clicking if it's a click-enabled drop zone
        if (target.mechanism === UploadMechanism.DROP_ZONE_WITH_CLICK) {
          return this.uploadViaClickableDropZone(target, file);
        }
        
        return {
          success: false,
          mechanism: target.mechanism,
          error: 'Could not locate drop zone',
        };
      }
      
      // Simulate drag and drop
      // This typically requires:
      // 1. Create a DataTransfer object with the file
      // 2. Dispatch dragenter, dragover, drop events
      
      // Using the upload_image tool with coordinates
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
  
  /**
   * Upload via clickable drop zone
   */
  private async uploadViaClickableDropZone(
    target: UploadTarget,
    file: { path: string; name: string; mimeType: string }
  ): Promise<UploadResult> {
    try {
      // Click the drop zone to trigger file dialog
      await this.browserTools.click(target.dropZoneRef!);
      await this.browserTools.wait(500);
      
      // Look for newly activated file input
      // (The click often reveals or activates a hidden file input)
      
      // This usually requires user interaction for file dialog
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
  
  /**
   * Handle third-party imports (LinkedIn, Indeed, etc.)
   */
  private async handleThirdPartyImport(target: UploadTarget): Promise<UploadResult> {
    // Third-party imports require OAuth flow
    // We can click the button but user must complete the flow
    
    return {
      success: false,
      mechanism: target.mechanism,
      needsUserAction: true,
      userActionMessage: `Please complete the ${target.importService} import process`,
    };
  }
  
  /**
   * Upload via URL input
   */
  private async uploadViaUrl(
    target: UploadTarget,
    file: { path: string; name: string }
  ): Promise<UploadResult> {
    // For URL input, we need a publicly accessible URL
    // This could be:
    // - A pre-uploaded file URL
    // - LinkedIn profile URL
    // - Portfolio URL
    
    // If the file has a public URL, use it
    // Otherwise, we can't use this method
    
    return {
      success: false,
      mechanism: target.mechanism,
      needsUserAction: true,
      userActionMessage: 'Please enter a URL where your resume is hosted',
    };
  }
  
  /**
   * Upload via text paste (resume as text)
   */
  private async uploadViaTextPaste(
    target: UploadTarget,
    file: { path: string; name: string; content?: ArrayBuffer }
  ): Promise<UploadResult> {
    try {
      // Need to extract text from the resume
      let resumeText: string;
      
      if (file.content) {
        // Parse the file content
        resumeText = await this.extractTextFromFile(file.content, file.name);
      } else {
        // Read the file
        resumeText = await this.browserTools.readFileAsText(file.path);
      }
      
      if (!resumeText) {
        return {
          success: false,
          mechanism: target.mechanism,
          error: 'Could not extract text from resume',
        };
      }
      
      // Paste into text area
      await this.browserTools.setFormValue(target.textAreaRef!, resumeText);
      
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
  
  /**
   * Verify that upload was successful
   */
  private async verifyUpload(target: UploadTarget): Promise<boolean> {
    // Look for:
    // 1. File name appearing near the upload element
    // 2. "Upload successful" message
    // 3. Remove/delete button appearing
    // 4. Progress bar completing
    
    await this.browserTools.wait(1000);
    
    // Check for common success indicators
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
  
  /**
   * Extract text from file content
   */
  private async extractTextFromFile(content: ArrayBuffer, fileName: string): Promise<string> {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Would use appropriate parser based on file type
    // For PDF: pdf-parse
    // For DOCX: mammoth
    // For TXT: direct
    
    if (ext === 'txt') {
      return new TextDecoder().decode(content);
    }
    
    // For PDF/DOCX, would need to use appropriate libraries
    throw new Error(`Text extraction not implemented for .${ext} files`);
  }
}

// ============================================================================
// PART 4: BROWSER TOOLS INTERFACE
// ============================================================================

/**
 * Interface for browser automation tools
 * This would be implemented by your Chrome extension
 */
interface BrowserTools {
  uploadFile(elementRef: string, filePath: string): Promise<void>;
  uploadImageToCoordinates(filePath: string, coordinates: [number, number]): Promise<void>;
  click(elementRef: string): Promise<void>;
  setFormValue(elementRef: string, value: string): Promise<void>;
  wait(ms: number): Promise<void>;
  getElementCoordinates(elementRef: string): Promise<{ x: number; y: number } | null>;
  getPageContent(): Promise<string>;
  readFileAsText(filePath: string): Promise<string>;
}

// ============================================================================
// PART 5: COMPLETE UPLOAD HANDLER
// ============================================================================

/**
 * High-level upload handler that combines detection and execution
 */
export class ResumeUploadHandler {
  private detector: UploadDetector;
  private executor: UploadExecutor;
  
  constructor(browserTools: BrowserTools) {
    this.detector = new UploadDetector();
    this.executor = new UploadExecutor(browserTools);
  }
  
  /**
   * Detect and execute resume upload
   */
  async uploadResume(
    accessibilityTree: any,
    pageContent: string,
    resumeFile: {
      path: string;
      name: string;
      mimeType: string;
      content?: ArrayBuffer;
    }
  ): Promise<{
    success: boolean;
    usedMechanism?: UploadMechanism;
    error?: string;
    needsUserAction?: boolean;
    userActionMessage?: string;
    alternativeMechanisms?: UploadTarget[];
  }> {
    
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
        continue; // Try automated methods first
      }
      
      const result = await this.executor.executeUpload(target, resumeFile);
      
      if (result.success) {
        return {
          success: true,
          usedMechanism: target.mechanism,
        };
      }
      
      // If this method needs user action, note it but try others first
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
  
  private getUserActionMessage(target: UploadTarget): string {
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

// ============================================================================
// PART 6: USAGE EXAMPLE
// ============================================================================

/*
Usage in your Chrome extension:

const browserTools: BrowserTools = {
  uploadFile: async (ref, path) => { 
    // Use upload_image tool with ref 
  },
  uploadImageToCoordinates: async (path, coords) => {
    // Use upload_image tool with coordinates
  },
  click: async (ref) => {
    // Use computer tool left_click
  },
  // ... other implementations
};

const uploadHandler = new ResumeUploadHandler(browserTools);

// Get page content and accessibility tree
const tree = await readPage({ tabId, filter: 'all' });
const pageContent = await getPageText({ tabId });

// Upload resume
const result = await uploadHandler.uploadResume(
  tree,
  pageContent,
  {
    path: '/path/to/resume.pdf',
    name: 'John_Doe_Resume.pdf',
    mimeType: 'application/pdf'
  }
);

if (result.success) {
  console.log('Resume uploaded via', result.usedMechanism);
} else if (result.needsUserAction) {
  console.log('User action needed:', result.userActionMessage);
} else {
  console.error('Upload failed:', result.error);
}
*/

export default ResumeUploadHandler;
