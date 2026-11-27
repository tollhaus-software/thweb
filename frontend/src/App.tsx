import React from 'react';
import { AuthProvider, useAuth, isKioskMode } from './context/AuthContext';
import { LoginButton } from './components/Auth/LoginButton';
import { ReauthModal } from './components/Auth/ReauthModal';
import './App.css';

import { DataTable } from './components/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Undo, Redo, Calendar, Lock, Unlock, ArrowLeft, X, AlertCircle, ChevronLeft, ChevronRight, Plus, ArrowUpDown, Check, Eye, RefreshCw, Menu, Filter, Printer, Users } from 'lucide-react';
import { GroupOverviewPrintModal } from './components/Print/GroupOverviewPrintModal';
import { useGoogleLogin } from '@react-oauth/google';
import { MultiValueListEditor, type MultiValueFlagConfig, type MultiValueEntry, type MultiValueItem, getEntryValue, isFlagActive, PHONE_TYPES, getPhoneTypeSymbol, getPhoneTypeLabel } from './components/Table/MultiValueListEditor';
import { AllergiesListEditor } from './components/Allergies/AllergiesListEditor';
import { isLebensmittelAllergen, isDietPreference } from './utils/mealAllergens';
import { FamilyNotesEditor, type NotesTarget } from './components/Table/FamilyNotesEditor';
import { GroupChangesPopover } from './components/Table/GroupChangesPopover';
import { FamiliencardsPopover } from './components/Table/FamiliencardsPopover';
import { MembershipsModal } from './components/Table/MembershipsModal';
import { VaccinationStatusPopover, type VaccinationCheck } from './components/Table/VaccinationStatusEditor';
import { HygieneEventsPopover, HygieneCell, type ParentWithHygiene } from './components/Table/HygieneEventsPopover';
import { ChildcareFeesCalculator } from './components/ChildcareFeesCalculator';
import { KioskDashboard } from './components/Dashboard/KioskDashboard';
import { DashboardTodosAdminTab } from './components/Dashboard/DashboardTodosAdminTab';
import { MainPage } from './components/MainPage/MainPage';
import { PwaInstallModal } from './components/MainPage/PwaInstallCard';
import { usePwaInstallState } from './utils/pwaInstall';
import { isExperimentActive } from './utils/experiments';
import { MealPlanTab } from './components/MealPlan/MealPlanTab';
import { MealPlanPrintView } from './components/MealPlan/MealPlanPrintView';
import { MealAllergensTab } from './components/MealAllergens/MealAllergensTab';
import { EventsTab } from './components/Events/EventsTab';
import { EventsImportTab } from './components/Events/EventsImportTab';
import { getCalendarEventDisplayTitle } from './utils/calendarEvents';
import { PersonalHygieneTab } from './components/Hygiene/PersonalHygieneTab';
import { HygieneDocumentTab } from './components/Hygiene/HygieneDocumentTab';
import { VolunteerAbsencesTab } from './components/VolunteerAbsences/VolunteerAbsencesTab';
import { KioskProvisioning } from './components/Admin/KioskProvisioning';
import { FeedbackAndActivityView } from './components/Admin/FeedbackAndActivityView';
import { PermissionsSimulatorModal } from './components/Admin/PermissionsSimulatorModal';
import { SimulatedRolesPermissionsModal } from './components/Admin/SimulatedRolesPermissionsModal';
import { ParentContactSelfServiceModal } from './components/Families/ParentContactSelfServiceModal';
import { FeedbackModal, type FeedbackType } from './components/Dashboard/FeedbackModal';
import { getAppConfig } from './config/appConfig';
import { HeaderOverflowMenu } from './components/Header/HeaderOverflowMenu';
import { Sidebar } from './components/Navigation/Sidebar';
import {
  getCategoryForTab,
  getCategoryConfig,
  categoryHasLandingPage,
  getCategoryLabel,
  getSubItemLabel,
  getFirstPermittedTabForCategory,
  type NavigationCategory,
  type UserPermissionsContext,
} from './utils/navigation';
import { SegmentedSubNav } from './components/Navigation/SegmentedSubNav';
import { CategoryLandingPage } from './components/Navigation/CategoryLandingPage';
import { CellPopover } from './components/Table/CellPopover';
import { ConfirmDeleteModal } from './components/Table/ConfirmDeleteModal';
import { JobsPopover, type PersonWithJobs } from './components/Table/JobsPopover';
import { JobsTab, type JobWithAssignees } from './components/Jobs/JobsTab';
import { EmployeesTab, type Employee } from './components/Employees/EmployeesTab';
import { MembersTab, type MemberRow } from './components/Members/MembersTab';
import { ChildrenTab } from './components/Children/ChildrenTab';
import { ParentsTab } from './components/Parents/ParentsTab';
import { FamiliesTab } from './components/Families/FamiliesTab';
import { FamiliesOverviewTab } from './components/Families/FamiliesOverviewTab';
import {
  type Family,
  type Parent,
  type Child,
  type OverviewParent,
  type OverviewFamily,
  type FamilySortOrder,
  sortOptionGroups,
  getSortOptionLabel,
} from './types/family';
import {
  getChildGroupInfo,
  getOverviewChildGroupStatus,
} from './utils/childGroup';
import { TableZoomControl } from './components/Table/TableZoomControl';
import type { Role } from './components/Jobs/JobRolesPopover';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate, formatTollhausEmail, compareBirthDates } from './utils/i18n';
import {
  getFamilyName,
  getMentorsDisplay,
  getMentoredFamiliesForFamily,
  getMentoredFamiliesForParent,
  isFamilyFormer,
  getFamiliencardSummary,
} from './utils/family';
import { MentorPopover } from './components/Table/MentorPopover';
import { ContactConsentPopover } from './components/Table/ContactConsentPopover';

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

const diffJobSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];

  if ((before.name || '') !== (after.name || '')) {
    changes.push(`${t('jobName') || 'Job-Name'}: "${before.name || ''}" → "${after.name || ''}"`);
  }

  if ((before.description || '') !== (after.description || '')) {
    changes.push(`${t('jobDescription') || 'Beschreibung'}: "${before.description || ''}" → "${after.description || ''}"`);
  }

  if ((before.contact_email || '') !== (after.contact_email || '')) {
    changes.push(`${t('jobContactEmail') || 'Kontakt-E-Mail'}: "${before.contact_email || ''}" → "${after.contact_email || ''}"`);
  }

  const beforeSoll = before.soll_persons !== undefined && before.soll_persons !== null ? before.soll_persons : 0;
  const afterSoll = after.soll_persons !== undefined && after.soll_persons !== null ? after.soll_persons : 0;
  if (beforeSoll !== afterSoll) {
    changes.push(`${t('sollPersons') || 'Soll Personen'}: ${beforeSoll} → ${afterSoll}`);
  }

  const beforeRoles = (before.roles || []).slice().sort().join(', ');
  const afterRoles = (after.roles || []).slice().sort().join(', ');
  if (beforeRoles !== afterRoles) {
    changes.push(`${t('grantedRoles') || 'Gewährte Rollen'}: "[${beforeRoles}]" → "[${afterRoles}]"`);
  }

  return changes;
};

const diffVolunteerAbsenceSnapshots = (before: any, after: any): string[] => {
  const changes: string[] = [];
  const getTypeLabel = (val: string) => (val === 'bufdi' ? 'BuFDI' : (val || '-'));

  if (before.type !== after.type) {
    changes.push(`${t('absenceType') || 'Typ'}: ${getTypeLabel(before.type)} → ${getTypeLabel(after.type)}`);
  }

  if (formatDisplayDate(before.start_date) !== formatDisplayDate(after.start_date)) {
    changes.push(`${t('startDateLabel') || 'Startdatum'}: ${formatDisplayDate(before.start_date)} → ${formatDisplayDate(after.start_date)}`);
  }

  const bEnd = before.end_date ? formatDisplayDate(before.end_date) : '-';
  const aEnd = after.end_date ? formatDisplayDate(after.end_date) : '-';
  if (bEnd !== aEnd) {
    changes.push(`${t('endDateLabel') || 'Enddatum'}: ${bEnd} → ${aEnd}`);
  }

  const bNote = before.note || '';
  const aNote = after.note || '';
  if (bNote !== aNote) {
    changes.push(`${t('note') || 'Notiz'}: "${bNote}" → "${aNote}"`);
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

  if (log.entity_type === 'job') {
    const jobName = data.job_name || data.name;
    if (jobName) {
      parts.push(`${t('job') || 'Job'}: ${jobName}`);
    } else {
      parts.push(`Job ID: ${log.entity_id}`);
    }

    if (log.operation === 'UPDATE_ASSIGNEES') {
      const changeParts: string[] = [];

      let addedNames: string[] = [];
      let removedNames: string[] = [];

      if (Array.isArray(log.after_snapshot?.added)) {
        addedNames = log.after_snapshot.added
          .map((item: any) => (typeof item === 'string' ? item : item?.name))
          .filter(Boolean);
      }
      if (Array.isArray(log.after_snapshot?.removed)) {
        removedNames = log.after_snapshot.removed
          .map((item: any) => (typeof item === 'string' ? item : item?.name))
          .filter(Boolean);
      }

      if (addedNames.length === 0 && removedNames.length === 0 && (log.before_snapshot || log.after_snapshot)) {
        const getPeopleNames = (snapshot: any): { id: string; name: string }[] => {
          if (!snapshot) return [];
          const list: { id: string; name: string }[] = [];
          if (Array.isArray(snapshot.parents)) {
            snapshot.parents.forEach((p: any) => {
              const name = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || findParentName(p.id);
              list.push({ id: p.id, name: name || p.id });
            });
          }
          if (Array.isArray(snapshot.employees)) {
            snapshot.employees.forEach((e: any) => {
              const name = e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim();
              list.push({ id: e.id, name: name || e.id });
            });
          }
          if (list.length === 0) {
            if (Array.isArray(snapshot.parent_ids)) {
              snapshot.parent_ids.forEach((pId: string) => {
                const name = findParentName(pId);
                list.push({ id: pId, name: name || pId });
              });
            }
            if (Array.isArray(snapshot.employee_ids)) {
              snapshot.employee_ids.forEach((eId: string) => {
                list.push({ id: eId, name: eId });
              });
            }
          }
          return list;
        };

        const beforeList = getPeopleNames(log.before_snapshot);
        const afterList = getPeopleNames(log.after_snapshot);

        const beforeMap = new Map(beforeList.map((p) => [p.id, p.name]));
        const afterMap = new Map(afterList.map((p) => [p.id, p.name]));

        afterList.forEach((p) => {
          if (!beforeMap.has(p.id)) {
            addedNames.push(p.name);
          }
        });
        beforeList.forEach((p) => {
          if (!afterMap.has(p.id)) {
            removedNames.push(p.name);
          }
        });
      }

      if (addedNames.length > 0) {
        changeParts.push(`${t('added') || 'Hinzugefügt'}: ${addedNames.join(', ')}`);
      }
      if (removedNames.length > 0) {
        changeParts.push(`${t('removed') || 'Entfernt'}: ${removedNames.join(', ')}`);
      }

      if (changeParts.length > 0) {
        parts.push(`${t('changes')}: ${changeParts.join(', ')}`);
      } else {
        parts.push(`${t('changes')}: ${t('noChanges') || 'Keine Änderungen'}`);
      }

      return parts.join(' | ');
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffJobSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    if (data.description) {
      parts.push(`${t('jobDescription') || 'Beschreibung'}: ${data.description}`);
    }
    if (data.contact_email) {
      parts.push(`${t('jobContactEmail') || 'Kontakt-E-Mail'}: ${data.contact_email}`);
    }
    if (data.soll_persons !== undefined && data.soll_persons !== null) {
      parts.push(`${t('sollPersons') || 'Soll Personen'}: ${data.soll_persons}`);
    }
  }

  if (log.entity_type === 'volunteer_absence') {
    const typeLabel = data.type === 'bufdi' ? 'BuFDI' : (data.type || '');
    if (typeLabel) {
      parts.push(typeLabel);
    }

    if (log.operation === 'UPDATE' && log.before_snapshot && log.after_snapshot) {
      const changes = diffVolunteerAbsenceSnapshots(log.before_snapshot, log.after_snapshot);
      if (changes.length > 0) {
        parts.push(`${t('changes')}: ${changes.join(', ')}`);
        return parts.join(' | ');
      }
    }

    if (data.start_date) {
      parts.push(`${t('startDateLabel') || 'Startdatum'}: ${formatDisplayDate(data.start_date)}`);
    }
    if (data.end_date) {
      parts.push(`${t('endDateLabel') || 'Enddatum'}: ${formatDisplayDate(data.end_date)}`);
    }
    if (data.note) {
      parts.push(`${t('note') || 'Notiz'}: ${data.note}`);
    }
  }

  if (log.entity_type === 'calendar_event') {
    const label = getCalendarEventDisplayTitle({
      event_type: data.event_type || 'custom',
      title: data.title || '',
    });
    if (label) parts.push(label);
    if (data.start_date) {
      const datePart =
        data.end_date && data.end_date !== data.start_date
          ? `${formatDisplayDate(data.start_date)} – ${formatDisplayDate(data.end_date)}`
          : formatDisplayDate(data.start_date);
      parts.push(datePart);
    }
    if (data.start_time) {
      parts.push(data.end_time ? `${data.start_time}–${data.end_time}` : data.start_time);
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
    if (op === 'UPDATE' || op === 'UPDATE_ASSIGNEES') {
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
      case 'job':
        return t('job') || 'Job';
      case 'volunteer_absence':
        return t('subtabVolunteerAbsences') || 'Abwesenheit Freiwillige';
      case 'calendar_event':
        return t('calendar_event') || 'Kalendertermin';
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

const ImpressumFooter: React.FC<{ isInternal?: boolean }> = ({ isInternal }) => (
  <footer className="app-footer">
    <a
      href="https://www.tollhaus-stuttgart.de/impressum"
      target="_blank"
      rel="noopener noreferrer"
      className="footer-impressum-link"
    >
      {t('impressum')}
    </a>
    <span className="footer-separator">·</span>
    <a
      href={isInternal ? '/privacy-intern' : '/privacy'}
      target="_blank"
      rel="noopener noreferrer"
      className="footer-privacy-link footer-datenschutz-link"
      data-testid="footer-privacy-link"
    >
      {t('privacy')}
    </a>
  </footer>
);

const LandingPage: React.FC = () => {
  const { authError } = useAuth();

  if (authError) {
    return (
      <div className="landing-page-container">
        <div className="landing-page-content">
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
        <ImpressumFooter />
      </div>
    );
  }

  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');

  return (
    <div className="landing-page-container">
      <div className="landing-page-content">
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
      <ImpressumFooter />
    </div>
  );
};

interface AdminUser {
  id: string;
  email: string;
  canonical_email?: string;
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
  'children.all.read',
  'children.all.write',
  'fees.all.read',
  'fees.self.read',
  'hygiene.all.read',
  'hygiene.all.write',
  'hygiene.infektionsschutz.management',
  'hygiene.infektionsschutz.self',
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
  'activity.view',
  'users.all.manage',
  'vaccination.status.manage',
  'provision.kiosk.cert',
  'dashboard.use',
  'dashboard.todos.manage',
  'permissions.simulate',
  'jobs.all.read',
  'jobs.all.write',
  'job.role_assignment.read',
  'job.role_assignment.write',
  'volunteers.absences.read',
  'volunteers.absences.write',
  'events.all.read',
  'events.all.write',
  'events.all.import'
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
  const [availablePermissions, setAvailablePermissions] = React.useState<string[]>(ALL_AVAILABLE_PERMISSIONS);
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

  const fetchPermissions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/permissions', { headers: getAdminHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.permissions) && data.permissions.length > 0) {
          setAvailablePermissions(data.permissions);
        }
      }
    } catch (e) {
      console.error('Failed to load permissions:', e);
    }
  }, [getAdminHeaders]);

  const refreshData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchRoles(), fetchPermissions()]);
    setLoading(false);
  }, [fetchUsers, fetchRoles, fetchPermissions]);

  const displayedUserPerms = React.useMemo(() => {
    const set = new Set(availablePermissions);
    selectedUserPerms.forEach(p => set.add(p));
    return Array.from(set);
  }, [availablePermissions, selectedUserPerms]);

  const displayedRolePerms = React.useMemo(() => {
    const set = new Set(availablePermissions);
    selectedRolePerms.forEach(p => set.add(p));
    return Array.from(set);
  }, [availablePermissions, selectedRolePerms]);

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
            type="button"
            data-testid="admin-subtab-users"
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
            type="button"
            data-testid="admin-subtab-roles"
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
                  {displayedUserPerms.map(p => (
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
                  {displayedRolePerms.map(p => (
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
import { useIsMobile } from './hooks/useIsMobile';

const Dashboard: React.FC = () => {
  const { user, token, logout, refreshUser, hasPermission, canSimulate, leaveSimulation } = useAuth();
  const isMobile = useIsMobile();
  const pwaInstallState = usePwaInstallState();
  const canInstallPwa =
    pwaInstallState.platformInfo.isMobile &&
    !pwaInstallState.isStandalone &&
    !pwaInstallState.isInstalled;
  const [simulatorModalOpen, setSimulatorModalOpen] = React.useState(false);
  const [viewRolesModalOpen, setViewRolesModalOpen] = React.useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = React.useState(false);
  const [pwaInstallModalOpen, setPwaInstallModalOpen] = React.useState(false);
  const [selfServiceModalOpen, setSelfServiceModalOpen] = React.useState(false);
  const [selfServiceInitialParentId, setSelfServiceInitialParentId] = React.useState<string | null>(null);
  const [feedbackInitialData, setFeedbackInitialData] = React.useState<{
    type?: FeedbackType;
    description?: string;
  }>({});

  React.useEffect(() => {
    const handleOpenFeedback = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: FeedbackType; description?: string }>;
      setFeedbackInitialData(customEvent.detail || {});
      setFeedbackModalOpen(true);
    };
    window.addEventListener('thweb:open-feedback', handleOpenFeedback);
    return () => {
      window.removeEventListener('thweb:open-feedback', handleOpenFeedback);
    };
  }, []);
  const appConfig = getAppConfig();
  const appTitle = appConfig.title || t('title');
  const appLogoUrl = appConfig.logoUrl;
  const appFaviconUrl = appConfig.faviconUrl || '/favicon.svg';
  const displayTitle = isMobile && (appTitle === 'TH Portal' || appTitle === t('title')) ? 'TH' : appTitle;

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
  const canViewActivity = canManageUsers || hasPermission('activity.view') || hasPermission('*');
  const canProvisionKiosk = hasPermission('provision.kiosk.cert') || hasPermission('*');
  const canUseDashboard = hasPermission('dashboard.use');
  const canManageDashboardTodos = hasPermission('dashboard.todos.manage') || hasPermission('*');
  const canReadOverview = hasPermission('families.all.restrictedread');
  const canReadFamiliesAll = hasPermission('families.all.read');
  const canReadFees = hasPermission('fees.all.read') || hasPermission('fees.self.read');
  const canReadFeesAll = hasPermission('fees.all.read');
  const canWriteParents = hasPermission('families.all.write');
  const canWriteFamilies = canWriteParents;
  const canWriteChildren = hasPermission('children.all.write');
  const canManageHygiene = hasPermission('hygiene.infektionsschutz.management') || hasPermission('*') || hasPermission('hygiene.all.write');
  const canAccessPersonalHygiene = hasPermission('hygiene.infektionsschutz.self') || hasPermission('*');
  const canWriteHygiene = hasPermission('hygiene.all.write') || canManageHygiene;
  const canViewMealPlan = hasPermission('mealplan.view');
  const canReadMealAllergens = hasPermission('meal_allergens.read') || hasPermission('meal_allergens.write');
  const canReadMembers = hasPermission('memberships.all.read');
  const canWriteMemberships = hasPermission('memberships.all.write');
  const canReadChildAllergies = hasPermission('allergies.children.read') || hasPermission('allergies.children.write');
  const canWriteChildAllergies = hasPermission('allergies.children.write');
  const canReadEmployeeAllergies = hasPermission('allergies.employees.read') || hasPermission('allergies.employees.write');
  const canWriteEmployeeAllergies = hasPermission('allergies.employees.write');
  const canReadEmployees = hasPermission('employees.all.read') || canReadEmployeeAllergies;
  const canWriteEmployees = hasPermission('employees.all.write');
  const canReadJobs = hasPermission('jobs.all.read') || hasPermission('jobs.all.write');
  const canWriteJobs = hasPermission('jobs.all.write');
  const canReadJobRoles = hasPermission('job.role_assignment.read') || hasPermission('job.role_assignment.write');
  const canWriteJobRoles = hasPermission('job.role_assignment.write');
  const canReadVolunteerAbsences = hasPermission('volunteers.absences.read') || hasPermission('volunteers.absences.write');
  const canReadEvents = hasPermission('events.all.read') || hasPermission('events.all.write') || hasPermission('events.all.import');
  const canImportEvents = hasPermission('events.all.import');
  const canSelfService = hasPermission('families.self.selfservice') && Boolean(user?.family_id);

  const openSelfService = React.useCallback((parent?: any) => {
    setSelfServiceInitialParentId(parent?.original_id || parent?.id || null);
    setSelfServiceModalOpen(true);
  }, []);

  const [families, setFamilies] = React.useState<Family[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [jobs, setJobs] = React.useState<JobWithAssignees[]>([]);
  const [availableRoles, setAvailableRoles] = React.useState<Role[]>([]);
  const [jobsPopoverAnchor, setJobsPopoverAnchor] = React.useState<HTMLElement | null>(null);
  const [activePersonForJobs, setActivePersonForJobs] = React.useState<PersonWithJobs | null>(null);
  const [overviewFamilies, setOverviewFamilies] = React.useState<OverviewFamily[]>([]);
  const [overviewGroupBy, setOverviewGroupBy] = React.useState<'family' | 'group' | 'job'>('group');
  const [mgaLifecycleFilter, setMgaLifecycleFilter] = React.useState<'all' | 'active' | 'former'>('active');
  const [contactConsentPopoverAnchor, setContactConsentPopoverAnchor] = React.useState<HTMLElement | null>(null);
  const [targetParentForConsent, setTargetParentForConsent] = React.useState<Parent | null>(null);
  const [isHistoricalAlumni, setIsHistoricalAlumni] = React.useState<boolean>(false);

  const currentAuthUserFirstName = React.useMemo(() => {
    if (user?.first_name) return user.first_name;
    if (!user?.email) return '';
    const normEmail = user.email.trim().toLowerCase();
    for (const f of families) {
      for (const p of f.parents || []) {
        if (p.emails?.some((e: any) => (e.canonical_value || e.value || '').trim().toLowerCase() === normEmail)) {
          if (p.first_name) return p.first_name;
        }
      }
    }
    for (const emp of employees) {
      if (emp.emails?.some((e: any) => (e.canonical_value || e.value || '').trim().toLowerCase() === normEmail)) {
        if (emp.first_name) return emp.first_name;
      }
    }
    return '';
  }, [user?.first_name, user?.email, families, employees]);

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
  const [lifecycleFilterPopoverOpen, setLifecycleFilterPopoverOpen] = React.useState(false);
  const lifecycleFilterButtonRef = React.useRef<HTMLButtonElement>(null);
  const [printMenuOpen, setPrintMenuOpen] = React.useState(false);
  const printButtonRef = React.useRef<HTMLButtonElement>(null);
  const [printMgaMenuOpen, setPrintMgaMenuOpen] = React.useState(false);
  const printMgaButtonRef = React.useRef<HTMLButtonElement>(null);
  const [groupPrintModalOpen, setGroupPrintModalOpen] = React.useState(false);

  const isMainPageActive = React.useMemo(() => {
    return isExperimentActive('main_page', { user });
  }, [user]);

  const navPerms: UserPermissionsContext = React.useMemo(() => ({
    canReadOverview,
    canReadEvents,
    canImportEvents,
    canReadFamiliesAll,
    canReadFees,
    canReadFeesAll,
    hasFamily: Boolean(user?.family_id),
    canReadMembers,
    canReadJobs,
    canReadEmployees,
    canReadVolunteerAbsences,
    canViewMealPlan,
    canReadMealAllergens,
    hasHygieneWrite: canWriteHygiene,
    canManageHygiene,
    canAccessPersonalHygiene,
    canReadAudit,
    canManageUsers: canManageUsers || hasPermission('*'),
    canViewActivity,
    canProvisionKiosk,
    canUseDashboard,
    canManageDashboardTodos,
    canViewMainPage: isMainPageActive,
  }), [
    canReadOverview,
    canReadEvents,
    canImportEvents,
    canReadFamiliesAll,
    canReadFees,
    canReadFeesAll,
    user?.family_id,
    canReadMembers,
    canReadJobs,
    canReadEmployees,
    canReadVolunteerAbsences,
    canViewMealPlan,
    canReadMealAllergens,
    canWriteHygiene,
    canManageHygiene,
    canAccessPersonalHygiene,
    hasPermission,
    canReadAudit,
    canManageUsers,
    canViewActivity,
    canProvisionKiosk,
    canUseDashboard,
    canManageDashboardTodos,
    isMainPageActive,
  ]);

  const [globalFilter, setGlobalFilter] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<
    'main' | 'familiesOverview' | 'families' | 'parents' | 'children' | 'alumni' | 'members' | 'jobs' | 'employees' | 'childcareFees' | 'childcareFeesAll' | 'hygieneBelehrung' | 'hygieneDocument' | 'kochenHygiene' | 'mealPlan' | 'mealAllergens' | 'audit' | 'admin' | 'activity' | 'kiosk' | 'dashboard' | 'dashboardTodos' | string
  >(() => {
    const rawHash = window.location.hash.replace('#', '');
    const hash = rawHash.split('?')[0];
    const pathname = window.location.pathname.replace(/\/+$/, '');
    const isMainPageActiveInitial = isExperimentActive('main_page', { user });
    const initialPerms: UserPermissionsContext = {
      canReadOverview,
      canReadEvents,
      canImportEvents,
      canReadFamiliesAll,
      canReadFees,
      canReadFeesAll,
      hasFamily: Boolean(user?.family_id),
      canReadMembers,
      canReadJobs,
      canReadEmployees,
      canReadVolunteerAbsences,
      canViewMealPlan,
      canReadMealAllergens,
      hasHygieneWrite: canWriteHygiene,
      canManageHygiene,
      canAccessPersonalHygiene,
      canReadAudit,
      canManageUsers: canManageUsers || hasPermission('*'),
      canViewActivity,
      canProvisionKiosk,
      canUseDashboard,
      canManageDashboardTodos,
      canViewMainPage: isMainPageActiveInitial,
    };
    if (pathname === '/dashboard' && canUseDashboard) {
      return 'dashboard';
    }
    if (isMainPageActiveInitial && (!hash || hash === 'main' || hash === 'home')) {
      return 'main';
    }
    if (hash === 'alumni') {
      return canReadFamiliesAll ? 'parents' : 'familiesOverview';
    }
    if (
      (hash === 'main' && isMainPageActiveInitial) ||
      (hash === 'events' && canReadEvents) ||
      (hash === 'eventsImport' && canImportEvents) ||
      (hash === 'familiesOverview' && canReadOverview) ||
      (hash === 'families' && canReadFamiliesAll) ||
      (hash === 'parents' && canReadFamiliesAll) ||
      (hash === 'children' && canReadFamiliesAll) ||
      (hash === 'members' && canReadMembers) ||
      (hash === 'jobs' && canReadJobs) ||
      (hash === 'employees' && canReadEmployees) ||
      (hash === 'volunteerAbsences' && canReadVolunteerAbsences) ||
      (hash === 'childcareFees' && canReadFees) ||
      (hash === 'childcareFeesAll' && canReadFeesAll) ||
      (hash === 'hygieneBelehrung' && (canManageHygiene || hasPermission('hygiene.all.write'))) ||
      (hash === 'hygieneDocument' && canManageHygiene) ||
      (hash === 'kochenHygiene' && canAccessPersonalHygiene) ||
      (hash === 'mealPlan' && canViewMealPlan) ||
      (hash === 'mealAllergens' && canReadMealAllergens) ||
      (hash === 'audit' && canReadAudit) ||
      (hash === 'admin' && canManageUsers) ||
      (hash === 'activity' && canViewActivity) ||
      (hash === 'kiosk' && canProvisionKiosk) ||
      categoryHasLandingPage(hash, initialPerms) ||
      (hash === 'dashboard' && canUseDashboard) ||
      (hash === 'dashboardTodos' && canManageDashboardTodos)
    ) {
      return hash as any;
    }
    const saved = localStorage.getItem('thweb_active_tab');
    if (saved === 'alumni') {
      return canReadFamiliesAll ? 'parents' : 'familiesOverview';
    }
    if (
      (saved === 'main' && isMainPageActiveInitial) ||
      (saved === 'events' && canReadEvents) ||
      (saved === 'eventsImport' && canImportEvents) ||
      (saved === 'familiesOverview' && canReadOverview) ||
      (saved === 'families' && canReadFamiliesAll) ||
      (saved === 'parents' && canReadFamiliesAll) ||
      (saved === 'children' && canReadFamiliesAll) ||
      (saved === 'members' && canReadMembers) ||
      (saved === 'jobs' && canReadJobs) ||
      (saved === 'employees' && canReadEmployees) ||
      (saved === 'volunteerAbsences' && canReadVolunteerAbsences) ||
      (saved === 'childcareFees' && canReadFees) ||
      (saved === 'childcareFeesAll' && canReadFeesAll) ||
      (saved === 'hygieneBelehrung' && (canManageHygiene || hasPermission('hygiene.all.write'))) ||
      (saved === 'hygieneDocument' && canManageHygiene) ||
      (saved === 'kochenHygiene' && canAccessPersonalHygiene) ||
      (saved === 'mealPlan' && canViewMealPlan) ||
      (saved === 'mealAllergens' && canReadMealAllergens) ||
      (saved === 'audit' && canReadAudit) ||
      (saved === 'admin' && canManageUsers) ||
      (saved === 'activity' && canViewActivity) ||
      (saved === 'kiosk' && canProvisionKiosk) ||
      (saved && categoryHasLandingPage(saved, initialPerms)) ||
      (saved === 'dashboard' && canUseDashboard) ||
      (saved === 'dashboardTodos' && canManageDashboardTodos)
    ) {
      return saved as any;
    }
    if (isMainPageActiveInitial) {
      return 'main';
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
    if (canReadJobs) {
      return 'jobs';
    }
    if (canReadEmployees) {
      return 'employees';
    }
    if (canReadVolunteerAbsences) {
      return 'volunteerAbsences';
    }
    if (canViewMealPlan) {
      return 'mealPlan';
    }
    if (canReadMealAllergens) {
      return 'mealAllergens';
    }
    if (canReadAudit) {
      return 'audit';
    }
    if (canManageUsers) {
      return 'admin';
    }
    if (canViewActivity) {
      return 'activity';
    }
    if (canProvisionKiosk) {
      return 'kiosk';
    }
    if (canUseDashboard) {
      return 'dashboard';
    }
    return isMainPageActiveInitial ? 'main' : 'familiesOverview';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(() => {
    return localStorage.getItem('thweb_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    let fallback: typeof activeTab | null = null;
    if (activeTab === 'main' && !isMainPageActive) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      }
    } else if (activeTab === 'families' && !canReadFamiliesAll) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      }
    } else if ((activeTab === 'parents' || activeTab === 'children') && !canReadFamiliesAll) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      }
    } else if (activeTab === 'members' && !canReadMembers) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'jobs' && !canReadJobs) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'employees' && !canReadEmployees) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'volunteerAbsences' && !canReadVolunteerAbsences) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'events' && !canReadEvents) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'eventsImport' && !canImportEvents) {
      if (canReadEvents) {
        fallback = 'events';
      } else if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'mealPlan' && !canViewMealPlan) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'mealAllergens' && !canReadMealAllergens) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'hygieneBelehrung' && !canManageHygiene && !hasPermission('hygiene.all.write')) {
      if (canReadOverview) {
        fallback = 'familiesOverview';
      } else if (canReadFees) {
        fallback = 'childcareFees';
      } else if (canReadFamiliesAll) {
        fallback = 'families';
      }
    } else if (activeTab === 'hygieneDocument' && !canManageHygiene) {
      fallback = getFirstPermittedTabForCategory('hygiene', navPerms) || 'familiesOverview';
    } else if (activeTab === 'kochenHygiene' && !canAccessPersonalHygiene) {
      fallback = getFirstPermittedTabForCategory('kochen', navPerms) || 'familiesOverview';
    } else if (activeTab === 'dashboardTodos' && !canManageDashboardTodos) {
      fallback = getFirstPermittedTabForCategory('kochen', navPerms) || 'familiesOverview';
    } else if (activeTab === 'mga' && !categoryHasLandingPage('mga', navPerms)) {
      fallback = getFirstPermittedTabForCategory('mga', navPerms);
    } else if (activeTab === 'kochen' && !categoryHasLandingPage('kochen', navPerms)) {
      fallback = getFirstPermittedTabForCategory('kochen', navPerms);
    } else if (activeTab === 'hygiene' && !categoryHasLandingPage('hygiene', navPerms)) {
      fallback = getFirstPermittedTabForCategory('hygiene', navPerms);
    } else if (activeTab === 'childcareFeesAll' && !canReadFeesAll) {
      fallback = canReadFees ? 'childcareFees' : (canReadOverview ? 'familiesOverview' : 'families');
    }
    if (fallback && fallback !== activeTab) {
      setActiveTab(fallback);
      localStorage.setItem('thweb_active_tab', fallback);
      window.location.hash = fallback;
    }
  }, [activeTab, canReadEvents, canImportEvents, canReadFamiliesAll, canReadOverview, canReadFees, canReadFeesAll, canReadMembers, canReadJobs, canReadEmployees, canReadVolunteerAbsences, canViewMealPlan, canReadMealAllergens, canManageHygiene, canAccessPersonalHygiene, canManageDashboardTodos, hasPermission, navPerms, isMainPageActive]);

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

  const handleJumpToFamily = React.useCallback(
    (
      familyId: string,
      fromTab: 'families' | 'familiesOverview' | 'members' | 'parents' | 'children' = 'families'
    ) => {
      setGlobalFilter('');
      setActiveTab('families');
      setHighlightTarget({ id: familyId, key: Date.now() });
      setReturnNav({ familyId, familyName: '', type: 'family', fromTab });
      const params = new URLSearchParams({
        fromFamily: familyId,
        highlight: familyId,
        type: 'family',
        fromTab,
      });
      window.location.hash = `families?${params.toString()}`;
    },
    []
  );

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
    setActiveTab(tab);
    localStorage.setItem('thweb_active_tab', tab);
    const currentHashBase = window.location.hash.replace('#', '').split('?')[0];
    if (currentHashBase !== tab) {
      window.location.hash = tab;
    }
  }, []);

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
  const [addJobOpen, setAddJobOpen] = React.useState(false);

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

  // Mentor popover state
  const [activeFamilyForMentor, setActiveFamilyForMentor] = React.useState<Family | null>(null);
  const [mentorPopoverAnchor, setMentorPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  const openManageMentor = React.useCallback((family: Family, anchor: HTMLElement | string) => {
    setActiveFamilyForMentor(family);
    setMentorPopoverAnchor(anchor);
  }, []);

  const closeManageMentor = React.useCallback(() => {
    setMentorPopoverAnchor(null);
    setActiveFamilyForMentor(null);
  }, []);

  // Family Notes popover state
  const [activeFamilyForNotes, setActiveFamilyForNotes] = React.useState<Family | null>(null);
  const [activeNotesTarget, setActiveNotesTarget] = React.useState<NotesTarget | null>(null);
  const [familyNotesPopoverAnchor, setFamilyNotesPopoverAnchor] = React.useState<HTMLElement | string | null>(null);

  const openFamilyNotes = React.useCallback((family: Family, target: NotesTarget, anchor: HTMLElement | string) => {
    setActiveFamilyForNotes(family);
    setActiveNotesTarget(target);
    setFamilyNotesPopoverAnchor(anchor);
  }, []);

  const closeFamilyNotes = React.useCallback(() => {
    setFamilyNotesPopoverAnchor(null);
    setActiveFamilyForNotes(null);
    setActiveNotesTarget(null);
  }, []);

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

  const saveStacks = React.useCallback((undo: any[], redo: any[]) => {
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
  }, []);

  const pushAction = React.useCallback((action: any) => {
    if (isPureVaccinationAction(action)) return;
    const sanitized = sanitizeHistoryAction(action);
    const newUndo = [...undoStackRef.current, sanitized];
    if (newUndo.length > 50) {
      newUndo.shift();
    }
    saveStacks(newUndo, []);
  }, [saveStacks]);

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
        p.before?.mentor_family_id === entityId ||
        p.after?.mentor_family_id === entityId ||
        (Array.isArray(p.before?.mentor_parent_ids) && p.before.mentor_parent_ids.includes(entityId)) ||
        (Array.isArray(p.after?.mentor_parent_ids) && p.after.mentor_parent_ids.includes(entityId)) ||
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
    const targetTab = payload.tab || (type.includes('CHILD') ? 'children' : type.includes('EMPLOYEE') ? 'employees' : type.includes('MENTOR') ? 'families' : 'parents');
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
      else if (type === 'UPDATE_FAMILY_MENTOR') {
        const target = isUndo ? payload.before : payload.after;
        const res = await fetch(`/api/families/${payload.familyId}/mentor`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            mentor_family_id: target.mentor_family_id,
            mentor_parent_ids: target.mentor_parent_ids,
          }),
        });
        if (!res.ok) throw new Error();
      }

      await fetchFamilies();
      if (canReadOverview) {
        await fetchOverviewFamilies();
      }
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

  const fetchJobs = React.useCallback(() => {
    if (!canReadJobs) return Promise.resolve([]);
    return fetch('/api/jobs', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch jobs');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setJobs(data);
        }
        return data;
      })
      .catch((err) => console.error(err));
  }, [canReadJobs, getAuthHeaders]);

  const fetchAvailableRoles = React.useCallback(async () => {
    try {
      const res = await fetch('/api/roles', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableRoles(Array.isArray(data) ? data : (data?.roles || []));
      }
    } catch (err) {
      console.error('Failed to fetch available roles', err);
    }
  }, [getAuthHeaders]);

  const handleCreateJob = React.useCallback(async (jobData: { name: string; description: string; contact_email: string; roles?: string[]; soll_persons?: number }) => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(jobData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create job');
    }
    await fetchJobs();
    await refreshUser();
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadOverview) fetchOverviewFamilies();
    if (canReadEmployees) fetchEmployees();
  }, [getAuthHeaders, fetchJobs, refreshUser, canReadFamiliesAll, fetchFamilies, canReadOverview, fetchOverviewFamilies, canReadEmployees, fetchEmployees]);

  const handleUpdateJob = React.useCallback(async (id: string, jobData: { name: string; description: string; contact_email: string; roles?: string[]; soll_persons?: number }) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(jobData),
    });
    if (!res.ok) {
      const err = await res.json().catch(async () => {
        const text = await res.text().catch(() => '');
        return { error: text.trim() };
      });
      throw new Error(err.error || 'Failed to update job');
    }
    await fetchJobs();
    await refreshUser();
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadOverview) fetchOverviewFamilies();
    if (canReadEmployees) fetchEmployees();
  }, [getAuthHeaders, fetchJobs, refreshUser, canReadFamiliesAll, fetchFamilies, canReadOverview, fetchOverviewFamilies, canReadEmployees, fetchEmployees]);

  const handleUpdateJobRoles = React.useCallback(async (jobId: string, roles: string[]) => {
    const res = await fetch(`/api/jobs/${jobId}/roles`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ roles }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update job roles');
    }
    await fetchJobs();
    await refreshUser();
  }, [getAuthHeaders, fetchJobs, refreshUser]);

  const handleDeleteJob = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete job');
    }
    await fetchJobs();
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadOverview) fetchOverviewFamilies();
    if (canReadEmployees) fetchEmployees();
  }, [getAuthHeaders, fetchJobs, canReadFamiliesAll, fetchFamilies, canReadOverview, fetchOverviewFamilies, canReadEmployees, fetchEmployees]);

  const handleUpdateJobAssignees = React.useCallback(async (jobId: string, parentIds: string[], employeeIds: string[]) => {
    const res = await fetch(`/api/jobs/${jobId}/assignees`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ parent_ids: parentIds, employee_ids: employeeIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update job assignees');
    }
    await fetchJobs();
    if (canReadFamiliesAll) fetchFamilies();
    if (canReadOverview) fetchOverviewFamilies();
    if (canReadEmployees) fetchEmployees();
  }, [getAuthHeaders, fetchJobs, canReadFamiliesAll, fetchFamilies, canReadOverview, fetchOverviewFamilies, canReadEmployees, fetchEmployees]);

  const handleFetchJobPeople = React.useCallback(async () => {
    const res = await fetch('/api/jobs/people', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch people for jobs');
    }
    return res.json();
  }, [getAuthHeaders]);

  const handleSavePersonJobs = React.useCallback(async (personId: string, jobIds: string[], personType?: 'parent' | 'employee') => {
    const endpoint = personType === 'employee' ? `/api/employees/${personId}/jobs` : `/api/parents/${personId}/jobs`;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ job_ids: jobIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save person jobs');
    }
    if (personType === 'employee') {
      await fetchEmployees();
    } else {
      if (canReadFamiliesAll) await fetchFamilies();
      if (canReadOverview) await fetchOverviewFamilies();
    }
    if (canReadJobs) await fetchJobs();

    const updatedJobsList = jobs.filter((j) => jobIds.includes(j.id)).map((j) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      contact_email: j.contact_email,
    }));
    setActivePersonForJobs((prev) => (prev && prev.id === personId ? { ...prev, jobs: updatedJobsList } : prev));
  }, [getAuthHeaders, fetchEmployees, canReadFamiliesAll, fetchFamilies, canReadOverview, fetchOverviewFamilies, canReadJobs, fetchJobs, jobs]);

  const openManageJobs = React.useCallback((person: PersonWithJobs, anchor: HTMLElement | string) => {
    setActivePersonForJobs(person);
    const anchorEl = typeof anchor === 'string' ? document.getElementById(anchor) : anchor;
    setJobsPopoverAnchor(anchorEl);
    if (canReadJobs && jobs.length === 0) {
      fetchJobs();
    }
  }, [canReadJobs, jobs.length, fetchJobs]);



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
        if (canReadJobs) {
          fetchJobs();
        }
        break;
      case 'members':
        if (canReadMembers) {
          fetchMembers();
        }
        break;
      case 'jobs':
        if (canReadJobs) {
          fetchJobs();
          if (canReadJobRoles) {
            fetchAvailableRoles();
          }
        }
        break;
      case 'employees':
        if (canReadEmployees) {
          fetchEmployees();
        }
        if (canReadJobs) {
          fetchJobs();
        }
        break;
      case 'childcareFees':
      case 'childcareFeesAll':
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
    canReadJobs,
    canReadJobRoles,
    canReadAudit,
    fetchOverviewFamilies,
    fetchFamilies,
    fetchMembers,
    fetchEmployees,
    fetchJobs,
    fetchAvailableRoles,
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
  }, [activeTab, highlightTarget, families, overviewFamilies, members, employees, jobs]);

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

      if (hash === 'alumni') {
        const targetTab = canReadFamiliesAll ? 'parents' : (canReadOverview ? 'familiesOverview' : 'main');
        setActiveTab(targetTab as any);
        localStorage.setItem('thweb_active_tab', targetTab);
        window.location.hash = targetTab;
        return;
      }

      if (
        (isMainPageActive && (!hash || hash === 'main' || hash === 'home')) ||
        (!hash && (canReadOverview || canReadFamiliesAll)) ||
        (hash === 'events' && canReadEvents) ||
        (hash === 'eventsImport' && canImportEvents) ||
        (hash === 'familiesOverview' && canReadOverview) ||
        (hash === 'parents' && canReadFamiliesAll) ||
        (hash === 'children' && canReadFamiliesAll) ||
        (hash === 'families' && canReadFamiliesAll) ||
        (hash === 'members' && canReadMembers) ||
        (hash === 'jobs' && canReadJobs) ||
        (hash === 'employees' && canReadEmployees) ||
        (hash === 'volunteerAbsences' && canReadVolunteerAbsences) ||
        (hash === 'childcareFees' && canReadFees) ||
        (hash === 'childcareFeesAll' && canReadFeesAll) ||
        (hash === 'hygieneBelehrung' && (canManageHygiene || hasPermission('hygiene.all.write'))) ||
        (hash === 'hygieneDocument' && canManageHygiene) ||
        (hash === 'kochenHygiene' && canAccessPersonalHygiene) ||
        (hash === 'mealPlan' && canViewMealPlan) ||
        (hash === 'mealAllergens' && canReadMealAllergens) ||
        (hash === 'audit' && canReadAudit) ||
        (hash === 'admin' && canManageUsers) ||
        (hash === 'activity' && canViewActivity) ||
        (hash === 'kiosk' && canProvisionKiosk) ||
        categoryHasLandingPage(hash, navPerms) ||
        (hash === 'dashboard' && canUseDashboard) ||
        (hash === 'dashboardTodos' && canManageDashboardTodos)
      ) {
        const targetTab = (!hash || hash === 'home')
          ? (isMainPageActive ? 'main' : (canReadOverview ? 'familiesOverview' : 'families'))
          : hash;
        setActiveTab(targetTab as any);
        localStorage.setItem('thweb_active_tab', targetTab);

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
      } else if ((hash === 'main' || hash === 'home') && !isMainPageActive) {
        const fallback = canReadOverview ? 'familiesOverview' : canReadFamiliesAll ? 'families' : 'childcareFees';
        setActiveTab(fallback as any);
        localStorage.setItem('thweb_active_tab', fallback);
        window.location.hash = fallback;
      } else if (hash === 'audit' || hash === 'admin' || hash === 'activity' || hash === 'kiosk' || hash === 'mealPlan' || hash === 'mealAllergens' || hash === 'dashboard' || hash === 'dashboardTodos') {
        const fallback = canReadFamiliesAll ? 'families' : canReadOverview ? 'familiesOverview' : 'childcareFees';
        setActiveTab(fallback as any);
        localStorage.setItem('thweb_active_tab', fallback);
        window.location.hash = fallback;
      } else if (hash === 'volunteerAbsences' && !canReadVolunteerAbsences) {
        const fallback = canReadOverview ? 'familiesOverview' : canReadFamiliesAll ? 'families' : 'childcareFees';
        setActiveTab(fallback as any);
        localStorage.setItem('thweb_active_tab', fallback);
        window.location.hash = fallback;
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.pathname.replace(/\/+$/, '') === '/dashboard') {
      if (canUseDashboard) {
        window.history.replaceState(null, '', '/#dashboard');
      } else {
        const fallback = canReadFamiliesAll ? 'families' : canReadOverview ? 'familiesOverview' : 'childcareFees';
        window.history.replaceState(null, '', '/#' + fallback);
      }
    }
    if (!window.location.hash) {
      window.location.hash = activeTab;
    } else if (window.location.hash.includes('?')) {
      handleHashChange();
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [canReadAudit, canManageUsers, canViewActivity, canProvisionKiosk, canUseDashboard, canManageDashboardTodos, canReadOverview, canReadFamiliesAll, canReadFees, canReadMembers, canReadJobs, canReadEmployees, canReadVolunteerAbsences, canViewMealPlan, canReadMealAllergens, hasPermission, navPerms, isMainPageActive]);

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
      } else if (activeTab === 'childcareFees' || activeTab === 'childcareFeesAll') {
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
    if (
      message.type === 'JOB_CREATED' ||
      message.type === 'JOB_UPDATED' ||
      message.type === 'JOB_DELETED'
    ) {
      if (canReadJobs) fetchJobs();
      if (canReadFamiliesAll) fetchFamilies();
      if (canReadOverview) fetchOverviewFamilies();
      if (canReadEmployees) fetchEmployees();
    }
    if (message.type === 'PARENT_JOBS_UPDATED') {
      if (canReadFamiliesAll) fetchFamilies();
      if (canReadOverview) fetchOverviewFamilies();
      if (canReadJobs) fetchJobs();
    }
    if (message.type === 'EMPLOYEE_JOBS_UPDATED') {
      if (canReadEmployees) fetchEmployees();
      if (canReadJobs) fetchJobs();
    }
  }, [
    activeTab,
    fetchFamilies,
    fetchOverviewFamilies,
    fetchMembers,
    fetchEmployees,
    fetchJobs,
    canReadFamiliesAll,
    canReadOverview,
    canReadMembers,
    canReadEmployees,
    canReadJobs,
    canReadAudit,
  ]));

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddParentOpen(false);
        setAddFamilyOpen(false);
        setAddChildOpen(false);
        setAddEmployeeOpen(false);
        setAddJobOpen(false);
      }
    };
    if (addParentOpen || addFamilyOpen || addChildOpen || addEmployeeOpen || addJobOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addParentOpen, addFamilyOpen, addChildOpen, addEmployeeOpen, addJobOpen]);

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
    setTargetParentMemberships((prev) => {
      if (!prev || prev.id !== parentId) return prev;
      const existing = prev.memberships || [];
      const updatedMemberships = [...existing, created].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
      return { ...prev, memberships: updatedMemberships };
    });
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
    setTargetParentMemberships((prev) => {
      if (!prev) return prev;
      const existing = prev.memberships || [];
      const updatedMemberships = existing
        .map((m) => (m.id === membershipId ? updated : m))
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
      return { ...prev, memberships: updatedMemberships };
    });
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
    setTargetParentMemberships((prev) => {
      if (!prev) return prev;
      const updatedMemberships = (prev.memberships || []).filter((m) => m.id !== membershipId);
      return { ...prev, memberships: updatedMemberships };
    });
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

  const activeFamilyForMentorMemo = React.useMemo(() => {
    if (!activeFamilyForMentor) return null;
    return families.find((f) => f.id === activeFamilyForMentor.id) || activeFamilyForMentor;
  }, [families, activeFamilyForMentor]);

  const activeFamilyForNotesMemo = React.useMemo(() => {
    if (!activeFamilyForNotes) return null;
    return families.find((f) => f.id === activeFamilyForNotes.id) || activeFamilyForNotes;
  }, [families, activeFamilyForNotes]);

  const handleSaveFamilyMentor = React.useCallback(
    async (familyId: string, mentorFamilyId: string | null, mentorParentIds: string[]) => {
      const existingFamily = families.find((f) => f.id === familyId);
      const beforeMentorFamilyId = existingFamily?.mentor_family_id ?? null;
      const beforeMentorParentIds = existingFamily?.mentor_parent_ids ? [...existingFamily.mentor_parent_ids] : [];

      const res = await fetch(`/api/families/${familyId}/mentor`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mentor_family_id: mentorFamilyId,
          mentor_parent_ids: mentorParentIds,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to update mentor');
      }

      const hasFamilyChanged = beforeMentorFamilyId !== mentorFamilyId;
      const sortedBefore = [...beforeMentorParentIds].sort();
      const sortedAfter = [...mentorParentIds].sort();
      const hasParentsChanged =
        sortedBefore.length !== sortedAfter.length ||
        sortedBefore.some((val, idx) => val !== sortedAfter[idx]);

      if (hasFamilyChanged || hasParentsChanged) {
        pushAction({
          type: 'UPDATE_FAMILY_MENTOR',
          payload: {
            tab: activeTab === 'parents' ? 'parents' : 'families',
            familyId,
            before: {
              mentor_family_id: beforeMentorFamilyId,
              mentor_parent_ids: beforeMentorParentIds,
            },
            after: {
              mentor_family_id: mentorFamilyId,
              mentor_parent_ids: mentorParentIds,
            },
          },
        });
      }

      if (canReadFamiliesAll) fetchFamilies();
      if (canReadOverview) fetchOverviewFamilies();
    },
    [families, activeTab, pushAction, getAuthHeaders, canReadFamiliesAll, canReadOverview, fetchFamilies, fetchOverviewFamilies]
  );

  const handleSaveFamilyNotes = React.useCallback(
    async (familyId: string, notes: string) => {
      const res = await fetch(`/api/families/${familyId}/notes`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to update family notes');
      }
      setFamilies((prev) =>
        prev.map((f) => (f.id === familyId ? { ...f, notes } : f))
      );
    },
    [getAuthHeaders]
  );

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

  const activeParentForConsent = React.useMemo(() => {
    if (!targetParentForConsent) return null;
    for (const f of families) {
      const found = (f.parents || []).find((p) => p.id === targetParentForConsent.id);
      if (found) return found;
    }
    return targetParentForConsent;
  }, [families, targetParentForConsent]);

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
      if ((activeChildForMultiValue as any).allergies_items && (activeChildForMultiValue as any).allergies_items.length > 0) {
        return (activeChildForMultiValue as any).allergies_items;
      }
      return activeChildForMultiValue.allergies || [];
    }
    if (activeEmployeeForMultiValue && activeMultiValueField) {
      if (activeMultiValueField === 'allergies' && (activeEmployeeForMultiValue as any).allergies_items && (activeEmployeeForMultiValue as any).allergies_items.length > 0) {
        return (activeEmployeeForMultiValue as any).allergies_items;
      }
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
      const allergyPayload = newValues
        .map((v) => {
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) return null;
            const category = isDietPreference(trimmed)
              ? 'ernaehrung'
              : isLebensmittelAllergen(trimmed)
              ? 'lebensmittel'
              : undefined;
            return {
              name: trimmed,
              value: trimmed,
              category,
            };
          }
          const text = ((v as any).name || (v as any).value || '').trim();
          if (!text) return null;
          const explicitCategory = (v as any).category;
          const category =
            explicitCategory ||
            (isDietPreference(text) ? 'ernaehrung' : isLebensmittelAllergen(text) ? 'lebensmittel' : undefined);
          return {
            name: text,
            value: text,
            category,
          };
        })
        .filter(Boolean);

      if (activeChildForMultiValue) {
        handleSaveChildField(activeChildForMultiValue, 'allergies', allergyPayload);
      } else if (activeEmployeeForMultiValue) {
        handleSaveEmployeeField(activeEmployeeForMultiValue, 'allergies', allergyPayload);
      }
      return;
    }
    if (activeParentForMultiValue && activeMultiValueField) {
      handleSaveParentField(activeParentForMultiValue, activeMultiValueField, newValues);
    } else if (activeEmployeeForMultiValue && activeMultiValueField) {
      handleSaveEmployeeField(activeEmployeeForMultiValue, activeMultiValueField, newValues);
    }
  };

  const openManageConsent = React.useCallback((parent: Parent, anchor: HTMLElement) => {
    setTargetParentForConsent(parent);
    setContactConsentPopoverAnchor(anchor);
  }, []);

  const closeManageConsent = React.useCallback(() => {
    setTargetParentForConsent(null);
    setContactConsentPopoverAnchor(null);
  }, []);

  const handleSaveContactConsent = React.useCallback(
    async (payload: {
      parentId: string;
      consentId?: string;
      consentType: string;
      status: 'granted' | 'revoked';
      grantedAt: string;
      channel: string;
      notes: string;
    }) => {
      const url = payload.consentId ? `/api/contact-consents/${payload.consentId}` : '/api/contact-consents';
      const method = payload.consentId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          parent_id: payload.parentId,
          consent_type: payload.consentType,
          status: payload.status,
          granted_at: payload.grantedAt,
          channel: payload.channel,
          notes: payload.notes,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || 'Failed to save contact consent');
      }
      if (canReadFamiliesAll) fetchFamilies();
    },
    [canReadFamiliesAll, fetchFamilies, getAuthHeaders]
  );

  const handleDeleteContactConsent = React.useCallback(
    async (consentId: string) => {
      const res = await fetch(`/api/contact-consents/${consentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to delete contact consent');
      }
      if (canReadFamiliesAll) fetchFamilies();
    },
    [canReadFamiliesAll, fetchFamilies, getAuthHeaders]
  );

  const openAddFamily = () => {
    setP1FirstName('');
    setP1LastName('');
    setP2FirstName('');
    setP2LastName('');
    setIsP2LastNameDirty(false);
    setIsHistoricalAlumni(false);
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
        family_type: isHistoricalAlumni ? 'historical_alumni' : 'regular',
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
        setGlobalFilter('');
        if (canReadFamiliesAll) fetchFamilies();
        if (canReadMembers) fetchMembers();
        if (canReadOverview) fetchOverviewFamilies();
        setAddFamilyOpen(false);
        if (createdFamily?.id) {
          setHighlightTarget({ id: createdFamily.id, key: Date.now() });
        }
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

  const handleSaveParentNames = (
    parent: Parent,
    firstName: string,
    firstNameForAddressList: string,
    nicknames: string[] = parent.nicknames || []
  ) => {
    const family = families.find(f => f.id === parent.family_id);
    if (!family) return Promise.resolve();

    const originalParents = family.parents || [];
    const updatedParents = originalParents.map(p => 
      p.id === parent.id
        ? { ...p, first_name: firstName, first_name_for_address_list: firstNameForAddressList, nicknames }
        : p
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
        const addrFnMatch = (p.first_name_for_address_list || '').toLowerCase().includes(query);
        const nickMatch = (p.nicknames || []).some(n => String(n || '').toLowerCase().includes(query));
        const lnMatch = (p.last_name || '').toLowerCase().includes(query);
        const emailMatch = (p.emails || []).some(e => getEntryValue(e).toLowerCase().includes(query));
        const phoneMatch = (p.phones || []).some(ph => getEntryValue(ph).toLowerCase().includes(query));
        const addressMatch = (p.address || '').toLowerCase().includes(query);
        const mentored = getMentoredFamiliesForParent(p, families);
        const mentorMatch = mentored.some(m => m.canonicalName.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query));
        return fnMatch || addrFnMatch || nickMatch || lnMatch || emailMatch || phoneMatch || addressMatch || mentorMatch;
      });

      return {
        id: f.id,
        family_name: familyName,
        parents: filteredParents,
        nameMatch: familyName.toLowerCase().includes(query),
        originalFamily: f,
      };
    });

    const filteredByLifecycle = mapped.filter((f) => {
      const isFormer = isFamilyFormer(f.originalFamily || f);
      if (mgaLifecycleFilter === 'active') return !isFormer;
      if (mgaLifecycleFilter === 'former') return isFormer;
      return true;
    });

    const sorted = sortFamilyBlocks(filteredByLifecycle, familySortOrder, CURRENT_LOCALE);

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
  }, [families, globalFilter, familySortOrder, mgaLifecycleFilter]);

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

    const filteredByLifecycle = mapped.filter((f) => {
      const isFormer = isFamilyFormer(f.originalFamily || f);
      if (mgaLifecycleFilter === 'active') return !isFormer;
      if (mgaLifecycleFilter === 'former') return isFormer;
      return true;
    });

    const sorted = sortFamilyBlocks(filteredByLifecycle, familySortOrder, CURRENT_LOCALE);

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
  }, [families, globalFilter, familySortOrder, mgaLifecycleFilter]);

  // Structure families for 1-row-per-family display in families tab
  const familiesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();
    const mapped = families.map((f) => {
      const familyName = getFamilyName(f);

      const sortedParents = [...(f.parents || [])].sort((a, b) => {
        const cmp = (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
        if (cmp !== 0) return cmp;
        return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
      });

      const parentNames = sortedParents
        .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const sortedChildren = [...(f.children || [])].sort((a, b) => {
        const cmp = compareBirthDates(a.birth_date, b.birth_date);
        if (cmp !== 0) return cmp;
        return (a.first_name || '').localeCompare(b.first_name || '', CURRENT_LOCALE);
      });

      const childNames = sortedChildren
        .map((c) => `${c.first_name || ''} ${c.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const mentorDisplay = getMentorsDisplay(f, families);
      const mentoredFamilies = getMentoredFamiliesForFamily(f, families);

      const mentorMatch = mentorDisplay.text.toLowerCase().includes(query);
      const mentoredMatch = mentoredFamilies.some(
        (m) => m.canonicalName.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query)
      );
      const familyNameMatch = familyName.toLowerCase().includes(query);
      const parentMatch = parentNames.toLowerCase().includes(query);
      const childMatch = childNames.toLowerCase().includes(query);
      const familyNotesMatch = (f.notes || '').toLowerCase().includes(query);
      const parentNotesMatch = sortedParents.some((p) => (p.notes || '').toLowerCase().includes(query));
      const childNotesMatch = sortedChildren.some((c) => (c.notes || '').toLowerCase().includes(query));
      const childBirthDatesMatch = sortedChildren.some((c) => {
        const bd = formatDisplayDate(c.birth_date).toLowerCase();
        const raw = (c.birth_date || '').split('T')[0];
        return bd.includes(query) || raw.includes(query);
      });

      const matchesQuery =
        !query ||
        familyNameMatch ||
        parentMatch ||
        childMatch ||
        mentorMatch ||
        mentoredMatch ||
        familyNotesMatch ||
        parentNotesMatch ||
        childNotesMatch ||
        childBirthDatesMatch;

      return {
        ...f,
        id: f.id,
        family_name: familyName,
        parents: sortedParents,
        children: sortedChildren,
        mentorDisplay,
        mentoredFamilies,
        matchesQuery,
        originalFamily: f,
      };
    });

    const filteredByLifecycle = mapped.filter((f) => {
      const isFormer = isFamilyFormer(f.originalFamily || f);
      if (mgaLifecycleFilter === 'active') return !isFormer;
      if (mgaLifecycleFilter === 'former') return isFormer;
      return true;
    });

    const sorted = sortFamilyBlocks(filteredByLifecycle, familySortOrder, CURRENT_LOCALE);
    if (!query) return sorted;
    return sorted.filter((f) => f.matchesQuery);
  }, [families, globalFilter, familySortOrder, mgaLifecycleFilter]);

  const overviewFamiliesTabData = React.useMemo(() => {
    const query = (globalFilter || '').trim().toLowerCase();

    if (overviewGroupBy === 'job') {
      const jobMap = new Map<string, { id: string; name: string }>();
      overviewFamilies.forEach((f) => {
        (f.parents || []).forEach((p) => {
          (p.jobs || []).forEach((j: any) => {
            const trimmedName = (j.name || '').trim();
            if (!trimmedName) return;
            const key = j.id || trimmedName;
            if (!jobMap.has(key)) {
              jobMap.set(key, { id: key, name: trimmedName });
            }
          });
        });
      });

      const sortedJobs = Array.from(jobMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, CURRENT_LOCALE)
      );

      const sections: {
        id: string;
        key: string;
        label: string;
        matchesParent: (p: OverviewParent) => boolean;
      }[] = [
        ...sortedJobs.map((job) => ({
          id: `overview-job-${job.id}`,
          key: job.id,
          label: job.name,
          matchesParent: (p: OverviewParent) =>
            (p.jobs || []).some(
              (j: any) =>
                (j.id && j.id === job.id) ||
                (j.name || '').trim().toLowerCase() === job.name.toLowerCase()
            ),
        })),
        {
          id: 'overview-job-none',
          key: 'none',
          label: t('overviewJobNone') || 'Aktuell kein Tollhaus Job',
          matchesParent: (p: OverviewParent) =>
            !(p.jobs || []).some((j: any) => (j.name || '').trim().length > 0),
        },
      ];

      const sectionsData = sections.map((section) => {
        const bucketLabelMatches = query ? section.label.toLowerCase().includes(query) : false;

        const familyBlocks: {
          familyId: string;
          familyName: string;
          rows: any[];
        }[] = [];

        overviewFamilies.forEach((f) => {
          const parentsInSection = (f.parents || []).filter(section.matchesParent);
          if (parentsInSection.length === 0) return;

          const familyName = getFamilyName(f);

          const sortedParents = [...parentsInSection].sort((a, b) => {
            const fnA = ((a.first_name_for_address_list || a.first_name) || '').trim();
            const fnB = ((b.first_name_for_address_list || b.first_name) || '').trim();
            const cmp = fnA.localeCompare(fnB, CURRENT_LOCALE);
            if (cmp !== 0) return cmp;
            return (a.last_name || '').localeCompare(b.last_name || '', CURRENT_LOCALE);
          });

          const mappedParents = sortedParents.map((p) => ({
            ...p,
            id: `${p.id}-${section.id}`,
            original_id: p.id,
            _rowType: 'parent' as const,
            indent_name: false,
            no_special_bg: true,
            family_id: f.id,
            family_name: familyName,
          }));

          const filteredParents = mappedParents.filter((p) => {
            if (!query || bucketLabelMatches) return true;
            const effectiveFn = ((p.first_name_for_address_list || p.first_name) || '').trim();
            const fullName = `${effectiveFn} ${p.last_name || ''}`.trim().toLowerCase();
            const fnMatch = effectiveFn.toLowerCase().includes(query) || (p.first_name || '').toLowerCase().includes(query);
            const lnMatch = (p.last_name || '').toLowerCase().includes(query);
            const emailMatch = (p.emails || []).some((e: any) => getEntryValue(e).toLowerCase().includes(query));
            const phoneMatch = (p.phones || []).some((ph: any) => getEntryValue(ph).toLowerCase().includes(query));
            const addressMatch = (p.address || '').toLowerCase().includes(query);
            const famMatch = familyName.toLowerCase().includes(query);
            const childMatch = (f.children || []).some((c) => {
              const cFn = ((c.first_name_for_address_list || c.first_name) || '').trim();
              const cFull = `${cFn} ${c.last_name || ''}`.trim().toLowerCase();
              return cFn.toLowerCase().includes(query) || (c.first_name || '').toLowerCase().includes(query) || (c.last_name || '').toLowerCase().includes(query) || cFull.includes(query);
            });
            return fnMatch || lnMatch || fullName.includes(query) || emailMatch || phoneMatch || addressMatch || famMatch || childMatch;
          });

          if (filteredParents.length > 0) {
            familyBlocks.push({
              familyId: f.id,
              familyName,
              rows: filteredParents,
            });
          }
        });

        familyBlocks.sort((a, b) => {
          const cmp = a.familyName.localeCompare(b.familyName, CURRENT_LOCALE);
          if (cmp !== 0) return cmp;
          return (a.familyId || '').localeCompare(b.familyId || '');
        });

        const subRows = familyBlocks.flatMap((fb) => fb.rows);

        return {
          id: section.id,
          family_name: section.label,
          subRows,
          hasMatchingRows: subRows.length > 0,
          nameMatch: bucketLabelMatches,
        };
      });

      return sectionsData.filter((s) => s.subRows.length > 0);
    }

    if (overviewGroupBy === 'group') {
      const groupBuckets: {
        id: string;
        key: string;
        label: string;
        matchesChild: (status: { currentGroup: number | null; plannedGroup: number | null; isFormer: boolean }) => boolean;
      }[] = [
        {
          id: 'overview-group-1',
          key: 'group1',
          label: t('overviewGroup1'),
          matchesChild: (s) => s.currentGroup === 1 || (s.currentGroup === null && s.plannedGroup === 1),
        },
        {
          id: 'overview-group-2',
          key: 'group2',
          label: t('overviewGroup2'),
          matchesChild: (s) => s.currentGroup === 2 || (s.currentGroup === null && s.plannedGroup === 2),
        },
        {
          id: 'overview-group-3',
          key: 'group3',
          label: t('overviewGroup3'),
          matchesChild: (s) => s.currentGroup === 3 || (s.currentGroup === null && s.plannedGroup === 3),
        },
        {
          id: 'overview-group-none',
          key: 'none',
          label: t('overviewGroupNone'),
          matchesChild: (s) => s.currentGroup === null && !s.plannedGroup && !s.isFormer,
        },
        {
          id: 'overview-group-former',
          key: 'former',
          label: t('overviewGroupFormer'),
          matchesChild: (s) => s.currentGroup === null && !s.plannedGroup && s.isFormer,
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
            const jobMatch = (p.jobs || []).some((j: any) => (j.name || '').toLowerCase().includes(query));
            return emailMatch || phoneMatch || addressMatch || jobMatch;
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
            groupFamilyKey,
          }));

          familyBlocks.push({
            familyId: f.id,
            familyName,
            rows: [...childrenToInclude, ...mappedParents],
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
        const jobMatch = (p.jobs || []).some((j: any) => (j.name || '').toLowerCase().includes(query));
        return emailMatch || phoneMatch || addressMatch || jobMatch;
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
  }, [overviewFamilies, globalFilter, overviewGroupBy]);

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

  const handleSaveEmployeeNames = React.useCallback(
    async (employee: Employee, firstName: string, nicknames: string[]) => {
      const originalEmployee = { ...employee };
      const updated: any = {
        ...employee,
        first_name: firstName,
        nicknames,
        type: employee.employee_type,
        is_child_protection_officer: employee.is_kinderschutzbeauftragter,
      };
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
        console.error('Failed to update employee names:', err);
      }
    },
    [getAuthHeaders, pushAction]
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

  const handleCreateEmployee = React.useCallback(
    async (payload: Partial<Employee>) => {
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
    },
    [getAuthHeaders, pushAction]
  );

  const currentCategory = getCategoryForTab(activeTab);
  const currentCategoryConfig = getCategoryConfig(currentCategory as NavigationCategory);
  const categoryLabel = currentCategoryConfig ? getCategoryLabel(currentCategoryConfig) : '';
  const hasLandingPage = categoryHasLandingPage(currentCategory, navPerms);
  const isLandingActive = Boolean(hasLandingPage && activeTab === currentCategory);
  const currentSubItem = currentCategoryConfig?.items.find((item) => item.id === activeTab);
  const shouldShowSubTabInBreadcrumbs = hasLandingPage && !isLandingActive && Boolean(currentSubItem);
  const subTabLabel = shouldShowSubTabInBreadcrumbs && currentSubItem ? getSubItemLabel(currentSubItem) : null;

  const isTableTab = !isLandingActive && (activeTab === 'familiesOverview' || activeTab === 'parents' || activeTab === 'children' || activeTab === 'families' || activeTab === 'hygieneBelehrung' || activeTab === 'members' || activeTab === 'employees' || activeTab === 'jobs');

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {isMobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleTabClick}
        perms={navPerms}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => {
          setSidebarCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('thweb_sidebar_collapsed', String(next));
            return next;
          });
        }}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        canReadOverview={canReadOverview}
        canReadEvents={canReadEvents}
        canImportEvents={canImportEvents}
        canReadFamiliesAll={canReadFamiliesAll}
        canReadFees={canReadFees}
        canReadMembers={canReadMembers}
        canReadJobs={canReadJobs}
        canReadEmployees={canReadEmployees}
        canReadVolunteerAbsences={canReadVolunteerAbsences}
        canViewMealPlan={canViewMealPlan}
        canReadMealAllergens={canReadMealAllergens}
        hasHygieneWrite={canWriteHygiene}
        canManageHygiene={canManageHygiene}
        canAccessPersonalHygiene={canAccessPersonalHygiene}
        canReadAudit={canReadAudit}
        canManageUsers={canManageUsers || hasPermission('*')}
        canViewActivity={canViewActivity}
        canProvisionKiosk={canProvisionKiosk}
        canUseDashboard={canUseDashboard}
        canViewMainPage={isMainPageActive}
        appTitle={appTitle}
        appLogoUrl={appLogoUrl}
      />

      <div className={`dashboard-container ${isTableTab ? 'table-view-active' : ''}`}>
        <header>
          <div className="header-nav-left">
            <button
              type="button"
              className="sidebar-toggle-btn mobile-only"
              onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
              aria-label={t('toggleSidebar') || 'Toggle menu'}
            >
              <Menu size={20} />
            </button>

            <div className="header-brand">
              {appLogoUrl ? (
                <>
                  <img
                    src={appLogoUrl}
                    alt={appTitle}
                    title={appTitle}
                    className="app-header-logo desktop-only"
                    onClick={() => handleTabClick(isMainPageActive ? 'main' : (canReadOverview ? 'familiesOverview' : 'families'))}
                    style={{ cursor: 'pointer' }}
                  />
                  <img
                    src={appFaviconUrl}
                    alt={appTitle}
                    title={appTitle}
                    className="app-header-favicon mobile-only"
                    onClick={() => handleTabClick(isMainPageActive ? 'main' : (canReadOverview ? 'familiesOverview' : 'families'))}
                    style={{ cursor: 'pointer' }}
                  />
                </>
              ) : (
                <h1
                  onClick={() => handleTabClick(isMainPageActive ? 'main' : (canReadOverview ? 'familiesOverview' : 'families'))}
                  style={{ cursor: 'pointer' }}
                >
                  {displayTitle}
                </h1>
              )}
            </div>

            <div className="header-breadcrumbs">
              <ChevronRight size={14} className="breadcrumb-separator" />
              {hasLandingPage && !isLandingActive ? (
                <a
                  href={`#${currentCategory}`}
                  className="breadcrumb-link breadcrumb-category"
                  onClick={(e) => {
                    e.preventDefault();
                    handleTabClick(currentCategory);
                  }}
                  aria-label={categoryLabel}
                >
                  {categoryLabel}
                </a>
              ) : (
                <span className={`breadcrumb-category ${isLandingActive || !subTabLabel ? 'breadcrumb-current' : ''}`}>
                  {categoryLabel}
                </span>
              )}
              {subTabLabel && (
                <>
                  <ChevronRight size={14} className="breadcrumb-separator" />
                  <span className="breadcrumb-current">{subTabLabel}</span>
                </>
              )}
            </div>
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
            <span className="header-user-email desktop-only" title={user?.email}>{user?.email}</span>
            <HeaderOverflowMenu
              userEmail={user?.email}
              canSelfService={canSelfService}
              onOpenSelfService={() => openSelfService()}
              canSimulate={canSimulate}
              onOpenSimulator={() => setSimulatorModalOpen(true)}
              onOpenFeedback={() => setFeedbackModalOpen(true)}
              canInstallPwa={canInstallPwa}
              onOpenInstallPwa={() => setPwaInstallModalOpen(true)}
              onLogout={logout}
              onSelectTab={handleTabClick}
              canReadAudit={canReadAudit}
              canManageUsers={canManageUsers || hasPermission('*')}
              canViewActivity={canViewActivity}
              canProvisionKiosk={canProvisionKiosk}
              canUseDashboard={canUseDashboard}
              activeTab={activeTab}
            />
          </div>
        </header>
        <main
          className={isTableTab ? 'main-table-view' : 'main-scroll-view'}
          aria-hidden={isMobile && isMobileSidebarOpen ? 'true' : undefined}
        >
          {/* Segmented Control Sub-Tabs (Hybrid bar directly above table/content) */}
          <SegmentedSubNav
            activeTab={activeTab}
            onSelectTab={handleTabClick}
            perms={navPerms}
            currentCategory={currentCategory}
            sidebarCollapsed={sidebarCollapsed}
          />

          {/* Category Landing Page */}
          {isLandingActive && currentCategoryConfig ? (
            <CategoryLandingPage
              category={currentCategoryConfig}
              perms={navPerms}
              activeTab={activeTab}
              onSelectTab={handleTabClick}
            />
          ) : (
            <>

        {/* Navigation Context Banner (Pattern 2) */}
        {!isLandingActive && returnNav && (activeTab === 'parents' || activeTab === 'children') && (
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

        {(() => {
          const renderVaccinationButton = (extraClass?: string) => {
            if (!hasPermission('vaccination.status.manage') || (activeTab !== 'parents' && activeTab !== 'children')) {
              return null;
            }
            return (
              <div
                className={`controls-right vaccination-controls-slot ${extraClass || ''}`}
                style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}
              >
                {isVaccinationUnlocked ? (
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
                )}
              </div>
            );
          };

          return !isLandingActive && activeTab !== 'main' && activeTab !== 'events' && activeTab !== 'eventsImport' && activeTab !== 'childcareFees' && activeTab !== 'childcareFeesAll' && activeTab !== 'audit' && activeTab !== 'admin' && activeTab !== 'kiosk' && activeTab !== 'dashboard' && activeTab !== 'dashboardTodos' && activeTab !== 'mealPlan' && activeTab !== 'mealAllergens' && activeTab !== 'hygieneDocument' && activeTab !== 'kochenHygiene' && activeTab !== 'volunteerAbsences' && (
            (activeTab === 'families' || activeTab === 'parents' || activeTab === 'children') ? (
              <div className="mga-controls-container">
                {/* Row 1: Search, Sort, Filter, Zoom (desktop), and Impfstatus (desktop far right) */}
                <div className="controls-row mga-controls-row-1">
                  <div className="controls-left">
                    <input
                      value={globalFilter ?? ''}
                      onChange={(e) => setGlobalFilter(e.target.value)}
                      className="search-input"
                      placeholder={
                        activeTab === 'families'
                          ? t('searchFamilies')
                          : activeTab === 'children'
                          ? t('searchChildren')
                          : t('searchParents')
                      }
                      style={{ marginBottom: 0 }}
                    />

                    <button
                      ref={sortButtonRef}
                      type="button"
                      onClick={() => setSortPopoverOpen((prev) => !prev)}
                      className="secondary-button family-sort-button"
                      title={`${t('sort')}: ${getSortOptionLabel(familySortOrder)}`}
                      aria-label={t('sortFamiliesTitle')}
                    >
                      <ArrowUpDown size={14} />
                      <span className="family-sort-label">{t('sort')}: {getSortOptionLabel(familySortOrder)}</span>
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

                    {/* Desktop Segmented Lifecycle Filter */}
                    <div
                      className="lifecycle-filter-toggle desktop-only"
                      role="group"
                      aria-label={t('filterLifecycle') || 'Status-Filter'}
                      style={{
                        alignItems: 'center',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '2px',
                        height: '34px',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                      }}
                    >
                        <button
                          type="button"
                          onClick={() => setMgaLifecycleFilter('all')}
                          className={`segmented-filter-btn ${mgaLifecycleFilter === 'all' ? 'active' : ''}`}
                          style={{
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.82rem',
                            fontWeight: mgaLifecycleFilter === 'all' ? 600 : 400,
                            border: 'none',
                            borderRadius: '3px',
                            background: mgaLifecycleFilter === 'all' ? 'var(--primary)' : 'transparent',
                            color: mgaLifecycleFilter === 'all' ? '#ffffff' : 'var(--text)',
                            cursor: 'pointer',
                            height: '100%',
                            transition: 'background-color 0.15s, color 0.15s',
                          }}
                        >
                          {t('filterAll')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMgaLifecycleFilter('active')}
                          className={`segmented-filter-btn ${mgaLifecycleFilter === 'active' ? 'active' : ''}`}
                          style={{
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.82rem',
                            fontWeight: mgaLifecycleFilter === 'active' ? 600 : 400,
                            border: 'none',
                            borderRadius: '3px',
                            background: mgaLifecycleFilter === 'active' ? 'var(--primary)' : 'transparent',
                            color: mgaLifecycleFilter === 'active' ? '#ffffff' : 'var(--text)',
                            cursor: 'pointer',
                            height: '100%',
                            transition: 'background-color 0.15s, color 0.15s',
                          }}
                        >
                          {t('filterActive')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMgaLifecycleFilter('former')}
                          className={`segmented-filter-btn ${mgaLifecycleFilter === 'former' ? 'active' : ''}`}
                          style={{
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.82rem',
                            fontWeight: mgaLifecycleFilter === 'former' ? 600 : 400,
                            border: 'none',
                            borderRadius: '3px',
                            background: mgaLifecycleFilter === 'former' ? 'var(--primary)' : 'transparent',
                            color: mgaLifecycleFilter === 'former' ? '#ffffff' : 'var(--text)',
                            cursor: 'pointer',
                            height: '100%',
                            transition: 'background-color 0.15s, color 0.15s',
                          }}
                        >
                          {t('filterFormer')}
                        </button>
                      </div>

                    {/* Mobile Filter Button (same size as sort button, filter icon, opens popover) */}
                    <button
                      ref={lifecycleFilterButtonRef}
                      type="button"
                      onClick={() => setLifecycleFilterPopoverOpen((prev) => !prev)}
                      className="secondary-button lifecycle-filter-button mobile-only"
                          title={`${t('filterLifecycle') || 'Filter'}: ${
                            mgaLifecycleFilter === 'active'
                              ? t('filterActive')
                              : mgaLifecycleFilter === 'former'
                              ? t('filterFormer')
                              : t('filterAll')
                          }`}
                          aria-label={t('filterLifecycle') || 'Filter'}
                          style={{
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.45rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            border: '1px solid var(--border)',
                            background: mgaLifecycleFilter !== 'all' ? 'var(--primary-subtle, rgba(0, 100, 200, 0.08))' : 'var(--bg-surface)',
                            color: mgaLifecycleFilter !== 'all' ? 'var(--primary)' : 'var(--text)',
                            height: '34px',
                            width: '34px',
                            minWidth: '34px',
                            boxSizing: 'border-box',
                            flexShrink: 0,
                          }}
                        >
                          <Filter size={14} />
                        </button>

                        <CellPopover
                          isOpen={lifecycleFilterPopoverOpen}
                          onClose={() => setLifecycleFilterPopoverOpen(false)}
                          anchorEl={lifecycleFilterButtonRef}
                          width={180}
                          minWidth={160}
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
                              marginBottom: '0.35rem',
                            }}
                          >
                            {t('filterLifecycle') || 'Status-Filter'}
                          </div>
                          {[
                            { key: 'all', label: t('filterAll') },
                            { key: 'active', label: t('filterActive') },
                            { key: 'former', label: t('filterFormer') },
                          ].map((opt) => {
                            const isSelected = mgaLifecycleFilter === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                className="lifecycle-filter-option-btn"
                                onClick={() => {
                                  setMgaLifecycleFilter(opt.key as any);
                                  setLifecycleFilterPopoverOpen(false);
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
                              >
                                <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isSelected && <Check size={14} color="var(--primary)" />}
                                </div>
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </CellPopover>

                    <div className="table-zoom-control-container desktop-only">
                      <TableZoomControl />
                    </div>
                  </div>

                  {/* Impfstatus on Row 1 (desktop only) */}
                  {renderVaccinationButton('desktop-only')}
                </div>

                {/* Row 2: Familie hinzufügen & Undo/Redo on left, Impfstatus on mobile far right */}
                <div className="controls-row mga-controls-row-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
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

                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
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

                    {activeTab === 'families' && (
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <button
                          ref={printMgaButtonRef}
                          type="button"
                          onClick={() => setPrintMgaMenuOpen((prev) => !prev)}
                          className="secondary-button print-toolbar-button"
                          data-testid="print-toolbar-button-mga"
                          title={t('print') || 'Drucken'}
                          aria-label={t('print') || 'Drucken'}
                          aria-haspopup="menu"
                          aria-expanded={printMgaMenuOpen}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            height: '34px',
                            padding: '0.45rem 0.85rem',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            border: '1px solid var(--border)',
                            background: 'var(--surface, #ffffff)',
                            color: 'var(--text, #1f2937)',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                          }}
                        >
                          <Printer size={15} />
                          <span>{t('print') || 'Drucken'}</span>
                        </button>

                        <CellPopover
                          isOpen={printMgaMenuOpen}
                          onClose={() => setPrintMgaMenuOpen(false)}
                          anchorEl={printMgaButtonRef}
                          width={200}
                          minWidth={180}
                        >
                          <div role="menu" style={{ padding: '0.25rem 0' }}>
                            <button
                              type="button"
                              role="menuitem"
                              data-testid="print-menu-item-group-overview-mga"
                              onClick={() => {
                                setPrintMgaMenuOpen(false);
                                if (canReadFamiliesAll && families.length === 0) {
                                  fetchFamilies();
                                } else if (overviewFamilies.length === 0 && canReadOverview) {
                                  fetchOverviewFamilies();
                                }
                                setGroupPrintModalOpen(true);
                              }}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.875rem',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text, #1e293b)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                borderRadius: '2px',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0, 0, 0, 0.04))';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <Users size={16} />
                              <span>{t('groupOverview') || 'Gruppenübersicht'}</span>
                            </button>
                          </div>
                        </CellPopover>
                      </div>
                    )}
                  </div>

                  {/* Impfstatus and Column Picker on Row 2 (mobile only, far right) */}
                  <div className="mga-controls-row-2-right" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
                    {renderVaccinationButton('mobile-only')}
                    <div id="cards-view-columns-slot" style={{ display: 'inline-flex', alignItems: 'center' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div
                  className={`controls-left ${activeTab === 'familiesOverview' ? 'overview-controls-left' : ''}`}
                  style={{
                    display: 'flex',
                    gap: activeTab === 'familiesOverview' ? '1.25rem' : '0.75rem',
                    alignItems: 'center',
                    flexWrap: activeTab === 'familiesOverview' ? 'nowrap' : 'wrap',
                  }}
                >
                  <input
                    value={globalFilter ?? ''}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className={`search-input ${activeTab === 'familiesOverview' ? 'overview-search-input' : ''}`}
                    placeholder={
                      activeTab === 'employees'
                        ? (t('searchEmployees') || 'Mitarbeiter suchen...')
                        : activeTab === 'jobs'
                        ? (t('searchJobs') || 'Jobs suchen...')
                        : activeTab === 'members'
                        ? t('searchMembers')
                        : (t('search') || 'Suche')
                    }
                    style={{ marginBottom: 0 }}
                  />

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

                  {activeTab === 'jobs' && canWriteJobs && (
                    <button
                      type="button"
                      onClick={() => setAddJobOpen(true)}
                      className="primary-button add-job-button"
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
                      <span>{t('addJobBtn') || 'Job'}</span>
                    </button>
                  )}

                  {activeTab === 'familiesOverview' && (
                    <div
                      className="overview-grouping-toggle"
                      role="group"
                      aria-label={t('groupingLabel')}
                    >
                      <button
                        type="button"
                        onClick={() => setOverviewGroupBy('family')}
                        aria-pressed={overviewGroupBy === 'family'}
                        className={`overview-grouping-btn ${overviewGroupBy === 'family' ? 'active' : ''}`}
                      >
                        {t('groupByFamily')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverviewGroupBy('group')}
                        aria-pressed={overviewGroupBy === 'group'}
                        className={`overview-grouping-btn ${overviewGroupBy === 'group' ? 'active' : ''}`}
                      >
                        {t('groupByGroup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverviewGroupBy('job')}
                        aria-pressed={overviewGroupBy === 'job'}
                        className={`overview-grouping-btn ${overviewGroupBy === 'job' ? 'active' : ''}`}
                      >
                        {t('groupByJob')}
                      </button>
                    </div>
                  )}

                  {activeTab === 'familiesOverview' && (
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <button
                        ref={printButtonRef}
                        type="button"
                        onClick={() => setPrintMenuOpen((prev) => !prev)}
                        className="secondary-button print-toolbar-button"
                        data-testid="print-toolbar-button"
                        title={t('print') || 'Drucken'}
                        aria-label={t('print') || 'Drucken'}
                        aria-haspopup="menu"
                        aria-expanded={printMenuOpen}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          height: '34px',
                          padding: '0.45rem 0.85rem',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: 'var(--surface, #ffffff)',
                          color: 'var(--text, #1f2937)',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box',
                        }}
                      >
                        <Printer size={15} />
                        <span>{t('print') || 'Drucken'}</span>
                      </button>

                      <CellPopover
                        isOpen={printMenuOpen}
                        onClose={() => setPrintMenuOpen(false)}
                        anchorEl={printButtonRef}
                        width={200}
                        minWidth={180}
                      >
                        <div role="menu" style={{ padding: '0.25rem 0' }}>
                          <button
                            type="button"
                            role="menuitem"
                            data-testid="print-menu-item-group-overview"
                            onClick={() => {
                              setPrintMenuOpen(false);
                              if (canReadFamiliesAll && families.length === 0) {
                                fetchFamilies();
                              } else if (overviewFamilies.length === 0 && canReadOverview) {
                                fetchOverviewFamilies();
                              }
                              setGroupPrintModalOpen(true);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.875rem',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text, #1e293b)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              borderRadius: '2px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0, 0, 0, 0.04))';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <Users size={16} />
                            <span>{t('groupOverview') || 'Gruppenübersicht'}</span>
                          </button>
                        </div>
                      </CellPopover>
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

                  <div id="cards-view-columns-slot" style={{ display: 'inline-flex', alignItems: 'center' }} />
                </div>

                <div
                  className="controls-right desktop-only"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}
                >
                  <TableZoomControl />
                </div>
              </div>
            )
          );
        })()}

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

        {activeTab === 'main' ? (
          <div className="tab-scroll-content main-page-tab-scroll" data-testid="main-page-scroll-container">
            <MainPage
              onNavigate={handleTabClick}
              canViewMealPlan={canViewMealPlan}
              canUseDashboard={canUseDashboard}
              canReadOverview={canReadOverview}
              canReadFees={canReadFees}
              canReadMealAllergens={canReadMealAllergens}
              canAccessMga={canReadFamiliesAll || canReadMembers || canReadJobs}
              targetMgaTab={categoryHasLandingPage('mga', navPerms) ? 'mga' : getFirstPermittedTabForCategory('mga', navPerms)}
              userName={currentAuthUserFirstName}
            />
          </div>
        ) : activeTab === 'familiesOverview' ? (
          <FamiliesOverviewTab
            data={overviewFamiliesTabData}
            isMobile={isMobile}
            canReadFamiliesAll={canReadFamiliesAll}
            overviewGroupBy={overviewGroupBy}
            highlightedRowId={highlightedRowId}
            currentFamilyId={user?.family_id}
            canSelfService={canSelfService}
            onOpenSelfService={openSelfService}
            onJumpToParent={handleJumpToParent}
            onJumpToChild={handleJumpToChild}
            getChildGroupStatus={getOverviewChildGroupStatus}
          />
        ) : activeTab === 'parents' ? (
          <ParentsTab
            data={parentsFamilyData}
            families={families}
            canWriteParents={canWriteParents}
            canWriteJobs={canWriteJobs}
            canWriteFamilies={canWriteFamilies}
            hasPermission={hasPermission}
            isVaccinationUnlocked={isVaccinationUnlocked}
            highlightedRowId={highlightedRowId}
            membershipPopoverAnchor={membershipPopoverAnchor}
            targetParentMemberships={targetParentMemberships}
            contactConsentPopoverAnchor={contactConsentPopoverAnchor}
            activeParentForConsent={activeParentForConsent}
            multiValuePopoverAnchor={multiValuePopoverAnchor}
            activeParentForMultiValue={activeParentForMultiValue}
            activeMultiValueField={activeMultiValueField}
            vaccinationPopoverAnchor={vaccinationPopoverAnchor}
            targetVaccinationPerson={targetVaccinationPerson}
            jobsPopoverAnchor={jobsPopoverAnchor}
            activePersonForJobs={activePersonForJobs}
            mentorPopoverAnchor={mentorPopoverAnchor}
            activeFamilyForMentor={activeFamilyForMentor}
            onSaveParentNames={handleSaveParentNames}
            onSaveParentField={handleSaveParentField}
            onSaveFamilyParents={handleSaveFamilyParents}
            onDeleteParent={handleDeleteParent}
            onAddParent={openAddParent}
            onJumpToFamily={handleJumpFromParentsToChildren}
            onJumpToFamilyTab={handleJumpToFamily}
            onOpenManageMemberships={openManageMemberships}
            onOpenManageConsent={openManageConsent}
            onOpenManageMultiValue={openManageMultiValue}
            onOpenManageVaccination={openManageVaccination}
            onOpenManageJobs={openManageJobs}
            onOpenManageMentor={openManageMentor}
            onOpenFamilyNotes={openFamilyNotes}
            onRequestKmsAuth={handleRequestKmsAuth}
          />
        ) : activeTab === 'children' ? (
          <ChildrenTab
            data={childrenFamilyData}
            families={families}
            canWriteChildren={canWriteChildren}
            canReadChildAllergies={canReadChildAllergies}
            canWriteChildAllergies={canWriteChildAllergies}
            hasPermission={hasPermission}
            isVaccinationUnlocked={isVaccinationUnlocked}
            highlightedRowId={highlightedRowId}
            groupPopoverAnchor={groupPopoverAnchor}
            targetChildGroupChanges={targetChildGroupChanges}
            familiencardPopoverAnchor={familiencardPopoverAnchor}
            targetChildFamiliencards={targetChildFamiliencards}
            vaccinationPopoverAnchor={vaccinationPopoverAnchor}
            targetVaccinationPerson={targetVaccinationPerson}
            activeChildForMultiValue={activeChildForMultiValue}
            activeMultiValueField={activeMultiValueField}
            onSaveChildNames={handleSaveChildNames}
            onSaveChildField={handleSaveChildField}
            onDeleteChild={handleDeleteChild}
            onAddChild={openAddChild}
            onJumpToFamily={handleJumpFromChildrenToParents}
            onOpenManageGroupChanges={openManageGroupChanges}
            onOpenManageFamiliencards={openManageFamiliencards}
            onOpenManageVaccination={openManageVaccination}
            onOpenManageChildMultiValue={openManageChildMultiValue}
            onOpenFamilyNotes={openFamilyNotes}
            onRequestKmsAuth={handleRequestKmsAuth}
          />
        ) : activeTab === 'families' ? (
          <FamiliesTab
            data={familiesTabData}
            families={families}
            canWriteParents={canWriteParents}
            canWriteChildren={canWriteChildren}
            canWriteFamilies={canWriteFamilies}
            highlightedRowId={highlightedRowId}
            groupPopoverAnchor={groupPopoverAnchor}
            targetChildGroupChanges={targetChildGroupChanges}
            mentorPopoverAnchor={mentorPopoverAnchor}
            activeFamilyForMentor={activeFamilyForMentor}
            onJumpToParent={handleJumpToParent}
            onJumpToChild={handleJumpToChild}
            onJumpToFamily={handleJumpToFamily}
            onAddParent={openAddParent}
            onAddChild={openAddChild}
            onOpenManageMentor={openManageMentor}
            onOpenFamilyNotes={openFamilyNotes}
            onOpenManageGroupChanges={openManageGroupChanges}
          />
        ) : activeTab === 'hygieneBelehrung' ? (
          <DataTable
            key="hygieneBelehrung"
            data={parentsFamilyData}
            columns={hygieneColumns}
            getSubRows={(row: any) => row.parents}
            highlightedRowId={highlightedRowId}
          />
        ) : activeTab === 'members' && canReadMembers ? (
          <MembersTab
            members={members}
            searchQuery={globalFilter}
            highlightedRowId={highlightedRowId}
            canReadFamiliesAll={canReadFamiliesAll}
            canWriteMemberships={canWriteMemberships}
            onJumpToParent={handleJumpToParent}
            onOpenManageMemberships={openManageMemberships}
          />
        ) : activeTab === 'employees' && canReadEmployees ? (
          <EmployeesTab
            employees={employees}
            searchQuery={globalFilter}
            highlightedRowId={highlightedRowId}
            canWriteEmployees={canWriteEmployees}
            canReadEmployeeAllergies={canReadEmployeeAllergies}
            canWriteEmployeeAllergies={canWriteEmployeeAllergies}
            canWriteJobs={canWriteJobs}
            isCreateModalOpen={addEmployeeOpen}
            onCloseCreateModal={() => setAddEmployeeOpen(false)}
            onCreateEmployee={handleCreateEmployee}
            onSaveEmployeeField={handleSaveEmployeeField}
            onSaveEmployeeNames={handleSaveEmployeeNames}
            onDeleteEmployee={handleDeleteEmployee}
            activeEmployeeForMultiValue={activeEmployeeForMultiValue}
            activeMultiValueField={activeMultiValueField}
            onOpenManageMultiValue={openManageEmployeeMultiValue}
            jobsPopoverAnchor={jobsPopoverAnchor}
            activePersonForJobs={activePersonForJobs}
            onOpenManageJobs={openManageJobs}
          />
        ) : activeTab === 'jobs' && canReadJobs ? (
          <JobsTab
            jobs={jobs}
            canWriteJobs={canWriteJobs}
            canReadJobRoles={canReadJobRoles}
            canWriteJobRoles={canWriteJobRoles}
            availableRoles={availableRoles}
            onUpdateJobRoles={handleUpdateJobRoles}
            searchQuery={globalFilter}
            highlightedRowId={highlightedRowId}
            isCreateModalOpen={addJobOpen}
            onOpenCreateModal={() => setAddJobOpen(true)}
            onCloseCreateModal={() => setAddJobOpen(false)}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onUpdateJobAssignees={handleUpdateJobAssignees}
            onFetchPeople={handleFetchJobPeople}
            onJumpToPerson={(personId, type, familyId, familyName) => {
              if (type === 'parent' && canReadFamiliesAll) {
                handleJumpToParent(personId, familyId || '', familyName || '', 'jobs' as any);
              } else if (type === 'employee' && canReadEmployees) {
                setGlobalFilter('');
                setActiveTab('employees');
                setHighlightTarget({ id: personId, key: Date.now() });
                window.location.hash = `employees?highlight=${personId}`;
              }
            }}
          />
        ) : (
          <div className={`tab-scroll-content ${activeTab === 'dashboard' ? 'tab-scroll-dashboard' : ''}`}>
            {activeTab === 'audit' && canReadAudit ? (
              <AuditLogView
                families={families.length > 0 ? families : (overviewFamilies as any)}
                getAuthHeaders={getAuthHeaders}
                refreshTrigger={auditRefreshTrigger}
              />
            ) : activeTab === 'volunteerAbsences' && canReadVolunteerAbsences ? (
              <VolunteerAbsencesTab />
            ) : activeTab === 'events' && canReadEvents ? (
              <EventsTab />
            ) : activeTab === 'eventsImport' && canImportEvents ? (
              <EventsImportTab />
            ) : activeTab === 'admin' && canManageUsers ? (
              <AdminView onOpenSimulator={() => setSimulatorModalOpen(true)} />
            ) : activeTab === 'activity' && canViewActivity ? (
              <FeedbackAndActivityView token={token} />
            ) : activeTab === 'kiosk' && canProvisionKiosk ? (
              <KioskProvisioning token={token} />
            ) : activeTab === 'mealPlan' && canViewMealPlan ? (
              <MealPlanTab />
            ) : activeTab === 'mealAllergens' && canReadMealAllergens ? (
              <MealAllergensTab />
            ) : activeTab === 'kochenHygiene' && canAccessPersonalHygiene ? (
              <PersonalHygieneTab onRefreshParentData={fetchFamilies} />
            ) : activeTab === 'hygieneDocument' && canManageHygiene ? (
              <HygieneDocumentTab />
            ) : activeTab === 'dashboard' && canUseDashboard ? (
              <KioskDashboard embedded={true} />
            ) : activeTab === 'dashboardTodos' && canManageDashboardTodos ? (
              <DashboardTodosAdminTab />
            ) : activeTab === 'childcareFees' && canReadFees ? (
              <ChildcareFeesCalculator
                key="personal"
                token={token}
                families={families.length > 0 ? families : (overviewFamilies as any)}
                mode="personal"
              />
            ) : activeTab === 'childcareFeesAll' && canReadFeesAll ? (
              <ChildcareFeesCalculator
                key="all"
                token={token}
                families={families.length > 0 ? families : (overviewFamilies as any)}
                mode="all"
              />
            ) : null}
          </div>
        )}
            </>
          )}
      </main>

      <ImpressumFooter isInternal={true} />



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

              <div className="modal-divider" style={{ margin: '1rem 0' }}></div>

              <div className="modal-form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    id="f-historical-alumni"
                    type="checkbox"
                    checked={isHistoricalAlumni}
                    onChange={(e) => setIsHistoricalAlumni(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <span>{t('isHistoricalAlumniLabel')}</span>
                </label>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  {t('isHistoricalAlumniHint')}
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
          defaultMembershipType={undefined}
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

        {/* Manage Mentors Popover */}
        <MentorPopover
          key={activeFamilyForMentorMemo?.id || 'mentor-popover'}
          isOpen={Boolean(mentorPopoverAnchor && activeFamilyForMentorMemo)}
          anchorEl={mentorPopoverAnchor}
          onClose={closeManageMentor}
          family={activeFamilyForMentorMemo}
          allFamilies={families}
          onSaveMentor={handleSaveFamilyMentor}
          readOnly={!canWriteFamilies}
        />

        {/* Family Notes Editor Popover */}
        <FamilyNotesEditor
          key={activeFamilyForNotesMemo?.id || 'family-notes-popover'}
          isOpen={Boolean(familyNotesPopoverAnchor && activeFamilyForNotesMemo)}
          anchorEl={familyNotesPopoverAnchor}
          onClose={closeFamilyNotes}
          family={activeFamilyForNotesMemo}
          target={activeNotesTarget}
          onSaveFamilyNotes={handleSaveFamilyNotes}
          onSaveParentNotes={(p, val) => handleSaveParentField(p, 'notes', val)}
          onSaveChildNotes={(c, val) => handleSaveChildField(c, 'notes', val)}
          onJumpToParent={handleJumpToParent}
          onJumpToChild={handleJumpToChild}
          canWriteFamilies={canWriteFamilies}
          canWriteParents={canWriteParents}
          canWriteChildren={canWriteChildren}
        />

        {/* Manage Multi-Values (Emails / Phones / Allergies) Popover */}
        {activeMultiValueField === 'allergies' ? (
          <AllergiesListEditor
            key={`${(activeParentForMultiValue || activeChildForMultiValue || activeEmployeeForMultiValue)?.id || 'unknown'}-allergies`}
            isOpen={Boolean(multiValuePopoverAnchor && (activeParentForMultiValue || activeChildForMultiValue || activeEmployeeForMultiValue) && activeMultiValueField === 'allergies')}
            anchorEl={multiValuePopoverAnchor}
            onClose={closeManageMultiValue}
            values={activeMultiValueValues}
            title={activeMultiValueTitle}
            placeholder={activeMultiValuePlaceholder}
            onSave={handleSaveActiveMultiValue}
            canDeleteItem={canDeleteMultiValueItem}
            canEditItem={canEditMultiValueItem}
            disabledReason={getMultiValueDisabledReason}
          />
        ) : (
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
        )}

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

        {/* Manage Jobs Popover */}
        <JobsPopover
          key={activePersonForJobs?.id || 'jobs-popover'}
          isOpen={Boolean(jobsPopoverAnchor && activePersonForJobs)}
          anchorEl={jobsPopoverAnchor}
          onClose={() => {
            setJobsPopoverAnchor(null);
            setActivePersonForJobs(null);
          }}
          person={activePersonForJobs}
          availableJobs={jobs}
          onSaveJobs={handleSavePersonJobs}
          readOnly={
            activePersonForJobs?.type === 'employee'
              ? !(canWriteEmployees || canWriteJobs)
              : !(canWriteParents || canWriteJobs)
          }
        />

        {/* Manage Contact Consent Popover */}
        <ContactConsentPopover
          key={activeParentForConsent?.id || 'contact-consent-popover'}
          isOpen={Boolean(contactConsentPopoverAnchor && activeParentForConsent)}
          anchorEl={contactConsentPopoverAnchor}
          onClose={closeManageConsent}
          parent={activeParentForConsent}
          onSave={handleSaveContactConsent}
          onDelete={handleDeleteContactConsent}
          readOnly={!canWriteParents}
        />

        {/* Parent Contact Self-Service Modal */}
        <ParentContactSelfServiceModal
          isOpen={selfServiceModalOpen}
          onClose={() => setSelfServiceModalOpen(false)}
          getAuthHeaders={getAuthHeaders}
          onSaved={() => {
            fetchOverviewFamilies();
            if (canReadFamiliesAll) {
              fetchFamilies();
            }
          }}
          initialParentId={selfServiceInitialParentId}
          userEmail={user?.email}
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

        {/* Feedback Modal from Header Overflow Menu or Diagnostic Prompts */}
        <FeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => {
            setFeedbackModalOpen(false);
            setFeedbackInitialData({});
          }}
          token={token}
          initialType={feedbackInitialData.type}
          initialDescription={feedbackInitialData.description}
        />

        {/* PWA Install Instructions Modal from Header Overflow Menu */}
        <PwaInstallModal
          isOpen={pwaInstallModalOpen}
          onClose={() => setPwaInstallModalOpen(false)}
        />

        {/* Group Overview Print Modal */}
        <GroupOverviewPrintModal
          isOpen={groupPrintModalOpen}
          onClose={() => setGroupPrintModalOpen(false)}
          families={families.length > 0 ? families : (overviewFamilies as any)}
          getChildGroupStatus={getOverviewChildGroupStatus}
        />
      </div>
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
