'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type HeaderRightContextValue = {
  rightContent: ReactNode
  setRightContent: (node: ReactNode) => void
}

const HeaderRightContext = createContext<HeaderRightContextValue | null>(null)

export function HeaderRightProvider({ children }: { children: ReactNode }) {
  const [rightContent, setRightContent] = useState<ReactNode>(null)
  return (
    <HeaderRightContext.Provider value={{ rightContent, setRightContent }}>
      {children}
    </HeaderRightContext.Provider>
  )
}

export function useHeaderRight() {
  const ctx = useContext(HeaderRightContext)
  if (!ctx) return { rightContent: null, setRightContent: () => {} }
  return ctx
}
