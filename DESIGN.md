# Design

## Visual System

The product uses a restrained app UI system for repeated operational work. The interface should feel bright, professional, and trustworthy, with Golden Yellow as the brand primary and cool neutrals supporting dense workflow screens.

## Color

- Brand primary: `#FFC60A`
- Brand primary hover: `#FFB81C`
- Text on primary: `#211A00`
- Readable primary text on light surfaces: `#7A5100`
- Readable primary text on dark surfaces: `#FFD95A`
- Background: cool white with low-chroma blue-gray tint
- Surfaces: white cards in light mode, cool dark panels in dark mode
- Warning/error states must not reuse the brand yellow as their only signal. Warnings use amber/orange with text labels; destructive actions use red.

## Typography

Use the existing business-oriented Chinese system font stack. Product UI headings use compact fixed sizes, not fluid display type. Labels, buttons, data values, helper text, and badges should stay readable at mobile widths.

## Layout

- Authenticated app: desktop sidebar plus mobile top bar and bottom navigation.
- Main pages use `PageShell`, `PageHeader`, `FilterBar`, `EntityListItem`, `MetricCard`, and `StatusBadge` where possible.
- Dense operational screens should prioritize scanning, comparison, and next actions over decorative content.
- Sticky mobile filters and tabs must leave enough room for top and bottom navigation.

## Components

- Primary buttons and selected tabs use Golden Yellow with dark text.
- Links and icon accents use readable primary text, not raw bright yellow.
- Empty states explain what the user can do next and may include a single action.
- Loading states use skeletons for lists and `role="status"` for inline loading.
- Clickable rows must have visible hover and focus states.
- Icon-only buttons require accessible labels.

## Motion

Motion is limited to short state transitions: hover, focus, loading, dialog entrance, and theme switching. No decorative page-load choreography.

## Accessibility

Target WCAG 2.1 AA. Yellow backgrounds must not use white text. State must not rely only on color. Theme switching is global, keyboard accessible, and persisted through `next-themes`.
