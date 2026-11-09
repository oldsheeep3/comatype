'use client'

import { usePathname } from 'next/navigation'
// State for the two mobile drawers: the doc sidebar (from the left) and the site menu (from the right).
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useUi } from './useLocale'

interface ShellState {
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  navOpen: boolean
  setNavOpen: (open: boolean) => void
}

const noop = () => {}
const ShellContext = createContext<ShellState>({ menuOpen: false, setMenuOpen: noop, navOpen: false, setNavOpen: noop })

export function ShellProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()
  // Close both drawers when the page changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger
  useEffect(() => {
    setMenuOpen(false)
    setNavOpen(false)
  }, [pathname])
  // Escape closes them
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return <ShellContext.Provider value={{ menuOpen, setMenuOpen, navOpen, setNavOpen }}>{children}</ShellContext.Provider>
}

export const useShell = () => useContext(ShellContext)

const bars = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M3.5 6h15M3.5 11h15M3.5 16h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Hamburger on the left: opens the doc sidebar (docs pages, mobile only). */
export function MenuButton() {
  const { menuOpen, setMenuOpen } = useShell()
  const text = useUi()
  return (
    <button
      type="button"
      className="icon-button menu-button menu-left"
      aria-label={text.menu}
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen(!menuOpen)}
    >
      {bars}
    </button>
  )
}

/** Hamburger on the right: opens the site menu (landing page and playground, mobile only). */
export function NavButton() {
  const { navOpen, setNavOpen } = useShell()
  const text = useUi()
  return (
    <button
      type="button"
      className="icon-button menu-button menu-right"
      aria-label={text.menu}
      aria-expanded={navOpen}
      aria-controls="site-menu"
      onClick={() => setNavOpen(!navOpen)}
    >
      {bars}
    </button>
  )
}
