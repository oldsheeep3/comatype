'use client'

// State for opening and closing the sidebar on mobile (shared by the header button and the sidebar)
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useUi } from './useLocale'

interface ShellState {
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
}

const ShellContext = createContext<ShellState>({ menuOpen: false, setMenuOpen: () => {} })

export function ShellProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  // Close it when the page changes
  useEffect(() => setMenuOpen(false), [pathname])
  return <ShellContext.Provider value={{ menuOpen, setMenuOpen }}>{children}</ShellContext.Provider>
}

export const useShell = () => useContext(ShellContext)

export function MenuButton() {
  const { menuOpen, setMenuOpen } = useShell()
  const text = useUi()
  return (
    <button type="button" className="icon-button menu-button" aria-label={text.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
      <span aria-hidden>☰</span>
    </button>
  )
}
