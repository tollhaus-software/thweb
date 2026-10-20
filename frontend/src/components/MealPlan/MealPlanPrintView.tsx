import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  type DayMealData,
  getDefaultMealPlanMonday,
  getISOWeekNumber,
  formatWeekRange,
  formatDateKey,
  parseDateKey,
  getWeekDays,
} from '../../utils/mealPlan';
import { MealPlanSheet } from './MealPlanSheet';
import { t } from '../../utils/i18n';
import { Printer, X } from 'lucide-react';
import './MealPlan.css';

export const MealPlanPrintView: React.FC = () => {
  const { token } = useAuth();

  const [mondayDate] = useState<Date>(() => {
    const hash = window.location.hash;
    const match = hash.match(/week=([0-9]{4}-[0-9]{2}-[0-9]{2})/);
    if (match && match[1]) {
      return parseDateKey(match[1]);
    }
    return getDefaultMealPlanMonday();
  });

  const [daysData, setDaysData] = useState<DayMealData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { week: weekNo } = getISOWeekNumber(mondayDate);
  const weekRangeStr = formatWeekRange(mondayDate);

  useEffect(() => {
    let ignore = false;

    const fetchWeekMeals = async () => {
      setLoading(true);
      setError(null);
      try {
        const days = getWeekDays(mondayDate);
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
          console.error('Error fetching weekly meal plan for print:', err);
          setError(err instanceof Error ? err.message : 'Error loading meal plan');
          setLoading(false);
        }
      }
    };

    fetchWeekMeals();

    return () => {
      ignore = true;
    };
  }, [mondayDate, token]);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="meal-plan-standalone-page" data-testid="meal-plan-print-view">
      {/* Top Action Bar (hidden when printing) */}
      <div className="meal-plan-print-toolbar no-print">
        <div className="meal-plan-toolbar-title">
          {t('mealPlanTitle')} – {t('calendarWeek')} {weekNo} ({weekRangeStr})
        </div>

        <div className="meal-plan-toolbar-actions">
          <button
            type="button"
            onClick={handlePrint}
            className="meal-plan-toolbar-btn primary"
            title="Print"
            aria-label="Print"
          >
            <Printer size={16} />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="meal-plan-toolbar-btn secondary"
            title={t('close')}
          >
            <X size={16} />
            <span>{t('close')}</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <MealPlanSheet
        mondayDate={mondayDate}
        daysData={daysData}
        loading={loading}
        error={error}
      />
    </div>
  );
};
