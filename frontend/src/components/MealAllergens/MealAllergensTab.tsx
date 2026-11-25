import React, { useState, useCallback, useEffect } from 'react';
import { type MealAllergenDay, createEmptyMealAllergenDay } from '../../utils/mealAllergens';
import { parseDateKey, formatDateKey } from '../../utils/mealPlan';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { MealAllergensCalendarView } from './MealAllergensCalendarView';
import { MealAllergensEditor } from './MealAllergensEditor';
import './MealAllergens.css';

function parseMealAllergensHashParams(): { date?: string; open?: boolean } {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.replace(/^#/, '');
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return {};
  const params = new URLSearchParams(raw.slice(qIdx + 1));
  const dateParam = params.get('date') || undefined;
  const openParam = params.get('open');
  return {
    date: dateParam,
    open: openParam === '1' || openParam === 'true',
  };
}

function parseValidDateParam(dateStr?: string): Date | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = parseDateKey(dateStr);
  if (isNaN(parsed.getTime()) || formatDateKey(parsed) !== dateStr) return null;
  return parsed;
}

export const MealAllergensTab: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<MealAllergenDay | null>(() => {
    const { date, open } = parseMealAllergensHashParams();
    if (open && date && parseValidDateParam(date)) {
      return createEmptyMealAllergenDay(date);
    }
    return null;
  });
  const [overviewAnchorDate, setOverviewAnchorDate] = useState<Date>(() => {
    const { date } = parseMealAllergensHashParams();
    const parsed = parseValidDateParam(date);
    return parsed || new Date();
  });
  const [highlightedDate, setHighlightedDate] = useState<string | null>(() => {
    const { date } = parseMealAllergensHashParams();
    return parseValidDateParam(date) ? date! : null;
  });
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    const handleHashChange = () => {
      const { date, open } = parseMealAllergensHashParams();
      const parsed = parseValidDateParam(date);
      if (parsed && date) {
        setOverviewAnchorDate(parsed);
        setHighlightedDate(date);
        if (open) {
          setSelectedDay(createEmptyMealAllergenDay(date));
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!highlightedDate || selectedDay) return;
    const timer = setTimeout(() => {
      setHighlightedDate(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [highlightedDate, selectedDay]);

  const handleRealtimeMessage = useCallback((msg: RealtimeMessage) => {
    if (msg.type === 'MEAL_ALLERGENS_UPDATED' || msg.type === 'DATA_REFRESH') {
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  useRealtime(handleRealtimeMessage);

  const handleSelectDay = useCallback((day: MealAllergenDay) => {
    setOverviewAnchorDate(parseDateKey(day.date));
    setSelectedDay(day);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedDay(null);
    setRefreshTrigger((prev) => prev + 1);
    if (typeof window !== 'undefined' && window.location.hash.includes('open=')) {
      window.history.replaceState(null, '', '#mealAllergens');
    }
  }, []);

  const handleDaySaved = useCallback((updated: MealAllergenDay) => {
    setSelectedDay(updated);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="meal-allergens-tab" data-testid="meal-allergens-tab">
      {selectedDay ? (
        <MealAllergensEditor
          initialDay={selectedDay}
          onBack={handleBack}
          onDaySaved={handleDaySaved}
        />
      ) : (
        <MealAllergensCalendarView
          onSelectDay={handleSelectDay}
          initialDate={overviewAnchorDate}
          highlightedDate={highlightedDate}
          refreshTrigger={refreshTrigger}
          testIdPrefix="meal-allergens"
        />
      )}
    </div>
  );
};
