import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CellPopover } from '../Table/CellPopover';
import { Search, X, Loader2, Shield } from 'lucide-react';
import type { JobWithAssignees } from './JobsTab';
import { t } from '../../utils/i18n';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions?: string[];
}

interface JobRolesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  job: JobWithAssignees | null;
  onSaveRoles: (jobId: string, roles: string[]) => Promise<void>;
  availableRoles?: Role[];
  readOnly?: boolean;
}

export const JobRolesPopover: React.FC<JobRolesPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  job,
  onSaveRoles,
  availableRoles,
  readOnly = false,
}) => {
  const [rolesList, setRolesList] = useState<Role[]>(availableRoles || []);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync selected roles with incoming job
  useEffect(() => {
    if (job) {
      setSelectedRoles(new Set(job.roles || []));
    } else {
      setSelectedRoles(new Set());
    }
    setQuickFilter('');
    setError(null);
  }, [job, isOpen]);

  // Fetch roles list if not provided
  useEffect(() => {
    if (!isOpen) return;
    if (availableRoles && availableRoles.length > 0) {
      setRolesList(availableRoles);
      return;
    }

    let isMounted = true;
    const fetchRoles = async () => {
      try {
        const res = await fetch('/api/roles');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const arr = Array.isArray(data) ? data : (data?.roles || []);
            setRolesList(arr);
          }
        }
      } catch (err) {
        console.error('Failed to fetch roles', err);
      }
    };

    fetchRoles();
    return () => {
      isMounted = false;
    };
  }, [isOpen, availableRoles]);

  // Auto focus search input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const q = quickFilter.trim().toLowerCase();

  const sortedRoles = useMemo(() => {
    return [...rolesList].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [rolesList]);

  const filteredRoles = useMemo(() => {
    if (!q) return sortedRoles;
    return sortedRoles.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [sortedRoles, q]);

  const handleToggleRole = async (roleId: string) => {
    if (!job || isSaving || readOnly) return;
    setError(null);
    const nextSet = new Set(selectedRoles);
    if (nextSet.has(roleId)) {
      nextSet.delete(roleId);
    } else {
      nextSet.add(roleId);
    }
    setSelectedRoles(nextSet);

    setIsSaving(true);
    try {
      await onSaveRoles(job.id, Array.from(nextSet));
    } catch (err: unknown) {
      // Revert optimistic update
      setSelectedRoles(new Set(job.roles || []));
      const message = err instanceof Error ? err.message : 'Fehler beim Speichern der Rollen';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!job || isSaving || readOnly || selectedRoles.size === 0) return;
    setError(null);
    setSelectedRoles(new Set());

    setIsSaving(true);
    try {
      await onSaveRoles(job.id, []);
    } catch (err: unknown) {
      setSelectedRoles(new Set(job.roles || []));
      const message = err instanceof Error ? err.message : 'Fehler beim Speichern der Rollen';
      setError(message);
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
        data-testid="job-roles-popover-backdrop"
      />
      <CellPopover
        isOpen={isOpen}
        onClose={onClose}
        anchorEl={anchorEl}
        className="glass-popup large-popover job-roles-popover"
        width={460}
        minWidth={300}
        closeOnScrollOutOfView={false}
      >
        <div className="large-popover-header">
          <h3 className="large-popover-title" data-testid="job-roles-popover-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Shield size={16} />
            <span>{t('editJobRoles') || 'Job-Rollen bearbeiten'}: {job.name}</span>
          </h3>
          <button
            type="button"
            className="large-popover-close-btn"
            onClick={onClose}
            title={t('close') || 'Schließen'}
            aria-label={t('close') || 'Schließen'}
            data-testid="close-job-roles-popover-btn"
          >
            <X size={18} />
          </button>
        </div>

        <div className="large-popover-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          {error && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                borderRadius: '6px',
                fontSize: '0.85rem',
                marginBottom: '0.5rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Quick Filter & Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="job-assignees-filter-wrap" style={{ flex: 1, margin: 0 }}>
              <Search size={16} className="job-assignees-filter-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="job-assignees-filter-input"
                placeholder={t('searchRoles') || 'Rollen suchen...'}
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value)}
                data-testid="job-roles-filter-input"
                aria-label={t('searchRoles') || 'Rollen suchen...'}
              />
            </div>
            {!readOnly && selectedRoles.size > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isSaving}
                className="btn-secondary"
                style={{
                  fontSize: '0.8rem',
                  padding: '0.4rem 0.6rem',
                  whiteSpace: 'nowrap',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
                data-testid="job-roles-clear-all-btn"
              >
                {t('deselectAll') || 'Alle abwählen'}
              </button>
            )}
          </div>

          {/* Status summary */}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {selectedRoles.size} {t('rolesCount')?.replace('{count}', String(selectedRoles.size)) || 'ausgewählt'}
          </div>

          {/* Roles List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.5rem',
              backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
            data-testid="job-roles-list"
          >
            {filteredRoles.length === 0 ? (
              <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('noMatchingRoles') || 'Keine passenden Rollen gefunden'}
              </div>
            ) : (
              filteredRoles.map((role) => {
                const isChecked = selectedRoles.has(role.id);
                return (
                  <label
                    key={role.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.4rem 0.5rem',
                      borderRadius: '4px',
                      cursor: readOnly ? 'default' : 'pointer',
                      backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                      transition: 'background-color 0.15s ease',
                    }}
                    data-testid={`job-role-label-${role.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={readOnly || isSaving}
                      onChange={() => handleToggleRole(role.id)}
                      style={{ cursor: readOnly ? 'default' : 'pointer', marginTop: '2px' }}
                      data-testid={`job-role-checkbox-${role.id}`}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ color: isChecked ? 'var(--primary-dark, #2563eb)' : 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>
                          {role.name || role.id}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ({role.id})
                        </span>
                        {role.permissions && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(0,0,0,0.06)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {role.permissions.includes('*') ? 'Admin (*)' : `${role.permissions.length} Berechtigung${role.permissions.length === 1 ? '' : 'en'}`}
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                          {role.description}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="large-popover-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isSaving ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="spin" />
              <span>{t('saving') || 'Speichern...'}</span>
            </div>
          ) : <div />}
          <button
            type="button"
            className="btn-primary large-popover-done-btn"
            onClick={onClose}
            data-testid="job-roles-done-btn"
          >
            {t('done') || 'Fertig'}
          </button>
        </div>
      </CellPopover>
    </>
  );
};
