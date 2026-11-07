import React, { useRef, useState } from 'react';
import { ZoomIn, ChevronDown, Check, RotateCcw } from 'lucide-react';
import { useTableZoom } from '../../hooks/useTableZoom';
import { CellPopover } from './CellPopover';
import { t } from '../../utils/i18n';

interface TableZoomControlProps {
  className?: string;
  style?: React.CSSProperties;
}

export const TableZoomControl: React.FC<TableZoomControlProps> = ({ className, style }) => {
  const { zoomFactor, setZoomFactor, zoomLevels } = useTableZoom();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentPercent = Math.round(zoomFactor * 100);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`secondary-button table-zoom-button ${className || ''}`}
        aria-label={t('zoomFactor') || 'Zoom factor'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        data-testid="table-zoom-button"
        style={style}
        title={t('zoomFactor') || 'Zoom factor'}
      >
        <ZoomIn size={14} className="zoom-icon" style={{ opacity: 0.75, flexShrink: 0 }} />
        <span className="zoom-label" data-testid="table-zoom-label" style={{ fontWeight: 600 }}>
          {currentPercent}%
        </span>
        <ChevronDown size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      <CellPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorEl={buttonRef}
        width={190}
        minWidth={170}
      >
        <div
          style={{
            padding: '0.35rem 0.6rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderBottom: '1px solid var(--border)',
            marginBottom: '0.35rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('zoom') || 'Zoom'}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>
            {currentPercent}%
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          {zoomLevels.map((lvl) => {
            const isSelected = Math.abs(zoomFactor - lvl) < 0.001;
            const pct = Math.round(lvl * 100);
            return (
              <button
                key={lvl}
                type="button"
                className={`table-zoom-option-btn ${isSelected ? 'active' : ''}`}
                data-zoom-value={lvl}
                data-testid={`zoom-option-${pct}`}
                onClick={() => {
                  setZoomFactor(lvl);
                  setIsOpen(false);
                }}
              >
                <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <Check size={14} color="var(--primary)" />}
                </div>
                <span>
                  {pct}%{lvl === 1.0 ? ` (${t('zoomDefault') || 'Standard'})` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {Math.abs(zoomFactor - 1.0) >= 0.001 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.35rem', paddingTop: '0.35rem' }}>
            <button
              type="button"
              className="table-zoom-reset-btn"
              data-testid="zoom-reset-btn"
              onClick={() => {
                setZoomFactor(1.0);
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                gap: '0.35rem',
                padding: '0.35rem 0.5rem',
                fontSize: '0.8rem',
                color: 'var(--primary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              <RotateCcw size={12} />
              <span>{t('zoomReset') || 'Auf 100% zurücksetzen'}</span>
            </button>
          </div>
        )}
      </CellPopover>
    </>
  );
};
