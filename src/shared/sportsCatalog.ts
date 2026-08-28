/** Κατάλογος αθλημάτων για Ρυθμίσεις → Άθλημα (ομαδοποίηση όπως στο Academio-style picker). */

export type SportCatalogCategoryId =
  | 'team'
  | 'individual'
  | 'water'
  | 'martial'
  | 'racket'
  | 'dance'
  | 'gym'
  | 'winter'
  | 'other';

export interface SportCatalogEntry {
  /** Κανονικό όνομα εμφάνισης / αποθήκευσης. */
  name: string;
  /** Εναλλακτικά ονόματα για matching υπαρχόντων εγγραφών. */
  aliases?: string[];
}

export interface SportCatalogCategory {
  id: SportCatalogCategoryId;
  label: string;
  sports: SportCatalogEntry[];
}

export const SPORTS_CATALOG: SportCatalogCategory[] = [
  {
    id: 'team',
    label: 'Team',
    sports: [
      { name: 'Beach Volley' },
      { name: 'Boccia' },
      { name: 'Bowls' },
      { name: 'Croquet' },
      { name: 'Futsal' },
      { name: 'Gaelic Football' },
      { name: 'Lacrosse' },
      { name: 'Shinty' },
      { name: 'Soccer' },
      { name: 'Αμερικανικό Ποδόσφαιρο', aliases: ['American Football'] },
      { name: 'Βόλεϊ', aliases: ['Volleyball', 'VOLLEYBALL', 'Βόλεϊμπολ', 'Βόλλευ', 'Βόλεϋ'] },
      { name: 'Γυναικείο Ποδόσφαιρο', aliases: ["Women's Football"] },
      { name: 'Κρίκετ', aliases: ['Cricket'] },
      { name: 'Μπάσκετ', aliases: ['Basketball', 'BASKETBALL', 'Basket'] },
      { name: 'Μπέιζμπολ', aliases: ['Baseball'] },
      { name: 'Ποδόσφαιρο', aliases: ['Football', 'Soccer Football'] },
      { name: 'Ράγκμπι', aliases: ['Rugby'] },
      { name: 'Χάντμπολ', aliases: ['Handball'] },
      { name: 'Χόκεϊ', aliases: ['Hockey', 'Field Hockey'] },
    ],
  },
  {
    id: 'individual',
    label: 'Individual',
    sports: [
      { name: 'Polo' },
      { name: 'Αεραθλητισμός', aliases: ['Air sports'] },
      { name: 'Αναρρίχηση', aliases: ['Climbing'] },
      { name: 'Ιππασία', aliases: ['Equestrian'] },
      { name: 'Μηχανοκίνητος Αθλητισμός', aliases: ['Motor sports'] },
      { name: 'Μοντέρνο Πένταθλο', aliases: ['Modern Pentathlon'] },
      { name: 'Ορεινή Πεζοπορία', aliases: ['Mountain Hiking', 'Hiking'] },
      { name: 'Ορεινή Ποδηλασία', aliases: ['Mountain Biking', 'MTB'] },
      { name: 'Πένταθλο', aliases: ['Pentathlon'] },
      { name: 'Ποδηλασία', aliases: ['Cycling'] },
      { name: 'Ρόλερς', aliases: ['Rollers', 'Roller Skating'] },
      { name: 'Σκέιτ', aliases: ['Skate', 'Skateboarding'] },
      { name: 'Σκοποβολή', aliases: ['Shooting'] },
      { name: 'Στίβος', aliases: ['Athletics', 'Track and Field'] },
      { name: 'Τοξοβολία', aliases: ['Archery'] },
      { name: 'Τρίαθλο', aliases: ['Triathlon'] },
    ],
  },
  {
    id: 'water',
    label: 'Water sports',
    sports: [
      { name: 'Aqua Fitness' },
      { name: 'Baby Swimming' },
      { name: 'Stand Up Paddle', aliases: ['SUP'] },
      { name: 'Underwater Hockey' },
      { name: 'Ιστιοπλοΐα', aliases: ['Sailing'] },
      { name: 'Ιστιοπλοΐα Ανοικτής Θαλάσσης', aliases: ['Offshore Sailing'] },
      { name: 'Καγιάκ', aliases: ['Kayak', 'Kayaking'] },
      { name: 'Καλλιτεχνική Κολύμβηση', aliases: ['Artistic Swimming'] },
      { name: 'Καταδύσεις', aliases: ['Diving'] },
      { name: 'Κολύμβηση', aliases: ['Swimming'] },
      { name: 'Κωπηλασία', aliases: ['Rowing'] },
      { name: 'Συγχρονισμένη Κολύμβηση', aliases: ['Synchronized Swimming'] },
      { name: 'Υδατοσφαίριση', aliases: ['Water Polo'] },
    ],
  },
  {
    id: 'martial',
    label: 'Martial arts',
    sports: [
      { name: 'Aikido' },
      { name: 'Brazilian Jiu Jitsu', aliases: ['BJJ'] },
      { name: 'Extreme Martial Arts' },
      { name: 'Grappling' },
      { name: 'Haedong Kumdo' },
      { name: 'Jiu Jitsu' },
      { name: 'Kendo' },
      { name: 'Kick Boxing', aliases: ['Kickboxing'] },
      { name: 'Krav Maga' },
      { name: 'Kung Fu' },
      { name: 'MMA' },
      { name: 'Muay Thai' },
      { name: 'Okinawa te tai' },
      { name: 'Point Fighting' },
      { name: 'Soo Bahk Do' },
      { name: 'Striking MMA' },
      { name: 'Tae Kwon Do', aliases: ['Taekwondo'] },
      { name: 'Tang Soo Do' },
      { name: 'Wushu Sanda' },
      { name: 'Αυτοάμυνα', aliases: ['Self-defense', 'Self defence'] },
      { name: 'Καράτε', aliases: ['Karate'] },
      { name: 'Ξιφασκία', aliases: ['Fencing'] },
      { name: 'Παγκράτιο', aliases: ['Pankration'] },
      { name: 'Πάλη', aliases: ['Wrestling'] },
      { name: 'Πυγμαχία', aliases: ['Boxing'] },
      { name: 'Τζούντο', aliases: ['Judo'] },
    ],
  },
  {
    id: 'racket',
    label: 'Racket sports',
    sports: [
      { name: 'Badminton' },
      { name: 'Padel' },
      { name: 'Πινγκ Πονγκ', aliases: ['Ping Pong', 'Table Tennis'] },
      { name: 'Τένις', aliases: ['Tennis'] },
      { name: 'Τοιχοσφαίριση', aliases: ['Squash'] },
    ],
  },
  {
    id: 'dance',
    label: 'Dance & Performing arts',
    sports: [
      { name: 'Aerial Arts' },
      { name: 'Break Dance', aliases: ['Breakdance'] },
      { name: 'Cheerleading' },
      { name: 'Highland Dancing' },
      { name: 'Hip Hop' },
      { name: 'Latin' },
      { name: 'Musical Theater', aliases: ['Musical Theatre'] },
      { name: 'Ακροβατικά πανιά', aliases: ['Aerial silks'] },
      { name: 'Αργεντίνικο Tango', aliases: ['Argentine Tango'] },
      { name: 'Θέατρο', aliases: ['Theater', 'Theatre'] },
      { name: 'Κλασσικό Μπαλέτο', aliases: ['Classical Ballet', 'Ballet'] },
      { name: 'Μοντέρνος Χορός', aliases: ['Modern Dance'] },
      { name: 'Μουσικοκινητική Αγωγή' },
      { name: 'Σύγχρονος Χορός', aliases: ['Contemporary Dance'] },
      { name: 'Τραγούδι', aliases: ['Singing'] },
      { name: 'Τσιρλίντινγκ', aliases: ['ΤΣΙΡΛΙΝΤΙΝΓΚ'] },
      { name: 'Χορός', aliases: ['Dance'] },
    ],
  },
  {
    id: 'gym',
    label: 'Gymnastics & Fitness',
    sports: [
      { name: 'Babygym' },
      { name: 'Cross Training', aliases: ['CrossFit', 'Cross Training'] },
      { name: 'Kangoo' },
      { name: 'Parkour' },
      { name: 'Personal Training' },
      { name: 'Pilates' },
      { name: 'Tai Chi' },
      { name: 'Yoga' },
      { name: 'Άρση Βαρών', aliases: ['Weightlifting'] },
      { name: 'Αεροβική γυμναστική', aliases: ['Aerobics'] },
      { name: 'Αισθητική Ομαδική Γυμναστική' },
      { name: 'Ακροβατική γυμναστική', aliases: ['Acrobatic gymnastics'] },
      { name: 'Αποκατάσταση ΑΜΕΑ' },
      { name: 'Γυμναστική', aliases: ['Gymnastics'] },
      { name: 'Ενόργανη Γυμναστική', aliases: ['Artistic gymnastics'] },
      { name: 'Ενδυνάμωση', aliases: ['Strengthening'] },
      { name: 'Καλλισθενική γυμναστική', aliases: ['Calisthenics'] },
      { name: 'Ρυθμική Γυμναστική', aliases: ['Rhythmic Gymnastics'] },
      { name: 'Τραμπολίνο', aliases: ['Trampoline'] },
    ],
  },
  {
    id: 'winter',
    label: 'Winter sports',
    sports: [
      { name: 'Curling' },
      { name: 'Snowboarding' },
      { name: 'Χιονοδρομία', aliases: ['Skiing'] },
      { name: 'Χόκεϊ επί Πάγου', aliases: ['Ice Hockey'] },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    sports: [
      { name: 'Camp' },
      { name: 'E-Sports', aliases: ['Esports', 'eSports'] },
      { name: 'Ακαδημίες Κορίτσια', aliases: ["Girls' Academies"] },
      { name: 'Ανδρικό' },
      { name: 'Δραστηριότητες', aliases: ['Activities'] },
      { name: 'Σκάκι', aliases: ['Chess'] },
    ],
  },
];

export function normalizeSportKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Επιστρέφει το canonical όνομα καταλόγου αν υπάρχει match, αλλιώς null. */
export function resolveCatalogSportName(raw: string): string | null {
  const key = normalizeSportKey(raw);
  if (!key) return null;
  for (const category of SPORTS_CATALOG) {
    for (const sport of category.sports) {
      const candidates = [sport.name, ...(sport.aliases ?? [])];
      if (candidates.some((c) => normalizeSportKey(c) === key)) {
        return sport.name;
      }
    }
  }
  return null;
}

export function isSportSelected(
  selectedNames: Iterable<string>,
  catalogName: string,
  aliases: string[] = [],
): boolean {
  const selected = new Set(
    [...selectedNames]
      .map((n) => resolveCatalogSportName(String(n)) ?? String(n).trim())
      .map((n) => normalizeSportKey(n))
      .filter(Boolean),
  );
  const keys = [catalogName, ...aliases]
    .map((n) => resolveCatalogSportName(n) ?? n)
    .map(normalizeSportKey);
  return keys.some((k) => selected.has(k));
}

export function flattenCatalogSports(): SportCatalogEntry[] {
  return SPORTS_CATALOG.flatMap((c) => c.sports);
}
