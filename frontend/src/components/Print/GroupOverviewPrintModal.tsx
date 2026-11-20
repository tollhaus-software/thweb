import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, ArrowLeft } from 'lucide-react';
import { t } from '../../utils/i18n';
import { getEntryValue, isFlagActive } from '../Table/MultiValueListEditor';
import './GroupOverviewPrint.css';

export interface GroupOverviewPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  families: any[];
  getChildGroupStatus: (child: any) => {
    currentGroup: number | null;
    plannedGroup: number | null;
    isFormer: boolean;
    groupLabel: string;
  };
}

interface GroupChildItem {
  childId: string;
  firstName: string;
  lastName: string;
  parent1FullName: string;
  parent1Phones: string[];
  parent2FullName: string;
  parent2Phones: string[];
}

export const GroupOverviewPrintModal: React.FC<GroupOverviewPrintModalProps> = ({
  isOpen,
  onClose,
  families,
  getChildGroupStatus,
}) => {
  // Step: 'options' or 'preview'
  const [step, setStep] = useState<'options' | 'preview'>('options');

  // Groups: 1 = Kleine Gruppe, 2 = Grosse Gruppe, 3 = Hort
  const [selectedGroups, setSelectedGroups] = useState<{ [key: number]: boolean }>({
    1: true,
    2: true,
    3: true,
  });

  // Phone types: 'mobile' = Mobile, 'landline' = Festnetz, 'work' = Job
  const [selectedPhoneTypes, setSelectedPhoneTypes] = useState<{ [key: string]: boolean }>({
    mobile: true,
    landline: false,
    work: false,
  });

  // Reset to options step and default selections when opening
  useEffect(() => {
    if (isOpen) {
      setStep('options');
      setSelectedPhoneTypes({
        mobile: true,
        landline: false,
        work: false,
      });
    }
  }, [isOpen]);

  // Handle ESC key to close or go back
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'preview') {
          setStep('options');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, onClose]);

  if (!isOpen) return null;

  const toggleGroup = (groupId: number) => {
    setSelectedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const togglePhoneType = (typeKey: string) => {
    setSelectedPhoneTypes((prev) => ({ ...prev, [typeKey]: !prev[typeKey] }));
  };

  const hasSelectedGroup = Object.values(selectedGroups).some(Boolean);
  const hasSelectedPhoneType = Object.values(selectedPhoneTypes).some(Boolean);
  const canContinue = hasSelectedGroup && hasSelectedPhoneType;

  // Group definitions
  const groupDefinitions = [
    { id: 1, label: t('overviewGroup1') || 'Kleine Gruppe' },
    { id: 2, label: 'Grosse Gruppe' },
    { id: 3, label: t('overviewGroup3') || 'Hort' },
  ];

  // Phone type definitions
  const phoneTypeDefinitions = [
    { key: 'mobile', label: 'Mobile' },
    { key: 'landline', label: 'Festnetz' },
    { key: 'work', label: 'Job' },
  ];

  // Phone type normalizer
  const normalizePhoneType = (rawType?: string): 'mobile' | 'landline' | 'work' => {
    if (!rawType) return 'mobile';
    const lower = String(rawType).toLowerCase().trim();
    if (
      lower === 'landline' ||
      lower === 'festnetz' ||
      lower === 'home' ||
      lower === 'tel' ||
      lower === 'privat'
    ) {
      return 'landline';
    }
    if (
      lower === 'work' ||
      lower === 'job' ||
      lower === 'geschäftlich' ||
      lower === 'dienstlich' ||
      lower === 'arbeit'
    ) {
      return 'work';
    }
    return 'mobile';
  };

  // Helper to extract data per group
  const getChildrenForGroup = (groupId: number): GroupChildItem[] => {
    const items: GroupChildItem[] = [];

    families.forEach((fam) => {
      // Sort parents: first_name_for_address_list || first_name, then last_name
      const sortedParents = [...(fam.parents || [])].sort((a: any, b: any) => {
        const fnA = ((a.first_name_for_address_list || a.first_name) || '').trim();
        const fnB = ((b.first_name_for_address_list || b.first_name) || '').trim();
        const cmp = fnA.localeCompare(fnB, 'de');
        if (cmp !== 0) return cmp;
        return (a.last_name || '').localeCompare(b.last_name || '', 'de');
      });

      const p1 = sortedParents[0];
      const p2 = sortedParents[1];

      const formatParentName = (p: any): string => {
        if (!p) return '';
        const fn = ((p.first_name_for_address_list || p.first_name) || '').trim();
        const ln = (p.last_name || '').trim();
        return `${fn} ${ln}`.trim();
      };

      const formatParentPhones = (p: any): string[] => {
        if (!p || !Array.isArray(p.phones)) return [];
        return p.phones
          .filter((ph: any) => {
            if (!isFlagActive(ph, 'address_list', true)) return false;
            const val = getEntryValue(ph).trim();
            if (!val) return false;
            const rawType = typeof ph === 'object' && ph !== null && ph.type ? ph.type : 'mobile';
            const normType = normalizePhoneType(rawType);
            return Boolean(selectedPhoneTypes[normType]);
          })
          .map((ph: any) => getEntryValue(ph).trim());
      };

      const p1Name = formatParentName(p1);
      const p1Phones = formatParentPhones(p1);
      const p2Name = formatParentName(p2);
      const p2Phones = formatParentPhones(p2);

      (fam.children || []).forEach((c: any) => {
        const status = getChildGroupStatus(c);
        const inThisGroup =
          status.currentGroup === groupId ||
          (status.currentGroup === null && status.plannedGroup === groupId);

        if (inThisGroup) {
          const cGivenName = ((c.first_name_for_address_list || c.first_name) || '').trim();
          const cSurname = (c.last_name || '').trim();
          items.push({
            childId: c.id,
            firstName: cGivenName,
            lastName: cSurname,
            parent1FullName: p1Name,
            parent1Phones: p1Phones,
            parent2FullName: p2Name,
            parent2Phones: p2Phones,
          });
        }
      });
    });

    // Sort children alphabetically by child surname, then given name
    items.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName, 'de');
      if (cmp !== 0) return cmp;
      return a.firstName.localeCompare(b.firstName, 'de');
    });

    return items;
  };

  const handlePrint = () => {
    window.print();
  };

  // Render Options Dialog Step
  if (step === 'options') {
    return createPortal(
      <div className="group-print-dialog-overlay" onClick={onClose}>
        <div
          className="group-print-dialog-container"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-print-dialog-title"
        >
          <div className="group-print-dialog-header">
            <h2 id="group-print-dialog-title">
              <Printer size={20} />
              <span>{t('printGroupOverview') || 'Gruppenübersicht drucken'}</span>
            </h2>
            <button
              type="button"
              className="easy-edit-button"
              onClick={onClose}
              aria-label={t('close') || 'Schließen'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748b)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="group-print-dialog-body">
            {/* Group Selection */}
            <div>
              <div className="group-print-section-title">
                {t('groupSelection') || 'Gruppenauswahl'}
              </div>
              <div className="group-print-checklist">
                {groupDefinitions.map((g) => (
                  <label key={g.id} className="group-print-checkbox-label">
                    <input
                      type="checkbox"
                      data-testid={`group-checkbox-${g.id}`}
                      checked={Boolean(selectedGroups[g.id])}
                      onChange={() => toggleGroup(g.id)}
                    />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Phone Number Types */}
            <div>
              <div className="group-print-section-title">
                {t('phoneTypes') || 'Telefontypen'}
              </div>
              <div className="group-print-checklist">
                {phoneTypeDefinitions.map((p) => (
                  <label key={p.key} className="group-print-checkbox-label">
                    <input
                      type="checkbox"
                      data-testid={`phone-type-checkbox-${p.key}`}
                      checked={Boolean(selectedPhoneTypes[p.key])}
                      onChange={() => togglePhoneType(p.key)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="group-print-dialog-footer">
            <button
              type="button"
              className="secondary-button"
              data-testid="print-options-cancel"
              onClick={onClose}
            >
              {t('cancel') || 'Abbrechen'}
            </button>
            <button
              type="button"
              className="primary-button"
              data-testid="print-options-continue"
              disabled={!canContinue}
              onClick={() => setStep('preview')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                opacity: canContinue ? 1 : 0.5,
                cursor: canContinue ? 'pointer' : 'not-allowed',
              }}
            >
              <span>{t('continue') || 'Weiter'}</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Active groups to render in preview/print
  const activeGroupDefs = groupDefinitions.filter((g) => selectedGroups[g.id]);

  // Render Preview Step
  return createPortal(
    <div className="print-portal-root">
      <div className="print-preview-modal-overlay">
        {/* Preview Toolbar (Hidden in print) */}
        <div className="print-preview-toolbar no-print">
          <div className="print-preview-toolbar-left">
            <button
              type="button"
              className="secondary-button"
              data-testid="print-preview-back-button"
              onClick={() => setStep('options')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              <ArrowLeft size={16} />
              <span>{t('back') || 'Zurück'}</span>
            </button>
            <span className="print-preview-toolbar-title">
              {t('printPreview') || 'Druckvorschau'}: {t('groupOverview') || 'Gruppenübersicht'}
            </span>
          </div>

          <div className="print-preview-toolbar-right">
            <button
              type="button"
              className="primary-button"
              data-testid="print-preview-print-button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'var(--primary, #2563eb)',
                color: '#ffffff',
                border: 'none',
                padding: '0.45rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <Printer size={16} />
              <span>{t('print') || 'Drucken'}</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              data-testid="print-preview-close-button"
              onClick={onClose}
              aria-label={t('close') || 'Schließen'}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Canvas */}
        <div className="print-preview-canvas">
          {activeGroupDefs.map((group) => {
            const children = getChildrenForGroup(group.id);

            // Compute total visual lines to ensure group fits on one horizontal A4 page
            const totalLines = children.reduce((sum, item) => {
              const p1Lines = Math.max(1, item.parent1Phones.length);
              const p2Lines = Math.max(1, item.parent2Phones.length);
              return sum + Math.max(p1Lines, p2Lines);
            }, 0);

            // Base single-line row height that comfortably fits ~18 rows on A4 landscape
            // Available table height on A4 landscape (210mm - 16mm margins - ~12mm header) is ~170mm.
            // Using 162mm ensures comfortable margin buffer and avoids trailing blank pages.
            const availableHeightMm = 162;
            const baseLineHeightMm = 9.0; // 18 * 9.0mm = 162mm
            const effectiveLineHeightMm =
              totalLines <= 18 ? baseLineHeightMm : availableHeightMm / Math.max(1, totalLines);

            // Scale font size and vertical padding when line count is high
            const scale = Math.min(1, 18 / Math.max(18, totalLines));
            const fontSizePt = Math.max(8.5, Math.min(12.5, 12.5 * scale));
            const paddingV = Math.max(1, Math.min(4, Math.round(4 * scale)));

            return (
              <div key={group.id} className="print-page">
                {/* Group Heading */}
                <div className="print-page-header">
                  <h2 className="print-page-title">{group.label}</h2>
                  <span className="print-page-date">
                    {new Date().toLocaleDateString('de-DE')}
                  </span>
                </div>

                {/* Table */}
                <div className="print-table-wrapper">
                  {children.length === 0 ? (
                    <div className="print-empty-group-msg">
                      {t('noChildrenInGroup') || 'Keine Kinder in dieser Gruppe'}
                    </div>
                  ) : (
                    <table className="print-table">
                      <colgroup>
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '19%' }} />
                        <col style={{ width: '16%' }} />
                      </colgroup>
                      <tbody>
                        {children.map((child) => {
                          const rowLines = Math.max(
                            1,
                            child.parent1Phones.length,
                            child.parent2Phones.length
                          );
                          const rowHeightMm = (effectiveLineHeightMm * rowLines).toFixed(2);

                          return (
                            <tr
                              key={child.childId}
                              style={{
                                height: `${rowHeightMm}mm`,
                                fontSize: `${fontSizePt.toFixed(1)}pt`,
                              }}
                            >
                              {/* 1. child given name */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.firstName}
                              </td>

                              {/* 2. child surname */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.lastName}
                              </td>

                              {/* 3. parent 1 full name */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.parent1FullName}
                              </td>

                              {/* 4. parent 1 phone */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.parent1Phones.map((ph, idx) => (
                                  <div key={idx} className="phone-line">
                                    {ph}
                                  </div>
                                ))}
                              </td>

                              {/* 5. parent 2 full name */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.parent2FullName}
                              </td>

                              {/* 6. parent 2 phone */}
                              <td style={{ padding: `${paddingV}px 6px` }}>
                                {child.parent2Phones.map((ph, idx) => (
                                  <div key={idx} className="phone-line">
                                    {ph}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
