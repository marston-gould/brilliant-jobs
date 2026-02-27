chrome.runtime.onMessage.addListener((e, t, o) => {
    "ping" === e.message && o({ installed: !0 });
});
let cleanupHandlers = [],
    isContextInvalidated = !1,
    jobApplicationCount = 0;
const JOBS_BEFORE_COOLDOWN = 20,
    COOLDOWN_DURATION = 6e4;
async function handleCooldown() {
    if ((jobApplicationCount++, jobApplicationCount % 20 == 0)) {
        const e = showToast(
            `Applied ${jobApplicationCount} jobs. Taking a ${1} minute break.`,
            "info",
            6e4
        );
        await new Promise((e) => setTimeout(e, 6e4)),
            e?.(),
            showToast("Ready to apply for more jobs!", "success");
    }
}
const BASE_DELAY = 2e3,
    BASE_SHORT_DELAY = 1e3;
async function getScaledDelay(e) {
    return new Promise((t) => {
        chrome.storage.local.get("jobProcessSpeed", (o) => {
            const n =
                    [2, 1.25, 1, 0.5, 0.25][(o.jobProcessSpeed || 3) - 1] || 1,
                r = Math.max(100, e * n);
            t(r);
        });
    });
}
async function addDelay() {
    const e = await getScaledDelay(2e3);
    return new Promise((t) => setTimeout(t, e));
}
async function addShortDelay() {
    const e = await getScaledDelay(1e3);
    return new Promise((t) => setTimeout(t, e));
}
async function addShortRecruiterDelay(e = 200, t = 600) {
    const o = Math.floor(Math.random() * (t - e + 1)) + e;
    return new Promise((e) => setTimeout(e, o));
}
let isHidingJobs = !1,
    jobObserver = null,
    hideJobsTimeout = null;
function isJobApplied(e) {
    if (!e?.isConnected) return !1;
    if (
        "true" === e.getAttribute(HIDE_APPLIED_SELECTORS.APPLIED_ATTRIBUTE) ||
        e.closest(`[${HIDE_APPLIED_SELECTORS.APPLIED_ATTRIBUTE}="true"]`)
    )
        return !0;
    for (const t of HIDE_APPLIED_SELECTORS.JOB_APPLIED_INDICATORS.SELECTORS)
        for (const o of e.querySelectorAll(t)) {
            const t = o.textContent?.trim().toLowerCase() || "";
            if (
                HIDE_APPLIED_SELECTORS.JOB_APPLIED_TEXTS.some((e) =>
                    t.includes(e)
                ) ||
                o.innerHTML.includes("check") ||
                o.querySelector(
                    HIDE_APPLIED_SELECTORS.JOB_APPLIED_INDICATORS.CHECK_ICON_SELECTORS.join(
                        ","
                    )
                )
            )
                return (
                    e.setAttribute(
                        HIDE_APPLIED_SELECTORS.APPLIED_ATTRIBUTE,
                        "true"
                    ),
                    !0
                );
        }
    const t = e.closest(HIDE_APPLIED_SELECTORS.JOB_CARD_PARENT);
    return !(!t || t === e) && isJobApplied(t);
}
async function processJobCards(e, t = !0) {
    if (!e.length) return;
    const o = Math.ceil(e.length / 20);
    for (let n = 0; n < o; n++) {
        const o = e.slice(20 * n, 20 * (n + 1));
        await new Promise((e) => {
            requestIdleCallback(
                () => {
                    o.forEach((e) => {
                        if (e?.isConnected) {
                            if (!t) {
                                const e = document.evaluate(
                                    HIDE_APPLIED_SELECTORS.COMMENT_REMOVED_SELECTOR,
                                    document,
                                    null,
                                    XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                                    null
                                );
                                for (let t = 0; t < e.snapshotLength; t++) {
                                    const o = e.snapshotItem(t);
                                    o.parentNode?.removeChild(o);
                                }
                                return;
                            }
                            if (isJobApplied(e)) {
                                const t = e.parentNode,
                                    o = e.nextElementSibling;
                                t.insertBefore(
                                    document.createComment(
                                        HIDE_APPLIED_SELECTORS.COMMENT_REMOVED_BY_TEEMO_APPLIED_JOB
                                    ),
                                    o
                                ),
                                    e.remove();
                            }
                        }
                    }),
                        e();
                },
                { timeout: 2e3 }
            );
        });
    }
}
const debouncedToggleAppliedJobs = debounce(async (e = !0) => {
    if (isHidingJobs) return Promise.resolve();
    isHidingJobs = !0;
    try {
        const t = Array.from(
            document.querySelectorAll(
                HIDE_APPLIED_SELECTORS.JOB_CARD_SELECTORS.join(",")
            )
        ).filter((e) => e.isConnected);
        if (0 === t.length)
            for (const e of HIDE_APPLIED_SELECTORS.JOB_CARD_ALTERNATIVE_SELECTORS) {
                const o = document.querySelectorAll(e);
                o.length > 0 &&
                    t.push(...Array.from(o).filter((e) => e.isConnected));
            }
        return (
            t.length > 0 && (await processJobCards(t, e)),
            e && !jobObserver
                ? setupJobObserver()
                : !e &&
                  jobObserver &&
                  (jobObserver.disconnect(), (jobObserver = null)),
            Promise.resolve()
        );
    } catch (e) {
        return (
            console.error("Error in toggleAppliedJobs:", e), Promise.reject(e)
        );
    } finally {
        isHidingJobs = !1;
    }
}, 100);
function toggleAppliedJobs(e = !0) {
    return (
        clearTimeout(hideJobsTimeout),
        new Promise((t) => {
            hideJobsTimeout = setTimeout(() => {
                debouncedToggleAppliedJobs(e)
                    .then(t)
                    .catch((e) => {
                        console.error(
                            "Error in debouncedToggleAppliedJobs:",
                            e
                        ),
                            t();
                    });
            }, 0);
        })
    );
}
function setupJobObserver() {
    if (jobObserver) return;
    const e = debounce((e) => {
        if (isHidingJobs) return;
        e.some(
            (e) =>
                e.addedNodes.length > 0 ||
                ("attributes" === e.type &&
                    ("class" === e.attributeName ||
                        "style" === e.attributeName))
        ) && toggleAppliedJobs(!0);
    }, 300);
    jobObserver = new MutationObserver(e);
    const t = document.querySelector(HIDE_APPLIED_SELECTORS.JOB_LIST_CONTAINER);
    t &&
        jobObserver.observe(t, {
            childList: !0,
            subtree: !0,
            attributes: !0,
            attributeFilter: ["class", "style"],
        });
}
async function initHideJobs() {
    try {
        const { hideAppliedJobs: e } = await chrome.storage.sync.get(
            "hideAppliedJobs"
        );
        e &&
            (setTimeout(() => toggleAppliedJobs(!0), 500),
            setTimeout(() => toggleAppliedJobs(!0), 2e3));
    } catch (e) {
        console.error("Error initializing hide jobs:", e);
    }
}
function checkAndHideAppliedJobsOnLoad() {
    chrome.storage.local.get(["hideAppliedJobs"], function (e) {
        e.hideAppliedJobs &&
            setTimeout(() => {
                toggleAppliedJobs(!0);
            }, 2e3);
    });
}
function isExtensionContextValid() {
    if (isContextInvalidated) return !1;
    try {
        if ("undefined" == typeof window || "undefined" == typeof chrome)
            return !1;
        if (!chrome.runtime) return !1;
        try {
            return chrome.runtime.getManifest(), !0;
        } catch (e) {
            return (
                console.error("Extension context no longer valid:", e.message),
                !1
            );
        }
    } catch (e) {
        return (
            console.error("Error checking extension context:", e.message), !1
        );
    }
}
function cleanupExtensionContext() {
    if (((isContextInvalidated = !0), jobObserver))
        try {
            jobObserver.disconnect();
        } catch (e) {
            console.error("Error disconnecting job observer:", e);
        } finally {
            jobObserver = null;
        }
    for (; cleanupHandlers.length > 0; )
        try {
            const e = cleanupHandlers.pop();
            "function" == typeof e && e();
        } catch (e) {
            console.error("Error in cleanup handler:", e);
        }
    (cleanupHandlers = []), (isHidingJobs = !1);
    try {
        window.removeEventListener("unload", cleanupExtensionContext),
            window.removeEventListener("beforeunload", cleanupExtensionContext);
    } catch (e) {
        console.error("Error removing event listeners:", e);
    }
}
async function safeStorageGet(e) {
    if (!isExtensionContextValid()) {
        const t = {};
        return (
            Array.isArray(e)
                ? e.forEach((e) => {
                      t[e] = null;
                  })
                : "object" == typeof e &&
                  null !== e &&
                  Object.keys(e).forEach((o) => {
                      t[o] = e[o];
                  }),
            t
        );
    }
    return new Promise((t) => {
        try {
            chrome.storage.local.get(e, (e) => {
                chrome.runtime.lastError ? t({}) : t(e || {});
            });
        } catch (e) {
            console.error("Storage access failed:", e), t({});
        }
    });
}
chrome.runtime.onMessage.addListener((e, t, o) =>
    "hideAppliedJobs" === e.action && "boolean" == typeof e.hide
        ? (toggleAppliedJobs(e.hide)
              .then(() => {
                  o && o({ success: !0 });
              })
              .catch((e) => {
                  console.error("Error in toggleAppliedJobs:", e),
                      o && o({ success: !1, error: e.message });
              }),
          !0)
        : "getAppliedJobsState" === e.action
        ? (chrome.storage.local.get("hideAppliedJobs", (e) => {
              o && o({ isHidden: e.hideAppliedJobs || !1 });
          }),
          !0)
        : "toggleRecruiterMessage" === e.action && "boolean" == typeof e.enabled
        ? (chrome.storage.local.set(
              { enableRecruiterMessage: e.enabled },
              () => {
                  o && o({ success: !0 });
              }
          ),
          !0)
        : "getRecruiterMessageState" === e.action
        ? (chrome.storage.local.get("enableRecruiterMessage", (e) => {
              o && o({ enabled: e.enableRecruiterMessage || !1 });
          }),
          !0)
        : "jobLimitReached" === e.action
        ? ("function" == typeof showToast &&
              showToast(
                  `Job application limit reached! Applied: ${e.jobsApplied}, Allowed: ${e.jobsAllowed}. Redirecting to manage job profile...`,
                  "info"
              ),
          setTimeout(() => {
              window.location.href =
                  "https://portal.teemo.ai/manage-job-profile";
          }, 2e3),
          o && o({ success: !0 }),
          !0)
        : void 0
),
    "loading" === document.readyState
        ? document.addEventListener("DOMContentLoaded", initHideJobs)
        : initHideJobs(),
    "loading" === document.readyState
        ? document.addEventListener(
              "DOMContentLoaded",
              checkAndHideAppliedJobsOnLoad
          )
        : checkAndHideAppliedJobsOnLoad();
let questionQueue = [],
    isProcessingQueue = !1,
    aiIsResponding = !1,
    aiResponseTimeout = null,
    aiProcessedFields = new Set(),
    lastAiResponseTime = 0;
const AI_RESPONSE_WINDOW = 8e3;
async function askFromAI(e, t, o, n = null, r = null) {
    try {
        return await new Promise((n, r) => {
            chrome.runtime.sendMessage(
                {
                    action: "askFromAI",
                    params: { token: e, prompt: t, type: o },
                },
                (e) => {
                    chrome.runtime.lastError
                        ? (console.error(
                              "Error from background script:",
                              chrome.runtime.lastError
                          ),
                          r(
                              new Error(
                                  "Failed to communicate with background script"
                              )
                          ))
                        : e?.success
                        ? n(e.data)
                        : r(new Error(e?.error || "Failed to get AI response"));
                }
            );
        });
    } catch (e) {
        return console.error("Error in askFromAI:", e), null;
    }
}
function extractAIAnswer(e, t, o = "inputFieldConfigs") {
    try {
        let n =
            "string" == typeof e ? e : e?.data?.text || e?.data?.response || e;
        if (!n || "" === n.trim()) return null;
        const r =
            /\b(CSS|JavaScript|Python|Java|C\+\+|C#|Ruby|PHP|SQL|HTML|React|Angular|Vue|Node\.js|TypeScript|Go|Swift|Kotlin)\b/i;
        if (
            "inputFieldConfigs" === o &&
            (/years|days|hours|pay|amount|salary|rate|hourly|join|time|duration|period|number|count|how many|ctc|compensation|lpa/i.test(
                t
            ) ||
                (r.test(t) && t.length < 50))
        ) {
            let e = String(n)
                .trim()
                .replace(
                    /\b(years|year|yrs|days|day|hours|hour|hr|hrs|\$|USD|dollar|dollars|month|months|INR|LPA|lakhs|lakh|€|EUR|£|GBP|₹)\b/i,
                    ""
                )
                .replace(/[,]/g, "")
                .replace(
                    /\b(proficient|experienced|skilled|expert|knowledge|in|with|of)\b/i,
                    ""
                )
                .trim();
            if (
                /^(no|none|not applicable|n\/a|na|unknown|not available|nil|unavailable|not provided|yes)$/i.test(
                    e
                )
            )
                return "0";
            const t = [
                /\d+(\.\d+)?/,
                /\b\d+\b/,
                /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
            ];
            let o = null;
            for (const n of t) {
                const t = e.match(n);
                if (t) {
                    o = t[0];
                    break;
                }
            }
            if (!o) return "0";
            const r = {
                zero: "0",
                one: "1",
                two: "2",
                three: "3",
                four: "4",
                five: "5",
                six: "6",
                seven: "7",
                eight: "8",
                nine: "9",
                ten: "10",
                eleven: "11",
                twelve: "12",
                thirteen: "13",
                fourteen: "14",
                fifteen: "15",
                sixteen: "16",
                seventeen: "17",
                eighteen: "18",
                nineteen: "19",
                twenty: "20",
            };
            if (r[o.toLowerCase()]) return r[o.toLowerCase()];
            o = o.replace(",", ".");
            const i = parseFloat(o);
            return isNaN(i) ? "0" : i.toString();
        }
        return String(n).trim();
    } catch (e) {
        return console.error("Error in extractAIAnswer:", e), null;
    }
}
async function performInputFieldCityCheck() {
    const e = document.querySelector(LINKEDIN_SELECTORS.CITY_INPUT);
    if (e) {
        e.click(), (e.value = defaultFields.City);
        const t = new Event("input", { bubbles: !0 });
        e.dispatchEvent(t), await addShortDelay();
        const o = document.querySelector(LINKEDIN_SELECTORS.TYPEAHEAD_OPTION);
        o && o.click();
    }
}
async function performInputFieldChecks(e, t, o) {
    const n = document.querySelectorAll(LINKEDIN_SELECTORS.FORM_ELEMENTS);
    if (!n.length) return { success: !1, skippedFields: [], filledFields: [] };
    const r = [],
        i = [];
    for (const [s, a] of n.entries())
        try {
            let n = null;
            if (
                ((n = [
                    a.querySelector(LINKEDIN_SELECTORS.TEXT_INPUT),
                    a.querySelector(LINKEDIN_SELECTORS.FALLBACK_TEXT_INPUT),
                    a.querySelector(LINKEDIN_SELECTORS.COMBOBOX_INPUT),
                    ...a.querySelectorAll(
                        LINKEDIN_SELECTORS.INPUT_TYPES_SELECTOR
                    ),
                ].find(
                    (e) =>
                        e &&
                        e.tagName &&
                        "textarea" !== e.tagName.toLowerCase() &&
                        null !== e.offsetParent &&
                        !e.disabled &&
                        !e.readOnly
                )),
                !n)
            ) {
                const e = a.querySelector("textarea");
                e
                    ? r.push({
                          index: s + 1,
                          reason: "Textarea field",
                          element: "TEXTAREA",
                          id: e.id || "none",
                          name: e.name || "none",
                      })
                    : r.push({
                          index: s + 1,
                          reason: "No valid input field",
                          containerClass: a.className,
                          containerId: a.id || "none",
                      });
                continue;
            }
            if ("textarea" === n.tagName.toLowerCase()) {
                r.push({
                    index: s + 1,
                    reason: "Textarea field (secondary check)",
                    element: "TEXTAREA",
                    id: n.id || "none",
                    name: n.name || "none",
                });
                continue;
            }
            const l =
                n.classList.contains("single-typeahead") ||
                ("combobox" === n.getAttribute("role") &&
                    "list" === n.getAttribute("aria-autocomplete"));
            let c = "";
            const d =
                a.querySelector(LINKEDIN_SELECTORS.TEXT_INPUT_LABEL) ||
                a.querySelector(LINKEDIN_SELECTORS.LABEL_OR_ARIA_LABEL) ||
                a.querySelector(`label[for="${n.id}"]`);
            if (
                (d
                    ? (c = d.textContent.trim())
                    : n.placeholder
                    ? (c = n.placeholder.trim())
                    : n.getAttribute("aria-label")
                    ? (c = n.getAttribute("aria-label").trim())
                    : n.name
                    ? (c = n.name.trim())
                    : l &&
                      (c = n.id.includes("location") ? "Location" : "Unknown"),
                !c)
            ) {
                r.push({ index: s + 1, reason: "No label" });
                continue;
            }
            const u = n.value?.trim();
            if (u && "" !== u) {
                const r = checksBeforeAiAnswers(
                    c,
                    t,
                    savedQuestionsMap,
                    o,
                    "inputFieldConfigs",
                    u
                );
                r && (await setInputValue(n, r)),
                    await saveQuestionData(
                        e.token,
                        c,
                        "inputFieldConfigs",
                        [],
                        "",
                        r || u,
                        PLATFORM.LINKEDIN
                    ),
                    i.push({ index: s + 1, label: "Unknown", value: u });
                continue;
            }
            let E = null;
            if (!E && "function" == typeof checksBeforeAiAnswers)
                try {
                    E = checksBeforeAiAnswers(
                        c,
                        t,
                        savedQuestionsMap,
                        o,
                        "inputFieldConfigs"
                    );
                } catch (e) {
                    console.error(
                        `Container ${
                            s + 1
                        }: Error in checksBeforeAiAnswers for "${c}":`,
                        e
                    );
                }
            if (
                (!E && t && (E = getExperienceFromUserJobDetails(c, t)),
                !E && !l && e?.token)
            )
                try {
                    const o =
                        c.toLowerCase().includes("experience") ||
                        c.toLowerCase().includes("years") ||
                        /how many years/i.test(c);
                    let r = `Job application field "${c}": provide a concise, professional answer`;
                    r += o
                        ? " as a number"
                        : ` for a ${n.type || "text"} field`;
                    const i = await askFromAI(
                        e.token,
                        r,
                        "inputFieldConfigs",
                        e,
                        t
                    );
                    E = i ? extractAIAnswer(i, r) : null;
                } catch (e) {
                    console.error(
                        `Container ${s + 1}: AI call failed for "${c}":`,
                        e
                    );
                }
            if (E)
                try {
                    if (l) {
                        n.click(), (n.value = E);
                        const e = new Event("input", {
                            bubbles: !0,
                            cancelable: !0,
                        });
                        n.dispatchEvent(e), await addShortDelay(2e3);
                        const t = document.querySelectorAll(
                                LINKEDIN_SELECTORS.TYPEAHEAD_OPTION
                            ),
                            o = Array.from(t).find((e) =>
                                e.textContent
                                    .trim()
                                    .toLowerCase()
                                    .includes(E.toLowerCase())
                            );
                        if (o) o.click();
                        else {
                            if (!(t.length > 0)) {
                                r.push({
                                    index: s + 1,
                                    label: c,
                                    reason: "No typeahead options",
                                });
                                continue;
                            }
                            t[0].click();
                        }
                    } else await setInputValue(n, E);
                    if (e?.token)
                        try {
                            await saveQuestionData(
                                e.token,
                                c,
                                "inputFieldConfigs",
                                [],
                                E,
                                E,
                                PLATFORM.LINKEDIN
                            );
                        } catch (e) {
                            console.error("Error saving question:", e);
                        }
                    i.push({ index: s + 1, label: c, value: E });
                } catch (e) {
                    r.push({
                        index: s + 1,
                        label: c,
                        reason: "Error setting value",
                    });
                }
            else r.push({ index: s + 1, label: c, reason: "No value found" });
        } catch (e) {
            console.error(
                `Container ${s + 1}: Processing error for "${
                    labelText || "Unknown"
                }":`,
                e
            ),
                r.push({
                    index: s + 1,
                    label: labelText || "Unknown",
                    reason: "Processing error",
                });
        }
    return { success: i.length > 0, skippedFields: r, filledFields: i };
}
async function performRadioButtonChecks(e, t, o) {
    const n = o?.filter((e) => "radioButtons" == e.type) || [],
        r = document.querySelectorAll(LINKEDIN_SELECTORS.RADIO_FIELDSET);
    if (!r.length) return { success: !1, skippedFields: [] };
    const i = new Map();
    (o || []).forEach((e) => {
        if (e.placeholderText) {
            const t = normalizeText(e.placeholderText);
            i.set(t, e);
        }
    });
    const s = [],
        a = [];
    for (const l of r) {
        let r = "";
        try {
            const c = l.querySelector(LINKEDIN_SELECTORS.RADIO_LEGEND);
            if (!c) {
                s.push({ label: "Unknown", reason: "No legend" });
                continue;
            }
            const d = c.querySelector(LINKEDIN_SELECTORS.RADIO_QUESTION_TEXT);
            if (d) r = d.textContent.trim();
            else {
                const e = Array.from(c.childNodes).filter(
                    (e) => e.nodeType === Node.TEXT_NODE && e.textContent.trim()
                );
                if (e.length > 0) {
                    const t = e[0].textContent
                        .trim()
                        .split("\n")
                        .map((e) => e.trim())
                        .filter((e) => e);
                    r = t.length > 0 ? t[0] : "";
                    const o = Math.floor(r.length / 2);
                    o > 0 &&
                        r.substring(0, o) === r.substring(o) &&
                        (r = r.substring(0, o).trim());
                } else r = "";
            }
            const u = Array.from(
                    l.querySelectorAll(LINKEDIN_SELECTORS.RADIO_BUTTON_SELECTOR)
                ),
                E = u.map((e) => ({
                    value: e.value,
                    label: e.nextElementSibling?.textContent?.trim() || e.value,
                }));
            let m = null,
                f = "";
            const p = l.querySelector(
                LINKEDIN_SELECTORS.CHECKED_RADIO_SELECTOR
            );
            if (p) {
                const n = checksBeforeAiAnswers(
                    r,
                    t,
                    i,
                    o,
                    "radioButtons",
                    p.value
                );
                n && !1 !== n
                    ? (m = u.find((e) => {
                          const t = e.value.toLowerCase() === n.toLowerCase(),
                              o =
                                  e.nextElementSibling?.textContent
                                      ?.trim()
                                      .toLowerCase() === n.toLowerCase();
                          return t || o;
                      }))
                    : ((m = p), (f = p.value)),
                    m &&
                        (await realisticClick(m),
                        (m.checked = !0),
                        m.dispatchEvent(new Event("change", { bubbles: !0 }))),
                    await saveQuestionData(
                        e.token,
                        r,
                        "radioButtons",
                        E,
                        "",
                        f || p.value,
                        PLATFORM.LINKEDIN
                    ),
                    a.push({ title: r, options: E, aiAnswer: f || p.value });
                continue;
            }
            const S = checksBeforeAiAnswers(r, t, i, o, "radioButtons");
            if (
                (S &&
                    !1 !== S &&
                    ((m = u.find((e) => {
                        const t =
                                e.nextElementSibling?.textContent
                                    ?.trim()
                                    .toLowerCase() || "",
                            o = e.value?.toLowerCase() || "";
                        return (
                            t.includes(S.toLowerCase()) ||
                            o.includes(S.toLowerCase())
                        );
                    })),
                    m &&
                        (f =
                            m.value ||
                            m.nextElementSibling?.textContent?.trim())),
                !m && n.length > 0)
            ) {
                const e = n.find((e) => {
                    if (!e.placeholderText) return !1;
                    return (
                        normalizeText(e.placeholderText) === normalizeText(r)
                    );
                });
                e &&
                    e.aiAnswer &&
                    ((m = u.find((t) => {
                        const o =
                                t.nextElementSibling?.textContent
                                    ?.trim()
                                    .toLowerCase() || "",
                            n = t.value?.toLowerCase() || "",
                            r = e.aiAnswer.toLowerCase();
                        return (
                            o.includes(r) ||
                            n.includes(r) ||
                            r.includes(o) ||
                            r.includes(n)
                        );
                    })),
                    m &&
                        (f =
                            m.value ||
                            m.nextElementSibling?.textContent?.trim()));
            }
            if (!m) {
                const o = E.map((e) => e.label || e.value).join(", "),
                    n = `For the given question, choose and return the most suitable option from the options array. Question---\x3e ${r} Options---\x3e [${o}]`;
                if (e?.token)
                    try {
                        const o = await askFromAI(
                            e.token,
                            n,
                            "radioButtons",
                            e,
                            t
                        );
                        let r = null;
                        o &&
                            o.data &&
                            o.data.response &&
                            (r = o.data.response.trim().toLowerCase()),
                            r &&
                                ((m = u.find((e) => {
                                    const t =
                                            e.nextElementSibling?.textContent
                                                ?.trim()
                                                .toLowerCase() || "",
                                        o = e.value?.toLowerCase() || "";
                                    return t.includes(r) || o.includes(r);
                                })),
                                m &&
                                    (f =
                                        m.value ||
                                        m.nextElementSibling?.textContent?.trim()));
                    } catch (e) {
                        console.error(
                            "[performRadioButtonChecks] Error getting AI response:",
                            e
                        );
                    }
            }
            if (!m) {
                (m =
                    u.find(
                        (e) =>
                            /^yes$/i.test(e.value) ||
                            /^yes$/i.test(
                                e.nextElementSibling?.textContent?.trim()
                            )
                    ) || u[0]),
                    (f =
                        m.value ||
                        m.nextElementSibling?.textContent?.trim() ||
                        "Yes");
            }
            if (m) {
                if (
                    (await realisticClick(m),
                    (m.checked = !0),
                    m.dispatchEvent(new Event("change", { bubbles: !0 })),
                    e?.token)
                )
                    try {
                        a.push({ title: r, options: E, aiAnswer: f });
                    } catch (e) {
                        console.error("❌ Error processing radio button:", e),
                            s.push({
                                label: r,
                                reason: "Error processing: " + e.message,
                            });
                    }
            } else s.push({ label: r, reason: "No selectable options found" });
        } catch (e) {
            console.error("❌ Error processing radio field:", e),
                s.push({ label: r || "Unknown", reason: "Processing error" });
        }
    }
    if (a.length > 0 && e?.token)
        for (const t of a)
            try {
                await saveQuestionData(
                    e.token,
                    t.title,
                    "radioButtons",
                    t.options,
                    t.aiAnswer || "",
                    "",
                    PLATFORM.LINKEDIN
                );
            } catch (e) {
                console.error("❌ Error saving radio button data:", e);
            }
    return { success: a.length > 0, skippedFields: s };
}
async function performDropdownChecks(e, t, o) {
    const n = document.querySelectorAll(LINKEDIN_SELECTORS.DROPDOWNS);
    let r = [];
    const i = new Map();
    (o || []).forEach((e) => {
        const t = e.placeholderText || "";
        if (t) {
            const o = normalizeText(t);
            i.set(o, e);
        }
    });
    for (let s = 0; s < n.length; s++) {
        const a = n[s],
            l = a.closest(LINKEDIN_SELECTORS.FORM_ELEMENTS);
        if (!l) {
            console.error(
                `[performDropdownChecks] No parent element found for dropdown ${s}:`,
                a
            );
            continue;
        }
        const c = (
                l.querySelector("label")?.innerText.trim() || "No Title"
            ).split("\n")[0],
            d = normalizeText(c);
        getSimilarityRegex(d);
        let u = Array.from(a.options)
            .map((e) => e.innerText.trim())
            .filter((e) => "select an option" !== e.toLowerCase() && "" !== e);
        if (a.selectedIndex > 0) {
            try {
                await saveQuestionData(
                    e.token,
                    c,
                    "dropdowns",
                    u,
                    "",
                    a.value,
                    PLATFORM.LINKEDIN
                );
            } catch (e) {
                console.error(
                    `[performDropdownChecks] Error saving existing dropdown data for dropdown ${s}:`,
                    e
                );
            }
            continue;
        }
        let E = null,
            m = "";
        const f = checksBeforeAiAnswers(c, t, i, o, "dropdowns");
        if (
            (f &&
                !1 !== f &&
                ((E = Array.from(a.options).find(
                    (e) => normalizeText(e.innerText) === normalizeText(f)
                )),
                E && (m = E.value || E.innerText.trim())),
            !E)
        ) {
            const o = `For the given question, choose and return the most suitable option from the options array. Question---\x3e ${c} Options---\x3e [${u.join(
                ", "
            )}]`;
            if (e?.token)
                try {
                    const n = await askFromAI(e.token, o, "dropdowns", e, t);
                    let r = null;
                    n &&
                        n.data &&
                        n.data.response &&
                        (r = n.data.response.trim().toLowerCase()),
                        r &&
                            ((E = Array.from(a.options).find((e) => {
                                const t = e.innerText.trim().toLowerCase(),
                                    o = e.value?.toLowerCase() || "";
                                return t === r || o === r;
                            })),
                            E && (m = E.value || E.innerText.trim()));
                } catch (e) {
                    console.error(
                        `[performDropdownChecks] Error getting AI response for dropdown ${s}:`,
                        e
                    );
                }
        }
        if (!E)
            try {
                const e = Array.from(a.options).find(
                    (e) =>
                        /^yes$/i.test(e.innerText.trim()) ||
                        "yes" === e.innerText.trim().toLowerCase()
                );
                e
                    ? ((E = e), (m = e.innerText.trim()))
                    : a.options.length > 1 &&
                      ((E = a.options[1]), (m = E.innerText.trim()));
            } catch (e) {
                console.error(
                    `[performDropdownChecks] Error selecting fallback option for dropdown ${s}:`,
                    e
                ),
                    a.options.length > 0 &&
                        ((E = a.options[0]), (m = E.innerText.trim()));
            }
        E
            ? ((E.selected = !0),
              await new Promise((e) => setTimeout(e, 100)),
              a.dispatchEvent(new Event("change", { bubbles: !0 })),
              r.push({ title: c, options: u, aiAnswer: m }))
            : console.error(
                  `[performDropdownChecks] No option selected for dropdown ${s}: ${c}`
              ),
            s < n.length - 1 && (await new Promise((e) => setTimeout(e, 50)));
    }
    if (r && r.length > 0)
        for (const t of r)
            try {
                await saveQuestionData(
                    e.token,
                    t.title,
                    "dropdowns",
                    t.options,
                    t.aiAnswer || "",
                    "",
                    PLATFORM.LINKEDIN
                );
            } catch (e) {
                console.error(
                    `[performDropdownChecks] Error saving dropdown data for ${t.title}:`,
                    e
                );
            }
    return r;
}
async function performanceCheckBoxChecks(e, t, o) {
    const n = document.querySelectorAll(LINKEDIN_SELECTORS.CHECKBOX_FIELDSET);
    for (const e of n) {
        if (e.querySelector(LINKEDIN_SELECTORS.CHECKED_CHECKBOX_SELECTOR))
            continue;
        const t = e.querySelector("label").textContent.trim().toLowerCase();
        if (t && "mark job as a top choice" === t) continue;
        const o = e.querySelector(LINKEDIN_SELECTORS.CHECKBOX_SELECTOR);
        o &&
            ((o.checked = !0),
            o.dispatchEvent(new Event("change", { bubbles: !0 })),
            o.dispatchEvent(
                new Event("click", { bubbles: !0, cancelable: !0 })
            ),
            o.dispatchEvent(new Event("input", { bubbles: !0 })));
    }
    const r = document.querySelectorAll(LINKEDIN_SELECTORS.CHECKBOX_SELECTOR),
        i = Array.from(r).filter(
            (e) => !e.closest(LINKEDIN_SELECTORS.CHECKBOX_FIELDSET)
        );
    for (const e of i) {
        if (e.checked) continue;
        const t = e.textContent.trim().toLowerCase();
        (t && "mark job as a top choice" === t) ||
            ((e.checked = !0),
            e.dispatchEvent(new Event("change", { bubbles: !0 })),
            e.dispatchEvent(
                new Event("click", { bubbles: !0, cancelable: !0 })
            ),
            e.dispatchEvent(new Event("input", { bubbles: !0 })));
    }
}
async function performTextareaChecks(e, t, o) {
    const n = new Set(),
        r = Array.from(
            document.querySelectorAll(LINKEDIN_SELECTORS.TEXTAREA_SELECTOR)
        ),
        i = [];
    for (const e of r) {
        const t = e.id || e.name || e.getAttribute("data-test-textarea") || "";
        n.has(t) ||
            null === e.offsetParent ||
            (n.add(t),
            i.push({
                element: e,
                container: e.closest(
                    LINKEDIN_SELECTORS.TEXTAREA_CONTAINER || "div.ember-view"
                ),
            }));
    }
    if (0 === i.length)
        return { success: !1, skippedFields: [], filledFields: [] };
    const s = [],
        a = [],
        l = new Set();
    for (const [n, { element: r, container: c }] of i.entries())
        try {
            if (!r || !c) {
                s.push({
                    index: n + 1,
                    reason: "Invalid textarea or container",
                });
                continue;
            }
            let i = "",
                d = null;
            if (
                (r.id && (d = document.querySelector(`label[for="${r.id}"]`)),
                d ||
                    (d =
                        c.querySelector(
                            LINKEDIN_SELECTORS.TEXTAREA_LABEL_SELECTOR
                        ) ||
                        c.querySelector("label") ||
                        "LABEL" === c.previousElementSibling?.tagName
                            ? c.previousElementSibling
                            : null),
                d)
            )
                i = d.textContent.trim();
            else if (r.getAttribute("aria-label"))
                i = r.getAttribute("aria-label").trim();
            else if (r.placeholder) i = r.placeholder.trim() + " (placeholder)";
            else {
                const e =
                    r.id ||
                    r.name ||
                    `textarea-${Array.from(
                        document.querySelectorAll("textarea")
                    ).indexOf(r)}`;
                i = `Unlabeled-${e}`;
            }
            if (l.has(i)) continue;
            l.add(i);
            const u = r.value?.trim();
            if (u && "" !== u) {
                const r = checksBeforeAiAnswers(
                    i,
                    t,
                    savedQuestionsMap,
                    o,
                    "inputFieldConfigs",
                    u
                );
                r && (await setInputValue(inputField, r)),
                    await saveQuestionData(
                        e.token,
                        i,
                        "inputFieldConfigs",
                        [],
                        "",
                        r || u,
                        PLATFORM.LINKEDIN
                    ),
                    a.push({ index: n + 1, label: "Unknown", value: u });
                continue;
            }
            let E = null;
            if (!E && "function" == typeof checksBeforeAiAnswers)
                try {
                    E = checksBeforeAiAnswers(
                        i,
                        t,
                        savedQuestionsMap,
                        o,
                        "inputFieldConfigs"
                    );
                } catch (e) {
                    console.error(
                        `Error in checksBeforeAiAnswers for "${i}":`,
                        e
                    );
                }
            if (!E && o) {
                const e = Object.values(o).find(
                    (e) =>
                        "inputFieldConfigs" === e.type &&
                        e.prompt &&
                        i.toLowerCase().includes(e.prompt.toLowerCase())
                );
                if (e?.response) {
                    E = e.response;
                    const t = [
                        "Based on your profile, your previous experiences relevant for the position you are applying to include:",
                        "Yes, the candidate has experience in",
                        "The candidate is a",
                        "Proficient in",
                    ];
                    for (const e of t)
                        if (E.startsWith(e)) {
                            E = E.substring(e.length).trim();
                            break;
                        }
                }
            }
            if (!E && e?.token)
                try {
                    const o = `Provide a concise, professional response for the job application field: "${i}".\n          Give a paragraph type response of 100 word only `,
                        n = await askFromAI(
                            e.token,
                            o,
                            "inputFieldConfigs",
                            e,
                            t
                        );
                    E = n
                        ? "string" == typeof n
                            ? n
                            : n.data?.response
                            ? n.data.response
                            : JSON.stringify(n)
                        : "";
                    const r = [
                        "Based on your profile, your previous experiences relevant for the position you are applying to include:",
                        "Yes, the candidate has experience in",
                        "The candidate is a",
                        "Proficient in",
                    ];
                    for (const e of r)
                        if (E.startsWith(e)) {
                            E = E.substring(e.length).trim();
                            break;
                        }
                    i.toLowerCase().includes("list") &&
                        (E = E.split(/[,.]/)
                            .map((e) => e.trim())
                            .filter((e) => e)
                            .join(", ")),
                        E ||
                            (E =
                                "Relevant skills include JavaScript, HTML/CSS, Node.js, and ReactJS.");
                } catch (e) {
                    console.error(`AI call failed for "${i}":`, e);
                }
            if (E)
                try {
                    if ((await setInputValue(r, E), e?.token))
                        try {
                            await saveQuestionData(
                                e.token,
                                i,
                                "inputFieldConfigs",
                                [],
                                E,
                                E,
                                PLATFORM.LINKEDIN
                            );
                        } catch (e) {
                            console.error("Error saving textarea question:", e);
                        }
                    a.push({ index: n + 1, label: i, value: E });
                } catch (e) {
                    console.error(`Error setting value for "${i}":`, e),
                        s.push({
                            index: n + 1,
                            label: i,
                            reason: "Error setting value",
                        });
                }
            else s.push({ index: n + 1, label: i, reason: "No value found" });
        } catch (e) {
            s.push({
                index: n + 1,
                label: labelText || "Unknown",
                reason: "Processing error",
            });
        }
    return { success: a.length > 0, skippedFields: s, filledFields: a };
}
async function performSafetyReminderCheck() {
    const e = document.querySelector(LINKEDIN_SELECTORS.MODAL);
    if (e) {
        const t = e.querySelector(LINKEDIN_SELECTORS.MODAL_HEADER);
        if (t && t.textContent.includes("Job search safety reminder")) {
            const t = e.querySelector(LINKEDIN_SELECTORS.MODAL_DISMISS);
            t && t.click();
        }
    }
}
async function handleApplicationSentPopup() {
    for (let e = 0; e < 8; e++) {
        const t = document.querySelector(LINKEDIN_SELECTORS.MODAL);
        if (t) {
            const e = t.querySelector(LINKEDIN_SELECTORS.MODAL_HEADER);
            if (e && e.textContent.includes("Save this application")) {
                const e = Array.from(t.querySelectorAll("button")).find(
                    (e) => "discard" === e.textContent.trim().toLowerCase()
                );
                if (e) return e.click(), await addShortDelay(), !0;
            }
            if (
                e &&
                LINKEDIN_SELECTORS.POPUP_TITLES.some((t) =>
                    e.textContent.includes(t)
                )
            ) {
                const e = Array.from(
                    t.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
                ).find((e) => "done" === e.textContent.trim().toLowerCase());
                if (e && !e.disabled)
                    return e.click(), await addShortDelay(), !0;
                const o = LINKEDIN_SELECTORS.CLOSE_BUTTON_SELECTORS.reduce(
                    (e, o) => e || t.querySelector(o),
                    t.querySelector(LINKEDIN_SELECTORS.MODAL_DISMISS)
                );
                if (o && !o.disabled)
                    return o.click(), await addShortDelay(), !0;
                const n = LINKEDIN_SELECTORS.CLOSE_BUTTON_SELECTORS.reduce(
                    (e, o) => e || t.querySelector(o),
                    null
                );
                if (n && !n.disabled)
                    return n.click(), await addShortDelay(), !0;
            }
        }
        const o = document.querySelectorAll(LINKEDIN_SELECTORS.ALL_MODALS);
        for (const e of o) {
            const t = e.textContent.toLowerCase();
            if (
                t.includes("sent") ||
                t.includes("submitted") ||
                t.includes("applied")
            ) {
                const t = e.querySelectorAll(
                    LINKEDIN_SELECTORS.BUTTON_SELECTOR
                );
                for (const e of t) {
                    const t = e.textContent.trim().toLowerCase();
                    if ("done" === t || "close" === t || "ok" === t)
                        return e.click(), await addShortDelay(), !0;
                }
            }
        }
        5 === e &&
            (document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", keyCode: 27 })
            ),
            await addShortDelay()),
            await new Promise((e) => setTimeout(e, 300));
    }
    return !1;
}
async function validateAndCloseConfirmationModal() {
    for (let e = 0; e < 5; e++) {
        const e = document.querySelector(LINKEDIN_SELECTORS.MODAL);
        if (e) {
            const t = e.querySelector(LINKEDIN_SELECTORS.MODAL_HEADER),
                o = e.textContent.toLowerCase();
            if (
                t &&
                LINKEDIN_SELECTORS.CONFIRMATION_TEXTS.some((e) => o.includes(e))
            ) {
                const t = Array.from(
                    e.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
                ).find((e) =>
                    e.textContent.trim().toLowerCase().includes("discard")
                );
                if (t && !t.disabled)
                    return t.click(), await addShortDelay(), !0;
                const o = Array.from(
                    e.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
                ).find((e) => "no" === e.textContent.trim().toLowerCase());
                if (o && !o.disabled)
                    return o.click(), await addShortDelay(), !0;
                const n = Array.from(
                    e.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
                ).find((e) => "cancel" === e.textContent.trim().toLowerCase());
                if (n && !n.disabled)
                    return n.click(), await addShortDelay(), !0;
                const r = e.querySelector(LINKEDIN_SELECTORS.MODAL_DISMISS);
                if (r && !r.disabled)
                    return r.click(), await addShortDelay(), !0;
            }
        }
        await new Promise((e) => setTimeout(e, 200));
    }
    return !1;
}
async function terminateJobModel() {
    const e = LINKEDIN_SELECTORS.DISMISS_BUTTON_SELECTORS.reduce(
        (e, t) => e || document.querySelector(t),
        null
    );
    if (e && !e.disabled) {
        e.click(),
            e.dispatchEvent(new Event("change", { bubbles: !0 })),
            await addShortDelay(),
            await new Promise((e) => setTimeout(e, 500));
        const t = Array.from(
            document.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
        ).find((e) => "discard" === e.textContent.trim().toLowerCase());
        return (
            t &&
                !t.disabled &&
                (t.click(),
                t.dispatchEvent(new Event("change", { bubbles: !0 })),
                await addShortDelay()),
            !0
        );
    }
    const t = document.querySelector(LINKEDIN_SELECTORS.MODAL);
    if (t) {
        const e = LINKEDIN_SELECTORS.CLOSE_BUTTON_SELECTORS.reduce(
            (e, o) => e || t.querySelector(o),
            null
        );
        if (e && !e.disabled) return e.click(), await addShortDelay(), !0;
    }
    return (
        document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", keyCode: 27 })
        ),
        await addShortDelay(),
        !1
    );
}
async function checkForError() {
    return null !== document.querySelector(LINKEDIN_SELECTORS.FEEDBACK_MESSAGE);
}
async function getErrorFields() {
    const e = [],
        t = document.querySelectorAll(
            LINKEDIN_SELECTORS.ERROR_ELEMENT_SELECTORS.join(", ")
        );
    for (const o of t) {
        if (null === o.offsetParent) continue;
        const t = o.closest(LINKEDIN_SELECTORS.FORM_ELEMENTS);
        if (!t) continue;
        const n = (
            t.querySelector("label")?.innerText.trim() || "No Label"
        ).split("\n")[0];
        e.push(n);
    }
    return e;
}
async function fixDropdownValidationErrors() {
    const e = document.querySelectorAll(
        LINKEDIN_SELECTORS.ERROR_ELEMENT_SELECTORS.join(", ")
    );
    let t = !1;
    for (const o of e) {
        const e =
            o.closest("form") || o.closest("fieldset") || o.closest("div");
        if (!e) continue;
        const n = e.querySelector(LINKEDIN_SELECTORS.SELECT_FIELDS);
        if (!n) continue;
        const r = Array.from(n.options).find((e, t) => t > 0 && e.value);
        r &&
            ((r.selected = !0),
            n.dispatchEvent(new Event("change", { bubbles: !0 })),
            (t = !0),
            await addShortDelay());
    }
    const o = document.querySelectorAll(LINKEDIN_SELECTORS.SELECT_FIELDS);
    for (const e of o)
        if (0 === e.selectedIndex) {
            const o = Array.from(e.options).find((e, t) => t > 0 && e.value);
            o &&
                ((o.selected = !0),
                e.dispatchEvent(new Event("change", { bubbles: !0 })),
                (t = !0),
                await addShortDelay());
        }
    return t;
}
async function jobPanelScrollLittle() {
    const e = document.querySelector(LINKEDIN_SELECTORS.JOBS_PANEL);
    if (e) {
        const t = 0.03,
            o = e.scrollHeight * t;
        (e.scrollTop += o), await addShortDelay();
    }
}
async function clickJob(e) {
    highlightElement(e, "processing", "warning");
    const t = [
        LINKEDIN_SELECTORS.JOB_CARD_CONTAINER_LINK,
        LINKEDIN_SELECTORS.JOB_CARD_LIST_TITLE,
    ];
    let o = null;
    for (const n of t) if (((o = e.querySelector(n)), o)) break;
    if (o) {
        o.click(), await addDelay();
        if (await checkForNegativeKeywords(LINKEDIN_SELECTORS)) return;
        await runFindEasyApply(e);
    }
    await jobPanelScrollLittle();
}
async function runValidations() {
    const e = new Promise((e) => {
            const t = () => {
                0 !== questionQueue.length || isProcessingQueue
                    ? setTimeout(t, 500)
                    : e();
            };
            t();
        }),
        t = await new Promise((e) => {
            chrome.storage.sync.get(null, async function (t) {
                return e(t?.userDetails ? t.userDetails : null);
            });
        }),
        o = await new Promise((e) => {
            chrome.storage.sync.get(null, async function (t) {
                return e(t?.user ? t.user : null);
            });
        }),
        n = await new Promise((e) => {
            chrome.storage.local.get(null, async function (t) {
                return t?.savedQuestions
                    ? e(t.savedQuestions)
                    : ((savedQuestionsMap = buildSavedQuestionsMap(
                          t.savedQuestions
                      )),
                      e(null));
            });
        });
    await validateAndCloseConfirmationModal(),
        await performInputFieldChecks(o, t, n),
        await performRadioButtonChecks(o, t, n),
        await performDropdownChecks(o, t, n),
        await performInputFieldCityCheck(o, t, n),
        await performTextareaChecks(o, t, n),
        await performanceCheckBoxChecks(o, t, n),
        await e,
        await addShortDelay();
}
function getRecruiterInfo() {
    let e = "Not available",
        t = "Not available",
        o = "Not available";
    if (getElementText(LINKEDIN_SELECTORS.RECRUITER_SECTION)) {
        const n = getElementText(LINKEDIN_SELECTORS.RECRUITER_NAME),
            r = getElementText(LINKEDIN_SELECTORS.RECRUITER_TITLE),
            i = document.querySelector(LINKEDIN_SELECTORS.RECRUITER_PROFILE);
        (n || r || i) &&
            ((e = n.trim() || e),
            (t = r.trim().replace(/^:white_tick:\s*/, "") || t),
            (o = i?.href || o));
    }
    return { recruiterName: e, recruiterTitle: t, recruiterUrl: o };
}
async function saveLinkedinJobs(e, t) {
    try {
        const o = await new Promise((e) => chrome.storage.sync.get(null, e));
        if (!o?.user) return;
        const n = window.location.href;
        if (!n) return;
        const r =
            new URL(window.location.href).searchParams.get("currentJobId") ||
            "Unknown ID";
        await waitForElement(LINKEDIN_SELECTORS.JOB_TITLE);
        const i = getElementText(LINKEDIN_SELECTORS.JOB_TITLE),
            s = getElementText(LINKEDIN_SELECTORS.COMPANY_NAME);
        let a = getElementText(LINKEDIN_SELECTORS.JOB_DESCRIPTION);
        const l = getElementText(LINKEDIN_SELECTORS.PRIMARY_DESC),
            {
                recruiterName: c,
                recruiterTitle: d,
                recruiterUrl: u,
            } = getRecruiterInfo(),
            E =
                document
                    .querySelector(LINKEDIN_SELECTORS.COMPANY_LOGO)
                    ?.getAttribute("src") || "";
        (a += "\n\n---\nRecruiter Information:\n"),
            (a += `Name: ${c}\n`),
            (a += `Title: ${d}\n`),
            (a += `LinkedIn: ${u}\n`);
        let m = {},
            f = null;
        try {
            const { resumeAnalysis: c } = await new Promise((e) => {
                chrome.storage.local.get("resumeAnalysis", e);
            });
            (m = c || {}),
                m?.fileUrl
                    ? (f = m.fileUrl)
                    : console.error(
                          "[DEBUG] No resumeLink found in resumeAnalysis"
                      );
            const d = m.scoreAnalysis
                    ? {
                          skills: {
                              matched: m.scoreAnalysis.skills?.matched || [],
                              missing: m.scoreAnalysis.skills?.missing || [],
                          },
                          overallScore: m.scoreAnalysis.overallScore || 0,
                          recommendations: Array.isArray(
                              m.scoreAnalysis.recommendations
                          )
                              ? m.scoreAnalysis.recommendations
                              : [],
                          lastUpdated:
                              m.scoreAnalysis.lastUpdated ||
                              new Date().toISOString(),
                      }
                    : {},
                u = m.tailoredResume || {},
                p = {
                    jobId: r,
                    jobTitle: i,
                    companyName: s,
                    jobDetails: a,
                    primaryDesc: l,
                    platform: PLATFORM.LINKEDIN,
                    url: n,
                    type: e,
                    applied: t,
                    companyLogo: E,
                    resumeScore: d,
                    tailoredResume: u,
                    resumeLink: f,
                },
                S = await new Promise((e, t) => {
                    chrome.runtime.sendMessage(
                        {
                            action: "saveLinkedinJob",
                            params: { jobData: p, token: o.user.token },
                        },
                        (o) => {
                            chrome.runtime.lastError
                                ? (console.error(
                                      "Error from background script:",
                                      chrome.runtime.lastError
                                  ),
                                  t(
                                      new Error(
                                          "Failed to communicate with background script"
                                      )
                                  ))
                                : o?.success
                                ? e(o.data)
                                : (console.error("Error saving job:", o?.error),
                                  t(
                                      new Error(
                                          o?.error ||
                                              "Failed to save job application"
                                      )
                                  ));
                        }
                    );
                });
            return (
                await new Promise((e) =>
                    chrome.storage.local.remove("resumeAnalysis", e)
                ),
                S
            );
        } catch (c) {
            console.error("Error retrieving resume analysis:", c);
            const d = {
                jobId: r,
                jobTitle: i,
                companyName: s,
                jobDetails: a,
                primaryDesc: l,
                platform: PLATFORM.LINKEDIN,
                url: n,
                type: e,
                applied: t,
                companyLogo: E,
                resumeLink: f,
            };
            return await new Promise((e, t) => {
                chrome.runtime.sendMessage(
                    {
                        action: "saveLinkedinJob",
                        params: { jobData: d, token: o.user.token },
                    },
                    (o) => {
                        chrome.runtime.lastError
                            ? (console.error(
                                  "Error from background script:",
                                  chrome.runtime.lastError
                              ),
                              t(
                                  new Error(
                                      "Failed to communicate with background script"
                                  )
                              ))
                            : o?.success
                            ? e(o.data)
                            : (console.error(
                                  "Error saving job in error case:",
                                  o?.error
                              ),
                              t(
                                  new Error(
                                      o?.error ||
                                          "Failed to save job application"
                                  )
                              ));
                    }
                );
            });
        }
    } catch (e) {
        throw (console.error("Error saving job:", e), e);
    }
}
async function runApplyModel() {
    setupDiscardButtonObserver(),
        await addDelay(),
        await performSafetyReminderCheck(),
        await uploadGeneratedResumeIfExists();
    const e = document.querySelector(LINKEDIN_SELECTORS.CONTINUE_APPLYING);
    e && (e.click(), runApplyModel());
    const t = Array.from(
            document.querySelectorAll(LINKEDIN_SELECTORS.NEXT_BUTTON_SELECTOR)
        ).find((e) => e.textContent.includes("Next")),
        o = document.querySelector(LINKEDIN_SELECTORS.REVIEW_BUTTON),
        n = document.querySelector(LINKEDIN_SELECTORS.SUBMIT_BUTTON);
    if (n) {
        await addShortDelay(),
            await runValidations(),
            n.click(),
            await addDelay();
        (await handleApplicationSentPopup())
            ? await handleCooldown()
            : await handleApplicationSentPopup(),
            await saveLinkedinJobs(JOB_CATEGORY.EASY_APPLY, !0),
            await addDelay();
        const e = document.querySelector(LINKEDIN_SELECTORS.MODAL_DISMISS);
        if (e) return void e.click();
    }
    if (t || o) {
        const e = o || t;
        await runValidations();
        if (await checkForError()) {
            const t = (await getErrorFields()).some((e) =>
                    aiProcessedFields.has(e)
                ),
                o = Date.now() - lastAiResponseTime;
            if (aiIsResponding || o < 8e3 || t) {
                await addDelay(), await runValidations();
                if (await checkForError()) {
                    if (
                        (await getErrorFields()).some((e) =>
                            aiProcessedFields.has(e)
                        )
                    ) {
                        await fixDropdownValidationErrors(),
                            await performInputFieldChecks(null, null, null);
                        (await checkForError())
                            ? terminateJobModel()
                            : (await addDelay(),
                              e.click(),
                              await runApplyModel());
                    } else terminateJobModel();
                } else await addDelay(), e.click(), await runApplyModel();
            } else terminateJobModel();
        } else await addDelay(), e.click(), await runApplyModel();
    }
}
function getElementText(e) {
    const t = document.querySelector(e);
    return t ? t.textContent.trim() : "N/A";
}
async function waitForElement(e, t = 1e4) {
    const o = Date.now();
    for (; Date.now() - o < t; ) {
        const t = document.querySelector(e);
        if (t) return t;
        await sleep(100);
    }
    throw new Error(`Element not found: ${e}`);
}
async function sleep(e) {
    return new Promise((t) => setTimeout(t, e));
}
async function uploadGeneratedResumeIfExists() {
    const { teemoGeneratedResume: e } = await new Promise((e) =>
        chrome.storage.local.get("teemoGeneratedResume", e)
    );
    if (!e) return;
    const { resumeBlob: t, fileName: o, mimeType: n } = e;
    try {
        const e = atob(t.split(",")[1]),
            r = new ArrayBuffer(e.length),
            i = new Uint8Array(r);
        for (let t = 0; t < e.length; t++) i[t] = e.charCodeAt(t);
        const s = new Blob([r], { type: n || "application/pdf" });
        if (s.size < 500)
            return (
                console.error("Decoded blob too small – skipping upload"),
                void (await fallbackToExistingResume())
            );
        const a = new Uint8Array(await s.slice(0, 5).arrayBuffer()),
            l = String.fromCharCode(...a);
        if (!l.startsWith("%PDF-"))
            return (
                console.error("Invalid PDF header on upload:", l),
                void (await fallbackToExistingResume())
            );
        const c = new File([s], o, { type: n || "application/pdf" }),
            d = document.querySelector(
                'input[type="file"][accept*="pdf"], input[id*="jobs-document-upload-file-input"]'
            );
        if (!d) return;
        const u = new DataTransfer();
        u.items.add(c),
            (d.files = u.files),
            d.dispatchEvent(new Event("change", { bubbles: !0 })),
            await new Promise((e) => setTimeout(e, 3e3));
        const E = document.querySelector(
            '.jobs-document-upload__error, [role="alert"], .error-message'
        );
        if (E && E.textContent.includes("acceptable document format"))
            return void (await fallbackToExistingResume());
        const m = [
            ...document.querySelectorAll(
                ".jobs-document-upload-redesign-card__container"
            ),
        ].find((e) =>
            e
                .querySelector(".jobs-document-upload-redesign-card__file-name")
                ?.textContent.trim()
                .includes("tailored-resume")
        );
        if (m) {
            const e = m.querySelector('input[type="radio"]');
            e
                ? ((e.checked = !0),
                  e.dispatchEvent(new Event("change", { bubbles: !0 })))
                : console.error("Radio input not found in new resume card");
        } else await fallbackToExistingResume();
        await new Promise((e) =>
            chrome.storage.local.remove("teemoGeneratedResume", e)
        );
    } catch (e) {
        console.error("Error decoding/uploading resume:", e),
            await fallbackToExistingResume();
    }
}
async function fallbackToExistingResume() {
    const e = [
        ...document.querySelectorAll(
            ".jobs-document-upload-redesign-card__container:not(.jobs-document-upload-redesign-card__container--selected)"
        ),
    ];
    if (0 === e.length) return;
    const t = e.sort((e, t) => {
        const o = e
                .querySelector(".t-black--light")
                ?.textContent.match(/(\d+\/\d+\/\d+)/)?.[1],
            n = t
                .querySelector(".t-black--light")
                ?.textContent.match(/(\d+\/\d+\/\d+)/)?.[1];
        return new Date(n || "1900") - new Date(o || "1900");
    })[0];
    if (t) {
        const e = t.querySelector('input[type="radio"]');
        e &&
            ((e.checked = !0),
            e.dispatchEvent(new Event("change", { bubbles: !0 })));
    }
}
async function runFindEasyApply(e) {
    await addShortDelay();
    const t = document.querySelectorAll(LINKEDIN_SELECTORS.ALL_BUTTONS),
        o = Array.from(t).filter((e) => e.textContent.includes("Easy Apply"));
    if (0 !== o.length) {
        if (o.length > 1) {
            highlightElement(e, "processing", "info");
            let t = "";
            const n = [
                LINKEDIN_SELECTORS.JOB_DESCRIPTION,
                '[data-test-id="job-description"]',
            ];
            for (const e of n) {
                const o = document.querySelector(e);
                if (o && o.textContent && o.textContent.trim()) {
                    t = o.textContent.trim();
                    break;
                }
            }
            if (!t) return;
            const r = t
                    .replace(/<[^>]*>/g, "")
                    .replace(/\s+/g, " ")
                    .replace(/\n\s*\n/g, "\n")
                    .trim(),
                i = await new Promise((e) => chrome.storage.sync.get(null, e)),
                s = i?.user?.token;
            if (!s)
                return void console.error("Missing user token, skipping job");
            if (!r || r.length < 10) return;
            await checkResumeScore({
                jobDescription: r,
                token: s,
                showToast: showToast,
                showResumeScoreUI: (e) => {
                    "function" == typeof showResumeScoreUI
                        ? showResumeScoreUI(e)
                        : console.error("showResumeScoreUI function not found");
                },
                onSuccess: async (e) => {
                    try {
                        let t = e?.data || e?.responseData?.data || {};
                        if (
                            !(
                                t &&
                                (void 0 !== t.overallScore ||
                                    (t.skills &&
                                        (t.skills.matched?.length > 0 ||
                                            t.skills.missing?.length > 0)))
                            )
                        )
                            return;
                        const o = {
                            score: t.overallScore || 0,
                            skills: {
                                matched: t.skills?.matched || [],
                                missing: t.skills?.missing || [],
                            },
                            recommendations: Array.isArray(t.recommendations)
                                ? t.recommendations
                                : [],
                            lastUpdated: new Date().toISOString(),
                            rawData: t,
                        };
                        try {
                            await new Promise((e, t) => {
                                chrome.storage.local.set(
                                    { resumeScore: o },
                                    () => {
                                        if (chrome.runtime.lastError)
                                            return (
                                                console.error(
                                                    "[RESUME_SCORE] Storage set error:",
                                                    chrome.runtime.lastError
                                                ),
                                                void t(chrome.runtime.lastError)
                                            );
                                        e();
                                    }
                                );
                            });
                        } catch (e) {}
                    } catch (e) {
                        console.error(
                            "[ERROR] Failed to store resume score:",
                            e
                        );
                    }
                },
                onError: (e) => {
                    console.error("Error in resume score check:", e);
                },
            });
            o[1].click(), await runApplyModel();
        }
    } else await saveLinkedinJobs(JOB_CATEGORY.MANUAL_APPLY, !1);
}
function setupDiscardButtonObserver() {
    const e = (e) =>
            !(!e || e.disabled) &&
            (setTimeout(() => {
                try {
                    e && !e.disabled && e.click();
                } catch (e) {
                    console.error("Error clicking discard button:", e);
                }
            }, 3e3),
            !0),
        t = new MutationObserver((t) => {
            for (const o of t)
                if (o.addedNodes.length > 0)
                    for (const t of o.addedNodes)
                        if (t.nodeType === Node.ELEMENT_NODE) {
                            if (
                                t.matches &&
                                t.matches(
                                    LINKEDIN_SELECTORS.DISCARD_BUTTON_SELECTORS
                                ) &&
                                e(t)
                            )
                                return;
                            const o = t.querySelector(
                                LINKEDIN_SELECTORS.DISCARD_BUTTON_SELECTORS
                            );
                            if (e(o)) return;
                        }
        });
    t.observe(document.body, { childList: !0, subtree: !0 });
    const o = document.querySelector(
        LINKEDIN_SELECTORS.DISCARD_BUTTON_SELECTORS
    );
    e(o),
        cleanupHandlers.push(() => {
            t.disconnect();
        });
}
async function goToNextPage() {
    let e = null;
    if (
        (LINKEDIN_SELECTORS.PAGINATION_NEXT &&
            (e = document.querySelector(LINKEDIN_SELECTORS.PAGINATION_NEXT)),
        !e)
    ) {
        e = Array.from(
            document.querySelectorAll(LINKEDIN_SELECTORS.BUTTON_SELECTOR)
        ).find(
            (e) =>
                "next" === e.textContent.trim().toLowerCase() ||
                "next" === e.innerText.trim().toLowerCase() ||
                e.getAttribute("aria-label")?.toLowerCase().includes("next")
        );
    }
    if (!e) {
        e = Array.from(
            document.querySelectorAll(
                LINKEDIN_SELECTORS.PAGINATION_LINK_SELECTORS.join(",")
            )
        ).find(
            (e) =>
                e.getAttribute("aria-label")?.toLowerCase().includes("next") ||
                e.innerHTML.includes("→") ||
                e.innerHTML.includes("&rarr;") ||
                e.innerHTML.includes(">")
        );
    }
    if (!e)
        try {
            const t = document.querySelector(
                LINKEDIN_SELECTORS.ACTIVE_PAGE_SELECTORS.join(",")
            );
            if (t) {
                const o = parseInt(t.textContent.trim()) + 1,
                    n = Array.from(
                        document.querySelectorAll("button, a")
                    ).filter((e) => {
                        const t = e.textContent.trim();
                        return /^\d+$/.test(t) && parseInt(t) === o;
                    });
                n.length > 0 && (e = n[0]);
            }
        } catch (e) {
            console.error("Error in pagination strategy 4:", e);
        }
    return (
        !(
            !e ||
            e.disabled ||
            "none" === e.style.display ||
            "true" === e.getAttribute("aria-disabled")
        ) && (e.click(), await new Promise((e) => setTimeout(e, 4e3)), !0)
    );
}
function toggleBlinkingBorder(e) {
    let t = 0;
    const o = setInterval(() => {
        (e.style.border = t % 2 == 0 ? "2px solid red" : "none"),
            t++,
            10 === t && (clearInterval(o), (e.style.border = "none"));
    }, 500);
}
async function checkLimitReached() {
    return new Promise((e) => {
        const t = document.querySelector(LINKEDIN_SELECTORS.FEEDBACK_MESSAGE);
        if (t) {
            const o = "You've exceeded the daily application limit";
            e(t.textContent.includes(o));
        } else e(!1);
    });
}
async function jobPanelScroll() {
    const e = document.querySelector(LINKEDIN_SELECTORS.JOBS_PANEL);
    e &&
        ((e.scrollTop = e.scrollHeight),
        await addShortDelay(),
        (e.scrollTop = 0));
}
async function runScript(e) {
    await uncheckFollowCompanyCheckbox();
    if (!(await tokenValidator(e, PLATFORM.LINKEDIN)))
        return void setTimeout(() => {
            window.location.href =
                PUBLIC_FRONTEND_URL + "pricing-plans?showPopup=true";
        }, 800);
    await fetchNegativeKeywords();
    if (!(await checkAndPromptFields()))
        return void window.open(
            PUBLIC_FRONTEND_URL + "manage-job-profile",
            "_blank"
        );
    if (await checkLimitReached()) {
        return void toggleBlinkingBorder(
            document.querySelector(LINKEDIN_SELECTORS.FEEDBACK_MESSAGE)
        );
    }
    let t = await new Promise((e) => {
            chrome.storage.local.get(null, function (t) {
                e(t?.runningScript?.linkedin);
            });
        }),
        o = 0;
    let n = !1;
    for (; t && !n; ) {
        await jobPanelScroll(), await addShortDelay();
        const e = Array.from(
            document.querySelectorAll(LINKEDIN_SELECTORS.JOB_LIST_ITEMS)
        ).filter(
            (e) =>
                !(
                    e.classList.contains("hidden-job") ||
                    "none" === e.style.display ||
                    null === e.offsetParent
                )
        );
        if (0 === e.length) {
            if ((o++, o >= 2)) {
                showToast("No more jobs found. Refreshing page...", "info"),
                    (t = !1),
                    (n = !0);
                const e = Date.now();
                chrome.storage.local.get(["lastPageRefresh"], (t) => {
                    try {
                        const o = t.lastPageRefresh;
                        (!o || e - parseInt(o) > 3e5) &&
                            chrome.storage.local.set(
                                { lastPageRefresh: e.toString() },
                                () => {
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 2e3);
                                }
                            );
                    } catch (e) {
                        console.error("Error handling page refresh:", e);
                    }
                });
                break;
            }
        } else {
            o = 0;
            let n = 0;
            for (const o of e) {
                if (!t) break;
                await clickJob(o), n++;
            }
            0 === n && showToast("No jobs were applied on this page", "info");
        }
        if (!n) {
            if (!(await goToNextPage())) {
                showToast("No more pages available. Refreshing...", "info"),
                    (t = !1),
                    (n = !0);
                const e = Date.now();
                chrome.storage.local.get(["lastPageRefresh"], (t) => {
                    try {
                        const o = t.lastPageRefresh;
                        (!o || e - parseInt(o) > 3e5) &&
                            chrome.storage.local.set(
                                { lastPageRefresh: e.toString() },
                                () => {
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 2e3);
                                }
                            );
                    } catch (e) {
                        console.error("Error handling page refresh:", e);
                    }
                });
                break;
            }
        }
        try {
            if (isExtensionContextValid()) {
                const e = await safeStorageGet(["runningScript"]);
                t = e?.runningScript?.linkedin;
            } else t = !1;
        } catch (e) {
            console.error("Error checking running script state:", e), (t = !1);
        }
        await addShortDelay();
    }
}
async function uncheckFollowCompanyCheckbox() {
    new MutationObserver(() => {
        const e = document.getElementById("follow-company-checkbox");
        e && e.checked && e.click();
    }).observe(document.body, { childList: !0, subtree: !0 });
}
const MESSAGE_HANDLERS = {
    hideAppliedJobs: async ({ hide: e }) => (
        await toggleAppliedJobs(e), { success: !0 }
    ),
};
function initializeScript() {
    initHideJobs();
}
chrome.runtime.onMessage.addListener((e, t, o) => {
    if (!isExtensionContextValid()) return !1;
    return (
        (async () => {
            try {
                const t = MESSAGE_HANDLERS[e.action];
                return t
                    ? await t(e)
                    : { success: !1, error: "Unknown action" };
            } catch (e) {
                return (
                    console.error("Message handler error:", e),
                    {
                        success: !1,
                        error: e.message,
                        ...("development" === process.env.NODE_ENV && {
                            stack: e.stack,
                        }),
                    }
                );
            }
        })().then(o),
        !0
    );
}),
    "loading" === document.readyState
        ? document.addEventListener("DOMContentLoaded", initializeScript)
        : initializeScript();
