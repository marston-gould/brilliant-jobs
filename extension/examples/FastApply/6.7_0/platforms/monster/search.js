

let processedLinksCount = -1;

let firstFound = false;

const SEARCH_DATA = {
    city: null,
    tabId: null,
    limit: null,
    domain: null,
    current: null,
    country: null,
    submittedLinks: []
};

const LINKS_SELECTOR = '[class^=job-search-results-style] article';

const BUTTON_SELECTOR = 'button[data-testid="quick-apply-button"]';

function findAllLinksElements() {
    return [...document.querySelectorAll(LINKS_SELECTOR)];
}

const scrollToElement = (container, element) => {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top;
  
    container.scrollTop += offset;

    const scrollEvent = new Event('scroll', {
        bubbles: true,
        cancelable: true,
    });
    
    container.dispatchEvent(scrollEvent);
};

async function searchNext(data) {

    await waitForSuccess('[class^=search-results-tab-] [data-test-id="message-empty"], [class^=job-search-results-style] article')

    if (data) {
        appendStatusMessage(`Checking if you're signed in to Monster in this browser...`);
        await wait(1500);

        loginAsked = false;

        for (nt = 0; 1; nt ++ ) {
            if (!document.querySelector('header').innerHTML.includes('mode=Login"')) {
                break;
            }
            if (!loginAsked) {
                appendStatusMessage(`You're not signed in to Monster. I need your help – please log in so I can continue.`);
                loginAsked = true;
            }
            if (data?.nonstop && nt > 5) {
                throw new NotAuthorizedError();
            }
            await wait(1000);
        }

        appendStatusMessage('Login confirmed! Opening the Monster job search filter.');
        await wait(1500);

        const session = data.session;

        if (session.platform == 'MONSTER_SEARCH') {
            await customApplyWait();

            if (!agentStatus.searchDisplayed) {
                try {
                    const searchParams = new URLSearchParams(location.search)
                    appendStatusMessage(`Saving your job search preferences:

                    Role: ${searchParams.get('q')}
                    Search accuracy: ${session.searchAccuracy}
                    Date posted: ${searchParams.get('recency')}
                    Employment type: ${searchParams.get('et')}
                    Location: ${searchParams.get('where')}`);
                } catch {}
                agentStatus.searchDisplayed = true;
                await wait(6000);
            }
            
        } else {
            chrome.runtime.sendMessage({
                type: "ENABLE-WRONG-RETURN",
            });
        }

        if (!agentStatus.searchDisplayed) {
            appendStatusMessage(`Looking for jobs based on your search preferences:

                Role: ${session.role}
                Search accuracy: ${session.searchAccuracy}
                Date posted: ${session.datePosted}
                Employment type: ${formatWorkplace(session.workplace)}
                Country: ${session.country || 'Any'}
                City: ${session.city || 'Any'}`);
            
            agentStatus.searchDisplayed = true;
            await wait(7000);
        }
    }

    if (document.querySelector('[class^=search-results-tab-] [data-test-id="message-empty"]')) {
        return searchTaskDone();
    }

    //StatusMessage('Search link');

    let links = findAllLinksElements();

    p_company = ''
    p_role = ''
    p_description = ''

    for (let i = processedLinksCount + 1; i < 100000; i++) {
        processedLinksCount = i;

        // handle infinite scroll
        if (!links[i]) {
            await wait(500);
            links = findAllLinksElements();
            if (!links[i]) {
                if (document.querySelector('button[data-testid="svx-no-more-results-disabled-button"]')) {
                    //StatusMessage('No more results');
                    searchTaskDone();
                    return;
                } else {
                    try {
                        const scrollEvent = new Event('scroll', {
                            bubbles: true,
                            cancelable: true,
                        });
                        document.getElementById('card-scroll-container').dispatchEvent(scrollEvent);
                    } catch (e) {
                        console.log('scroll error', e);
                    }
                    continue;
                }
            }
        }
        

        if (chrome.runtime) {
            chrome.runtime.sendMessage({type: "GET-SEARCH-TASK"}) // do not remove!
        }


        try {
            scrollToElement(document.getElementById('card-scroll-container'), links[i])
        } catch (e) {
            console.error('scrollToElement error', e);
            links[i].scrollIntoView();
        }

        const linkButtonEl = links[i].querySelector(BUTTON_SELECTOR);

        if (!linkButtonEl || linkButtonEl.innerText !== 'Quick Apply') {
            continue;
        }

        console.log('LINK BUTTON', linkButtonEl);

        await wait(2000);
        links[i]?.querySelector('button[data-testid="JobCardButton"]')?.click();

        for (let nt = 0; nt <= 2; nt ++) {
            await wait(3000);

            company = document.querySelector('[data-testid=svx-job-view-wrapper] [data-testid=company]')?.innerText?.trim();
            role = document.querySelector('[data-testid=svx-job-view-wrapper] [data-testid=jobTitle]')?.innerText?.trim();
            description = document.querySelector('[data-testid=svx-job-view-wrapper] [data-testid=svx-description-container-inner]')?.innerText?.trim();

            if (company != p_company || role != p_role || description != p_description) {
                p_company = company;
                p_role = role;
                p_description = description;
                const r = await setHistoryDetails({company, role, description, url: links[i]?.querySelector('a[data-testid=jobTitle]')?.href});
                if (r.type == 'SKIP') {
                    return;
                }
                break;
            }
        }

        if (!firstFound) {
            appendStatusMessage('Found relevant job openings. Starting auto-apply with the first one...');
            await wait(3000);
            firstFound = true;
        }

        //StatusMessage('Waiting 25 sec');

        let sec = Math.round(25 + (Math.random() * 11));
        startCountDownInStatusBlock(sec);
        await wait(sec * 1000);

        //StatusMessage('Click Quick Apply');

        chrome.runtime.sendMessage({type: "CLICK-N-BUTTON", data: {selector1: LINKS_SELECTOR, n: i, selector2: BUTTON_SELECTOR}});

        return;

    }

}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {

    console.log('INCOMING MESSAGE', request, sender);

    const {type, data} = request;

    switch (type) {
        case 'SEARCH-NEXT':
            SEARCH_DATA.submittedLinks.push({...data});

            await movingOn(data);

            setTimeout(() => {
                searchNext().catch((reason) => {
                    chrome.runtime.sendMessage({type: "SEARCH-TASK-ERROR", data: errorToString(reason)});
                });
            }, 7000)
            break;

        case 'AGENT-MESSAGE':
            appendStatusMessage(data.message, true);

            break;
    }

});


window.addEventListener("message", async (event) => {
    if (event.data.type === "INTERCEPTED_URL") {
        console.log("INTERCEPTED_URL:", event.data.url);
        let url = event.data.url;

        if (url.startsWith('//')) {
            url = 'https:' + url;
        }

        if (SEARCH_DATA.submittedLinks.some(link => link.url === url || url.includes(link.url))) {
            console.log('LINK', url, 'ALREADY VISITED');
            //StatusMessage('Already visited');
            setTimeout(() => {
                searchNext().catch((reason) => {
                    chrome.runtime.sendMessage({type: "SEARCH-TASK-ERROR", data: errorToString(reason)});
                });
            }, 5000)
            return;
        }

        //StatusMessage('Link found');

        const response = await chrome.runtime.sendMessage({
            type: "SEND-CV-TASK",
            data: {
                url: url
            }
        });

        //StatusMessage('Wait for send cv task result');
    }
});

window.addEventListener('load', () => {

    

    chrome.runtime.sendMessage({type: "GET-SEARCH-TASK"}).then(async value => {

        const {type, data, message} = value;

        switch (type) {
            case 'ERROR':
                if (!data?.applyOneEnabled) {
                    return;
                }

                let o = false;
                while (true) {
                    const href = document.querySelector('.card-selected a[data-testid=jobTitle]')?.href
                    if (href !== o) {
                        startApplyOne(value, true);
                    }
                    o = href;
                    await wait(2000);
                }
                
                break;
            case 'SUCCESS':
                agentStatus.search = true;
                if (checkWrongReturned(data.agentGeometry)) {
                    return;
                }

                warmingUp(data.agentGeometry, data.agentMessages, data.agentMode);

                const {tabId, limit, current, domain, city, country, submittedLinks} = data;

                SEARCH_DATA.city = city;
                SEARCH_DATA.country = country;

                SEARCH_DATA.tabId = tabId;
                SEARCH_DATA.limit = limit;
                SEARCH_DATA.domain = domain;
                SEARCH_DATA.current = current;
                SEARCH_DATA.submittedLinks = submittedLinks;

                setTimeout(() => {
                    searchNext(data).catch((error) => {
                        if (error instanceof NotAuthorizedError) {
                            //StatusMessage('Not authorized');
                            setTimeout(() => {
                                chrome.runtime.sendMessage({type: "NOT-AUTHORIZED-ERROR", data: error.name});
                            }, 3000)
                        } else {
                            console.log(error);
                            appendStatusMessage(String(error));
                            setTimeout(() => {
                                chrome.runtime.sendMessage({type: "SEARCH-TASK-ERROR", data: errorToString(error)});
                            }, 15000)
                        }
                        
                    });
                }, 5)

                break;
        }

    });

});