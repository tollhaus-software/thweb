import React, { useState, useCallback } from 'react';
import { type MealAllergenDay } from '../../utils/mealAllergens';
import { parseDateKey } from '../../utils/mealPlan';
import { useRealtime, type RealtimeMessage } from '../../hooks/useRealtime';
import { MealAllergensCalendarView } from './MealAllergensCalendarView';
import { MealAllergensEditor } from './MealAllergensEditor';
import './MealAllergens.css';

export const MealAllergensTab: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<MealAllergenDay | null>(null);
  const [overviewAnchorDate, setOverviewAnchorDate] = useState<Date>(() => new Date());
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

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
          refreshTrigger={refreshTrigger}
          testIdPrefix="meal-allergens"
        />
      )}
    </div>
  );
};
