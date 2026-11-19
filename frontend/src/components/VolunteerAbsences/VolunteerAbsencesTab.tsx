import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  List,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { t, CURRENT_LOCALE } from '../../utils/i18n';
import { CalendarDropdown, type MarkedDateRange } from '../CalendarDropdown';
import './VolunteerAbsences.css';

export interface VolunteerAbsence {
  id: string;
  type: string; // 'bufdi'
  bufdi_name?: string;
  volunteer_name?: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  note: string;
  created_at?: string;
  updated_at?: string;
}

const formatDateDE = (isoStr: string): string => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoStr;
};

const formatIso = (y: number, m: number, d: number): string => {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const calcDays = (startIso: string, endIso: string): number => {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 0;
};

const checkOverlap = (s1: string, e1: string, s2: string, e2: string): boolean => {
  return s1 <= e2 && e1 >= s2;
};

const addDaysIso = (isoStr: string, days: number): string => {
  const parts = isoStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2] + days);
  return formatIso(d.getFullYear(), d.getMonth(), d.getDate());
};

const getClampedRange = (
  startIso: string,
  targetIso: string,
  absences: VolunteerAbsence[]
): { start: string; end: string } => {
  let s = startIso < targetIso ? startIso : targetIso;
  let e = startIso < targetIso ? targetIso : startIso;

  if (startIso <= targetIso) {
    const forwardAbsences = absences
      .filter((a) => a.start_date > startIso)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (forwardAbsences.length > 0) {
      const nextAbsence = forwardAbsences[0];
      const maxEnd = addDaysIso(nextAbsence.start_date, -1);
      if (e > maxEnd) {
        e = maxEnd;
      }
    }
  } else {
    const backwardAbsences = absences
      .filter((a) => a.end_date < startIso)
      .sort((a, b) => b.end_date.localeCompare(a.end_date));
    if (backwardAbsences.length > 0) {
      const prevAbsence = backwardAbsences[0];
      const minStart = addDaysIso(prevAbsence.end_date, 1);
      if (s < minStart) {
        s = minStart;
      }
    }
  }
  return { start: s, end: e };
};

export const VolunteerAbsencesTab: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('volunteers.absences.write');

  const [absences, setAbsences] = useState<VolunteerAbsence[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth());

  // Modal states
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingAbsence, setEditingAbsence] = useState<VolunteerAbsence | null>(null);

  // Form states
  const [formType, setFormType] = useState<string>('bufdi');
  const [formBufdiName, setFormBufdiName] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState<string>('');
  const [formEndDate, setFormEndDate] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Date picker dropdown anchors
  const [startPickerOpen, setStartPickerOpen] = useState<boolean>(false);
  const [endPickerOpen, setEndPickerOpen] = useState<boolean>(false);
  const startBtnRef = useRef<HTMLButtonElement>(null);
  const endBtnRef = useRef<HTMLButtonElement>(null);

  // Delete confirm state
  const [deletingAbsence, setDeletingAbsence] = useState<VolunteerAbsence | null>(null);

  // Settings states
  const [bufdiName, setBufdiName] = useState<string>('BuFDI');
  const [savedBufdiName, setSavedBufdiName] = useState<string>('BuFDI');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState<boolean>(false);

  // Range marking mode states
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [selectionHover, setSelectionHover] = useState<string | null>(null);
  const [hoveredAbsenceId, setHoveredAbsenceId] = useState<string | null>(null);

  // Clamped effective range during selection
  const effectiveRange = useMemo(() => {
    if (!selectionStart) return null;
    const target = selectionHover || selectionStart;
    return getClampedRange(selectionStart, target, absences);
  }, [selectionStart, selectionHover, absences]);

  // Cancel selection on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectionStart) {
        setSelectionStart(null);
        setSelectionHover(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionStart]);

  const fetchAbsences = useCallback(async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/volunteer-absences', { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch volunteer absences: ${res.status}`);
      }
      const data: VolunteerAbsence[] = await res.json();
      setAbsences(data || []);
    } catch (err) {
      console.error('Error fetching volunteer absences:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchSettings = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/volunteer-absences/settings', { headers });
      if (res.ok) {
        const data = await res.json();
        const name = data.bufdi_name || 'BuFDI';
        setBufdiName(name);
        setSavedBufdiName(name);
      }
    } catch (err) {
      console.error('Error fetching volunteer absence settings:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchAbsences();
    fetchSettings();
  }, [fetchAbsences, fetchSettings]);

  const handleSaveBufdiName = async () => {
    if (!canWrite || savingSettings) return;
    setSavingSettings(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const trimmed = bufdiName.trim() || 'BuFDI';
      const res = await fetch('/api/volunteer-absences/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ bufdi_name: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.bufdi_name || trimmed;
        setBufdiName(updated);
        setSavedBufdiName(updated);
        setSettingsSavedSuccess(true);
        setTimeout(() => setSettingsSavedSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Error saving volunteer absence settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRealtimeMessage = useCallback((msg: RealtimeMessage) => {
    if (
      msg.type === 'VOLUNTEER_ABSENCE_CREATED' ||
      msg.type === 'VOLUNTEER_ABSENCE_UPDATED' ||
      msg.type === 'VOLUNTEER_ABSENCE_DELETED'
    ) {
      fetchAbsences();
    }
    if (msg.type === 'VOLUNTEER_ABSENCE_SETTINGS_UPDATED') {
      fetchSettings();
    }
  }, [fetchAbsences, fetchSettings]);

  useRealtime(handleRealtimeMessage);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  const monthNames = CURRENT_LOCALE === 'de'
    ? ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const weekdays = CURRENT_LOCALE === 'de'
    ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // Calendar cells computation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Monday = 0
  const blanks = Array.from({ length: firstDayIndex }, () => null);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const todayStr = useMemo(() => {
    const d = new Date();
    return formatIso(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Marked ranges for date pickers (excludes current editing item)
  const pickerMarkedRanges: MarkedDateRange[] = useMemo(() => {
    return absences
      .filter((a) => !editingAbsence || a.id !== editingAbsence.id)
      .map((a) => ({
        startDate: a.start_date,
        endDate: a.end_date,
        label: `${a.type.toUpperCase()}${a.note ? `: ${a.note}` : ''}`,
      }));
  }, [absences, editingAbsence]);

  // Sorted and limited for List view (newer first, top 40)
  const listAbsences = useMemo(() => {
    return [...absences]
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
      .slice(0, 40);
  }, [absences]);

  // Modal open handlers
  const openCreateModal = (prefillStartDate?: string, prefillEndDate?: string) => {
    setEditingAbsence(null);
    setFormType('bufdi');
    setFormBufdiName(savedBufdiName || 'BuFDI');
    const initialStart = prefillStartDate || todayStr;
    const initialEnd = prefillEndDate || initialStart;
    setFormStartDate(initialStart);
    setFormEndDate(initialEnd);
    setFormNote('');
    setFormError(null);
    setModalOpen(true);
    setSelectionStart(null);
    setSelectionHover(null);
  };

  const openEditModal = (absence: VolunteerAbsence) => {
    setEditingAbsence(absence);
    setFormType(absence.type || 'bufdi');
    setFormBufdiName(absence.bufdi_name || absence.volunteer_name || savedBufdiName || 'BuFDI');
    setFormStartDate(absence.start_date);
    setFormEndDate(absence.end_date);
    setFormNote(absence.note || '');
    setFormError(null);
    setModalOpen(true);
    setSelectionStart(null);
    setSelectionHover(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAbsence(null);
    setFormBufdiName('');
    setFormError(null);
  };

  // Form submit handler
  const handleSaveAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formStartDate || !formEndDate) {
      setFormError(t('absenceSelectStartEndError') || 'Bitte Start- und Enddatum auswählen.');
      return;
    }

    if (formEndDate < formStartDate) {
      setFormError(t('absenceEndDateBeforeStartError') || 'Das Enddatum muss am oder nach dem Startdatum liegen.');
      return;
    }

    // Check overlap with other absences
    const hasOverlap = absences.some((a) => {
      if (editingAbsence && a.id === editingAbsence.id) return false;
      return checkOverlap(formStartDate, formEndDate, a.start_date, a.end_date);
    });

    if (hasOverlap) {
      setFormError(t('absenceOverlapError') || 'Dieser Zeitraum überschneidet sich mit einer bestehenden Abwesenheit.');
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        type: formType,
        bufdi_name: formBufdiName.trim() || savedBufdiName.trim() || 'BuFDI',
        start_date: formStartDate,
        end_date: formEndDate,
        note: formNote.trim(),
      };

      const url = editingAbsence
        ? `/api/volunteer-absences/${editingAbsence.id}`
        : '/api/volunteer-absences';
      const method = editingAbsence ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error(errorData.error || t('absenceOverlapError') || 'Dieser Zeitraum überschneidet sich mit einer bestehenden Abwesenheit.');
        }
        throw new Error(errorData.error || `Fehler beim Speichern (${res.status})`);
      }

      await fetchAbsences();
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Ein Fehler ist aufgetreten.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete handler
  const handleDeleteAbsence = async (absence: VolunteerAbsence) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/volunteer-absences/${absence.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        throw new Error(`Fehler beim Löschen (${res.status})`);
      }

      await fetchAbsences();
      setDeletingAbsence(null);
    } catch (err) {
      console.error('Error deleting absence:', err);
      alert(t('absenceDeleteError') || 'Fehler beim Löschen der Abwesenheit.');
    }
  };

  // Format type name for display
  const formatTypeName = (type: string) => {
    if (type.toLowerCase() === 'bufdi') return 'BuFDI';
    return type.toUpperCase();
  };

  return (
    <div className="volunteer-absences-container" data-testid="volunteer-absences-tab">
      {/* Top Header */}
      <div className="va-header">
        <div className="va-header-left">
          <h2 className="va-header-title">
            {t('volunteerAbsencesTitle') || 'Abwesenheiten Freiwillige'}
          </h2>

          <div className="va-month-nav">
            <button
              type="button"
              onClick={handlePrevMonth}
              title={t('absencePrevMonth') || 'Vorheriger Monat'}
              aria-label={t('absencePrevMonth') || 'Vorheriger Monat'}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="va-month-label">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              title={t('absenceNextMonth') || 'Nächster Monat'}
              aria-label={t('absenceNextMonth') || 'Nächster Monat'}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            className="va-today-btn"
            onClick={handleToday}
          >
            {t('absenceToday') || 'Heute'}
          </button>
        </div>

        <div className="va-header-right">
          <div className="va-view-toggle">
            <button
              type="button"
              className={`va-view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              <CalendarIcon size={14} />
              <span>{t('absenceCalendarView') || 'Kalender'}</span>
            </button>
            <button
              type="button"
              className={`va-view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
              <span>{t('absenceListView') || 'Liste'}</span>
            </button>
          </div>

          {canWrite && (
            <button
              type="button"
              className="va-add-btn"
              onClick={() => openCreateModal()}
            >
              <Plus size={16} />
              <span>{t('addVolunteerAbsence') || 'Abwesenheit eintragen'}</span>
            </button>
          )}
        </div>
      </div>

      {/* BuFDI Name Configuration Bar */}
      <div className="va-settings-bar" data-testid="va-settings-bar">
        <label htmlFor="va-bufdi-name-input" className="va-settings-label">
          {t('bufdiNameLabel') || 'BuFDI Name(n) (für Kochansicht):'}
        </label>
        <div className="va-settings-input-wrapper">
          <input
            id="va-bufdi-name-input"
            data-testid="va-bufdi-name-input"
            type="text"
            className="va-settings-input"
            value={bufdiName}
            disabled={!canWrite || savingSettings}
            placeholder={t('bufdiNamePlaceholder') || 'z. B. Max'}
            onChange={(e) => setBufdiName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSaveBufdiName();
              }
            }}
          />
          {canWrite && (
            <button
              type="button"
              className="va-settings-save-btn"
              data-testid="va-bufdi-name-save-btn"
              onClick={() => void handleSaveBufdiName()}
              disabled={savingSettings || bufdiName.trim() === savedBufdiName.trim()}
            >
              {savingSettings ? '...' : (t('save') || 'Speichern')}
            </button>
          )}
          {settingsSavedSuccess && (
            <span className="va-settings-saved-badge" data-testid="va-bufdi-name-saved-badge">
              ✓ {t('bufdiNameSaved') || 'Gespeichert'}
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'calendar' ? (
        <div className="va-calendar-card">
          {selectionStart && (
            <div className="va-selection-bar" role="status" aria-live="polite">
              <div className="va-selection-info">
                <span className="va-selection-indicator" />
                <span>
                  Start: <strong>{formatDateDE(selectionStart)}</strong> –{' '}
                  <span className="va-selection-action">{t('absenceSelectEndDate') || 'Enddatum auswählen'}</span>
                </span>
              </div>
              <button
                type="button"
                className="va-selection-cancel-btn"
                onClick={() => {
                  setSelectionStart(null);
                  setSelectionHover(null);
                }}
                title={t('absenceSelectionCancel') || 'Auswahl abbrechen (Esc)'}
              >
                <X size={14} />
                <span>{t('cancel') || 'Abbrechen'}</span>
              </button>
            </div>
          )}

          <div className="va-grid-weekdays">
            {weekdays.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          <div className="va-grid-days">
            {blanks.map((_, idx) => (
              <div key={`blank-${idx}`} className="va-day-cell is-empty" />
            ))}

            {monthDays.map((day) => {
              const dateIso = formatIso(currentYear, currentMonth, day);
              const isToday = dateIso === todayStr;
              const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const dayAbsences = absences.filter(
                (a) => dateIso >= a.start_date && dateIso <= a.end_date
              );
              const hasAbsence = dayAbsences.length > 0;
              const isWeekdayOk = !hasAbsence && !isWeekend;

              const isAbsenceHovered = Boolean(
                hoveredAbsenceId && dayAbsences.some((a) => a.id === hoveredAbsenceId)
              );
              const isRangeStart = selectionStart === dateIso;
              const isInRange = Boolean(
                effectiveRange && dateIso >= effectiveRange.start && dateIso <= effectiveRange.end
              );

              const handleCellClick = () => {
                if (hasAbsence) {
                  if (canWrite) {
                    openEditModal(dayAbsences[0]);
                  }
                  return;
                }
                if (!canWrite) return;

                if (!selectionStart) {
                  setSelectionStart(dateIso);
                  setSelectionHover(dateIso);
                } else {
                  const range = getClampedRange(selectionStart, dateIso, absences);
                  openCreateModal(range.start, range.end);
                }
              };

              const handleCellMouseEnter = () => {
                if (hasAbsence) {
                  if (!selectionStart) {
                    setHoveredAbsenceId(dayAbsences[0].id);
                  }
                } else if (hoveredAbsenceId) {
                  setHoveredAbsenceId(null);
                }
                if (selectionStart && canWrite) {
                  setSelectionHover(dateIso);
                }
              };

              const handleCellMouseLeave = () => {
                if (hoveredAbsenceId) {
                  setHoveredAbsenceId(null);
                }
              };

              let cellTitle: string | undefined = undefined;
              if (hasAbsence) {
                const a = dayAbsences[0];
                const displayName = a.bufdi_name || formatTypeName(a.type);
                cellTitle = `${displayName}${a.note ? `: ${a.note}` : ''} (${formatDateDE(a.start_date)} – ${formatDateDE(a.end_date)})${canWrite ? ' – Klicken zum Bearbeiten' : ''}`;
              } else if (selectionStart && canWrite) {
                cellTitle = `Enddatum auswählen: ${formatDateDE(dateIso)}`;
              } else if (canWrite) {
                cellTitle = `Abwesenheit ab ${formatDateDE(dateIso)} eintragen`;
              }

              return (
                <div
                  key={`day-${day}`}
                  className={`va-day-cell ${isToday ? 'is-today' : ''} ${isWeekend ? 'is-weekend' : ''} ${isWeekdayOk ? 'is-weekday-ok' : ''} ${hasAbsence ? 'has-absence' : ''} ${isRangeStart ? 'is-range-start' : ''} ${isInRange ? 'is-in-range' : ''} ${isAbsenceHovered ? 'is-absence-hovered' : ''} ${canWrite ? 'clickable' : ''}`}
                  onClick={handleCellClick}
                  onMouseEnter={handleCellMouseEnter}
                  onMouseLeave={handleCellMouseLeave}
                  title={cellTitle}
                >
                  <div className="va-day-header">
                    <span className="va-day-number">{day}</span>
                    {canWrite && hasAbsence && isAbsenceHovered && (
                      <span className="va-hover-pencil" title={t('editVolunteerAbsence') || 'Abwesenheit bearbeiten'}>
                        <Pencil size={11} />
                      </span>
                    )}
                  </div>

                  <div className="va-day-events">
                    {dayAbsences.map((a) => (
                      <div
                        key={a.id}
                        className="va-absence-badge"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canWrite) {
                            openEditModal(a);
                          }
                        }}
                        onMouseEnter={() => {
                          if (!selectionStart) {
                            setHoveredAbsenceId(a.id);
                          }
                        }}
                        title={`${a.bufdi_name || formatTypeName(a.type)}${a.note ? `: ${a.note}` : ''} (${formatDateDE(a.start_date)} – ${formatDateDE(a.end_date)})`}
                      >
                        <span className="va-badge-type">{a.bufdi_name || formatTypeName(a.type)}</span>
                        {a.note && <span className="va-badge-note">{a.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="va-list-card">
          {loading && absences.length === 0 ? (
            <div className="va-empty-state">
              <p>Laden...</p>
            </div>
          ) : listAbsences.length === 0 ? (
            <div className="va-empty-state">
              <p>{t('noVolunteerAbsences') || 'Keine Abwesenheiten eingetragen.'}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <table className="va-table va-desktop-table">
                <thead>
                  <tr>
                    <th>{t('absenceType') || 'Typ'}</th>
                    <th>{t('absenceStartDate') || 'Startdatum'} – {t('absenceEndDate') || 'Enddatum'}</th>
                    <th>{t('absenceDuration') || 'Dauer'}</th>
                    <th>{t('absenceNote') || 'Notiz'}</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>{t('absenceActions') || 'Aktionen'}</th>}
                  </tr>
                </thead>
                <tbody>
                  {listAbsences.map((a) => {
                    const days = calcDays(a.start_date, a.end_date);
                    return (
                      <tr key={a.id}>
                        <td>
                          <span className="va-type-pill">{a.bufdi_name || formatTypeName(a.type)}</span>
                        </td>
                        <td>
                          <strong>{formatDateDE(a.start_date)}</strong> – <strong>{formatDateDE(a.end_date)}</strong>
                        </td>
                        <td>
                          {days} {days === 1 ? (t('absenceDay') || 'Tag') : (t('absenceDays') || 'Tage')}
                        </td>
                        <td>
                          {a.note || '-'}
                        </td>
                        {canWrite && (
                          <td>
                            <div className="va-actions-cell">
                              <button
                                type="button"
                                className="va-icon-btn"
                                onClick={() => openEditModal(a)}
                                title="Bearbeiten"
                                aria-label="Bearbeiten"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="va-icon-btn delete-btn"
                                onClick={() => setDeletingAbsence(a)}
                                title="Löschen"
                                aria-label="Löschen"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Cards View */}
              <div className="va-mobile-cards">
                {listAbsences.map((a) => {
                  const days = calcDays(a.start_date, a.end_date);
                  return (
                    <div
                      key={`card-${a.id}`}
                      className={`va-card ${canWrite ? 'clickable' : ''}`}
                      onClick={() => {
                        if (canWrite) openEditModal(a);
                      }}
                    >
                      <div className="va-card-header">
                        <span className="va-card-range">
                          <strong>{formatDateDE(a.start_date)}</strong> – <strong>{formatDateDE(a.end_date)}</strong>
                        </span>
                        {canWrite && (
                          <div className="va-card-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="va-icon-btn"
                              onClick={() => openEditModal(a)}
                              title="Bearbeiten"
                              aria-label="Bearbeiten"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="va-icon-btn delete-btn"
                              onClick={() => setDeletingAbsence(a)}
                              title="Löschen"
                              aria-label="Löschen"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="va-card-meta">
                        <span className="va-type-pill">{a.bufdi_name || formatTypeName(a.type)}</span>
                        <span className="va-card-duration">
                          {days} {days === 1 ? (t('absenceDay') || 'Tag') : (t('absenceDays') || 'Tage')}
                        </span>
                      </div>

                      {a.note && (
                        <div className="va-card-note">
                          <span className="va-card-note-label">{t('absenceNote') || 'Notiz'}:</span>
                          <span>{a.note}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="va-modal-backdrop" onClick={closeModal}>
          <div
            className="va-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="va-modal-header">
              <h3>
                {editingAbsence
                  ? (t('editVolunteerAbsence') || 'Abwesenheit bearbeiten')
                  : (t('addVolunteerAbsence') || 'Abwesenheit eintragen')}
              </h3>
              <button
                type="button"
                className="va-modal-close-btn"
                onClick={closeModal}
                aria-label="Schließen"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAbsence} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formError && (
                <div className="va-alert-error">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="va-form-group">
                <label htmlFor="va-type-select">{t('absenceType') || 'Typ'}</label>
                <select
                  id="va-type-select"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  <option value="bufdi">BuFDI</option>
                </select>
              </div>

              <div className="va-form-group">
                <label htmlFor="va-modal-bufdi-name-input">{t('absenceBufdiName') || 'BuFDI Name'}</label>
                <input
                  id="va-modal-bufdi-name-input"
                  data-testid="va-modal-bufdi-name-input"
                  type="text"
                  value={formBufdiName}
                  onChange={(e) => setFormBufdiName(e.target.value)}
                  placeholder={savedBufdiName || 'BuFDI'}
                />
              </div>

              <div className="va-form-group">
                <label>{t('absenceStartDate') || 'Startdatum'}</label>
                <div className="va-input-with-btn">
                  <input
                    type="text"
                    value={formatDateDE(formStartDate)}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val.includes('.')) {
                        const parts = val.split('.');
                        if (parts.length === 3 && parts[2].length === 4) {
                          setFormStartDate(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                        }
                      } else {
                        setFormStartDate(val);
                      }
                    }}
                    placeholder="TT.MM.JJJJ"
                  />
                  <button
                    ref={startBtnRef}
                    type="button"
                    className="va-picker-btn"
                    onClick={() => {
                      setStartPickerOpen((prev) => !prev);
                      setEndPickerOpen(false);
                    }}
                    title="Startdatum wählen"
                  >
                    <CalendarIcon size={16} />
                  </button>
                </div>
                <CalendarDropdown
                  anchorRef={startBtnRef}
                  isOpen={startPickerOpen}
                  onClose={() => setStartPickerOpen(false)}
                  selectedDateStr={formStartDate}
                  markedRanges={pickerMarkedRanges}
                  onSelectDate={(formatted) => {
                    let iso = formatted;
                    if (formatted.includes('.')) {
                      const [d, m, y] = formatted.split('.');
                      iso = `${y}-${m}-${d}`;
                    }
                    setFormStartDate(iso);
                    if (!formEndDate || formEndDate < iso) {
                      setFormEndDate(iso);
                    }
                    setStartPickerOpen(false);
                  }}
                />
              </div>

              <div className="va-form-group">
                <label>{t('absenceEndDate') || 'Enddatum'}</label>
                <div className="va-input-with-btn">
                  <input
                    type="text"
                    value={formatDateDE(formEndDate)}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val.includes('.')) {
                        const parts = val.split('.');
                        if (parts.length === 3 && parts[2].length === 4) {
                          setFormEndDate(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                        }
                      } else {
                        setFormEndDate(val);
                      }
                    }}
                    placeholder="TT.MM.JJJJ"
                  />
                  <button
                    ref={endBtnRef}
                    type="button"
                    className="va-picker-btn"
                    onClick={() => {
                      setEndPickerOpen((prev) => !prev);
                      setStartPickerOpen(false);
                    }}
                    title="Enddatum wählen"
                  >
                    <CalendarIcon size={16} />
                  </button>
                </div>
                <CalendarDropdown
                  anchorRef={endBtnRef}
                  isOpen={endPickerOpen}
                  onClose={() => setEndPickerOpen(false)}
                  selectedDateStr={formEndDate}
                  markedRanges={pickerMarkedRanges}
                  onSelectDate={(formatted) => {
                    let iso = formatted;
                    if (formatted.includes('.')) {
                      const [d, m, y] = formatted.split('.');
                      iso = `${y}-${m}-${d}`;
                    }
                    setFormEndDate(iso);
                    setEndPickerOpen(false);
                  }}
                />
              </div>

              <div className="va-form-group">
                <label htmlFor="va-note-input">{t('absenceNote') || 'Notiz'}</label>
                <input
                  id="va-note-input"
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="z. B. Seminar, Urlaub, etc."
                />
              </div>

              <div
                className="va-modal-footer"
                style={{
                  display: 'flex',
                  justifyContent: editingAbsence ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {editingAbsence && (
                  <button
                    type="button"
                    className="va-btn-delete"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const toDelete = editingAbsence;
                      closeModal();
                      setDeletingAbsence(toDelete);
                    }}
                    disabled={submitting}
                    title={t('deleteVolunteerAbsence') || 'Abwesenheit löschen'}
                  >
                    <Trash2 size={15} />
                    <span>{t('delete') || 'Löschen'}</span>
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="va-btn-secondary"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    {t('cancel') || 'Abbrechen'}
                  </button>
                  <button
                    type="submit"
                    className="va-btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Speichern...' : (t('save') || 'Speichern')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingAbsence && (
        <div className="va-modal-backdrop" onClick={() => setDeletingAbsence(null)}>
          <div
            className="va-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="va-modal-header">
              <h3>{t('deleteVolunteerAbsence') || 'Abwesenheit löschen'}</h3>
              <button
                type="button"
                className="va-modal-close-btn"
                onClick={() => setDeletingAbsence(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0.5rem 0 1rem', color: 'var(--text)' }}>
              {t('deleteVolunteerAbsenceConfirm') || 'Möchten Sie diese Abwesenheit wirklich löschen?'}
            </p>

            <div style={{ background: 'var(--bg-hover)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
              <div><strong>{t('absenceType') || 'Typ'}:</strong> {deletingAbsence.bufdi_name ? `${formatTypeName(deletingAbsence.type)} (${deletingAbsence.bufdi_name})` : formatTypeName(deletingAbsence.type)}</div>
              <div><strong>{t('absenceStartDate') || 'Zeitraum'}:</strong> {formatDateDE(deletingAbsence.start_date)} – {formatDateDE(deletingAbsence.end_date)}</div>
              {deletingAbsence.note && <div><strong>{t('absenceNote') || 'Notiz'}:</strong> {deletingAbsence.note}</div>}
            </div>

            <div className="va-modal-footer">
              <button
                type="button"
                className="va-btn-secondary"
                onClick={() => setDeletingAbsence(null)}
              >
                {t('cancel') || 'Abbrechen'}
              </button>
              <button
                type="button"
                className="va-btn-primary"
                style={{ background: '#ef4444' }}
                onClick={() => handleDeleteAbsence(deletingAbsence)}
              >
                {t('delete') || 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VolunteerAbsencesTab;
