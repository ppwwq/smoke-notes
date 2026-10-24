# Amicro Diamond Grid

- Official source: https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2/registry/ui/loading/diamond-grid.tsx . Retrieved 2026-10-24; the default-branch implementation was also checked and has the same no-props named export.
- Copyright (c) 2026 SYED  SUBHAN UDDIN, MIT. Complete license: `packages/ui/src/components/diamond-grid/LICENSE`; shipped with both apps at `public/licenses/amicro-diamond-grid-MIT.txt`.
- Retains the official four cells, 45-degree grid, scale/opacity keyframes, 1.5-second cycle and 0.2-second stagger. Local adaptations: `motion/react` from existing Motion 12.23.12 instead of a duplicate Framer Motion install; equivalent plain CSS instead of Tailwind; inherited theme color; decorative semantics and static reduced-motion rendering. No upstream component props, fonts or image assets are required.

# React Bits RubberSegment

- Official source: https://reactbits.dev/r/RubberSegment-TS-CSS.json ; documentation: https://reactbits.dev/micro/rubber-segment . Retrieved 2026-10-23; registry SHA-256: `98f59840bdd1d57e4b2b138892ad1f0bb6b17aa510b78b43d28d5eeddd609bca`.
- Copyright (c) 2026 David Haz. MIT + Commons Clause. Full unchanged license: `packages/ui/src/components/rubber-segment/LICENSE.md`; shipped in both apps at `public/licenses/react-bits-rubber-segment.txt`.
- Retains the official independent edge animation, clipped label copies, spring squash, momentum drag, CSS and reduced-motion support. Local adaptations: existing button/navigation semantics, native click/keyboard activation, cancellation for scrolling/blur/resize, and a maximum 26% extra travel width. Uses existing Motion 12.23.12.

# React DayPicker

- https://daypicker.dev/start ; npm `@daypicker/react` 10.0.2, which depends on `react-day-picker` 10.0.2.
- Copyright (c) 2014-2026 Giampaolo Bellavite and contributors, MIT. Shipped license: both apps' `public/licenses/react-daypicker-MIT.txt`. Chinese locale and default CSS are included via documented package exports.
- Added package chain: `@daypicker/react`, `react-day-picker`, `@date-fns/tz`, `date-fns`. Existing locked versions are unchanged.

# Original format-menu interaction

- The user approved an independent implementation after the official https://skiper-ui.com/v1/skiper46 page identified Skiper46 as a Pro component requiring a license key.
- `GooeyFormatMenu` is original project code using existing Motion and a decorative SVG filter. No Skiper Pro code, branding or licensed assets are included; it is not represented as a Skiper46 integration.

# Cult UI Family Button

- Official registry: https://www.cult-ui.com/r/family-button.json
- Documentation: https://www.cult-ui.com/docs/components/family-button
- Copyright (c) 2023 Jordan-Gilliam, MIT. Complete license: `packages/ui/src/components/family-button/LICENSE.md`; shipped copies: `apps/web/public/licenses/cult-ui-family-button-MIT.txt` and `apps/desktop/public/licenses/cult-ui-family-button-MIT.txt`.
- Retrieved 2026-10-23. Registry snapshot SHA-256: `31c7586ddae16c52d58925545f2a7bab491b3a42e23dcf0e2da0fbd4ca52533e`.
- Local adaptation retains the rounded expanding shell, Motion layout spring (damping 25, stiffness 400) and rotating toggle; replaces Tailwind with existing CSS variables. Uses existing Motion, Lucide and Base UI dependencies. Adds native buttons, focus management, persistent form drafts, responsive sizing and reduced motion. Optional open/onOpenChange/label are local extensions to the upstream children-only API.
- Planify and Super Productivity were UX references; their source code/assets are not included.

# React Bits SpringCheck

- Official registry: https://reactbits.dev/r/SpringCheck-TS-CSS.json
- Source: https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696
- Copyright (c) 2026 David Haz. MIT + Commons Clause; complete unchanged license: `packages/ui/src/components/spring-check/LICENSE.md`.
- Retrieved TypeScript and plain CSS from the official registry. Runtime: `motion` 12.23.12 and `@hugeicons/core-free-icons` 4.3.3. No other existing locked dependencies were upgraded.
- Local adaptation: optional `editableLabel` places the editable todo input beside the checkbox, avoiding nested interactive controls. The official single motion value, fill, tick drawing, label strike, controlled state and reduced-motion behavior are retained. Used as part of Smoke Notes, not distributed as a component collection.

# Liqui glass integration

- Upstream: https://github.com/leefanv/liqui-design
- Source commit: `2cf0eaf1282bb7bb01e4497aa622841c2caed512` (2026-09-19).
- Runtime: `@liqui-design/glass` **0.3.0**, `@base-ui/react` **1.8.0** (MIT); exact versions in pnpm-lock.yaml.
- Sources: `registry/liqui/ui/tab-bar.tsx`, `toolbar.tsx`, `dialog.tsx`, and `registry/liqui/lib/lens.tsx` (registry lens helper).
- Local adaptations: `packages/ui/src/components/glass/`, `apps/web/src/glass.css`.
- Lens profile, map builder, SVG filter and spring integrator retained; Tailwind replaced with local CSS. Tab bar narrowed to two native navigation buttons (aria-current, keyboard focus; no tabpanel promise or search), preserving the official press optics. Reduced motion stops active springs. Toolbar keeps existing editor buttons and selection handling, with a single decorative surface. Dialog uses Base UI focus handling while retaining the app overlay and content structure. Dynamic loading affects only decoration; failures leave readable CSS surfaces.
- Retrieved registry copies and isolated lab: `work/web-liqui-lab/` (local verification artifacts, not application runtime).

## Liqui license

MIT License

Copyright (c) 2026 Fan Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# rrule

- Source: https://github.com/jkbrzt/rrule ; pinned npm version 2.8.1, BSD-3-Clause.
- Used for local calendar date recurrence, including interval, weekday, month day, ordinal weekday, month, count and until. Recurrence dates use floating UTC arithmetic in each event's IANA source zone; display conversion uses Temporal. Legacy events default to Asia/Hong_Kong.
- Complete upstream license is shipped in both apps at `public/licenses/rrule-BSD-3-Clause.txt`. No FullCalendar, Schedule-X, React Big Calendar, or Apple source/assets are copied or installed.

# Calendar import and time zones

- ICAL.js 2.2.1: https://github.com/kewisch/ical.js, MPL-2.0. Used unmodified to parse ICS syntax; original source is available at https://github.com/kewisch/ical.js/tree/v2.2.1. License shipped in both apps as `public/licenses/ical-js-MPL-2.0.txt`.
- @js-temporal/polyfill 0.5.1: https://github.com/js-temporal/temporal-polyfill, ISC. Used unmodified for IANA zone conversion and daylight-saving validation. License shipped as `public/licenses/temporal-polyfill-ISC.txt`.
- jsbi 4.3.2: https://github.com/GoogleChromeLabs/jsbi, Apache-2.0, dependency of Temporal. License shipped as `public/licenses/jsbi-Apache-2.0.txt`.
- Versions are pinned; other locked packages remain unchanged. No Apple code, icons, or calendar assets are included.
