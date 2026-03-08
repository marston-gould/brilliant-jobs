// utils/reactProps.ts — React Props Hacking Utility
// v3.0.0: Access React internal state on DOM elements to fill
// React-controlled inputs that ignore standard DOM mutations.
//
// Greenhouse React boards (job-boards.greenhouse.io) use React-controlled
// inputs where input.value = 'foo' + dispatchEvent is silently ignored.
// We must access __reactProps and call onChange directly.

/**
 * Get the React props object from a DOM element.
 * Checks multiple React internal keys for compatibility across versions.
 *
 * @param {HTMLElement} el - DOM element to get props from
 * @returns {Object|null} React props or null
 */
export function getReactProps(el) {
  if (!el) return null;

  // React 18+ / recent
  const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
  if (propsKey) return el[propsKey];

  // React 17 / fiber
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  if (fiberKey) {
    const fiber = el[fiberKey];
    return fiber?.memoizedProps || null;
  }

  // React 16 / internal instance
  const internalKey = Object.keys(el).find(k => k.startsWith('__reactInternalInstance$'));
  if (internalKey) {
    const instance = el[internalKey];
    return instance?.memoizedProps || instance?.pendingProps || null;
  }

  return null;
}

/**
 * Set a value on a React-controlled input via its onChange handler.
 * Falls back to standard DOM manipulation if React props not found.
 *
 * @param {HTMLElement} el - Input element
 * @param {string} value - Value to set
 * @returns {boolean} Whether the value was set successfully
 */
export function setReactValue(el, value) {
  const props = getReactProps(el);

  if (props?.onChange) {
    // Create a synthetic event matching React's expected shape
    const syntheticEvent = {
      target: { value, name: el.name, type: el.type },
      currentTarget: { value, name: el.name, type: el.type },
      preventDefault: () => {},
      stopPropagation: () => {},
      nativeEvent: new Event('change', { bubbles: true }),
      type: 'change'
    };

    // Set the native value first (some React components read from DOM)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    }

    // Call React's onChange
    props.onChange(syntheticEvent);
    return true;
  }

  // Fallback: standard DOM approach
  return setDOMValue(el, value);
}

/**
 * Standard DOM value setting with proper event dispatch.
 * Works for non-React forms (Lever, Ashby, Workable, etc.)
 *
 * @param {HTMLElement} el - Input element
 * @param {string} value - Value to set
 * @returns {boolean} Whether the value was set
 */
export function setDOMValue(el, value) {
  // Use native setter to bypass any framework interception
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Dispatch events in the order React and other frameworks expect
  el.dispatchEvent(new Event('focus', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));

  return el.value === value;
}

/**
 * Click a React-controlled element (e.g., dropdown option).
 * Some React components only respond to React synthetic events.
 *
 * @param {HTMLElement} el - Element to click
 */
export function reactClick(el) {
  const props = getReactProps(el);

  if (props?.onClick) {
    const syntheticEvent = {
      target: el,
      currentTarget: el,
      preventDefault: () => {},
      stopPropagation: () => {},
      nativeEvent: new MouseEvent('click', { bubbles: true }),
      type: 'click'
    };
    props.onClick(syntheticEvent);
  }

  // Always also fire DOM events
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * Detect if the current page is a React application.
 *
 * @returns {boolean}
 */
export function isReactApp() {
  return !!(
    document.querySelector('[data-reactroot]') ||
    document.querySelector('#__next') ||
    document.querySelector('[id^="__react"]') ||
    Object.keys(document.body).some(k =>
      k.startsWith('__reactFiber$') ||
      k.startsWith('__reactProps$') ||
      k.startsWith('__reactInternalInstance$')
    )
  );
}
