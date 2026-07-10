import React, { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { t } from '../../utils/i18n';

interface MultiValueListEditorProps {
  values: string[];
  onSave: (newValues: string[]) => void;
  placeholder: string;
}

export const MultiValueListEditor: React.FC<MultiValueListEditorProps> = ({
  values = [],
  onSave,
  placeholder,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (idx: number, currentVal: string) => {
    setEditingIndex(idx);
    setEditValue(currentVal);
  };

  const handleStartAdd = () => {
    setEditingIndex(-1);
    setEditValue('');
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    const newValues = [...values];
    if (editingIndex === -1) {
      if (trimmed) {
        newValues.push(trimmed);
      }
    } else if (editingIndex !== null) {
      if (trimmed === '') {
        // Remove item if saved empty
        newValues.splice(editingIndex, 1);
      } else {
        newValues[editingIndex] = trimmed;
      }
    }
    onSave(newValues);
    setEditingIndex(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Render empty placeholder
  if (values.length === 0 && editingIndex === null) {
    return (
      <div
        className="easy-edit-wrapper"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
        onClick={handleStartAdd}
      >
        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{placeholder}</span>
        <div className="easy-edit-view-button-wrapper" style={{ opacity: hovered ? 1 : 0.3 }}>
          <button type="button" className="easy-edit-button">
            <Pencil size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Values List Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        {values.map((val, idx) => {
          if (editingIndex === idx) {
            return (
              <div key={idx} className="easy-edit-inline-wrapper" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <div className="easy-edit-buttons-container">
                  <button type="button" className="easy-edit-button" onClick={handleSave}>✔️</button>
                  <button type="button" className="easy-edit-button" onClick={handleCancel}>❌</button>
                </div>
              </div>
            );
          }

          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: '26px' }}>
              <span>{val}</span>
              {/* Pencil icon for this line */}
              <div className="easy-edit-view-button-wrapper" style={{ opacity: hovered ? 0.8 : 0 }}>
                <button
                  type="button"
                  className="easy-edit-button"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}
                  onClick={() => handleStartEdit(idx, val)}
                >
                  <Pencil size={12} style={{ color: '#64748b' }} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add new input at the bottom */}
        {editingIndex === -1 && (
          <div className="easy-edit-inline-wrapper" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder={t('newItem')}
            />
            <div className="easy-edit-buttons-container">
              <button type="button" className="easy-edit-button" onClick={handleSave}>✔️</button>
              <button type="button" className="easy-edit-button" onClick={handleCancel}>❌</button>
            </div>
          </div>
        )}
      </div>

      {/* Single + Button on the right, vertically centered */}
      {values.length > 0 && editingIndex === null && (
        <div className="easy-edit-view-button-wrapper" style={{ opacity: hovered ? 0.8 : 0.3, alignSelf: 'center', display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            className="easy-edit-button"
            style={{
              padding: '0 4px',
              fontSize: '1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              height: '20px',
              minWidth: '20px',
              fontWeight: 'bold',
              background: '#e2e8f0',
              color: '#475569'
            }}
            onClick={handleStartAdd}
            title="Add item"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default MultiValueListEditor;
