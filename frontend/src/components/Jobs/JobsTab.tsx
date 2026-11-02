import React, { useState, useMemo, useRef } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash, X, Search, Bold, Italic, Underline, Link as LinkIcon } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { ConfirmDeleteModal } from '../Table/ConfirmDeleteModal';
import { NotesEditor } from '../Table/NotesEditor';
import EasyEdit, { Types as EasyEditTypes } from '../InlineEdit';
import { JobAssigneesPopover } from './JobAssigneesPopover';
import { JobRolesPopover, type Role } from './JobRolesPopover';
import { t } from '../../utils/i18n';

const EasyEditComponent = EasyEdit;

export interface JobAssigneeParent {
  id: string;
  family_id?: string;
  family_name?: string;
  first_name: string;
  last_name: string;
}

export interface JobAssigneeEmployee {
  id: string;
  first_name: string;
  last_name: string;
  employee_type: string;
}

export interface JobWithAssignees {
  id: string;
  name: string;
  description: string;
  contact_email: string;
  roles?: string[];
  parents: JobAssigneeParent[];
  employees: JobAssigneeEmployee[];
  created_at?: string;
  updated_at?: string;
}

export interface JobsTabProps {
  jobs: JobWithAssignees[];
  canWriteJobs: boolean;
  canReadJobRoles?: boolean;
  canWriteJobRoles?: boolean;
  availableRoles?: Role[];
  searchQuery?: string;
  isCreateModalOpen?: boolean;
  onOpenCreateModal?: () => void;
  onCloseCreateModal?: () => void;
  onCreateJob: (job: { name: string; description: string; contact_email: string; roles?: string[] }) => Promise<void>;
  onUpdateJob: (id: string, job: { name: string; description: string; contact_email: string; roles?: string[] }) => Promise<void>;
  onDeleteJob: (id: string) => Promise<void>;
  onUpdateJobAssignees?: (jobId: string, parentIds: string[], employeeIds: string[]) => Promise<void>;
  onUpdateJobRoles?: (jobId: string, roles: string[]) => Promise<void>;
  onFetchPeople?: () => Promise<{ parents: JobAssigneeParent[]; employees: JobAssigneeEmployee[] }>;
  onJumpToPerson?: (personId: string, type: 'parent' | 'employee', familyId?: string, familyName?: string) => void;
}

export const JobsTab: React.FC<JobsTabProps> = ({
  jobs,
  canWriteJobs,
  canReadJobRoles = false,
  canWriteJobRoles = false,
  availableRoles,
  searchQuery,
  isCreateModalOpen,
  onOpenCreateModal,
  onCloseCreateModal,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onUpdateJobAssignees,
  onUpdateJobRoles,
  onFetchPeople,
  onJumpToPerson,
}) => {
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const activeSearchQuery = searchQuery !== undefined ? searchQuery : internalSearchQuery;

  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobWithAssignees | null>(null);
  const [jobToDelete, setJobToDelete] = useState<JobWithAssignees | null>(null);

  // Assignees Popover state
  const [activeJobForAssignees, setActiveJobForAssignees] = useState<JobWithAssignees | null>(null);
  const [assigneesPopoverAnchor, setAssigneesPopoverAnchor] = useState<HTMLElement | null>(null);

  const currentJobForAssignees = activeJobForAssignees
    ? jobs.find((j) => j.id === activeJobForAssignees.id) || activeJobForAssignees
    : null;

  const handleSaveAssignees = async (jobId: string, parentIds: string[], employeeIds: string[]) => {
    if (onUpdateJobAssignees) {
      await onUpdateJobAssignees(jobId, parentIds, employeeIds);
    } else {
      const res = await fetch(`/api/jobs/${jobId}/assignees`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_ids: parentIds, employee_ids: employeeIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update job assignees');
      }
    }
  };

  // Roles Popover state
  const [activeJobForRoles, setActiveJobForRoles] = useState<JobWithAssignees | null>(null);
  const [rolesPopoverAnchor, setRolesPopoverAnchor] = useState<HTMLElement | null>(null);

  const currentJobForRoles = activeJobForRoles
    ? jobs.find((j) => j.id === activeJobForRoles.id) || activeJobForRoles
    : null;

  const handleSaveRoles = async (jobId: string, roles: string[]) => {
    if (onUpdateJobRoles) {
      await onUpdateJobRoles(jobId, roles);
    } else {
      const res = await fetch(`/api/jobs/${jobId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update job roles');
      }
    }
  };

  const isModalOpen = (isCreateModalOpen !== undefined ? isCreateModalOpen : internalModalOpen) || editingJob !== null;

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    contact_email: string;
    roles: string[];
  }>({
    name: '',
    description: '',
    contact_email: '',
    roles: [],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descModalTextareaRef = useRef<HTMLTextAreaElement>(null);

  const insertModalFormatting = (prefix: string, suffix: string, defaultText = '') => {
    const textarea = descModalTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setFormData((prev) => ({ ...prev, description: newText }));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const handleModalInsertLink = () => {
    const textarea = descModalTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    if (selectedText.startsWith('http://') || selectedText.startsWith('https://')) {
      insertModalFormatting('[Link-Titel](', ')', selectedText);
    } else if (selectedText) {
      insertModalFormatting('[', '](https://example.com)', selectedText);
    } else {
      insertModalFormatting('[Link-Titel](https://example.com)', '', '');
    }
  };

  const openCreateModal = () => {
    setEditingJob(null);
    setFormData({ name: '', description: '', contact_email: '', roles: [] });
    setFormError(null);
    if (onOpenCreateModal) {
      onOpenCreateModal();
    } else {
      setInternalModalOpen(true);
    }
  };

  const closeModal = () => {
    setEditingJob(null);
    if (onCloseCreateModal) {
      onCloseCreateModal();
    }
    setInternalModalOpen(false);
    setFormData({ name: '', description: '', contact_email: '', roles: [] });
    setFormError(null);
  };

  const openEditModal = (job: JobWithAssignees) => {
    setEditingJob(job);
    setFormData({
      name: job.name || '',
      description: job.description || '',
      contact_email: job.contact_email || '',
      roles: job.roles || [],
    });
    setFormError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError(t('jobNameRequired') || 'Job-Name ist erforderlich');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingJob) {
        await onUpdateJob(editingJob.id, formData);
      } else {
        await onCreateJob(formData);
      }
      closeModal();
    } catch (err: any) {
      setFormError(err?.message || 'Fehler beim Speichern');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    try {
      await onDeleteJob(jobToDelete.id);
      setJobToDelete(null);
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Löschen');
    }
  };

  // Filtered jobs based on search query
  const filteredJobs = useMemo(() => {
    const q = activeSearchQuery.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const nameMatch = j.name.toLowerCase().includes(q);
      const descMatch = (j.description || '').toLowerCase().includes(q);
      const emailMatch = (j.contact_email || '').toLowerCase().includes(q);
      const parentMatch = (j.parents || []).some((p) =>
        `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(q)
      );
      const empMatch = (j.employees || []).some((e) =>
        `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase().includes(q)
      );
      return nameMatch || descMatch || emailMatch || parentMatch || empMatch;
    });
  }, [jobs, activeSearchQuery]);

  const columns = useMemo<ColumnDef<JobWithAssignees>[]>(() => {
    return [
      {
        id: 'name',
        accessorKey: 'name',
        header: t('jobName') || 'Job-Name',
        size: 180,
        cell: (info) => {
          const row = info.row.original;
          if (!canWriteJobs) {
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ userSelect: 'none' }}>🔨</span>
                <span style={{ fontWeight: 600 }}>{row.name}</span>
              </div>
            );
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ userSelect: 'none' }}>🔨</span>
              <EasyEditComponent
                type={EasyEditTypes.TEXT}
                value={row.name || ''}
                onSave={async (val: string) => {
                  const trimmed = val.trim();
                  if (!trimmed || trimmed === row.name) return;
                  await onUpdateJob(row.id, {
                    name: trimmed,
                    description: row.description,
                    contact_email: row.contact_email,
                  });
                }}
                editButtonLabel={<Pencil size={13} />}
                instructions={t('editJobName') || 'Job-Name bearbeiten'}
                displayComponent={<span style={{ fontWeight: 600 }}>{row.name}</span>}
                viewAttributes={{}}
                inputAttributes={{}}
                onCancel={() => {}}
                onValidate={(val: string) => !!val.trim()}
              />
            </div>
          );
        },
      },
      {
        id: 'description',
        accessorKey: 'description',
        header: t('jobDescription') || 'Beschreibung',
        size: 260,
        cell: (info) => {
          const row = info.row.original;
          const desc = row.description;
          return (
            <NotesEditor
              value={desc || ''}
              onSave={async (val: string) => {
                if (val === desc) return;
                await onUpdateJob(row.id, {
                  name: row.name,
                  description: val,
                  contact_email: row.contact_email,
                });
              }}
              placeholder={t('addJobDescription') || 'Beschreibung hinzufügen...'}
              title={t('jobDescription') || 'Beschreibung'}
              readOnly={!canWriteJobs}
            />
          );
        },
      },
      {
        id: 'contact_email',
        accessorKey: 'contact_email',
        header: t('jobContactEmail') || 'Kontakt-E-Mail',
        size: 220,
        cell: (info) => {
          const row = info.row.original;
          const email = row.contact_email;
          if (!canWriteJobs) {
            return email ? (
              <a href={`mailto:${email}`} className="overview-contact-link">
                {email}
              </a>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>-</span>
            );
          }
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={email || ''}
              onSave={async (val: string) => {
                const trimmed = val.trim();
                if (trimmed === email) return;
                await onUpdateJob(row.id, {
                  name: row.name,
                  description: row.description,
                  contact_email: trimmed,
                });
              }}
              placeholder="-"
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editJobContactEmail') || 'Kontakt-E-Mail bearbeiten'}
              displayComponent={
                email ? (
                  <a
                    href={`mailto:${email}`}
                    className="overview-contact-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                )
              }
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        },
      },
      {
        id: 'assigned_persons',
        header: t('assignedPersons') || 'Zugeordnete Personen',
        size: 320,
        cell: (info) => {
          const row = info.row.original;
          const parents = row.parents || [];
          const employees = row.employees || [];
          const totalAssigned = parents.length + employees.length;
          const cellId = `cell-job-assignees-${row.id}`;
          const isCurrentActive = Boolean(assigneesPopoverAnchor && activeJobForAssignees?.id === row.id);

          return (
            <div
              id={cellId}
              className={`job-assignees-cell-wrapper ${isCurrentActive ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.4rem',
                width: '100%',
                minHeight: '24px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                {totalAssigned === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                ) : (
                  <>
                    {parents.map((p) => (
                      <span
                        key={`p-${p.id}`}
                        className="person-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 7px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: 'var(--primary-dark, #1d4ed8)',
                          cursor: onJumpToPerson ? 'pointer' : 'default',
                        }}
                        title={t('cookTypeParent') || 'Elternteil'}
                        onClick={() => onJumpToPerson?.(p.id, 'parent')}
                      >
                        <span>{`${p.first_name || ''} ${p.last_name || ''}`.trim()}</span>
                      </span>
                    ))}
                    {employees.map((e) => {
                      const typeLabel =
                        e.employee_type === 'caregiver'
                          ? t('employeeTypeCaregiver') || 'Erzieher(in)'
                          : e.employee_type === 'cook'
                          ? t('employeeTypeCook') || 'Koch/Köchin'
                          : e.employee_type === 'bufdi'
                          ? t('employeeTypeBufdi') || 'Bufdi'
                          : e.employee_type || 'Mitarbeitende';
                      return (
                        <span
                          key={`e-${e.id}`}
                          className="person-badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: 'var(--success-dark, #047857)',
                            cursor: onJumpToPerson ? 'pointer' : 'default',
                          }}
                          title={typeLabel}
                          onClick={() => onJumpToPerson?.(e.id, 'employee')}
                        >
                          <span>{`${e.first_name || ''} ${e.last_name || ''}`.trim()}</span>
                        </span>
                      );
                    })}
                  </>
                )}
              </div>
              {canWriteJobs && (
                <button
                  type="button"
                  className="cell-edit-pencil-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const targetEl = document.getElementById(cellId) || e.currentTarget;
                    setActiveJobForAssignees(row);
                    setAssigneesPopoverAnchor(targetEl);
                  }}
                  title={t('editJobAssignees') || 'Zugeordnete Personen bearbeiten'}
                  aria-label={`${t('editJobAssignees')} ${row.name}`}
                  data-testid={`edit-job-assignees-btn-${row.id}`}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          );
        },
      },
      ...(canReadJobRoles
        ? [
            {
              id: 'roles',
              header: t('grantedRoles') || 'Rollen',
              size: 260,
              cell: (info: any) => {
                const row = info.row.original;
                const roles = row.roles || [];
                const cellId = `cell-job-roles-${row.id}`;
                const isCurrentActive = Boolean(rolesPopoverAnchor && activeJobForRoles?.id === row.id);

                return (
                  <div
                    id={cellId}
                    className={`job-roles-cell-wrapper ${isCurrentActive ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem',
                      width: '100%',
                      minHeight: '24px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                      {roles.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      ) : (
                        roles.map((r: string) => {
                          const matched = availableRoles?.find((ar) => ar.id === r);
                          const label = matched?.name || r;
                          return (
                            <span
                              key={r}
                              className="role-badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 7px',
                                borderRadius: '12px',
                                fontSize: '0.8rem',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                color: 'var(--primary-dark, #2563eb)',
                                fontWeight: 500,
                              }}
                              title={matched?.description || r}
                            >
                              <span>{label}</span>
                            </span>
                          );
                        })
                      )}
                    </div>
                    {canWriteJobRoles && (
                      <button
                        type="button"
                        className="cell-edit-pencil-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetEl = document.getElementById(cellId) || e.currentTarget;
                          setActiveJobForRoles(row);
                          setRolesPopoverAnchor(targetEl);
                        }}
                        title={t('editJobRoles') || 'Job-Rollen bearbeiten'}
                        aria-label={`${t('editJobRoles')} ${row.name}`}
                        data-testid={`edit-job-roles-btn-${row.id}`}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                );
              },
            },
          ]
        : []),
      ...(canWriteJobs
        ? [
            {
              id: 'actions',
              header: '',
              size: 90,
              cell: (info: any) => {
                const job = info.row.original;
                const totalAssigned = (job.parents?.length || 0) + (job.employees?.length || 0);
                const hasAssignees = totalAssigned > 0;
                const deleteTooltip = hasAssignees
                  ? t('cannotDeleteJobWithAssignments') ||
                    'Job kann nicht gelöscht werden, da noch Personen zugeordnet sind.'
                  : t('deleteJob') || 'Job löschen';

                return (
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => openEditModal(job)}
                      title={t('editJob') || 'Job bearbeiten'}
                      aria-label={`${t('editJob')} ${job.name}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <span title={deleteTooltip} style={{ display: 'inline-flex' }}>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={hasAssignees}
                        onClick={() => setJobToDelete(job)}
                        aria-label={`${t('deleteJob')} ${job.name}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: hasAssignees ? 'not-allowed' : 'pointer',
                          opacity: hasAssignees ? 0.35 : 1,
                          color: hasAssignees ? 'var(--text-muted)' : '#ef4444',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash size={15} />
                      </button>
                    </span>
                  </div>
                );
              },
            },
          ]
        : []),
    ];
  }, [canWriteJobs, canReadJobRoles, canWriteJobRoles, availableRoles, onJumpToPerson, onUpdateJob, assigneesPopoverAnchor, activeJobForAssignees, rolesPopoverAnchor, activeJobForRoles]);

  return (
    <div
      className="jobs-tab-container"
      style={{
        padding: searchQuery !== undefined ? 0 : '1rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Standalone Tab Header Controls when not integrated in App controls-row */}
      {searchQuery === undefined && (
        <div
          className="jobs-header-bar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '220px', maxWidth: '360px', flex: 1 }}>
            <div className="search-box" style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={internalSearchQuery}
                onChange={(e) => setInternalSearchQuery(e.target.value)}
                placeholder={t('searchJobs') || 'Jobs suchen...'}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem 0.45rem 2.2rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          {canWriteJobs && (
            <button
              type="button"
              className="btn-primary"
              onClick={openCreateModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <Plus size={16} />
              <span>{t('addJobBtn') || 'Job'}</span>
            </button>
          )}
        </div>
      )}

      {/* Jobs Table */}
      <DataTable
        className="card-table jobs-table"
        data={filteredJobs}
        columns={columns}
        enableSorting={false}
      />

      {/* Add / Edit Job Modal */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => !isSubmitting && closeModal()}
        >
          <div
            className="modal-content glass-card"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-h)' }}>
                {editingJob ? t('editJob') || 'Job bearbeiten' : t('addJob') || 'Job hinzufügen'}
              </h3>
              <button
                type="button"
                className="btn-icon"
                disabled={isSubmitting}
                onClick={closeModal}
                aria-label="Schließen"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ padding: '1.25rem' }}>
              {formError && (
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    marginBottom: '1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-h)' }}>
                  {t('jobNameLabel') || 'Name:'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="job-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Hygiene, Garten"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.7rem',
                    fontSize: '0.9rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label htmlFor="job-desc" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-h)' }}>
                    {t('jobDescriptionLabel') || 'Beschreibung:'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      title={`${t('bold') || 'Bold'}`}
                      onClick={() => insertModalFormatting('**', '**')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        padding: 0,
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                      aria-label="Bold"
                    >
                      <Bold size={11} />
                    </button>
                    <button
                      type="button"
                      title={`${t('italic') || 'Italic'}`}
                      onClick={() => insertModalFormatting('*', '*')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        padding: 0,
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                      aria-label="Italic"
                    >
                      <Italic size={11} />
                    </button>
                    <button
                      type="button"
                      title={`${t('underline') || 'Underline'}`}
                      onClick={() => insertModalFormatting('<u>', '</u>')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        padding: 0,
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                      aria-label="Underline"
                    >
                      <Underline size={11} />
                    </button>
                    <button
                      type="button"
                      title={`${t('link') || 'Link'}`}
                      onClick={handleModalInsertLink}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        padding: 0,
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                      aria-label="Link"
                    >
                      <LinkIcon size={11} />
                    </button>
                  </div>
                </div>
                <textarea
                  id="job-desc"
                  ref={descModalTextareaRef}
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Aufgaben und Verantwortungsbereich..."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.7rem',
                    fontSize: '0.9rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-h)' }}>
                  {t('jobContactEmailLabel') || 'Kontakt-E-Mail (optional):'}
                </label>
                <input
                  id="job-email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="kontakt@tollhaus.de"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.7rem',
                    fontSize: '0.9rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {canWriteJobRoles && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-h)' }}>
                    {t('grantedRoles') || 'Rollen'}
                  </label>
                  <div
                    style={{
                      maxHeight: '130px',
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.4rem',
                      backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.02))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                    }}
                    data-testid="job-modal-roles-list"
                  >
                    {(availableRoles && availableRoles.length > 0
                      ? availableRoles
                      : [
                          { id: 'admin', name: 'Administrator', description: 'Voller Systemzugriff' },
                          { id: 'mga', name: 'MGA', description: 'Mitgliederausschuss' },
                          { id: 'viewer', name: 'Viewer', description: 'Lesezugriff' },
                        ]
                    ).map((r) => {
                      const isChecked = formData.roles.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            data-testid={`job-modal-role-checkbox-${r.id}`}
                            onChange={() => {
                              setFormData((prev) => ({
                                ...prev,
                                roles: isChecked
                                  ? prev.roles.filter((x) => x !== r.id)
                                  : [...prev.roles, r.id],
                              }));
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>{r.name || r.id}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({r.id})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isSubmitting}
                  onClick={closeModal}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {t('cancel') || 'Abbrechen'}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? t('saving') || 'Speichern...' : t('save') || 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {jobToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(jobToDelete)}
          onClose={() => setJobToDelete(null)}
          onConfirm={handleConfirmDelete}
          title={t('deleteJob') || 'Job löschen'}
          message={t('deleteJobConfirm') || 'Sind Sie sicher, dass Sie diesen Job löschen möchten?'}
          expectedName={jobToDelete.name}
        />
      )}

      {/* Assignees Popover */}
      {currentJobForAssignees && (
        <JobAssigneesPopover
          isOpen={Boolean(assigneesPopoverAnchor && currentJobForAssignees)}
          onClose={() => {
            setActiveJobForAssignees(null);
            setAssigneesPopoverAnchor(null);
          }}
          anchorEl={assigneesPopoverAnchor}
          job={currentJobForAssignees}
          onSaveAssignees={handleSaveAssignees}
          fetchPeople={onFetchPeople}
          readOnly={!canWriteJobs}
        />
      )}

      {/* Roles Popover */}
      {currentJobForRoles && (
        <JobRolesPopover
          isOpen={Boolean(rolesPopoverAnchor && currentJobForRoles)}
          onClose={() => {
            setActiveJobForRoles(null);
            setRolesPopoverAnchor(null);
          }}
          anchorEl={rolesPopoverAnchor}
          job={currentJobForRoles}
          onSaveRoles={handleSaveRoles}
          availableRoles={availableRoles}
          readOnly={!canWriteJobRoles}
        />
      )}
    </div>
  );
};
