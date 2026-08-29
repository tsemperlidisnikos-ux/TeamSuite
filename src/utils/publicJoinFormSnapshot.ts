import { formatJoinExtrasLines, type PublicJoinExtras } from '../shared/publicJoinExtras';

export type PublicJoinSnapshotFields = {
  clubName: string;
  submittedAt: Date;
  amka: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  athleteEmail: string;
  phone: string;
  fatherFirstName: string;
  motherFirstName: string;
  fatherEmail: string;
  motherEmail: string;
  guardianPhone: string;
  motherPhone: string;
  address: string;
  postalCode: string;
  city: string;
  county: string;
  sport: string;
  uniformSize: string;
  notes: string;
  joinExtras?: PublicJoinExtras;
  guardianSignature?: string;
};

type JoinSnapshotSource = {
  createdAt?: string;
  amka?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  athleteEmail?: string;
  email?: string;
  phone?: string;
  fatherFirstName?: string;
  guardianName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  guardianPhone?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  sports?: string[];
  uniformSize?: string;
  notes?: string;
  comments?: string;
  joinExtras?: PublicJoinExtras;
  guardianSignature?: string;
};

function parseSubmittedAt(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function snapshotFieldsFromJoinSource(
  source: JoinSnapshotSource,
  clubName: string,
): PublicJoinSnapshotFields {
  return {
    clubName,
    submittedAt: parseSubmittedAt(source.createdAt),
    amka: source.amka ?? '',
    firstName: source.firstName ?? '',
    lastName: source.lastName ?? '',
    birthDate: source.birthDate ?? '',
    gender: source.gender ?? '',
    athleteEmail: source.athleteEmail ?? '',
    phone: source.phone ?? '',
    fatherFirstName: source.fatherFirstName || source.guardianName || '',
    motherFirstName: source.motherFirstName ?? '',
    fatherEmail: source.fatherEmail || source.email || '',
    motherEmail: source.motherEmail ?? '',
    guardianPhone: source.guardianPhone ?? '',
    motherPhone: source.motherPhone ?? '',
    address: source.address ?? '',
    postalCode: source.postalCode ?? '',
    city: source.city ?? '',
    county: source.county ?? '',
    sport: source.sport || source.sports?.[0] || '',
    uniformSize: source.uniformSize ?? '',
    notes: source.notes || source.comments || '',
    joinExtras: source.joinExtras,
    guardianSignature: source.guardianSignature,
  };
}

function genderLabel(value: string): string {
  if (value === 'boy') return 'Αγόρι';
  if (value === 'girl') return 'Κορίτσι';
  if (value === 'other') return 'Άλλο';
  return value || '—';
}

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const trial = `${current} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** JPEG data URL of the submitted public join form (for the athlete card). */
export async function renderPublicJoinFormSnapshot(
  input: PublicJoinSnapshotFields,
): Promise<string> {
  const width = 760;
  const pad = 28;
  const lineH = 20;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'ΑΜΚΑ', value: input.amka },
    { label: 'Όνομα', value: input.firstName },
    { label: 'Επώνυμο', value: input.lastName },
    { label: 'Ημ. γέννησης', value: input.birthDate },
    { label: 'Φύλο', value: genderLabel(input.gender) },
    { label: 'Email αθλητή', value: input.athleteEmail },
    { label: 'Τηλέφωνο αθλητή', value: input.phone },
    { label: 'Πατρώνυμο', value: input.fatherFirstName },
    { label: 'Μητρώνυμο', value: input.motherFirstName },
    { label: 'Email πατρός', value: input.fatherEmail },
    { label: 'Email μητρός', value: input.motherEmail },
    { label: 'Τηλέφωνο πατρός', value: input.guardianPhone },
    { label: 'Τηλέφωνο μητρός', value: input.motherPhone },
    { label: 'Διεύθυνση', value: input.address },
    { label: 'Τ.Κ.', value: input.postalCode },
    { label: 'Πόλη', value: input.city },
    { label: 'Νομός', value: input.county },
    { label: 'Άθλημα', value: input.sport },
    { label: 'Μέγεθος στολής', value: input.uniformSize },
    { label: 'Σχόλια', value: input.notes.trim() || '—' },
    ...formatJoinExtrasLines(input.joinExtras).map((line) => {
      const [label, ...rest] = line.split(':');
      return { label: (label || '').trim(), value: rest.join(':').trim() || '—' };
    }),
  ];

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas unavailable');
  measure.font = '13px sans-serif';
  const maxVal = width - pad * 2 - 168;
  let contentH = 92;
  for (const row of rows) {
    contentH += wrapLine(measure, row.value, maxVal).length * lineH + 4;
  }
  contentH += input.guardianSignature ? 150 : 24;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.ceil(contentH + pad);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, width - 24, canvas.height - 24);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Φόρμα δημόσιας εγγραφής', pad, 44);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(input.clubName, pad, 66);
  ctx.fillText(
    input.submittedAt.toLocaleString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    pad,
    86,
  );

  let y = 112;
  for (const row of rows) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(row.label, pad, y);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#0f172a';
    const lines = wrapLine(ctx, row.value, maxVal);
    lines.forEach((line, i) => {
      ctx.fillText(line, pad + 168, y + i * lineH);
    });
    y += lines.length * lineH + 4;
  }

  if (input.guardianSignature) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Υπογραφή', pad, y);
    y += 8;
    const sig = await loadImage(input.guardianSignature);
    if (sig) {
      const maxW = 280;
      const maxH = 110;
      const scale = Math.min(maxW / sig.width, maxH / sig.height, 1);
      ctx.drawImage(sig, pad + 168, y, sig.width * scale, sig.height * scale);
    }
  }

  let quality = 0.72;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 480_000 && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}
