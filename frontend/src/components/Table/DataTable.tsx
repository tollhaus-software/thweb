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
import { SlidersHorizontal } from 'lucide-react';
import { t } from '../../utils/i18n';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  getSubRows?: (row: TData) => any[] | undefined;
  onAddRow?: (familyId: string, familyName: string) => void;
  emptySubRowsText?: string;
}

export function DataTable<TData>({
  data,
  columns,
  getSubRows,
  onAddRow,
  emptySubRowsText,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Column selector toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
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
            background: 'white',
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
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                padding: '0.5rem',
                zIndex: 50,
                minWidth: '180px',
                maxHeight: '250px',
                overflowY: 'auto',
                textAlign: 'left',
              }}
            >
              <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>
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
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
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

      <div className="table-container">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      width: `${header.getSize()}px`
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: ' 🔼',
                      desc: ' 🔽',
                    }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isGroupedRow = getSubRows && row.depth === 0;

              if (isGroupedRow) {
                const familyId = (row.original as any).id;
                const familyName = (row.original as any).family_name;
                const hasSubRows = row.subRows && row.subRows.length > 0;
                return (
                  <Fragment key={row.id}>
                    <tr className="family-group-row" id={`row-${familyId}`}>
                      <td colSpan={table.getVisibleLeafColumns().length}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span>{familyName}</span>
                          {onAddRow && (
                            <button
                              type="button"
                              className="easy-edit-button primary-button"
                              style={{
                                padding: '0 0.5rem',
                                fontSize: '1rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: 'none',
                                color: 'white',
                                height: '24px',
                                minWidth: '24px',
                                fontWeight: 'bold'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddRow(familyId, familyName);
                              }}
                              title="Add"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!hasSubRows && emptySubRowsText && (
                      <tr className="empty-sub-row">
                        <td colSpan={table.getVisibleLeafColumns().length} style={{ padding: '0.75rem 1.5rem', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                          {emptySubRowsText}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }

              return (
                <tr key={row.id} id={`row-${(row.original as any).id}`}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: `${cell.column.getSize()}px` }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
