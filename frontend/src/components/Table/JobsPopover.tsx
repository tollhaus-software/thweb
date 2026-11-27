import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash, X, Pencil, Search } from 'lucide-react';
import { t } from '../../utils/i18n';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  const isMobile = useIsMobile();
  const [isAdding, setIsAdding] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsAdding(false);
      setFilterText('');
      setError(null);
    }
  }, [isOpen, person?.id]);

  // Auto-focus filter input on desktop when opening selector
  useEffect(() => {
    if (isOpen && isAdding && !isMobile) {
      const timer = setTimeout(() => {
        filterInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAdding, isMobile]);

  const assignedJobs = useMemo(() => person?.jobs || [], [person?.jobs]);

  // Available jobs that are not yet assigned to this person
  const unassignedJobs = useMemo(() => {
    const assignedJobIds = new Set(assignedJobs.map((j) => j.id));
    return availableJobs.filter((j) => !assignedJobIds.has(j.id));
  }, [availableJobs, assignedJobs]);

  const filteredUnassignedJobs = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return unassignedJobs;
    return unassignedJobs.filter(
      (j) =>
        j.name.toLowerCase().includes(query) ||
        (j.description && j.description.toLowerCase().includes(query))
    );
  }, [unassignedJobs, filterText]);

  const handleSelectJobToAdd = async (jobIdToAdd: string) => {
    if (!person || !jobIdToAdd || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const nextJobIds = [...assignedJobs.map((j) => j.id), jobIdToAdd];
      await onSaveJobs(person.id, nextJobIds, person.type);
      setIsAdding(false);
      setFilterText('');
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Zuordnen des Jobs');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveJob = async (jobToRemove: JobItem) => {
    if (!person || isSubmitting) return;
    const confirmTemplate = t('removeJobConfirm') || 'Möchten Sie den Job „{job}“ wirklich entfernen?';
    const confirmMsg = confirmTemplate.replace('{job}', jobToRemove.name);
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const nextJobIds = assignedJobs.filter((j) => j.id !== jobToRemove.id).map((j) => j.id);
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
      <div className="popup-inner" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div
          className="popup-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
        <div>
          {assignedJobs.length === 0 ? (
            <div
              data-testid="no-jobs-placeholder"
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                padding: '0.5rem 0.25rem',
                textAlign: 'center',
              }}
            >
              {t('noJobs') || 'Noch kein Job zugeordnet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {assignedJobs.map((job) => (
                <div
                  key={job.id}
                  data-testid={`assigned-job-item-${job.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.3rem 0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--text-h)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={job.description || job.name}
                    >
                      {job.name}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      className="easy-edit-button delete-entry-btn"
                      disabled={isSubmitting}
                      onClick={() => handleRemoveJob(job)}
                      title={t('deleteJob') || 'Job entfernen'}
                      aria-label={`${job.name} entfernen`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        color: '#ef4444',
                        padding: '3px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: '4px',
                        opacity: isSubmitting ? 0.5 : 1,
                      }}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Job Section: '+' button or inline job selector list */}
        {!readOnly && (
          <>
            {!isAdding ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '2px 0',
                }}
              >
                <button
                  type="button"
                  className="easy-edit-button add-value-btn"
                  data-testid="add-job-plus-btn"
                  disabled={isSubmitting}
                  onClick={() => {
                    setError(null);
                    setFilterText('');
                    setIsAdding(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    background: 'var(--bg-subtle)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = 'var(--border)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
                  }}
                  title={t('addJob') || 'Job hinzufügen'}
                  aria-label={t('addJob') || 'Job hinzufügen'}
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <div
                data-testid="job-selector-panel"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.4rem 0.6rem',
                    backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-h)' }}>
                    {t('selectJob') || 'Job auswählen...'}
                  </span>
                  <button
                    type="button"
                    data-testid="cancel-add-job-btn"
                    onClick={() => {
                      setIsAdding(false);
                      setFilterText('');
                    }}
                    disabled={isSubmitting}
                    title={t('cancel') || 'Abbrechen'}
                    aria-label={t('cancel') || 'Abbrechen'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '0.78rem',
                      padding: '2px 4px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-h)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    <X size={14} />
                    <span>{t('cancel') || 'Abbrechen'}</span>
                  </button>
                </div>

                {unassignedJobs.length > 0 && (
                  <div
                    style={{
                      padding: '0.4rem 0.5rem',
                      borderBottom: '1px solid var(--border)',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Search
                      size={13}
                      style={{
                        position: 'absolute',
                        left: '0.85rem',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none',
                      }}
                    />
                    <input
                      ref={filterInputRef}
                      type="text"
                      data-testid="job-selector-filter-input"
                      placeholder={t('searchJobs') || 'Jobs suchen...'}
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setIsAdding(false);
                          setFilterText('');
                        } else if (e.key === 'Enter' && filteredUnassignedJobs.length === 1) {
                          e.preventDefault();
                          handleSelectJobToAdd(filteredUnassignedJobs[0].id);
                        }
                      }}
                      disabled={isSubmitting}
                      style={{
                        width: '100%',
                        padding: '0.3rem 0.5rem 0.3rem 1.65rem',
                        fontSize: '0.825rem',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--input-bg, var(--bg-surface))',
                        color: 'var(--text)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {unassignedJobs.length === 0 ? (
                  <div
                    style={{
                      padding: '0.75rem',
                      fontSize: '0.825rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                    }}
                  >
                    {t('noMoreJobsAvailable') || 'Keine weiteren Jobs verfügbar'}
                  </div>
                ) : filteredUnassignedJobs.length === 0 ? (
                  <div
                    data-testid="no-matching-jobs-placeholder"
                    style={{
                      padding: '0.75rem',
                      fontSize: '0.825rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                    }}
                  >
                    {t('noMatchingJobs') || 'Keine passenden Jobs gefunden'}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredUnassignedJobs.map((j, idx) => (
                      <button
                        key={j.id}
                        type="button"
                        className="job-selector-option"
                        data-testid={`job-selector-option-${j.name}`}
                        disabled={isSubmitting}
                        onClick={() => handleSelectJobToAdd(j.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          width: '100%',
                          padding: '0.5rem 0.65rem',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: idx === filteredUnassignedJobs.length - 1 ? 'none' : '1px solid var(--border)',
                          cursor: isSubmitting ? 'not-allowed' : 'pointer',
                          color: 'var(--text-h)',
                          fontSize: '0.85rem',
                          transition: 'background-color 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSubmitting) {
                            e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.04))';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title={j.description || j.name}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {j.name}
                          </span>
                          {j.description && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {j.description}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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
