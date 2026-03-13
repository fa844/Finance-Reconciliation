/**
 * Persist filter (and sort for data page) preferences per user per page in localStorage.
 * Key: filter_prefs_${userId}_${pageId}
 */

export type FilterPrefsPageId = 'data' | 'history' | 'dashboard'

export interface DataPageFilterPrefs {
  filters?: Record<string, string>
  multiSelectFilters?: Record<string, string[]>
  dateRangeFilters?: Record<string, { from: string; to: string }>
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
}

export interface HistoryPageFilterPrefs {
  filters?: Record<string, string>
  multiSelectFilters?: Record<string, string[]>
  dateRangeFilters?: Record<string, { from: string; to: string }>
}

export interface DashboardFilterPrefs {
  filterCountry?: string[]
  filterChannel?: string[]
  filterCurrency?: string[]
  filterStatus?: string[]
  dateFrom?: string
  dateTo?: string
}

function storageKey(userId: string, pageId: FilterPrefsPageId): string {
  return `filter_prefs_${userId}_${pageId}`
}

export function getSavedFilterPrefs<T>(
  userId: string,
  pageId: FilterPrefsPageId
): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(userId, pageId))
    if (raw == null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveFilterPrefs(
  userId: string,
  pageId: FilterPrefsPageId,
  state: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(userId, pageId), JSON.stringify(state))
  } catch {
    // ignore quota or other errors
  }
}
