'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        router.push('/data')
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        router.push('/data')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to bookings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8 border-t-4 border-orange-500">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-orange-700 bg-clip-text text-transparent">
              OTA Receivables and Payables
            </h1>
          </div>
          <div className="space-y-4">
            <Link
              href="/login"
              className="w-full block text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="w-full block text-center bg-white hover:bg-orange-50 text-orange-500 font-semibold py-3 px-4 rounded-lg border-2 border-orange-500 transition duration-200"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
