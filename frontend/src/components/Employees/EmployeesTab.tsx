import React, { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { DataTable } from '../Table/DataTable';
import EasyEdit, { Types as EasyEditTypes } from '../InlineEdit';
import { MultiValueCell } from '../Table/MultiValueCell';
import { AddressEditor } from '../Table/AddressEditor';
import { JobsCell, type PersonWithJobs, type JobItem } from '../Table/JobsPopover';
import { RowActionsMenu } from '../Table/RowActionsMenu';
import { getEntryValue, type MultiValueEntry } from '../Table/MultiValueListEditor';
import { t } from '../../utils/i18n';

const EasyEditComponent = EasyEdit;

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_type: 'caregiver' | 'cook' | 'bufdi';
  emails?: MultiValueEntry[];
  phones?: MultiValueEntry[];
  address?: string;
  is_kinderschutzbeauftragter?: boolean;
  allergies?: string[];
  jobs?: JobItem[];
  created_at?: string;
  updated_at?: string;
}

export interface EmployeesTabProps {
  employees: Employee[];
  searchQuery?: string;
  highlightedRowId?: string | null;
  canWriteEmployees: boolean;
  canReadEmployeeAllergies?: boolean;
  canWriteEmployeeAllergies?: boolean;
  canWriteJobs?: boolean;
  isCreateModalOpen?: boolean;
  onCloseCreateModal?: () => void;
  onCreateEmployee?: (payload: Partial<Employee>) => Promise<void>;
  onSaveEmployeeField: (employee: Employee, field: keyof Employee, value: any) => Promise<void>;
  onDeleteEmployee: (employee: Employee) => void;
  // MultiValue management
  activeEmployeeForMultiValue?: Employee | null;
  activeMultiValueField?: string | null;
  onOpenManageMultiValue?: (employee: Employee, field: 'emails' | 'phones' | 'allergies', anchor?: HTMLElement | string) => void;
  // Jobs popover
  jobsPopoverAnchor?: HTMLElement | string | null;
  activePersonForJobs?: { id: string } | null;
  onOpenManageJobs?: (person: PersonWithJobs, anchor: HTMLElement | string) => void;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({
  employees,
  searchQuery = '',
  highlightedRowId,
  canWriteEmployees,
  canReadEmployeeAllergies = false,
  canWriteEmployeeAllergies = false,
  canWriteJobs = false,
  isCreateModalOpen = false,
  onCloseCreateModal,
  onCreateEmployee,
  onSaveEmployeeField,
  onDeleteEmployee,
  activeEmployeeForMultiValue,
  activeMultiValueField,
  onOpenManageMultiValue,
  jobsPopoverAnchor,
  activePersonForJobs,
  onOpenManageJobs,
}) => {
  // Local state for Add Employee modal form
  const [empFirstName, setEmpFirstName] = useState('');
  const [empLastName, setEmpLastName] = useState('');
  const [empType, setEmpType] = useState<'caregiver' | 'cook' | 'bufdi'>('caregiver');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
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
    if (onCreateEmployee) {
      setIsSubmitting(true);
      try {
        await onCreateEmployee(payload);
        setEmpFirstName('');
        setEmpLastName('');
        setEmpType('caregiver');
        onCloseCreateModal?.();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
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
  }, [employees, searchQuery]);

  const employeeColumns = useMemo<ColumnDef<Employee>[]>(
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
              onSave={(val: string) => onSaveEmployeeField(emp, 'first_name', val)}
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
              onSave={(val: string) => onSaveEmployeeField(emp, 'last_name', val)}
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
              onSave={(val: string) => onSaveEmployeeField(emp, 'employee_type', val)}
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
              onOpenManage={(field, anchor) => onOpenManageMultiValue?.(emp, field, anchor)}
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
              onOpenManage={(field, anchor) => onOpenManageMultiValue?.(emp, field, anchor)}
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
              parent={emp as any}
              familyParents={[emp as any]}
              canEdit={canWriteEmployees}
              onSave={([updatedEmp]) =>
                onSaveEmployeeField(emp, 'address', updatedEmp.address || '')
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
                onSaveEmployeeField(
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
                placeholder={canWriteEmployeeAllergies ? t('addAllergy') : t('noAllergiesOrDiet')}
                isActive={isPopActive}
                onOpenManage={(field, anchor) => onOpenManageMultiValue?.(emp, field, anchor)}
                canEdit={canWriteEmployeeAllergies}
              />
            );
          },
        }
      ] : []),
      {
        header: t('jobs'),
        id: 'jobs',
        size: 200,
        cell: (info) => {
          const emp = info.row.original;
          if (!emp || !emp.id) return null;
          const isCurrentActive = Boolean(jobsPopoverAnchor && activePersonForJobs?.id === emp.id);
          return (
            <JobsCell
              person={{ id: emp.id, first_name: emp.first_name, last_name: emp.last_name, jobs: emp.jobs, type: 'employee' }}
              isActive={isCurrentActive}
              onOpenManage={(person: PersonWithJobs, anchor: HTMLElement | string) => onOpenManageJobs?.(person, anchor)}
              readOnly={!(canWriteEmployees || canWriteJobs)}
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
          const emp = info.row.original;
          const fullName = `${emp.first_name} ${emp.last_name}`.trim();
          return (
            <RowActionsMenu
              onDelete={() => onDeleteEmployee(emp)}
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
      canWriteJobs,
      jobsPopoverAnchor,
      activePersonForJobs,
      onOpenManageJobs,
      activeEmployeeForMultiValue,
      activeMultiValueField,
      onOpenManageMultiValue,
      onSaveEmployeeField,
      onDeleteEmployee,
    ]
  );

  return (
    <>
      <DataTable
        key="employees"
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
              onDelete={() => onDeleteEmployee(emp)}
              deleteLabel={t('deleteEmployee') || 'Mitarbeiter löschen'}
              disabled={!canWriteEmployees}
              disabledTooltip={!canWriteEmployees ? t('permissionRequired') : undefined}
              entityName={fullName}
            />
          );
        }}
      />

      {/* Add Employee Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={onCloseCreateModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>{t('addEmployee') || 'Mitarbeiter/-in hinzufügen'}</h2>
            <form onSubmit={handleFormSubmit}>
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
                  onClick={onCloseCreateModal}
                  className="secondary-button"
                  disabled={isSubmitting}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSubmitting}
                >
                  {t('addEmployee') || 'Mitarbeiter/-in hinzufügen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
