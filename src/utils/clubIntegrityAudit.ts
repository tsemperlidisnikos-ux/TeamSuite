import type { AppData, AthleteTransaction, Student } from '../types';
import { isRentalBookingCollected, rentalRevenueId } from '../api/services/rentalRevenueBridge';
import {
  isReceiptNumberInDeclaredRanges,
  normalizeReceiptIssues,
  normalizeReceiptRanges,
} from './receiptBook';

export type IntegritySeverity = 'critical' | 'warning' | 'info' | 'ok';

export type IntegrityFinding = {
  category: string;
  severity: IntegritySeverity;
  title: string;
  detail: string;
  fix: string;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function athleteName(students: Student[], id: string): string {
  const row = students.find((s) => s.id === id);
  if (!row) return id;
  return `${row.lastName} ${row.firstName}`.trim() || id;
}

function sample(lines: string[], cap = 6): string {
  if (!lines.length) return '';
  const shown = lines.slice(0, cap);
  const extra = lines.length > cap ? ` · +${lines.length - cap} ακόμη` : '';
  return ` Παραδείγματα: ${shown.join(' · ')}${extra}`;
}

function seasonStart(month: number, year: number): number {
  return month >= 8 ? year : year - 1;
}

function athleteSeasonBalance(
  athleteId: string,
  transactions: AthleteTransaction[],
  start: number,
): number {
  return transactions
    .filter((t) => t.athleteId === athleteId)
    .filter((t) => seasonStart(Number(t.month), Number(t.year)) === start)
    .reduce((sum, t) => sum + (t.type === 'charge' ? Number(t.amount) || 0 : -(Number(t.amount) || 0)), 0);
}

/** Έλεγχοι που ενώνουν συναλλαγές, έσοδα, καρτέλα αθλητή, αποδείξεις και ενοικιάσεις. */
export function auditClubIntegrity(clubName: string, data: AppData): IntegrityFinding[] {
  const prefix = clubName;
  const out: IntegrityFinding[] = [];
  const students = data.students ?? [];
  const tx = data.transactions ?? [];
  const payments = tx.filter((t) => t.type === 'payment');
  const charges = tx.filter((t) => t.type === 'charge');
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const revenues = data.revenues ?? [];
  const issues = normalizeReceiptIssues(data.receiptIssues);
  const ranges = normalizeReceiptRanges(data.receiptNumberRanges);
  const now = new Date();
  const currentSeason = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  const missingRevenue: string[] = [];
  const amountMismatch: string[] = [];
  const wrongAthlete: string[] = [];
  const brokenCharge: string[] = [];
  for (const payment of payments) {
    const name = athleteName(students, payment.athleteId);
    const linked = revenues.filter((r) => r.linkedTransactionId === payment.id);
    const sum = roundMoney(linked.reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const amt = roundMoney(payment.amount);
    if (linked.length === 0) {
      missingRevenue.push(`${name} ${amt.toFixed(2)} €`);
    } else if (Math.abs(sum - amt) > 0.02) {
      amountMismatch.push(`${name}: πληρωμή ${amt.toFixed(2)} € / έσοδα ${sum.toFixed(2)} €`);
    }
    if (payment.allocatesChargeId) {
      const charge = chargeById.get(payment.allocatesChargeId);
      if (!charge) {
        brokenCharge.push(`${name} → χρέωση ${payment.allocatesChargeId}`);
      } else if (charge.athleteId !== payment.athleteId) {
        wrongAthlete.push(
          `${name} πλήρωσε χρέωση του ${athleteName(students, charge.athleteId)}`,
        );
      }
    }
  }
  if (missingRevenue.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'critical',
      title: `${prefix}: ${missingRevenue.length} πληρωμές χωρίς έσοδο`,
      detail: `Η πληρωμή συνδρομής πρέπει να εμφανίζεται στα Οικονομικά → Έσοδα.${sample(missingRevenue)}`,
      fix: 'Τρέξτε Auto Repair (συμπληρώνει τα έσοδα) ή ανοίξτε Οικονομικά → Έσοδα για τον σύλλογο.',
    });
  } else if (payments.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'ok',
      title: `${prefix}: κάθε πληρωμή έχει έσοδο (${payments.length})`,
      detail: 'Πληρωμές αθλητών εμφανίζονται στα έσοδα με linkedTransactionId.',
      fix: 'Καμία ενέργεια.',
    });
  }
  if (amountMismatch.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'critical',
      title: `${prefix}: ${amountMismatch.length} πληρωμές με λάθος ποσό εσόδου`,
      detail: `Το άθροισμα εσόδων πρέπει να ισούται με την πληρωμή.${sample(amountMismatch)}`,
      fix: 'Διαγράψτε τα συνδεδεμένα έσοδα και τρέξτε Auto Repair, ή διορθώστε χειροκίνητα την πληρωμή.',
    });
  }
  if (brokenCharge.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'warning',
      title: `${prefix}: ${brokenCharge.length} πληρωμές σε ανύπαρκτη χρέωση`,
      detail: `allocatesChargeId δεν βρίσκει χρέωση.${sample(brokenCharge)}`,
      fix: 'Ξανατρέξτε Auto Repair (αντιστοίχιση) ή ανοίξτε Συναλλαγές και αντιστοιχίστε τη χρέωση.',
    });
  }
  if (wrongAthlete.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'critical',
      title: `${prefix}: ${wrongAthlete.length} πληρωμές σε χρέωση άλλου αθλητή`,
      detail: `Η καρτέλα και η χρέωση δεν ανήκουν στον ίδιο αθλητή.${sample(wrongAthlete)}`,
      fix: 'Συναλλαγές: διορθώστε την αντιστοίχιση ή διαγράψτε τη λάθος πληρωμή.',
    });
  }

  const overpaid: string[] = [];
  for (const charge of charges) {
    const paid = roundMoney(
      payments
        .filter((p) => p.allocatesChargeId === charge.id)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    );
    const due = roundMoney(charge.amount);
    if (paid > due + 0.02) {
      overpaid.push(
        `${athleteName(students, charge.athleteId)} ${charge.month}/${charge.year}: χρέωση ${due.toFixed(2)} € / εισπράξεις ${paid.toFixed(2)} €`,
      );
    }
  }
  if (overpaid.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'warning',
      title: `${prefix}: ${overpaid.length} χρεώσεις με υπέρβαση είσπραξης`,
      detail: `Οι πληρωμές που δεσμεύτηκαν στη χρέωση ξεπερνούν το ποσό.${sample(overpaid)}`,
      fix: 'Συναλλαγές: μειώστε/σπάστε πληρωμές ή διορθώστε το ποσό χρέωσης.',
    });
  }

  const orphanRev = revenues.filter((r) => {
    if (!r.linkedTransactionId) return false;
    return !payments.some((p) => p.id === r.linkedTransactionId);
  });
  if (orphanRev.length) {
    out.push({
      category: 'Συνοχή πληρωμών',
      severity: 'warning',
      title: `${prefix}: ${orphanRev.length} έσοδα χωρίς πληρωμή`,
      detail: 'linkedTransactionId δείχνει σε κίνηση που δεν υπάρχει.',
      fix: 'Οικονομικά → Έσοδα: διαγράψτε τις ορφανές γραμμές ή επαναφέρετε την πληρωμή από backup.',
    });
  }

  const leftover: string[] = [];
  const credit: string[] = [];
  for (const student of students) {
    const bal = roundMoney(athleteSeasonBalance(student.id, tx, currentSeason));
    if (bal > 0.02) leftover.push(`${student.lastName} ${student.firstName}: ${bal.toFixed(2)} €`);
    if (bal < -0.02) credit.push(`${student.lastName} ${student.firstName}: ${bal.toFixed(2)} €`);
  }
  if (credit.length) {
    out.push({
      category: 'Καρτέλα αθλητή',
      severity: 'warning',
      title: `${prefix}: ${credit.length} αθλητές με αρνητικό υπόλοιπο σεζόν`,
      detail: `Πληρώθηκαν περισσότερα από τις χρεώσεις της σεζόν ${currentSeason}–${currentSeason + 1}.${sample(credit)}`,
      fix: 'Ελέγξτε αν λείπει χρέωση ή αν η πληρωμή μπήκε σε λάθος μήνα/αθλητή.',
    });
  }
  if (leftover.length) {
    out.push({
      category: 'Καρτέλα αθλητή',
      severity: 'info',
      title: `${prefix}: ${leftover.length} αθλητές με ανοιχτό υπόλοιπο σεζόν`,
      detail: `Χρεώσεις μείον πληρωμές > 0 (καρτέλα Συναλλαγές).${sample(leftover)}`,
      fix: 'Πληροφοριακό. Δεν είναι σφάλμα αν οι οφειλές είναι πραγματικές.',
    });
  }
  if (students.length && !credit.length) {
    out.push({
      category: 'Καρτέλα αθλητή',
      severity: 'ok',
      title: `${prefix}: καρτέλες ενημερώνονται από τις κινήσεις`,
      detail: `Το υπόλοιπο κάθε αθλητή υπολογίζεται από χρεώσεις και πληρωμές (σεζόν ${currentSeason}–${currentSeason + 1}).`,
      fix: 'Καμία ενέργεια.',
    });
  }

  if (ranges.length) {
    const dupKeys = new Map<string, number>();
    const outOfRange: string[] = [];
    const issueByTx = new Map<string, { series: string; number: number }>();
    for (const row of issues) {
      const key = `${row.series}:${row.number}`;
      dupKeys.set(key, (dupKeys.get(key) ?? 0) + 1);
      if (!isReceiptNumberInDeclaredRanges(row.series, row.number, ranges)) {
        outOfRange.push(`Σειρά ${row.series} · Αρ. ${row.number}`);
      }
      if (row.transactionId) issueByTx.set(row.transactionId, row);
    }
    const dups = [...dupKeys.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (dups.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'critical',
        title: `${prefix}: ${dups.length} διπλοί αριθμοί απόδειξης`,
        detail: `Ο ίδιος αριθμός σειράς εκδόθηκε πάνω από μία φορά.${sample(dups)}`,
        fix: 'Ρυθμίσεις → Αποδείξεις → Μητρώο: ακυρώστε το λάθος και μην επαναχρησιμοποιείτε αριθμό.',
      });
    }
    if (outOfRange.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'critical',
        title: `${prefix}: ${outOfRange.length} αποδείξεις εκτός δηλωμένου εύρους`,
        detail: `Ο αριθμός δεν ανήκει στα εύρη του συλλόγου.${sample(outOfRange)}`,
        fix: 'Ρυθμίσεις → Αποδείξεις: προσθέστε το εύρος (π.χ. 201–250) ή διορθώστε την έκδοση.',
      });
    }

    const seqMismatch: string[] = [];
    const missingIssue: string[] = [];
    for (const payment of payments) {
      const issue = issueByTx.get(payment.id);
      if (payment.receiptSeq && issue && issue.number !== payment.receiptSeq) {
        seqMismatch.push(
          `${athleteName(students, payment.athleteId)}: κίνηση ${payment.receiptSeq} / μητρώο ${issue.number}`,
        );
      }
      const hasLabel = Boolean(payment.receiptNumber?.trim() || payment.receiptSeq);
      if (hasLabel && !issue) {
        missingIssue.push(
          `${athleteName(students, payment.athleteId)} ${payment.receiptNumber || payment.receiptSeq}`,
        );
      }
    }
    if (seqMismatch.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'warning',
        title: `${prefix}: ${seqMismatch.length} αποδείξεις με διαφορετικό αύξοντα στην κίνηση`,
        detail: `Το πεδίο απόδειξης της πληρωμής δεν ταιριάζει με το μητρώο.${sample(seqMismatch)}`,
        fix: 'Ανοίξτε την απόδειξη από τη συναλλαγή και επανεκδώστε / διορθώστε το μητρώο.',
      });
    }
    if (missingIssue.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'warning',
        title: `${prefix}: ${missingIssue.length} πληρωμές με αριθμό χωρίς εγγραφή μητρώου`,
        detail: `Υπάρχει κείμενο/αριθμός απόδειξης αλλά δεν κόπηκε στο βιβλίο.${sample(missingIssue)}`,
        fix: 'Από Συναλλαγές ανοίξτε Απόδειξη είσπραξης και εκτυπώστε/εκδώστε τον αριθμό.',
      });
    }

    const bySeries = new Map<string, number[]>();
    for (const row of issues) {
      const list = bySeries.get(row.series) ?? [];
      list.push(row.number);
      bySeries.set(row.series, list);
    }
    const holes: string[] = [];
    for (const [series, nums] of bySeries) {
      const uniq = [...new Set(nums)].sort((a, b) => a - b);
      if (uniq.length < 2) continue;
      const min = uniq[0]!;
      const max = uniq[uniq.length - 1]!;
      const set = new Set(uniq);
      let missing = 0;
      for (let n = min; n <= max; n += 1) {
        if (!set.has(n) && isReceiptNumberInDeclaredRanges(series, n, ranges)) missing += 1;
      }
      if (missing > 0) holes.push(`Σειρά ${series}: ${missing} κενά μεταξύ ${min}–${max}`);
    }
    if (holes.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'info',
        title: `${prefix}: κενά στην αρίθμηση αποδείξεων`,
        detail: `Λείπουν αριθμοί μέσα στο εύρος που έχει ήδη προχωρήσει.${sample(holes, 8)}`,
        fix: 'Ελέγξτε αν χάθηκαν εκδόσεις σε άλλη συσκευή (cloud Pull) ή αν παραλείφθηκε αριθμός.',
      });
    } else if (issues.length) {
      out.push({
        category: 'Αποδείξεις',
        severity: 'ok',
        title: `${prefix}: αρίθμηση αποδείξεων συνεχής (${issues.length} εκδόσεις)`,
        detail: 'Δεν βρέθηκαν διπλότυπα ούτε κενά μέσα στο ενεργό εύρος.',
        fix: 'Καμία ενέργεια.',
      });
    }
  }

  const bookings = data.rentalBookings ?? [];
  const collected = bookings.filter((b) => isRentalBookingCollected(b) && Number(b.amount) > 0);
  const missingRentalRev: string[] = [];
  for (const booking of collected) {
    const has =
      revenues.some((r) => r.linkedRentalBookingId === booking.id) ||
      revenues.some((r) => r.id === rentalRevenueId(booking.id));
    if (!has) {
      missingRentalRev.push(
        `${booking.customerName || booking.id} ${booking.date} ${Number(booking.amount).toFixed(2)} €`,
      );
    }
  }
  if (missingRentalRev.length) {
    out.push({
      category: 'Ενοικιάσεις',
      severity: 'critical',
      title: `${prefix}: ${missingRentalRev.length} εισπραγμένες ενοικιάσεις χωρίς έσοδο`,
      detail: `Η είσπραξη γηπέδου πρέπει να φαίνεται στα έσοδα.${sample(missingRentalRev)}`,
      fix: 'Τρέξτε Auto Repair ή ανοίξτε Ενοικίαση και ξανααποθηκεύστε την είσπραξη.',
    });
  } else if (collected.length) {
    out.push({
      category: 'Ενοικιάσεις',
      severity: 'ok',
      title: `${prefix}: εισπραγμένες ενοικιάσεις στα έσοδα (${collected.length})`,
      detail: 'Κάθε collected κράτηση έχει αντίστοιχο έσοδο.',
      fix: 'Καμία ενέργεια.',
    });
  }

  return out;
}
