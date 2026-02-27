// Enhanced Form Detector for SimplyHired
export class EnhancedFormDetector {
  constructor() {
    this.detectionStrategies = [];
    this.setupDetectionStrategies();
  }

  /**
   * Setup multiple detection strategies with priority order
   */
  setupDetectionStrategies() {
    this.detectionStrategies = [
      // Strategy 1: Standard Indeed selectors
      {
        name: 'indeed_standard',
        selector: '.ia-Questions, [class*="apply-questions"]',
        questionSelectors: [
          '.ia-Questions-item',
          '[class*="Questions-item"]'
        ],
        confidence: 0.9
      },

      // Strategy 2: Diversity/Demographics specific
      {
        name: 'diversity_forms',
        selector: '[class*="diversity"], [class*="demographic"], [class*="equal"], [class*="voluntary"], .ia-BasePage-component',
        questionSelectors: [
          'fieldset[aria-labelledby]',
          '[role="group"]',
          '.ia-Questions-item',
          '.question-group',
          '[class*="question"]'
        ],
        confidence: 0.8
      },

      // Strategy 2b: Disability-specific forms
      {
        name: 'disability_forms',
        selector: 'main, .ia-BasePage-component',
        questionSelectors: [
          '.ia-Questions-item',
          'fieldset[aria-labelledby]',
          'input[type="text"]',
          'input[type="checkbox"]'
        ],
        confidence: 0.9,
        customValidator: (element) => {
          const text = element.textContent.toLowerCase();
          return text.includes('disability') || text.includes('voluntary self');
        }
      },

      // Strategy 3: Generic form patterns
      {
        name: 'generic_forms',
        selector: 'form, [role="form"], [class*="form"]',
        questionSelectors: [
          'fieldset',
          '.field-group',
          '[class*="field"]',
          '.question',
          '[class*="question"]'
        ],
        confidence: 0.7
      },

      // Strategy 4: Radio/Checkbox/Select containers
      {
        name: 'input_containers',
        selector: 'div:has(input[type="radio"]), div:has(input[type="checkbox"]), div:has(select)',
        questionSelectors: [
          'div:has(input[type="radio"])',
          'div:has(input[type="checkbox"])',
          'div:has(select)',
          '.ia-Questions-item',
          'label',
          'fieldset'
        ],
        confidence: 0.6
      },

      // Strategy 5: Dynamic content containers
      {
        name: 'dynamic_containers',
        selector: '[data-testid*="form"], [data-testid*="question"], [id*="form"], [id*="question"]',
        questionSelectors: [
          '[data-testid*="question"]',
          '[id*="question"]',
          'div[class]'
        ],
        confidence: 0.5
      }
    ];
  }

  /**
   * Enhanced form detection with multiple strategies
   */
  async detectForm(maxWaitTime = 20000) {
    const startTime = Date.now();
    let bestMatch = null;

    console.log("🔍 Starting enhanced form detection...");

    while (Date.now() - startTime < maxWaitTime) {
      for (const strategy of this.detectionStrategies) {
        const match = await this.tryDetectionStrategy(strategy);
        
        if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
          bestMatch = match;
          console.log(`✅ Found form using strategy: ${strategy.name} (confidence: ${match.confidence})`);
          
          // If we have high confidence, proceed
          if (match.confidence >= 0.8) {
            break;
          }
        }
      }

      if (bestMatch && bestMatch.confidence >= 0.7) {
        // Wait for questions to load
        const fullyLoaded = await this.waitForQuestionsToLoad(bestMatch.form, 5000);
        if (fullyLoaded) {
          return bestMatch;
        }
      }

      // Wait before next attempt
      await this.delay(1000);
    }

    return bestMatch;
  }

  /**
   * Try a specific detection strategy
   */
  async tryDetectionStrategy(strategy) {
    try {
      const forms = document.querySelectorAll(strategy.selector);
      
      for (const form of forms) {
        if (!this.isElementVisible(form)) continue;

        // Check custom validator if present
        if (strategy.customValidator && !strategy.customValidator(form)) {
          continue;
        }

        const questions = this.findQuestionsInForm(form, strategy.questionSelectors);
        
        if (questions.length > 0) {
          const confidence = this.calculateConfidence(form, questions, strategy);
          
          console.log(`🔍 Strategy ${strategy.name} found ${questions.length} questions with confidence ${confidence.toFixed(2)}`);
          this.logQuestionDetails(questions);
          
          if (confidence >= strategy.confidence * 0.8) { // 80% of expected confidence
            return {
              form: form,
              questions: questions,
              strategy: strategy.name,
              confidence: confidence,
              questionCount: questions.length
            };
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Strategy ${strategy.name} failed:`, error);
    }

    return null;
  }

  /**
   * Find questions within a form using multiple selectors
   */
  findQuestionsInForm(form, questionSelectors) {
    const questions = new Set();

    for (const selector of questionSelectors) {
      try {
        const elements = form.querySelectorAll(selector);
        elements.forEach(el => {
          if (this.isLikelyQuestion(el)) {
            questions.add(el);
          }
        });
      } catch (error) {
        // Continue with other selectors
      }
    }

    return Array.from(questions);
  }

  /**
   * Check if element is likely a question
   */
  isLikelyQuestion(element) {
    const hasInputs = element.querySelectorAll('input, select, textarea').length > 0;
    if (!hasInputs) return false;

    const text = element.textContent.trim();
    const hasText = text.length > 2;
    if (!hasText) return false;

    const lowerText = text.toLowerCase();
    const questionIndicators = [
      'select', 'choose', 'indicate', 'specify', 'please', 'are you', 'do you',
      'have you', 'what is', 'which', 'gender', 'race', 'ethnicity', 'veteran',
      'disability', 'orientation', 'identity', 'background', 'status', 'type',
      'classification', 'category', 'option', 'voluntary', 'demographic',
      'equal opportunity', 'self-identify', 'prefer not', 'decline to'
    ];

    const hasQuestionIndicators = questionIndicators.some(indicator => 
      lowerText.includes(indicator)
    );

    const hasSelect = element.querySelector('select') !== null;
    if (hasSelect) {
      return hasQuestionIndicators || text.length > 5;
    }
    const hasRadioOrCheckbox = element.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
    if (hasRadioOrCheckbox) {
      const hasLabel = element.querySelector('label') !== null;
      const hasFieldset = element.querySelector('fieldset') !== null;
      const hasAriaLabelledBy = element.querySelector('[aria-labelledby]') !== null;
      
      if (hasLabel || hasFieldset || hasAriaLabelledBy) {
        return hasQuestionIndicators || text.length > 10;
      }
    }

    return hasQuestionIndicators;
  }

  /**
   * Calculate confidence score for detected form
   */
  calculateConfidence(form, questions, strategy) {
    let confidence = strategy.confidence;
    if (questions.length >= 3) confidence += 0.1;
    if (questions.length >= 5) confidence += 0.1;
    const formText = form.textContent.toLowerCase();
    const demographicKeywords = [
      'race', 'ethnicity', 'gender', 'veteran', 'disability', 'diversity',
      'equal opportunity', 'voluntary', 'demographic', 'background'
    ];
    
    const keywordMatches = demographicKeywords.filter(keyword => 
      formText.includes(keyword)
    ).length;
    
    confidence += keywordMatches * 0.05;
    if (form.querySelectorAll('fieldset').length > 0) confidence += 0.05;
    if (form.querySelectorAll('[data-testid]').length > 0) confidence += 0.05;
    if (form.querySelectorAll('legend').length > 0) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Wait for questions to be fully loaded in the form
   */
  async waitForQuestionsToLoad(form, maxWaitTime = 10000) {
    const startTime = Date.now();
    let lastQuestionCount = 0;
    let stableCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      const currentQuestionCount = this.countLoadedQuestions(form);
      
      if (currentQuestionCount === lastQuestionCount) {
        stableCount++;
        if (stableCount >= 3 && currentQuestionCount > 0) {
          return true;
        }
      } else {
        stableCount = 0;
        lastQuestionCount = currentQuestionCount;
      }

      await this.delay(500);
    }

    return lastQuestionCount > 0;
  }

  /**
   * Count fully loaded questions in form
   */
  countLoadedQuestions(form) {
    let count = 0;

    // Count radio button groups
    const radioGroups = new Set();
    form.querySelectorAll('input[type="radio"]').forEach(radio => {
      if (radio.name && this.isElementVisible(radio)) {
        radioGroups.add(radio.name);
      }
    });
    count += radioGroups.size;

    // Count checkbox groups
    const checkboxGroups = form.querySelectorAll('fieldset:has(input[type="checkbox"])');
    count += checkboxGroups.length;

    // Count select fields
    const selects = form.querySelectorAll('select');
    count += Array.from(selects).filter(select => this.isElementVisible(select)).length;

    // Count text fields
    const textFields = form.querySelectorAll('input[type="text"], textarea');
    count += Array.from(textFields).filter(field => this.isElementVisible(field)).length;

    return count;
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
  }

  /**
   * Log details about detected questions for debugging
   */
  logQuestionDetails(questions) {
    questions.forEach((question, index) => {
      const inputs = question.querySelectorAll('input, select, textarea');
      const inputTypes = Array.from(inputs).map(input => input.type || input.tagName.toLowerCase()).join(', ');
      const questionText = question.textContent.trim().substring(0, 50) + '...';
      
      console.log(`   Question ${index + 1}: ${inputTypes} - "${questionText}"`);
    });
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get debug information about detection attempts
   */
  getDebugInfo() {
    return {
      strategies: this.detectionStrategies.map(s => ({
        name: s.name,
        confidence: s.confidence,
        selector: s.selector
      })),
      lastDetectionTime: Date.now()
    };
  }
}