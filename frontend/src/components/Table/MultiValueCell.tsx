import React from 'react';
import { Pencil } from 'lucide-react';
import { t } from '../../utils/i18n';
import { getEntryValue, isFlagActive, type MultiValueItem } from './MultiValueListEditor';

export interface MultiValueCellProps {
  id: string;
  field: 'emails' | 'phones';
  values?: MultiValueItem[];
  placeholder: string;
  isActive: boolean;
  onOpenManage: (field: 'emails' | 'phones', anchor: HTMLElement | string) => void;
  canEdit?: boolean;
}

export const MultiValueCell: React.FC<MultiValueCellProps> = ({
  id,
  field,
  values = [],
  placeholder,
  isActive,
  onOpenManage,
  canEdit = true,
}) => {
  const cellId = `cell-${field}-${id}`;

  return (
    <div
      id={cellId}
      className={`multi-value-cell-wrapper ${field}-cell-wrapper`}
      onDoubleClick={(e) => {
        if (!canEdit) return;
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(field, cellEl);
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
        {values && values.length > 0 ? (
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
                      title={
                        isIdentifier
                          ? t('identifierEmailActive') || 'Als Identifikator-E-Mail festgelegt'
                          : t('identifierEmailInactive') || 'Nicht als Identifikator-E-Mail festgelegt'
                      }
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
                    title={
                      isAddressList
                        ? t('addressListIncluded') || 'In Adressliste aufnehmen'
                        : t('addressListExcluded') || 'Nicht in Adressliste aufnehmen'
                    }
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
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(field, cellEl);
          }}
          className="cell-edit-pencil-btn"
          title={placeholder}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export default MultiValueCell;
