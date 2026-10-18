import { useState, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { SlidersHorizontal, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '../../utils/i18n';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  getSubRows?: (row: TData) => any[] | undefined;
  onAddRow?: (familyId: string, familyName: string) => void;
  onAddChild?: (familyId: string, familyName: string) => void;
  onAddParent?: (familyId: string, familyName: string) => void;
  onJumpToFamily?: (familyId: string, familyName: string) => void;
  jumpToFamilyLabel?: string;
  jumpToFamilyTitle?: string;
  emptySubRowsText?: string;
  hideHeader?: boolean;
  highlightedRowId?: string | null;
  className?: string;
}

export function DataTable<TData>({
  data,
  columns,
  getSubRows,
  onAddRow,
  onAddChild,
  onAddParent,
  onJumpToFamily,
  jumpToFamilyLabel,
  jumpToFamilyTitle,
  emptySubRowsText,
  hideHeader,
  highlightedRowId,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      expanded: true,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows,
  });

  return (
    <div className={`data-table-wrapper ${className ? `${className}-wrapper` : ''}`}>
      {/* Column selector toolbar */}
      {!hideHeader && (
        <div className="data-table-toolbar">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="secondary-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.75rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              color: 'var(--text)',
              transition: 'all 0.2s',
            }}
          >
            <SlidersHorizontal size={14} />
            <span>{t('columns')}</span>
          </button>

          {isOpen && (
            <>
              {/* Click-outside backdrop to close */}
              <div
                onClick={() => setIsOpen(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 40,
                }}
              />
              {/* Popover */}
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.25rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow)',
                  padding: '0.5rem',
                  zIndex: 50,
                  minWidth: '180px',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  textAlign: 'left',
                }}
              >
                <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>
                  {t('toggleColumns')}
                </div>
                {table.getAllLeafColumns().map((column) => {
                  if (column.id === 'actions') return null;
                  const headerText = typeof column.columnDef.header === 'string' ? column.columnDef.header : (column.id || '');
                  if (!headerText) return null;
                  return (
                    <label
                      key={column.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        userSelect: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                      />
                      <span>{headerText}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="table-container">
        <table
          className={`data-table ${className || ''}`}
          style={{
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          {!hideHeader && (
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isFixed = header.column.id === 'first_name' || header.column.id === 'child_name';
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        className={isFixed ? 'sticky-col' : undefined}
                        style={{
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          width: isFixed ? '1%' : `${header.getSize()}px`,
                          minWidth: `${header.getSize()}px`,
                          boxSizing: 'border-box',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' 🔼',
                          desc: ' 🔽',
                        }[header.column.getIsSorted() as string] ?? null}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isGroupedRow = getSubRows && row.depth === 0;

              if (isGroupedRow) {
                const familyId = (row.original as any).id;
                const familyName = (row.original as any).family_name;
                const subHeader = (row.original as any).sub_header;
                const hasSubRows = row.subRows && row.subRows.length > 0;
                return (
                  <Fragment key={row.id}>
                    <tr className={`family-group-row ${familyId === highlightedRowId ? 'highlighted-row' : ''}`} id={`row-${familyId}`}>
                      <td colSpan={table.getVisibleLeafColumns().length}>
                        <div className="family-group-row-container">
                          <div
                            className="family-group-row-left"
                            style={{
                              display: 'inline-flex',
                              flexDirection: subHeader ? 'column' : 'row',
                              alignItems: subHeader ? 'flex-start' : 'center',
                              gap: subHeader ? '0.2rem' : '0.75rem',
                              position: 'sticky',
                              left: '0.6rem',
                              flexShrink: 0,
                            }}
                          >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span>{familyName}</span>
                              {onJumpToFamily && jumpToFamilyLabel && (
                                <button
                                  type="button"
                                  className="family-header-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToFamily(familyId, familyName);
                                  }}
                                  title={jumpToFamilyTitle}
                                >
                                  {jumpToFamilyLabel}
                                </button>
                              )}
                              {onAddRow && !onAddChild && !onAddParent && (
                                <button
                                  type="button"
                                  className="family-add-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddRow(familyId, familyName);
                                  }}
                                  title="Add"
                                >
                                  <Plus size={14} />
                                </button>
                              )}
                            </div>
                            {subHeader && (
                              <div className="family-sub-header-parents">
                                {subHeader}
                              </div>
                            )}
                          </div>

                          {(onAddChild || onAddParent) && (
                            <div
                              className="family-group-actions"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                position: 'sticky',
                                right: '0.6rem',
                                marginLeft: 'auto',
                                flexShrink: 0,
                              }}
                            >
                              {onAddChild && (
                                <button
                                  type="button"
                                  className="family-action-button family-add-button family-add-child-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddChild(familyId, familyName);
                                  }}
                                  aria-label={`+ ${t('addChildShort')}`}
                                  title={`${t('addChildTo')} ${familyName}`}
                                >
                                  <Plus size={13} />
                                  <span>{t('addChildShort')}</span>
                                </button>
                              )}
                              {onAddParent && (
                                <button
                                  type="button"
                                  className={`family-action-button ${!onAddChild ? 'family-add-button ' : ''}family-add-parent-button`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddParent(familyId, familyName);
                                  }}
                                  aria-label={`+ ${t('addParentShort')}`}
                                  title={`${t('addParentTo')} ${familyName}`}
                                >
                                  <Plus size={13} />
                                  <span>{t('addParentShort')}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!hasSubRows && emptySubRowsText && (
                      <tr className="empty-sub-row">
                        <td colSpan={table.getVisibleLeafColumns().length} style={{ padding: '0.75rem 1.5rem', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                          <span style={{ position: 'sticky', left: '1.5rem' }}>{emptySubRowsText}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }

              const rowId = (row.original as any).id;
              const rowType = (row.original as any)._rowType;

              if (rowType === 'parents-toggle') {
                const item = row.original as any;
                const isExpanded = Boolean(item.isExpanded);
                return (
                  <tr
                    key={row.id}
                    id={`row-${item.id}`}
                    className={`overview-parents-toggle-row ${isExpanded ? 'expanded' : 'collapsed'}`}
                  >
                    <td colSpan={table.getVisibleLeafColumns().length}>
                      <button
                        type="button"
                        className="overview-parents-toggle-btn"
                        onClick={item.onToggle}
                        aria-expanded={isExpanded}
                      >
                        <span className="overview-parents-toggle-chevron">
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                        <span className="overview-parents-toggle-label">
                          {item.summaryText}
                        </span>
                        <span className="overview-parents-toggle-badge">
                          {t('parents')}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              }

              const noSpecialBg = Boolean((row.original as any).no_special_bg);
              const isGroupModeParent = Boolean((row.original as any).isGroupModeParent);
              const isParentExpanded = Boolean((row.original as any).isExpanded);
              const rowClasses = [
                rowId === highlightedRowId ? 'highlighted-row' : '',
                rowType === 'parent' ? 'overview-parent-row' : '',
                rowType === 'child' ? 'overview-child-row' : '',
                noSpecialBg ? 'no-special-bg' : '',
                isGroupModeParent ? 'overview-group-parent-row' : '',
                isGroupModeParent && !isParentExpanded ? 'group-parent-collapsed' : '',
                isGroupModeParent && isParentExpanded ? 'group-parent-expanded' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={row.id} id={`row-${rowId}`} className={rowClasses || undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as any;
                    if (meta?.skipCell?.(row.original)) {
                      return null;
                    }
                    const colSpan = meta?.getColSpan?.(row.original) ?? 1;
                    const isFixed = cell.column.id === 'first_name' || cell.column.id === 'child_name';
                    return (
                      <td
                        key={cell.id}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        className={isFixed ? 'sticky-col' : undefined}
                        style={{
                          width: colSpan > 1 ? undefined : isFixed ? '1%' : `${cell.column.getSize()}px`,
                          minWidth: colSpan > 1 ? undefined : `${cell.column.getSize()}px`,
                          boxSizing: 'border-box',
                          whiteSpace: isFixed ? 'nowrap' : undefined,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
