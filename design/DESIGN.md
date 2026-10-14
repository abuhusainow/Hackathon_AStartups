---
name: Federal Civic Architecture
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#43474d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#49607c'
  primary: '#001428'
  on-primary: '#ffffff'
  primary-container: '#0f2942'
  on-primary-container: '#7991af'
  inverse-primary: '#b0c9e8'
  secondary: '#bb0027'
  on-secondary: '#ffffff'
  secondary-container: '#e0283c'
  on-secondary-container: '#fffbff'
  tertiary: '#041423'
  on-tertiary: '#ffffff'
  tertiary-container: '#192939'
  on-tertiary-container: '#8090a3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9e8'
  on-primary-fixed: '#011d35'
  on-primary-fixed-variant: '#314863'
  secondary-fixed: '#ffdad8'
  secondary-fixed-dim: '#ffb3b1'
  on-secondary-fixed: '#410007'
  on-secondary-fixed-variant: '#92001c'
  tertiary-fixed: '#d3e4f9'
  tertiary-fixed-dim: '#b8c8dd'
  on-tertiary-fixed: '#0c1d2c'
  on-tertiary-fixed-variant: '#384859'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-hero:
    fontFamily: Public Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Public Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  title-sm:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-lg:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.025em
  label-sm:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  gutter-desktop: 2rem
  margin: 1.5rem
  margin-mobile: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes the visual and structural language for the Austrian Federal Ministry digital citizen service platform (*Digitales Amt / Bundesministerium*). The platform serves as the sovereign digital point of contact for citizens, residents, and administrative authorities across Austria.

### Brand Personality & Philosophy
- **Authoritative & Legitimate:** The aesthetic projects sovereign stability, administrative competence, and unassailable legal certainty.
- **Trustworthy & Protective:** Clear boundaries, explicit verification indicators, and cryptographically sound audit affordances communicate state-grade digital safety (ID Austria integration, qualified electronic signatures).
- **Universally Accessible:** Equal access for every citizen across all socio-demographic strata, fulfilling WCAG 2.2 AAA readability standards without compromising institutional dignity.
- **Civic Restraint:** Functional, sober, and free from superficial decoration. Visual drama is replaced by clarity, predictable interactions, and structured information density.

### Design Movement: Modern Institutional Rationalism
The system implements a refined European administrative modernism: crisp architectural grid lines, high-contrast structural borders, pure functional surfaces, calibrated vertical typography, and authoritative official accents.

## Colors

The palette is engineered to meet strict WCAG AAA contrast ratios (minimum 7:1 for normal text, 4.5:1 for graphical elements and large text) while maintaining the visual authority of the Austrian federal government.

### Color Roles & Semantics
- **Imperial Navy Primary (`#0F2942`)**: The foundational institutional anchor. Used for primary navigation, critical interactive surfaces, primary buttons, and federal authority headers. Achieves >12:1 contrast against pure white.
- **Nocturne Navy Dark Tertiary (`#0A1B2A`)**: The highest-order anchor. Reserved for top mastheads, sovereign seal lockups, and critical security barrier backdrops.
- **Austrian Civic Red Secondary (`#C8102E`)**: The sovereign national emblem color. Used with strict restraint: official ministry badges, sovereign heraldic crest highlights, top-level federal verification ribbons, and destructive confirmations.
- **Slate Gray Neutral (`#64748B`)**: Structural secondary text, subtle iconography, and boundary dividers.
- **Canvas & Surface System**:
  - `surface-canvas`: `#F8FAFC` (Cool slate tint, low eye fatigue for administrative workflows)
  - `surface-container`: `#FFFFFF` (Pure stark white for actionable cards, forms, and dossiers)
  - `surface-subtle`: `#F1F5F9` (Data table alternate striping, read-only field fills)
  - `border-default`: `#CBD5E1` (Crisp, defined structural bounds)
  - `border-strong`: `#94A3B8` (Focus boundaries and high-definition form borders)
- **Text & Content**:
  - `text-primary`: `#0F172A` (Obsidian slate; contrast ratio 15.6:1 against white)
  - `text-muted`: `#475569` (Darkened slate; strictly AAA compliant at 7.1:1 on white)
- **Administrative Status Palette**:
  - `state-verified-green`: `#14532D` (Text/Icon), `#DCFCE7` (Background)
  - `state-pending-amber`: `#78350F` (Text/Icon), `#FEF3C7` (Background)
  - `state-alert-red`: `#7F1D1D` (Text/Icon), `#FEE2E2` (Background)
  - `state-info-navy`: `#0F2942` (Text/Icon), `#E0E7FF` (Background)

## Typography

The design system standardizes on **Public Sans**, an open-source, institutional sans-serif font engineered for accessibility, tabular numerical fidelity, and high legibility across screens of varying resolutions.

### Typography Rules & Application
- **Visual Weight & Decorum:** Headlines feature strong weights (`600` and `700`) without stylistic flourish. Line-height is purposefully relaxed to support Austrian-German compound words (e.g., *Meldebestätigung*, *Staatsbürgerschaftsnachweis*) without awkward collisions.
- **Numerical Alignment:** Monospaced and tabular numbers (`tnum` font feature) must be enabled across all official data tables, identification serial numbers, dates, and timestamped audit logs.
- **Strict Readability:** Body copy is restricted to `16px` minimum for core desktop flows, with a line-height multiplier between `1.5x` and `1.625x` to eliminate reading fatigue during complex statutory disclosures.
- **Bilingual & Formal German Typography:** German quotation marks (low-high: „ “) and formal honorific spacing are maintained in all official announcements.

## Layout & Spacing

The layout model is anchored by an orderly 12-column responsive grid system, providing geometric alignment and predictable reading paths for citizens.

### Grid & Form Factors
- **Desktop (1280px and above):** 12-column grid, max-width `1200px` centered container, `margin-desktop` (48px), `gutter-desktop` (32px).
- **Tablet (768px – 1279px):** 8-column grid, `margin-tablet` (32px), `gutter` (24px).
- **Mobile (320px – 767px):** 4-column grid, `margin-mobile` (16px), `gutter-mobile` (16px). Form fields, action rows, and status cards stack strictly into a single column.

### Rhythm & Alignment Principles
- Spacing follows an 8px architectural grid. Component interior paddings map to `space-sm` (8px), `space-md` (16px), and `space-lg` (24px).
- Vertical grouping of formal document blocks and procedural steps uses `space-xl` (40px) to establish clear administrative stages.
- No loose floating elements. Every interactive field, summary table, and credential badge aligns strictly to the left grid line of its assigned container.

## Elevation & Depth

To maintain institutional sobriety and universal accessibility, the design system avoids heavy drop shadows, decorative blurs, and skeuomorphic gradients. Depth is established through **tonal layers** and **high-definition structural borders**.

### Layering Hierarchy
1. **Base Layer (Level 0 - Background):** `#F8FAFC`. The foundational canvas on which administrative processes take place.
2. **Surface Layer (Level 1 - Structural Cards & Sheets):** Pure `#FFFFFF` surfaces bounded by a crisp 1px solid border (`#CBD5E1`). No box shadows are used on static cards to avoid visual noise.
3. **Interactive & Elevated Layer (Level 2 - Menus, Dialogs, Dropdowns):** `#FFFFFF` paired with a sharp 1px border (`#94A3B8`) and an ambient, low-spread administrative shadow:
   `box-shadow: 0 4px 6px -1px rgba(15, 41, 66, 0.08), 0 2px 4px -2px rgba(15, 41, 66, 0.06);`
4. **Modal / Security Overlay (Level 3 - Critical Authentication / ID Austria):** `#FFFFFF` bounded by `#0F2942` borders with an ambient shield shadow:
   `box-shadow: 0 20px 25px -5px rgba(10, 27, 42, 0.16), 0 8px 10px -6px rgba(10, 27, 42, 0.12);`
   Backdrop uses a solid institutional tint: `rgba(10, 27, 42, 0.65)` (no backdrop-filter blur, maintaining crisp rendering on all client hardware).

### Focus & Accessibility Boundaries
All focused elements utilize a high-visibility, 3px solid dual-ring outline: 2px pure white inner spacing followed by 3px `#0F2942` outer boundary, meeting the highest accessibility criteria for keyboard navigation.

## Shapes

The design system utilizes **Soft** geometry (`roundedness: 1`), conveying structural integrity, civic order, and digital precision without harsh unrefined corners or informal bubbly aesthetics.

### Geometric Rules
- **Base Components (Inputs, Buttons, Badges):** `4px` (`0.25rem`). Imparts architectural solidity and form reliability.
- **Containers & Panels (Cards, Modal Windows, Accordions):** `8px` (`0.5rem` / `rounded-lg`). Creates a clean framing boundary without softening the formal government tone.
- **System Badges & Verified Pill Indicators:** Subtle `4px` corner radius. Strict rule: Pill shapes (`9999px`) are forbidden to maintain solemn administrative discipline.
- **Federal Seal & Official Insignia Enclosures:** Must always be housed inside precise geometric squares or crisp shield-proportioned containers with 4px radii.

## Components

### Buttons
- **Primary Action (Federal Navy):** Background `#0F2942`, text `#FFFFFF`, border 1px solid `#0A1B2A`, radius 4px, height 48px, horizontal padding 24px, font `label-lg`. Hover: `#1B3B5D`. Active: `#0A1B2A`.
- **Secondary Action (Subtle Outline):** Background `#FFFFFF`, text `#0F2942`, border 1.5px solid `#0F2942`, radius 4px, height 48px. Hover: `#F1F5F9`.
- **Tertiary / Destructive:**
  - *Tertiary:* Transparent background, underline text `#0F2942`, font `label-lg`.
  - *Destructive:* Background `#C8102E`, text `#FFFFFF`, border 1px solid `#9B0D23`, radius 4px.

### Badges & Verification Chips
- **Official Status Pill:** 4px radius, padding 4px 10px, typography `label-md`.
  - *ID Austria Verified:* `#DCFCE7` background, `#14532D` text, 1px border `#86EFAC`, leading checkmark seal icon.
  - *In Review / Official Audit:* `#FEF3C7` background, `#78350F` text, 1px border `#FDE68A`.
  - *Republic of Austria Sovereign Tag:* Deep navy `#0F2942` background, `#FFFFFF` text, subtle 2px red left accent border (`#C8102E`).

### Input Fields & Controls
- **Text & Select Fields:** Height 48px, background `#FFFFFF`, border 1.5px solid `#CBD5E1`, text `#0F172A`, placeholder `#64748B`, radius 4px, padding 0 16px.
  - *Active / Focus:* Border 2px solid `#0F2942` with 2px white offset glow.
  - *Error State:* Border 2px solid `#C8102E`, text `#7F1D1D`, accompanied by an explicit text description.
- **Checkboxes & Radios:** Size 22px × 22px (exceeding touch-target criteria when nested in 48px padded containers). Border 2px solid `#0F2942`. Checked: background `#0F2942` with high-contrast white check indicator.

### Administrative Dossier Cards
- Background `#FFFFFF`, border 1px solid `#E2E8F0`, padding 24px, radius 8px.
- Top border features an optional 3px solid institutional bar: Navy (`#0F2942`) for standard records, Red (`#C8102E`) for urgent legal actions.
- Header lockup contains document title (`title-lg`), legal reference ID (`label-md` tabular), and trailing official status badge.

### Specialized Government Components
- **Federal Masthead Banner:** `#0A1B2A` bar spanning 100% viewport width with a stylized Austrian Bundesadler motif, displaying official text: *„Offizielles Portal der Republik Österreich“* with an authoritative locked-padlock icon.
- **ID Austria Verification Block:** Elevated high-trust component with two-factor cryptographic challenge visualization, QR token canvas, and security stamp showing timestamp and issuing authority (*Bundesministerium für Inneres*).
- **Legal Document Accordion:** Multi-tier expandable section for statutory texts with persistent paragraph markers (§), collapsible clauses, and direct download affordances for cryptographically signed PDF documents (*Amtssignatur*).