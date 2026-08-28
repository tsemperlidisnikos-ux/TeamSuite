import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  CalendarDays,
  CreditCard,
  Lock,
  MessagesSquare,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { submitClubWaitlist } from '../api/services/clubWaitlistService';
import { isAuthenticated } from '../auth/auth';

const FEATURES = [
  { icon: Users, title: 'ΟΡΓΑΝΩΣΗ', subtitle: 'Αθλητές & Ομάδες' },
  { icon: CalendarDays, title: 'ΠΡΟΠΟΝΗΣΕΙΣ', subtitle: 'Πρόγραμμα & Παρουσίες' },
  { icon: Trophy, title: 'ΑΓΩΝΕΣ', subtitle: 'Αποτελέσματα & Βαθμολογίες' },
  { icon: CreditCard, title: 'ΠΛΗΡΩΜΕΣ', subtitle: 'Συνδρομές & Ειδοποιήσεις' },
  { icon: MessagesSquare, title: 'ΕΠΙΚΟΙΝΩΝΙΑ', subtitle: 'Ανακοινώσεις & Μηνύματα' },
] as const;

const SPORT_OPTIONS = [
  'Ποδόσφαιρο',
  'Μπάσκετ',
  'Βόλεϊ',
  'Χάντμπολ',
  'Κολύμβηση',
  'Τένις',
  'Άλλο',
];

const LEVEL_OPTIONS = [
  { id: 'academies', label: 'Ακαδημίες' },
  { id: 'pre', label: 'Προαγωνιστικό' },
  { id: 'comp', label: 'Αγωνιστικό' },
] as const;

function Req({ children }: { children: string }) {
  return (
    <span className="ssr-label">
      {children} <span className="ssr-req" aria-hidden>*</span>
    </span>
  );
}

export function RegisterClubPage() {
  const [clubName, setClubName] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sport, setSport] = useState('');
  const [levels, setLevels] = useState<string[]>(['academies']);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  function toggleLevel(id: string) {
    setLevels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!acceptedTerms) {
      setError('Απαιτείται αποδοχή Όρων Χρήσης και Πολιτικής Απορρήτου.');
      return;
    }
    if (!sport) {
      setError('Επίλεξε άθλημα.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await submitClubWaitlist({
      clubName: clubName.trim(),
      adminFullName: adminFullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      sport,
      levels,
      dpaAcceptedAt: new Date().toISOString(),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης. Δοκίμασε ξανά.');
      return;
    }
    setDone(true);
  }

  return (
    <div className="ssr-page">
      <div className="ssr-bg" aria-hidden>
        <div className="ssr-bg-photo" />
        <div className="ssr-bg-arcs" />
        <div className="ssr-bg-fade" />
      </div>

      <div className="ssr-layout">
        <aside className="ssr-left">
          <div className="ssr-logo">
            <span className="ssr-logo-name">SPORTSUITE</span>
            <span className="ssr-logo-360">360</span>
          </div>

          <h1 className="ssr-headline">
            Η ΠΛΗΡΗΣ ΣΟΥΙΤΑ ΔΙΑΧΕΙΡΙΣΗΣ
            <span className="ssr-headline-accent">ΑΘΛΗΤΙΚΩΝ ΑΚΑΔΗΜΙΩΝ</span>
          </h1>

          <p className="ssr-lead">
            Οργάνωσε την ακαδημία σου: αθλητές, προπονήσεις, αγώνες, επικοινωνία και
            πληρωμές σε ένα σύγχρονο περιβάλλον.
          </p>

          <ul className="ssr-features">
            {FEATURES.map(({ icon: Icon, title, subtitle }) => (
              <li key={title}>
                <Icon size={26} strokeWidth={1.9} aria-hidden />
                <strong>{title}</strong>
                <span>{subtitle}</span>
              </li>
            ))}
          </ul>

          <div className="ssr-callout">
            <CalendarDays size={22} aria-hidden />
            <div>
              <strong>ΞΕΚΙΝΑΜΕ ΣΥΝΤΟΜΑ</strong>
              <p>Άφησε τα στοιχεία σου για να είσαι από τους πρώτους που θα το δοκιμάσουν.</p>
            </div>
          </div>
        </aside>

        <div className="ssr-right">
          {done ? (
            <div className="ssr-card ssr-card--success">
              <div className="ssr-card-icon" aria-hidden>
                <UserPlus size={24} strokeWidth={2.2} />
              </div>
              <h2>Είσαι στη λίστα!</h2>
              <p>
                Ευχαριστούμε. Θα επικοινωνήσουμε στο <strong>{email}</strong> όταν ανοίξει η
                δωρεάν δοκιμή.
              </p>
              <Link className="ssr-submit" to="/login">
                Μετάβαση στη σύνδεση
              </Link>
            </div>
          ) : (
            <form className="ssr-card" onSubmit={handleSubmit}>
              <header className="ssr-card-head">
                <div className="ssr-card-icon" aria-hidden>
                  <UserPlus size={24} strokeWidth={2.2} />
                </div>
                <h2>Εγγραφή ακαδημίας</h2>
                <p>Συμπλήρωσε τη φόρμα για να μπεις στη λίστα αναμονής για τη δωρεάν δοκιμή.</p>
              </header>

              <label className="ssr-field">
                <Req>Όνομα ακαδημίας</Req>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="Π.χ. Α.Ο. Νίκη"
                  required
                />
              </label>

              <div className="ssr-grid-2">
                <label className="ssr-field">
                  <Req>Ονοματεπώνυμο υπευθύνου</Req>
                  <input
                    type="text"
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="Π.χ. Γιάννης Παπαδόπουλος"
                    required
                  />
                </label>
                <label className="ssr-field">
                  <Req>Email επικοινωνίας</Req>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@academy.gr"
                    required
                  />
                </label>
              </div>

              <div className="ssr-grid-2">
                <label className="ssr-field">
                  <Req>Τηλέφωνο επικοινωνίας</Req>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="69XXXXXXXX"
                    required
                  />
                </label>
                <label className="ssr-field">
                  <Req>Άθλημα</Req>
                  <select value={sport} onChange={(e) => setSport(e.target.value)} required>
                    <option value="">Επιλέξτε άθλημα</option>
                    {SPORT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="ssr-levels">
                <legend>
                  Επίπεδο τμημάτων <span className="ssr-req" aria-hidden>*</span>
                </legend>
                <div className="ssr-levels-row">
                  {LEVEL_OPTIONS.map((opt) => (
                    <label key={opt.id} className="ssr-check">
                      <input
                        type="checkbox"
                        checked={levels.includes(opt.id)}
                        onChange={() => toggleLevel(opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="ssr-terms">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span>
                  Διάβασα και αποδέχομαι τους{' '}
                  <button type="button" className="ssr-link">
                    Όρους Χρήσης
                  </button>
                  , την{' '}
                  <button type="button" className="ssr-link">
                    Πολιτική Απορρήτου
                  </button>{' '}
                  και τη Συμφωνία Επεξεργασίας Δεδομένων (DPA) όπου ο σύλλογος είναι υπεύθυνος
                  επεξεργασίας και η πλατφόρμα εκτελών την επεξεργασία.
                </span>
              </label>

              {error ? <p className="ssr-error">{error}</p> : null}

              <button type="submit" className="ssr-submit" disabled={saving}>
                {saving ? 'ΑΠΟΣΤΟΛΗ…' : 'ΕΓΓΡΑΦΗ ΣΤΗ ΛΙΣΤΑ ΑΝΑΜΟΝΗΣ'}
              </button>

              <p className="ssr-secure">
                <Lock size={13} aria-hidden />
                Τα στοιχεία σας είναι ασφαλή και δεν θα κοινοποιηθούν
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
