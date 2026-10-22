import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Check, Copy, Pencil, Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t, formatDisplayDate } from '../../utils/i18n';
import { parseDateKey, formatDayHeader } from '../../utils/mealPlan';
import {
  type MealAllergenDay,
  type MealAllergenComponent,
  type MealAllergenStatus,
  type CookOption,
  MAIN_ALLERGENS,
  getAllergenDisplayLabel,
  matchCookFromPlan,
  getSuggestedEntriesForCook,
  combineMealComponents,
  replaceMealComponents,
} from '../../utils/mealAllergens';
import { MealAllergensCalendarView } from './MealAllergensCalendarView';

interface MealAllergensEditorProps {
  initialDay: MealAllergenDay;
  onBack: () => void;
  onDaySaved: (updated: MealAllergenDay) => void;
}

export const MealAllergensEditor: React.FC<MealAllergensEditorProps> = ({
  initialDay,
  onBack,
  onDaySaved,
}) => {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('meal_allergens.write');

  const [day, setDay] = useState<MealAllergenDay>(initialDay);
  const [cookOptions, setCookOptions] = useState<CookOption[]>([]);
  const [allEntries, setAllEntries] = useState<MealAllergenDay[]>([]);

  // Cook state (parent, employee, or implicit custom text)
  const [cookParentId, setCookParentId] = useState<string | null>(initialDay.cook_parent_id || null);
  const [cookEmployeeId, setCookEmployeeId] = useState<string | null>(initialDay.cook_employee_id || null);
  const [cookCustomName, setCookCustomName] = useState<string>(initialDay.cook_custom_name || '');
  const [cookInputText, setCookInputText] = useState<string>(
    initialDay.cook_display_name || initialDay.cook_custom_name || initialDay.plan_cook_name || ''
  );
  const [isCookDropdownOpen, setIsCookDropdownOpen] = useState<boolean>(false);

  const [mealComponents, setMealComponents] = useState<MealAllergenComponent[]>(() => {
    if (initialDay.has_allergen_record) {
      return (initialDay.meal_components || []).map((c) => ({
        name: c.name,
        allergens: [...(c.allergens || [])],
      }));
    }
    return (initialDay.plan_meal_components || []).map((name) => ({
      name,
      allergens: [],
    }));
  });
  const [status, setStatus] = useState<MealAllergenStatus>(initialDay.status || 'unspecified');
  const [hasAllergenRecord, setHasAllergenRecord] = useState<boolean>(initialDay.has_allergen_record);

  // UI state for editing component names & expanding predefined allergens
  const [editingComponentIdx, setEditingComponentIdx] = useState<number | null>(null);
  const [expandedAllergenIndices, setExpandedAllergenIndices] = useState<Record<number, boolean>>({});
  const [customAllergenInput, setCustomAllergenInput] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<boolean>(false);

  // Copy modal state
  const [isCopyModalOpen, setIsCopyModalOpen] = useState<boolean>(false);
  const [pendingCopySource, setPendingCopySource] = useState<MealAllergenDay | null>(null);

  // Fetch cook options & all historical entries
  useEffect(() => {
    let ignore = false;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const loadMetadata = async () => {
      try {
        const [cooksRes, entriesRes, freshDayRes] = await Promise.all([
          fetch('/api/meal-allergens/cooks', { headers }),
          fetch('/api/meal-allergens?all=true', { headers }),
          fetch(`/api/meal-allergens/${encodeURIComponent(initialDay.date)}`, { headers }),
        ]);

        let loadedCooks: CookOption[] = [];
        if (cooksRes.ok) {
          loadedCooks = await cooksRes.json();
        }
        let loadedEntries: MealAllergenDay[] = [];
        if (entriesRes.ok) {
          loadedEntries = await entriesRes.json();
        }
        let loadedDay: MealAllergenDay = initialDay;
        if (freshDayRes.ok) {
          loadedDay = await freshDayRes.json();
        }

        if (!ignore) {
          setCookOptions(loadedCooks);
          setAllEntries(loadedEntries);
          setDay(loadedDay);
          setStatus(loadedDay.status || 'unspecified');
          setHasAllergenRecord(loadedDay.has_allergen_record);

          if (loadedDay.has_allergen_record) {
            setMealComponents(
              (loadedDay.meal_components || []).map((c) => ({
                name: c.name,
                allergens: [...(c.allergens || [])],
              }))
            );
            if (loadedDay.cook_parent_id) {
              setCookParentId(loadedDay.cook_parent_id);
              setCookEmployeeId(null);
              setCookCustomName('');
              const found = loadedCooks.find(
                (o) => o.type === 'parent' && o.id === loadedDay.cook_parent_id
              );
              setCookInputText(found ? found.display_name : loadedDay.cook_display_name || '');
            } else if (loadedDay.cook_employee_id) {
              setCookEmployeeId(loadedDay.cook_employee_id);
              setCookParentId(null);
              setCookCustomName('');
              const found = loadedCooks.find(
                (o) => o.type === 'employee' && o.id === loadedDay.cook_employee_id
              );
              setCookInputText(found ? found.display_name : loadedDay.cook_display_name || '');
            } else {
              const custom = loadedDay.cook_custom_name || loadedDay.plan_cook_name || '';
              setCookParentId(null);
              setCookEmployeeId(null);
              setCookCustomName(custom);
              setCookInputText(custom);
            }
          } else {
            setMealComponents(
              (loadedDay.plan_meal_components || []).map((name) => ({
                name,
                allergens: [],
              }))
            );
            const matched = matchCookFromPlan(loadedDay.plan_cook_name, loadedCooks);
            setCookParentId(matched.cook_parent_id);
            setCookEmployeeId(matched.cook_employee_id);
            setCookCustomName(matched.cook_custom_name);
            if (matched.cook_parent_id) {
              const found = loadedCooks.find(
                (o) => o.type === 'parent' && o.id === matched.cook_parent_id
              );
              setCookInputText(found ? found.display_name : loadedDay.plan_cook_name || '');
            } else if (matched.cook_employee_id) {
              const found = loadedCooks.find(
                (o) => o.type === 'employee' && o.id === matched.cook_employee_id
              );
              setCookInputText(found ? found.display_name : loadedDay.plan_cook_name || '');
            } else {
              setCookInputText(matched.cook_custom_name || '');
            }
          }
        }
      } catch (err) {
        console.error('Error loading editor metadata:', err);
      }
    };

    loadMetadata();
    return () => {
      ignore = true;
    };
  }, [initialDay, token]);

  const persistChanges = useCallback(
    async (
      nextComponents: MealAllergenComponent[],
      nextCookParentId: string | null = cookParentId,
      nextCookEmployeeId: string | null = cookEmployeeId,
      nextCookCustomName: string = cookCustomName
    ) => {
      if (!canWrite) return;
      setSaving(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/meal-allergens/${encodeURIComponent(day.date)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            cook_parent_id: nextCookParentId,
            cook_employee_id: nextCookEmployeeId,
            cook_custom_name: nextCookCustomName,
            meal_components: nextComponents,
            documentation: day.documentation || {},
          }),
        });

        if (res.ok) {
          const updated: MealAllergenDay = await res.json();
          setDay(updated);
          setStatus(updated.status);
          setHasAllergenRecord(updated.has_allergen_record);
          onDaySaved(updated);
        }
      } catch (err) {
        console.error('Error saving meal allergens:', err);
      } finally {
        setSaving(false);
      }
    },
    [canWrite, token, day.date, day.documentation, cookParentId, cookEmployeeId, cookCustomName, onDaySaved]
  );

  const handleFinalize = useCallback(async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/meal-allergens/${encodeURIComponent(day.date)}/finalize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cook_parent_id: cookParentId,
          cook_employee_id: cookEmployeeId,
          cook_custom_name: cookCustomName,
          meal_components: mealComponents,
          documentation: day.documentation || {},
        }),
      });

      if (res.ok) {
        const updated: MealAllergenDay = await res.json();
        setDay(updated);
        setStatus(updated.status);
        setHasAllergenRecord(updated.has_allergen_record);
        onDaySaved(updated);
      }
    } catch (err) {
      console.error('Error finalizing meal allergens:', err);
    } finally {
      setSaving(false);
    }
  }, [canWrite, token, day.date, day.documentation, cookParentId, cookEmployeeId, cookCustomName, mealComponents, onDaySaved]);

  // Searchable Cook Combobox handlers
  const filteredCookOptions = useMemo(() => {
    const q = cookInputText.trim().toLowerCase();
    if (!q) return cookOptions;
    return cookOptions.filter((o) => o.display_name.toLowerCase().includes(q));
  }, [cookOptions, cookInputText]);

  const handleSelectCookOption = useCallback(
    (opt: CookOption) => {
      const nextParentId = opt.type === 'parent' ? opt.id : null;
      const nextEmpId = opt.type === 'employee' ? opt.id : null;
      setCookParentId(nextParentId);
      setCookEmployeeId(nextEmpId);
      setCookCustomName('');
      setCookInputText(opt.display_name);
      setIsCookDropdownOpen(false);
      persistChanges(mealComponents, nextParentId, nextEmpId, '');
    },
    [mealComponents, persistChanges]
  );

  const handleAcceptCookText = useCallback(() => {
    setIsCookDropdownOpen(false);
    const trimmed = cookInputText.trim();
    if (!trimmed) {
      setCookParentId(null);
      setCookEmployeeId(null);
      setCookCustomName('');
      persistChanges(mealComponents, null, null, '');
      return;
    }

    const exactMatch = cookOptions.find(
      (o) => o.display_name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exactMatch) {
      const nextParentId = exactMatch.type === 'parent' ? exactMatch.id : null;
      const nextEmpId = exactMatch.type === 'employee' ? exactMatch.id : null;
      setCookParentId(nextParentId);
      setCookEmployeeId(nextEmpId);
      setCookCustomName('');
      setCookInputText(exactMatch.display_name);
      persistChanges(mealComponents, nextParentId, nextEmpId, '');
    } else {
      // Implicitly becomes the custom cook name
      setCookParentId(null);
      setCookEmployeeId(null);
      setCookCustomName(trimmed);
      setCookInputText(trimmed);
      persistChanges(mealComponents, null, null, trimmed);
    }
  }, [cookInputText, cookOptions, mealComponents, persistChanges]);

  // Meal Component operations
  // Pressing "+ Komponente" adds a component UI card with the name text box in edit mode and auto-expands predefined allergens
  const handleAddComponentClick = useCallback(() => {
    const newIndex = mealComponents.length;
    const next = [...mealComponents, { name: '', allergens: [] }];
    setMealComponents(next);
    setEditingComponentIdx(newIndex);
    setExpandedAllergenIndices((prev) => ({ ...prev, [newIndex]: true }));
  }, [mealComponents]);

  const handleRemoveComponent = useCallback(
    (index: number) => {
      const next = mealComponents.filter((_, idx) => idx !== index);
      setMealComponents(next);
      setEditingComponentIdx(null);
      setExpandedAllergenIndices((prev) => {
        const updated: Record<number, boolean> = {};
        Object.keys(prev).forEach((k) => {
          const numKey = Number(k);
          if (numKey < index) updated[numKey] = prev[numKey];
          else if (numKey > index) updated[numKey - 1] = prev[numKey];
        });
        return updated;
      });
      persistChanges(next);
    },
    [mealComponents, persistChanges]
  );

  const handleComponentNameChange = useCallback((index: number, newName: string) => {
    setMealComponents((prev) =>
      prev.map((c, idx) => (idx === index ? { ...c, name: newName } : c))
    );
  }, []);

  const handleFinishEditingComponentName = useCallback(
    (index: number) => {
      const current = mealComponents[index];
      if (!current) {
        setEditingComponentIdx(null);
        return;
      }
      const trimmed = (current.name || '').trim();
      const next = mealComponents.map((c, idx) =>
        idx === index ? { ...c, name: trimmed } : c
      );
      setMealComponents(next);
      setEditingComponentIdx(null);
      persistChanges(next);
    },
    [mealComponents, persistChanges]
  );

  const handleToggleAllergenSection = useCallback((compIndex: number) => {
    setExpandedAllergenIndices((prev) => ({
      ...prev,
      [compIndex]: !prev[compIndex],
    }));
  }, []);

  const handleToggleAllergen = useCallback(
    (compIndex: number, allergenKey: string) => {
      const cleaned = allergenKey.trim();
      if (!cleaned) return;
      const next = mealComponents.map((comp, idx) => {
        if (idx !== compIndex) return comp;
        const exists = comp.allergens.includes(cleaned);
        return {
          ...comp,
          allergens: exists
            ? comp.allergens.filter((a) => a !== cleaned)
            : [...comp.allergens, cleaned],
        };
      });
      setMealComponents(next);
      persistChanges(next);
    },
    [mealComponents, persistChanges]
  );

  const handleRemoveAllergen = useCallback(
    (compIndex: number, allergenKey: string) => {
      const next = mealComponents.map((comp, idx) => {
        if (idx !== compIndex) return comp;
        return {
          ...comp,
          allergens: comp.allergens.filter((a) => a !== allergenKey),
        };
      });
      setMealComponents(next);
      persistChanges(next);
    },
    [mealComponents, persistChanges]
  );

  const handleAddCustomAllergen = useCallback(
    (compIndex: number) => {
      const val = (customAllergenInput[compIndex] || '').trim();
      if (!val) return;
      const next = mealComponents.map((comp, idx) => {
        if (idx !== compIndex) return comp;
        if (comp.allergens.includes(val)) return comp;
        return {
          ...comp,
          allergens: [...comp.allergens, val],
        };
      });
      setMealComponents(next);
      setCustomAllergenInput((prev) => ({ ...prev, [compIndex]: '' }));
      persistChanges(next);
    },
    [customAllergenInput, mealComponents, persistChanges]
  );

  // Copy from another day
  const currentEditorDaySnapshot: MealAllergenDay = useMemo(
    () => ({
      ...day,
      cook_parent_id: cookParentId,
      cook_employee_id: cookEmployeeId,
      cook_custom_name: cookCustomName,
      meal_components: mealComponents,
    }),
    [day, cookParentId, cookEmployeeId, cookCustomName, mealComponents]
  );

  const suggestedEntries = useMemo(
    () => getSuggestedEntriesForCook(currentEditorDaySnapshot, allEntries),
    [currentEditorDaySnapshot, allEntries]
  );

  const getSourceComponents = (sourceDay: MealAllergenDay): MealAllergenComponent[] => {
    if (sourceDay.meal_components && sourceDay.meal_components.length > 0) {
      return sourceDay.meal_components;
    }
    return (sourceDay.plan_meal_components || []).map((name) => ({
      name,
      allergens: [],
    }));
  };

  const targetAlreadyHasData = useMemo(() => {
    if (hasAllergenRecord && mealComponents.length > 0) return true;
    return mealComponents.some((c) => c.allergens.length > 0);
  }, [hasAllergenRecord, mealComponents]);

  const handleSelectSourceDayToCopy = useCallback(
    (sourceDay: MealAllergenDay) => {
      if (targetAlreadyHasData) {
        setPendingCopySource(sourceDay);
      } else {
        const next = replaceMealComponents(getSourceComponents(sourceDay));
        setMealComponents(next);
        setIsCopyModalOpen(false);
        setPendingCopySource(null);
        persistChanges(next);
      }
    },
    [targetAlreadyHasData, persistChanges]
  );

  const handleConfirmCombine = useCallback(() => {
    if (!pendingCopySource) return;
    const next = combineMealComponents(mealComponents, getSourceComponents(pendingCopySource));
    setMealComponents(next);
    setPendingCopySource(null);
    setIsCopyModalOpen(false);
    persistChanges(next);
  }, [pendingCopySource, mealComponents, persistChanges]);

  const handleConfirmReplace = useCallback(() => {
    if (!pendingCopySource) return;
    const next = replaceMealComponents(getSourceComponents(pendingCopySource));
    setMealComponents(next);
    setPendingCopySource(null);
    setIsCopyModalOpen(false);
    persistChanges(next);
  }, [pendingCopySource, persistChanges]);

  const dateObj = parseDateKey(day.date);
  const { dayName } = formatDayHeader(dateObj);
  const formattedDate = formatDisplayDate(dateObj);
  const planMealName =
    day.plan_meal_components && day.plan_meal_components.length > 0
      ? day.plan_meal_components.join(', ')
      : t('noMealsPlanned');

  return (
    <div className="meal-allergens-editor" data-testid="meal-allergens-editor">
      {/* Header with back arrow, day, and meal name from meal plan */}
      <div className="meal-allergens-editor-header">
        <div className="meal-allergens-editor-title-group">
          <button
            type="button"
            className="meal-allergens-back-btn"
            onClick={onBack}
            aria-label={t('backToOverview')}
            title={t('backToOverview')}
            data-testid="allergens-editor-back-btn"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="meal-allergens-editor-titles">
            <h2 className="meal-allergens-editor-day-title" data-testid="allergens-editor-header-title">
              {dayName}, {formattedDate} — {planMealName}
            </h2>
            <div className="meal-allergens-editor-plan-subtitle" data-testid="allergens-editor-status">
              Status:{' '}
              <strong>
                {status === 'finalized'
                  ? t('statusFinalized')
                  : status === 'not_finalized'
                  ? t('statusNotFinalized')
                  : status === 'not_relevant'
                  ? t('statusNotRelevant')
                  : t('statusUnspecified')}
              </strong>
            </div>
          </div>
        </div>

        {canWrite && (
          <div className="meal-allergens-editor-actions">
            <button
              type="button"
              className="meal-allergens-copy-btn"
              onClick={() => setIsCopyModalOpen(true)}
              data-testid="copy-allergens-from-btn"
            >
              <Copy size={16} />
              <span>{t('copyAllergensFromBtn')}</span>
            </button>

            <button
              type="button"
              className="meal-allergens-finalize-btn"
              onClick={handleFinalize}
              disabled={saving}
              data-testid="finalize-allergens-btn"
            >
              <Check size={16} />
              <span>{t('finalizeAllergensBtn')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Warning banner when finalized */}
      {status === 'finalized' && (
        <div className="meal-allergens-finalized-warning" data-testid="finalized-warning-banner">
          <AlertTriangle size={20} />
          <span>{t('finalizedWarningBanner')}</span>
        </div>
      )}

      {/* Searchable Cook Combobox (filters options while typing, or accepts free text implicitly) */}
      <div className="meal-allergens-meta-grid">
        <div className="meal-allergens-field-group">
          <label className="meal-allergens-field-label">{t('cookSelectionLabel')}</label>
          <div className="meal-allergens-cook-combobox" data-testid="cook-combobox">
            <input
              type="text"
              className="meal-allergens-input"
              placeholder={t('customCookPlaceholder')}
              value={cookInputText}
              onFocus={() => {
                if (canWrite) setIsCookDropdownOpen(true);
              }}
              onChange={(e) => {
                setCookInputText(e.target.value);
                setIsCookDropdownOpen(true);
              }}
              onBlur={() => {
                handleAcceptCookText();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAcceptCookText();
                } else if (e.key === 'Escape') {
                  setIsCookDropdownOpen(false);
                }
              }}
              disabled={!canWrite}
              data-testid="cook-combobox-input"
            />

            {canWrite && isCookDropdownOpen && filteredCookOptions.length > 0 && (
              <div className="meal-allergens-cook-dropdown" data-testid="cook-combobox-dropdown">
                {filteredCookOptions.map((opt) => {
                  const isSelected =
                    (opt.type === 'parent' && opt.id === cookParentId) ||
                    (opt.type === 'employee' && opt.id === cookEmployeeId);
                  return (
                    <button
                      key={`${opt.type}:${opt.id}`}
                      type="button"
                      className={`meal-allergens-cook-option ${isSelected ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCookOption(opt);
                      }}
                      data-testid={`cook-option-${opt.type}-${opt.id}`}
                    >
                      <span>{opt.display_name}</span>
                      <span className="meal-allergens-cook-option-badge">
                        {opt.type === 'employee' ? t('cookTypeEmployee') : t('cookTypeParent')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meal Components & Allergens List */}
      <div className="meal-allergens-components-section" data-testid="meal-components-list">
        {mealComponents.map((comp, compIdx) => {
          const isEditingName = editingComponentIdx === compIdx;
          const isAllergensExpanded = Boolean(expandedAllergenIndices[compIdx]);

          return (
            <div
              key={compIdx}
              className="meal-allergens-component-card"
              data-testid={`meal-component-card-${compIdx}`}
            >
              <div className="meal-allergens-component-top">
                {isEditingName ? (
                  <>
                    <input
                      type="text"
                      className="meal-allergens-component-name-input"
                      placeholder={t('mealComponentPlaceholder')}
                      value={comp.name}
                      autoFocus
                      onChange={(e) => handleComponentNameChange(compIdx, e.target.value)}
                      onBlur={() => handleFinishEditingComponentName(compIdx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFinishEditingComponentName(compIdx);
                        }
                      }}
                      disabled={!canWrite}
                      aria-label={t('renameMealComponent')}
                      data-testid={`meal-component-name-input-${compIdx}`}
                    />

                    {canWrite && (
                      <button
                        type="button"
                        className="meal-allergens-remove-component-btn"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleRemoveComponent(compIdx);
                        }}
                        onClick={() => handleRemoveComponent(compIdx)}
                        title={t('removeMealComponent')}
                        data-testid={`remove-meal-component-btn-${compIdx}`}
                      >
                        <Trash2 size={14} />
                        <span>{t('delete')}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="meal-allergens-component-title-display">
                    <span
                      className="meal-allergens-component-name-text"
                      data-testid={`meal-component-name-text-${compIdx}`}
                    >
                      {comp.name}
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        className="meal-allergens-edit-name-btn"
                        onClick={() => setEditingComponentIdx(compIdx)}
                        title={t('renameMealComponent')}
                        aria-label={t('renameMealComponent')}
                        data-testid={`edit-meal-component-name-btn-${compIdx}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="meal-allergens-tags-row" data-testid={`meal-component-allergens-${compIdx}`}>
                {comp.allergens.map((allergen) => (
                  <span
                    key={allergen}
                    className="meal-allergens-tag-pill"
                    data-testid={`allergen-pill-${compIdx}-${allergen}`}
                  >
                    <span>{getAllergenDisplayLabel(allergen)}</span>
                    {canWrite && (
                      <button
                        type="button"
                        className="meal-allergens-tag-remove"
                        onClick={() => handleRemoveAllergen(compIdx, allergen)}
                        aria-label={`Remove ${allergen}`}
                        data-testid={`remove-allergen-btn-${compIdx}-${allergen}`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                ))}

                {canWrite && (
                  <button
                    type="button"
                    className="meal-allergens-expand-chip"
                    onClick={() => handleToggleAllergenSection(compIdx)}
                    data-testid={`toggle-allergens-chip-${compIdx}`}
                  >
                    {isAllergensExpanded ? t('collapseAllergensChip') : t('expandAllergensChip')}
                  </button>
                )}
              </div>

              {canWrite && isAllergensExpanded && (
                <div
                  className="meal-allergens-picker-panel"
                  data-testid={`allergen-picker-panel-${compIdx}`}
                >
                  <div className="meal-allergens-main-list">
                    {MAIN_ALLERGENS.map((item) => {
                      const isSelected = comp.allergens.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`meal-allergens-main-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleAllergen(compIdx, item.key)}
                          data-testid={`allergen-option-${compIdx}-${item.key}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ marginTop: '0.15rem', pointerEvents: 'none' }}
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="meal-allergens-custom-row">
                    <input
                      type="text"
                      className="meal-allergens-input"
                      style={{ flex: 1 }}
                      placeholder={t('customAllergenPlaceholder')}
                      value={customAllergenInput[compIdx] || ''}
                      onChange={(e) =>
                        setCustomAllergenInput((prev) => ({
                          ...prev,
                          [compIdx]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomAllergen(compIdx);
                        }
                      }}
                      data-testid={`custom-allergen-input-${compIdx}`}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleAddCustomAllergen(compIdx)}
                      data-testid={`custom-allergen-add-btn-${compIdx}`}
                    >
                      {t('addCustomAllergenBtn')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {canWrite && (
          <div className="meal-allergens-add-component-bar">
            <button
              type="button"
              className="primary-button"
              onClick={handleAddComponentClick}
              data-testid="add-meal-component-btn"
            >
              <Plus size={16} />
              <span>+ Komponente</span>
            </button>
          </div>
        )}
      </div>

      {/* Copy Allergens From Modal / Popover */}
      {isCopyModalOpen && (
        <div className="meal-allergens-modal-overlay" data-testid="copy-allergens-modal">
          <div className="meal-allergens-modal-content">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{t('copyAllergensModalTitle')}</h3>
              <button
                type="button"
                className="meal-allergens-back-btn"
                onClick={() => {
                  setIsCopyModalOpen(false);
                  setPendingCopySource(null);
                }}
                data-testid="close-copy-modal-btn"
              >
                <X size={18} />
              </button>
            </div>

            {/* Suggested last 3 entries where the same cook cooked, sorted by similarity */}
            <div className="meal-allergens-suggestions-box" data-testid="copy-suggestions-section">
              <strong style={{ fontSize: '0.88rem', color: '#334155' }}>
                {t('copySuggestionsTitle')}
              </strong>
              {suggestedEntries.length > 0 ? (
                <div className="meal-allergens-suggestions-list" data-testid="copy-suggestions-list">
                  {suggestedEntries.map((sug) => {
                    const comps =
                      sug.meal_components && sug.meal_components.length > 0
                        ? sug.meal_components.map((c) => c.name).join(', ')
                        : (sug.plan_meal_components || []).join(', ');
                    return (
                      <button
                        key={sug.date}
                        type="button"
                        className="meal-allergens-suggestion-item"
                        onClick={() => handleSelectSourceDayToCopy(sug)}
                        data-testid={`copy-suggestion-item-${sug.date}`}
                        data-date={sug.date}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                          {formatDisplayDate(parseDateKey(sug.date))} —{' '}
                          {sug.cook_display_name || sug.plan_cook_name}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569' }}>{comps}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="meal-allergen-empty-text">{t('noCopySuggestions')}</div>
              )}
            </div>

            {/* Reusable Calendar / Week view with Fulltext Search */}
            <MealAllergensCalendarView
              onSelectDay={handleSelectSourceDayToCopy}
              initialDate={dateObj}
              enableSearch={true}
              allEntries={allEntries}
              excludeDateFromSearchJump={day.date}
              testIdPrefix="copy-picker"
            />
          </div>
        </div>
      )}

      {/* Combine vs Replace Confirmation Dialog */}
      {pendingCopySource && (
        <div
          className="meal-allergens-modal-overlay"
          style={{ zIndex: 1300 }}
          data-testid="copy-conflict-dialog"
        >
          <div className="meal-allergens-conflict-dialog">
            <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
              {t('copyConflictTitle')}
            </h4>
            <p style={{ margin: 0, fontSize: '0.92rem', color: '#475569' }}>
              {t('copyConflictMessage')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                className="meal-allergens-copy-btn"
                onClick={() => setPendingCopySource(null)}
                data-testid="copy-cancel-btn"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="meal-allergens-copy-btn"
                style={{ borderColor: '#2563eb', color: '#1d4ed8', background: '#eff6ff' }}
                onClick={handleConfirmCombine}
                data-testid="copy-combine-btn"
              >
                {t('combineAllergensBtn')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmReplace}
                data-testid="copy-replace-btn"
              >
                {t('replaceAllergensBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
