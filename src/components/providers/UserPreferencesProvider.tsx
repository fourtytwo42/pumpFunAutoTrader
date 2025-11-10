'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const STORAGE_KEY = 'userPreferences'

export type DisplayDensity = 'comfortable' | 'cozy' | 'compact'
export type DashboardLayoutMode = 'grid' | 'list'

export interface UserPreferences {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  highlightColor: string
  displayDensity: DisplayDensity
  dashboardLayout: DashboardLayoutMode
  showAdvancedAiStats: boolean
  enableTradeNotifications: boolean
  enableSoundEffects: boolean
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  primaryColor: '#00ff88',
  secondaryColor: '#ff4444',
  backgroundColor: '#0a0a0a',
  highlightColor: '#2b2b2b',
  displayDensity: 'comfortable',
  dashboardLayout: 'grid',
  showAdvancedAiStats: true,
  enableTradeNotifications: true,
  enableSoundEffects: false,
}

interface UserPreferencesContextValue {
  preferences: UserPreferences
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
  resetPreferences: () => void
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null)

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
        })
      }
    } catch (error) {
      console.warn('[preferences] Failed to parse stored preferences', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch (error) {
      console.warn('[preferences] Failed to persist preferences', error)
    }
  }, [preferences])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.documentElement
    root.style.setProperty('--app-primary', preferences.primaryColor)
    root.style.setProperty('--app-secondary', preferences.secondaryColor)
    root.style.setProperty('--app-surface', preferences.backgroundColor)
    root.style.setProperty('--app-highlight', preferences.highlightColor)
    root.dataset.density = preferences.displayDensity
    root.dataset.dashboardLayout = preferences.dashboardLayout
  }, [preferences])

  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences((prev) => ({
        ...prev,
        [key]: value,
      }))
    },
    []
  )

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES)
  }, [])

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      updatePreference,
      resetPreferences,
    }),
    [preferences, updatePreference, resetPreferences]
  )

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}


