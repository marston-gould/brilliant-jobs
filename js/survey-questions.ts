// @ts-nocheck
// js/survey-questions.js — Shared question bank module
// SDV-S2: Extracted from survey.html and micro-surveys.js
// Single source of truth for all survey content.
// Hook: new survey types register here once and are available everywhere.
//
// Used by:
//   - survey.html (full-page surveys)
//   - micro-surveys.js (inline micro-surveys)
//   - notification-center.js (My Surveys tab — question text resolution)

(function() {
  'use strict';

  // ─── EXIT / CHURN QUESTIONS ─────────────────────────────────────────────────
  var churnQuestions = [
    { id: 'outcome', q: "First things first — did you land a job?", sub: "No judgment either way. We're just rooting for you.", type: 'choice', opts: ["Yes! I'm employed now 🎉", "No — still searching", "I'm taking a break from searching", "I'm switching to a different approach"] },
    { id: 'overall_rating', q: "How would you rate your overall Brilliant Jobs experience?", sub: "1 = I want those hours of my life back. 5 = Actually pretty great.", type: 'rating' },
    { id: 'biggest_disappointment', q: "What was the biggest letdown?", sub: "Pick the one that hurt the most.", type: 'choice', opts: ["Search results weren't relevant enough", "Too complicated to set up or figure out", "Not enough jobs in my field or location", "Features I wanted were behind a paywall", "It was buggy or things didn't work right", "I just didn't use it enough to justify it", "Honestly? Nothing major — just not for me"] },
    { id: 'missing_feature', q: "Was there something you wished Brilliant Jobs could do but couldn't?", sub: "This is the kind of feedback that actually changes what we build next.", type: 'text', placeholder: "Auto-apply, better filtering, more job sources, resume help…" },
    { id: 'compared_to', q: "What are you using instead? (or planning to)", sub: "No ego here — we genuinely want to know what's working for people.", type: 'choice', opts: ["LinkedIn — it's the devil I know", "Indeed / Glassdoor / ZipRecruiter", "Going direct to company career pages", "Recruiters and staffing agencies", "Networking and referrals only", "Nothing — I'm tapping out for a while", "Something else"] },
    { id: 'price_sensitivity', q: "Real talk: was cost a factor?", sub: "We're trying to figure out if the pricing is wrong or if the value isn't there yet.", type: 'choice', opts: ["Free tier was enough — I never needed paid", "I'd pay, but not at the current price", "I'd pay if there were more features", "Job searching shouldn't cost money, period", "I was paying and it was fine — cost wasn't the issue"] },
    { id: 'come_back', q: "Under what circumstances would you come back?", sub: "Pick all that apply (in your head). Or just pick the biggest one.", type: 'choice', opts: ["If it had more jobs in my field", "If the interface were simpler", "If it were cheaper or free", "If you fixed the bugs I ran into", "If I start searching again", "Never — I've moved on", "I'd come back right now if you gave me a reason"], triggerSave: true },
    { id: 'parting_shot', q: "Any parting words?", sub: "Compliments, complaints, profanity — we read every single one.", type: 'text', placeholder: "Don't hold back.", optional: true }
  ];

  // ─── PERIODIC QUESTIONS V1 ──────────────────────────────────────────────────
  var periodicQuestions = [
    { id: 'search_quality', q: "How relevant are the jobs showing up in your feed?", sub: "Be brutal. We'd rather know now than lose you later.", type: 'rating' },
    { id: 'ease_of_use', q: "How easy is Brilliant Jobs to use?", sub: "1 = I need a PhD in filter management. 5 = My grandma could do it.", type: 'rating' },
    { id: 'most_valuable', q: "What's the most valuable thing about Brilliant Jobs for you?", sub: "This tells us what to protect and double down on.", type: 'choice', opts: ["Finding jobs I wouldn't see on LinkedIn or Indeed", "The filtering — I can actually narrow things down", "Seeing which companies are actually hiring vs posting ghost jobs", "Knowing I have connections at companies with openings", "Salary data and transparency", "Honestly, I haven't found the killer feature yet"] },
    { id: 'biggest_frustration', q: "What's your biggest frustration right now?", sub: "Pick the one that makes you mutter under your breath.", type: 'choice', opts: ["Not enough jobs matching my criteria", "Too many irrelevant results slipping through", "The interface is confusing or cluttered", "Features I want are locked behind a paywall", "Things are buggy or slow", "I don't really have complaints (seriously)"] },
    { id: 'missing_feature', q: "What's the ONE feature you wish existed?", sub: "The thing that would make you say 'okay NOW this tool is worth it.'", type: 'text', placeholder: "Auto-apply, interview prep, resume scoring, better mobile…" },
    { id: 'recommend', q: "Would you recommend Brilliant Jobs to a friend who's job searching?", sub: "The classic question. We promise not to cry if you say no.", type: 'choice', opts: ["Absolutely — already have", "Probably, with some caveats", "Maybe once it has more features", "Not yet — it's not ready", "No — it's not for me"] },
    { id: 'compared_to_others', q: "How does Brilliant Jobs compare to whatever else you're using?", sub: "LinkedIn, Indeed, going direct — how do we stack up?", type: 'choice', opts: ["Better — this is my primary tool now", "About the same — I use it alongside other things", "Worse for finding jobs, better for filtering/data", "Worse overall — but it has potential", "This is the only thing I'm using"] },
    { id: 'open_feedback', q: "Anything else on your mind?", sub: "Feature ideas, rants, compliments, memes — all welcome.", type: 'text', placeholder: "We read every single one of these.", optional: true }
  ];

  // ─── PERIODIC QUESTIONS V2 (extends V1) ─────────────────────────────────────
  var periodicQuestionsV2 = periodicQuestions.concat([
    { id: 'job_anxiety', q: "How anxious are you about your job search right now?", sub: "No wrong answer — we ask so we can calibrate how urgently features matter to you.", type: 'scale', min: 1, max: 5, minLabel: 'Calm & patient', maxLabel: 'Very anxious' },
    { id: 'expected_timeline', q: "When do you realistically expect to land your next role?", sub: "This helps us prioritize features for people at your stage.", type: 'dropdown', opts: ["Less than 1 month", "1 – 3 months", "3 – 6 months", "6 – 12 months", "12+ months or not actively searching"] },
    { id: 'appreciation_score', q: "How much do you appreciate having Brilliant Jobs in your corner?", sub: "High ratings with a comment may be featured on our site (anonymously).", type: 'rating' },
    { id: 'appreciation_comment', q: "Want to say more about that?", sub: "If you rated 4-5 stars, your words might end up on our landing page.", type: 'text', placeholder: "What makes Brilliant Jobs different for you…", optional: true },
    { id: 'comparative_ease', q: "How does Brilliant Jobs compare to other job search tools you've used?", sub: "Think LinkedIn, Indeed, Glassdoor, going direct — the whole landscape.", type: 'choice', opts: ["Much better — noticeably easier and more effective", "Somewhat better — an improvement in some areas", "About the same — different but not clearly better", "Worse in most ways"] },
    { id: 'perceived_control', q: "How much control do you feel over your search results?", sub: "Can you actually find what you're looking for, or does it feel random?", type: 'scale', min: 1, max: 5, minLabel: 'No control', maxLabel: 'Total control' },
    { id: 'filter_adequacy', q: "Do our filters capture what you actually need?", sub: "Tell us if something's missing from the filter options.", type: 'choice', opts: ["Yes — I can find exactly what I want", "Mostly — but I wish I could filter by one or two more things", "Not really — key filters are missing"] },
    { id: 'missing_filters', q: "What filter or search option is missing?", sub: "This directly feeds our filter roadmap.", type: 'text', placeholder: "e.g., visa sponsorship, company size, interview process length…", optional: true }
  ]);

  // ─── GHOST QUESTIONS ────────────────────────────────────────────────────────
  var ghostQuestions = [
    { id: 'search_status', q: "What's your current job search status?", sub: "This helps us segment the data. No judgment.", type: 'choice', opts: ["Actively searching", "Casually browsing", "Recently landed a job", "Taking a break", "Employed but always looking"] },
    { id: 'apps_last_90', q: "Roughly how many jobs have you applied to in the last 90 days?", sub: "Best guess is fine.", type: 'choice', opts: ["0", "1–10", "11–25", "26–50", "51–100", "100+"] },
    { id: 'ghost_rate', q: "Of those applications, how many never got ANY response?", sub: "No auto-rejection email, no acknowledgment, nothing.", type: 'choice', opts: ["None — I heard back from all", "A few (under 25%)", "About half", "Most of them (50–75%)", "Almost all (75%+)", "Literally all of them"] },
    { id: 'longest_ghost', q: "What's the longest you've waited with zero response?", sub: "From application to right now — still nothing.", type: 'choice', opts: ["Less than 2 weeks", "2–4 weeks", "1–2 months", "3–6 months", "6+ months", "I'm still waiting on one from last year"] },
    { id: 'ghost_type', q: "Which of these have you experienced?", sub: "Select all that apply. We're building the ghosting spectrum.", type: 'multiselect', opts: ["Applied and never heard anything", "Recruiter screen then silence", "Multiple interviews then ghosted", "Verbal offer then ghosted", "Job disappeared while I was interviewing", "Auto-rejection months later"] },
    { id: 'emotional_impact', q: "How has ghosting affected your job search?", sub: "Select all that apply. This data gets published.", type: 'multiselect', opts: ["I apply to more jobs to compensate", "I've lost motivation", "I question if I'm qualified", "I avoid certain companies now", "I've gotten used to it", "It makes me angry", "It hasn't really affected me"] },
    { id: 'worst_offenders', q: "Which types of companies ghost the most, in your experience?", sub: "Your experience is the data point.", type: 'choice', opts: ["Large enterprises (1000+)", "Mid-size (100–1000)", "Startups (under 100)", "Recruiting agencies", "All equally bad"] },
    { id: 'accountability', q: "What should companies be required to do?", sub: "Select all you agree with. This feeds our accountability index.", type: 'multiselect', opts: ["Respond to every applicant within 2 weeks", "Disclose if a listing is already filled", "Show how many people have applied", "Publish their average response time", "Remove listings when filled", "Nothing — it's their prerogative"] },
    { id: 'ghost_score_value', q: "Would a 'ghost score' rating for companies be useful?", sub: "Like a Yelp rating, but for hiring responsiveness.", type: 'choice', opts: ["Absolutely — I'd use it every time", "Somewhat useful", "Not really", "Companies would game it"] },
    { id: 'final_word', q: "One thing you'd say to companies that ghost applicants?", sub: "They'll read this. Make it count.", type: 'text', optional: true, placeholder: "Don't hold back." }
  ];

  // ─── NPS QUESTIONS ──────────────────────────────────────────────────────────
  var npsQuestions = [
    { id: 'nps_score', q: "How likely are you to recommend Brilliant Jobs to a friend or colleague?", sub: "The classic Net Promoter Score question. 0 = not at all, 10 = extremely likely.", type: 'nps' },
    { id: 'nps_reason', q: "What's the main reason for your score?", sub: "Pick the one that matters most.", type: 'choice', opts: ["Great job results — actually finding relevant opportunities", "Saves me time vs. other tools", "Transparency — ghost job detection, salary data", "Easy to use and set up", "Not enough jobs in my field or location", "Missing features I need", "Too expensive for what it offers", "Buggy or slow experience", "I just haven't used it enough to judge"] },
    { id: 'nps_improve', q: "If you could change ONE thing about Brilliant Jobs, what would it be?", sub: "This is the single most valuable piece of feedback you can give us.", type: 'text', placeholder: "The one thing that would make you give us a 10…" }
  ];

  // ─── MICRO-SURVEY QUESTIONS ─────────────────────────────────────────────────
  // Used by micro-surveys.js for inline surveys on the dashboard.
  var microSurveyQuestions = {
    micro_paywall_v1: {
      question: 'Would you pay to unlock this feature?',
      type: 'choice',
      options: ['Definitely', 'Maybe', 'No'],
      followUp: { question: "What's holding you back?", type: 'chips', options: ['Too expensive', 'Not enough value yet', 'Just browsing', 'Already paying elsewhere'] }
    },
    micro_search_v1: {
      question: 'How relevant were these results?',
      type: 'rating',
      minLabel: 'Not at all',
      maxLabel: 'Very relevant',
      followUp: { question: 'What was missing?', type: 'chips', options: ['More salary data', 'Wrong seniority level', 'Too many ghost jobs', 'Not my industry', 'Other'] }
    },
    micro_apply_v1: {
      question: 'How confident are you this job is real?',
      type: 'rating',
      minLabel: 'Likely ghost',
      maxLabel: 'Definitely real',
      followUp: { question: 'Was the application process clear?', type: 'chips', options: ['Yes, very clear', 'Somewhat', 'No, confusing'] }
    },
    micro_data_v1: {
      question: 'Did this data help your decision?',
      type: 'choice',
      options: ['Yes, very helpful', 'Somewhat', 'Not really']
    }
  };

  // ─── VERSION MAPS ───────────────────────────────────────────────────────────
  var exitVersions = {
    'exit_v1': churnQuestions
  };

  var periodicVersions = {
    'periodic_v1': periodicQuestions,
    'periodic_v2': periodicQuestionsV2
  };

  var npsVersions = {
    'nps_v1': npsQuestions
  };

  var ghostVersions = {
    'ghost_v1': ghostQuestions
  };

  // ─── QUESTION LOOKUP ────────────────────────────────────────────────────────
  // Resolves a question ID to its text for My Surveys response history rendering.
  // Searches all question banks for the given ID.
  function getQuestionText(questionId) {
    var allBanks = [churnQuestions, periodicQuestions, periodicQuestionsV2, ghostQuestions, npsQuestions];
    for (var b = 0; b < allBanks.length; b++) {
      for (var q = 0; q < allBanks[b].length; q++) {
        if (allBanks[b][q].id === questionId) return allBanks[b][q].q;
      }
    }
    // Check micro-survey questions
    var microKeys = Object.keys(microSurveyQuestions);
    for (var m = 0; m < microKeys.length; m++) {
      if (microKeys[m] === questionId) return microSurveyQuestions[microKeys[m]].question;
    }
    return questionId; // fallback: return the raw ID
  }

  // ─── EXPORT ─────────────────────────────────────────────────────────────────
  window.BJ_SURVEY_QUESTIONS = {
    churnQuestions: churnQuestions,
    periodicQuestions: periodicQuestions,
    periodicQuestionsV2: periodicQuestionsV2,
    ghostQuestions: ghostQuestions,
    npsQuestions: npsQuestions,
    microSurveyQuestions: microSurveyQuestions,
    exitVersions: exitVersions,
    periodicVersions: periodicVersions,
    npsVersions: npsVersions,
    ghostVersions: ghostVersions,
    getQuestionText: getQuestionText
  };
})();
