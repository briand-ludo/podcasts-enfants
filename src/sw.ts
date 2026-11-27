/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { createPartialResponse } from 'workbox-range-requests'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Catalogue : réseau d'abord, dernière version connue si hors-ligne.
registerRoute(
  ({ url }) => url.origin === self.location.origin && /\/(episodes|suggestions)\.json$/.test(url.pathname),
  new NetworkFirst({ cacheName: 'catalogue', networkTimeoutSeconds: 4 }),
)

// Vignettes.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'vignettes',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true }),
    ],
  }),
)

// Épisodes téléchargés (« Pour la route ») : l'app les lit via une adresse locale
// …/audio-hors-ligne/<id>. Safari lit l'audio par morceaux (en-tête Range) :
// on découpe la réponse en cache à la demande.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/audio-hors-ligne/'),
  async ({ request }) => {
    const cache = await caches.open('audio-hors-ligne')
    const enCache = await cache.match(request.url)
    if (!enCache) return new Response('Épisode non téléchargé', { status: 404 })
    if (request.headers.has('range')) return createPartialResponse(request, enCache)
    return enCache
  },
)
