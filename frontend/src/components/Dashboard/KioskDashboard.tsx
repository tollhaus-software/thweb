import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../hooks/useRealtime';
import { t, formatDashboardDate } from '../../utils/i18n';
import {
  UtensilsCrossed,
  Soup,
  Coffee,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Home,
} from 'lucide-react';
import './KioskDashboard.css';

interface DailyBriefData {
  date: string;
  who_is_cooking: string;
  meal_components: string[];
  tasks_and_info: string[];
}

interface RealtimeEvent {
  type?: string;
  payload?: unknown;
}

export interface KioskDashboardProps {
  onBackToPortal?: () => void;
}

export const KioskDashboard: React.FC<KioskDashboardProps> = () => {
  const { token } = useAuth();

  // If selectedDate is null, the frontend omits the ?date parameter, requesting "today" from backend
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<DailyBriefData | null>(null);
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

  const fetchDailyBrief = useCallback(async (dateParam: string | null) => {
    try {
      const url = dateParam
        ? `/api/dashboard/daily-brief?date=${encodeURIComponent(dateParam)}`
        : `/api/dashboard/daily-brief`;

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch daily brief (${res.status} ${res.statusText})`);
      }

      const result: DailyBriefData = await res.json();
      setData(result);
      setError(null);
    } catch (err: unknown) {
      console.error('Error fetching daily brief:', err);
      const msg = err instanceof Error ? err.message : 'Error loading daily brief';
      setError(msg);
    }
  }, [token]);

  // Initial fetch and fetch when selectedDate changes
  useEffect(() => {
    let ignore = false;
    const runFetch = async () => {
      try {
        const url = selectedDate
          ? `/api/dashboard/daily-brief?date=${encodeURIComponent(selectedDate)}`
          : `/api/dashboard/daily-brief`;

        const headers: Record<string, string> = {};
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
      message?.type === 'MEAL_PLAN_UPDATED' ||
      message?.type === 'YELLOW_BAG_DAYS_UPDATED' ||
      message?.type === 'INVALIDATE'
    ) {
      void fetchDailyBrief(selectedDateRef.current);
    }
  }, [fetchDailyBrief]);

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
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleNextDay = () => {
    const current = getCurrentDateObj();
    current.setDate(current.getDate() + 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleHomeClick = () => {
    setSelectedDate(null); // Omitting date fetches "today" from backend
  };

  const displayDateStr = data?.date || selectedDate || new Date().toISOString().split('T')[0];
  const formattedDate = formatDashboardDate(displayDateStr);
  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  return (
    <div className="kiosk-tablet-page">
      <div className="kiosk-tablet-container">
        
        {/* Content Area (taking up most of the screen space) */}
        <main className="kiosk-content-area">
          {error && (
            <div className="kiosk-error-banner">
              <AlertCircle size={24} />
              <span>{error}</span>
            </div>
          )}

          {/* Header: Just centered text saying the current date, with left/right day switch arrows at the screen sides */}
          <header className="kiosk-header">
            <button
              onClick={handlePrevDay}
              className="kiosk-header-nav-btn left"
              title={t('previousDay')}
              aria-label={t('previousDay')}
            >
              <ChevronLeft size={44} />
            </button>

            <h1 className="kiosk-header-date">{formattedDate}</h1>

            <button
              onClick={handleNextDay}
              className="kiosk-header-nav-btn right"
              title={t('nextDay')}
              aria-label={t('nextDay')}
            >
              <ChevronRight size={44} />
            </button>
          </header>

          {/* Card 2: Shows who is cooking. Header on top left: "Koch / Köchin" */}
          <section className="kiosk-card kiosk-card-cook">
            <div className="kiosk-card-header">
              <UtensilsCrossed size={26} className="kiosk-card-header-icon" />
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
              <Soup size={26} className="kiosk-card-header-icon" />
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
          </section>

          {/* Card 4: TODOs / warnings, aligned vertically at the bottom of the content area */}
          <section className="kiosk-card kiosk-card-todos">
            <div className="kiosk-card-header">
              <AlertCircle size={26} className="kiosk-card-header-icon" />
              <span>{t('tasksAndInfoTitle')}</span>
            </div>
            <div className="kiosk-todos-list">
              {data?.tasks_and_info && data.tasks_and_info.length > 0 ? (
                data.tasks_and_info.map((task, idx) => {
                  if (task === 'yellow_bin_retrieve') {
                    return (
                      <div key={idx} className="kiosk-todo-item kiosk-todo-yellow">
                        <Trash2 size={36} className="kiosk-todo-icon" />
                        <span>{t('yellowBinRetrieve')}</span>
                      </div>
                    );
                  }
                  if (task === 'yellow_bin_put_out') {
                    return (
                      <div key={idx} className="kiosk-todo-item kiosk-todo-yellow">
                        <Trash2 size={36} className="kiosk-todo-icon" />
                        <span>{t('yellowBinPutOut')}</span>
                      </div>
                    );
                  }
                  if (task === 'clean_coffe_machine' || task === 'clean_coffee_machine') {
                    return (
                      <div key={idx} className="kiosk-todo-item kiosk-todo-coffee">
                        <Coffee size={36} className="kiosk-todo-icon" />
                        <span>{t('cleanCoffeeMachine')}</span>
                      </div>
                    );
                  }
                  // Fallback for any other custom task/info
                  return (
                    <div key={idx} className="kiosk-todo-item kiosk-todo-default">
                      <AlertCircle size={36} className="kiosk-todo-icon" />
                      <span>{task}</span>
                    </div>
                  );
                })
              ) : (
                <div className="kiosk-todo-empty">
                  <CheckCircle2 size={30} className="kiosk-todo-empty-icon" />
                  <span>{t('noTasks')}</span>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Navigation bar at the bottom: max width, fixed height */}
        <footer className="kiosk-bottom-nav">
          {/* Left: Home button (house icon) + Anleitungen button */}
          <div className="kiosk-nav-left">
            <button
              onClick={handleHomeClick}
              className="kiosk-nav-btn kiosk-nav-home-btn"
              title={t('home')}
              aria-label={t('home')}
            >
              <Home size={28} />
            </button>

            <button
              className="kiosk-nav-btn"
              title={t('anleitungen')}
            >
              <span>{t('anleitungen')}</span>
            </button>
          </div>

          {/* Right: Clock */}
          <div className="kiosk-nav-right">
            <div className="kiosk-clock">
              {formattedTime}
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default KioskDashboard;
