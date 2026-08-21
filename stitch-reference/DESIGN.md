---
name: Editorial Hospitality System
colors:
  surface: '#faf8ff'
  surface-dim: '#dad9e1'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fb'
  surface-container: '#eeedf5'
  surface-container-high: '#e9e7ef'
  surface-container-highest: '#e3e1ea'
  on-surface: '#1a1b21'
  on-surface-variant: '#464555'
  inverse-surface: '#2f3036'
  inverse-on-surface: '#f1f0f8'
  outline: '#767586'
  outline-variant: '#c6c5d7'
  surface-tint: '#474adb'
  primary: '#4143d5'
  on-primary: '#ffffff'
  primary-container: '#5b5fef'
  on-primary-container: '#f9f6ff'
  inverse-primary: '#c0c1ff'
  secondary: '#5f5e63'
  on-secondary: '#ffffff'
  secondary-container: '#e4e1e7'
  on-secondary-container: '#656469'
  tertiary: '#595957'
  on-tertiary: '#ffffff'
  tertiary-container: '#71726f'
  on-tertiary-container: '#f9f8f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#05006c'
  on-primary-fixed-variant: '#2c2cc3'
  secondary-fixed: '#e4e1e7'
  secondary-fixed-dim: '#c8c5cb'
  on-secondary-fixed: '#1b1b1f'
  on-secondary-fixed-variant: '#47464b'
  tertiary-fixed: '#e3e2df'
  tertiary-fixed-dim: '#c7c7c3'
  on-tertiary-fixed: '#1b1c1a'
  on-tertiary-fixed-variant: '#464744'
  background: '#faf8ff'
  on-background: '#1a1b21'
  surface-variant: '#e3e1ea'
typography:
  display-xl:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 64px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-xl-mobile:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.25'
  headline-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  xxl: 80px
  gutter: 24px
  margin: 32px
---

## Brand & Style

The design system is rooted in the "Bespoke Editorial" aesthetic, tailored for high-end hospitality management. It prioritizes clarity, authority, and tactile sophistication, moving away from typical SaaS "techiness" toward the timeless quality of printed menus and architectural signage.

The personality is mature and disciplined. It leverages a modern minimalist foundation with high-contrast typography and a restricted color palette to evoke a sense of premium service. Visual interest is generated through intentional asymmetry, rigorous grid alignment, and the interplay between dense data and generous negative space.

## Colors

The palette is anchored by **Dark Ink** for high-contrast communication and **Warm Background** to provide a soft, organic canvas that feels less clinical than pure white. 

- **Primary Indigo (#5B5FEF):** Used sparingly as a "functional accent" for primary actions, indicators of selection, and subtle brand touchpoints.
- **Dark Ink (#16161A):** The dominant color for headlines and primary text, ensuring maximum legibility.
- **Warm Background (#F7F6F2):** The primary canvas color.
- **Surface (#FFFFFF):** Reserved for elevated containers (cards, modals) to create subtle depth against the warm background.
- **Subtle Border (#E8E6E1):** Used for hair-line rules and structural separation, maintaining a sophisticated editorial feel.

## Typography

This design system utilizes **IBM Plex Sans Arabic** exclusively to ensure a technical yet humanist feel across both Latin and Arabic scripts. The hierarchy is extreme; large display sizes are meant to act as structural elements themselves.

- **Editorial Headers:** Use `display-xl` for page titles with generous top-padding.
- **Visual Rhythm:** Use `label-sm` in all-caps for metadata and small categorizations to create a "caption" feel.
- **Body Copy:** Maintain a line-height of at least 1.5 to ensure readability in data-dense SaaS environments.

## Layout & Spacing

The layout follows a **rigorous 8px grid**. The philosophy is "Generous but Functional"—whitespace is not just empty; it is used to group information and guide the eye without the need for heavy borders.

- **Grid:** A 12-column fluid grid for desktop, transitioning to a 4-column grid for mobile.
- **Asymmetry:** In dashboard views, align primary content to the left (or right in RTL) while keeping high-level stats or metadata offset to create an editorial "sidebar" feel.
- **Gutters:** Maintain a consistent 24px gutter to allow the high-contrast text room to breathe.

## Elevation & Depth

This system avoids heavy shadows and floating shapes. Depth is achieved through:

1.  **Tonal Layering:** The base layer is `Warm Background`. `Surface (White)` is used for interactive elements like cards or modals to signify they are "on top."
2.  **Thin Rules:** Use 1px borders in `Subtle Border (#E8E6E1)` instead of shadows to define containers.
3.  **Restrained Shadows:** If a shadow is absolutely necessary (e.g., a floating dropdown), use a single, highly-diffused shadow: `0 4px 20px rgba(22, 22, 26, 0.04)`.

## Shapes

The shape language is "Soft-Rational." It uses consistent corner radii to soften the high-contrast editorial look, making the SaaS feel approachable yet precise.

- **Base Radius (8px):** Standard for buttons, input fields, and small cards.
- **Large Radius (16px):** Used for primary layout containers and large image treatments.
- **Hairline Rules:** All separators should be 1px solid, never dashed or thick, to maintain the sophisticated print-media quality.

## Components

- **Buttons:** Primary buttons use `Dark Ink` with white text for a bold, authoritative look. Secondary buttons use `Subtle Border` with `Dark Ink` text. Avoid gradients.
- **Input Fields:** Use 1px `Subtle Border` with a focus state of `Primary Indigo`. Background should be `Surface`.
- **Chips/Badges:** Small, rectangular with `8px` radius. Use `Warm Background` as a base with `Dark Ink` text for a subtle "tag" appearance.
- **Cards:** White `Surface` background, 1px `Subtle Border`, and `16px` radius. No shadows.
- **Lists:** Use generous vertical padding (`16px`) and hair-line bottom separators. 
- **Editorial Stats:** Large numerical data should use `headline-lg` in `Dark Ink`, paired with `label-sm` in `Muted Text`.