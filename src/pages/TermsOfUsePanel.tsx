import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  Wand2,
} from 'lucide-react';
import * as termsOfUseService from '../api/services/termsOfUseService';
import { Button } from '../components/ui/Button';
import { SettingsFormRow } from '../components/ui/SettingsFormRow';
import { useAppData } from '../hooks/useAppData';
import { DEFAULT_TERMS_OF_USE_HTML } from '../shared/termsDefaults';

const DEFAULT_TERMS = DEFAULT_TERMS_OF_USE_HTML;

export function TermsOfUsePanel() {
  const { data, refresh } = useAppData();
  const editorRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = data.termsOfUseHtml?.trim()
      ? data.termsOfUseHtml
      : DEFAULT_TERMS;
  }, [data.termsOfUseHtml]);

  function applyFormat(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function handleAiHelp() {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = DEFAULT_TERMS;
    setMessage('Προστέθηκε πρότυπο κειμένου. Μπορείτε να το επεξεργαστείτε.');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const html = editorRef.current?.innerHTML?.trim() || '';
    const result = await termsOfUseService.saveTermsOfUse(html);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης');
      return;
    }
    refresh();
    setMessage('Οι όροι χρήσης αποθηκεύτηκαν.');
  }

  return (
    <section className="panel settings-panel settings-terms">
      <header className="settings-terms-head">
        <h3>Όροι χρήσης</h3>
        <p className="lede">Όροι χρήσης εγγραφής / Πολιτική απορρήτου</p>
      </header>

      <div className="settings-form">
        <SettingsFormRow label="Κείμενο όρων">
          <div className="ann-editor">
            <div className="ann-editor-toolbar">
              <select
                className="ann-editor-select"
                defaultValue="p"
                onChange={(e) => applyFormat('formatBlock', e.target.value)}
              >
                <option value="p">Normal</option>
                <option value="h2">Heading</option>
                <option value="h3">Subheading</option>
              </select>
              <button type="button" onClick={() => applyFormat('insertUnorderedList')} aria-label="Λίστα">
                <List size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('insertOrderedList')} aria-label="Αριθμημένη">
                <ListOrdered size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('justifyLeft')} aria-label="Αριστερά">
                <AlignLeft size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('justifyCenter')} aria-label="Κέντρο">
                <AlignCenter size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('justifyRight')} aria-label="Δεξιά">
                <AlignRight size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('bold')} aria-label="Έντονα">
                <Bold size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('italic')} aria-label="Πλάγια">
                <Italic size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('underline')} aria-label="Υπογράμμιση">
                <Underline size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('strikeThrough')} aria-label="Διαγραφή">
                <Strikethrough size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = window.prompt('URL συνδέσμου');
                  if (url) applyFormat('createLink', url);
                }}
                aria-label="Σύνδεσμος"
              >
                <Link2 size={16} />
              </button>
              <button type="button" onClick={() => applyFormat('removeFormat')} aria-label="Καθαρισμός">
                Tx
              </button>
            </div>
            <div
              ref={editorRef}
              className="ann-editor-body settings-terms-editor"
              contentEditable
              role="textbox"
              aria-multiline="true"
              suppressContentEditableWarning
            />
          </div>
          <button type="button" className="ann-ai-btn" onClick={handleAiHelp}>
            <Wand2 size={16} />
            Βοήθησέ με να γράψω
          </button>
        </SettingsFormRow>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <div className="settings-form-actions">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          Αποθήκευση
        </Button>
      </div>
    </section>
  );
}
