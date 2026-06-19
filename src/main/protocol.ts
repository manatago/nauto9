import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { normalize, sep } from 'path'
import { storageRoot, storagePathFor } from './paths'

export const MEDIA_SCHEME = 'media'

// Must run before app is ready.
export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

// Maps media://<logicalKey> to a file under the storage root, with a guard
// against path traversal escaping the storage directory.
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      // host + pathname together form the logical key; decode each segment.
      const raw = decodeURIComponent(url.host + url.pathname)
      const key = raw.replace(/^\/+/, '')
      const abs = normalize(storagePathFor(key))
      const root = normalize(storageRoot())
      if (abs !== root && !abs.startsWith(root + sep)) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
}
