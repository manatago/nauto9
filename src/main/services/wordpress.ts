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

// Upload a media file. Returns its WP id and public source URL.
export async function uploadMedia(
  cfg: WpConfig,
  filename: string,
  mime: string,
  buf: Buffer
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
  return { id: data.id, source_url: data.source_url }
}

// Create a draft post. Returns its id and admin link.
export async function createDraft(
  cfg: WpConfig,
  title: string,
  contentHtml: string
): Promise<{ id: number; link: string }> {
  const data = await postJson(`${cfg.siteUrl}/wp-json/wp/v2/posts`, cfg, {
    title,
    content: contentHtml,
    status: 'draft'
  })
  const id = data.id as number
  return { id, link: `${cfg.siteUrl}/wp-admin/post.php?post=${id}&action=edit` }
}
