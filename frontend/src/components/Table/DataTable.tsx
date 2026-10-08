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
import { SlidersHorizontal, Plus } from 'lucide-react';
import { t } from '../../utils/i18n';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  getSubRows?: (row: TData) => any[] | undefined;
  onAddRow?: (familyId: string, familyName: string) => void;
  emptySubRowsText?: string;
  hideHeader?: boolean;
  highlightedRowId?: string | null;
}

export function DataTable<TData>({
  data,
  columns,
  getSubRows,
  onAddRow,
  emptySubRowsText,
  hideHeader,
  highlightedRowId,
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
    <div className="data-table-wrapper">
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
          className="data-table"
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
                        <div
                          style={{
                            display: 'inline-flex',
                            flexDirection: subHeader ? 'column' : 'row',
                            alignItems: subHeader ? 'flex-start' : 'center',
                            gap: subHeader ? '0.2rem' : '0.75rem',
                            position: 'sticky',
                            left: '0.6rem',
                          }}
                        >
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span>{familyName}</span>
                            {onAddRow && (
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
              return (
                <tr key={row.id} id={`row-${rowId}`} className={rowId === highlightedRowId ? 'highlighted-row' : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const isFixed = cell.column.id === 'first_name' || cell.column.id === 'child_name';
                    return (
                      <td
                        key={cell.id}
                        className={isFixed ? 'sticky-col' : undefined}
                        style={{
                          width: isFixed ? '1%' : `${cell.column.getSize()}px`,
                          minWidth: `${cell.column.getSize()}px`,
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
