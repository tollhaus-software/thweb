import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { t, CURRENT_LOCALE } from '../../utils/i18n';
import {
  formatDateKey,
  parseDateKey,
  getMondayOfWeek,
  getWeekDays,
  getISOWeekNumber,
  formatWeekRange,
  formatDayHeader,
} from '../../utils/mealPlan';
import {
  type MealAllergenDay,
  createEmptyMealAllergenDay,
  getMonth5WeeksFlatDays,
  formatMonthYearLabel,
  getMonthForDateIn5WeekGrid,
  getDayBgVariant,
  getAllergenShortLabel,
  doesDayMatchSearch,
  findMostRecentMatchingDay,
} from '../../utils/mealAllergens';

interface MealAllergensCalendarViewProps {
  onSelectDay: (day: MealAllergenDay) => void;
  initialDate?: Date;
  enableSearch?: boolean;
  allEntries?: MealAllergenDay[];
  excludeDateFromSearchJump?: string;
  refreshTrigger?: number;
  testIdPrefix?: string;
}

export const MealAllergensCalendarView: React.FC<MealAllergensCalendarViewProps> = ({
  onSelectDay,
  initialDate,
  enableSearch = false,
  allEntries = [],
  excludeDateFromSearchJump,
  refreshTrigger = 0,
  testIdPrefix = 'meal-allergens',
}) => {
  const { token } = useAuth();
  const isMobile = useIsMobile();

  const [selectedYearMonth, setSelectedYearMonth] = useState<{ year: number; month: number }>(() => {
    const base = initialDate || new Date();
    return getMonthForDateIn5WeekGrid(base);
  });

  const [selectedMonday, setSelectedMonday] = useState<Date>(() => {
    const base = initialDate || new Date();
    return getMondayOfWeek(base);
  });

  const [daysMap, setDaysMap] = useState<Record<string, MealAllergenDay>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeJumpedDate, setActiveJumpedDate] = useState<string | null>(null);

  const visibleDates = useMemo(() => {
    if (isMobile) {
      return getWeekDays(selectedMonday);
    }
    return getMonth5WeeksFlatDays(selectedYearMonth.year, selectedYearMonth.month);
  }, [isMobile, selectedMonday, selectedYearMonth]);

  const startDateKey = formatDateKey(visibleDates[0]);
  const endDateKey = formatDateKey(visibleDates[visibleDates.length - 1]);

  useEffect(() => {
    let ignore = false;
    const fetchRange = async () => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(
          `/api/meal-allergens?start_date=${encodeURIComponent(startDateKey)}&end_date=${encodeURIComponent(endDateKey)}`,
          { headers }
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch meal allergens (${res.status})`);
        }
        const data: MealAllergenDay[] = await res.json();
        if (!ignore) {
          const nextMap: Record<string, MealAllergenDay> = {};
          for (const d of data) {
            nextMap[d.date] = d;
          }
          setDaysMap(nextMap);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Error loading meal allergens range:', err);
          setLoading(false);
        }
      }
    };

    fetchRange();
    return () => {
      ignore = true;
    };
  }, [startDateKey, endDateKey, token, refreshTrigger]);

  const handlePrevMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handlePrevWeek = useCallback(() => {
    setSelectedMonday((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7);
      return next;
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setSelectedMonday((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7);
      return next;
    });
  }, []);

  const handleConfirmSearchJump = useCallback(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Combine allEntries and currently loaded daysMap
    const combinedMap = new Map<string, MealAllergenDay>();
    for (const entry of allEntries) {
      combinedMap.set(entry.date, entry);
    }
    for (const [k, v] of Object.entries(daysMap)) {
      combinedMap.set(k, v);
    }

    const match = findMostRecentMatchingDay(
      Array.from(combinedMap.values()),
      trimmed,
      excludeDateFromSearchJump
    );
    if (match) {
      const matchDate = parseDateKey(match.date);
      setSelectedYearMonth(getMonthForDateIn5WeekGrid(matchDate));
      setSelectedMonday(getMondayOfWeek(matchDate));
      setActiveJumpedDate(match.date);
    }
  }, [searchQuery, allEntries, daysMap, excludeDateFromSearchJump]);

  const todayKey = formatDateKey(new Date());
  const { week: weekNo } = getISOWeekNumber(selectedMonday);
  const weekRangeStr = formatWeekRange(selectedMonday);
  const monthYearLabel = formatMonthYearLabel(selectedYearMonth.year, selectedYearMonth.month);

  const weekdayHeaders =
    CURRENT_LOCALE === 'en'
      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

  return (
    <div className="meal-allergens-calendar-wrapper" data-testid={`${testIdPrefix}-calendar`}>
      <div className="meal-allergens-controls">
        {!isMobile ? (
          <div className="meal-allergens-selector" data-testid={`${testIdPrefix}-month-selector`}>
            <button
              type="button"
              className="meal-allergens-nav-arrow"
              onClick={handlePrevMonth}
              aria-label={t('previousMonth')}
              title={t('previousMonth')}
              data-testid={`${testIdPrefix}-prev-month`}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="meal-allergens-period-label" data-testid={`${testIdPrefix}-month-label`}>
              {monthYearLabel}
            </div>
            <button
              type="button"
              className="meal-allergens-nav-arrow"
              onClick={handleNextMonth}
              aria-label={t('nextMonth')}
              title={t('nextMonth')}
              data-testid={`${testIdPrefix}-next-month`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <div className="meal-allergens-selector" data-testid={`${testIdPrefix}-week-selector`}>
            <button
              type="button"
              className="meal-allergens-nav-arrow"
              onClick={handlePrevWeek}
              aria-label={t('previousWeek')}
              title={t('previousWeek')}
              data-testid={`${testIdPrefix}-prev-week`}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="meal-allergens-period-label" data-testid={`${testIdPrefix}-week-label`}>
              {t('calendarWeek')} {weekNo} ({weekRangeStr})
            </div>
            <button
              type="button"
              className="meal-allergens-nav-arrow"
              onClick={handleNextWeek}
              aria-label={t('nextWeek')}
              title={t('nextWeek')}
              data-testid={`${testIdPrefix}-next-week`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {enableSearch && (
          <div className="meal-allergens-search-bar">
            <div className="meal-allergens-search-input-wrap">
              <input
                type="text"
                className="meal-allergens-search-input"
                placeholder={t('copySearchPlaceholder')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveJumpedDate(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmSearchJump();
                  }
                }}
                data-testid={`${testIdPrefix}-search-input`}
              />
            </div>
            <button
              type="button"
              className="meal-allergens-nav-arrow"
              onClick={handleConfirmSearchJump}
              title={t('copySearchJumpBtn')}
              aria-label={t('copySearchJumpBtn')}
              data-testid={`${testIdPrefix}-search-confirm`}
            >
              <Search size={16} />
            </button>
          </div>
        )}
      </div>

      {!isMobile && (
        <div className="meal-allergens-weekday-headers" data-testid={`${testIdPrefix}-weekday-headers`}>
          {weekdayHeaders.map((dayLabel) => (
            <div key={dayLabel} className="meal-allergens-weekday-header">
              {dayLabel}
            </div>
          ))}
        </div>
      )}

      <div
        className={`meal-allergens-grid ${isMobile ? 'mobile-week-stack' : ''}`}
        data-testid={`${testIdPrefix}-grid`}
        data-loading={loading}
      >
        {visibleDates.map((dateObj) => {
          const dateKey = formatDateKey(dateObj);
          const dayData = daysMap[dateKey] || createEmptyMealAllergenDay(dateKey);
          const bgVariant = getDayBgVariant(dayData, todayKey);
          const { dayName, dateStr } = formatDayHeader(dateObj);
          const isMatched = enableSearch && doesDayMatchSearch(dayData, searchQuery);
          const isActiveJump = activeJumpedDate === dateKey;
          const isOutsideMonth = !isMobile && dateObj.getMonth() !== selectedYearMonth.month;

          const cookName = dayData.cook_display_name || dayData.plan_cook_name || '';
          const displayComponents =
            dayData.has_allergen_record && dayData.meal_components.length > 0
              ? dayData.meal_components
              : (dayData.plan_meal_components || []).map((name) => ({
                  name,
                  allergens: [] as string[],
                }));

          return (
            <button
              key={dateKey}
              type="button"
              className={[
                'meal-allergen-day-box',
                `bg-${bgVariant}`,
                isMatched ? 'search-match' : '',
                isActiveJump ? 'search-active-match' : '',
                isOutsideMonth ? 'outside-month' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid={`${testIdPrefix}-day-box-${dateKey}`}
              data-date={dateKey}
              data-bg-variant={bgVariant}
              data-status={dayData.status}
              data-search-match={isMatched ? 'true' : 'false'}
              data-search-active-match={isActiveJump ? 'true' : 'false'}
              onClick={() => onSelectDay(dayData)}
            >
              <div className="meal-allergen-day-header">
                <span className="meal-allergen-day-date">
                  {isMobile ? `${dayName}, ${dateStr}` : dateStr}
                </span>
                <span className="meal-allergen-day-cook" data-testid={`${testIdPrefix}-day-cook-${dateKey}`}>
                  {cookName || '–'}
                </span>
              </div>

              {displayComponents.length > 0 ? (
                <ul className="meal-allergen-day-components" data-testid={`${testIdPrefix}-day-components-${dateKey}`}>
                  {displayComponents.map((comp, idx) => (
                    <li key={`${comp.name}-${idx}`} className="meal-allergen-day-component-item">
                      <span>{comp.name}</span>
                      {comp.allergens &&
                        comp.allergens.map((allergen) => (
                          <span key={allergen} className="meal-allergen-mini-badge">
                            {getAllergenShortLabel(allergen)}
                          </span>
                        ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="meal-allergen-empty-text">{t('noMealsPlanned')}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
