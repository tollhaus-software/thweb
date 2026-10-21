import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Square, Info, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { t, CURRENT_LOCALE } from '../utils/i18n';
import { getFamilyName as formatFamilyNameHelper } from '../utils/family';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';

interface Parent {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
}

interface Family {
  id: string;
  parents: Parent[];
}

interface ChildcareFeesCalculatorProps {
  token: string | null;
  families: Family[];
}

interface MonthlyFee {
  month: string;
  fee: number;
  description: string;
}

interface FamilyFeeResult {
  family_id: string;
  family_name: string;
  monthly_fees: MonthlyFee[];
}

interface FeeChangeResult {
  family_id: string;
  family_name: string;
  month: string;
  previous_fee: number;
  new_fee: number;
  reason: string;
}

interface CalculationResponse {
  family_fees: FamilyFeeResult[];
  fee_changes: FeeChangeResult[];
}

const renderWithLineBreaks = (text: string) => {
  if (!text) return '';
  return text.split('\n').map((line, index, array) => (
    <React.Fragment key={index}>
      {line}
      {index < array.length - 1 && <br />}
    </React.Fragment>
  ));
};

const FeeTooltipContent: React.FC<{ description: string; change?: FeeChangeResult }> = ({
  description,
  change,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPosition = useCallback(() => {
    if (!containerRef.current || !popupRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      setIsPinned(false);
      setIsHovered(false);
      return;
    }

    const GAP = 8;
    const PADDING = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = Math.min(480, viewportWidth - 2 * PADDING);

    const iconCenterX = rect.left + rect.width / 2;
    let left = iconCenterX - tooltipWidth / 2;
    if (left < PADDING) {
      left = PADDING;
    } else if (left + tooltipWidth > viewportWidth - PADDING) {
      left = viewportWidth - tooltipWidth - PADDING;
    }

    const spaceAbove = rect.top - GAP - PADDING;
    const spaceBelow = viewportHeight - rect.bottom - GAP - PADDING;
    const actualHeight = popupRef.current.offsetHeight || 160;

    const openBelow = spaceAbove < actualHeight && spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, openBelow ? spaceBelow : spaceAbove);

    popupRef.current.style.left = `${left}px`;
    popupRef.current.style.width = `${tooltipWidth}px`;
    popupRef.current.style.maxHeight = `${maxHeight}px`;
    if (openBelow) {
      popupRef.current.style.top = `${rect.bottom + GAP}px`;
      popupRef.current.style.bottom = 'auto';
    } else {
      popupRef.current.style.bottom = `${viewportHeight - rect.top + GAP}px`;
      popupRef.current.style.top = 'auto';
    }
    popupRef.current.style.visibility = 'visible';
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const visible = isHovered || isPinned;

  useLayoutEffect(() => {
    if (!visible) return;

    applyPosition();

    window.addEventListener('scroll', applyPosition, true);
    window.addEventListener('resize', applyPosition);

    return () => {
      window.removeEventListener('scroll', applyPosition, true);
      window.removeEventListener('resize', applyPosition);
    };
  }, [visible, applyPosition]);

  useEffect(() => {
    if (!isPinned && !isHovered) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setIsPinned(false);
        setIsHovered(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPinned, isHovered]);

  useEffect(() => {
    if (!isPinned && !isHovered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPinned(false);
        setIsHovered(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned, isHovered]);

  const hasDesc = Boolean(description && description.trim().length > 0);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: '6px',
          cursor: 'pointer',
          verticalAlign: 'middle',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setIsPinned((prev) => !prev);
        }}
      >
        <Info
          size={13}
          strokeWidth={change ? 3 : 2}
          style={{ color: change ? 'var(--primary)' : 'var(--text-muted)' }}
        />
      </div>

      {visible &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: 'fixed',
              visibility: 'hidden',
              background: 'var(--bg-surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              lineHeight: '1.5',
              textAlign: 'left',
              boxShadow: 'var(--shadow)',
              zIndex: 9999,
              pointerEvents: 'auto',
              cursor: 'default',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {change && (
              <div
                style={{
                  marginBottom: hasDesc ? '8px' : 0,
                  borderBottom: hasDesc ? '1px solid var(--border)' : 'none',
                  paddingBottom: hasDesc ? '6px' : 0,
                }}
              >
                <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '2px' }}>
                  {t('changeHeader')}
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-h)' }}>
                  {change.previous_fee.toFixed(2)} EUR → {change.new_fee.toFixed(2)} EUR
                </div>
                {change.reason && (
                  <div style={{ fontStyle: 'italic', fontSize: '0.7rem', marginTop: '2px', color: 'var(--text-muted)' }}>
                    {renderWithLineBreaks(change.reason)}
                  </div>
                )}
              </div>
            )}
            {hasDesc && <div>{renderWithLineBreaks(description)}</div>}
          </div>,
          document.body
        )}
    </>
  );
};

const FeeTooltip: React.FC<{ description: string; change?: FeeChangeResult }> = ({
  description,
  change,
}) => {
  const hasInfo = Boolean(change || (description && description.trim().length > 0));

  if (!hasInfo) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: '6px',
          verticalAlign: 'middle',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <Info size={13} strokeWidth={2} />
      </div>
    );
  }

  return <FeeTooltipContent description={description} change={change} />;
};

export const ChildcareFeesCalculator: React.FC<ChildcareFeesCalculatorProps> = ({
  token,
  families,
}) => {
  const { hasPermission } = useAuth();
  const canSelectFamilies = hasPermission('fees.all.read');
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();

  // Month range state (persisted in browser localStorage)
  const [startYear, setStartYear] = useState<number>(() => {
    const saved = localStorage.getItem('childcare_fees_start_year');
    return saved ? parseInt(saved, 10) : currentYear;
  });
  const [startMonth, setStartMonth] = useState<string>(() => {
    const saved = localStorage.getItem('childcare_fees_start_month');
    return saved ? saved : '01';
  });
  const [endYear, setEndYear] = useState<number>(() => {
    const saved = localStorage.getItem('childcare_fees_end_year');
    return saved ? parseInt(saved, 10) : currentYear;
  });
  const [endMonth, setEndMonth] = useState<string>(() => {
    const saved = localStorage.getItem('childcare_fees_end_month');
    return saved ? saved : '12';
  });

  useEffect(() => {
    localStorage.setItem('childcare_fees_start_year', String(startYear));
    localStorage.setItem('childcare_fees_start_month', startMonth);
    localStorage.setItem('childcare_fees_end_year', String(endYear));
    localStorage.setItem('childcare_fees_end_month', endMonth);
  }, [startYear, startMonth, endYear, endMonth]);

  const selectableYears = useMemo(() => {
    const years = [];
    const maxYear = Math.max(2028, currentYear + 2);
    for (let y = currentYear - 2; y <= maxYear; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Selected families state
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>(() =>
    families.map((f) => f.id)
  );
  const [mobileSelectedFamilyId, setMobileSelectedFamilyId] = useState<string>(() =>
    families[0]?.id || ''
  );
  const [familySearch, setFamilySearch] = useState('');
  const [isFamiliesExpanded, setIsFamiliesExpanded] = useState<boolean>(false);

  // Results state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const hasInitializedRef = useRef(Boolean(families && families.length > 0));

  useEffect(() => {
    if (families && families.length > 0 && !hasInitializedRef.current) {
      setSelectedFamilyIds(families.map((f) => f.id));
      setMobileSelectedFamilyId((prev) => prev || families[0]?.id || '');
      hasInitializedRef.current = true;
    }
  }, [families]);

  // Helper to format family names
  const getFamilyName = useCallback((f: Family) => {
    return formatFamilyNameHelper(f);
  }, []);

  const mobileSelectableFamilies = useMemo(() => {
    if (canSelectFamilies) {
      return families.map((f) => ({ id: f.id, name: getFamilyName(f) }));
    }
    if (results?.family_fees) {
      return results.family_fees.map((r) => {
        const fam = families.find((f) => f.id === r.family_id);
        return {
          id: r.family_id,
          name: fam ? getFamilyName(fam) : r.family_name,
        };
      });
    }
    return [];
  }, [canSelectFamilies, families, results, getFamilyName]);

  const activeMobileFamilyId = useMemo(() => {
    if (mobileSelectableFamilies.length === 0) return '';
    if (
      mobileSelectedFamilyId &&
      mobileSelectableFamilies.some((f) => f.id === mobileSelectedFamilyId)
    ) {
      return mobileSelectedFamilyId;
    }
    return mobileSelectableFamilies[0].id;
  }, [mobileSelectableFamilies, mobileSelectedFamilyId]);

  const currentMobileFamilyIndex = useMemo(() => {
    if (!activeMobileFamilyId) return -1;
    return mobileSelectableFamilies.findIndex((f) => f.id === activeMobileFamilyId);
  }, [mobileSelectableFamilies, activeMobileFamilyId]);

  const handlePrevFamily = () => {
    if (currentMobileFamilyIndex > 0) {
      setMobileSelectedFamilyId(mobileSelectableFamilies[currentMobileFamilyIndex - 1].id);
    }
  };

  const handleNextFamily = () => {
    if (
      currentMobileFamilyIndex >= 0 &&
      currentMobileFamilyIndex < mobileSelectableFamilies.length - 1
    ) {
      setMobileSelectedFamilyId(mobileSelectableFamilies[currentMobileFamilyIndex + 1].id);
    }
  };

  const effectiveSelectedFamilyIds = useMemo(() => {
    if (!isMobile) return selectedFamilyIds;
    if (activeMobileFamilyId && !selectedFamilyIds.includes(activeMobileFamilyId)) {
      return [...selectedFamilyIds, activeMobileFamilyId];
    }
    return selectedFamilyIds.length > 0
      ? selectedFamilyIds
      : activeMobileFamilyId
      ? [activeMobileFamilyId]
      : [];
  }, [isMobile, selectedFamilyIds, activeMobileFamilyId]);

  const activeRequestIdRef = useRef(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const prevSelectedFamilyIdsRef = useRef<string[] | null>(null);
  const prevRangeRef = useRef<string | null>(null);
  const prevTokenRef = useRef<string | null>(null);

  // Derived validation error
  const validationError = useMemo(() => {
    if (canSelectFamilies && families.length > 0 && effectiveSelectedFamilyIds.length === 0) {
      return t('selectAtLeastOneFamily') || 'Please select at least one family.';
    }
    const startMonthStr = `${startYear}-${startMonth}`;
    const endMonthStr = `${endYear}-${endMonth}`;
    if (startMonthStr > endMonthStr) {
      return t('startMonthAfterEndMonth') || 'Start month cannot be after end month.';
    }
    return null;
  }, [canSelectFamilies, families.length, effectiveSelectedFamilyIds.length, startYear, startMonth, endYear, endMonth]);

  const error = validationError || apiError;

  // Sort family fees results to match the order of the families prop, filtered by selected families
  const sortedFamilyFees = useMemo(() => {
    if (!results || !results.family_fees) return [];
    if (!canSelectFamilies) {
      return results.family_fees;
    }
    return results.family_fees
      .filter((res) => selectedFamilyIds.includes(res.family_id))
      .sort((a, b) => {
        const indexA = families.findIndex((f) => f.id === a.family_id);
        const indexB = families.findIndex((f) => f.id === b.family_id);
        return indexA - indexB;
      });
  }, [results, families, selectedFamilyIds, canSelectFamilies]);

  // Sort fee changes primarily by "Wirksamer Monat" (month string), then secondary by family name, filtered by selected families
  const sortedFeeChanges = useMemo(() => {
    if (!results || !results.fee_changes) return [];
    if (!canSelectFamilies) {
      return results.fee_changes;
    }
    return results.fee_changes
      .filter((chg) => selectedFamilyIds.includes(chg.family_id))
      .sort((a, b) => {
        if (a.month !== b.month) {
          return a.month.localeCompare(b.month);
        }
        return (a.family_name || '').localeCompare(b.family_name || '');
      });
  }, [results, selectedFamilyIds, canSelectFamilies]);

  const activeMobileFamilyFee = useMemo(() => {
    if (!results || !results.family_fees) return null;
    if (!canSelectFamilies && results.family_fees.length === 1) {
      return results.family_fees[0];
    }
    return (
      results.family_fees.find((r) => r.family_id === activeMobileFamilyId) ||
      results.family_fees[0] ||
      null
    );
  }, [results, canSelectFamilies, activeMobileFamilyId]);

  const mobileFeeChanges = useMemo(() => {
    if (!results || !results.fee_changes || !activeMobileFamilyFee) return [];
    return results.fee_changes
      .filter((chg) => chg.family_id === activeMobileFamilyFee.family_id)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [results, activeMobileFamilyFee]);

  // Filtered families list based on search query
  const filteredFamilies = families.filter((f) => {
    const name = getFamilyName(f).toLowerCase();
    const query = familySearch.toLowerCase();
    return name.includes(query);
  });

  const handleSelectAll = () => {
    setSelectedFamilyIds(families.map((f) => f.id));
  };

  const handleDeselectAll = () => {
    setSelectedFamilyIds([]);
  };

  const handleToggleFamily = (id: string) => {
    setSelectedFamilyIds((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (validationError || (canSelectFamilies && effectiveSelectedFamilyIds.length === 0)) {
      prevSelectedFamilyIdsRef.current = effectiveSelectedFamilyIds;
      return;
    }

    const startMonthStr = `${startYear}-${startMonth}`;
    const endMonthStr = `${endYear}-${endMonth}`;
    const currentRange = `${startMonthStr}_${endMonthStr}`;

    const isFirstRun = prevSelectedFamilyIdsRef.current === null;
    const tokenChanged = prevTokenRef.current !== token;
    const rangeChanged = prevRangeRef.current !== currentRange;
    const prevSelected = prevSelectedFamilyIdsRef.current || [];
    const hasAddedFamilies = canSelectFamilies ? effectiveSelectedFamilyIds.some((id) => !prevSelected.includes(id)) : false;

    prevSelectedFamilyIdsRef.current = effectiveSelectedFamilyIds;
    prevRangeRef.current = currentRange;
    prevTokenRef.current = token;

    if (!isFirstRun && !tokenChanged && !rangeChanged && !hasAddedFamilies && resultsRef.current !== null) {
      return;
    }

    const controller = new AbortController();
    const requestId = ++activeRequestIdRef.current;
    let isSubscribed = true;

    queueMicrotask(() => {
      if (isSubscribed && requestId === activeRequestIdRef.current) {
        setLoading(true);
        setApiError(null);
      }
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token && token !== 'null' && token !== 'undefined') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/fees/calculate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        start_month: startMonthStr,
        end_month: endMonthStr,
        ...(canSelectFamilies ? { family_ids: effectiveSelectedFamilyIds } : {}),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to calculate childcare fees');
        }
        const data: CalculationResponse = await response.json();
        if (isSubscribed && requestId === activeRequestIdRef.current) {
          setResults(data);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (isSubscribed && requestId === activeRequestIdRef.current) {
          const message =
            err instanceof Error ? err.message : 'An error occurred during calculation.';
          setApiError(message);
        }
      })
      .finally(() => {
        if (isSubscribed && requestId === activeRequestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [token, validationError, startYear, startMonth, endYear, endMonth, effectiveSelectedFamilyIds, canSelectFamilies]);

  const monthsColumns = useMemo(() => {
    if (!results) return [];
    if (results.family_fees && results.family_fees.length > 0) {
      return results.family_fees[0]?.monthly_fees?.map((mf) => mf.month) || [];
    }
    const list: string[] = [];
    let currYear = startYear;
    let currMonth = parseInt(startMonth, 10);
    const endY = endYear;
    const endM = parseInt(endMonth, 10);

    while (currYear < endY || (currYear === endY && currMonth <= endM)) {
      list.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
      currMonth++;
      if (currMonth > 12) {
        currMonth = 1;
        currYear++;
      }
    }
    return list;
  }, [results, startYear, startMonth, endYear, endMonth]);

  // Helper to format year-month (e.g. 2026-01 -> Jan 2026 or Jan 26)
  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-');
    const monthNamesEn = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const monthNamesDe = [
      'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
    ];
    const monthNames = CURRENT_LOCALE === 'de' ? monthNamesDe : monthNamesEn;
    const monthIdx = parseInt(m, 10) - 1;
    return `${monthNames[monthIdx]} ${y}`;
  };

  const showMobileFamilySelector =
    isMobile && (canSelectFamilies ? mobileSelectableFamilies.length > 0 : mobileSelectableFamilies.length > 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
      <div
        className="glass-card"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.25rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: 'var(--text-h)', fontSize: '1.1rem' }}>
            {t('childcareFees') || 'Childcare Fees'}
          </h3>
          {loading && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {t('calculating') || 'Calculating...'}
            </span>
          )}
        </div>

        <div
          className="fees-month-range-row"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            marginBottom: (!isMobile && canSelectFamilies) || showMobileFamilySelector ? '1.25rem' : 0,
          }}
        >
          {/* Start Month */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('startMonth') || 'Start Month'}
            </label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                style={{ padding: '0.35rem', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
                style={{ padding: '0.35rem', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
              >
                {selectableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* End Month */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('endMonth') || 'End Month'}
            </label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                style={{ padding: '0.35rem', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value, 10))}
                style={{ padding: '0.35rem', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
              >
                {selectableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Mobile Single-Family Selector (Dropdown + Prev/Next) */}
        {showMobileFamilySelector && (
          <div className="fees-mobile-family-selector-group">
            <label
              htmlFor="mobile-family-select"
              style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              {t('family')}
            </label>
            <div className="fees-mobile-family-selector">
              <button
                type="button"
                className="fees-family-nav-btn fees-family-prev-btn"
                onClick={handlePrevFamily}
                disabled={currentMobileFamilyIndex <= 0}
                aria-label={t('previousFamily')}
                title={t('previousFamily')}
              >
                <ChevronLeft size={16} />
              </button>
              <select
                id="mobile-family-select"
                className="fees-family-select"
                value={activeMobileFamilyId}
                onChange={(e) => setMobileSelectedFamilyId(e.target.value)}
                aria-label={t('family')}
              >
                {mobileSelectableFamilies.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="fees-family-nav-btn fees-family-next-btn"
                onClick={handleNextFamily}
                disabled={
                  currentMobileFamilyIndex < 0 ||
                  currentMobileFamilyIndex >= mobileSelectableFamilies.length - 1
                }
                aria-label={t('nextFamily')}
                title={t('nextFamily')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Families Checklist (Expandable - Desktop) */}
        {!isMobile && canSelectFamilies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <button
              type="button"
              onClick={() => setIsFamiliesExpanded(!isFamiliesExpanded)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.35rem 0.5rem',
                margin: '-0.35rem -0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-h)',
                fontFamily: 'inherit',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-expanded={isFamiliesExpanded}
            >
              {isFamiliesExpanded ? (
                <ChevronDown size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              ) : (
                <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {t('selectFamilies') || 'Select Families'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                ({selectedFamilyIds.length} {t('familiesSelected') || 'families selected'})
              </span>
            </button>
          </div>

          {isFamiliesExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder={t('searchFamilies') || 'Search families...'}
                  value={familySearch}
                  onChange={(e) => setFamilySearch(e.target.value)}
                  className="search-input"
                  style={{ width: '220px', padding: '0.35rem 0.5rem', fontSize: '0.875rem', marginBottom: 0 }}
                />
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {t('selectAll') || 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  style={{
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {t('deselectAll') || 'Deselect All'}
                </button>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  padding: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  background: 'var(--bg-subtle)',
                }}
              >
                {filteredFamilies.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem' }}>
                    {t('noFamiliesFound') || 'No families found'}
                  </div>
                ) : (
                  filteredFamilies.map((f) => {
                    const isSelected = selectedFamilyIds.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleToggleFamily(f.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-bg)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {isSelected ? (
                          <CheckSquare size={16} style={{ color: 'var(--primary)' }} />
                        ) : (
                          <Square size={16} style={{ color: 'var(--text-muted)' }} />
                        )}
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-h)', fontWeight: isSelected ? 600 : 500 }}>
                          {getFamilyName(f)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 500,
              marginTop: '0.75rem',
            }}
          >
            {error}
          </div>
        )}

        {loading && !results && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic', marginTop: '0.75rem' }}>
            {t('calculating') || 'Calculating...'}
          </div>
        )}
      </div>

      {results && !validationError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {/* Family Fees Grid / Mobile Vertical List */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1.25rem',
              boxShadow: 'var(--shadow)',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-h)', fontSize: '1rem', fontWeight: 600 }}>
              {canSelectFamilies ? t('familyFeesGrid') : (t('monthlyFeesSelf') || 'Monatliche Betreuungsgebühren')}
            </h4>
            {isMobile ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table fees-mobile-vertical-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem 0.65rem' }}>
                        {t('month')}
                      </th>
                      <th style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem 0.65rem' }}>
                        {activeMobileFamilyFee
                          ? `${t('fee')} (${
                              mobileSelectableFamilies.find((f) => f.id === activeMobileFamilyFee.family_id)?.name ||
                              activeMobileFamilyFee.family_name
                            })`
                          : t('fee')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthsColumns.map((m) => {
                      const monthData = (activeMobileFamilyFee?.monthly_fees || []).find((mf) => mf.month === m);
                      const change = (results.fee_changes || []).find(
                        (chg) => chg.family_id === activeMobileFamilyFee?.family_id && chg.month === m
                      );
                      return (
                        <tr key={m} data-month={m}>
                          <td
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-h)',
                              border: '1px solid var(--border)',
                              padding: '0.5rem 0.65rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatMonth(m)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 500,
                              color: 'var(--text)',
                              border: '1px solid var(--border)',
                              padding: '0.5rem 0.65rem',
                              backgroundColor: change ? 'var(--highlight-bg)' : 'transparent',
                            }}
                          >
                            {monthData ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                                {monthData.fee.toFixed(2)} EUR
                                <FeeTooltip description={monthData.description} change={change} />
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th className="sticky-col" style={{ border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap', width: '1%' }}>{t('family')}</th>
                      {monthsColumns.map((m) => (
                        <th key={m} style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem' }}>
                          {formatMonth(m)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFamilyFees.map((res) => (
                      <tr key={res.family_id}>
                        <td className="sticky-col" style={{ fontWeight: 600, color: 'var(--text-h)', border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap', width: '1%' }}>{res.family_name}</td>
                        {monthsColumns.map((m) => {
                          const monthData = (res.monthly_fees || []).find((mf) => mf.month === m);
                          const change = (results.fee_changes || []).find(
                            (chg) => chg.family_id === res.family_id && chg.month === m
                          );
                          return (
                            <td key={m} style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text)', border: '1px solid var(--border)', padding: '0.5rem', backgroundColor: change ? 'var(--highlight-bg)' : 'transparent' }}>
                              {monthData ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                                  {monthData.fee.toFixed(2)}
                                  <FeeTooltip description={monthData.description} change={change} />
                                </span>
                              ) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Fee Changes Table / Mobile Cards */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1.25rem',
              boxShadow: 'var(--shadow)',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-h)', fontSize: '1rem', fontWeight: 600 }}>
              {t('feeChanges')}
            </h4>
            {isMobile ? (
              mobileFeeChanges.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem' }}>
                  {t('noFeeChanges')}
                </div>
              ) : (
                <div className="fee-changes-cards-list">
                  {mobileFeeChanges.map((chg, idx) => (
                    <div
                      key={`${chg.family_id}-${chg.month}-${idx}`}
                      className="fee-change-card"
                      data-month={chg.month}
                    >
                      <div className="fee-change-card-header">
                        {formatMonth(chg.month)}
                      </div>
                      <div className="fee-change-card-row" data-field="previous_fee">
                        <span className="fee-change-card-label">{t('previousFee')}</span>
                        <span className="fee-change-card-value" style={{ color: 'var(--text-muted)' }}>
                          {chg.previous_fee.toFixed(2)} EUR
                        </span>
                      </div>
                      <div className="fee-change-card-row" data-field="new_fee">
                        <span className="fee-change-card-label">{t('newFee')}</span>
                        <span className="fee-change-card-value" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          {chg.new_fee.toFixed(2)} EUR
                        </span>
                      </div>
                      <div className="fee-change-card-row" data-field="reason">
                        <span className="fee-change-card-label">{t('reason')}</span>
                        <span className="fee-change-card-value fee-change-card-reason">
                          {renderWithLineBreaks(chg.reason) || '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : sortedFeeChanges.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem' }}>
                {t('noFeeChanges')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th className="sticky-col" style={{ border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{t('family')}</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '150px' }}>{t('effectiveMonth')}</th>
                      <th style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem', width: '140px' }}>{t('previousFee')}</th>
                      <th style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem', width: '120px' }}>{t('newFee')}</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem' }}>{t('reason')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFeeChanges.map((chg, idx) => (
                      <tr key={`${chg.family_id}-${chg.month}-${idx}`}>
                        <td className="sticky-col" style={{ fontWeight: 600, color: 'var(--text-h)', border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{chg.family_name}</td>
                        <td style={{ border: '1px solid var(--border)', padding: '0.5rem' }}>{formatMonth(chg.month)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '0.5rem' }}>{chg.previous_fee.toFixed(2)} EUR</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)', border: '1px solid var(--border)', padding: '0.5rem' }}>
                          {chg.new_fee.toFixed(2)} EUR
                        </td>
                        <td style={{ color: 'var(--text)', fontSize: '0.85rem', border: '1px solid var(--border)', padding: '0.5rem' }}>{renderWithLineBreaks(chg.reason) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

