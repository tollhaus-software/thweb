import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface CellPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  children: React.ReactNode;
  width?: number;
  minWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  closeOnScrollOutOfView?: boolean;
}

/**
 * Reusable cell popover that positions itself fixed in viewport space
 * adjacent to a table cell or trigger element (above or below, clamped to viewport).
 * Matches the exact positioning logic of Notes popover.
 * Handles window scroll/resize, outside clicks, and esc key.
 */
export const CellPopover: React.FC<CellPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  children,
  width = 360,
  minWidth = 300,
  className = 'glass-popup',
  style,
  closeOnScrollOutOfView = true,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  const getTargetEl = useCallback((): HTMLElement | null => {
    if (!anchorEl) return null;
    if (typeof anchorEl === 'function') {
      return anchorEl();
    }
    if (typeof anchorEl === 'string') {
      return document.querySelector(anchorEl);
    }
    if ('current' in anchorEl) {
      return anchorEl.current;
    }
    if (anchorEl instanceof HTMLElement) {
      if (!anchorEl.isConnected && anchorEl.id) {
        return document.getElementById(anchorEl.id);
      }
      return anchorEl;
    }
    return null;
  }, [anchorEl]);

  const getPositionStyle = useCallback((): React.CSSProperties | null => {
    const el = getTargetEl();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
      return null;
    }

    const POPUP_WIDTH = width;
    const PADDING = 8;
    const GAP = 4;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const actualWidth = Math.min(POPUP_WIDTH, viewportWidth - 2 * PADDING);
    let left = rect.left;
    if (left + actualWidth > viewportWidth - PADDING) {
      left = viewportWidth - actualWidth - PADDING;
    }
    if (left < PADDING) {
      left = PADDING;
    }

    const popupHeight = popupRef.current?.offsetHeight || 240;
    const spaceBelow = viewportHeight - rect.bottom - GAP - PADDING;
    const spaceAbove = rect.top - GAP - PADDING;

    const openBelow = spaceBelow >= popupHeight || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(160, openBelow ? spaceBelow : spaceAbove);

    return {
      position: 'fixed',
      left: `${left}px`,
      width: `${actualWidth}px`,
      zIndex: 9999,
      maxHeight: `${maxHeight}px`,
      ...(openBelow
        ? { top: `${rect.bottom + GAP}px`, bottom: 'auto' }
        : { bottom: `${viewportHeight - rect.top + GAP}px`, top: 'auto' }),
    };
  }, [getTargetEl, width]);

  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>(() => {
    return getPositionStyle() || { position: 'fixed', visibility: 'hidden' };
  });

  // Position updates on scroll / resize / open
  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const el = getTargetEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (
        closeOnScrollOutOfView &&
        (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth)
      ) {
        onClose();
        return;
      }
      const pos = getPositionStyle();
      if (pos) {
        setPositionStyle(pos);
      }
    };

    updatePosition();

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, getTargetEl, getPositionStyle, onClose, closeOnScrollOutOfView]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Do not close CellPopover if the user clicked inside an easy-edit dropdown
      if ((target as Element)?.closest?.('.easy-edit-calendar-dropdown, .easy-edit-select-dropdown')) {
        return;
      }
      const el = getTargetEl();
      if (popupRef.current && !popupRef.current.contains(target) && (!el || !el.contains(target))) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, getTargetEl]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={popupRef}
      className={className}
      style={{
        ...positionStyle,
        minWidth,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow)',
        boxSizing: 'border-box',
        animation: 'fadeIn 0.15s ease-out',
        overflowY: 'auto',
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};
