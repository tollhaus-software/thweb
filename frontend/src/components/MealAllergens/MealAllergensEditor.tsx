import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Copy, Pencil, Plus, X, Utensils, Check, CircleDot, AlertTriangle, History, RefreshCw, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { t, formatDisplayDate } from '../../utils/i18n';
import { parseDateKey, formatDayHeader } from '../../utils/mealPlan';
import {
  type MealAllergenDay,
  type MealAllergenComponent,
  type MealAllergenStatus,
  type MealAllergenCook,
  type CookOption,
  MAIN_ALLERGENS,
  getAllergenDisplayLabel,
  matchCookFromPlan,
  formatCooksDisplayName,
  sortCookOptions,
  getCookOptionKey,
  getSuggestedEntriesForCook,
  combineMealComponents,
  replaceMealComponents,
  getAllergenColor,
  getAllergenBgColor,
  findMatchingGroupsForComponentAllergen,
  type AllergiesMatchContext,
} from '../../utils/mealAllergens';
import { AllergenIcon } from './AllergenIcon';
import { MealAllergensCalendarView } from './MealAllergensCalendarView';
import { MealAllergensHistoryModal } from './MealAllergensHistoryModal';
import { CellPopover } from '../Table/CellPopover';
import { RowActionsMenu } from '../Table/RowActionsMenu';
import './MealAllergens.css';

export interface MealComponentAllergenBadgesProps {
  allergens: string[];
  compIdx: number;
  allergiesContext: AllergiesMatchContext | null;
  emptyLabel: string;
  emptyClassName?: string;
  pillClassName?: string;
  testIdPrefix?: string;
}

export const MealComponentAllergenBadges: React.FC<MealComponentAllergenBadgesProps> = ({
  allergens,
  compIdx,
  allergiesContext,
  emptyLabel,
  emptyClassName = 'meal-allergen-none-text',
  pillClassName = '',
  testIdPrefix = '',
}) => {
  if (!allergens || allergens.length === 0) {
    return <span className={emptyClassName}>{emptyLabel}</span>;
  }
  return (
    <>
      {allergens.map((allergen) => {
        const matchingGroups = findMatchingGroupsForComponentAllergen(
          allergen,
          allergiesContext,
          t('employeeAllergiesTitle') || 'Mitarbeitende'
        );
        const hasMatch = matchingGroups.length > 0;
        return (
          <div
            key={allergen}
            className={`meal-allergen-tag-wrapper ${hasMatch ? 'has-warning' : ''}`}
          >
            <span
              className={`meal-allergens-tag-pill ${pillClassName}`.trim()}
              style={{
                borderColor: `${getAllergenColor(allergen)}45`,
                backgroundColor: getAllergenBgColor(allergen),
              }}
              data-testid={`${testIdPrefix}allergen-pill-${compIdx}-${allergen}`}
            >
              <AllergenIcon allergenKey={allergen} size={14} />
              <span>{getAllergenDisplayLabel(allergen)}</span>
            </span>
            {hasMatch && (
              <span
                className="meal-allergen-match-warning"
                data-testid={`${testIdPrefix}allergen-match-warning-${compIdx}-${allergen}`}
                title={`${t('allergyPresentIn')}: ${matchingGroups.join(', ')}`}
              >
                <AlertTriangle size={12} className="meal-allergen-warning-icon" />
                <span>{matchingGroups.join(', ')}</span>
              </span>
            )}
          </div>
        );
      })}
    </>
  );
};

interface MealAllergensEditorProps {
  initialDay: MealAllergenDay;
  onBack: () => void;
  onDaySaved: (updated: MealAllergenDay) => void;
  hidePlanReference?: boolean;
  isDashboard?: boolean;
}

function buildInitialSelectedCooks(day: MealAllergenDay): MealAllergenCook[] {
  if (day.cooks && day.cooks.length > 0) {
    return day.cooks.map((c) => ({ ...c }));
  }
  if (day.cook_parent_id) {
    return [
      {
        id: day.cook_parent_id,
        type: 'parent',
        display_name: day.cook_display_name || '',
      },
    ];
  }
  if (day.cook_employee_id) {
    return [
      {
        id: day.cook_employee_id,
        type: 'employee',
        display_name: day.cook_display_name || '',
      },
    ];
  }
  return [];
}

export const MealAllergensEditor: React.FC<MealAllergensEditorProps> = ({
  initialDay,
  onBack,
  onDaySaved,
  hidePlanReference = false,
  isDashboard = false,
}) => {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('meal_allergens.write');

  const [day, setDay] = useState<MealAllergenDay>(initialDay);
  const [cookOptions, setCookOptions] = useState<CookOption[]>([]);
  const [allEntries, setAllEntries] = useState<MealAllergenDay[]>([]);
  const [allergiesContext, setAllergiesContext] = useState<AllergiesMatchContext | null>(null);

  // Cook state (list of parent/employee cooks, or fallback custom text)
  const [selectedCooks, setSelectedCooks] = useState<MealAllergenCook[]>(() =>
    buildInitialSelectedCooks(initialDay)
  );
  const [cookCustomName, setCookCustomName] = useState<string>(initialDay.cook_custom_name || '');

  // Cooks multi-select popover state
  const [isCooksPopoverOpen, setIsCooksPopoverOpen] = useState<boolean>(false);
  const [cooksAnchorEl, setCooksAnchorEl] = useState<HTMLElement | null>(null);
  const [cooksQuickFilter, setCooksQuickFilter] = useState<string>('');
  const [initialSelectedCookKeys, setInitialSelectedCookKeys] = useState<Set<string>>(new Set());

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
  const [componentStep, setComponentStep] = useState<1 | 2>(1);
  const [isNewComponent, setIsNewComponent] = useState<boolean>(false);
  const [editingSnapshot, setEditingSnapshot] = useState<MealAllergenComponent | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const editCooksBtnRef = useRef<HTMLButtonElement | null>(null);
  const [highlightCookBtn, setHighlightCookBtn] = useState(false);
  const [highlightAddCompBtn, setHighlightAddCompBtn] = useState(false);
  const cookHighlightTimer = useRef<number | null>(null);
  const compHighlightTimer = useRef<number | null>(null);

  const handleHighlightCook = () => {
    setHighlightCookBtn(true);
    editCooksBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    editCooksBtnRef.current?.focus();
    if (cookHighlightTimer.current) window.clearTimeout(cookHighlightTimer.current);
    cookHighlightTimer.current = window.setTimeout(() => setHighlightCookBtn(false), 2100);
  };

  const handleHighlightAddComp = () => {
    setHighlightAddCompBtn(true);
    addBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    addBtnRef.current?.focus();
    if (compHighlightTimer.current) window.clearTimeout(compHighlightTimer.current);
    compHighlightTimer.current = window.setTimeout(() => setHighlightAddCompBtn(false), 2100);
  };

  useEffect(() => {
    return () => {
      if (cookHighlightTimer.current) window.clearTimeout(cookHighlightTimer.current);
      if (compHighlightTimer.current) window.clearTimeout(compHighlightTimer.current);
    };
  }, []);
  const [customAllergenInput, setCustomAllergenInput] = useState<Record<number, string>>({});
  const [_saving, setSaving] = useState<boolean>(false);

  // Copy modal state
  const [isCopyModalOpen, setIsCopyModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [pendingCopySource, setPendingCopySource] = useState<MealAllergenDay | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState<boolean>(false);

  // Fetch cook options & all historical entries
  useEffect(() => {
    let ignore = false;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const loadMetadata = async () => {
      try {
        const [cooksRes, entriesRes, freshDayRes, allergiesRes] = await Promise.all([
          fetch('/api/meal-allergens/cooks', { headers }),
          fetch('/api/meal-allergens?all=true', { headers }),
          fetch(`/api/meal-allergens/${encodeURIComponent(initialDay.date)}`, { headers }),
          fetch(`/api/allergies/summary?date=${encodeURIComponent(initialDay.date)}`, { headers }),
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
        let loadedAllergies: AllergiesMatchContext | null = null;
        if (allergiesRes.ok) {
          loadedAllergies = await allergiesRes.json();
        }

        if (!ignore) {
          setMetadataLoaded(true);
          setCookOptions(loadedCooks);
          setAllEntries(loadedEntries);
          setDay(loadedDay);
          setStatus(loadedDay.status || 'unspecified');
          setHasAllergenRecord(loadedDay.has_allergen_record);
          if (loadedAllergies) {
            setAllergiesContext(loadedAllergies);
          }

          const enrichCook = (c: MealAllergenCook): MealAllergenCook => {
            const found = loadedCooks.find((o) => o.type === c.type && o.id === c.id);
            if (found) {
              return {
                id: found.id,
                type: found.type,
                first_name: found.first_name,
                last_name: found.last_name,
                display_name: found.display_name,
              };
            }
            return c;
          };

          if (loadedDay.has_allergen_record) {
            setMealComponents(
              (loadedDay.meal_components || []).map((c) => ({
                name: c.name,
                allergens: [...(c.allergens || [])],
              }))
            );
            const rawCooks = buildInitialSelectedCooks(loadedDay);
            if (rawCooks.length > 0) {
              setSelectedCooks(rawCooks.map(enrichCook));
              setCookCustomName('');
            } else {
              setSelectedCooks([]);
              setCookCustomName(loadedDay.cook_custom_name || loadedDay.plan_cook_name || '');
            }
          } else {
            // Meal plan components are not transferred by default
            setMealComponents((prev) => (prev.length > 0 ? prev : []));
            const matched = matchCookFromPlan(loadedDay.plan_cook_name, loadedCooks);
            setSelectedCooks(matched.cooks);
            setCookCustomName(matched.cook_custom_name);
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
    // Re-load metadata only when the selected date or auth token changes, not when local edits notify parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDay.date, token]);

  const handleRealtimeMessage = useCallback(
    (msg: RealtimeMessage) => {
      if (
        msg.type === 'CHILD_UPDATED' ||
        msg.type === 'CHILD_DELETED' ||
        msg.type === 'EMPLOYEE_CREATED' ||
        msg.type === 'EMPLOYEE_UPDATED' ||
        msg.type === 'EMPLOYEE_DELETED' ||
        msg.type === 'INVALIDATE'
      ) {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch(`/api/allergies/summary?date=${encodeURIComponent(day.date)}`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: AllergiesMatchContext | null) => {
            if (data) setAllergiesContext(data);
          })
          .catch((err) => console.error('Error refreshing allergies context in editor:', err));
      }
    },
    [day.date, token]
  );

  useRealtime(handleRealtimeMessage);

  const persistChanges = useCallback(
    async (
      nextComponents: MealAllergenComponent[],
      nextCooks: MealAllergenCook[] = selectedCooks,
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

        const singleParentId =
          nextCooks.length === 1 && nextCooks[0].type === 'parent' ? nextCooks[0].id : null;
        const singleEmpId =
          nextCooks.length === 1 && nextCooks[0].type === 'employee' ? nextCooks[0].id : null;

        const res = await fetch(`/api/meal-allergens/${encodeURIComponent(day.date)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            cooks: nextCooks.map((c) => ({
              id: c.id,
              type: c.type,
              first_name: c.first_name,
              last_name: c.last_name,
              display_name: c.display_name,
            })),
            cook_parent_id: singleParentId,
            cook_employee_id: singleEmpId,
            cook_custom_name: nextCooks.length === 0 ? nextCookCustomName : '',
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
    [canWrite, token, day.date, day.documentation, selectedCooks, cookCustomName, onDaySaved]
  );

  // Cooks multi-select popover handlers
  const selectedCookKeys = useMemo(
    () => new Set(selectedCooks.map((c) => getCookOptionKey(c))),
    [selectedCooks]
  );

  const orderedAndFilteredCookOptions = useMemo(() => {
    const sorted = sortCookOptions(cookOptions, initialSelectedCookKeys);
    const q = cooksQuickFilter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (o) =>
        o.display_name.toLowerCase().includes(q) ||
        (o.family_name || '').toLowerCase().includes(q)
    );
  }, [cookOptions, initialSelectedCookKeys, cooksQuickFilter]);

  const handleOpenCooksPopover = useCallback(
    (triggerEl: HTMLElement) => {
      if (!canWrite) return;
      setInitialSelectedCookKeys(new Set(selectedCooks.map((c) => getCookOptionKey(c))));
      setCooksQuickFilter('');
      setCooksAnchorEl(triggerEl);
      setIsCooksPopoverOpen(true);
    },
    [canWrite, selectedCooks]
  );

  const handleCloseCooksPopover = useCallback(() => {
    setIsCooksPopoverOpen(false);
    setCooksAnchorEl(null);
    setCooksQuickFilter('');
    persistChanges(mealComponents, selectedCooks, cookCustomName);
  }, [mealComponents, selectedCooks, cookCustomName, persistChanges]);

  const handleToggleCookOption = useCallback(
    (opt: CookOption) => {
      const key = getCookOptionKey(opt);
      const exists = selectedCooks.some((c) => getCookOptionKey(c) === key);
      let nextCooks: MealAllergenCook[];
      if (exists) {
        nextCooks = selectedCooks.filter((c) => getCookOptionKey(c) !== key);
      } else {
        nextCooks = [
          ...selectedCooks,
          {
            id: opt.id,
            type: opt.type,
            first_name: opt.first_name,
            last_name: opt.last_name,
            display_name: opt.display_name,
          },
        ];
      }
      setSelectedCooks(nextCooks);
      persistChanges(mealComponents, nextCooks, cookCustomName);
    },
    [selectedCooks, cookCustomName, mealComponents, persistChanges]
  );

  const cooksDisplayString = useMemo(() => {
    const parts: string[] = [];
    if (selectedCooks.length > 0) {
      parts.push(formatCooksDisplayName(selectedCooks));
    }
    if (cookCustomName.trim()) {
      parts.push(cookCustomName.trim());
    }
    return parts.join(', ');
  }, [selectedCooks, cookCustomName]);

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
      setComponentStep(initialName.trim() ? 2 : 1);
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
          if (JSON.stringify(next) !== JSON.stringify(day.meal_components || [])) {
            persistChanges(next);
          }
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
          if (JSON.stringify(next) !== JSON.stringify(day.meal_components || [])) {
            persistChanges(next);
          }
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
    setComponentStep(1);
    setAnchorEl(null);
  }, [editingComponentIdx, editingSnapshot, isNewComponent, mealComponents, day.meal_components, persistChanges]);

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
      cooks: selectedCooks,
      cook_parent_id:
        selectedCooks.length === 1 && selectedCooks[0].type === 'parent'
          ? selectedCooks[0].id
          : null,
      cook_employee_id:
        selectedCooks.length === 1 && selectedCooks[0].type === 'employee'
          ? selectedCooks[0].id
          : null,
      cook_custom_name: selectedCooks.length === 0 ? cookCustomName : '',
      cook_display_name: cooksDisplayString,
      meal_components: mealComponents,
    }),
    [day, selectedCooks, cookCustomName, cooksDisplayString, mealComponents]
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

  const isCookSelected = selectedCooks.length > 0 || Boolean(cookCustomName.trim());
  const hasComponents = mealComponents.length > 0;
  const canFinalize = status !== 'finalized' && hasComponents && isCookSelected;

  const handleFinalizeClick = useCallback(async () => {
    if (!canWrite || !canFinalize) return;
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

      const singleParentId =
        selectedCooks.length === 1 && selectedCooks[0].type === 'parent'
          ? selectedCooks[0].id
          : null;
      const singleEmpId =
        selectedCooks.length === 1 && selectedCooks[0].type === 'employee'
          ? selectedCooks[0].id
          : null;

      const res = await fetch(`/api/meal-allergens/${encodeURIComponent(day.date)}/finalize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cooks: selectedCooks.map((c) => ({
            id: c.id,
            type: c.type,
            first_name: c.first_name,
            last_name: c.last_name,
            display_name: c.display_name,
          })),
          cook_parent_id: singleParentId,
          cook_employee_id: singleEmpId,
          cook_custom_name: selectedCooks.length === 0 ? cookCustomName.trim() : '',
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
  }, [
    canWrite,
    canFinalize,
    token,
    day.date,
    day.documentation,
    selectedCooks,
    cookCustomName,
    mealComponents,
    onDaySaved,
  ]);

  const dateObj = parseDateKey(initialDay.date);
  const { dayName } = formatDayHeader(dateObj);
  const formattedDate = formatDisplayDate(dateObj);

  return (
    <div
      className={`meal-allergens-editor ${isDashboard ? 'is-dashboard' : ''}`}
      data-testid="meal-allergens-editor"
      data-loaded={metadataLoaded ? 'true' : 'false'}
    >
      {/* Header */}
      <div className="meal-allergens-editor-header">
        {!isDashboard && (
          <div className="meal-allergens-editor-top-row">
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
              </div>
            </div>
          </div>
        )}

        <div className="meal-allergens-editor-status-row" data-testid="allergens-editor-status-row">
          <div className="meal-allergens-status-group">
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
            <button
              type="button"
              className="meal-allergens-history-btn"
              onClick={() => setIsHistoryModalOpen(true)}
              title={t('viewHistory') || 'Historie anzeigen'}
              aria-label={t('viewHistory') || 'Historie anzeigen'}
              data-testid="allergens-history-btn"
            >
              <History size={15} />
            </button>
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

        {/* Read-only Meal Plan Reference */}
        {!hidePlanReference && (
          <div className="meal-allergens-plan-reference-box" data-testid="meal-plan-reference-box">
            <Utensils size={15} className="meal-allergens-plan-reference-icon" />
            <span className="meal-allergens-plan-reference-text">
              <span className="meal-allergens-plan-reference-title">
                {t('mealPlanReferenceTitle')}
              </span>{' '}
              {!day.plan_cook_name?.trim() && (!day.plan_meal_components || day.plan_meal_components.length === 0) ? (
                <span className="meal-allergen-empty-text" data-testid="meal-plan-empty-text">
                  {t('nothingEntered')}
                </span>
              ) : (
                <>
                  {day.plan_cook_name?.trim() && (
                    <strong className="meal-allergens-plan-ref-cook" data-testid="meal-plan-ref-cook">
                      {day.plan_cook_name}
                    </strong>
                  )}
                  {day.plan_cook_name?.trim() && day.plan_meal_components && day.plan_meal_components.length > 0 && (
                    <span> — </span>
                  )}
                  {day.plan_meal_components && day.plan_meal_components.length > 0 && (
                    <span className="meal-allergens-plan-ref-components" data-testid="meal-plan-ref-components">
                      {day.plan_meal_components.map((c, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && ', '}
                          <span className="meal-allergens-plan-comp-line" data-testid={`plan-comp-chip-${i}`}>
                            {c}
                          </span>
                        </React.Fragment>
                      ))}
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {!metadataLoaded ? (
        <div className="meal-allergens-editor-loading" data-testid="meal-allergens-editor-loading">
          <RefreshCw size={26} className="meal-allergens-spin" />
          <span>{t('loading')}</span>
        </div>
      ) : (
        <>
          {/* Multi-Select Cook Field ("Es kocht") with Edit Icon & Popover */}
      <div className="meal-allergens-meta-grid">
        <div className="meal-allergens-field-group meal-allergens-cooks-field-row">
          <label className="meal-allergens-field-label">{t('cookSelectionLabel')}</label>
          <div className="meal-allergens-cook-display-box" data-testid="cook-combobox">
            <span
              className={`meal-allergens-cook-display-text ${!cooksDisplayString ? 'empty' : ''}`}
              data-testid="cooks-display-text"
            >
              {cooksDisplayString || t('noCookSelected')}
            </span>
            {canWrite && (
              <button
                ref={editCooksBtnRef}
                type="button"
                className={`meal-allergens-edit-name-btn ${highlightCookBtn ? 'meal-allergens-highlight-btn' : ''}`}
                onClick={(e) => handleOpenCooksPopover(e.currentTarget)}
                title={t('editCooks')}
                aria-label={t('editCooks')}
                data-testid="edit-cooks-btn"
                data-highlighted={highlightCookBtn ? 'true' : 'false'}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cooks Selection Popover */}
      {isCooksPopoverOpen && (
        <CellPopover
          isOpen={true}
          anchorEl={cooksAnchorEl}
          onClose={handleCloseCooksPopover}
          width={340}
        >
          <div className="meal-allergens-cooks-popover" data-testid="cooks-popover">
            <div className="meal-allergens-cooks-filter-row">
              <input
                type="text"
                className="meal-allergens-input meal-allergens-cooks-filter-input"
                placeholder={t('quickFilter')}
                value={cooksQuickFilter}
                onChange={(e) => setCooksQuickFilter(e.target.value)}
                autoFocus
                data-testid="cooks-quick-filter-input"
              />
            </div>
            <div className="meal-allergens-cooks-options-list" data-testid="cooks-options-list">
              {orderedAndFilteredCookOptions.length === 0 ? (
                <div className="meal-allergens-cooks-empty" data-testid="cooks-no-matches">
                  {t('noMatchingPersons')}
                </div>
              ) : (
                orderedAndFilteredCookOptions.map((opt) => {
                  const key = getCookOptionKey(opt);
                  const isChecked = selectedCookKeys.has(key);
                  return (
                    <label
                      key={key}
                      className={`meal-allergens-cook-checkbox-item ${isChecked ? 'selected' : ''}`}
                      data-testid={`cook-option-${opt.type}-${opt.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCookOption(opt)}
                        data-testid={`cook-checkbox-${opt.type}-${opt.id}`}
                      />
                      <span className="meal-allergens-cook-option-name">{opt.display_name}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="meal-allergens-cooks-custom-section" data-testid="cooks-custom-section">
              <label className="meal-allergens-cooks-custom-label">
                {t('customCookName') || 'Freitext / Sonstige:'}
              </label>
              <input
                type="text"
                className="meal-allergens-input meal-allergens-cooks-custom-input"
                placeholder={t('customCookPlaceholder') || 'z. B. Catering, Gastkoch...'}
                value={cookCustomName}
                onChange={(e) => setCookCustomName(e.target.value)}
                data-testid="cooks-custom-input"
              />
            </div>

            <div className="meal-allergens-popover-footer">
              <button
                type="button"
                className="meal-allergens-popover-done-btn"
                onClick={() => {
                  persistChanges(mealComponents, selectedCooks, cookCustomName);
                  handleCloseCooksPopover();
                }}
                data-testid="cooks-popover-done-btn"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </CellPopover>
      )}

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
                      setComponentStep(2);
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
              <MealComponentAllergenBadges
                allergens={comp.allergens}
                compIdx={compIdx}
                allergiesContext={allergiesContext}
                emptyLabel={t('noAllergensSelected')}
              />
            </div>
          </div>
        ))}

        {canWrite && (
          <div className="meal-allergens-add-component-bar">
            <button
              ref={addBtnRef}
              type="button"
              className={`meal-allergens-add-component-btn ${highlightAddCompBtn ? 'meal-allergens-highlight-btn' : ''}`}
              onClick={(e) => handleAddComponentClick('', e.currentTarget)}
              data-testid="add-meal-component-btn"
              data-highlighted={highlightAddCompBtn ? 'true' : 'false'}
            >
              <Plus size={16} />
              <span>{t('addMealComponent')}</span>
            </button>
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
            disabled={!canFinalize}
            data-testid="finalize-allergens-btn"
          >
            <Check size={16} />
            <span>{t('finalizeBtn')}</span>
          </button>

          {status !== 'finalized' && (!isCookSelected || !hasComponents) && (
            <div className="meal-allergens-completion-checklist" data-testid="editor-completion-checklist">
              <div className="meal-allergens-checklist-items">
                {!isCookSelected && (
                  <button
                    type="button"
                    className="meal-allergens-checklist-item pending"
                    onClick={handleHighlightCook}
                    title={t('cookRequirementPending')}
                    data-testid="checklist-item-cook"
                    data-satisfied={false}
                  >
                    <CircleDot size={14} className="checklist-icon-pending" />
                    <span>{t('cookRequirementPending')}</span>
                  </button>
                )}

                {!hasComponents && (
                  <button
                    type="button"
                    className="meal-allergens-checklist-item pending"
                    onClick={handleHighlightAddComp}
                    title={t('componentsRequirementPending')}
                    data-testid="checklist-item-components"
                    data-satisfied={false}
                  >
                    <CircleDot size={14} className="checklist-icon-pending" />
                    <span>{t('componentsRequirementPending')}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </>
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
            className={`glass-popup meal-component-popover ${componentStep === 1 ? 'step-name' : 'step-allergens'}`}
            width={680}
            minWidth={340}
            closeOnScrollOutOfView={false}
          >
            {componentStep === 1 ? (
              <>
                <div className="meal-comp-popover-header">
                  <h3 className="meal-comp-popover-title">{t('addComponent') || 'Komponente hinzufügen'}</h3>
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
                          if (mealComponents[editingComponentIdx].name.trim()) {
                            setComponentStep(2);
                          }
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
                              onClick={() => {
                                handleComponentNameChange(editingComponentIdx, planName);
                                setComponentStep(2);
                              }}
                              title={`"${planName}" übernehmen`}
                              data-testid={`take-plan-component-btn-${editingComponentIdx}-${pIdx}`}
                            >
                              <Plus size={13} />
                              <span>{planName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="meal-comp-popover-footer">
                  <button
                    type="button"
                    className="meal-allergens-copy-btn"
                    onClick={handleClosePopover}
                    data-testid="component-step1-cancel-btn"
                  >
                    {t('cancel') || 'Abbrechen'}
                  </button>
                  <button
                    type="button"
                    className="primary-button meal-comp-popover-next-btn"
                    disabled={!mealComponents[editingComponentIdx].name.trim()}
                    onClick={() => setComponentStep(2)}
                    data-testid="component-step-next-btn"
                  >
                    <span>{t('next') || 'Weiter'}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="meal-comp-popover-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="meal-allergens-back-btn"
                      onClick={() => setComponentStep(1)}
                      title={t('editName') || 'Name ändern'}
                      aria-label={t('editName') || 'Name ändern'}
                      data-testid="component-step-back-btn"
                      style={{ width: 30, height: 30 }}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <h3 className="meal-comp-popover-title">{t('editComponent')}</h3>
                  </div>
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
                  {/* Step 2: Component Name is read-only static text (no virtual keyboard pops up) */}
                  <div className="meal-comp-name-static-box" data-testid="component-name-display-box">
                    <strong className="meal-comp-name-static-value" data-testid="component-name-static-value">
                      {mealComponents[editingComponentIdx].name}
                    </strong>
                    <button
                      type="button"
                      className="meal-allergens-edit-name-btn meal-comp-name-edit-btn"
                      onClick={() => setComponentStep(1)}
                      title={t('editName') || 'Name ändern'}
                      aria-label={t('editName') || 'Name ändern'}
                      data-testid="component-rename-btn"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>

                  <div className="meal-comp-popover-field">
                    <div className="meal-allergens-section-header">
                      <label className="meal-comp-popover-label">{t('allergensLabel')}</label>
                    </div>

                    <div
                      className="meal-allergens-main-list"
                      data-testid={`allergen-picker-panel-${editingComponentIdx}`}
                    >
                      {MAIN_ALLERGENS.map((item) => {
                        const isSelected = Boolean(mealComponents[editingComponentIdx]?.allergens.includes(item.key));
                        const matchingGroups = findMatchingGroupsForComponentAllergen(
                          item.key,
                          allergiesContext,
                          t('employeeAllergiesTitle') || 'Mitarbeitende'
                        );
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={`meal-allergens-main-option ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleToggleAllergen(editingComponentIdx, item.key)}
                            data-testid={`allergen-option-${editingComponentIdx}-${item.key}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <strong className="meal-allergen-main-name">{item.shortLabel}</strong>
                                {matchingGroups.length > 0 && (
                                  <span
                                    className="meal-allergen-picker-match-warning"
                                    data-testid={`allergen-picker-warning-${editingComponentIdx}-${item.key}`}
                                  >
                                    <AlertTriangle size={11} />
                                    <span>{matchingGroups.join(', ')}</span>
                                  </span>
                                )}
                              </div>
                              {item.subtypes && (
                                <span className="meal-allergen-subtypes">{item.subtypes}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="meal-allergens-custom-row" style={{ marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        className="meal-allergens-input"
                        style={{ flex: 1 }}
                        placeholder={t('customAllergenPlaceholder')}
                        value={customAllergenInput[editingComponentIdx] || ''}
                        onChange={(e) =>
                          setCustomAllergenInput((prev) => ({
                            ...prev,
                            [editingComponentIdx]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomAllergen(editingComponentIdx);
                          }
                        }}
                        data-testid={`custom-allergen-input-${editingComponentIdx}`}
                      />
                      <button
                        type="button"
                        className="primary-button meal-allergens-custom-add-btn"
                        onClick={() => handleAddCustomAllergen(editingComponentIdx)}
                        title={t('addCustomAllergenBtn')}
                        aria-label={t('addCustomAllergenBtn')}
                        data-testid={`custom-allergen-add-btn-${editingComponentIdx}`}
                      >
                        +
                      </button>
                    </div>

                    {/* Display custom allergens so they can be viewed and removed from within the editor */}
                    {(() => {
                      const customAllergens = (mealComponents[editingComponentIdx]?.allergens || []).filter(
                        (a) => !MAIN_ALLERGENS.some((m) => m.key.toLowerCase() === a.toLowerCase())
                      );
                      if (customAllergens.length === 0) return null;
                      return (
                        <div
                          className="meal-allergens-popover-custom-tags"
                          data-testid={`custom-allergens-list-${editingComponentIdx}`}
                          style={{ marginTop: '0.65rem' }}
                        >
                          <div
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                              marginBottom: '0.35rem',
                            }}
                          >
                            {t('customAllergensLabel') || 'Weitere Allergene:'}
                          </div>
                          <div className="meal-allergens-tags-container">
                            {customAllergens.map((customAllergen) => {
                              const matchingGroups = findMatchingGroupsForComponentAllergen(
                                customAllergen,
                                allergiesContext,
                                t('employeeAllergiesTitle') || 'Mitarbeitende'
                              );
                              const hasCustomMatch = matchingGroups.length > 0;
                              return (
                                <div
                                  key={customAllergen}
                                  className={`meal-allergen-tag-wrapper ${hasCustomMatch ? 'has-warning' : ''}`}
                                >
                                  <span
                                    className="meal-allergens-tag-pill"
                                    style={{
                                      borderColor: `${getAllergenColor(customAllergen)}45`,
                                      backgroundColor: getAllergenBgColor(customAllergen),
                                    }}
                                    data-testid={`custom-allergen-pill-${editingComponentIdx}-${customAllergen}`}
                                  >
                                    <AllergenIcon allergenKey={customAllergen} size={14} />
                                    <span>{getAllergenDisplayLabel(customAllergen)}</span>
                                    <button
                                      type="button"
                                      className="meal-allergens-tag-remove"
                                      onClick={() => handleRemoveAllergen(editingComponentIdx, customAllergen)}
                                      aria-label={`Remove ${customAllergen}`}
                                      title={t('remove') || 'Entfernen'}
                                      data-testid={`remove-allergen-btn-${editingComponentIdx}-${customAllergen}`}
                                    >
                                      <X size={13} />
                                    </button>
                                  </span>
                                  {hasCustomMatch && (
                                    <span
                                      className="meal-allergen-match-warning"
                                      data-testid={`allergen-match-warning-${editingComponentIdx}-${customAllergen}`}
                                      title={`${t('allergyPresentIn')}: ${matchingGroups.join(', ')}`}
                                    >
                                      <AlertTriangle size={12} className="meal-allergen-warning-icon" />
                                      <span>{matchingGroups.join(', ')}</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
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
              </>
            )}
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

      {/* History Modal */}
      {isHistoryModalOpen && (
        <MealAllergensHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          day={day}
        />
      )}
    </div>
  );
};
