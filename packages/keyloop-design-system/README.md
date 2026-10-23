# Keyloop DMS design export

Extracted on **21 October 2026** from the [public Keyloop DMS page](https://keyloop.com/dms), the [product map](https://keyloop.com/product-overview), and their shared website theme.

This exports the **public DMS website design**, with source captures and a catalogue of the nine DMS products. It does not establish the design system inside the authenticated DMS applications. Token names are assigned locally; Keyloop did not publish these names.

Working React inputs and modals now live in the sibling [shadcn/ui package](../ui/README.md).
Run `pnpm dev` from the repository root for the interactive preview. This folder's
`components.css` and `preview.html` retain the original static research export;
new application UI should use the shadcn package.

## Files

| File | Purpose |
| --- | --- |
| `preview.html` | Offline visual reference: palette, type, components, DMS catalogue and source captures |
| `tokens.json` | 55 measured or source-derived token values, with evidence references |
| `tokens.css` | Matching CSS variables and local font declarations |
| `components.css` | Minimal button, card, field and Operate label recipes |
| `products.json` | Nine DMS entries, source descriptions, benefits and image URLs |
| `fonts/` | Font files observed and downloaded from the public theme |
| `evidence/` | Captures, computed styles, original theme CSS, asset provenance and broader product research |

Open `preview.html` directly in a browser, or serve this folder with a static file server. It has no framework or JavaScript dependency.

For another workspace, declare `"@keyloop-interview/design-system": "workspace:*"`, then import:

```css
@import "@keyloop-interview/design-system/components.css";
```

Use `tokens.css` alone when only variables and font faces are needed. Styles use the `kl-` prefix and do not reset the consuming application's global styles.

## Product analysis

Fusion is the umbrella Automotive Retail Platform. DMS belongs to its **Operate** domain and connects sales, service, parts and accounting. The public DMS page lists nine products:

| Product | Role described by the public catalogue |
| --- | --- |
| Drive | Cloud SaaS DMS using Autoline capabilities |
| Autoline | Dealer management across core dealership operations |
| Eva | DMS for the Netherlands |
| Eva+ | DMS for Belgium and Luxembourg |
| Aswin | DMS for the Iberian market |
| Windrakkar | DMS for Italy |
| Automaster | DMS for Nordic multi-site retailers |
| Serti | DMS for the Canadian market |
| Dracar+ | DMS for DACH and Nordic dealers |

**VEGA is a separate Operate product**, absent from the DMS page's nine-product selector. It is excluded from this export's primary catalogue. The broader product-map research in `evidence/product-catalogue.json` contains 27 entries across four domains.

The public positioning emphasizes shared operational data, connections to approved manufacturer and partner applications, and extending existing workflows. It does not establish that every DMS product uses the same application UI.

## Design findings

- **Typography:** Plus Jakarta Sans for H1/H2, IBM Plex Sans for body, controls and smaller headings. At the captured 1512 × 778 viewport, the DMS hero is 70px/70px, weight 700; section headings are 42px/54px, weight 700; lead copy is 20px/28px.
- **Colors:** carbon `#11181c`, off-white canvas `#f1f1f3`, white text on the dark hero. The measured `Get started` CTA is `#3da5ff` with carbon text. Generic prose headings can use `#111827`, which differs slightly from carbon.
- **Operate identity:** `linear-gradient(90deg, #479bad, #24c9c0 30%, #00f6d2)`. This is the public domain accent, not a validated set of application status colors.
- **Controls:** 6px button radius, 10px vertical and 16px horizontal padding, 16px/24px semibold text. Product selectors use 8px corners; the public product detail card uses 16px corners.
- **Layout:** dark photographic/gradient hero, two-tier navigation, light testimonial and benefit sections, then a dark DMS selector with a white product detail card. The source uses compact controls and a larger editorial heading scale.

## Source-derived responsive behavior

The DMS hero's visible classes specify 36px initially, 48px from 768px, 58px from 1024px, and 70px from 1280px. The source theme defines those media queries. Only the desktop viewport was measured live; mobile layout and interaction were not verified. `preview.html` adapts as a reference sheet and is not a clone of the DMS webpage.

## Evidence and limits

- `dms-computed.json` contains the DMS page's text, links and measured styles. `source-theme.css` preserves the stylesheet used for source-derived values; it is evidence, not an imported application dependency.
- The nine catalogue descriptions were read from live product-map selections. They are source descriptions, not independent verification of product capabilities, availability or regional support.
- Illustrative application images are flattened marketing artwork. No exact internal fonts, grid sizes, tables, status colors, validation, empty states or navigation contracts are claimed from them.
- Most original product image files could not be retrieved by the browser asset exporter. URLs and failures are recorded in `evidence/assets.json`; the preview uses captured page screenshots instead.
- The component recipes add explicit keyboard focus outlines and reduced-motion handling. Those are export additions, since some source controls suppress focus outlines. Accessibility compliance was not audited.
- Font and source image provenance is retained in `evidence/assets.json`. This private package does not assign redistribution rights to Keyloop branding or original artwork.

## Validation

```sh
pnpm --filter @keyloop-interview/design-system test
```

The tests check JSON/CSS parity, component variable references, local font paths, the nine-product DMS boundary, descriptions and source image URLs. They do not exercise an authenticated DMS application.
