'use client'

import { useEffect } from 'react'

export default function DataError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Data page error:', error)
  }, [error])

  return (
    <div className="min-h-[200px] flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200 rounded-lg">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-md text-center">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
      >
        Try again
      </button>
    </div>
  )
}
