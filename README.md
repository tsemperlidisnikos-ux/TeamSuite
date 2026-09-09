# TeamSuite

Ενιαία εφαρμογή διαχείρισης αθλητικού συλλόγου (μητρώο, πρόγραμμα, παρουσίες, οικονομικά, portals).

Production: `https://teamsuite-seven.vercel.app`

## Τι περιλαμβάνει

- Αθλητές, προπονητές, τμήματα, πρόγραμμα, παρουσίες, αγώνες
- Οικονομικά: χρεώσεις/πληρωμές, έσοδα-έξοδα, ταμεία, Viva / Stripe / Eurobank
- Portal γονέα / προπονητή / αθλητή
- Δημόσια εγγραφή (`/join/:slug`) και ενοικίαση (`/rent/:slug`)
- Platform Admin (σύλλογοι, άδειες, branding, backup)

## Δεδομένα και sync

Η εργασία γίνεται στο browser (`localStorage` + IndexedDB). Το **cloud mirror** (Vercel Blob / Redis) συγχρονίζει το μητρώο και τα οικονομικά μεταξύ συσκευών. Χωρίς επιτυχές Push, το νυχτερινό backup δεν έχει τι να αντιγράψει.

Ρυθμίσεις → Backup: Push/Pull, auto-sync (ενεργό από προεπιλογή).

## Εκκίνηση

```bash
npm install
npm run dev
```

Άνοιξε το URL του Vite (συνήθως `http://localhost:5173`).
