import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { FirstNameEditor } from '../Table/FirstNameEditor';
import { AddressEditor } from '../Table/AddressEditor';
import EasyEdit, { Types as EasyEditTypes } from '../InlineEdit';
import { RowActionsMenu } from '../Table/RowActionsMenu';
import { FamilyNotesCell } from '../Table/FamilyNotesEditor';
import { VaccinationStatusCell } from '../Table/VaccinationStatusEditor';
import { JobsCell } from '../Table/JobsPopover';
import {
  ParentMembershipCell,
  ParentConsentCell,
  ParentMultiValueCell,
  ParentMentorsCell,
  ParentMentorsOfCell,
} from './ParentCells';
import { t } from '../../utils/i18n';
import type { Parent, Family } from '../../types/family';

const EasyEditComponent = EasyEdit;

export interface ParentsTabProps {
  data: any[];
  families: Family[];
  canWriteParents: boolean;
  canWriteJobs: boolean;
  canWriteFamilies: boolean;
  hasPermission: (permission: string) => boolean;
  isVaccinationUnlocked: boolean;
  highlightedRowId?: string | null;
  membershipPopoverAnchor?: HTMLElement | string | null;
  targetParentMemberships?: Parent | null;
  contactConsentPopoverAnchor?: HTMLElement | null;
  activeParentForConsent?: Parent | null;
  multiValuePopoverAnchor?: HTMLElement | string | null;
  activeParentForMultiValue?: Parent | null;
  activeMultiValueField?: string | null;
  vaccinationPopoverAnchor?: HTMLElement | string | null;
  targetVaccinationPerson?: { type: 'parent' | 'child'; id: string } | null;
  jobsPopoverAnchor?: HTMLElement | null;
  activePersonForJobs?: { id: string } | null;
  mentorPopoverAnchor?: HTMLElement | string | null;
  activeFamilyForMentor?: Family | null;
  onSaveParentNames: (parent: Parent, firstName: string, firstNameForAddressList: string, nicknames: string[]) => Promise<void>;
  onSaveParentField: (parent: Parent, field: keyof Parent, val: any) => Promise<any>;
  onSaveFamilyParents: (familyId: string, updatedParents: Parent[]) => void | Promise<any>;
  onDeleteParent: (id: string) => void | Promise<void>;
  onAddParent?: (familyId: string, familyName: string) => void;
  onJumpToFamily?: (familyId: string, familyName: string) => void;
  onJumpToFamilyTab?: (familyId: string, tab?: any) => void;
  onOpenManageMemberships: (parent: Parent, anchor: HTMLElement | string) => void;
  onOpenManageConsent: (parent: Parent, anchor: HTMLElement) => void;
  onOpenManageMultiValue: (parent: Parent, field: 'emails' | 'phones', anchor: HTMLElement | string) => void;
  onOpenManageVaccination: (personId: string, personType: 'parent' | 'child', anchor: HTMLElement | string) => void;
  onOpenManageJobs: (person: any, anchor: HTMLElement | string) => void;
  onOpenManageMentor: (family: Family, anchor: HTMLElement) => void;
  onOpenFamilyNotes: (family: Family, target: { type: 'parent'; id: string }, anchor: HTMLElement | string) => void;
  onRequestKmsAuth: () => void;
}

export const ParentsTab: React.FC<ParentsTabProps> = ({
  data,
  families,
  canWriteParents,
  canWriteJobs,
  canWriteFamilies,
  hasPermission,
  isVaccinationUnlocked,
  highlightedRowId,
  membershipPopoverAnchor,
  targetParentMemberships,
  contactConsentPopoverAnchor,
  activeParentForConsent,
  multiValuePopoverAnchor,
  activeParentForMultiValue,
  activeMultiValueField,
  vaccinationPopoverAnchor,
  targetVaccinationPerson,
  jobsPopoverAnchor,
  activePersonForJobs,
  mentorPopoverAnchor,
  activeFamilyForMentor,
  onSaveParentNames,
  onSaveParentField,
  onSaveFamilyParents,
  onDeleteParent,
  onAddParent,
  onJumpToFamily,
  onJumpToFamilyTab,
  onOpenManageMemberships,
  onOpenManageConsent,
  onOpenManageMultiValue,
  onOpenManageVaccination,
  onOpenManageJobs,
  onOpenManageMentor,
  onOpenFamilyNotes,
  onRequestKmsAuth,
}) => {
  const canManageVaccination = hasPermission('vaccination.status.manage');
  const callbacksRef = React.useRef({
    onSaveParentNames,
    onSaveParentField,
    onSaveFamilyParents,
    onDeleteParent,
    onRequestKmsAuth,
    onOpenManageMemberships,
    onOpenManageConsent,
    onOpenManageMultiValue,
    onOpenManageVaccination,
    onOpenManageJobs,
    onOpenManageMentor,
    onJumpToFamilyTab,
    onOpenFamilyNotes,
  });
  callbacksRef.current = {
    onSaveParentNames,
    onSaveParentField,
    onSaveFamilyParents,
    onDeleteParent,
    onRequestKmsAuth,
    onOpenManageMemberships,
    onOpenManageConsent,
    onOpenManageMultiValue,
    onOpenManageVaccination,
    onOpenManageJobs,
    onOpenManageMentor,
    onJumpToFamilyTab,
    onOpenFamilyNotes,
  };

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
              showNicknames={true}
              nicknames={parent.nicknames || []}
              onSave={(fn, fnAddr, nicks) => callbacksRef.current.onSaveParentNames(parent, fn, fnAddr, nicks)}
              disabled={!canWriteParents}
            />
          );
        },
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
              onSave={(val: string) => callbacksRef.current.onSaveParentField(parent, 'last_name', val)}
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
              onOpenManage={(p, field, anchor) => callbacksRef.current.onOpenManageMultiValue(p, field, anchor)}
            />
          );
        },
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
              onOpenManage={(p, field, anchor) => callbacksRef.current.onOpenManageMultiValue(p, field, anchor)}
            />
          );
        },
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
              onSave={(updatedParents) => callbacksRef.current.onSaveFamilyParents(parent.family_id, updatedParents)}
            />
          );
        },
      },
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
        cell: (info) => {
          const parent = info.row.original;
          const family = families.find((f) => f.id === parent.family_id);
          return (
            <FamilyNotesCell
              value={parent.notes || ''}
              readOnly={!canWriteParents}
              onOpen={(anchor) => {
                if (family) {
                  callbacksRef.current.onOpenFamilyNotes(family, { type: 'parent', id: parent.id }, anchor);
                }
              }}
            />
          );
        },
      },
      {
        header: t('jobs'),
        id: 'jobs',
        size: 200,
        cell: (info) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const isCurrentActive = Boolean(jobsPopoverAnchor && activePersonForJobs?.id === parent.id);
          return (
            <JobsCell
              person={{ id: parent.id, first_name: parent.first_name, last_name: parent.last_name, jobs: parent.jobs, type: 'parent' }}
              isActive={isCurrentActive}
              onOpenManage={(person, anchor) => callbacksRef.current.onOpenManageJobs(person, anchor)}
              readOnly={!(canWriteParents || canWriteJobs)}
            />
          );
        },
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
              onOpenManage={(p, anchor) => callbacksRef.current.onOpenManageMemberships(p, anchor)}
            />
          );
        },
      },
      ...(canManageVaccination ? [
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
                onOpenManage={(anchor) => callbacksRef.current.onOpenManageVaccination(parent.id, 'parent', anchor)}
                isUnlocked={isVaccinationUnlocked}
                onUnlock={() => callbacksRef.current.onRequestKmsAuth()}
              />
            );
          },
        },
      ] : []),
      {
        id: 'paten',
        header: t('mentors'),
        size: 220,
        minSize: 160,
        cell: (info: any) => {
          const parent = info.row.original;
          const family = families.find((f) => f.id === parent.family_id);
          const isPopActive = Boolean(mentorPopoverAnchor && activeFamilyForMentor?.id === parent.family_id);

          return (
            <ParentMentorsCell
              parent={parent}
              family={family}
              families={families}
              isActive={isPopActive}
              canWriteFamilies={canWriteFamilies}
              onJumpToFamily={(famId, tab) => callbacksRef.current.onJumpToFamilyTab?.(famId, tab)}
              onOpenManageMentor={(fam, anchor) => callbacksRef.current.onOpenManageMentor(fam, anchor)}
            />
          );
        },
      },
      {
        id: 'paten_von',
        header: t('mentorsOf'),
        size: 260,
        minSize: 180,
        cell: (info: any) => {
          const parent = info.row.original;
          return (
            <ParentMentorsOfCell
              parent={parent}
              families={families}
              onJumpToFamily={(famId, tab) => callbacksRef.current.onJumpToFamilyTab?.(famId, tab)}
            />
          );
        },
      },
      {
        header: t('contactConsent'),
        id: 'contact_consent',
        size: 180,
        meta: { defaultHidden: true },
        cell: (info: any) => {
          const parent = info.row.original;
          if (!parent || !parent.id) return null;
          const isCurrentActive = Boolean(contactConsentPopoverAnchor && activeParentForConsent?.id === parent.id);
          return (
            <ParentConsentCell
              parent={parent}
              isActive={isCurrentActive}
              onOpenManage={(p, anchor) => callbacksRef.current.onOpenManageConsent(p, anchor)}
              canEdit={canWriteParents}
            />
          );
        },
      },
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
                onDelete={() => callbacksRef.current.onDeleteParent(parent.id)}
                deleteLabel={t('deleteParent')}
                disabled={!canWriteParents}
                disabledTooltip={!canWriteParents ? t('permissionRequired') : undefined}
                entityName={`${parent.first_name || ''} ${parent.last_name || ''}`.trim()}
              />
            </div>
          );
        },
      },
    ],
    [
      families,
      canWriteParents,
      canWriteJobs,
      canWriteFamilies,
      canManageVaccination,
      isVaccinationUnlocked,
      membershipPopoverAnchor,
      targetParentMemberships,
      contactConsentPopoverAnchor,
      activeParentForConsent,
      multiValuePopoverAnchor,
      activeParentForMultiValue,
      activeMultiValueField,
      vaccinationPopoverAnchor,
      targetVaccinationPerson,
      jobsPopoverAnchor,
      activePersonForJobs,
      mentorPopoverAnchor,
      activeFamilyForMentor,
    ]
  );

  return (
    <DataTable
      key="parents"
      className="card-table parents-table"
      data={data}
      columns={parentColumns}
      getSubRows={(row: any) => row.parents}
      onAddParent={onAddParent}
      onJumpToFamily={onJumpToFamily}
      jumpToFamilyLabel={t('jumpToChildrenShort')}
      jumpToFamilyTitle={t('jumpToFamilyInChildren')}
      highlightedRowId={highlightedRowId}
      stickyFirstColumn
      enableSorting={false}
      initialColumnVisibility={{ contact_consent: false }}
      getCardHeader={(parent: any) => `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || '-'}
      getCardActions={(parent: any) => (
        <RowActionsMenu
          onDelete={() => onDeleteParent(parent.id)}
          deleteLabel={t('deleteParent')}
          disabled={!canWriteParents}
          disabledTooltip={!canWriteParents ? t('permissionRequired') : undefined}
          entityName={`${parent.first_name || ''} ${parent.last_name || ''}`.trim()}
        />
      )}
    />
  );
};
