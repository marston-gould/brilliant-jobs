



function getProfileFieldValue(label, profile) {
    if (!label || !profile) return null;
    const lower = label.toLowerCase().trim();

    if (lower.includes('first name') || lower === 'first' || lower === 'given name') {
        return profile.firstName || null;
    }
    if (lower.includes('last name') || lower === 'last' || lower === 'family name' || lower === 'surname') {
        return profile.lastName || null;
    }
    if (lower === 'name' || lower === 'full name' || lower === 'your name') {
        const first = profile.firstName || '';
        const last = profile.lastName || '';
        const full = `${first} ${last}`.trim();
        return full || null;
    }
    if (lower.includes('email')) {
        return profile.email || null;
    }
    if (lower.includes('phone') || lower.includes('mobile') || lower.includes('cell') || lower.includes('telephone')) {
        return profile.phoneNumber || null;
    }
    if (lower.includes('linkedin')) {
        return profile.linkedIn || null;
    }
    if (lower.includes('website') || lower.includes('portfolio')) {
        return profile.website || null;
    }
    if (lower.includes('github')) {
        return profile.github || null;
    }
    if (lower === 'city' || lower === 'location' || lower === 'current city' || lower === 'current location') {
        return profile.currentCity || null;
    }
    if (lower.includes('street address') || lower === 'address') {
        return profile.streetAddress || null;
    }

    return null;
}

// Force element interaction even when window is minimized
function forceElementInteraction(element, actionType = 'click') {
    // Scroll element into view to ensure it's in the viewport
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    
    // Force focus
    element.focus();
    
    // Create comprehensive event sequence
    const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        composed: true
    };
    
    // Simulate complete user interaction
    element.dispatchEvent(new FocusEvent('focusin', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerover', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerenter', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
    element.dispatchEvent(new PointerEvent('pointermove', eventOptions));
    element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
    
    if (actionType === 'click' || actionType === 'mousedown') {
        element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
        element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    }
    
    if (actionType === 'click') {
        element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
        element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        element.dispatchEvent(new MouseEvent('click', eventOptions));
        element.click(); // Native click as fallback
    }
}

// Wait for dropdown options to appear using MutationObserver
// More reliable than fixed delays, especially in background tabs
function waitForDropdownOptions(fieldset, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const checkOptions = () => {
            const options = fieldset.querySelectorAll('div[role="option"]');
            if (options.length > 0) {
                return options;
            }
            return null;
        };
        
        // Check if options already exist
        const existingOptions = checkOptions();
        if (existingOptions) {
            resolve(existingOptions);
            return;
        }
        
        // Set up MutationObserver to watch for options
        const observer = new MutationObserver((mutations) => {
            const options = checkOptions();
            if (options) {
                observer.disconnect();
                clearTimeout(timeoutId);
                resolve(options);
            }
        });
        
        observer.observe(fieldset, {
            childList: true,
            subtree: true
        });
        
        // Fallback timeout
        const timeoutId = setTimeout(() => {
            observer.disconnect();
            const options = checkOptions();
            if (options) {
                resolve(options);
            } else {
                reject(new Error('Dropdown options did not appear within timeout'));
            }
        }, timeout);
    });
}

async function grabFields() {
    await pause();

    appendStatusMessage('Collecting fields and application questions...');

    const results = [];
    for (const label of [ ... document.querySelectorAll('#loading-container label:not(:has(label))') ]) {

        const result = {
            element: null,
            type: '',
            label: label.innerText.trim().replace('\n', ''),
            required: false
        };

        let el = label.parentElement;

        for (_n = 0; _n < 10; _n++) {
            let element =  [ ... el.querySelectorAll('input, div[role="radio"], textarea') ];
            if (!element.length) {
                el = el.parentElement;
                continue;
            }
            result.element = element;
        }

        if (!result.element[0]) {
            result.element = null;
            results.push(result);
        }

        

        if (result.element[0]?.getAttribute('role') === 'radio') {
            result.type = 'select';
            result.options = result.element.map(input => input.innerText.trim());
            result.required = true;
        } else if (result.element[0]?.closest('fieldset') && result.element[0]?.getAttribute('role') === 'combobox') {
            result.type = 'select';
            result.element = result.element[0];
            result.required = result.element.getAttribute('aria-required') === 'true';
            
            const fieldset = result.element.closest('fieldset');
            
            // Use forceElementInteraction for better reliability
            forceElementInteraction(result.element, 'mousedown');
            
            // Wait for options to appear using MutationObserver
            try {
                const options = await waitForDropdownOptions(fieldset, 3000);
                result.options = [...options].map(input => input.innerText.trim());
            } catch (e) {
                console.error('Failed to get dropdown options:', e);
                result.options = [];
            }
            
            result.required = true;
        } else {
            result.element = result.element[0];
            result.type = result.element.type;
            result.required = result.element.getAttribute('aria-required') === 'true' || result.element.required === true;
        }

        

        results.push(result);

    }

    return results;
}

async function fillFields(fields, profile = {}) {

    let fieldNum = 0;
    let field;
    while (fieldNum < fields.length) {
        field = fields[fieldNum];

        try {
            const profileValue = !Array.isArray(field.element) ? getProfileFieldValue(field.label, profile) : null;
            let value, completed;

            if (profileValue !== null) {
                value = profileValue;
                completed = true;
                fieldNum += 1;
                console.log('[Monster] Using profile value for field', {label: field.label, value});
            } else {
                ({value, completed} = await getFieldValueByFieldName(field.label));

                if (completed) {
                    fieldNum += 1;
                } else {
                    if (field.type != 'text' && field.type != 'textarea') {
                        continue;
                    }
                }
            }

            console.log(field, field.label, value)

            if (!value && value !== 0) {
                if (field.required && Array.isArray(field.element) && field.element[0]) {
                    field.element[0].click()
                }
                console.log('skip')
                continue;
            }

            if (Array.isArray(field.element)) {
                if (agentStatus.resumed) {
                    field.element.forEach((el) => {
                        if (el.checked) {
                            throw new Error('filled by user')
                        }
                    });
                }
                if (!Array.isArray(value)) {
                    value = [value]
                }
                field.element.forEach((el) => {
                    if (value.includes(el.innerText.trim())) {
                        el.click();
                    }
                });
            } else if (field.element?.getAttribute('role') === 'combobox') {
                if (Array.isArray(value)) {
                    value = value[0];
                }

                const fieldset = field.element.closest('fieldset');
                
                // Use forceElementInteraction for better reliability in minimized windows
                forceElementInteraction(field.element, 'click');
                
                // Wait for dropdown options using MutationObserver instead of fixed delay
                try {
                    const options = await waitForDropdownOptions(fieldset, 3000);
                    
                    for (const el of options) {
                        if (el.innerText.trim() == value) {
                            forceElementInteraction(el, 'click');
                            break;
                        }
                    }
                } catch (e) {
                    console.error('Failed to select dropdown option:', e);
                    sendErrorToServerFromPage(e);
                }
            } else if (field.type === 'select') {
                if (Array.isArray(value)) {
                    value = value[0];
                }

                [...field.element.options].forEach((el) => {
                    if (el.value === value) {
                        el.selected = true;
                        el.closest('select').dispatchEvent(new Event('change'));
                    }
                });
            } else if (field.type === 'checkbox') {
                if (Array.isArray(value)) {
                    value = value[0];
                }

                let checked = false;
                try {
                    checked = window.getComputedStyle(field.element.parentElement.children[1].firstChild.firstChild).visibility == 'visible'
                } catch (e) {
                    console.error(e);
                }
                if (checked != Boolean(value)) {
                    console.log('clicking checkbox', checked, value);
                    field.element.parentElement.click();
                } else {
                    console.log('skip checkbox', checked, value);
                }
            } else {
                if (Array.isArray(value)) {
                    value = value[0];
                }

                if (agentStatus.resumed && field.element.value) {
                    console.log('filled by user')
                    continue;
                }
                setNativeValue(field.element, value);
                field.element.dispatchEvent(new Event('focusout', {bubbles: true}));
                if (field.element.getAttribute('aria-autocomplete') == 'list') {
                    try {
                        await waitForSuccess('.basic-typeahead__selectable', 7000)
                        field.element.parentElement.querySelector('.basic-typeahead__selectable').click()
                    } catch (e) {
                        console.error(e);
                        sendErrorToServerFromPage(e);
                    }
                }
            }

        } catch (e) {
            console.error(e);
            sendErrorToServerFromPage(e);
        }

        await wait(1000);

    }

}

async function apply(data) {

    //StatusMessage('Applying');

    const profile = data.profile || {};

    if (window.location.pathname.startsWith('/jobs/apply-complete')) {
        //StatusMessage('Applying successfully');
        return;
    }

    countDown = startCountDownInStatusBlock(60 * 5, () => {
        chrome.runtime.sendMessage({
            type: "SEND-CV-TAB-TIMER-ENDED", data: {
                url: window.location.href
            }
        });
    });

    let fields = (await grabFields()).filter(field => !field.element.value);

    console.log(fields);

    if (fields.filter(field => field.required).length) {

        await wait(1000);
        await pause();

        const fieldsForAI = fields.filter(f => getProfileFieldValue(f.label, profile) === null);
        if (fieldsForAI.length > 0) {
            streamVacancyFields(fieldsForAI);
        }

        //StatusMessage('filling fields');

        await fillFields(fields, profile);

    } else {
        //StatusMessage('skip all fields');
    }

    
    await wait(1500);

    

    if (!data.devMode) {
        await readyToSubmit();
        await fullPageScreenshot();
        //StatusMessage('Submit');
        //await waitForClickableButton('div[class^=StepWrapper_outerStepFrame] button[data-testid="onboarding-submit-button"]');
        document.querySelector('div[class^=StepWrapper_outerStepFrame] button[data-testid="onboarding-submit-button"]')?.click();
        await waitForURLUpdateArray(['/jobs/apply-complete', '/apply/questionnaire']);
    }

    if (location.href.includes('/jobs/apply-complete')) {
        //StatusMessage('Done');
        return;
    }

    await wait(5000);

    document.querySelector('button[data-testid="confirm-dialog-submit-button"]')?.click();

    fields = (await grabFields()).filter(field => !field.element.value);

    console.log(fields);

    if (fields.filter(field => field.required).length) {

        //StatusMessage('wait for response');

        await wait(1000);
        await pause();

        const fieldsForAI2 = fields.filter(f => getProfileFieldValue(f.label, profile) === null);
        if (fieldsForAI2.length > 0) {
            streamVacancyFields(fieldsForAI2);
        }

        //StatusMessage('filling fields');

        await fillFields(fields, profile);

    } else {
        //StatusMessage('skip all fields');
    }

    
    await wait(1500);

    

    if (!data.devMode) {
        await readyToSubmit();
        await fullPageScreenshot();
        //StatusMessage('Submit');
        //await waitForClickableButton('div[class^=StepWrapper_outerStepFrame] button[data-testid="onboarding-submit-button"]');
        document.querySelector('div[class^=StepWrapper_outerStepFrame] button[data-testid="onboarding-submit-button"]')?.click();
        await waitForURLUpdateArray(['/jobs/apply-complete']);
        //StatusMessage('Done');
    }

}


window.addEventListener('load', () => {
    chrome.runtime.sendMessage({type: "GET-SEND-CV-TASK"}).then(async (value) => {

        value = await startApplyOne(value);

        const {type, data, message} = value;

        switch (type) {
            case 'ERROR':
                
                
                break;
            case 'SUCCESS':
                try {

                    warmingUp(data.agentGeometry, data.agentMessages, data.agentMode);

                    successOnURL('/jobs/apply-complete');

                    await new Promise((resolve, reject) => {
                        setTimeout(async () => {
                            try {
                                await apply(data);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }, 3000);
                    });

                } catch (e) {
                    if (e instanceof SendCvSkipError) {
                        
                        chrome.runtime.sendMessage({type: "SEND-CV-TASK-SKIP", data: e.message});
                    } else {
                        await fillingErrors(e);
                    }
                }
                break;
        }

    });
});