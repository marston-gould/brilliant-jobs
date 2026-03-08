// content.ts — LinkedIn profile data extraction
// Only runs on the user's own profile page (linkedin.com/in/*)
// User must explicitly click the capture button — no auto-scraping

(function() {
  'use strict';

  // Only show the capture button if we're on a profile page
  if (!window.location.pathname.startsWith('/in/')) return;

  // Don't inject twice
  if (document.getElementById('bj-li-capture-btn')) return;

  // Create floating capture button
  const btn = document.createElement('button');
  btn.id = 'bj-li-capture-btn';
  btn.innerHTML = '✨ Sync to Brilliant Jobs';
  btn.title = 'Capture your LinkedIn profile for resume alignment checking';
  document.body.appendChild(btn);

  btn.addEventListener('click', async () => {
    btn.textContent = 'Capturing…';
    btn.disabled = true;

    try {
      const profile = extractProfile();

      if (!profile || !profile.name) {
        btn.textContent = '❌ Could not read profile';
        setTimeout(() => resetBtn(), 3000);
        return;
      }

      // Send to Brilliant Jobs via chrome.storage
      await chrome.storage.local.set({
        bj_linkedin_profile: {
          ...profile,
          captured_at: new Date().toISOString(),
          profile_url: window.location.href
        }
      });

      btn.textContent = '✅ Synced!';
      btn.style.background = '#22c55e';
      setTimeout(() => resetBtn(), 3000);

    } catch (e) {
      console.error('[BJ Extension] Capture error:', e);
      btn.textContent = '❌ Error';
      setTimeout(() => resetBtn(), 3000);
    }
  });

  function resetBtn() {
    btn.textContent = '✨ Sync to Brilliant Jobs';
    btn.disabled = false;
    btn.style.background = '';
  }

  function extractProfile() {
    const profile = {
      name: '',
      headline: '',
      location: '',
      current_title: '',
      current_company: '',
      experience: [],
      education: [],
      skills: [],
      about: ''
    };

    // Name
    const nameEl = document.querySelector('h1.text-heading-xlarge') ||
                   document.querySelector('.pv-text-details__left-panel h1') ||
                   document.querySelector('[data-anonymize="person-name"]');
    if (nameEl) profile.name = nameEl.textContent.trim();

    // Headline
    const headlineEl = document.querySelector('.text-body-medium.break-words') ||
                       document.querySelector('[data-anonymize="headline"]');
    if (headlineEl) profile.headline = headlineEl.textContent.trim();

    // Location
    const locEl = document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
                  document.querySelector('[data-anonymize="location"]');
    if (locEl) profile.location = locEl.textContent.trim();

    // Experience section
    const expSection = document.getElementById('experience') ||
                       document.querySelector('section[id="experience"]');
    if (expSection) {
      const expContainer = expSection.closest('section') || expSection.parentElement;
      const expItems = expContainer ? expContainer.querySelectorAll('li.artdeco-list__item') : [];

      expItems.forEach(item => {
        const titleEl = item.querySelector('.t-bold span[aria-hidden="true"]') ||
                        item.querySelector('.mr1.t-bold span');
        const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                          item.querySelector('.t-14.t-normal:not(.t-black--light) span');
        const dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]') ||
                       item.querySelector('.pvs-entity__caption-wrapper');
        const locEl = item.querySelector('.t-14.t-normal.t-black--light');

        if (titleEl) {
          const entry = {
            title: titleEl.textContent.trim(),
            company: companyEl ? companyEl.textContent.trim().replace(/^·\s*/, '') : '',
            dates: dateEl ? dateEl.textContent.trim() : '',
            location: ''
          };

          // Try to extract dates from the text
          const dateMatch = entry.dates.match(/(\w+ \d{4})\s*[-–]\s*(\w+ \d{4}|Present)/i);
          if (dateMatch) {
            entry.start_date = dateMatch[1];
            entry.end_date = dateMatch[2];
          }

          if (!profile.current_title && (!entry.end_date || entry.end_date === 'Present')) {
            profile.current_title = entry.title;
            profile.current_company = entry.company;
          }

          profile.experience.push(entry);
        }
      });
    }

    // Education section
    const eduSection = document.getElementById('education') ||
                       document.querySelector('section[id="education"]');
    if (eduSection) {
      const eduContainer = eduSection.closest('section') || eduSection.parentElement;
      const eduItems = eduContainer ? eduContainer.querySelectorAll('li.artdeco-list__item') : [];

      eduItems.forEach(item => {
        const schoolEl = item.querySelector('.t-bold span[aria-hidden="true"]');
        const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
        const dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

        if (schoolEl) {
          profile.education.push({
            institution: schoolEl.textContent.trim(),
            degree: degreeEl ? degreeEl.textContent.trim() : '',
            dates: dateEl ? dateEl.textContent.trim() : ''
          });
        }
      });
    }

    // Skills
    const skillSection = document.getElementById('skills') ||
                         document.querySelector('section[id="skills"]');
    if (skillSection) {
      const skillContainer = skillSection.closest('section') || skillSection.parentElement;
      const skillItems = skillContainer ? skillContainer.querySelectorAll('li.artdeco-list__item .t-bold span[aria-hidden="true"]') : [];
      skillItems.forEach(el => {
        const skill = el.textContent.trim();
        if (skill && skill.length < 60) profile.skills.push(skill);
      });
    }

    // About
    const aboutSection = document.getElementById('about') ||
                         document.querySelector('section[id="about"]');
    if (aboutSection) {
      const aboutContainer = aboutSection.closest('section') || aboutSection.parentElement;
      const aboutText = aboutContainer ? aboutContainer.querySelector('.inline-show-more-text span[aria-hidden="true"]') : null;
      if (aboutText) profile.about = aboutText.textContent.trim().slice(0, 2000);
    }

    return profile;
  }
})();
