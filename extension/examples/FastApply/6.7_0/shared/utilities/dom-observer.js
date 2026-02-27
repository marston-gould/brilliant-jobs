/**
 * Advanced DOM Observer Utilities for Adaptive Automation
 * Handles slow networks, slow OS, and dynamic content loading
 */

export class AdaptiveDOMObserver {
  constructor() {
    this.observers = new Map();
    this.pendingWaits = new Map();
  }

  /**
   * Wait for element with MutationObserver (no fixed delays!)
   * @param {string|Function} selectorOrFunction - CSS selector or function returning element
   * @param {Object} options - Configuration options
   * @returns {Promise<HTMLElement>}
   */
  async waitForElement(selectorOrFunction, options = {}) {
    const {
      timeout = 30000,
      checkVisibility = true,
      checkInteractivity = true,
      parent = document.body,
      onProgress = null,
      retryOnFail = true,
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let checkCount = 0;

      // Quick initial check
      const initialCheck = this._findElement(selectorOrFunction, checkVisibility, checkInteractivity);
      if (initialCheck) {
        console.log(`✅ Element found immediately (0ms)`);
        resolve(initialCheck);
        return;
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        const elapsed = Date.now() - startTime;
        console.error(`❌ Element not found after ${elapsed}ms (${checkCount} checks)`);

        if (retryOnFail) {
          console.log(`🔄 Retrying with relaxed constraints...`);
          // Retry with relaxed constraints
          this.waitForElement(selectorOrFunction, {
            ...options,
            checkVisibility: false,
            checkInteractivity: false,
            retryOnFail: false,
          }).then(resolve).catch(reject);
        } else {
          reject(new Error(`Element not found after ${timeout}ms`));
        }
      }, timeout);

      // Create MutationObserver
      const observer = new MutationObserver((mutations) => {
        checkCount++;

        // Log progress periodically
        if (onProgress && checkCount % 10 === 0) {
          const elapsed = Date.now() - startTime;
          onProgress({ checkCount, elapsed });
        }

        const element = this._findElement(selectorOrFunction, checkVisibility, checkInteractivity);

        if (element) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ Element found after ${elapsed}ms (${checkCount} checks)`);
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(element);
        }
      });

      // Observe with comprehensive config
      observer.observe(parent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'disabled', 'hidden'],
      });

      // Store observer for cleanup
      const observerId = `wait_${Date.now()}_${Math.random()}`;
      this.observers.set(observerId, observer);

      // Cleanup on resolve/reject
      const cleanup = () => {
        clearTimeout(timeoutId);
        observer.disconnect();
        this.observers.delete(observerId);
      };
    });
  }

  /**
   * Wait for any of multiple elements (race condition)
   * @param {Array} selectors - Array of selectors or functions
   * @param {Object} options - Configuration options
   * @returns {Promise<{element, index, selector}>}
   */
  async waitForAnyElement(selectors, options = {}) {
    const {
      timeout = 30000,
      checkVisibility = true,
      checkInteractivity = true,
      parent = document.body,
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let checkCount = 0;

      // Quick initial check
      for (let i = 0; i < selectors.length; i++) {
        const element = this._findElement(selectors[i], checkVisibility, checkInteractivity);
        if (element) {
          console.log(`✅ Element ${i} found immediately`);
          resolve({ element, index: i, selector: selectors[i] });
          return;
        }
      }

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`No elements found after ${timeout}ms`));
      }, timeout);

      const observer = new MutationObserver((mutations) => {
        checkCount++;

        for (let i = 0; i < selectors.length; i++) {
          const element = this._findElement(selectors[i], checkVisibility, checkInteractivity);

          if (element) {
            const elapsed = Date.now() - startTime;
            console.log(`✅ Element ${i} found after ${elapsed}ms`);
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve({ element, index: i, selector: selectors[i] });
            return;
          }
        }
      });

      observer.observe(parent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'disabled', 'hidden'],
      });
    });
  }

  /**
   * Wait for element to disappear (useful for loading indicators)
   * @param {string} selector - CSS selector
   * @param {Object} options - Configuration options
   * @returns {Promise<void>}
   */
  async waitForElementToDisappear(selector, options = {}) {
    const { timeout = 30000, parent = document.body } = options;

    return new Promise((resolve, reject) => {
      // Check if already gone
      const element = document.querySelector(selector);
      if (!element || !this._isElementVisible(element)) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element still visible after ${timeout}ms`));
      }, timeout);

      const observer = new MutationObserver((mutations) => {
        const element = document.querySelector(selector);
        if (!element || !this._isElementVisible(element)) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(parent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      });
    });
  }

  /**
   * Wait for element to become stable (no changes for specified duration)
   * @param {HTMLElement} element - Element to watch
   * @param {number} stableDuration - Ms of stability required
   * @param {number} timeout - Maximum wait time
   * @returns {Promise<boolean>}
   */
  async waitForElementStable(element, stableDuration = 500, timeout = 10000) {
    return new Promise((resolve) => {
      let lastChangeTime = Date.now();
      const startTime = Date.now();

      const observer = new MutationObserver(() => {
        lastChangeTime = Date.now();
      });

      observer.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const checkStability = setInterval(() => {
        const now = Date.now();
        const timeSinceLastChange = now - lastChangeTime;
        const totalTime = now - startTime;

        if (timeSinceLastChange >= stableDuration) {
          clearInterval(checkStability);
          observer.disconnect();
          resolve(true);
        } else if (totalTime >= timeout) {
          clearInterval(checkStability);
          observer.disconnect();
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Wait for specific text to appear in element
   * @param {string} selector - CSS selector
   * @param {string|RegExp} text - Text to wait for
   * @param {Object} options - Configuration options
   * @returns {Promise<HTMLElement>}
   */
  async waitForText(selector, text, options = {}) {
    const { timeout = 30000, parent = document.body } = options;

    return new Promise((resolve, reject) => {
      const textMatcher = typeof text === 'string'
        ? (t) => t.includes(text)
        : (t) => text.test(t);

      const check = () => {
        const element = document.querySelector(selector);
        if (element && textMatcher(element.textContent)) {
          return element;
        }
        return null;
      };

      const initialCheck = check();
      if (initialCheck) {
        resolve(initialCheck);
        return;
      }

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Text not found after ${timeout}ms`));
      }, timeout);

      const observer = new MutationObserver(() => {
        const element = check();
        if (element) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(parent, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  }

  /**
   * Wait for network idle (no pending requests)
   * @param {number} idleDuration - Ms of idle time required
   * @param {number} timeout - Maximum wait time
   * @returns {Promise<boolean>}
   */
  async waitForNetworkIdle(idleDuration = 500, timeout = 30000) {
    return new Promise((resolve) => {
      let lastActivity = Date.now();
      const startTime = Date.now();
      let pendingRequests = 0;

      // Monitor fetch
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        pendingRequests++;
        lastActivity = Date.now();

        return originalFetch.apply(this, args)
          .finally(() => {
            pendingRequests--;
            lastActivity = Date.now();
          });
      };

      // Monitor XHR
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(...args) {
        this._tracked = true;
        return originalOpen.apply(this, args);
      };

      XMLHttpRequest.prototype.send = function(...args) {
        if (this._tracked) {
          pendingRequests++;
          lastActivity = Date.now();

          this.addEventListener('loadend', () => {
            pendingRequests--;
            lastActivity = Date.now();
          });
        }
        return originalSend.apply(this, args);
      };

      const checkIdle = setInterval(() => {
        const now = Date.now();
        const timeSinceActivity = now - lastActivity;
        const totalTime = now - startTime;

        if (pendingRequests === 0 && timeSinceActivity >= idleDuration) {
          clearInterval(checkIdle);
          // Restore original functions
          window.fetch = originalFetch;
          XMLHttpRequest.prototype.open = originalOpen;
          XMLHttpRequest.prototype.send = originalSend;
          resolve(true);
        } else if (totalTime >= timeout) {
          clearInterval(checkIdle);
          window.fetch = originalFetch;
          XMLHttpRequest.prototype.open = originalOpen;
          XMLHttpRequest.prototype.send = originalSend;
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Internal: Find element with optional visibility/interactivity checks
   */
  _findElement(selectorOrFunction, checkVisibility, checkInteractivity) {
    let element;

    if (typeof selectorOrFunction === 'function') {
      element = selectorOrFunction();
    } else {
      element = document.querySelector(selectorOrFunction);
    }

    if (!element) return null;

    if (checkVisibility && !this._isElementVisible(element)) {
      return null;
    }

    if (checkInteractivity && !this._isElementInteractive(element)) {
      return null;
    }

    return element;
  }

  /**
   * Internal: Check if element is truly visible
   */
  _isElementVisible(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // Check viewport
      const isInViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );

      if (!isInViewport) {
        return false;
      }

      // Check if covered by overlay
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);

      if (elementAtPoint === element || element.contains(elementAtPoint)) {
        return true;
      }

      let parent = elementAtPoint;
      while (parent && parent !== document.body) {
        if (parent === element) {
          return true;
        }
        parent = parent.parentElement;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Internal: Check if element is interactive
   */
  _isElementInteractive(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);

      if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      if (style.pointerEvents === 'none') {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup all observers
   */
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.pendingWaits.clear();
  }
}

// Singleton instance
export const domObserver = new AdaptiveDOMObserver();
