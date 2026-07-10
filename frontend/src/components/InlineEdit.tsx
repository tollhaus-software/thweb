import React, { useState, useEffect, useRef } from 'react';
import { CURRENT_LOCALE } from '../utils/i18n';

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

const parseDateStringToObj = (str: string): Date => {
  if (!str) return new Date();
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, m, d);
      }
    }
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return new Date();
};

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

  const isEditingRef = useRef(isEditing);
  const tempValueRef = useRef(tempValue);

  // Calendar Picker state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  useEffect(() => {
    isEditingRef.current = isEditing;
    if (isEditing && type === Types.DATE) {
      const d = tempValue ? parseDateStringToObj(tempValue) : new Date();
      setCalMonth(d.getMonth());
      setCalYear(d.getFullYear());
    }
  }, [isEditing, tempValue, type]);

  useEffect(() => {
    tempValueRef.current = tempValue;
  }, [tempValue]);

  // Sync state if external value changes
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const handleSave = () => {
    const latestVal = tempValueRef.current;
    if (onValidate && !onValidate(latestVal)) {
      handleCancel();
      return;
    }
    onSave(latestVal);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
    if (onCancel) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const currentTarget = e.currentTarget;
    setTimeout(() => {
      // Find out if the active element is still inside the current edit wrapper
      const wrapper = currentTarget.closest('.easy-edit-inline-wrapper');
      if (!wrapper?.contains(document.activeElement)) {
        if (isEditingRef.current) {
          handleSave();
        }
      }
    }, 100);
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCalMonth(m => {
      if (m === 0) {
        setCalYear(y => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCalMonth(m => {
      if (m === 11) {
        setCalYear(y => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const handleSelectDay = (day: number) => {
    const d = String(day).padStart(2, '0');
    const m = String(calMonth + 1).padStart(2, '0');
    const y = calYear;
    let formatted = '';
    if (CURRENT_LOCALE === 'de') {
      formatted = `${d}.${m}.${y}`;
    } else {
      formatted = `${y}-${m}-${d}`;
    }
    setTempValue(formatted);
    // Trigger save immediately
    tempValueRef.current = formatted;
    handleSave();
  };

  if (!isEditing) {
    return (
      <div
        className={`easy-edit-wrapper ${hovered ? 'easy-edit-hover-on' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={() => setIsEditing(true)}
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
            onClick={() => setIsEditing(true)}
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
        className="easy-edit-inline-wrapper"
        style={{ position: 'relative', width: '100%', minHeight: '26px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          tabIndex={0}
          onBlur={handleInputBlur as any}
          autoFocus
          style={{ flex: 1, padding: '2px 4px', textAlign: 'left', color: 'var(--text-h)', fontWeight: 500, outline: 'none', cursor: 'pointer' }}
        >
          {currentLabel}
        </div>
        <div
          className="easy-edit-select-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: '2px',
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                onSave(opt.value);
                setIsEditing(false);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                background: tempValue === opt.value ? 'var(--accent-bg)' : 'transparent',
                color: 'var(--text-h)',
                fontSize: '0.95rem',
                borderBottom: '1px solid #f1f5f9',
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
        </div>
      </div>
    );
  }

  if (type === Types.DATE) {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayIndex = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday start

    const blanks = Array(firstDayIndex).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const calendarCells = [...blanks, ...days];

    const weekdays = CURRENT_LOCALE === 'de'
      ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
      : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    const monthNames = CURRENT_LOCALE === 'de'
      ? ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    return (
      <div
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
          onBlur={handleInputBlur as any}
          autoFocus
          placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.25rem 0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            fontSize: '0.95rem',
            background: 'white',
            color: 'var(--text)',
            boxSizing: 'border-box'
          }}
        />
        <div
          className="easy-edit-calendar-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            width: '240px',
            padding: '0.5rem',
            marginTop: '4px',
            boxSizing: 'border-box',
            color: 'var(--text-h)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <button type="button" onClick={handlePrevMonth} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', padding: '2px 6px' }}>&lt;</button>
            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{monthNames[calMonth]} {calYear}</span>
            <button type="button" onClick={handleNextMonth} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', padding: '2px 6px' }}>&gt;</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
            {weekdays.map(d => <div key={d}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }
              return (
                <div
                  key={`day-${day}`}
                  onClick={() => handleSelectDay(day)}
                  style={{
                    padding: '4px 0',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
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
        onBlur={handleInputBlur as any}
        autoFocus
        placeholder={placeholder}
        {...inputAttributes}
      />
    </div>
  );
};

export default InlineEdit;
