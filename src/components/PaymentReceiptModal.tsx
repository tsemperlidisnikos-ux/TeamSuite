import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { amountToGreekWords } from '../utils/amountToGreekWords';

export type PaymentReceiptDraft = {
  date: string;
  series: string;
  number: string;
  amount: string;
  receivedFrom: string;
  address: string;
  amountWords: string;
  reason: string;
};

type PaymentReceiptModalProps = {
  open: boolean;
  logoUrl: string | null;
  clubName: string;
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
  initial,
  onClose,
}: PaymentReceiptModalProps) {
  const [draft, setDraft] = useState<PaymentReceiptDraft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    const next = { ...initial };
    if (!next.amountWords.trim() && next.amount.trim()) {
      next.amountWords = amountToGreekWords(next.amount);
    }
    setDraft(next);
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

  return (
    <Modal
      open={open}
      title="Απόδειξη είσπραξης"
      onClose={onClose}
      wide
      className="payment-receipt-modal"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Κλείσιμο
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
