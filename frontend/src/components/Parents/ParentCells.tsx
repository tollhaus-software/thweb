import React from 'react';
import { Pencil, Check, X, ArrowUpRight } from 'lucide-react';
import { MultiValueCell } from '../Table/MultiValueCell';
import { t, formatDisplayDate } from '../../utils/i18n';
import {
  getMembershipStatus,
  getMentorsDisplay,
  getMentoredFamiliesForParent,
} from '../../utils/family';
import type { Parent, Family } from '../../types/family';

export interface ParentMembershipCellProps {
  parent: Parent;
  isActive: boolean;
  onOpenManage: (parent: Parent, anchor: HTMLElement | string) => void;
}

export const ParentMembershipCell: React.FC<ParentMembershipCellProps> = ({
  parent,
  isActive,
  onOpenManage,
}) => {
  const status = getMembershipStatus(parent.memberships);
  const cellId = `cell-membership-${parent.id}`;

  return (
    <div
      id={cellId}
      className="membership-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(parent, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        flex: 1,
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
      }}
      title={t('manageMemberships')}
    >
      <span
        style={{
          color: status.color,
          fontWeight: status.fontWeight || 'normal',
          fontStyle: status.fontStyle || 'normal',
        }}
      >
        {status.text}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const cellEl = document.getElementById(cellId) || e.currentTarget;
          onOpenManage(parent, cellEl);
        }}
        className="cell-edit-pencil-btn"
        title={t('manageMemberships')}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
};

export interface ParentConsentCellProps {
  parent: Parent;
  isActive: boolean;
  onOpenManage: (parent: Parent, anchor: HTMLElement) => void;
  canEdit: boolean;
}

export const ParentConsentCell: React.FC<ParentConsentCellProps> = ({
  parent,
  isActive,
  onOpenManage,
  canEdit,
}) => {
  const sortedConsents = React.useMemo(() => {
    return [...(parent.contact_consents || [])].sort((a, b) => {
      const timeA = new Date(a.granted_at).getTime();
      const timeB = new Date(b.granted_at).getTime();
      if (timeB !== timeA) return timeB - timeA;
      const crA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const crB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return crB - crA;
    });
  }, [parent.contact_consents]);
  const activeConsent = sortedConsents[0];
  const cellId = `cell-consent-${parent.id}`;

  const isGranted = activeConsent?.status === 'granted';
  const isRevoked = activeConsent?.status === 'revoked';
  const displayDate = activeConsent?.granted_at ? formatDisplayDate(activeConsent.granted_at) : '';

  return (
    <div
      id={cellId}
      className="consent-cell-wrapper"
      onClick={(e) => {
        if (!canEdit) return;
        e.stopPropagation();
        onOpenManage(parent, e.currentTarget);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 6px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        cursor: canEdit ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease-in-out',
      }}
      title={canEdit ? t('contactConsent') : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {isGranted ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: '#15803d',
              background: 'rgba(34, 197, 94, 0.12)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <Check size={12} />
            <span>{t('consentGranted')}{displayDate ? ` (${displayDate})` : ''}</span>
          </span>
        ) : isRevoked ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: '#b91c1c',
              background: 'rgba(239, 68, 68, 0.12)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <X size={12} />
            <span>{t('consentRevoked')}{displayDate ? ` (${displayDate})` : ''}</span>
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
        )}
      </div>

      {canEdit && (
        <button
          type="button"
          className="cell-edit-pencil-btn"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            opacity: 0.6,
          }}
          title={t('contactConsent')}
          onClick={(e) => {
            e.stopPropagation();
            onOpenManage(parent, e.currentTarget.parentElement || e.currentTarget);
          }}
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
};

export interface ParentMultiValueCellProps {
  parent: Parent;
  field: 'emails' | 'phones';
  placeholder: string;
  isActive: boolean;
  onOpenManage: (parent: Parent, field: 'emails' | 'phones', anchor: HTMLElement | string) => void;
  canEdit?: boolean;
}

export const ParentMultiValueCell: React.FC<ParentMultiValueCellProps> = ({
  parent,
  field,
  placeholder,
  isActive,
  onOpenManage,
  canEdit = true,
}) => (
  <MultiValueCell
    id={parent.id}
    field={field}
    values={parent[field] || []}
    placeholder={placeholder}
    isActive={isActive}
    onOpenManage={(_, anchor) => onOpenManage(parent, field, anchor)}
    canEdit={canEdit}
  />
);

export interface ParentMentorsCellProps {
  parent?: Parent;
  family?: Family;
  families: Family[];
  isActive: boolean;
  canWriteFamilies: boolean;
  onJumpToFamily?: (familyId: string, tab?: any) => void;
  onOpenManageMentor: (family: Family, anchor: HTMLElement) => void;
}

export const ParentMentorsCell: React.FC<ParentMentorsCellProps> = ({
  parent: _parent,
  family,
  families,
  isActive,
  canWriteFamilies,
  onJumpToFamily,
  onOpenManageMentor,
}) => {
  const mentorDisplay = getMentorsDisplay(family, families);

  return (
    <div
      className="paten-cell-wrapper"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '28px',
        gap: '0.35rem',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
        {mentorDisplay.isFamily && mentorDisplay.mentorFamily ? (
          <button
            type="button"
            className="family-parent-link"
            onClick={(e) => {
              e.stopPropagation();
              onJumpToFamily?.(mentorDisplay.mentorFamily!.id, 'families');
            }}
            title={t('jumpToFamily')}
          >
            <span>{mentorDisplay.text}</span>
            <ArrowUpRight size={12} className="family-link-icon" />
          </button>
        ) : (
          <span style={{ color: mentorDisplay.text === '-' ? 'var(--text-muted)' : 'inherit' }}>
            {mentorDisplay.text}
          </span>
        )}
      </div>
      {canWriteFamilies && family && (
        <button
          type="button"
          className={`cell-edit-pencil-btn ${isActive ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenManageMentor(family, e.currentTarget);
          }}
          title={t('manageMentors')}
          style={{ marginLeft: 'auto' }}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export interface ParentMentorsOfCellProps {
  parent: Parent;
  families: Family[];
  onJumpToFamily?: (familyId: string, tab?: any) => void;
}

export const ParentMentorsOfCell: React.FC<ParentMentorsOfCellProps> = ({
  parent,
  families,
  onJumpToFamily,
}) => {
  if (!parent) return <span>-</span>;
  const mentored = getMentoredFamiliesForParent(parent, families);

  return (
    <div
      className="paten-von-cell-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        alignItems: 'flex-start',
        textAlign: 'left',
        width: '100%',
      }}
    >
      {mentored.length === 0 ? (
        <span style={{ color: 'var(--text-muted)' }}>-</span>
      ) : (
        mentored.map((item) => (
          <div
            key={item.family.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.25rem',
              textAlign: 'left',
            }}
          >
            <span>{`${item.datePrefix} - `}</span>
            <button
              type="button"
              className="family-parent-link"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToFamily?.(item.family.id, 'families');
              }}
              title={t('jumpToFamily')}
            >
              <span>{`Familie ${item.canonicalName}`}</span>
              <ArrowUpRight size={12} className="family-link-icon" />
            </button>
          </div>
        ))
      )}
    </div>
  );
};
