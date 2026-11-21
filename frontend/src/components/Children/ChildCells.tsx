import React from 'react';
import { Pencil, ArrowRight, Clock } from 'lucide-react';
import { t, formatDisplayDate } from '../../utils/i18n';
import type { Child } from '../../types/family';
import { getChildGroupInfo } from '../../utils/childGroup';
import { getFamiliencardSummary, type FamiliencardSummary } from '../../utils/family';
export type { FamiliencardSummary };

export interface ChildStartDateCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

export const ChildStartDateCell: React.FC<ChildStartDateCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const groupInfo = getChildGroupInfo(child.group_changes);
  const cellId = `cell-start_date-${child.id}`;
  return (
    <div
      id={cellId}
      className="startdatum-cell-wrapper"
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        flex: 1,
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      title={readOnly ? t('viewGroupChanges') : t('manageGroupChanges')}
    >
      <span>{groupInfo.startDate ? formatDisplayDate(groupInfo.startDate) : '-'}</span>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          className="cell-edit-pencil-btn"
          title={t('manageGroupChanges')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export interface ChildGroupCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
  compact?: boolean;
  emptyText?: string;
}

export const ChildGroupCell: React.FC<ChildGroupCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
  compact = false,
  emptyText,
}) => {
  const groupInfo = getChildGroupInfo(child.group_changes);
  const cellId = compact ? `cell-group-summary-${child.id}` : `cell-group-${child.id}`;
  const hasChanges = Boolean(child.group_changes && child.group_changes.length > 0);
  const fallbackEmpty = emptyText || '-';

  if (readOnly && !hasChanges) {
    return (
      <div
        id={cellId}
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: compact ? '20px' : '28px',
          padding: compact ? '0 2px' : '2px 4px',
          color: 'var(--text-muted)',
          fontSize: compact ? '0.8rem' : 'inherit',
        }}
      >
        <span>{fallbackEmpty}</span>
      </div>
    );
  }

  return (
    <div
      id={cellId}
      className="child-group-cell-wrapper"
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: '0.25rem',
        minHeight: compact ? '20px' : '28px',
        borderRadius: '4px',
        padding: compact ? '0 2px' : '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
        fontSize: compact ? '0.8rem' : 'inherit',
      }}
      title={readOnly ? t('viewGroupChanges') : t('manageGroupChanges')}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
          fontWeight: 'normal',
          color: groupInfo.isExited || !hasChanges ? 'var(--text-muted)' : 'inherit',
        }}
      >
        <span className="child-group-compact-view">
          {!hasChanges ? (
            fallbackEmpty
          ) : groupInfo.groupName && groupInfo.sinceText ? (
            `${groupInfo.groupName} (${groupInfo.sinceText})${groupInfo.nextChangeText ? ` ${groupInfo.nextChangeText}` : ''}`
          ) : groupInfo.isFuture && groupInfo.groupName && groupInfo.futureDateText ? (
            `${groupInfo.groupName} (${groupInfo.futureDateText})`
          ) : (
            groupInfo.groupLabel
          )}
        </span>
        <span className="child-group-full-view" style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!hasChanges ? (
            <span>{fallbackEmpty}</span>
          ) : groupInfo.isFuture && groupInfo.groupName ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  width: '100px',
                  minWidth: '100px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  color: 'var(--text-muted)',
                }}
              >
                <ArrowRight size={13} style={{ flexShrink: 0 }} />
                <span>{groupInfo.groupName}</span>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  width: '135px',
                  minWidth: '135px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <Clock size={14} style={{ flexShrink: 0 }} />
                <span>{groupInfo.futureDateText}</span>
              </span>
            </span>
          ) : groupInfo.groupName && groupInfo.sinceText ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '100px',
                  minWidth: '100px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {groupInfo.groupName}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: '135px',
                  minWidth: '135px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {groupInfo.sinceText}
              </span>
              {groupInfo.nextChangeText ? (
                <span
                  style={{
                    display: 'inline-block',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {groupInfo.nextChangeText}
                </span>
              ) : null}
            </span>
          ) : (
            <span>{groupInfo.groupLabel}</span>
          )}
        </span>
      </div>
      {!readOnly && (
        <button
          type="button"
          className="cell-edit-pencil-btn child-group-manage-btn"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          title={t('manageGroupChanges')}
          aria-label={t('manageGroupChanges')}
        >
          <Pencil size={compact ? 11 : 13} />
        </button>
      )}
    </div>
  );
};

export interface ChildFamiliencardCellProps {
  child: Child;
  isActive: boolean;
  onOpenManage: (child: Child, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

export const ChildFamiliencardCell: React.FC<ChildFamiliencardCellProps> = ({
  child,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const summary = getFamiliencardSummary(child.familiencards);
  const cellId = `cell-familiencard-${child.id}`;

  return (
    <div
      id={cellId}
      className="familiencard-cell-wrapper"
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const cellEl = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(child, cellEl);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      title={readOnly ? t('viewFamiliencards') : t('manageFamiliencards')}
    >
      <span
        style={{
          color: summary.color,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.875rem',
        }}
      >
        {summary.text}
      </span>
      {!readOnly && (
        <button
          type="button"
          className="cell-edit-pencil-btn child-familiencard-manage-btn"
          onClick={(e) => {
            e.stopPropagation();
            const cellEl = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(child, cellEl);
          }}
          title={t('manageFamiliencards')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};
