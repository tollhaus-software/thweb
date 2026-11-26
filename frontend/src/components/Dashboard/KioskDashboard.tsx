import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../hooks/useRealtime';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useFullyKioskScreensaver } from '../../hooks/useFullyKioskScreensaver';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { t, formatDashboardDate } from '../../utils/i18n';
import { AllergenIcon } from '../MealAllergens/AllergenIcon';
import {
  MealAllergensEditor,
  MealComponentAllergenBadges,
} from '../MealAllergens/MealAllergensEditor';
import { formatDateKey } from '../../utils/mealPlan';
import {
  isLebensmittelAllergen,
  isDietPreference,
  getAllergenDisplayLabel,
  findMatchingComponentsForAllergy,
  abbreviateComponentName,
  createEmptyMealAllergenDay,
  type MealAllergenComponent,
  type AllergyCountItem,
} from '../../utils/mealAllergens';
import {
  UtensilsCrossed,
  Soup,
  Refrigerator,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Home,
  BookOpen,
  Pencil,
  Check,
  ArrowLeft,
  MessageSquare,
  Sparkles,
  ListTodo,
  Info,
} from 'lucide-react';
import { WasherIcon, DryerIcon, LaundryBinIcon, CupboardIcon } from './LaundryIcons';
import { FeedbackPanel } from './FeedbackModal';
import { TaskConfirmModal } from './TaskConfirmModal';
import { TaskInfoModal } from './TaskInfoModal';
import { InfoPagesView } from './InfoPagesView';
import './KioskDashboard.css';

export interface DashboardTodoItem {
  id: string;
  name: string;
  short_name: string;
  sort_order: number;
  color: string;
  icon: string;
  on_cooking_days: boolean;
  on_volunteer_absence: boolean;
  on_vesper_days: boolean;
  on_yellow_bag_day: boolean;
  on_day_before_yellow_bag_day: boolean;
  weekdays: number[];
  action: string;
  description_markdown: string;
}

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
  food_component_1?: string;
  food_component_2?: string;
  food_component_3?: string;
  is_vesper_day?: boolean;
  tasks_and_info: string[];
  todos?: DashboardTodoItem[];
  completed_tasks?: CompletedTaskInfo[];
  completed_task_ids?: string[];
  has_allergen_record?: boolean;
  allergen_meal_components?: MealAllergenComponent[];
  screensaver_exit_times?: string[];
  has_volunteer_absence?: boolean;
  volunteer_name?: string;
  is_current_user_cooking?: boolean;
  has_cooking_duty_today?: boolean;
}

interface GroupAllergiesSummary {
  group_id: number;
  group_name: string;
  allergies: string[];
  food_allergies?: string[];
  items?: AllergyCountItem[];
  counts?: Record<string, number>;
}

interface AllergiesSummaryData {
  date: string;
  groups: GroupAllergiesSummary[];
  employees: string[];
  food_employees?: string[];
  employee_items?: AllergyCountItem[];
  employee_counts?: Record<string, number>;
  meal_components?: MealAllergenComponent[];
}

interface RealtimeEvent {
  type?: string;
  payload?: unknown;
}

export type DashboardNavTab = 'home' | 'todos' | 'allergies' | 'infoPages' | 'feedback';

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

  // If selectedDate is null, the frontend omits the ?date parameter, requesting "today" from backend
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [todayDateStr, setTodayDateStr] = useState<string>(() => formatDateKey(new Date()));
  const [data, setData] = useState<DailyBriefData | null>(null);
  const hasCookingDutyToday = Boolean(data?.has_cooking_duty_today);
  const canEditInDashboard = !embedded || hasCookingDutyToday;
  const canEditMealAllergens =
    canEditInDashboard && (!embedded || hasPermission('meal_allergens.write'));
  const [allergiesData, setAllergiesData] = useState<AllergiesSummaryData | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardNavTab>('home');
  const [activeInfoPageId, setActiveInfoPageId] = useState<string | null>(null);
  const [taskToConfirm, setTaskToConfirm] = useState<string | null>(null);
  const [taskInfoKey, setTaskInfoKey] = useState<string | null>(null);
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

  // 5-minute polling interval
  useEffect(() => {
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const intervalId = setInterval(() => {
      void fetchDailyBrief(selectedDateRef.current);
    }, FIVE_MINUTES_MS);

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
      message?.type === 'VOLUNTEER_ABSENCE_CREATED' ||
      message?.type === 'VOLUNTEER_ABSENCE_UPDATED' ||
      message?.type === 'VOLUNTEER_ABSENCE_DELETED' ||
      message?.type === 'VOLUNTEER_ABSENCE_SETTINGS_UPDATED' ||
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

  const effectiveActiveTab: DashboardNavTab =
    activeTab === 'allergies' && !canViewAllergiesSummary ? 'home' : activeTab;

  const canChangeDate = effectiveActiveTab === 'home' && !isEditingAllergens;

  const handlePrevDay = () => {
    if (!canChangeDate) return;
    const current = getCurrentDateObj();
    current.setDate(current.getDate() - 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setActiveTab('home');
    setActiveInfoPageId(null);
    setIsEditingAllergens(false);
    setTaskToConfirm(null);
    setTaskInfoKey(null);
    setSelectedDate(`${y}-${m}-${d}`);
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  };

  const handleNextDay = () => {
    if (!canChangeDate) return;
    const current = getCurrentDateObj();
    current.setDate(current.getDate() + 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setActiveTab('home');
    setActiveInfoPageId(null);
    setIsEditingAllergens(false);
    setTaskToConfirm(null);
    setTaskInfoKey(null);
    setSelectedDate(`${y}-${m}-${d}`);
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  };

  const resetDashboardToToday = useCallback(() => {
    setActiveTab('home');
    setActiveInfoPageId(null);
    setTaskToConfirm(null);
    setTaskInfoKey(null);
    setIsEditingAllergens(false);
    setSelectedDate(null); // Omitting date fetches "today" from backend
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, []);

  const handleHomeNavClick = useCallback(() => {
    if (activeTab === 'home' && !isEditingAllergens) {
      setSelectedDate(null);
    } else {
      setIsEditingAllergens(false);
      setTaskToConfirm(null);
      setTaskInfoKey(null);
      setActiveInfoPageId(null);
      setActiveTab('home');
    }
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, [activeTab, isEditingAllergens]);

  const handleSelectTab = useCallback((tab: DashboardNavTab) => {
    setIsEditingAllergens(false);
    setTaskToConfirm(null);
    setTaskInfoKey(null);
    if (tab === 'infoPages') {
      setActiveInfoPageId(null);
    }
    setActiveTab(tab);
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, []);

  const effectiveIdleTimeoutMs =
    idleTimeoutMs ??
    (typeof window !== 'undefined'
      ? (window as unknown as { __TEST_IDLE_TIMEOUT_MS__?: number }).__TEST_IDLE_TIMEOUT_MS__
      : undefined) ??
    5 * 60 * 1000;

  useIdleTimer({
    timeoutMs: effectiveIdleTimeoutMs,
    onIdle: resetDashboardToToday,
    enabled: true,
    throttleMs: 5000,
  });

  const handleScreensaverWake = useCallback(() => {
    resetDashboardToToday();
    void fetchDailyBrief(null);
  }, [resetDashboardToToday, fetchDailyBrief]);

  const { scheduledTimes } = useFullyKioskScreensaver({
    serverTimes: data?.screensaver_exit_times,
    currentTime,
    onWake: handleScreensaverWake,
    enabled: true,
  });

  const isSwipeDisabled = !canChangeDate || Boolean(taskToConfirm) || Boolean(taskInfoKey);

  useSwipeGesture(contentAreaRef, {
    onSwipeLeft: handleNextDay,
    onSwipeRight: handlePrevDay,
    enabled: !isSwipeDisabled,
  });

  const displayDateStr = (data?.date || selectedDate || todayDateStr).split('T')[0];
  const isToday = selectedDate === null || displayDateStr === todayDateStr;
  const canEditAllergensOnDashboard = canEditMealAllergens;
  const formattedDate = formatDashboardDate(displayDateStr);
  const displayDateParts = displayDateStr.split('-').map(Number);
  const displayDateObj =
    displayDateParts.length === 3 &&
    !isNaN(displayDateParts[0]) &&
    !isNaN(displayDateParts[1]) &&
    !isNaN(displayDateParts[2])
      ? new Date(displayDateParts[0], displayDateParts[1] - 1, displayDateParts[2])
      : new Date(displayDateStr);
  const displayDayOfWeek = displayDateObj.getDay();
  const isVesperDay = data?.is_vesper_day ?? (displayDayOfWeek === 3 || displayDayOfWeek === 4);
  const hasExplicitFoodComponents =
    data?.food_component_1 !== undefined ||
    data?.food_component_2 !== undefined ||
    data?.food_component_3 !== undefined;
  const mealComp1 = hasExplicitFoodComponents
    ? (data?.food_component_1 || '').trim()
    : (data?.meal_components?.[0] || '').trim();
  const mealComp2 = hasExplicitFoodComponents
    ? (data?.food_component_2 || '').trim()
    : (data?.meal_components?.[1] || '').trim();
  const mealComp3 = hasExplicitFoodComponents
    ? (data?.food_component_3 || '').trim()
    : (data?.meal_components?.[2] || '').trim();
  const nonVesperComponents = [mealComp1, mealComp2].filter((c) => c.length > 0);
  const vesperPrefixStr = t('vesperPrefix') || 'Vesper: ';
  const vesperLineText =
    mealComp3.length > 0
      ? /^vesper\s*:/i.test(mealComp3)
        ? mealComp3.replace(/^vesper\s*:\s*/i, vesperPrefixStr)
        : `${vesperPrefixStr}${mealComp3}`
      : isVesperDay && nonVesperComponents.length > 0
      ? t('vesperMissingOnDay') || 'Vesper: Noch keines eingetragen!'
      : '';
  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  const openMealAllergensEditor = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!canEditAllergensOnDashboard) {
      return;
    }
    setTaskToConfirm(null);
    setTaskInfoKey(null);
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

  const normalizeTaskKey = useCallback((taskKey: string): string => {
    if (
      taskKey === 'Morgens: Wäsche in den Trockner' ||
      taskKey === 'Wäsche in den Trockner' ||
      taskKey === 'start_dryer'
    ) {
      return 'start_dryer';
    }
    if (
      taskKey === 'Nachmittags: Wäsche in die Waschmaschine' ||
      taskKey === 'Wäsche in die Waschmaschine' ||
      taskKey === 'start_washer'
    ) {
      return 'start_washer';
    }
    if (
      taskKey === 'Möglichst spät: Windeleimer Tüte wechseln' ||
      taskKey === 'Windeleimer Tüte wechseln' ||
      taskKey === 'change_diaper_bag' ||
      taskKey === 'change_diaper_bin_bag'
    ) {
      return 'change_diaper_bag';
    }
    if (
      taskKey === 'Trockene Wäsche falten und einräumen' ||
      taskKey === 'Trockene Wäsche falten und einträumen' ||
      taskKey === 'fold_laundry'
    ) {
      return 'fold_laundry';
    }
    if (
      taskKey === 'clean_dishwasher_filter' ||
      taskKey === 'Spülmaschine - Filter reinigen' ||
      taskKey === 'Spülmaschine-Filter reinigen'
    ) {
      return 'clean_dishwasher_filter';
    }
    if (
      taskKey === 'serve_small_group' ||
      taskKey === 'Kleine Gruppe servieren' ||
      taskKey === 'Kleine Gruppe servieren (auf 11:45)'
    ) {
      return 'serve_small_group';
    }
    if (
      taskKey === 'serve_large_group' ||
      taskKey === 'Große Gruppe servieren' ||
      taskKey === 'Große Gruppe servieren (auf 12:00)'
    ) {
      return 'serve_large_group';
    }
    if (
      taskKey === 'serve_hort' ||
      taskKey === 'Hort servieren' ||
      taskKey === 'Hort servieren (meist auf 13:00)'
    ) {
      return 'serve_hort';
    }
    return taskKey;
  }, []);

  const isTaskCompleted = useCallback(
    (taskKey: string): boolean => {
      if (!data) return false;
      const normalized = normalizeTaskKey(taskKey);
      if (
        data.completed_task_ids &&
        (data.completed_task_ids.includes(taskKey) || data.completed_task_ids.includes(normalized))
      ) {
        return true;
      }
      if (
        data.completed_tasks &&
        data.completed_tasks.some((ct) => ct.task_type_id === taskKey || ct.task_type_id === normalized)
      ) {
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
    [data, normalizeTaskKey]
  );

  const findTodoDef = useCallback(
    (taskKey: string): DashboardTodoItem | undefined => {
      if (!data?.todos) return undefined;
      const normalized = normalizeTaskKey(taskKey);
      return data.todos.find(
        (td) => td.id === taskKey || td.id === normalized || normalizeTaskKey(td.id) === normalized
      );
    },
    [data?.todos, normalizeTaskKey]
  );

  const getTaskLabel = useCallback(
    (taskKey: string): string => {
      const todoDef = findTodoDef(taskKey);
      if (todoDef && todoDef.name) {
        return todoDef.name;
      }
      if (taskKey === 'yellow_bin_retrieve') {
        return t('yellowBinRetrieve');
      } else if (taskKey === 'yellow_bin_put_out') {
        return t('yellowBinPutOut');
      } else if (taskKey === 'clean_refrigerator') {
        return t('cleanRefrigerator');
      } else if (
        taskKey === 'clean_dishwasher_filter' ||
        taskKey === 'Spülmaschine - Filter reinigen' ||
        taskKey === 'Spülmaschine-Filter reinigen'
      ) {
        return t('cleanDishwasherFilter');
      } else if (taskKey === 'enter_allergens' || taskKey === 'allergene_eintragen') {
        return t('enterAllergens');
      } else if (taskKey === 'start_dryer' || taskKey === 'Morgens: Wäsche in den Trockner') {
        return t('taskStartDryer');
      } else if (taskKey === 'start_washer' || taskKey === 'Nachmittags: Wäsche in die Waschmaschine') {
        return t('taskStartWasher');
      } else if (
        taskKey === 'change_diaper_bag' ||
        taskKey === 'change_diaper_bin_bag' ||
        taskKey === 'Möglichst spät: Windeleimer Tüte wechseln'
      ) {
        return t('taskChangeDiaperBag');
      } else if (
        taskKey === 'fold_laundry' ||
        taskKey === 'Trockene Wäsche falten und einräumen' ||
        taskKey === 'Trockene Wäsche falten und einträumen'
      ) {
        return t('taskFoldLaundry');
      } else if (
        taskKey === 'serve_small_group' ||
        taskKey === 'Kleine Gruppe servieren' ||
        taskKey === 'Kleine Gruppe servieren (auf 11:45)'
      ) {
        return t('serveSmallGroup');
      } else if (
        taskKey === 'serve_large_group' ||
        taskKey === 'Große Gruppe servieren' ||
        taskKey === 'Große Gruppe servieren (auf 12:00)'
      ) {
        return t('serveLargeGroup');
      } else if (
        taskKey === 'serve_hort' ||
        taskKey === 'Hort servieren' ||
        taskKey === 'Hort servieren (meist auf 13:00)'
      ) {
        return t('serveHort');
      }
      return t(taskKey);
    },
    [findTodoDef]
  );

  const getTaskName = useCallback(
    (taskKey: string): string => {
      const todoDef = findTodoDef(taskKey);
      if (todoDef && (todoDef.short_name || todoDef.name)) {
        return todoDef.short_name || todoDef.name;
      }
      const normalized = normalizeTaskKey(taskKey);
      if (normalized === 'start_dryer') {
        return t('taskStartDryerName');
      } else if (normalized === 'start_washer') {
        return t('taskStartWasherName');
      } else if (normalized === 'change_diaper_bag') {
        return t('taskChangeDiaperBagName');
      } else if (normalized === 'fold_laundry') {
        return t('taskFoldLaundryName');
      } else if (normalized === 'yellow_bin_retrieve') {
        return t('yellowBinRetrieve');
      } else if (normalized === 'yellow_bin_put_out') {
        return t('yellowBinPutOut');
      } else if (normalized === 'clean_refrigerator') {
        return t('cleanRefrigerator');
      } else if (normalized === 'clean_dishwasher_filter') {
        return t('cleanDishwasherFilter');
      } else if (normalized === 'serve_small_group') {
        return t('serveSmallGroupName');
      } else if (normalized === 'serve_large_group') {
        return t('serveLargeGroupName');
      } else if (normalized === 'serve_hort') {
        return t('serveHortName');
      } else if (normalized === 'enter_allergens' || normalized === 'allergene_eintragen') {
        return t('enterAllergens');
      }

      const label = getTaskLabel(taskKey);
      const colonIdx = label.indexOf(':');
      if (colonIdx !== -1 && colonIdx < label.length - 1) {
        return label.slice(colonIdx + 1).trim();
      }
      return label;
    },
    [findTodoDef, normalizeTaskKey, getTaskLabel]
  );

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
    if (!canEditInDashboard) {
      return;
    }
    // Rule: Whole "Allergene eintragen" TODO item opens the allergens editor
    const todoDef = findTodoDef(taskKey);
    const isAllergensAction =
      todoDef?.action === 'fill_allergens' ||
      taskKey === 'enter_allergens' ||
      taskKey === 'allergene_eintragen';
    if (isAllergensAction) {
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

  const getTaskInfoContent = useCallback(
    (taskKey: string): string => {
      const todoDef = findTodoDef(taskKey);
      if (todoDef && todoDef.description_markdown && todoDef.description_markdown.trim().length > 0) {
        return todoDef.description_markdown;
      }
      const normalized = normalizeTaskKey(taskKey);
      if (normalized === 'serve_small_group') {
        return t('serveSmallGroupInfo');
      }
      if (normalized === 'serve_large_group') {
        return t('serveLargeGroupInfo');
      }
      if (normalized === 'serve_hort') {
        return t('serveHortInfo');
      }
      return t('taskInfoPlaceholder');
    },
    [findTodoDef, normalizeTaskKey]
  );

  const getTaskOrderIndex = useCallback(
    (taskKey: string): number => {
      const todoDef = findTodoDef(taskKey);
      if (todoDef && typeof todoDef.sort_order === 'number') {
        return todoDef.sort_order;
      }
      const normalized = normalizeTaskKey(taskKey);
      switch (normalized) {
        case 'enter_allergens':
        case 'allergene_eintragen':
          return 100;
        case 'start_dryer':
          return 200;
        case 'fold_laundry':
          return 300;
        case 'serve_small_group':
          return 350;
        case 'serve_large_group':
          return 360;
        case 'serve_hort':
          return 370;
        case 'start_washer':
          return 400;
        case 'change_diaper_bag':
          return 500;
        case 'yellow_bin_retrieve':
          return 600;
        case 'yellow_bin_put_out':
          return 650;
        case 'clean_refrigerator':
          return 700;
        case 'clean_dishwasher_filter':
          return 800;
        default:
          return 999;
      }
    },
    [findTodoDef, normalizeTaskKey]
  );

  const sortedTasks = [...(data?.tasks_and_info || [])].sort((a, b) => {
    const aDone = isTaskCompleted(a);
    const bDone = isTaskCompleted(b);
    if (aDone !== bDone) {
      return aDone ? 1 : -1;
    }
    const aOrder = getTaskOrderIndex(a);
    const bOrder = getTaskOrderIndex(b);
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.localeCompare(b);
  });

  const totalTasksCount = sortedTasks.length;
  const doneTasksCount = sortedTasks.filter((task) => isTaskCompleted(task)).length;
  const todosNavLabel = `${t('todosNav')} (${doneTasksCount}/${totalTasksCount})`;

  const renderAllergiesView = () => {
    const mealComponents: MealAllergenComponent[] = allergiesData?.meal_components || [];

    return (
      <div className="kiosk-allergies-view">
        {(allergiesData?.groups || [
          { group_id: 1, group_name: t('overviewGroup1'), allergies: [] },
          { group_id: 2, group_name: t('overviewGroup2'), allergies: [] },
          { group_id: 3, group_name: t('overviewGroup3'), allergies: [] },
        ]).map((grp) => {
          const groupEntries =
            grp.items && grp.items.length > 0
              ? grp.items
              : (grp.allergies || []).map((name) => ({
                  name,
                  count: grp.counts?.[name] || 1,
                  category: isDietPreference(name)
                    ? 'ernaehrung'
                    : isLebensmittelAllergen(name)
                    ? 'lebensmittel'
                    : 'andere',
                  is_food: isLebensmittelAllergen(name),
                }));

          return (
            <section key={grp.group_id} className="kiosk-card kiosk-card-allergies-group">
              <div className="kiosk-card-header">
                <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
                <span>{grp.group_name}</span>
              </div>
              <div className="kiosk-allergies-list">
                {groupEntries && groupEntries.length > 0 ? (
                  groupEntries.map((entry: AllergyCountItem, idx: number) => {
                    const isDiet = entry.category === 'ernaehrung' || isDietPreference(entry.name);
                    const isFood =
                      entry.is_food ??
                      (Boolean(grp.food_allergies && grp.food_allergies.includes(entry.name)) ||
                        isLebensmittelAllergen(entry.name));
                    const display = getAllergenDisplayLabel(entry.name);
                    const count = entry.count || grp.counts?.[entry.name] || 1;
                    const matchingComponents = isFood
                      ? findMatchingComponentsForAllergy(entry.name, mealComponents)
                      : [];
                    const hasWarning = matchingComponents.length > 0;

                    return (
                      <div
                        key={idx}
                        className={`kiosk-allergy-item-wrapper ${hasWarning ? 'has-warning' : ''}`}
                      >
                        <span
                          className={`kiosk-allergy-badge ${isDiet ? 'kiosk-allergy-badge-diet' : ''} ${hasWarning ? 'kiosk-allergy-badge-warning' : ''}`}
                          data-testid={`group-allergy-badge-${grp.group_id}-${idx}`}
                        >
                          {isDiet && (
                            <span
                              className="kiosk-allergy-icon kiosk-diet-icon"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                marginRight: '0.45rem',
                                fontSize: embedded ? '1.1rem' : '1.3rem',
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                              data-testid={`group-diet-icon-${grp.group_id}-${idx}`}
                            >
                              {entry.name.toLowerCase() === 'vegan' ? '🌱' : '🥦'}
                            </span>
                          )}
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
                              <AllergenIcon allergenKey={entry.name} size={embedded ? 18 : 24} />
                            </span>
                          )}
                          <span>{display}</span>
                          {count > 0 && (
                            <span
                              className="kiosk-allergy-count"
                              data-testid={`group-allergy-count-${grp.group_id}-${idx}`}
                            >
                              ({count})
                            </span>
                          )}
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
          );
        })}

        <section className="kiosk-card kiosk-card-allergies-employees">
          <div className="kiosk-card-header">
            <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
            <span>{t('employeeAllergiesTitle')}</span>
          </div>
          <div className="kiosk-allergies-list">
            {(allergiesData?.employee_items && allergiesData.employee_items.length > 0) ||
            (allergiesData?.employees && allergiesData.employees.length > 0) ? (
              (allergiesData?.employee_items && allergiesData.employee_items.length > 0
                ? allergiesData.employee_items
                : (allergiesData?.employees || []).map((name) => ({
                    name,
                    count: allergiesData?.employee_counts?.[name] || 1,
                    category: isDietPreference(name)
                      ? 'ernaehrung'
                      : isLebensmittelAllergen(name)
                      ? 'lebensmittel'
                      : 'andere',
                    is_food: isLebensmittelAllergen(name),
                  }))
              ).map((entry: AllergyCountItem, idx: number) => {
                const isDiet = entry.category === 'ernaehrung' || isDietPreference(entry.name);
                const isFood =
                  entry.is_food ??
                  (Boolean(
                    allergiesData?.food_employees &&
                      allergiesData.food_employees.includes(entry.name)
                  ) || isLebensmittelAllergen(entry.name));
                const display = getAllergenDisplayLabel(entry.name);
                const count = entry.count || (allergiesData as any)?.employee_counts?.[entry.name] || 1;
                const matchingComponents = isFood
                  ? findMatchingComponentsForAllergy(entry.name, mealComponents)
                  : [];
                const hasWarning = matchingComponents.length > 0;

                return (
                  <div
                    key={idx}
                    className={`kiosk-allergy-item-wrapper ${hasWarning ? 'has-warning' : ''}`}
                  >
                    <span
                      className={`kiosk-allergy-badge kiosk-allergy-badge-employee ${isDiet ? 'kiosk-allergy-badge-diet' : ''} ${hasWarning ? 'kiosk-allergy-badge-warning' : ''}`}
                      data-testid={`employee-allergy-badge-${idx}`}
                    >
                      {isDiet && (
                        <span
                          className="kiosk-allergy-icon kiosk-diet-icon"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            marginRight: '0.45rem',
                            fontSize: embedded ? '1.1rem' : '1.3rem',
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                          data-testid={`employee-diet-icon-${idx}`}
                        >
                          {entry.name.toLowerCase() === 'vegan' ? '🌱' : '🥦'}
                        </span>
                      )}
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
                          <AllergenIcon allergenKey={entry.name} size={embedded ? 18 : 24} />
                        </span>
                      )}
                      <span>{display}</span>
                      {count > 0 && (
                        <span
                          className="kiosk-allergy-count"
                          data-testid={`employee-allergy-count-${idx}`}
                        >
                          ({count})
                        </span>
                      )}
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
        {/* Header: Centered date (or allergens editor title + back button) */}
        <header className="kiosk-header" data-testid="kiosk-dashboard-header">
          {isEditingAllergens ? (
            <>
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

              <h1 className="kiosk-header-date">
                <span className="kiosk-header-date-text">
                  {t('allergensForDate')} {formattedDate}
                </span>
              </h1>

              <div className="kiosk-header-right" />
            </>
          ) : (
            <>
              {canChangeDate ? (
                <button
                  onClick={handlePrevDay}
                  className="kiosk-header-nav-btn left"
                  title={t('previousDay')}
                  aria-label={t('previousDay')}
                >
                  <ChevronLeft size={embedded ? 24 : 36} />
                </button>
              ) : (
                <div className="kiosk-header-right" />
              )}

              <h1 className="kiosk-header-date">
                <span className="kiosk-header-date-text">{formattedDate}</span>
              </h1>

              {canChangeDate ? (
                <button
                  onClick={handleNextDay}
                  className="kiosk-header-nav-btn right"
                  title={t('nextDay')}
                  aria-label={t('nextDay')}
                >
                  <ChevronRight size={embedded ? 24 : 36} />
                </button>
              ) : (
                <div className="kiosk-header-right" />
              )}
            </>
          )}
        </header>

        {/* Content Area (displayed between header (date) and footer (nav buttons)) */}
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

          {isEditingAllergens ? (
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
          ) : effectiveActiveTab === 'home' ? (
            <>
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
                <div className="kiosk-meal-card-content">
                  <div className="kiosk-meal-lines">
                    {nonVesperComponents.length > 0 ? (
                      nonVesperComponents.map((component, idx) => (
                        <div
                          key={idx}
                          className={`kiosk-meal-line ${idx === 0 ? 'kiosk-meal-line-primary' : 'kiosk-meal-line-secondary'}`}
                        >
                          <span className="kiosk-meal-text">{component}</span>
                        </div>
                      ))
                    ) : mealComp3.length === 0 ? (
                      <div className="kiosk-empty-text">{t('noMeal')}</div>
                    ) : null}
                    {vesperLineText && (
                      <div
                        className="kiosk-meal-line kiosk-meal-line-secondary"
                        data-testid="kiosk-meal-vesper-line"
                      >
                        <span className="kiosk-meal-text">{vesperLineText}</span>
                      </div>
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
                </div>
              </section>

              {data?.has_volunteer_absence && (
                <div
                  className="kiosk-bufdi-warning"
                  data-testid="kiosk-bufdi-absence-warning"
                  role="status"
                >
                  <AlertTriangle
                    size={embedded ? 20 : 28}
                    className="kiosk-bufdi-warning-icon"
                    aria-hidden="true"
                  />
                  <span className="kiosk-bufdi-warning-text">
                    {t('bufdiNotInHouseToday').replace(
                      '{name}',
                      (data.volunteer_name || 'BuFDI').trim() || 'BuFDI'
                    )}
                  </span>
                </div>
              )}
            </>
          ) : effectiveActiveTab === 'todos' ? (
            <section className="kiosk-card kiosk-card-todos">
              <div className="kiosk-card-header">
                <AlertCircle size={embedded ? 18 : 22} className="kiosk-card-header-icon" />
                <span>
                  {data?.has_volunteer_absence
                    ? `${t('tasksAndInfoTitle')} - ! ${(data.volunteer_name || 'BuFDI').trim() || 'BuFDI'} nicht im Haus !`
                    : t('tasksAndInfoTitle')}
                </span>
              </div>
              <div className="kiosk-todos-list">
                {sortedTasks.length > 0 ? (
                  sortedTasks.map((task, idx) => {
                    const todoDef = findTodoDef(task);
                    const isDone = isTaskCompleted(task);
                    const isAllergens = todoDef
                      ? todoDef.action === 'fill_allergens'
                      : task === 'enter_allergens' || task === 'allergene_eintragen';
                    const isCheckable = isToday && canEditInDashboard;
                    const showCheckbox = isDone || isCheckable;
                    const isInteractive = isAllergens ? canEditAllergensOnDashboard : isCheckable;

                    const normalized = normalizeTaskKey(task);
                    const label = getTaskLabel(task);
                    const isServingTask =
                      normalized === 'serve_small_group' ||
                      normalized === 'serve_large_group' ||
                      normalized === 'serve_hort';
                    const hasInfoContent = todoDef
                      ? Boolean(todoDef.description_markdown && todoDef.description_markdown.trim().length > 0)
                      : isServingTask;
                    const isLaundryTask =
                      normalized === 'start_dryer' ||
                      normalized === 'start_washer' ||
                      normalized === 'fold_laundry' ||
                      /waschmaschine|trockner|wäsche/i.test(task) ||
                      /waschmaschine|trockner|wäsche/i.test(label);

                    let icon: React.ReactNode = (
                      <AlertCircle size={embedded ? 20 : 28} className="kiosk-todo-icon" />
                    );
                    let colorClass = 'kiosk-todo-default';

                    if (todoDef) {
                      const validColors = new Set([
                        'default',
                        'allergens',
                        'yellow',
                        'refrigerator',
                        'dishwasher',
                        'serving',
                        'laundry',
                        'diaper',
                      ]);
                      const c = (todoDef.color || 'default').toLowerCase();
                      colorClass = validColors.has(c) ? `kiosk-todo-${c}` : 'kiosk-todo-default';

                      const iconKey = (todoDef.icon || '').toLowerCase();
                      const iconSize = embedded ? 20 : 28;
                      if (!iconKey || iconKey === 'none') {
                        icon = null;
                      } else if (iconKey === 'trash') {
                        icon = <Trash2 size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'refrigerator') {
                        icon = <Refrigerator size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'sparkles') {
                        icon = <Sparkles size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'washer') {
                        icon = <WasherIcon size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'dryer') {
                        icon = <DryerIcon size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'laundry_bin') {
                        icon = <LaundryBinIcon size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'cupboard') {
                        icon = <CupboardIcon size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'utensils') {
                        icon = <UtensilsCrossed size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'soup') {
                        icon = <Soup size={iconSize} className="kiosk-todo-icon" />;
                      } else if (iconKey === 'alert') {
                        icon = <AlertCircle size={iconSize} className="kiosk-todo-icon" />;
                      } else {
                        icon = null;
                      }
                    } else if (normalized === 'yellow_bin_retrieve' || normalized === 'yellow_bin_put_out') {
                      icon = <Trash2 size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      colorClass = 'kiosk-todo-yellow';
                    } else if (normalized === 'clean_refrigerator') {
                      icon = <Refrigerator size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      colorClass = 'kiosk-todo-refrigerator';
                    } else if (normalized === 'clean_dishwasher_filter') {
                      icon = <Sparkles size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      colorClass = 'kiosk-todo-dishwasher';
                    } else if (isAllergens) {
                      icon = null;
                      colorClass = 'kiosk-todo-allergens';
                    } else if (isServingTask) {
                      icon = null;
                      colorClass = 'kiosk-todo-serving';
                    } else if (isLaundryTask) {
                      icon = <WasherIcon size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      colorClass = 'kiosk-todo-laundry';
                    } else if (normalized === 'change_diaper_bag') {
                      icon = <Trash2 size={embedded ? 20 : 28} className="kiosk-todo-icon" />;
                      colorClass = 'kiosk-todo-diaper';
                    }

                    return (
                      <div
                        key={`${task}-${idx}`}
                        className={`kiosk-todo-item ${colorClass} ${isDone ? 'kiosk-todo-completed' : ''} ${!isInteractive ? 'kiosk-todo-disabled' : ''}`}
                        data-testid={`kiosk-todo-item-${normalized}`}
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
                            className={`kiosk-todo-checkbox ${isDone ? 'checked' : ''} ${!isCheckable ? 'disabled' : ''}`}
                            data-testid={`task-checkbox-${normalized}`}
                            aria-label={`${label}: ${isDone ? t('taskDone') : ''}`}
                            onClick={(e) => void handleTaskToggle(task, e)}
                            disabled={!isCheckable}
                          >
                            {isDone && (
                              <Check size={embedded ? 14 : 20} strokeWidth={3} className="kiosk-todo-check-icon" />
                            )}
                          </button>
                        )}
                        {icon}
                        <span className="kiosk-todo-label" data-testid={`task-label-${normalized}`}>
                          {label}
                        </span>
                        {isAllergens && canEditAllergensOnDashboard && (
                          <button
                            type="button"
                            className="kiosk-todo-open-allergens-btn"
                            data-testid="open-allergens-editor-btn"
                            title={t('openComponentsAndAllergens')}
                            aria-label={t('openComponentsAndAllergens')}
                            onClick={(e) => openMealAllergensEditor(e)}
                          >
                            <Pencil size={embedded ? 16 : 22} className="kiosk-todo-icon" />
                          </button>
                        )}
                        {hasInfoContent && (
                          <button
                            type="button"
                            className="kiosk-todo-info-btn"
                            data-testid={`task-info-btn-${normalized}`}
                            title={`${label} – ${t('taskFurtherInfo')}`}
                            aria-label={`${label} – ${t('taskFurtherInfo')}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskInfoKey(task);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Info size={embedded ? 18 : 24} className="kiosk-todo-icon" />
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
          ) : effectiveActiveTab === 'allergies' ? (
            <div className="kiosk-tab-scroll-view" data-testid="kiosk-allergies-section">
              {renderAllergiesView()}
            </div>
          ) : effectiveActiveTab === 'infoPages' ? (
            <InfoPagesView
              embedded={embedded}
              activePageId={activeInfoPageId}
              onSelectPage={setActiveInfoPageId}
            />
          ) : (
            <div className="kiosk-tab-scroll-view">
              <FeedbackPanel embedded={embedded} token={token} />
            </div>
          )}
        </main>

        {/* Navigation bar at the bottom: max width, fixed height */}
        <footer className="kiosk-bottom-nav">
          {/* Left: Home + TODOs (done/total) + Allergien/Ernährung + Anleitungen + Feedback */}
          <div className="kiosk-nav-left">
            <button
              onClick={handleHomeNavClick}
              className={`kiosk-nav-btn kiosk-nav-home-btn ${effectiveActiveTab === 'home' ? 'active' : ''}`}
              data-active={effectiveActiveTab === 'home' ? 'true' : 'false'}
              aria-current={effectiveActiveTab === 'home' ? 'page' : undefined}
              title={t('home')}
              aria-label={t('home')}
              data-testid="kiosk-home-btn"
            >
              <Home size={embedded ? 18 : 24} />
            </button>

            <button
              onClick={() => handleSelectTab('todos')}
              className={`kiosk-nav-btn ${effectiveActiveTab === 'todos' ? 'active' : ''}`}
              data-active={effectiveActiveTab === 'todos' ? 'true' : 'false'}
              aria-current={effectiveActiveTab === 'todos' ? 'page' : undefined}
              title={todosNavLabel}
              aria-label={todosNavLabel}
              data-testid="kiosk-todos-btn"
            >
              <ListTodo size={embedded ? 16 : 20} />
              <span>{todosNavLabel}</span>
            </button>

            {canViewAllergiesSummary && (
              <button
                onClick={() => handleSelectTab('allergies')}
                className={`kiosk-nav-btn ${effectiveActiveTab === 'allergies' ? 'active' : ''}`}
                data-active={effectiveActiveTab === 'allergies' ? 'true' : 'false'}
                aria-current={effectiveActiveTab === 'allergies' ? 'page' : undefined}
                title={t('allergies')}
                aria-label={t('allergies')}
                data-testid="kiosk-allergies-btn"
              >
                <UtensilsCrossed size={embedded ? 16 : 20} />
                <span>{t('allergies')}</span>
              </button>
            )}

            <button
              onClick={() => handleSelectTab('infoPages')}
              className={`kiosk-nav-btn ${effectiveActiveTab === 'infoPages' ? 'active' : ''}`}
              data-active={effectiveActiveTab === 'infoPages' ? 'true' : 'false'}
              aria-current={effectiveActiveTab === 'infoPages' ? 'page' : undefined}
              title={t('infoPages')}
              aria-label={t('infoPages')}
              data-testid="kiosk-info-pages-btn"
            >
              <BookOpen size={embedded ? 18 : 22} />
            </button>

            <button
              onClick={() => handleSelectTab('feedback')}
              className={`kiosk-nav-btn ${effectiveActiveTab === 'feedback' ? 'active' : ''}`}
              data-active={effectiveActiveTab === 'feedback' ? 'true' : 'false'}
              aria-current={effectiveActiveTab === 'feedback' ? 'page' : undefined}
              title={t('feedback')}
              aria-label={t('feedback')}
              data-testid="kiosk-feedback-btn"
            >
              <MessageSquare size={embedded ? 18 : 22} />
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

        {/* Modal for Task Confirmation */}
        <TaskConfirmModal
          isOpen={Boolean(taskToConfirm)}
          taskLabel={taskToConfirm ? getTaskName(taskToConfirm) : ''}
          onConfirm={() => void handleConfirmCheckOff()}
          onClose={() => setTaskToConfirm(null)}
          embedded={embedded}
        />

        {/* Modal for Task Further Information */}
        <TaskInfoModal
          isOpen={Boolean(taskInfoKey)}
          taskTitle={taskInfoKey ? getTaskName(taskInfoKey) : ''}
          infoText={taskInfoKey ? getTaskInfoContent(taskInfoKey) : ''}
          onClose={() => setTaskInfoKey(null)}
          embedded={embedded}
        />
      </div>
    </div>
  );
};

export default KioskDashboard;
