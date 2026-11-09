// The Comatype logo, from the SVG files in assets/logo (copied to public/logo). The light and dark variants are
// both rendered and switched with CSS, because the theme is the `dark` class on <html>.
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function Logo({ height = 26 }: { height?: number }) {
  const width = Math.round((height * 749) / 136)
  return (
    <>
      <img className="logo-img light-only" src={`${base}/logo/logo-horizontal.svg`} alt="Comatype" width={width} height={height} />
      <img className="logo-img dark-only" src={`${base}/logo/logo-horizontal-dark.svg`} alt="" aria-hidden width={width} height={height} />
    </>
  )
}
