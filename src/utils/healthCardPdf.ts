import type { PDFDocument as PDFDocumentType, PDFImage, PDFPage } from 'pdf-lib';
import { isVolleyballSport } from './sport';

export type HealthCardAthleteInput = {
  sport?: string;
  amka?: string;
  gender?: string;
  lastName?: string;
  firstName?: string;
  email?: string;
  birthDate?: string;
  registrationNumber?: string;
  clubName?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  guardianPhone?: string;
  motherPhone?: string;
  fatherEmail?: string;
  motherEmail?: string;
  photoUrl?: string | null;
  medicalCertExpires?: string;
  heightCm?: string | number | null;
  weightKg?: string | number | null;
};

const PAGE_HEIGHT = 596;
const OVERLAY_FONT_SIZE = 10;
const CM_TO_PT = 72 / 2.54;
const PHOTO_WIDTH_CM = 3.35;
const PHOTO_HEIGHT_CM = 4.1;
const PHOTO_SHIFT_DOWN = 3;
const TITLE_VALUE_GAP = 18;

const DEFAULT_BLUE_FRAME = {
  left: 497.8,
  right: 589.3,
  top: 163.8,
  bottom: 274.8,
};

const VOLLEYBALL_BLUE_FRAME = {
  left: 497.7,
  right: 589.2,
  top: 177.9,
  bottom: 287.0,
};

const DEFAULT_FIELD_ANCHORS: Record<string, { labelEndX: number; baselineY: number }> = {
  registration_card_no: { labelEndX: 584.1, baselineY: 310.3 },
  first_name: { labelEndX: 537.6, baselineY: 335.8 },
  last_name: { labelEndX: 544.1, baselineY: 361.8 },
  father_name: { labelEndX: 554.6, baselineY: 387.8 },
  date_of_birth: { labelEndX: 565.1, baselineY: 413.4 },
  amka: { labelEndX: 539.6, baselineY: 438.9 },
  medical_cert_expires: { labelEndX: 580.4, baselineY: 528.5 },
};

const VOLLEYBALL_VALUE_X = 612;
const VOLLEYBALL_FIELD_ANCHORS: Record<string, { baselineY: number }> = {
  registration_card_no: { baselineY: 312.5 },
  first_name: { baselineY: 336.5 },
  last_name: { baselineY: 360.5 },
  father_name: { baselineY: 385.5 },
  date_of_birth: { baselineY: 410.5 },
  amka: { baselineY: 434.5 },
  medical_cert_expires: { baselineY: 523.0 },
};

const GENDER_LABELS: Record<string, string> = {
  boy: 'Αγόρι',
  girl: 'Κορίτσι',
  male: 'Άνδρας',
  female: 'Γυναίκα',
  other: 'Άλλο',
};

type OverlayField = {
  key: string;
  x: number;
  baselineY: number;
  maxLen: number;
};

function buildPhotoBox(blueFrame: typeof DEFAULT_BLUE_FRAME) {
  const photoTargetW = PHOTO_WIDTH_CM * CM_TO_PT;
  const photoTargetH = PHOTO_HEIGHT_CM * CM_TO_PT;
  const centerX = (blueFrame.left + blueFrame.right) / 2;
  const centerY = (blueFrame.top + blueFrame.bottom) / 2;
  return {
    x: centerX - photoTargetW / 2,
    yTop: centerY - photoTargetH / 2 + PHOTO_SHIFT_DOWN,
    width: photoTargetW,
    height: photoTargetH,
  };
}

function buildTemplateOverlay(
  fieldAnchors: Record<string, { labelEndX?: number; baselineY: number }>,
  options?: { valueX?: number },
): OverlayField[] {
  return Object.entries(fieldAnchors).map(([key, anchor]) => ({
    key,
    x: options?.valueX ?? (anchor.labelEndX ?? 0) + TITLE_VALUE_GAP,
    baselineY: anchor.baselineY,
    maxLen: key === 'registration_card_no' ? 38 : key === 'medical_cert_expires' ? 22 : 44,
  }));
}

function formatDateDots(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value).slice(0, 10).replace(/-/g, ' / ');
  }
  return d.toLocaleDateString('el-GR').replace(/\//g, ' / ');
}

function truncateText(text: string, maxLen = 42): string {
  const value = String(text ?? '').trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

function pdfBaselineY(baselineFromTop: number) {
  return PAGE_HEIGHT - baselineFromTop;
}

function buildFieldValues(athlete: HealthCardAthleteInput) {
  return {
    registration_card_no: athlete.registrationNumber || '',
    first_name: athlete.firstName || '',
    last_name: athlete.lastName || '',
    father_name: athlete.fatherFirstName || '',
    date_of_birth: formatDateDots(athlete.birthDate),
    amka: athlete.amka || '',
    medical_cert_expires: formatDateDots(athlete.medicalCertExpires),
    gender: GENDER_LABELS[athlete.gender || ''] || athlete.gender || '',
    email: athlete.email || '',
    association_name: athlete.clubName || '',
    sport: athlete.sport || '',
    mother_name: athlete.motherFirstName || '',
    parent_phone: athlete.guardianPhone || '',
    parent_phone_2: athlete.motherPhone || '',
    father_email: athlete.fatherEmail || '',
    mother_email: athlete.motherEmail || '',
    height_cm:
      athlete.heightCm != null && athlete.heightCm !== '' ? String(athlete.heightCm) : '',
    weight_kg:
      athlete.weightKg != null && athlete.weightKg !== '' ? String(athlete.weightKg) : '',
  };
}

async function embedPhoto(pdfDoc: PDFDocumentType, photoUrl: string | null | undefined) {
  if (!photoUrl) return null;
  try {
    let bytes: Uint8Array;
    if (photoUrl.startsWith('data:')) {
      const base64 = photoUrl.split(',')[1] ?? '';
      const binary = atob(base64);
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } else {
      const res = await fetch(photoUrl);
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (!bytes.length) return null;
    if (photoUrl.includes('image/png') || bytes[0] === 0x89) {
      return pdfDoc.embedPng(bytes);
    }
    return pdfDoc.embedJpg(bytes);
  } catch {
    return null;
  }
}

async function drawPhotoCover(
  page: PDFPage,
  image: PDFImage,
  blueFrame: typeof DEFAULT_BLUE_FRAME,
  photoBox: ReturnType<typeof buildPhotoBox>,
): Promise<void> {
  const { rgb } = await import('pdf-lib');
  const frameWidth = blueFrame.right - blueFrame.left;
  const frameHeight = blueFrame.bottom - blueFrame.top;
  page.drawRectangle({
    x: blueFrame.left,
    y: PAGE_HEIGHT - blueFrame.bottom,
    width: frameWidth,
    height: frameHeight,
    color: rgb(1, 1, 1),
  });

  const scale = Math.max(photoBox.width / image.width, photoBox.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = photoBox.x + (photoBox.width - width) / 2;
  const yBottom = PAGE_HEIGHT - photoBox.yTop - photoBox.height;
  const y = yBottom + (photoBox.height - height) / 2;
  page.drawImage(image, { x, y, width, height });
}

async function buildFallbackPdf(values: Record<string, string>): Promise<Uint8Array> {
  const [{ PDFDocument, StandardFonts, rgb }, { default: fontkit }] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  pdfDoc.registerFontkit(fontkit);

  let textFont;
  try {
    const fontRes = await fetch('/health-card/Arial-Bold.ttf');
    if (!fontRes.ok) throw new Error('font missing');
    textFont = await pdfDoc.embedFont(await fontRes.arrayBuffer());
  } catch {
    textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  let y = 800;
  page.drawText('ΚΑΡΤΑ ΥΓΕΙΑΣ ΑΘΛΗΤΗ', {
    x: 50,
    y,
    size: 16,
    font: textFont,
    color: rgb(0, 0, 0),
  });
  y -= 36;

  const rows: Array<[string, string]> = [
    ['Επώνυμο', values.last_name],
    ['Όνομα', values.first_name],
    ['ΑΜΚΑ', values.amka],
    ['Φύλο', values.gender],
    ['Ημερομηνία γέννησης', values.date_of_birth],
    ['Email', values.email],
    ['Αρ. Δελτίου', values.registration_card_no],
    ['Σωματείο', values.association_name],
    ['Άθλημα', values.sport],
    ['Όνομα πατέρα', values.father_name],
    ['Όνομα μητέρας', values.mother_name],
    ['Τηλέφωνο', values.parent_phone],
    ['Τηλέφωνο 2', values.parent_phone_2],
    ['Email πατέρα', values.father_email],
    ['Email μητέρας', values.mother_email],
    ['Λήξη ιατρικής βεβαίωσης', values.medical_cert_expires],
  ];

  for (const [label, value] of rows) {
    page.drawText(`${label}: ${value || '—'}`, {
      x: 50,
      y,
      size: 11,
      font: textFont,
      color: rgb(0, 0, 0),
    });
    y -= 22;
  }

  return pdfDoc.save();
}

export async function buildHealthCardPdf(
  athlete: HealthCardAthleteInput,
): Promise<{ success: boolean; data?: Blob; error?: string; volleyball?: boolean }> {
  try {
    const [{ PDFDocument }, { default: fontkit }] = await Promise.all([
      import('pdf-lib'),
      import('@pdf-lib/fontkit'),
    ]);
    const volleyball = isVolleyballSport(athlete.sport);
    const values = buildFieldValues(athlete);
    const templateUrl = volleyball
      ? '/health-card/health-card-volleyball-template.pdf'
      : '/health-card/health-card-template.pdf';

    const [templateRes, fontRes] = await Promise.all([
      fetch(templateUrl),
      fetch('/health-card/Arial-Bold.ttf'),
    ]);

    if (!templateRes.ok || !fontRes.ok) {
      const bytes = await buildFallbackPdf({ ...values, sport: athlete.sport || '' });
      return {
        success: true,
        data: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        volleyball,
      };
    }

    const pdfDoc = await PDFDocument.load(await templateRes.arrayBuffer());
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(await fontRes.arrayBuffer());
    const page = pdfDoc.getPages()[0];

    const blueFrame = volleyball ? VOLLEYBALL_BLUE_FRAME : DEFAULT_BLUE_FRAME;
    const overlay = volleyball
      ? buildTemplateOverlay(VOLLEYBALL_FIELD_ANCHORS, { valueX: VOLLEYBALL_VALUE_X })
      : buildTemplateOverlay(DEFAULT_FIELD_ANCHORS);
    const photoBox = buildPhotoBox(blueFrame);

    const photo = await embedPhoto(pdfDoc, athlete.photoUrl);
    if (photo) {
      await drawPhotoCover(page, photo, blueFrame, photoBox);
    }

    for (const field of overlay) {
      const raw = values[field.key as keyof typeof values];
      if (!raw) continue;
      const text = truncateText(raw, field.maxLen);
      page.drawText(text, {
        x: field.x,
        y: pdfBaselineY(field.baselineY),
        size: OVERLAY_FONT_SIZE,
        font,
        color: (await import('pdf-lib')).rgb(0, 0, 0),
      });
    }

    const bytes = await pdfDoc.save();
    return {
      success: true,
      data: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      volleyball,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία δημιουργίας PDF κάρτας υγείας';
    return { success: false, error: message };
  }
}
