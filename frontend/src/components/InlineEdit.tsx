import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CURRENT_LOCALE } from '../utils/i18n';
import CalendarDropdown, { parseDateStringToObj } from './CalendarDropdown';

export { CalendarDropdown, parseDateStringToObj };

// eslint-disable-next-line react-refresh/only-export-components
export const Types = {
  TEXT: 'text',
  DATE: 'date',
  SELECT: 'select',
};

interface InlineEditProps {
  type: string;
  value: string;
  onSave: (val: string) => void;
  editButtonLabel?: React.ReactNode;
  placeholder?: string;
  instructions?: string;
  displayComponent?: React.ReactNode;
  viewAttributes?: React.HTMLAttributes<HTMLDivElement>;
  inputAttributes?: React.InputHTMLAttributes<HTMLInputElement | HTMLSelectElement>;
  onCancel?: () => void;
  onValidate?: (val: string) => boolean;
  options?: { label: string; value: string }[];
}

export const InlineEdit: React.FC<InlineEditProps> = ({
  type = 'text',
  value,
  onSave,
  editButtonLabel = '✏️',
  placeholder,
  instructions,
  displayComponent,
  viewAttributes = {},
  inputAttributes = {},
  onCancel,
  onValidate = () => true,
  options = [],
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEditingRef = useRef(isEditing);
  const tempValueRef = useRef(tempValue);

  // Sync state if external value changes
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setTempValue(value);
  }

  const startEditing = () => {
    setIsEditing(true);
  };

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    tempValueRef.current = tempValue;
  }, [tempValue]);

  // Dropdown portal coordinates
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const handleSave = useCallback(() => {
    const latestVal = tempValueRef.current;
    if (onValidate && !onValidate(latestVal)) {
      setTempValue(value);
      setIsEditing(false);
      setDropdownCoords(null);
      if (onCancel) {
        onCancel();
      }
      return;
    }
    onSave(latestVal);
    setIsEditing(false);
    setDropdownCoords(null);
  }, [onSave, onValidate, value, onCancel]);

  const handleCancel = useCallback(() => {
    setTempValue(value);
    setIsEditing(false);
    setDropdownCoords(null);
    if (onCancel) {
      onCancel();
    }
  }, [value, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLDivElement>) => {
    const currentTarget = e.currentTarget;
    setTimeout(() => {
      // Find out if the active element is still inside the current edit wrapper or dropdown
      const wrapper = currentTarget.closest('.easy-edit-inline-wrapper');
      const inWrapper = wrapper?.contains(document.activeElement);
      const inDropdown =
        dropdownRef.current?.contains(document.activeElement) ||
        Boolean(document.activeElement?.closest?.('.easy-edit-calendar-dropdown'));
      if (!inWrapper && !inDropdown) {
        if (isEditingRef.current) {
          handleSave();
        }
      }
    }, 150);
  };

  // Outside click listener to dismiss floating portal dropdowns (for SELECT)
  useEffect(() => {
    if (!isEditing || type !== Types.SELECT) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isEditing, type, handleSave]);

  useLayoutEffect(() => {
    if (!isEditing || type !== Types.SELECT) {
      return;
    }

    const updateCoords = () => {
      const el = wrapperRef.current || inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const dropdownWidth = Math.max(rect.width, 160);
      const dropdownHeight = Math.min(options.length * 40 + 10, 240);
      let top = rect.bottom + 2;
      let left = rect.left;
      if (top + dropdownHeight > viewportHeight - 8 && rect.top > dropdownHeight + 8) {
        top = rect.top - dropdownHeight - 2;
      }
      if (left + dropdownWidth > viewportWidth - 8) {
        left = viewportWidth - dropdownWidth - 8;
      }
      if (left < 8) left = 8;
      setDropdownCoords({ top, left, width: dropdownWidth });
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isEditing, type, options.length]);

  if (!isEditing) {
    return (
      <div
        className={`easy-edit-wrapper ${hovered ? 'easy-edit-hover-on' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={startEditing}
        {...viewAttributes}
      >
        {displayComponent ? (
          displayComponent
        ) : (
          <span className="easy-edit-value">
            {value || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{placeholder || 'Click to edit'}</span>}
          </span>
        )}
        <div className="easy-edit-view-button-wrapper">
          <button
            type="button"
            className="easy-edit-button"
            onClick={startEditing}
            title={instructions}
          >
            {editButtonLabel}
          </button>
        </div>
      </div>
    );
  }

  if (type === Types.SELECT) {
    const currentLabel = options.find(o => o.value === tempValue)?.label || tempValue;
    return (
      <div
        ref={wrapperRef}
        className="easy-edit-inline-wrapper"
        style={{ position: 'relative', width: '100%', minHeight: '26px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          tabIndex={0}
          onBlur={handleInputBlur}
          autoFocus
          style={{ flex: 1, padding: '2px 4px', textAlign: 'left', color: 'var(--text-h)', fontWeight: 500, outline: 'none', cursor: 'pointer' }}
        >
          {currentLabel}
        </div>
        {dropdownCoords && createPortal(
          <div
            ref={dropdownRef}
            className="easy-edit-select-dropdown"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: `${dropdownCoords.top}px`,
              left: `${dropdownCoords.left}px`,
              width: `${dropdownCoords.width}px`,
              zIndex: 10005,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              boxShadow: 'var(--shadow)',
              boxSizing: 'border-box',
              maxHeight: '240px',
              overflowY: 'auto',
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  onSave(opt.value);
                  setIsEditing(false);
                  setDropdownCoords(null);
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: tempValue === opt.value ? 'var(--accent-bg)' : 'transparent',
                  color: 'var(--text-h)',
                  fontSize: '0.95rem',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = tempValue === opt.value ? 'var(--accent-bg)' : 'transparent';
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  }

  if (type === Types.DATE) {
    return (
      <div
        ref={wrapperRef}
        className="easy-edit-inline-wrapper"
        style={{ position: 'relative', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          autoFocus
          placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.25rem 0.5rem',
            border: '1px solid var(--input-border)',
            borderRadius: '4px',
            fontSize: '0.95rem',
            background: 'var(--input-bg)',
            color: 'var(--input-text)',
            boxSizing: 'border-box',
          }}
        />
        <CalendarDropdown
          anchorRef={wrapperRef}
          isOpen={isEditing}
          onClose={handleSave}
          selectedDateStr={tempValue}
          onSelectDate={(formatted) => {
            setTempValue(formatted);
            tempValueRef.current = formatted;
            handleSave();
          }}
        />
      </div>
    );
  }

  // Map react-easy-edit types to HTML input types
  const inputType = type === Types.DATE ? 'date' : 'text';

  return (
    <div className="easy-edit-inline-wrapper">
      <input
        ref={inputRef}
        type={inputType}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleInputBlur}
        autoFocus
        placeholder={placeholder}
        {...inputAttributes}
      />
    </div>
  );
};

export default InlineEdit;
