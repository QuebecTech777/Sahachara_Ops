import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { CarbonButton } from './CarbonButton';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface CarbonDataTableProps<T> {
  title?: string;
  description?: string;
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
  };
  secondaryActions?: React.ReactNode;
  onRowClick?: (row: T) => void;
  expandableRowRender?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  initialSortKey?: string;
  initialSortDirection?: 'asc' | 'desc';
}

export function CarbonDataTable<T extends { id?: string | number }>({
  title,
  description,
  columns,
  data,
  searchPlaceholder = 'Search records...',
  searchFilter,
  primaryAction,
  secondaryActions,
  onRowClick,
  expandableRowRender,
  emptyMessage = 'No clinical records found.',
  initialSortKey,
  initialSortDirection = 'asc'
}: CarbonDataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set());

  const toggleExpand = (rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Filter
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    if (searchFilter) {
      return data.filter((item) => searchFilter(item, searchQuery.toLowerCase().trim()));
    }
    return data.filter((item) => {
      const rowStr = JSON.stringify(item).toLowerCase();
      return rowStr.includes(searchQuery.toLowerCase().trim());
    });
  }, [data, searchQuery, searchFilter]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const exportCSV = () => {
    if (!sortedData.length) return;
    const headerRow = columns.map((c) => `"${c.header}"`).join(',');
    const rows = sortedData.map((row) =>
      columns
        .map((c) => {
          const val = (row as any)[c.key];
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headerRow, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${(title || 'records').toLowerCase().replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full bg-white border border-[#e0e0e0] shadow-2xs font-sans">
      {/* Table Toolbar Header */}
      <div className="p-4 border-b border-[#e0e0e0] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {title && (
            <h3 className="text-[18px] font-semibold text-[#161616] tracking-tight">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-[12px] text-[#525252] mt-0.5">{description}</p>
          )}
        </div>

        {/* Actions & Search */}
        <div className="flex items-stretch sm:items-center gap-2 flex-wrap sm:flex-nowrap w-full md:w-auto">
          {/* Carbon Search Input */}
          <div className="relative flex-1 sm:flex-initial sm:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525252]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 h-10 bg-[#f4f4f4] border-b-2 border-[#8d8d8d] focus:border-[#0f62fe] focus:bg-white text-xs outline-none text-[#161616] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#161616]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <CarbonButton
            kind="ghost"
            size="md"
            renderIcon={Download}
            onClick={exportCSV}
            title="Export CSV"
          >
            Export
          </CarbonButton>

          {secondaryActions}

          {primaryAction && (
            <CarbonButton
              kind="primary"
              size="md"
              renderIcon={primaryAction.icon}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </CarbonButton>
          )}
        </div>
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0]">
              {expandableRowRender && (
                <th className="w-10 py-3 px-2 text-center text-[12px] font-semibold text-[#161616] select-none">
                  <span className="sr-only">Expand</span>
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`py-3 px-4 text-[12px] font-semibold text-[#161616] select-none ${
                    col.sortable ? 'cursor-pointer hover:bg-[#e0e0e0]' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-[#525252]">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-[#0f62fe]" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#0f62fe]" />
                          )
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e0e0]">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (expandableRowRender ? 1 : 0)}
                  className="py-12 text-center text-sm text-[#525252] bg-white"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const rowId = row.id ?? index;
                const isExpanded = expandedRowIds.has(rowId);
                return (
                  <React.Fragment key={rowId}>
                    <tr
                      onClick={() => onRowClick && onRowClick(row)}
                      className={`text-[13px] text-[#161616] bg-white transition-colors duration-100 ${
                        isExpanded ? 'bg-[#f4f7fb]' : ''
                      } ${
                        onRowClick ? 'cursor-pointer hover:bg-[#edf5ff]' : 'hover:bg-[#f4f4f4]'
                      }`}
                    >
                      {expandableRowRender && (
                        <td
                          className="w-10 py-3 px-2 text-center align-middle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(rowId);
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(rowId);
                            }}
                            className="p-1 text-[#525252] hover:text-[#0f62fe] hover:bg-[#e0e0e0] transition-colors cursor-pointer rounded-none"
                            title={isExpanded ? 'Collapse row details' : 'Expand row details'}
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            <ChevronRight
                              className={`w-4 h-4 transition-transform duration-150 ${
                                isExpanded ? 'rotate-90 text-[#0f62fe]' : ''
                              }`}
                            />
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} className="py-3 px-4 align-middle">
                          {col.render ? col.render(row) : (row as any)[col.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                    {expandableRowRender && isExpanded && (
                      <tr className="bg-[#fcfcfc] border-b border-[#e0e0e0]">
                        <td
                          colSpan={columns.length + 1}
                          className="p-0 border-l-4 border-l-[#0f62fe]"
                        >
                          <div className="p-4 bg-[#f8f9fa]">
                            {expandableRowRender(row)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-[#e0e0e0] bg-[#f4f4f4] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#525252]">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <span>
            Showing{' '}
            <strong className="text-[#161616] font-medium font-mono tabular-nums">
              {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-[#161616] font-medium font-mono tabular-nums">
              {Math.min(currentPage * pageSize, totalItems)}
            </strong>{' '}
            of{' '}
            <strong className="text-[#161616] font-medium font-mono tabular-nums">
              {totalItems}
            </strong>{' '}
            records
          </span>

          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-[#c6c6c6] h-7 px-2 text-xs rounded-none text-[#161616] outline-none focus:border-[#0f62fe]"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="font-mono tabular-nums">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-[#c6c6c6] bg-white text-[#161616] hover:bg-[#e0e0e0] disabled:opacity-30 disabled:pointer-events-none rounded-none cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 border-t border-b border-r border-[#c6c6c6] bg-white text-[#161616] hover:bg-[#e0e0e0] disabled:opacity-30 disabled:pointer-events-none rounded-none cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CarbonTableWrapperProps {
  children: React.ReactNode;
  className?: string;
  headerContent?: React.ReactNode;
}

export const CarbonTableWrapper: React.FC<CarbonTableWrapperProps> = ({
  children,
  className = '',
  headerContent
}) => (
  <div className={`w-full bg-white border border-[#e0e0e0] shadow-2xs overflow-hidden font-sans ${className}`}>
    {headerContent && (
      <div className="p-3 border-b border-[#e0e0e0] bg-white">
        {headerContent}
      </div>
    )}
    <div className="overflow-x-auto">
      {children}
    </div>
  </div>
);

