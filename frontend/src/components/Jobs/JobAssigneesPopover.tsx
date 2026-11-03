import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { CellPopover } from '../Table/CellPopover';
import { t } from '../../utils/i18n';
import type { JobAssigneeParent, JobAssigneeEmployee, JobWithAssignees } from './JobsTab';

export interface JobAssigneesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  job: JobWithAssignees | null;
  onSaveAssignees: (jobId: string, parentIds: string[], employeeIds: string[]) => Promise<void>;
  fetchPeople?: () => Promise<{ parents: JobAssigneeParent[]; employees: JobAssigneeEmployee[] }>;
  availablePeople?: { parents: JobAssigneeParent[]; employees: JobAssigneeEmployee[] } | null;
  readOnly?: boolean;
}

export const JobAssigneesPopover: React.FC<JobAssigneesPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  job,
  onSaveAssignees,
  fetchPeople,
  availablePeople,
  readOnly = false,
}) => {
  const [quickFilter, setQuickFilter] = useState('');
  const [people, setPeople] = useState<{ parents: JobAssigneeParent[]; employees: JobAssigneeEmployee[] }>({
    parents: [],
    employees: [],
  });
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local selection state (Set of IDs)
  const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(new Set());
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync selected IDs when job prop changes or popover opens
  useEffect(() => {
    if (job) {
      setSelectedParentIds(new Set((job.parents || []).map((p) => p.id)));
      setSelectedEmployeeIds(new Set((job.employees || []).map((e) => e.id)));
    } else {
      setSelectedParentIds(new Set());
      setSelectedEmployeeIds(new Set());
    }
    setQuickFilter('');
    setError(null);
  }, [job, isOpen]);

  // Load people list if not already supplied
  useEffect(() => {
    if (!isOpen) return;

    if (availablePeople) {
      setPeople(availablePeople);
      return;
    }

    let isMounted = true;
    const loadData = async () => {
      setIsLoadingPeople(true);
      try {
        if (fetchPeople) {
          const res = await fetchPeople();
          if (isMounted) setPeople(res);
        } else {
          const res = await fetch('/api/jobs/people');
          if (!res.ok) throw new Error('Failed to fetch people');
          const data = await res.json();
          if (isMounted) setPeople(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Fehler beim Laden der Personen');
        }
      } finally {
        if (isMounted) setIsLoadingPeople(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, fetchPeople, availablePeople]);

  // Focus quick filter on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter parents and employees by quick filter
  const q = quickFilter.trim().toLowerCase();

  // Sort parents by family name, each family alphabetically, and parents alphabetically
  const sortedParents = useMemo(() => {
    return [...(people.parents || [])].sort((a, b) => {
      const famA = (a.family_name || a.last_name || '').toLowerCase();
      const famB = (b.family_name || b.last_name || '').toLowerCase();
      const famCmp = famA.localeCompare(famB, 'de');
      if (famCmp !== 0) return famCmp;
      const firstA = (a.first_name || '').toLowerCase();
      const firstB = (b.first_name || '').toLowerCase();
      const firstCmp = firstA.localeCompare(firstB, 'de');
      if (firstCmp !== 0) return firstCmp;
      return (a.last_name || '').toLowerCase().localeCompare((b.last_name || '').toLowerCase(), 'de');
    });
  }, [people.parents]);

  const sortedEmployees = useMemo(() => {
    return [...(people.employees || [])].sort((a, b) => {
      const firstA = (a.first_name || '').toLowerCase();
      const firstB = (b.first_name || '').toLowerCase();
      const firstCmp = firstA.localeCompare(firstB, 'de');
      if (firstCmp !== 0) return firstCmp;
      return (a.last_name || '').toLowerCase().localeCompare((b.last_name || '').toLowerCase(), 'de');
    });
  }, [people.employees]);

  const filteredParents = useMemo(() => {
    if (!q) return sortedParents;
    return sortedParents.filter((p) => {
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const famName = (p.family_name || '').toLowerCase();
      return fullName.includes(q) || famName.includes(q);
    });
  }, [sortedParents, q]);

  const filteredEmployees = useMemo(() => {
    if (!q) return sortedEmployees;
    return sortedEmployees.filter((e) => {
      const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
      const typeStr = (e.employee_type || '').toLowerCase();
      return fullName.includes(q) || typeStr.includes(q);
    });
  }, [sortedEmployees, q]);

  const handleToggleParent = async (parentId: string) => {
    if (!job || isSaving || readOnly) return;
    setError(null);
    const nextSet = new Set(selectedParentIds);
    if (nextSet.has(parentId)) {
      nextSet.delete(parentId);
    } else {
      nextSet.add(parentId);
    }
    setSelectedParentIds(nextSet);

    setIsSaving(true);
    try {
      await onSaveAssignees(job.id, Array.from(nextSet), Array.from(selectedEmployeeIds));
    } catch (err: any) {
      // Rollback on error
      setSelectedParentIds(selectedParentIds);
      setError(err?.message || 'Fehler beim Speichern der Zuordnung');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEmployee = async (employeeId: string) => {
    if (!job || isSaving || readOnly) return;
    setError(null);
    const nextSet = new Set(selectedEmployeeIds);
    if (nextSet.has(employeeId)) {
      nextSet.delete(employeeId);
    } else {
      nextSet.add(employeeId);
    }
    setSelectedEmployeeIds(nextSet);

    setIsSaving(true);
    try {
      await onSaveAssignees(job.id, Array.from(selectedParentIds), Array.from(nextSet));
    } catch (err: any) {
      // Rollback on error
      setSelectedEmployeeIds(selectedEmployeeIds);
      setError(err?.message || 'Fehler beim Speichern der Zuordnung');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <>
      <div
        className="large-popover-desktop-backdrop"
        onClick={onClose}
        aria-hidden="true"
        data-testid="job-assignees-popover-backdrop"
      />
      <CellPopover
        isOpen={isOpen}
        onClose={onClose}
        anchorEl={anchorEl}
        className="glass-popup large-popover job-assignees-popover"
        width={720}
        minWidth={320}
        closeOnScrollOutOfView={false}
      >
        <div className="large-popover-header">
          <h3 className="large-popover-title" data-testid="job-assignees-popover-title">
            {t('editJobAssignees') || 'Zugeordnete Personen bearbeiten'}: {job.name}
          </h3>
          <button
            type="button"
            className="large-popover-close-btn"
            onClick={onClose}
            title={t('close') || 'Schließen'}
            aria-label={t('close') || 'Schließen'}
            data-testid="close-job-assignees-popover-btn"
          >
            <X size={18} />
          </button>
        </div>

        <div className="large-popover-body">
          {error && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Quick Filter Textbox */}
          <div className="job-assignees-filter-wrap">
            <Search size={16} className="job-assignees-filter-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="job-assignees-filter-input"
              placeholder={t('quickFilter') || 'Schnellfilter...'}
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              data-testid="job-assignees-quick-filter-input"
              aria-label={t('quickFilter') || 'Schnellfilter...'}
            />
          </div>

          {isLoadingPeople ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2rem', color: 'var(--text-muted)' }}>
              <Loader2 size={20} className="spin" />
              <span>{t('loading') || 'Laden...'}</span>
            </div>
          ) : (
            <>
              {/* Section 1: Parents (Parents first) */}
              <div className="job-assignees-section" data-testid="job-assignees-parents-section">
                <div className="job-assignees-section-header">
                  <span>{t('jobAssignedParents') || 'Eltern'}</span>
                  <span className="job-assignees-count-badge">{filteredParents.length}</span>
                </div>
                {filteredParents.length === 0 ? (
                  <div className="job-assignees-empty">
                    {q ? t('noMatchingPersons') || 'Keine passenden Personen gefunden' : t('noParentsFound') || 'Keine Eltern gefunden'}
                  </div>
                ) : (
                  <div className="job-assignees-grid">
                    {filteredParents.map((parent) => {
                      const isAssigned = selectedParentIds.has(parent.id);
                      return (
                        <label
                          key={`parent-${parent.id}`}
                          className={`job-assignee-label ${isAssigned ? 'assigned' : ''}`}
                          data-testid={`job-assignee-parent-${parent.id}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              className="job-assignee-checkbox"
                              checked={isAssigned}
                              disabled={readOnly || isSaving}
                              onChange={() => handleToggleParent(parent.id)}
                              data-testid={`checkbox-parent-${parent.id}`}
                            />
                            <span className="job-assignee-name">
                              {`${parent.first_name || ''} ${parent.last_name || ''}`.trim()}
                            </span>
                          </div>
                          {parent.family_name && (
                            <span
                              className="person-badge job-assignee-family-tag job-parent-badge"
                              style={{
                                backgroundColor: 'var(--job-parent-badge-bg, rgba(59, 130, 246, 0.08))',
                                border: '1px solid var(--job-parent-badge-border, rgba(59, 130, 246, 0.2))',
                                color: 'var(--job-parent-badge-text, #1d4ed8)',
                                fontSize: '0.78rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                flexShrink: 0,
                              }}
                            >
                              Familie {parent.family_name}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Employees (Employees second) */}
              <div className="job-assignees-section" data-testid="job-assignees-employees-section">
                <div className="job-assignees-section-header">
                  <span>{t('jobAssignedEmployees') || 'Mitarbeitende'}</span>
                  <span className="job-assignees-count-badge">{filteredEmployees.length}</span>
                </div>
                {filteredEmployees.length === 0 ? (
                  <div className="job-assignees-empty">
                    {q ? t('noMatchingPersons') || 'Keine passenden Personen gefunden' : t('noEmployeesFound') || 'Keine Mitarbeitenden gefunden'}
                  </div>
                ) : (
                  <div className="job-assignees-grid">
                    {filteredEmployees.map((emp) => {
                      const isAssigned = selectedEmployeeIds.has(emp.id);
                      const typeLabel =
                        emp.employee_type === 'caregiver'
                          ? t('employeeTypeCaregiver') || 'Erzieher(in)'
                          : emp.employee_type === 'cook'
                          ? t('employeeTypeCook') || 'Koch/Köchin'
                          : emp.employee_type === 'bufdi'
                          ? t('employeeTypeBufdi') || 'Bufdi'
                          : emp.employee_type || 'Mitarbeitende';

                      return (
                        <label
                          key={`employee-${emp.id}`}
                          className={`job-assignee-label ${isAssigned ? 'assigned' : ''}`}
                          data-testid={`job-assignee-employee-${emp.id}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              className="job-assignee-checkbox"
                              checked={isAssigned}
                              disabled={readOnly || isSaving}
                              onChange={() => handleToggleEmployee(emp.id)}
                              data-testid={`checkbox-employee-${emp.id}`}
                            />
                            <span className="job-assignee-name">
                              {`${emp.first_name || ''} ${emp.last_name || ''}`.trim()}
                            </span>
                          </div>
                          <span
                            className="person-badge job-assignee-type-tag"
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: 'var(--success-dark, #047857)',
                              fontSize: '0.78rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              flexShrink: 0,
                            }}
                          >
                            {typeLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="large-popover-footer">
          {isSaving && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="spin" />
              <span>{t('saving') || 'Speichern...'}</span>
            </div>
          )}
          <button
            type="button"
            className="btn-primary large-popover-done-btn"
            onClick={onClose}
            data-testid="job-assignees-done-btn"
          >
            {t('done') || 'Fertig'}
          </button>
        </div>
      </CellPopover>
    </>
  );
};
