'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-lg shadow-xl p-8 border-t-4 border-orange-500">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-6">
          An error occurred. Try again or go back home.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 bg-white border-2 border-orange-500 text-orange-500 hover:bg-orange-50 font-semibold rounded-lg transition text-center"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  )
}
