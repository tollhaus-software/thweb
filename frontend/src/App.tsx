import React from 'react';
import { AuthProvider, useAuth, isKioskMode } from './context/AuthContext';
import { LoginButton } from './components/Auth/LoginButton';
import { ReauthModal } from './components/Auth/ReauthModal';
import './App.css';

import { DataTable } from './components/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import EasyEdit, { Types } from './components/InlineEdit';
import { Pencil, Trash, Undo, Redo, Calendar, Lock, Unlock, ArrowLeft, ArrowRight, ArrowUpRight, X, Clock, AlertCircle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { MultiValueListEditor, type MultiValueFlagConfig, type MultiValueEntry, type MultiValueItem, getEntryValue, isFlagActive } from './components/Table/MultiValueListEditor';
import { NotesEditor } from './components/Table/NotesEditor';
import { AddressEditor } from './components/Table/AddressEditor';
import { GroupChangesPopover } from './components/Table/GroupChangesPopover';
import { MembershipsModal } from './components/Table/MembershipsModal';
import { VaccinationStatusPopover, VaccinationStatusCell, type VaccinationCheck } from './components/Table/VaccinationStatusEditor';
import { HygieneEventsPopover, HygieneCell, type ParentWithHygiene } from './components/Table/HygieneEventsPopover';
import { ChildcareFeesCalculator } from './components/ChildcareFeesCalculator';
import { KioskDashboard } from './components/Dashboard/KioskDashboard';
import { KioskProvisioning } from './components/Admin/KioskProvisioning';
import { getAppConfig } from './config/appConfig';
import { HeaderOverflowMenu } from './components/Header/HeaderOverflowMenu';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate, calculateYearsAndMonths, formatTollhausEmail } from './utils/i18n';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

interface THMembership {
  id: string;
  parent_id: string;
  start_date: string;
  end_date: string | null;
  membership_type: 'full_member' | 'supporting_member';
  created_at: string;
  updated_at: string;
}

interface HygieneBelehrungEvent {
  id: string;
  parent_id: string;
  event_date: string;
  event_type: 'initial' | 'recertify';
  documentation: string;
  created_at: string;
  updated_at: string;
}

interface Parent {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  notes?: string;
  vaccination_checks?: VaccinationCheck[];
  events?: HygieneBelehrungEvent[];
  memberships?: THMembership[];
  family_name?: string;
}

interface ChildGroupChange {
  id: string;
  child: string;
  change_date: string;
  target_group: number; // 0: exit, 1: Kleine Gruppe, 2: Grosse Gruppe, 3: Hort
  created_at: string;
  updated_at: string;
}

interface Child {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  notes?: string;
  vaccination_checks?: VaccinationCheck[];
  family_name?: string;
  group_changes?: ChildGroupChange[];
}

const getGroupShortLabel = (targetGroup: number): string => {
  switch (targetGroup) {
    case 1:
      return 'Kleine Gr.';
    case 2:
      return 'Grosse Gr.';
    case 3:
      return 'Hort';
    default:
      return String(targetGroup);
  }
};

interface ChildGroupInfo {
  currentGroup: number | null;
  groupLabel: string;
  startDate: string | null;
  exitDate: string | null;
  isExited: boolean;
  isFuture: boolean;
  groupName?: string;
  sinceText?: string;
  futureDateText?: string;
  durationStr?: string;
}

const getChildGroupInfo = (changes: ChildGroupChange[] | undefined): ChildGroupInfo => {
  if (!changes || changes.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate: null,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const sorted = [...changes].sort((a, b) => a.change_date.localeCompare(b.change_date));
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const firstEnroll = sorted.find((c) => c.target_group > 0);
  const startDate = firstEnroll ? firstEnroll.change_date : null;

  // Case 1: If child has not started yet (the earliest group change with target group != 0 is in the future),
  // it formats as <group> and <clock symbol> ab <date>.
  if (firstEnroll && firstEnroll.change_date.split('T')[0] > todayStr) {
    const groupName = getGroupShortLabel(firstEnroll.target_group);
    const dateStr = formatDisplayDate(firstEnroll.change_date);
    const abWord = CURRENT_LOCALE === 'de' ? 'ab' : 'from';
    const futureDateText = `${abWord} ${dateStr}`;
    const groupLabel = `→ ${groupName} ${futureDateText}`;
    return {
      currentGroup: firstEnroll.target_group,
      groupLabel,
      groupName,
      futureDateText,
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: true,
    };
  }

  const effectiveSoFar = sorted.filter((c) => c.change_date.split('T')[0] <= todayStr);
  if (effectiveSoFar.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const latest = effectiveSoFar[effectiveSoFar.length - 1];

  // Case 2: If the child has left the group (the most recent group change, as of today, has target group = 0),
  // it should say "left <last group name> on <end date>" (en) / "Betreuungsende <end date>, davor <last group name>" (de).
  // If no previous group was recorded, it simply says "Betreuungsende <end date>" (de) / "left on <end date>" (en).
  if (latest.target_group === 0) {
    const prevEnroll = [...sorted].filter((c) => c.target_group > 0 && c.change_date.split('T')[0] <= latest.change_date.split('T')[0]).pop()
      || [...sorted].reverse().find((c) => c.target_group > 0);
    const lastGroupName = prevEnroll ? getGroupShortLabel(prevEnroll.target_group) : '';
    const endDateStr = formatDisplayDate(latest.change_date);
    const groupLabel = CURRENT_LOCALE === 'de'
      ? (lastGroupName ? `Betreuungsende ${endDateStr}, davor ${lastGroupName}` : `Betreuungsende ${endDateStr}`)
      : (lastGroupName ? `left ${lastGroupName} on ${endDateStr}` : `left on ${endDateStr}`);
    return {
      currentGroup: 0,
      groupLabel,
      startDate,
      exitDate: latest.change_date,
      isExited: true,
      isFuture: false,
    };
  }

  // Case 3: Otherwise (the child is currently in a group), it should contain the group name,
  // suffixed with "since <date> (<duration>)".
  const groupName = getGroupShortLabel(latest.target_group);
  const changeDateStr = formatDisplayDate(latest.change_date);
  const { years, months } = calculateYearsAndMonths(latest.change_date, now);
  const durationStr = CURRENT_LOCALE === 'de' ? `(${years}J ${months}M)` : `(${years}y ${months}m)`;
  const sinceWord = CURRENT_LOCALE === 'de' ? 'seit' : 'since';
  const sinceText = `${sinceWord} ${changeDateStr}`;

  return {
    currentGroup: latest.target_group,
    groupLabel: `${groupName} ${sinceText} ${durationStr}`,
    groupName,
    sinceText,
    durationStr,
    startDate,
    exitDate: null,
    isExited: false,
    isFuture: false,
  };
};

interface ChildStartDateCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

const ChildStartDateCell: React.FC<ChildStartDateCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const groupInfo = getChildGroupInfo(child.group_changes);
  const cellId = `cell-start_date-${child.id}`;
  return (
    <div
      id={cellId}
      className="startdatum-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        flex: 1,
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      title={readOnly ? t('viewGroupChanges') : t('manageGroupChanges')}
    >
      <span>{groupInfo.startDate ? formatDisplayDate(groupInfo.startDate) : '-'}</span>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          className="cell-edit-pencil-btn"
          title={t('manageGroupChanges')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

interface ChildGroupCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

const ChildGroupCell: React.FC<ChildGroupCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const groupInfo = getChildGroupInfo(child.group_changes);
  const cellId = `cell-group-${child.id}`;
  const hasChanges = Boolean(child.group_changes && child.group_changes.length > 0);

  if (readOnly && !hasChanges) {
    return (
      <div
        id={cellId}
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: '28px',
          padding: '2px 4px',
          color: 'var(--text-muted)',
        }}
      >
        <span>-</span>
      </div>
    );
  }

  return (
    <div
      id={cellId}
      className="child-group-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      title={readOnly ? t('viewGroupChanges') : t('manageGroupChanges')}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
          fontWeight: 'normal',
          color: groupInfo.isExited ? 'var(--text-muted)' : 'inherit',
        }}
      >
        <span className="child-group-compact-view">
          {groupInfo.groupName && groupInfo.sinceText ? (
            `${groupInfo.groupName} (${groupInfo.sinceText})`
          ) : groupInfo.isFuture && groupInfo.groupName && groupInfo.futureDateText ? (
            `${groupInfo.groupName} (${groupInfo.futureDateText})`
          ) : (
            groupInfo.groupLabel
          )}
        </span>
        <span className="child-group-full-view" style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {groupInfo.isFuture && groupInfo.groupName ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  width: '100px',
                  minWidth: '100px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  color: 'var(--text-muted)',
                }}
              >
                <ArrowRight size={13} style={{ flexShrink: 0 }} />
                <span>{groupInfo.groupName}</span>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  width: '135px',
                  minWidth: '135px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <Clock size={14} style={{ flexShrink: 0 }} />
                <span>{groupInfo.futureDateText}</span>
              </span>
            </span>
          ) : groupInfo.groupName && groupInfo.sinceText ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '100px',
                  minWidth: '100px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {groupInfo.groupName}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: '135px',
                  minWidth: '135px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {groupInfo.sinceText}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {groupInfo.durationStr}
              </span>
            </span>
          ) : (
            <span>{groupInfo.groupLabel}</span>
          )}
        </span>
      </div>
      {!readOnly && (
        <button
          type="button"
          className="cell-edit-pencil-btn child-group-manage-btn"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          title={t('manageGroupChanges')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

interface OverviewParent {
  id: string;
  first_name: string;
  last_name: string;
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
}

interface OverviewChild {
  id: string;
  first_name: string;
  last_name: string;
  current_group?: number | null;
  is_former?: boolean;
  group_changes?: ChildGroupChange[];
}

const getOverviewChildGroupStatus = (
  child: OverviewChild
): { currentGroup: number | null; isFormer: boolean; groupLabel: string } => {
  if (typeof child.current_group === 'number' && child.current_group > 0) {
    return {
      currentGroup: child.current_group,
      isFormer: false,
      groupLabel: getGroupShortLabel(child.current_group),
    };
  }
  if (child.is_former) {
    return {
      currentGroup: null,
      isFormer: true,
      groupLabel: '-',
    };
  }
  if (child.group_changes && child.group_changes.length > 0) {
    const info = getChildGroupInfo(child.group_changes);
    const activeGrp =
      info.currentGroup && info.currentGroup > 0 && !info.isFuture && !info.isExited
        ? info.currentGroup
        : null;
    return {
      currentGroup: activeGrp,
      isFormer: info.isExited,
      groupLabel: activeGrp ? info.groupName || getGroupShortLabel(activeGrp) : '-',
    };
  }
  return {
    currentGroup: null,
    isFormer: false,
    groupLabel: '-',
  };
};

interface OverviewFamily {
  id: string;
  parents: OverviewParent[];
  children?: OverviewChild[];
}

interface Family {
  id: string;
  created_at: string;
  parents: Parent[];
  children?: Child[];
}

const getMembershipStatus = (memberships: THMembership[] | undefined) => {
  if (!memberships || memberships.length === 0) return { text: '', color: 'inherit' };
  
  const today = new Date().toISOString().split('T')[0];

  const active = memberships.find(m => {
    const start = m.start_date.split('T')[0];
    const end = m.end_date ? m.end_date.split('T')[0] : null;
    return start <= today && (!end || end >= today);
  });

  if (active) {
    if (active.membership_type === 'full_member') {
      return { text: t('full_member'), color: 'var(--text-h)', fontWeight: '600' };
    } else {
      return { text: t('supporting_member'), color: 'var(--text-h)', fontWeight: '600' };
    }
  }

  const expired = memberships.some(m => {
    const end = m.end_date ? m.end_date.split('T')[0] : null;
    return end && end < today;
  });

  if (expired) {
    return { text: t('expired'), color: '#94a3b8', fontStyle: 'italic' };
  }

  return { text: '', color: 'inherit' };
};

interface ParentMembershipCellProps {
  parent: Parent;
  isActive: boolean;
  onOpenManage: (parent: Parent, anchor: HTMLElement | string) => void;
}

const ParentMembershipCell: React.FC<ParentMembershipCellProps> = ({
  parent,
  isActive,
  onOpenManage,
}) => {
  const status = getMembershipStatus(parent.memberships);
  const cellId = `cell-membership-${parent.id}`;

  return (
    <div
      id={cellId}
      className="membership-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(parent, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        flex: 1,
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
      }}
      title={t('manageMemberships')}
    >
      <span
        style={{
          color: status.color,
          fontWeight: (status as any).fontWeight || 'normal',
          fontStyle: (status as any).fontStyle || 'normal',
        }}
      >
        {status.text}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const cellEl = document.getElementById(cellId) || e.currentTarget;
          onOpenManage(parent, cellEl);
        }}
        className="cell-edit-pencil-btn"
        title={t('manageMemberships')}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
};

interface ParentMultiValueCellProps {
  parent: Parent;
  field: 'emails' | 'phones';
  placeholder: string;
  isActive: boolean;
  onOpenManage: (parent: Parent, field: 'emails' | 'phones', anchor: HTMLElement | string) => void;
}

const ParentMultiValueCell: React.FC<ParentMultiValueCellProps> = ({
  parent,
  field,
  placeholder,
  isActive,
  onOpenManage,
}) => {
  const cellId = `cell-${field}-${parent.id}`;
  const values = parent[field] || [];

  return (
    <div
      id={cellId}
      className={`multi-value-cell-wrapper ${field}-cell-wrapper`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(parent, field, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        gap: '0.25rem',
      }}
      title={placeholder}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        {values.length > 0 ? (
          values.map((v, i) => {
            const val = getEntryValue(v);
            const isAddressList = isFlagActive(v, 'address_list', true);
            const isIdentifier = isFlagActive(v, 'identifier_email', false);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  width: '100%',
                  fontSize: '0.875rem',
                  color: 'var(--text-h)',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {val}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}>
                  {field === 'emails' && (
                    <span
                      className="identifier-email-indicator"
                      style={{
                        fontSize: '0.8rem',
                        lineHeight: 1,
                        opacity: isIdentifier ? 1 : 0.25,
                        filter: isIdentifier ? 'none' : 'grayscale(100%)',
                      }}
                      title={isIdentifier ? t('identifierEmailActive') || 'Als Identifikator-E-Mail festgelegt' : t('identifierEmailInactive') || 'Nicht als Identifikator-E-Mail festgelegt'}
                    >
                      🆔
                    </span>
                  )}
                  <span
                    className="address-list-indicator"
                    style={{
                      fontSize: '0.8rem',
                      lineHeight: 1,
                      opacity: isAddressList ? 1 : 0.25,
                      filter: isAddressList ? 'none' : 'grayscale(100%)',
                    }}
                    title={isAddressList ? t('addressListIncluded') || 'In Adressliste aufnehmen' : t('addressListExcluded') || 'Nicht in Adressliste aufnehmen'}
                  >
                    📋
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.875rem' }}>
            {placeholder}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const cellEl = document.getElementById(cellId) || e.currentTarget;
          onOpenManage(parent, field, cellEl);
        }}
        className="cell-edit-pencil-btn"
        title={placeholder}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
};

interface AuditLog {
  id: string;
  transaction_id: string;
  family_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  before_snapshot: any;
  after_snapshot: any;
  changed_by: string | null;
  changed_by_email: string;
  created_at: string;
}

const formatMultiValueItem = (item: any, field: 'emails' | 'phones'): string => {
  const val = getEntryValue(item);
  if (!val) return '';
  const isAddressList = isFlagActive(item, 'address_list', true);
  const isIdentifier = field === 'emails' ? isFlagActive(item, 'identifier_email', false) : false;

  const flagParts: string[] = [];
  if (isIdentifier) {
    flagParts.push('🆔');
  }
  if (isAddressList) {
    flagParts.push('📋');
  } else {
    flagParts.push(t('withoutAddressList'));
  }

  return `${val} [${flagParts.join(', ')}]`;
};

const formatTelHref = (phone: string): string => {
  const cleaned = phone.trim().replace(/\(0\)/g, '').replace(/[^\d+*#]/g, '');
  return `tel:${cleaned || phone.trim()}`;
};

const diffParentSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];

  // First name
  if ((before.first_name || '') !== (after.first_name || '')) {
    changes.push(`${t('firstName')}: "${before.first_name || ''}" → "${after.first_name || ''}"`);
  }

  // Last name
  if ((before.last_name || '') !== (after.last_name || '')) {
    changes.push(`${t('lastName')}: "${before.last_name || ''}" → "${after.last_name || ''}"`);
  }

  // Notes
  if ((before.notes || '') !== (after.notes || '')) {
    changes.push(`${t('notes')}: "${before.notes || ''}" → "${after.notes || ''}"`);
  }

  // Helper to diff multi-value lists (emails or phones)
  const diffMultiValues = (
    beforeList: any[],
    afterList: any[],
    field: 'emails' | 'phones'
  ) => {
    const bList = Array.isArray(beforeList) ? beforeList : [];
    const aList = Array.isArray(afterList) ? afterList : [];

    const norm = (item: any) => getEntryValue(item).toLowerCase().trim();

    const beforeMap = new Map<string, any>();
    bList.forEach((item) => {
      const k = norm(item);
      if (k) beforeMap.set(k, item);
    });

    const afterMap = new Map<string, any>();
    aList.forEach((item) => {
      const k = norm(item);
      if (k) afterMap.set(k, item);
    });

    const addedUnmatched: any[] = [];
    aList.forEach((aItem) => {
      const k = norm(aItem);
      if (!beforeMap.has(k)) {
        addedUnmatched.push(aItem);
      }
    });

    const removedUnmatched: any[] = [];
    bList.forEach((bItem) => {
      const k = norm(bItem);
      if (!afterMap.has(k)) {
        removedUnmatched.push(bItem);
      }
    });

    if (bList.length === aList.length && addedUnmatched.length === 1 && removedUnmatched.length === 1) {
      const bVal = getEntryValue(removedUnmatched[0]);
      const aFormatted = formatMultiValueItem(addedUnmatched[0], field);
      const label = field === 'emails' ? t('changedEmail') : t('changedPhone');
      changes.push(`${label}: ${bVal} → ${aFormatted}`);
    } else {
      addedUnmatched.forEach((aItem) => {
        const label = field === 'emails' ? t('addedEmail') : t('addedPhone');
        changes.push(`${label}: ${formatMultiValueItem(aItem, field)}`);
      });
      removedUnmatched.forEach((bItem) => {
        const label = field === 'emails' ? t('removedEmail') : t('removedPhone');
        changes.push(`${label}: ${getEntryValue(bItem)}`);
      });
    }

    // Check for flag changes on items existing in both
    bList.forEach((bItem) => {
      const k = norm(bItem);
      if (afterMap.has(k)) {
        const aItem = afterMap.get(k)!;
        const val = getEntryValue(aItem);

        const bAddr = isFlagActive(bItem, 'address_list', true);
        const aAddr = isFlagActive(aItem, 'address_list', true);
        if (bAddr !== aAddr) {
          changes.push(`${val}: ${aAddr ? t('inAddressListAdded') : t('inAddressListRemoved')}`);
        }

        if (field === 'emails') {
          const bId = isFlagActive(bItem, 'identifier_email', false);
          const aId = isFlagActive(aItem, 'identifier_email', false);
          if (bId !== aId) {
            changes.push(`${val}: ${aId ? t('identifierEmailSet') : t('identifierEmailUnset')}`);
          }
        }
      }
    });
  };

  diffMultiValues(before.emails, after.emails, 'emails');
  diffMultiValues(before.phones, after.phones, 'phones');

  return changes;
};

const formatSnapshotDetails = (log: AuditLog) => {
  const data = log.after_snapshot || log.before_snapshot;
  if (!data) return '-';

  const parts: string[] = [];
  
  if (log.entity_type === 'family') {
    if (data.parents && data.parents.length > 0) {
      const names = data.parents.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ');
      parts.push(`${t('family')}: ${names}`);
    } else {
      parts.push(`Family ID: ${log.entity_id}`);
    }
  }

  if (log.entity_type === 'parent') {
    const parentName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (parentName) {
      parts.push(parentName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffParentSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    if (data.emails && data.emails.length > 0) {
      parts.push(`Emails: ${data.emails.map((e: any) => formatMultiValueItem(e, 'emails')).join(', ')}`);
    }
    if (data.phones && data.phones.length > 0) {
      parts.push(`Phones: ${data.phones.map((p: any) => formatMultiValueItem(p, 'phones')).join(', ')}`);
    }
    if (data.notes) {
      parts.push(`Notes: ${data.notes}`);
    }
  }

  if (log.entity_type === 'child') {
    const childName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (childName) {
      parts.push(childName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes: string[] = [];
      if ((log.before_snapshot.first_name || '') !== (log.after_snapshot.first_name || '')) {
        changes.push(`${t('firstName')}: "${log.before_snapshot.first_name || ''}" → "${log.after_snapshot.first_name || ''}"`);
      }
      if ((log.before_snapshot.last_name || '') !== (log.after_snapshot.last_name || '')) {
        changes.push(`${t('lastName')}: "${log.before_snapshot.last_name || ''}" → "${log.after_snapshot.last_name || ''}"`);
      }
      if ((log.before_snapshot.birth_date || '') !== (log.after_snapshot.birth_date || '')) {
        changes.push(`${t('birthDate')}: ${formatDisplayDate(log.before_snapshot.birth_date)} → ${formatDisplayDate(log.after_snapshot.birth_date)}`);
      }
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    if (data.birth_date) {
      parts.push(`${t('birthDate')}: ${formatDisplayDate(data.birth_date)}`);
    }
  }

  if (log.entity_type === 'child_group_change') {
    const groupLabels: Record<number, string> = {
      0: t('exit'),
      1: t('group1'),
      2: t('group2'),
      3: t('group3'),
    };
    const groupName = groupLabels[data.target_group] || `${t('targetGroup')}: ${data.target_group}`;
    parts.push(`${t('groupChange')}: ${groupName}`);
    if (data.change_date) {
      parts.push(`${t('date')}: ${formatDisplayDate(data.change_date)}`);
    }
  }

  if (log.entity_type === 'hygiene_event') {
    const typeLabel = data.event_type === 'initial' ? t('initialType') : t('recertifyType');
    parts.push(`${typeLabel}`);
    if (data.event_date) {
      parts.push(`Datum: ${formatDisplayDate(data.event_date)}`);
    }
    if (data.documentation) {
      parts.push(`Info: ${data.documentation}`);
    }
  }

  if (log.entity_type === 'th_membership') {
    const typeLabel = data.membership_type === 'full_member' ? t('full_member') : t('supporting_member');
    parts.push(`${typeLabel}`);
    if (data.start_date) {
      parts.push(`${t('startDateLabel')}: ${formatDisplayDate(data.start_date)}`);
    }
    if (data.end_date) {
      parts.push(`${t('endDateLabel')}: ${formatDisplayDate(data.end_date)}`);
    }
  }

  return parts.join(' | ');
};

const AuditLogView: React.FC<{ logs: AuditLog[]; loading: boolean }> = ({ logs, loading }) => {
  if (loading) {
    return <div style={{ color: '#64748b', padding: '1rem' }}>{t('loading')}</div>;
  }

  const getOperationBadgeStyle = (op: string) => {
    const baseStyle = {
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 'bold' as const,
      textTransform: 'uppercase' as const,
      display: 'inline-block',
    };
    if (op === 'INSERT' || op === 'CREATE') {
      return { ...baseStyle, backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' };
    }
    if (op === 'UPDATE') {
      return { ...baseStyle, backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' };
    }
    if (op === 'DELETE') {
      return { ...baseStyle, backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)' };
    }
    return { ...baseStyle, backgroundColor: '#f1f5f9', color: '#475569' };
  };

  const getEntityTypeLabel = (etype: string) => {
    switch (etype) {
      case 'family':
        return t('family');
      case 'parent':
        return t('parent1');
      case 'child':
        return t('children');
      case 'hygiene_event':
        return t('hygieneBelehrung');
      case 'th_membership':
        return t('th_membership');
      default:
        return etype;
    }
  };

  const safeLogs = Array.isArray(logs) ? logs : [];

  return (
    <div className="table-container" style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '0.75rem 0.5rem', width: '160px' }}>{t('timestamp')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '180px' }}>{t('userLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '100px' }}>{t('operationLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem', width: '150px' }}>{t('entityTypeLabel')}</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>{t('detailsLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {safeLogs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {CURRENT_LOCALE === 'de' ? 'Keine Einträge vorhanden' : 'No entries found'}
              </td>
            </tr>
          ) : (
            safeLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                  {new Date(log.created_at).toLocaleString(CURRENT_LOCALE === 'de' ? 'de-DE' : 'en-US')}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500, color: 'var(--text-h)', fontSize: '0.85rem' }}>
                  {log.changed_by_email || '-'}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  <span style={getOperationBadgeStyle(log.operation)}>
                    {log.operation === 'CREATE' ? 'INSERT' : log.operation}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: '#475569', fontSize: '0.85rem', fontWeight: 500 }}>
                  {getEntityTypeLabel(log.entity_type)}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {formatSnapshotDetails(log)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const LandingPage: React.FC = () => {
  const { authError } = useAuth();

  if (authError) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', padding: '20px' }}>
        <h1 style={{ color: 'var(--text-h)' }}>Access Restricted</h1>
        <p style={{ color: 'var(--danger-text)', fontSize: '1.1rem', margin: '20px 0', fontWeight: 500 }}>
          {authError.email
            ? `The user ${authError.email} does not have access to the application.`
            : `Access Denied: ${authError.message}`}
        </p>
        <a
          href="/oauth2/start"
          className="primary-button"
          style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}
        >
          Sign in with a different account
        </a>
      </div>
    );
  }

  const appConfig = getAppConfig();
  const appTitle = appConfig.title || 'Kindergarten Management System';

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      {appConfig.logoUrl ? (
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <img
            src={appConfig.logoUrl}
            alt={appTitle}
            title={appTitle}
            style={{ maxHeight: '80px', maxWidth: '300px', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <h1>{appTitle}</h1>
      )}
      <p>Please log in to access the system.</p>
      <LoginButton />
    </div>
  );
};

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  effective_permissions: string[];
  last_login?: string;
  created_at: string;
}

interface AdminRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

const ALL_AVAILABLE_PERMISSIONS = [
  '*',
  'families.all.read',
  'families.all.restrictedread',
  'families.all.write',
  'families.self.selfservice',
  'children.all.write',
  'fees.all.read',
  'fees.self.read',
  'hygiene.all.write',
  'memberships.all.write',
  'audit.all.read',
  'users.all.manage',
  'vaccination.status.manage'
];

const AdminView: React.FC = () => {
  const { token, refreshUser } = useAuth();
  const [subTab, setSubTab] = React.useState<'users' | 'roles'>('users');

  const getAdminHeaders = React.useCallback((extraHeaders: Record<string, string> = {}) => {
    const h: Record<string, string> = { ...extraHeaders };
    if (token && token !== 'null' && token !== 'undefined') {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }, [token]);
  
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [loading, setLoading] = React.useState(true);

  // User modal states
  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null);
  const [userEmail, setUserEmail] = React.useState('');
  const [selectedUserRoles, setSelectedUserRoles] = React.useState<string[]>([]);
  const [selectedUserPerms, setSelectedUserPerms] = React.useState<string[]>([]);

  // Role modal states
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<AdminRole | null>(null);
  const [roleId, setRoleId] = React.useState('');
  const [roleName, setRoleName] = React.useState('');
  const [roleDesc, setRoleDesc] = React.useState('');
  const [selectedRolePerms, setSelectedRolePerms] = React.useState<string[]>([]);

  const fetchUsers = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: getAdminHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAdminHeaders]);

  const fetchRoles = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles', { headers: getAdminHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRoles(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAdminHeaders]);

  const refreshData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchRoles()]);
    setLoading(false);
  }, [fetchUsers, fetchRoles]);

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Handle User Submit
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) return;

    if (editingUser) {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ roles: selectedUserRoles, permissions: selectedUserPerms })
      });
      if (res.ok) {
        setUserModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to update user');
      }
    } else {
      const normalizedEmail = userEmail.trim().toLowerCase();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: normalizedEmail, roles: selectedUserRoles, permissions: selectedUserPerms })
      });
      if (res.ok) {
        setUserModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to create user');
      }
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm(t('deleteUserConfirm'))) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    if (res.ok) {
      refreshData();
      await refreshUser();
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setUserEmail('');
    setSelectedUserRoles([]);
    setSelectedUserPerms([]);
    setUserModalOpen(true);
  };

  const openEditUserModal = (u: AdminUser) => {
    setEditingUser(u);
    setUserEmail(u.email);
    setSelectedUserRoles(u.roles || []);
    setSelectedUserPerms(u.permissions || []);
    setUserModalOpen(true);
  };

  // Handle Role Submit
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId || !roleName) return;

    if (editingRole) {
      const res = await fetch(`/api/admin/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: roleName, description: roleDesc, permissions: selectedRolePerms })
      });
      if (res.ok) {
        setRoleModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to update role');
      }
    } else {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: roleId.toLowerCase().trim(), name: roleName, description: roleDesc, permissions: selectedRolePerms })
      });
      if (res.ok) {
        setRoleModalOpen(false);
        refreshData();
        await refreshUser();
      } else {
        alert('Failed to create role');
      }
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!window.confirm(t('deleteRoleConfirm'))) return;
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    if (res.ok) {
      refreshData();
      await refreshUser();
    }
  };

  const openAddRoleModal = () => {
    setEditingRole(null);
    setRoleId('');
    setRoleName('');
    setRoleDesc('');
    setSelectedRolePerms([]);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (r: AdminRole) => {
    setEditingRole(r);
    setRoleId(r.id);
    setRoleName(r.name);
    setRoleDesc(r.description || '');
    setSelectedRolePerms(r.permissions || []);
    setRoleModalOpen(true);
  };

  const toggleUserRole = (rId: string) => {
    setSelectedUserRoles(prev => prev.includes(rId) ? prev.filter(x => x !== rId) : [...prev, rId]);
  };

  const toggleUserPerm = (pStr: string) => {
    setSelectedUserPerms(prev => prev.includes(pStr) ? prev.filter(x => x !== pStr) : [...prev, pStr]);
  };

  const toggleRolePerm = (pStr: string) => {
    setSelectedRolePerms(prev => prev.includes(pStr) ? prev.filter(x => x !== pStr) : [...prev, pStr]);
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#64748b' }}>{t('loading')}</div>;
  }

  return (
    <div className="admin-container" style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
      {/* Sub Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setSubTab('users')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'users' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'users' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {t('users')} ({users.length})
          </button>
          <button
            onClick={() => setSubTab('roles')}
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'roles' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'roles' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {t('roles')} ({roles.length})
          </button>
        </div>
        {subTab === 'users' ? (
          <button onClick={openAddUserModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + {t('addUser')}
          </button>
        ) : (
          <button onClick={openAddRoleModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + {t('addRole')}
          </button>
        )}
      </div>

      {/* Users Section */}
      {subTab === 'users' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('userLabel')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('assignedRoles')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('customPermissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('effectivePermissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.roles && u.roles.length > 0 ? u.roles.map(rId => (
                        <span key={rId} style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {rId}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.permissions && u.permissions.length > 0 ? u.permissions.map(p => (
                        <span key={p} style={{ background: '#fef3c7', color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {u.effective_permissions && u.effective_permissions.length > 0 ? u.effective_permissions.map(p => (
                        <span key={p} style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button onClick={() => openEditUserModal(u)} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem', fontSize: '0.8rem' }}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles Section */}
      {subTab === 'roles' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 0.5rem', width: '120px' }}>{t('roleId')}</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '160px' }}>{t('roleName')}</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Beschreibung</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{t('permissions')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{r.id}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>{r.description || '-'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {r.permissions && r.permissions.length > 0 ? r.permissions.map(p => (
                        <span key={p} style={{ background: '#f3e8ff', color: '#7e22ce', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {p}
                        </span>
                      )) : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Keine</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button onClick={() => openEditRoleModal(r)} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem', fontSize: '0.8rem' }}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDeleteRole(r.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Modal */}
      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--text-h)' }}>{editingUser ? t('editUser') : t('addUser')}</h3>
            <form onSubmit={handleUserSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>E-Mail Address</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  disabled={!!editingUser}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('assignedRoles')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {roles.map(r => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserRoles.includes(r.id)}
                        onChange={() => toggleUserRole(r.id)}
                      />
                      <span><strong>{r.name}</strong> ({r.id})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('customPermissions')} (Direct Overrides)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserPerms.includes(p)}
                        onChange={() => toggleUserPerm(p)}
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setUserModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {roleModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--text-h)' }}>{editingRole ? t('editRole') : t('addRole')}</h3>
            <form onSubmit={handleRoleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('roleId')}</label>
                <input
                  type="text"
                  value={roleId}
                  onChange={e => setRoleId(e.target.value)}
                  disabled={!!editingRole}
                  placeholder="e.g. manager"
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('roleName')}</label>
                <input
                  type="text"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  placeholder="e.g. Manager"
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Beschreibung</label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  placeholder="Kurze Beschreibung der Rolle"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('permissions')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      <input
                        type="checkbox"
                        checked={selectedRolePerms.includes(p)}
                        onChange={() => toggleRolePerm(p)}
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setRoleModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import { useRealtime } from './hooks/useRealtime';

const Dashboard: React.FC = () => {
  const { user, token, logout, hasPermission } = useAuth();
  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');
  const appLogoUrl = appConfig.logoUrl;

  // KMS Step-up Auth state
  const [kmsAccessToken, setKmsAccessToken] = React.useState<string | null>(() => {
    return sessionStorage.getItem('kms_access_token');
  });
  const [kmsError, setKmsError] = React.useState<string | null>(null);

  const isVaccinationUnlocked = Boolean(kmsAccessToken);

  const getAuthHeaders = React.useCallback((extraHeaders: Record<string, string> = {}, explicitKmsToken?: string) => {
    const h: Record<string, string> = {
      ...extraHeaders,
    };
    if (token && token !== 'null' && token !== 'undefined') {
      h['Authorization'] = `Bearer ${token}`;
    }
    const kToken = explicitKmsToken !== undefined ? explicitKmsToken : kmsAccessToken;
    if (kToken) {
      h['X-KMS-Access-Token'] = kToken;
    }
    return h;
  }, [token, kmsAccessToken]);

  const canReadAudit = hasPermission('audit.all.read');
  const canManageUsers = hasPermission('users.all.manage') || hasPermission('*');
  const canProvisionKiosk = hasPermission('provision.kiosk.cert') || hasPermission('*');
  const canReadOverview = hasPermission('families.all.restrictedread');
  const canReadFamiliesAll = hasPermission('families.all.read');
  const canReadFees = hasPermission('fees.all.read') || hasPermission('fees.self.read');
  const canWriteChildren = hasPermission('children.all.write');
  const canWriteHygiene = hasPermission('hygiene.all.write');

  const [families, setFamilies] = React.useState<Family[]>([]);
  const [overviewFamilies, setOverviewFamilies] = React.useState<OverviewFamily[]>([]);
  const [overviewGroupBy, setOverviewGroupBy] = React.useState<'family' | 'group'>('family');
  const [expandedGroupParents, setExpandedGroupParents] = React.useState<Record<string, boolean>>({});

  const handleToggleGroupParents = React.useCallback((key: string) => {
    setExpandedGroupParents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const [globalFilter, setGlobalFilter] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<
    'familiesOverview' | 'families' | 'parents' | 'children' | 'childcareFees' | 'hygieneBelehrung' | 'audit' | 'admin' | 'kiosk' | 'dashboard'
  >(() => {
    const rawHash = window.location.hash.replace('#', '');
    const hash = rawHash.split('?')[0];
    const pathname = window.location.pathname.replace(/\/+$/, '');
    if (
      (hash === 'familiesOverview' && canReadOverview) ||
      (hash === 'families' && canReadFamiliesAll) ||
      (hash === 'parents' && canReadFamiliesAll) ||
      (hash === 'children' && canReadFamiliesAll) ||
      (hash === 'childcareFees' && canReadFees) ||
      (hash === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
      (hash === 'audit' && canReadAudit) ||
      (hash === 'admin' && canManageUsers) ||
      (hash === 'kiosk' && canProvisionKiosk) ||
      hash === 'dashboard' ||
      pathname === '/dashboard'
    ) {
      return (pathname === '/dashboard' ? 'dashboard' : hash) as any;
    }
    const saved = localStorage.getItem('thweb_active_tab');
    if (
      (saved === 'familiesOverview' && canReadOverview) ||
      (saved === 'families' && canReadFamiliesAll) ||
      (saved === 'parents' && canReadFamiliesAll) ||
      (saved === 'children' && canReadFamiliesAll) ||
      (saved === 'childcareFees' && canReadFees) ||
      (saved === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
      (saved === 'audit' && canReadAudit) ||
      (saved === 'admin' && canManageUsers) ||
      (saved === 'kiosk' && canProvisionKiosk) ||
      saved === 'dashboard'
    ) {
      return saved as any;
    }
    if (canReadFamiliesAll) {
      return 'families';
    }
    if (canReadOverview) {
      return 'familiesOverview';
    }
    if (canReadFees) {
      return 'childcareFees';
    }
    return 'familiesOverview';
  });

  React.useEffect(() => {
    if (activeTab === 'families' && !canReadFamiliesAll) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      }
    } else if ((activeTab === 'parents' || activeTab === 'children') && !canReadFamiliesAll) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      }
    }
  }, [activeTab, canReadFamiliesAll, canReadOverview, canReadFees]);

  // Navigation & Highlighting state (Patterns 2 & 3)
  const [highlightTarget, setHighlightTarget] = React.useState<{ id: string; key: number } | null>(null);
  const highlightedRowId = highlightTarget?.id ?? null;
  const [returnNav, setReturnNav] = React.useState<{
    familyId: string;
    familyName: string;
    type: 'parent' | 'child' | 'family';
    fromTab?: 'families' | 'familiesOverview' | 'parents' | 'children';
  } | null>(null);

  const handleJumpToParent = React.useCallback(
    (
      parentId: string,
      familyId: string,
      familyName: string,
      fromTab: 'families' | 'familiesOverview' = 'families'
    ) => {
      setGlobalFilter('');
      setActiveTab('parents');
      setHighlightTarget({ id: parentId, key: Date.now() });
      setReturnNav({ familyId, familyName, type: 'parent', fromTab });
      const params = new URLSearchParams({
        fromFamily: familyId,
        familyName,
        highlight: parentId,
        type: 'parent',
        fromTab,
      });
      window.location.hash = `parents?${params.toString()}`;
    },
    []
  );

  const handleJumpToChild = React.useCallback(
    (
      childId: string,
      familyId: string,
      familyName: string,
      fromTab: 'families' | 'familiesOverview' = 'families'
    ) => {
      setGlobalFilter('');
      setActiveTab('children');
      setHighlightTarget({ id: childId, key: Date.now() });
      setReturnNav({ familyId, familyName, type: 'child', fromTab });
      const params = new URLSearchParams({
        fromFamily: familyId,
        familyName,
        highlight: childId,
        type: 'child',
        fromTab,
      });
      window.location.hash = `children?${params.toString()}`;
    },
    []
  );

  const handleJumpFromParentsToChildren = React.useCallback((familyId: string, familyName: string) => {
    setGlobalFilter('');
    setActiveTab('children');
    setHighlightTarget({ id: familyId, key: Date.now() });
    setReturnNav({ familyId, familyName, type: 'family', fromTab: 'parents' });
    const params = new URLSearchParams({
      fromFamily: familyId,
      familyName,
      highlight: familyId,
      type: 'family',
      fromTab: 'parents',
    });
    window.location.hash = `children?${params.toString()}`;
  }, []);

  const handleJumpFromChildrenToParents = React.useCallback((familyId: string, familyName: string) => {
    setGlobalFilter('');
    setActiveTab('parents');
    setHighlightTarget({ id: familyId, key: Date.now() });
    setReturnNav({ familyId, familyName, type: 'family', fromTab: 'children' });
    const params = new URLSearchParams({
      fromFamily: familyId,
      familyName,
      highlight: familyId,
      type: 'family',
      fromTab: 'children',
    });
    window.location.hash = `parents?${params.toString()}`;
  }, []);

  const handleReturnToFamilies = React.useCallback(() => {
    const famId = returnNav?.familyId;
    const targetTab = returnNav?.fromTab || 'families';
    setActiveTab(targetTab);
    if (famId) {
      setHighlightTarget({ id: famId, key: Date.now() });
      window.location.hash = `${targetTab}?highlight=${famId}`;
    } else {
      window.location.hash = targetTab;
    }
    setReturnNav(null);
    setGlobalFilter('');
  }, [returnNav]);

  const handleDismissReturnNav = React.useCallback(() => {
    setReturnNav(null);
    setHighlightTarget(null);
    const currentTab = window.location.hash.replace('#', '').split('?')[0] || activeTab;
    window.history.replaceState(null, '', `#${currentTab}`);
  }, [activeTab]);

  const handleTabClick = React.useCallback((tab: typeof activeTab) => {
    setGlobalFilter('');
    setReturnNav(null);
    setHighlightTarget(null);
    window.location.hash = tab;
  }, []);

  // Horizontal scrollable tabs management
  const tabsNavRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollButtons = React.useCallback(() => {
    const el = tabsNavRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(hasOverflow && el.scrollLeft > 2);
    setCanScrollRight(hasOverflow && el.scrollWidth - el.scrollLeft - el.clientWidth > 2);
  }, []);

  const handleTabScroll = (direction: 'left' | 'right') => {
    const el = tabsNavRef.current;
    if (!el) return;
    const scrollAmount = Math.max(160, el.clientWidth * 0.6);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  React.useEffect(() => {
    const el = tabsNavRef.current;
    if (!el) return;

    updateScrollButtons();

    const ro = new ResizeObserver(() => {
      updateScrollButtons();
    });
    ro.observe(el);

    window.addEventListener('resize', updateScrollButtons);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [updateScrollButtons]);

  React.useEffect(() => {
    const el = tabsNavRef.current;
    if (!el) return;
    const activeEl = el.querySelector('[data-active="true"]') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = setTimeout(updateScrollButtons, 300);
    return () => clearTimeout(timer);
  }, [activeTab, updateScrollButtons]);

  React.useEffect(() => {
    const el = tabsNavRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY !== 0 && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        updateScrollButtons();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [updateScrollButtons]);

  // Audit states
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

  // Modal states
  const [addParentOpen, setAddParentOpen] = React.useState(false);
  const [targetFamily, setTargetFamily] = React.useState<{ id: string; name: string } | null>(null);
  const [newParentFirstName, setNewParentFirstName] = React.useState('');
  const [newParentLastName, setNewParentLastName] = React.useState('');
  const [newParentTollhausEmail, setNewParentTollhausEmail] = React.useState('');
  const [isTollhausEmailDirty, setIsTollhausEmailDirty] = React.useState(false);

  const [addFamilyOpen, setAddFamilyOpen] = React.useState(false);
  const [p1FirstName, setP1FirstName] = React.useState('');
  const [p1LastName, setP1LastName] = React.useState('');
  const [p2FirstName, setP2FirstName] = React.useState('');
  const [p2LastName, setP2LastName] = React.useState('');
  const [isP2LastNameDirty, setIsP2LastNameDirty] = React.useState(false);

  const [addChildOpen, setAddChildOpen] = React.useState(false);
  const [newChildFirstName, setNewChildFirstName] = React.useState('');
  const [newChildLastName, setNewChildLastName] = React.useState('');
  const [newChildBirthDate, setNewChildBirthDate] = React.useState('');

  // Hygiene Belehrung Event popover states
  const [targetParent, setTargetParent] = React.useState<ParentWithHygiene | null>(null);
  const [hygienePopoverAnchor, setHygienePopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Membership popover state
  const [targetParentMemberships, setTargetParentMemberships] = React.useState<Parent | null>(null);
  const [membershipPopoverAnchor, setMembershipPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Group Change popover state
  const [targetChildGroupChanges, setTargetChildGroupChanges] = React.useState<Child | null>(null);
  const [groupPopoverAnchor, setGroupPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // MultiValue (Emails/Phones) popover state
  const [targetParentMultiValue, setTargetParentMultiValue] = React.useState<Parent | null>(null);
  const [activeMultiValueField, setActiveMultiValueField] = React.useState<'emails' | 'phones' | null>(null);
  const [multiValuePopoverAnchor, setMultiValuePopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Vaccination Status popover state
  const [targetVaccinationPerson, setTargetVaccinationPerson] = React.useState<{ id: string; type: 'parent' | 'child' } | null>(null);
  const [vaccinationPopoverAnchor, setVaccinationPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  const [confirmDelete, setConfirmDelete] = React.useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });

  const [undoStack, setUndoStack] = React.useState<any[]>(() => {
    const saved = localStorage.getItem('thweb_undo_stack');
    return saved ? JSON.parse(saved) : [];
  });
  const [redoStack, setRedoStack] = React.useState<any[]>(() => {
    const saved = localStorage.getItem('thweb_redo_stack');
    return saved ? JSON.parse(saved) : [];
  });

  const undoStackRef = React.useRef(undoStack);
  const redoStackRef = React.useRef(redoStack);
  React.useEffect(() => {
    undoStackRef.current = undoStack;
    redoStackRef.current = redoStack;
  }, [undoStack, redoStack]);

  const saveStacks = (undo: any[], redo: any[]) => {
    undoStackRef.current = undo;
    redoStackRef.current = redo;
    setUndoStack(undo);
    setRedoStack(redo);
    localStorage.setItem('thweb_undo_stack', JSON.stringify(undo));
    localStorage.setItem('thweb_redo_stack', JSON.stringify(redo));
  };

  const pushAction = (action: any) => {
    const newUndo = [...undoStackRef.current, action];
    if (newUndo.length > 50) {
      newUndo.shift();
    }
    saveStacks(newUndo, []);
  };

  const purgeActionsForEntity = (entityId: string) => {
    const isActionReferencing = (action: any) => {
      const p = action?.payload || {};
      return (
        p.familyId === entityId ||
        p.parentId === entityId ||
        p.childId === entityId ||
        p.membershipId === entityId ||
        p.eventId === entityId ||
        p.changeId === entityId ||
        p.parent?.id === entityId ||
        p.child?.id === entityId ||
        p.membership?.id === entityId ||
        p.event?.id === entityId ||
        p.change?.id === entityId ||
        (Array.isArray(p.beforeParents) && p.beforeParents.some((x: any) => x?.id === entityId)) ||
        (Array.isArray(p.afterParents) && p.afterParents.some((x: any) => x?.id === entityId))
      );
    };

    const newUndo = undoStackRef.current.filter((a) => !isActionReferencing(a));
    const newRedo = redoStackRef.current.filter((a) => !isActionReferencing(a));
    saveStacks(newUndo, newRedo);
  };

  const executeHistoryAction = async (action: any, isUndo: boolean) => {
    const { type, payload } = action;

    // Switch to target tab if needed
    const targetTab = payload.tab || (type.includes('CHILD') ? 'children' : 'parents');
    if (targetTab) {
      setActiveTab(targetTab);
      window.location.hash = targetTab;
      localStorage.setItem('thweb_active_tab', targetTab);
    }

    try {
      if (type === 'UPDATE_PARENT') {
        const targetParents = isUndo ? payload.beforeParents : payload.afterParents;
        const res = await fetch(`/api/families/${payload.familyId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ parents: targetParents }),
        });
        if (!res.ok) throw new Error();
      } 
      else if (type === 'UPDATE_CHILD') {
        const targetChild = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/children/${payload.childId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(targetChild),
        });
        if (!res.ok) throw new Error();
      }
      else if (type === 'ADD_FAMILY') {
        if (isUndo) {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/families/${payload.familyId}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ parents: payload.parents }),
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_PARENT') {
        if (isUndo) {
          const res = await fetch(`/api/parents/${payload.parent.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/families/${payload.parent.family_id}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ parents: payload.beforeParents }),
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_CHILD') {
        if (isUndo) {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/children/${payload.child.id}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload.child),
          });
          if (!res.ok) throw new Error();
        }
      }
      else if (type === 'ADD_MEMBERSHIP') {
        if (isUndo) {
          const res = await fetch(`/api/memberships/${payload.membershipId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch('/api/memberships', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              parent_id: payload.parentId,
              start_date: payload.membership.start_date,
              end_date: payload.membership.end_date,
              membership_type: payload.membership.membership_type,
            }),
          });
          if (!res.ok) throw new Error();
          const created = await res.json();
          payload.membershipId = created.id;
          payload.membership = created;
        }
      }
      else if (type === 'ADD_HYGIENE_EVENT') {
        if (isUndo) {
          const res = await fetch(`/api/hygiene-events/${payload.eventId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch('/api/hygiene-events', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              parent_id: payload.parentId,
              event_date: payload.event.event_date,
              event_type: payload.event.event_type,
              documentation: payload.event.documentation,
            }),
          });
          if (!res.ok) throw new Error();
          const created = await res.json();
          payload.eventId = created.id;
          payload.event = created;
        }
      }
      else if (type === 'ADD_GROUP_CHANGE') {
        if (isUndo) {
          const res = await fetch(`/api/children_group_changes/${payload.changeId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`/api/children/${payload.childId}/group_changes`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              child_id: payload.childId,
              change_date: payload.change.change_date,
              target_group: payload.change.target_group,
            }),
          });
          if (!res.ok) throw new Error();
          const created = await res.json();
          payload.changeId = created.id;
          payload.change = created;
        }
      }
      else if (type === 'UPDATE_GROUP_CHANGE') {
        const target = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/children_group_changes/${payload.changeId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            change_date: target.change_date,
            target_group: target.target_group,
          }),
        });
        if (!res.ok) throw new Error();
      }
      else if (type === 'UPDATE_MEMBERSHIP') {
        const target = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/memberships/${payload.membershipId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            start_date: target.start_date,
            end_date: target.end_date,
            membership_type: target.membership_type,
          }),
        });
        if (!res.ok) throw new Error();
      }
      else if (type === 'UPDATE_HYGIENE_EVENT') {
        const target = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/hygiene-events/${payload.eventId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            event_date: target.event_date,
            event_type: target.event_type,
            documentation: target.documentation,
          }),
        });
        if (!res.ok) throw new Error();
      }

      await fetchFamilies();

      // Scroll and highlight target row
      const targetId = payload.childId || payload.parentId || payload.familyId || payload.child?.id || payload.parent?.id;
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(`row-${targetId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.backgroundColor = 'rgba(234, 179, 8, 0.2)'; // amber flash
            el.style.transition = 'background-color 0.5s ease-out';
            setTimeout(() => {
              el.style.backgroundColor = '';
              el.style.transition = '';
            }, 1000);
          }
        }, 100);
      }
    } catch (e) {
      alert('Failed to sync undo/redo state with backend.');
    }
  };

  const handleUndo = async () => {
    if (undoStackRef.current.length === 0) return;
    const nextUndo = [...undoStackRef.current];
    const action = nextUndo.pop()!;
    await executeHistoryAction(action, true);
    saveStacks(nextUndo, [action, ...redoStackRef.current]);
  };

  const handleRedo = async () => {
    if (redoStackRef.current.length === 0) return;
    const nextRedo = [...redoStackRef.current];
    const action = nextRedo.shift()!;
    await executeHistoryAction(action, false);
    saveStacks([...undoStackRef.current, action], nextRedo);
  };

  const undoRef = React.useRef(handleUndo);
  const redoRef = React.useRef(handleRedo);

  React.useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  });

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && !e.shiftKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undoRef.current();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redoRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchFamilies = React.useCallback((explicitKmsToken?: string) => {
    return fetch('/api/families', {
      headers: getAuthHeaders({}, explicitKmsToken),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              // Fetch families in locked state
              return fetch('/api/families', {
                headers: getAuthHeaders({}, ''),
              })
                .then((r) => r.json())
                .then((data) => {
                  if (Array.isArray(data)) setFamilies(data);
                  return data;
                });
            }
          }
          throw new Error('Failed to fetch families');
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setFamilies(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [getAuthHeaders]);

  const fetchOverviewFamilies = React.useCallback(() => {
    return fetch('/api/families/overview', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch families overview');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setOverviewFamilies(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [getAuthHeaders]);

  React.useEffect(() => {
    if (canReadFamiliesAll) {
      fetchFamilies();
    }
    if (canReadOverview) {
      fetchOverviewFamilies();
    }
  }, [canReadFamiliesAll, canReadOverview, fetchFamilies, fetchOverviewFamilies]);

  const applyKmsToken = React.useCallback(async (tokenToApply: string) => {
    try {
      const res = await fetch('/api/families', {
        headers: getAuthHeaders({}, tokenToApply),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          sessionStorage.setItem('kms_access_token', tokenToApply);
          setKmsAccessToken(tokenToApply);
          setKmsError(null);
          setFamilies(data);
          return true;
        }
      }
      // KMS rejected (e.g. 403 Forbidden with kms_access_denied)
      sessionStorage.removeItem('kms_access_token');
      setKmsAccessToken(null);
      const errMsg = t('kmsAccessDenied');
      setKmsError(errMsg);
      alert(errMsg);
      fetchFamilies('');
      return false;
    } catch (err) {
      console.error('Failed to apply KMS token:', err);
      sessionStorage.removeItem('kms_access_token');
      setKmsAccessToken(null);
      const errMsg = t('kmsAccessDenied');
      setKmsError(errMsg);
      alert(errMsg);
      fetchFamilies('');
      return false;
    }
  }, [getAuthHeaders, fetchFamilies]);

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/cloudkms',
    onSuccess: (tokenResponse) => {
      applyKmsToken(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google KMS OAuth error:', error);
      alert('Google Authorization failed: ' + (error.error_description || error.error || 'Unknown error'));
    },
    onNonOAuthError: (nonOAuthError) => {
      console.log('Google KMS OAuth event:', nonOAuthError);
    },
  });

  const handleRequestKmsAuth = React.useCallback(() => {
    setKmsError(null);
    const protectedDataClientId =
      window.ENV?.GOOGLE_PROTECTED_DATA_CLIENT_ID ||
      import.meta.env.VITE_GOOGLE_PROTECTED_DATA_CLIENT_ID ||
      'mock-protected-data';
    const isMock = !protectedDataClientId || protectedDataClientId === 'mock-protected-data' || protectedDataClientId === 'mock';
    if (isMock) {
      applyKmsToken('mock-kms-token');
      return;
    }
    googleLogin();
  }, [googleLogin, applyKmsToken]);

  const handleLockKmsAuth = React.useCallback(() => {
    sessionStorage.removeItem('kms_access_token');
    setKmsAccessToken(null);
    setKmsError(null);
    fetchFamilies('');
  }, [fetchFamilies]);

  const fetchAuditLogs = React.useCallback(() => {
    setAuditLoading(true);
    fetch('/api/audit-logs', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        return res.json();
      })
      .then((data) => {
        setAuditLogs(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(err))
      .finally(() => setAuditLoading(false));
  }, [getAuthHeaders]);

  React.useEffect(() => {
    if (activeTab === 'audit') {
      if (canReadAudit) {
        fetchAuditLogs();
      } else {
        setActiveTab('parents');
        localStorage.setItem('thweb_active_tab', 'parents');
        window.location.hash = 'parents';
      }
    }
  }, [activeTab, fetchAuditLogs, canReadAudit]);

  // Scroll to and highlight targeted row
  React.useEffect(() => {
    if (!highlightTarget) return;
    const targetId = highlightTarget.id;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById(`row-${targetId}`);
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        // Force CSS animation replay in case the class was already applied
        el.classList.remove('highlighted-row');
        void el.offsetWidth;
        el.classList.add('highlighted-row');
      } else if (attempts >= 25) {
        clearInterval(interval);
      }
    }, 40);

    const clearTimer = setTimeout(() => {
      setHighlightTarget(null);
    }, 1800);

    return () => {
      clearInterval(interval);
      clearTimeout(clearTimer);
    };
  }, [activeTab, highlightTarget]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '');
      const [hash, queryString] = rawHash.split('?');
      const searchParams = new URLSearchParams(queryString || '');
      const highlight = searchParams.get('highlight');
      const fromFamily = searchParams.get('fromFamily');
      const familyName = searchParams.get('familyName');
      const type = searchParams.get('type') as 'parent' | 'child' | 'family' | null;
      const fromTab = searchParams.get('fromTab') as 'families' | 'familiesOverview' | 'parents' | 'children' | null;

      if (
        (hash === 'familiesOverview' && canReadOverview) ||
        (hash === 'parents' && canReadFamiliesAll) ||
        (hash === 'children' && canReadFamiliesAll) ||
        (hash === 'families' && canReadFamiliesAll) ||
        (hash === 'childcareFees' && canReadFees) ||
        (hash === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
        (hash === 'audit' && canReadAudit) ||
        (hash === 'admin' && canManageUsers) ||
        (hash === 'kiosk' && canProvisionKiosk) ||
        hash === 'dashboard'
      ) {
        setActiveTab(hash as any);
        localStorage.setItem('thweb_active_tab', hash);

        if (highlight) {
          setHighlightTarget({ id: highlight, key: Date.now() });
        } else {
          setHighlightTarget(null);
        }

        if (fromFamily && familyName && type) {
          setReturnNav({
            familyId: fromFamily,
            familyName,
            type,
            fromTab: fromTab || 'families',
          });
        } else {
          setReturnNav(null);
        }
      } else if (hash === 'families' && !canReadFamiliesAll && canReadOverview) {
        setActiveTab('familiesOverview');
        localStorage.setItem('thweb_active_tab', 'familiesOverview');
        window.location.hash = 'familiesOverview';
      } else if (
        (hash === 'parents' || hash === 'children') &&
        !canReadFamiliesAll
      ) {
        const fallback = canReadOverview ? 'familiesOverview' : canReadFees ? 'childcareFees' : 'familiesOverview';
        setActiveTab(fallback as any);
        localStorage.setItem('thweb_active_tab', fallback);
        window.location.hash = fallback;
      } else if (hash === 'audit' || hash === 'admin' || hash === 'kiosk') {
        const fallback = canReadFamiliesAll ? 'families' : canReadOverview ? 'familiesOverview' : 'childcareFees';
        setActiveTab(fallback as any);
        localStorage.setItem('thweb_active_tab', fallback);
        window.location.hash = fallback;
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.pathname.replace(/\/+$/, '') === '/dashboard') {
      window.history.replaceState(null, '', '/#dashboard');
    }
    if (!window.location.hash) {
      window.location.hash = activeTab;
    } else if (window.location.hash.includes('?')) {
      handleHashChange();
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [canReadAudit, canManageUsers, canProvisionKiosk, canReadOverview, canReadFamiliesAll, canReadFees, hasPermission]);

  useRealtime(React.useCallback((message: any) => {
    if (
      message.type === 'FAMILY_CREATED' || 
      message.type === 'FAMILY_UPDATED' || 
      message.type === 'CHILD_UPDATED'
    ) {
      if (canReadFamiliesAll) {
        fetchFamilies();
      }
      if (canReadOverview) {
        fetchOverviewFamilies();
      }
    }
  }, [fetchFamilies, fetchOverviewFamilies, canReadFamiliesAll, canReadOverview]));

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddParentOpen(false);
        setAddFamilyOpen(false);
        setAddChildOpen(false);
      }
    };
    if (addParentOpen || addFamilyOpen || addChildOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addParentOpen, addFamilyOpen, addChildOpen]);

  const openAddParent = (familyId: string, familyName: string) => {
    setTargetFamily({ id: familyId, name: familyName });
    setNewParentFirstName('');
    
    const family = families.find(f => f.id === familyId);
    const firstParentLastName = family?.parents?.[0]?.last_name || '';
    setNewParentLastName(firstParentLastName);
    setNewParentTollhausEmail('');
    setIsTollhausEmailDirty(false);
    
    setAddParentOpen(true);
  };

  const handleAddParentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFamily) return;
    if (!newParentFirstName.trim() || !newParentLastName.trim()) {
      alert(t('requiredFields'));
      return;
    }

    const family = families.find(f => f.id === targetFamily.id);
    if (!family) return;

    const emailStr = newParentTollhausEmail.trim();
    const initialEmails: MultiValueEntry[] = [];
    if (emailStr !== '') {
      initialEmails.push({
        value: emailStr,
        identifier_email: true,
        address_list: true,
      });
    }

    const newParentId = crypto.randomUUID();
    const newParent = {
      id: newParentId,
      family_id: family.id,
      first_name: newParentFirstName.trim(),
      last_name: newParentLastName.trim(),
      emails: initialEmails,
      phones: [] as MultiValueEntry[],
    };

    const updatedParents = [...(family.parents || []), newParent];

    fetch(`/api/families/${family.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to add parent');
        pushAction({
          type: 'ADD_PARENT',
          payload: {
            tab: activeTab === 'families' ? 'families' : 'parents',
            parent: newParent,
            beforeParents: updatedParents,
          }
        });
        fetchFamilies();
        setAddParentOpen(false);
        setNewParentTollhausEmail('');
        setIsTollhausEmailDirty(false);
      })
      .catch((err) => alert(err.message));
  };

  const openAddChild = (familyId: string, familyName: string) => {
    setTargetFamily({ id: familyId, name: familyName });
    setNewChildFirstName('');
    
    const family = families.find(f => f.id === familyId);
    const firstParentLastName = family?.parents?.[0]?.last_name || '';
    setNewChildLastName(firstParentLastName);
    const todayISO = new Date().toISOString().split('T')[0];
    setNewChildBirthDate(formatDisplayDate(todayISO));
    setAddChildOpen(true);
  };

  const handleAddChildSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFamily) return;
    const parsedDate = parseInputDate(newChildBirthDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      alert(t('invalidDateFormat'));
      return;
    }

    const newChildId = crypto.randomUUID();
    const newChild: any = {
      id: newChildId,
      family_id: targetFamily.id,
      first_name: newChildFirstName.trim(),
      last_name: newChildLastName.trim(),
      birth_date: `${parsedDate}T00:00:00Z`,
    };

    fetch(`/api/children/${newChildId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(newChild),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Failed to add child: ${errText || res.statusText}`);
        }
        pushAction({
          type: 'ADD_CHILD',
          payload: {
            tab: activeTab === 'families' ? 'families' : 'children',
            child: newChild,
          }
        });
        fetchFamilies();
        setAddChildOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const openManageMemberships = (parent: Parent, anchor?: HTMLElement | string | null) => {
    setTargetParentMemberships(parent);
    setMembershipPopoverAnchor(anchor || `cell-membership-${parent.id}`);
  };

  const closeManageMemberships = () => {
    setMembershipPopoverAnchor(null);
    setTargetParentMemberships(null);
  };

  const openManageMultiValue = (parent: Parent, field: 'emails' | 'phones', anchor?: HTMLElement | string | null) => {
    setTargetParentMultiValue(parent);
    setActiveMultiValueField(field);
    setMultiValuePopoverAnchor(anchor || `cell-${field}-${parent.id}`);
  };

  const closeManageMultiValue = () => {
    setMultiValuePopoverAnchor(null);
    setTargetParentMultiValue(null);
    setActiveMultiValueField(null);
  };

  const handleAddMembership = async (
    parentId: string,
    startDate: string,
    endDate: string | null,
    membershipType: 'full_member' | 'supporting_member'
  ) => {
    const res = await fetch('/api/memberships', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        parent_id: parentId,
        start_date: startDate,
        end_date: endDate,
        membership_type: membershipType,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to create membership: ${err || res.statusText}`);
    }
    const created = await res.json();
    pushAction({
      type: 'ADD_MEMBERSHIP',
      payload: {
        tab: 'parents',
        parentId: parentId,
        membershipId: created.id,
        membership: created,
      },
    });
    fetchFamilies();
    if (targetParentMemberships && targetParentMemberships.id === parentId) {
      const existing = targetParentMemberships.memberships || [];
      const updatedMemberships = [...existing, created].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
      setTargetParentMemberships({ ...targetParentMemberships, memberships: updatedMemberships });
    }
  };

  const handleUpdateMembership = async (
    membershipId: string,
    fields: {
      start_date?: string;
      end_date?: string | null;
      membership_type?: 'full_member' | 'supporting_member';
    }
  ) => {
    const existingMembership = (targetParentMemberships?.memberships || []).find((m) => m.id === membershipId);
    if (!existingMembership) return;
    const parentId = targetParentMemberships?.id || existingMembership.parent_id;

    const payload = {
      start_date: fields.start_date !== undefined ? fields.start_date : existingMembership.start_date,
      end_date: fields.end_date !== undefined ? fields.end_date : existingMembership.end_date,
      membership_type: fields.membership_type !== undefined ? fields.membership_type : existingMembership.membership_type,
    };

    const res = await fetch(`/api/memberships/${membershipId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to update membership: ${err || res.statusText}`);
    }
    const updated = await res.json();
    if (existingMembership && parentId) {
      pushAction({
        type: 'UPDATE_MEMBERSHIP',
        payload: {
          tab: 'parents',
          parentId: parentId,
          membershipId: membershipId,
          before: {
            start_date: existingMembership.start_date,
            end_date: existingMembership.end_date,
            membership_type: existingMembership.membership_type,
          },
          after: {
            start_date: payload.start_date,
            end_date: payload.end_date,
            membership_type: payload.membership_type,
          },
        },
      });
    }
    fetchFamilies();
    if (targetParentMemberships) {
      const existing = targetParentMemberships.memberships || [];
      const updatedMemberships = existing
        .map((m) => (m.id === membershipId ? updated : m))
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
      setTargetParentMemberships({ ...targetParentMemberships, memberships: updatedMemberships });
    }
  };

  const handleDeleteMembership = async (membershipId: string) => {
    if (!targetParentMemberships) return;

    const res = await fetch(`/api/memberships/${membershipId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to delete membership: ${err || res.statusText}`);
    }
    purgeActionsForEntity(membershipId);
    fetchFamilies();
    const updatedMemberships = (targetParentMemberships.memberships || []).filter((m) => m.id !== membershipId);
    setTargetParentMemberships({ ...targetParentMemberships, memberships: updatedMemberships });
  };

  const openManageHygiene = React.useCallback((parent: ParentWithHygiene, anchor: HTMLElement | string) => {
    setTargetParent(parent);
    setHygienePopoverAnchor(anchor);
  }, []);

  const closeManageHygiene = React.useCallback(() => {
    setHygienePopoverAnchor(null);
    setTargetParent(null);
  }, []);

  const handleAddHygieneEvent = async (parentId: string, eventDate: string, eventType: 'initial' | 'recertify', documentation: string) => {
    const payload = {
      parent_id: parentId,
      event_date: eventDate,
      event_type: eventType,
      documentation: documentation,
    };

    const res = await fetch('/api/hygiene-events', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to create hygiene event: ${err || res.statusText}`);
    }
    const createdEvent = await res.json();
    pushAction({
      type: 'ADD_HYGIENE_EVENT',
      payload: {
        tab: activeTab === 'hygieneBelehrung' ? 'hygieneBelehrung' : 'parents',
        parentId: parentId,
        eventId: createdEvent.id,
        event: createdEvent,
      }
    });
    await fetchFamilies();
  };

  const handleDeleteHygieneEvent = async (eventId: string) => {
    if (!window.confirm(t('eventDeleteConfirm'))) return;

    const res = await fetch(`/api/hygiene-events/${eventId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to delete hygiene event: ${err || res.statusText}`);
    }
    purgeActionsForEntity(eventId);
    await fetchFamilies();
  };

  const handleUpdateHygieneEvent = async (
    eventId: string,
    fields: {
      event_date?: string;
      event_type?: 'initial' | 'recertify';
      documentation?: string;
    }
  ) => {
    const existingEvent = (activeParentForHygiene?.events || []).find((e) => e.id === eventId);
    if (!existingEvent) return;
    const parentId = activeParentForHygiene?.id || existingEvent.parent_id;

    const payload = {
      event_date: fields.event_date !== undefined ? fields.event_date : existingEvent.event_date,
      event_type: fields.event_type !== undefined ? fields.event_type : existingEvent.event_type,
      documentation: fields.documentation !== undefined ? fields.documentation : existingEvent.documentation,
    };

    const res = await fetch(`/api/hygiene-events/${eventId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to update hygiene event: ${err || res.statusText}`);
    }
    await res.json();
    if (existingEvent && parentId) {
      pushAction({
        type: 'UPDATE_HYGIENE_EVENT',
        payload: {
          tab: activeTab === 'hygieneBelehrung' ? 'hygieneBelehrung' : 'parents',
          parentId: parentId,
          eventId: eventId,
          before: {
            event_date: existingEvent.event_date,
            event_type: existingEvent.event_type,
            documentation: existingEvent.documentation,
          },
          after: {
            event_date: payload.event_date,
            event_type: payload.event_type,
            documentation: payload.documentation,
          },
        },
      });
    }
    await fetchFamilies();
  };

  const openManageGroupChanges = (child: Child, anchor: HTMLElement | string) => {
    setTargetChildGroupChanges(child);
    setGroupPopoverAnchor(anchor);
  };

  const closeManageGroupChanges = () => {
    setGroupPopoverAnchor(null);
    setTargetChildGroupChanges(null);
  };

  const handleAddGroupChange = async (childId: string, changeDate: string, targetGroup: number) => {
    const payload = {
      child_id: childId,
      change_date: changeDate,
      target_group: targetGroup,
    };

    const res = await fetch(`/api/children/${childId}/group_changes`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to create group change: ${err || res.statusText}`);
    }
    const created = await res.json();
    pushAction({
      type: 'ADD_GROUP_CHANGE',
      payload: {
        tab: 'children',
        childId: childId,
        changeId: created.id,
        change: created,
      }
    });
    fetchFamilies();
    if (targetChildGroupChanges && targetChildGroupChanges.id === childId) {
      const existing = targetChildGroupChanges.group_changes || [];
      const filtered = existing.filter((c) => c.change_date !== created.change_date);
      const updatedChanges = [created, ...filtered].sort(
        (a, b) => a.change_date.localeCompare(b.change_date)
      );
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const handleDeleteGroupChange = async (changeId: string) => {
    const res = await fetch(`/api/children_group_changes/${changeId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to delete group change: ${err || res.statusText}`);
    }
    purgeActionsForEntity(changeId);
    fetchFamilies();
    if (targetChildGroupChanges) {
      const updatedChanges = (targetChildGroupChanges.group_changes || []).filter((c) => c.id !== changeId);
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const handleUpdateGroupChange = async (changeId: string, changeDate: string, targetGroup: number) => {
    const existingChange = (targetChildGroupChanges?.group_changes || []).find((c) => c.id === changeId)
      || families.flatMap((f) => f.children || []).flatMap((c) => c.group_changes || []).find((c) => c.id === changeId);
    const childId = targetChildGroupChanges?.id || existingChange?.child;

    const res = await fetch(`/api/children_group_changes/${changeId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        change_date: changeDate,
        target_group: targetGroup,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to update group change: ${err || res.statusText}`);
    }
    const updated = await res.json();
    if (existingChange && childId) {
      pushAction({
        type: 'UPDATE_GROUP_CHANGE',
        payload: {
          tab: 'children',
          childId: childId,
          changeId: changeId,
          before: {
            change_date: existingChange.change_date,
            target_group: existingChange.target_group,
          },
          after: {
            change_date: changeDate,
            target_group: targetGroup,
          },
        },
      });
    }
    fetchFamilies();
    if (targetChildGroupChanges) {
      const existing = targetChildGroupChanges.group_changes || [];
      const updatedChanges = existing
        .map((c) => (c.id === changeId ? updated : c))
        .sort((a, b) => a.change_date.localeCompare(b.change_date));
      setTargetChildGroupChanges({ ...targetChildGroupChanges, group_changes: updatedChanges });
    }
  };

  const activeChildForGroupChanges = React.useMemo(() => {
    if (!targetChildGroupChanges) return null;
    for (const f of families) {
      const found = (f.children || []).find((c) => c.id === targetChildGroupChanges.id);
      if (found) return found;
    }
    for (const f of overviewFamilies) {
      const found = (f.children || []).find((c) => c.id === targetChildGroupChanges.id);
      if (found) return found as Child;
    }
    return targetChildGroupChanges;
  }, [families, overviewFamilies, targetChildGroupChanges]);

  const activeParentForHygiene = React.useMemo(() => {
    if (!targetParent) return null;
    for (const f of families) {
      const found = (f.parents || []).find((p) => p.id === targetParent.id);
      if (found) return found;
    }
    return targetParent;
  }, [families, targetParent]);

  const activeParentForMemberships = React.useMemo(() => {
    if (!targetParentMemberships) return null;
    for (const f of families) {
      const found = (f.parents || []).find((p) => p.id === targetParentMemberships.id);
      if (found) return found;
    }
    return targetParentMemberships;
  }, [families, targetParentMemberships]);

  const activeFamilyForMemberships = React.useMemo(() => {
    if (!activeParentForMemberships) return null;
    for (const f of families) {
      if (
        (activeParentForMemberships.family_id && f.id === activeParentForMemberships.family_id) ||
        (f.parents || []).some((p) => p.id === activeParentForMemberships.id)
      ) {
        return f;
      }
    }
    return null;
  }, [families, activeParentForMemberships]);

  const activeParentForMultiValue = React.useMemo(() => {
    if (!targetParentMultiValue) return null;
    for (const f of families) {
      const found = (f.parents || []).find((p) => p.id === targetParentMultiValue.id);
      if (found) return found;
    }
    return targetParentMultiValue;
  }, [families, targetParentMultiValue]);

  const activeMultiValueValues = React.useMemo(() => {
    if (!activeParentForMultiValue || !activeMultiValueField) return [];
    return activeParentForMultiValue[activeMultiValueField] || [];
  }, [activeParentForMultiValue, activeMultiValueField]);

  const activeMultiValueTitle = activeMultiValueField === 'emails' ? t('emailsEdit') : t('phonesEdit');
  const activeMultiValuePlaceholder = activeMultiValueField === 'emails' ? t('addEmail') : t('addPhone');

  const emailFlagsConfig: MultiValueFlagConfig[] = React.useMemo(() => [
    {
      key: 'identifier_email',
      icon: '🆔',
      label: t('identifierEmailFlag') || 'Identifikator-E-Mail',
      titleActive: t('identifierEmailActive') || 'Als Identifikator-E-Mail festgelegt',
      titleInactive: t('identifierEmailInactive') || 'Nicht als Identifikator-E-Mail festgelegt',
      defaultValue: false,
    },
    {
      key: 'address_list',
      icon: '📋',
      label: t('addressListFlag') || 'In Adressliste',
      titleActive: t('addressListIncluded') || 'In Adressliste aufnehmen',
      titleInactive: t('addressListExcluded') || 'Nicht in Adressliste aufnehmen',
      defaultValue: true,
    },
  ], []);

  const phoneFlagsConfig: MultiValueFlagConfig[] = React.useMemo(() => [
    {
      key: 'address_list',
      icon: '📋',
      label: t('addressListFlag') || 'In Adressliste',
      titleActive: t('addressListIncluded') || 'In Adressliste aufnehmen',
      titleInactive: t('addressListExcluded') || 'Nicht in Adressliste aufnehmen',
      defaultValue: true,
    },
  ], []);

  const activeMultiValueFlags = activeMultiValueField === 'emails' ? emailFlagsConfig : phoneFlagsConfig;

  const canEditMultiValueItem = React.useCallback(
    (item: MultiValueItem) => {
      if (activeMultiValueField === 'emails') {
        if (isFlagActive(item, 'identifier_email', false) && !hasPermission('families.all.write')) {
          return false;
        }
      }
      return true;
    },
    [activeMultiValueField, hasPermission]
  );

  const canDeleteMultiValueItem = React.useCallback(
    (item: MultiValueItem) => {
      if (activeMultiValueField === 'emails') {
        if (isFlagActive(item, 'identifier_email', false) && !hasPermission('families.all.write')) {
          return false;
        }
      }
      return true;
    },
    [activeMultiValueField, hasPermission]
  );

  const canToggleMultiValueFlag = React.useCallback(
    (item: MultiValueItem | null, flagKey: string) => {
      if (activeMultiValueField === 'emails' && flagKey === 'identifier_email') {
        return hasPermission('families.all.write');
      }
      if (activeMultiValueField === 'emails' && item && isFlagActive(item, 'identifier_email', false)) {
        if (!hasPermission('families.all.write')) {
          return false;
        }
      }
      return true;
    },
    [activeMultiValueField, hasPermission]
  );

  const getMultiValueDisabledReason = React.useCallback(
    (item: MultiValueItem | null, _action: 'edit' | 'delete' | 'toggle', flagKey?: string) => {
      if (activeMultiValueField === 'emails') {
        if (flagKey === 'identifier_email' && !hasPermission('families.all.write')) {
          return t('identifierEmailPermissionRequired') || 'families.all.write permission required';
        }
        if (item && isFlagActive(item, 'identifier_email', false) && !hasPermission('families.all.write')) {
          return t('identifierEmailPermissionRequired') || 'families.all.write permission required';
        }
      }
      return undefined;
    },
    [activeMultiValueField, hasPermission]
  );

  const handleSaveActiveMultiValue = (newValues: (string | MultiValueEntry)[]) => {
    if (!activeParentForMultiValue || !activeMultiValueField) return;
    handleSaveParentField(activeParentForMultiValue, activeMultiValueField, newValues);
  };

  const openAddFamily = () => {
    setP1FirstName('');
    setP1LastName('');
    setP2FirstName('');
    setP2LastName('');
    setIsP2LastNameDirty(false);
    setAddFamilyOpen(true);
  };

  const handleAddFamilySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1FirstName.trim() || p1LastName.trim() === '') {
      alert(t('parent1Required'));
      return;
    }

    const parentsToCreate = [
      {
        first_name: p1FirstName.trim(),
        last_name: p1LastName.trim(),
        emails: [] as MultiValueEntry[],
        phones: [] as MultiValueEntry[],
      },
    ];

    if (p2FirstName.trim() && p2LastName.trim()) {
      parentsToCreate.push({
        first_name: p2FirstName.trim(),
        last_name: p2LastName.trim(),
        emails: [] as MultiValueEntry[],
        phones: [] as MultiValueEntry[],
      });
    }

    fetch('/api/families', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        parents: parentsToCreate,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create family');
        return res.json();
      })
      .then((createdFamily) => {
        pushAction({
          type: 'ADD_FAMILY',
          payload: {
            tab: activeTab === 'children' ? 'children' : activeTab === 'families' ? 'families' : 'parents',
            familyId: createdFamily.id,
            parents: createdFamily.parents || [],
          }
        });
        fetchFamilies();
        setAddFamilyOpen(false);
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveParentField = (parent: Parent, fieldName: keyof Parent, newValue: any) => {
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return Promise.resolve();

    const originalParents = family.parents || [];
    const updatedParents = originalParents.map(p => 
      p.id === parent.id ? { ...p, [fieldName]: newValue } : p
    );

    return fetch(`/api/families/${family.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              const errMsg = t('kmsAccessDenied');
              setKmsError(errMsg);
              throw new Error(errMsg);
            }
            if (errData.error) {
              alert(errData.error);
              throw new Error(errData.error);
            }
          }
          throw new Error('Failed to update parent');
        }
        pushAction({
          type: 'UPDATE_PARENT',
          payload: {
            tab: 'parents',
            familyId: family.id,
            parentId: parent.id,
            beforeParents: originalParents,
            afterParents: updatedParents,
          }
        });
        return fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveFamilyParents = (familyId: string, updatedParents: Parent[]) => {
    const family = families.find(f => f.id === familyId);
    if (!family) return;

    const originalParents = family.parents || [];

    fetch(`/api/families/${family.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parents: updatedParents }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              const errMsg = t('kmsAccessDenied');
              setKmsError(errMsg);
              throw new Error(errMsg);
            }
            if (errData.error) {
              alert(errData.error);
              throw new Error(errData.error);
            }
          }
          throw new Error('Failed to update parents');
        }
        pushAction({
          type: 'UPDATE_PARENT',
          payload: {
            tab: 'parents',
            familyId: family.id,
            beforeParents: originalParents,
            afterParents: updatedParents,
          }
        });
        fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveChildField = (child: Child, fieldName: keyof Child, newValue: any) => {
    let formattedValue = newValue;
    const isDateField = fieldName === 'birth_date';
    if (isDateField && newValue && typeof newValue === 'string' && !newValue.includes('T')) {
      formattedValue = `${newValue}T00:00:00Z`;
    }

    const updatedChild = { ...child, [fieldName]: formattedValue };
    
    return fetch(`/api/children/${child.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updatedChild),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'kms_access_denied') {
              sessionStorage.removeItem('kms_access_token');
              setKmsAccessToken(null);
              const errMsg = t('kmsAccessDenied');
              setKmsError(errMsg);
              throw new Error(errMsg);
            }
          }
          throw new Error('Failed to update child');
        }
        pushAction({
          type: 'UPDATE_CHILD',
          payload: {
            tab: 'children',
            childId: child.id,
            before: child,
            after: updatedChild,
          }
        });
        return fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleDeleteParent = (parentId: string) => {
    const parent = families.flatMap(f => f.parents || []).find(p => p.id === parentId);
    if (!parent) return;
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return;

    setConfirmDelete({
      isOpen: true,
      message: t('deleteParentConfirm'),
      onConfirm: () => {
        fetch(`/api/parents/${parentId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete parent');
            purgeActionsForEntity(parentId);
            fetchFamilies();
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          })
          .catch((err) => {
            alert(err.message);
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          });
      }
    });
  };

  const handleDeleteChild = (childId: string) => {
    const child = families.flatMap(f => f.children || []).find(c => c.id === childId);
    if (!child) return;

    setConfirmDelete({
      isOpen: true,
      message: t('deleteChildConfirm'),
      onConfirm: () => {
        fetch(`/api/children/${childId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete child');
            purgeActionsForEntity(childId);
            fetchFamilies();
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          })
          .catch((err) => {
            alert(err.message);
            setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          });
      }
    });
  };

  const openManageVaccination = React.useCallback((personId: string, type: 'parent' | 'child', anchor: HTMLElement | string) => {
    setTargetVaccinationPerson({ id: personId, type });
    setVaccinationPopoverAnchor(anchor);
  }, []);

  const closeManageVaccination = React.useCallback(() => {
    setVaccinationPopoverAnchor(null);
    setTargetVaccinationPerson(null);
  }, []);

  const activeVaccinationData = React.useMemo(() => {
    if (!targetVaccinationPerson) return null;
    if (targetVaccinationPerson.type === 'parent') {
      const parent = families.flatMap((f) => f.parents || []).find((p) => p.id === targetVaccinationPerson.id);
      if (!parent) return null;
      return {
        id: parent.id,
        type: 'parent' as const,
        checks: parent.vaccination_checks || [],
        save: (newChecks: VaccinationCheck[]) => handleSaveParentField(parent, 'vaccination_checks', newChecks),
      };
    } else {
      const child = families.flatMap((f) => f.children || []).find((c) => c.id === targetVaccinationPerson.id);
      if (!child) return null;
      return {
        id: child.id,
        type: 'child' as const,
        checks: child.vaccination_checks || [],
        save: (newChecks: VaccinationCheck[]) => handleSaveChildField(child, 'vaccination_checks', newChecks),
      };
    }
  }, [families, targetVaccinationPerson, handleSaveParentField, handleSaveChildField]);

  // Structure families with their parent sub-rows for two-layer rendering
  const parentsFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const allParents = (f.parents || []).map(p => ({
        ...p,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter parents
      const filteredParents = allParents.filter(p => {
        if (!query) return true;
        const fnMatch = (p.first_name || '').toLowerCase().includes(query);
        const lnMatch = (p.last_name || '').toLowerCase().includes(query);
        const emailMatch = (p.emails || []).some(e => getEntryValue(e).toLowerCase().includes(query));
        const phoneMatch = (p.phones || []).some(ph => getEntryValue(ph).toLowerCase().includes(query));
        const addressMatch = (p.address || '').toLowerCase().includes(query);
        return fnMatch || lnMatch || emailMatch || phoneMatch || addressMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        parents: filteredParents,
        nameMatch: familyName.toLowerCase().includes(query),
      };
    });

    if (!query) return mapped;
    return mapped.filter(f => f.nameMatch || f.parents.length > 0)
      .map(f => {
        if (f.nameMatch && f.parents.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          return {
            ...f,
            parents: (originalFamily?.parents || []).map(p => ({
              ...p,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter]);

  // Structure families with their children sub-rows for two-layer rendering
  const childrenFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const allChildren = (f.children || []).map(c => ({
        ...c,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter children
      const filteredChildren = allChildren.filter(c => {
        if (!query) return true;
        const fnMatch = (c.first_name || '').toLowerCase().includes(query);
        const lnMatch = (c.last_name || '').toLowerCase().includes(query);
        const groupInfo = getChildGroupInfo(c.group_changes);
        const groupMatch = groupInfo.groupLabel.toLowerCase().includes(query);
        const startMatch = groupInfo.startDate ? formatDisplayDate(groupInfo.startDate).toLowerCase().includes(query) : false;
        const familyLastNameMatch = lastNames.some(ln => ln.toLowerCase().includes(query));
        return fnMatch || lnMatch || groupMatch || startMatch || familyLastNameMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        children: filteredChildren,
        nameMatch: familyName.toLowerCase().includes(query),
      };
    });

    if (!query) return mapped;
    return mapped.filter(f => f.nameMatch || f.children.length > 0)
      .map(f => {
        if (f.nameMatch && f.children.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          return {
            ...f,
            children: (originalFamily?.children || []).map(c => ({
              ...c,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter]);

  // Structure families with their children sub-rows for the families tab
  const familiesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const lastNames = Array.from(new Set((f.parents || []).map(p => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'New Family';
      const parentNames = (f.parents || [])
        .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const allChildren = (f.children || []).map(c => ({
        ...c,
        family_id: f.id,
        family_name: familyName,
      }));

      // Filter children
      const filteredChildren = allChildren.filter(c => {
        if (!query) return true;
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
        const fnMatch = (c.first_name || '').toLowerCase().includes(query);
        const lnMatch = (c.last_name || '').toLowerCase().includes(query);
        const bdFormatted = formatDisplayDate(c.birth_date).toLowerCase();
        const bdRaw = (c.birth_date || '').split('T')[0];
        const bdMatch = bdFormatted.includes(query) || bdRaw.includes(query);
        const groupInfo = getChildGroupInfo(c.group_changes);
        const groupMatch = groupInfo.groupLabel.toLowerCase().includes(query);
        const familyNameMatch = familyName.toLowerCase().includes(query);
        const parentMatch = parentNames.toLowerCase().includes(query);
        const notesMatch = (c.notes || '').toLowerCase().includes(query);
        return fnMatch || lnMatch || fullName.includes(query) || bdMatch || groupMatch || familyNameMatch || parentMatch || notesMatch;
      });

      const familyMatch = familyName.toLowerCase().includes(query) || parentNames.toLowerCase().includes(query);

      const subHeader = (f.parents && f.parents.length > 0) ? (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
          {f.parents.map((p, idx) => {
            const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent';
            return (
              <React.Fragment key={p.id}>
                {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>,</span>}
                <button
                  type="button"
                  className="family-parent-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToParent(p.id, f.id, familyName);
                  }}
                  title={t('jumpToParent')}
                >
                  <span>{pName}</span>
                  <ArrowUpRight size={12} className="family-link-icon" />
                </button>
              </React.Fragment>
            );
          })}
        </span>
      ) : null;

      return {
        id: f.id,
        family_name: familyName,
        sub_header: subHeader,
        children: filteredChildren,
        nameMatch: familyMatch,
      };
    });

    if (!query) return mapped;
    return mapped.filter(f => f.nameMatch || f.children.length > 0)
      .map(f => {
        if (f.nameMatch && f.children.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          return {
            ...f,
            children: (originalFamily?.children || []).map(c => ({
              ...c,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter, handleJumpToParent]);

function formatParentsSummary(parents: any[]): string {
  if (!parents || parents.length === 0) return '';
  const validParents = parents.filter((p) => p && (p.first_name || p.last_name));
  if (validParents.length === 0) return '';
  if (validParents.length === 1) {
    return `${validParents[0].first_name || ''} ${validParents[0].last_name || ''}`.trim() || 'Elternteil';
  }
  if (validParents.length === 2) {
    const p1 = validParents[0];
    const p2 = validParents[1];
    const fn1 = (p1.first_name || '').trim();
    const ln1 = (p1.last_name || '').trim();
    const fn2 = (p2.first_name || '').trim();
    const ln2 = (p2.last_name || '').trim();

    if (ln1 && ln2 && ln1.toLowerCase() === ln2.toLowerCase()) {
      if (fn1 && fn2) {
        return `${fn1} & ${fn2} ${ln1}`;
      }
      return `${fn1 || fn2} ${ln1}`.trim();
    }

    const full1 = `${fn1} ${ln1}`.trim();
    const full2 = `${fn2} ${ln2}`.trim();
    if (full1 && full2) {
      return `${full1} & ${full2}`;
    }
  }
  return validParents
    .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim())
    .filter(Boolean)
    .join(' & ');
}

  const overviewFamiliesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();

    if (overviewGroupBy === 'group') {
      const groupBuckets: {
        id: string;
        key: string;
        label: string;
        matchesChild: (status: { currentGroup: number | null; isFormer: boolean }) => boolean;
      }[] = [
        {
          id: 'overview-group-1',
          key: 'group1',
          label: t('overviewGroup1'),
          matchesChild: (s) => s.currentGroup === 1,
        },
        {
          id: 'overview-group-2',
          key: 'group2',
          label: t('overviewGroup2'),
          matchesChild: (s) => s.currentGroup === 2,
        },
        {
          id: 'overview-group-3',
          key: 'group3',
          label: t('overviewGroup3'),
          matchesChild: (s) => s.currentGroup === 3,
        },
        {
          id: 'overview-group-none',
          key: 'none',
          label: t('overviewGroupNone'),
          matchesChild: (s) => s.currentGroup === null && !s.isFormer,
        },
        {
          id: 'overview-group-former',
          key: 'former',
          label: t('overviewGroupFormer'),
          matchesChild: (s) => s.currentGroup === null && s.isFormer,
        },
      ];

      const bucketsData = groupBuckets.map((bucket) => {
        const bucketLabelMatches = query ? bucket.label.toLowerCase().includes(query) : false;

        const familyBlocks: {
          familyId: string;
          familyName: string;
          rows: any[];
        }[] = [];

        overviewFamilies.forEach((f) => {
          const childrenInBucket = (f.children || []).filter((c) =>
            bucket.matchesChild(getOverviewChildGroupStatus(c))
          );
          if (childrenInBucket.length === 0) return;

          const lastNames = Array.from(new Set((f.parents || []).map((p) => p.last_name).filter(Boolean)));
          const familyName = lastNames.join(' / ') || 'Familie';
          const parentNames = (f.parents || [])
            .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim())
            .filter(Boolean)
            .join(', ');

          const parentContactMatch = (f.parents || []).some((p) => {
            const emailMatch = (p.emails || []).some((e: any) => getEntryValue(e).toLowerCase().includes(query));
            const phoneMatch = (p.phones || []).some((ph: any) => getEntryValue(ph).toLowerCase().includes(query));
            const addressMatch = (p.address || '').toLowerCase().includes(query);
            return emailMatch || phoneMatch || addressMatch;
          });

          const familyMatch =
            !query ||
            bucketLabelMatches ||
            familyName.toLowerCase().includes(query) ||
            parentNames.toLowerCase().includes(query) ||
            parentContactMatch;

          const sortedBucketChildren = [...childrenInBucket]
            .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE))
            .map((c) => ({
              ...c,
              id: `${c.id}-${bucket.key}`,
              original_id: c.id,
              _rowType: 'child' as const,
              hide_last_name: false,
              hide_group: true,
              indent_name: false,
              no_special_bg: true,
              family_id: f.id,
              family_name: familyName,
            }));

          const filteredBucketChildren = sortedBucketChildren.filter((c) => {
            if (!query) return true;
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
            const fnMatch = (c.first_name || '').toLowerCase().includes(query);
            const lnMatch = (c.last_name || '').toLowerCase().includes(query);
            return fnMatch || lnMatch || fullName.includes(query);
          });

          if (!familyMatch && filteredBucketChildren.length === 0) {
            return;
          }

          const childrenToInclude =
            query && familyMatch && filteredBucketChildren.length === 0
              ? sortedBucketChildren
              : filteredBucketChildren;

          const sortedParents = [...(f.parents || [])]
            .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE));

          const groupFamilyKey = `${bucket.key}-${f.id}`;
          const isExplicitlyExpanded = expandedGroupParents[groupFamilyKey];
          const parentNamesMatch = query ? parentNames.toLowerCase().includes(query) : false;
          const autoExpandSearch = query ? Boolean(parentNamesMatch || parentContactMatch) : false;
          const isExpanded = isExplicitlyExpanded !== undefined ? isExplicitlyExpanded : autoExpandSearch;

          const mappedParents = sortedParents.map((p) => ({
            ...p,
            id: `${p.id}-${bucket.key}`,
            original_id: p.id,
            _rowType: 'parent' as const,
            indent_name: true,
            no_special_bg: true,
            family_id: f.id,
            family_name: familyName,
            isGroupModeParent: true,
            isExpanded,
            groupFamilyKey,
          }));

          const toggleRow = sortedParents.length > 0 ? {
            id: `toggle-${groupFamilyKey}`,
            _rowType: 'parents-toggle' as const,
            groupFamilyKey,
            summaryText: formatParentsSummary(sortedParents),
            isExpanded,
            onToggle: () => handleToggleGroupParents(groupFamilyKey),
          } : null;

          familyBlocks.push({
            familyId: f.id,
            familyName,
            rows: toggleRow
              ? [...childrenToInclude, toggleRow, ...mappedParents]
              : [...childrenToInclude, ...mappedParents],
          });
        });

        familyBlocks.sort((a, b) => a.familyName.localeCompare(b.familyName, CURRENT_LOCALE));

        const subRows = familyBlocks.flatMap((fb) => fb.rows);

        return {
          id: bucket.id,
          family_name: bucket.label,
          subRows,
          hasMatchingRows: subRows.length > 0,
          nameMatch: bucketLabelMatches,
        };
      });

      return bucketsData.filter((b) => b.subRows.length > 0);
    }

    const mapped = overviewFamilies.map((f) => {
      const lastNames = Array.from(new Set((f.parents || []).map((p) => p.last_name).filter(Boolean)));
      const familyName = lastNames.join(' / ') || 'Familie';
      const parentNames = (f.parents || [])
        .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const allSurnames = Array.from(
        new Set(
          [
            ...(f.parents || []).map((p) => (p.last_name || '').trim()),
            ...(f.children || []).map((c) => (c.last_name || '').trim()),
          ].filter(Boolean)
        )
      );
      const hasSingleFamilySurname = allSurnames.length === 1;

      const allParents = (f.parents || []).map((p) => ({
        ...p,
        _rowType: 'parent' as const,
        family_id: f.id,
        family_name: familyName,
      }));

      const allChildren = (f.children || []).map((c) => ({
        ...c,
        _rowType: 'child' as const,
        hide_last_name: hasSingleFamilySurname,
        family_id: f.id,
        family_name: familyName,
      }));

      const filteredChildren = allChildren.filter((c) => {
        if (!query) return true;
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
        const fnMatch = (c.first_name || '').toLowerCase().includes(query);
        const lnMatch = (c.last_name || '').toLowerCase().includes(query);
        const groupStatus = getOverviewChildGroupStatus(c);
        const groupMatch = groupStatus.groupLabel.toLowerCase().includes(query);
        const familyNameMatch = familyName.toLowerCase().includes(query);
        const parentMatch = parentNames.toLowerCase().includes(query);
        return fnMatch || lnMatch || fullName.includes(query) || groupMatch || familyNameMatch || parentMatch;
      });

      const parentContactMatch = (f.parents || []).some((p) => {
        const emailMatch = (p.emails || []).some((e: any) => getEntryValue(e).toLowerCase().includes(query));
        const phoneMatch = (p.phones || []).some((ph: any) => getEntryValue(ph).toLowerCase().includes(query));
        const addressMatch = (p.address || '').toLowerCase().includes(query);
        return emailMatch || phoneMatch || addressMatch;
      });

      const familyMatch = familyName.toLowerCase().includes(query) || parentNames.toLowerCase().includes(query) || parentContactMatch;

      const childrenToInclude =
        query && familyMatch && filteredChildren.length === 0 ? allChildren : filteredChildren;

      return {
        id: f.id,
        family_name: familyName,
        subRows: [...allParents, ...childrenToInclude],
        hasMatchingChildren: filteredChildren.length > 0,
        nameMatch: familyMatch,
      };
    });

    if (!query) return mapped;
    return mapped.filter((f) => f.nameMatch || f.hasMatchingChildren);
  }, [overviewFamilies, globalFilter, overviewGroupBy, expandedGroupParents, handleToggleGroupParents]);

  const hygieneColumns = React.useMemo<ColumnDef<any>[]>(() => {
    return [
      {
        header: t('firstName'),
        accessorKey: 'first_name',
        size: 200,
        minSize: 200,
      },
      {
        header: t('lastName'),
        accessorKey: 'last_name',
        size: 220,
      },
      {
        header: t('initialTraining'),
        id: 'initial_training',
        size: 280,
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const isCurrentActive = Boolean(
            hygienePopoverAnchor && activeParentForHygiene?.id === parent.id
          );
          return (
            <HygieneCell
              id={`cell-hygiene-initial-${parent.id}`}
              parent={parent}
              eventType="initial"
              isActive={isCurrentActive}
              onOpenManage={openManageHygiene}
              readOnly={!canWriteHygiene}
            />
          );
        }
      },
      {
        header: t('lastInstruction'),
        id: 'last_instruction',
        size: 280,
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const isCurrentActive = Boolean(
            hygienePopoverAnchor && activeParentForHygiene?.id === parent.id
          );
          return (
            <HygieneCell
              id={`cell-hygiene-refresh-${parent.id}`}
              parent={parent}
              eventType="recertify"
              isActive={isCurrentActive}
              onOpenManage={openManageHygiene}
              readOnly={!canWriteHygiene}
            />
          );
        }
      }
    ];
  }, [hygienePopoverAnchor, activeParentForHygiene, openManageHygiene, canWriteHygiene]);

  const parentColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: t('firstNameEdit'),
        accessorKey: 'first_name',
        size: 200,
        minSize: 200,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={parent.first_name}
              onSave={(val: string) => handleSaveParentField(parent, 'first_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editFirstName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('lastNameEdit'),
        accessorKey: 'last_name',
        size: 200,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={parent.last_name}
              onSave={(val: string) => handleSaveParentField(parent, 'last_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editLastName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('emailsEdit'),
        accessorKey: 'emails',
        size: 300,
        cell: (info) => {
          const parent = info.row.original;
          const isActive = Boolean(
            multiValuePopoverAnchor &&
            activeParentForMultiValue?.id === parent.id &&
            activeMultiValueField === 'emails'
          );
          return (
            <ParentMultiValueCell
              parent={parent}
              field="emails"
              placeholder={t('addEmail')}
              isActive={isActive}
              onOpenManage={openManageMultiValue}
            />
          );
        }
      },
      {
        header: t('phonesEdit'),
        accessorKey: 'phones',
        size: 250,
        cell: (info) => {
          const parent = info.row.original;
          const isActive = Boolean(
            multiValuePopoverAnchor &&
            activeParentForMultiValue?.id === parent.id &&
            activeMultiValueField === 'phones'
          );
          return (
            <ParentMultiValueCell
              parent={parent}
              field="phones"
              placeholder={t('addPhone')}
              isActive={isActive}
              onOpenManage={openManageMultiValue}
            />
          );
        }
      },
      {
        header: t('address'),
        accessorKey: 'address',
        size: 250,
        cell: (info) => {
          const parent = info.row.original;
          const family = families.find((f) => f.id === parent.family_id);
          const familyParents = family?.parents || [parent];
          return (
            <AddressEditor
              parent={parent}
              familyParents={familyParents}
              onSave={(updatedParents) => handleSaveFamilyParents(parent.family_id, updatedParents)}
            />
          );
        }
      },
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <NotesEditor
              value={parent.notes || ''}
              onSave={(val: string) => handleSaveParentField(parent, 'notes', val)}
            />
          );
        }
      },
      {
        header: t('th_membership'),
        id: 'th_membership',
        size: 180,
        cell: (info) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const isCurrentActive = Boolean(membershipPopoverAnchor && targetParentMemberships?.id === parent.id);
          return (
            <ParentMembershipCell
              parent={parent}
              isActive={isCurrentActive}
              onOpenManage={openManageMemberships}
            />
          );
        }
      },
      ...(hasPermission('vaccination.status.manage') ? [
        {
          id: 'vaccination_status',
          header: t('vaccinationStatus'),
          accessorKey: 'vaccination_checks',
          size: 180,
          cell: (info: any) => {
            const parent = info.row.original;
            const isCurrentActive = Boolean(
              vaccinationPopoverAnchor &&
              targetVaccinationPerson?.type === 'parent' &&
              targetVaccinationPerson?.id === parent.id
            );
            return (
              <VaccinationStatusCell
                id={`cell-vaccination-parent-${parent.id}`}
                checks={parent.vaccination_checks}
                isActive={isCurrentActive}
                onOpenManage={(anchor) => openManageVaccination(parent.id, 'parent', anchor)}
                isUnlocked={isVaccinationUnlocked}
                onUnlock={handleRequestKmsAuth}
              />
            );
          }
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 60,
        cell: (info) => {
          const parent = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <button
                type="button"
                className="easy-edit-button"
                style={{
                  padding: '0.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  color: '#64748b',
                  background: 'transparent',
                  height: '28px',
                  width: '28px',
                }}
                onClick={() => handleDeleteParent(parent.id)}
                title={t('delete')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#fecaca';
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Trash size={14} />
              </button>
            </div>
          );
        }
      }
    ],
    [families, handleSaveParentField, handleSaveFamilyParents, handleDeleteParent, isVaccinationUnlocked, handleRequestKmsAuth, hasPermission, user?.email, membershipPopoverAnchor, targetParentMemberships, openManageMemberships, multiValuePopoverAnchor, activeParentForMultiValue, activeMultiValueField, openManageMultiValue, vaccinationPopoverAnchor, targetVaccinationPerson, openManageVaccination]
  );

  const childGroupColumn = React.useMemo<ColumnDef<any>>(
    () => ({
      header: t('group'),
      id: 'group',
      size: 340,
      minSize: 320,
      cell: (info) => {
        const child = info.row.original;
        const isCurrentActive = Boolean(groupPopoverAnchor && targetChildGroupChanges?.id === child.id);
        return (
          <ChildGroupCell
            child={child}
            isActive={isCurrentActive}
            onOpenManage={openManageGroupChanges}
          />
        );
      },
    }),
    [groupPopoverAnchor, targetChildGroupChanges, openManageGroupChanges]
  );

  const childColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: t('firstNameEdit'),
        accessorKey: 'first_name',
        size: 200,
        minSize: 200,
        cell: (info) => {
          const child = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={child.first_name}
              onSave={(val: string) => handleSaveChildField(child, 'first_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editFirstName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('lastNameEdit'),
        accessorKey: 'last_name',
        size: 150,
        cell: (info) => {
          const child = info.row.original;
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={child.last_name}
              onSave={(val: string) => handleSaveChildField(child, 'last_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editLastName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        }
      },
      {
        header: t('birthDateEdit'),
        accessorKey: 'birth_date',
        size: 140,
        minSize: 130,
        meta: {
          cardLabel: t('birthDateCardLabel'),
        },
        cell: (info) => {
          const child = info.row.original;
          const initialDate = child.birth_date ? child.birth_date.split('T')[0] : '';
          const displayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;
          return (
            <EasyEditComponent
              type={EasyEditTypes.DATE}
              value={displayValue}
              onSave={(val: string) => {
                handleSaveChildField(child, 'birth_date', parseInputDate(val));
              }}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editBirthDate')}
              displayComponent={<span>{formatDisplayDate(child.birth_date)}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={(val: string) => {
                const parsed = parseInputDate(val);
                return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
              }}
            />
          );
        }
      },
      {
        header: t('startdatum'),
        id: 'start_date',
        size: 130,
        meta: {
          cardLabel: t('startDateCardLabel'),
        },
        cell: (info) => {
          const child = info.row.original;
          const isCurrentActive = Boolean(groupPopoverAnchor && targetChildGroupChanges?.id === child.id);
          return (
            <ChildStartDateCell
              child={child}
              isActive={isCurrentActive}
              onOpenManage={openManageGroupChanges}
            />
          );
        }
      },
      childGroupColumn,
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
        cell: (info) => {
          const child = info.row.original;
          return (
            <NotesEditor
              value={child.notes || ''}
              onSave={(val: string) => handleSaveChildField(child, 'notes', val)}
            />
          );
        }
      },
      ...(hasPermission('vaccination.status.manage') ? [
        {
          id: 'vaccination_status',
          header: t('vaccinationStatus'),
          accessorKey: 'vaccination_checks',
          size: 180,
          cell: (info: any) => {
            const child = info.row.original;
            const isCurrentActive = Boolean(
              vaccinationPopoverAnchor &&
              targetVaccinationPerson?.type === 'child' &&
              targetVaccinationPerson?.id === child.id
            );
            return (
              <VaccinationStatusCell
                id={`cell-vaccination-child-${child.id}`}
                checks={child.vaccination_checks}
                isActive={isCurrentActive}
                onOpenManage={(anchor) => openManageVaccination(child.id, 'child', anchor)}
                isUnlocked={isVaccinationUnlocked}
                onUnlock={handleRequestKmsAuth}
              />
            );
          }
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 60,
        cell: (info) => {
          const child = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <button
                type="button"
                className="easy-edit-button"
                style={{
                  padding: '0.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  color: '#64748b',
                  background: 'transparent',
                  height: '28px',
                  width: '28px',
                }}
                onClick={() => handleDeleteChild(child.id)}
                title={t('delete')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#fecaca';
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Trash size={14} />
              </button>
            </div>
          );
        }
      }
    ],
    [
      families,
      handleSaveChildField,
      handleDeleteChild,
      openManageGroupChanges,
      groupPopoverAnchor,
      targetChildGroupChanges,
      childGroupColumn,
      isVaccinationUnlocked,
      handleRequestKmsAuth,
      hasPermission,
      user?.email,
      vaccinationPopoverAnchor,
      targetVaccinationPerson,
      openManageVaccination,
    ]
  );

  const familyChildColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'child_name',
        accessorFn: (child: any) => `${child.first_name || ''} ${child.last_name || ''}`.trim(),
        header: t('firstNameEdit'),
        size: 200,
        minSize: 200,
        cell: (info) => {
          const child = info.row.original;
          const fullName = `${child.first_name || ''} ${child.last_name || ''}`.trim() || '-';
          if (!child.first_name && !child.last_name) {
            return <span>-</span>;
          }
          return (
            <button
              type="button"
              className="family-child-link"
              onClick={(e) => {
                e.stopPropagation();
                handleJumpToChild(child.id, child.family_id, child.family_name || '');
              }}
              title={t('jumpToChild')}
            >
              <span>{fullName}</span>
              <ArrowUpRight size={13} className="family-link-icon" />
            </button>
          );
        }
      },
      {
        id: 'birth_date',
        accessorKey: 'birth_date',
        header: t('birthDateEdit'),
        size: 160,
        minSize: 120,
        cell: (info) => {
          const child = info.row.original;
          const formatted = formatDisplayDate(child.birth_date);
          if (!formatted) {
            return <span>-</span>;
          }
          return (
            <span className="family-child-birthdate">
              <span className="family-card-birthdate-prefix">geb. </span>
              {formatted}
            </span>
          );
        }
      },
      childGroupColumn,
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
        cell: (info) => {
          const child = info.row.original;
          return (
            <NotesEditor
              value={child.notes || ''}
              onSave={(val: string) => handleSaveChildField(child, 'notes', val)}
            />
          );
        }
      },
      {
        id: 'actions',
        header: '',
        size: 85,
        minSize: 85,
        cell: () => null,
      },
    ],
    [childGroupColumn, handleJumpToChild, handleSaveChildField]
  );

  const overviewColumns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'overview_name',
        accessorFn: (row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        header: '',
        size: 260,
        minSize: 210,
        cell: (info) => {
          const item = info.row.original;
          const isIndented = item.indent_name ?? item._rowType === 'child';
          if (item._rowType === 'child') {
            const displayName = item.hide_last_name
              ? (item.first_name || '').trim() || '-'
              : `${item.first_name || ''} ${item.last_name || ''}`.trim() || '-';
            return (
              <span className="overview-person-name" style={isIndented ? { paddingLeft: '1.25rem', display: 'inline-block' } : undefined}>
                {displayName}
                {canReadFamiliesAll && (
                  <button
                    type="button"
                    className="family-child-link overview-mga-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJumpToChild(item.original_id || item.id, item.family_id, item.family_name || '', 'familiesOverview');
                    }}
                    title={t('jumpToChild')}
                  >
                    <span>{t('mgaViewLink')}</span>
                    <ArrowUpRight size={11} className="family-link-icon" />
                  </button>
                )}
              </span>
            );
          }
          const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || '-';
          return (
            <span className="overview-person-name" style={isIndented ? { paddingLeft: '1.25rem', display: 'inline-block' } : undefined}>
              {fullName}
              {canReadFamiliesAll && (
                <button
                  type="button"
                  className="family-parent-link overview-mga-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToParent(item.original_id || item.id, item.family_id, item.family_name || '', 'familiesOverview');
                  }}
                  title={t('jumpToParent')}
                >
                  <span>{t('mgaViewLink')}</span>
                  <ArrowUpRight size={11} className="family-link-icon" />
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
          getColSpan: (row: any) => (row._rowType === 'child' ? 3 : 1),
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType === 'parent') {
            const phones = (item.phones || [])
              .filter((ph: any) => isFlagActive(ph, 'address_list', true))
              .map((ph: any) => getEntryValue(ph).trim())
              .filter(Boolean);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span
                  className="overview-contact-symbol"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.25rem',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  📞
                </span>
                {phones.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                ) : (
                  <span style={{ whiteSpace: 'pre-line', minWidth: 0 }}>
                    {phones.map((phone: string, idx: number) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && '\n'}
                        <a
                          href={formatTelHref(phone)}
                          className="overview-contact-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {phone}
                        </a>
                      </React.Fragment>
                    ))}
                  </span>
                )}
              </div>
            );
          }

          if (item.hide_group) {
            return null;
          }

          const groupStatus = getOverviewChildGroupStatus(item);
          const displayGroup = groupStatus.groupLabel;
          return (
            <span className="overview-child-group-badge" style={{ color: displayGroup === '-' ? 'var(--text-muted)' : 'var(--text)' }}>
              {displayGroup}
            </span>
          );
        },
      },
      {
        id: 'overview_emails',
        header: '',
        size: 260,
        minSize: 200,
        meta: {
          skipCell: (row: any) => row._rowType === 'child',
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType !== 'parent') return null;
          const emails = (item.emails || [])
            .filter((e: any) => isFlagActive(e, 'address_list', true))
            .map((e: any) => getEntryValue(e).trim())
            .filter(Boolean);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span
                className="overview-contact-symbol"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.25rem',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                📧
              </span>
              {emails.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>-</span>
              ) : (
                <span style={{ whiteSpace: 'pre-line', minWidth: 0 }}>
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
                </span>
              )}
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
          skipCell: (row: any) => row._rowType === 'child',
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType !== 'parent') return null;
          const address = (item.address || '').trim();
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className="overview-contact-symbol"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.25rem',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                🏠
              </span>
              <span
                style={{
                  whiteSpace: 'pre-line',
                  color: !address ? 'var(--text-muted)' : 'var(--text)',
                }}
              >
                {address || '-'}
              </span>
            </div>
          );
        },
      },
    ],
    [canReadFamiliesAll, handleJumpToChild, handleJumpToParent]
  );

  const isTableTab = activeTab === 'familiesOverview' || activeTab === 'parents' || activeTab === 'children' || activeTab === 'families' || activeTab === 'hygieneBelehrung';

  return (
    <div className={`dashboard-container ${isTableTab ? 'table-view-active' : ''}`}>
      <header>
        <div className="header-brand">
          {appLogoUrl ? (
            <img
              src={appLogoUrl}
              alt={appTitle}
              title={appTitle}
              className="app-header-logo"
            />
          ) : (
            <h1>{appTitle}</h1>
          )}
        </div>
        <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span title={user?.email}>{user?.email}</span>
          <button
            type="button"
            className="header-signout-desktop"
            onClick={logout}
          >
            {t('logout')}
          </button>
          <HeaderOverflowMenu
            className="header-overflow-mobile"
            onLogout={logout}
          />
        </div>
      </header>
      <main className={isTableTab ? 'main-table-view' : ''}>
        {/* Navigation Tabs */}
        <div className="tabs-wrapper">
          {canScrollLeft && (
            <div className="tabs-scroll-indicator left">
              <button
                type="button"
                className="tab-scroll-btn"
                onClick={() => handleTabScroll('left')}
                aria-label="Scroll left"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          )}

          <div
            className="tabs"
            ref={tabsNavRef}
            onScroll={updateScrollButtons}
          >
            {canReadOverview && (
              <button 
                onClick={() => handleTabClick('familiesOverview')}
                className={`tab-btn ${activeTab === 'familiesOverview' ? 'active' : ''}`}
                data-active={activeTab === 'familiesOverview'}
              >
                {t('familiesOverview')}
              </button>
            )}
            {canReadFamiliesAll && (
              <>
                <button 
                  onClick={() => handleTabClick('families')}
                  className={`tab-btn ${activeTab === 'families' ? 'active' : ''}`}
                  data-active={activeTab === 'families'}
                >
                  {t('families')}
                </button>
                <button 
                  onClick={() => handleTabClick('parents')}
                  className={`tab-btn ${activeTab === 'parents' ? 'active' : ''}`}
                  data-active={activeTab === 'parents'}
                >
                  {t('parents')}
                </button>
                <button 
                  onClick={() => handleTabClick('children')}
                  className={`tab-btn ${activeTab === 'children' ? 'active' : ''}`}
                  data-active={activeTab === 'children'}
                >
                  {t('children')}
                </button>
              </>
            )}
            {canReadFees && (
              <button 
                onClick={() => handleTabClick('childcareFees')}
                className={`tab-btn ${activeTab === 'childcareFees' ? 'active' : ''}`}
                data-active={activeTab === 'childcareFees'}
              >
                {t('childcareFees')}
              </button>
            )}
            {(canReadFamiliesAll || hasPermission('hygiene.all.write')) && (
              <button 
                onClick={() => handleTabClick('hygieneBelehrung')}
                className={`tab-btn ${activeTab === 'hygieneBelehrung' ? 'active' : ''}`}
                data-active={activeTab === 'hygieneBelehrung'}
              >
                {t('hygieneBelehrung')}
              </button>
            )}
            {canReadAudit && (
              <button 
                onClick={() => handleTabClick('audit')}
                className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                data-active={activeTab === 'audit'}
              >
                {t('audit')}
              </button>
            )}
            {(hasPermission('users.all.manage') || hasPermission('*')) && (
              <button 
                onClick={() => handleTabClick('admin')}
                className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
                data-active={activeTab === 'admin'}
              >
                {t('admin')}
              </button>
            )}
            {canProvisionKiosk && (
              <button 
                onClick={() => handleTabClick('kiosk')}
                className={`tab-btn ${activeTab === 'kiosk' ? 'active' : ''}`}
                data-active={activeTab === 'kiosk'}
              >
                {t('kioskCertificates')}
              </button>
            )}
            <button 
              onClick={() => handleTabClick('dashboard')}
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              data-active={activeTab === 'dashboard'}
            >
              {t('kioskDashboard')}
            </button>
          </div>

          {canScrollRight && (
            <div className="tabs-scroll-indicator right">
              <button
                type="button"
                className="tab-scroll-btn"
                onClick={() => handleTabScroll('right')}
                aria-label="Scroll right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Context Banner (Pattern 2) */}
        {returnNav && (activeTab === 'parents' || activeTab === 'children') && (
          <div className="context-return-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="context-return-text">
                {returnNav.type === 'parent'
                  ? `${t('viewingParentFromFamily')} „${returnNav.familyName}“`
                  : returnNav.type === 'child'
                  ? `${t('viewingChildFromFamily')} „${returnNav.familyName}“`
                  : `${t('viewingFamily')} „${returnNav.familyName}“`}
              </span>
              <button
                type="button"
                className="context-return-button"
                onClick={handleReturnToFamilies}
              >
                <ArrowLeft size={14} />
                <span>
                  {returnNav.fromTab === 'parents'
                    ? t('backToParents')
                    : returnNav.fromTab === 'children'
                    ? t('backToChildren')
                    : t('backToFamilies')}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={handleDismissReturnNav}
              className="context-return-dismiss"
              title={t('dismiss')}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {activeTab !== 'childcareFees' && activeTab !== 'audit' && activeTab !== 'admin' && activeTab !== 'kiosk' && activeTab !== 'dashboard' && (
          <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="controls-left" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="search-input"
                placeholder={activeTab === 'families' || activeTab === 'familiesOverview' ? t('searchFamilies') : activeTab === 'children' ? t('searchChildren') : t('searchParents')}
                style={{ marginBottom: 0 }}
              />

              {(activeTab === 'parents' || activeTab === 'children' || activeTab === 'families') && (
                <button
                  type="button"
                  onClick={openAddFamily}
                  className="primary-button add-family-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    height: '34px',
                    boxSizing: 'border-box',
                    fontSize: '0.85rem',
                  }}
                >
                  <Plus size={14} />
                  <span>{t('addFamily')}</span>
                </button>
              )}

              {activeTab === 'familiesOverview' && (
                <div
                  className="overview-grouping-toggle"
                  role="group"
                  aria-label={t('groupingLabel')}
                  style={{
                    display: 'inline-flex',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: 'var(--bg-surface)',
                    height: '34px',
                    boxSizing: 'border-box',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOverviewGroupBy('family')}
                    aria-pressed={overviewGroupBy === 'family'}
                    style={{
                      padding: '0 0.75rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: overviewGroupBy === 'family' ? 'var(--primary)' : 'transparent',
                      color: overviewGroupBy === 'family' ? '#ffffff' : 'var(--text)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('groupByFamily')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewGroupBy('group')}
                    aria-pressed={overviewGroupBy === 'group'}
                    style={{
                      padding: '0 0.75rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      border: 'none',
                      borderLeft: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: overviewGroupBy === 'group' ? 'var(--primary)' : 'transparent',
                      color: overviewGroupBy === 'group' ? '#ffffff' : 'var(--text)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('groupByGroup')}
                  </button>
                </div>
              )}
              {activeTab !== 'familiesOverview' && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="easy-edit-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '34px',
                    width: '34px',
                    opacity: undoStack.length === 0 ? 0.4 : 1,
                    cursor: undoStack.length === 0 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: 'var(--text)',
                  }}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo size={16} />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="easy-edit-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '34px',
                    width: '34px',
                    opacity: redoStack.length === 0 ? 0.4 : 1,
                    cursor: redoStack.length === 0 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: 'var(--text)',
                  }}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo size={16} />
                </button>
                </div>
              )}

              {(activeTab === 'parents' || activeTab === 'children') && hasPermission('vaccination.status.manage') && (
                isVaccinationUnlocked ? (
                  <button
                    type="button"
                    onClick={handleLockKmsAuth}
                    className="secondary-button vaccination-status-btn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      height: '34px',
                      boxSizing: 'border-box',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                    title="Klicken zum Sperren"
                  >
                    <Unlock size={15} color="var(--primary)" />
                    <span>{t('vaccinationStatus')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestKmsAuth}
                    className="secondary-button vaccination-status-btn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      height: '34px',
                      boxSizing: 'border-box',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                    title={t('showVaccinationStatus')}
                  >
                    <Lock size={15} color="var(--text-muted)" />
                    <span>{t('vaccinationStatus')}</span>
                  </button>
                )
              )}

              <div id="cards-view-columns-slot" style={{ display: 'inline-flex', alignItems: 'center' }} />
            </div>
          </div>
        )}

        {kmsError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              borderRadius: '6px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#b91c1c',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} color="#dc2626" />
              <span>{kmsError}</span>
            </div>
            <button
              type="button"
              onClick={() => setKmsError(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                padding: '0.2rem',
              }}
              title={t('dismiss')}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {activeTab === 'familiesOverview' ? (
          <DataTable
            className="overview-table"
            data={overviewFamiliesTabData}
            columns={overviewColumns}
            getSubRows={(row: any) => row.subRows}
            hideHeader
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'parents' ? (
          <DataTable
            className="card-table parents-table"
            data={parentsFamilyData}
            columns={parentColumns}
            getSubRows={(row: any) => row.parents}
            onAddParent={openAddParent}
            onJumpToFamily={handleJumpFromParentsToChildren}
            jumpToFamilyLabel={t('jumpToChildrenShort')}
            jumpToFamilyTitle={t('jumpToFamilyInChildren')}
            highlightedRowId={highlightedRowId}
            getCardHeader={(parent: any) => `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || '-'}
          />
        ) : activeTab === 'children' ? (
          <DataTable
            className="card-table children-table"
            data={childrenFamilyData}
            columns={childColumns}
            getSubRows={(row: any) => row.children}
            onAddChild={openAddChild}
            onJumpToFamily={handleJumpFromChildrenToParents}
            jumpToFamilyLabel={t('jumpToParentsShort')}
            jumpToFamilyTitle={t('jumpToFamilyInParents')}
            emptySubRowsText={t('noChildrenYet')}
            highlightedRowId={highlightedRowId}
            getCardHeader={(child: any) => `${child.first_name || ''} ${child.last_name || ''}`.trim() || '-'}
          />
        ) : activeTab === 'families' ? (
          <DataTable
            className="card-table families-table"
            data={familiesTabData}
            columns={familyChildColumns}
            getSubRows={(row: any) => row.children}
            onAddChild={openAddChild}
            onAddParent={openAddParent}
            emptySubRowsText={t('noChildrenYet')}
            highlightedRowId={highlightedRowId}
            stickyFirstColumn
          />
        ) : activeTab === 'hygieneBelehrung' ? (
          <DataTable
            data={parentsFamilyData}
            columns={hygieneColumns}
            getSubRows={(row: any) => row.parents}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'audit' && canReadAudit ? (
          <AuditLogView logs={auditLogs} loading={auditLoading} />
        ) : activeTab === 'admin' && canManageUsers ? (
          <AdminView />
        ) : activeTab === 'kiosk' && canProvisionKiosk ? (
          <KioskProvisioning token={token} />
        ) : activeTab === 'dashboard' ? (
          <KioskDashboard embedded={true} />
        ) : (
          <ChildcareFeesCalculator
            token={token}
            families={families.length > 0 ? families : (overviewFamilies as any)}
          />
        )}
      </main>

      {/* Add Parent Modal */}
      {addParentOpen && targetFamily && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addParentTo')} {targetFamily.name}</h2>
            <form onSubmit={handleAddParentSubmit}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="p-first-name">{t('firstName')}</label>
                  <input
                    id="p-first-name"
                    name="givenName"
                    type="text"
                    value={newParentFirstName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewParentFirstName(val);
                      if (!isTollhausEmailDirty) {
                        setNewParentTollhausEmail(formatTollhausEmail(val, newParentLastName));
                      }
                    }}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="p-last-name">{t('lastName')}</label>
                  <input
                    id="p-last-name"
                    name="surname"
                    type="text"
                    value={newParentLastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewParentLastName(val);
                      if (!isTollhausEmailDirty) {
                        setNewParentTollhausEmail(formatTollhausEmail(newParentFirstName, val));
                      }
                    }}
                    required
                  />
                </div>
              </div>
              <div className="modal-form-group">
                <label htmlFor="p-tollhaus-email">{t('tollhausEmail')}</label>
                <input
                  id="p-tollhaus-email"
                  name="tollhausEmail"
                  type="text"
                  value={newParentTollhausEmail}
                  onChange={(e) => {
                    setNewParentTollhausEmail(e.target.value);
                    setIsTollhausEmailDirty(true);
                  }}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setAddParentOpen(false);
                    setNewParentTollhausEmail('');
                    setIsTollhausEmailDirty(false);
                  }}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addParent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Family Modal */}
      {addFamilyOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addFamily')}</h2>
            <form onSubmit={handleAddFamilySubmit}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{t('parent1')}</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p1-first">{t('firstName')}</label>
                  <input
                    id="f-p1-first"
                    type="text"
                    value={p1FirstName}
                    onChange={(e) => setP1FirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p1-last">{t('lastName')}</label>
                  <input
                    id="f-p1-last"
                    type="text"
                    value={p1LastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setP1LastName(val);
                      if (!isP2LastNameDirty) {
                        setP2LastName(val);
                      }
                    }}
                    required
                  />
                </div>
              </div>

              <div className="modal-divider" style={{ margin: '1rem 0' }}></div>

              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{t('parent2')} ({CURRENT_LOCALE === 'de' ? 'optional' : 'Optional'})</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p2-first">{t('firstName')}</label>
                  <input
                    id="f-p2-first"
                    type="text"
                    value={p2FirstName}
                    onChange={(e) => setP2FirstName(e.target.value)}
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="f-p2-last">{t('lastName')}</label>
                  <input
                    id="f-p2-last"
                    type="text"
                    value={p2LastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setP2LastName(val);
                      if (val !== '') {
                        setIsP2LastNameDirty(true);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setAddFamilyOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addFamily')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Child Modal */}
      {addChildOpen && targetFamily && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>{t('addChildTo')} {targetFamily.name}</h2>
            <form onSubmit={handleAddChildSubmit}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="c-first-name">{t('firstName')}</label>
                  <input
                    id="c-first-name"
                    type="text"
                    value={newChildFirstName}
                    onChange={(e) => setNewChildFirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="c-last-name">{t('lastName')}</label>
                  <input
                    id="c-last-name"
                    type="text"
                    value={newChildLastName}
                    onChange={(e) => setNewChildLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-form-group">
                <label htmlFor="c-birth-date">{t('birthDate')}</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="c-birth-date"
                    type="text"
                    value={newChildBirthDate}
                    onChange={(e) => setNewChildBirthDate(e.target.value)}
                    placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
                    style={{ paddingRight: '2.5rem', width: '100%' }}
                    required
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      color: '#64748b',
                    }}
                    onClick={(e) => {
                      const input = e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
                      if (input) {
                        try {
                          input.showPicker();
                        } catch (err) {
                          input.click();
                        }
                      }
                    }}
                  >
                    <Calendar size={18} />
                  </button>
                  <input
                    type="date"
                    value={parseInputDate(newChildBirthDate)}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      width: '0px',
                      height: '0px',
                      opacity: 0,
                      pointerEvents: 'none',
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setNewChildBirthDate(formatDisplayDate(val));
                      }
                    }}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setAddChildOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="submit-btn">
                  {t('addChild')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete.isOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444' }}>{t('delete')}</h2>
            <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              {confirmDelete.message}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setConfirmDelete(prev => ({ ...prev, isOpen: false }))}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="submit-btn"
                style={{ backgroundColor: '#ef4444' }}
                onClick={confirmDelete.onConfirm}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Manage Memberships Popover */}
        <MembershipsModal
          key={activeParentForMemberships?.id || 'memberships-modal'}
          isOpen={Boolean(membershipPopoverAnchor && activeParentForMemberships)}
          anchorEl={membershipPopoverAnchor}
          onClose={closeManageMemberships}
          parent={activeParentForMemberships}
          family={activeFamilyForMemberships}
          onAddMembership={handleAddMembership}
          onUpdateMembership={handleUpdateMembership}
          onDeleteMembership={handleDeleteMembership}
        />

        {/* Manage Group Changes Popover */}
        <GroupChangesPopover
          key={activeChildForGroupChanges?.id || 'group-popover'}
          isOpen={Boolean(groupPopoverAnchor && activeChildForGroupChanges)}
          anchorEl={groupPopoverAnchor}
          onClose={closeManageGroupChanges}
          child={activeChildForGroupChanges}
          onAddGroupChange={handleAddGroupChange}
          onUpdateGroupChange={handleUpdateGroupChange}
          onDeleteGroupChange={handleDeleteGroupChange}
          readOnly={!canWriteChildren}
        />

        {/* Manage Multi-Values (Emails / Phones) Popover */}
        <MultiValueListEditor
          key={`${activeParentForMultiValue?.id}-${activeMultiValueField}` || 'multivalue-popover'}
          isOpen={Boolean(multiValuePopoverAnchor && activeParentForMultiValue && activeMultiValueField)}
          anchorEl={multiValuePopoverAnchor}
          onClose={closeManageMultiValue}
          values={activeMultiValueValues}
          flags={activeMultiValueFlags}
          title={activeMultiValueTitle}
          placeholder={activeMultiValuePlaceholder}
          onSave={handleSaveActiveMultiValue}
          canEditItem={canEditMultiValueItem}
          canDeleteItem={canDeleteMultiValueItem}
          canToggleFlag={canToggleMultiValueFlag}
          disabledReason={getMultiValueDisabledReason}
        />

        {/* Manage Vaccination Status Popover */}
        <VaccinationStatusPopover
          key={activeVaccinationData ? `${activeVaccinationData.type}-${activeVaccinationData.id}` : 'vaccination-popover'}
          isOpen={Boolean(vaccinationPopoverAnchor && activeVaccinationData)}
          anchorEl={vaccinationPopoverAnchor}
          onClose={closeManageVaccination}
          checks={activeVaccinationData?.checks || []}
          currentUserEmail={user?.email || ''}
          onSave={activeVaccinationData ? activeVaccinationData.save : () => {}}
          readOnly={activeVaccinationData?.type === 'child' ? !canWriteChildren : false}
          personType={activeVaccinationData?.type}
        />

        {/* Manage Hygiene Events Popover */}
        <HygieneEventsPopover
          key={activeParentForHygiene?.id || 'hygiene-popover'}
          isOpen={Boolean(hygienePopoverAnchor && activeParentForHygiene)}
          anchorEl={hygienePopoverAnchor}
          onClose={closeManageHygiene}
          parent={activeParentForHygiene}
          onAddEvent={handleAddHygieneEvent}
          onUpdateEvent={handleUpdateHygieneEvent}
          onDeleteEvent={handleDeleteHygieneEvent}
          readOnly={!canWriteHygiene}
        />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');
  const faviconUrl = appConfig.faviconUrl;

  React.useEffect(() => {
    if (appTitle) {
      document.title = appTitle;
    }
  }, [appTitle]);

  React.useEffect(() => {
    if (faviconUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    }
  }, [faviconUrl]);

  if (loading) {
    return <div>{t('loading')}</div>;
  }

  // Kiosk endpoint (e.g. port 1443): serve KioskDashboard directly under / without login or portal navigation
  if (isKioskMode()) {
    return <KioskDashboard />;
  }

  if (!user) {
    return <LandingPage />;
  }

  return <Dashboard />;
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <ReauthModal />
    </AuthProvider>
  );
}

export default App;
