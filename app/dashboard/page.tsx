'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'
import { getSavedFilterPrefs, saveFilterPrefs, type DashboardFilterPrefs } from '@/lib/filterPrefs'

interface BookingRow {
  id: number
  country?: string | null
  channel?: string | null
  currency?: string | null
  status?: string | null
  total_amount_submitted?: number | null
  total_amount_received?: number | null
  amount_received?: number | null
  net_amount_by_zuzu?: number | null
  balance?: number | null
  payment_request_date?: string | null
  payment_date?: string | null
  arrival_date?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All',
  minWidth = '140px',
  openDropdown,
  onOpenChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  minWidth?: string
  openDropdown: string | null
  onOpenChange: (id: string | null) => void
}) {
  const id = `filter-${label.replace(/\s/g, '-')}`
  const isOpen = openDropdown === id
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(null)
    }
    const tid = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(tid)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, onOpenChange])

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => onChange([...options])
  const unselectAll = () => onChange([])

  const labelText = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation()
          onOpenChange(isOpen ? null : id)
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left bg-white hover:bg-gray-50 flex items-center justify-between gap-2"
      >
        <span className="truncate">{labelText}</span>
        <svg className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg py-1 max-h-56 overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No options</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={unselectAll}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 hover:underline"
                >
                  Unselect all
                </button>
              </div>
              {options.map((option) => (
                <div
                  key={option}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(option)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(option)
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm select-none"
                >
                  <span
                    className="flex shrink-0 w-4 h-4 rounded border-2 items-center justify-center"
                    style={{
                      borderColor: selected.includes(option) ? '#ea580c' : '#d1d5db',
                      backgroundColor: selected.includes(option) ? '#ea580c' : 'transparent',
                    }}
                  >
                    {selected.includes(option) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{option}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [session, setSession] = useState<any>(null)
  const [filteredCount, setFilteredCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [filterCountry, setFilterCountry] = useState<string[]>([])
  const [filterChannel, setFilterChannel] = useState<string[]>([])
  const [filterCurrency, setFilterCurrency] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [filterOptions, setFilterOptions] = useState<{ countries: string[]; channels: string[]; currencies: string[]; statuses: string[] }>({ countries: [], channels: [], currencies: [], statuses: [] })
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [channelBalanceRows, setChannelBalanceRows] = useState<{ channel: string; sumBalanceBeforeRefDateSgd: number }[]>([])
  const router = useRouter()
  const { setRightContent } = useHeaderRight()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        const prefs = getSavedFilterPrefs<DashboardFilterPrefs>(session.user.id, 'dashboard')
        if (prefs) {
          if (Array.isArray(prefs.filterCountry)) setFilterCountry(prefs.filterCountry)
          if (Array.isArray(prefs.filterChannel)) setFilterChannel(prefs.filterChannel)
          if (Array.isArray(prefs.filterCurrency)) setFilterCurrency(prefs.filterCurrency)
          if (Array.isArray(prefs.filterStatus)) setFilterStatus(prefs.filterStatus)
          if (typeof prefs.dateFrom === 'string') setDateFrom(prefs.dateFrom)
          if (typeof prefs.dateTo === 'string') setDateTo(prefs.dateTo)
        }
        fetchFilterOptions()
        // fetchDashboardData() runs from the effect below when session + filter state are set
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login')
      else setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [router])

  const fetchFilterOptions = async () => {
    try {
      const countries = new Set<string>()
      const channels = new Set<string>()
      const currencies = new Set<string>()
      const statuses = new Set<string>()
      const pageSize = 1000
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data: page, error } = await supabase
          .from('bookings')
          .select('country, channel, currency, status')
          .range(from, from + pageSize - 1)

        if (error) {
          console.error('Error fetching filter options:', error)
          break
        }
        const rows = (page ?? []) as { country?: string | null; channel?: string | null; currency?: string | null; status?: string | null }[]
        rows.forEach((r) => {
          const c = (r.country ?? '').toString().trim()
          if (c) countries.add(c)
          const ch = (r.channel ?? '').toString().trim()
          if (ch) channels.add(ch)
          const cur = (r.currency ?? '').toString().trim()
          if (cur) currencies.add(cur)
          const s = (r.status ?? '').toString().trim()
          if (s) statuses.add(s)
        })
        hasMore = rows.length === pageSize
        from += pageSize
      }

      setFilterOptions({
        countries: Array.from(countries).sort(),
        channels: Array.from(channels).sort(),
        currencies: Array.from(currencies).sort(),
        statuses: Array.from(statuses).sort(),
      })
    } catch (e) {
      console.error('Error loading filter options:', e)
    }
  }

  // Same formula as Data page: Balance before reference date in SGD (computed from row + reference_date + rates)
  const computeBalanceBeforeRefDateInSgd = (
    row: { net_amount_by_zuzu?: number | null; amount_received?: number | null; payment_gateway_fees?: number | null; payment_date?: string | null; currency?: string | null },
    refDate: string | null,
    rates: Record<string, number>
  ): number => {
    const netAmount = row.net_amount_by_zuzu != null && Number.isFinite(Number(row.net_amount_by_zuzu)) ? Number(row.net_amount_by_zuzu) : null
    if (netAmount == null || !refDate || Object.keys(rates).length === 0) return 0
    const paymentDateRaw = row.payment_date
    const paymentDateStr =
      paymentDateRaw == null || paymentDateRaw === ''
        ? null
        : typeof paymentDateRaw === 'string'
          ? paymentDateRaw.slice(0, 10)
          : (paymentDateRaw as Date)?.toISOString?.()?.slice(0, 10) ?? null
    const amountReceived = paymentDateStr != null && paymentDateStr <= refDate ? (row.amount_received != null && Number.isFinite(Number(row.amount_received)) ? Number(row.amount_received) : 0) : 0
    const gatewayFees = paymentDateStr != null && paymentDateStr <= refDate ? (row.payment_gateway_fees != null && Number.isFinite(Number(row.payment_gateway_fees)) ? Number(row.payment_gateway_fees) : 0) : 0
    const balanceBeforeRefDate = netAmount - amountReceived - gatewayFees
    const currencyCode = (row.currency ?? '').toString().trim().toUpperCase() || 'SGD'
    const rate = currencyCode === 'SGD' ? 1 : (rates[currencyCode] ?? null)
    if (rate == null || rate === 0) return 0
    return balanceBeforeRefDate / rate
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      let countQuery = supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })

      if (filterCountry.length > 0) countQuery = countQuery.in('country', filterCountry)
      if (filterChannel.length > 0) countQuery = countQuery.in('channel', filterChannel)
      if (filterCurrency.length > 0) countQuery = countQuery.in('currency', filterCurrency)
      if (filterStatus.length > 0) countQuery = countQuery.in('status', filterStatus)
      if (dateFrom) countQuery = countQuery.gte('created_at', `${dateFrom}T00:00:00.000Z`)
      if (dateTo) countQuery = countQuery.lte('created_at', `${dateTo}T23:59:59.999Z`)

      const { count, error } = await countQuery

      if (error) {
        console.error('Error fetching bookings count:', error)
        setFilteredCount(0)
      } else {
        setFilteredCount(count ?? 0)
      }

      // Load reference date and currency rates (same as Data page) so we can compute balance_before_reference_date_in_sgd
      const [refRes, currencyRes] = await Promise.all([
        supabase.from('app_settings').select('reference_date').eq('id', 1).maybeSingle(),
        supabase.from('currency').select('currency_code, rate_to_sgd')
      ])
      const refDateRaw = refRes.data?.reference_date
      const refDate =
        refDateRaw == null
          ? null
          : typeof refDateRaw === 'string'
            ? refDateRaw.slice(0, 10)
            : (refDateRaw as Date)?.toISOString?.()?.slice(0, 10) ?? null
      const rates: Record<string, number> = { SGD: 1 }
      if (currencyRes.data) {
        for (const r of currencyRes.data) {
          const code = (r.currency_code ?? '').trim().toUpperCase()
          if (!code) continue
          if (code === 'SGD') rates[code] = 1
          else if (r.rate_to_sgd != null && Number.isFinite(Number(r.rate_to_sgd))) rates[code] = Number(r.rate_to_sgd)
        }
      }

      // Channel × Balance before reference date in SGD: fetch rows and compute (same formula as Data page)
      const pageSize = 1000
      const sumsByChannel = new Map<string, number>()
      let from = 0
      let hasMore = true
      while (hasMore) {
        let dataQuery = supabase
          .from('bookings')
          .select('channel, net_amount_by_zuzu, amount_received, payment_gateway_fees, payment_date, currency')
          .range(from, from + pageSize - 1)
        if (filterCountry.length > 0) dataQuery = dataQuery.in('country', filterCountry)
        if (filterChannel.length > 0) dataQuery = dataQuery.in('channel', filterChannel)
        if (filterCurrency.length > 0) dataQuery = dataQuery.in('currency', filterCurrency)
        if (filterStatus.length > 0) dataQuery = dataQuery.in('status', filterStatus)
        if (dateFrom) dataQuery = dataQuery.gte('created_at', `${dateFrom}T00:00:00.000Z`)
        if (dateTo) dataQuery = dataQuery.lte('created_at', `${dateTo}T23:59:59.999Z`)

        const { data: page, error: dataError } = await dataQuery
        if (dataError) {
          console.warn('Channel balance aggregation failed:', dataError.message)
          break
        }
        const rows = (page ?? []) as { channel?: string | null; net_amount_by_zuzu?: number | null; amount_received?: number | null; payment_gateway_fees?: number | null; payment_date?: string | null; currency?: string | null }[]
        for (const row of rows) {
          const ch = (row.channel ?? '').toString().trim() || '(empty)'
          const num = computeBalanceBeforeRefDateInSgd(row, refDate, rates)
          sumsByChannel.set(ch, (sumsByChannel.get(ch) ?? 0) + num)
        }
        hasMore = rows.length === pageSize
        from += pageSize
      }
      const rows = Array.from(sumsByChannel.entries())
        .map(([channel, sumBalanceBeforeRefDateSgd]) => ({ channel, sumBalanceBeforeRefDateSgd }))
        .sort((a, b) => a.channel.localeCompare(b.channel))
      setChannelBalanceRows(rows)
    } catch (e) {
      console.error(e)
      setFilteredCount(0)
      setChannelBalanceRows([])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (session) {
      fetchDashboardData()
      // Persist current filters so they are restored next visit
      if (session.user?.id) {
        saveFilterPrefs(session.user.id, 'dashboard', {
          filterCountry,
          filterChannel,
          filterCurrency,
          filterStatus,
          dateFrom,
          dateTo,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [session, dateFrom, dateTo, JSON.stringify(filterCountry), JSON.stringify(filterChannel), JSON.stringify(filterCurrency), JSON.stringify(filterStatus)])

  const filterCountryOptions = useMemo(() => [...new Set([...filterCountry, ...filterOptions.countries])].sort(), [filterCountry, filterOptions.countries])
  const filterChannelOptions = useMemo(() => [...new Set([...filterChannel, ...filterOptions.channels])].sort(), [filterChannel, filterOptions.channels])
  const filterCurrencyOptions = useMemo(() => [...new Set([...filterCurrency, ...filterOptions.currencies])].sort(), [filterCurrency, filterOptions.currencies])
  const filterStatusOptions = useMemo(() => [...new Set([...filterStatus, ...filterOptions.statuses])].sort(), [filterStatus, filterOptions.statuses])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    if (!session?.user) {
      setRightContent(null)
      return
    }
    setRightContent(
      <>
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
  }, [session, setRightContent])

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters - sticky so they stay visible when scrolling */}
        <section className="sticky top-0 z-10 bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Filters</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <MultiSelectFilter
              label="Country"
              options={filterCountryOptions}
              selected={filterCountry}
              onChange={setFilterCountry}
              placeholder="All"
              minWidth="140px"
              openDropdown={openDropdown}
              onOpenChange={setOpenDropdown}
            />
            <MultiSelectFilter
              label="Channel"
              options={filterChannelOptions}
              selected={filterChannel}
              onChange={setFilterChannel}
              placeholder="All"
              minWidth="180px"
              openDropdown={openDropdown}
              onOpenChange={setOpenDropdown}
            />
            <MultiSelectFilter
              label="Currency"
              options={filterCurrencyOptions}
              selected={filterCurrency}
              onChange={setFilterCurrency}
              placeholder="All"
              minWidth="100px"
              openDropdown={openDropdown}
              onOpenChange={setOpenDropdown}
            />
            <MultiSelectFilter
              label="Status"
              options={filterStatusOptions}
              selected={filterStatus}
              onChange={setFilterStatus}
              placeholder="All"
              minWidth="120px"
              openDropdown={openDropdown}
              onOpenChange={setOpenDropdown}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => {
                setFilterCountry([])
                setFilterChannel([])
                setFilterCurrency([])
                setFilterStatus([])
                setDateFrom('')
                setDateTo('')
                setOpenDropdown(null)
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-medium"
            >
              Clear filters
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Bookings filtered</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{filteredCount.toLocaleString()}</p>
              </div>
            </section>

            <section className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-800 p-4 pb-2">Balance before reference date in SGD by channel</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left text-sm font-semibold text-gray-700 px-4 py-3">Channel</th>
                      <th className="text-right text-sm font-semibold text-gray-700 px-4 py-3">Balance before reference date in SGD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelBalanceRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-sm text-gray-500">
                          No data (or column not yet added to database).
                        </td>
                      </tr>
                    ) : (
                      channelBalanceRows.map(({ channel, sumBalanceBeforeRefDateSgd }) => (
                        <tr key={channel} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{channel}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {sumBalanceBeforeRefDateSgd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
