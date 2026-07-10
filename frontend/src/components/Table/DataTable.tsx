import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  getSubRows?: (row: TData) => any[] | undefined;
  onAddRow?: (familyId: string, familyName: string) => void;
}

export function DataTable<TData>({
  data,
  columns,
  globalFilter,
  onGlobalFilterChange,
  getSubRows,
  onAddRow,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      expanded: true,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows,
  });

  return (
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
              return (
                <tr key={row.id} className="family-group-row" id={`row-${familyId}`}>
                  <td colSpan={columns.length}>
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
  );
}
