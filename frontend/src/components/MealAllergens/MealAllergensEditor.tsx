import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Copy, Pencil, Plus, X, Utensils, Check } from 'lucide-react';
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
  getAllergenColor,
  getAllergenBgColor,
} from '../../utils/mealAllergens';
import { AllergenIcon } from './AllergenIcon';
import { MealAllergensCalendarView } from './MealAllergensCalendarView';
import { CellPopover } from '../Table/CellPopover';
import { RowActionsMenu } from '../Table/RowActionsMenu';

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
    // Meal plan components are not transferred by default
    return [];
  });
  const [status, setStatus] = useState<MealAllergenStatus>(initialDay.status || 'unspecified');
  const [hasAllergenRecord, setHasAllergenRecord] = useState<boolean>(initialDay.has_allergen_record);

  // Popover state for editing a single component
  const [editingComponentIdx, setEditingComponentIdx] = useState<number | null>(null);
  const [isNewComponent, setIsNewComponent] = useState<boolean>(false);
  const [editingSnapshot, setEditingSnapshot] = useState<MealAllergenComponent | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const [customAllergenInput, setCustomAllergenInput] = useState<Record<number, string>>({});
  const [_saving, setSaving] = useState<boolean>(false);

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
            // Meal plan components are not transferred by default
            setMealComponents([]);
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
  // Pressing "+ Komponente" adds a component and opens the popover editor for it
  const handleAddComponentClick = useCallback(
    (initialName: string = '', triggerEl?: HTMLElement | null) => {
      const newIndex = mealComponents.length;
      const next = [...mealComponents, { name: initialName, allergens: [] }];
      setMealComponents(next);
      setIsNewComponent(true);
      setEditingSnapshot({ name: initialName, allergens: [] });
      setEditingComponentIdx(newIndex);
      setAnchorEl(triggerEl || addBtnRef.current || null);
      if (initialName.trim()) {
        persistChanges(next);
      }
    },
    [mealComponents, persistChanges]
  );

  const handleClosePopover = useCallback(() => {
    if (editingComponentIdx !== null && mealComponents[editingComponentIdx]) {
      const current = mealComponents[editingComponentIdx];
      const trimmed = (current.name || '').trim();
      if (isNewComponent) {
        if (!trimmed) {
          // Discard newly added empty component without name
          const next = mealComponents.filter((_, idx) => idx !== editingComponentIdx);
          setMealComponents(next);
          // Only persist if it had initially been persisted (e.g. from plan shortcut)
          if ((editingSnapshot?.name || '').trim()) {
            persistChanges(next);
          }
        } else {
          const next = mealComponents.map((c, idx) =>
            idx === editingComponentIdx ? { ...c, name: trimmed } : c
          );
          setMealComponents(next);
          persistChanges(next);
        }
      } else {
        // Existing component: only persist if name or allergens actually changed
        const origName = (editingSnapshot?.name || '').trim();
        const origAllergens = editingSnapshot?.allergens || [];
        const currentAllergens = current.allergens || [];

        const nameChanged = trimmed !== origName;
        const allergensChanged =
          currentAllergens.length !== origAllergens.length ||
          currentAllergens.some((a, i) => a !== origAllergens[i]);

        if (nameChanged || allergensChanged) {
          const next = mealComponents.map((c, idx) =>
            idx === editingComponentIdx ? { ...c, name: trimmed } : c
          );
          setMealComponents(next);
          persistChanges(next);
        } else {
          // No changes made! Revert name in case user typed whitespace
          if (current.name !== (editingSnapshot?.name || '')) {
            setMealComponents((prev) =>
              prev.map((c, idx) =>
                idx === editingComponentIdx ? { ...c, name: editingSnapshot?.name || '' } : c
              )
            );
          }
          // Do not call persistChanges, leaving status completely untouched!
        }
      }
    }
    setIsNewComponent(false);
    setEditingSnapshot(null);
    setEditingComponentIdx(null);
    setAnchorEl(null);
  }, [editingComponentIdx, editingSnapshot, isNewComponent, mealComponents, persistChanges]);

  const handleRemoveComponent = useCallback(
    (index: number) => {
      const next = mealComponents.filter((_, idx) => idx !== index);
      setMealComponents(next);
      setIsNewComponent(false);
      setEditingSnapshot(null);
      setEditingComponentIdx(null);
      setAnchorEl(null);
      persistChanges(next);
    },
    [mealComponents, persistChanges]
  );

  const handleComponentNameChange = useCallback((index: number, newName: string) => {
    setMealComponents((prev) =>
      prev.map((c, idx) => (idx === index ? { ...c, name: newName } : c))
    );
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

  const handleFinalizeClick = useCallback(async () => {
    if (!canWrite) return;
    if (!window.confirm(t('finalizeConfirm') || 'Allergene finalisieren?')) {
      return;
    }
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

  const dateObj = parseDateKey(day.date);
  const { dayName } = formatDayHeader(dateObj);
  const formattedDate = formatDisplayDate(dateObj);

  return (
    <div className="meal-allergens-editor" data-testid="meal-allergens-editor">
      {/* Header with back arrow, day */}
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
              {dayName}, {formattedDate}
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
          </div>
        )}
      </div>

      {/* Read-only Meal Plan Reference Box */}
      <div className="meal-allergens-plan-reference-box" data-testid="meal-plan-reference-box">
        <div className="meal-allergens-plan-reference-header">
          <Utensils size={16} />
          <span className="meal-allergens-plan-reference-title">
            {t('mealPlanReferenceTitle')}
          </span>
        </div>
        <div className="meal-allergens-plan-reference-content">
          {!day.plan_cook_name?.trim() && (!day.plan_meal_components || day.plan_meal_components.length === 0) ? (
            <span className="meal-allergen-empty-text" data-testid="meal-plan-empty-text">
              {t('nothingEntered')}
            </span>
          ) : (
            <>
              {day.plan_cook_name?.trim() && (
                <div className="meal-allergens-plan-ref-cook" data-testid="meal-plan-ref-cook">
                  <strong>{day.plan_cook_name}</strong>
                </div>
              )}
              {day.plan_meal_components && day.plan_meal_components.length > 0 && (
                <div className="meal-allergens-plan-ref-components" data-testid="meal-plan-ref-components">
                  {day.plan_meal_components.map((c, i) => (
                    <div key={i} className="meal-allergens-plan-comp-line" data-testid={`plan-comp-chip-${i}`}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
        {mealComponents.map((comp, compIdx) => (
          <div
            key={compIdx}
            ref={(el) => {
              cardRefs.current[compIdx] = el;
            }}
            className="meal-allergens-component-card"
            data-testid={`meal-component-card-${compIdx}`}
          >
            <div className="meal-allergens-component-top">
              <div className="meal-allergens-component-title-display">
                <span
                  className={`meal-allergens-component-name-text ${!comp.name?.trim() ? 'unnamed' : ''}`}
                  data-testid={`meal-component-name-text-${compIdx}`}
                >
                  {comp.name?.trim() || t('unnamedComponent')}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="meal-allergens-edit-name-btn"
                    onClick={(e) => {
                      setIsNewComponent(false);
                      setEditingSnapshot({
                        name: comp.name || '',
                        allergens: [...comp.allergens],
                      });
                      setAnchorEl(e.currentTarget);
                      setEditingComponentIdx(compIdx);
                    }}
                    title={t('editComponent')}
                    aria-label={t('editComponent')}
                    data-testid={`edit-meal-component-name-btn-${compIdx}`}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>

              {canWrite && (
                <RowActionsMenu
                  onDelete={() => handleRemoveComponent(compIdx)}
                  deleteLabel={t('delete')}
                  entityName={comp.name?.trim() || t('unnamedComponent')}
                  testId={`component-actions-btn-${compIdx}`}
                  deleteTestId={`remove-meal-component-btn-${compIdx}`}
                />
              )}
            </div>

            <div className="meal-allergens-tags-row" data-testid={`meal-component-allergens-${compIdx}`}>
              {comp.allergens.length === 0 ? (
                <span className="meal-allergen-none-text">{t('noAllergensSelected')}</span>
              ) : (
                comp.allergens.map((allergen) => (
                  <span
                    key={allergen}
                    className="meal-allergens-tag-pill"
                    style={{
                      borderColor: `${getAllergenColor(allergen)}45`,
                      backgroundColor: getAllergenBgColor(allergen),
                    }}
                    data-testid={`allergen-pill-${compIdx}-${allergen}`}
                  >
                    <AllergenIcon allergenKey={allergen} size={14} />
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
                ))
              )}
            </div>
          </div>
        ))}

        {canWrite && (
          <div className="meal-allergens-add-component-bar">
            <button
              ref={addBtnRef}
              type="button"
              className="primary-button meal-allergens-add-component-btn"
              onClick={(e) => handleAddComponentClick('', e.currentTarget)}
              data-testid="add-meal-component-btn"
            >
              <Plus size={16} />
              <span>{t('addMealComponent')}</span>
            </button>

            {day.plan_meal_components && day.plan_meal_components.length > 0 && (
              <div className="meal-allergens-add-plan-shortcuts">
                <span className="meal-allergens-add-plan-label">{t('takeFromPlanLabel')}</span>
                <div className="meal-allergens-add-plan-chip-group">
                  {day.plan_meal_components.map((planComp, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      className="meal-allergens-add-plan-chip-btn"
                      onClick={(e) => handleAddComponentClick(planComp, e.currentTarget)}
                      title={`"${planComp}" aus Speiseplan hinzufügen`}
                      data-testid={`add-plan-comp-shortcut-${pIdx}`}
                    >
                      <Plus size={13} />
                      <span>{planComp}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Finalize section under meal components */}
      {canWrite && (
        <div className="meal-allergens-finalize-section" data-testid="finalize-section">
          <button
            type="button"
            className="meal-allergens-finalize-btn"
            onClick={handleFinalizeClick}
            disabled={status === 'finalized' || mealComponents.length === 0}
            data-testid="finalize-allergens-btn"
          >
            <Check size={16} />
            <span>{t('finalizeBtn')}</span>
          </button>
        </div>
      )}

      {/* Component Editor Popover (Modal on desktop, Bottom Sheet on mobile) */}
      {canWrite && editingComponentIdx !== null && mealComponents[editingComponentIdx] && (
        <>
          <div
            className="meal-component-popover-desktop-backdrop"
            onClick={handleClosePopover}
            aria-hidden="true"
          />
          <CellPopover
            isOpen={editingComponentIdx !== null}
            onClose={handleClosePopover}
            anchorEl={anchorEl || cardRefs.current[editingComponentIdx] || addBtnRef.current}
            className="glass-popup meal-component-popover"
            width={680}
            minWidth={340}
            closeOnScrollOutOfView={false}
          >
            <div className="meal-comp-popover-header">
              <h3 className="meal-comp-popover-title">{t('editComponent')}</h3>
              <button
                type="button"
                className="meal-comp-popover-close-btn"
                onClick={handleClosePopover}
                title={t('close') || 'Schließen'}
                aria-label={t('close') || 'Schließen'}
                data-testid="close-component-popover-btn"
              >
                <X size={18} />
              </button>
            </div>

            <div className="meal-comp-popover-body">
              <div className="meal-comp-popover-field">
                <label className="meal-comp-popover-label">{t('componentNameLabel')}</label>
                <input
                  type="text"
                  className="meal-allergens-input meal-comp-popover-name-input"
                  placeholder={t('mealComponentPlaceholder')}
                  value={mealComponents[editingComponentIdx].name}
                  autoFocus
                  onChange={(e) => handleComponentNameChange(editingComponentIdx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleClosePopover();
                    }
                  }}
                  data-testid={`meal-component-name-input-${editingComponentIdx}`}
                />

                {day.plan_meal_components && day.plan_meal_components.length > 0 && (
                  <div className="meal-allergens-plan-take-row">
                    <span className="meal-allergens-plan-take-label">{t('takeFromPlanLabel')}</span>
                    <div className="meal-allergens-plan-take-chips">
                      {day.plan_meal_components.map((planName, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          className={`meal-allergens-plan-take-chip ${mealComponents[editingComponentIdx].name === planName ? 'active' : ''}`}
                          onClick={() => handleComponentNameChange(editingComponentIdx, planName)}
                          title={`"${planName}" übernehmen`}
                          data-testid={`take-plan-component-btn-${editingComponentIdx}-${pIdx}`}
                        >
                          <span>{planName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const currentComp = editingComponentIdx !== null ? mealComponents[editingComponentIdx] : null;
                const hasName = Boolean(currentComp?.name?.trim());

                return (
                  <div className="meal-comp-popover-field">
                    <div className="meal-allergens-section-header">
                      <label className="meal-comp-popover-label">{t('allergensLabel')}</label>
                      {!hasName && (
                        <span className="meal-comp-popover-name-hint" data-testid="name-required-hint">
                          {t('nameRequiredForAllergens')}
                        </span>
                      )}
                    </div>

                    <div
                      className={`meal-allergens-main-list ${!hasName ? 'locked' : ''}`}
                      data-testid={`allergen-picker-panel-${editingComponentIdx}`}
                    >
                      {MAIN_ALLERGENS.map((item) => {
                        const isSelected = Boolean(currentComp?.allergens.includes(item.key));
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={`meal-allergens-main-option ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleToggleAllergen(editingComponentIdx, item.key)}
                            disabled={!hasName}
                            data-testid={`allergen-option-${editingComponentIdx}-${item.key}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              disabled={!hasName}
                              style={{ marginTop: '0.2rem', pointerEvents: 'none' }}
                            />
                            <span
                              className="meal-allergen-icon-wrap"
                              style={{ backgroundColor: getAllergenBgColor(item.key) }}
                              aria-hidden="true"
                            >
                              <AllergenIcon allergenKey={item.key} size={20} />
                            </span>
                            <div className="meal-allergen-info-block">
                              <strong className="meal-allergen-main-name">{item.shortLabel}</strong>
                              {item.subtypes && (
                                <span className="meal-allergen-subtypes">{item.subtypes}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className={`meal-allergens-custom-row ${!hasName ? 'locked' : ''}`} style={{ marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        className="meal-allergens-input"
                        style={{ flex: 1 }}
                        placeholder={t('customAllergenPlaceholder')}
                        value={customAllergenInput[editingComponentIdx] || ''}
                        disabled={!hasName}
                        onChange={(e) =>
                          setCustomAllergenInput((prev) => ({
                            ...prev,
                            [editingComponentIdx]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (hasName) {
                              handleAddCustomAllergen(editingComponentIdx);
                            }
                          }
                        }}
                        data-testid={`custom-allergen-input-${editingComponentIdx}`}
                      />
                      <button
                        type="button"
                        className="primary-button meal-allergens-custom-add-btn"
                        onClick={() => handleAddCustomAllergen(editingComponentIdx)}
                        disabled={!hasName}
                        title={t('addCustomAllergenBtn')}
                        aria-label={t('addCustomAllergenBtn')}
                        data-testid={`custom-allergen-add-btn-${editingComponentIdx}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="meal-comp-popover-footer">
              <button
                type="button"
                className="primary-button meal-comp-popover-done-btn"
                onClick={handleClosePopover}
                data-testid="popover-done-btn"
              >
                {t('done')}
              </button>
            </div>
          </CellPopover>
        </>
      )}

      {/* Copy Allergens From Modal / Popover */}
      {isCopyModalOpen && (
        <div className="meal-allergens-modal-overlay" data-testid="copy-allergens-modal">
          <div className="meal-allergens-modal-content">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border)',
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
              <strong style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
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
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-h)' }}>
                          {formatDisplayDate(parseDateKey(sug.date))} —{' '}
                          {sug.cook_display_name || sug.plan_cook_name}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{comps}</div>
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
            <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-h)' }}>
              {t('copyConflictTitle')}
            </h4>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
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
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--bg-hover)' }}
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
