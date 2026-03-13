'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PAGE_SIZE = 100
const DROPDOWN_OPTIONS = ['BT', 'VCC', 'Inactive', 'Inactive OTA'] as const
const TEXT_COLUMNS = ['hms_id', 'hotel_name']

export default function PropertiesPage() {
  const [session, setSession] = useState<any>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [filterHmsId, setFilterHmsId] = useState('')
  const [filterHotelName, setFilterHotelName] = useState('')
  const [appliedHmsId, setAppliedHmsId] = useState('')
  const [appliedHotelName, setAppliedHotelName] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<Record<string, string>>({})
  const [editingRowId, setEditingRowId] = useState<number | string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const router = useRouter()
  // Cache discovered order column so we don't need an extra sample query on every load
  const orderColumnRef = useRef<string | null>(null)

  const editableColumns = columns.filter((c) => c !== 'id' && c !== 'created_at')
  const isTextColumn = (col: string) => TEXT_COLUMNS.includes(col)
  // Use id if present, else hms_id for row identity (update/delete and edit state)
  const primaryKeyColumn = columns.includes('id') ? 'id' : 'hms_id'
  const getRowKey = (row: Record<string, unknown>) =>
    row[primaryKeyColumn] !== undefined && row[primaryKeyColumn] !== null
      ? row[primaryKeyColumn]
      : null

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
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

  useEffect(() => {
    if (!session) return

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const fetchData = async () => {
      setLoading(true)
      setFetchError(null)
      const orderColumn = orderColumnRef.current

      let query = supabase
        .from('properties')
        .select('*', { count: 'exact' })
      const hmsIdVal = appliedHmsId.trim()
      const hotelNameVal = appliedHotelName.trim()
      if (hmsIdVal) query = query.eq('hms_id', hmsIdVal)
      if (hotelNameVal) query = query.ilike('hotel_name', `%${hotelNameVal}%`)
      query = query.range(from, to)
      const ordered = orderColumn ? query.order(orderColumn, { ascending: true }) : query
      const { data, error, count } = await ordered

      if (error) {
        console.error('Properties fetch error:', error)
        setFetchError(error.message || 'Could not load properties')
        setRows([])
        setTotalCount(0)
      } else {
        if (count != null) setTotalCount(count)
        const rowList = (data ?? []) as Record<string, unknown>[]
        setRows(rowList)
        if (rowList.length > 0) {
          const discovered = Object.keys(rowList[0]).filter((k) => k !== 'created_at')
          setColumns(discovered)
          if (!orderColumnRef.current) {
            orderColumnRef.current = discovered.find((c) => c === 'hms_id' || c === 'id') ?? discovered[0] ?? null
          }
        }
      }
      setLoading(false)
    }

    fetchData()
  }, [session, page, appliedHmsId, appliedHotelName, refreshCounter])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const displayValue = (v: unknown): string => {
    if (v == null || v === '') return ''
    return String(v)
  }

  const refetch = () => setRefreshCounter((c) => c + 1)

  const buildPayload = (form: Record<string, string>): Record<string, string | null> => {
    const payload: Record<string, string | null> = {}
    editableColumns.forEach((col) => {
      const v = form[col]?.trim()
      payload[col] = v === '' ? null : (v ?? null)
    })
    return payload
  }

  const handleAdd = async () => {
    setActionError(null)
    const payload = buildPayload(addForm)
    const { error } = await supabase.from('properties').insert(payload)
    if (error) {
      setActionError(error.message || 'Failed to add row')
      return
    }
    setShowAddForm(false)
    setAddForm({})
    refetch()
  }

  const handleEditSave = async () => {
    if (editingRowId == null) return
    setActionError(null)
    const payload = buildPayload(editForm)
    const { error } = await supabase
      .from('properties')
      .update(payload)
      .eq(primaryKeyColumn, editingRowId)
    if (error) {
      setActionError(error.message || 'Failed to update row')
      return
    }
    setEditingRowId(null)
    setEditForm({})
    refetch()
  }

  const handleDelete = async (row: Record<string, unknown>) => {
    const key = getRowKey(row)
    if (key == null) return
    if (!confirm('Delete this row?')) return
    setActionError(null)
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq(primaryKeyColumn, key)
    if (error) {
      setActionError(error.message || 'Failed to delete row')
      return
    }
    refetch()
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
      <main className="max-w-[100vw] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-semibold text-gray-800 mb-4">Properties</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
          </div>
        ) : (
          <>
            {fetchError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {fetchError}
              </div>
            )}
            {actionError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {actionError}
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">HMS ID</span>
                <input
                  type="text"
                  value={filterHmsId}
                  onChange={(e) => setFilterHmsId(e.target.value)}
                  placeholder="Filter by HMS ID"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Hotel name</span>
                <input
                  type="text"
                  value={filterHotelName}
                  onChange={(e) => setFilterHotelName(e.target.value)}
                  placeholder="Filter by hotel name"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setAppliedHmsId(filterHmsId.trim())
                  setAppliedHotelName(filterHotelName.trim())
                  setPage(1)
                }}
                className="px-4 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
              >
                Filter
              </button>
              {(appliedHmsId || appliedHotelName) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterHmsId('')
                    setFilterHotelName('')
                    setAppliedHmsId('')
                    setAppliedHotelName('')
                    setPage(1)
                  }}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="mb-4 flex items-center gap-4 flex-wrap">
              <p className="text-sm text-gray-600">
                {totalCount.toLocaleString()} row{totalCount !== 1 ? 's' : ''}
                {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true)
                  setActionError(null)
                  setAddForm(
                    Object.fromEntries(editableColumns.map((c) => [c, '']))
                  )
                }}
                className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
              >
                Add row
              </button>
            </div>
            {showAddForm && editableColumns.length > 0 && (
              <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">New property</h2>
                <div className="flex flex-wrap gap-4 items-end">
                  {editableColumns.map((col) =>
                    isTextColumn(col) ? (
                      <label key={col} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-gray-600">{col}</span>
                        <input
                          type="text"
                          value={addForm[col] ?? ''}
                          onChange={(e) =>
                            setAddForm((f) => ({ ...f, [col]: e.target.value }))
                          }
                          className="rounded border border-gray-300 px-2 py-1.5 text-sm w-40"
                        />
                      </label>
                    ) : (
                      <label key={col} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-gray-600">{col}</span>
                        <select
                          value={addForm[col] ?? ''}
                          onChange={(e) =>
                            setAddForm((f) => ({ ...f, [col]: e.target.value }))
                          }
                          className="rounded border border-gray-300 px-2 py-1.5 text-sm w-32"
                        >
                          <option value="">—</option>
                          {DROPDOWN_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAdd}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false)
                        setAddForm({})
                        setActionError(null)
                      }}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-auto max-h-[calc(100vh-12rem)]">
              <table className="w-full border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                    {columns.map((col) => (
                      <th key={col} className="text-left text-sm font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50">
                        {col}
                      </th>
                    ))}
                    <th className="text-left text-sm font-semibold text-gray-700 px-3 py-2 whitespace-nowrap bg-gray-50 sticky top-0 z-10">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={(columns.length || 1) + 1} className="px-3 py-4 text-sm text-gray-500">
                        {totalCount === 0 && !fetchError
                          ? 'No rows. Run the SQL in supabase-properties-table.sql, then import your sheet data into the properties table. If you already have data in Supabase but still see this, add the RLS policies (see the same SQL file).'
                          : 'No rows on this page.'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const rowKey = getRowKey(row)
                      const isEditing =
                        rowKey != null &&
                        editingRowId != null &&
                        String(rowKey) === String(editingRowId)
                      return (
                        <tr
                          key={(row.hms_id ?? row.id ?? idx) as React.Key}
                          className={`border-b border-gray-100 ${isEditing ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                        >
                          {isEditing ? (
                            <>
                              {columns.map((col) => (
                                <td key={col} className="px-2 py-1 align-middle">
                                  {col === 'id' || col === 'created_at' ? (
                                    <span className="text-sm text-gray-500">
                                      {displayValue(row[col])}
                                    </span>
                                  ) : isTextColumn(col) ? (
                                    <input
                                      type="text"
                                      value={editForm[col] ?? ''}
                                      onChange={(e) =>
                                        setEditForm((f) => ({
                                          ...f,
                                          [col]: e.target.value,
                                        }))
                                      }
                                      className="w-full max-w-[180px] rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                  ) : (
                                    <select
                                      value={editForm[col] ?? ''}
                                      onChange={(e) =>
                                        setEditForm((f) => ({
                                          ...f,
                                          [col]: e.target.value,
                                        }))
                                      }
                                      className="rounded border border-gray-300 px-2 py-1 text-sm min-w-[100px]"
                                    >
                                      <option value="">—</option>
                                      {DROPDOWN_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              ))}
                              <td className="px-2 py-1 align-middle">
                                <button
                                  type="button"
                                  onClick={handleEditSave}
                                  className="mr-2 px-2 py-1 rounded bg-orange-500 text-white text-xs font-medium hover:bg-orange-600"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRowId(null)
                                    setEditForm({})
                                    setActionError(null)
                                  }}
                                  className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              {columns.map((col) => (
                                <td
                                  key={col}
                                  className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap max-w-[200px] truncate"
                                  title={displayValue(row[col])}
                                >
                                  {displayValue(row[col])}
                                </td>
                              ))}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRowId(rowKey)
                                    setActionError(null)
                                    setEditForm(
                                      Object.fromEntries(
                                        editableColumns
                                          .map((c) => [
                                            c,
                                            displayValue(row[c]),
                                          ])
                                      )
                                    )
                                  }}
                                  className="mr-2 px-2 py-1 rounded text-xs font-medium text-blue-700 hover:bg-blue-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row)}
                                  className="px-2 py-1 rounded text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
