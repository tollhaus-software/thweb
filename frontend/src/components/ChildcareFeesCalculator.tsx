import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckSquare, Square, Info } from 'lucide-react';
import { t, CURRENT_LOCALE } from '../utils/i18n';

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

const FeeTooltip: React.FC<{ description: string; change?: FeeChangeResult }> = ({
  description,
  change,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPinned) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPinned(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPinned]);

  const visible = isHovered || isPinned;

  return (
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: '50%',
            transform: 'translateX(50%)',
            marginBottom: '8px',
            background: 'var(--bg-surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.75rem',
            lineHeight: '1.5',
            width: '480px',
            textAlign: 'left',
            boxShadow: 'var(--shadow)',
            zIndex: 100,
            pointerEvents: 'auto',
            cursor: 'default',
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {change && (
            <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '2px' }}>{t('changeHeader')}</div>
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
          <div>
            {renderWithLineBreaks(description) || t('noDetails')}
          </div>
        </div>
      )}
    </div>
  );
};

export const ChildcareFeesCalculator: React.FC<ChildcareFeesCalculatorProps> = ({
  token,
  families,
}) => {
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
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>(
    families.map((f) => f.id)
  );
  const [familySearch, setFamilySearch] = useState('');

  // Results state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (families && families.length > 0 && !hasInitializedRef.current) {
      setSelectedFamilyIds(families.map((f) => f.id));
      hasInitializedRef.current = true;
    }
  }, [families]);

  const activeRequestIdRef = useRef(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const prevSelectedFamilyIdsRef = useRef<string[] | null>(null);
  const prevRangeRef = useRef<string | null>(null);
  const prevTokenRef = useRef<string | null>(null);

  // Derived validation error
  const validationError = useMemo(() => {
    if (families.length > 0 && selectedFamilyIds.length === 0) {
      return t('selectAtLeastOneFamily') || 'Please select at least one family.';
    }
    const startMonthStr = `${startYear}-${startMonth}`;
    const endMonthStr = `${endYear}-${endMonth}`;
    if (startMonthStr > endMonthStr) {
      return t('startMonthAfterEndMonth') || 'Start month cannot be after end month.';
    }
    return null;
  }, [families.length, selectedFamilyIds.length, startYear, startMonth, endYear, endMonth]);

  const error = validationError || apiError;

  // Sort family fees results to match the order of the families prop, filtered by selected families
  const sortedFamilyFees = useMemo(() => {
    if (!results || !results.family_fees) return [];
    return results.family_fees
      .filter((res) => selectedFamilyIds.includes(res.family_id))
      .sort((a, b) => {
        const indexA = families.findIndex((f) => f.id === a.family_id);
        const indexB = families.findIndex((f) => f.id === b.family_id);
        return indexA - indexB;
      });
  }, [results, families, selectedFamilyIds]);

  // Sort fee changes primarily by "Wirksamer Monat" (month string), then secondary by family name, filtered by selected families
  const sortedFeeChanges = useMemo(() => {
    if (!results || !results.fee_changes) return [];
    return results.fee_changes
      .filter((chg) => selectedFamilyIds.includes(chg.family_id))
      .sort((a, b) => {
        if (a.month !== b.month) {
          return a.month.localeCompare(b.month);
        }
        return (a.family_name || '').localeCompare(b.family_name || '');
      });
  }, [results, selectedFamilyIds]);

  // Helper to format family names
  const getFamilyName = (f: Family) => {
    const lastNames = Array.from(
      new Set((f.parents || []).map((p) => p.last_name).filter(Boolean))
    );
    return lastNames.join(' / ') || 'New Family';
  };

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
    if (validationError || selectedFamilyIds.length === 0) {
      prevSelectedFamilyIdsRef.current = selectedFamilyIds;
      return;
    }

    const startMonthStr = `${startYear}-${startMonth}`;
    const endMonthStr = `${endYear}-${endMonth}`;
    const currentRange = `${startMonthStr}_${endMonthStr}`;

    const isFirstRun = prevSelectedFamilyIdsRef.current === null;
    const tokenChanged = prevTokenRef.current !== token;
    const rangeChanged = prevRangeRef.current !== currentRange;
    const prevSelected = prevSelectedFamilyIdsRef.current || [];
    const hasAddedFamilies = selectedFamilyIds.some((id) => !prevSelected.includes(id));

    prevSelectedFamilyIdsRef.current = selectedFamilyIds;
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
      Authorization: `Bearer ${token}`,
    };

    fetch('/api/fees/calculate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        start_month: startMonthStr,
        end_month: endMonthStr,
        family_ids: selectedFamilyIds,
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
  }, [token, validationError, startYear, startMonth, endYear, endMonth, selectedFamilyIds]);

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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.25rem' }}>
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

        {/* Families Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('selectFamilies') || 'Select Families'}
          </label>
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
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {selectedFamilyIds.length} {t('familiesSelected') || 'families selected'}
          </div>
        </div>

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
          {/* Family Fees Grid */}
          <div
            className="table-container"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1.25rem',
              boxShadow: 'var(--shadow)',
              overflowX: 'auto',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-h)', fontSize: '1rem', fontWeight: 600 }}>
              {t('familyFeesGrid')}
            </h4>
            <table className="data-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{t('family')}</th>
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
                    <td style={{ fontWeight: 600, color: 'var(--text-h)', border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{res.family_name}</td>
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

          {/* Fee Changes Table */}
          <div
            className="table-container"
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
            {sortedFeeChanges.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem' }}>
                {t('noFeeChanges')}
              </div>
            ) : (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{t('family')}</th>
                    <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '150px' }}>{t('effectiveMonth')}</th>
                    <th style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem', width: '140px' }}>{t('previousFee')}</th>
                    <th style={{ textAlign: 'right', border: '1px solid var(--border)', padding: '0.5rem', width: '120px' }}>{t('newFee')}</th>
                    <th style={{ border: '1px solid var(--border)', padding: '0.5rem' }}>{t('reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFeeChanges.map((chg, idx) => (
                    <tr key={`${chg.family_id}-${chg.month}-${idx}`}>
                      <td style={{ fontWeight: 600, color: 'var(--text-h)', border: '1px solid var(--border)', padding: '0.5rem', whiteSpace: 'nowrap' }}>{chg.family_name}</td>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
