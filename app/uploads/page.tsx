'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface UploadHistory {
  id: number
  file_name: string
  sheet_name: string
  rows_uploaded: number
  uploaded_at: string
  uploaded_by: string
  arrival_date_min: string | null
  arrival_date_max: string | null
  booking_ids: number[]
  cancelled_at: string | null
  file_storage_path: string | null
}

export default function UploadsPage() {
  const [session, setSession] = useState<any>(null)
  const [uploads, setUploads] = useState<UploadHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
        fetchUploads()
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

  const fetchUploads = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('upload_history')
      .select('*')
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching uploads:', error)
      alert(`Error loading uploads: ${error.message}`)
    } else {
      setUploads(data || [])
    }
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDownloadFile = async (upload: UploadHistory) => {
    if (!upload.file_storage_path) {
      alert('This upload has no file saved. Only uploads after the download feature was added have the original Excel stored.')
      return
    }
    setDownloadingId(upload.id)
    try {
      const { data, error } = await supabase.storage
        .from('upload-files')
        .createSignedUrl(upload.file_storage_path, 3600) // 1 hour
      if (error) {
        alert(`Error getting download link: ${error.message}`)
        return
      }
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDeleteUpload = async (upload: UploadHistory) => {
    if (!confirm(
      `Are you sure you want to permanently delete this upload?\n\n` +
      `File: ${upload.file_name}\n` +
      `Sheet: ${upload.sheet_name}\n` +
      `Rows: ${upload.rows_uploaded}\n\n` +
      `This will permanently remove all ${upload.rows_uploaded} booking records from this upload and remove the upload from history. This cannot be undone.`
    )) {
      return
    }

    setDeletingId(upload.id)

    try {
      // Delete all bookings for this upload by upload_id
      const { error: deleteError } = await supabase
        .from('bookings')
        .delete()
        .eq('upload_id', upload.id)

      if (deleteError) {
        alert(`Error deleting bookings: ${deleteError.message}`)
        setDeletingId(null)
        return
      }

      // Permanently delete the upload_history row so it no longer appears in the list
      const { error: historyError } = await supabase
        .from('upload_history')
        .delete()
        .eq('id', upload.id)

      if (historyError) {
        alert(`Error removing upload from history: ${historyError.message}`)
      } else {
        alert(`✅ Upload and all associated bookings have been permanently removed.`)
        fetchUploads()
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    } catch (error) {
      return dateString
    }
  }

  const formatSimpleDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

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
      {/* Header */}
      <div className="bg-white shadow-md border-b-4 border-orange-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-orange-500 hover:text-orange-600"
                title="Dashboard"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button
                onClick={() => router.push('/data')}
                className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
              >
                Data
              </button>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-700 bg-clip-text text-transparent">Upload History</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{session.user.email}</span>
              <button
                onClick={handleSignOut}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading upload history...</p>
          </div>
        ) : uploads.length === 0 ? (
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Uploads Yet
            </h3>
            <p className="text-gray-600 mb-4">
              Upload your first Excel file to see the history here
            </p>
            <button
              onClick={() => router.push('/data')}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition duration-200"
            >
              Go to Data / Bookings
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-orange-500">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sheet
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rows
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Arrival Dates
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploads.map((upload) => {
                    const isCancelled = !!upload.cancelled_at
                    return (
                      <tr
                        key={upload.id}
                        className={isCancelled ? 'bg-gray-100 text-gray-500' : 'hover:bg-orange-50'}
                      >
                        <td className="px-6 py-4 text-center">
                          <div className={`text-sm font-mono font-semibold ${isCancelled ? 'text-gray-500' : 'text-gray-700'}`}>
                            #{upload.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm font-medium ${isCancelled ? 'text-gray-500' : 'text-gray-900'}`}>
                            {upload.file_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-900'}`}>{upload.sheet_name}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isCancelled ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-800'}`}>
                            {upload.rows_uploaded}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-900'}`}>{upload.uploaded_by}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-900'}`}>
                            {formatDate(upload.uploaded_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-900'}`}>
                            {upload.arrival_date_min && upload.arrival_date_max ? (
                              <>
                                {formatSimpleDate(upload.arrival_date_min)}
                                {' → '}
                                {formatSimpleDate(upload.arrival_date_max)}
                              </>
                            ) : (
                              'N/A'
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {upload.file_storage_path && (
                              <button
                                onClick={() => handleDownloadFile(upload)}
                                disabled={downloadingId === upload.id}
                                className="text-blue-600 hover:text-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                title="Download original Excel file"
                              >
                                {downloadingId === upload.id ? (
                                  'Opening...'
                                ) : (
                                  <>
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download
                                  </>
                                )}
                              </button>
                            )}
                            {isCancelled ? (
                              <div className="text-sm">
                                <span className="font-medium text-gray-500">Cancelled</span>
                                <span className="block text-xs text-gray-400">{formatDate(upload.cancelled_at!)}</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleDeleteUpload(upload)}
                                disabled={deletingId === upload.id}
                                className="text-red-600 hover:text-red-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deletingId === upload.id ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Total uploads: {uploads.length}
                {uploads.some((u) => u.cancelled_at) && (
                  <> ({uploads.filter((u) => !u.cancelled_at).length} active, {uploads.filter((u) => u.cancelled_at).length} cancelled)</>
                )}
                {' | '}
                Total rows imported: {uploads.filter((u) => !u.cancelled_at).reduce((sum, u) => sum + u.rows_uploaded, 0)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
