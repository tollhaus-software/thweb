import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  type DayMealData,
  getDefaultMealPlanMonday,
  getISOWeekNumber,
  formatWeekRange,
  formatDateKey,
  getWeekDays,
  getWeekAnnotation,
} from '../../utils/mealPlan';
import { MealPlanSheet } from './MealPlanSheet';
import { t } from '../../utils/i18n';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import './MealPlan.css';

export const MealPlanTab: React.FC = () => {
  const { token } = useAuth();
  const [selectedMonday, setSelectedMonday] = useState<Date>(() => getDefaultMealPlanMonday());
  const [daysData, setDaysData] = useState<DayMealData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { week: weekNo } = getISOWeekNumber(selectedMonday);
  const weekRangeStr = formatWeekRange(selectedMonday);
  const annotation = getWeekAnnotation(selectedMonday);

  const handlePrevWeek = useCallback(() => {
    setSelectedMonday((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
      next.setDate(next.getDate() - 7);
      return next;
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setSelectedMonday((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
      next.setDate(next.getDate() + 7);
      return next;
    });
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchWeekMeals = async () => {
      setLoading(true);
      setError(null);
      try {
        const days = getWeekDays(selectedMonday);
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const results = await Promise.all(
          days.map(async (dayDate) => {
            const dateStr = formatDateKey(dayDate);
            const res = await fetch(`/api/dashboard/daily-brief?date=${encodeURIComponent(dateStr)}`, { headers });
            if (!res.ok) {
              throw new Error(`Failed to fetch meal plan (${res.status} ${res.statusText})`);
            }
            const data = await res.json();
            return {
              date: dateStr,
              who_is_cooking: data.who_is_cooking || '',
              meal_components: data.meal_components || [],
            };
          })
        );

        if (!ignore) {
          setDaysData(results);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Error fetching weekly meal plan:', err);
          setError(err instanceof Error ? err.message : 'Error loading meal plan');
          setLoading(false);
        }
      }
    };

    fetchWeekMeals();

    return () => {
      ignore = true;
    };
  }, [selectedMonday, token]);

  return (
    <div className="meal-plan-container" data-testid="meal-plan-tab">
      {/* Controls Bar */}
      <div className="meal-plan-controls no-print">
        <div className="meal-plan-week-selector">
          <button
            type="button"
            className="meal-plan-nav-arrow"
            onClick={handlePrevWeek}
            aria-label={t('previousWeek')}
            title={t('previousWeek')}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="meal-plan-week-label">
            <span>
              {t('calendarWeek')} {weekNo} ({weekRangeStr})
            </span>
            {annotation && (
              <span className="meal-plan-annotation" data-testid="week-annotation">
                {annotation}
              </span>
            )}
          </div>

          <button
            type="button"
            className="meal-plan-nav-arrow"
            onClick={handleNextWeek}
            aria-label={t('nextWeek')}
            title={t('nextWeek')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="meal-plan-actions">
          <button
            type="button"
            onClick={handlePrint}
            className="primary-button meal-plan-print-action-btn"
            title={t('print')}
          >
            <Printer size={16} />
            <span>{t('print')}</span>
          </button>
        </div>
      </div>

      {/* Sheet Preview */}
      <MealPlanSheet
        mondayDate={selectedMonday}
        daysData={daysData}
        loading={loading}
        error={error}
      />
    </div>
  );
};
