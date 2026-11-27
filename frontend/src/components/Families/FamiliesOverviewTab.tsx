import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit3 } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { MgaLinkIcon } from '../MgaLinkIcon';
import {
  type MultiValueEntry,
  getEntryValue,
  isFlagActive,
  getPhoneTypeSymbol,
  getPhoneTypeLabel,
} from '../Table/MultiValueListEditor';
import type { JobItem } from '../Table/JobsPopover';
import { t } from '../../utils/i18n';

const formatTelHref = (phone: string): string => {
  const cleaned = phone.trim().replace(/\(0\)/g, '').replace(/[^\d+*#]/g, '');
  return `tel:${cleaned || phone.trim()}`;
};

export interface ChildGroupStatus {
  currentGroup: number | null;
  plannedGroup: number | null;
  isFormer: boolean;
  groupLabel: string;
}

export interface ContactsTabProps {
  data: any[];
  isMobile: boolean;
  canReadFamiliesAll: boolean;
  overviewGroupBy: 'family' | 'group' | 'job' | 'caregiver';
  highlightedRowId?: string | null;
  currentFamilyId?: string | null;
  canSelfService?: boolean;
  onOpenSelfService?: (parent?: any) => void;
  onJumpToParent: (parentId: string, familyId: string, familyName: string, fromTab?: any) => void;
  onJumpToChild: (childId: string, familyId: string, familyName: string, fromTab?: any) => void;
  getChildGroupStatus: (child: any) => ChildGroupStatus;
}

export type FamiliesOverviewTabProps = ContactsTabProps;

export interface OverviewRowItem {
  id: string;
  original_id?: string;
  family_id: string;
  family_name?: string;
  first_name?: string;
  first_name_for_address_list?: string;
  last_name?: string;
  _rowType: 'parent' | 'child';
  indent_name?: boolean;
  hide_last_name?: boolean;
  hide_group?: boolean;
  phones?: MultiValueEntry[];
  emails?: MultiValueEntry[];
  address?: string;
  jobs?: JobItem[];
  subRows?: OverviewRowItem[];
}

export const ContactsTab: React.FC<ContactsTabProps> = ({
  data,
  isMobile,
  canReadFamiliesAll,
  overviewGroupBy,
  highlightedRowId,
  currentFamilyId,
  canSelfService,
  onOpenSelfService,
  onJumpToParent,
  onJumpToChild,
  getChildGroupStatus,
}) => {
  const overviewColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'overview_name',
        accessorFn: (row: any) => `${((row.first_name_for_address_list || row.first_name) || '').trim()} ${row.last_name || ''}`.trim(),
        header: '',
        size: 260,
        minSize: 210,
        cell: (info) => {
          const item = info.row.original;
          const isIndented = item.indent_name ?? item._rowType === 'child';
          const effectiveFn = ((item.first_name_for_address_list || item.first_name) || '').trim();
          if (item._rowType === 'child') {
            const displayName = item.hide_last_name
              ? effectiveFn || '-'
              : `${effectiveFn} ${item.last_name || ''}`.trim() || '-';
            const groupStatus = getChildGroupStatus(item);
            const displayGroup = groupStatus.groupLabel;
            const hasGroupBadge = isMobile && groupStatus.currentGroup !== null && displayGroup && displayGroup !== '-';
            const isGroupMode = overviewGroupBy === 'group';
            const nameStyle: React.CSSProperties | undefined =
              isIndented || isGroupMode
                ? {
                    ...(isIndented ? { paddingLeft: '1.25rem', display: 'inline-block' } : {}),
                    ...(isGroupMode ? { fontWeight: 700 } : {}),
                  }
                : undefined;
            return (
              <span className="overview-person-name" style={nameStyle}>
                {displayName}
                {hasGroupBadge && (
                  <span className="overview-child-group-badge">
                    {displayGroup}
                  </span>
                )}
                {canReadFamiliesAll && (
                  <button
                    type="button"
                    className="family-child-link overview-mga-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToChild(item.original_id || item.id, item.family_id, item.family_name || '', 'contacts');
                    }}
                    title={t('jumpToChild')}
                    aria-label={t('jumpToChild')}
                  >
                    <MgaLinkIcon />
                  </button>
                )}
              </span>
            );
          }
          const fullName = `${effectiveFn} ${item.last_name || ''}`.trim() || '-';
          const isOwnFamily = Boolean(currentFamilyId && item.family_id === currentFamilyId);
          return (
            <span className="overview-person-name" style={isIndented ? { paddingLeft: '1.25rem', display: 'inline-block' } : undefined}>
              {fullName}
              {canSelfService && isOwnFamily && (
                <button
                  type="button"
                  className="family-selfservice-link overview-mga-link"
                  data-testid={`selfservice-edit-${item.original_id || item.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSelfService?.(item);
                  }}
                  title={t('selfServiceEditButton')}
                  aria-label={t('selfServiceEditButton')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    padding: '0.1rem 0.25rem',
                    verticalAlign: 'middle',
                  }}
                >
                  <Edit3 size={13} />
                </button>
              )}
              {canReadFamiliesAll && !item.is_caregiver && (
                <button
                  type="button"
                  className="family-parent-link overview-mga-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToParent(item.original_id || item.id, item.family_id, item.family_name || '', 'contacts');
                  }}
                  title={t('jumpToParent')}
                  aria-label={t('jumpToParent')}
                >
                  <MgaLinkIcon />
                </button>
              )}
            </span>
          );
        },
      },
      {
        id: 'group',
        header: '',
        size: 220,
        minSize: 180,
        meta: {
          getColSpan: (row: any) => (row._rowType === 'child' ? 4 : 1),
          skipCell: (row: any, isMobileParam?: boolean) => {
            const mobile = isMobileParam ?? isMobile;
            if (row._rowType === 'child') {
              return mobile;
            }
            if (row._rowType === 'parent') {
              if (mobile) {
                const validPhones = (row.phones || []).filter(
                  (ph: any) => isFlagActive(ph, 'address_list', true) && getEntryValue(ph).trim().length > 0
                );
                return validPhones.length === 0;
              }
            }
            return false;
          },
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType === 'parent') {
            const phones = (item.phones || []).filter(
              (ph: any) => isFlagActive(ph, 'address_list', true) && getEntryValue(ph).trim().length > 0
            );
            if (phones.length === 0) {
              return isMobile ? null : <span style={{ color: 'var(--text-muted)' }}>-</span>;
            }
            return (
              <div className="overview-parent-entries">
                {phones.map((phoneEntry: any, idx: number) => {
                  const phoneVal = getEntryValue(phoneEntry).trim();
                  const phoneType = (typeof phoneEntry === 'object' && phoneEntry !== null && phoneEntry.type) ? phoneEntry.type : 'mobile';
                  const symbol = getPhoneTypeSymbol(phoneType);
                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && '\n'}
                      <div className="overview-parent-entry">
                        <span
                          className="overview-entry-icon phone-type-symbol overview-contact-symbol"
                          title={getPhoneTypeLabel(phoneType)}
                          style={{ userSelect: 'none' }}
                        >
                          {symbol}
                        </span>
                        <div className="overview-entry-content">
                          <a
                            href={formatTelHref(phoneVal)}
                            className="overview-contact-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {phoneVal}
                          </a>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          }

          const groupStatus = getChildGroupStatus(item);
          if (item.hide_group || isMobile || groupStatus.currentGroup === null) {
            return null;
          }

          const displayGroup = groupStatus.groupLabel;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
              <span className="overview-child-group-badge" style={{ color: displayGroup === '-' ? 'var(--text-muted)' : 'var(--text)' }}>
                {displayGroup}
              </span>
            </div>
          );
        },
      },
      {
        id: 'overview_emails',
        header: '',
        size: 260,
        minSize: 200,
        meta: {
          skipCell: (row: any, isMobileParam?: boolean) => {
            if (row._rowType === 'child') return true;
            const mobile = isMobileParam ?? isMobile;
            if (mobile && row._rowType === 'parent') {
              const emails = (row.emails || [])
                .filter((e: any) => isFlagActive(e, 'address_list', true))
                .map((e: any) => getEntryValue(e).trim())
                .filter(Boolean);
              return emails.length === 0;
            }
            return false;
          },
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType !== 'parent') return null;
          const emails = (item.emails || [])
            .filter((e: any) => isFlagActive(e, 'address_list', true))
            .map((e: any) => getEntryValue(e).trim())
            .filter(Boolean);
          if (emails.length === 0) {
            return isMobile ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span className="overview-contact-symbol" style={{ width: '1.25rem', flexShrink: 0, userSelect: 'none' }}>@</span>
                <span style={{ color: 'var(--text-muted)' }}>-</span>
              </div>
            );
          }
          return (
            <div className="overview-parent-entry">
              <span
                className="overview-entry-icon overview-contact-symbol"
                style={{
                  userSelect: 'none',
                }}
              >
                @
              </span>
              <div className="overview-entry-content" style={{ whiteSpace: 'pre-line' }}>
                {emails.map((email: string, idx: number) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && '\n'}
                    <a
                      href={`mailto:${email}`}
                      className="overview-contact-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {email}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        },
      },
      {
        id: 'overview_address',
        header: '',
        size: 260,
        minSize: 200,
        meta: {
          skipCell: (row: any, isMobileParam?: boolean) => {
            if (row._rowType === 'child') return true;
            const mobile = isMobileParam ?? isMobile;
            if (mobile && row._rowType === 'parent') {
              return !(row.address || '').trim();
            }
            return false;
          },
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType !== 'parent') return null;
          const address = (item.address || '').trim();
          if (!address) {
            return isMobile ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="overview-contact-symbol" style={{ width: '1.25rem', flexShrink: 0, userSelect: 'none' }}>🏠</span>
                <span style={{ color: 'var(--text-muted)' }}>-</span>
              </div>
            );
          }
          return (
            <div className="overview-parent-entry">
              <span
                className="overview-entry-icon overview-contact-symbol"
                style={{
                  userSelect: 'none',
                }}
              >
                🏠
              </span>
              <div className="overview-entry-content">
                <span className="overview-entry-text" style={{ whiteSpace: 'pre-line' }}>
                  {address}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'overview_jobs',
        header: '',
        size: 260,
        minSize: 200,
        meta: {
          skipCell: (row: any, isMobileParam?: boolean) => {
            if (row._rowType === 'child') return true;
            const mobile = isMobileParam ?? isMobile;
            if (mobile && row._rowType === 'parent') {
              const jobs = (row.jobs || []).filter((j: any) => (j.name || '').trim().length > 0);
              return jobs.length === 0;
            }
            return false;
          },
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType !== 'parent') return null;
          const parentJobs: JobItem[] = (item.jobs || []).filter((j: any) => (j.name || '').trim().length > 0);
          if (parentJobs.length === 0) {
            return isMobile ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ color: 'var(--text-muted)' }}>-</span>
              </div>
            );
          }
          return (
            <div className="overview-parent-entries">
              {parentJobs.map((j: JobItem, idx: number) => (
                <React.Fragment key={j.id || idx}>
                  {idx > 0 && '\n'}
                  <div className="overview-parent-entry">
                    <span
                      className="overview-entry-icon job-type-symbol overview-contact-symbol"
                      title={j.description || j.name}
                      style={{ userSelect: 'none' }}
                    >
                      🔨
                    </span>
                    <div className="overview-entry-content">
                      <span className="overview-entry-text" title={j.description || j.name}>{j.name}</span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          );
        },
      },
    ],
    [canReadFamiliesAll, currentFamilyId, canSelfService, onOpenSelfService, onJumpToChild, onJumpToParent, isMobile, getChildGroupStatus, overviewGroupBy]
  );

  return (
    <DataTable
      key="contacts"
      className="overview-table"
      data={data}
      columns={overviewColumns}
      getSubRows={overviewGroupBy === 'caregiver' ? undefined : (row: any) => row.subRows}
      hideHeader
      highlightedRowId={highlightedRowId}
      stickyFirstColumn
      familyCardMode={overviewGroupBy}
    />
  );
};

export const FamiliesOverviewTab = ContactsTab;
