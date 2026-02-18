'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'

interface Table {
  table_name: string
}

export default function DataPage() {
  const [session, setSession] = useState<any>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [editingRow, setEditingRow] = useState<any>(null)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newRowData, setNewRowData] = useState<any>({})
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [showSheetSelector, setShowSheetSelector] = useState(false)
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [workbookData, setWorkbookData] = useState<any>(null)
  const [uploadFileName, setUploadFileName] = useState<string>('')
  const [uploadedFileRef, setUploadedFileRef] = useState<File | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<{[key: string]: string}>({})
  const [multiSelectFilters, setMultiSelectFilters] = useState<{[key: string]: string[]}>({})
  const [pendingFilters, setPendingFilters] = useState<{[key: string]: string}>({})
  const [pendingMultiSelectFilters, setPendingMultiSelectFilters] = useState<{[key: string]: string[]}>({})
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(100)
  const [totalRecords, setTotalRecords] = useState(0)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dateRangeFilters, setDateRangeFilters] = useState<{[key: string]: { from: string; to: string }}>({})
  const [pendingDateRangeFilters, setPendingDateRangeFilters] = useState<{[key: string]: { from: string; to: string }}>({})
  const [openDateRangeColumn, setOpenDateRangeColumn] = useState<string | null>(null)
  const [filteredPage, setFilteredPage] = useState(1)
  const [filteredPageSize] = useState(100)
  const [totalFilteredCount, setTotalFilteredCount] = useState<number | null>(null)
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null)
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [anchorCell, setAnchorCell] = useState<{ rowIndex: number; column: string } | null>(null)
  const [cellSelection, setCellSelection] = useState<{ column: string; startRowIndex: number; endRowIndex: number } | null>(null)
  const [lastClickedCell, setLastClickedCell] = useState<{ rowIndex: number; column: string } | null>(null)
  const router = useRouter()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Upload progress and cancellation
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'parsing' | 'checking_duplicates' | 'preparing' | 'inserting' | 'linking' | 'saving_file'>('idle')
  const [uploadProgressDetail, setUploadProgressDetail] = useState<string>('')
  const uploadCancelledRef = useRef(false)
  const { setRightContent } = useHeaderRight()

  // Columns that should have multi-select dropdowns
  const multiSelectColumns = ['country', 'channel', 'zuzu_managing_channel_invoicing', 'status', 'currency']

  // Columns that are dates (show date range picker instead of text filter)
  const isDateColumn = (col: string): boolean =>
    col.includes('date') || col === 'created_at' || col === 'updated_at'

  // Format timestamp from ISO 8601 to simple format (YYYY-MM-DD HH:MM:SS)
  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return ''
    try {
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    } catch (error) {
      return timestamp
    }
  }

  // Normalize value for display: null, undefined, or string "null" / "undefined" → empty
  const displayValue = (v: any): string => {
    if (v == null || v === '' || v === 'null' || v === 'undefined') return ''
    return String(v)
  }

  /** Normalize date from Excel (DD/MM/YYYY, serial number, etc.) to ISO YYYY-MM-DD for the database */
  const normalizeDateForDb = (value: any): string | null => {
    if (value == null || value === '') return null
    const s = String(value).trim()
    if (!s) return null
    // Already ISO date (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return s.slice(0, 10)
    // Excel serial number (days since 1900-01-01)
    const n = Number(value)
    if (!Number.isNaN(n) && n > 0) {
      const date = new Date((n - 25569) * 86400 * 1000)
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
    }
    // DD/MM/YYYY or DD-MM-YYYY (e.g. 23/02/2026)
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (dmy) {
      const [, d, m, y] = dmy
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    // Try native Date parse (e.g. MM/DD/YYYY)
    const parsed = new Date(s)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
    return null
  }

  // Format column names for better display
  const formatColumnName = (col: string): string => {
    const specialNames: { [key: string]: string } = {
      'net_of_demand_commission_amount_extranet': 'Net (of channel commission) amount (Extranet)',
      'net_of_channel_commissio_amount_extranet': 'Net (of channel commission) amount (Extranet)',
      'payment_request_date': 'Payment Request Date',
      'total_amount_submitted': 'Total Amount Submitted',
      'amount_received': 'Amount Received',
      'total_amount_received': 'Total Amount Received',
      'payment_date': 'Payment Date',
      'balance': 'Balance',
      'reconciled_amount_check': 'Reconciled amount Check',
      'transmission_queue_id': 'Transmission Queue ID',
      'reference_number': 'Reference Number',
      'remarks': 'Remarks'
    }
    
    return specialNames[col] || col.replace(/_/g, ' ')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        fetchTables()
        // Automatically select bookings table
        if (!selectedTable) {
          setSelectedTable('bookings')
          fetchTableData('bookings', 1)
        }
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  // Close dropdown and date range popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (openDropdown && !target.closest('.relative')) {
        setOpenDropdown(null)
      }
      if (openDateRangeColumn && !target.closest('.date-range-filter-wrap')) {
        setOpenDateRangeColumn(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown, openDateRangeColumn])

  // Restore scroll position after filtering
  useEffect(() => {
    if (!loading && savedScrollPosition !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = savedScrollPosition
      setSavedScrollPosition(null)
    }
  }, [loading, savedScrollPosition])

  const fetchTables = async () => {
    try {
      // Use Supabase REST API to get all tables by querying the PostgREST schema endpoint
      const { data, error } = await supabase.rpc('get_table_names')
      
      if (error) {
        console.error('Error fetching tables via RPC:', error)
        // Fallback: manually list known tables
        // For now, we'll try to detect tables by attempting to query them
        const knownTables = ['bookings'] // Add your table names here
        const availableTables: Table[] = []
        
        for (const tableName of knownTables) {
          const { error: testError } = await supabase
            .from(tableName)
            .select('*')
            .limit(1)
          
          if (!testError) {
            availableTables.push({ table_name: tableName })
          }
        }
        
        setTables(availableTables)
      } else if (data) {
        setTables(data.map((name: string) => ({ table_name: name })))
      }
    } catch (error) {
      console.error('Error:', error)
      // Final fallback: just show the bookings table
      setTables([{ table_name: 'bookings' }])
    }
  }

  const fetchTableData = async (
    tableName: string, 
    page: number = 1, 
    append: boolean = false, 
    applyFilters: boolean = false,
    filterOverrides?: {
      textFilters?: {[key: string]: string}
      multiFilters?: {[key: string]: string[]}
      dateRangeFilters?: {[key: string]: { from: string; to: string }}
    }
  ) => {
    setLoading(true)
    try {
      // Use override filters if provided, otherwise use state
      const activeTextFilters = filterOverrides?.textFilters ?? filters
      const activeMultiFilters = filterOverrides?.multiFilters ?? multiSelectFilters
      const activeDateRangeFilters = filterOverrides?.dateRangeFilters ?? dateRangeFilters
      
      // Build base query for count
      let countQuery = supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
      
      // Build base query for data
      let dataQuery = supabase
        .from(tableName)
        .select('*')

      // Columns that are numeric (bigint/int) - use eq() not ilike() to avoid "operator does not exist: bigint ~~* unknown"
      const numericColumns = ['id', 'upload_id']

      // Apply filters if requested
      if (applyFilters) {
        // Apply text filters
        Object.keys(activeTextFilters).forEach(column => {
          const filterValue = activeTextFilters[column].trim()
          if (filterValue) {
            if (numericColumns.includes(column)) {
              const num = Number(filterValue)
              if (!Number.isNaN(num) && Number.isInteger(num)) {
                countQuery = countQuery.eq(column, num)
                dataQuery = dataQuery.eq(column, num)
              } else {
                // Non-numeric input on numeric column: no match possible
                countQuery = countQuery.eq(column, -1)
                dataQuery = dataQuery.eq(column, -1)
              }
            } else {
              countQuery = countQuery.ilike(column, `%${filterValue}%`)
              dataQuery = dataQuery.ilike(column, `%${filterValue}%`)
            }
          }
        })

        // Apply multi-select filters
        Object.keys(activeMultiFilters).forEach(column => {
          const selectedValues = activeMultiFilters[column]
          if (selectedValues && selectedValues.length > 0) {
            countQuery = countQuery.in(column, selectedValues)
            dataQuery = dataQuery.in(column, selectedValues)
          }
        })

        // Apply date range filters
        Object.keys(activeDateRangeFilters).forEach(column => {
          const { from, to } = activeDateRangeFilters[column] || {}
          if (from?.trim()) {
            const fromVal = column === 'created_at' || column === 'updated_at' ? `${from.trim()}T00:00:00.000Z` : from.trim()
            countQuery = countQuery.gte(column, fromVal)
            dataQuery = dataQuery.gte(column, fromVal)
          }
          if (to?.trim()) {
            const toVal = column === 'created_at' || column === 'updated_at' ? `${to.trim()}T23:59:59.999Z` : to.trim()
            countQuery = countQuery.lte(column, toVal)
            dataQuery = dataQuery.lte(column, toVal)
          }
        })
      }

      // Get total count (filtered or unfiltered)
      const { count } = await countQuery
      
      if (applyFilters) {
        setTotalFilteredCount(count || 0)
      } else {
        setTotalRecords(count || 0)
      }

      // Fetch paginated data
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      const { data, error } = await dataQuery.range(from, to)

      if (error) {
        console.error('Error fetching table data:', error)
        alert(`Error: ${error.message}`)
      } else if (data && data.length > 0) {
        if (append) {
          // Load more mode - append to existing data
          setTableData(prev => [...prev, ...data])
        } else {
          // Pagination mode - replace data
          setTableData(data)
        }
        // Reorder columns: booking data first, then reconciliation fields, then system fields
        // Exclude typo/duplicate columns that should not be shown (keep "Total Amount Received", hide "Total Amount eceived")
        const HIDDEN_COLUMNS = ['total_amount_eceived']
        const allColumns = Object.keys(data[0]).filter(col => !HIDDEN_COLUMNS.includes(col))
        const systemColumns = ['upload_id', 'created_at', 'updated_at']
        const reconciliationCols = [
          'net_of_demand_commission_amount_extranet',
          'net_of_channel_commissio_amount_extranet',
          'payment_request_date',
          'total_amount_submitted',
          'amount_received',
          'total_amount_received',
          'payment_date',
          'balance',
          'reconciled_amount_check',
          'transmission_queue_id',
          'reference_number',
          'remarks'
        ]
        
        // Main booking columns (everything except system and reconciliation)
        const mainColumns = allColumns.filter(col => 
          !systemColumns.includes(col) && !reconciliationCols.includes(col)
        )
        
        // Build final order: main -> reconciliation -> system
        const orderedColumns = [
          ...mainColumns,
          ...reconciliationCols.filter(col => allColumns.includes(col)),
          ...systemColumns.filter(col => allColumns.includes(col))
        ]
        setColumns(orderedColumns)
      } else {
        if (!append) {
          setTableData([])
          setColumns([])
        }
      }
    } catch (error: any) {
      console.error('Error:', error)
      alert(`Error: ${error.message}`)
    }
    setLoading(false)
  }

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName)
    setEditingRow(null)
    setIsAddingNew(false)
    setSortColumn(null)
    setSortDirection('asc')
    setFilters({})
    setMultiSelectFilters({})
    setDateRangeFilters({})
    setPendingDateRangeFilters({})
    setShowFilters(false)
    setOpenDropdown(null)
    setOpenDateRangeColumn(null)
    setCurrentPage(1)
    setTableData([])
    fetchTableData(tableName, 1)
  }

  const handleLoadMore = () => {
    const hasActiveFilters = Object.keys(filters).some(k => filters[k]) || 
                            Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) ||
                            Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())
    const maxRecords = hasActiveFilters ? (totalFilteredCount || 0) : totalRecords
    const nextPage = currentPage + 1
    const totalPages = Math.ceil(maxRecords / pageSize)
    
    if (nextPage <= totalPages && selectedTable) {
      setCurrentPage(nextPage)
      // Always append data (load more mode)
      fetchTableData(selectedTable, nextPage, true, hasActiveFilters)
    }
  }

  const handleLoadLess = () => {
    if (tableData.length <= pageSize || currentPage <= 1) return
    setTableData(prev => prev.slice(0, prev.length - pageSize))
    setCurrentPage(prev => prev - 1)
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleFilterChange = (column: string, value: string) => {
    setPendingFilters(prev => ({
      ...prev,
      [column]: value
    }))
  }

  const applyFilters = () => {
    // Save current scroll position
    setSavedScrollPosition(scrollContainerRef.current?.scrollLeft || 0)
    
    // Copy pending filters to actual filters
    setFilters(pendingFilters)
    setMultiSelectFilters(pendingMultiSelectFilters)
    setDateRangeFilters(pendingDateRangeFilters)
    setOpenDateRangeColumn(null)
    setCurrentPage(1)
    setFilteredPage(1)
    
    // Trigger data fetch with filters
    if (selectedTable) {
      const hasActiveFilters = Object.keys(pendingFilters).some(k => pendingFilters[k]) || 
                              Object.keys(pendingMultiSelectFilters).some(k => pendingMultiSelectFilters[k]?.length > 0) ||
                              Object.keys(pendingDateRangeFilters).some(k => pendingDateRangeFilters[k]?.from?.trim() || pendingDateRangeFilters[k]?.to?.trim())
      fetchTableData(
        selectedTable, 
        1, 
        false, 
        hasActiveFilters,
        { textFilters: pendingFilters, multiFilters: pendingMultiSelectFilters, dateRangeFilters: pendingDateRangeFilters }
      )
    }
  }

  const clearFilters = () => {
    setFilters({})
    setMultiSelectFilters({})
    setDateRangeFilters({})
    setPendingDateRangeFilters({})
    setPendingFilters({})
    setPendingMultiSelectFilters({})
    setOpenDateRangeColumn(null)
    setOpenDropdown(null)
    setShowFilters(false)
    setFilteredPage(1)
    setCurrentPage(1)
    setTotalFilteredCount(null)
    
    // Fetch unfiltered data
    if (selectedTable) {
      fetchTableData(selectedTable, 1, false, false)
    }
  }


  const getUniqueValues = (column: string): string[] => {
    const values = tableData
      .map(row => String(row[column] || ''))
      .filter(val => val.trim() !== '')
    return Array.from(new Set(values)).sort()
  }

  const toggleMultiSelectValue = (column: string, value: string) => {
    setPendingMultiSelectFilters(prev => {
      const current = prev[column] || []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      
      return {
        ...prev,
        [column]: updated
      }
    })
  }

  const getSortedData = () => {
    let data = [...tableData]

    // Apply sorting
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        
        // Handle null/undefined
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        
        // Compare values
        let comparison = 0
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal
        } else {
          comparison = String(aVal).localeCompare(String(bVal))
        }
        
        return sortDirection === 'asc' ? comparison : -comparison
      })
    }

    return data
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const startEdit = (row: any) => {
    setModalMode('edit')
    setEditingRow(row)
    setEditFormData({ ...row })
    setShowModal(true)
  }

  const cancelEdit = () => {
    setEditingRow(null)
    setEditFormData({})
    setShowModal(false)
  }

  // Log a single edit to edit_history (manual edits on green columns only; Excel uploads are not logged)
  const logEditToHistory = async (
    tableName: string,
    rowId: number,
    columnName: string,
    oldVal: unknown,
    newVal: unknown,
    rowForDisplay?: any
  ) => {
    const editedBy = session?.user?.email ?? 'Unknown'
    const oldStr = oldVal == null ? '' : String(oldVal)
    const newStr = newVal == null ? '' : String(newVal)
    if (oldStr === newStr) return
    const rowDisplay = rowForDisplay != null && tableName === 'bookings'
      ? `Confirmation #${rowForDisplay.zuzu_room_confirmation_number ?? rowId}`
      : null
    await supabase.from('edit_history').insert({
      table_name: tableName,
      row_id: rowId,
      column_name: columnName,
      old_value: oldStr || null,
      new_value: newStr || null,
      edited_by: editedBy,
      row_display: rowDisplay
    })
  }

  const saveEdit = async () => {
    if (!selectedTable || !editingRow) return

    const { balance, reconciled_amount_check } = computeFormulaColumns(editFormData)
    const updatedData = { ...editFormData, balance, reconciled_amount_check, updated_at: new Date().toISOString() }

    const { error } = await supabase
      .from(selectedTable)
      .update(updatedData)
      .eq('id', editingRow.id)

    if (error) {
      alert(`Error updating row: ${error.message}`)
    } else {
      // Log each changed editable (reconciliation) column to edit history (excludes formula columns)
      const reconciliationColumns = [
        'net_of_demand_commission_amount_extranet',
        'net_of_channel_commissio_amount_extranet',
        'payment_request_date',
        'total_amount_submitted',
        'amount_received',
        'total_amount_received',
        'payment_date',
        'transmission_queue_id',
        'reference_number',
        'remarks'
      ]
      for (const col of reconciliationColumns) {
        if (!(col in editingRow) && !(col in editFormData)) continue
        const oldV = editingRow[col]
        const newV = editFormData[col]
        const oldStr = oldV == null ? '' : String(oldV)
        const newStr = newV == null ? '' : String(newV)
        if (oldStr !== newStr) {
          await logEditToHistory(selectedTable, editingRow.id, col, oldV, newV, editingRow)
        }
      }
      // Reload from beginning
      setCurrentPage(1)
      fetchTableData(selectedTable, 1)
      setEditingRow(null)
      setEditFormData({})
      setShowModal(false)
    }
  }

  const saveCellEdit = async (row: any, column: string, newValue: string) => {
    if (!selectedTable) return

    const updatedRow = { ...row, [column]: newValue || null }
    const { balance, reconciled_amount_check } = computeFormulaColumns(updatedRow)
    const updateData: Record<string, unknown> = {
      [column]: newValue || null,
      balance,
      reconciled_amount_check,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from(selectedTable)
      .update(updateData)
      .eq('id', row.id)

    if (error) {
      alert(`Error updating cell: ${error.message}`)
    } else {
      // Log to edit history only for editable (green) columns
      if (isColumnEditable(column)) {
        await logEditToHistory(selectedTable, row.id, column, row[column], newValue || null, row)
      }
      // Update local data with edited cell, recomputed formula columns, and new updated_at
      setTableData(prevData =>
        prevData.map(r => r.id === row.id ? { ...r, [column]: newValue || null, balance, reconciled_amount_check, updated_at: updateData.updated_at } : r)
      )
    }

    setEditingCell(null)
    setEditingValue('')
  }

  const startCellEdit = (rowIndex: number, column: string, currentValue: any) => {
    setEditingCell({ rowIndex, column })
    const raw = String(currentValue ?? '')
    setEditingValue(raw === 'null' || raw === 'undefined' ? '' : raw)
  }

  const cancelCellEdit = () => {
    setEditingCell(null)
    setEditingValue('')
  }

  // Range selection: works on all columns (gray, blue, green). Single click selects cell; shift+click extends in same column; double-click edits green cells only.
  const handleCellClick = (rowIndex: number, column: string, e: React.MouseEvent) => {
    setLastClickedCell({ rowIndex, column })
    // Shift+click: extend selection (same column only)
    if (e.shiftKey && anchorCell && anchorCell.column === column) {
      const start = Math.min(anchorCell.rowIndex, rowIndex)
      const end = Math.max(anchorCell.rowIndex, rowIndex)
      setCellSelection({ column, startRowIndex: start, endRowIndex: end })
      return
    }
    setAnchorCell({ rowIndex, column })
    setCellSelection({ column, startRowIndex: rowIndex, endRowIndex: rowIndex })
  }

  const handleCellDoubleClick = (rowIndex: number, column: string, currentValue: any, isEditable: boolean, isFormula: boolean, isBeingEdited: boolean) => {
    if (!isEditable || isFormula || isBeingEdited) return
    setAnchorCell({ rowIndex, column })
    setCellSelection(null)
    startCellEdit(rowIndex, column, currentValue)
  }

  const isCellInSelection = (rowIndex: number, column: string): boolean => {
    if (!cellSelection || cellSelection.column !== column) return false
    return rowIndex >= cellSelection.startRowIndex && rowIndex <= cellSelection.endRowIndex
  }

  const handleCopy = async (e: React.KeyboardEvent) => {
    if (!cellSelection) return
    e.preventDefault()
    const sorted = getSortedData()
    const values: string[] = []
    for (let i = cellSelection.startRowIndex; i <= cellSelection.endRowIndex; i++) {
      const row = sorted[i]
      if (row != null) {
        const v = row[cellSelection.column]
        values.push(v != null && v !== '' ? String(v) : '')
      }
    }
    const text = values.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const handlePaste = async (e: React.KeyboardEvent) => {
    const targetColumn = cellSelection ? cellSelection.column : lastClickedCell?.column
    const targetStartRow = cellSelection ? cellSelection.startRowIndex : lastClickedCell?.rowIndex
    if (targetColumn == null || targetStartRow == null || !isColumnEditable(targetColumn)) return
    e.preventDefault()
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return
    }
    const lines = text.split(/\r?\n/).map(s => s.trim())
    const sourceSize = lines.length
    if (cellSelection) {
      const targetSize = cellSelection.endRowIndex - cellSelection.startRowIndex + 1
      if (targetSize !== sourceSize) {
        alert(`The range is not the right size. It should be ${sourceSize} cell(s).`)
        return
      }
    }
    const sorted = getSortedData()
    for (let i = 0; i < lines.length; i++) {
      const row = sorted[targetStartRow + i]
      if (!row) break
      await saveCellEdit(row, targetColumn, lines[i])
    }
    setCellSelection(null)
    setAnchorCell(null)
  }

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      handleCopy(e)
      return
    }
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      handlePaste(e)
      return
    }
    if (e.key === 'Escape') {
      setCellSelection(null)
      setAnchorCell(null)
    }
  }

  // Parse a value as number; null/undefined/empty string/NaN -> null
  const parseNum = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }

  // Recompute Balance and Reconciled amount Check from editable inputs. If any input is null, result is null.
  // Balance = Net amount by ZUZU (from)/to channel - Amount Received /(Paid)
  // Reconciled amount Check = Total Amount Submitted - Total Amount Received /(Paid)
  const computeFormulaColumns = (row: any): { balance: number | null; reconciled_amount_check: number | null } => {
    const netAmount = parseNum(row?.net_amount_by_zuzu)
    const amountReceived = parseNum(row?.amount_received)
    const totalSubmitted = parseNum(row?.total_amount_submitted)
    const totalReceived = parseNum(row?.total_amount_received)
    const balance = (netAmount != null && amountReceived != null) ? netAmount - amountReceived : null
    const reconciled_amount_check = (totalSubmitted != null && totalReceived != null) ? totalSubmitted - totalReceived : null
    return { balance, reconciled_amount_check }
  }

  // Formula-derived columns; read-only, shown in distinct color (currency is read-only but styled grey like country)
  const isFormulaColumn = (column: string): boolean => column === 'balance' || column === 'reconciled_amount_check'

  // Tooltip text shown when hovering over formula column header or cell
  const getFormulaColumnTooltip = (column: string): string | null => {
    if (column === 'balance') return 'Net amount by ZUZU (from)/to channel − Amount Received /(Paid)'
    if (column === 'reconciled_amount_check') return 'Total Amount Submitted − Total Amount Received /(Paid)'
    return null
  }

  const isColumnEditable = (column: string): boolean => {
    // System columns are never editable
    const systemColumns = ['id', 'created_at', 'updated_at', 'upload_id']
    if (systemColumns.includes(column)) return false

    // Formula columns are read-only (balance, reconciled_amount_check)
    if (isFormulaColumn(column)) return false
    // currency is read-only (derived from country lookup)
    if (column === 'currency') return false

    // Reconciliation columns are editable (include both possible DB column names for net-of-commission)
    const reconciliationColumns = [
      'net_of_demand_commission_amount_extranet',
      'net_of_channel_commissio_amount_extranet',
      'payment_request_date',
      'total_amount_submitted',
      'amount_received',
      'total_amount_received',
      'payment_date',
      'transmission_queue_id',
      'reference_number',
      'remarks'
    ]
    
    return reconciliationColumns.includes(column)
  }

  const deleteRow = async (row: any) => {
    if (!selectedTable) return
    if (!confirm('Are you sure you want to delete this row?')) return

    const { error } = await supabase.from(selectedTable).delete().eq('id', row.id)

    if (error) {
      alert(`Error deleting row: ${error.message}`)
    } else {
      // Reload from beginning
      setCurrentPage(1)
      fetchTableData(selectedTable, 1)
    }
  }

  const startAddNew = () => {
    setModalMode('add')
    setIsAddingNew(true)
    const newData: any = {}
    columns.forEach(col => {
      if (col !== 'id' && col !== 'created_at' && col !== 'updated_at') {
        newData[col] = ''
      }
    })
    setNewRowData(newData)
    setShowModal(true)
  }

  const cancelAddNew = () => {
    setIsAddingNew(false)
    setNewRowData({})
    setShowModal(false)
  }

  const saveNewRow = async () => {
    if (!selectedTable) return

    const dataToInsert = { ...newRowData }

    const { error } = await supabase.from(selectedTable).insert([dataToInsert])

    if (error) {
      alert(`Error adding row: ${error.message}`)
    } else {
      // Go back to first page to see the new row
      setCurrentPage(1)
      fetchTableData(selectedTable, 1)
      setIsAddingNew(false)
      setNewRowData({})
      setShowModal(false)
    }
  }

  // Data processing before insert: fill currency from currency table, negate net_amount_by_zuzu for Postpay channel
  const processUploadData = async (data: any[]): Promise<any[]> => {
    const { data: currencyRows, error: currencyError } = await supabase
      .from('currency')
      .select('country, currency_code')

    if (currencyError) {
      console.warn('Currency lookup failed, leaving currency empty:', currencyError.message)
    }

    const currencyByCountry = new Map<string, string>()
    if (currencyRows) {
      for (const row of currencyRows) {
        const key = (row.country ?? '').trim().toLowerCase()
        if (key) currencyByCountry.set(key, row.currency_code ?? '')
      }
    }

    return data.map((row: any) => {
      const processed = { ...row }
      const country = processed.country?.trim()
      if (country) {
        const code = currencyByCountry.get(country.toLowerCase())
        if (code) processed.currency = code
      }
      const channel = (processed.channel ?? '').toString()
      if (channel.toLowerCase().includes('postpay') && processed.net_amount_by_zuzu != null) {
        const num = Number(processed.net_amount_by_zuzu)
        processed.net_amount_by_zuzu = -Math.abs(num)
      }
      return processed
    })
  }

  /** Roll back a partial upload: delete upload_history and all inserted bookings (in batches). */
  const rollbackUpload = async (uploadId: number | null, bookingIds: number[]) => {
    if (uploadId != null) {
      await supabase.from('upload_history').delete().eq('id', uploadId)
    }
    const ROLLBACK_BATCH = 500
    for (let i = 0; i < bookingIds.length; i += ROLLBACK_BATCH) {
      const chunk = bookingIds.slice(i, i + ROLLBACK_BATCH)
      await supabase.from('bookings').delete().in('id', chunk)
    }
  }

  const insertBookings = async (dataToInsert: any[], totalRows: number, filteredCount: number, fileName: string, sheetName: string, file?: File, alreadyPresentCount: number = 0) => {
    try {
      if (uploadCancelledRef.current) return
      setLoading(true)
      setUploadPhase('inserting')
      setUploadProgressDetail(`Inserting ${dataToInsert.length.toLocaleString()} bookings...`)

      // Insert bookings first (without upload_id). Only add an upload_history row on success.
      const { data: insertedData, error } = await supabase
        .from('bookings')
        .insert(dataToInsert)
        .select('id, arrival_date')
      
      if (error) {
        alert(`Error uploading: ${error.message}`)
        setLoading(false)
        setUploadPhase('idle')
        return
      }
      
      const bookingIds = insertedData?.map(row => row.id) || []
      if (uploadCancelledRef.current) {
        await rollbackUpload(null, bookingIds)
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        setShowSheetSelector(false)
        setWorkbookData(null)
        alert('Upload stopped. No data was saved.')
        return
      }

      // Success: now create the upload_history record
      const arrivalDates = (insertedData ?? [])
        .map(row => row.arrival_date)
        .filter((date: string | null) => date !== null)
        .sort()
      const arrivalDateMin = arrivalDates.length > 0 ? arrivalDates[0] : null
      const arrivalDateMax = arrivalDates.length > 0 ? arrivalDates[arrivalDates.length - 1] : null
      
      const { data: uploadHistoryData, error: uploadHistoryError } = await supabase
        .from('upload_history')
        .insert({
          file_name: fileName,
          sheet_name: sheetName,
          rows_uploaded: dataToInsert.length,
          uploaded_by: session?.user?.email || 'Unknown',
          arrival_date_min: arrivalDateMin,
          arrival_date_max: arrivalDateMax,
          booking_ids: bookingIds
        })
        .select('id')
        .single()
      
      if (uploadHistoryError || !uploadHistoryData) {
        await rollbackUpload(null, bookingIds)
        alert(`Upload succeeded but failed to record history: ${uploadHistoryError?.message}. Bookings were rolled back.`)
        setLoading(false)
        setUploadPhase('idle')
        return
      }
      
      const uploadId = uploadHistoryData.id
      if (uploadCancelledRef.current) {
        await rollbackUpload(uploadId, bookingIds)
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        setShowSheetSelector(false)
        setWorkbookData(null)
        alert('Upload stopped. No data was saved.')
        return
      }

      // Link bookings to this upload (batch to avoid query size limits)
      const BATCH = 500
      const totalBatches = Math.ceil(bookingIds.length / BATCH)
      setUploadPhase('linking')
      for (let i = 0; i < bookingIds.length; i += BATCH) {
        if (uploadCancelledRef.current) {
          await rollbackUpload(uploadId, bookingIds)
          setUploadPhase('idle')
          setUploadProgressDetail('')
          setLoading(false)
          setShowSheetSelector(false)
          setWorkbookData(null)
          alert('Upload stopped. No data was saved.')
          return
        }
        setUploadProgressDetail(`Linking bookings to upload... ${Math.floor(i / BATCH) + 1}/${totalBatches} batches`)
        const chunk = bookingIds.slice(i, i + BATCH)
        await supabase.from('bookings').update({ upload_id: uploadId }).in('id', chunk)
      }
      
      if (uploadCancelledRef.current) {
        await rollbackUpload(uploadId, bookingIds)
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        setShowSheetSelector(false)
        setWorkbookData(null)
        alert('Upload stopped. No data was saved.')
        return
      }

      let fileStoragePath: string | null = null
      if (file) {
        setUploadPhase('saving_file')
        setUploadProgressDetail('Saving file to storage...')
        const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload.xlsx'
        const storagePath = `${uploadId}/${sanitized}`
        const { error: uploadError } = await supabase.storage
          .from('upload-files')
          .upload(storagePath, file, { upsert: true, contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        if (!uploadError) fileStoragePath = storagePath
      }
      if (fileStoragePath != null) {
        await supabase
          .from('upload_history')
          .update({ file_storage_path: fileStoragePath })
          .eq('id', uploadId)
      }
      
      setUploadPhase('idle')
      setUploadProgressDetail('')
      const filteredOutCount = totalRows - dataToInsert.length - alreadyPresentCount
      alert(
        `✅ Successfully uploaded ${dataToInsert.length} rows from sheet "${sheetName}"!\n\n` +
        `Upload ID: #${uploadId}\n\n` +
        `Number of bookings on the Excel: ${totalRows.toLocaleString()}\n` +
        `Number of bookings filtered out (because ZUZU does not manage the booking, or it is not a real booking.): ${filteredOutCount.toLocaleString()}\n` +
        `Number of bookings already present in the table: ${alreadyPresentCount.toLocaleString()}\n` +
        `Number of bookings to import: ${dataToInsert.length.toLocaleString()}\n\n` +
        `Only "Regular" bookings with ZUZU-managed channel payments were imported.`
      )
      if (selectedTable) {
        setCurrentPage(1)
        fetchTableData(selectedTable, 1)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
      setUploadPhase('idle')
      setUploadProgressDetail('')
    } finally {
      setLoading(false)
      setShowSheetSelector(false)
      setWorkbookData(null)
    }
  }

  // Max rows to read from a sheet (Excel "used range" can be wrong; extend so we don't miss rows)
  const MAX_SHEET_ROWS = 50000

  const processSheet = async (workbook: any, sheetName: string, fileName: string = 'Unknown', file?: File) => {
    try {
      uploadCancelledRef.current = false
      setUploadPhase('parsing')
      setUploadProgressDetail('Reading sheet...')
      const worksheet = workbook.Sheets[sheetName]
      // Extend worksheet range so we read all rows - SheetJS only reads up to !ref, which
      // can be truncated (e.g. file saved when "used range" ended earlier)
      const ref = worksheet['!ref']
      if (ref) {
        const range = XLSX.utils.decode_range(ref)
        // Extend to MAX_SHEET_ROWS + 1 so we can detect when sheet exceeds the limit
        if (range.e.r < MAX_SHEET_ROWS + 1) {
          range.e.r = MAX_SHEET_ROWS + 1
          worksheet['!ref'] = XLSX.utils.encode_range(range)
        }
      }

      // Convert to JSON with header row - using column letters as keys
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A', raw: false })
      
      // Skip header row (assuming row 1 is headers) - adjust if needed
      const rows = jsonData.slice(1)
      if (uploadCancelledRef.current) {
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        return
      }
      setUploadPhase('checking_duplicates')
      setUploadProgressDetail('Checking for duplicates...')

      if (rows.length > MAX_SHEET_ROWS) {
        alert(`This sheet has ${rows.length.toLocaleString()} rows. The maximum allowed is ${MAX_SHEET_ROWS.toLocaleString()} rows per sheet. Please split your file or reduce the number of rows.`)
        setLoading(false)
        setUploadPhase('idle')
        setUploadProgressDetail('')
        return
      }
      
      // Filter rows based on criteria:
      // Column T = "Regular" AND (Column AY matches one of the two ZUZU payment types)
      // Case-insensitive comparison
      const filteredRows = rows.filter((row: any) => {
        const columnT = row['T']?.trim().toLowerCase()
        const columnAY = row['AY']?.trim().toLowerCase()
        
        const isRegular = columnT === 'regular'
        const isValidPaymentType = 
          columnAY === 'zuzu manages channel payments, hotel liable for these payments' ||
          columnAY === 'zuzu manages channel payments, zuzu liable for these payments'
        
        return isRegular && isValidPaymentType
      })
      
      // Map Excel columns to database fields (normalize dates to YYYY-MM-DD for DB)
      const mappedData = filteredRows.map((row: any) => {
        const country = row['F'] || null
        return {
          zuzu_room_confirmation_number: row['A'] ? parseInt(row['A']) : null,
          hotel_name: row['D'] || null,
          country: country,
          name: row['H'] || null,
          arrival_date: normalizeDateForDb(row['M']) ?? null,
          departure_date: normalizeDateForDb(row['N']) ?? null,
          number_of_room_nights: row['R'] ? parseInt(row['R']) : null,
          status: row['S'] || null,
          channel: row['AR'] || null,
          channel_booking_confirmation_number: row['AS'] ? parseInt(row['AS']) : null,
          zuzu_managing_channel_invoicing: row['AY'] || null,
          net_amount_by_zuzu: row['CN'] ? parseFloat(row['CN']) : null,
          currency: null
        }
      })
      
      // Filter out completely empty rows
      const validData = mappedData.filter((item: any) => 
        Object.values(item).some(val => val !== null && val !== '')
      )
      
      const totalRows = rows.length
      const filteredCount = totalRows - filteredRows.length

      // Collect confirmation numbers from filtered-out rows (for modal examples)
      const filteredOutConfirmationNumbers: (string | number)[] = []
      rows.forEach((row: any) => {
        const columnT = row['T']?.trim().toLowerCase()
        const columnAY = row['AY']?.trim().toLowerCase()
        const isRegular = columnT === 'regular'
        const isValidPaymentType =
          columnAY === 'zuzu manages channel payments, hotel liable for these payments' ||
          columnAY === 'zuzu manages channel payments, zuzu liable for these payments'
        if (!(isRegular && isValidPaymentType)) {
          const a = row['A']
          if (a != null && String(a).trim() !== '') filteredOutConfirmationNumbers.push(parseInt(a) || a)
        }
      })
      filteredRows.forEach((row: any, i: number) => {
        const mapped = mappedData[i]
        const hasData = Object.values(mapped).some((val: any) => val !== null && val !== '')
        if (!hasData) {
          const a = row['A']
          if (a != null && String(a).trim() !== '') filteredOutConfirmationNumbers.push(parseInt(a) || a)
        }
      })
      const filteredOutConfirmationExamples = Array.from(new Set(filteredOutConfirmationNumbers)).slice(0, 4)
      
      if (validData.length === 0) {
        alert(`No valid data found in the Excel sheet "${sheetName}".\nTotal rows: ${totalRows}\nFiltered out: ${filteredCount}\n\nOnly rows with Column T = "Regular" and valid ZUZU payment types are imported.`)
        setLoading(false)
        setUploadPhase('idle')
        setUploadProgressDetail('')
        return
      }
      if (uploadCancelledRef.current) {
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        return
      }
      
      // Check for duplicate zuzu_room_confirmation_numbers
      const excelConfirmationNumbers = validData
        .map(row => row.zuzu_room_confirmation_number)
        .filter(num => num !== null)
      
      // Fetch ALL existing zuzu_room_confirmation_numbers (Supabase returns max 1000 per request, so paginate)
      const PAGE_SIZE = 1000
      let existingNumbers: (string | number)[] = []
      let offset = 0
      let hasMore = true
      while (hasMore) {
        if (uploadCancelledRef.current) {
          setUploadPhase('idle')
          setUploadProgressDetail('')
          setLoading(false)
          return
        }
        setUploadProgressDetail(`Checking for duplicates... (${existingNumbers.length.toLocaleString()} existing rows scanned)`)
        const { data: page, error: fetchError } = await supabase
          .from('bookings')
          .select('zuzu_room_confirmation_number')
          .range(offset, offset + PAGE_SIZE - 1)
        if (fetchError) {
          alert(`Error checking for duplicates: ${fetchError.message}`)
          setLoading(false)
          setUploadPhase('idle')
          setUploadProgressDetail('')
          return
        }
        const numbers = (page ?? [])
          .map((b: { zuzu_room_confirmation_number: string | null }) => b.zuzu_room_confirmation_number)
          .filter((num: string | null) => num !== null)
        existingNumbers = existingNumbers.concat(numbers)
        hasMore = page?.length === PAGE_SIZE
        offset += PAGE_SIZE
      }
      
      // Find duplicates (use Set for fast lookup when DB has many rows)
      const existingSet = new Set(existingNumbers)
      const duplicates = excelConfirmationNumbers.filter(num => existingSet.has(num))
      
      if (duplicates.length > 0) {
        const uniqueDuplicates = Array.from(new Set(duplicates))
        const filteredOutCount = totalRows - validData.length
        const alreadyPresentCount = duplicates.length
        const toImportCount = validData.length - duplicates.length
        setUploadPhase('idle')
        setUploadProgressDetail('')
        // Store duplicate info and show modal (include file so we can save it if user uploads non-duplicates)
        setDuplicateInfo({
          duplicates,
          uniqueDuplicates,
          validData,
          totalRows,
          filteredCount,
          filteredOutCount,
          filteredOutConfirmationExamples,
          alreadyPresentCount,
          toImportCount,
          existingNumbers,
          fileName,
          sheetName,
          file
        })
        setShowDuplicateModal(true)
        setLoading(false)
        return
      }
      if (uploadCancelledRef.current) {
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        return
      }
      setUploadPhase('preparing')
      setUploadProgressDetail('Preparing data...')
      // Process data (currency lookup, Postpay net_amount_by_zuzu negation) then insert
      const processedData = await processUploadData(validData)
      if (uploadCancelledRef.current) {
        setUploadPhase('idle')
        setUploadProgressDetail('')
        setLoading(false)
        return
      }
      await insertBookings(processedData, totalRows, filteredCount, fileName, sheetName, file)
    } catch (error: any) {
      alert(`Error processing sheet: ${error.message}`)
    } finally {
      setLoading(false)
      setUploadPhase('idle')
      setUploadProgressDetail('')
      setShowSheetSelector(false)
      setWorkbookData(null)
      setUploadedFileRef(null)
    }
  }

  const handleStopUpload = () => {
    uploadCancelledRef.current = true
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setUploadFileName(file.name)
    setUploadedFileRef(file)
    const reader = new FileReader()
    
    reader.onload = async (event) => {
      try {
        const data = event.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        
        // Check if there are multiple sheets
        if (workbook.SheetNames.length > 1) {
          // Show sheet selector
          setAvailableSheets(workbook.SheetNames)
          setWorkbookData(workbook)
          setShowSheetSelector(true)
          setLoading(false)
        } else {
          // Process the only sheet directly
          await processSheet(workbook, workbook.SheetNames[0], file.name, file)
        }
      } catch (error: any) {
        alert(`Error reading file: ${error.message}`)
        setLoading(false)
      } finally {
        // Reset the file input
        e.target.value = ''
      }
    }
    
    reader.onerror = () => {
      alert('Error reading file')
      setLoading(false)
    }
    
    reader.readAsBinaryString(file)
  }

  const handleSheetSelect = async (sheetName: string) => {
    if (!workbookData) return
    setLoading(true)
    await processSheet(workbookData, sheetName, uploadFileName, uploadedFileRef ?? undefined)
  }

  const handleCancelUpload = () => {
    setShowDuplicateModal(false)
    setDuplicateInfo(null)
    setLoading(false)
  }

  const handleUploadNonDuplicates = async () => {
    if (!duplicateInfo) return
    
    const { validData, uniqueDuplicates, totalRows, filteredCount, fileName, sheetName } = duplicateInfo
    
    // Filter out rows with duplicate confirmation numbers
    const nonDuplicateData = validData.filter((row: any) => 
      !uniqueDuplicates.includes(row.zuzu_room_confirmation_number)
    )
    
    setShowDuplicateModal(false)
    setDuplicateInfo(null)
    uploadCancelledRef.current = false
    setLoading(true)
    setUploadPhase('preparing')
    setUploadProgressDetail('Preparing data...')

    if (nonDuplicateData.length === 0) {
      alert('All rows in the Excel file are duplicates. No data to import.')
      setLoading(false)
      setUploadPhase('idle')
      setUploadProgressDetail('')
      return
    }

    const processedData = await processUploadData(nonDuplicateData)
    if (uploadCancelledRef.current) {
      setLoading(false)
      setUploadPhase('idle')
      setUploadProgressDetail('')
      return
    }
    await insertBookings(processedData, totalRows, filteredCount, fileName, sheetName, duplicateInfo.file, duplicateInfo.duplicates.length)
  }

  useEffect(() => {
    if (!session?.user) {
      setRightContent(null)
      return
    }
    const hasActiveFilters = Object.keys(filters).some(k => filters[k]) || Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) || Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())
    const filterCount = Object.keys(filters).filter(k => filters[k]).length + Object.keys(multiSelectFilters).filter(k => multiSelectFilters[k]?.length > 0).length + Object.keys(dateRangeFilters).filter(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim()).length
    setRightContent(
      <>
        {selectedTable === 'bookings' && (
          <>
            <button
              onClick={() => {
                if (!showFilters) {
                  setPendingFilters({...filters})
                  setPendingMultiSelectFilters({...multiSelectFilters})
                  setPendingDateRangeFilters({...dateRangeFilters})
                }
                setShowFilters(!showFilters)
                setOpenDropdown(null)
                setOpenDateRangeColumn(null)
              }}
              className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition duration-200 flex items-center ${
                showFilters || hasActiveFilters
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="ml-2 bg-white text-orange-500 rounded-full px-2 py-0.5 text-xs font-bold">
                  {filterCount}
                </span>
              )}
            </button>
            {showFilters && (
              <>
                <button
                  onClick={applyFilters}
                  className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200 flex items-center whitespace-nowrap"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply
                </button>
                <button
                  onClick={clearFilters}
                  className="shrink-0 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition duration-200 whitespace-nowrap"
                >
                  Clear
                </button>
              </>
            )}
          </>
        )}
        <span className="shrink-0 inline-flex items-center text-sm text-gray-600 whitespace-nowrap h-[38px]">{session.user?.email}</span>
        <button
          onClick={handleSignOut}
          className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200 whitespace-nowrap"
        >
          Sign Out
        </button>
      </>
    )
    return () => setRightContent(null)
  }, [session, selectedTable, showFilters, filters, multiSelectFilters, dateRangeFilters, loading, setRightContent])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="px-4 sm:px-6 lg:px-8 py-2">
          {!selectedTable ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg
                  className="w-16 h-16 text-gray-400 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 10h16M10 4v16"
                  />
                </svg>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Select a Table
                </h3>
                <p className="text-gray-600">
                  Choose a table from the sidebar to view and edit its data
                </p>
              </div>
            ) : loading ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading data...</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg border-t-4 border-orange-500">
                <div
                  ref={scrollContainerRef}
                  tabIndex={0}
                  className="overflow-x-scroll overflow-y-auto max-h-[calc(100vh-130px)] scrollbar-hide-horizontal outline-none"
                  onKeyDown={handleTableKeyDown}
                >
                  <table className="w-full table-auto">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm border-b-2 border-gray-200">
                      <tr>
                        {columns.map((col) => (
                          <th
                            key={col}
                            title={getFormulaColumnTooltip(col) ?? undefined}
                            className={`px-2 py-2 text-left text-xs font-medium uppercase tracking-wide cursor-pointer hover:bg-gray-100 break-words ${
                              isFormulaColumn(col) ? 'text-blue-700 bg-blue-50' : isColumnEditable(col) ? 'text-green-700 bg-green-50' : 'text-gray-500'
                            }`}
                            style={{
                              minWidth: col === 'id' || col === 'upload_id' ? '60px' :
                                       col === 'currency' ? '50px' :
                                       col === 'country' || col === 'status' ? '80px' :
                                       col.includes('date') ? '90px' :
                                       col.includes('number') || col.includes('amount') || col.includes('nights') ? '100px' :
                                       col.includes('name') || col.includes('hotel') ? '150px' :
                                       '120px'
                            }}
                            onClick={(e) => {
                              // Don't sort if clicking the button
                              if (!(e.target as HTMLElement).closest('button')) {
                                handleSort(col)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span>{formatColumnName(col)}</span>
                                {isColumnEditable(col) && !isFormulaColumn(col) && (
                                  <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                  </svg>
                                )}
                              </div>
                              {sortColumn === col && (
                                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  {sortDirection === 'asc' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  )}
                                </svg>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                      {showFilters && (
                        <tr className="bg-orange-50">
                          {columns.map((col) => {
                            const isMultiSelect = multiSelectColumns.includes(col)
                            const isDate = isDateColumn(col)

                            if (isDate) {
                              const range = pendingDateRangeFilters[col] || { from: '', to: '' }
                              const hasRange = range.from?.trim() || range.to?.trim()
                              return (
                                <th key={col} className="px-2 py-2 relative date-range-filter-wrap" style={{
                                  minWidth: col === 'id' || col === 'upload_id' ? '60px' :
                                           col === 'currency' ? '50px' :
                                           col === 'country' || col === 'status' ? '80px' :
                                           col.includes('date') ? '90px' :
                                           col.includes('number') || col.includes('amount') || col.includes('nights') ? '100px' :
                                           col.includes('name') || col.includes('hotel') ? '150px' :
                                           '120px'
                                }}>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setOpenDateRangeColumn(openDateRangeColumn === col ? null : col)}
                                      className={`w-full px-3 py-2 text-sm text-left border rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent flex justify-between items-center ${
                                        hasRange ? 'border-orange-400 bg-orange-50 text-orange-900' : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-500'
                                      }`}
                                    >
                                      <span className="truncate">
                                        {hasRange
                                          ? `${range.from || '…'} → ${range.to || '…'}`
                                          : `Date range: ${formatColumnName(col)}...`}
                                      </span>
                                      <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </button>
                                    {openDateRangeColumn === col && (
                                      <div className="absolute z-50 mt-1 left-0 min-w-[240px] bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                                        <div className="text-xs font-semibold text-gray-700 mb-2">{formatColumnName(col)}</div>
                                        <div className="space-y-2">
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-0.5">From</label>
                                            <input
                                              type="date"
                                              value={range.from}
                                              onChange={(e) => setPendingDateRangeFilters(prev => ({
                                                ...prev,
                                                [col]: { ...(prev[col] || { from: '', to: '' }), from: e.target.value }
                                              }))}
                                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-0.5">To</label>
                                            <input
                                              type="date"
                                              value={range.to}
                                              onChange={(e) => setPendingDateRangeFilters(prev => ({
                                                ...prev,
                                                [col]: { ...(prev[col] || { from: '', to: '' }), to: e.target.value }
                                              }))}
                                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                            />
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPendingDateRangeFilters(prev => ({ ...prev, [col]: { from: '', to: '' } }))
                                          }}
                                          className="mt-2 w-full text-left px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 rounded"
                                        >
                                          Clear range
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </th>
                              )
                            }

                            if (isMultiSelect) {
                              const uniqueValues = getUniqueValues(col)
                              const selectedValues = pendingMultiSelectFilters[col] || []
                              
                              return (
                                <th key={col} className="px-2 py-2 relative" style={{
                                  minWidth: col === 'id' || col === 'upload_id' ? '60px' :
                                           col === 'currency' ? '50px' :
                                           col === 'country' || col === 'status' ? '80px' :
                                           col.includes('date') ? '90px' :
                                           col.includes('number') || col.includes('amount') || col.includes('nights') ? '100px' :
                                           col.includes('name') || col.includes('hotel') ? '150px' :
                                           '120px'
                                }}>
                                  <div className="relative">
                                    <button
                                      onClick={() => setOpenDropdown(openDropdown === col ? null : col)}
                                      className={`w-full px-3 py-2 text-sm text-left border border-gray-300 rounded bg-white hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:border-transparent flex justify-between items-center ${selectedValues.length === 0 ? 'text-gray-500' : ''}`}
                                    >
                                      <span className="truncate">
                                        {selectedValues.length > 0 
                                          ? `${selectedValues.length} selected` 
                                          : `Select ${formatColumnName(col)}...`}
                                      </span>
                                      <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    
                                    {openDropdown === col && (
                                      <div className="absolute z-50 mt-1 min-w-max w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                                        <div className="p-2">
                                          <button
                                            onClick={() => {
                                              setPendingMultiSelectFilters(prev => ({...prev, [col]: []}))
                                            }}
                                            className="w-full text-left px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 rounded"
                                          >
                                            Clear selection
                                          </button>
                                        </div>
                                        {uniqueValues.map(value => (
                                          <label
                                            key={value}
                                            className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selectedValues.includes(value)}
                                              onChange={() => toggleMultiSelectValue(col, value)}
                                              className="mr-2 rounded text-orange-500 focus:ring-orange-500"
                                            />
                                            <span className="text-sm text-gray-900">{value}</span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </th>
                              )
                            }
                            
                            return (
                              <th key={col} className="px-2 py-2" style={{
                                minWidth: col === 'id' || col === 'upload_id' ? '60px' :
                                         col === 'currency' ? '50px' :
                                         col === 'country' || col === 'status' ? '80px' :
                                         col.includes('date') ? '90px' :
                                         col.includes('number') || col.includes('amount') || col.includes('nights') ? '100px' :
                                         col.includes('name') || col.includes('hotel') ? '150px' :
                                         '120px'
                              }}>
                                <input
                                  type="text"
                                  placeholder={`Filter ${formatColumnName(col)}...`}
                                  value={pendingFilters[col] || ''}
                                  onChange={(e) => handleFilterChange(col, e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                                />
                              </th>
                            )
                          })}
                        </tr>
                      )}
                    </thead>
                    <tbody className="bg-white">
                      {getSortedData().length === 0 ? (
                        <tr>
                          <td
                            colSpan={columns.length}
                            className="px-2 py-12 text-center text-gray-500 text-base"
                          >
                            {tableData.length === 0 ? 'No data in this table' : 'No rows match the current filters'}
                          </td>
                        </tr>
                      ) : (
                        getSortedData().map((row, idx) => (
                          <tr key={idx} className={`hover:bg-orange-50 border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            {columns.map((col) => {
                              // Check if it's a timestamp column
                              const isTimestamp = col === 'created_at' || col === 'updated_at'
                              const isEditable = isColumnEditable(col)
                              const isFormula = isFormulaColumn(col)
                              const isBeingEdited = editingCell?.rowIndex === idx && editingCell?.column === col
                              const isSelected = isCellInSelection(idx, col)
                              
                              let cellValue =
                                typeof row[col] === 'object' && row[col] !== null
                                  ? JSON.stringify(row[col])
                                  : displayValue(row[col])
                              
                              // Format timestamps
                              if (isTimestamp && cellValue) {
                                cellValue = formatTimestamp(cellValue)
                              }

                              const isDateField = col.includes('date')
                              const isNumberField = col.includes('number') || col.includes('amount') || col.includes('balance') || col.includes('nights')
                              
                              return (
                                <td 
                                  key={col} 
                                  className={`px-2 py-2 ${isSelected ? 'bg-orange-200 ring-1 ring-orange-400' : ''} ${isFormula ? 'bg-blue-50/70' : isEditable ? 'bg-green-50 cursor-pointer hover:bg-green-100' : ''}`}
                                  title={isEditable ? `Click to edit, Shift+click to select range. Ctrl+C copy, Ctrl+V paste.` : isFormula ? `${getFormulaColumnTooltip(col) ?? formatColumnName(col)} — Shift+click to select; Ctrl+C to copy.` : (cellValue ? `${cellValue} — ` : '') + 'Shift+click to select; Ctrl+C to copy.'}
                                  style={{
                                    minWidth: col === 'id' || col === 'upload_id' ? '60px' :
                                             col === 'currency' ? '50px' :
                                             col === 'country' || col === 'status' ? '80px' :
                                             col.includes('date') ? '90px' :
                                             col.includes('number') || col.includes('amount') || col.includes('nights') ? '100px' :
                                             col.includes('name') || col.includes('hotel') ? '150px' :
                                             '120px'
                                  }}
                                  onMouseDown={(e) => {
                                    if (!isBeingEdited) e.preventDefault()
                                  }}
                                  onClick={(e) => {
                                    handleCellClick(idx, col, e)
                                  }}
                                  onDoubleClick={() => {
                                    handleCellDoubleClick(idx, col, row[col], isEditable, isFormula, isBeingEdited)
                                  }}
                                >
                                  {isBeingEdited ? (
                                    <input
                                      type={isDateField ? 'date' : isNumberField ? 'number' : 'text'}
                                      step={isNumberField && (col.includes('amount') || col.includes('balance')) ? '0.01' : '1'}
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onBlur={() => saveCellEdit(row, col, editingValue)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveCellEdit(row, col, editingValue)
                                        } else if (e.key === 'Escape') {
                                          cancelCellEdit()
                                        }
                                      }}
                                      autoFocus
                                      className="w-full px-2 py-1 text-xs border-2 border-blue-500 rounded focus:outline-none focus:border-blue-600"
                                    />
                                  ) : (
                                    <div className={`text-xs leading-normal whitespace-nowrap overflow-hidden text-ellipsis ${
                                      isFormula ? 'text-blue-800 font-medium' : isEditable ? 'text-green-800 font-medium' : 'text-gray-900'
                                    }`}>
                                      {cellValue || (isEditable ? <span className="text-gray-400 italic">Click to edit</span> : '')}
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Range selection hint */}
                {cellSelection && (
                  <div className="bg-orange-100 border-t border-orange-200 px-3 py-1.5 text-xs text-orange-900 flex items-center gap-2 flex-wrap">
                    <span>
                      {cellSelection.endRowIndex - cellSelection.startRowIndex + 1} cell(s) selected in {formatColumnName(cellSelection.column)} — Ctrl+C to copy; click a target cell then Ctrl+V to paste into that column. Esc to clear.
                    </span>
                    <button
                      type="button"
                      onClick={() => { setCellSelection(null); setAnchorCell(null) }}
                      className="text-orange-600 hover:text-orange-800 font-medium"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
                
                {/* Filter Results Banner */}
                {(Object.keys(filters).some(k => filters[k]) || Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) || Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())) && (
                  <div className="bg-orange-50 border-t border-b border-orange-200 px-2 py-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      <span className="font-bold text-orange-900 text-xs">
                        {totalFilteredCount !== null ? (
                          <>
                            {totalFilteredCount.toLocaleString()} rows match your filters
                            <span className="text-orange-700 font-normal ml-2">(across entire database of {totalRecords.toLocaleString()} records)</span>
                          </>
                        ) : (
                          <>
                            <svg className="inline animate-spin h-4 w-4 text-orange-500 mr-2" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading...
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                
                {tableData.length > 0 && (
                  <div>
                    <div className="p-2 text-xs text-gray-600 flex justify-between items-center flex-wrap gap-4">
                      <div className="flex items-center space-x-4">
                        <span>
                          {(() => {
                            const hasActiveFilters = Object.keys(filters).some(k => filters[k]) || 
                                                    Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) ||
                                                    Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())
                            const maxRecords = hasActiveFilters ? (totalFilteredCount || 0) : totalRecords
                            return `Showing ${tableData.length} of ${maxRecords} ${hasActiveFilters ? 'filtered' : 'total'} rows`
                          })()}
                        </span>
                        {sortColumn && (
                          <span className="text-gray-500">
                            Sorted by: <span className="font-semibold">{formatColumnName(sortColumn)}</span> ({sortDirection === 'asc' ? '↑' : '↓'})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {tableData.length > pageSize && (
                          <button
                            onClick={handleLoadLess}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-semibold transition duration-200 flex items-center"
                          >
                            Load 100 Less Rows
                          </button>
                        )}
                        <button
                          onClick={handleLoadMore}
                          disabled={(() => {
                            const hasActiveFilters = Object.keys(filters).some(k => filters[k]) || 
                                                    Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) ||
                                                    Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())
                            const maxRecords = hasActiveFilters ? (totalFilteredCount || 0) : totalRecords
                            return tableData.length >= maxRecords
                          })()}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition duration-200 flex items-center"
                        >
                        {loading ? (
                          <>
                            <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading...
                          </>
                        ) : (
                          <>
                            {(() => {
                              const hasActiveFilters = Object.keys(filters).some(k => filters[k]) || 
                                                      Object.keys(multiSelectFilters).some(k => multiSelectFilters[k]?.length > 0) ||
                                                      Object.keys(dateRangeFilters).some(k => dateRangeFilters[k]?.from?.trim() || dateRangeFilters[k]?.to?.trim())
                              const maxRecords = hasActiveFilters ? (totalFilteredCount || 0) : totalRecords
                              const remaining = maxRecords - tableData.length
                              return remaining > 0 ? `Load 100 More Rows` : 'All Rows Loaded'
                            })()}
                          </>
                        )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
      </div>

      {/* Modal for Add/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {modalMode === 'add' ? 'Add New Row' : 'Edit Row'}
                  </h2>
                  {modalMode === 'edit' && (
                    <p className="text-sm text-orange-600 mt-1 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Fields imported from Excel uploads are read-only
                    </p>
                  )}
                </div>
                <button
                  onClick={modalMode === 'add' ? cancelAddNew : cancelEdit}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="px-6 py-4">
              {/* Define column groups */}
              {(() => {
                const excelUploadColumns = [
                  'zuzu_room_confirmation_number',
                  'hotel_name',
                  'country',
                  'name',
                  'arrival_date',
                  'departure_date',
                  'number_of_room_nights',
                  'status',
                  'channel',
                  'channel_booking_confirmation_number',
                  'zuzu_managing_channel_invoicing',
                  'net_amount_by_zuzu',
                  'currency'
                ]
                
                const reconciliationColumns = [
                  'net_of_demand_commission_amount_extranet',
                  'net_of_channel_commissio_amount_extranet',
                  'payment_request_date',
                  'total_amount_submitted',
                  'amount_received',
                  'total_amount_received',
                  'payment_date',
                  'balance',
                  'reconciled_amount_check',
                  'transmission_queue_id',
                  'reference_number',
                  'remarks'
                ]
                
                const editableColumns = columns.filter(col => 
                  col !== 'id' && col !== 'created_at' && col !== 'updated_at' && col !== 'upload_id'
                )
                
                const excelCols = editableColumns.filter(col => excelUploadColumns.includes(col))
                const reconCols = editableColumns.filter(col => reconciliationColumns.includes(col))
                
                return (
                  <>
                    {/* Excel Upload Fields Section */}
                    {excelCols.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">
                          📋 Booking Information {modalMode === 'edit' && <span className="text-orange-600 text-xs font-normal">(From Excel - Read Only)</span>}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {excelCols.map((col) => {
                            const value = modalMode === 'add' ? newRowData[col] : editFormData[col]
                            const isDateField = col.includes('date')
                            const isNumberField = col.includes('number') || col.includes('amount') || col.includes('balance') || col.includes('nights')
                            const isReadOnly = modalMode === 'edit'

                            return (
                              <div key={col}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {formatColumnName(col)}
                                </label>
                                <input
                                  type={isDateField ? 'date' : isNumberField ? 'number' : 'text'}
                                  step={isNumberField && (col.includes('amount') || col.includes('balance')) ? '0.01' : '1'}
                                  value={displayValue(value)}
                                  readOnly={isReadOnly}
                                  onChange={(e) => {
                                    const newValue = e.target.value
                                    if (modalMode === 'add') {
                                      setNewRowData({ ...newRowData, [col]: newValue })
                                    } else {
                                      setEditFormData({ ...editFormData, [col]: newValue })
                                    }
                                  }}
                                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                                    isReadOnly 
                                      ? 'bg-orange-50 border-orange-200 text-gray-700 cursor-not-allowed font-mono' 
                                      : 'border-gray-300'
                                  }`}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Reconciliation Fields Section */}
                    {reconCols.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">
                          💰 Reconciliation Information <span className="text-green-600 text-xs font-normal">(Editable)</span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {reconCols.map((col) => {
                            const value = modalMode === 'add' ? newRowData[col] : editFormData[col]
                            const isDateField = col.includes('date')
                            const isNumberField = col.includes('number') || col.includes('amount') || col.includes('balance') || col.includes('nights')
                            const isTextArea = col.includes('remarks') || col.includes('reconciled_amount_check')
                            const isFormula = isFormulaColumn(col)
                            
                            return (
                              <div key={col} className={isTextArea ? 'md:col-span-2' : ''}>
                                <label className={`block text-sm font-medium mb-1 ${isFormula ? 'text-blue-700' : 'text-gray-700'}`}>
                                  {formatColumnName(col)}
                                </label>
                                {isTextArea ? (
                                  <textarea
                                    value={displayValue(value)}
                                    readOnly={isFormula}
                                    onChange={(e) => {
                                      if (isFormula) return
                                      if (modalMode === 'add') {
                                        setNewRowData({ ...newRowData, [col]: e.target.value })
                                      } else {
                                        setEditFormData({ ...editFormData, [col]: e.target.value })
                                      }
                                    }}
                                    rows={3}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                                      isFormula ? 'bg-blue-50 border-blue-200 text-blue-800 cursor-not-allowed' : 'border-gray-300'
                                    }`}
                                  />
                                ) : (
                                  <input
                                    type={isDateField ? 'date' : isNumberField ? 'number' : 'text'}
                                    step={isNumberField && (col.includes('amount') || col.includes('balance')) ? '0.01' : '1'}
                                    value={displayValue(value)}
                                    readOnly={isFormula}
                                    onChange={(e) => {
                                      if (isFormula) return
                                      const newValue = e.target.value
                                      if (modalMode === 'add') {
                                        setNewRowData({ ...newRowData, [col]: newValue })
                                      } else {
                                        setEditFormData({ ...editFormData, [col]: newValue })
                                      }
                                    }}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                                      isFormula ? 'bg-blue-50 border-blue-200 text-blue-800 cursor-not-allowed' : 'border-gray-300'
                                    }`}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={modalMode === 'add' ? cancelAddNew : cancelEdit}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold transition duration-200"
              >
                Cancel
              </button>
              <button
                onClick={modalMode === 'add' ? saveNewRow : saveEdit}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition duration-200"
              >
                {modalMode === 'add' ? 'Add Row' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadPhase !== 'idle' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border-t-4 border-orange-500">
            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Uploading...</h3>
                  <p className="text-sm text-gray-600 mt-0.5">{uploadProgressDetail || uploadPhase}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleStopUpload}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition duration-200"
                >
                  Stop upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheet Selector Modal */}
      {showSheetSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-lg">
              <h2 className="text-xl font-semibold text-gray-900">
                📊 Select Sheet to Import
              </h2>
              <button
                onClick={() => {
                  setShowSheetSelector(false)
                  setWorkbookData(null)
                  setUploadedFileRef(null)
                  setLoading(false)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                Your Excel file contains multiple sheets. Please select which one to import:
              </p>
              <div className="space-y-2">
                {availableSheets.map((sheetName, index) => (
                  <button
                    key={index}
                    onClick={() => handleSheetSelect(sheetName)}
                    disabled={loading}
                    className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-500 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{sheetName}</span>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg">
              <button
                onClick={() => {
                  setShowSheetSelector(false)
                  setWorkbookData(null)
                  setUploadedFileRef(null)
                  setLoading(false)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold transition duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Records Modal */}
      {showDuplicateModal && duplicateInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex justify-between items-center rounded-t-lg">
              <div className="flex items-center">
                <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-xl font-semibold text-red-900">
                  Upload details to review
                </h2>
              </div>
            </div>
            
            <div className="px-6 py-4">
              <div className="mb-4">
                <div className="bg-gray-50 rounded-lg p-4 mb-3 space-y-3 text-sm">
                  <div>
                    <span className="text-gray-600">Number of bookings on the Excel: </span>
                    <span className="font-semibold text-gray-900">{duplicateInfo.totalRows.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Number of bookings filtered out (because ZUZU does not manage the booking, or it is not a real booking.): </span>
                    <span className="font-semibold text-gray-900">{(duplicateInfo.filteredOutCount ?? duplicateInfo.totalRows - duplicateInfo.validData.length).toLocaleString()}</span>
                    {duplicateInfo.filteredOutConfirmationExamples?.length > 0 && (
                      <span className="text-gray-500 ml-1">(e.g. {(duplicateInfo.filteredOutConfirmationExamples as (string | number)[]).slice(0, 4).join(', ')})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-600">Number of bookings already present in the table: </span>
                    <span className="font-semibold text-gray-900">{(duplicateInfo.alreadyPresentCount ?? duplicateInfo.duplicates.length).toLocaleString()}</span>
                    <span className="text-gray-500 ml-1">(e.g. {(duplicateInfo.uniqueDuplicates as (string | number)[]).slice(0, 4).join(', ')})</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Number of bookings to import: </span>
                    <span className="font-semibold text-green-600">{(duplicateInfo.toImportCount ?? duplicateInfo.validData.length - duplicateInfo.duplicates.length).toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-gray-700 font-medium mb-2">
                  What would you like to do?
                </p>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg flex space-x-3">
              <button
                onClick={handleCancelUpload}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold transition duration-200"
              >
                ❌ Cancel Upload Entirely
              </button>
              <button
                onClick={handleUploadNonDuplicates}
                className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition duration-200"
              >
                ✅ Upload Only New Records ({(duplicateInfo.toImportCount ?? duplicateInfo.validData.length - duplicateInfo.duplicates.length).toLocaleString()})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
