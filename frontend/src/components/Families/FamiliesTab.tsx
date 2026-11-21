import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, ArrowUpRight } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { FamilyNotesCell } from '../Table/FamilyNotesEditor';
import { ChildGroupCell } from '../Children/ChildCells';
import { t, formatDisplayDate } from '../../utils/i18n';
import {
  getFamilyName,
  getMentorsDisplay,
  getMentoredFamiliesForFamily,
  isFamilyFormer,
} from '../../utils/family';
import type { Family, Child } from '../../types/family';

export interface FamiliesTabProps {
  data: any[];
  families: Family[];
  canWriteParents: boolean;
  canWriteChildren: boolean;
  canWriteFamilies: boolean;
  highlightedRowId?: string | null;
  groupPopoverAnchor?: HTMLElement | string | null;
  targetChildGroupChanges?: Child | null;
  mentorPopoverAnchor?: HTMLElement | string | null;
  activeFamilyForMentor?: Family | null;
  onJumpToParent: (parentId: string, familyId: string, familyName: string) => void;
  onJumpToChild: (childId: string, familyId: string, familyName: string) => void;
  onJumpToFamily: (familyId: string, tab?: any) => void;
  onAddParent: (familyId: string, familyName: string) => void;
  onAddChild: (familyId: string, familyName: string) => void;
  onOpenManageMentor: (family: Family, anchor: HTMLElement) => void;
  onOpenFamilyNotes: (family: Family, target: { type: 'family' }, anchor: HTMLElement | string) => void;
  onOpenManageGroupChanges: (child: Child, anchor: HTMLElement | string) => void;
}

export const FamiliesTab: React.FC<FamiliesTabProps> = ({
  data,
  families,
  canWriteParents,
  canWriteChildren,
  canWriteFamilies,
  highlightedRowId,
  groupPopoverAnchor,
  targetChildGroupChanges,
  mentorPopoverAnchor,
  activeFamilyForMentor,
  onJumpToParent,
  onJumpToChild,
  onJumpToFamily,
  onAddParent,
  onAddChild,
  onOpenManageMentor,
  onOpenFamilyNotes,
  onOpenManageGroupChanges,
}) => {
  const familyColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'family_name',
        accessorKey: 'family_name',
        header: t('familyName') || 'Familienname',
        size: 190,
        minSize: 150,
        cell: (info) => {
          const f = info.row.original;
          const familyName = f.family_name || getFamilyName(f);
          const isFormer = isFamilyFormer(f.originalFamily || f);
          const isHistorical = (f.originalFamily || f).family_type === 'historical_alumni';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-h)' }}>{familyName}</span>
              {isFormer && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: isHistorical ? 'rgba(234, 88, 12, 0.12)' : 'rgba(100, 116, 139, 0.15)',
                    color: isHistorical ? '#c2410c' : 'var(--text-muted)',
                    fontWeight: 500,
                  }}
                >
                  {isHistorical ? t('alumniHistoricalBadge') : t('alumniBadge')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'parents',
        header: t('parentsColumn') || 'Eltern',
        size: 240,
        minSize: 200,
        cell: (info) => {
          const f = info.row.original;
          const familyName = f.family_name || getFamilyName(f);
          const parents = f.parents || [];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
              {parents.length === 0 && canWriteParents && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                  <button
                    type="button"
                    className="family-action-button family-add-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddParent(f.id, familyName);
                    }}
                    title={t('addParent') || 'Elternteil hinzufügen'}
                    aria-label={t('addParent') || 'Elternteil hinzufügen'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      minWidth: '22px',
                      padding: 0,
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )}
              {parents.map((p: any, idx: number) => {
                const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent';
                const isLast = idx === parents.length - 1;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      gap: '0.35rem',
                    }}
                  >
                    <button
                      type="button"
                      className="family-parent-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToParent(p.id, f.id, familyName);
                      }}
                      title={t('jumpToParent')}
                    >
                      <span>{pName}</span>
                      <ArrowUpRight size={12} className="family-link-icon" />
                    </button>
                    {isLast && canWriteParents && (
                      <button
                        type="button"
                        className="family-action-button family-add-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddParent(f.id, familyName);
                        }}
                        title={t('addParent') || 'Elternteil hinzufügen'}
                        aria-label={t('addParent') || 'Elternteil hinzufügen'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          minWidth: '22px',
                          padding: 0,
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          marginLeft: 'auto',
                          flexShrink: 0,
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        },
      },
      {
        id: 'children',
        header: t('childrenColumn') || 'Kinder',
        size: 380,
        minSize: 300,
        cell: (info) => {
          const f = info.row.original;
          const familyName = f.family_name || getFamilyName(f);
          const children = f.children || [];

          if (children.length === 0) {
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ color: 'var(--text-muted)' }}>-</span>
                {canWriteChildren && (
                  <button
                    type="button"
                    className="family-action-button family-add-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild(f.id, familyName);
                    }}
                    title={t('addChild') || 'Kind hinzufügen'}
                    aria-label={t('addChild') || 'Kind hinzufügen'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      minWidth: '22px',
                      padding: 0,
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%' }}>
              {children.map((c: any, idx: number) => {
                const cName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Kind';
                const isLast = idx === children.length - 1;

                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.1rem',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="family-parent-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpToChild(c.id, f.id, familyName);
                          }}
                          title={t('jumpToChild')}
                        >
                          <span>{cName}</span>
                          <ArrowUpRight size={12} className="family-link-icon" />
                        </button>

                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {formatDisplayDate(c.birth_date)}
                        </span>
                      </div>

                      {isLast && canWriteChildren && (
                        <button
                          type="button"
                          className="family-action-button family-add-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddChild(f.id, familyName);
                          }}
                          title={t('addChild') || 'Kind hinzufügen'}
                          aria-label={t('addChild') || 'Kind hinzufügen'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            minWidth: '22px',
                            padding: 0,
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                            flexShrink: 0,
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', minHeight: '20px', width: '100%' }}>
                      <ChildGroupCell
                        child={c}
                        isActive={Boolean(groupPopoverAnchor && targetChildGroupChanges?.id === c.id)}
                        onOpenManage={onOpenManageGroupChanges}
                        readOnly={!canWriteChildren}
                        compact
                        emptyText="(nicht im Tollhaus)"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        },
      },
      {
        id: 'paten',
        header: t('mentors') || 'Paten',
        size: 200,
        minSize: 160,
        cell: (info) => {
          const f = info.row.original;
          const mentorDisplay = f.mentorDisplay || getMentorsDisplay(f, families);
          const isPopActive = Boolean(mentorPopoverAnchor && activeFamilyForMentor?.id === f.id);

          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.35rem', minHeight: '28px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {mentorDisplay.isFamily && mentorDisplay.mentorFamily ? (
                  <button
                    type="button"
                    className="family-parent-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToFamily(mentorDisplay.mentorFamily!.id, 'families');
                    }}
                    title={t('jumpToFamily')}
                  >
                    <span>{mentorDisplay.text}</span>
                    <ArrowUpRight size={12} className="family-link-icon" />
                  </button>
                ) : (
                  <span style={{ color: mentorDisplay.text === '-' ? 'var(--text-muted)' : 'inherit', fontSize: '0.85rem' }}>
                    {mentorDisplay.text}
                  </span>
                )}
              </div>
              {canWriteFamilies && (
                <div className="cell-edit-pencil-btn-wrapper" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
                  <button
                    type="button"
                    className={`cell-edit-pencil-btn easy-edit-button ${isPopActive ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenManageMentor(f, e.currentTarget);
                    }}
                    title={t('manageMentors')}
                    aria-label={t('manageMentors')}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'paten_von',
        header: t('mentorsOf') || 'Paten von',
        size: 220,
        minSize: 180,
        cell: (info) => {
          const f = info.row.original;
          const mentoredFamilies = f.mentoredFamilies || getMentoredFamiliesForFamily(f, families);
          if (!mentoredFamilies || mentoredFamilies.length === 0) {
            return <span style={{ color: 'var(--text-muted)' }}>-</span>;
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {mentoredFamilies.map((item: any) => (
                <div key={item.family.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{`${item.datePrefix} - `}</span>
                  <button
                    type="button"
                    className="family-parent-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToFamily(item.family.id, 'families');
                    }}
                    title={t('jumpToFamily')}
                  >
                    <span>{`Familie ${item.canonicalName}`}</span>
                    <ArrowUpRight size={12} className="family-link-icon" />
                  </button>
                  {item.parentGivenNames && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{` (${item.parentGivenNames})`}</span>
                  )}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        id: 'notes',
        header: t('notes') || 'Notizen',
        size: 260,
        minSize: 200,
        cell: (info) => {
          const f = info.row.original;
          return (
            <FamilyNotesCell
              value={f.notes || ''}
              readOnly={!canWriteFamilies}
              onOpen={(anchor) => onOpenFamilyNotes(f, { type: 'family' }, anchor)}
            />
          );
        },
      },
    ],
    [
      onJumpToParent,
      onJumpToChild,
      onJumpToFamily,
      canWriteParents,
      canWriteChildren,
      canWriteFamilies,
      onAddParent,
      onAddChild,
      onOpenManageMentor,
      onOpenFamilyNotes,
      onOpenManageGroupChanges,
      groupPopoverAnchor,
      targetChildGroupChanges,
      mentorPopoverAnchor,
      activeFamilyForMentor,
      families,
    ]
  );

  return (
    <DataTable
      key="families"
      className="card-table families-table"
      data={data}
      columns={familyColumns}
      highlightedRowId={highlightedRowId}
      stickyFirstColumn
      enableSorting={false}
      familyCardMode="family"
    />
  );
};
