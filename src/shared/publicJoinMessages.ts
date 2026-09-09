export function publicJoinConfirmationCopy(input: {
  clubName: string;
  firstName: string;
  lastName: string;
  licenseFull: boolean;
}): { message: string; emailLine: string } {
  if (input.licenseFull) {
    return {
      message:
        'Το πακέτο αδειών είναι γεμάτο. Η αίτησή σας μπήκε σε λίστα αναμονής. Ο σύλλογος θα επικοινωνήσει όταν ελευθερωθεί θέση.',
      emailLine:
        'Το πακέτο αδειών είναι γεμάτο, γι’ αυτό η αίτηση μπήκε σε λίστα αναμονής. Θα ενημερωθείτε όταν υπάρξει θέση.',
    };
  }
  return {
    message:
      'Λάβαμε την αίτηση. Ο σύλλογος θα την ελέγξει και θα ενεργοποιήσει τον αθλητή από Αθλητές → εκκρεμείς αιτήσεις.',
    emailLine: 'Η αίτηση εκκρεμεί έλεγχο από τον σύλλογο. Θα ενημερωθείτε μετά την έγκριση.',
  };
}
