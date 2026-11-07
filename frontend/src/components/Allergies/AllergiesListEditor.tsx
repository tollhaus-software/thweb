import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trash, X, ArrowLeft, Plus, Check } from 'lucide-react';
import { CellPopover } from '../Table/CellPopover';
import { AllergenPickerGrid } from '../MealAllergens/AllergenPickerGrid';
import { AllergenIcon } from '../MealAllergens/AllergenIcon';
import {
  type MainAllergenDefinition,
  type AllergyEntryObject,
  type AllergyItemValue,
  getAllergenDisplayLabel,
  getAllergenBgColor,
  getAllergyText,
  isKnownFoodAllergy,
  isDietPreference,
  sortAllergiesList,
} from '../../utils/mealAllergens';
import { t } from '../../utils/i18n';
import './AllergiesListEditor.css';

export type { AllergyEntryObject, AllergyItemValue };

export interface AllergiesListEditorProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  values?: AllergyItemValue[];
  onSave: (newValues: AllergyItemValue[]) => void;
  title?: string;
  placeholder?: string;
  canEditItem?: (item: AllergyItemValue, idx: number) => boolean;
  canDeleteItem?: (item: AllergyItemValue, idx: number) => boolean;
  disabledReason?: (item: AllergyItemValue | null, action: 'edit' | 'delete' | 'toggle') => string | undefined;
}

export const AllergiesListEditor: React.FC<AllergiesListEditorProps> = ({
  isOpen,
  onClose,
  anchorEl,
  values = [],
  onSave,
  title,
  placeholder,
  canDeleteItem,
}) => {
  // Mode selection: null (choose category), 'ernaehrung', 'lebensmittel', or 'andere'
  const [selectedCategory, setSelectedCategory] = useState<'ernaehrung' | 'lebensmittel' | 'andere' | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [otherInput, setOtherInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const otherInputRef = useRef<HTMLInputElement>(null);
  const valuesRef = useRef(values);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (isOpen) {
      const currentValues = valuesRef.current || [];
      if (currentValues.length === 0) {
        setIsAdding(true);
        setSelectedCategory(null);
      } else {
        setIsAdding(false);
        setSelectedCategory(null);
      }
      setOtherInput('');
      setEditingIndex(null);
      setEditingText('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isAdding && selectedCategory === 'andere') {
      const timer = setTimeout(() => {
        otherInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAdding, selectedCategory]);

  const handleDelete = useCallback(
    (idx: number) => {
      const current = valuesRef.current || [];
      if (idx < 0 || idx >= current.length) return;
      if (canDeleteItem && !canDeleteItem(current[idx], idx)) return;
      const updated = current.filter((_, i) => i !== idx);
      onSaveRef.current(updated);
    },
    [canDeleteItem]
  );

  const activeDiet = useMemo(() => {
    const current = values || [];
    const found = current.find(isDietPreference);
    if (!found) return null;
    const text = getAllergyText(found).toLowerCase().trim();
    if (text === 'vegan') return 'Vegan';
    if (text === 'vegetarisch' || text === 'vegetarian') return 'Vegetarisch';
    return null;
  }, [values]);

  const handleSelectDiet = useCallback(
    (dietChoice: 'Vegetarisch' | 'Vegan' | 'none') => {
      const current = valuesRef.current || [];

      if (dietChoice === 'none') {
        const withoutDiet = current.filter((val) => !isDietPreference(val));
        if (withoutDiet.length !== current.length) {
          onSaveRef.current(withoutDiet);
        }
        setIsAdding(false);
        setSelectedCategory(null);
        return;
      }

      const alreadyActive = current.some(
        (val) => isDietPreference(val) && getAllergyText(val).toLowerCase() === dietChoice.toLowerCase()
      );

      if (alreadyActive) {
        // Re-selecting an already active diet preference does not change anything
        setIsAdding(false);
        setSelectedCategory(null);
        return;
      }

      const withoutDiet = current.filter((val) => !isDietPreference(val));
      const entryToAdd: AllergyEntryObject = {
        name: dietChoice,
        value: dietChoice,
        category: 'ernaehrung',
      };
      const updated = sortAllergiesList([...withoutDiet, entryToAdd]);

      onSaveRef.current(updated);
      setIsAdding(false);
      setSelectedCategory(null);
    },
    []
  );

  const isMainAllergenSelected = useCallback(
    (item: MainAllergenDefinition): boolean => {
      const current = valuesRef.current || [];
      const keyLower = item.key.toLowerCase().trim();
      const shortLower = (item.shortLabel || '').toLowerCase().trim();
      const labelLower = (item.label || '').toLowerCase().trim();

      return current.some((val) => {
        const text = getAllergyText(val).toLowerCase().trim();
        return (
          text === keyLower ||
          text === shortLower ||
          text === labelLower ||
          (keyLower === 'gluten' && (text.includes('gluten') || text.includes('weizen') || text.includes('dinkel'))) ||
          (keyLower === 'laktose' && (text.includes('milch') || text.includes('laktose'))) ||
          (keyLower === 'erdnuesse' && (text.includes('erdnuss') || text.includes('erdnüss'))) ||
          (keyLower === 'schalenfruechte' && (text.includes('schalenfr') || text.includes('nüss') || text.includes('haselnuss')))
        );
      });
    },
    []
  );

  const handleSelectMainAllergen = useCallback(
    (item: MainAllergenDefinition) => {
      const current = valuesRef.current || [];
      const keyLower = item.key.toLowerCase().trim();
      const shortLower = (item.shortLabel || '').toLowerCase().trim();
      const labelLower = (item.label || '').toLowerCase().trim();

      const alreadyExists = current.some((val) => {
        const text = getAllergyText(val).toLowerCase().trim();
        return (
          text === keyLower ||
          text === shortLower ||
          text === labelLower ||
          (keyLower === 'gluten' && (text.includes('gluten') || text.includes('weizen') || text.includes('dinkel'))) ||
          (keyLower === 'laktose' && (text.includes('milch') || text.includes('laktose'))) ||
          (keyLower === 'erdnuesse' && (text.includes('erdnuss') || text.includes('erdnüss'))) ||
          (keyLower === 'schalenfruechte' && (text.includes('schalenfr') || text.includes('nüss') || text.includes('haselnuss')))
        );
      });

      if (!alreadyExists) {
        // Add item with shortLabel and category lebensmittel
        const entryToAdd: AllergyEntryObject = {
          name: item.shortLabel,
          value: item.shortLabel,
          category: 'lebensmittel',
        };
        const updated = sortAllergiesList([...current, entryToAdd]);
        onSaveRef.current(updated);
      }

      // Exit adding mode and return to list of already added allergies
      setIsAdding(false);
      setSelectedCategory(null);
    },
    []
  );

  const handleAddCustomFoodAllergen = useCallback((customName: string) => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const current = valuesRef.current || [];
    const alreadyExists = current.some(
      (v) => getAllergyText(v).toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (!alreadyExists) {
      const entryToAdd: AllergyEntryObject = {
        name: trimmed,
        value: trimmed,
        category: 'lebensmittel',
      };
      const updated = sortAllergiesList([...current, entryToAdd]);
      onSaveRef.current(updated);
    }

    // Exit adding mode and return to list of already added allergies
    setIsAdding(false);
    setSelectedCategory(null);
  }, []);

  const handleAddOtherAllergy = useCallback(() => {
    const trimmed = otherInput.trim();
    if (!trimmed) return;
    const current = valuesRef.current || [];
    const alreadyExists = current.some(
      (v) => getAllergyText(v).toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (!alreadyExists) {
      const entryToAdd: AllergyEntryObject = {
        name: trimmed,
        value: trimmed,
        category: 'andere',
      };
      const updated = sortAllergiesList([...current, entryToAdd]);
      onSaveRef.current(updated);
    }
    setOtherInput('');

    // Exit adding mode and return to list of already added allergies
    setIsAdding(false);
    setSelectedCategory(null);
  }, [otherInput]);

  const handleCommitEdit = (idx: number) => {
    const trimmed = editingText.trim();
    const current = valuesRef.current || [];
    if (idx < 0 || idx >= current.length) {
      setEditingIndex(null);
      return;
    }
    if (!trimmed) {
      handleDelete(idx);
      setEditingIndex(null);
      return;
    }
    const existing = current[idx];
    const category = typeof existing === 'object' && existing !== null ? existing.category : undefined;
    const updated = [...current];
    updated[idx] = {
      name: trimmed,
      value: trimmed,
      ...(category ? { category } : {}),
    };
    onSaveRef.current(sortAllergiesList(updated));
    setEditingIndex(null);
  };

  const sortedEntries = useMemo(() => {
    const list = values.map((item, originalIndex) => {
      const text = getAllergyText(item);
      const isKnownFood = isKnownFoodAllergy(item);
      const isDiet = isDietPreference(item);
      const display = getAllergenDisplayLabel(text);
      return {
        item,
        originalIndex,
        text,
        display,
        isKnownFood,
        isDiet,
      };
    });

    return list.sort((a, b) => {
      const rank = (e: typeof a) => {
        if (e.isDiet) return 0;
        if (e.isKnownFood) return 1;
        return 2;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.originalIndex - b.originalIndex;
    });
  }, [values]);

  if (!isOpen) return null;

  const currentStrings = values.map(getAllergyText);

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      className="glass-popup allergies-popover"
      width={560}
      minWidth={320}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header */}
      <div className="allergies-popover-header">
        <span className="allergies-popover-title">
          {title || t('allergiesEdit') || 'Allergien'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="allergies-popover-close-btn"
          title={t('close') || 'Schließen'}
          data-testid="allergies-popover-close-btn"
        >
          <X size={16} />
        </button>
      </div>

      {/* When in adding allergy mode: do NOT show the already added allergies */}
      {!isAdding && (
        <>
          {/* Current Entries List */}
          <div className="allergies-current-container" data-testid="allergies-current-list">
            {values && values.length > 0 ? (
              <table className="allergies-current-table">
                <tbody>
                  {sortedEntries.map(({ originalIndex, text, display, isKnownFood, isDiet }) => {
                    if (editingIndex === originalIndex) {
                      return (
                        <tr key={originalIndex} className="allergies-current-row">
                          <td style={{ padding: '4px 8px' }} colSpan={2}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCommitEdit(originalIndex);
                                  if (e.key === 'Escape') setEditingIndex(null);
                                }}
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: '4px 8px',
                                  fontSize: '0.85rem',
                                  border: '1px solid var(--primary)',
                                  borderRadius: '4px',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleCommitEdit(originalIndex)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                }}
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingIndex(null)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={originalIndex} className="allergies-current-row" data-testid={`allergy-current-row-${originalIndex}`}>
                        <td className="allergies-current-cell-content">
                          {isDiet ? (
                            <span
                              className="allergy-diet-icon-wrap"
                              style={{
                                backgroundColor: '#ecfdf5',
                                color: '#059669',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                fontSize: '0.9rem',
                                flexShrink: 0,
                                border: '1px solid #a7f3d0',
                              }}
                              title={t('allergyTypeDiet') || 'Ernährungstyp'}
                            >
                              {text.toLowerCase() === 'vegan' ? '🌱' : '🥦'}
                            </span>
                          ) : isKnownFood ? (
                            <span
                              className="meal-allergen-icon-wrap"
                              style={{
                                backgroundColor: getAllergenBgColor(text),
                                padding: '2px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                flexShrink: 0,
                              }}
                              title={t('allergyTypeFood') || 'Lebensmittel'}
                            >
                              <AllergenIcon allergenKey={text} size={16} />
                            </span>
                          ) : null}
                          <span
                            style={{
                              fontWeight: 500,
                              color: 'var(--text-h)',
                              cursor: 'pointer',
                              flex: 1,
                            }}
                            onDoubleClick={() => {
                              setEditingIndex(originalIndex);
                              setEditingText(text);
                            }}
                            title={t('edit') || 'Doppelklick zum Bearbeiten'}
                          >
                            {display}
                          </span>
                        </td>
                        <td className="allergies-current-cell-actions">
                          <button
                            type="button"
                            onClick={() => handleDelete(originalIndex)}
                            className="easy-edit-button delete-entry-btn"
                            title={t('delete') || 'Löschen'}
                            data-testid={`delete-allergy-btn-${originalIndex}`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              padding: '3px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '4px',
                            }}
                          >
                            <Trash size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div
                className="allergies-empty-notice"
                onClick={() => {
                  setIsAdding(true);
                  setSelectedCategory(null);
                }}
                data-testid="allergies-empty-notice"
              >
                {placeholder || t('noAllergiesOrDiet') || 'Keine Allergien/Ernährungseinschränkungen eingetragen'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 2px 0' }}>
            <button
              type="button"
              className="easy-edit-button add-value-btn"
              onClick={() => {
                setIsAdding(true);
                setSelectedCategory(null);
              }}
              data-testid="allergies-start-add-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px 18px',
                fontSize: '0.85rem',
                fontWeight: 500,
                background: 'var(--bg-subtle)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </>
      )}

      {/* Adding Area */}
      {isAdding && (
        <div className="allergies-add-section" data-testid="allergies-add-section">
          {/* Top navigation if category is selected: show Back button */}
          {selectedCategory !== null && (
            <div className="allergies-section-nav">
              <button
                type="button"
                className="allergies-back-btn"
                onClick={() => setSelectedCategory(null)}
                data-testid="allergies-back-to-category-choice-btn"
              >
                <ArrowLeft size={14} />
                <span>{t('backToCategoryChoice') || 'Zurück zur Auswahl'}</span>
              </button>
            </div>
          )}

          {/* Mode 1: Top-Level Choice (Ernährungstyp vs Lebensmittelallergien vs Andere Allergien) */}
          {selectedCategory === null && (
            <div>
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #64748b)',
                  marginBottom: '6px',
                }}
              >
                {t('allergySelectTypeTitle') || 'Kategorie wählen:'}
              </div>
              <div className="allergies-choice-cards">
                <button
                  type="button"
                  className="allergies-choice-card"
                  onClick={() => setSelectedCategory('ernaehrung')}
                  data-testid="allergy-choice-ernaehrung"
                >
                  <span className="allergies-choice-icon">🥦</span>
                  <span className="allergies-choice-title">{t('allergyTypeDiet') || 'Ernährungstyp'}</span>
                  <span className="allergies-choice-desc">
                    {t('allergyTypeDietDesc') || 'Vegetarisch, Vegan'}
                  </span>
                </button>

                <button
                  type="button"
                  className="allergies-choice-card"
                  onClick={() => setSelectedCategory('lebensmittel')}
                  data-testid="allergy-choice-lebensmittel"
                >
                  <span className="allergies-choice-icon">🍽️</span>
                  <span className="allergies-choice-title">{t('allergyTypeFood') || 'Lebensmittelallergien'}</span>
                  <span className="allergies-choice-desc">
                    {t('allergyTypeFoodDesc') || 'Hauptallergene (Gluten, Laktose etc.) & Speise-Allergien'}
                  </span>
                </button>

                <button
                  type="button"
                  className="allergies-choice-card"
                  onClick={() => setSelectedCategory('andere')}
                  data-testid="allergy-choice-andere"
                >
                  <span className="allergies-choice-icon">🏷️</span>
                  <span className="allergies-choice-title">{t('allergyTypeOther') || 'Andere Allergien'}</span>
                  <span className="allergies-choice-desc">
                    {t('allergyTypeOtherDesc') || 'Pollen, Insektengift, Tierhaare, Medikamente etc.'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Mode 2: Ernährungstyp */}
          {selectedCategory === 'ernaehrung' && (
            <div data-testid="allergies-panel-ernaehrung">
              <div className="allergies-diet-options">
                <button
                  type="button"
                  className={`allergies-diet-card ${activeDiet === null ? 'selected' : ''}`}
                  onClick={() => handleSelectDiet('none')}
                  data-testid="diet-option-none"
                >
                  <span className="allergies-diet-icon">🍽️</span>
                  <div className="allergies-diet-info">
                    <span className="allergies-diet-title">{t('dietNone') || 'Keine Besonderheit'}</span>
                    <span className="allergies-diet-desc">
                      {t('dietNoneDesc') || 'Keine vegetarische oder vegane Einschränkung'}
                    </span>
                  </div>
                  {activeDiet === null && <Check size={18} className="allergies-diet-check" />}
                </button>

                <button
                  type="button"
                  className={`allergies-diet-card ${activeDiet === 'Vegetarisch' ? 'selected' : ''}`}
                  onClick={() => handleSelectDiet('Vegetarisch')}
                  data-testid="diet-option-vegetarisch"
                >
                  <span className="allergies-diet-icon">🥦</span>
                  <div className="allergies-diet-info">
                    <span className="allergies-diet-title">{t('dietVegetarian') || 'Vegetarisch'}</span>
                    <span className="allergies-diet-desc">{t('dietVegetarianDesc') || 'Kein Fleisch oder Fisch'}</span>
                  </div>
                  {activeDiet === 'Vegetarisch' && <Check size={18} className="allergies-diet-check" />}
                </button>

                <button
                  type="button"
                  className={`allergies-diet-card ${activeDiet === 'Vegan' ? 'selected' : ''}`}
                  onClick={() => handleSelectDiet('Vegan')}
                  data-testid="diet-option-vegan"
                >
                  <span className="allergies-diet-icon">🌱</span>
                  <div className="allergies-diet-info">
                    <span className="allergies-diet-title">{t('dietVegan') || 'Vegan'}</span>
                    <span className="allergies-diet-desc">{t('dietVeganDesc') || 'Keine tierischen Produkte'}</span>
                  </div>
                  {activeDiet === 'Vegan' && <Check size={18} className="allergies-diet-check" />}
                </button>
              </div>
            </div>
          )}

          {/* Mode 2: Lebensmittel (Reusing allergen choices from allergen editor, without checkboxes, clicking immediately adds) */}
          {selectedCategory === 'lebensmittel' && (
            <div data-testid="allergies-panel-lebensmittel">
              <AllergenPickerGrid
                selectedAllergens={currentStrings}
                onToggleAllergen={handleSelectMainAllergen}
                onAddCustomAllergen={handleAddCustomFoodAllergen}
                isItemActive={isMainAllergenSelected}
                showCheckboxes={false}
                testIdPrefix="allergy"
                customPlaceholder={t('allergyCustomFoodPlaceholder') || 'Weiteres Lebensmittel eingeben...'}
              />
            </div>
          )}

          {/* Mode 3: Andere (Custom text input) */}
          {selectedCategory === 'andere' && (
            <div data-testid="allergies-panel-andere">
              <div className="allergies-other-input-row">
                <input
                  ref={otherInputRef}
                  type="text"
                  className="allergies-other-input"
                  placeholder={
                    t('allergyCustomOtherPlaceholder') ||
                    'Andere Allergie eingeben (z. B. Pollen, Wespenstich)...'
                  }
                  value={otherInput}
                  onChange={(e) => setOtherInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOtherAllergy();
                    }
                  }}
                  data-testid="allergy-other-input"
                />
                <button
                  type="button"
                  className="allergies-other-add-btn"
                  onClick={handleAddOtherAllergy}
                  disabled={!otherInput.trim()}
                  data-testid="allergy-other-add-btn"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </CellPopover>
  );
};

export default AllergiesListEditor;
