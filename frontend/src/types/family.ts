import type { MultiValueEntry } from '../components/Table/MultiValueListEditor';
import type { VaccinationCheck } from '../components/Table/VaccinationStatusEditor';
import type { ContactConsentItem } from '../components/Table/ContactConsentPopover';
import type { JobItem } from '../components/Table/JobsPopover';
import { t } from '../utils/i18n';

export interface THMembership {
  id: string;
  parent_id: string;
  start_date: string;
  end_date: string | null;
  membership_type: 'full_member' | 'supporting_member';
  created_at: string;
  updated_at: string;
}

export interface HygieneBelehrungEvent {
  id: string;
  parent_id: string;
  event_date: string;
  event_type: 'initial' | 'recertify';
  documentation: string;
  created_at: string;
  updated_at: string;
}

export interface Parent {
  id: string;
  family_id: string;
  first_name: string;
  first_name_for_address_list?: string;
  nicknames?: string[];
  last_name: string;
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  notes?: string;
  vaccination_checks?: VaccinationCheck[];
  events?: HygieneBelehrungEvent[];
  memberships?: THMembership[];
  contact_consents?: ContactConsentItem[];
  jobs?: JobItem[];
  family_name?: string;
}

export interface ChildGroupChange {
  id: string;
  child: string;
  change_date: string;
  target_group: number; // 0: exit, 1: Kleine Gruppe, 2: Grosse Gruppe, 3: Hort
  created_at: string;
  updated_at: string;
}

export interface Child {
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

export interface Family {
  id: string;
  created_at: string;
  parents: Parent[];
  children?: Child[];
  mentor_family_id?: string | null;
  mentor_parent_ids?: string[] | null;
  notes?: string;
  family_type?: 'regular' | 'historical_alumni';
}

export interface OverviewParent {
  id: string;
  first_name: string;
  first_name_for_address_list?: string;
  last_name: string;
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  memberships?: THMembership[];
  contact_consents?: ContactConsentItem[];
  jobs?: JobItem[];
}

export interface OverviewChild {
  id: string;
  first_name: string;
  first_name_for_address_list?: string;
  last_name: string;
  current_group?: number | null;
  planned_group?: number | null;
  is_former?: boolean;
  group_changes?: ChildGroupChange[];
}

export interface OverviewFamily {
  id: string;
  family_type?: 'regular' | 'historical_alumni';
  parents: OverviewParent[];
  children?: OverviewChild[];
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

export function getSortOptionLabel(sortOrder: FamilySortOrder): string {
  for (const group of sortOptionGroups) {
    const found = group.options.find((opt) => opt.key === sortOrder);
    if (found) {
      return t(found.labelKey);
    }
  }
  return '';
}
