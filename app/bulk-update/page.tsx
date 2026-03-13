'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'

const EDITABLE_COLUMNS = [
  { value: 'payment_request_date', label: 'Payment Request Date' },
  { value: 'total_amount_submitted', label: 'Total Amount Submitted' },
  { value: 'amount_received', label: 'Amount Received' },
  { value: 'payment_gateway_fees', label: 'Payment Gateway Fees' },
  { value: 'tax_amount_deducted', label: 'Tax Amount Deducted' },
  { value: 'total_amount_received', label: 'Total Amount Received' },
  { value: 'total_payment_gateway_fees', label: 'TOTAL Payment Gateway Fees' },
  { value: 'payment_date', label: 'Payment Date' },
  { value: 'payment_method', label: 'Payment Method' },
  { value: 'transmission_queue_id', label: 'Transmission Queue ID' },
  { value: 'reference_number', label: 'Reference Number' },
  { value: 'vcc_number', label: 'VCC Number' },
  { value: 'expiry_date', label: 'Expiry Date' },
  { value: 'cvc', label: 'CVC' },
  { value: 'remarks', label: 'Remarks' },
  { value: 'net_of_demand_commission_amount_extranet', label: 'Net (of channel commission) amount (Extranet)' },
] as const

const DATE_COLUMNS = ['payment_request_date', 'payment_date']

type UpdateResult = {
  confirmationNumber: string
  status: 'success' | 'not_found' | 'error'
  message: string
  matchCount?: number
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function safeNum(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function normalizeDateForDb(value: any): string | null {
  if (value == null || value === '') return null
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return s.slice(0, 10)
  const n = Number(value)
  if (!Number.isNaN(n) && n > 0) {
    const date = new Date((n - 25569) * 86400 * 1000)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

function computeFormulaColumns(row: any) {
  const netAmount = parseNum(row?.net_amount_by_zuzu)
  const amountReceived = parseNum(row?.amount_received) ?? 0
  const paymentGatewayFees = parseNum(row?.payment_gateway_fees) ?? 0
  const taxAmountDeducted = parseNum(row?.tax_amount_deducted) ?? 0
  const totalSubmitted = parseNum(row?.total_amount_submitted)
  const totalReceived = parseNum(row?.total_amount_received)
  const totalPaymentGatewayFees = parseNum(row?.total_payment_gateway_fees)
  const balance = netAmount != null ? netAmount - amountReceived - paymentGatewayFees - taxAmountDeducted : null
  const reconciled_amount_check = (totalSubmitted != null && totalReceived != null && totalPaymentGatewayFees != null)
    ? totalSubmitted - totalReceived - totalPaymentGatewayFees
    : null
  return { balance, reconciled_amount_check }
}

export default function BulkUpdatePage() {
  const [session, setSession] = useState<any>(null)
  const [rawText, setRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<string[][]>([])
  const [columnMappings, setColumnMappings] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)
  const [results, setResults] = useState<UpdateResult[] | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const router = useRouter()
  const { setRightContent } = useHeaderRight()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (!session?.user) {
      setRightContent(null)
      return
    }
    setRightContent(
      <span className="shrink-0 inline-flex items-center text-sm text-gray-600 whitespace-nowrap h-[38px]">
        {session.user?.email}
      </span>
    )
    return () => setRightContent(null)
  }, [session, setRightContent])

  const handleTextChange = (text: string) => {
    setRawText(text)
    setResults(null)
    setProgress(null)

    if (!text.trim()) {
      setParsedRows([])
      setColumnMappings([])
      return
    }

    const lines = text.trim().split('\n').filter(line => line.trim())
    const rows = lines.map(line => line.split('\t').map(cell => cell.trim()))

    const maxCols = Math.max(...rows.map(r => r.length))
    const normalizedRows = rows.map(r =>
      r.length < maxCols ? [...r, ...new Array(maxCols - r.length).fill('')] : r
    )

    setParsedRows(normalizedRows)

    const extraCols = maxCols > 1 ? maxCols - 1 : 0
    setColumnMappings(prev => {
      const newMappings = new Array(extraCols).fill('')
      for (let i = 0; i < Math.min(prev.length, extraCols); i++) {
        newMappings[i] = prev[i]
      }
      return newMappings
    })
  }

  const handleMappingChange = (colIndex: number, value: string) => {
    setColumnMappings(prev => {
      const next = [...prev]
      next[colIndex] = value
      return next
    })
  }

  const getAvailableOptions = (currentIndex: number) => {
    const selectedByOthers = new Set(
      columnMappings.filter((m, i) => i !== currentIndex && m)
    )
    return EDITABLE_COLUMNS.filter(col => !selectedByOthers.has(col.value))
  }

  const allColumnsMapped = columnMappings.length > 0 && columnMappings.every(m => m !== '')

  const selected = columnMappings.filter(m => m)
  const hasDuplicateMappings = new Set(selected).size !== selected.length

  const handleUpdate = async () => {
    if (!parsedRows.length || !allColumnsMapped || hasDuplicateMappings) return

    setUpdating(true)
    setResults(null)
    const updateResults: UpdateResult[] = []
    setProgress({ current: 0, total: parsedRows.length })

    const editedBy = session?.user?.email ?? 'Unknown'

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i]
      const confirmationNumber = row[0]
      setProgress({ current: i + 1, total: parsedRows.length })

      if (!confirmationNumber) {
        updateResults.push({
          confirmationNumber: `(empty, row ${i + 1})`,
          status: 'error',
          message: 'Empty confirmation number',
        })
        continue
      }

      try {
        const { data: matchingBookings, error: fetchError } = await supabase
          .from('bookings')
          .select('*')
          .eq('channel_booking_confirmation_number', confirmationNumber)

        if (fetchError) {
          updateResults.push({
            confirmationNumber,
            status: 'error',
            message: fetchError.message,
          })
          continue
        }

        if (!matchingBookings || matchingBookings.length === 0) {
          updateResults.push({
            confirmationNumber,
            status: 'not_found',
            message: 'No booking found with this confirmation number',
          })
          continue
        }

        let allSucceeded = true
        let errorMsg = ''

        for (const booking of matchingBookings) {
          const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          }

          for (let c = 0; c < columnMappings.length; c++) {
            const dbColumn = columnMappings[c]
            let cellValue: string | null = row[c + 1] ?? null

            if (cellValue !== null && cellValue.trim() === '') {
              cellValue = null
            }

            if (DATE_COLUMNS.includes(dbColumn) && cellValue != null) {
              cellValue = normalizeDateForDb(cellValue)
            }

            updateData[dbColumn] = cellValue
          }

          const updatedRow = { ...booking, ...updateData }
          const computed = computeFormulaColumns(updatedRow)

          const bal = safeNum(computed.balance)
          if (bal !== null) updateData.balance = bal
          const recon = safeNum(computed.reconciled_amount_check)
          if (recon !== null) updateData.reconciled_amount_check = recon

          const { error: updateError } = await supabase
            .from('bookings')
            .update(updateData)
            .eq('id', booking.id)

          if (updateError) {
            allSucceeded = false
            errorMsg = updateError.message
          } else {
            const historyRecords = []
            for (let c = 0; c < columnMappings.length; c++) {
              const dbColumn = columnMappings[c]
              const oldVal = booking[dbColumn]
              const newVal = updateData[dbColumn]
              const oldStr = oldVal == null ? '' : String(oldVal)
              const newStr = newVal == null ? '' : String(newVal)
              if (oldStr !== newStr) {
                historyRecords.push({
                  table_name: 'bookings',
                  row_id: booking.id,
                  column_name: dbColumn,
                  old_value: oldStr || null,
                  new_value: newStr || null,
                  edited_by: editedBy,
                  row_display: `Confirmation #${booking.zuzu_room_confirmation_number ?? booking.id}`,
                })
              }
            }
            if (historyRecords.length > 0) {
              await supabase.from('edit_history').insert(historyRecords)
            }
          }
        }

        if (allSucceeded) {
          updateResults.push({
            confirmationNumber,
            status: 'success',
            message: `Updated ${matchingBookings.length} booking(s)`,
            matchCount: matchingBookings.length,
          })
        } else {
          updateResults.push({
            confirmationNumber,
            status: 'error',
            message: errorMsg,
          })
        }
      } catch (err: any) {
        updateResults.push({
          confirmationNumber,
          status: 'error',
          message: err.message ?? 'Unknown error',
        })
      }
    }

    setResults(updateResults)
    setUpdating(false)
    setProgress(null)
  }

  const successCount = results?.filter(r => r.status === 'success').length ?? 0
  const notFoundCount = results?.filter(r => r.status === 'not_found').length ?? 0
  const errorCount = results?.filter(r => r.status === 'error').length ?? 0

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg border-t-4 border-orange-500 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Bulk Update Bookings</h1>
          <p className="text-sm text-gray-500 mb-6">
            Paste data from Excel to update multiple bookings at once by channel booking confirmation number.
          </p>

          {/* Step 1: Paste */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              1. Paste your data below
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Copy a range from Excel and paste it here. The first column must be the channel booking confirmation number.
              Additional columns will be mapped to booking fields.
            </p>
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={"1128146213521628\t45\t678\n6193382321\t23\t566\n1359042529119214\t4\t345"}
              className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y"
              disabled={updating}
            />
          </div>

          {/* Step 2: Column Mapping */}
          {parsedRows.length > 0 && columnMappings.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                2. Map each column to a booking field
              </label>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-gray-500 mb-1">Column 1</span>
                  <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium whitespace-nowrap">
                    Channel Booking Confirmation #
                  </div>
                </div>
                {columnMappings.map((mapping, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span className="text-xs font-medium text-gray-500 mb-1">Column {idx + 2}</span>
                    <select
                      value={mapping}
                      onChange={(e) => handleMappingChange(idx, e.target.value)}
                      className={`px-3 py-2 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        mapping ? 'border-green-400 bg-green-50 text-green-800' : 'border-orange-300 bg-orange-50 text-gray-700'
                      }`}
                      disabled={updating}
                    >
                      <option value="">-- Select field --</option>
                      {getAvailableOptions(idx).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {hasDuplicateMappings && (
                <p className="mt-2 text-sm text-red-600 font-medium">
                  Each column must be mapped to a different field.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Preview Table */}
          {parsedRows.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                3. Preview ({parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''})
              </label>
              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">
                        #
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700 uppercase border-b bg-orange-50">
                        Confirmation #
                      </th>
                      {columnMappings.map((mapping, idx) => (
                        <th key={idx} className={`px-3 py-2 text-left text-xs font-medium uppercase border-b ${
                          mapping ? 'text-green-700 bg-green-50' : 'text-gray-400 bg-yellow-50'
                        }`}>
                          {mapping
                            ? EDITABLE_COLUMNS.find(c => c.value === mapping)?.label ?? mapping
                            : `(Column ${idx + 2})`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsedRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{rowIdx + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-900">{row[0]}</td>
                        {columnMappings.map((_, colIdx) => (
                          <td key={colIdx} className="px-3 py-1.5 text-gray-700">
                            {row[colIdx + 1] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Update Button */}
          {parsedRows.length > 0 && (
            <div className="mb-6 flex items-center gap-4">
              <button
                onClick={handleUpdate}
                disabled={updating || !allColumnsMapped || hasDuplicateMappings}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition duration-200 flex items-center gap-2"
              >
                {updating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update {parsedRows.length} Booking{parsedRows.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
              {progress && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-48 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <span>{progress.current} / {progress.total}</span>
                </div>
              )}
              {!allColumnsMapped && columnMappings.length > 0 && (
                <span className="text-sm text-orange-600 font-medium">
                  Please map all columns before updating.
                </span>
              )}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Results</h2>

              {/* Summary */}
              <div className="flex flex-wrap gap-3 mb-4">
                {successCount > 0 && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-semibold text-green-800">{successCount} updated</span>
                  </div>
                )}
                {notFoundCount > 0 && (
                  <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-sm font-semibold text-yellow-800">{notFoundCount} not found</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm font-semibold text-red-800">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              {/* Details Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">Confirmation #</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {results.map((result, idx) => (
                      <tr key={idx} className={
                        result.status === 'success' ? 'bg-green-50' :
                        result.status === 'not_found' ? 'bg-yellow-50' :
                        'bg-red-50'
                      }>
                        <td className="px-3 py-1.5 font-mono text-gray-900">{result.confirmationNumber}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            result.status === 'success' ? 'bg-green-100 text-green-800' :
                            result.status === 'not_found' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {result.status === 'success' ? 'Updated' :
                             result.status === 'not_found' ? 'Not Found' :
                             'Error'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-600">{result.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
