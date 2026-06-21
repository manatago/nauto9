// Minimal WordPress REST client: upload media and create a draft post using an
// application password (Basic auth).
export interface WpConfig {
  siteUrl: string // e.g. https://example.com
  user: string
  appPassword: string
}

export function wpConfigFrom(
  siteUrl: string | null,
  user: string | null,
  appPassword: string | null
): WpConfig {
  const site = (siteUrl ?? '').trim().replace(/\/+$/, '')
  if (!site) throw new Error('WordPress のサイトURLが未設定です（設定画面）')
  if (!(user ?? '').trim() || !(appPassword ?? '').trim())
    throw new Error('WordPress のユーザー名／アプリケーションパスワードが未設定です（設定画面）')
  return { siteUrl: site, user: (user ?? '').trim(), appPassword: (appPassword ?? '').trim() }
}

function authHeader(cfg: WpConfig): string {
  // App passwords contain spaces; they are used verbatim.
  return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
}

async function postJson(
  url: string,
  cfg: WpConfig,
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(cfg),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('WordPress 認証に失敗しました（ユーザー名／アプリパスワードを確認）')
    throw new Error(`WordPress HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

// Verify the site URL + credentials by fetching the authenticated user.
export async function testConnection(cfg: WpConfig): Promise<{ name: string }> {
  let res: Response
  try {
    res = await fetch(`${cfg.siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: authHeader(cfg) }
    })
  } catch {
    throw new Error(`サイトに接続できません（${cfg.siteUrl}）。URLを確認してください`)
  }
  if (res.status === 401)
    throw new Error('認証に失敗しました（ユーザー名／アプリケーションパスワードを確認）')
  if (res.status === 404)
    throw new Error('REST API が見つかりません（URLが正しいか、REST が有効か確認）')
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`WordPress HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = (await res.json()) as { name?: string }
  return { name: data.name ?? cfg.user }
}

// Upload a media file. Returns its WP id and public source URL. Optional meta
// (title / caption / alt) is applied with a best-effort follow-up update.
export async function uploadMedia(
  cfg: WpConfig,
  filename: string,
  mime: string,
  buf: Buffer,
  meta?: { title?: string; caption?: string; altText?: string }
): Promise<{ id: number; source_url: string }> {
  const res = await fetch(`${cfg.siteUrl}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(cfg),
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`
    },
    body: new Uint8Array(buf)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('WordPress 認証に失敗しました（ユーザー名／アプリパスワードを確認）')
    throw new Error(`WordPress メディアアップロード失敗 HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = (await res.json()) as { id: number; source_url: string }
  if (meta && (meta.title || meta.caption || meta.altText)) {
    await postJson(`${cfg.siteUrl}/wp-json/wp/v2/media/${data.id}`, cfg, {
      title: meta.title,
      caption: meta.caption,
      alt_text: meta.altText
    }).catch(() => {
      /* best-effort: title/caption are optional */
    })
  }
  return { id: data.id, source_url: data.source_url }
}

// List existing categories (id + name) for auto-selection.
export async function listCategories(cfg: WpConfig): Promise<{ id: number; name: string }[]> {
  const res = await fetch(
    `${cfg.siteUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`,
    { headers: { Authorization: authHeader(cfg) } }
  )
  if (!res.ok) throw new Error(`カテゴリ取得失敗 HTTP ${res.status}`)
  return (await res.json()) as { id: number; name: string }[]
}

// Resolve a tag name to an id, creating it if it doesn't exist.
export async function findOrCreateTag(cfg: WpConfig, name: string): Promise<number> {
  const found = (await (
    await fetch(
      `${cfg.siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&_fields=id,name`,
      { headers: { Authorization: authHeader(cfg) } }
    )
  ).json()) as { id: number; name: string }[]
  const exact = found.find((t) => t.name === name)
  if (exact) return exact.id
  const created = await postJson(`${cfg.siteUrl}/wp-json/wp/v2/tags`, cfg, { name })
  return created.id as number
}

// Create a draft post. Returns its id and admin link.
export async function createDraft(
  cfg: WpConfig,
  title: string,
  contentHtml: string,
  extra?: { categories?: number[]; tags?: number[]; featured_media?: number }
): Promise<{ id: number; link: string }> {
  const body: Record<string, unknown> = { title, content: contentHtml, status: 'draft' }
  if (extra?.categories?.length) body.categories = extra.categories
  if (extra?.tags?.length) body.tags = extra.tags
  if (extra?.featured_media) body.featured_media = extra.featured_media
  const data = await postJson(`${cfg.siteUrl}/wp-json/wp/v2/posts`, cfg, body)
  const id = data.id as number
  return { id, link: `${cfg.siteUrl}/wp-admin/post.php?post=${id}&action=edit` }
}
