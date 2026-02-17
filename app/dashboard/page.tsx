'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts'

const CHART_COLORS = ['#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#f97316', '#fb923c', '#fdba74']

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
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCountry, setFilterCountry] = useState<string[]>([])
  const [filterChannel, setFilterChannel] = useState<string[]>([])
  const [filterCurrency, setFilterCurrency] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [uploadCount, setUploadCount] = useState<number>(0)
  const [editCount, setEditCount] = useState<number>(0)
  const [filterOptions, setFilterOptions] = useState<{ countries: string[]; channels: string[]; currencies: string[]; statuses: string[] }>({ countries: [], channels: [], currencies: [], statuses: [] })
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        fetchDashboardData()
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

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('bookings')
        .select('id, country, channel, currency, status, total_amount_submitted, total_amount_received, amount_received, net_amount_by_zuzu, balance, payment_request_date, payment_date, arrival_date, created_at')
        .limit(10000)

      if (filterCountry.length > 0) query = query.in('country', filterCountry)
      if (filterChannel.length > 0) query = query.in('channel', filterChannel)
      if (filterCurrency.length > 0) query = query.in('currency', filterCurrency)
      if (filterStatus.length > 0) query = query.in('status', filterStatus)
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`)
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)

      const { data: bookingData, error } = await query

      if (error) {
        console.error('Error fetching bookings:', error)
        setBookings([])
      } else {
        const data = (bookingData as BookingRow[]) || []
        setBookings(data)
        const hasNoFilters = filterCountry.length === 0 && filterChannel.length === 0 && filterCurrency.length === 0 && filterStatus.length === 0
        if (hasNoFilters && data.length > 0) {
          const countries = Array.from(new Set(data.map((r) => (r.country ?? '').toString().trim()).filter(Boolean))).sort()
          const channels = Array.from(new Set(data.map((r) => (r.channel ?? '').toString().trim()).filter(Boolean))).sort()
          const currencies = Array.from(new Set(data.map((r) => (r.currency ?? '').toString().trim()).filter(Boolean))).sort()
          const statuses = Array.from(new Set(data.map((r) => (r.status ?? '').toString().trim()).filter(Boolean))).sort()
          setFilterOptions({ countries, channels, currencies, statuses })
        }
      }

      const { count: uploadCnt } = await supabase.from('upload_history').select('*', { count: 'exact', head: true })
      setUploadCount(uploadCnt ?? 0)

      const { count: editCnt } = await supabase.from('edit_history').select('*', { count: 'exact', head: true })
      setEditCount(editCnt ?? 0)
    } catch (e) {
      console.error(e)
      setBookings([])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (session) fetchDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [session, dateFrom, dateTo, JSON.stringify(filterCountry), JSON.stringify(filterChannel), JSON.stringify(filterCurrency), JSON.stringify(filterStatus)])

  const parseNum = (v: unknown): number => {
    if (v == null || v === '') return 0
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }

  const kpis = useMemo(() => {
    const totalSubmitted = bookings.reduce((s, r) => s + parseNum(r.total_amount_submitted), 0)
    const totalReceived = bookings.reduce((s, r) => s + parseNum(r.total_amount_received ?? r.amount_received), 0)
    const totalBalance = bookings.reduce((s, r) => s + parseNum(r.balance), 0)
    return {
      count: bookings.length,
      totalSubmitted,
      totalReceived,
      totalBalance,
      unreconciled: totalSubmitted - totalReceived,
    }
  }, [bookings])

  const byCountry = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    bookings.forEach((r) => {
      const key = (r.country ?? 'Unknown').toString().trim() || 'Unknown'
      const cur = map.get(key) ?? { count: 0, amount: 0 }
      cur.count += 1
      cur.amount += parseNum(r.total_amount_submitted)
      map.set(key, cur)
    })
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, count: v.count, amount: Math.round(v.amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
  }, [bookings])

  const byChannel = useMemo(() => {
    const map = new Map<string, number>()
    bookings.forEach((r) => {
      const key = (r.channel ?? 'Unknown').toString().trim() || 'Unknown'
      map.set(key, (map.get(key) ?? 0) + parseNum(r.total_amount_submitted))
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [bookings])

  const byStatus = useMemo(() => {
    const map = new Map<string, number>()
    bookings.forEach((r) => {
      const key = (r.status ?? 'Unknown').toString().trim() || 'Unknown'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [bookings])

  const byMonth = useMemo(() => {
    const map = new Map<string, { submitted: number; received: number; count: number }>()
    bookings.forEach((r) => {
      const raw = r.payment_request_date ?? r.created_at ?? ''
      const month = raw ? String(raw).slice(0, 7) : 'No date'
      const cur = map.get(month) ?? { submitted: 0, received: 0, count: 0 }
      cur.submitted += parseNum(r.total_amount_submitted)
      cur.received += parseNum(r.total_amount_received ?? r.amount_received)
      cur.count += 1
      map.set(month, cur)
    })
    return Array.from(map.entries())
      .map(([month, v]) => ({
        month,
        submitted: Math.round(v.submitted * 100) / 100,
        received: Math.round(v.received * 100) / 100,
        count: v.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [bookings])

  const filterCountryOptions = useMemo(() => [...new Set([...filterCountry, ...filterOptions.countries])].sort(), [filterCountry, filterOptions.countries])
  const filterChannelOptions = useMemo(() => [...new Set([...filterChannel, ...filterOptions.channels])].sort(), [filterChannel, filterOptions.channels])
  const filterCurrencyOptions = useMemo(() => [...new Set([...filterCurrency, ...filterOptions.currencies])].sort(), [filterCurrency, filterOptions.currencies])
  const filterStatusOptions = useMemo(() => [...new Set([...filterStatus, ...filterOptions.statuses])].sort(), [filterStatus, filterOptions.statuses])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

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
      <header className="bg-white shadow-md border-b-4 border-orange-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-700 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <div className="flex items-center flex-wrap gap-3">
              <button
                onClick={() => router.push('/data')}
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                Data / Bookings
              </button>
              <button
                onClick={() => router.push('/uploads')}
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                Upload History
              </button>
              <button
                onClick={() => router.push('/history')}
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                History of Edits
              </button>
              <span className="text-sm text-gray-600">{session.user?.email}</span>
              <button
                onClick={handleSignOut}
                className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
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
            {/* KPI cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Bookings (filtered)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.count.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Total submitted</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.totalSubmitted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Total received</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Unreconciled</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{kpis.unreconciled.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500">Uploads / Edits</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{uploadCount} / {editCount}</p>
              </div>
            </section>

            {/* Charts row */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Amount by month</h3>
                <div className="h-72">
                  {byMonth.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={byMonth} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), '']} labelFormatter={(l) => `Month: ${l}`} />
                        <Legend />
                        <Line type="monotone" dataKey="submitted" stroke="#ea580c" name="Submitted" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="received" stroke="#22c55e" name="Received" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-sm flex items-center justify-center h-full">No date data</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Amount by channel</h3>
                <div className="h-72">
                  {byChannel.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byChannel} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                        <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Amount']} />
                        <Bar dataKey="value" fill="#ea580c" radius={[0, 4, 4, 0]} name="Amount" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-sm flex items-center justify-center h-full">No channel data</p>
                  )}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Bookings by status</h3>
                <div className="h-72">
                  {byStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={byStatus}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {byStatus.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Count']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-sm flex items-center justify-center h-full">No status data</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Top countries by amount</h3>
                <div className="h-72">
                  {byCountry.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byCountry} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Amount']} />
                        <Bar dataKey="amount" fill="#c2410c" radius={[4, 4, 0, 0]} name="Amount" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-sm flex items-center justify-center h-full">No country data</p>
                  )}
                </div>
              </div>
            </section>

            {/* Summary table */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="text-base font-semibold text-gray-800 p-4 border-b border-gray-200">Top countries (count & amount)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Country</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Bookings</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Total submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCountry.slice(0, 15).map((row) => (
                      <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-4">{row.name}</td>
                        <td className="py-2 px-4 text-right">{row.count.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right">{row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
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
