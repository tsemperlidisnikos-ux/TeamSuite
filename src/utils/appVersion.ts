export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__ ? __APP_BUILD_ID__ : 'dev'

export type AppVersionPayload = {
  buildId?: string
}

export function isNewerAppBuild(localId: string, remoteId: string | null | undefined): boolean {
  const local = localId.trim()
  const remote = (remoteId ?? '').trim()
  return Boolean(local && remote && local !== remote)
}

export async function fetchRemoteAppBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`/app-version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const json = (await response.json()) as AppVersionPayload
    const buildId = typeof json.buildId === 'string' ? json.buildId.trim() : ''
    return buildId || null
  } catch {
    return null
  }
}

export async function applyAppUpdate(remoteBuildId?: string | null): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    const registrations = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((registrations ?? []).map((registration) => registration.update()))
  } catch {
    /* ignore */
  }
  const next = new URL(window.location.href)
  if (remoteBuildId) next.searchParams.set('_v', remoteBuildId)
  else next.searchParams.set('_v', String(Date.now()))
  window.location.replace(next.toString())
}
