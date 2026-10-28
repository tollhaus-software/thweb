import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import { combineAddressesToShared } from '../../utils/address';

export interface AddressEditorParent {
  id: string;
  first_name?: string;
  last_name?: string;
  address?: string;
}

export interface AddressEditorProps<T extends AddressEditorParent = AddressEditorParent> {
  parent: T;
  familyParents?: T[];
  onSave: (updatedParents: T[]) => void;
  placeholder?: string;
  canEdit?: boolean;
}

export const AddressEditor = <T extends AddressEditorParent>({
  parent,
  familyParents,
  onSave,
  placeholder,
  canEdit = true,
}: AddressEditorProps<T>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [mode, setMode] = useState<'shared' | 'individual'>('shared');
  const [sharedAddress, setSharedAddress] = useState('');
  const [individualAddresses, setIndividualAddresses] = useState<Record<string, string>>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  const sharedInputRef = useRef<HTMLInputElement>(null);
  const indInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastComputedSharedRef = useRef<string>('');

  const list = familyParents && familyParents.length > 0 ? familyParents : [parent];

  const getInitialState = useCallback(() => {
    const list = familyParents && familyParents.length > 0 ? familyParents : [parent];
    const rawAddresses = list.map((p) => (p.address || '').trim());
    const allEqual =
      list.length <= 1 || list.every((p) => (p.address || '').trim() === rawAddresses[0]);

    const indMap: Record<string, string> = {};
    list.forEach((p) => {
      indMap[p.id] = p.address || '';
    });

    if (allEqual) {
      const initialShared = list[0]?.address || '';
      return {
        mode: 'shared' as const,
        shared: initialShared,
        individual: indMap,
      };
    } else {
      const initialShared = combineAddressesToShared(rawAddresses);
      return {
        mode: 'individual' as const,
        shared: initialShared,
        individual: indMap,
      };
    }
  }, [familyParents, parent]);

  const startEditing = () => {
    const init = getInitialState();
    setMode(init.mode);
    setSharedAddress(init.shared);
    setIndividualAddresses(init.individual);
    lastComputedSharedRef.current = init.shared;
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) {
      if (mode === 'shared') {
        setTimeout(() => {
          if (sharedInputRef.current) {
            sharedInputRef.current.focus();
            const len = sharedInputRef.current.value.length;
            sharedInputRef.current.setSelectionRange(len, len);
          }
        }, 50);
      } else {
        setTimeout(() => {
          const targetInput = indInputRefs.current[parent.id] || Object.values(indInputRefs.current)[0];
          if (targetInput) {
            targetInput.focus();
            const len = targetInput.value.length;
            targetInput.setSelectionRange(len, len);
          }
        }, 50);
      }
    }
  }, [isEditing, mode, parent.id]);

  const handleModeChange = (newMode: 'shared' | 'individual') => {
    if (newMode === mode) return;

    const list = familyParents && familyParents.length > 0 ? familyParents : [parent];

    if (newMode === 'shared') {
      // Going back from "individuelle adressen" to "gemeinsame Adresse":
      // First, all empty addresses should be ignored.
      // Then, if more than one address is left, the addresses should be joined on the "; " separator.
      const currentAddrs = list.map((p) => individualAddresses[p.id] ?? p.address ?? '');
      const combined = combineAddressesToShared(currentAddrs);
      setSharedAddress(combined);
      lastComputedSharedRef.current = combined;
      setMode('shared');
    } else {
      // Switching to "individuelle Adressen"
      setIndividualAddresses((prev) => {
        const next = { ...prev };
        // If sharedAddress was modified while in shared mode, propagate it
        const wasModifiedInShared = sharedAddress !== lastComputedSharedRef.current;
        list.forEach((p) => {
          if (wasModifiedInShared || next[p.id] === undefined) {
            next[p.id] = sharedAddress;
          }
        });
        return next;
      });
      setMode('individual');
    }
  };

  const handleSave = useCallback(() => {
    const list = familyParents && familyParents.length > 0 ? familyParents : [parent];
    let updatedParents: T[];

    if (mode === 'shared') {
      const trimmed = sharedAddress.trim();
      updatedParents = list.map((p) => ({
        ...p,
        address: trimmed,
      }));
    } else {
      updatedParents = list.map((p) => ({
        ...p,
        address: (individualAddresses[p.id] ?? p.address ?? '').trim(),
      }));
    }

    onSave(updatedParents);
    setIsEditing(false);
  }, [mode, sharedAddress, individualAddresses, familyParents, parent, onSave]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const currentDisplayAddress = parent.address || '';
  const listToRender = familyParents && familyParents.length > 0 ? familyParents : [parent];

  return (
    <div
      ref={triggerRef}
      style={{ position: 'relative', width: '100%', display: 'inline-block' }}
    >
      <div
        className="address-cell-wrapper"
        onDoubleClick={(e) => {
          if (!canEdit) return;
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          if (!isEditing) {
            startEditing();
          }
        }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          gap: '0.25rem',
          minHeight: '28px',
          borderRadius: '4px',
          backgroundColor: isEditing ? 'var(--accent-bg)' : 'transparent',
          padding: '2px 4px',
          transition: 'background-color 0.15s ease-in-out',
        }}
        title={currentDisplayAddress || placeholder || t('addAddress')}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: currentDisplayAddress ? 'var(--text-h)' : '#94a3b8',
            fontStyle: currentDisplayAddress ? 'normal' : 'italic',
            fontSize: '0.875rem',
            flex: 1,
            textAlign: 'left',
          }}
        >
          {currentDisplayAddress || placeholder || t('addAddress')}
        </span>
        {canEdit && (
          <div className="cell-edit-pencil-btn-wrapper" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
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
              className="cell-edit-pencil-btn"
              title={t('editAddress')}
            >
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>

      <CellPopover
        isOpen={isEditing}
        onClose={handleCancel}
        anchorEl={triggerRef}
        width={380}
        minWidth={320}
        style={{
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Popover Header */}
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '6px',
          }}
        >
          <span>{t('address')}</span>
          <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(Enter to save)</span>
        </div>

        {/* Radio Buttons on Top (only if multiple parents in family) */}
        {list.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '2px 0',
            }}
          >
            <label
              htmlFor={`address-mode-shared-${parent.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--text)',
                userSelect: 'none',
              }}
            >
              <input
                type="radio"
                id={`address-mode-shared-${parent.id}`}
                name={`address-mode-${parent.id}`}
                value="shared"
                checked={mode === 'shared'}
                onChange={() => handleModeChange('shared')}
                style={{ cursor: 'pointer' }}
              />
              <span>{t('sharedAddress')}</span>
            </label>
            <label
              htmlFor={`address-mode-individual-${parent.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--text)',
                userSelect: 'none',
              }}
            >
              <input
                type="radio"
                id={`address-mode-individual-${parent.id}`}
                name={`address-mode-${parent.id}`}
                value="individual"
                checked={mode === 'individual'}
                onChange={() => handleModeChange('individual')}
                style={{ cursor: 'pointer' }}
              />
              <span>{t('individualAddresses')}</span>
            </label>
          </div>
        )}

        {/* Form Inputs based on Mode */}
        {mode === 'shared' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              ref={sharedInputRef}
              type="text"
              aria-label={list.length > 1 ? t('sharedAddress') : (t('address') || 'Adresse')}
              value={sharedAddress}
              onChange={(e) => setSharedAddress(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('address')}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {listToRender.map((p, idx) => {
              const givenName = p.first_name || p.last_name || `${t('parent')} ${idx + 1}`;
              return (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label
                    htmlFor={`ind-address-${p.id}`}
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textAlign: 'left',
                    }}
                  >
                    {givenName}
                  </label>
                  <input
                    id={`ind-address-${p.id}`}
                    ref={(el) => {
                      indInputRefs.current[p.id] = el;
                    }}
                    type="text"
                    aria-label={`${givenName} ${t('address')}`}
                    value={individualAddresses[p.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setIndividualAddresses((prev) => ({ ...prev, [p.id]: val }));
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('address')}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
          >
            <X size={12} />
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              background: 'var(--primary)',
              color: 'var(--primary-contrast, #ffffff)',
              cursor: 'pointer',
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <Check size={12} />
            {t('save')}
          </button>
        </div>
      </CellPopover>
    </div>
  );
};
export default AddressEditor;
