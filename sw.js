// sw.js — Service Worker for Brilliant Jobs Web Push Notifications
// Phase 69 Session 4 (Card 7)
// Handles push events from the Web Push API and displays native notifications.

const DASHBOARD_URL = '/dashboard.html';
const ICON_URL = '/img/icon-192.png';
const BADGE_URL = '/img/badge-72.png';

// ── Push event handler ─────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    // Fallback for plain text push
    payload = {
      title: 'Brilliant Jobs',
      body: event.data.text(),
      url: DASHBOARD_URL
    };
  }

  const title = payload.title || 'Brilliant Jobs';
  const options = {
    body: payload.body || '',
    icon: payload.icon || ICON_URL,
    badge: payload.badge || BADGE_URL,
    tag: payload.tag || 'bj-' + Date.now(),
    data: {
      url: payload.url || payload.action_url || DASHBOARD_URL,
      notification_type: payload.notification_type || null,
      job_id: payload.job_id || null
    },
    actions: payload.actions || [],
    requireInteraction: payload.require_interaction || false,
    silent: payload.silent || false,
    vibrate: [100, 50, 100]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click handler ─────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = DASHBOARD_URL;
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }

  // Handle action buttons (e.g., Apply / Pass)
  if (event.action === 'apply' && event.notification.data.job_id) {
    url = DASHBOARD_URL + '#apply-' + event.notification.data.job_id;
  } else if (event.action === 'pass') {
    url = DASHBOARD_URL + '#pass-' + event.notification.data.job_id;
  } else if (event.action === 'view') {
    url = event.notification.data.url || DASHBOARD_URL;
  }

  // Focus existing tab or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf('brilliantjobs.app') !== -1 && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Notification close handler (for analytics) ─────────────
self.addEventListener('notificationclose', function(event) {
  // Could send analytics beacon here in future
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

// ── Install + activate ─────────────────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Push service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Push service worker activated');
  event.waitUntil(clients.claim());
});
