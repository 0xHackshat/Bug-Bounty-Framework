export type GitHubSyncConfig = {
  owner: string
  repo: string
  branch: string
  token: string
}

export type SyncViewId = 'mind_palace' | 'bug_bounty_mind_map'
export type RemoteDiagram = { sha: string; diagram: unknown }

const apiBase = 'https://api.github.com'
const remotePaths: Record<SyncViewId, string> = {
  mind_palace: 'Main/sync-data/mind_palace.json',
  bug_bounty_mind_map: 'Main/sync-data/bug_bounty_mind_map.json',
}

async function githubRequest(url: string, config: GitHubSyncConfig, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  })
}

async function errorMessage(response: Response): Promise<string> {
  let detail = ''
  try {
    const body = await response.json() as { message?: string }
    if (typeof body.message === 'string') detail = body.message
  } catch {
    detail = ''
  }
  return `GitHub returned ${response.status}${detail ? `: ${detail}` : ''}`
}

function contentEndpoint(config: GitHubSyncConfig, viewId: SyncViewId): string {
  const path = remotePaths[viewId].split('/').map(encodeURIComponent).join('/')
  return `${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`
}

function contentUrl(config: GitHubSyncConfig, viewId: SyncViewId): string {
  return `${contentEndpoint(config, viewId)}?ref=${encodeURIComponent(config.branch)}`
}

function decodeContent(content: string): unknown {
  const binary = atob(content.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

function encodeContent(value: unknown): string {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export async function validateGitHubConfig(config: GitHubSyncConfig): Promise<void> {
  const response = await githubRequest(
    `${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    config,
  )
  if (!response.ok) throw new Error(await errorMessage(response))
}

export async function readRemoteDiagram(config: GitHubSyncConfig, viewId: SyncViewId): Promise<RemoteDiagram | null> {
  const response = await githubRequest(contentUrl(config, viewId), config)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessage(response))
  const file = await response.json() as { sha?: unknown; content?: unknown; encoding?: unknown }
  if (typeof file.sha !== 'string' || typeof file.content !== 'string' || file.encoding !== 'base64') {
    throw new Error('GitHub returned an unexpected file response.')
  }
  return { sha: file.sha, diagram: decodeContent(file.content) }
}

export async function writeRemoteDiagram(
  config: GitHubSyncConfig,
  viewId: SyncViewId,
  diagram: unknown,
  sha?: string,
): Promise<string> {
  const response = await githubRequest(contentEndpoint(config, viewId), config, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Sync ${viewId.replace(/_/g, ' ')}`,
      content: encodeContent(diagram),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  const result = await response.json() as { content?: { sha?: unknown } }
  if (typeof result.content?.sha !== 'string') throw new Error('GitHub did not return the saved file revision.')
  return result.content.sha
}

export const syncMetaKey = (viewId: SyncViewId) => `github_sync_meta_${viewId}`
export const syncConfigKey = 'github_sync_config'
