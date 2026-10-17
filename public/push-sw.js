// Push handlers, loaded into the generated service worker via workbox `importScripts`.
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(d.title || 'Meal Planner', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag,
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { if ('navigate' in w) w.navigate(url); return w.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})
