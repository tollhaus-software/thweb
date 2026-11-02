import React, { useState, useEffect, useCallback } from 'react';
import { X, History, Check, Plus, Pencil, Laptop, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t, CURRENT_LOCALE, formatDisplayDate } from '../../utils/i18n';
import { parseDateKey, formatDayHeader } from '../../utils/mealPlan';
import {
  type MealAllergenDay,
  type MealAllergensHistoryEntry,
  type MealAllergenSnapshot,
  formatCooksDisplayName,
  getAllergenDisplayLabel,
} from '../../utils/mealAllergens';
import './MealAllergens.css';

interface MealAllergensHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  day: MealAllergenDay;
}

function getSnapshotCookName(snapshot?: MealAllergenSnapshot | null): string {
  if (!snapshot) return '';
  if (snapshot.cook_display_name && snapshot.cook_display_name.trim()) {
    return snapshot.cook_display_name.trim();
  }
  if (snapshot.cooks && snapshot.cooks.length > 0) {
    const formatted = formatCooksDisplayName(snapshot.cooks);
    if (formatted) return formatted;
  }
  return snapshot.cook_custom_name?.trim() || '';
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'finalized':
      return t('statusFinalized') || 'Abgeschlossen';
    case 'not_finalized':
      return t('statusNotFinalized') || 'Entwurf';
    case 'not_relevant':
      return t('statusNotRelevant') || 'Nicht relevant';
    case 'unspecified':
      return t('statusUnspecified') || 'Nicht begonnen';
    default:
      return status || '';
  }
}

function formatAllergensList(allergens?: string[]): string {
  if (!allergens || allergens.length === 0) {
    return t('noAllergens') || 'Keine Allergene';
  }
  return allergens.map((a) => getAllergenDisplayLabel(a)).join(', ');
}

function formatHistoryEntryDetails(entry: MealAllergensHistoryEntry): React.ReactNode[] {
  const diffs: React.ReactNode[] = [];
  const before = entry.before_snapshot;
  const after = entry.after_snapshot;

  // 1. Status changes
  if (entry.operation === 'FINALIZE') {
    diffs.push(
      <div key="status" className="meal-allergens-history-diff-line">
        <strong>Status:</strong>{' '}
        <span className="meal-allergens-history-status-finalized">
          {t('statusFinalized') || 'Abgeschlossen'}
        </span>
      </div>
    );
  } else if (before && before.status !== after.status) {
    diffs.push(
      <div key="status" className="meal-allergens-history-diff-line">
        <strong>Status:</strong> {getStatusLabel(before.status)} →{' '}
        <strong>{getStatusLabel(after.status)}</strong>
      </div>
    );
  } else if (!before && after.status && after.status !== 'unspecified') {
    diffs.push(
      <div key="status" className="meal-allergens-history-diff-line">
        <strong>Status:</strong> {getStatusLabel(after.status)}
      </div>
    );
  }

  // 2. Cook changes
  const beforeCook = getSnapshotCookName(before);
  const afterCook = getSnapshotCookName(after);
  if (!before && afterCook) {
    diffs.push(
      <div key="cook" className="meal-allergens-history-diff-line">
        <strong>{t('cookSelectionLabel') || 'Es kocht'}:</strong> {afterCook}
      </div>
    );
  } else if (before && beforeCook !== afterCook) {
    diffs.push(
      <div key="cook" className="meal-allergens-history-diff-line">
        <strong>{t('cookSelectionLabel') || 'Es kocht'}:</strong>{' '}
        {beforeCook || (t('noCookSelected') || 'Niemand')} →{' '}
        <strong>{afterCook || (t('noCookSelected') || 'Niemand')}</strong>
      </div>
    );
  }

  // 3. Components & Allergens
  const beforeComps = before?.meal_components || [];
  const afterComps = after?.meal_components || [];

  if (!before) {
    if (afterComps.length > 0) {
      diffs.push(
        <div key="comps" className="meal-allergens-history-diff-line">
          <strong>{t('componentsAndAllergensLabel') || 'Komponenten und Allergene'}:</strong>
          <ul className="meal-allergens-history-sublist">
            {afterComps.map((comp, i) => (
              <li key={i}>
                <span className="meal-allergens-history-comp-name">{comp.name || t('unnamedComponent')}</span>
                <span className="meal-allergens-history-comp-allergens">
                  {' '}({formatAllergensList(comp.allergens)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    } else {
      diffs.push(
        <div key="comps-empty" className="meal-allergens-history-diff-line">
          <em>{t('nothingEntered') || 'Keine Komponenten'}</em>
        </div>
      );
    }
  } else {
    // Compare before and after components
    const beforeMap = new Map(beforeComps.map((c) => [c.name?.trim().toLowerCase(), c]));
    const afterMap = new Map(afterComps.map((c) => [c.name?.trim().toLowerCase(), c]));

    const added = afterComps.filter((c) => !beforeMap.has(c.name?.trim().toLowerCase()));
    const removed = beforeComps.filter((c) => !afterMap.has(c.name?.trim().toLowerCase()));

    const modifiedAllergens: Array<{ name: string; beforeAllergens: string[]; afterAllergens: string[] }> = [];
    afterComps.forEach((ac) => {
      const bc = beforeMap.get(ac.name?.trim().toLowerCase());
      if (bc) {
        const bSet = new Set(bc.allergens || []);
        const aSet = new Set(ac.allergens || []);
        const changed = bSet.size !== aSet.size || [...bSet].some((x) => !aSet.has(x));
        if (changed) {
          modifiedAllergens.push({
            name: ac.name,
            beforeAllergens: bc.allergens || [],
            afterAllergens: ac.allergens || [],
          });
        }
      }
    });

    if (added.length > 0) {
      diffs.push(
        <div key="comps-added" className="meal-allergens-history-diff-line">
          <span className="meal-allergens-history-added-badge">+ {t('componentAdded') || 'Komponente hinzugefügt'}:</span>{' '}
          {added.map((c, i) => (
            <span key={i} className="meal-allergens-history-comp-item">
              <strong>{c.name}</strong> ({formatAllergensList(c.allergens)}){i < added.length - 1 ? '; ' : ''}
            </span>
          ))}
        </div>
      );
    }

    if (removed.length > 0) {
      diffs.push(
        <div key="comps-removed" className="meal-allergens-history-diff-line">
          <span className="meal-allergens-history-removed-badge">- {t('componentRemoved') || 'Komponente entfernt'}:</span>{' '}
          {removed.map((c, i) => (
            <span key={i} className="meal-allergens-history-comp-item">
              <del>{c.name}</del>{i < removed.length - 1 ? '; ' : ''}
            </span>
          ))}
        </div>
      );
    }

    if (modifiedAllergens.length > 0) {
      diffs.push(
        <div key="comps-modified" className="meal-allergens-history-diff-line">
          <strong>{t('allergensChanged') || 'Allergene geändert'}:</strong>
          <ul className="meal-allergens-history-sublist">
            {modifiedAllergens.map((m, i) => (
              <li key={i}>
                <strong>{m.name}:</strong> [{formatAllergensList(m.beforeAllergens)}] → <strong>[{formatAllergensList(m.afterAllergens)}]</strong>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // If completely replaced and neither added nor removed matched directly
    if (
      added.length === 0 &&
      removed.length === 0 &&
      modifiedAllergens.length === 0 &&
      JSON.stringify(beforeComps) !== JSON.stringify(afterComps)
    ) {
      diffs.push(
        <div key="comps-replaced" className="meal-allergens-history-diff-line">
          <strong>{t('componentsAndAllergensLabel') || 'Komponenten'}:</strong>{' '}
          <span>{beforeComps.map((c) => c.name).join(', ')}</span> →{' '}
          <strong>{afterComps.map((c) => c.name).join(', ')}</strong>
        </div>
      );
    }
  }

  if (diffs.length === 0) {
    if (afterComps.length > 0) {
      diffs.push(
        <div key="comps-current" className="meal-allergens-history-diff-line">
          <strong>{t('componentsAndAllergensLabel') || 'Komponenten und Allergene'}:</strong>
          <ul className="meal-allergens-history-sublist">
            {afterComps.map((comp, i) => (
              <li key={i}>
                <span className="meal-allergens-history-comp-name">{comp.name || t('unnamedComponent')}</span>
                <span className="meal-allergens-history-comp-allergens">
                  {' '}({formatAllergensList(comp.allergens)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    } else {
      diffs.push(
        <div key="none" className="meal-allergens-history-diff-line meal-allergens-history-empty-diff">
          {t('noDirectChanges') || 'Keine inhaltlichen Änderungen'}
        </div>
      );
    }
  }

  return diffs;
}

export const MealAllergensHistoryModal: React.FC<MealAllergensHistoryModalProps> = ({
  isOpen,
  onClose,
  day,
}) => {
  const { token } = useAuth();
  const [entries, setEntries] = useState<MealAllergensHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/meal-allergens/history?date=${encodeURIComponent(day.date)}`, {
        headers,
      });
      if (!res.ok) {
        throw new Error(`Failed to load history (${res.status})`);
      }
      const data: MealAllergensHistoryEntry[] = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching meal allergens history:', err);
      setError(err?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [day.date, token]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const dateObj = parseDateKey(day.date);
  const { dayName } = formatDayHeader(dateObj);
  const formattedDate = formatDisplayDate(dateObj);

  return (
    <div
      className="meal-allergens-history-modal-overlay"
      data-testid="meal-allergens-history-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="meal-allergens-history-modal-content" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="meal-allergens-history-header">
          <div className="meal-allergens-history-title-group">
            <div className="meal-allergens-history-title-row">
              <History size={20} className="meal-allergens-history-header-icon" />
              <h3 className="meal-allergens-history-title" data-testid="history-modal-title">
                {t('mealAllergensHistoryTitle') || 'Änderungshistorie'}
              </h3>
            </div>
            <div className="meal-allergens-history-day-header" data-testid="history-day-header">
              {dayName}, {formattedDate}
            </div>
          </div>
          <div className="meal-allergens-history-header-actions">
            <button
              type="button"
              className="meal-allergens-history-refresh-btn"
              onClick={fetchHistory}
              disabled={loading}
              title={t('refresh') || 'Aktualisieren'}
              aria-label={t('refresh') || 'Aktualisieren'}
              data-testid="refresh-history-btn"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="meal-allergens-history-close-btn"
              onClick={onClose}
              title={t('close') || 'Schließen'}
              aria-label={t('close') || 'Schließen'}
              data-testid="close-history-modal-btn"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Plan reference bar if present */}
        {(day.plan_cook_name?.trim() || (day.plan_meal_components && day.plan_meal_components.length > 0)) && (
          <div className="meal-allergens-history-plan-ref" data-testid="history-plan-ref">
            <span className="meal-allergens-history-plan-ref-label">
              {t('mealPlanReferenceTitle') || 'Laut Speiseplan'}:
            </span>{' '}
            {day.plan_cook_name?.trim() && (
              <span className="meal-allergens-history-plan-cook">
                <strong>{day.plan_cook_name}</strong>
              </span>
            )}
            {day.plan_cook_name?.trim() && day.plan_meal_components?.length > 0 && <span> — </span>}
            {day.plan_meal_components?.length > 0 && (
              <span className="meal-allergens-history-plan-comps">
                {day.plan_meal_components.join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="meal-allergens-history-body" data-testid="history-modal-body">
          {loading && (
            <div className="meal-allergens-history-loading" data-testid="history-loading">
              <RefreshCw size={18} className="spin" />
              <span>{t('loading') || 'Historie wird geladen...'}</span>
            </div>
          )}

          {!loading && error && (
            <div className="meal-allergens-history-error" data-testid="history-error">
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="meal-allergens-history-empty" data-testid="history-empty-message">
              {t('mealAllergensHistoryEmpty') || 'Für diesen Tag wurden noch keine Änderungen aufgezeichnet.'}
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="meal-allergens-history-list" data-testid="history-entries-list">
              {entries.map((entry, index) => {
                const dateStr = new Date(entry.created_at).toLocaleString(
                  CURRENT_LOCALE === 'de' ? 'de-DE' : 'en-US',
                  {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }
                );

                const whoDisplay = entry.is_kiosk
                  ? entry.kiosk_name
                    ? `Kiosk (${entry.kiosk_name})`
                    : 'Kiosk'
                  : entry.changed_by_email || '—';

                const opLabel =
                  entry.operation === 'FINALIZE'
                    ? t('opFinalize') || 'Finalisiert'
                    : entry.operation === 'INSERT'
                    ? t('opInsert') || 'Erstellt'
                    : entry.operation === 'UPDATE'
                    ? t('opUpdate') || 'Aktualisiert'
                    : entry.operation;

                const opClass =
                  entry.operation === 'FINALIZE'
                    ? 'op-finalize'
                    : entry.operation === 'INSERT'
                    ? 'op-insert'
                    : 'op-update';

                return (
                  <div
                    key={entry.id || index}
                    className="meal-allergens-history-card"
                    data-testid={`history-entry-${index}`}
                    data-operation={entry.operation}
                  >
                    <div className="meal-allergens-history-card-header">
                      <div className="meal-allergens-history-card-meta-left">
                        <span className={`meal-allergens-history-op-badge ${opClass}`}>
                          {entry.operation === 'FINALIZE' ? (
                            <Check size={12} />
                          ) : entry.operation === 'INSERT' ? (
                            <Plus size={12} />
                          ) : (
                            <Pencil size={12} />
                          )}
                          <span>{opLabel}</span>
                        </span>

                        <span className="meal-allergens-history-who" data-testid={`history-who-${index}`}>
                          {entry.is_kiosk && <Laptop size={13} className="meal-allergens-history-kiosk-icon" />}
                          <span>{whoDisplay}</span>
                        </span>
                      </div>

                      <span className="meal-allergens-history-when" data-testid={`history-when-${index}`}>
                        {dateStr}
                      </span>
                    </div>

                    <div className="meal-allergens-history-card-diffs" data-testid={`history-what-${index}`}>
                      {formatHistoryEntryDetails(entry)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="meal-allergens-history-footer">
          <button
            type="button"
            className="meal-allergens-copy-btn"
            onClick={onClose}
            data-testid="close-history-modal-footer-btn"
          >
            {t('close') || 'Schließen'}
          </button>
        </div>
      </div>
    </div>
  );
};
