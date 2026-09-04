import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/popups.css'
import './styles/academio-profile.css'
import './styles/prints.css'
import './styles/finance-income.css'
import './styles/platform-admin.css'
import './styles/announcements.css'
import './styles/attendance.css'
import './styles/photos.css'
import './styles/calendar.css'
import './styles/parents.css'
import './styles/schedule.css'
import './styles/warehouse.css'
import './styles/settings.css'
import './styles/sports.css'
import './styles/consent-banner.css'
import './styles/partners.css'
import './styles/staff.css'
import './styles/protocol.css'
import './styles/classes.css'
import './styles/athlete-portal.css'
import './styles/coach-portal.css'
import './styles/payment-receipt.css'
/* Theme overrides last so appearance contrast wins over feature CSS */
import './styles/appearance-ocean-slate.css'
import './styles/appearance-graphite-ember.css'
import './styles/appearance-aegean-navy.css'
import './styles/appearance-ivory-club.css'
import './styles/appearance-login-split.css'
import { migratePlaintextPasswords } from './auth/auth'
import { startBackupScheduleRunner } from './data/backupScheduleRunner'
import { startAppearanceTheme } from './platform/platformConfig'
import { startDocumentBranding } from './utils/documentBranding'

startAppearanceTheme()
startDocumentBranding()
startBackupScheduleRunner()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
void migratePlaintextPasswords()

