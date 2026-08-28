import * as amkaAuditService from '../api/services/amkaAuditService';
import { getSession } from '../auth/auth';
import type { Student } from '../types';
import { buildHealthCardPdf } from './healthCardPdf';

export async function openAthleteHealthCardPreview(
  athlete: Pick<
    Student,
    | 'id'
    | 'sport'
    | 'amka'
    | 'gender'
    | 'lastName'
    | 'firstName'
    | 'email'
    | 'birthDate'
    | 'registrationNumber'
    | 'clubName'
    | 'fatherFirstName'
    | 'motherFirstName'
    | 'guardianPhone'
    | 'motherPhone'
    | 'fatherEmail'
    | 'motherEmail'
    | 'photoUrl'
  >,
): Promise<{ success: boolean; error?: string }> {
  const result = await buildHealthCardPdf({
    sport: athlete.sport,
    amka: athlete.amka,
    gender: athlete.gender,
    lastName: athlete.lastName,
    firstName: athlete.firstName,
    email: athlete.email,
    birthDate: athlete.birthDate,
    registrationNumber: athlete.registrationNumber,
    clubName: athlete.clubName,
    fatherFirstName: athlete.fatherFirstName,
    motherFirstName: athlete.motherFirstName,
    guardianPhone: athlete.guardianPhone,
    motherPhone: athlete.motherPhone,
    fatherEmail: athlete.fatherEmail,
    motherEmail: athlete.motherEmail,
    photoUrl: athlete.photoUrl,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Αποτυχία δημιουργίας PDF κάρτας υγείας' };
  }

  const pdfUrl = URL.createObjectURL(result.data);
  const features = [
    'popup=yes',
    'noopener=no',
    'noreferrer=no',
    `width=${screen.availWidth}`,
    `height=${screen.availHeight}`,
    'left=0',
    'top=0',
  ].join(',');

  const previewWindow = window.open('', 'healthCardPreview', features);
  if (!previewWindow) {
    URL.revokeObjectURL(pdfUrl);
    return { success: false, error: 'Επίτρεψε τα pop-up για την προεπισκόπηση κάρτας υγείας' };
  }

  previewWindow.opener = null;
  previewWindow.document.write(`<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <title>Προεπισκόπηση κάρτας υγείας</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: "Segoe UI", system-ui, sans-serif; background: #525659; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: #fff; border-bottom: 1px solid #cfe0db; }
    iframe { width: 100%; height: calc(100% - 64px); border: 0; }
  </style>
</head>
<body>
  <header>
    <strong>Κάρτα υγείας — προεπισκόπηση / εκτύπωση</strong>
    <div>
      <button type="button" onclick="document.querySelector('iframe').contentWindow.print()">Εκτύπωση</button>
      <button type="button" onclick="window.close()">Κλείσιμο</button>
    </div>
  </header>
  <iframe title="Κάρτα υγείας" src="${pdfUrl}"></iframe>
</body>
</html>`);
  previewWindow.document.close();
  previewWindow.addEventListener('unload', () => URL.revokeObjectURL(pdfUrl));

  const session = getSession();
  if (session) {
    void amkaAuditService.recordAmkaAccess({
      userId: session.id,
      userName: session.fullName || session.email || session.id,
      athleteId: athlete.id,
      athleteName: `${athlete.lastName} ${athlete.firstName}`.trim(),
      action: 'view',
    });
  }

  return { success: true };
}
