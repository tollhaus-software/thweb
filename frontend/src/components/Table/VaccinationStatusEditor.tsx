import React, { useState } from 'react';
import { ShieldCheck, Plus, Trash2, Edit3, X, Check, Lock } from 'lucide-react';
import { t } from '../../utils/i18n';

export interface VaccinationCheck {
  vaccination_type: string;
  checked_by: string;
  checked_on: string;
  proof_seen: string;
}

interface VaccinationStatusEditorProps {
  checks?: VaccinationCheck[];
  currentUserEmail?: string;
  onSave: (newChecks: VaccinationCheck[]) => void;
  isUnlocked?: boolean;
  onUnlock?: () => void;
}

export const VaccinationStatusEditor: React.FC<VaccinationStatusEditorProps> = ({
  checks = [],
  currentUserEmail = '',
  onSave,
  isUnlocked = true,
  onUnlock,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localChecks, setLocalChecks] = useState<VaccinationCheck[]>(checks);

  // New item form state
  const [vType, setVType] = useState('Masern');
  const [proof, setProof] = useState('Impfausweis');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [by, setBy] = useState(currentUserEmail);

  const handleOpen = () => {
    setLocalChecks(checks || []);
    setBy(currentUserEmail);
    setDate(new Date().toISOString().split('T')[0]);
    setIsOpen(true);
  };

  const handleAddCheck = () => {
    if (!vType.trim()) return;
    const newCheck: VaccinationCheck = {
      vaccination_type: vType.trim(),
      proof_seen: proof.trim() || 'Impfausweis',
      checked_on: date || new Date().toISOString().split('T')[0],
      checked_by: by.trim() || currentUserEmail || 'admin',
    };
    setLocalChecks([...localChecks, newCheck]);
    setVType('Masern');
    setProof('Impfausweis');
  };

  const handleRemoveCheck = (index: number) => {
    setLocalChecks(localChecks.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(localChecks);
    setIsOpen(false);
  };

  if (!isUnlocked) {
    return (
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <div
          onClick={onUnlock}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.25rem 0.4rem',
            borderRadius: '4px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'all 0.15s ease',
          }}
          title={t('vaccinationStatusHidden')}
        >
          <Lock size={14} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      {/* Display Badge View */}
      <div
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.5rem',
          borderRadius: '4px',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          fontSize: '0.825rem',
          color: 'var(--text)',
          transition: 'all 0.15s ease',
        }}
        title="Klicken zum Bearbeiten des Impfstatus"
      >
        <ShieldCheck size={14} style={{ color: 'var(--text-muted)' }} />
        {checks.length > 0 ? (
          <span>
            {checks.map((c) => c.vaccination_type).join(', ')} ({checks.length})
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Kein Impfnachweis</span>
        )}
        <Edit3 size={12} style={{ marginLeft: '0.2rem', color: 'var(--text-muted)', opacity: 0.7 }} />
      </div>

      {/* Modal / Dialog Popover */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '12px',
              padding: '1.25rem',
              width: '460px',
              maxWidth: '92vw',
              boxShadow: 'var(--shadow)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="#16a34a" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-h)' }}>
                  Geschützter Impfstatus
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* List of Current Checks */}
            <div style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
              {localChecks.length === 0 ? (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
                  Keine verifizierten Impfnachweise eingetragen.
                </div>
              ) : (
                localChecks.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      marginBottom: '0.35rem',
                      background: 'var(--bg-subtle)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-h)' }}>{item.vaccination_type}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Nachweis: {item.proof_seen} | Am: {item.checked_on} ({item.checked_by})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCheck(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '0.2rem',
                      }}
                      title="Löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New Check Form */}
            <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Neuen Nachweis erfassen
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Impfung</label>
                  <input
                    type="text"
                    value={vType}
                    onChange={(e) => setVType(e.target.value)}
                    placeholder="z.B. Masern"
                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.825rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Gesehener Nachweis</label>
                  <input
                    type="text"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    placeholder="z.B. Impfausweis"
                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.825rem' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Geprüft am</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.825rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Geprüft von</label>
                  <input
                    type="text"
                    value={by}
                    onChange={(e) => setBy(e.target.value)}
                    placeholder="E-Mail"
                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.825rem' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddCheck}
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <Plus size={14} /> Eintragen
              </button>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '0.4rem 0.85rem',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  padding: '0.4rem 0.85rem',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Check size={14} /> Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
