import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Soup,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Zap,
  Users,
  CircleDollarSign,
  ShieldAlert,
  Briefcase,
  FileText,
} from 'lucide-react';
import { HygieneCertificationModal } from '../Hygiene/HygieneCertificationModal';
import { getHygieneMessage } from '../../utils/hygieneMessage';
import { t } from '../../utils/i18n';
import {
  formatDateKey,
  getMondayOfWeek,
  getWeekDays,
  parseDateKey,
} from '../../utils/mealPlan';
import './MainPage.css';

export interface MainPageProps {
  onNavigate: (tabId: string) => void;
  canViewMealPlan?: boolean;
  canUseDashboard?: boolean;
  canReadOverview?: boolean;
  canReadFees?: boolean;
  canReadMealAllergens?: boolean;
  canAccessMga?: boolean;
  targetMgaTab?: string;
  todayDate?: string; // Optional override for testing
  userName?: string;
}

interface DailyMealInfo {
  date: string;
  who_is_cooking: string;
  meal_components: string[];
}

export const MainPage: React.FC<MainPageProps> = ({
  onNavigate,
  canViewMealPlan = false,
  canUseDashboard = false,
  canReadOverview,
  canReadFees,
  canReadMealAllergens,
  canAccessMga,
  targetMgaTab,
  todayDate,
  userName,
}) => {
  const { user, token, hasPermission } = useAuth();

  const [mainMealData, setMainMealData] = useState<DailyMealInfo | null>(null);
  const [weekData, setWeekData] = useState<DailyMealInfo[]>([]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [weekLoading, setWeekLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hygieneStatus, setHygieneStatus] = useState<any>(null);
  const [certModalOpen, setCertModalOpen] = useState(false);

  const hygieneMessage = getHygieneMessage(hygieneStatus);
  const canAccessHygieneSelf = hasPermission('hygiene.infektionsschutz.self');

  const fetchHygieneStatus = useCallback(async () => {
    if (!canAccessHygieneSelf) return;
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/hygiene/my-status', { headers });
      if (res.ok) {
        const data = await res.json();
        setHygieneStatus(data);
      }
    } catch (err) {
      console.error('Error fetching hygiene status:', err);
    }
  }, [canAccessHygieneSelf, token]);

  useEffect(() => {
    void fetchHygieneStatus();
  }, [fetchHygieneStatus]);

  // Determine today date string (in local time)
  const todayDateStr = useMemo(() => todayDate || formatDateKey(new Date()), [todayDate]);
  const todayObj = useMemo(() => parseDateKey(todayDateStr), [todayDateStr]);

  // Day of week: 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const dayOfWeek = useMemo(() => todayObj.getDay(), [todayObj]);
  const isWeekend = useMemo(() => dayOfWeek === 0 || dayOfWeek === 6, [dayOfWeek]);
  const isFriday = useMemo(() => dayOfWeek === 5, [dayOfWeek]);
  const isFridayOrWeekend = useMemo(() => isFriday || isWeekend, [isFriday, isWeekend]);

  // Target date for main food box:
  // If Sat or Sun: target is next Monday
  // If Mon-Fri: target is today
  const targetMealDate = useMemo(() => {
    if (isWeekend) {
      const daysToMonday = dayOfWeek === 0 ? 1 : 2;
      const mon = new Date(todayObj);
      mon.setDate(todayObj.getDate() + daysToMonday);
      return mon;
    }
    return todayObj;
  }, [isWeekend, dayOfWeek, todayObj]);

  const targetMealDateStr = useMemo(() => formatDateKey(targetMealDate), [targetMealDate]);

  // Days for the week section:
  // If Fri, Sat, Sun: upcoming week's Monday through Friday
  // If Mon-Thu: rest of current week (future days > today)
  const weekDaysToShow = useMemo(() => {
    if (isFridayOrWeekend) {
      const daysToNextMonday = dayOfWeek === 5 ? 3 : dayOfWeek === 6 ? 2 : 1;
      const nextMon = new Date(todayObj);
      nextMon.setDate(todayObj.getDate() + daysToNextMonday);
      return getWeekDays(nextMon);
    }
    const currentMon = getMondayOfWeek(todayObj);
    const allWeek = getWeekDays(currentMon);
    return allWeek.filter((d) => formatDateKey(d) > todayDateStr);
  }, [isFridayOrWeekend, dayOfWeek, todayObj, todayDateStr]);

  // Main Food box title: "Essen am Montag" on Sat/Sun, else "Essen heute"
  const foodCardTitle = useMemo(() => {
    if (isWeekend) {
      return t('foodMonday') || 'Essen am Montag';
    }
    return t('foodToday') || 'Essen heute';
  }, [isWeekend]);

  // Button and Section labels
  const expandBtnLabel = useMemo(() => {
    if (isFridayOrWeekend) {
      return isExpanded
        ? (t('collapseUpcomingWeek') || 'Kommende Woche ausblenden')
        : (t('expandUpcomingWeek') || 'Kommende Woche anzeigen');
    }
    return isExpanded
      ? (t('collapseRestOfWeek') || 'Restliche Woche ausblenden')
      : (t('expandRestOfWeek') || 'Restliche Woche anzeigen');
  }, [isFridayOrWeekend, isExpanded]);

  const weekSectionTitle = useMemo(() => {
    if (isFridayOrWeekend) {
      return t('upcomingWeekTitle') || 'Kommende Woche';
    }
    return t('restOfWeekTitle') || 'Restliche Woche';
  }, [isFridayOrWeekend]);

  // Fetch target meal & cook data
  const fetchMainMeal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let whoIsCooking = '';
      let components: string[] = [];

      // If user can use dashboard, /api/dashboard/daily-brief provides rich data
      if (canUseDashboard) {
        try {
          const res = await fetch(`/api/dashboard/daily-brief?date=${encodeURIComponent(targetMealDateStr)}`, {
            headers,
          });
          if (res.ok) {
            const data = await res.json();
            whoIsCooking = data.who_is_cooking || '';
            if (data.allergen_meal_components && data.allergen_meal_components.length > 0) {
              components = data.allergen_meal_components.map((c: { name: string }) => c.name);
            } else if (data.meal_components && data.meal_components.length > 0) {
              components = data.meal_components;
            }
          }
        } catch {
          // fallback to mealplan below
        }
      }

      // If whoIsCooking or components were not retrieved, try /api/mealplan
      if (!whoIsCooking && components.length === 0) {
        const res = await fetch(`/api/mealplan?date=${encodeURIComponent(targetMealDateStr)}`, { headers });
        if (res.ok) {
          const data = await res.json();
          whoIsCooking = data.who_is_cooking || '';
          components = data.meal_components || [];
        }
      }

      setMainMealData({
        date: targetMealDateStr,
        who_is_cooking: whoIsCooking,
        meal_components: components,
      });
    } catch (err: unknown) {
      console.error('Error fetching main meal info:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Tagesplans');
    } finally {
      setLoading(false);
    }
  }, [targetMealDateStr, token, canUseDashboard]);

  // Fetch week data
  const fetchWeekData = useCallback(async () => {
    if (weekDaysToShow.length === 0) return;
    setWeekLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const results = await Promise.all(
        weekDaysToShow.map(async (dayDate) => {
          const dateStr = formatDateKey(dayDate);
          let whoIsCooking = '';
          let components: string[] = [];

          try {
            const res = await fetch(`/api/mealplan?date=${encodeURIComponent(dateStr)}`, { headers });
            if (res.ok) {
              const data = await res.json();
              whoIsCooking = data.who_is_cooking || '';
              components = data.meal_components || [];
            } else if (canUseDashboard) {
              const dRes = await fetch(`/api/dashboard/daily-brief?date=${encodeURIComponent(dateStr)}`, {
                headers,
              });
              if (dRes.ok) {
                const dData = await dRes.json();
                whoIsCooking = dData.who_is_cooking || '';
                components = dData.meal_components || [];
              }
            }
          } catch {
            // keep empty
          }

          return {
            date: dateStr,
            who_is_cooking: whoIsCooking,
            meal_components: components,
          };
        })
      );

      setWeekData(results);
    } catch (err) {
      console.error('Error fetching week data:', err);
    } finally {
      setWeekLoading(false);
    }
  }, [weekDaysToShow, token, canUseDashboard]);

  useEffect(() => {
    void fetchMainMeal();
  }, [fetchMainMeal]);

  const toggleExpand = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && weekData.length === 0) {
      void fetchWeekData();
    }
  }, [isExpanded, weekData.length, fetchWeekData]);

  // Helper to format date display nicely
  const formatDayHeading = (dateStr: string): string => {
    try {
      const d = parseDateKey(dateStr);
      return new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const formattedTodayLong = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(todayObj);
    } catch {
      return todayDateStr;
    }
  }, [todayObj, todayDateStr]);

  const displayName = useMemo(() => {
    return userName || user?.first_name || user?.email || '';
  }, [userName, user?.first_name, user?.email]);

  const cookNameFormatted = useMemo(() => {
    const raw = mainMealData?.who_is_cooking?.trim();
    if (raw) {
      return `(${raw})`;
    }
    return `(${t('noCookToday') || 'Niemand eingetragen'})`;
  }, [mainMealData]);

  const effectiveCanReadOverview = canReadOverview !== undefined
    ? canReadOverview
    : hasPermission('families.all.restrictedread');

  const effectiveCanReadFees = canReadFees !== undefined
    ? canReadFees
    : (hasPermission('fees.self.read') || hasPermission('fees.all.read'));

  const effectiveCanReadMealAllergens = canReadMealAllergens !== undefined
    ? canReadMealAllergens
    : (hasPermission('meal_allergens.read') || hasPermission('meal_allergens.write'));

  const effectiveCanAccessMga = canAccessMga !== undefined
    ? canAccessMga
    : (hasPermission('families.all.read') || hasPermission('memberships.all.read') || hasPermission('jobs.all.read') || hasPermission('jobs.all.write'));

  const effectiveTargetMgaTab = targetMgaTab || 'mga';

  const quickStartLinks = useMemo(() => {
    const links = [];
    if (effectiveCanReadOverview) {
      links.push({
        id: 'familiesOverview',
        tab: 'familiesOverview',
        label: t('quickStartAddressList') || 'Adressliste',
        icon: Users,
        testId: 'main-page-quickstart-familiesOverview',
        altTestId: 'main-page-quickstart-address-list',
      });
    }
    if (effectiveCanReadFees) {
      links.push({
        id: 'childcareFees',
        tab: 'childcareFees',
        label: t('quickStartFees') || 'Betreuungsgebühren',
        icon: CircleDollarSign,
        testId: 'main-page-quickstart-childcareFees',
        altTestId: 'main-page-quickstart-fees',
      });
    }
    if (effectiveCanReadMealAllergens) {
      links.push({
        id: 'mealAllergens',
        tab: 'mealAllergens',
        label: t('quickStartAllergens') || 'Allergene fürs Kochen eintragen',
        icon: ShieldAlert,
        testId: 'main-page-quickstart-mealAllergens',
        altTestId: 'main-page-quickstart-allergens',
      });
    }
    if (effectiveCanAccessMga) {
      links.push({
        id: 'mga',
        tab: effectiveTargetMgaTab,
        label: t('quickStartMga') || 'MGA Verwaltung',
        icon: Briefcase,
        testId: 'main-page-quickstart-mga',
        altTestId: 'main-page-quickstart-mga-link',
      });
    }
    return links;
  }, [
    effectiveCanReadOverview,
    effectiveCanReadFees,
    effectiveCanReadMealAllergens,
    effectiveCanAccessMga,
    effectiveTargetMgaTab,
  ]);

  return (
    <div className="main-page-container" data-testid="main-page">
      {/* Welcome / Header Section */}
      <section className="main-page-header">
        <div className="main-page-header-text">
          <h1 className="main-page-title" data-testid="main-page-title">
            Heute ist {formattedTodayLong}
          </h1>
          <p className="main-page-welcome" data-testid="main-page-welcome">
            Willkommen{displayName ? `, ${displayName}` : ''}!
          </p>
          <span className="sr-only" data-testid="main-page-today-date">{formattedTodayLong}</span>
        </div>
      </section>

      {error && (
        <div className="main-page-error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button
            type="button"
            className="main-page-retry-btn"
            onClick={() => void fetchMainMeal()}
            aria-label="Erneut versuchen"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      )}

      {/* Grid of dashboard cards - prepared for multiple boxes */}
      <div className="main-page-cards-grid">
        {/* Hygiene Task Box */}
        {hygieneStatus?.needs_instruction && hygieneStatus?.document_available && (
          <section
            className="main-page-card main-page-hygiene-task-card"
            data-testid="main-page-hygiene-task-card"
          >
            <div className="main-page-card-header">
              {hygieneMessage?.kind === 'upcoming' ? (
                <AlertCircle
                  size={22}
                  className="main-page-card-icon hygiene-icon"
                  data-testid="main-page-hygiene-task-icon"
                  style={{ color: 'var(--primary, #2563eb)' }}
                />
              ) : (
                <ShieldAlert
                  size={22}
                  className="main-page-card-icon hygiene-icon"
                  data-testid="main-page-hygiene-task-icon"
                  style={{ color: 'var(--primary, #2563eb)' }}
                />
              )}
              <h2 className="main-page-card-title hygiene-task-title" data-testid="main-page-hygiene-task-title" style={{ color: 'var(--primary, #2563eb)' }}>
                {t('hygieneTaskTitle')}
              </h2>
            </div>
            <div className="main-page-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text)' }} data-testid="main-page-hygiene-task-desc" data-kind={hygieneMessage?.kind}>
                {hygieneMessage?.text}
              </p>
              <div>
                <button
                  type="button"
                  className="personal-hygiene-certify-btn"
                  onClick={() => setCertModalOpen(true)}
                  data-testid="main-page-hygiene-task-start-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    background: 'var(--primary, #2563eb)',
                    color: 'var(--primary-contrast, #ffffff)',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={16} />
                  <span>{t('hygieneTaskStartBtn')}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Main Box: Essen heute / Essen am Montag */}
        <section className="main-page-card main-page-food-card" data-testid="main-page-food-card">
          <div className="main-page-card-header">
            <Soup size={22} className="main-page-card-icon meal-icon" />
            <h2 className="main-page-card-title" data-testid="main-page-food-title">
              {foodCardTitle}
            </h2>
          </div>
          <div className="main-page-card-body">
            {loading ? (
              <div className="main-page-loading-skeleton">Wird geladen...</div>
            ) : (
              <div className="main-page-food-content">
                {mainMealData?.meal_components && mainMealData.meal_components.length > 0 ? (
                  <ul className="main-page-meal-components-list" data-testid="main-page-meal-components">
                    {mainMealData.meal_components.map((component, idx) => (
                      <li key={idx} className="main-page-meal-component-item">
                        <span className="main-page-meal-bullet">•</span>
                        <span className="main-page-meal-text">{component}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="main-page-empty-placeholder" data-testid="main-page-no-food">
                    {t('noFoodToday') || 'Kein Essen eingetragen'}
                  </div>
                )}

                <div className="main-page-cook-row" data-testid="main-page-cook-row">
                  <span className="main-page-cook-name" data-testid="main-page-cook-name">
                    {cookNameFormatted}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Expand / Collapse Section for Rest of the Week / Upcoming Week */}
          <div className="main-page-week-section">
            <button
              type="button"
              className="main-page-expand-btn"
              onClick={toggleExpand}
              data-testid="main-page-expand-week-btn"
              aria-expanded={isExpanded}
            >
              <span>{expandBtnLabel}</span>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isExpanded && (
              <div className="main-page-week-expanded-content" data-testid="main-page-week-expanded">
                <h3 className="main-page-week-title">{weekSectionTitle}</h3>

                {weekLoading ? (
                  <div className="main-page-loading-week">Wochentage werden geladen...</div>
                ) : weekData.length > 0 ? (
                  <div className="main-page-week-cards-grid">
                    {weekData.map((dayItem) => {
                      const dayTitle = formatDayHeading(dayItem.date);
                      const cookFormatted = dayItem.who_is_cooking?.trim()
                        ? `(${dayItem.who_is_cooking.trim()})`
                        : `(${t('noCookToday') || 'Niemand eingetragen'})`;

                      return (
                        <div
                          key={dayItem.date}
                          className="main-page-week-day-card"
                          data-testid={`main-page-week-day-${dayItem.date}`}
                        >
                          <div className="main-page-week-day-header">
                            <span className="main-page-week-day-name">{dayTitle}</span>
                          </div>
                          <div className="main-page-week-day-body">
                            {dayItem.meal_components && dayItem.meal_components.length > 0 ? (
                              <ul className="main-page-week-components-list">
                                {dayItem.meal_components.map((c, cIdx) => (
                                  <li key={cIdx} className="main-page-week-component-item">
                                    <span className="main-page-week-bullet">•</span>
                                    <span className="main-page-week-component-text">{c}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="main-page-week-empty">
                                {t('noFoodToday') || 'Kein Essen eingetragen'}
                              </div>
                            )}

                            <div className="main-page-week-cook-row">
                              <span className="main-page-week-cook-name">
                                {cookFormatted}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="main-page-empty-week">
                    {t('noMoreCookingDaysThisWeek') || 'Keine weiteren Kochtage in dieser Woche'}
                  </p>
                )}

                {/* Link to Meal Plan if user has permission */}
                {canViewMealPlan && (
                  <div className="main-page-mealplan-link-row">
                    <button
                      type="button"
                      className="main-page-mealplan-nav-btn"
                      onClick={() => onNavigate('mealPlan')}
                      data-testid="main-page-mealplan-link"
                    >
                      <Calendar size={18} />
                      <span>{t('linkToMealPlan') || 'Zum Wochenplan'}</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Quick Start Box */}
        {quickStartLinks.length > 0 && (
          <section
            className="main-page-card main-page-quickstart-card"
            data-testid="main-page-quickstart-card"
          >
            <div data-testid="main-page-quickstart-box" className="sr-only" />
            <div className="main-page-card-header">
              <Zap size={22} className="main-page-card-icon quickstart-icon" />
              <h2 className="main-page-card-title" data-testid="main-page-quickstart-title">
                {t('quickStart') || 'Schnellstart'}
              </h2>
            </div>
            <div className="main-page-card-body main-page-quickstart-body">
              <div className="main-page-quickstart-grid" role="list">
                {quickStartLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <button
                      key={link.id}
                      type="button"
                      className="main-page-quickstart-btn"
                      onClick={() => onNavigate(link.tab)}
                      data-testid={link.testId}
                      data-tab={link.tab}
                      role="listitem"
                      aria-label={link.label}
                    >
                      <div className="main-page-quickstart-btn-content">
                        <span className="main-page-quickstart-icon-wrapper">
                          <Icon size={20} className="main-page-quickstart-btn-icon" />
                        </span>
                        <span className="main-page-quickstart-btn-label">{link.label}</span>
                        {link.altTestId && (
                          <span data-testid={link.altTestId} className="sr-only">
                            {link.label}
                          </span>
                        )}
                      </div>
                      <ArrowRight size={18} className="main-page-quickstart-arrow" />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Certification Modal */}
      <HygieneCertificationModal
        isOpen={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        onSuccess={() => void fetchHygieneStatus()}
        documentTitle={hygieneStatus?.document_info?.title}
        documentFilename={hygieneStatus?.document_info?.filename}
        userName={hygieneStatus?.display_name}
      />
    </div>
  );
};
