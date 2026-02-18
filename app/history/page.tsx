'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'

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
  amount_received: 'Amount Received',
  total_amount_received: 'Total Amount Received',
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
  'total_amount_received'
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

function computeFormulaColumns(row: Record<string, unknown>): { balance: number | null; reconciled_amount_check: number | null } {
  const parseNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  const netAmount = parseNum(row?.net_amount_by_zuzu)
  const totalSubmitted = parseNum(row?.total_amount_submitted)
  const totalReceived = parseNum(row?.total_amount_received)
  const balance = (netAmount != null && totalSubmitted != null) ? netAmount - totalSubmitted : null
  const reconciled_amount_check = (totalSubmitted != null && totalReceived != null) ? totalSubmitted - totalReceived : null
  return { balance, reconciled_amount_check }
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

export default function HistoryOfEditsPage() {
  const [session, setSession] = useState<any>(null)
  const [edits, setEdits] = useState<EditHistoryRow[]>([])
  const [totalEditCount, setTotalEditCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [undoingId, setUndoingId] = useState<number | null>(null)
  const router = useRouter()
  const { setRightContent } = useHeaderRight()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        fetchEdits()
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

  const fetchEdits = async (
    showLoading = true,
    append = false,
    refreshLength?: number
  ) => {
    if (append) {
      setLoadingMore(true)
    } else if (showLoading) {
      setLoading(true)
    }

    const baseQuery = () =>
      supabase
        .from('edit_history')
        .select('*')
        .order('edited_at', { ascending: false })

    try {
      if (refreshLength != null && refreshLength > 0) {
        // Refresh current window after undo
        const { data, error } = await baseQuery().range(0, refreshLength - 1)
        if (error) {
          console.error('Error refreshing edit history:', error)
        } else {
          setEdits((data as EditHistoryRow[]) || [])
        }
      } else if (append) {
        const from = edits.length
        const to = from + EDITS_PAGE_SIZE - 1
        const { data, error } = await baseQuery().range(from, to)
        if (error) {
          console.error('Error loading more edits:', error)
          alert(`Error loading more: ${error.message}`)
        } else {
          setEdits(prev => [...prev, ...((data as EditHistoryRow[]) || [])])
        }
      } else {
        const { count } = await supabase
          .from('edit_history')
          .select('*', { count: 'exact', head: true })
        setTotalEditCount(count ?? 0)

        const { data, error } = await baseQuery().range(0, EDITS_PAGE_SIZE - 1)
        if (error) {
          console.error('Error fetching edit history:', error)
          alert(`Error loading edit history: ${error.message}`)
        } else {
          setEdits((data as EditHistoryRow[]) || [])
        }
      }
    } finally {
      if (append) setLoadingMore(false)
      if (showLoading) setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleUndo = async (edit: EditHistoryRow) => {
    setUndoingId(edit.id)
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from(edit.table_name)
        .select('*')
        .eq('id', edit.row_id)
        .single()

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
        const { balance, reconciled_amount_check } = computeFormulaColumns(updatedRow)
        updatePayload.balance = balance
        updatePayload.reconciled_amount_check = reconciled_amount_check
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
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-180px)] min-w-0">
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
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={edit.old_value ?? ''}>
                        {edit.old_value === '' || edit.old_value == null ? (
                          <span className="text-gray-400 italic">empty</span>
                        ) : (
                          edit.old_value
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate font-medium" title={edit.new_value ?? ''}>
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
                Showing {edits.length} of {totalEditCount} edit{totalEditCount !== 1 ? 's' : ''} (most recent first).
              </p>
              {edits.length < totalEditCount && (
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
