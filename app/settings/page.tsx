'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHeaderRight } from '@/app/contexts/HeaderRightContext'

// Currencies from currency table (country + code + optional stored rate). SGD row is excluded for display.
interface CurrencyRow {
  country: string
  currency_code: string
  rate_to_sgd?: number | null
}

function getYesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getEffectiveDateForRates(referenceDate: string): string {
  const trimmed = referenceDate.trim()
  if (!trimmed) return getYesterdayISO()
  const today = new Date().toISOString().slice(0, 10)
  if (trimmed > today) return getYesterdayISO()
  return trimmed
}

export default function SettingsPage() {
  const [session, setSession] = useState<any>(null)
  const [referenceDate, setReferenceDate] = useState<string>('')
  const [referenceDateAudit, setReferenceDateAudit] = useState<{
    updated_at: string | null
    updated_by_email: string | null
    previous: string | null
  }>({ updated_at: null, updated_by_email: null, previous: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<'saved' | 'error' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([])
  const [ratesToSgd, setRatesToSgd] = useState<Record<string, number | null>>({})
  const [loadingRates, setLoadingRates] = useState(false)
  const router = useRouter()
  const { setRightContent } = useHeaderRight()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        fetchReferenceDate()
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

  const fetchReferenceDate = async () => {
    setLoading(true)
    setSaveMessage(null)
    setErrorMessage('')
    const { data, error } = await supabase
      .from('app_settings')
      .select('reference_date, reference_date_updated_at, reference_date_updated_by_email, reference_date_previous')
      .eq('id', 1)
      .single()

    if (error) {
      console.error('Error fetching reference date:', error)
      setErrorMessage(error.message)
    } else {
      const d = data?.reference_date
      setReferenceDate(d != null ? (typeof d === 'string' ? d.slice(0, 10) : '') : '')
      const rawUpdatedAt = data?.reference_date_updated_at
      const rawPrevious = data?.reference_date_previous
      setReferenceDateAudit({
        updated_at: rawUpdatedAt != null ? (typeof rawUpdatedAt === 'string' ? rawUpdatedAt : (rawUpdatedAt as Date)?.toISOString?.()) : null,
        updated_by_email: data?.reference_date_updated_by_email ?? null,
        previous: rawPrevious != null ? (typeof rawPrevious === 'string' ? rawPrevious.slice(0, 10) : (rawPrevious as Date)?.toISOString?.()?.slice(0, 10) ?? null) : null,
      })
    }
    setLoading(false)
  }

  const fetchCurrencies = useCallback(async () => {
    const { data, error } = await supabase
      .from('currency')
      .select('country, currency_code, rate_to_sgd')
      .order('currency_code')
    if (error) {
      console.error('Error fetching currencies:', error)
      return
    }
    const rows = (data ?? []) as CurrencyRow[]
    const nonSgd = rows.filter((r) => (r.currency_code ?? '').toUpperCase() !== 'SGD')
    setCurrencies(nonSgd)
    const stored: Record<string, number | null> = {}
    nonSgd.forEach((r) => {
      const code = (r.currency_code ?? '').trim().toUpperCase()
      if (code) stored[code] = r.rate_to_sgd != null && Number.isFinite(Number(r.rate_to_sgd)) ? Number(r.rate_to_sgd) : null
    })
    setRatesToSgd(stored)
  }, [])

  const fetchRatesForDate = useCallback(async (dateStr: string) => {
    if (currencies.length === 0) return
    setLoadingRates(true)
    const updates: Record<string, number> = {}
    for (const row of currencies) {
      const code = (row.currency_code ?? '').trim().toUpperCase()
      if (!code) continue
      try {
        const res = await fetch(
          `https://api.frankfurter.app/${dateStr}?from=SGD&to=${code}`
        )
        const json = await res.json()
        const rate = json?.rates?.[code]
        if (typeof rate === 'number' && Number.isFinite(rate)) {
          updates[code] = rate
        }
      } catch {
        // Keep existing rate
      }
    }
    setRatesToSgd((prev) => ({ ...prev, ...updates }))
    for (const [code, rate] of Object.entries(updates)) {
      await supabase.from('currency').update({ rate_to_sgd: rate }).eq('currency_code', code)
    }
    setLoadingRates(false)
  }, [currencies])

  const effectiveDate = getEffectiveDateForRates(referenceDate)

  useEffect(() => {
    if (!session) return
    fetchCurrencies()
  }, [session, fetchCurrencies])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    setErrorMessage('')

    const dateValue = referenceDate.trim() || null
    const payload: Record<string, unknown> = { reference_date: dateValue }
    if (session?.user?.email) {
      payload.reference_date_updated_by_email = session.user.email
    }

    const { error } = await supabase
      .from('app_settings')
      .update(payload)
      .eq('id', 1)

    if (error) {
      setSaveMessage('error')
      setErrorMessage(error.message)
    } else {
      setSaveMessage('saved')
      setTimeout(() => setSaveMessage(null), 3000)
      fetchReferenceDate()
      fetchRatesForDate(getEffectiveDateForRates(dateValue ?? ''))
    }
    setSaving(false)
  }

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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Checking login…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-xl p-8 border-t-4 border-orange-500">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label htmlFor="reference-date" className="block text-sm font-medium text-gray-700 mb-2">
                  Reference Date
                </label>
                <input
                  id="reference-date"
                  type="date"
                  value={referenceDate}
                  onChange={(e) => setReferenceDate(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  This date is shared by all users. Changing it here updates it for everyone.
                </p>
                {referenceDateAudit.updated_at != null && (
                  <p className="mt-2 text-xs text-gray-600">
                    Last changed
                    {referenceDateAudit.updated_by_email ? ` by ${referenceDateAudit.updated_by_email}` : ''}
                    {' on '}
                    {new Date(referenceDateAudit.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    {referenceDateAudit.previous != null ? `, from ${referenceDateAudit.previous} to ${referenceDate || '—'}` : ''}
                    .
                  </p>
                )}
              </div>

              {saveMessage === 'saved' && (
                <p className="text-green-600 font-medium">Saved.</p>
              )}
              {saveMessage === 'error' && errorMessage && (
                <p className="text-red-600">Error: {errorMessage}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          )}

          {!loading && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">1 SGD =</h2>
              <p className="text-xs text-gray-500 mb-3">
                As of {effectiveDate}. {effectiveDate === getYesterdayISO() && (
                  !referenceDate.trim()
                    ? 'Using yesterday’s date (no reference date set).'
                    : 'Using yesterday’s date (reference date is in the future).'
                )}
              </p>
              {loadingRates ? (
                <p className="text-gray-500">Loading rates…</p>
              ) : currencies.length === 0 ? (
                <p className="text-gray-500">No currencies to show.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-4 font-medium text-gray-700">Currency</th>
                        <th className="text-right py-2 font-medium text-gray-700">1 SGD =</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currencies.map((row) => {
                        const code = (row.currency_code ?? '').trim().toUpperCase()
                        const rate = ratesToSgd[code]
                        const label = `${code} (${row.country ?? ''})`
                        const isLak = code === 'LAK'
                        return (
                          <tr key={code} className="border-b border-gray-100">
                            <td className="py-2 pr-4 text-gray-800">{label}</td>
                            <td
                              className={`py-2 text-right ${isLak ? 'text-red-600' : 'text-gray-700'}`}
                              title={isLak ? 'This exchange rate does not change. Ask admin to change manually.' : undefined}
                            >
                              {rate != null ? `${rate.toFixed(2)} ${code}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
