# Neso CRM – design notes

Mode: **Operate** (an app people work in all day). The skin lives in `web/src/neso.css` (loaded after `styles.css` and
`theme/theme.css`) plus the default theme palette in `web/src/theme/themes.ts` (`gohigh` = "Neso"). Upstream component
markup is untouched, so upstream updates merge cleanly.

- **Type:** Inter Variable (self-hosted, `@fontsource-variable/inter`), one family for everything; 14 px base, 1.5 line
  height; h1 22/650, h2 16/620, h3 14.5/600; tabular figures in tables, stats and money.
- **Colour:** Neso blue `#0a6cf0` for actions, selection and focus only (brand logo blue is `#017bff`; the UI uses the
  slightly deeper tone so white text on buttons passes 4.5:1). Calm neutral ground `#f5f6f8`, white panels, ink sidebar
  `#0a1020`. Dark mode: `#0b0f17` / `#111723`, accent `#3d8eff`. Status colours unchanged.
- **Depth:** hairlines (`--hair`, text at 9 %) plus soft offset shadows (`--shadow-xs … -lg`); no heavy borders, no
  coloured side bars on cards, rows or callouts; department colour shows on the sidebar icon.
- **Controls:** 34 px high, 8 px radius, a 3 px Neso-blue focus ring; buttons press to `scale(.97)`.
- **Motion:** 120–220 ms, custom ease-out `cubic-bezier(.23,1,.32,1)`; only overlays animate in (modal, toast,
  search results), from 0.97 scale, never from zero; nothing animates on keyboard actions; respects reduced motion.
- **Mark:** white geometric "N" on a Neso-blue rounded square (`web/public/icon.svg`).
