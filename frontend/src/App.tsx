import React from 'react';
import { AuthProvider, useAuth, isKioskMode } from './context/AuthContext';
import { LoginButton } from './components/Auth/LoginButton';
import { ReauthModal } from './components/Auth/ReauthModal';
import './App.css';

import { DataTable } from './components/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import EasyEdit, { Types } from './components/InlineEdit';
import { Pencil, Undo, Redo, Calendar, Lock, Unlock, ArrowLeft, ArrowRight, ArrowUpRight, X, Clock, AlertCircle, ChevronLeft, ChevronRight, Plus, ArrowUpDown, Check, Eye, RefreshCw } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { MultiValueListEditor, type MultiValueFlagConfig, type MultiValueEntry, type MultiValueItem, getEntryValue, isFlagActive, PHONE_TYPES, getPhoneTypeSymbol, getPhoneTypeLabel } from './components/Table/MultiValueListEditor';
import { MultiValueCell } from './components/Table/MultiValueCell';
import { NotesEditor } from './components/Table/NotesEditor';
import { AddressEditor } from './components/Table/AddressEditor';
import { FirstNameEditor } from './components/Table/FirstNameEditor';
import { GroupChangesPopover } from './components/Table/GroupChangesPopover';
import { FamiliencardsPopover } from './components/Table/FamiliencardsPopover';
import { MembershipsModal } from './components/Table/MembershipsModal';
import { VaccinationStatusPopover, VaccinationStatusCell, type VaccinationCheck } from './components/Table/VaccinationStatusEditor';
import { HygieneEventsPopover, HygieneCell, type ParentWithHygiene } from './components/Table/HygieneEventsPopover';
import { ChildcareFeesCalculator } from './components/ChildcareFeesCalculator';
import { KioskDashboard } from './components/Dashboard/KioskDashboard';
import { MealPlanTab } from './components/MealPlan/MealPlanTab';
import { MealPlanPrintView } from './components/MealPlan/MealPlanPrintView';
import { MealAllergensTab } from './components/MealAllergens/MealAllergensTab';
import { KioskProvisioning } from './components/Admin/KioskProvisioning';
import { PermissionsSimulatorModal } from './components/Admin/PermissionsSimulatorModal';
import { SimulatedRolesPermissionsModal } from './components/Admin/SimulatedRolesPermissionsModal';
import { getAppConfig } from './config/appConfig';
import { HeaderOverflowMenu } from './components/Header/HeaderOverflowMenu';
import { CellPopover } from './components/Table/CellPopover';
import { RowActionsMenu } from './components/Table/RowActionsMenu';
import { ConfirmDeleteModal } from './components/Table/ConfirmDeleteModal';
import { MgaLinkIcon } from './components/MgaLinkIcon';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate, formatTollhausEmail, compareBirthDates } from './utils/i18n';
import { getFamilyName } from './utils/family';

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
  first_name_for_address_list?: string;
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

interface MemberRow {
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

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_type: 'caregiver' | 'cook' | 'bufdi';
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  is_kinderschutzbeauftragter?: boolean;
  allergies?: string[];
  created_at?: string;
  updated_at?: string;
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
  first_name_for_address_list?: string;
  last_name: string;
  birth_date: string;
  school_enrollment_default?: number;
  notes?: string;
  vaccination_checks?: VaccinationCheck[];
  allergies?: string[];
  family_name?: string;
  group_changes?: ChildGroupChange[];
  familiencards?: number[];
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
  nextChangeText?: string;
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
  // it should say "left <last group name> on <end date>" (en) / "Betreuungsende <end date>, zuletzt <last group name>" (de).
  // If no previous group was recorded, it simply says "Betreuungsende <end date>" (de) / "left on <end date>" (en).
  if (latest.target_group === 0) {
    const prevEnroll = [...sorted].filter((c) => c.target_group > 0 && c.change_date.split('T')[0] <= latest.change_date.split('T')[0]).pop()
      || [...sorted].reverse().find((c) => c.target_group > 0);
    const lastGroupName = prevEnroll ? getGroupShortLabel(prevEnroll.target_group) : '';
    const endDateStr = formatDisplayDate(latest.change_date);
    const groupLabel = CURRENT_LOCALE === 'de'
      ? (lastGroupName ? `Betreuungsende ${endDateStr}, zuletzt ${lastGroupName}` : `Betreuungsende ${endDateStr}`)
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
  // suffixed with "since <date>" and next planned group change if any:
  // - if there is no next planned group change, leave it empty there
  // - if the next planned group change is a non-exit change, write there (-> <group name> ab <next group change date>)
  // - if the next planned group change is an exit, write (-> bis <exit group change date>)
  const groupName = getGroupShortLabel(latest.target_group);
  const changeDateStr = formatDisplayDate(latest.change_date);
  const sinceWord = CURRENT_LOCALE === 'de' ? 'seit' : 'since';
  const sinceText = `${sinceWord} ${changeDateStr}`;

  const futureChanges = sorted.filter((c) => c.change_date.split('T')[0] > todayStr);
  const nextChange = futureChanges.length > 0 ? futureChanges[0] : null;
  let nextChangeText = '';
  if (nextChange) {
    const nextDateStr = formatDisplayDate(nextChange.change_date);
    if (nextChange.target_group > 0) {
      const nextGroupName = getGroupShortLabel(nextChange.target_group);
      const abWord = CURRENT_LOCALE === 'de' ? 'ab' : 'from';
      nextChangeText = `(-> ${nextGroupName} ${abWord} ${nextDateStr})`;
    } else {
      const bisWord = CURRENT_LOCALE === 'de' ? 'bis' : 'until';
      nextChangeText = `(-> ${bisWord} ${nextDateStr})`;
    }
  }

  const groupLabel = nextChangeText
    ? `${groupName} ${sinceText} ${nextChangeText}`
    : `${groupName} ${sinceText}`;

  return {
    currentGroup: latest.target_group,
    groupLabel,
    groupName,
    sinceText,
    nextChangeText,
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
            `${groupInfo.groupName} (${groupInfo.sinceText})${groupInfo.nextChangeText ? ` ${groupInfo.nextChangeText}` : ''}`
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
              {groupInfo.nextChangeText ? (
                <span
                  style={{
                    display: 'inline-block',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {groupInfo.nextChangeText}
                </span>
              ) : null}
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

export interface FamiliencardSummary {
  text: string;
  color: string;
  status: 'valid' | 'expired' | 'none';
}

export function getFamiliencardSummary(cards: number[] | undefined | null, overrideCurrentYear?: number): FamiliencardSummary {
  if (!cards || cards.length === 0) {
    return { text: '', color: 'inherit', status: 'none' };
  }

  const currentYear = overrideCurrentYear ?? new Date().getFullYear();
  const hasCurrent = cards.includes(currentYear);
  const futureYears = cards.filter((y) => y > currentYear).sort((a, b) => a - b);

  if (hasCurrent) {
    if (futureYears.length > 0) {
      return {
        text: `ja (${currentYear}+)`,
        color: 'black',
        status: 'valid',
      };
    }
    return {
      text: `ja (${currentYear})`,
      color: 'black',
      status: 'valid',
    };
  }

  if (futureYears.length > 0) {
    return {
      text: `ja (ab ${futureYears[0]})`,
      color: 'black',
      status: 'valid',
    };
  }

  const latestPastYear = Math.max(...cards);
  return {
    text: `abgelaufen (${latestPastYear})`,
    color: 'gray',
    status: 'expired',
  };
}

interface ChildFamiliencardCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

const ChildFamiliencardCell: React.FC<ChildFamiliencardCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const summary = getFamiliencardSummary(child.familiencards);
  const cellId = `cell-familiencard-${child.id}`;

  return (
    <div
      id={cellId}
      className="familiencard-cell-wrapper"
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
      title={readOnly ? t('viewFamiliencards') : t('manageFamiliencards')}
    >
      <span
        style={{
          color: summary.color,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.875rem',
        }}
      >
        {summary.text}
      </span>
      {!readOnly && (
        <button
          type="button"
          className="cell-edit-pencil-btn child-familiencard-manage-btn"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          title={t('manageFamiliencards')}
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
  first_name_for_address_list?: string;
  last_name: string;
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  memberships?: THMembership[];
}

interface OverviewChild {
  id: string;
  first_name: string;
  first_name_for_address_list?: string;
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

export type FamilySortOrder =
  | 'name_asc'
  | 'name_desc'
  | 'last_start_desc'
  | 'last_start_asc'
  | 'first_start_asc'
  | 'first_start_desc';

export const sortOptionGroups: {
  groupLabelKey: string;
  options: { key: FamilySortOrder; labelKey: string }[];
}[] = [
  {
    groupLabelKey: 'sortGroupFamilyName',
    options: [
      { key: 'name_asc', labelKey: 'sortNameAsc' },
      { key: 'name_desc', labelKey: 'sortNameDesc' },
    ],
  },
  {
    groupLabelKey: 'sortGroupLastStart',
    options: [
      { key: 'last_start_desc', labelKey: 'sortLastStartDesc' },
      { key: 'last_start_asc', labelKey: 'sortLastStartAsc' },
    ],
  },
  {
    groupLabelKey: 'sortGroupFirstStart',
    options: [
      { key: 'first_start_asc', labelKey: 'sortFirstStartAsc' },
      { key: 'first_start_desc', labelKey: 'sortFirstStartDesc' },
    ],
  },
];

export const getSortOptionLabel = (order: FamilySortOrder): string => {
  for (const group of sortOptionGroups) {
    const found = group.options.find((opt) => opt.key === order);
    if (found) return t(found.labelKey);
  }
  return t('sortNameAsc');
};

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
  canEdit?: boolean;
}

const ParentMultiValueCell: React.FC<ParentMultiValueCellProps> = ({
  parent,
  field,
  placeholder,
  isActive,
  onOpenManage,
  canEdit = true,
}) => (
  <MultiValueCell
    id={parent.id}
    field={field}
    values={parent[field] || []}
    placeholder={placeholder}
    isActive={isActive}
    onOpenManage={(_, anchor) => onOpenManage(parent, field, anchor)}
    canEdit={canEdit}
  />
);

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
  if (field === 'phones') {
    const pType = (typeof item === 'object' && item !== null && item.type) ? item.type : 'mobile';
    const sym = getPhoneTypeSymbol(pType);
    const lbl = getPhoneTypeLabel(pType);
    flagParts.push(`${sym} ${lbl}`);
  }
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

  // Address
  if ((before.address || '') !== (after.address || '')) {
    changes.push(`${t('address')}: "${before.address || ''}" → "${after.address || ''}"`);
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

        if (field === 'phones') {
          const bType = (typeof bItem === 'object' && bItem !== null && bItem.type) ? bItem.type : 'mobile';
          const aType = (typeof aItem === 'object' && aItem !== null && aItem.type) ? aItem.type : 'mobile';
          if (bType !== aType) {
            const bLbl = `${getPhoneTypeSymbol(bType)} ${getPhoneTypeLabel(bType)}`;
            const aLbl = `${getPhoneTypeSymbol(aType)} ${getPhoneTypeLabel(aType)}`;
            changes.push(`${val}: ${t('phoneTypeChanged') || 'Telefontyp geändert'}: ${bLbl} → ${aLbl}`);
          }
        }
      }
    });
  };

  diffMultiValues(before.emails, after.emails, 'emails');
  diffMultiValues(before.phones, after.phones, 'phones');

  return changes;
};

const diffChildSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];

  if ((before.first_name || '') !== (after.first_name || '')) {
    changes.push(`${t('firstName')}: "${before.first_name || ''}" → "${after.first_name || ''}"`);
  }

  if ((before.last_name || '') !== (after.last_name || '')) {
    changes.push(`${t('lastName')}: "${before.last_name || ''}" → "${after.last_name || ''}"`);
  }

  if (formatDisplayDate(before.birth_date) !== formatDisplayDate(after.birth_date)) {
    changes.push(`${t('birthDate')}: ${formatDisplayDate(before.birth_date)} → ${formatDisplayDate(after.birth_date)}`);
  }

  if ((before.notes || '') !== (after.notes || '')) {
    changes.push(`${t('notes')}: "${before.notes || ''}" → "${after.notes || ''}"`);
  }

  const beforeFc = getFamiliencardSummary(before.familiencards);
  const afterFc = getFamiliencardSummary(after.familiencards);
  if (beforeFc.text !== afterFc.text) {
    changes.push(`${t('familiencard')}: "${beforeFc.text || '-'}" → "${afterFc.text || '-'}"`);
  }

  if (after.allergies_updated) {
    changes.push(t('allergiesUpdated'));
  }

  return changes;
};

const diffGroupChangeSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];
  const groupLabels: Record<number, string> = {
    0: t('exit'),
    1: t('group1'),
    2: t('group2'),
    3: t('group3'),
  };
  const getGroupLabel = (val: number) => groupLabels[val] || `${t('targetGroup')}: ${val}`;

  if (before.target_group !== after.target_group) {
    changes.push(`${t('targetGroup')}: ${getGroupLabel(before.target_group)} → ${getGroupLabel(after.target_group)}`);
  }

  if (formatDisplayDate(before.change_date) !== formatDisplayDate(after.change_date)) {
    changes.push(`${t('date')}: ${formatDisplayDate(before.change_date)} → ${formatDisplayDate(after.change_date)}`);
  }

  return changes;
};

const diffHygieneEventSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];
  const getHygieneTypeLabel = (val: string) => val === 'initial' ? t('initialType') : t('recertifyType');

  if (before.event_type !== after.event_type) {
    changes.push(`${t('eventType')}: ${getHygieneTypeLabel(before.event_type)} → ${getHygieneTypeLabel(after.event_type)}`);
  }

  if (formatDisplayDate(before.event_date) !== formatDisplayDate(after.event_date)) {
    changes.push(`${t('date')}: ${formatDisplayDate(before.event_date)} → ${formatDisplayDate(after.event_date)}`);
  }

  if ((before.documentation || '') !== (after.documentation || '')) {
    changes.push(`${t('documentation')}: "${before.documentation || ''}" → "${after.documentation || ''}"`);
  }

  return changes;
};

const diffMembershipSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];
  const getMembershipLabel = (val: string) => val === 'full_member' ? t('full_member') : t('supporting_member');

  if (before.membership_type !== after.membership_type) {
    changes.push(`${t('membershipType')}: ${getMembershipLabel(before.membership_type)} → ${getMembershipLabel(after.membership_type)}`);
  }

  if (formatDisplayDate(before.start_date) !== formatDisplayDate(after.start_date)) {
    changes.push(`${t('startDateLabel')}: ${formatDisplayDate(before.start_date)} → ${formatDisplayDate(after.start_date)}`);
  }

  const bEnd = before.end_date ? formatDisplayDate(before.end_date) : '-';
  const aEnd = after.end_date ? formatDisplayDate(after.end_date) : '-';
  if (bEnd !== aEnd) {
    changes.push(`${t('endDateLabel')}: ${bEnd} → ${aEnd}`);
  }

  return changes;
};

const formatSnapshotDetails = (log: AuditLog, families: Family[] = []) => {
  const data = log.after_snapshot || log.before_snapshot;
  if (!data) return '-';

  const parts: string[] = [];

  const findChildName = (childId: string): string => {
    for (const f of families) {
      const c = f.children?.find((ch: any) => ch.id === childId);
      if (c) return `${c.first_name || ''} ${c.last_name || ''}`.trim();
    }
    return '';
  };

  const findParentName = (parentId: string): string => {
    for (const f of families) {
      const p = f.parents?.find((pa: any) => pa.id === parentId);
      if (p) return `${p.first_name || ''} ${p.last_name || ''}`.trim();
    }
    return '';
  };
  
  if (log.entity_type === 'family') {
    if (data.parents && data.parents.length > 0) {
      const names = data.parents.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ');
      parts.push(`${t('family')}: ${names}`);
    } else {
      const fam = families.find(f => f.id === log.entity_id || f.id === log.family_id);
      if (fam && fam.parents && fam.parents.length > 0) {
        const names = fam.parents.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ');
        parts.push(`${t('family')}: ${names}`);
      } else {
        parts.push(`Family ID: ${log.entity_id}`);
      }
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

    if (data.address) {
      parts.push(`${t('address')}: ${data.address}`);
    }
    if (data.emails && data.emails.length > 0) {
      parts.push(`Emails: ${data.emails.map((e: any) => formatMultiValueItem(e, 'emails')).join(', ')}`);
    }
    if (data.phones && data.phones.length > 0) {
      parts.push(`Phones: ${data.phones.map((p: any) => formatMultiValueItem(p, 'phones')).join(', ')}`);
    }
    if (data.notes) {
      parts.push(`${t('notes')}: ${data.notes}`);
    }
  }

  if (log.entity_type === 'child') {
    const childName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (childName) {
      parts.push(childName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffChildSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    if (data.birth_date) {
      parts.push(`${t('birthDate')}: ${formatDisplayDate(data.birth_date)}`);
    }
    if (data.notes) {
      parts.push(`${t('notes')}: ${data.notes}`);
    }
    const fc = getFamiliencardSummary(data.familiencards);
    if (fc.text) {
      parts.push(`${t('familiencard')}: ${fc.text}`);
    }
    if (data.allergies_updated) {
      parts.push(t('allergiesUpdated'));
    }
  }

  if (log.entity_type === 'employee') {
    const empName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (empName) {
      parts.push(empName);
    }
    if (data.allergies_updated) {
      parts.push(t('allergiesUpdated'));
    }
  }

  if (log.entity_type === 'child_group_change') {
    const childName = findChildName(data.child);
    if (childName) {
      parts.push(childName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffGroupChangeSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

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
    const parentName = findParentName(data.parent_id);
    if (parentName) {
      parts.push(parentName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffHygieneEventSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    const typeLabel = data.event_type === 'initial' ? t('initialType') : t('recertifyType');
    parts.push(`${typeLabel}`);
    if (data.event_date) {
      parts.push(`${t('date')}: ${formatDisplayDate(data.event_date)}`);
    }
    if (data.documentation) {
      parts.push(`Info: ${data.documentation}`);
    }
  }

  if (log.entity_type === 'th_membership') {
    const parentName = findParentName(data.parent_id);
    if (parentName) {
      parts.push(parentName);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffMembershipSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

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

interface AuditLogViewProps {
  logs?: AuditLog[];
  loading?: boolean;
  families?: Family[];
  getAuthHeaders?: () => Record<string, string>;
  refreshTrigger?: number;
}

const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs: propLogs,
  loading: propLoading,
  families = [],
  getAuthHeaders,
  refreshTrigger,
}) => {
  const [internalLogs, setInternalLogs] = React.useState<AuditLog[]>([]);
  const [internalLoading, setInternalLoading] = React.useState<boolean>(false);
  const [hasMore, setHasMore] = React.useState<boolean>(false);
  const [filterText, setFilterText] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [pageSize, setPageSize] = React.useState<number>(50);
  const [pageIndex, setPageIndex] = React.useState<number>(0);
  const [cursorHistory, setCursorHistory] = React.useState<Array<{ before?: string; beforeId?: string } | null>>([null]);

  const isServerSide = !!getAuthHeaders;

  // Debounce search query changes to prevent rapid requests while typing
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(filterText);
    }, 250);
    return () => clearTimeout(handler);
  }, [filterText]);

  const fetchLogs = React.useCallback(
    (
      cursor: { before?: string; beforeId?: string } | null,
      search: string,
      limit: number,
      signal?: AbortSignal
    ) => {
      if (!getAuthHeaders) return;
      setInternalLoading(true);
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (search.trim()) {
        params.set('q', search.trim());
      }
      if (cursor?.before) {
        params.set('before', cursor.before);
      }
      if (cursor?.beforeId) {
        params.set('before_id', cursor.beforeId);
      }

      fetch(`/api/audit-logs?${params.toString()}`, {
        headers: getAuthHeaders(),
        signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch audit logs');
          const hasMoreHeader = res.headers.get('X-Has-More') === 'true';
          return res.json().then((data) => ({ data, hasMoreHeader }));
        })
        .then(({ data, hasMoreHeader }) => {
          const received = Array.isArray(data) ? data : (data.logs || []);
          setInternalLogs(received);
          setHasMore(hasMoreHeader);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error(err);
          }
        })
        .finally(() => {
          setInternalLoading(false);
        });
    },
    [getAuthHeaders]
  );

  // When search query or page size changes, reset pagination and fetch page 1
  React.useEffect(() => {
    if (!isServerSide) return;
    const controller = new AbortController();
    setCursorHistory([null]);
    setPageIndex(0);
    fetchLogs(null, debouncedQuery, pageSize, controller.signal);
    return () => controller.abort();
  }, [debouncedQuery, pageSize, fetchLogs, isServerSide]);

  // When external refreshTrigger changes (e.g. WebSocket update on page 1)
  React.useEffect(() => {
    if (!isServerSide || refreshTrigger === undefined || refreshTrigger === 0) return;
    if (pageIndex === 0 && !debouncedQuery) {
      fetchLogs(null, '', pageSize);
    }
  }, [refreshTrigger, isServerSide, fetchLogs, pageIndex, debouncedQuery, pageSize]);

  const handleRefresh = () => {
    setCursorHistory([null]);
    setPageIndex(0);
    fetchLogs(null, debouncedQuery, pageSize);
  };

  const handleNextPage = () => {
    if (internalLoading || !hasMore || internalLogs.length === 0) return;
    const lastLog = internalLogs[internalLogs.length - 1];
    const nextCursor = { before: lastLog.created_at, beforeId: lastLog.id };
    const nextHistory = cursorHistory.slice(0, pageIndex + 1);
    nextHistory.push(nextCursor);
    setCursorHistory(nextHistory);
    setPageIndex(pageIndex + 1);
    fetchLogs(nextCursor, debouncedQuery, pageSize);
  };

  const handlePrevPage = () => {
    if (internalLoading || pageIndex <= 0) return;
    const prevIndex = pageIndex - 1;
    const prevCursor = cursorHistory[prevIndex] || null;
    setPageIndex(prevIndex);
    fetchLogs(prevCursor, debouncedQuery, pageSize);
  };

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
        return t('addParentShort');
      case 'child':
        return t('addChildShort');
      case 'child_group_change':
        return t('groupChange');
      case 'hygiene_event':
        return t('hygieneBelehrung');
      case 'th_membership':
        return t('th_membership');
      case 'employee':
        return t('employee');
      default:
        return etype;
    }
  };

  // Client-side fallback if not server-side
  const displayLogs = React.useMemo(() => {
    if (isServerSide) {
      return internalLogs;
    }
    const safeLogs = Array.isArray(propLogs) ? propLogs : [];
    if (!filterText.trim()) return safeLogs;
    const term = filterText.toLowerCase();
    return safeLogs.filter((log) => {
      const email = (log.changed_by_email || '').toLowerCase();
      const op = (log.operation || '').toLowerCase();
      const type = (getEntityTypeLabel(log.entity_type) || '').toLowerCase();
      const details = formatSnapshotDetails(log, families).toLowerCase();
      const dateStr = new Date(log.created_at).toLocaleString(CURRENT_LOCALE === 'de' ? 'de-DE' : 'en-US').toLowerCase();
      return email.includes(term) || op.includes(term) || type.includes(term) || details.includes(term) || dateStr.includes(term);
    });
  }, [isServerSide, internalLogs, propLogs, filterText, families]);

  const effectiveLoading = isServerSide ? internalLoading : (propLoading || false);

  return (
    <div className="table-container" style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t('searchAudit')}
            className="search-input"
            style={{ maxWidth: '300px', marginBottom: 0 }}
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="fees-family-nav-btn"
              title="Clear search"
              style={{ width: '28px', height: '28px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isServerSide && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>{t('perPage')}:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)' }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={effectiveLoading}
              className="fees-family-nav-btn"
              title={t('refresh')}
              style={{ width: '32px', height: '32px' }}
            >
              <RefreshCw size={14} className={effectiveLoading ? 'spin' : ''} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={effectiveLoading || pageIndex === 0}
                className="fees-family-nav-btn"
                title={t('prevPage')}
                style={{ width: '32px', height: '32px' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, minWidth: '60px', textAlign: 'center' }}>
                {t('page')} {pageIndex + 1}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={effectiveLoading || !hasMore}
                className="fees-family-nav-btn"
                title={t('nextPage')}
                style={{ width: '32px', height: '32px' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

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
          {effectiveLoading && displayLogs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                {t('loading')}
              </td>
            </tr>
          ) : displayLogs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {CURRENT_LOCALE === 'de' ? 'Keine Einträge vorhanden' : 'No entries found'}
              </td>
            </tr>
          ) : (
            displayLogs.map((log) => (
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
                  {formatSnapshotDetails(log, families)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {isServerSide && displayLogs.length > 0 && (
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={effectiveLoading || pageIndex === 0}
            className="fees-family-nav-btn"
            title={t('prevPage')}
            style={{ width: '32px', height: '32px' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 500, minWidth: '60px', textAlign: 'center' }}>
            {t('page')} {pageIndex + 1}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={effectiveLoading || !hasMore}
            className="fees-family-nav-btn"
            title={t('nextPage')}
            style={{ width: '32px', height: '32px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

const ImpressumFooter: React.FC = () => (
  <footer className="app-footer">
    <a
      href="https://www.tollhaus-stuttgart.de/impressum"
      target="_blank"
      rel="noopener noreferrer"
      className="footer-impressum-link"
    >
      {t('impressum')}
    </a>
  </footer>
);

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
        <div style={{ marginTop: '30px' }}>
          <ImpressumFooter />
        </div>
      </div>
    );
  }

  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');

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
      <div style={{ marginTop: '30px' }}>
        <ImpressumFooter />
      </div>
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
  'memberships.all.read',
  'memberships.self.read',
  'employees.all.write',
  'employees.all.read',
  'allergies.children.read',
  'allergies.children.write',
  'allergies.employees.read',
  'allergies.employees.write',
  'allergies.summary.read',
  'mealplan.view',
  'meal_allergens.read',
  'meal_allergens.write',
  'audit.view',
  'users.all.manage',
  'vaccination.status.manage',
  'permissions.simulate'
];

interface AdminViewProps {
  onOpenSimulator?: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ onOpenSimulator }) => {
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
              color: subTab === 'users' ? 'var(--primary-contrast, white)' : 'var(--text-secondary)',
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
              color: subTab === 'roles' ? 'var(--primary-contrast, white)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {t('roles')} ({roles.length})
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="admin-open-simulator-btn"
              data-testid="admin-open-simulator-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'var(--bg-subtle)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              <Eye size={16} />
              <span>{t('simulatePermissions')}</span>
            </button>
          )}
          {subTab === 'users' ? (
            <button onClick={openAddUserModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-contrast, white)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              + {t('addUser')}
            </button>
          ) : (
            <button onClick={openAddRoleModal} className="btn-primary" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-contrast, white)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              + {t('addRole')}
            </button>
          )}
        </div>
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
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
            <h3 style={{ color: 'var(--text-h)', marginTop: 0, textAlign: 'left' }}>{editingUser ? t('editUser') : t('addUser')}</h3>
            <form onSubmit={handleUserSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)', textAlign: 'left' }}>E-Mail Address</label>
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
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>{t('assignedRoles')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'left' }}>
                  {roles.map(r => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserRoles.includes(r.id)}
                        onChange={() => toggleUserRole(r.id)}
                        style={{ marginTop: '0.2rem', flexShrink: 0 }}
                      />
                      <span style={{ textAlign: 'left', wordBreak: 'break-word' }}>
                        <strong>{r.name}</strong>{' '}
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>({r.id})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>{t('customPermissions')} (Direct Overrides)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px', textAlign: 'left' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace', textAlign: 'left' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserPerms.includes(p)}
                        onChange={() => toggleUserPerm(p)}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ textAlign: 'left' }}>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setUserModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-contrast, white)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
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
          <div style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
            <h3 style={{ color: 'var(--text-h)', marginTop: 0, textAlign: 'left' }}>{editingRole ? t('editRole') : t('addRole')}</h3>
            <form onSubmit={handleRoleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)', textAlign: 'left' }}>{t('roleId')}</label>
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
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)', textAlign: 'left' }}>{t('roleName')}</label>
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
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--text-secondary)', textAlign: 'left' }}>Beschreibung</label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  placeholder="Kurze Beschreibung der Rolle"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-secondary)', textAlign: 'left' }}>{t('permissions')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: '4px', textAlign: 'left' }}>
                  {ALL_AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'monospace', textAlign: 'left' }}>
                      <input
                        type="checkbox"
                        checked={selectedRolePerms.includes(p)}
                        onChange={() => toggleRolePerm(p)}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ textAlign: 'left' }}>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setRoleModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-contrast, white)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
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
  const { user, token, logout, hasPermission, canSimulate, leaveSimulation } = useAuth();
  const [simulatorModalOpen, setSimulatorModalOpen] = React.useState(false);
  const [viewRolesModalOpen, setViewRolesModalOpen] = React.useState(false);
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

  const canReadAudit = hasPermission('audit.view');
  const canManageUsers = hasPermission('users.all.manage') || hasPermission('*');
  const canProvisionKiosk = hasPermission('provision.kiosk.cert') || hasPermission('*');
  const canReadOverview = hasPermission('families.all.restrictedread');
  const canReadFamiliesAll = hasPermission('families.all.read');
  const canReadFees = hasPermission('fees.all.read') || hasPermission('fees.self.read');
  const canWriteParents = hasPermission('families.all.write');
  const canWriteChildren = hasPermission('children.all.write');
  const canWriteHygiene = hasPermission('hygiene.all.write');
  const canViewMealPlan = hasPermission('mealplan.view');
  const canReadMealAllergens = hasPermission('meal_allergens.read') || hasPermission('meal_allergens.write');
  const canReadMembers = hasPermission('memberships.all.read');
  const canWriteMemberships = hasPermission('memberships.all.write');
  const canReadOwnMemberships = hasPermission('memberships.self.read');
  const canReadChildAllergies = hasPermission('allergies.children.read') || hasPermission('allergies.children.write');
  const canWriteChildAllergies = hasPermission('allergies.children.write');
  const canReadEmployeeAllergies = hasPermission('allergies.employees.read') || hasPermission('allergies.employees.write');
  const canWriteEmployeeAllergies = hasPermission('allergies.employees.write');
  const canReadEmployees = hasPermission('employees.all.read') || canReadEmployeeAllergies;
  const canWriteEmployees = hasPermission('employees.all.write');

  const [families, setFamilies] = React.useState<Family[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [overviewFamilies, setOverviewFamilies] = React.useState<OverviewFamily[]>([]);
  const [overviewGroupBy, setOverviewGroupBy] = React.useState<'family' | 'group'>('group');
  const [expandedGroupParents, setExpandedGroupParents] = React.useState<Record<string, boolean>>({});

  const handleToggleGroupParents = React.useCallback((key: string) => {
    setExpandedGroupParents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const [familySortOrder, setFamilySortOrder] = React.useState<FamilySortOrder>(() => {
    try {
      const saved = localStorage.getItem('thweb_family_sort_order');
      if (
        saved &&
        [
          'name_asc',
          'name_desc',
          'last_start_desc',
          'last_start_asc',
          'first_start_asc',
          'first_start_desc',
        ].includes(saved)
      ) {
        return saved as FamilySortOrder;
      }
    } catch {
      // ignore
    }
    return 'name_asc';
  });

  const handleSetFamilySortOrder = React.useCallback((order: FamilySortOrder) => {
    setFamilySortOrder(order);
    try {
      localStorage.setItem('thweb_family_sort_order', order);
    } catch {
      // ignore
    }
  }, []);

  const [sortPopoverOpen, setSortPopoverOpen] = React.useState(false);
  const sortButtonRef = React.useRef<HTMLButtonElement>(null);

  const [globalFilter, setGlobalFilter] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<
    'familiesOverview' | 'families' | 'parents' | 'children' | 'members' | 'employees' | 'childcareFees' | 'hygieneBelehrung' | 'mealPlan' | 'mealAllergens' | 'audit' | 'admin' | 'kiosk' | 'dashboard'
  >(() => {
    const rawHash = window.location.hash.replace('#', '');
    const hash = rawHash.split('?')[0];
    const pathname = window.location.pathname.replace(/\/+$/, '');
    if (
      (hash === 'familiesOverview' && canReadOverview) ||
      (hash === 'families' && canReadFamiliesAll) ||
      (hash === 'parents' && canReadFamiliesAll) ||
      (hash === 'children' && canReadFamiliesAll) ||
      (hash === 'members' && canReadMembers) ||
      (hash === 'employees' && canReadEmployees) ||
      (hash === 'childcareFees' && canReadFees) ||
      (hash === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
      (hash === 'mealPlan' && canViewMealPlan) ||
      (hash === 'mealAllergens' && canReadMealAllergens) ||
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
      (saved === 'members' && canReadMembers) ||
      (saved === 'employees' && canReadEmployees) ||
      (saved === 'childcareFees' && canReadFees) ||
      (saved === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
      (saved === 'mealPlan' && canViewMealPlan) ||
      (saved === 'mealAllergens' && canReadMealAllergens) ||
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
    if (canReadMembers) {
      return 'members';
    }
    if (canReadEmployees) {
      return 'employees';
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
    } else if (activeTab === 'members' && !canReadMembers) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      } else if (canReadFamiliesAll) {
        setActiveTab('families');
      }
    } else if (activeTab === 'employees' && !canReadEmployees) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      } else if (canReadFamiliesAll) {
        setActiveTab('families');
      }
    } else if (activeTab === 'mealPlan' && !canViewMealPlan) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      } else if (canReadFamiliesAll) {
        setActiveTab('families');
      }
    } else if (activeTab === 'mealAllergens' && !canReadMealAllergens) {
      if (canReadOverview) {
        setActiveTab('familiesOverview');
      } else if (canReadFees) {
        setActiveTab('childcareFees');
      } else if (canReadFamiliesAll) {
        setActiveTab('families');
      }
    }
  }, [activeTab, canReadFamiliesAll, canReadOverview, canReadFees, canReadMembers, canReadEmployees, canViewMealPlan, canReadMealAllergens]);

  // Navigation & Highlighting state (Patterns 2 & 3)
  const [highlightTarget, setHighlightTarget] = React.useState<{ id: string; key: number } | null>(null);
  const highlightedRowId = highlightTarget?.id ?? null;
  const [returnNav, setReturnNav] = React.useState<{
    familyId: string;
    familyName: string;
    type: 'parent' | 'child' | 'family';
    fromTab?: 'families' | 'familiesOverview' | 'parents' | 'children' | 'members';
  } | null>(null);

  const handleJumpToParent = React.useCallback(
    (
      parentId: string,
      familyId: string,
      familyName: string,
      fromTab: 'families' | 'familiesOverview' | 'members' = 'families'
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
      fromTab: 'families' | 'familiesOverview' | 'members' = 'families'
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
  const [auditRefreshTrigger, setAuditRefreshTrigger] = React.useState(0);

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

  const [addEmployeeOpen, setAddEmployeeOpen] = React.useState(false);
  const [empFirstName, setEmpFirstName] = React.useState('');
  const [empLastName, setEmpLastName] = React.useState('');
  const [empType, setEmpType] = React.useState<'caregiver' | 'cook' | 'bufdi'>('caregiver');

  // Hygiene Belehrung Event popover states
  const [targetParent, setTargetParent] = React.useState<ParentWithHygiene | null>(null);
  const [hygienePopoverAnchor, setHygienePopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Membership popover state
  const [targetParentMemberships, setTargetParentMemberships] = React.useState<Parent | null>(null);
  const [membershipPopoverAnchor, setMembershipPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Group Change popover state
  const [targetChildGroupChanges, setTargetChildGroupChanges] = React.useState<Child | null>(null);
  const [groupPopoverAnchor, setGroupPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Familiencard popover state
  const [targetChildFamiliencards, setTargetChildFamiliencards] = React.useState<Child | null>(null);
  const [familiencardPopoverAnchor, setFamiliencardPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // MultiValue (Emails/Phones/Allergies) popover state
  const [targetParentMultiValue, setTargetParentMultiValue] = React.useState<Parent | null>(null);
  const [targetChildMultiValue, setTargetChildMultiValue] = React.useState<Child | null>(null);
  const [targetEmployeeMultiValue, setTargetEmployeeMultiValue] = React.useState<Employee | null>(null);
  const [activeMultiValueField, setActiveMultiValueField] = React.useState<'emails' | 'phones' | 'allergies' | null>(null);
  const [multiValuePopoverAnchor, setMultiValuePopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  // Vaccination Status popover state
  const [targetVaccinationPerson, setTargetVaccinationPerson] = React.useState<{ id: string; type: 'parent' | 'child' } | null>(null);
  const [vaccinationPopoverAnchor, setVaccinationPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  const [confirmDelete, setConfirmDelete] = React.useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    expectedName?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    expectedName: '',
    onConfirm: () => {},
  });

  const stripVaccination = (child: any): any => {
    if (!child) return child;
    const { vaccination_checks: _vc, vaccination_status_protected: _vsp, ...rest } = child;
    return rest;
  };

  const stripParentsVaccination = (parents: any[]): any[] => {
    if (!Array.isArray(parents)) return parents;
    return parents.map((p) => {
      if (!p) return p;
      const { vaccination_checks: _vc, vaccination_status_protected: _vsp, ...rest } = p;
      return rest;
    });
  };

  const isPureVaccinationAction = (action: any): boolean => {
    if (!action || !action.payload) return false;
    if (action.type === 'UPDATE_CHILD') {
      const b = stripVaccination(action.payload.before);
      const a = stripVaccination(action.payload.after);
      return JSON.stringify(b) === JSON.stringify(a);
    }
    if (action.type === 'UPDATE_PARENT') {
      const b = stripParentsVaccination(action.payload.beforeParents || []);
      const a = stripParentsVaccination(action.payload.afterParents || []);
      return JSON.stringify(b) === JSON.stringify(a);
    }
    return false;
  };

  const sanitizeHistoryAction = (action: any): any => {
    if (!action || !action.payload) return action;
    if (action.type === 'UPDATE_CHILD') {
      return {
        ...action,
        payload: {
          ...action.payload,
          before: stripVaccination(action.payload.before),
          after: stripVaccination(action.payload.after),
        },
      };
    }
    if (action.type === 'UPDATE_PARENT') {
      return {
        ...action,
        payload: {
          ...action.payload,
          beforeParents: stripParentsVaccination(action.payload.beforeParents || []),
          afterParents: stripParentsVaccination(action.payload.afterParents || []),
        },
      };
    }
    return action;
  };

  const [undoStack, setUndoStack] = React.useState<any[]>(() => {
    try {
      localStorage.removeItem('thweb_undo_stack');
      const saved = sessionStorage.getItem('thweb_undo_stack');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((a) => !isPureVaccinationAction(a)).map(sanitizeHistoryAction)
        : [];
    } catch {
      return [];
    }
  });
  const [redoStack, setRedoStack] = React.useState<any[]>(() => {
    try {
      localStorage.removeItem('thweb_redo_stack');
      const saved = sessionStorage.getItem('thweb_redo_stack');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((a) => !isPureVaccinationAction(a)).map(sanitizeHistoryAction)
        : [];
    } catch {
      return [];
    }
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
    try {
      sessionStorage.setItem('thweb_undo_stack', JSON.stringify(undo));
      sessionStorage.setItem('thweb_redo_stack', JSON.stringify(redo));
    } catch {
      // Ignore quota/security errors in storage
    }
  };

  const pushAction = (action: any) => {
    if (isPureVaccinationAction(action)) return;
    const sanitized = sanitizeHistoryAction(action);
    const newUndo = [...undoStackRef.current, sanitized];
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
        p.employeeId === entityId ||
        p.parent?.id === entityId ||
        p.child?.id === entityId ||
        p.membership?.id === entityId ||
        p.event?.id === entityId ||
        p.change?.id === entityId ||
        p.employee?.id === entityId ||
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
    const targetTab = payload.tab || (type.includes('CHILD') ? 'children' : type.includes('EMPLOYEE') ? 'employees' : 'parents');
    if (targetTab) {
      setActiveTab(targetTab);
      window.location.hash = targetTab;
      localStorage.setItem('thweb_active_tab', targetTab);
    }

    try {
      if (type === 'UPDATE_PARENT') {
        const targetParents = stripParentsVaccination(isUndo ? payload.beforeParents : payload.afterParents);
        const res = await fetch(`/api/families/${payload.familyId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ parents: targetParents }),
        });
        if (!res.ok) throw new Error();
      } 
      else if (type === 'UPDATE_CHILD') {
        const targetChild = stripVaccination(isUndo ? payload.before : payload.after);
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
        if (!res.ok && res.status !== 404) throw new Error();
      }
      else if (type === 'ADD_EMPLOYEE') {
        if (isUndo) {
          const res = await fetch(`/api/employees/${payload.employeeId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (!res.ok && res.status !== 404) throw new Error();
        } else {
          const res = await fetch('/api/employees', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload.employee),
          });
          if (!res.ok) throw new Error();
          const created = await res.json();
          payload.employeeId = created.id;
          payload.employee = created;
        }
      }
      else if (type === 'UPDATE_EMPLOYEE') {
        const target = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/employees/${payload.employeeId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(target),
        });
        if (!res.ok && res.status !== 404) throw new Error();
      }

      await fetchFamilies();
      if (canReadMembers) {
        await fetchMembers();
      }
      if (canReadEmployees) {
        await fetchEmployees();
      }

      // Scroll and highlight target row
      const targetId = payload.childId || payload.parentId || payload.familyId || payload.employeeId || payload.child?.id || payload.parent?.id || payload.employee?.id;
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
    } catch {
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

  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const fetchMembers = React.useCallback(() => {
    if (!canReadMembers) return Promise.resolve([]);
    return fetch('/api/members', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch members');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setMembers(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [canReadMembers, getAuthHeaders]);

  const fetchEmployees = React.useCallback(() => {
    if (!canReadEmployees) return Promise.resolve([]);
    return fetch('/api/employees', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch employees');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setEmployees(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [canReadEmployees, getAuthHeaders]);



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

  // Fetch data on demand based on the active tab
  React.useEffect(() => {
    switch (activeTab) {
      case 'familiesOverview':
        if (canReadOverview) {
          fetchOverviewFamilies();
        }
        break;
      case 'families':
      case 'parents':
      case 'children':
      case 'hygieneBelehrung':
        if (canReadFamiliesAll) {
          fetchFamilies();
        }
        break;
      case 'members':
        if (canReadMembers) {
          fetchMembers();
        }
        break;
      case 'employees':
        if (canReadEmployees) {
          fetchEmployees();
        }
        break;
      case 'childcareFees':
        if (canReadFamiliesAll) {
          fetchFamilies();
        } else if (canReadOverview) {
          fetchOverviewFamilies();
        }
        break;
      case 'audit':
        if (canReadAudit) {
          if (families.length === 0 && overviewFamilies.length === 0) {
            if (canReadFamiliesAll) {
              fetchFamilies();
            } else if (canReadOverview) {
              fetchOverviewFamilies();
            }
          }
        } else {
          const fallback = canReadFamiliesAll ? 'families' : canReadOverview ? 'familiesOverview' : 'childcareFees';
          setActiveTab(fallback as any);
          localStorage.setItem('thweb_active_tab', fallback);
          window.location.hash = fallback;
        }
        break;
      default:
        // 'admin', 'mealPlan', 'kiosk', 'dashboard' fetch on demand in their own components
        break;
    }
  }, [
    activeTab,
    canReadOverview,
    canReadFamiliesAll,
    canReadMembers,
    canReadEmployees,
    canReadAudit,
    fetchOverviewFamilies,
    fetchFamilies,
    fetchMembers,
    fetchEmployees,
    families.length,
    overviewFamilies.length,
  ]);

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
      } else if (attempts >= 75) {
        clearInterval(interval);
      }
    }, 40);

    const clearTimer = setTimeout(() => {
      setHighlightTarget(null);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(clearTimer);
    };
  }, [activeTab, highlightTarget, families, overviewFamilies, members, employees]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '');
      const [hash, queryString] = rawHash.split('?');
      const searchParams = new URLSearchParams(queryString || '');
      const highlight = searchParams.get('highlight');
      const fromFamily = searchParams.get('fromFamily');
      const familyName = searchParams.get('familyName');
      const type = searchParams.get('type') as 'parent' | 'child' | 'family' | null;
      const fromTab = searchParams.get('fromTab') as 'families' | 'familiesOverview' | 'parents' | 'children' | 'members' | null;

      if (
        (hash === 'familiesOverview' && canReadOverview) ||
        (hash === 'parents' && canReadFamiliesAll) ||
        (hash === 'children' && canReadFamiliesAll) ||
        (hash === 'families' && canReadFamiliesAll) ||
        (hash === 'members' && canReadMembers) ||
        (hash === 'employees' && canReadEmployees) ||
        (hash === 'childcareFees' && canReadFees) ||
        (hash === 'hygieneBelehrung' && (canReadFamiliesAll || hasPermission('hygiene.all.write'))) ||
        (hash === 'mealPlan' && canViewMealPlan) ||
        (hash === 'mealAllergens' && canReadMealAllergens) ||
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
      } else if (hash === 'audit' || hash === 'admin' || hash === 'kiosk' || hash === 'mealPlan' || hash === 'mealAllergens') {
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
  }, [canReadAudit, canManageUsers, canProvisionKiosk, canReadOverview, canReadFamiliesAll, canReadFees, canReadMembers, canReadEmployees, canViewMealPlan, canReadMealAllergens, hasPermission]);

  useRealtime(React.useCallback((message: any) => {
    if (
      message.type === 'FAMILY_CREATED' || 
      message.type === 'FAMILY_UPDATED' || 
      message.type === 'CHILD_UPDATED'
    ) {
      if (activeTab === 'familiesOverview') {
        if (canReadOverview) fetchOverviewFamilies();
      } else if (
        activeTab === 'families' ||
        activeTab === 'parents' ||
        activeTab === 'children' ||
        activeTab === 'hygieneBelehrung'
      ) {
        if (canReadFamiliesAll) fetchFamilies();
      } else if (activeTab === 'members') {
        if (canReadMembers) fetchMembers();
      } else if (activeTab === 'childcareFees') {
        if (canReadFamiliesAll) fetchFamilies();
        else if (canReadOverview) fetchOverviewFamilies();
      } else if (activeTab === 'audit') {
        if (canReadAudit) setAuditRefreshTrigger((prev) => prev + 1);
      }
    }
    if (
      message.type === 'EMPLOYEE_CREATED' ||
      message.type === 'EMPLOYEE_UPDATED' ||
      message.type === 'EMPLOYEE_DELETED'
    ) {
      if (activeTab === 'employees' && canReadEmployees) {
        fetchEmployees();
      }
    }
  }, [
    activeTab,
    fetchFamilies,
    fetchOverviewFamilies,
    fetchMembers,
    fetchEmployees,
    canReadFamiliesAll,
    canReadOverview,
    canReadMembers,
    canReadEmployees,
    canReadAudit,
  ]));

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddParentOpen(false);
        setAddFamilyOpen(false);
        setAddChildOpen(false);
        setAddEmployeeOpen(false);
      }
    };
    if (addParentOpen || addFamilyOpen || addChildOpen || addEmployeeOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addParentOpen, addFamilyOpen, addChildOpen, addEmployeeOpen]);

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
        if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
        if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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

  const openManageMultiValue = (parent: Parent, field: 'emails' | 'phones' | 'allergies', anchor?: HTMLElement | string | null) => {
    setTargetParentMultiValue(parent);
    setTargetChildMultiValue(null);
    setTargetEmployeeMultiValue(null);
    setActiveMultiValueField(field);
    setMultiValuePopoverAnchor(anchor || `cell-${field}-${parent.id}`);
  };

  const openManageChildMultiValue = React.useCallback((child: Child, field: 'emails' | 'phones' | 'allergies', anchor?: HTMLElement | string | null) => {
    setTargetChildMultiValue(child);
    setTargetParentMultiValue(null);
    setTargetEmployeeMultiValue(null);
    setActiveMultiValueField(field);
    setMultiValuePopoverAnchor(anchor || `cell-${field}-${child.id}`);
  }, []);

  const openManageEmployeeMultiValue = React.useCallback((employee: Employee, field: 'emails' | 'phones' | 'allergies', anchor?: HTMLElement | string | null) => {
    setTargetEmployeeMultiValue(employee);
    setTargetParentMultiValue(null);
    setTargetChildMultiValue(null);
    setActiveMultiValueField(field);
    setMultiValuePopoverAnchor(anchor || `cell-${field}-${employee.id}`);
  }, []);

  const closeManageMultiValue = () => {
    setMultiValuePopoverAnchor(null);
    setTargetParentMultiValue(null);
    setTargetChildMultiValue(null);
    setTargetEmployeeMultiValue(null);
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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

  const openManageFamiliencards = (child: Child, anchor: HTMLElement | string) => {
    setTargetChildFamiliencards(child);
    setFamiliencardPopoverAnchor(anchor);
  };

  const closeManageFamiliencards = () => {
    setFamiliencardPopoverAnchor(null);
    setTargetChildFamiliencards(null);
  };

  const handleSaveFamiliencards = async (childId: string, updatedCards: number[]) => {
    const child = families.flatMap(f => f.children || []).find(c => c.id === childId)
      || (targetChildFamiliencards && targetChildFamiliencards.id === childId ? targetChildFamiliencards : null);
    if (!child) return;

    await handleSaveChildField(child, 'familiencards', updatedCards);
    if (targetChildFamiliencards && targetChildFamiliencards.id === childId) {
      setTargetChildFamiliencards({ ...targetChildFamiliencards, familiencards: updatedCards });
    }
  };

  const activeChildForFamiliencards = React.useMemo(() => {
    if (!targetChildFamiliencards) return null;
    for (const f of families) {
      const found = (f.children || []).find((c) => c.id === targetChildFamiliencards.id);
      if (found) return found;
    }
    for (const f of overviewFamilies) {
      const found = (f.children || []).find((c) => c.id === targetChildFamiliencards.id);
      if (found) return found as Child;
    }
    return targetChildFamiliencards;
  }, [families, overviewFamilies, targetChildFamiliencards]);

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

  const activeChildForMultiValue = React.useMemo(() => {
    if (!targetChildMultiValue) return null;
    for (const f of families) {
      const found = (f.children || []).find((c) => c.id === targetChildMultiValue.id);
      if (found) return found;
    }
    return targetChildMultiValue;
  }, [families, targetChildMultiValue]);

  const activeEmployeeForMultiValue = React.useMemo(() => {
    if (!targetEmployeeMultiValue) return null;
    const found = employees.find((e) => e.id === targetEmployeeMultiValue.id);
    return found || targetEmployeeMultiValue;
  }, [employees, targetEmployeeMultiValue]);

  const activeMultiValueValues = React.useMemo(() => {
    if (activeParentForMultiValue && activeMultiValueField && activeMultiValueField !== 'allergies') {
      return activeParentForMultiValue[activeMultiValueField] || [];
    }
    if (activeChildForMultiValue && activeMultiValueField === 'allergies') {
      return activeChildForMultiValue.allergies || [];
    }
    if (activeEmployeeForMultiValue && activeMultiValueField) {
      return activeEmployeeForMultiValue[activeMultiValueField] || [];
    }
    return [];
  }, [activeParentForMultiValue, activeChildForMultiValue, activeEmployeeForMultiValue, activeMultiValueField]);

  const activeMultiValueTitle =
    activeMultiValueField === 'emails'
      ? t('emailsEdit')
      : activeMultiValueField === 'allergies'
      ? t('allergiesEdit')
      : t('phonesEdit');
  const activeMultiValuePlaceholder =
    activeMultiValueField === 'emails'
      ? t('addEmail')
      : activeMultiValueField === 'allergies'
      ? t('addAllergy')
      : t('addPhone');

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

  const activeMultiValueFlags =
    activeMultiValueField === 'allergies'
      ? undefined
      : activeMultiValueField === 'emails'
      ? emailFlagsConfig
      : phoneFlagsConfig;

  const canEditMultiValueItem = React.useCallback(
    (item: MultiValueItem) => {
      if (activeChildForMultiValue && activeMultiValueField === 'allergies') {
        return canWriteChildAllergies;
      }
      if (activeEmployeeForMultiValue) {
        if (activeMultiValueField === 'allergies') {
          return canWriteEmployeeAllergies;
        }
        return canWriteEmployees;
      }
      if (activeMultiValueField === 'emails') {
        if (isFlagActive(item, 'identifier_email', false) && !hasPermission('families.all.write')) {
          return false;
        }
      }
      return true;
    },
    [activeChildForMultiValue, canWriteChildAllergies, activeEmployeeForMultiValue, canWriteEmployeeAllergies, canWriteEmployees, activeMultiValueField, hasPermission]
  );

  const canDeleteMultiValueItem = React.useCallback(
    (item: MultiValueItem) => {
      if (activeChildForMultiValue && activeMultiValueField === 'allergies') {
        return canWriteChildAllergies;
      }
      if (activeEmployeeForMultiValue) {
        if (activeMultiValueField === 'allergies') {
          return canWriteEmployeeAllergies;
        }
        return canWriteEmployees;
      }
      if (activeMultiValueField === 'emails') {
        if (isFlagActive(item, 'identifier_email', false) && !hasPermission('families.all.write')) {
          return false;
        }
      }
      return true;
    },
    [activeChildForMultiValue, canWriteChildAllergies, activeEmployeeForMultiValue, canWriteEmployeeAllergies, canWriteEmployees, activeMultiValueField, hasPermission]
  );

  const canToggleMultiValueFlag = React.useCallback(
    (item: MultiValueItem | null, flagKey: string) => {
      if (activeChildForMultiValue && activeMultiValueField === 'allergies') {
        return canWriteChildAllergies;
      }
      if (activeEmployeeForMultiValue) {
        if (activeMultiValueField === 'allergies') {
          return canWriteEmployeeAllergies;
        }
        return canWriteEmployees;
      }
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
    [activeChildForMultiValue, canWriteChildAllergies, activeEmployeeForMultiValue, canWriteEmployeeAllergies, canWriteEmployees, activeMultiValueField, hasPermission]
  );

  const getMultiValueDisabledReason = React.useCallback(
    (item: MultiValueItem | null, _action: 'edit' | 'delete' | 'toggle', flagKey?: string) => {
      if (activeChildForMultiValue && activeMultiValueField === 'allergies') {
        if (!canWriteChildAllergies) {
          return t('permissionRequired');
        }
        return undefined;
      }
      if (activeEmployeeForMultiValue) {
        if (activeMultiValueField === 'allergies') {
          if (!canWriteEmployeeAllergies) {
            return t('permissionRequired');
          }
          return undefined;
        }
        if (!canWriteEmployees) {
          return t('permissionRequired') || 'employees.all.write permission required';
        }
        return undefined;
      }
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
    [activeChildForMultiValue, canWriteChildAllergies, activeEmployeeForMultiValue, canWriteEmployeeAllergies, canWriteEmployees, activeMultiValueField, hasPermission]
  );

  const handleSaveActiveMultiValue = (newValues: (string | MultiValueEntry)[]) => {
    if (activeMultiValueField === 'allergies') {
      const cleanStrings = newValues.map((v) => getEntryValue(v).trim()).filter(Boolean);
      if (activeChildForMultiValue) {
        handleSaveChildField(activeChildForMultiValue, 'allergies', cleanStrings);
      } else if (activeEmployeeForMultiValue) {
        handleSaveEmployeeField(activeEmployeeForMultiValue, 'allergies', cleanStrings);
      }
      return;
    }
    if (activeParentForMultiValue && activeMultiValueField) {
      handleSaveParentField(activeParentForMultiValue, activeMultiValueField, newValues);
    } else if (activeEmployeeForMultiValue && activeMultiValueField) {
      handleSaveEmployeeField(activeEmployeeForMultiValue, activeMultiValueField, newValues);
    }
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
        if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
        if (fieldName !== 'vaccination_checks') {
          pushAction({
            type: 'UPDATE_PARENT',
            payload: {
              tab: 'parents',
              familyId: family.id,
              parentId: parent.id,
              beforeParents: stripParentsVaccination(originalParents),
              afterParents: stripParentsVaccination(updatedParents),
            }
          });
        }
        return fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveParentNames = (parent: Parent, firstName: string, firstNameForAddressList: string) => {
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return Promise.resolve();

    const originalParents = family.parents || [];
    const updatedParents = originalParents.map(p => 
      p.id === parent.id ? { ...p, first_name: firstName, first_name_for_address_list: firstNameForAddressList } : p
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
            beforeParents: stripParentsVaccination(originalParents),
            afterParents: stripParentsVaccination(updatedParents),
          }
        });
        if (canReadFamiliesAll) fetchFamilies();
        if (canReadMembers) fetchMembers();
        if (canReadOverview) fetchOverviewFamilies();
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
            beforeParents: stripParentsVaccination(originalParents),
            afterParents: stripParentsVaccination(updatedParents),
          }
        });
        if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
        if (fieldName !== 'vaccination_checks') {
          pushAction({
            type: 'UPDATE_CHILD',
            payload: {
              tab: 'children',
              childId: child.id,
              before: stripVaccination(child),
              after: stripVaccination(updatedChild),
            }
          });
        }
        return fetchFamilies();
      })
      .catch((err) => alert(err.message));
  };

  const handleSaveChildNames = (child: Child, firstName: string, firstNameForAddressList: string) => {
    const updatedChild = {
      ...child,
      first_name: firstName,
      first_name_for_address_list: firstNameForAddressList,
    };

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
            before: stripVaccination(child),
            after: stripVaccination(updatedChild),
          }
        });
        if (canReadFamiliesAll) fetchFamilies();
        if (canReadOverview) fetchOverviewFamilies();
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
      title: t('deleteParent'),
      message: t('deleteParentConfirm'),
      expectedName: (parent.first_name || '').trim(),
      onConfirm: () => {
        fetch(`/api/parents/${parentId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete parent');
            purgeActionsForEntity(parentId);
            if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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
      title: t('deleteChild'),
      message: t('deleteChildConfirm'),
      expectedName: (child.first_name || '').trim(),
      onConfirm: () => {
        fetch(`/api/children/${childId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to delete child');
            purgeActionsForEntity(childId);
            if (canReadFamiliesAll) fetchFamilies();
    if (canReadMembers) fetchMembers();
    if (canReadOverview) fetchOverviewFamilies();
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

function getFamilyStartDates(f: Family): string[] {
  const dates: string[] = [];
  for (const child of f.children || []) {
    const groupInfo = getChildGroupInfo(child.group_changes);
    let childStart = groupInfo.startDate ? groupInfo.startDate.split('T')[0] : null;
    if (!childStart && (child as any).start_date) {
      childStart = String((child as any).start_date).split('T')[0];
    }
    if (childStart && /^\d{4}-\d{2}-\d{2}$/.test(childStart)) {
      dates.push(childStart);
    }
  }
  dates.sort();
  return dates;
}

function sortFamilyBlocks<T extends { id: string; family_name: string; originalFamily?: Family }>(
  items: T[],
  sortOrder: FamilySortOrder,
  locale: string = CURRENT_LOCALE
): T[] {
  return [...items].sort((a, b) => {
    if (sortOrder === 'name_asc') {
      const cmp = a.family_name.localeCompare(b.family_name, locale);
      if (cmp !== 0) return cmp;
      return (a.id || '').localeCompare(b.id || '');
    }
    if (sortOrder === 'name_desc') {
      const cmp = b.family_name.localeCompare(a.family_name, locale);
      if (cmp !== 0) return cmp;
      return (a.id || '').localeCompare(b.id || '');
    }

    const aDates = a.originalFamily ? getFamilyStartDates(a.originalFamily) : [];
    const bDates = b.originalFamily ? getFamilyStartDates(b.originalFamily) : [];

    if (sortOrder === 'last_start_desc' || sortOrder === 'last_start_asc') {
      const aLast = aDates.length > 0 ? aDates[aDates.length - 1] : null;
      const bLast = bDates.length > 0 ? bDates[bDates.length - 1] : null;

      if (!aLast && !bLast) {
        return a.family_name.localeCompare(b.family_name, locale) || (a.id || '').localeCompare(b.id || '');
      }
      if (!aLast) return 1;
      if (!bLast) return -1;

      const cmp = sortOrder === 'last_start_desc' ? bLast.localeCompare(aLast) : aLast.localeCompare(bLast);
      if (cmp !== 0) return cmp;
      return a.family_name.localeCompare(b.family_name, locale) || (a.id || '').localeCompare(b.id || '');
    }

    if (sortOrder === 'first_start_asc' || sortOrder === 'first_start_desc') {
      const aFirst = aDates.length > 0 ? aDates[0] : null;
      const bFirst = bDates.length > 0 ? bDates[0] : null;

      if (!aFirst && !bFirst) {
        return a.family_name.localeCompare(b.family_name, locale) || (a.id || '').localeCompare(b.id || '');
      }
      if (!aFirst) return 1;
      if (!bFirst) return -1;

      const cmp = sortOrder === 'first_start_asc' ? aFirst.localeCompare(bFirst) : bFirst.localeCompare(aFirst);
      if (cmp !== 0) return cmp;
      return a.family_name.localeCompare(b.family_name, locale) || (a.id || '').localeCompare(b.id || '');
    }

    return 0;
  });
}

  // Structure families with their parent sub-rows for two-layer rendering
  const parentsFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const familyName = getFamilyName(f);

      const sortedParents = [...(f.parents || [])].sort((a, b) => {
        const cmp = (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
        if (cmp !== 0) return cmp;
        return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
      });

      const allParents = sortedParents.map(p => ({
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
        originalFamily: f,
      };
    });

    const sorted = sortFamilyBlocks(mapped, familySortOrder, CURRENT_LOCALE);

    if (!query) return sorted;
    return sorted.filter(f => f.nameMatch || f.parents.length > 0)
      .map(f => {
        if (f.nameMatch && f.parents.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          const origParents = [...(originalFamily?.parents || [])].sort((a, b) => {
            const cmp = (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
            if (cmp !== 0) return cmp;
            return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
          });
          return {
            ...f,
            parents: origParents.map(p => ({
              ...p,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter, familySortOrder]);

  // Structure families with their children sub-rows for two-layer rendering
  const childrenFamilyData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const familyName = getFamilyName(f);

      const sortedChildren = [...(f.children || [])].sort((a, b) => {
        const cmp = compareBirthDates(a.birth_date, b.birth_date);
        if (cmp !== 0) return cmp;
        return (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
      });

      const allChildren = sortedChildren.map(c => ({
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
        const familyLastNameMatch = (f.parents || []).some(p => (p.last_name || '').toLowerCase().includes(query));
        const allergyMatch = (c.allergies || []).some(a => String(a || '').toLowerCase().includes(query));
        const enrollmentMatch = c.school_enrollment_default
          ? String(c.school_enrollment_default).includes(query)
          : false;
        return fnMatch || lnMatch || groupMatch || startMatch || familyLastNameMatch || allergyMatch || enrollmentMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        children: filteredChildren,
        nameMatch: familyName.toLowerCase().includes(query),
        originalFamily: f,
      };
    });

    const sorted = sortFamilyBlocks(mapped, familySortOrder, CURRENT_LOCALE);

    if (!query) return sorted;
    return sorted.filter(f => f.nameMatch || f.children.length > 0)
      .map(f => {
        if (f.nameMatch && f.children.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          const origChildren = [...(originalFamily?.children || [])].sort((a, b) => {
            const cmp = compareBirthDates(a.birth_date, b.birth_date);
            if (cmp !== 0) return cmp;
            return (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
          });
          return {
            ...f,
            children: origChildren.map(c => ({
              ...c,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter, familySortOrder]);

  // Structure families with their children sub-rows for the families tab
  const familiesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map(f => {
      const familyName = getFamilyName(f);

      const sortedParents = [...(f.parents || [])].sort((a, b) => {
        const cmp = (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
        if (cmp !== 0) return cmp;
        return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
      });

      const parentNames = sortedParents
        .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const sortedChildren = [...(f.children || [])].sort((a, b) => {
        const cmp = compareBirthDates(a.birth_date, b.birth_date);
        if (cmp !== 0) return cmp;
        return (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
      });

      const allChildren = sortedChildren.map(c => ({
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
        const fcSummary = getFamiliencardSummary(c.familiencards);
        const fcMatch = fcSummary.text.toLowerCase().includes(query);
        const familyNameMatch = familyName.toLowerCase().includes(query);
        const parentMatch = parentNames.toLowerCase().includes(query);
        const notesMatch = (c.notes || '').toLowerCase().includes(query);
        const allergyMatch = (c.allergies || []).some(a => String(a || '').toLowerCase().includes(query));
        return fnMatch || lnMatch || fullName.includes(query) || bdMatch || groupMatch || fcMatch || familyNameMatch || parentMatch || notesMatch || allergyMatch;
      });

      const familyMatch = familyName.toLowerCase().includes(query) || parentNames.toLowerCase().includes(query);

      const subHeader = (sortedParents && sortedParents.length > 0) ? (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
          {sortedParents.map((p, idx) => {
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
        originalFamily: f,
      };
    });

    const sorted = sortFamilyBlocks(mapped, familySortOrder, CURRENT_LOCALE);

    if (!query) return sorted;
    return sorted.filter(f => f.nameMatch || f.children.length > 0)
      .map(f => {
        if (f.nameMatch && f.children.length === 0) {
          const originalFamily = families.find(orig => orig.id === f.id);
          const origChildren = [...(originalFamily?.children || [])].sort((a, b) => {
            const cmp = compareBirthDates(a.birth_date, b.birth_date);
            if (cmp !== 0) return cmp;
            return (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
          });
          return {
            ...f,
            children: origChildren.map(c => ({
              ...c,
              family_id: f.id,
              family_name: f.family_name,
            }))
          };
        }
        return f;
      });
  }, [families, globalFilter, familySortOrder, handleJumpToParent]);

function formatParentsSummary(parents: any[]): string {
  if (!parents || parents.length === 0) return '';
  const validParents = parents.filter((p) => p && ((p.first_name_for_address_list || p.first_name) || p.last_name));
  if (validParents.length === 0) return '';
  if (validParents.length === 1) {
    const fn = ((validParents[0].first_name_for_address_list || validParents[0].first_name) || '').trim();
    return `${fn} ${validParents[0].last_name || ''}`.trim() || 'Elternteil';
  }
  if (validParents.length === 2) {
    const p1 = validParents[0];
    const p2 = validParents[1];
    const fn1 = ((p1.first_name_for_address_list || p1.first_name) || '').trim();
    const ln1 = (p1.last_name || '').trim();
    const fn2 = ((p2.first_name_for_address_list || p2.first_name) || '').trim();
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
    .map((p) => `${((p.first_name_for_address_list || p.first_name) || '').trim()} ${p.last_name || ''}`.trim())
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
          const isChildlessFamily = bucket.key === 'none' && (!f.children || f.children.length === 0);
          if (childrenInBucket.length === 0 && !isChildlessFamily) return;

          const familyName = getFamilyName(f);
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

          const sortedBucketChildren = [...childrenInBucket].map((c) => ({
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
            const effectiveFn = ((c.first_name_for_address_list || c.first_name) || '').trim();
            const fullName = `${effectiveFn} ${c.last_name || ''}`.trim().toLowerCase();
            const fnMatch = effectiveFn.toLowerCase().includes(query) || (c.first_name || '').toLowerCase().includes(query);
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
            .sort((a, b) => {
              const fnA = ((a.first_name_for_address_list || a.first_name) || '').trim();
              const fnB = ((b.first_name_for_address_list || b.first_name) || '').trim();
              return fnA.localeCompare(fnB, CURRENT_LOCALE);
            });

          const groupFamilyKey = `${bucket.key}-${f.id}`;
          const isExplicitlyExpanded = expandedGroupParents[groupFamilyKey];
          const parentNamesMatch = query ? parentNames.toLowerCase().includes(query) : false;
          const autoExpandSearch = query ? Boolean(parentNamesMatch || parentContactMatch) : false;
          const isExpanded =
            childrenToInclude.length === 0 ||
            (isExplicitlyExpanded !== undefined ? isExplicitlyExpanded : autoExpandSearch);

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

          const toggleRow = childrenToInclude.length > 0 && sortedParents.length > 0 ? {
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
      const familyName = getFamilyName(f);

      const sortedParents = [...(f.parents || [])].sort((a, b) => {
        const fnA = ((a.first_name_for_address_list || a.first_name) || '').trim();
        const fnB = ((b.first_name_for_address_list || b.first_name) || '').trim();
        const cmp = fnA.localeCompare(fnB, CURRENT_LOCALE);
        if (cmp !== 0) return cmp;
        return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
      });

      const parentNames = sortedParents
        .map((p) => `${((p.first_name_for_address_list || p.first_name) || '').trim()} ${p.last_name || ''}`.trim())
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

      const allParents = sortedParents.map((p) => ({
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
        const effectiveFn = ((c.first_name_for_address_list || c.first_name) || '').trim();
        const fullName = `${effectiveFn} ${c.last_name || ''}`.trim().toLowerCase();
        const fnMatch = effectiveFn.toLowerCase().includes(query) || (c.first_name || '').toLowerCase().includes(query);
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

    mapped.sort((a, b) => {
      const cmp = a.family_name.localeCompare(b.family_name, CURRENT_LOCALE);
      if (cmp !== 0) return cmp;
      return (a.id || '').localeCompare(b.id || '');
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
            <FirstNameEditor
              id={`parent-${parent.id}`}
              firstName={parent.first_name}
              firstNameForAddressList={parent.first_name_for_address_list || ''}
              onSave={(fn, fnAddr) => handleSaveParentNames(parent, fn, fnAddr)}
              disabled={!canWriteParents}
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
        size: 50,
        meta: { hideOnMobile: true },
        cell: (info) => {
          const parent = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <RowActionsMenu
                onDelete={() => handleDeleteParent(parent.id)}
                deleteLabel={t('deleteParent')}
                disabled={!canWriteParents}
                disabledTooltip={!canWriteParents ? t('permissionRequired') : undefined}
                entityName={`${parent.first_name || ''} ${parent.last_name || ''}`.trim()}
              />
            </div>
          );
        }
      }
    ],
    [families, handleSaveParentField, handleSaveParentNames, handleSaveFamilyParents, handleDeleteParent, canWriteParents, isVaccinationUnlocked, handleRequestKmsAuth, hasPermission, user?.email, membershipPopoverAnchor, targetParentMemberships, openManageMemberships, multiValuePopoverAnchor, activeParentForMultiValue, activeMultiValueField, openManageMultiValue, vaccinationPopoverAnchor, targetVaccinationPerson, openManageVaccination]
  );

  const childGroupColumn = React.useMemo<ColumnDef<any>>(
    () => ({
      header: t('group'),
      id: 'group',
      size: 440,
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
            <FirstNameEditor
              id={`child-${child.id}`}
              firstName={child.first_name}
              firstNameForAddressList={child.first_name_for_address_list || ''}
              onSave={(fn, fnAddr) => handleSaveChildNames(child, fn, fnAddr)}
              disabled={!canWriteChildren}
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
        header: t('schoolEnrollmentRegular') || '🏫(regulär)',
        accessorKey: 'school_enrollment_default',
        id: 'school_enrollment_default',
        size: 110,
        minSize: 95,
        meta: {
          cardLabel: t('schoolEnrollmentRegularCardLabel') || t('schoolEnrollmentRegular') || '🏫(regulär)',
        },
        cell: (info) => {
          const child = info.row.original;
          const val = child.school_enrollment_default;
          return <span>{val !== undefined && val !== null && val !== '' ? val : '-'}</span>;
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
        header: t('familiencard'),
        id: 'familiencard',
        size: 190,
        minSize: 160,
        meta: {
          cardLabel: t('familiencard'),
        },
        cell: (info) => {
          const child = info.row.original;
          const isCurrentActive = Boolean(familiencardPopoverAnchor && targetChildFamiliencards?.id === child.id);
          return (
            <ChildFamiliencardCell
              child={child}
              isActive={isCurrentActive}
              onOpenManage={openManageFamiliencards}
              readOnly={!canWriteChildren}
            />
          );
        }
      },
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
      ...(canReadChildAllergies ? [
        {
          id: 'allergies',
          header: t('allergies'),
          accessorKey: 'allergies',
          size: 220,
          cell: (info: any) => {
            const child = info.row.original;
            const isPopActive =
              activeChildForMultiValue?.id === child.id && activeMultiValueField === 'allergies';
            return (
              <MultiValueCell
                id={child.id}
                field="allergies"
                values={child.allergies || []}
                placeholder={canWriteChildAllergies ? t('addAllergy') : t('noAllergies')}
                isActive={isPopActive}
                onOpenManage={(field, anchor) => openManageChildMultiValue(child, field, anchor)}
                canEdit={canWriteChildAllergies}
              />
            );
          }
        }
      ] : []),
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
        size: 50,
        meta: { hideOnMobile: true },
        cell: (info) => {
          const child = info.row.original;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
              <RowActionsMenu
                onDelete={() => handleDeleteChild(child.id)}
                deleteLabel={t('deleteChild')}
                disabled={!canWriteChildren}
                disabledTooltip={!canWriteChildren ? t('permissionRequired') : undefined}
                entityName={`${child.first_name || ''} ${child.last_name || ''}`.trim()}
              />
            </div>
          );
        }
      }
    ],
    [
      families,
      handleSaveChildField,
      handleSaveChildNames,
      handleDeleteChild,
      canWriteChildren,
      canReadChildAllergies,
      canWriteChildAllergies,
      activeChildForMultiValue,
      activeMultiValueField,
      openManageChildMultiValue,
      openManageGroupChanges,
      groupPopoverAnchor,
      targetChildGroupChanges,
      childGroupColumn,
      openManageFamiliencards,
      familiencardPopoverAnchor,
      targetChildFamiliencards,
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
      ...(canReadChildAllergies ? [
        {
          id: 'allergies',
          header: t('allergies'),
          accessorKey: 'allergies',
          size: 220,
          cell: (info: any) => {
            const child = info.row.original;
            const isPopActive =
              activeChildForMultiValue?.id === child.id && activeMultiValueField === 'allergies';
            return (
              <MultiValueCell
                id={`fam-${child.id}`}
                field="allergies"
                values={child.allergies || []}
                placeholder={canWriteChildAllergies ? t('addAllergy') : t('noAllergies')}
                isActive={isPopActive}
                onOpenManage={(field, anchor) => openManageChildMultiValue(child, field, anchor)}
                canEdit={canWriteChildAllergies}
              />
            );
          }
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 85,
        minSize: 85,
        cell: () => null,
      },
    ],
    [
      childGroupColumn,
      handleJumpToChild,
      handleSaveChildField,
      canReadChildAllergies,
      canWriteChildAllergies,
      activeChildForMultiValue,
      activeMultiValueField,
      openManageChildMultiValue,
    ]
  );

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
                    aria-label={t('jumpToChild')}
                  >
                    <MgaLinkIcon />
                  </button>
                )}
              </span>
            );
          }
          const fullName = `${effectiveFn} ${item.last_name || ''}`.trim() || '-';
          const membershipStatus = item.memberships ? getMembershipStatus(item.memberships) : null;
          return (
            <span className="overview-person-name" style={isIndented ? { paddingLeft: '1.25rem', display: 'inline-block' } : undefined}>
              {fullName}
              {membershipStatus && membershipStatus.text && (
                <span
                  className="overview-membership-badge"
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-subtle)',
                    color: membershipStatus.color,
                    fontWeight: (membershipStatus as any).fontWeight || 'normal',
                    cursor: (canReadOwnMemberships || canReadMembers) ? 'pointer' : 'default',
                  }}
                  onClick={(e) => {
                    if (canReadOwnMemberships || canReadMembers) {
                      e.stopPropagation();
                      openManageMemberships(item, e.currentTarget);
                    }
                  }}
                  title={t('th_membership')}
                >
                  {membershipStatus.text}
                </span>
              )}
              {canReadFamiliesAll && (
                <button
                  type="button"
                  className="family-parent-link overview-mga-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToParent(item.original_id || item.id, item.family_id, item.family_name || '', 'familiesOverview');
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
          getColSpan: (row: any) => (row._rowType === 'child' ? 3 : 1),
        },
        cell: (info) => {
          const item = info.row.original;
          if (item._rowType === 'parent') {
            const phones = (item.phones || [])
              .filter((ph: any) => isFlagActive(ph, 'address_list', true));
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                {phones.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                ) : (
                  <span style={{ whiteSpace: 'pre-line', minWidth: 0 }}>
                    {phones.map((phoneEntry: any, idx: number) => {
                      const phoneVal = getEntryValue(phoneEntry).trim();
                      const phoneType = (typeof phoneEntry === 'object' && phoneEntry !== null && phoneEntry.type) ? phoneEntry.type : 'mobile';
                      const symbol = getPhoneTypeSymbol(phoneType);
                      return (
                        <React.Fragment key={idx}>
                          {idx > 0 && '\n'}
                          <span
                            className="phone-type-symbol"
                            title={getPhoneTypeLabel(phoneType)}
                            style={{ marginRight: '4px', userSelect: 'none' }}
                          >
                            {symbol}
                          </span>
                          <a
                            href={formatTelHref(phoneVal)}
                            className="overview-contact-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {phoneVal}
                          </a>
                        </React.Fragment>
                      );
                    })}
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.25rem',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                @
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
    [canReadFamiliesAll, canReadOwnMemberships, canReadMembers, handleJumpToChild, handleJumpToParent, openManageMemberships]
  );

  const memberColumns = React.useMemo<ColumnDef<MemberRow>[]>(
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
                    handleJumpToParent(row.id, row.family_id, row.family_name || '', 'members');
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
                openManageMemberships(row as any, e.currentTarget);
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
              <Pencil size={13} className="cell-edit-pencil-btn" style={{ marginLeft: 'auto', opacity: 0.7 }} />
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
                openManageMemberships(row as any, e.currentTarget);
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
              <Pencil size={13} className="cell-edit-pencil-btn" style={{ marginLeft: 'auto', opacity: 0.7 }} />
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
                openManageMemberships(row as any, e.currentTarget);
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
              <Pencil size={13} className="cell-edit-pencil-btn" style={{ marginLeft: 'auto', opacity: 0.7 }} />
            </div>
          );
        },
      },
    ],
    [canReadFamiliesAll, openManageMemberships]
  );

  const filteredMembers = React.useMemo(() => {
    if (!globalFilter.trim()) return members;
    const q = globalFilter.toLowerCase();
    return members.filter((m) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      const typeLabel = m.membership_type === 'full_member' ? t('full_member').toLowerCase() : t('supporting_member').toLowerCase();
      const firstDate = m.first_became_member_date ? formatDisplayDate(m.first_became_member_date).toLowerCase() : '';
      const changeDate = m.last_type_change_date ? formatDisplayDate(m.last_type_change_date).toLowerCase() : '';
      return name.includes(q) || typeLabel.includes(q) || firstDate.includes(q) || changeDate.includes(q);
    });
  }, [members, globalFilter]);

      const filteredEmployees = React.useMemo(() => {
    if (!globalFilter.trim()) return employees;
    const q = globalFilter.toLowerCase();
    return employees.filter((emp) => {
      const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
      const type = (emp.employee_type || '').toLowerCase();
      const addr = (emp.address || '').toLowerCase();
      const emails = (emp.emails || []).map((e) => getEntryValue(e).toLowerCase()).join(' ');
      const phones = (emp.phones || []).map((p) => getEntryValue(p).toLowerCase()).join(' ');
      const allergies = (emp.allergies || []).map((a) => String(a || '').toLowerCase()).join(' ');
      return (
        name.includes(q) ||
        type.includes(q) ||
        addr.includes(q) ||
        emails.includes(q) ||
        phones.includes(q) ||
        allergies.includes(q)
      );
    });
  }, [employees, globalFilter]);

  const handleSaveEmployeeField = React.useCallback(
    async (employee: Employee, field: keyof Employee, value: any) => {
      const originalEmployee = { ...employee };
      const updated: any = { ...employee, [field]: value };
      if (field === 'is_kinderschutzbeauftragter') {
        updated.is_child_protection_officer = value;
      }
      if (field === 'employee_type') {
        updated.type = value;
        if (value !== 'caregiver') {
          updated.is_kinderschutzbeauftragter = false;
          updated.is_child_protection_officer = false;
        }
      }
      try {
        const res = await fetch(`/api/employees/${employee.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(updated),
        });
        if (res.ok) {
          const saved = await res.json();
          setEmployees((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
          pushAction({
            type: 'UPDATE_EMPLOYEE',
            payload: {
              tab: 'employees',
              employeeId: employee.id,
              before: originalEmployee,
              after: saved,
            },
          });
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(errData.error || 'Failed to update employee');
        }
      } catch (err) {
        console.error('Failed to update employee field:', err);
      }
    },
    [getAuthHeaders]
  );

  const handleDeleteEmployee = React.useCallback(
    (employee: Employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.trim();
      setConfirmDelete({
        isOpen: true,
        title: t('deleteEmployee') || 'Mitarbeiter löschen',
        message: t('employeeDeleteConfirm') || 'Möchten Sie den Mitarbeiter wirklich löschen?',
        expectedName: fullName,
        onConfirm: async () => {
          try {
            const res = await fetch(`/api/employees/${employee.id}`, {
              method: 'DELETE',
              credentials: 'include',
              headers: getAuthHeaders(),
            });
            if (res.ok || res.status === 204) {
              setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
              purgeActionsForEntity(employee.id);
            } else {
              const errData = await res.json().catch(() => ({}));
              alert(errData.error || 'Failed to delete employee');
            }
          } catch (err) {
            console.error('Failed to delete employee:', err);
          } finally {
            setConfirmDelete((prev) => ({ ...prev, isOpen: false }));
          }
        },
      });
    },
    [getAuthHeaders]
  );

  const handleCreateEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empFirstName.trim() || !empLastName.trim()) {
      alert('Given name and surname are required');
      return;
    }
    const payload: Partial<Employee> = {
      first_name: empFirstName.trim(),
      last_name: empLastName.trim(),
      employee_type: empType,
      address: '',
      is_kinderschutzbeauftragter: false,
      emails: [],
      phones: [],
    };
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setEmployees((prev) => [...prev, created]);
        setAddEmployeeOpen(false);
        setEmpFirstName('');
        setEmpLastName('');
        setEmpType('caregiver');
        pushAction({
          type: 'ADD_EMPLOYEE',
          payload: {
            tab: 'employees',
            employeeId: created.id,
            employee: created,
          },
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to create employee');
      }
    } catch (err) {
      console.error('Failed to create employee:', err);
    }
  };

  const employeeColumns = React.useMemo<ColumnDef<Employee>[]>(
    () => [
      {
        header: t('givenName') || 'Vorname',
        accessorKey: 'first_name',
        size: 180,
        cell: (info) => {
          const emp = info.row.original;
          if (!canWriteEmployees) {
            return <span>{emp.first_name}</span>;
          }
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={emp.first_name}
              onSave={(val: string) => handleSaveEmployeeField(emp, 'first_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editFirstName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        },
      },
      {
        header: t('surname') || 'Nachname',
        accessorKey: 'last_name',
        size: 180,
        cell: (info) => {
          const emp = info.row.original;
          if (!canWriteEmployees) {
            return <span>{emp.last_name}</span>;
          }
          return (
            <EasyEditComponent
              type={EasyEditTypes.TEXT}
              value={emp.last_name}
              onSave={(val: string) => handleSaveEmployeeField(emp, 'last_name', val)}
              editButtonLabel={<Pencil size={13} />}
              instructions={t('editLastName')}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        },
      },
      {
        header: t('employeeType') || 'Mitarbeiter-Typ',
        accessorKey: 'employee_type',
        size: 180,
        cell: (info) => {
          const emp = info.row.original;
          const options = [
            { label: t('employeeTypeCaregiver') || 'Erzieher(in)', value: 'caregiver' },
            { label: t('employeeTypeCook') || 'Koch/Köchin', value: 'cook' },
            { label: t('employeeTypeBufdi') || 'Bufdi', value: 'bufdi' },
          ];
          const displayLabel =
            emp.employee_type === 'caregiver'
              ? t('employeeTypeCaregiver') || 'Erzieher(in)'
              : emp.employee_type === 'cook'
              ? t('employeeTypeCook') || 'Koch/Köchin'
              : emp.employee_type === 'bufdi'
              ? t('employeeTypeBufdi') || 'Bufdi'
              : emp.employee_type || '-';

          if (!canWriteEmployees) {
            return <span>{displayLabel}</span>;
          }

          return (
            <EasyEditComponent
              type={EasyEditTypes.SELECT}
              options={options}
              value={emp.employee_type}
              onSave={(val: string) => handleSaveEmployeeField(emp, 'employee_type', val)}
              editButtonLabel={<Pencil size={13} />}
              displayComponent={<span>{displayLabel}</span>}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        },
      },
      {
        header: t('emails') || 'E-mail',
        accessorKey: 'emails',
        size: 260,
        cell: (info) => {
          const emp = info.row.original;
          const isPopActive =
            activeEmployeeForMultiValue?.id === emp.id && activeMultiValueField === 'emails';
          return (
            <MultiValueCell
              id={emp.id}
              field="emails"
              values={emp.emails || []}
              placeholder={t('addEmail')}
              isActive={isPopActive}
              onOpenManage={(field, anchor) => openManageEmployeeMultiValue(emp, field, anchor)}
              canEdit={canWriteEmployees}
            />
          );
        },
      },
      {
        header: t('phones') || 'Telefon',
        accessorKey: 'phones',
        size: 200,
        cell: (info) => {
          const emp = info.row.original;
          const isPopActive =
            activeEmployeeForMultiValue?.id === emp.id && activeMultiValueField === 'phones';
          return (
            <MultiValueCell
              id={emp.id}
              field="phones"
              values={emp.phones || []}
              placeholder={t('addPhone')}
              isActive={isPopActive}
              onOpenManage={(field, anchor) => openManageEmployeeMultiValue(emp, field, anchor)}
              canEdit={canWriteEmployees}
            />
          );
        },
      },
      {
        header: t('address') || 'Adresse',
        accessorKey: 'address',
        size: 250,
        cell: (info) => {
          const emp = info.row.original;
          return (
            <AddressEditor
              parent={emp}
              familyParents={[emp]}
              canEdit={canWriteEmployees}
              onSave={([updatedEmp]) =>
                handleSaveEmployeeField(emp, 'address', updatedEmp.address || '')
              }
            />
          );
        },
      },
      {
        header: t('kinderschutzbeauftragter') || 'Kinderschutzbeauftragte(r)',
        accessorKey: 'is_kinderschutzbeauftragter',
        size: 180,
        cell: (info) => {
          const emp = info.row.original;
          if (emp.employee_type !== 'caregiver') {
            return null;
          }
          const isOfficer = Boolean(emp.is_kinderschutzbeauftragter);
          const displayLabel = isOfficer ? (t('kinderschutzbeauftragterYes') || 'Ja') : '-';

          if (!canWriteEmployees) {
            return <span>{displayLabel}</span>;
          }

          const options = [
            { label: t('kinderschutzbeauftragterYes') || 'Ja', value: 'yes' },
            { label: t('kinderschutzbeauftragterNo') || 'Nein', value: 'no' },
          ];

          return (
            <EasyEditComponent
              type={EasyEditTypes.SELECT}
              options={options}
              value={isOfficer ? 'yes' : 'no'}
              onSave={(val: string) =>
                handleSaveEmployeeField(
                  emp,
                  'is_kinderschutzbeauftragter',
                  val === 'yes'
                )
              }
              editButtonLabel={<Pencil size={13} />}
              displayComponent={<span>{displayLabel}</span>}
              instructions={t('kinderschutzbeauftragter') || 'Kinderschutzbeauftragte(r)'}
              viewAttributes={{}}
              inputAttributes={{}}
              onCancel={() => {}}
              onValidate={() => true}
            />
          );
        },
      },
      ...(canReadEmployeeAllergies ? [
        {
          id: 'allergies',
          header: t('allergies') || 'Allergien',
          accessorKey: 'allergies',
          size: 220,
          cell: (info: any) => {
            const emp = info.row.original;
            const isPopActive =
              activeEmployeeForMultiValue?.id === emp.id && activeMultiValueField === 'allergies';
            return (
              <MultiValueCell
                id={emp.id}
                field="allergies"
                values={emp.allergies || []}
                placeholder={canWriteEmployeeAllergies ? t('addAllergy') : t('noAllergies')}
                isActive={isPopActive}
                onOpenManage={(field, anchor) => openManageEmployeeMultiValue(emp, field, anchor)}
                canEdit={canWriteEmployeeAllergies}
              />
            );
          },
        }
      ] : []),
      {
        id: 'actions',
        header: '',
        size: 50,
        meta: { hideOnMobile: true },
        cell: (info) => {
          const emp = info.row.original;
          const fullName = `${emp.first_name} ${emp.last_name}`.trim();
          return (
            <RowActionsMenu
              onDelete={() => handleDeleteEmployee(emp)}
              deleteLabel={t('deleteEmployee') || 'Mitarbeiter löschen'}
              disabled={!canWriteEmployees}
              disabledTooltip={!canWriteEmployees ? t('permissionRequired') : undefined}
              entityName={fullName}
            />
          );
        },
      },
    ],
    [
      canWriteEmployees,
      canReadEmployeeAllergies,
      canWriteEmployeeAllergies,
      activeEmployeeForMultiValue,
      activeMultiValueField,
      openManageEmployeeMultiValue,
      handleSaveEmployeeField,
      handleDeleteEmployee,
    ]
  );

  const isTableTab = activeTab === 'familiesOverview' || activeTab === 'parents' || activeTab === 'children' || activeTab === 'families' || activeTab === 'hygieneBelehrung' || activeTab === 'members' || activeTab === 'employees';

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

        {user?.simulation?.active && (
          <div className="simulation-header-banner" data-testid="simulation-banner">
            <div className="simulation-banner-info">
              <Eye size={16} className="simulation-icon" />
              <span className="simulation-label">{t('simulationActive')}:</span>
              {user.simulation.mode === 'user' && user.simulation.simulated_user && (
                <span
                  className="simulation-target"
                  data-testid="simulation-target"
                  title={user.simulation.simulated_user}
                >
                  {user.simulation.simulated_user}
                </span>
              )}
              <button
                type="button"
                className="simulation-roles-btn"
                data-testid="view-simulated-roles-btn"
                onClick={() => setViewRolesModalOpen(true)}
                title={t('simulatedRolesAndPermissionsTitle')}
              >
                {t('viewSimulatedRolesAndPermissions')}
              </button>
            </div>
            <div className="simulation-banner-actions">
              <button
                type="button"
                className="simulation-leave-button"
                data-testid="leave-simulation-button"
                onClick={leaveSimulation}
                title={t('leaveSimulation')}
              >
                {t('leaveSimulation')}
              </button>
            </div>
          </div>
        )}

        <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span title={user?.email}>{user?.email}</span>
          <HeaderOverflowMenu
            canSimulate={canSimulate}
            onOpenSimulator={() => setSimulatorModalOpen(true)}
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
            {canReadMembers && (
              <button 
                type="button"
                onClick={() => handleTabClick('members')}
                className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
                data-active={activeTab === 'members'}
              >
                {t('members')}
              </button>
            )}
            {canReadEmployees && (
              <button 
                type="button"
                onClick={() => handleTabClick('employees')}
                className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
                data-active={activeTab === 'employees'}
              >
                {t('employees')}
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
            {canViewMealPlan && (
              <button 
                onClick={() => handleTabClick('mealPlan')}
                className={`tab-btn ${activeTab === 'mealPlan' ? 'active' : ''}`}
                data-active={activeTab === 'mealPlan'}
              >
                {t('mealPlan')}
              </button>
            )}
            {canReadMealAllergens && (
              <button 
                onClick={() => handleTabClick('mealAllergens')}
                className={`tab-btn ${activeTab === 'mealAllergens' ? 'active' : ''}`}
                data-active={activeTab === 'mealAllergens'}
              >
                {t('mealAllergens')}
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

        {activeTab !== 'childcareFees' && activeTab !== 'audit' && activeTab !== 'admin' && activeTab !== 'kiosk' && activeTab !== 'dashboard' && activeTab !== 'mealPlan' && activeTab !== 'mealAllergens' && (
          <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="controls-left" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="search-input"
                placeholder={
                  activeTab === 'employees'
                    ? (t('searchEmployees') || 'Mitarbeiter suchen...')
                    : activeTab === 'members'
                    ? t('searchMembers')
                    : activeTab === 'families' || activeTab === 'familiesOverview'
                    ? t('searchFamilies')
                    : activeTab === 'children'
                    ? t('searchChildren')
                    : t('searchParents')
                }
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
                    color: 'var(--primary-contrast, #ffffff)',
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

              {activeTab === 'employees' && canWriteEmployees && (
                <button
                  type="button"
                  onClick={() => setAddEmployeeOpen(true)}
                  className="primary-button add-employee-button"
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
                    color: 'var(--primary-contrast, #ffffff)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    height: '34px',
                    boxSizing: 'border-box',
                    fontSize: '0.85rem',
                  }}
                >
                  <Plus size={14} />
                  <span>{t('addEmployee') || 'Mitarbeiter/-in hinzufügen'}</span>
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
                      color: overviewGroupBy === 'family' ? 'var(--primary-contrast, #ffffff)' : 'var(--text)',
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
                      color: overviewGroupBy === 'group' ? 'var(--primary-contrast, #ffffff)' : 'var(--text)',
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
                  title="Undo"
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
                  title="Redo"
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

              {(activeTab === 'parents' || activeTab === 'children' || activeTab === 'families') && (
                <>
                  <button
                    ref={sortButtonRef}
                    type="button"
                    onClick={() => setSortPopoverOpen((prev) => !prev)}
                    className="secondary-button family-sort-button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      height: '34px',
                      boxSizing: 'border-box',
                      fontSize: '0.85rem',
                    }}
                    title={t('sortFamiliesTitle')}
                  >
                    <ArrowUpDown size={14} />
                    <span>{t('sort')}: {getSortOptionLabel(familySortOrder)}</span>
                  </button>

                  <CellPopover
                    isOpen={sortPopoverOpen}
                    onClose={() => setSortPopoverOpen(false)}
                    anchorEl={sortButtonRef}
                    width={320}
                    minWidth={280}
                  >
                    <div
                      style={{
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid var(--border)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      {t('sortFamiliesHeader')}
                    </div>
                    {sortOptionGroups.map((group, gIdx) => (
                      <div key={group.groupLabelKey} style={{ marginTop: gIdx === 0 ? 0 : '0.5rem', marginBottom: '0.25rem' }}>
                        <div
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t(group.groupLabelKey as any)}
                        </div>
                        {group.options.map((opt) => {
                          const isSelected = familySortOrder === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              className="family-sort-option-btn"
                              data-sort-order={opt.key}
                              onClick={() => {
                                handleSetFamilySortOrder(opt.key);
                                setSortPopoverOpen(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                textAlign: 'left',
                                gap: '0.5rem',
                                padding: '0.4rem 0.6rem',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                border: 'none',
                                background: isSelected ? 'var(--primary-subtle, rgba(0, 100, 200, 0.08))' : 'transparent',
                                color: isSelected ? 'var(--primary)' : 'var(--text)',
                                fontWeight: isSelected ? 600 : 400,
                                transition: 'background-color 0.15s',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isSelected && <Check size={14} color="var(--primary)" />}
                              </div>
                              <span>{t(opt.labelKey as any)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </CellPopover>
                </>
              )}
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
            stickyFirstColumn
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
            stickyFirstColumn
            enableSorting={false}
            getCardHeader={(parent: any) => `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || '-'}
            getCardActions={(parent: any) => (
              <RowActionsMenu
                onDelete={() => handleDeleteParent(parent.id)}
                deleteLabel={t('deleteParent')}
                disabled={!canWriteParents}
                disabledTooltip={!canWriteParents ? t('permissionRequired') : undefined}
                entityName={`${parent.first_name || ''} ${parent.last_name || ''}`.trim()}
              />
            )}
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
            stickyFirstColumn
            enableSorting={false}
            getCardHeader={(child: any) => `${child.first_name || ''} ${child.last_name || ''}`.trim() || '-'}
            getCardActions={(child: any) => (
              <RowActionsMenu
                onDelete={() => handleDeleteChild(child.id)}
                deleteLabel={t('deleteChild')}
                disabled={!canWriteChildren}
                disabledTooltip={!canWriteChildren ? t('permissionRequired') : undefined}
                entityName={`${child.first_name || ''} ${child.last_name || ''}`.trim()}
              />
            )}
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
            enableSorting={false}
          />
        ) : activeTab === 'hygieneBelehrung' ? (
          <DataTable
            data={parentsFamilyData}
            columns={hygieneColumns}
            getSubRows={(row: any) => row.parents}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'members' && canReadMembers ? (
          <DataTable
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
                        handleJumpToParent(member.id, member.family_id, member.family_name || '', 'members');
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
        ) : activeTab === 'employees' && canReadEmployees ? (
          <DataTable
            className="card-table employees-table"
            data={filteredEmployees}
            columns={employeeColumns}
            emptySubRowsText={t('noEmployeesYet') || 'Keine Mitarbeiter vorhanden'}
            highlightedRowId={highlightedRowId}
            getCardHeader={(emp: any) => {
              const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || '-';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{fullName}</span>
                  {emp.employee_type === 'caregiver' && emp.is_kinderschutzbeauftragter && (
                    <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', fontWeight: 600 }}>
                      🛡️ {t('kinderschutzbeauftragterShort') || 'Kinderschutz'}
                    </span>
                  )}
                </div>
              );
            }}
            getCardActions={(emp: any) => {
              const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
              return (
                <RowActionsMenu
                  onDelete={() => handleDeleteEmployee(emp)}
                  deleteLabel={t('deleteEmployee') || 'Mitarbeiter löschen'}
                  disabled={!canWriteEmployees}
                  disabledTooltip={!canWriteEmployees ? t('permissionRequired') : undefined}
                  entityName={fullName}
                />
              );
            }}
          />
        ) : activeTab === 'audit' && canReadAudit ? (
          <AuditLogView
            families={families.length > 0 ? families : (overviewFamilies as any)}
            getAuthHeaders={getAuthHeaders}
            refreshTrigger={auditRefreshTrigger}
          />
        ) : activeTab === 'admin' && canManageUsers ? (
          <AdminView onOpenSimulator={() => setSimulatorModalOpen(true)} />
        ) : activeTab === 'kiosk' && canProvisionKiosk ? (
          <KioskProvisioning token={token} />
        ) : activeTab === 'mealPlan' && canViewMealPlan ? (
          <MealPlanTab />
        ) : activeTab === 'mealAllergens' && canReadMealAllergens ? (
          <MealAllergensTab />
        ) : activeTab === 'dashboard' ? (
          <KioskDashboard embedded={true} />
        ) : (
          <ChildcareFeesCalculator
            token={token}
            families={families.length > 0 ? families : (overviewFamilies as any)}
          />
        )}
      </main>

      <ImpressumFooter />

      {/* Add Employee Modal */}
      {addEmployeeOpen && (
        <div className="modal-overlay" onClick={() => setAddEmployeeOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>{t('addEmployee') || 'Mitarbeiter/-in hinzufügen'}</h2>
            <form onSubmit={handleCreateEmployeeSubmit}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="emp-first-name">{t('givenName') || 'Vorname'}</label>
                  <input
                    id="emp-first-name"
                    name="firstName"
                    type="text"
                    value={empFirstName}
                    onChange={(e) => setEmpFirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-form-group" style={{ flex: 1 }}>
                  <label htmlFor="emp-last-name">{t('surname') || 'Nachname'}</label>
                  <input
                    id="emp-last-name"
                    name="lastName"
                    type="text"
                    value={empLastName}
                    onChange={(e) => setEmpLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-form-group">
                <label htmlFor="emp-type">{t('employeeType') || 'Mitarbeiter-Typ'}</label>
                <select
                  id="emp-type"
                  name="employeeType"
                  value={empType}
                  onChange={(e) => setEmpType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                  }}
                  required
                >
                  <option value="caregiver">{t('employeeTypeCaregiver') || 'Erzieher(in)'}</option>
                  <option value="cook">{t('employeeTypeCook') || 'Koch/Köchin'}</option>
                  <option value="bufdi">{t('employeeTypeBufdi') || 'Bufdi'}</option>
                </select>
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setAddEmployeeOpen(false)}
                  className="secondary-button"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                >
                  {t('addEmployee') || 'Mitarbeiter/-in hinzufügen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                        } catch {
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
      <ConfirmDeleteModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.title}
        message={confirmDelete.message}
        expectedName={confirmDelete.expectedName}
        onConfirm={confirmDelete.onConfirm}
        onClose={() => setConfirmDelete(prev => ({ ...prev, isOpen: false }))}
      />

        {/* Manage Memberships Popover */}
        <MembershipsModal
          key={activeParentForMemberships?.id || 'memberships-modal'}
          isOpen={Boolean(membershipPopoverAnchor && activeParentForMemberships)}
          anchorEl={membershipPopoverAnchor}
          onClose={closeManageMemberships}
          parent={activeParentForMemberships}
          family={activeFamilyForMemberships}
          readOnly={!canWriteMemberships}
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

        {/* Manage Familiencards Popover */}
        <FamiliencardsPopover
          key={activeChildForFamiliencards?.id || 'familiencard-popover'}
          isOpen={Boolean(familiencardPopoverAnchor && activeChildForFamiliencards)}
          anchorEl={familiencardPopoverAnchor}
          onClose={closeManageFamiliencards}
          child={activeChildForFamiliencards}
          onSaveFamiliencards={handleSaveFamiliencards}
          readOnly={!canWriteChildren}
        />

        {/* Manage Multi-Values (Emails / Phones / Allergies) Popover */}
        <MultiValueListEditor
          key={`${(activeParentForMultiValue || activeChildForMultiValue || activeEmployeeForMultiValue)?.id || 'unknown'}-${activeMultiValueField || 'field'}`}
          isOpen={Boolean(multiValuePopoverAnchor && (activeParentForMultiValue || activeChildForMultiValue || activeEmployeeForMultiValue) && activeMultiValueField)}
          anchorEl={multiValuePopoverAnchor}
          onClose={closeManageMultiValue}
          values={activeMultiValueValues}
          flags={activeMultiValueFlags}
          types={activeMultiValueField === 'phones' ? PHONE_TYPES : undefined}
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

        {/* Permissions Simulator Modal */}
        <PermissionsSimulatorModal
          isOpen={simulatorModalOpen}
          onClose={() => setSimulatorModalOpen(false)}
        />

        {/* Simulated Roles & Permissions Dialog */}
        <SimulatedRolesPermissionsModal
          isOpen={viewRolesModalOpen}
          onClose={() => setViewRolesModalOpen(false)}
          simulation={user?.simulation}
          effectivePermissions={user?.effective_permissions}
        />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading, hasPermission } = useAuth();
  const [currentHash, setCurrentHash] = React.useState(() => window.location.hash);
  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');
  const faviconUrl = appConfig.faviconUrl;

  React.useEffect(() => {
    const handleHash = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

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

  // Standalone print view for meal plan (opened in a new tab)
  const rawHash = currentHash.replace('#', '');
  if (rawHash.startsWith('mealPlanPrint')) {
    if (!hasPermission('mealplan.view')) {
      return <Dashboard />;
    }
    return <MealPlanPrintView />;
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
