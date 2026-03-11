var MessageIdentifier = /* @__PURE__ */ ((MessageIdentifier2) => {
  MessageIdentifier2["HIDE_IFRAME"] = "hide-iframe";
  MessageIdentifier2["LOADED"] = "loaded";
  MessageIdentifier2["GET_JOB_SITES"] = "get-job-sites";
  MessageIdentifier2["CREATE_JOB_FROM_SITE"] = "create-job-from-site";
  MessageIdentifier2["GET_USER"] = "get-user";
  MessageIdentifier2["GET_RESUME"] = "get-resume";
  MessageIdentifier2["SCAN"] = "scan";
  MessageIdentifier2["OPEN_TAB"] = "open-tab";
  MessageIdentifier2["CHECK_LOGIN"] = "check-login";
  MessageIdentifier2["GET_INTERVIEW"] = "get-interview";
  MessageIdentifier2["GET_STAGES_COUNT"] = "get-stages-count";
  MessageIdentifier2["SAVE_JOB"] = "save-job";
  MessageIdentifier2["PAGE_LOADED"] = "page-loaded";
  MessageIdentifier2["FETCH_REPORT"] = "fetch-report";
  MessageIdentifier2["GET_SELECTED_BASE_RESUME"] = "get-selected-base-resume";
  MessageIdentifier2["GET_BASE_RESUMES"] = "get-base-resumes";
  return MessageIdentifier2;
})(MessageIdentifier || {});
var Style = /* @__PURE__ */ ((Style2) => {
  Style2["INDEED"] = "indeed";
  Style2["GLASSDOOR"] = "glassdoor";
  Style2["LINKEDIN"] = "linkedin";
  Style2["HANDSHAKE"] = "handshake";
  return Style2;
})(Style || {});
const site = window.location.hostname;
let jobSites = [];
let iframe = null;
let loaded = false;
let isUserLoggedIn = false;
const observerConfig = {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
};
chrome.runtime.onMessage.addListener(messageChecker);
function messageChecker(message, _sender, sendResponse) {
  var _a, _b;
  switch (message == null ? void 0 : message.type) {
    case MessageIdentifier.HIDE_IFRAME:
      iframe == null ? void 0 : iframe.classList.add("jobscan-iframe--hidden");
      break;
    case MessageIdentifier.LOADED:
      loaded = true;
      isUserLoggedIn = (_b = (_a = message.payload) == null ? void 0 : _a.isUserLoggedIn) != null ? _b : false;
      removeLoadingSaveBtn();
      removeLoadingScanBtn();
      break;
    case MessageIdentifier.PAGE_LOADED:
      init();
      break;
  }
  sendResponse(true);
}
async function sendMessage(message) {
  return await chrome.runtime.sendMessage(message);
}
function getText(selector) {
  var _a, _b;
  if (!selector)
    return "";
  const element = document.querySelector(selector);
  return element instanceof HTMLElement ? (element == null ? void 0 : element.innerText) || ((_a = element == null ? void 0 : element.childNodes) == null ? void 0 : _a.length) && ((_b = element == null ? void 0 : element.childNodes[0]) == null ? void 0 : _b.textContent) || (element == null ? void 0 : element.innerHTML) : "";
}
function getUrl(urlSelector) {
  const url = document.querySelector(urlSelector);
  return url instanceof HTMLAnchorElement ? url.href : "";
}
function getTextFromElements(domSelectors) {
  const companyName = getText(domSelectors == null ? void 0 : domSelectors.company_name);
  const jobTitle = getText(domSelectors == null ? void 0 : domSelectors.job_title);
  const jobDescription = getText(domSelectors == null ? void 0 : domSelectors.job_description);
  const salary = getText(domSelectors == null ? void 0 : domSelectors.salary);
  const jobUrl = (domSelectors == null ? void 0 : domSelectors.URL) ? getUrl(domSelectors.URL) : window.location.href;
  return {
    companyName,
    jobTitle,
    jobDescription,
    salary,
    jobUrl,
    isFilled: true
  };
}
function removeLoadingSaveBtn() {
  const saveBtn = document.querySelector(".jobscan-buttons__btn--save");
  if (saveBtn) {
    saveBtn.classList.remove("jobscan-buttons__btn--disabled");
  }
}
function removeLoadingScanBtn() {
  const scanBtn = document.querySelector(".jobscan-buttons__btn--scan");
  if (scanBtn) {
    scanBtn.classList.remove("jobscan-buttons__btn--disabled");
  }
}
function createIframe() {
  iframe = document.createElement("iframe");
  iframe.setAttribute("src", chrome.runtime.getURL("./index.html"));
  iframe.classList.add("jobscan-iframe");
  iframe.classList.add("jobscan-iframe--hidden");
  document.body.appendChild(iframe);
}
function isJobscanBtnCreated() {
  const jobscanSaveBtn = document.querySelector("div#jobscan-buttons__div");
  return !!jobscanSaveBtn;
}
function createJobscanDiv() {
  const jobscanDiv = document.createElement("div");
  jobscanDiv.setAttribute("class", "jobscan-buttons__div");
  jobscanDiv.setAttribute("id", "jobscan-buttons__div");
  return jobscanDiv;
}
function createIcon() {
  const icon = document.createElement("img");
  icon.setAttribute("src", chrome.runtime.getURL("./assets/button-logo.svg"));
  icon.setAttribute("class", "jobscan-buttons__icon");
  icon.setAttribute("alt", "jobscan-icon");
  return icon;
}
function createJobscanSaveBtn(style, domSelectors) {
  const jobscanSaveBtn = document.createElement("button");
  const icon = createIcon();
  jobscanSaveBtn.appendChild(icon);
  jobscanSaveBtn.innerHTML += "Save Job";
  jobscanSaveBtn.classList.add("jobscan-buttons__btn");
  jobscanSaveBtn.classList.add("jobscan-buttons__btn--save");
  if (!loaded)
    jobscanSaveBtn.classList.add("jobscan-buttons__btn--disabled");
  jobscanSaveBtn.classList.add(`jobscan-buttons__btn--save--${style}`);
  jobscanSaveBtn.setAttribute("id", `jobscan-buttons__btn-save--${style}`);
  jobscanSaveBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (style === Style.HANDSHAKE)
      clickOnMoreButton();
    if (jobscanSaveBtn.classList.contains("jobscan-buttons__btn--disabled"))
      return;
    if (!isUserLoggedIn) {
      return sendMessage({
        type: MessageIdentifier.OPEN_TAB,
        payload: {
          tab: "LOGIN"
        }
      });
    }
    if (iframe == null ? void 0 : iframe.classList.contains("jobscan-iframe--hidden")) {
      iframe == null ? void 0 : iframe.classList.remove("jobscan-iframe--hidden");
    }
    const filledForm = getTextFromElements(domSelectors);
    const message = {
      type: MessageIdentifier.CREATE_JOB_FROM_SITE,
      filledForm
    };
    sendMessage(message);
  });
  return jobscanSaveBtn;
}
function createJobscanScanBtn(style, domSelectors) {
  const jobscanSaveBtn = document.createElement("button");
  jobscanSaveBtn.innerHTML = "Scan";
  jobscanSaveBtn.classList.add("jobscan-buttons__btn");
  jobscanSaveBtn.classList.add("jobscan-buttons__btn--scan");
  if (!loaded)
    jobscanSaveBtn.classList.add("jobscan-buttons__btn--disabled");
  jobscanSaveBtn.classList.add(`jobscan-buttons__btn--scan--${style}`);
  jobscanSaveBtn.setAttribute("id", `jobscan-buttons__btn-scan--${style}`);
  jobscanSaveBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (style === Style.HANDSHAKE)
      clickOnMoreButton();
    if (jobscanSaveBtn.classList.contains("jobscan-buttons__btn--disabled"))
      return;
    if (!isUserLoggedIn) {
      return sendMessage({
        type: MessageIdentifier.OPEN_TAB,
        payload: {
          tab: "LOGIN"
        }
      });
    }
    const { user } = await sendMessage(MessageIdentifier.GET_USER);
    const selectedBaseResume = await sendMessage(MessageIdentifier.GET_SELECTED_BASE_RESUME);
    if (!selectedBaseResume) {
      return sendMessage({
        type: MessageIdentifier.OPEN_TAB,
        payload: {
          tab: "RESUME_MANAGER"
        }
      });
    }
    if (!(user == null ? void 0 : user.allowPowerEdit) && (user == null ? void 0 : user.matchReportQuota) <= 0) {
      return sendMessage({
        type: MessageIdentifier.OPEN_TAB,
        payload: {
          tab: "PLAN"
        }
      });
    }
    if (iframe == null ? void 0 : iframe.classList.contains("jobscan-iframe--hidden")) {
      iframe == null ? void 0 : iframe.classList.remove("jobscan-iframe--hidden");
    }
    const filledForm = getTextFromElements(domSelectors);
    const message = {
      filledForm,
      reportType: "match-report",
      type: MessageIdentifier.FETCH_REPORT
    };
    sendMessage(message);
  });
  return jobscanSaveBtn;
}
function createButtons(style, domSelectors) {
  const jobscanDiv = createJobscanDiv();
  const jobscanSaveBtn = createJobscanSaveBtn(style, domSelectors);
  const jobscanScanBtn = createJobscanScanBtn(style, domSelectors);
  jobscanDiv.appendChild(jobscanSaveBtn);
  jobscanDiv.appendChild(jobscanScanBtn);
  return jobscanDiv;
}
function addJobscanBtnToIndeed(targetElement, { dom_selectors }) {
  const isCreated = isJobscanBtnCreated();
  if (!isCreated && targetElement) {
    const indeedButtons = createButtons(Style.INDEED, dom_selectors);
    targetElement.after(indeedButtons);
  }
}
function addJobscanBtnToGlassdoor(targetElement, { dom_selectors }) {
  const isCreated = isJobscanBtnCreated();
  if (!isCreated && targetElement) {
    const glassdoorButtons = createButtons(Style.GLASSDOOR, dom_selectors);
    targetElement.after(glassdoorButtons);
  }
}
function addJobscanBtnToLinkedin(targetElement, { dom_selectors }) {
  const isCreated = isJobscanBtnCreated();
  if (!isCreated && targetElement) {
    const linkedinButtons = createButtons(Style.LINKEDIN, dom_selectors);
    const container = targetElement.closest("div");
    container == null ? void 0 : container.appendChild(linkedinButtons);
  }
}
function addJobscanBtnToHandshake(targetElement, { dom_selectors }) {
  const isCreated = isJobscanBtnCreated();
  if (!isCreated && targetElement) {
    const handshakeButtons = createButtons(Style.HANDSHAKE, dom_selectors);
    targetElement.after(handshakeButtons);
  }
}
function clickOnMoreButton() {
  const moreButton = document.querySelector("button.view-more-button");
  if (moreButton && (moreButton == null ? void 0 : moreButton.innerText) === "More") {
    moreButton.click();
  }
}
function waitForElement(jobSite) {
  createIframe();
  const observer = new MutationObserver((mutationsList, observer2) => {
    handleTargetElementAdded(mutationsList, observer2, jobSite);
  });
  const body = document.body;
  observer.observe(body, observerConfig);
}
function handleTargetElementAdded(mutationsList, _observer, jobSite) {
  for (const mutation of mutationsList) {
    if (mutation.type === "childList") {
      let element = null;
      if (jobSite.dom_selectors.target_for_job_tracker)
        element = document.querySelector(jobSite.dom_selectors.target_for_job_tracker);
      if (element) {
        if (site.includes("indeed")) {
          addJobscanBtnToIndeed(element, jobSite);
        }
        if (site.includes("glassdoor")) {
          addJobscanBtnToGlassdoor(element, jobSite);
        }
        if (site.includes("linkedin")) {
          addJobscanBtnToLinkedin(element, jobSite);
        }
        if (site.includes("handshake")) {
          addJobscanBtnToHandshake(element, jobSite);
        }
      }
    }
  }
}
async function sendGetJobSitesMessage() {
  try {
    const response = await sendMessage(MessageIdentifier.GET_JOB_SITES);
    jobSites = response;
  } catch (error) {
    console.error("Error fetching job sites:", error);
  }
}
async function init() {
  await sendGetJobSitesMessage();
  jobSites.forEach((jobSite) => {
    if (site.includes(jobSite.url_pattern)) {
      waitForElement(jobSite);
    }
  });
}
init();
