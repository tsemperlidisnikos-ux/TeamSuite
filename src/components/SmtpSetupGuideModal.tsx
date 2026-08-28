import { BookOpen } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

const PRODUCTION_URL = 'https://teamsuite-seven.vercel.app';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SmtpSetupGuideModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      title="Οδηγός ρύθμισης SMTP (Email)"
      onClose={onClose}
      wide
      footer={
        <Button type="button" onClick={onClose}>
          Κλείσιμο
        </Button>
      }
    >
      <div className="smtp-setup-guide">
        <p className="smtp-setup-guide-lede">
          Η αποστολή email (υπενθυμίσεις, εγγραφές, δοκιμές) γίνεται από τον server (
          <strong>Vercel</strong>), όχι από τον browser. Χρειάζονται σωστά στοιχεία SMTP και
          αποθήκευση στο <strong>cloud</strong>.
        </p>

        <section>
          <h4>1. Προετοιμασία Gmail — App Password</h4>
          <p>
            Ο <strong>κανονικός κωδικός Gmail δεν δουλεύει</strong>. Χρειάζεσαι App Password
            (16 χαρακτήρες).
          </p>
          <ol>
            <li>
              Άνοιξε{' '}
              <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
                Google Security
              </a>{' '}
              → ενεργοποίησε <strong>Επαλήθευση σε 2 βήματα</strong>.
            </li>
            <li>
              Δημιούργησε App Password από{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                myaccount.google.com/apppasswords
              </a>{' '}
              (Mail → Άλλη εφαρμογή → «SportSuite360»).
            </li>
            <li>Αντέγραψε τον 16ψήφιο κωδικό — μπαίνει μόνο στο πεδίο «Κωδικός» της εφαρμογής.</li>
          </ol>
        </section>

        <section>
          <h4>2. Στοιχεία SMTP (Gmail)</h4>
          <div className="table-wrap">
            <table className="smtp-setup-guide-table">
              <thead>
                <tr>
                  <th>Πεδίο</th>
                  <th>Τιμή</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>SMTP Host</td>
                  <td>
                    <code>smtp.gmail.com</code>
                  </td>
                </tr>
                <tr>
                  <td>SMTP Port</td>
                  <td>
                    <code>587</code>
                  </td>
                </tr>
                <tr>
                  <td>Ασφάλεια</td>
                  <td>STARTTLS</td>
                </tr>
                <tr>
                  <td>Έλεγχος ταυτότητας</td>
                  <td>Ναι</td>
                </tr>
                <tr>
                  <td>Όνομα χρήστη</td>
                  <td>Πλήρες Gmail (π.χ. club@gmail.com)</td>
                </tr>
                <tr>
                  <td>Κωδικός</td>
                  <td>App Password (όχι κανονικός κωδικός Gmail)</td>
                </tr>
                <tr>
                  <td>Από Email / Όνομα</td>
                  <td>Το ίδιο Gmail και όνομα συλλόγου</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="settings-hint">
            Port <code>587</code> → STARTTLS. Port <code>465</code> → SSL (όχι STARTTLS).
          </p>
        </section>

        <section>
          <h4>3. Αποθήκευση στο cloud (υποχρεωτικό)</h4>
          <ol>
            <li>
              Σύνδεση στο production:{' '}
              <a href={PRODUCTION_URL} target="_blank" rel="noreferrer">
                {PRODUCTION_URL}
              </a>
            </li>
            <li>
              <strong>Ρυθμίσεις → Σύλλογος</strong>: συμπλήρωσε τα πεδία SMTP.
            </li>
            <li>
              <strong>Ρυθμίσεις → Email</strong>: τσέκαρε «Ενεργό SMTP συλλόγου» →{' '}
              <strong>Αποθήκευση</strong>.
            </li>
          </ol>
          <p className="smtp-setup-guide-note">
            Επιτυχία cloud sync: μήνυμα «αποθηκεύτηκαν και <strong>συγχρονίστηκαν</strong>». Το
            μήνυμα «Οι ρυθμίσεις αποθηκεύτηκαν» μόνο από tab Σύλλογος σημαίνει τοπική αποθήκευση.
          </p>
        </section>

        <section>
          <h4>4. Δοκιμή</h4>
          <ul>
            <li>
              <strong>Ρυθμίσεις → Email</strong> → «Αποστολή δοκιμής», ή
            </li>
            <li>
              <strong>Ρυθμίσεις → Σύλλογος</strong> → «Έλεγχος Σύνδεσης».
            </li>
          </ul>
          <p>Έλεγξε Inbox και φάκελο Spam.</p>
        </section>

        <section>
          <h4>5. Συχνά προβλήματα</h4>
          <div className="table-wrap">
            <table className="smtp-setup-guide-table">
              <thead>
                <tr>
                  <th>Σύμπτωμα</th>
                  <th>Λύση</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ελλιπείς ρυθμίσεις SMTP</td>
                  <td>Email → Ενεργό → Αποθήκευση (cloud sync)</td>
                </tr>
                <tr>
                  <td>Invalid login</td>
                  <td>App Password, όχι κανονικός κωδικός</td>
                </tr>
                <tr>
                  <td>Κωδικός = αστεράκια (********)</td>
                  <td>Διέγραψε και ξανακόλλησε App Password</td>
                </tr>
                <tr>
                  <td>Σφάλμα στο localhost</td>
                  <td>Χρησιμοποίησε το production URL</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4>6. Outlook / Microsoft 365 (εναλλακτικά)</h4>
          <p>
            Host: <code>smtp.office365.com</code>, Port: <code>587</code>, STARTTLS, username =
            email σου.
          </p>
        </section>

        <section className="smtp-setup-guide-checklist">
          <h4>Checklist</h4>
          <ul>
            <li>2FA ενεργό στο Gmail</li>
            <li>App Password δημιουργημένο</li>
            <li>SMTP συμπληρωμένο στο tab Σύλλογος</li>
            <li>Email → Ενεργό SMTP → Αποθήκευση (συγχρονισμός cloud)</li>
            <li>Δοκιμαστικό email εστάλη</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

export function SmtpSetupGuideButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button type="button" variant="secondary" className={className} onClick={onClick}>
      <BookOpen size={15} /> Οδηγός SMTP
    </Button>
  );
}
