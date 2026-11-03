import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Search } from 'lucide-react';
import { CellPopover } from './CellPopover';
import { t } from '../../utils/i18n';
import { getFamilyName, type FamilyLike } from '../../utils/family';

export interface MentorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  family: FamilyLike | null;
  allFamilies: FamilyLike[];
  onSaveMentor: (familyId: string, mentorFamilyId: string | null, mentorParentIds: string[]) => Promise<void>;
  readOnly?: boolean;
}

export const MentorPopover: React.FC<MentorPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  family,
  allFamilies,
  onSaveMentor,
  readOnly = false,
}) => {
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [isOnlyIndividual, setIsOnlyIndividual] = useState<boolean>(false);
  const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (family && isOpen) {
      setSelectedFamilyId(family.mentor_family_id || null);
      const hasSpecificParents = Boolean(family.mentor_parent_ids && family.mentor_parent_ids.length > 0);
      setIsOnlyIndividual(hasSpecificParents);
      setSelectedParentIds(new Set(family.mentor_parent_ids || []));
      setSearchTerm('');
      setError(null);
    }
  }, [family, isOpen]);

  const candidateFamilies = useMemo(() => {
    const list = allFamilies.filter((f) => f.id !== family?.id);
    return list.sort((a, b) => getFamilyName(a).localeCompare(getFamilyName(b)));
  }, [allFamilies, family?.id]);

  const filteredCandidates = useMemo(() => {
    if (!searchTerm.trim()) return candidateFamilies;
    const term = searchTerm.toLowerCase();
    return candidateFamilies.filter((f) => {
      const fn = getFamilyName(f).toLowerCase();
      const parentNames = (f.parents || [])
        .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase())
        .join(' ');
      return fn.includes(term) || parentNames.includes(term);
    });
  }, [candidateFamilies, searchTerm]);

  const currentMentorFamily = useMemo(() => {
    if (!selectedFamilyId) return null;
    return allFamilies.find((f) => f.id === selectedFamilyId) || null;
  }, [allFamilies, selectedFamilyId]);

  const handleSelectFamily = (famId: string | null) => {
    setSelectedFamilyId(famId);
    setError(null);
    if (!famId) {
      setIsOnlyIndividual(false);
      setSelectedParentIds(new Set());
      return;
    }
    // Reset selected parents so none are checked by default
    setSelectedParentIds(new Set());
  };

  const handleToggleParent = (parentId: string) => {
    setError(null);
    setSelectedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const isSaveDisabled = Boolean(
    selectedFamilyId && isOnlyIndividual && selectedParentIds.size === 0
  );

  const handleSave = async () => {
    if (!family || isSaveDisabled) return;

    try {
      setIsSaving(true);
      setError(null);
      const parentIdsToSave = selectedFamilyId && isOnlyIndividual ? Array.from(selectedParentIds) : [];
      await onSaveMentor(family.id, selectedFamilyId, parentIdsToSave);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save mentor');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !family) return null;

  const targetFamilyName = getFamilyName(family);

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={360}
      minWidth={320}
      className="mentor-popover glass-popup"
    >
      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
            {t('manageMentors')}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {t('family')}: <strong style={{ color: 'var(--text)' }}>{targetFamilyName}</strong>
        </div>

        {error && (
          <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '4px', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        {/* Family Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
            {t('mentorFamily')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={t('searchFamilies')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem 0.35rem 1.6rem',
                fontSize: '0.825rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-surface)',
                color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
            <Search size={13} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          <select
            value={selectedFamilyId || ''}
            onChange={(e) => handleSelectFamily(e.target.value || null)}
            disabled={readOnly}
            size={5}
            style={{
              width: '100%',
              padding: '0.35rem',
              fontSize: '0.825rem',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              color: 'var(--text)',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          >
            <option value="">{t('noMentorFamily')}</option>
            {filteredCandidates.map((f) => (
              <option key={f.id} value={f.id}>
                Familie {getFamilyName(f)}
              </option>
            ))}
          </select>
        </div>

        {/* Options if a mentor family is selected */}
        {currentMentorFamily && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px', background: 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', cursor: readOnly ? 'default' : 'pointer', color: 'var(--text)' }}>
              <input
                type="radio"
                name="mentor_scope"
                checked={!isOnlyIndividual}
                onChange={() => {
                  if (readOnly) return;
                  setIsOnlyIndividual(false);
                  setError(null);
                }}
                disabled={readOnly}
              />
              <span>{t('wholeFamilyMentors')}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', cursor: readOnly ? 'default' : 'pointer', color: 'var(--text)' }}>
              <input
                type="radio"
                name="mentor_scope"
                checked={isOnlyIndividual}
                onChange={() => {
                  if (readOnly) return;
                  setIsOnlyIndividual(true);
                  setError(null);
                }}
                disabled={readOnly}
              />
              <span>{t('individualParentsMentors')}</span>
            </label>

            {isOnlyIndividual && (
              <div style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
                {(currentMentorFamily.parents || []).map((parent) => {
                  if (!parent.id) return null;
                  const fullName = `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || 'Parent';
                  return (
                    <label key={parent.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: readOnly ? 'default' : 'pointer', color: 'var(--text)' }}>
                      <input
                        type="checkbox"
                        checked={selectedParentIds.has(parent.id)}
                        onChange={() => {
                          if (readOnly) return;
                          handleToggleParent(parent.id!);
                        }}
                        disabled={readOnly}
                      />
                      <span>{fullName}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="secondary-button"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
          >
            {t('cancel')}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isSaveDisabled}
              className="primary-button"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Check size={13} />
              <span>{isSaving ? t('saving') : t('save')}</span>
            </button>
          )}
        </div>
      </div>
    </CellPopover>
  );
};
