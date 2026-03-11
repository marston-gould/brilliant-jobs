const jobscanDomain = "jobscan.co";
const jobscanApiUrlV2 = "https://api." + jobscanDomain;
const jobscanApiUrl = "https://api." + jobscanDomain + "/v4";
const JOB_SITES_KEY = "jobSites";
const JOB_SITES_TIMESTAMP_KEY = "jobSitesTimestamp";
const JOB_SITES_EXPIRATION_TIME = 12 * 60 * 60 * 1e3;
const CACHE_KEY = "user_token_cache";
const CACHE_EXPIRY_KEY = "user_token_expiry";
const CACHE_DURATION = 30 * 60 * 1e3;
const URLS = {
  INDEED: "https://www.indeed.com/jobs",
  LINKEDIN: "https://www.linkedin.com/jobs",
  GLASSDOOR: "https://www.glassdoor.com/Job",
  RESUME_MANAGER: "https://app." + jobscanDomain + "/resume-manager",
  JOB_TRACKER: "https://app." + jobscanDomain + "/tracker",
  OPPORTUNITY_AWAITS: "https://app." + jobscanDomain + "/chrome-extension",
  PLAN: "https://app." + jobscanDomain + "/plan",
  LOGIN: "https://app." + jobscanDomain + "/auth/login",
  SCAN: "https://app." + jobscanDomain + "/scan/:scanId",
  POWER_EDIT_REPORT: "https://app." + jobscanDomain + "/opportunity/:scanId/optimize",
  MATCH_REPORT: "https://app." + jobscanDomain + "/match-report/:scanId"
};
const setSession = async (session, cb) => {
  await chrome.storage.sync.set(session, () => {
    if (cb) {
      cb();
    }
  });
};
const getSession = async (key, cb) => {
  if (key) {
    await chrome.storage.sync.get(key, (value) => {
      cb(value);
    });
  } else {
    await chrome.storage.sync.get().then((sessions) => {
      cb(sessions);
    });
  }
};
const openTab = (tab, scanId, oppId) => {
  const urlString = URLS[tab];
  if (!urlString) {
    console.error("Invalid tab", tab);
    return;
  }
  if (scanId) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      let fullUrl = urlString.replace(":scanId", scanId);
      chrome.tabs.create({ url: fullUrl });
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "hide-iframe"
      });
    });
    return;
  }
  if (oppId) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.create({ url: `${urlString}/${oppId}/description` });
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "hide-iframe"
      });
    });
    return;
  }
  chrome.tabs.create({ url: urlString });
};
const checkUserValidate = async (cb) => {
  try {
    chrome.storage.local.get([CACHE_KEY, CACHE_EXPIRY_KEY], async (result) => {
      const cachedToken = result[CACHE_KEY];
      const tokenExpiry = result[CACHE_EXPIRY_KEY];
      if (cachedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        cb({ success: true, token: cachedToken });
        return;
      }
      const deviceName = navigator.userAgent;
      const response2 = await fetch(
        `${jobscanApiUrlV2}/user/valet?device=${deviceName}`,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );
      if (response2.ok) {
        const { token } = await response2.json();
        const expiryTime = Date.now() + CACHE_DURATION;
        chrome.storage.local.set({
          [CACHE_KEY]: token,
          [CACHE_EXPIRY_KEY]: expiryTime.toString()
        });
        cb({ success: true, token });
      } else {
        cb({ success: false });
      }
    });
  } catch (err) {
    console.error(err);
    cb({ success: false });
  }
};
const checkLoggedIn = async (cb) => {
  await checkUserValidate(async ({ success, token }) => {
    if (success) {
      setSession({ authToken: token });
    }
    if (cb) {
      cb({ success });
    }
  });
};
const getUser = async (cb) => {
  await getSession("authToken", async ({ authToken }) => {
    try {
      const response2 = await fetch(`${jobscanApiUrl}/auth/me`, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (response2.ok) {
        const user = await response2.json();
        cb({ success: true, user: user.data });
      } else {
        cb({ success: false });
      }
    } catch (err) {
      console.error(err);
      cb({ success: false });
    }
  });
};
const getNextInterview = async (cb) => {
  await getSession("authToken", async ({ authToken }) => {
    try {
      const response2 = await fetch(`${jobscanApiUrl}/interviews?per_page=1&upcoming=true`, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (response2.ok) {
        const interview = await response2.json();
        cb({ success: true, interview: interview.data });
      } else {
        cb({ success: false });
      }
    } catch (err) {
      console.error(err);
      cb({ success: false });
    }
  });
};
const getStagesCount = async (cb) => {
  await getSession("authToken", async ({ authToken }) => {
    try {
      const response2 = await fetch(`${jobscanApiUrl}/opportunities`, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (response2.ok) {
        const opportunities = await response2.json();
        const stagesCount = {
          saved: opportunities.data.filter((opportunity) => opportunity.stage === "saved").length,
          applied: opportunities.data.filter((opportunity) => opportunity.stage === "applied").length,
          interview: opportunities.data.filter((opportunity) => opportunity.stage === "interview").length,
          offer: opportunities.data.filter((opportunity) => opportunity.stage === "offer").length
        };
        cb({ success: true, stages: stagesCount });
      } else {
        cb({ success: false });
      }
    } catch (err) {
      console.error(err);
      cb({ success: false });
    }
  });
};
const createOpportunity = async (op, cb) => {
  try {
    let formData = new FormData();
    const date = /* @__PURE__ */ new Date();
    formData.append("job_description_id", op.jobDescriptionId);
    formData.append("salary", op.salary);
    formData.append("stage", op.stage);
    formData.append("company", op.company);
    formData.append("job_title", op.jobTitle);
    formData.append("application", date.toISOString());
    if (op.url) {
      formData.append("url", op.url);
    }
    await getSession("authToken", async ({ authToken }) => {
      var _a;
      const response2 = await fetch(`${jobscanApiUrl}/opportunities`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        }
      });
      if (response2.ok) {
        const res = await response2.json();
        if (cb)
          cb({ success: true, opportunity: res.data });
        return res.data;
      } else {
        const { errors, message } = await response2.json();
        const error = Object.keys(errors).length && ((_a = Object.values(errors)) == null ? void 0 : _a.length) && Object.values(errors)[0][0] || message;
        if (cb)
          cb({ success: false, message: error });
        return error;
      }
    });
  } catch (err) {
    console.error(err);
    if (cb)
      cb({ success: false });
    return err;
  }
};
const submitJd = async (jd, cb) => {
  try {
    if (!jd.jobTitle || !jd.jobDescription) {
      cb({ success: false, message: "Fill out the required fields" });
      return { success: false, message: "Fill out the required fields" };
    }
    let formData = new FormData();
    formData.append("name", jd.jobTitle);
    formData.append("content", jd.jobDescription);
    if (jd.jobUrl) {
      formData.append("url", jd.jobUrl);
    }
    await getSession("authToken", async ({ authToken }) => {
      var _a;
      const response2 = await fetch(`${jobscanApiUrl}/jobs`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        }
      });
      if (response2.ok) {
        const res = await response2.json();
        if (cb)
          cb({ success: true, jd: res.data, id: res.id });
        return { success: true, jd: res.data };
      } else {
        const { errors, message } = await response2.json();
        const error = Object.keys(errors).length && ((_a = Object.values(errors)) == null ? void 0 : _a.length) && Object.values(errors)[0][0] || message;
        if (cb)
          cb({ success: false, message: error });
        return { success: false, message: error };
      }
    });
  } catch (err) {
    console.error(err);
    if (cb)
      cb({ success: false, message: "Failed to save" });
    return { success: false, message: "Failed to save" };
  }
};
const saveCurrentJob = (currentJob) => {
  chrome.storage.local.set({
    "currentJob": JSON.stringify(currentJob)
  });
};
const getCurrentJob = async (cb) => {
  chrome.storage.local.get("currentJob", (result) => {
    if (!result["currentJob"]) {
      cb(null);
      return;
    }
    cb(JSON.parse(result["currentJob"]));
  });
};
const getJobSites = async (cb) => {
  try {
    chrome.storage.local.get([JOB_SITES_KEY, JOB_SITES_TIMESTAMP_KEY], async (result) => {
      const cachedJobSites = result[JOB_SITES_KEY];
      const cachedTimestamp = result[JOB_SITES_TIMESTAMP_KEY];
      const now = (/* @__PURE__ */ new Date()).getTime();
      if (cachedJobSites && cachedTimestamp && now - cachedTimestamp < JOB_SITES_EXPIRATION_TIME) {
        cb(JSON.parse(cachedJobSites));
        return;
      }
      try {
        const response2 = await fetch("https://static.jobscan.co/extension/job-sites.json");
        if (response2.ok) {
          const jobSites = await response2.json();
          chrome.storage.local.set({
            [JOB_SITES_KEY]: JSON.stringify(jobSites.data),
            [JOB_SITES_TIMESTAMP_KEY]: now.toString()
          });
          cb(jobSites.data);
        } else {
          throw new Error("Failed to fetch job sites");
        }
      } catch (err) {
        console.error(err);
        if (cachedJobSites) {
          cb(JSON.parse(cachedJobSites));
        } else {
          const staticJobSites = await fetch(chrome.runtime.getURL("./job-sites.json"));
          const jobSites = await staticJobSites.json();
          cb(jobSites.data);
        }
      }
    });
  } catch (err) {
    console.error(err);
    cb(null);
  }
};
const getResume = async (cb) => {
  try {
    await getSession("authToken", async ({ authToken }) => {
      const response2 = await fetch(`${jobscanApiUrl}/cvs/primary`, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (response2.ok) {
        const resume = await response2.json();
        cb({ success: true, resume });
      } else {
        const { message } = await response2.json();
        cb({ success: false, message });
      }
    });
  } catch (err) {
    console.error(err);
    cb({ success: false });
  }
};
const getBaseResumes = async (cb) => {
  try {
    await getSession("authToken", async ({ authToken }) => {
      const response2 = await fetch(`${jobscanApiUrl}/resumes?sortBy=created_at&sortDir=desc&perPage=25&baseOnly=1`, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (response2.ok) {
        const resumes = await response2.json();
        cb({ success: true, resumes: resumes.data });
      } else {
        const { message } = await response2.json();
        cb({ success: false, message });
      }
    });
  } catch (err) {
    console.error(err);
    cb({ success: false });
  }
};
const saveJobFlow = async (jd, tab, cb) => {
  try {
    await submitJd(jd, async (jdResponse) => {
      if (jdResponse.success) {
        const newOpportunity = {
          jobDescriptionId: jdResponse.id,
          salary: jd.salary,
          stage: "saved",
          company: jd.companyName,
          jobTitle: jd.jobTitle
        };
        if (jd.jobUrl) {
          newOpportunity.url = jd.jobUrl;
        }
        await createOpportunity(newOpportunity, (createdOpportunity) => {
          var _a;
          const params = {
            loadingJobAdd: false,
            oppId: (_a = createdOpportunity == null ? void 0 : createdOpportunity.opportunity) == null ? void 0 : _a.id
          };
          if (tab) {
            chrome.tabs.sendMessage(tab, params);
          } else {
            cb(params);
          }
        });
      } else {
        const params = {
          loadingJobAdd: false,
          failedJd: true
        };
        if (tab) {
          chrome.tabs.sendMessage(tab, params);
        } else {
          cb(params);
        }
      }
    });
  } catch (err) {
    console.error(err);
    cb({ success: false });
  }
};
const fetchReport = async (message, cb) => {
  try {
    await getSession("authToken", async ({ authToken }) => {
      let jobDescriptionFormData = new FormData();
      jobDescriptionFormData.append("content", message.filledForm.jobDescription);
      const createJobDescriptionResponse = await fetch(`${jobscanApiUrl}/jobs`, {
        method: "POST",
        body: jobDescriptionFormData,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + authToken
        },
        credentials: "same-origin",
        mode: "cors"
      });
      if (createJobDescriptionResponse.ok) {
        const createdJobDescription = await createJobDescriptionResponse.json();
        let opportunityFormData = new FormData();
        await getSession("baseResume", async ({ baseResume }) => {
          if (!baseResume) {
            cb({ success: false, message: "Please select or create a base resume." });
            return;
          }
          const copyResumeResponse = await fetch(`${jobscanApiUrl}/resumes/${baseResume.id}/clone`, {
            headers: {
              Accept: "application/json",
              Authorization: "Bearer " + authToken
            },
            credentials: "same-origin",
            mode: "cors"
          });
          const copyResume = await copyResumeResponse.json();
          opportunityFormData.append("job_description_id", createdJobDescription.id);
          opportunityFormData.append("stage", "saved");
          opportunityFormData.append("resume_id", copyResume.id);
          const createOpportunityResponse = await fetch(`${jobscanApiUrl}/opportunities`, {
            method: "POST",
            body: opportunityFormData,
            headers: {
              Accept: "application/json",
              Authorization: "Bearer " + authToken
            },
            credentials: "same-origin",
            mode: "cors"
          });
          if (createOpportunityResponse.ok) {
            const createOpportunity2 = await createOpportunityResponse.json();
            cb({ success: true, createOpportunity: createOpportunity2 });
          } else {
            const { message: message2 } = await createOpportunityResponse.json();
            cb({ success: false, message: message2 });
          }
        });
      } else {
        const { message: message2 } = await response.json();
        cb({ success: false, message: message2 });
      }
    });
  } catch (err) {
    console.error(err);
    cb({ success: false });
  }
};
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  var _a, _b, _c, _d, _e, _f;
  if (message.type === "hide-iframe") {
    const tab = (_a = sender == null ? void 0 : sender.tab) == null ? void 0 : _a.id;
    chrome.tabs.sendMessage(tab, message);
    return true;
  } else if (message.type === "create-job-from-site") {
    const tab = (_b = sender == null ? void 0 : sender.tab) == null ? void 0 : _b.id;
    const params = {
      filledForm: message.filledForm,
      state: "form"
    };
    chrome.tabs.sendMessage(tab, params);
    return true;
  } else if (message === "check-login") {
    (async () => {
      await checkLoggedIn((response2) => {
        sendResponse({ success: response2.success });
      });
    })();
    return true;
  } else if (message === "get-user") {
    (async () => {
      await getUser((response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if (message === "get-interview") {
    (async () => {
      await getNextInterview((response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "open-tab") {
    openTab(message.payload.tab, (_c = message.payload) == null ? void 0 : _c.scanId, (_d = message.payload) == null ? void 0 : _d.oppId);
    return true;
  } else if (message === "get-stages-count") {
    (async () => {
      await getStagesCount((response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "save-job") {
    delete message.type;
    (async () => {
      var _a2;
      await saveJobFlow(message, (_a2 = sender == null ? void 0 : sender.tab) == null ? void 0 : _a2.id, (response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if (message === "get-job-sites") {
    (async () => {
      await getJobSites((jobSites) => {
        sendResponse(jobSites);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "save-current-job") {
    saveCurrentJob(message.currentJob);
    return true;
  } else if (message === "get-current-job") {
    (async () => {
      await getCurrentJob((currentJob) => {
        sendResponse(currentJob);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "loaded") {
    const tab = (_e = sender == null ? void 0 : sender.tab) == null ? void 0 : _e.id;
    if (tab)
      chrome.tabs.sendMessage(tab, message);
    return true;
  } else if (message === "get-resume") {
    (async () => {
      await getResume((response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if (message === "get-selected-base-resume") {
    (async () => {
      await getSession("baseResume", async ({ baseResume }) => {
        sendResponse(baseResume);
      });
    })();
    return true;
  } else if (message === "get-base-resumes") {
    (async () => {
      await getBaseResumes((response2) => {
        sendResponse(response2);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "fetch-report") {
    const tab = (_f = sender == null ? void 0 : sender.tab) == null ? void 0 : _f.id;
    chrome.tabs.sendMessage(tab, {
      state: "scan",
      loadingScan: true
    });
    (async () => {
      await fetchReport(message, (response2) => {
        var _a2, _b2, _c2;
        const tab2 = (_a2 = sender == null ? void 0 : sender.tab) == null ? void 0 : _a2.id;
        const params = {
          loadingScan: false,
          scanId: (_c2 = (_b2 = response2.createOpportunity) == null ? void 0 : _b2.data) == null ? void 0 : _c2.id,
          errorMessage: response2 == null ? void 0 : response2.message
        };
        chrome.tabs.sendMessage(tab2, params);
      });
    })();
    return true;
  } else if ((message == null ? void 0 : message.type) === "save-base-resume") {
    (async () => {
      setSession({ baseResume: message.baseResume });
    })();
    return true;
  }
});
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("installed.html") });
    await checkLoggedIn();
  }
});
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  const message = {
    type: "page-loaded"
  };
  if (details.url.includes("handshake")) {
    chrome.tabs.sendMessage(details.tabId, message);
  }
});
