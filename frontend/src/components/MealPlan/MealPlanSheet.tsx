import React, { useState, useEffect, useRef } from 'react';
import {
  type DayMealData,
  type MealPlanOverrides,
  getISOWeekNumber,
  formatWeekRange,
  formatDayHeader,
  getWeekDays,
  formatDateKey,
  loadMealPlanOverrides,
  setMealPlanComponentOverride,
  revertMealPlanComponentOverride,
} from '../../utils/mealPlan';
import { t } from '../../utils/i18n';
import { Pencil, Check, X, RotateCcw } from 'lucide-react';

export interface MealPlanSheetProps {
  mondayDate: Date;
  daysData: DayMealData[];
  loading?: boolean;
  error?: string | null;
  editable?: boolean;
}

export const MealPlanSheet: React.FC<MealPlanSheetProps> = ({
  mondayDate,
  daysData,
  loading = false,
  error = null,
  editable = true,
}) => {
  const { week: weekNo } = getISOWeekNumber(mondayDate);
  const weekRangeStr = formatWeekRange(mondayDate);
  const weekDays = getWeekDays(mondayDate);

  const [overrides, setOverrides] = useState<MealPlanOverrides>(() => loadMealPlanOverrides());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

  // Index daysData by date key
  const dayDataMap = new Map<string, DayMealData>();
  daysData.forEach((d) => {
    dayDataMap.set(d.date, d);
  });

  const handleStartEdit = (dateKey: string, idx: number, currentValue: string) => {
    setEditingKey(`${dateKey}-${idx}`);
    setDraftValue(currentValue);
  };

  const handleCancel = () => {
    setEditingKey(null);
    setDraftValue('');
  };

  const handleSave = (dateKey: string, idx: number, originalValue: string) => {
    const trimmed = draftValue.trim();
    if (trimmed === originalValue || (trimmed === '' && !originalValue)) {
      const updated = revertMealPlanComponentOverride(dateKey, idx);
      setOverrides(updated);
    } else {
      const updated = setMealPlanComponentOverride(dateKey, idx, draftValue);
      setOverrides(updated);
    }
    setEditingKey(null);
    setDraftValue('');
  };

  const handleRevert = (dateKey: string, idx: number) => {
    const updated = revertMealPlanComponentOverride(dateKey, idx);
    setOverrides(updated);
    setEditingKey(null);
    setDraftValue('');
  };

  return (
    <div className="meal-plan-sheet" data-testid="meal-plan-sheet">
      <div className="meal-plan-sheet-header">
        <div>
          <h2 className="meal-plan-sheet-title" style={{ color: '#000000' }}>
            {t('mealPlanTitle')}
          </h2>
        </div>
        <div className="meal-plan-sheet-week-info">
          {t('calendarWeek')} {weekNo} · {weekRangeStr}
        </div>
      </div>

      {loading ? (
        <div className="meal-plan-loading">
          <span>{t('loading')}</span>
        </div>
      ) : error ? (
        <div className="meal-plan-loading" style={{ color: '#ef4444' }}>
          <span>{error}</span>
        </div>
      ) : (
        <div className="meal-plan-grid">
          {weekDays.map((dayDate) => {
            const dateKey = formatDateKey(dayDate);
            const data = dayDataMap.get(dateKey);
            const { dayName, dateStr } = formatDayHeader(dayDate);
            const baseComponents = data?.meal_components?.filter(Boolean) || [];
            const dayOverrides = overrides[dateKey] || {};

            const hasBaseComponents = baseComponents.length > 0;
            const overrideIndices = Object.keys(dayOverrides)
              .map(Number)
              .filter((n) => !isNaN(n))
              .sort((a, b) => a - b);
            const hasOverrides = overrideIndices.length > 0;
            const hasEntries = hasBaseComponents || hasOverrides;
            const isEditingEmpty = !hasEntries && editingKey === `${dateKey}-0`;

            const componentIndices = hasBaseComponents
              ? baseComponents.map((_, i) => i)
              : overrideIndices;

            return (
              <div key={dateKey} className="meal-plan-day-col" data-date={dateKey}>
                <div className="meal-plan-day-header">
                  <span className="meal-plan-day-name">{dayName}</span>
                  <span className="meal-plan-day-date">{dateStr}</span>
                </div>

                <div className="meal-plan-day-body">
                  <div className="meal-plan-meals-box">
                    {hasEntries ? (
                      componentIndices.map((idx) => {
                        const originalValue = baseComponents[idx] || '';
                        const effectiveValue =
                          dayOverrides[idx] !== undefined ? dayOverrides[idx] : originalValue;
                        const isEditing = editingKey === `${dateKey}-${idx}`;

                        return (
                          <div
                            key={idx}
                            className={`meal-plan-component-item ${
                              isEditing ? 'meal-plan-component-item-editing' : ''
                            }`}
                            data-testid={`meal-plan-component-${dateKey}-${idx}`}
                          >
                            {!isEditing ? (
                              <>
                                <span className="meal-plan-component-text">{effectiveValue}</span>
                                {editable && (
                                  <button
                                    type="button"
                                    className="cell-edit-pencil-btn meal-plan-component-pencil-btn no-print"
                                    onClick={() => handleStartEdit(dateKey, idx, effectiveValue)}
                                    title={t('edit')}
                                    aria-label={`${t('edit')}: ${effectiveValue}`}
                                    data-testid={`edit-meal-component-${dateKey}-${idx}`}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="meal-plan-component-text print-only">
                                  {draftValue || effectiveValue}
                                </span>
                                <div
                                  className="meal-plan-component-edit-box no-print"
                                  data-testid={`meal-plan-edit-box-${dateKey}-${idx}`}
                                >
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    className="meal-plan-component-input"
                                    value={draftValue}
                                    onChange={(e) => setDraftValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSave(dateKey, idx, originalValue);
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        handleCancel();
                                      }
                                    }}
                                    data-testid={`meal-plan-component-input-${dateKey}-${idx}`}
                                    aria-label={t('editMealComponent')}
                                    placeholder={t('enterMealDescription')}
                                  />
                                  <div
                                    className="meal-plan-edit-note"
                                    data-testid="meal-plan-edit-note"
                                  >
                                    {t('mealPlanEditNote')}
                                  </div>
                                  <div className="meal-plan-edit-actions">
                                    <button
                                      type="button"
                                      className="meal-plan-revert-btn"
                                      onClick={() => handleRevert(dateKey, idx)}
                                      title={t('revertToKochplan')}
                                      aria-label={t('revertToKochplan')}
                                      data-testid="revert-to-kochplan"
                                    >
                                      <RotateCcw size={12} />
                                      <span>{t('revertToKochplan')}</span>
                                    </button>
                                    <div className="meal-plan-save-cancel-group">
                                      <button
                                        type="button"
                                        className="meal-plan-cancel-btn"
                                        onClick={handleCancel}
                                        title={t('cancel')}
                                        aria-label={t('cancel')}
                                        data-testid="meal-plan-cancel-btn"
                                      >
                                        <X size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        className="meal-plan-save-btn"
                                        onClick={() => handleSave(dateKey, idx, originalValue)}
                                        title={t('save')}
                                        aria-label={t('save')}
                                        data-testid="meal-plan-save-btn"
                                      >
                                        <Check size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : isEditingEmpty ? (
                      <div className="meal-plan-component-item meal-plan-component-item-editing">
                        <span className="meal-plan-component-text print-only">
                          {draftValue || t('noMealsPlanned')}
                        </span>
                        <div
                          className="meal-plan-component-edit-box no-print"
                          data-testid={`meal-plan-edit-box-${dateKey}-0`}
                        >
                          <input
                            ref={inputRef}
                            type="text"
                            className="meal-plan-component-input"
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSave(dateKey, 0, '');
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancel();
                              }
                            }}
                            data-testid={`meal-plan-component-input-${dateKey}-0`}
                            aria-label={t('editMealComponent')}
                            placeholder={t('enterMealDescription')}
                          />
                          <div
                            className="meal-plan-edit-note"
                            data-testid="meal-plan-edit-note"
                          >
                            {t('mealPlanEditNote')}
                          </div>
                          <div className="meal-plan-edit-actions">
                            <button
                              type="button"
                              className="meal-plan-revert-btn"
                              onClick={() => handleRevert(dateKey, 0)}
                              title={t('revertToKochplan')}
                              aria-label={t('revertToKochplan')}
                              data-testid="revert-to-kochplan"
                            >
                              <RotateCcw size={12} />
                              <span>{t('revertToKochplan')}</span>
                            </button>
                            <div className="meal-plan-save-cancel-group">
                              <button
                                type="button"
                                className="meal-plan-cancel-btn"
                                onClick={handleCancel}
                                title={t('cancel')}
                                aria-label={t('cancel')}
                                data-testid="meal-plan-cancel-btn"
                              >
                                <X size={14} />
                              </button>
                              <button
                                type="button"
                                className="meal-plan-save-btn"
                                onClick={() => handleSave(dateKey, 0, '')}
                                title={t('save')}
                                aria-label={t('save')}
                                data-testid="meal-plan-save-btn"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="meal-plan-empty-item">
                        <div className="meal-plan-empty-text">
                          {t('noMealsPlanned')}
                        </div>
                        {editable && (
                          <button
                            type="button"
                            className="cell-edit-pencil-btn meal-plan-component-pencil-btn no-print"
                            onClick={() => handleStartEdit(dateKey, 0, '')}
                            title={t('edit')}
                            aria-label={`${t('edit')}: ${t('noMealsPlanned')}`}
                            data-testid={`edit-meal-empty-${dateKey}`}
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
