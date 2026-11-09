# Comatype logo

A `C` ring whose top stroke continues into the bar of a `T`.

| File | Use |
|---|---|
| `logo-icon.svg`, `png/logo-icon-*.png` | Square app icon: white mark on an indigo rounded square. VS Code extension, package pages, favicons |
| `logo-mark.svg`, `png/logo-mark-512.png` | The mark alone (indigo `#4f46e5`) for light backgrounds |
| `logo-mark-dark.svg`, `png/logo-mark-dark-512.png` | The mark alone (`#818cf8`) for dark backgrounds |
| `logo-horizontal.svg`, `png/logo-horizontal-1200.png` | Mark + "Comatype" for light backgrounds (README headers) |
| `logo-horizontal-dark.svg`, `png/logo-horizontal-dark-1200.png` | Mark + "Comatype" for dark backgrounds |

The wordmark is converted to outlines (Inter SemiBold, SIL Open Font License), so it needs no font. `build.py` regenerates the SVG files.

In a README, switch with the color scheme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal-dark.svg">
  <img alt="Comatype" src="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal.svg" height="64">
</picture>
```

Use absolute URLs in package READMEs: npm, PyPI, crates.io and RubyGems do not serve repository files.
