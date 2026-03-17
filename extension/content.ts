// content.ts — LinkedIn profile data extraction
// EXT-LI-001: Supports two modes:
//   1. Auto-capture: bj_li_auto_capture flag set by background.ts → extract + sendMessage, no UI
//   2. Manual: floating "Sync to Brilliant Jobs" button on profile pages

(function() {
  'use strict';

  // Only run on profile pages
  if (!window.location.pathname.startsWith('/in/')) return;

  // ── extractProfile() — shared by both modes ──
  function extractProfile() {
    var profile = {
      name: '', headline: '', location: '',
      current_title: '', current_company: '',
      experience: [], education: [], skills: [], about: ''
    };

    var nameEl = document.querySelector('h1.text-heading-xlarge') ||
                 document.querySelector('.pv-text-details__left-panel h1') ||
                 document.querySelector('[data-anonymize="person-name"]');
    if (nameEl) profile.name = nameEl.textContent.trim();

    var headlineEl = document.querySelector('.text-body-medium.break-words') ||
                     document.querySelector('[data-anonymize="headline"]');
    if (headlineEl) profile.headline = headlineEl.textContent.trim();

    var locEl = document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
                document.querySelector('[data-anonymize="location"]');
    if (locEl) profile.location = locEl.textContent.trim();

    // Experience
    var expSection = document.getElementById('experience') ||
                     document.querySelector('section[id="experience"]');
    if (expSection) {
      var expContainer = expSection.closest('section') || expSection.parentElement;
      var expItems = expContainer ? expContainer.querySelectorAll('li.artdeco-list__item') : [];
      expItems.forEach(function(item) {
        var titleEl = item.querySelector('.t-bold span[aria-hidden="true"]') ||
                      item.querySelector('.mr1.t-bold span');
        var companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                        item.querySelector('.t-14.t-normal:not(.t-black--light) span');
        var dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]') ||
                     item.querySelector('.pvs-entity__caption-wrapper');
        if (titleEl) {
          var entry = {
            title: titleEl.textContent.trim(),
            company: companyEl ? companyEl.textContent.trim().replace(/^·\s*/, '') : '',
            dates: dateEl ? dateEl.textContent.trim() : '',
            location: '', start_date: '', end_date: ''
          };
          var dateMatch = entry.dates.match(/(\w+ \d{4})\s*[-–]\s*(\w+ \d{4}|Present)/i);
          if (dateMatch) { entry.start_date = dateMatch[1]; entry.end_date = dateMatch[2]; }
          if (!profile.current_title && (!entry.end_date || entry.end_date === 'Present')) {
            profile.current_title = entry.title;
            profile.current_company = entry.company;
          }
          profile.experience.push(entry);
        }
      });
    }

    // Education
    var eduSection = document.getElementById('education') ||
                     document.querySelector('section[id="education"]');
    if (eduSection) {
      var eduContainer = eduSection.closest('section') || eduSection.parentElement;
      var eduItems = eduContainer ? eduContainer.querySelectorAll('li.artdeco-list__item') : [];
      eduItems.forEach(function(item) {
        var schoolEl = item.querySelector('.t-bold span[aria-hidden="true"]');
        var degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
        var dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
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
    var skillSection = document.getElementById('skills') ||
                       document.querySelector('section[id="skills"]');
    if (skillSection) {
      var skillContainer = skillSection.closest('section') || skillSection.parentElement;
      var skillItems = skillContainer ? skillContainer.querySelectorAll('li.artdeco-list__item .t-bold span[aria-hidden="true"]') : [];
      skillItems.forEach(function(el) {
        var skill = el.textContent.trim();
        if (skill && skill.length < 60) profile.skills.push(skill);
      });
    }

    // About
    var aboutSection = document.getElementById('about') ||
                       document.querySelector('section[id="about"]');
    if (aboutSection) {
      var aboutContainer = aboutSection.closest('section') || aboutSection.parentElement;
      var aboutText = aboutContainer ? aboutContainer.querySelector('.inline-show-more-text span[aria-hidden="true"]') : null;
      if (aboutText) profile.about = aboutText.textContent.trim().slice(0, 2000);
    }

    return profile;
  }

  // ── Check for auto-capture mode ──
  chrome.storage.local.get(['bj_li_auto_capture'], function(result) {
    if (result.bj_li_auto_capture) {
      // Auto-capture: wait for DOM, extract, send to background, close
      console.log('[BJ] Auto-capture mode: waiting 3s for DOM...');
      setTimeout(function() {
        try {
          var profile = extractProfile();
          if (profile && profile.name) {
            chrome.runtime.sendMessage({
              type: 'LI_PROFILE_CAPTURED',
              profile: Object.assign({}, profile, {
                captured_at: new Date().toISOString(),
                profile_url: window.location.href
              })
            });
            console.log('[BJ] Auto-capture: sent to background');
          } else {
            chrome.runtime.sendMessage({ type: 'LI_PROFILE_CAPTURE_FAILED', error: 'Empty profile' });
          }
        } catch (e) {
          chrome.runtime.sendMessage({ type: 'LI_PROFILE_CAPTURE_FAILED', error: e.message });
        }
        chrome.storage.local.remove('bj_li_auto_capture');
      }, 3000);
      return; // Don't show manual button
    }

    // ── Manual mode: floating sync button ──
    if (document.getElementById('bj-li-capture-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'bj-li-capture-btn';
    btn.innerHTML = '✨ Sync to Brilliant Jobs';
    btn.title = 'Capture your LinkedIn profile for resume alignment checking';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999',
      padding: '10px 18px', borderRadius: '8px', border: 'none',
      background: '#3d7eff', color: '#fff', fontWeight: '600', fontSize: '13px',
      cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      fontFamily: '-apple-system, sans-serif', transition: 'all 0.15s'
    });
    document.body.appendChild(btn);

    btn.addEventListener('click', async function() {
      btn.textContent = 'Capturing…';
      btn.disabled = true;
      try {
        var profile = extractProfile();
        if (!profile || !profile.name) {
          btn.textContent = '❌ Could not read profile';
          setTimeout(resetBtn, 3000);
          return;
        }
        // Send to background for EF upload
        chrome.runtime.sendMessage({
          type: 'LI_PROFILE_CAPTURED',
          profile: Object.assign({}, profile, {
            captured_at: new Date().toISOString(),
            profile_url: window.location.href
          })
        });
        btn.textContent = '✅ Synced!';
        btn.style.background = '#22c55e';
        setTimeout(resetBtn, 3000);
      } catch (e) {
        console.error('[BJ] Capture error:', e);
        btn.textContent = '❌ Error';
        setTimeout(resetBtn, 3000);
      }
    });

    function resetBtn() {
      btn.textContent = '✨ Sync to Brilliant Jobs';
      btn.disabled = false;
      btn.style.background = '#3d7eff';
    }
  });
})();
