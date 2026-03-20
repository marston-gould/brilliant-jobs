// ============================================================
// carousel.js — Benefit Carousel (LP-02, LP-03, LP-04, LP-05)
// Version: v11.52
// Selects 5 random cards from 25 benefit cards + fixed see-all
// PostHog: benefit_card_viewed, benefit_card_clicked, benefit_seeall_clicked
// ============================================================
(function () {
  'use strict';

  // Card pool — all 25 benefit cards (spec Section 2.3)
  var CARDS = [
    { id: '01', file: '01-ghost-detection.webp',   href: '/benefits#ghost',   alt: 'Ghost jobs detected before you waste time' },
    { id: '02', file: '02-exclusion-filters.webp', href: '/benefits#filters', alt: 'Block companies, industries, and title keywords' },
    { id: '03', file: '03-real-salary.webp',        href: '/benefits#market',  alt: 'Salary data extracted from actual postings' },
    { id: '04', file: '04-direct-source.webp',      href: '/benefits#ghost',   alt: 'Jobs sourced directly from employer hiring systems' },
    { id: '05', file: '05-dead-removal.webp',       href: '/benefits#ghost',   alt: 'Dead jobs removed automatically' },
    { id: '06', file: '06-staffing-flag.webp',      href: '/benefits#filters', alt: 'Staffing agencies flagged so you know who is really hiring' },
    { id: '07', file: '07-multi-ats.webp',          href: '/benefits#apply',   alt: 'Auto-apply across multiple employer and application systems' },
    { id: '08', file: '08-resume-tailoring.webp',   href: '/benefits#apply',   alt: 'One-click resume tailoring for every job' },
    { id: '09', file: '09-resume-score.webp',       href: '/benefits#apply',   alt: 'AI resume score for every job you view' },
    { id: '10', file: '10-fraud-detection.webp',    href: '/benefits#ghost',   alt: 'Fraud and scam job detection' },
    { id: '11', file: '11-content-search.webp',     href: '/benefits#filters', alt: 'Search inside job descriptions, not just titles' },
    { id: '12', file: '12-cover-letter.webp',       href: '/benefits#apply',   alt: 'AI cover letter matched to each role' },
    { id: '13', file: '13-interview-practice.webp', href: '/benefits#apply',   alt: 'AI interview practice for your specific job' },
    { id: '14', file: '14-network-intel.webp',      href: '/benefits#market',  alt: 'See who in your network works at every company' },
    { id: '15', file: '15-pipeline.webp',           href: '/benefits#market',  alt: 'Pipeline with staleness alerts' },
    { id: '16', file: '16-hiring-velocity.webp',    href: '/benefits#market',  alt: 'See which companies are actually hiring vs. just posting' },
    { id: '17', file: '17-not-filters.webp',        href: '/benefits#filters', alt: 'NOT filters for title, location, and company' },
    { id: '18', file: '18-sms-alerts.webp',         href: '/benefits#market',  alt: 'SMS + email + push notifications' },
    { id: '19', file: '19-market-data.webp',        href: '/benefits#market',  alt: 'Hiring trends by industry, location, and level' },
    { id: '20', file: '20-level-badges.webp',       href: '/benefits#filters', alt: 'Every job classified by seniority level' },
    { id: '21', file: '21-score-gate.webp',         href: '/benefits#apply',   alt: 'Score gate pauses low-match applications' },
    { id: '22', file: '22-company-data.webp',       href: '/benefits#market',  alt: '7M+ company dataset with size, industry, and HQ' },
    { id: '23', file: '23-resume-readiness.webp',   href: '/benefits#apply',   alt: 'Resume readiness scoring per saved filter' },
    { id: '24', file: '24-linkedin-optimizer.webp', href: '/benefits#apply',   alt: 'AI LinkedIn profile optimizer' },
    { id: '25', file: '25-referral-loop.webp',      href: '/benefits',         alt: 'Refer a friend, both get a free week' },
  ];

  // Fixed 6th card — see all
  var SEE_ALL = {
    id: 'see-all',
    file: '26-see-all-benefits.webp',
    href: '/benefits',
    alt: '136 features. 103 you won\'t find anywhere else. See all benefits.',
    seeAll: true,
  };

  // Fisher-Yates shuffle, pick 5
  function pickFive(pool) {
    var arr = pool.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, 5);
  }

  function init() {
    var track   = document.getElementById('carousel-track');
    var dotsEl  = document.getElementById('carousel-dots');
    var prevBtn = document.getElementById('carousel-prev');
    var nextBtn = document.getElementById('carousel-next');
    if (!track) return;

    var selected = pickFive(CARDS);
    var allCards = selected.concat([SEE_ALL]); // 5 + see-all = 6
    var totalDots = allCards.length; // 6

    // Fire benefit_card_viewed for each of the 5 cards shown
    var shownIds = selected.map(function(c) { return c.id; });
    if (window.posthog) {
      selected.forEach(function(card, i) {
        posthog.capture('benefit_card_viewed', {
          card_id: card.id,
          position: i + 1,
          cards_shown: shownIds,
        });
      });
    }

    // Build cards
    allCards.forEach(function(card, i) {
      var li = document.createElement('li');
      li.className = 'carousel-card' + (card.seeAll ? ' carousel-card--seeall' : '');
      li.setAttribute('role', 'listitem');
      li.setAttribute('data-index', i);

      var a = document.createElement('a');
      a.href = card.href;
      a.setAttribute('aria-label', card.alt);
      a.addEventListener('click', function() {
        if (card.seeAll) {
          if (window.posthog) posthog.capture('benefit_seeall_clicked');
        } else {
          if (window.posthog) posthog.capture('benefit_card_clicked', {
            card_id: card.id,
            position: i + 1,
            destination: card.href,
          });
        }
      });

      var img = document.createElement('img');
      img.src = '/benefit-cards/' + card.file;
      img.alt = card.alt;
      img.width = 620;
      img.height = 320;
      img.loading = i < 3 ? 'eager' : 'lazy';
      img.decoding = 'async';

      a.appendChild(img);
      li.appendChild(a);
      track.appendChild(li);
    });

    // Build dots
    for (var d = 0; d < totalDots; d++) {
      var dot = document.createElement('button');
      dot.className = 'carousel-dot' + (d === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Card ' + (d + 1));
      dot.setAttribute('data-dot', d);
      dot.addEventListener('click', (function(idx) {
        return function() { scrollToCard(idx); };
      })(d));
      dotsEl.appendChild(dot);
    }

    // Scroll helpers
    function getCardWidth() {
      var first = track.querySelector('.carousel-card');
      return first ? first.offsetWidth + 16 : 340; // 16 = gap
    }

    function scrollToCard(idx) {
      track.scrollTo({ left: idx * getCardWidth(), behavior: 'smooth' });
    }

    // Update active dot on scroll
    var scrollTimer;
    track.addEventListener('scroll', function() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        var idx = Math.round(track.scrollLeft / getCardWidth());
        document.querySelectorAll('.carousel-dot').forEach(function(dot, i) {
          dot.classList.toggle('active', i === idx);
        });
      }, 60);
    });

    // Arrow buttons
    if (prevBtn) prevBtn.addEventListener('click', function() {
      var idx = Math.round(track.scrollLeft / getCardWidth());
      scrollToCard(Math.max(0, idx - 1));
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
      var idx = Math.round(track.scrollLeft / getCardWidth());
      scrollToCard(Math.min(totalDots - 1, idx + 1));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
