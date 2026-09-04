import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoSessionActive } from '../auth/auth';
import { isDemoClubName } from '../data/demoShowcase';
import { getClubById } from '../auth/clubs';
import {
  ROSTER_HEALTH_EVENT,
  loadRosterSyncDiagnosis,
  type RosterSyncDiagnosis,
} from '../data/rosterSyncHealth';

export function RosterSyncHealthBanner({ clubId }: { clubId: string | null | undefined }) {
  const [diagnosis, setDiagnosis] = useState<RosterSyncDiagnosis | null>(null);

  const refresh = useCallback(async () => {
    if (!clubId || isDemoSessionActive() || isDemoClubName(getClubById(clubId)?.name)) {
      setDiagnosis(null);
      return;
    }
    const next = await loadRosterSyncDiagnosis(clubId);
    setDiagnosis(next);
  }, [clubId]);

  useEffect(() => {
    void refresh();
    const onHealth = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(ROSTER_HEALTH_EVENT, onHealth);
    document.addEventListener('visibilitychange', onVisible);
    const intervalId = window.setInterval(() => void refresh(), 90_000);
    return () => {
      window.removeEventListener(ROSTER_HEALTH_EVENT, onHealth);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  if (!diagnosis || diagnosis.severity === 'ok') return null;

  return (
    <div
      className={`roster-sync-banner roster-sync-banner--${diagnosis.severity}`}
      role="status"
    >
      <div>
        <strong>{diagnosis.title}</strong>
        <p>{diagnosis.detail}</p>
      </div>
      <Link className="btn btn-secondary" to="/settings?tab=backup">
        Άνοιγμα Backup / sync
      </Link>
    </div>
  );
}
