import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ListTodo,
  Info,
  AlertCircle,
  Refrigerator,
  Sparkles,
  UtensilsCrossed,
  Soup,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../hooks/useRealtime';
import { renderMarkdownBlocks } from '../../utils/formattedText';
import { WasherIcon, DryerIcon, LaundryBinIcon, CupboardIcon } from './LaundryIcons';
import { TaskInfoModal } from './TaskInfoModal';
import type { DashboardTodoItem } from './KioskDashboard';
import './KioskDashboard.css';
import './DashboardTodosAdminTab.css';

export interface ColorOption {
  value: string;
  label: string;
  bgColor: string;
  borderColor: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  { value: 'default', label: 'Standard (Grau)', bgColor: '#f1f5f9', borderColor: '#cbd5e1' },
  { value: 'serving', label: 'Servieren (Orange)', bgColor: '#ffedd5', borderColor: '#fed7aa' },
  { value: 'allergens', label: 'Allergene (Lila)', bgColor: '#fae8ff', borderColor: '#f0abfc' },
  { value: 'laundry', label: 'Wäsche (Indigo)', bgColor: '#e0e7ff', borderColor: '#c7d2fe' },
  { value: 'diaper', label: 'Windeleimer (Pink)', bgColor: '#fce7f3', borderColor: '#fbcfe8' },
  { value: 'yellow', label: 'Gelbe Tonne (Gelb)', bgColor: '#fef9c3', borderColor: '#fde047' },
  { value: 'refrigerator', label: 'Kühlschrank (Blau)', bgColor: '#e0f2fe', borderColor: '#bae6fd' },
  { value: 'dishwasher', label: 'Spülmaschine (Grün)', bgColor: '#ecfdf5', borderColor: '#a7f3d0' },
];

export interface IconOption {
  value: string;
  label: string;
}

const ICON_OPTIONS: IconOption[] = [
  { value: '', label: 'Kein Icon' },
  { value: 'washer', label: 'Waschmaschine' },
  { value: 'dryer', label: 'Trockner' },
  { value: 'laundry_bin', label: 'Wäschekorb' },
  { value: 'cupboard', label: 'Schrank' },
  { value: 'trash', label: 'Mülleimer / Tonne' },
  { value: 'refrigerator', label: 'Kühlschrank' },
  { value: 'sparkles', label: 'Reinigung / Glanz' },
  { value: 'utensils', label: 'Besteck' },
  { value: 'soup', label: 'Suppe / Essen' },
  { value: 'alert', label: 'Hinweis (!)' },
];

const WEEKDAY_OPTIONS: Array<{ day: number; short: string; full: string }> = [
  { day: 1, short: 'Mo', full: 'Montag' },
  { day: 2, short: 'Di', full: 'Dienstag' },
  { day: 3, short: 'Mi', full: 'Mittwoch' },
  { day: 4, short: 'Do', full: 'Donnerstag' },
  { day: 5, short: 'Fr', full: 'Freitag' },
  { day: 6, short: 'Sa', full: 'Samstag' },
  { day: 0, short: 'So', full: 'Sonntag' },
];

const renderTodoIcon = (iconKey: string, size = 20): React.ReactNode => {
  const key = (iconKey || '').toLowerCase();
  if (!key || key === 'none') return null;
  if (key === 'trash') return <Trash2 size={size} className="kiosk-todo-icon" />;
  if (key === 'refrigerator') return <Refrigerator size={size} className="kiosk-todo-icon" />;
  if (key === 'sparkles') return <Sparkles size={size} className="kiosk-todo-icon" />;
  if (key === 'washer') return <WasherIcon size={size} className="kiosk-todo-icon" />;
  if (key === 'dryer') return <DryerIcon size={size} className="kiosk-todo-icon" />;
  if (key === 'laundry_bin') return <LaundryBinIcon size={size} className="kiosk-todo-icon" />;
  if (key === 'cupboard') return <CupboardIcon size={size} className="kiosk-todo-icon" />;
  if (key === 'utensils') return <UtensilsCrossed size={size} className="kiosk-todo-icon" />;
  if (key === 'soup') return <Soup size={size} className="kiosk-todo-icon" />;
  if (key === 'alert') return <AlertCircle size={size} className="kiosk-todo-icon" />;
  return null;
};

export const DashboardTodosAdminTab: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('dashboard.todos.manage') || hasPermission('*');

  const [todos, setTodos] = useState<DashboardTodoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTodo, setEditingTodo] = useState<DashboardTodoItem | null>(null);
  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formShortName, setFormShortName] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState<number>(500);
  const [formColor, setFormColor] = useState<string>('default');
  const [formIcon, setFormIcon] = useState<string>('');
  const [formOnCookingDays, setFormOnCookingDays] = useState<boolean>(false);
  const [formOnVolunteerAbsence, setFormOnVolunteerAbsence] = useState<boolean>(false);
  const [formOnVesperDays, setFormOnVesperDays] = useState<boolean>(false);
  const [formOnYellowBagDay, setFormOnYellowBagDay] = useState<boolean>(false);
  const [formOnDayBeforeYellowBagDay, setFormOnDayBeforeYellowBagDay] = useState<boolean>(false);
  const [formWeekdays, setFormWeekdays] = useState<number[]>([]);
  const [formAction, setFormAction] = useState<string>('');
  const [formDescriptionMarkdown, setFormDescriptionMarkdown] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Preview info modal state
  const [previewInfoTodo, setPreviewInfoTodo] = useState<DashboardTodoItem | null>(null);
  // Delete confirmation state
  const [todoToDelete, setTodoToDelete] = useState<DashboardTodoItem | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/dashboard/todos', { headers });
      if (!res.ok) {
        throw new Error(`Fehler beim Laden der TODOs (${res.status})`);
      }
      const data: DashboardTodoItem[] = await res.json();
      setTodos(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der TODOs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  useRealtime(
    useCallback(
      (msg: { type?: string }) => {
        if (msg?.type === 'DASHBOARD_TASKS_UPDATED' || msg?.type === 'INVALIDATE') {
          void fetchTodos();
        }
      },
      [fetchTodos]
    )
  );

  const openCreateModal = () => {
    setEditingTodo(null);
    setFormId('');
    setFormName('');
    setFormShortName('');
    setFormSortOrder(500);
    setFormColor('default');
    setFormIcon('');
    setFormOnCookingDays(false);
    setFormOnVolunteerAbsence(false);
    setFormOnVesperDays(false);
    setFormOnYellowBagDay(false);
    setFormOnDayBeforeYellowBagDay(false);
    setFormWeekdays([]);
    setFormAction('');
    setFormDescriptionMarkdown('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (todo: DashboardTodoItem) => {
    setEditingTodo(todo);
    setFormId(todo.id || '');
    setFormName(todo.name || '');
    setFormShortName(todo.short_name || todo.name || '');
    setFormSortOrder(typeof todo.sort_order === 'number' ? todo.sort_order : 500);
    setFormColor(todo.color || 'default');
    setFormIcon(todo.icon || '');
    setFormOnCookingDays(Boolean(todo.on_cooking_days));
    setFormOnVolunteerAbsence(Boolean(todo.on_volunteer_absence));
    setFormOnVesperDays(Boolean(todo.on_vesper_days));
    setFormOnYellowBagDay(Boolean(todo.on_yellow_bag_day));
    setFormOnDayBeforeYellowBagDay(Boolean(todo.on_day_before_yellow_bag_day));
    setFormWeekdays(Array.isArray(todo.weekdays) ? [...todo.weekdays] : []);
    setFormAction(todo.action || '');
    setFormDescriptionMarkdown(todo.description_markdown || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const toggleWeekday = (day: number) => {
    setFormWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = editingTodo ? editingTodo.id : formId.trim();
    if (!trimmedId) {
      setFormError('Bitte eine eindeutige ID eingeben (z.B. serve_small_group).');
      return;
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Bitte einen Namen (Anzeigetext) eingeben.');
      return;
    }
    const trimmedShortName = formShortName.trim() || trimmedName;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        id: trimmedId,
        name: trimmedName,
        short_name: trimmedShortName,
        sort_order: Number(formSortOrder) || 0,
        color: formColor,
        icon: formIcon,
        on_cooking_days: formOnCookingDays,
        on_volunteer_absence: formOnVolunteerAbsence,
        on_vesper_days: formOnVesperDays,
        on_yellow_bag_day: formOnYellowBagDay,
        on_day_before_yellow_bag_day: formOnDayBeforeYellowBagDay,
        weekdays: formWeekdays,
        action: formAction,
        description_markdown: formDescriptionMarkdown,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = editingTodo
        ? `/api/dashboard/todos/${encodeURIComponent(editingTodo.id)}`
        : '/api/dashboard/todos';
      const method = editingTodo ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Fehler beim Speichern (${res.status})`);
      }

      setIsModalOpen(false);
      await fetchTodos();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!todoToDelete) return;
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/dashboard/todos/${encodeURIComponent(todoToDelete.id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        throw new Error(`Fehler beim Löschen (${res.status})`);
      }
      setTodoToDelete(null);
      await fetchTodos();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  };

  const formatConditionsBadges = (todo: DashboardTodoItem): string[] => {
    const badges: string[] = [];
    if (todo.on_cooking_days) {
      badges.push('An Kochtagen');
    }
    if (todo.on_volunteer_absence) {
      badges.push('Abwesenheit Freiwillige');
    }
    if (todo.on_vesper_days) {
      badges.push('An Vesper-Tagen');
    }
    if (todo.on_yellow_bag_day) {
      badges.push('Gelbe Tonne (Abholtag)');
    }
    if (todo.on_day_before_yellow_bag_day) {
      badges.push('Gelbe Tonne (Vortag)');
    }
    if (Array.isArray(todo.weekdays) && todo.weekdays.length > 0) {
      const ordered = WEEKDAY_OPTIONS.filter((w) => todo.weekdays.includes(w.day)).map(
        (w) => w.short
      );
      if (ordered.length === 5 && !todo.weekdays.includes(0) && !todo.weekdays.includes(6)) {
        badges.push('Mo–Fr');
      } else {
        badges.push(`Wochentage: ${ordered.join(', ')}`);
      }
    }
    if (badges.length === 0) {
      badges.push('Täglich');
    }
    return badges;
  };

  return (
    <div className="dashboard-todos-admin-page" data-testid="dashboard-todos-admin-page">
      <div className="dashboard-todos-admin-header">
        <div className="dashboard-todos-admin-title-wrap">
          <ListTodo size={24} className="dashboard-todos-admin-title-icon" />
          <div>
            <h2 className="dashboard-todos-admin-title">Kochansicht-TODOs verwalten</h2>
            <p className="dashboard-todos-admin-subtitle">
              Aufgaben, Farben, Icons, Anzeigebedingungen und Info-Texte (Markdown) für die Kochansicht konfigurieren.
            </p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            className="primary-button dashboard-todos-create-btn"
            data-testid="create-dashboard-todo-btn"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            <span>Neues TODO</span>
          </button>
        )}
      </div>

      {error && (
        <div className="dashboard-todos-admin-error" data-testid="dashboard-todos-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="dashboard-todos-admin-loading">Lade TODOs...</div>
      ) : (
        <div className="dashboard-todos-admin-list" data-testid="dashboard-todos-admin-list">
          {todos.map((todo) => {
            const hasInfo = Boolean(todo.description_markdown && todo.description_markdown.trim());
            const isAllergens = todo.action === 'fill_allergens';
            const conditionBadges = formatConditionsBadges(todo);

            return (
              <div
                key={todo.id}
                className="dashboard-todo-admin-row"
                data-testid={`admin-todo-row-${todo.id}`}
              >
                <div className="dashboard-todo-admin-preview-col">
                  <div
                    className={`kiosk-todo-item kiosk-todo-${todo.color || 'default'} dashboard-todo-admin-preview-item`}
                    data-testid={`admin-todo-preview-${todo.id}`}
                  >
                    <span className="kiosk-todo-checkbox" aria-hidden="true" />
                    {renderTodoIcon(todo.icon, 20)}
                    <span className="kiosk-todo-label">{todo.name}</span>
                    {isAllergens && (
                      <span
                        className="kiosk-todo-open-allergens-btn"
                        title="Öffnet den Allergen-Editor"
                      >
                        <Pencil size={16} className="kiosk-todo-icon" />
                      </span>
                    )}
                    {hasInfo && (
                      <button
                        type="button"
                        className="kiosk-todo-info-btn"
                        data-testid={`admin-todo-preview-info-btn-${todo.id}`}
                        title="Info-Vorschau öffnen"
                        onClick={() => setPreviewInfoTodo(todo)}
                      >
                        <Info size={18} className="kiosk-todo-icon" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="dashboard-todo-admin-meta-col">
                  <div className="dashboard-todo-admin-meta-line">
                    <span className="dashboard-todo-meta-badge sort-badge" title="Sortierreihenfolge">
                      #{todo.sort_order}
                    </span>
                    <span className="dashboard-todo-meta-badge sort-badge" title="TODO-ID">
                      ID: {todo.id}
                    </span>
                    {todo.short_name && todo.short_name !== todo.name && (
                      <span className="dashboard-todo-meta-short" title="Kurzname für Dialoge">
                        Kurzname: <strong>{todo.short_name}</strong>
                      </span>
                    )}
                    {isAllergens && (
                      <span className="dashboard-todo-meta-badge action-badge">
                        Aktion: Allergene eintragen
                      </span>
                    )}
                    {hasInfo && (
                      <span className="dashboard-todo-meta-badge info-badge">
                        Info-Text hinterlegt
                      </span>
                    )}
                  </div>

                  <div className="dashboard-todo-admin-conditions">
                    {conditionBadges.map((b, i) => (
                      <span key={i} className="dashboard-todo-condition-pill">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                {canManage && (
                  <div className="dashboard-todo-admin-actions-col">
                    <button
                      type="button"
                      className="secondary-button dashboard-todo-edit-btn"
                      data-testid={`edit-todo-btn-${todo.id}`}
                      onClick={() => openEditModal(todo)}
                      title="Bearbeiten"
                    >
                      <Pencil size={15} />
                      <span>Bearbeiten</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-button dashboard-todo-delete-btn"
                      data-testid={`delete-todo-btn-${todo.id}`}
                      onClick={() => setTodoToDelete(todo)}
                      title="Löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          data-testid="todo-edit-modal-overlay"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="modal-container dashboard-todo-edit-modal"
            data-testid="todo-edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-todo-modal-header">
              <h3>{editingTodo ? 'TODO bearbeiten' : 'Neues TODO erstellen'}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Schließen"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="dashboard-todo-form">
              {formError && (
                <div className="dashboard-todos-admin-error" data-testid="todo-form-error">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="dashboard-todo-form-grid">
                <div className="dashboard-todo-field">
                  <label htmlFor="todo-id-input">
                    ID (eindeutiger Schlüssel) *
                  </label>
                  <input
                    id="todo-id-input"
                    data-testid="todo-id-input"
                    type="text"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="z.B. serve_small_group"
                    disabled={Boolean(editingTodo)}
                    required
                  />
                </div>

                <div className="dashboard-todo-field">
                  <label htmlFor="todo-sort-order-input">
                    Sortierreihenfolge (Zahl, kleinere zuerst)
                  </label>
                  <input
                    id="todo-sort-order-input"
                    data-testid="todo-sort-order-input"
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(Number(e.target.value))}
                  />
                </div>

                <div className="dashboard-todo-field">
                  <label htmlFor="todo-name-input">
                    Anzeigename (Langname in der Liste) *
                  </label>
                  <input
                    id="todo-name-input"
                    data-testid="todo-name-input"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="z.B. Kleine Gruppe servieren (auf 11:45)"
                    required
                  />
                </div>

                <div className="dashboard-todo-field">
                  <label htmlFor="todo-short-name-input">
                    Kurzname (für „... abhaken?“ und Info-Titel)
                  </label>
                  <input
                    id="todo-short-name-input"
                    data-testid="todo-short-name-input"
                    type="text"
                    value={formShortName}
                    onChange={(e) => setFormShortName(e.target.value)}
                    placeholder={formName || 'z.B. Kleine Gruppe servieren'}
                  />
                </div>

                <div className="dashboard-todo-field">
                  <label htmlFor="todo-action-select">Spezial-Aktion (optional)</label>
                  <select
                    id="todo-action-select"
                    data-testid="todo-action-select"
                    value={formAction}
                    onChange={(e) => setFormAction(e.target.value)}
                  >
                    <option value="">Keine (normales abhakbares TODO)</option>
                    <option value="fill_allergens">
                      Allergene eintragen (öffnet Allergen-Editor)
                    </option>
                  </select>
                </div>
              </div>

              <div className="dashboard-todo-field">
                <label>Farbe</label>
                <div className="dashboard-todo-color-picker" data-testid="todo-color-picker">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`dashboard-todo-color-option ${formColor === c.value ? 'selected' : ''}`}
                      data-testid={`todo-color-option-${c.value}`}
                      onClick={() => setFormColor(c.value)}
                      style={{
                        backgroundColor: c.bgColor,
                        borderColor: c.borderColor,
                      }}
                    >
                      {formColor === c.value && <Check size={14} />}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dashboard-todo-field">
                <label>Icon (optional)</label>
                <div className="dashboard-todo-icon-picker" data-testid="todo-icon-picker">
                  {ICON_OPTIONS.map((ic) => (
                    <button
                      key={ic.value || 'none'}
                      type="button"
                      className={`dashboard-todo-icon-option ${formIcon === ic.value ? 'selected' : ''}`}
                      data-testid={`todo-icon-option-${ic.value || 'none'}`}
                      onClick={() => setFormIcon(ic.value)}
                    >
                      {ic.value ? renderTodoIcon(ic.value, 18) : null}
                      <span>{ic.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dashboard-todo-field">
                <label>Wann soll dieses TODO angezeigt werden?</label>
                <div className="dashboard-todo-conditions-box">
                  <div className="dashboard-todo-checkbox-grid">
                    <label className="dashboard-todo-check-label">
                      <input
                        type="checkbox"
                        data-testid="todo-cond-cooking-days"
                        checked={formOnCookingDays}
                        onChange={(e) => setFormOnCookingDays(e.target.checked)}
                      />
                      <span>An allen Kochtagen</span>
                    </label>
                    <label className="dashboard-todo-check-label">
                      <input
                        type="checkbox"
                        data-testid="todo-cond-volunteer-absence"
                        checked={formOnVolunteerAbsence}
                        onChange={(e) => setFormOnVolunteerAbsence(e.target.checked)}
                      />
                      <span>An Tagen mit Abwesenheit Freiwillige (BuFDI)</span>
                    </label>
                    <label className="dashboard-todo-check-label">
                      <input
                        type="checkbox"
                        data-testid="todo-cond-vesper-days"
                        checked={formOnVesperDays}
                        onChange={(e) => setFormOnVesperDays(e.target.checked)}
                      />
                      <span>An Vesper-Tagen (Mi &amp; Do)</span>
                    </label>
                    <label className="dashboard-todo-check-label">
                      <input
                        type="checkbox"
                        data-testid="todo-cond-yellow-bag-day"
                        checked={formOnYellowBagDay}
                        onChange={(e) => setFormOnYellowBagDay(e.target.checked)}
                      />
                      <span>Am Tag der Gelben Tonne (Abholtag)</span>
                    </label>
                    <label className="dashboard-todo-check-label">
                      <input
                        type="checkbox"
                        data-testid="todo-cond-before-yellow-bag-day"
                        checked={formOnDayBeforeYellowBagDay}
                        onChange={(e) => setFormOnDayBeforeYellowBagDay(e.target.checked)}
                      />
                      <span>Am Vortag der Gelben Tonne</span>
                    </label>
                  </div>

                  <div className="dashboard-todo-weekdays-row">
                    <span className="dashboard-todo-weekdays-label">
                      An bestimmten Wochentagen (leer = keine Einschränkung auf Wochentage):
                    </span>
                    <div className="dashboard-todo-weekdays-pills">
                      {WEEKDAY_OPTIONS.map((w) => {
                        const active = formWeekdays.includes(w.day);
                        return (
                          <button
                            key={w.day}
                            type="button"
                            className={`dashboard-todo-weekday-pill ${active ? 'active' : ''}`}
                            data-testid={`todo-weekday-${w.day}`}
                            onClick={() => toggleWeekday(w.day)}
                            title={w.full}
                          >
                            {w.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-todo-field">
                <label htmlFor="todo-description-markdown">
                  Zusätzliche Beschreibung / Info-Dialog (Markdown, optional)
                </label>
                <span className="dashboard-todo-field-hint">
                  Wenn ausgefüllt, erhält das TODO rechts ein <strong>i</strong>-Icon, das beim Antippen diesen Text anzeigt. Unterstützt Überschriften (<code>#</code>, <code>##</code>), Aufzählungen (<code>- Punkt</code>), Nummerierungen (<code>1. Punkt</code>), <code>**fett**</code> und <code>*kursiv*</code>.
                </span>
                <textarea
                  id="todo-description-markdown"
                  data-testid="todo-description-markdown"
                  rows={6}
                  value={formDescriptionMarkdown}
                  onChange={(e) => setFormDescriptionMarkdown(e.target.value)}
                  placeholder="Optionaler Info-Text in Markdown..."
                />
                {formDescriptionMarkdown.trim().length > 0 && (
                  <div
                    className="dashboard-todo-markdown-preview"
                    data-testid="todo-markdown-preview"
                  >
                    <div className="dashboard-todo-markdown-preview-label">
                      Vorschau Info-Dialog ({formShortName.trim() || formName.trim() || 'TODO'}):
                    </div>
                    <div className="dashboard-todo-markdown-preview-body">
                      {renderMarkdownBlocks(formDescriptionMarkdown)}
                    </div>
                  </div>
                )}
              </div>

              <div className="dashboard-todo-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  data-testid="todo-modal-cancel-btn"
                  onClick={() => setIsModalOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  data-testid="todo-modal-save-btn"
                  disabled={saving}
                >
                  {saving ? 'Speichert...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {todoToDelete && (
        <div
          className="modal-overlay"
          data-testid="todo-delete-modal-overlay"
          onClick={() => setTodoToDelete(null)}
        >
          <div
            className="modal-container dashboard-todo-delete-modal"
            data-testid="todo-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>TODO löschen?</h3>
            <p>
              Möchten Sie das TODO <strong>„{todoToDelete.name}“</strong> wirklich löschen?
            </p>
            <div className="dashboard-todo-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTodoToDelete(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                data-testid="confirm-delete-todo-btn"
                onClick={() => void handleConfirmDelete()}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal Preview */}
      <TaskInfoModal
        isOpen={Boolean(previewInfoTodo)}
        taskTitle={previewInfoTodo ? previewInfoTodo.short_name || previewInfoTodo.name : ''}
        infoText={previewInfoTodo ? previewInfoTodo.description_markdown : ''}
        onClose={() => setPreviewInfoTodo(null)}
        embedded={true}
      />
    </div>
  );
};
