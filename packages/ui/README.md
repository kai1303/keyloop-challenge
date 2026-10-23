# Keyloop shadcn/ui components

Shared React components generated with the official shadcn CLI (`new-york` style,
Radix primitives), adapted to the extracted public Keyloop DMS brand tokens.
The interactive preview lives in `apps/web`; run `pnpm dev` from the repository root.

Installed: **Button, Input, Label, Textarea, Select, Checkbox, Switch, Toggle, Dialog, Card, Badge**.

Also available: **Calendar, Slider, InputGroup, Accordion, Table, Popover, Sidebar, Tabs, Separator, Sheet, Tooltip and Skeleton**, plus **SliderField,
CurrencyInput, MetricCard and LeadTable**. The Sales Hub examples are at
`http://127.0.0.1:5173/#sales-hub`.

## Sales Hub patterns

These additions adapt the public [Sales Hub page](https://keyloop.com/sales-hub).
They use the shared shadcn theme, not an authenticated Sales Hub application UI.

- `SliderField` takes `id`, `label`, `min`, `max`, `value` and `onValueChange`.
  It synchronizes a labelled, keyboard-accessible slider and number input. Values
  are whole numbers; on blur, out-of-range input is clamped, fractions are rounded,
  and empty/invalid input returns to the last valid value. `disabled` affects both.
- `CurrencyInput` takes a display prefix in `currency` (for example `£`) and native
  input props. Include the currency code in its external label. It uses number
  input semantics with a default non-negative minimum and 0.01 step; callers can
  override native constraints. It does not parse locale separators or perform
  currency conversion or money arithmetic.
- `MetricCard` takes `label`, `value`, optional `description` and native `dl` props.
  Pass `className` for the dark result-panel treatment shown in the preview.
- `Accordion` uses shadcn/Radix keyboard semantics, blue chevrons and 200ms CSS
  height transitions, respecting the shared reduced-motion rule.
- `LeadTable` takes `leads: { id, customer, type }[]` and `onView(lead)`. It includes
  an accessible caption and an empty state. The preview opens a local details
  dialog and restores focus to the activated row action when it closes.

The lead-table layout is informed by dashboard artwork. Its detail interaction is
a proposed pattern. Names, amounts and FAQ copy are sample content. Only the count
metrics follow the sliders; no ROI formula or backend is implemented. The Demand
gradient is scoped to the Sales Hub badge, keeping the original DMS tokens intact.
Slider boundary behavior is covered by `slider-value.test.mjs`.
Desktop browser checks are recorded in `exports/sales-hub-browser-checks.json`,
with a preview screenshot at `exports/sales-hub-components.png`. Mobile and
screen-reader sessions were not run.

## Use from an app

Declare `"@keyloop-interview/ui": "workspace:*"` in the app's dependencies. Import
the stylesheet once at the app entry point:

```tsx
import "@keyloop-interview/ui/globals.css"
import { Input } from "@keyloop-interview/ui/components/input"
import { Label } from "@keyloop-interview/ui/components/label"

<div>
  <Label htmlFor="customer">Customer name</Label>
  <Input id="customer" name="customer" autoComplete="name" />
</div>
```

Consumers need the Tailwind v4 Vite plugin, as configured in `apps/web/vite.config.ts`.
For another app, add its source path to the Tailwind scan sources if it is not
discovered automatically. Shared component utilities are explicitly scanned here.

## Inputs and dialogs

- Labels use `htmlFor`/`id`; helper and error text use `aria-describedby`.
- `Input` supports native `type`, `required`, `minLength`, `maxLength`, `pattern`,
  `readOnly`, `disabled` and `aria-invalid` attributes.
- Invalid borders do not perform validation. The preview includes a clearly labelled
  invalid-state specimen; the dialog form uses real browser validation.
- The modal example in `apps/web/src/App.tsx` uses `DialogTitle`,
  `DialogDescription`, explicit `aria-modal`, focus trapping, Escape dismissal,
  cancel, and focus restoration. Saving only changes React state in the preview.
- A real application still needs server-side validation and persistence at its
  actual data boundary.

## Theme mapping

`src/styles/globals.css` imports the original extracted token CSS, then maps it to
shadcn semantic variables. `primary` is Keyloop's measured CTA blue, `foreground`
is carbon, `background` is the pale public-site canvas, and `ring` uses the measured
focus blue. Heading and body fonts are reused from the original local font files.

The input border is deliberately stronger than the source website border, and
muted/error colors are proposed accessible UI choices. The semantic mappings,
invalid/disabled states and modal composition are **an adaptation**, not an export
of authenticated DMS application styles. Only light mode is configured; the host's
OS color scheme does not automatically enable the generated dark variants.

Small changes to generated components:

- Imports use the existing shared `cn` helper instead of adding a second helper.
- Default buttons, inputs and selects use a consistent 40px height.
- Dialog surfaces use the white card token.
- Link buttons use readable foreground text with a brand-colored underline.

## Checkbox, Switch and Toggle

- `Checkbox` supports unchecked, checked, indeterminate, disabled and invalid states.
  The mixed state displays a minus icon and exposes `aria-checked="mixed"`.
  Motion fades/scales the indicator over 120ms and crossfades mixed/check marks;
  background and border colors transition over 150ms. Controlled and uncontrolled
  usage are supported. Reduced motion makes the indicator change immediately.
- `Switch` represents an on/off setting and animates its thumb with the existing
  reduced-motion-aware CSS transitions.
- `Toggle` represents a pressed button, exposes `aria-pressed`, and uses Keyloop blue
  for its active state. Its default height is 40px.
- Prefer labelled checkboxes for selecting options, switches for settings, and
  toggle buttons for optional modes. The preview shows each control independently;
  no settings are persisted.

## Motion

The preview uses [Motion](https://motion.dev/docs/react) for one-time section
entrances, updated dealership names, and modal entry/exit. Overlay fades take
160ms; dialog transitions take 200ms. `useReducedMotion` removes the modal's fade,
scale and slide when the OS requests reduced motion.

Consumers of the animated dialog should configure the lightweight Motion feature
bundle once at their root, as in `apps/web/src/main.tsx`:

```tsx
import { domAnimation, LazyMotion, MotionConfig } from "motion/react"

<LazyMotion features={domAnimation} strict>
  <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeOut" }}>
    <App />
  </MotionConfig>
</LazyMotion>
```

For modal exit animations, keep the Radix root mounted and render its content
conditionally inside `AnimatePresence`:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
  <AnimatePresence>
    {open && (
      <DialogContent key="dialog" forceMount aria-modal="true">
        {/* Include DialogTitle and DialogDescription with the dialog's content. */}
      </DialogContent>
    )}
  </AnimatePresence>
</Dialog>
```

Import `AnimatePresence` from `motion/react`. `forceMount` is forwarded to the
portal, overlay and content so Motion can complete the exit before Radix removes
the nodes. The generated CSS entrance/exit animation classes were removed from
the dialog to avoid two systems animating it simultaneously. Other shadcn controls
retain their standard CSS transitions. Motion browser checks are saved in
`exports/motion-browser-checks.json`.

## Add another component

```sh
pnpm dlx shadcn@latest add <component> -c apps/web
```

The app and shared package have matching `components.json` files so the CLI routes
UI components into this package. Review regenerated files before overwriting local
customizations. Follow the official [monorepo](https://ui.shadcn.com/docs/monorepo)
and [theming](https://ui.shadcn.com/docs/theming) documentation.

## Checks

```sh
pnpm build
pnpm typecheck
pnpm test
```

The browser smoke check exercised nine select options, checkbox selection, disabled,
read-only and invalid input states, modal focus wrapping, native validation, save,
cancel, Escape dismissal and returned trigger focus. Its results are recorded in
`exports/shadcn-browser-checks.json`; this is captured evidence, not a test runner.

## Admin dashboard components

Popover, Sidebar, Tabs and their supporting components are sourced from the official shadcn `new-york-v4` registry, using the already installed `radix-ui` package and existing local imports. Sidebar colors map to local Keyloop tokens. The booking popover uses Motion in its detail content instead of the generated CSS entrance animation, respecting reduced-motion preferences. The `useIsMobile` hook lives under `lib/` to use the package's existing export path.

The admin summary uses Card/Header/Title/Description/Content directly. The older MetricCard remains available for the existing component preview. Booking-specific forms and resource time/bay positioning remain app compositions of these shared components.

References: [shadcn Popover](https://ui.shadcn.com/docs/components/radix/popover), [Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar), [Tabs](https://ui.shadcn.com/docs/components/radix/tabs).

The shared Calendar is sourced from the official shadcn `new-york-v4` registry and uses `react-day-picker` plus `date-fns`. Its imports point to the existing local Button and theme helpers. The admin schedule supplies the dealership timezone; the underlying month grid retains shadcn's day selection, month navigation and keyboard behavior. See [shadcn Calendar](https://ui.shadcn.com/docs/components/radix/calendar).
