import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import { FirstNameEditor } from '../Table/FirstNameEditor';
import EasyEdit, { Types as EasyEditTypes } from '../InlineEdit';
import { RowActionsMenu } from '../Table/RowActionsMenu';
import { FamilyNotesCell } from '../Table/FamilyNotesEditor';
import { MultiValueCell } from '../Table/MultiValueCell';
import { VaccinationStatusCell } from '../Table/VaccinationStatusEditor';
import { ChildStartDateCell, ChildGroupCell, ChildFamiliencardCell } from './ChildCells';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import type { Child, Family } from '../../types/family';

const EasyEditComponent = EasyEdit;

export interface ChildrenTabProps {
  data: any[];
  families: Family[];
  canWriteChildren: boolean;
  canReadChildAllergies: boolean;
  canWriteChildAllergies: boolean;
  hasPermission: (permission: string) => boolean;
  isVaccinationUnlocked: boolean;
  highlightedRowId?: string | null;
  groupPopoverAnchor?: HTMLElement | string | null;
  targetChildGroupChanges?: Child | null;
  familiencardPopoverAnchor?: HTMLElement | string | null;
  targetChildFamiliencards?: Child | null;
  vaccinationPopoverAnchor?: HTMLElement | string | null;
  targetVaccinationPerson?: { type: 'parent' | 'child'; id: string } | null;
  activeChildForMultiValue?: Child | null;
  activeMultiValueField?: string | null;
  onSaveChildNames: (child: Child, firstName: string, firstNameForAddressList: string) => Promise<void>;
  onSaveChildField: (child: Child, field: keyof Child, val: any) => Promise<any>;
  onDeleteChild: (id: string) => void | Promise<void>;
  onAddChild?: (familyId: string, familyName: string) => void;
  onJumpToFamily?: (familyId: string, familyName: string) => void;
  onOpenManageGroupChanges: (child: Child, anchor: HTMLElement | string) => void;
  onOpenManageFamiliencards: (child: Child, anchor: HTMLElement | string) => void;
  onOpenManageVaccination: (personId: string, personType: 'child' | 'parent', anchor: HTMLElement | string) => void;
  onOpenManageChildMultiValue: (child: Child, field: any, anchor?: HTMLElement | string | null) => void;
  onOpenFamilyNotes: (family: Family, target: { type: 'child'; id: string }, anchor: HTMLElement | string) => void;
  onRequestKmsAuth: () => void;
}

export const ChildrenTab: React.FC<ChildrenTabProps> = ({
  data,
  families,
  canWriteChildren,
  canReadChildAllergies,
  canWriteChildAllergies,
  hasPermission,
  isVaccinationUnlocked,
  highlightedRowId,
  groupPopoverAnchor,
  targetChildGroupChanges,
  familiencardPopoverAnchor,
  targetChildFamiliencards,
  vaccinationPopoverAnchor,
  targetVaccinationPerson,
  activeChildForMultiValue,
  activeMultiValueField,
  onSaveChildNames,
  onSaveChildField,
  onDeleteChild,
  onAddChild,
  onJumpToFamily,
  onOpenManageGroupChanges,
  onOpenManageFamiliencards,
  onOpenManageVaccination,
  onOpenManageChildMultiValue,
  onOpenFamilyNotes,
  onRequestKmsAuth,
}) => {
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
            onOpenManage={onOpenManageGroupChanges}
          />
        );
      },
    }),
    [groupPopoverAnchor, targetChildGroupChanges, onOpenManageGroupChanges]
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
              onSave={(fn, fnAddr) => onSaveChildNames(child, fn, fnAddr)}
              disabled={!canWriteChildren}
            />
          );
        },
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
              onSave={(val: string) => onSaveChildField(child, 'last_name', val)}
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
                onSaveChildField(child, 'birth_date', parseInputDate(val));
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
        },
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
        },
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
              onOpenManage={onOpenManageGroupChanges}
            />
          );
        },
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
              onOpenManage={onOpenManageFamiliencards}
              readOnly={!canWriteChildren}
            />
          );
        },
      },
      {
        header: t('notes'),
        accessorKey: 'notes',
        size: 260,
        cell: (info) => {
          const child = info.row.original;
          const family = families.find((f) => f.id === child.family_id);
          return (
            <FamilyNotesCell
              value={child.notes || ''}
              readOnly={!canWriteChildren}
              onOpen={(anchor) => {
                if (family) {
                  onOpenFamilyNotes(family, { type: 'child', id: child.id }, anchor);
                }
              }}
            />
          );
        },
      },
      ...(canReadChildAllergies
        ? [
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
                    placeholder={canWriteChildAllergies ? t('addAllergy') : t('noAllergiesOrDiet')}
                    isActive={isPopActive}
                    onOpenManage={(field, anchor) => onOpenManageChildMultiValue(child, field, anchor)}
                    canEdit={canWriteChildAllergies}
                  />
                );
              },
            },
          ]
        : []),
      ...(hasPermission('vaccination.status.manage')
        ? [
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
                    onOpenManage={(anchor) => onOpenManageVaccination(child.id, 'child', anchor)}
                    isUnlocked={isVaccinationUnlocked}
                    onUnlock={onRequestKmsAuth}
                  />
                );
              },
            },
          ]
        : []),
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
                onDelete={() => onDeleteChild(child.id)}
                deleteLabel={t('deleteChild')}
                disabled={!canWriteChildren}
                disabledTooltip={!canWriteChildren ? t('permissionRequired') : undefined}
                entityName={`${child.first_name || ''} ${child.last_name || ''}`.trim()}
              />
            </div>
          );
        },
      },
    ],
    [
      families,
      onSaveChildField,
      onSaveChildNames,
      onDeleteChild,
      canWriteChildren,
      canReadChildAllergies,
      canWriteChildAllergies,
      activeChildForMultiValue,
      activeMultiValueField,
      onOpenManageChildMultiValue,
      onOpenManageGroupChanges,
      groupPopoverAnchor,
      targetChildGroupChanges,
      childGroupColumn,
      onOpenManageFamiliencards,
      familiencardPopoverAnchor,
      targetChildFamiliencards,
      isVaccinationUnlocked,
      onRequestKmsAuth,
      hasPermission,
      vaccinationPopoverAnchor,
      targetVaccinationPerson,
      onOpenManageVaccination,
      onOpenFamilyNotes,
    ]
  );

  return (
    <DataTable
      key="children"
      className="card-table children-table"
      data={data}
      columns={childColumns}
      getSubRows={(row: any) => row.children}
      onAddChild={onAddChild}
      onJumpToFamily={onJumpToFamily}
      jumpToFamilyLabel={t('jumpToParentsShort')}
      jumpToFamilyTitle={t('jumpToFamilyInParents')}
      emptySubRowsText={t('noChildrenYet')}
      highlightedRowId={highlightedRowId}
      stickyFirstColumn
      enableSorting={false}
      getCardHeader={(child: any) => `${child.first_name || ''} ${child.last_name || ''}`.trim() || '-'}
      getCardActions={(child: any) => (
        <RowActionsMenu
          onDelete={() => onDeleteChild(child.id)}
          deleteLabel={t('deleteChild')}
          disabled={!canWriteChildren}
          disabledTooltip={!canWriteChildren ? t('permissionRequired') : undefined}
          entityName={`${child.first_name || ''} ${child.last_name || ''}`.trim()}
        />
      )}
    />
  );
};
