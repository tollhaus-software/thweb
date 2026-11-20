import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { MgaLinkIcon } from '../MgaLinkIcon';
import type { THMembership } from '../Table/MembershipsModal';
import { t, formatDisplayDate } from '../../utils/i18n';

export interface MemberRow {
  id: string;
  family_id: string;
  family_name?: string;
  first_name: string;
  last_name: string;
  membership_type: 'full_member' | 'supporting_member';
  first_became_member_date: string;
  last_type_change_date?: string | null;
  memberships: THMembership[];
}

export interface MembersTabProps {
  members: MemberRow[];
  searchQuery?: string;
  highlightedRowId?: string | null;
  canReadFamiliesAll: boolean;
  canWriteMemberships: boolean;
  onJumpToParent?: (personId: string, familyId: string, familyName: string, fromTab: 'members') => void;
  onOpenManageMemberships: (parent: any, anchor?: HTMLElement | string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  members,
  searchQuery = '',
  highlightedRowId,
  canReadFamiliesAll,
  onJumpToParent,
  onOpenManageMemberships,
}) => {
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      const typeLabel = m.membership_type === 'full_member' ? t('full_member').toLowerCase() : t('supporting_member').toLowerCase();
      const firstDate = m.first_became_member_date ? formatDisplayDate(m.first_became_member_date).toLowerCase() : '';
      const changeDate = m.last_type_change_date ? formatDisplayDate(m.last_type_change_date).toLowerCase() : '';
      return name.includes(q) || typeLabel.includes(q) || firstDate.includes(q) || changeDate.includes(q);
    });
  }, [members, searchQuery]);

  const memberColumns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row: MemberRow) => `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        header: t('name') || 'Name',
        size: 240,
        cell: (info) => {
          const row = info.row.original;
          const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-';
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
            >
              <span style={{ fontWeight: 600 }}>{fullName}</span>
              {canReadFamiliesAll && row.family_id && (
                <button
                  type="button"
                  className="family-parent-link overview-mga-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToParent?.(row.id, row.family_id, row.family_name || '', 'members');
                  }}
                  title={t('jumpToParent')}
                  aria-label={t('jumpToParent')}
                >
                  <MgaLinkIcon />
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: 'membership_type',
        accessorKey: 'membership_type',
        header: t('memberType'),
        meta: { cardLabel: t('memberType') },
        size: 200,
        cell: (info) => {
          const row = info.row.original;
          const label = row.membership_type === 'full_member' ? t('full_member') : t('supporting_member');
          const cellId = `cell-member-type-${row.id}`;
          return (
            <div
              id={cellId}
              className="membership-cell-wrapper"
              onClick={(e) => {
                e.stopPropagation();
                onOpenManageMemberships(row as any, e.currentTarget);
              }}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '2px 6px',
                borderRadius: '4px',
                width: '100%',
              }}
              title={t('manageMemberships')}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>{label}</span>
              <button
                type="button"
                className="cell-edit-pencil-btn"
                style={{ marginLeft: 'auto' }}
                title={t('manageMemberships')}
                onClick={(e) => {
                  e.stopPropagation();
                  const cellEl = document.getElementById(cellId) || e.currentTarget;
                  onOpenManageMemberships(row as any, cellEl);
                }}
              >
                <Pencil size={13} />
              </button>
            </div>
          );
        },
      },
      {
        id: 'first_became_member_date',
        accessorKey: 'first_became_member_date',
        header: t('firstBecameMember'),
        meta: { cardLabel: t('firstBecameMember') },
        size: 180,
        cell: (info) => {
          const row = info.row.original;
          const displayDate = row.first_became_member_date ? formatDisplayDate(row.first_became_member_date) : '-';
          const cellId = `cell-member-first-${row.id}`;
          return (
            <div
              id={cellId}
              className="membership-cell-wrapper"
              onClick={(e) => {
                e.stopPropagation();
                onOpenManageMemberships(row as any, e.currentTarget);
              }}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '2px 6px',
                borderRadius: '4px',
                width: '100%',
              }}
              title={t('manageMemberships')}
            >
              <span>{displayDate}</span>
              <button
                type="button"
                className="cell-edit-pencil-btn"
                style={{ marginLeft: 'auto' }}
                title={t('manageMemberships')}
                onClick={(e) => {
                  e.stopPropagation();
                  const cellEl = document.getElementById(cellId) || e.currentTarget;
                  onOpenManageMemberships(row as any, cellEl);
                }}
              >
                <Pencil size={13} />
              </button>
            </div>
          );
        },
      },
      {
        id: 'last_type_change_date',
        accessorKey: 'last_type_change_date',
        header: t('lastTypeChange'),
        meta: { cardLabel: t('lastTypeChangeShort') || 'Letzte Änderung' },
        size: 200,
        cell: (info) => {
          const row = info.row.original;
          const displayDate = row.last_type_change_date ? formatDisplayDate(row.last_type_change_date) : '-';
          const cellId = `cell-member-change-${row.id}`;
          return (
            <div
              id={cellId}
              className="membership-cell-wrapper"
              onClick={(e) => {
                e.stopPropagation();
                onOpenManageMemberships(row as any, e.currentTarget);
              }}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '2px 6px',
                borderRadius: '4px',
                width: '100%',
              }}
              title={t('manageMemberships')}
            >
              <span style={{ color: row.last_type_change_date ? 'var(--text)' : 'var(--text-muted)' }}>
                {displayDate}
              </span>
              <button
                type="button"
                className="cell-edit-pencil-btn"
                style={{ marginLeft: 'auto' }}
                title={t('manageMemberships')}
                onClick={(e) => {
                  e.stopPropagation();
                  const cellEl = document.getElementById(cellId) || e.currentTarget;
                  onOpenManageMemberships(row as any, cellEl);
                }}
              >
                <Pencil size={13} />
              </button>
            </div>
          );
        },
      },
    ],
    [canReadFamiliesAll, onJumpToParent, onOpenManageMemberships]
  );

  return (
    <DataTable
      key="members"
      className="card-table members-table"
      data={filteredMembers}
      columns={memberColumns}
      emptySubRowsText={t('noMembersYet')}
      highlightedRowId={highlightedRowId}
      stickyFirstColumn
      getCardHeader={(member: any) => {
        const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || '-';
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>{fullName}</span>
            {canReadFamiliesAll && member.family_id && (
              <button
                type="button"
                className="family-parent-link overview-mga-link"
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToParent?.(member.id, member.family_id, member.family_name || '', 'members');
                }}
                title={t('jumpToParent')}
                aria-label={t('jumpToParent')}
              >
                <MgaLinkIcon />
              </button>
            )}
          </div>
        );
      }}
    />
  );
};
