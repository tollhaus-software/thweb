import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../hooks/useRealtime';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useFullyKioskScreensaver } from '../../hooks/useFullyKioskScreensaver';
import { t, formatDashboardDate } from '../../utils/i18n';
import { AllergenIcon } from '../MealAllergens/AllergenIcon';
import {
  MealAllergensEditor,
  MealComponentAllergenBadges,
} from '../MealAllergens/MealAllergensEditor';
import { formatDateKey } from '../../utils/mealPlan';
import {
  isLebensmittelAllergen,
  getAllergenDisplayLabel,
  findMatchingComponentsForAllergy,
  abbreviateComponentName,
  createEmptyMealAllergenDay,
  type MealAllergenComponent,
} from '../../utils/mealAllergens';
import {
  UtensilsCrossed,
  Soup,
  Coffee,
  Refrigerator,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Home,
  Pencil,
  Check,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';
import { TaskConfirmModal } from './TaskConfirmModal';
import { InfoPagesView } from './InfoPagesView';
import './KioskDashboard.css';

interface CompletedTaskInfo {
  task_type_id: string;
  task_date: string;
  completed_at: string;
  completed_by_email?: string;
  is_kiosk?: boolean;
  kiosk_name?: string;
}

interface DailyBriefData {
  date: string;
  who_is_cooking: string;
  meal_components: string[];
  tasks_and_info: string[];
  completed_tasks?: CompletedTaskInfo[];
  completed_task_ids?: string[];
  has_allergen_record?: boolean;
  allergen_meal_components?: MealAllergenComponent[];
  screensaver_exit_times?: string[];
}

interface GroupAllergiesSummary {
  group_id: number;
  group_name: string;
  allergies: string[];
  food_allergies?: string[];
}

interface AllergiesSummaryData {
  date: string;
  groups: GroupAllergiesSummary[];
  employees: string[];
  food_employees?: string[];
  meal_components?: MealAllergenComponent[];
}

interface RealtimeEvent {
  type?: string;
  payload?: unknown;
}

export interface KioskDashboardProps {
  onBackToPortal?: () => void;
  embedded?: boolean;
  idleTimeoutMs?: number;
}

export const KioskDashboard: React.FC<KioskDashboardProps> = ({
  embedded = false,
  idleTimeoutMs,
}) => {
  const { token, hasPermission } = useAuth();
  const canViewAllergiesSummary =
    !embedded || hasPermission('allergies.summary.read') || hasPermission('meal_allergens.read');
  const canEditMealAllergens = !embedded || hasPermission('meal_allergens.write');

  // If selectedDate is null, the frontend omits the ?date parameter, requesting "today" from backend
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [todayDateStr, setTodayDateStr] = useState<string>(() => formatDateKey(new Date()));
  const [data, setData] = useState<DailyBriefData | null>(null);
  const [allergiesData, setAllergiesData] = useState<AllergiesSummaryData | null>(null);
  const [showAllergies, setShowAllergies] = useState<boolean>(false);
  const [showInfoPages, setShowInfoPages] = useState<boolean>(false);
  const [activeInfoPageId, setActiveInfoPageId] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [taskToConfirm, setTaskToConfirm] = useState<string | null>(null);
  const [isEditingAllergens, setIsEditingAllergens] = useState<boolean>(false);
  const contentAreaRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Keep a ref to the current selectedDate for intervals and websocket callbacks
  const selectedDateRef = useRef<string | null>(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  // Live ticking clock in footer
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Close allergies popup on Escape key
  useEffect(() => {
    if (!showAllergies) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAllergies(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAllergies]);

  // Mark active view as dashboard while KioskDashboard is mounted
  useEffect(() => {
    const win = window as unknown as { __THWEB_APP_VIEW__?: string };
    win.__THWEB_APP_VIEW__ = 'dashboard';
    return () => {
      win.__THWEB_APP_VIEW__ = 'portal';
    };
  }, []);

  const fetchDailyBrief = useCallback(async (dateParam: string | null) => {
    try {
      const url = dateParam
        ? `/api/dashboard/daily-brief?date=${encodeURIComponent(dateParam)}`
        : `/api/dashboard/daily-brief`;

      const headers: Record<string, string> = {
        'X-App-View': 'dashboard',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch daily brief (${res.status} ${res.statusText})`);
      }

      const result: DailyBriefData = await res.json();
      setData(result);
      if (!dateParam && result.date) {
        setTodayDateStr(result.date.split('T')[0]);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('Error fetching daily brief:', err);
      const msg = err instanceof Error ? err.message : 'Error loading daily brief';
      setError(msg);
    }
  }, [token]);

  const fetchAllergiesSummary = useCallback(async (dateParam: string | null) => {
    if (!canViewAllergiesSummary) return;
    try {
      const url = dateParam
        ? `/api/dashboard/allergies?date=${encodeURIComponent(dateParam)}`
        : `/api/dashboard/allergies`;

      const headers: Record<string, string> = {
        'X-App-View': 'dashboard',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        return;
      }

      const result: AllergiesSummaryData = await res.json();
      setAllergiesData(result);
    } catch (err: unknown) {
      console.error('Error fetching allergies summary:', err);
    }
  }, [token, canViewAllergiesSummary]);

  // Initial fetch and fetch when selectedDate changes (also needed on main dashboard for allergen matching)
  useEffect(() => {
    void fetchAllergiesSummary(selectedDate);
  }, [selectedDate, fetchAllergiesSummary]);
  useEffect(() => {
    let ignore = false;
    const runFetch = async () => {
      try {
        const url = selectedDate
          ? `/api/dashboard/daily-brief?date=${encodeURIComponent(selectedDate)}`
          : `/api/dashboard/daily-brief`;

        const headers: Record<string, string> = {
          'X-App-View': 'dashboard',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`Failed to fetch daily brief (${res.status} ${res.statusText})`);
        }

        const result: DailyBriefData = await res.json();
        if (!ignore) {
          setData(result);
          if (!selectedDate && result.date) {
            setTodayDateStr(result.date.split('T')[0]);
          }
          setError(null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Error fetching daily brief:', err);
          const msg = err instanceof Error ? err.message : 'Error loading daily brief';
          setError(msg);
        }
      }
    };

    runFetch();

    return () => {
      ignore = true;
    };
  }, [selectedDate, token]);

  // 15-minute polling interval
  useEffect(() => {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const intervalId = setInterval(() => {
      void fetchDailyBrief(selectedDateRef.current);
    }, FIFTEEN_MINUTES_MS);

    return () => clearInterval(intervalId);
  }, [fetchDailyBrief]);

  // WebSocket invalidation support
  const handleRealtimeMessage = useCallback((message: RealtimeEvent) => {
    // If we receive an invalidation message or any backend event, re-fetch
    if (
      message?.type === 'DAILY_BRIEF_INVALIDATE' ||
      message?.type === 'DASHBOARD_TASKS_UPDATED' ||
      message?.type === 'MEAL_PLAN_UPDATED' ||
      message?.type === 'MEAL_ALLERGENS_UPDATED' ||
      message?.type === 'YELLOW_BAG_DAYS_UPDATED' ||
      message?.type === 'INVALIDATE'
    ) {
      void fetchDailyBrief(selectedDateRef.current);
    }
    if (
      message?.type === 'CHILD_UPDATED' ||
      message?.type === 'CHILD_DELETED' ||
      message?.type === 'EMPLOYEE_CREATED' ||
      message?.type === 'EMPLOYEE_UPDATED' ||
      message?.type === 'EMPLOYEE_DELETED' ||
      message?.type === 'MEAL_ALLERGENS_UPDATED' ||
      message?.type === 'INVALIDATE'
    ) {
      void fetchAllergiesSummary(selectedDateRef.current);
    }
  }, [fetchDailyBrief, fetchAllergiesSummary]);

  useRealtime(handleRealtimeMessage);

  // Date navigation helpers
  const getCurrentDateObj = (): Date => {
    if (data?.date) {
      const parts = data.date.split('T')[0].split('-').map(Number);
      if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }
    return new Date();
  };

  const handlePrevDay = () => {
    const current = getCurrentDateObj();
    current.setDate(current.getDate() - 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setIsEditingAllergens(false);
    setTaskToConfirm(null);
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleNextDay = () => {
    const current = getCurrentDateObj();
    current.setDate(current.getDate() + 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setIsEditingAllergens(false);
    setTaskToConfirm(null);
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleHomeClick = useCallback(() => {
    setShowInfoPages(false);
    setActiveInfoPageId(null);
    setShowAllergies(false);
    setShowFeedbackModal(false);
    setTaskToConfirm(null);
    setIsEditingAllergens(false);
    setSelectedDate(null); // Omitting date fetches "today" from backend
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, []);

  const handleInfoPagesClick = useCallback(() => {
    setIsEditingAllergens(false);
    setShowAllergies(false);
    setShowFeedbackModal(false);
    setTaskToConfirm(null);
    if (!showInfoPages) {
      setShowInfoPages(true);
      setActiveInfoPageId(null);
    } else if (activeInfoPageId) {
      setActiveInfoPageId(null);
    } else {
      setShowInfoPages(false);
    }
  }, [showInfoPages, activeInfoPageId]);

  const effectiveIdleTimeoutMs =
    idleTimeoutMs ??
    (typeof window !== 'undefined'
      ? (window as unknown as { __TEST_IDLE_TIMEOUT_MS__?: number }).__TEST_IDLE_TIMEOUT_MS__
      : undefined) ??
    5 * 60 * 1000;

  useIdleTimer({
    timeoutMs: effectiveIdleTimeoutMs,
    onIdle: handleHomeClick,
    enabled: true,
    throttleMs: 5000,
  });

  const handleScreensaverWake = useCallback(() => {
    handleHomeClick();
    void fetchDailyBrief(null);
  }, [handleHomeClick, fetchDailyBrief]);

  const { scheduledTimes } = useFullyKioskScreensaver({
    serverTimes: data?.screensaver_exit_times,
    currentTime,
    onWake: handleScreensaverWake,
    enabled: true,
  });

  const displayDateStr = (data?.date || selectedDate || todayDateStr).split('T')[0];
  const isToday = selectedDate === null || displayDateStr === todayDateStr;
  const isCurrentOrPastDay = displayDateStr <= todayDateStr;
  const canEditAllergensOnDashboard = canEditMealAllergens && isCurrentOrPastDay;
  const formattedDate = formatDashboardDate(displayDateStr);
  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  const openMealAllergensEditor = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!isCurrentOrPastDay) {
      alert(t('allergensOnlyCurrentOrPast'));
      return;
    }
    setShowAllergies(false);
    setTaskToConfirm(null);
    setIsEditingAllergens(true);
  };

  const allergenComponents: MealAllergenComponent[] =
    data?.allergen_meal_components && data.allergen_meal_components.length > 0
      ? data.allergen_meal_components
      : (allergiesData?.meal_components || []);

  const hasAllergensAdded =
    allergenComponents.length > 0 &&
    (Boolean(data?.has_allergen_record) || allergenComponents.some((c) => c.allergens && c.allergens.length > 0));

  const showAllergensSection = hasAllergensAdded || canEditAllergensOnDashboard;

  const isTaskCompleted = useCallback(
    (taskKey: string): boolean => {
      if (!data) return false;
      if (data.completed_task_ids && data.completed_task_ids.includes(taskKey)) {
        return true;
      }
      if (data.completed_tasks && data.completed_tasks.some((ct) => ct.task_type_id === taskKey)) {
        return true;
      }
      if (taskKey === 'enter_allergens' || taskKey === 'allergene_eintragen') {
        if (
          data.completed_task_ids?.includes('enter_allergens') ||
          data.completed_task_ids?.includes('allergene_eintragen')
        ) {
          return true;
        }
        if (
          data.completed_tasks?.some(
            (ct) => ct.task_type_id === 'enter_allergens' || ct.task_type_id === 'allergene_eintragen'
          )
        ) {
          return true;
        }
      }
      return false;
    },
    [data]
  );

  const getTaskLabel = useCallback((taskKey: string): string => {
    if (taskKey === 'yellow_bin_retrieve') {
      return t('yellowBinRetrieve');
    } else if (taskKey === 'yellow_bin_put_out') {
      return t('yellowBinPutOut');
    } else if (taskKey === 'clean_coffe_machine' || taskKey === 'clean_coffee_machine') {
      return t('cleanCoffeeMachine');
    } else if (taskKey === 'clean_refrigerator') {
      return t('cleanRefrigerator');
    } else if (taskKey === 'enter_allergens' || taskKey === 'allergene_eintragen') {
      return t('enterAllergens');
    }
    return taskKey;
  }, []);

  const executeTaskToggle = async (taskKey: string, action: 'complete' | 'uncomplete') => {
    try {
      const url = `/api/dashboard/tasks/${encodeURIComponent(taskKey)}/${action}?date=${encodeURIComponent(displayDateStr)}`;
      const headers: Record<string, string> = {
        'X-App-View': 'dashboard',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Failed to update task (${res.status})`);
      }
      void fetchDailyBrief(selectedDate);
    } catch (err: unknown) {
      console.error('Error toggling task:', err);
      alert(err instanceof Error ? err.message : 'Error updating task');
    }
  };

  const handleTaskToggle = async (taskKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Rule: Whole "Allergene eintragen" TODO item opens the allergens editor for current/past days
    if (taskKey === 'enter_allergens' || taskKey === 'allergene_eintragen') {
      if (!isCurrentOrPastDay) {
        alert(t('allergensOnlyCurrentOrPast'));
        return;
      }
      openMealAllergensEditor(e);
      return;
    }

    // Rule: "it should only be possible to mark tasks as done for a day if today is the day"
    if (!isToday) {
      alert(t('taskOnlyToday'));
      return;
    }

    const completed = isTaskCompleted(taskKey);
    if (!completed) {
      // Ask for confirmation in a modal dialog ("<task> abhaken?")
      setTaskToConfirm(taskKey);
      return;
    }

    await executeTaskToggle(taskKey, 'uncomplete');
  };

  const handleConfirmCheckOff = async () => {
    if (!taskToConfirm) return;
    const key = taskToConfirm;
    setTaskToConfirm(null);
    await executeTaskToggle(key, 'complete');
  };

  const sortedTasks = [...(data?.tasks_and_info || [])].sort((a, b) => {
    const aDone = isTaskCompleted(a);
    const bDone = isTaskCompleted(b);
    if (aDone === bDone) return 0;
    return aDone ? 1 : -1;
  });

  const renderAllergiesView = () => {
    const mealComponents: MealAllergenComponent[] = allergiesData?.meal_components || [];

    return (
      <div className="kiosk-allergies-view">
        {(allergiesData?.groups || [
          { group_id: 1, group_name: t('overviewGroup1'), allergies: [] },
          { group_id: 2, group_name: t('overviewGroup2'), allergies: [] },
          { group_id: 3, group_name: t('overviewGroup3'), allergies: [] },
        ]).map((grp) => (
          <section key={grp.group_id} className="kiosk-card kiosk-card-allergies-group">
            <div className="kiosk-card-header">
              <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
              <span>{grp.group_name}</span>
            </div>
            <div className="kiosk-allergies-list">
              {grp.allergies && grp.allergies.length > 0 ? (
                grp.allergies.map((allergy, idx) => {
                  const isFood =
                    Boolean(grp.food_allergies && grp.food_allergies.includes(allergy)) ||
                    isLebensmittelAllergen(allergy);
                  const display = getAllergenDisplayLabel(allergy);
                  const matchingComponents = findMatchingComponentsForAllergy(allergy, mealComponents);
                  const hasWarning = matchingComponents.length > 0;

                  return (
                    <div
                      key={idx}
                      className={`kiosk-allergy-item-wrapper ${hasWarning ? 'has-warning' : ''}`}
                    >
                      <span
                        className={`kiosk-allergy-badge ${hasWarning ? 'kiosk-allergy-badge-warning' : ''}`}
                        data-testid={`group-allergy-badge-${grp.group_id}-${idx}`}
                      >
                        {isFood && (
                          <span
                            className="kiosk-allergy-icon"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              marginRight: '0.45rem',
                              flexShrink: 0,
                            }}
                            data-testid={`group-allergy-icon-${grp.group_id}-${idx}`}
                          >
                            <AllergenIcon allergenKey={allergy} size={embedded ? 18 : 24} />
                          </span>
                        )}
                        <span>{display}</span>
                      </span>
                      {hasWarning && (
                        <span
                          className="kiosk-allergy-match-warning"
                          data-testid={`group-allergy-warning-${grp.group_id}-${idx}`}
                          title={matchingComponents.join(', ')}
                        >
                          <AlertTriangle size={embedded ? 14 : 18} className="kiosk-warning-icon" />
                          <span className="kiosk-warning-text">
                            {matchingComponents
                              .map((c) => abbreviateComponentName(c, 16))
                              .join(', ')}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <span className="kiosk-empty-text">{t('noAllergies')}</span>
              )}
            </div>
          </section>
        ))}

        <section className="kiosk-card kiosk-card-allergies-employees">
          <div className="kiosk-card-header">
            <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
            <span>{t('employeeAllergiesTitle')}</span>
          </div>
          <div className="kiosk-allergies-list">
            {allergiesData?.employees && allergiesData.employees.length > 0 ? (
              allergiesData.employees.map((allergy, idx) => {
                const isFood =
                  Boolean(
                    allergiesData.food_employees &&
                      allergiesData.food_employees.includes(allergy)
                  ) || isLebensmittelAllergen(allergy);
                const display = getAllergenDisplayLabel(allergy);
                const matchingComponents = findMatchingComponentsForAllergy(allergy, mealComponents);
                const hasWarning = matchingComponents.length > 0;

                return (
                  <div
                    key={idx}
                    className={`kiosk-allergy-item-wrapper ${hasWarning ? 'has-warning' : ''}`}
                  >
                    <span
                      className={`kiosk-allergy-badge kiosk-allergy-badge-employee ${hasWarning ? 'kiosk-allergy-badge-warning' : ''}`}
                      data-testid={`employee-allergy-badge-${idx}`}
                    >
                      {isFood && (
                        <span
                          className="kiosk-allergy-icon"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            marginRight: '0.45rem',
                            flexShrink: 0,
                          }}
                          data-testid={`employee-allergy-icon-${idx}`}
                        >
                          <AllergenIcon allergenKey={allergy} size={embedded ? 18 : 24} />
                        </span>
                      )}
                      <span>{display}</span>
                    </span>
                    {hasWarning && (
                      <span
                        className="kiosk-allergy-match-warning kiosk-allergy-match-warning-employee"
                        data-testid={`employee-allergy-warning-${idx}`}
                        title={matchingComponents.join(', ')}
                      >
                        <AlertTriangle size={embedded ? 14 : 18} className="kiosk-warning-icon" />
                        <span className="kiosk-warning-text">
                          {matchingComponents
                            .map((c) => abbreviateComponentName(c, 16))
                            .join(', ')}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <span className="kiosk-empty-text">{t('noAllergies')}</span>
            )}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className={`kiosk-tablet-page ${embedded ? 'embedded' : ''}`}>
      <div className="kiosk-tablet-container">
        
        {/* Content Area (taking up most of the screen space) */}
        <main
          ref={contentAreaRef}
          className={`kiosk-content-area ${isEditingAllergens ? 'editing-allergens' : ''}`}
        >
          {error && (
            <div className="kiosk-error-banner">
              <AlertCircle size={embedded ? 18 : 22} />
              <span>{error}</span>
            </div>
          )}

          {showInfoPages ? (
            <InfoPagesView
              embedded={embedded}
              activePageId={activeInfoPageId}
              onSelectPage={setActiveInfoPageId}
              onBackToDashboard={() => {
                setShowInfoPages(false);
                setActiveInfoPageId(null);
              }}
            />
          ) : isEditingAllergens ? (
            <>
              {/* Dashboard day header without < > navigation items, showing date and clear Back button */}
              <header className="kiosk-header" data-testid="kiosk-dashboard-header">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingAllergens(false);
                    void fetchDailyBrief(selectedDate);
                    void fetchAllergiesSummary(selectedDate);
                  }}
                  className="kiosk-header-back-btn"
                  data-testid="allergens-editor-back-btn"
                  title={t('back') || 'Zurück'}
                  aria-label={t('back') || 'Zurück'}
                >
                  <ArrowLeft size={embedded ? 20 : 26} />
                  <span>{t('back') || 'Zurück'}</span>
                </button>

                <h1 className="kiosk-header-date">{t('allergensForDate')} {formattedDate}</h1>

                <div className="kiosk-header-right" />
              </header>

              <MealAllergensEditor
                initialDay={{
                  ...createEmptyMealAllergenDay(displayDateStr),
                  has_allergen_record: Boolean(data?.has_allergen_record),
                  meal_components: allergenComponents,
                  plan_meal_components: data?.meal_components || [],
                  plan_cook_name: data?.who_is_cooking || '',
                }}
                hidePlanReference={true}
                isDashboard={true}
                onBack={() => {
                  setIsEditingAllergens(false);
                  void fetchDailyBrief(selectedDate);
                  void fetchAllergiesSummary(selectedDate);
                }}
                onDaySaved={() => {
                  void fetchDailyBrief(selectedDate);
                  void fetchAllergiesSummary(selectedDate);
                }}
              />
            </>
          ) : (
            <>
              {/* Header: Just centered text saying the current date, with left/right day switch arrows at the screen sides */}
              <header className="kiosk-header">
                <button
                  onClick={handlePrevDay}
                  className="kiosk-header-nav-btn left"
                  title={t('previousDay')}
                  aria-label={t('previousDay')}
                >
                  <ChevronLeft size={embedded ? 24 : 36} />
                </button>

                <h1 className="kiosk-header-date">{formattedDate}</h1>

                <button
                  onClick={handleNextDay}
                  className="kiosk-header-nav-btn right"
                  title={t('nextDay')}
                  aria-label={t('nextDay')}
                >
                  <ChevronRight size={embedded ? 24 : 36} />
                </button>
              </header>

              {/* Card 2: Shows who is cooking. Header on top left: "Koch / Köchin" */}
              <section className="kiosk-card kiosk-card-cook">
                <div className="kiosk-card-header">
                  <UtensilsCrossed size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
                  <span>{t('whoIsCooking')}</span>
                </div>
                <div className="kiosk-cook-content">
                  {data?.who_is_cooking ? (
                    data.who_is_cooking
                  ) : (
                    <span className="kiosk-empty-text">{t('noCook')}</span>
                  )}
                </div>
              </section>

              {/* Card 3: Shows the meal, with header "Es gibt:" and up to 3 meal components as lines */}
              <section className="kiosk-card kiosk-card-meal">
                <div className="kiosk-card-header">
                  <Soup size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
                  <span>{t('mealTitle')}</span>
                </div>
                <div className="kiosk-meal-lines">
                  {data?.meal_components && data.meal_components.length > 0 ? (
                    data.meal_components.slice(0, 3).map((component, idx) => (
                      <div
                        key={idx}
                        className={`kiosk-meal-line ${idx === 0 ? 'kiosk-meal-line-primary' : 'kiosk-meal-line-secondary'}`}
                      >
                        <span className="kiosk-meal-text">{component}</span>
                      </div>
                    ))
                  ) : (
                    <div className="kiosk-empty-text">{t('noMeal')}</div>
                  )}
                </div>

                {showAllergensSection && (
                  <div className="kiosk-meal-allergens-section" data-testid="kiosk-meal-allergens-section">
                    <div className="kiosk-meal-allergens-header">
                      <span>{t('componentsAndAllergensLabel')}</span>
                      {canEditAllergensOnDashboard && (
                        <button
                          type="button"
                          className="kiosk-meal-allergens-edit-btn"
                          onClick={(e) => openMealAllergensEditor(e)}
                          title={t('editMealAllergens')}
                          aria-label={t('editMealAllergens')}
                          data-testid="kiosk-edit-meal-allergens-btn"
                        >
                          <Pencil size={embedded ? 14 : 18} />
                        </button>
                      )}
                    </div>
                    {hasAllergensAdded && (
                      <div className="kiosk-meal-allergens-list" data-testid="kiosk-meal-allergens-list">
                        {allergenComponents.map((comp, idx) => (
                          <div
                            key={idx}
                            className="kiosk-allergen-comp-row"
                            data-testid={`kiosk-allergen-comp-${idx}`}
                          >
                            <span className="kiosk-allergen-comp-name">
                              {comp.name?.trim() || t('unnamedComponent')}
                            </span>
                            <div className="kiosk-allergen-comp-badges">
                              <MealComponentAllergenBadges
                                allergens={comp.allergens}
                                compIdx={idx}
                                allergiesContext={allergiesData}
                                emptyLabel={t('noAllergies')}
                                emptyClassName="kiosk-allergen-pill-none"
                                pillClassName="kiosk-allergen-pill"
                                testIdPrefix="kiosk-"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Card 4: TODOs / warnings, aligned vertically at the bottom of the content area */}
              <section className="kiosk-card kiosk-card-todos">
                <div className="kiosk-card-header">
                  <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
                  <span>{t('tasksAndInfoTitle')}</span>
                </div>
                <div className="kiosk-todos-list">
                  {sortedTasks.length > 0 ? (
                    sortedTasks.map((task, idx) => {
                      const isDone = isTaskCompleted(task);
                      const isAllergens = task === 'enter_allergens' || task === 'allergene_eintragen';
                      const isCheckable = isToday && !isAllergens;
                      const showCheckbox = isDone || isCheckable;
                      const isInteractive = isAllergens ? isCurrentOrPastDay : isToday;

                      let icon = <AlertCircle size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      const label = getTaskLabel(task);
                      let colorClass = 'kiosk-todo-default';

                      if (task === 'yellow_bin_retrieve' || task === 'yellow_bin_put_out') {
                        icon = <Trash2 size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                        colorClass = 'kiosk-todo-yellow';
                      } else if (task === 'clean_coffe_machine' || task === 'clean_coffee_machine') {
                        icon = <Coffee size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                        colorClass = 'kiosk-todo-coffee';
                      } else if (task === 'clean_refrigerator') {
                        icon = <Refrigerator size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                        colorClass = 'kiosk-todo-refrigerator';
                      } else if (isAllergens) {
                        icon = <UtensilsCrossed size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                        colorClass = 'kiosk-todo-allergens';
                      }

                      return (
                        <div
                          key={`${task}-${idx}`}
                          className={`kiosk-todo-item ${colorClass} ${isDone ? 'kiosk-todo-completed' : ''} ${!isInteractive ? 'kiosk-todo-disabled' : ''}`}
                          data-testid={`kiosk-todo-item-${task}`}
                          data-task-id={task}
                          data-completed={isDone ? 'true' : 'false'}
                          onClick={() => void handleTaskToggle(task)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleTaskToggle(task);
                            }
                          }}
                        >
                          {showCheckbox && (
                            <button
                              type="button"
                              className={`kiosk-todo-checkbox ${isDone ? 'checked' : ''} ${!isToday ? 'disabled' : ''}`}
                              data-testid={`task-checkbox-${task}`}
                              aria-label={`${label}: ${isDone ? t('taskDone') : ''}`}
                              onClick={(e) => void handleTaskToggle(task, e)}
                              disabled={!isToday}
                            >
                              {isDone && (
                                <Check size={embedded ? 14 : 20} strokeWidth={3} className="kiosk-todo-check-icon" />
                              )}
                            </button>
                          )}
                          {icon}
                          <span className="kiosk-todo-label" data-testid={`task-label-${task}`}>
                            {label}
                          </span>
                          {isAllergens && (
                            <button
                              type="button"
                              className={`kiosk-todo-open-allergens-btn ${!isCurrentOrPastDay ? 'disabled' : ''}`}
                              data-testid="open-allergens-editor-btn"
                              disabled={!isCurrentOrPastDay}
                              title={!isCurrentOrPastDay ? t('allergensOnlyCurrentOrPast') : t('openComponentsAndAllergens')}
                              onClick={(e) => openMealAllergensEditor(e)}
                            >
                              {t('openComponentsAndAllergens')}
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="kiosk-todo-empty">
                      <span>{t('noTasks')}</span>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>

        {/* Navigation bar at the bottom: max width, fixed height */}
        <footer className="kiosk-bottom-nav">
          {/* Left: Home button (house icon) + Anleitungen button + Allergien button */}
          <div className="kiosk-nav-left">
            <button
              onClick={handleHomeClick}
              className="kiosk-nav-btn kiosk-nav-home-btn"
              title={t('home')}
              aria-label={t('home')}
            >
              <Home size={embedded ? 18 : 24} />
            </button>

            <button
              onClick={handleInfoPagesClick}
              className={`kiosk-nav-btn ${showInfoPages ? 'active' : ''}`}
              title={t('infoPages')}
              data-testid="kiosk-info-pages-btn"
            >
              <span>{t('infoPages')}</span>
            </button>

            {canViewAllergiesSummary && (
              <button
                onClick={() => {
                  setIsEditingAllergens(false);
                  setShowAllergies((prev) => !prev);
                }}
                className={`kiosk-nav-btn ${showAllergies ? 'active' : ''}`}
                title={t('allergies')}
              >
                <span>{t('allergies')}</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsEditingAllergens(false);
                setShowAllergies(false);
                setShowFeedbackModal(true);
              }}
              className={`kiosk-nav-btn ${showFeedbackModal ? 'active' : ''}`}
              title={t('feedback')}
              data-testid="kiosk-feedback-btn"
            >
              <MessageSquare size={embedded ? 16 : 20} />
              <span>{t('feedback')}</span>
            </button>
          </div>

          {/* Right: Clock */}
          <div className="kiosk-nav-right">
            <div
              className="kiosk-clock"
              data-testid="kiosk-clock"
              data-wake-times={scheduledTimes.join(', ')}
              title={scheduledTimes.length > 0 ? `Screensaver-Exit: ${scheduledTimes.join(', ')}` : undefined}
            >
              {formattedTime}
            </div>
          </div>
        </footer>

        {/* Modal-ish Popover for Allergies */}
        {showAllergies && (
          <div
            className="kiosk-allergies-overlay"
            data-testid="kiosk-allergies-overlay"
            onClick={() => setShowAllergies(false)}
          >
            <div
              className="kiosk-allergies-popup"
              data-testid="kiosk-allergies-popup"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="kiosk-allergies-title"
            >
              <div className="kiosk-allergies-popup-header">
                <button
                  type="button"
                  className="kiosk-allergies-popup-back-btn"
                  data-testid="kiosk-allergies-back-btn"
                  onClick={() => setShowAllergies(false)}
                  aria-label={t('back') || 'Zurück'}
                  title={t('back') || 'Zurück'}
                >
                  <ArrowLeft size={embedded ? 18 : 22} />
                </button>
                <h2 id="kiosk-allergies-title" className="kiosk-allergies-popup-title">
                  {t('allergies')}
                </h2>
              </div>

              <div className="kiosk-allergies-popup-content">
                {renderAllergiesView()}
              </div>
            </div>
          </div>
        )}

        {/* Modal for Feedback */}
        <FeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          embedded={embedded}
          token={token}
        />

        {/* Modal for Task Confirmation */}
        <TaskConfirmModal
          isOpen={Boolean(taskToConfirm)}
          taskLabel={taskToConfirm ? getTaskLabel(taskToConfirm) : ''}
          onConfirm={() => void handleConfirmCheckOff()}
          onClose={() => setTaskToConfirm(null)}
          embedded={embedded}
        />

      </div>
    </div>
  );
};

export default KioskDashboard;
