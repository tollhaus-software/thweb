import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Copy, Check, Upload, AlertCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t, CURRENT_LOCALE } from '../../utils/i18n';
import {
  type CalendarEvent,
  type ImportPreviewRow,
  EVENT_TYPE_LIST,
  buildCalendarLlmPromptSpec,
  parseEventsTsv,
  revalidatePreviewRows,
} from '../../utils/calendarEvents';

export interface EventsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const EventsImportModal: React.FC<EventsImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [existingEvents, setExistingEvents] = useState<CalendarEvent[]>([]);
  const [rawTsv, setRawTsv] = useState<string>('');
  const [mode, setMode] = useState<'skip_duplicates' | 'replace_range'>('skip_duplicates');
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [specExpanded, setSpecExpanded] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const promptSpec = useMemo(() => buildCalendarLlmPromptSpec(CURRENT_LOCALE), []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setRawTsv('');
    setRows([]);
    setMode('skip_duplicates');
    setSpecExpanded(false);
    setCopiedPrompt(false);

    let ignore = false;
    const loadExisting = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/events', { headers });
        if (res.ok) {
          const data: CalendarEvent[] = await res.json();
          if (!ignore) {
            setExistingEvents(Array.isArray(data) ? data : []);
          }
        }
      } catch (err) {
        console.error('Error fetching existing events for duplicate check:', err);
      }
    };
    void loadExisting();
    return () => {
      ignore = true;
    };
  }, [isOpen, token]);

  // Re-validate existing rows if existingEvents finishes loading or mode changes
  useEffect(() => {
    setRows((prev) => {
      if (prev.length === 0) return prev;
      const revalidated = revalidatePreviewRows(prev, existingEvents, mode);
      return revalidated.map((r) => ({
        ...r,
        included:
          r.errors.length > 0
            ? false
            : mode === 'skip_duplicates' && r.isDuplicate
              ? false
              : r.included || (mode === 'replace_range' && prev.find((p) => p.rowId === r.rowId)?.isDuplicate === true),
      }));
    });
  }, [existingEvents, mode]);

  if (!isOpen) return null;

  const handleTsvChange = (nextText: string) => {
    setRawTsv(nextText);
    setError(null);
    setRows(parseEventsTsv(nextText, existingEvents, mode));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      handleTsvChange(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Lesen der Datei');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptSpec);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Fallback textarea copy
      const el = document.createElement('textarea');
      el.value = promptSpec;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleUpdateRowField = (
    rowId: string,
    field: 'start_date' | 'end_date' | 'event_type' | 'start_time' | 'end_time' | 'title' | 'description',
    val: string
  ) => {
    setRows((prev) => {
      const updated = prev.map((r) => (r.rowId === rowId ? { ...r, [field]: val } : r));
      const revalidated = revalidatePreviewRows(updated, existingEvents, mode);
      return revalidated.map((r) => {
        if (r.rowId === rowId && r.errors.length === 0 && !r.isDuplicate) {
          return { ...r, included: true };
        }
        if (r.errors.length > 0) {
          return { ...r, included: false };
        }
        return r;
      });
    });
  };

  const handleToggleRowIncluded = (rowId: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, included: checked } : r))
    );
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => revalidatePreviewRows(prev.filter((r) => r.rowId !== rowId), existingEvents, mode));
  };

  const includedRows = rows.filter((r) => r.included);
  const includedHasErrors = includedRows.some((r) => r.errors.length > 0);
  const validCount = rows.filter((r) => r.errors.length === 0 && !r.isDuplicate).length;
  const dupCount = rows.filter((r) => r.errors.length === 0 && r.isDuplicate).length;
  const errCount = rows.filter((r) => r.errors.length > 0).length;

  const handleImportSubmit = async () => {
    if (includedRows.length === 0 || includedHasErrors) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payloadEvents = includedRows.map((r) => ({
        event_type: r.event_type.trim(),
        title: r.title.trim(),
        description: r.description.trim(),
        start_date: r.start_date.trim(),
        end_date: (r.end_date || r.start_date).trim(),
        start_time: r.start_time.trim() || null,
        end_time: r.end_time.trim() || null,
      }));

      const res = await fetch('/api/events/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode,
          events: payloadEvents,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      onImported();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Import');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="events-modal-overlay"
      onClick={onClose}
      data-testid="events-import-modal-overlay"
    >
      <div
        className="events-modal events-import-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-import-modal-title"
        data-testid="events-import-modal"
      >
        <div className="events-modal-header">
          <h3 id="events-import-modal-title">{t('eventsImportModalTitle')}</h3>
          <button
            type="button"
            className="events-icon-btn"
            onClick={onClose}
            aria-label={t('cancel')}
            data-testid="events-import-close-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className="events-modal-body">
          {error && (
            <div className="events-error-banner" role="alert" data-testid="events-import-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Copyable LLM Prompt & Specification */}
          <div className="events-spec-box" data-testid="events-import-spec-box">
            <div className="events-spec-header">
              <strong>{t('eventsImportSpecTitle')}</strong>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="events-secondary-btn"
                  onClick={() => setSpecExpanded((prev) => !prev)}
                  data-testid="events-import-toggle-spec-btn"
                >
                  {specExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  <span>
                    {specExpanded ? t('eventsImportHideSpec') : t('eventsImportShowSpec')}
                  </span>
                </button>
                <button
                  type="button"
                  className="events-primary-btn"
                  onClick={() => void handleCopyPrompt()}
                  data-testid="events-import-copy-prompt-btn"
                >
                  {copiedPrompt ? <Check size={15} /> : <Copy size={15} />}
                  <span>
                    {copiedPrompt ? t('eventsImportPromptCopied') : t('eventsImportCopyPromptBtn')}
                  </span>
                </button>
              </div>
            </div>
            {specExpanded && (
              <pre className="events-spec-pre" data-testid="events-import-spec-text">
                {promptSpec}
              </pre>
            )}
          </div>

          {/* Step 2: Upload .tsv or Paste TSV */}
          <div className="events-import-inputs">
            <div className="events-import-upload-row">
              <label htmlFor="events-import-paste" className="events-form-label">
                {t('eventsImportPasteLabel')}
              </label>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tsv,.txt,text/tab-separated-values"
                  onChange={(e) => void handleFileUpload(e)}
                  style={{ display: 'none' }}
                  data-testid="events-import-file-input"
                />
                <button
                  type="button"
                  className="events-secondary-btn"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="events-import-upload-btn"
                >
                  <Upload size={15} />
                  <span>{t('eventsImportUploadLabel')}</span>
                </button>
              </div>
            </div>

            <textarea
              id="events-import-paste"
              className="events-textarea events-tsv-textarea"
              value={rawTsv}
              onChange={(e) => handleTsvChange(e.target.value)}
              placeholder={t('eventsImportPastePlaceholder')}
              data-testid="events-import-paste-textarea"
            />
          </div>

          {/* Step 3: Editable Preview Table */}
          {rows.length > 0 && (
            <>
              <div className="events-preview-toolbar" data-testid="events-import-preview-toolbar">
                <div className="events-preview-stats">
                  <span className="events-stat-ok" data-testid="events-import-stat-valid">
                    ✓ {validCount} {t('eventsImportStatusNew')}
                  </span>
                  {dupCount > 0 && (
                    <span className="events-stat-dup" data-testid="events-import-stat-dup">
                      • {dupCount} {t('eventsImportStatusDuplicate')}
                    </span>
                  )}
                  {errCount > 0 && (
                    <span className="events-stat-err" data-testid="events-import-stat-err">
                      ⚠ {errCount} Fehler
                    </span>
                  )}
                </div>

                <div className="events-mode-toggle">
                  <button
                    type="button"
                    className={mode === 'skip_duplicates' ? 'active' : ''}
                    onClick={() => setMode('skip_duplicates')}
                    data-testid="events-import-mode-skip"
                  >
                    {t('eventsImportModeSkip')}
                  </button>
                  <button
                    type="button"
                    className={mode === 'replace_range' ? 'active' : ''}
                    onClick={() => setMode('replace_range')}
                    data-testid="events-import-mode-replace"
                  >
                    {t('eventsImportModeReplace')}
                  </button>
                </div>
              </div>

              <div className="events-preview-table-wrap">
                <table className="events-preview-table" data-testid="events-import-preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: '34px' }}>✓</th>
                      <th>{t('eventsStartDateLabel')}</th>
                      <th>{t('eventsEndDateLabel')}</th>
                      <th>{t('eventsTypeLabel')}</th>
                      <th>{t('eventsStartTimeLabel')}</th>
                      <th>{t('eventsEndTimeLabel')}</th>
                      <th>{t('eventsTitleLabel')}</th>
                      <th>{t('eventsDescriptionLabel')}</th>
                      <th>Status</th>
                      <th style={{ width: '34px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const hasError = row.errors.length > 0;
                      const rowClass = hasError
                        ? 'row-has-error'
                        : row.isDuplicate
                          ? 'row-is-duplicate'
                          : '';
                      return (
                        <tr
                          key={row.rowId}
                          className={rowClass}
                          data-testid={`events-import-preview-row-${idx}`}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={row.included}
                              disabled={hasError}
                              onChange={(e) => handleToggleRowIncluded(row.rowId, e.target.checked)}
                              data-testid={`events-import-row-check-${idx}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              value={row.start_date}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'start_date', e.target.value)}
                              data-testid={`events-import-row-start-date-${idx}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              value={row.end_date}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'end_date', e.target.value)}
                              data-testid={`events-import-row-end-date-${idx}`}
                            />
                          </td>
                          <td>
                            <select
                              className="events-preview-cell-input"
                              value={row.event_type}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'event_type', e.target.value)}
                              data-testid={`events-import-row-type-${idx}`}
                            >
                              {!EVENT_TYPE_LIST.some((m) => m.type === row.event_type) && (
                                <option value={row.event_type}>
                                  {row.event_type || '–'}
                                </option>
                              )}
                              {EVENT_TYPE_LIST.map((m) => (
                                <option key={m.type} value={m.type}>
                                  {CURRENT_LOCALE === 'en' ? m.labelEn : m.labelDe} ({m.type})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              style={{ minWidth: '64px' }}
                              placeholder="HH:MM"
                              value={row.start_time}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'start_time', e.target.value)}
                              data-testid={`events-import-row-start-time-${idx}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              style={{ minWidth: '64px' }}
                              placeholder="HH:MM"
                              value={row.end_time}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'end_time', e.target.value)}
                              data-testid={`events-import-row-end-time-${idx}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              value={row.title}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'title', e.target.value)}
                              data-testid={`events-import-row-title-${idx}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="events-preview-cell-input"
                              value={row.description}
                              onChange={(e) => handleUpdateRowField(row.rowId, 'description', e.target.value)}
                              data-testid={`events-import-row-desc-${idx}`}
                            />
                          </td>
                          <td data-testid={`events-import-row-status-${idx}`}>
                            {hasError ? (
                              <span className="events-preview-status-err">
                                {row.errors.join('; ')}
                              </span>
                            ) : row.isDuplicate ? (
                              <span className="events-preview-status-dup">
                                {t('eventsImportStatusDuplicate')}
                              </span>
                            ) : (
                              <span className="events-preview-status-ok">
                                {t('eventsImportStatusNew')}
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="events-icon-btn danger"
                              style={{ width: '26px', height: '26px' }}
                              onClick={() => handleRemoveRow(row.rowId)}
                              aria-label="Zeile entfernen"
                              data-testid={`events-import-row-remove-${idx}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="events-modal-footer">
          <button
            type="button"
            className="events-secondary-btn"
            onClick={onClose}
            disabled={submitting}
            data-testid="events-import-cancel-btn"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="events-primary-btn"
            onClick={() => void handleImportSubmit()}
            disabled={submitting || includedRows.length === 0 || includedHasErrors}
            data-testid="events-import-submit-btn"
          >
            {submitting
              ? '...'
              : `${t('eventsImportSubmitBtn')} (${includedRows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
