import { useEffect, useState } from 'react';
import { Printer, Send } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import * as emailService from '../api/services/emailService';
import { getClubSmtp } from '../auth/clubs';
import { amountToGreekWords } from '../utils/amountToGreekWords';
import {
  buildPaymentReceiptEmail,
  parentReceiptEmails,
  type PaymentReceiptDraft,
} from '../utils/paymentReceiptEmail';

export type { PaymentReceiptDraft };

type PaymentReceiptModalProps = {
  open: boolean;
  logoUrl: string | null;
  clubName: string;
  clubId: string | null;
  athleteId?: string | null;
  fatherEmail?: string | null;
  motherEmail?: string | null;
  initial: PaymentReceiptDraft;
  onClose: () => void;
};

const emptyDraft = (): PaymentReceiptDraft => ({
  date: '',
  series: '',
  number: '',
  amount: '',
  receivedFrom: '',
  address: '',
  amountWords: '',
  reason: '',
});

export function PaymentReceiptModal({
  open,
  logoUrl,
  clubName,
  clubId,
  athleteId,
  fatherEmail,
  motherEmail,
  initial,
  onClose,
}: PaymentReceiptModalProps) {
  const [draft, setDraft] = useState<PaymentReceiptDraft>(emptyDraft);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendOk, setSendOk] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = { ...initial };
    if (!next.amountWords.trim() && next.amount.trim()) {
      next.amountWords = amountToGreekWords(next.amount);
    }
    setDraft(next);
    setSendError('');
    setSendOk('');
  }, [open, initial]);

  function setField<K extends keyof PaymentReceiptDraft>(key: K, value: PaymentReceiptDraft[K]) {
    setDraft((prev) => {
      if (key === 'amount') {
        const amount = String(value);
        return {
          ...prev,
          amount,
          amountWords: amountToGreekWords(amount),
        };
      }
      return { ...prev, [key]: value };
    });
  }

  function handlePrint() {
    window.print();
  }

  async function handleSend() {
    if (sending) return;
    setSendError('');
    setSendOk('');
    if (!clubId) {
      setSendError('Δεν βρέθηκε σύλλογος.');
      return;
    }
    const smtp = getClubSmtp(clubId);
    if (!smtp.enabled) {
      setSendError('Ενεργοποιήστε το SMTP στις Ρυθμίσεις → Email για αποστολή απόδειξης.');
      return;
    }
    const recipients = parentReceiptEmails({ fatherEmail, motherEmail });
    if (recipients.length === 0) {
      setSendError(
        'Δεν υπάρχουν email πατέρα ή μητέρας στο προφίλ αθλητή. Συμπληρώστε τα και δοκιμάστε ξανά.',
      );
      return;
    }

    const message = buildPaymentReceiptEmail({
      clubName,
      logoUrl,
      draft,
    });
    setSending(true);
    const sent: string[] = [];
    const failed: string[] = [];
    for (const to of recipients) {
      const result = await emailService.sendClubEmail({
        clubId,
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        athleteId: athleteId ?? undefined,
        transactional: true,
      });
      if (result.success) sent.push(to);
      else failed.push(`${to}: ${result.error ?? 'αποτυχία'}`);
    }
    setSending(false);
    if (failed.length > 0 && sent.length === 0) {
      setSendError(failed.join(' · '));
      return;
    }
    if (failed.length > 0) {
      setSendError(failed.join(' · '));
    }
    setSendOk(
      sent.length === 1
        ? `Η απόδειξη στάλθηκε στο ${sent[0]}.`
        : `Η απόδειξη στάλθηκε σε πατέρα και μητέρα (${sent.join(', ')}).`,
    );
  }

  return (
    <Modal
      open={open}
      title="Απόδειξη είσπραξης"
      onClose={onClose}
      wide
      className="payment-receipt-modal"
      footer={
        <>
          <div className="payment-receipt-footer-status">
            {sendError ? <p className="form-error">{sendError}</p> : null}
            {sendOk ? <p className="settings-success">{sendOk}</p> : null}
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Κλείσιμο
          </Button>
          <Button type="button" variant="secondary" disabled={sending} onClick={() => void handleSend()}>
            <Send size={16} /> {sending ? 'Αποστολή…' : 'Αποστολή'}
          </Button>
          <Button type="button" onClick={handlePrint}>
            <Printer size={16} /> Εκτύπωση
          </Button>
        </>
      }
    >
      <div className="payment-receipt" id="payment-receipt-print">
        <div className="payment-receipt-top">
          <div className="payment-receipt-logo">
            {logoUrl ? (
              <img src={logoUrl} alt={clubName || 'Λογότυπο συλλόγου'} />
            ) : (
              <div className="payment-receipt-logo-fallback">
                <span>{(clubName || 'Σύλλογος').slice(0, 2).toUpperCase()}</span>
                <strong>{clubName || 'Σύλλογος'}</strong>
              </div>
            )}
          </div>
          <div className="payment-receipt-meta">
            <div className="payment-receipt-meta-row">
              <label>
                <span>ΗΜ/ΝΙΑ</span>
                <input
                  value={draft.date}
                  onChange={(e) => setField('date', e.target.value)}
                  placeholder="ηη/μμ/εεεε"
                />
              </label>
              <label>
                <span>ΣΕΙΡΑ</span>
                <input
                  value={draft.series}
                  onChange={(e) => setField('series', e.target.value)}
                  placeholder="A"
                />
              </label>
              <label>
                <span>Νο</span>
                <input
                  value={draft.number}
                  onChange={(e) => setField('number', e.target.value)}
                  placeholder="Αριθμός"
                />
              </label>
            </div>
            <div className="payment-receipt-title">ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ</div>
            <div className="payment-receipt-amount-box">
              <span className="payment-receipt-currency">€</span>
              <input
                className="payment-receipt-amount-input"
                value={draft.amount}
                onChange={(e) => setField('amount', e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
        </div>

        <div className="payment-receipt-body">
          <label className="payment-receipt-line">
            <span>Έλαβα από τον</span>
            <input
              value={draft.receivedFrom}
              onChange={(e) => setField('receivedFrom', e.target.value)}
              placeholder="Ονοματεπώνυμο"
            />
          </label>
          <label className="payment-receipt-line">
            <span>Διεύθυνση</span>
            <input
              value={draft.address}
              onChange={(e) => setField('address', e.target.value)}
              placeholder="Διεύθυνση"
            />
          </label>
          <label className="payment-receipt-line payment-receipt-line--tall">
            <span>Το ποσό</span>
            <textarea
              rows={2}
              value={draft.amountWords}
              onChange={(e) => setField('amountWords', e.target.value)}
              placeholder="Ποσό ολογράφως"
            />
          </label>
          <label className="payment-receipt-line payment-receipt-line--tall">
            <span>Αιτιολογία είσπραξης</span>
            <textarea
              rows={2}
              value={draft.reason}
              onChange={(e) => setField('reason', e.target.value)}
              placeholder="Αιτιολογία"
            />
          </label>
        </div>

        <div className="payment-receipt-signs">
          <div className="payment-receipt-sign">
            <strong>ΓΙΑ ΤΗΝ ΕΙΣΠΡΑΞΗ</strong>
            <div className="payment-receipt-sign-box" />
          </div>
          <div className="payment-receipt-sign">
            <strong>ΓΙΑ ΤΗΝ ΠΛΗΡΩΜΗ</strong>
            <div className="payment-receipt-sign-box" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
