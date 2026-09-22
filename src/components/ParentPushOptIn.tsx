import { Bell, BellOff, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSession } from '../auth/auth';
import * as pushService from '../api/services/pushService';
import { isIosDevice } from '../utils/parentApp';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredInstall: InstallEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event as InstallEvent;
    window.dispatchEvent(new CustomEvent('teamsuite-parent-install-ready'));
  });
}

export function ParentPushOptIn() {
  const session = getSession();
  const clubId = session?.clubId ?? null;
  const [pushState, setPushState] = useState<'idle' | 'on' | 'off' | 'busy'>('idle');
  const [message, setMessage] = useState('');
  const [canInstall, setCanInstall] = useState(Boolean(deferredInstall));
  const ios = isIosDevice();

  useEffect(() => {
    const bump = () => setCanInstall(Boolean(deferredInstall));
    window.addEventListener('teamsuite-parent-install-ready', bump);
    return () => window.removeEventListener('teamsuite-parent-install-ready', bump);
  }, []);

  useEffect(() => {
    if (!pushService.pushSupported()) {
      setPushState('off');
      return;
    }
    void (async () => {
      await pushService.registerParentServiceWorker();
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      setPushState(Notification.permission === 'granted' && subscription ? 'on' : 'off');
    })();
  }, []);

  async function handleEnable() {
    if (!clubId) {
      setMessage('Δεν βρέθηκε σύλλογος για τον λογαριασμό.');
      return;
    }
    setPushState('busy');
    setMessage('');
    const result = await pushService.subscribeParentPush(clubId);
    setPushState(result.ok ? 'on' : 'off');
    setMessage(result.ok ? 'Οι ειδοποιήσεις ενεργοποιήθηκαν.' : result.error ?? 'Αποτυχία');
  }

  async function handleDisable() {
    if (!clubId) return;
    setPushState('busy');
    await pushService.unsubscribeParentPush(clubId);
    setPushState('off');
    setMessage('Οι ειδοποιήσεις απενεργοποιήθηκαν.');
  }

  async function handleInstall() {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    setCanInstall(false);
  }

  return (
    <section className="parent-app-tools">
      {canInstall ? (
        <button type="button" className="parent-app-tool-btn" onClick={() => void handleInstall()}>
          <Download size={16} />
          Εγκατάσταση στην αρχική οθόνη
        </button>
      ) : null}
      {ios && !canInstall ? (
        <p className="parent-app-tool-hint">
          iPhone: Safari → Κοινοποίηση → «Προσθήκη στην οθόνη Αφετηρίας».
        </p>
      ) : null}
      {pushService.pushSupported() ? (
        pushState === 'on' ? (
          <button type="button" className="parent-app-tool-btn" onClick={() => void handleDisable()}>
            <BellOff size={16} />
            Απενεργοποίηση ειδοποιήσεων
          </button>
        ) : (
          <button
            type="button"
            className="parent-app-tool-btn parent-app-tool-btn--primary"
            onClick={() => void handleEnable()}
            disabled={pushState === 'busy'}
          >
            <Bell size={16} />
            {pushState === 'busy' ? 'Ενεργοποίηση…' : 'Ενεργοποίηση ειδοποιήσεων'}
          </button>
        )
      ) : (
        <p className="parent-app-tool-hint">
          Οι ειδοποιήσεις κινητού χρειάζονται Chrome / εγκατεστημένη εφαρμογή.
        </p>
      )}
      {message ? <p className="parent-app-tool-msg">{message}</p> : null}
    </section>
  );
}
