import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Phone, Mail, Check, AlertCircle } from 'lucide-react';
import { t } from '../../utils/i18n';
import type { Parent } from '../../types/family';
import { PHONE_TYPES, type MultiValueEntry } from '../Table/MultiValueListEditor';

export interface ParentContactSelfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  getAuthHeaders: (headers?: Record<string, string>) => Record<string, string>;
  onSaved?: () => void;
  initialParentId?: string | null;
  userEmail?: string;
}

export const ParentContactSelfServiceModal: React.FC<ParentContactSelfServiceModalProps> = ({
  isOpen,
  onClose,
  getAuthHeaders,
  onSaved,
  initialParentId,
  userEmail,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const focusTargetRef = useRef<{ type: 'phone' | 'email'; index: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/self-service/parents', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const loadedParents: Parent[] = data.parents || [];
      setParents(loadedParents);

      if (loadedParents.length > 0) {
        if (initialParentId && loadedParents.some((p) => p.id === initialParentId)) {
          setSelectedParentId(initialParentId);
        } else if (userEmail) {
          const normEmail = userEmail.trim().toLowerCase();
          const match = loadedParents.find((p) =>
            p.emails?.some((e) => (typeof e === 'string' ? e : e.value || '').trim().toLowerCase() === normEmail)
          );
          setSelectedParentId(match ? match.id : loadedParents[0].id);
        } else {
          setSelectedParentId(loadedParents[0].id);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load contact data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, initialParentId, userEmail]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    } else {
      setParents([]);
      setError(null);
      setSuccess(null);
      focusTargetRef.current = null;
    }
  }, [isOpen, loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentParent = parents.find((p) => p.id === selectedParentId) || parents[0];

  const updateCurrentParent = (updater: (prev: Parent) => Parent) => {
    setParents((prevList) =>
      prevList.map((p) => (p.id === currentParent?.id ? updater(p) : p))
    );
  };

  const handlePhoneChange = (index: number, field: 'value' | 'type' | 'address_list', val: any) => {
    updateCurrentParent((parent) => {
      const phones = [...(parent.phones || [])];
      const entry: any = typeof phones[index] === 'string' ? { value: phones[index] } : { ...phones[index] };
      entry[field] = val;
      phones[index] = entry;
      return { ...parent, phones };
    });
  };

  const handleAddPhone = () => {
    const newIndex = (currentParent?.phones || []).length;
    focusTargetRef.current = { type: 'phone', index: newIndex };
    updateCurrentParent((parent) => {
      const phones: MultiValueEntry[] = [...(parent.phones || [])];
      phones.push({ value: '', type: 'mobile', address_list: true });
      return { ...parent, phones };
    });
  };

  const handleRemovePhone = (index: number) => {
    const phones = currentParent?.phones || [];
    const entry = phones[index];
    const val = (typeof entry === 'string' ? entry : entry?.value || '').trim();
    if (val.length > 0) {
      const confirmMsg = t('selfServiceDeletePhoneConfirm') || 'Möchten Sie diese Telefonnummer wirklich löschen?';
      if (!window.confirm(confirmMsg)) return;
    }
    updateCurrentParent((parent) => {
      const updatedPhones = [...(parent.phones || [])];
      updatedPhones.splice(index, 1);
      return { ...parent, phones: updatedPhones };
    });
  };

  const handleEmailChange = (index: number, field: 'value' | 'address_list', val: any) => {
    updateCurrentParent((parent) => {
      const emails = [...(parent.emails || [])];
      const entry: any = typeof emails[index] === 'string' ? { value: emails[index] } : { ...emails[index] };
      entry[field] = val;
      emails[index] = entry;
      return { ...parent, emails };
    });
  };

  const handleAddEmail = () => {
    const newIndex = (currentParent?.emails || []).length;
    focusTargetRef.current = { type: 'email', index: newIndex };
    updateCurrentParent((parent) => {
      const emails: MultiValueEntry[] = [...(parent.emails || [])];
      emails.push({ value: '', identifier_email: false, address_list: true });
      return { ...parent, emails };
    });
  };

  const handleRemoveEmail = (index: number) => {
    const emails = currentParent?.emails || [];
    const entry = emails[index];
    const val = (typeof entry === 'string' ? entry : entry?.value || '').trim();
    if (val.length > 0) {
      const confirmMsg = t('selfServiceDeleteEmailConfirm') || 'Möchten Sie diese E-Mail-Adresse wirklich löschen?';
      if (!window.confirm(confirmMsg)) return;
    }
    updateCurrentParent((parent) => {
      const updatedEmails = [...(parent.emails || [])];
      updatedEmails.splice(index, 1);
      return { ...parent, emails: updatedEmails };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const cleanedParents = parents.map((p) => {
      const cleanedPhones = (p.phones || []).filter((ph) => {
        const val = typeof ph === 'string' ? ph : ph.value;
        return (val || '').trim().length > 0;
      });
      const cleanedEmails = (p.emails || []).filter((em) => {
        const isIdent = typeof em === 'object' && em !== null && em.identifier_email;
        const val = typeof em === 'string' ? em : em.value;
        return isIdent || (val || '').trim().length > 0;
      });
      return {
        ...p,
        phones: cleanedPhones,
        emails: cleanedEmails,
      };
    });

    try {
      const res = await fetch('/api/self-service/parents', {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ parents: cleanedParents }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `HTTP ${res.status}`);
      }
      setSuccess(t('selfServiceSaveSuccess'));
      onSaved?.();
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Failed to save contact data');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" data-testid="self-service-modal">
      <div
        className="modal-container self-service-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-h)' }}>
              {t('selfServiceContactTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label={t('dismiss')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            data-testid="self-service-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: 'var(--danger-bg, #fee2e2)',
              color: 'var(--danger, #dc2626)',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            data-testid="self-service-success"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: 'var(--success-bg, #dcfce7)',
              color: 'var(--success, #16a34a)',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            <Check size={18} />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Lädt Kontaktdaten...
          </div>
        ) : !currentParent ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Keine Eltern für diese Familie gefunden.
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
            {parents.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                {parents.map((p) => {
                  const isSelected = p.id === currentParent.id;
                  const displayName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Elternteil';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedParentId(p.id)}
                      data-testid={`parent-tab-${p.id}`}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--accent-bg, rgba(59, 130, 246, 0.1))' : 'var(--bg-surface)',
                        color: isSelected ? 'var(--primary)' : 'var(--text)',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                    >
                      {displayName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Phone Numbers Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-h)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Phone size={16} />
                  {t('selfServicePhonesHeader')}
                </label>
              </div>

              {(currentParent.phones || []).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  Keine Telefonnummern hinterlegt.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(currentParent.phones || []).map((ph, idx) => {
                    const phoneVal = typeof ph === 'string' ? ph : ph.value || '';
                    const phoneType = typeof ph === 'object' && ph !== null && ph.type ? ph.type : 'mobile';
                    const inAddrList = typeof ph === 'object' && ph !== null ? ph.address_list !== false : true;

                    return (
                      <div
                        key={idx}
                        data-testid={`phone-row-${idx}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {/* Line 1: Type selector, phone input, delete button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <select
                            value={phoneType}
                            onChange={(e) => handlePhoneChange(idx, 'type', e.target.value)}
                            data-testid={`phone-type-${idx}`}
                            style={{
                              padding: '0.4rem',
                              borderRadius: '4px',
                              border: '1px solid var(--input-border)',
                              background: 'var(--input-bg)',
                              color: 'var(--input-text)',
                              fontSize: '0.85rem',
                            }}
                          >
                            {PHONE_TYPES.map((pt) => (
                              <option key={pt.key} value={pt.key}>
                                {pt.symbol} {pt.label}
                              </option>
                            ))}
                          </select>

                          <input
                            ref={(el) => {
                              if (el && focusTargetRef.current?.type === 'phone' && focusTargetRef.current?.index === idx) {
                                el.focus();
                                focusTargetRef.current = null;
                              }
                            }}
                            type="tel"
                            value={phoneVal}
                            onChange={(e) => handlePhoneChange(idx, 'value', e.target.value)}
                            placeholder="z. B. 0170 1234567"
                            data-testid={`phone-input-${idx}`}
                            style={{
                              flex: 1,
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px solid var(--input-border)',
                              background: 'var(--input-bg)',
                              color: 'var(--input-text)',
                              fontSize: '0.9rem',
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => handleRemovePhone(idx)}
                            data-testid={`delete-phone-${idx}`}
                            aria-label="Delete phone"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--danger, #dc2626)',
                              cursor: 'pointer',
                              padding: '0.25rem',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Line 2: In Addressliste anzeigen */}
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.15rem' }}>
                          <label
                            title={t('selfServiceAddressListLabel')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.825rem',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={inAddrList}
                              onChange={(e) => handlePhoneChange(idx, 'address_list', e.target.checked)}
                              data-testid={`phone-addrlist-${idx}`}
                            />
                            <span>{t('selfServiceAddressListLabel')}</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Phone button under the list of phone numbers */}
              <button
                type="button"
                onClick={handleAddPhone}
                data-testid="add-phone-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                }}
              >
                <Plus size={14} />
                {t('selfServiceAddPhone')}
              </button>
            </div>

            {/* Email Addresses Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-h)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Mail size={16} />
                  {t('selfServiceEmailsHeader')}
                </label>
              </div>

              {(currentParent.emails || []).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  Keine E-Mail-Adressen hinterlegt.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(currentParent.emails || []).map((em, idx) => {
                    const emailVal = typeof em === 'string' ? em : em.value || '';
                    const isIdentifier = typeof em === 'object' && em !== null && Boolean(em.identifier_email);
                    const inAddrList = typeof em === 'object' && em !== null ? em.address_list !== false : true;

                    return (
                      <div
                        key={idx}
                        data-testid={`email-row-${idx}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {/* Line 1: Email Input + Delete button if not identifier */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            ref={(el) => {
                              if (el && focusTargetRef.current?.type === 'email' && focusTargetRef.current?.index === idx) {
                                el.focus();
                                focusTargetRef.current = null;
                              }
                            }}
                            type="email"
                            value={emailVal}
                            disabled={isIdentifier}
                            onChange={(e) => handleEmailChange(idx, 'value', e.target.value)}
                            placeholder="name@example.com"
                            data-testid={`email-input-${idx}`}
                            style={{
                              flex: 1,
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px solid var(--input-border)',
                              background: isIdentifier ? 'var(--bg-subtle, #f3f4f6)' : 'var(--input-bg)',
                              color: isIdentifier ? 'var(--text-secondary)' : 'var(--input-text)',
                              fontSize: '0.9rem',
                              cursor: isIdentifier ? 'not-allowed' : 'text',
                            }}
                          />

                          {!isIdentifier && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(idx)}
                              data-testid={`delete-email-${idx}`}
                              aria-label="Delete email"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--danger, #dc2626)',
                                cursor: 'pointer',
                                padding: '0.25rem',
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        {/* Line 2 (if isIdentifier): Why can't you edit this field info text */}
                        {isIdentifier && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                            <span>ℹ️ {t('selfServiceLoginEmailNote')}</span>
                          </div>
                        )}

                        {/* Line 3 (or Line 2 if not identifier): In Addressliste anzeigen checkbox - below info text */}
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.15rem' }}>
                          <label
                            title={t('selfServiceAddressListLabel')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.825rem',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={inAddrList}
                              onChange={(e) => handleEmailChange(idx, 'address_list', e.target.checked)}
                              data-testid={`email-addrlist-${idx}`}
                            />
                            <span>{t('selfServiceAddressListLabel')}</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Email button under the list of emails */}
              <button
                type="button"
                onClick={handleAddEmail}
                data-testid="add-email-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                }}
              >
                <Plus size={14} />
                {t('selfServiceAddEmail')}
              </button>
            </div>

            <div
              data-testid="self-service-footer-note"
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                marginTop: '1rem',
                padding: '0.65rem 0.75rem',
                background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                lineHeight: 1.4,
              }}
            >
              {t('selfServiceContactFooterNote')}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button type="button" className="cancel-btn" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="submit-btn"
            onClick={handleSave}
            disabled={loading || saving}
            data-testid="save-self-service-btn"
          >
            {saving ? t('selfServiceSaving') : t('selfServiceSave')}
          </button>
        </div>
      </div>
    </div>
  );
};
