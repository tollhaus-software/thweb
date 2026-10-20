import React from 'react';
import {
  type DayMealData,
  getISOWeekNumber,
  formatWeekRange,
  formatDayHeader,
  getWeekDays,
  formatDateKey,
} from '../../utils/mealPlan';
import { t } from '../../utils/i18n';

export interface MealPlanSheetProps {
  mondayDate: Date;
  daysData: DayMealData[];
  loading?: boolean;
  error?: string | null;
}

export const MealPlanSheet: React.FC<MealPlanSheetProps> = ({
  mondayDate,
  daysData,
  loading = false,
  error = null,
}) => {
  const { week: weekNo } = getISOWeekNumber(mondayDate);
  const weekRangeStr = formatWeekRange(mondayDate);
  const weekDays = getWeekDays(mondayDate);

  // Index daysData by date key
  const dayDataMap = new Map<string, DayMealData>();
  daysData.forEach((d) => {
    dayDataMap.set(d.date, d);
  });

  return (
    <div className="meal-plan-sheet" data-testid="meal-plan-sheet">
      <div className="meal-plan-sheet-header">
        <div>
          <h2 className="meal-plan-sheet-title" style={{ color: '#000000' }}>
            {t('mealPlanTitle')}
          </h2>
        </div>
        <div className="meal-plan-sheet-week-info">
          {t('calendarWeek')} {weekNo} · {weekRangeStr}
        </div>
      </div>

      {loading ? (
        <div className="meal-plan-loading">
          <span>{t('loading')}</span>
        </div>
      ) : error ? (
        <div className="meal-plan-loading" style={{ color: '#ef4444' }}>
          <span>{error}</span>
        </div>
      ) : (
        <div className="meal-plan-grid">
          {weekDays.map((dayDate) => {
            const dateKey = formatDateKey(dayDate);
            const data = dayDataMap.get(dateKey);
            const { dayName, dateStr } = formatDayHeader(dayDate);
            const components = data?.meal_components?.filter(Boolean) || [];

            return (
              <div key={dateKey} className="meal-plan-day-col" data-date={dateKey}>
                <div className="meal-plan-day-header">
                  <span className="meal-plan-day-name">{dayName}</span>
                  <span className="meal-plan-day-date">{dateStr}</span>
                </div>

                <div className="meal-plan-day-body">
                  <div className="meal-plan-meals-box">
                    {components.length > 0 ? (
                      components.map((comp, idx) => (
                        <div key={idx} className="meal-plan-component-item">
                          {comp}
                        </div>
                      ))
                    ) : (
                      <div className="meal-plan-empty-text">
                        {t('noMealsPlanned')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
