'use client'

import { Button } from '@/components/ui/button'

interface TablePaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function TablePagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const startIndex = (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 bg-surface border border-border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3">
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-muted">Show</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-input border border-input-border rounded-lg px-2 py-1.5 min-h-[36px] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <span className="text-xs sm:text-sm text-muted">
          <span className="sm:hidden">{totalItems > 0 ? startIndex : 0}–{endIndex} / {totalItems}</span>
          <span className="hidden sm:inline">Showing {totalItems > 0 ? startIndex : 0} to {endIndex} of {totalItems}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="min-h-[36px] flex-1 sm:flex-none"
        >
          Previous
        </Button>
        <span className="text-xs sm:text-sm text-muted whitespace-nowrap">
          {currentPage} / {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="min-h-[36px] flex-1 sm:flex-none"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
