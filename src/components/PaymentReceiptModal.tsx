import { useEffect, useMemo, useState } from 'react';
import { Printer, Send } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import * as emailService from '../api/services/emailService';
import * as receiptBookService from '../api/services/receiptBookService';
import { getClubSmtp } from '../auth/clubs';
import { useAppData } from '../hooks/useAppData';
import { amountToGreekWords } from '../utils/amountToGreekWords';
import {
  buildPaymentReceiptEmail,
  parentReceiptEmails,
  type PaymentReceiptDraft,
} from '../utils/paymentReceiptEmail';
import {
  formatReceiptLabel,
  issueForTransaction,
  previewNextReceipt,
  seriesOptions,
} from '../utils/receiptBook';

export type { PaymentReceiptDraft };

type PaymentReceiptModalProps = {
  open: boolean;
  logoUrl: string | null;
  clubName: string;
  clubId: string | null;
  athleteId?: string | null;
  transactionId?: string | null;
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
  transactionId,
  fatherEmail,
  motherEmail,
  initial,
  onClose,
}: PaymentReceiptModalProps) {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<PaymentReceiptDraft>(emptyDraft);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendOk, setSendOk] = useState('');

  const options = useMemo(
    () => seriesOptions(data.receiptNumberRanges, data.receiptIssues),
    [data.receiptNumberRanges, data.receiptIssues],
  );
  const existing = useMemo(
    () => issueForTransaction(data.receiptIssues, transactionId),
    [data.receiptIssues, transactionId],
  );

  useEffect(() => {
    if (!open) return;
    const next = { ...initial };
    if (!next.amountWords.trim() && next.amount.trim()) {
      next.amountWords = amountToGreekWords(next.amount);
    }
    if (existing && !existing.voidedAt) {
      next.series = existing.series;
      next.number = String(existing.number);
    } else if (!next.series && options.length === 1) {
      next.series = options[0].series;
    }
    if (next.series && !existing) {
      const preview = previewNextReceipt(
        next.series,
        data.receiptNumberRanges,
        data.receiptIssues,
      );
      next.number = preview.ok ? String(preview.number) : '';
    }
    setDraft(next);
    setSendError('');
    setSendOk('');
  }, [open, initial, existing, options, data.receiptNumberRanges, data.receiptIssues]);

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
      if (key === 'series') {
        const series = String(value);
        const preview = previewNextReceipt(
          series,
          data.receiptNumberRanges,
          data.receiptIssues,
        );
        return {
          ...prev,
          series,
          number: existing && !existing.voidedAt
            ? String(existing.number)
            : preview.ok
              ? String(preview.number)
              : '',
        };
      }
      return { ...prev, [key]: value };
    });
  }

  async function ensureIssued(emailed: boolean) {
    if (!draft.series.trim()) {
      return { ok: false as const, error: 'Ορίστε σειρά αποδείξεων στις Ρυθμίσεις → Αποδείξεις.' };
    }
    const result = await receiptBookService.allocateReceiptIssue({
      series: draft.series,
      transactionId,
      athleteId,
      emailed,
    });
    if (!result.success || !result.data) {
      return { ok: false as const, error: result.error ?? 'Δεν εκδόθηκε αριθμός απόδειξης.' };
    }
    setDraft((prev) => ({
      ...prev,
      series: result.data!.series,
      number: String(result.data!.number),
    }));
    refresh();
    return { ok: true as const, issue: result.data };
  }

  async function handlePrint() {
    setSendError('');
    const issued = await ensureIssued(false);
    if (!issued.ok) {
      setSendError(issued.error);
      return;
    }
    window.setTimeout(() => window.print(), 50);
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

    setSending(true);
    const issued = await ensureIssued(true);
    if (!issued.ok) {
      setSending(false);
      setSendError(issued.error);
      return;
    }

    const message = buildPaymentReceiptEmail({
      clubName,
      logoUrl,
      draft: {
        ...draft,
        series: issued.issue.series,
        number: String(issued.issue.number),
      },
    });
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
        ? `Η απόδειξη ${formatReceiptLabel(issued.issue.series, issued.issue.number)} στάλθηκε στο ${sent[0]}.`
        : `Η απόδειξη ${formatReceiptLabel(issued.issue.series, issued.issue.number)} στάλθηκε σε πατέρα και μητέρα (${sent.join(', ')}).`,
    );
  }

  const selectedOption = options.find((row) => row.series === draft.series);
  const bookHint = existing && !existing.voidedAt
    ? formatReceiptLabel(existing.series, existing.number)
    : selectedOption?.blocked
      ? selectedOption.series
        ? `Η σειρά ${selectedOption.series} έφτασε στο όριο. Προσθέστε νέο εύρος στις Ρυθμίσεις → Αποδείξεις.`
        : ''
      : selectedOption?.next
        ? `Επόμενος αριθμός: ${selectedOption.next} · απομένουν ${selectedOption.remaining}`
        : options.length === 0
          ? 'Ορίστε σειρά και εύρος αριθμών στις Ρυθμίσεις → Αποδείξεις.'
          : '';

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
          <Button type="button" disabled={sending} onClick={() => void handlePrint()}>
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
                {options.length > 1 ? (
                  <select
                    value={draft.series}
                    onChange={(e) => setField('series', e.target.value)}
                    disabled={Boolean(existing && !existing.voidedAt)}
                  >
                    <option value="">Επιλογή σειράς</option>
                    {options.map((row) => (
                      <option key={row.series} value={row.series}>
                        {row.series}
                        {row.next ? ` · επόμ. ${row.next}` : ' · εξαντλήθηκε'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={draft.series} readOnly placeholder="—" />
                )}
              </label>
              <label>
                <span>Νο</span>
                <input value={draft.number} readOnly placeholder="—" />
              </label>
            </div>
            {bookHint ? <p className="payment-receipt-book-hint">{bookHint}</p> : null}
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
