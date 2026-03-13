'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'
import { getSavedFilterPrefs, saveFilterPrefs, type HistoryPageFilterPrefs } from '@/lib/filterPrefs'

interface EditHistoryRow {
  id: number
  table_name: string
  row_id: number
  column_name: string
  old_value: string | null
  new_value: string | null
  edited_by: string
  edited_at: string
  row_display: string | null
  undone_at: string | null
  undone_by: string | null
}

const COLUMN_DISPLAY_NAMES: Record<string, string> = {
  net_of_demand_commission_amount_extranet: 'Net (of channel commission) amount (Extranet)',
  net_of_channel_commissio_amount_extranet: 'Net (of channel commission) amount (Extranet)',
  payment_request_date: 'Payment Request Date',
  total_amount_submitted: 'Total Amount Submitted',
  payment_method: 'Payment Method',
  amount_received: 'Amount Received',
  payment_gateway_fees: 'Payment Gateway Fees',
  total_amount_received: 'Total Amount Received',
  total_payment_gateway_fees: 'TOTAL Payment gateway fees',
  payment_date: 'Payment Date',
  balance: 'Balance',
  reconciled_amount_check: 'Reconciled amount Check',
  transmission_queue_id: 'Transmission Queue ID',
  reference_number: 'Reference Number',
  remarks: 'Remarks'
}

const NUMERIC_COLUMNS = new Set([
  'net_of_demand_commission_amount_extranet',
  'net_of_channel_commissio_amount_extranet',
  'total_amount_submitted',
  'amount_received',
  'payment_gateway_fees',
  'total_amount_received',
  'total_payment_gateway_fees'
])
const DATE_COLUMNS = new Set(['payment_request_date', 'payment_date'])

function parseRevertValue(columnName: string, oldValue: string | null): string | number | null {
  const empty = oldValue == null || oldValue === '' || String(oldValue).toLowerCase() === 'empty'
  if (empty) return null
  const s = String(oldValue).trim()
  if (NUMERIC_COLUMNS.has(columnName)) {
    const n = Number(s)
    return Number.isNaN(n) ? s : n
  }
  if (DATE_COLUMNS.has(columnName)) return s
  return s
}

function computeFormulaColumns(
  row: Record<string, unknown>,
  refDate?: string | null,
  rates?: Record<string, number>
): {
  balance: number | null
  reconciled_amount_check: number | null
  balance_before_reference_dates: number | null
  balance_before_reference_date_in_sgd: number | null
} {
  const parseNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  const netAmount = parseNum(row?.net_amount_by_zuzu)
  const amountReceived = parseNum(row?.amount_received) ?? 0
  const paymentGatewayFees = parseNum(row?.payment_gateway_fees) ?? 0
  const taxAmountDeducted = parseNum(row?.tax_amount_deducted) ?? 0
  const totalSubmitted = parseNum(row?.total_amount_submitted)
  const totalReceived = parseNum(row?.total_amount_received)
  const totalPaymentGatewayFees = parseNum(row?.total_payment_gateway_fees)
  const balance = netAmount != null ? netAmount - amountReceived - paymentGatewayFees - taxAmountDeducted : null
  const reconciled_amount_check = (totalSubmitted != null && totalReceived != null && totalPaymentGatewayFees != null) ? totalSubmitted - totalReceived - totalPaymentGatewayFees : null

  let balance_before_reference_dates: number | null = null
  let balance_before_reference_date_in_sgd: number | null = null
  if (netAmount != null && refDate) {
    const paymentDateRaw = row?.payment_date
    const paymentDateStr =
      paymentDateRaw == null || paymentDateRaw === ''
        ? null
        : typeof paymentDateRaw === 'string'
          ? String(paymentDateRaw).slice(0, 10)
          : (paymentDateRaw as Date)?.toISOString?.()?.slice(0, 10) ?? null
    const subtractAmount = paymentDateStr != null && paymentDateStr <= refDate ? (parseNum(row?.amount_received) ?? 0) + (parseNum(row?.payment_gateway_fees) ?? 0) : 0
    balance_before_reference_dates = netAmount - subtractAmount
    if (rates) {
      const currencyCode = (row?.currency ?? '').toString().trim().toUpperCase() || 'SGD'
      const rate = currencyCode === 'SGD' ? 1 : (rates[currencyCode] ?? null)
      if (rate != null && rate !== 0) balance_before_reference_date_in_sgd = balance_before_reference_dates / rate
    }
  }
  return {
    balance,
    reconciled_amount_check,
    balance_before_reference_dates,
    balance_before_reference_date_in_sgd
  }
}

function formatColumnName(col: string): string {
  return COLUMN_DISPLAY_NAMES[col] ?? col.replace(/_/g, ' ')
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}:${s}`
  } catch {
    return iso
  }
}

const EDITS_PAGE_SIZE = 100

// Filter column keys for edit_history (match table columns)
const FILTER_COLUMNS = ['edited_at', 'edited_by', 'row_display', 'column_name', 'old_value', 'new_value'] as const
const DATE_FILTER_COLUMN = 'edited_at'
const MULTI_SELECT_FILTER_COLUMNS = ['edited_by', 'column_name'] as const

export default function HistoryOfEditsPage() {
  const [session, setSession] = useState<any>(null)
  const [edits, setEdits] = useState<EditHistoryRow[]>([])
  const [totalEditCount, setTotalEditCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [undoingId, setUndoingId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>({})
  const [multiSelectFilters, setMultiSelectFilters] = useState<Record<string, string[]>>({})
  const [pendingMultiSelectFilters, setPendingMultiSelectFilters] = useState<Record<string, string[]>>({})
  const [dateRangeFilters, setDateRangeFilters] = useState<Record<string, { from: string; to: string }>>({})
  const [pendingDateRangeFilters, setPendingDateRangeFilters] = useState<Record<string, { from: string; to: string }>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [totalFilteredCount, setTotalFilteredCount] = useState<number | null>(null)
  const [distinctColumnValues, setDistinctColumnValues] = useState<Record<string, string[]>>({})
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openDateRangeColumn, setOpenDateRangeColumn] = useState<string | null>(null)
  /** Anchor rect for filter popups so we can render in portal with fixed position (avoids clipping by table overflow) */
  const [filterPopupAnchor, setFilterPopupAnchor] = useState<{ top: number; left: number; bottom: number; width: number } | null>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const pendingFiltersRef = useRef<Record<string, string>>({})
  const pendingMultiSelectFiltersRef = useRef<Record<string, string[]>>({})
  const pendingDateRangeFiltersRef = useRef<Record<string, { from: string; to: string }>>({})
  const filterInputJustBlurredRef = useRef(false)
  const router = useRouter()
  const { setRightContent } = useHeaderRight()

  const hasActiveFilters =
    Object.keys(filters).some(k => (filters[k] ?? '').trim()) ||
    Object.keys(multiSelectFilters).some(k => (multiSelectFilters[k] ?? []).length > 0) ||
    Object.keys(dateRangeFilters).some(k => {
      const r = dateRangeFilters[k]
      return (r?.from ?? '').trim() || (r?.to ?? '').trim()
    })
  const filterCount = [filters, multiSelectFilters, dateRangeFilters].reduce(
    (acc, obj) => acc + Object.keys(obj).filter(k => {
      const v = obj[k]
      if (Array.isArray(v)) return v.length > 0
      if (v && typeof v === 'object' && 'from' in v && 'to' in v)
        return ((v as { from?: string; to?: string }).from ?? '').trim() || ((v as { from?: string; to?: string }).to ?? '').trim()
      return (String(v ?? '').trim()).length > 0
    }).length,
    0
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        const prefs = getSavedFilterPrefs<HistoryPageFilterPrefs>(session.user.id, 'history')
        const hasPrefs = prefs && (
          Object.keys(prefs.filters ?? {}).some(k => ((prefs.filters ?? {})[k] ?? '').trim()) ||
          Object.keys(prefs.multiSelectFilters ?? {}).some(k => ((prefs.multiSelectFilters ?? {})[k] ?? []).length > 0) ||
          Object.keys(prefs.dateRangeFilters ?? {}).some(k => {
            const r = (prefs.dateRangeFilters ?? {})[k]
            return (r?.from ?? '').trim() || (r?.to ?? '').trim()
          })
        )
        if (hasPrefs && prefs) {
          const textFilters = prefs.filters ?? {}
          const multiFilters = prefs.multiSelectFilters ?? {}
          const dateFilters = prefs.dateRangeFilters ?? {}
          setFilters(textFilters)
          setMultiSelectFilters(multiFilters)
          setDateRangeFilters(dateFilters)
          setPendingFilters(textFilters)
          setPendingMultiSelectFilters(multiFilters)
          setPendingDateRangeFilters(dateFilters)
          pendingFiltersRef.current = textFilters
          pendingMultiSelectFiltersRef.current = multiFilters
          pendingDateRangeFiltersRef.current = dateFilters
          fetchEdits(true, false, undefined, { textFilters, multiFilters, dateRangeFilters: dateFilters })
        } else {
          fetchEdits()
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

  // Close filter dropdowns when clicking outside (portaled popups use .filter-popup-portal so we don't close when clicking inside them)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (target.closest('.filter-popup-portal')) return
      if (openDropdown && !target.closest('.relative')) {
        setOpenDropdown(null)
        filterInputJustBlurredRef.current = true
        setTimeout(() => { filterInputJustBlurredRef.current = false }, 100)
      }
      if (openDateRangeColumn && !target.closest('.date-range-filter-wrap')) {
        setOpenDateRangeColumn(null)
        filterInputJustBlurredRef.current = true
        setTimeout(() => { filterInputJustBlurredRef.current = false }, 100)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown, openDateRangeColumn])

  // Fetch distinct values for multi-select filters (edited_by, column_name)
  const fetchDistinctFilterValues = async () => {
    const result: Record<string, string[]> = {}
    for (const col of MULTI_SELECT_FILTER_COLUMNS) {
      try {
        const { data, error } = await supabase
          .from('edit_history')
          .select(col)
          .limit(5000)
        if (error) continue
        const values = (data ?? [])
          .map(row => String((row as Record<string, unknown>)[col] ?? '').trim())
          .filter(Boolean)
        result[col] = Array.from(new Set(values)).sort()
      } catch {
        result[col] = []
      }
    }
    setDistinctColumnValues(prev => ({ ...prev, ...result }))
  }

  useEffect(() => {
    if (session) fetchDistinctFilterValues()
  }, [session])

  // Close filter popups when user scrolls the table (keeps popup from floating away from trigger)
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const close = () => {
      setOpenDateRangeColumn(null)
      setOpenDropdown(null)
    }
    el.addEventListener('scroll', close, { passive: true })
    return () => el.removeEventListener('scroll', close)
  }, [])

  const handleFilterChange = (column: string, value: string) => {
    const next = { ...pendingFilters, [column]: value }
    setPendingFilters(next)
    pendingFiltersRef.current = next
  }

  const toggleMultiSelectValue = (column: string, value: string) => {
    const current = pendingMultiSelectFilters[column] || []
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    const next = { ...pendingMultiSelectFilters, [column]: updated }
    setPendingMultiSelectFilters(next)
    pendingMultiSelectFiltersRef.current = next
  }

  const applyFilters = () => {
    const textFilters = pendingFiltersRef.current ?? pendingFilters
    const multiFilters = pendingMultiSelectFiltersRef.current ?? pendingMultiSelectFilters
    const dateFilters = pendingDateRangeFiltersRef.current ?? pendingDateRangeFilters
    setFilters(textFilters)
    setMultiSelectFilters(multiFilters)
    setDateRangeFilters(dateFilters)
    setOpenDateRangeColumn(null)
    setOpenDropdown(null)
    setEdits([])
    fetchEdits(true, false, undefined, {
      textFilters: textFilters,
      multiFilters: multiFilters,
      dateRangeFilters: dateFilters,
    })
    if (session?.user?.id) {
      saveFilterPrefs(session.user.id, 'history', {
        filters: textFilters,
        multiSelectFilters: multiFilters,
        dateRangeFilters: dateFilters,
      })
    }
  }

  const clearFilters = () => {
    setFilters({})
    setMultiSelectFilters({})
    setDateRangeFilters({})
    setPendingFilters({})
    setPendingMultiSelectFilters({})
    setPendingDateRangeFilters({})
    pendingFiltersRef.current = {}
    pendingMultiSelectFiltersRef.current = {}
    pendingDateRangeFiltersRef.current = {}
    setOpenDateRangeColumn(null)
    setOpenDropdown(null)
    setShowFilters(false)
    setTotalFilteredCount(null)
    setEdits([])
    fetchEdits(true)
    if (session?.user?.id) {
      saveFilterPrefs(session.user.id, 'history', {
        filters: {},
        multiSelectFilters: {},
        dateRangeFilters: {},
      })
    }
  }

  const fetchEdits = async (
    showLoading = true,
    append = false,
    refreshLength?: number,
    filterOverrides?: {
      textFilters?: Record<string, string>
      multiFilters?: Record<string, string[]>
      dateRangeFilters?: Record<string, { from: string; to: string }>
    }
  ) => {
    if (append) {
      setLoadingMore(true)
    } else if (showLoading) {
      setLoading(true)
    }

    const activeText = filterOverrides?.textFilters ?? filters
    const activeMulti = filterOverrides?.multiFilters ?? multiSelectFilters
    const activeDateRange = filterOverrides?.dateRangeFilters ?? dateRangeFilters
    const hasFilters =
      Object.keys(activeText).some(k => (activeText[k] ?? '').trim()) ||
      Object.keys(activeMulti).some(k => (activeMulti[k] ?? []).length > 0) ||
      Object.keys(activeDateRange).some(k => {
        const r = activeDateRange[k]
        return (r?.from ?? '').trim() || (r?.to ?? '').trim()
      })

    const applyFiltersToQuery = (q: ReturnType<typeof supabase.from>, selectOptions?: { count: 'exact'; head: boolean }) => {
      let query = selectOptions ? q.select('*', selectOptions) : q.select('*')
      query = query.order('edited_at', { ascending: false })
      if (!hasFilters) return query
      Object.keys(activeText).forEach(column => {
        const filterValue = (activeText[column] ?? '').trim()
        if (filterValue) {
          query = query.ilike(column, `%${filterValue}%`)
        }
      })
      MULTI_SELECT_FILTER_COLUMNS.forEach(column => {
        const selectedValues = (activeMulti[column] ?? []).map(v => String(v).trim()).filter(Boolean)
        if (selectedValues.length > 0) {
          query = query.in(column, selectedValues)
        }
      })
      Object.keys(activeDateRange).forEach(column => {
        const { from, to } = activeDateRange[column] || {}
        if (from?.trim()) query = query.gte(column, from.trim() + 'T00:00:00.000Z')
        if (to?.trim()) query = query.lte(column, to.trim() + 'T23:59:59.999Z')
      })
      return query
    }

    try {
      if (refreshLength != null && refreshLength > 0) {
        const baseQuery = supabase.from('edit_history')
        const { data, error } = await applyFiltersToQuery(baseQuery).range(0, refreshLength - 1)
        if (error) {
          console.error('Error refreshing edit history:', error)
        } else {
          setEdits((data as EditHistoryRow[]) || [])
        }
      } else if (append) {
        const baseQuery = supabase.from('edit_history')
        const from = edits.length
        const to = from + EDITS_PAGE_SIZE - 1
        const { data, error } = await applyFiltersToQuery(baseQuery).range(from, to)
        if (error) {
          console.error('Error loading more edits:', error)
          alert(`Error loading more: ${error.message}`)
        } else {
          setEdits(prev => [...prev, ...((data as EditHistoryRow[]) || [])])
        }
      } else {
        const countQuery = applyFiltersToQuery(supabase.from('edit_history'), { count: 'exact', head: true })
        const { count } = await countQuery
        if (hasFilters) {
          setTotalFilteredCount(count ?? 0)
        } else {
          setTotalEditCount(count ?? 0)
          setTotalFilteredCount(null)
        }

        const dataQuery = applyFiltersToQuery(supabase.from('edit_history'))
        const { data, error } = await dataQuery.range(0, EDITS_PAGE_SIZE - 1)
        if (error) {
          console.error('Error fetching edit history:', error)
          alert(`Error loading edit history: ${error.message}`)
        } else {
          setEdits((data as EditHistoryRow[]) || [])
          setCurrentPage(1)
        }
      }
    } finally {
      if (append) setLoadingMore(false)
      if (showLoading) setLoading(false)
    }
  }

  const goToPage = async (page: number) => {
    if (page < 1) return
    setLoading(true)
    try {
      const activeText = filters
      const activeMulti = multiSelectFilters
      const activeDateRange = dateRangeFilters
      const hasFilters =
        Object.keys(activeText).some(k => (activeText[k] ?? '').trim()) ||
        Object.keys(activeMulti).some(k => (activeMulti[k] ?? []).length > 0) ||
        Object.keys(activeDateRange).some(k => {
          const r = activeDateRange[k]
          return (r?.from ?? '').trim() || (r?.to ?? '').trim()
        })

      const applyFiltersToQuery = (q: ReturnType<typeof supabase.from>, selectOptions?: { count: 'exact'; head: boolean }) => {
        let query = selectOptions ? q.select('*', selectOptions) : q.select('*')
        query = query.order('edited_at', { ascending: false })
        if (!hasFilters) return query
        Object.keys(activeText).forEach(column => {
          const filterValue = (activeText[column] ?? '').trim()
          if (filterValue) {
            query = query.ilike(column, `%${filterValue}%`)
          }
        })
        MULTI_SELECT_FILTER_COLUMNS.forEach(column => {
          const selectedValues = (activeMulti[column] ?? []).map(v => String(v).trim()).filter(Boolean)
          if (selectedValues.length > 0) {
            query = query.in(column, selectedValues)
          }
        })
        Object.keys(activeDateRange).forEach(column => {
          const { from, to } = activeDateRange[column] || {}
          if (from?.trim()) query = query.gte(column, from.trim() + 'T00:00:00.000Z')
          if (to?.trim()) query = query.lte(column, to.trim() + 'T23:59:59.999Z')
        })
        return query
      }

      const rangeFrom = (page - 1) * EDITS_PAGE_SIZE
      const rangeTo = rangeFrom + EDITS_PAGE_SIZE - 1
      const { data, error } = await applyFiltersToQuery(supabase.from('edit_history')).range(rangeFrom, rangeTo)
      if (error) {
        console.error('Error navigating to page:', error)
        alert(`Error loading page: ${error.message}`)
      } else {
        setEdits((data as EditHistoryRow[]) || [])
        setCurrentPage(page)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleUndo = async (edit: EditHistoryRow) => {
    setUndoingId(edit.id)
    try {
      const rowPromise = supabase.from(edit.table_name).select('*').eq('id', edit.row_id).single()
      const refAndRatesPromise =
        edit.table_name === 'bookings'
          ? Promise.all([
              supabase.from('app_settings').select('reference_date').eq('id', 1).maybeSingle(),
              supabase.from('currency').select('currency_code, rate_to_sgd')
            ])
          : Promise.resolve([null, null] as const)

      const [{ data: currentRow, error: fetchError }, refAndRates] = await Promise.all([rowPromise, refAndRatesPromise])

      if (fetchError || !currentRow) {
        alert(`Could not load row: ${fetchError?.message ?? 'Not found'}`)
        return
      }

      const revertedValue = parseRevertValue(edit.column_name, edit.old_value)
      const updatedRow = { ...currentRow, [edit.column_name]: revertedValue }

      let updatePayload: Record<string, unknown> = {
        [edit.column_name]: revertedValue,
        updated_at: new Date().toISOString()
      }

      if (edit.table_name === 'bookings') {
        let refDate: string | null = null
        const rates: Record<string, number> = {}
        if (refAndRates[0]?.data?.reference_date != null) {
          const d = refAndRates[0].data.reference_date
          refDate = typeof d === 'string' ? d.slice(0, 10) : (d as Date)?.toISOString?.()?.slice(0, 10) ?? null
        }
        if (Array.isArray(refAndRates[1]?.data)) {
          for (const row of refAndRates[1].data) {
            const code = (row.currency_code ?? '').trim().toUpperCase()
            if (code) {
              if (code === 'SGD') rates[code] = 1
              else if (row.rate_to_sgd != null && Number.isFinite(Number(row.rate_to_sgd))) rates[code] = Number(row.rate_to_sgd)
            }
          }
        }
        const computed = computeFormulaColumns(updatedRow, refDate, rates)
        updatePayload.balance = computed.balance
        updatePayload.reconciled_amount_check = computed.reconciled_amount_check
        updatePayload.balance_before_reference_dates = computed.balance_before_reference_dates
        updatePayload.balance_before_reference_date_in_sgd = computed.balance_before_reference_date_in_sgd
      }

      const { error: updateError } = await supabase
        .from(edit.table_name)
        .update(updatePayload)
        .eq('id', edit.row_id)

      if (updateError) {
        alert(`Undo failed: ${updateError.message}`)
        return
      }

      const undoneBy = session?.user?.email ?? 'Unknown'
      await supabase
        .from('edit_history')
        .update({ undone_at: new Date().toISOString(), undone_by: undoneBy })
        .eq('id', edit.id)

      await fetchEdits(false, false, edits.length)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setUndoingId(null)
    }
  }

  useEffect(() => {
    if (!session?.user) {
      setRightContent(null)
      return
    }
    setRightContent(
      <>
        <button
          onClick={() => {
            if (!showFilters) {
              setPendingFilters({ ...filters })
              setPendingMultiSelectFilters({ ...multiSelectFilters })
              setPendingDateRangeFilters({ ...dateRangeFilters })
              pendingFiltersRef.current = { ...filters }
              pendingMultiSelectFiltersRef.current = { ...multiSelectFilters }
              pendingDateRangeFiltersRef.current = { ...dateRangeFilters }
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
        <span className="shrink-0 inline-flex items-center text-sm text-gray-600 whitespace-nowrap h-[38px]">{session.user?.email}</span>
        <button
          onClick={handleSignOut}
          className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
        >
          Sign Out
        </button>
      </>
    )
    return () => setRightContent(null)
  }, [session, setRightContent, showFilters, hasActiveFilters, filterCount, filters, multiSelectFilters, dateRangeFilters])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-gray-600 mb-4">
          Manual edits on the green editable (reconciliation) columns only. Excel uploads are not included.
        </p>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto" />
            <p className="mt-4 text-gray-600">Loading edit history...</p>
          </div>
        ) : edits.length === 0 ? (
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Edits Yet</h3>
            <p className="text-gray-600 mb-4">
              Edits made on the dashboard (green cells) will appear here.
            </p>
            <button
              onClick={() => router.push('/data')}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition duration-200"
            >
              Go to Bookings
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-orange-500">
            <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-180px)] min-w-0">
              <table className="w-full table-fixed min-w-0">
                <thead className="bg-gray-100 border-b-2 border-gray-200 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      When
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Who
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Row
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Column
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Old value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      New value
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                  {showFilters && (
                    <tr className="bg-orange-50">
                      {/* When — date range */}
                      <th className="px-4 py-2 relative date-range-filter-wrap">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setFilterPopupAnchor({ top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width })
                              setOpenDateRangeColumn(prev => prev === 'edited_at' ? null : 'edited_at')
                            }}
                            className={`w-full px-3 py-2 text-sm text-left border rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent flex justify-between items-center ${
                              (pendingDateRangeFilters.edited_at?.from?.trim() || pendingDateRangeFilters.edited_at?.to?.trim())
                                ? 'border-orange-400 bg-orange-50 text-orange-900' : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-500'
                            }`}
                          >
                            <span className="truncate">
                              {(pendingDateRangeFilters.edited_at?.from || pendingDateRangeFilters.edited_at?.to)
                                ? `${pendingDateRangeFilters.edited_at?.from || '…'} → ${pendingDateRangeFilters.edited_at?.to || '…'}`
                                : 'Filter'}
                            </span>
                            <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                          {openDateRangeColumn === 'edited_at' && filterPopupAnchor && typeof document !== 'undefined' && createPortal(
                            <div
                              className="filter-popup-portal min-w-[240px] bg-white border border-gray-300 rounded-lg shadow-xl p-3"
                              style={{
                                position: 'fixed',
                                top: filterPopupAnchor.bottom + 4,
                                left: filterPopupAnchor.left,
                                zIndex: 9999,
                              }}
                            >
                              <div className="text-xs font-semibold text-gray-700 mb-2">When (edited at)</div>
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">From</label>
                                  <input
                                    type="date"
                                    value={pendingDateRangeFilters.edited_at?.from ?? ''}
                                    onChange={(e) => {
                                      const next = { ...pendingDateRangeFilters, edited_at: { ...(pendingDateRangeFilters.edited_at || { from: '', to: '' }), from: e.target.value } }
                                      setPendingDateRangeFilters(next)
                                      pendingDateRangeFiltersRef.current = next
                                    }}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">To</label>
                                  <input
                                    type="date"
                                    value={pendingDateRangeFilters.edited_at?.to ?? ''}
                                    onChange={(e) => {
                                      const next = { ...pendingDateRangeFilters, edited_at: { ...(pendingDateRangeFilters.edited_at || { from: '', to: '' }), to: e.target.value } }
                                      setPendingDateRangeFilters(next)
                                      pendingDateRangeFiltersRef.current = next
                                    }}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...pendingDateRangeFilters, edited_at: { from: '', to: '' } }
                                  setPendingDateRangeFilters(next)
                                  pendingDateRangeFiltersRef.current = next
                                }}
                                className="mt-2 w-full text-left px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 rounded"
                              >
                                Clear range
                              </button>
                            </div>,
                            document.body
                          )}
                        </div>
                      </th>
                      {/* Who — multi-select */}
                      <th className="px-4 py-2 relative">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setFilterPopupAnchor({ top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width })
                              setOpenDropdown(prev => prev === 'edited_by' ? null : 'edited_by')
                            }}
                            className={`w-full px-3 py-2 text-sm text-left border border-gray-300 rounded bg-white hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:border-transparent flex justify-between items-center ${(pendingMultiSelectFilters.edited_by?.length ?? 0) === 0 ? 'text-gray-500' : ''}`}
                          >
                            <span className="truncate">
                              {(pendingMultiSelectFilters.edited_by?.length ?? 0) > 0 ? `${pendingMultiSelectFilters.edited_by!.length} selected` : 'Filter'}
                            </span>
                            <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown === 'edited_by' && filterPopupAnchor && typeof document !== 'undefined' && createPortal(
                            <div
                              className="filter-popup-portal min-w-max bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                              style={{
                                position: 'fixed',
                                top: filterPopupAnchor.bottom + 4,
                                left: filterPopupAnchor.left,
                                width: Math.max(filterPopupAnchor.width, 160),
                                zIndex: 9999,
                              }}
                            >
                              <div className="p-2">
                                <button type="button" onClick={() => { const next = { ...pendingMultiSelectFilters, edited_by: [] }; setPendingMultiSelectFilters(next); pendingMultiSelectFiltersRef.current = next }} className="w-full text-left px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 rounded">Clear selection</button>
                              </div>
                              {(distinctColumnValues.edited_by || []).map(value => (
                                <label key={value} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer whitespace-nowrap">
                                  <input type="checkbox" checked={(pendingMultiSelectFilters.edited_by ?? []).includes(value)} onChange={() => toggleMultiSelectValue('edited_by', value)} className="mr-2 rounded text-orange-500 focus:ring-orange-500" />
                                  <span className="text-sm text-gray-900">{value}</span>
                                </label>
                              ))}
                            </div>,
                            document.body
                          )}
                        </div>
                      </th>
                      {/* Row — text */}
                      <th className="px-4 py-2">
                        <input
                          type="text"
                          placeholder="Filter"
                          value={pendingFilters.row_display ?? ''}
                          onChange={(e) => handleFilterChange('row_display', e.target.value)}
                          onBlur={() => { filterInputJustBlurredRef.current = true; setTimeout(() => { filterInputJustBlurredRef.current = false }, 100) }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                        />
                      </th>
                      {/* Column — multi-select */}
                      <th className="px-4 py-2 relative">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setFilterPopupAnchor({ top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width })
                              setOpenDropdown(prev => prev === 'column_name' ? null : 'column_name')
                            }}
                            className={`w-full px-3 py-2 text-sm text-left border border-gray-300 rounded bg-white hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:border-transparent flex justify-between items-center ${(pendingMultiSelectFilters.column_name?.length ?? 0) === 0 ? 'text-gray-500' : ''}`}
                          >
                            <span className="truncate">
                              {(pendingMultiSelectFilters.column_name?.length ?? 0) > 0 ? `${pendingMultiSelectFilters.column_name!.length} selected` : 'Filter'}
                            </span>
                            <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown === 'column_name' && filterPopupAnchor && typeof document !== 'undefined' && createPortal(
                            <div
                              className="filter-popup-portal min-w-max bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                              style={{
                                position: 'fixed',
                                top: filterPopupAnchor.bottom + 4,
                                left: filterPopupAnchor.left,
                                width: Math.max(filterPopupAnchor.width, 160),
                                zIndex: 9999,
                              }}
                            >
                              <div className="p-2">
                                <button type="button" onClick={() => { const next = { ...pendingMultiSelectFilters, column_name: [] }; setPendingMultiSelectFilters(next); pendingMultiSelectFiltersRef.current = next }} className="w-full text-left px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 rounded">Clear selection</button>
                              </div>
                              {(distinctColumnValues.column_name || []).map(value => (
                                <label key={value} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer whitespace-nowrap">
                                  <input type="checkbox" checked={(pendingMultiSelectFilters.column_name ?? []).includes(value)} onChange={() => toggleMultiSelectValue('column_name', value)} className="mr-2 rounded text-orange-500 focus:ring-orange-500" />
                                  <span className="text-sm text-gray-900">{formatColumnName(value)}</span>
                                </label>
                              ))}
                            </div>,
                            document.body
                          )}
                        </div>
                      </th>
                      {/* Old value — text */}
                      <th className="px-4 py-2">
                        <input
                          type="text"
                          placeholder="Filter"
                          value={pendingFilters.old_value ?? ''}
                          onChange={(e) => handleFilterChange('old_value', e.target.value)}
                          onBlur={() => { filterInputJustBlurredRef.current = true; setTimeout(() => { filterInputJustBlurredRef.current = false }, 100) }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                        />
                      </th>
                      {/* New value — text */}
                      <th className="px-4 py-2">
                        <input
                          type="text"
                          placeholder="Filter"
                          value={pendingFilters.new_value ?? ''}
                          onChange={(e) => handleFilterChange('new_value', e.target.value)}
                          onBlur={() => { filterInputJustBlurredRef.current = true; setTimeout(() => { filterInputJustBlurredRef.current = false }, 100) }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                        />
                      </th>
                      <th className="px-4 py-2" />
                    </tr>
                  )}
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {edits.map((edit) => (
                    <tr key={edit.id} className="hover:bg-orange-50">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {formatTimestamp(edit.edited_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {edit.edited_by}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="font-mono text-gray-600">
                          {edit.row_display || `${edit.table_name} #${edit.row_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-green-700 font-medium">
                        {formatColumnName(edit.column_name)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-600 max-w-xs truncate ${NUMERIC_COLUMNS.has(edit.column_name) ? 'text-right' : ''}`} title={edit.old_value ?? ''}>
                        {edit.old_value === '' || edit.old_value == null ? (
                          <span className="text-gray-400 italic">empty</span>
                        ) : (
                          edit.old_value
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-900 max-w-xs truncate font-medium ${NUMERIC_COLUMNS.has(edit.column_name) ? 'text-right' : ''}`} title={edit.new_value ?? ''}>
                        {edit.new_value === '' || edit.new_value == null ? (
                          <span className="text-gray-400 italic">empty</span>
                        ) : (
                          edit.new_value
                        )}
                      </td>
                      <td className="px-4 py-3 text-right min-w-0">
                        {edit.undone_at ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg max-w-full min-w-0 truncate" title={`Reverted on ${formatTimestamp(edit.undone_at)}`}>
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Reverted by {edit.undone_by} on {formatTimestamp(edit.undone_at)}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleUndo(edit)}
                            disabled={undoingId === edit.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Revert this change (set value back to old value)"
                          >
                            {undoingId === edit.id ? (
                              <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Undoing…
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                Undo
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">
                Showing {edits.length} of {hasActiveFilters && totalFilteredCount != null ? totalFilteredCount : totalEditCount} edit{(hasActiveFilters && totalFilteredCount != null ? totalFilteredCount : totalEditCount) !== 1 ? 's' : ''} (most recent first).
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {edits.length < (hasActiveFilters && totalFilteredCount != null ? totalFilteredCount : totalEditCount) && (
                  <button
                    onClick={() => fetchEdits(false, true)}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition duration-200 flex items-center justify-center"
                  >
                    {loadingMore ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading...
                      </>
                    ) : (
                      `Load ${EDITS_PAGE_SIZE} More`
                    )}
                  </button>
                )}

                <span className="text-gray-300 mx-1">|</span>

                {(() => {
                  const maxRecords = hasActiveFilters && totalFilteredCount != null ? totalFilteredCount : totalEditCount
                  const totalPages = Math.ceil(maxRecords / EDITS_PAGE_SIZE) || 1
                  return (
                    <>
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1 || loading}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-800 rounded-lg text-sm font-semibold transition duration-200"
                      >
                        ← Prev
                      </button>
                      <span className="text-sm text-gray-600 whitespace-nowrap">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages || loading}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-800 rounded-lg text-sm font-semibold transition duration-200"
                      >
                        Next →
                      </button>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
