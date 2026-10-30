import React, { useState } from 'react';
import { AllergenIcon } from './AllergenIcon';
import {
  MAIN_ALLERGENS,
  type MainAllergenDefinition,
  getAllergenBgColor,
} from '../../utils/mealAllergens';
import { t } from '../../utils/i18n';

export interface AllergenPickerGridProps {
  selectedAllergens: string[];
  onToggleAllergen: (item: MainAllergenDefinition) => void;
  onAddCustomAllergen?: (customName: string) => void;
  isItemActive?: (item: MainAllergenDefinition) => boolean;
  disabled?: boolean;
  testIdPrefix?: string;
  customPlaceholder?: string;
  showCheckboxes?: boolean;
}

export const AllergenPickerGrid: React.FC<AllergenPickerGridProps> = ({
  selectedAllergens = [],
  onToggleAllergen,
  onAddCustomAllergen,
  isItemActive,
  disabled = false,
  testIdPrefix = 'allergen',
  customPlaceholder,
  showCheckboxes = true,
}) => {
  const [customInput, setCustomInput] = useState('');

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || disabled) return;
    if (onAddCustomAllergen) {
      onAddCustomAllergen(trimmed);
      setCustomInput('');
    }
  };

  const checkSelected = (item: MainAllergenDefinition): boolean => {
    if (isItemActive) {
      return isItemActive(item);
    }
    const keyLower = item.key.toLowerCase();
    const shortLabelLower = (item.shortLabel || '').toLowerCase();
    const labelLower = (item.label || '').toLowerCase();

    return selectedAllergens.some((s) => {
      const sLower = String(s || '').toLowerCase().trim();
      return (
        sLower === keyLower ||
        sLower === shortLabelLower ||
        sLower === labelLower ||
        (keyLower === 'gluten' && (sLower.includes('gluten') || sLower.includes('weizen') || sLower.includes('dinkel'))) ||
        (keyLower === 'laktose' && (sLower.includes('milch') || sLower.includes('laktose'))) ||
        (keyLower === 'erdnuesse' && (sLower.includes('erdnuss') || sLower.includes('erdnüss'))) ||
        (keyLower === 'schalenfruechte' && (sLower.includes('schalenfr') || sLower.includes('nüss') || sLower.includes('haselnuss')))
      );
    });
  };

  return (
    <div className="allergen-picker-grid-container">
      <div
        className={`meal-allergens-main-list ${disabled ? 'locked' : ''}`}
        data-testid={`allergen-picker-panel-${testIdPrefix}`}
      >
        {MAIN_ALLERGENS.map((item) => {
          const isSelected = checkSelected(item);
          return (
            <button
              key={item.key}
              type="button"
              className={`meal-allergens-main-option ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                if (!disabled) onToggleAllergen(item);
              }}
              disabled={disabled}
              data-testid={`allergen-option-${testIdPrefix}-${item.key}`}
            >
              {showCheckboxes && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  disabled={disabled}
                  style={{ marginTop: '0.2rem', pointerEvents: 'none' }}
                />
              )}
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

      {onAddCustomAllergen && (
        <div
          className={`meal-allergens-custom-row ${disabled ? 'locked' : ''}`}
          style={{ marginTop: '0.5rem' }}
        >
          <input
            type="text"
            className="meal-allergens-input"
            style={{ flex: 1 }}
            placeholder={customPlaceholder || t('customAllergenPlaceholder') || 'Weiteres Allergen eingeben...'}
            value={customInput}
            disabled={disabled}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            data-testid={`custom-allergen-input-${testIdPrefix}`}
          />
          <button
            type="button"
            className="primary-button meal-allergens-custom-add-btn"
            onClick={handleAddCustom}
            disabled={disabled || !customInput.trim()}
            title={t('addCustomAllergenBtn') || '+'}
            aria-label={t('addCustomAllergenBtn') || '+'}
            data-testid={`custom-allergen-add-btn-${testIdPrefix}`}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};
