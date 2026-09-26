import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  APP_BUILD_ID,
  applyAppUpdate,
  fetchRemoteAppBuildId,
  isNewerAppBuild,
} from '../utils/appVersion'
import { registerParentServiceWorker } from '../api/services/pushService'

const DISMISS_KEY = 'teamsuite-dismissed-app-build'

function dismissedBuildId(): string {
  try {
    return sessionStorage.getItem(DISMISS_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberDismiss(buildId: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, buildId)
  } catch {
    /* ignore */
  }
}

export function AppUpdateBanner() {
  const [remoteBuildId, setRemoteBuildId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      void registerParentServiceWorker().then((registration) => registration?.update()).catch(() => undefined)
      const remote = await fetchRemoteAppBuildId()
      if (cancelled || !remote) return
      if (!isNewerAppBuild(APP_BUILD_ID, remote)) return
      if (dismissedBuildId() === remote) return
      setRemoteBuildId(remote)
    }

    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void check(), 120_000)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [])

  if (!remoteBuildId) return null

  return (
    <div className="app-update-banner" role="status">
      <p>Υπάρχει νέα έκδοση της εφαρμογής.</p>
      <div className="app-update-banner-actions">
        <button
          type="button"
          className="app-update-banner-refresh"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void applyAppUpdate(remoteBuildId)
          }}
        >
          <RefreshCw size={16} />
          {busy ? 'Ανανέωση…' : 'Ανανέωση'}
        </button>
        <button
          type="button"
          className="app-update-banner-later"
          onClick={() => {
            rememberDismiss(remoteBuildId)
            setRemoteBuildId(null)
          }}
        >
          Αργότερα
        </button>
      </div>
    </div>
  )
}
