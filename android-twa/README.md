# TeamSuite Android

Το APK είναι **Trusted Web Activity**: ανοίγει την ίδια live εφαρμογή στο Chrome. Χρειάζεται internet.

## Σύλλογος (γραμματεία)

Αρχείο: `C:\TeamSuite_backup\TeamSuite.apk` — ανοίγει `https://teamsuite-seven.vercel.app/`

```powershell
powershell -ExecutionPolicy Bypass -File "C:\TeamSuite\scripts\build-android-apk.ps1"
```

## Γονείς

Αρχείο: `C:\TeamSuite_backup\TeamSuite-Goneis.apk` — ανοίγει `https://teamsuite-seven.vercel.app/app/parent`

```powershell
powershell -ExecutionPolicy Bypass -File "C:\TeamSuite\scripts\build-android-parent-apk.ps1"
```

Στο κινητό: επιτρέψτε εγκατάσταση από άγνωστες πηγές και ανοίξτε το APK. Στο Chrome μπορείτε επίσης να ανοίξετε `/app/parent` και «Προσθήκη στην αρχική οθόνη».

## Προπονητές

Αρχείο: `C:\TeamSuite_backup\TeamSuite-Pronohtes.apk` — ανοίγει `https://teamsuite-seven.vercel.app/app/coach`

```powershell
powershell -ExecutionPolicy Bypass -File "C:\TeamSuite\scripts\build-android-coach-apk.ps1"
```

Στο κινητό: επιτρέψτε εγκατάσταση από άγνωστες πηγές και ανοίξτε το APK. Στο Chrome / Safari μπορείτε επίσης να ανοίξετε `/app/coach` και «Προσθήκη στην αρχική οθόνη».
