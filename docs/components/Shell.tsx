'use client'

import { usePathname } from 'next/navigation'
// State for opening and closing the sidebar on mobile (shared by the header button and the sidebar)
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useUi } from './useLocale'

interface ShellState {
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
}

const ShellContext = createContext<ShellState>({ menuOpen: false, setMenuOpen: () => {} })

export function ShellProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const _pathname = usePathname()
  // Close it when the page changes
  useEffect(() => setMenuOpen(false), [])
  return <ShellContext.Provider value={{ menuOpen, setMenuOpen }}>{children}</ShellContext.Provider>
}

export const useShell = () => useContext(ShellContext)

export function MenuButton() {
  const { menuOpen, setMenuOpen } = useShell()
  const text = useUi()
  return (
    <button
      type="button"
      className="icon-button menu-button"
      aria-label={text.menu}
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen(!menuOpen)}
    >
      <span aria-hidden>☰</span>
    </button>
  )
}
