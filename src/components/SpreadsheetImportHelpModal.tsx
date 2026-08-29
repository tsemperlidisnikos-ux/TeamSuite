import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export function SpreadsheetImportHelpModal({
  open,
  onClose,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  steps: string[];
}) {
  return (
    <Modal
      open={open}
      title="Πώς να το χρησιμοποιήσετε"
      onClose={onClose}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Κλείσιμο
        </Button>
      }
    >
      <ol className="import-help-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </Modal>
  );
}
