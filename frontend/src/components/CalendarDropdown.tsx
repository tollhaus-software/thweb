import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CURRENT_LOCALE } from '../utils/i18n';

export interface CalendarDropdownProps {
  anchorEl?: HTMLElement | null;
  anchorRef?: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  selectedDateStr?: string;
  onSelectDate: (formattedDate: string) => void;
  zIndex?: number;
}

export const parseDateStringToObj = (str: string): Date => {
  if (!str) return new Date();
  const trimmed = str.trim();
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y > 1900) {
        return new Date(y, m, d);
      }
    }
  }
  const dateOnly = trimmed.split('T')[0];
  if (dateOnly.includes('-')) {
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y > 1900) {
        return new Date(y, m, d);
      }
    }
  }
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return new Date();
};

export const CalendarDropdown: React.FC<CalendarDropdownProps> = ({
  anchorEl,
  anchorRef,
  isOpen,
  onClose,
  selectedDateStr,
  onSelectDate,
  zIndex = 10005,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const getAnchor = (): HTMLElement | null => {
    if (anchorRef?.current) return anchorRef.current;
    if (anchorEl) return anchorEl;
    if (markerRef.current?.parentElement) return markerRef.current.parentElement;
    return null;
  };

  // Calendar month / year state
  const [calMonth, setCalMonth] = useState<number>(() => {
    const d = parseDateStringToObj(selectedDateStr || '');
    return d.getMonth();
  });
  const [calYear, setCalYear] = useState<number>(() => {
    const d = parseDateStringToObj(selectedDateStr || '');
    return d.getFullYear();
  });

  const lastSyncedStrRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (lastSyncedStrRef.current !== selectedDateStr) {
        lastSyncedStrRef.current = selectedDateStr || null;
        if (selectedDateStr) {
          const d = parseDateStringToObj(selectedDateStr);
          setCalMonth(d.getMonth());
          setCalYear(d.getFullYear());
        }
      }
    } else {
      lastSyncedStrRef.current = null;
    }
  }, [isOpen, selectedDateStr]);

  // Outside click listener
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const el = getAnchor();
      if (
        el &&
        !el.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  // Positioning
  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownCoords(null);
      return;
    }

    let rafId: number | null = null;
    const startTime = Date.now();

    const updateCoords = () => {
      const el = getAnchor();
      if (!el) {
        if (Date.now() - startTime < 350) {
          rafId = requestAnimationFrame(updateCoords);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        if (Date.now() - startTime < 350) {
          rafId = requestAnimationFrame(updateCoords);
        }
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const dropdownWidth = 240;
      const dropdownHeight = 220;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (top + dropdownHeight > viewportHeight - 8 && rect.top > dropdownHeight + 8) {
        top = rect.top - dropdownHeight - 4;
      }
      if (left + dropdownWidth > viewportWidth - 8) {
        left = viewportWidth - dropdownWidth - 8;
      }
      if (left < 8) left = 8;

      setDropdownCoords((prev) => {
        if (prev && prev.top === top && prev.left === left && prev.width === dropdownWidth) {
          return prev;
        }
        return { top, left, width: dropdownWidth };
      });

      // Continue tracking during initial popup animation / layout settlement
      if (Date.now() - startTime < 350) {
        rafId = requestAnimationFrame(updateCoords);
      }
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen, anchorEl]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCalMonth((m) => {
      if (m === 0) {
        setCalYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCalMonth((m) => {
      if (m === 11) {
        setCalYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const handleSelectDay = (day: number) => {
    const d = String(day).padStart(2, '0');
    const m = String(calMonth + 1).padStart(2, '0');
    const y = calYear;
    const formatted = CURRENT_LOCALE === 'de' ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
    onSelectDate(formatted);
  };

  if (!isOpen) return null;

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

  const selectedDateObj = selectedDateStr ? parseDateStringToObj(selectedDateStr) : null;

  return (
    <>
      <span ref={markerRef} style={{ display: 'none' }} />
      {dropdownCoords && createPortal(
        <div
          ref={dropdownRef}
          className="easy-edit-calendar-dropdown"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: 'fixed',
        top: `${dropdownCoords.top}px`,
        left: `${dropdownCoords.left}px`,
        width: `${dropdownCoords.width}px`,
        zIndex,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: 'var(--shadow)',
        padding: '0.5rem',
        boxSizing: 'border-box',
        color: 'var(--text-h)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            padding: '2px 6px',
          }}
        >
          &lt;
        </button>
        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
          {monthNames[calMonth]} {calYear}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            padding: '2px 6px',
          }}
        >
          &gt;
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginBottom: '4px',
        }}
      >
        {weekdays.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
        {calendarCells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }
          const isSelected = Boolean(
            selectedDateObj &&
              selectedDateObj.getDate() === day &&
              selectedDateObj.getMonth() === calMonth &&
              selectedDateObj.getFullYear() === calYear
          );

          return (
            <div
              key={`day-${day}`}
              onClick={() => handleSelectDay(day)}
              style={{
                padding: '4px 0',
                fontSize: '0.8rem',
                cursor: 'pointer',
                borderRadius: '4px',
                backgroundColor: isSelected ? 'var(--primary, #0284c7)' : 'transparent',
                color: isSelected ? '#ffffff' : 'inherit',
                fontWeight: isSelected ? 600 : 'normal',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  )}
  </>
);
};

export default CalendarDropdown;
