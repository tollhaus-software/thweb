import React, { useState } from 'react';
import { Plus, Trash, X, Pencil } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';

export interface JobItem {
  id: string;
  name: string;
  description?: string;
  contact_email?: string;
}

export interface PersonWithJobs {
  id: string;
  first_name: string;
  last_name: string;
  family_id?: string;
  jobs?: JobItem[];
  type?: 'parent' | 'employee';
}

export interface JobsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  person: PersonWithJobs | null;
  availableJobs: JobItem[];
  onSaveJobs: (personId: string, jobIds: string[], personType?: 'parent' | 'employee') => Promise<void>;
  readOnly?: boolean;
}

export const JobsPopover: React.FC<JobsPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  person,
  availableJobs,
  onSaveJobs,
  readOnly = false,
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedJobs = person?.jobs || [];
  const assignedJobIds = new Set(assignedJobs.map((j) => j.id));

  // Available jobs that are not yet assigned to this person
  const unassignedJobs = availableJobs.filter((j) => !assignedJobIds.has(j.id));

  const handleAddJob = async () => {
    if (!person || !selectedJobId || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const nextJobIds = [...assignedJobs.map((j) => j.id), selectedJobId];
      await onSaveJobs(person.id, nextJobIds, person.type);
      setSelectedJobId('');
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Zuordnen des Jobs');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveJob = async (jobIdToRemove: string) => {
    if (!person || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const nextJobIds = assignedJobs.filter((j) => j.id !== jobIdToRemove).map((j) => j.id);
      await onSaveJobs(person.id, nextJobIds, person.type);
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Entfernen des Jobs');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!person) return null;

  const personName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Person';

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={360}
      minWidth={320}
      className="glass-popup jobs-popover"
    >
      <div className="popup-inner" style={{ padding: '0.85rem' }}>
        <div
          className="popup-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-h)' }}>
              {t('manageJobs') || 'Jobs verwalten'}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{personName}</span>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Schließen"
            title="Schließen"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '0.2rem',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.4rem 0.6rem',
              marginBottom: '0.6rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              borderRadius: '4px',
              fontSize: '0.8rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Assigned Jobs List */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
            {t('assignedJobs') || 'Zugeordnete Jobs'}:
          </div>
          {assignedJobs.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>
              {t('noJobs') || 'Keine Jobs'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {assignedJobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem',
                    backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <span style={{ userSelect: 'none', fontSize: '0.9rem' }}>🔨</span>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.description || job.name}>
                      {job.name}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleRemoveJob(job.id)}
                      title={t('deleteJob') || 'Job entfernen'}
                      aria-label={`${job.name} entfernen`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Job section */}
        {!readOnly && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                disabled={isSubmitting || unassignedJobs.length === 0}
                style={{
                  flex: 1,
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.85rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text)',
                }}
              >
                <option value="">{t('selectJob') || 'Job auswählen...'}</option>
                {unassignedJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedJobId || isSubmitting}
                onClick={handleAddJob}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.85rem',
                  borderRadius: '4px',
                  cursor: !selectedJobId || isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !selectedJobId || isSubmitting ? 0.6 : 1,
                }}
              >
                <Plus size={14} />
                <span>{t('assignJob') || 'Zuordnen'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </CellPopover>
  );
};

export interface JobsCellProps {
  id?: string;
  person: PersonWithJobs;
  jobs?: JobItem[];
  isActive: boolean;
  onOpenManage: (person: PersonWithJobs, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

export const JobsCell: React.FC<JobsCellProps> = ({
  id,
  person,
  jobs,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const cellId = id || `cell-jobs-${person.type || 'person'}-${person.id}`;
  const effectiveJobs = jobs || person.jobs || [];

  return (
    <div
      id={cellId}
      className={`jobs-cell-wrapper ${isActive ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenManage(person, e.currentTarget);
      }}
      style={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.4rem',
        padding: '2px 4px',
        borderRadius: '4px',
        width: '100%',
        minHeight: '24px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
      }}
      title={t('manageJobs') || 'Jobs verwalten'}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        {effectiveJobs.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>-</span>
        ) : (
          effectiveJobs.map((j) => (
            <div
              key={j.id}
              className="job-item-row job-badge"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                fontSize: '0.875rem',
                color: 'var(--text-h)',
                lineHeight: 1.3,
              }}
              title={j.description || j.name}
            >
              <span
                style={{
                  userSelect: 'none',
                  fontSize: '0.9rem',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                🔨
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {j.name}
              </span>
            </div>
          ))
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(person, cellEl);
          }}
          className="cell-edit-pencil-btn"
          title={t('manageJobs') || 'Jobs verwalten'}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};
