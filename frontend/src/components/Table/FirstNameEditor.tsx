import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface FirstNameEditorProps {
  id?: string;
  firstName?: string;
  firstNameForAddressList?: string;
  onSave: (firstName: string, firstNameForAddressList: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export const FirstNameEditor: React.FC<FirstNameEditorProps> = ({
  id,
  firstName = '',
  firstNameForAddressList = '',
  onSave,
  disabled = false,
  placeholder = '-',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempFirstName, setTempFirstName] = useState(firstName);
  const [tempAddressListName, setTempAddressListName] = useState(firstNameForAddressList);

  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLDivElement>(null);
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const addressListInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    if (disabled) return;
    setTempFirstName(firstName);
    setTempAddressListName(firstNameForAddressList);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) {
      const timer = setTimeout(() => {
        if (firstNameInputRef.current) {
          firstNameInputRef.current.focus();
          firstNameInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const handleSave = () => {
    const finalFirstName = tempFirstName.trim();
    const finalAddressListName = tempAddressListName.trim();
    setIsEditing(false);
    onSave(finalFirstName, finalAddressListName);
  };

  const handleCancel = () => {
    setTempFirstName(firstName);
    setTempAddressListName(firstNameForAddressList);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const inputId = id || (firstName ? `name-${firstName}` : 'name-field');

  return (
    <div
      ref={triggerRef}
      className="first-name-editor-cell"
      onClick={() => {
        if (!disabled && !isEditing) startEditing();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        cursor: disabled ? 'default' : 'pointer',
        minHeight: '28px',
        borderRadius: '4px',
        backgroundColor: isEditing ? 'var(--accent-bg, rgba(59, 130, 246, 0.08))' : 'transparent',
        padding: '2px 4px',
        transition: 'background-color 0.15s ease-in-out',
        width: '100%',
        boxSizing: 'border-box',
      }}
      title={disabled ? undefined : t('editFirstName')}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: firstName ? 'var(--text-h)' : '#94a3b8',
          fontStyle: firstName ? 'normal' : 'italic',
          fontSize: '0.875rem',
          flex: 1,
          textAlign: 'left',
        }}
      >
        {firstName || placeholder}
      </span>

      {firstNameForAddressList ? (
        <span
          className="address-list-name-badge"
          title={`${t('addressListGivenNameLabel') || 'Abweichend für Addressliste:'} ${firstNameForAddressList}`}
          style={{
            fontSize: '0.75rem',
            padding: '1px 5px',
            borderRadius: '3px',
            backgroundColor: 'var(--bg-subtle, #f1f5f9)',
            border: '1px solid var(--border, #cbd5e1)',
            color: 'var(--text-muted, #64748b)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            flexShrink: 0,
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          📋 {firstNameForAddressList}
        </span>
      ) : null}

      {!disabled && (
        <div
          className="cell-edit-pencil-btn-wrapper"
          style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing) {
                handleSave();
              } else {
                startEditing();
              }
            }}
            className="cell-edit-pencil-btn easy-edit-button"
            title={t('editFirstName')}
            aria-label={t('editFirstName')}
          >
            <Pencil size={13} />
          </button>
        </div>
      )}

      <CellPopover
        isOpen={isEditing}
        onClose={handleCancel}
        anchorEl={triggerRef}
        width={340}
        minWidth={isMobile ? '100%' : 290}
        style={{
          padding: isMobile ? '14px 16px 20px 16px' : '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '12px' : '10px',
        }}
      >
        {/* Header */}
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{t('editFirstName') || 'Vorname bearbeiten'}</span>
          {isMobile && (
            <button
              type="button"
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={t('cancel')}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Row 1: Vorname */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`input-first-name-${inputId}`}
            style={{
              fontSize: '0.825rem',
              fontWeight: 600,
              color: 'var(--text-h)',
              textAlign: 'left',
            }}
          >
            {t('firstNameLabel') || 'Vorname:'}
          </label>
          <input
            id={`input-first-name-${inputId}`}
            ref={firstNameInputRef}
            type="text"
            className="form-control first-name-input"
            value={tempFirstName}
            onChange={(e) => setTempFirstName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('firstName')}
            style={{
              width: '100%',
              minHeight: isMobile ? '38px' : '30px',
              padding: isMobile ? '8px 10px' : '5px 8px',
              borderRadius: '4px',
              border: '1px solid var(--input-border, #cbd5e1)',
              background: 'var(--input-bg, #ffffff)',
              color: 'var(--input-text, inherit)',
              fontSize: isMobile ? '16px' : '0.875rem',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Row 2: Abweichend für Addressliste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`input-address-list-name-${inputId}`}
            style={{
              fontSize: '0.825rem',
              fontWeight: 600,
              color: 'var(--text-h)',
              textAlign: 'left',
            }}
          >
            {t('addressListGivenNameLabel') || 'Abweichend für Addressliste:'}
          </label>
          <input
            id={`input-address-list-name-${inputId}`}
            ref={addressListInputRef}
            type="text"
            className="form-control address-list-name-input"
            value={tempAddressListName}
            onChange={(e) => setTempAddressListName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('firstNameForAddressList')}
            style={{
              width: '100%',
              minHeight: isMobile ? '38px' : '30px',
              padding: isMobile ? '8px 10px' : '5px 8px',
              borderRadius: '4px',
              border: '1px solid var(--input-border, #cbd5e1)',
              background: 'var(--input-bg, #ffffff)',
              color: 'var(--input-text, inherit)',
              fontSize: isMobile ? '16px' : '0.875rem',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: isMobile ? '10px' : '6px',
            marginTop: '4px',
          }}
        >
          <button
            type="button"
            onClick={handleCancel}
            className="btn-cancel"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: isMobile ? '8px 14px' : '4px 8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flex: isMobile ? 1 : undefined,
              minHeight: isMobile ? '38px' : '28px',
            }}
          >
            <X size={13} />
            {t('cancel') || 'Abbrechen'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-save"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: isMobile ? '8px 14px' : '4px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              background: 'var(--primary, #2563eb)',
              color: 'white',
              cursor: 'pointer',
              flex: isMobile ? 1 : undefined,
              minHeight: isMobile ? '38px' : '28px',
            }}
          >
            <Check size={13} />
            {t('save') || 'Speichern'}
          </button>
        </div>
      </CellPopover>
    </div>
  );
};
