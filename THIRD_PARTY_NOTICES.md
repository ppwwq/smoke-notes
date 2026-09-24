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
