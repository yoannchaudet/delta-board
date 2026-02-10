# Delta Board Style Guide

This document defines the visual identity and brand guidelines for Delta Board.

## Brand Personality

**Friendly, approachable, and warm.** Delta Board helps teams reflect on their work together. The visual style should feel inviting and positive - like a helpful companion, not a corporate tool.

Keywords: warm, playful, supportive, simple, human

## Color Palette

### Primary Colors

| Name             | Hex       | Usage                                               |
| ---------------- | --------- | --------------------------------------------------- |
| **Delta Yellow** | `#fed443` | Primary brand color, logo, accents, primary buttons |
| **Delta Amber**  | `#cf8f26` | Logo outline, hover states, depth                   |

### Neutral Colors

| Name            | Hex       | Usage                                  |
| --------------- | --------- | -------------------------------------- |
| **Warm White**  | `#fef8f5` | Page background                        |
| **Light Cream** | `#f5ebe5` | Header background                      |
| **Card White**  | `#ffffff` | Card/panel backgrounds                 |
| **Warm Brown**  | `#5b4237` | Mascot features, headings, header text |
| **Text**        | `#333333` | Body text                              |
| **Text Light**  | `#666666` | Secondary text, metadata               |
| **Border**      | `#e0e0e0` | Dividers, subtle borders               |

### Semantic Colors

| Name               | Hex       | Usage                                      |
| ------------------ | --------- | ------------------------------------------ |
| **Well Green**     | `#4caf50` | "What Went Well" column accent             |
| **Well Green BG**  | `#e8f5e9` | Well card backgrounds                      |
| **Delta Amber**    | `#f59e0b` | "Delta" column accent                      |
| **Delta Amber BG** | `#fef3c7` | Delta card backgrounds                     |
| **Vote Orange**    | `#ff9800` | Vote indicators, stars                     |
| **Error Red**      | `#f44336` | Errors, delete actions, disconnected state |

### Accent Shades (for mascot/illustrations)

| Name                | Hex       | Usage                   |
| ------------------- | --------- | ----------------------- |
| **Highlight Amber** | `#ebb00b` | Illustration highlights |
| **Shadow Gold**     | `#d19718` | Illustration shading    |

## Dark Theme

Delta Board supports a dark theme that follows OS preference by default and can be manually overridden via a toggle in the header. The user's choice persists in localStorage.

The toggle cycles through three states: **Auto** (follows OS) → **Dark** → **Light** → Auto.

### Dark Palette

| Variable             | Light Value | Dark Value |
| -------------------- | ----------- | ---------- |
| `--color-bg`         | `#fef8f5`   | `#1a1a1e`  |
| `--color-bg-accent`  | `#f5ebe5`   | `#242429`  |
| `--color-white`      | `#ffffff`   | `#2d2d33`  |
| `--color-text`       | `#333333`   | `#e0e0e0`  |
| `--color-text-light` | `#666666`   | `#a0a0a0`  |
| `--color-brown`      | `#5b4237`   | `#d4a574`  |
| `--color-border`     | `#e0e0e0`   | `#404048`  |
| `--color-well`       | `#4caf50`   | `#66bb6a`  |
| `--color-well-bg`    | `#e8f5e9`   | `#253d28`  |
| `--color-delta`      | `#f59e0b`   | `#ffa726`  |
| `--color-delta-bg`   | `#fef3c7`   | `#43372a`  |
| `--color-error`      | `#f44336`   | `#ef5350`  |

Dark overrides are applied via a `[data-theme="dark"]` selector in `shared.css`. An inline script in `<head>` reads localStorage before CSS loads to prevent a flash of the wrong theme.

## Typography

**System fonts** - No custom fonts needed. Fast loading, familiar feel.

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
  sans-serif;
```

### Scale

| Element         | Size     | Weight |
| --------------- | -------- | ------ |
| Page title      | 1.5rem   | 600    |
| Section heading | 1.25rem  | 600    |
| Body            | 1rem     | 400    |
| Small/meta      | 0.875rem | 400    |
| Button          | 0.875rem | 500    |

## Logo & Mascot

### Logo Mark (`mark.svg`)

- A stylized delta (triangle) with a dynamic swoosh
- Use on light backgrounds
- Minimum size: 32px
- Clear space: At least 8px on all sides

### Mascot Characters

Two expressive delta characters convey application state:

| Character   | File              | Usage                                                            |
| ----------- | ----------------- | ---------------------------------------------------------------- |
| Happy Delta | `happy-delta.svg` | Landing page, success states, empty states with positive framing |
| Sad Delta   | `sad-delta.svg`   | 404 pages, error pages (5xx), connection lost                    |

The mascots have:

- Expressive eyes with `#fef8f5` highlights (matches background)
- Brown limbs (`#5b4237`) that gesture emotionally
- Warm, hand-drawn aesthetic

## Visual Elements

### Cards & Containers

- Border radius: `8px`
- Shadow: `0 2px 4px rgba(0, 0, 0, 0.1)`
- White background on warm white page

### Buttons

**Primary** (Create, main actions)

```css
background: #fed443;
color: #5b4237;
padding: 0.75rem 1.5rem;
border-radius: 8px;
font-weight: 600;
```

**Secondary** (Export, minor actions)

```css
background: #5b4237;
color: white;
```

**Ghost/Dashed** (Add card)

```css
background: transparent;
border: 2px dashed #e0e0e0;
color: #666666;
```

### Status Indicators

- Connected: `#4caf50` (green dot)
- Disconnected: `#f44336` (red dot)

## Page Templates

### Landing Page

- Warm white background (`#fef8f5`)
- Centered hero with tagline
- Happy Delta mascot (optional, for empty state or hero)
- Board cards on white with subtle shadow

### Header

- Light cream background (`#f5ebe5`)
- Logo mark on the left, sized to match title (1.5rem)
- Warm brown title text (`#5b4237`)
- Secondary button in warm brown

### Board Page

- Two-column layout
- Color-coded column headers (green/amber top border)
- Cards inherit column color scheme

### Error Pages (404, 5xx)

- Centered content
- Sad Delta mascot prominently displayed
- Friendly, apologetic copy
- Clear action to return home

## Tone of Voice

- **Friendly**: "Oops! We couldn't find that board."
- **Helpful**: "Create a new board or go back home."
- **Human**: Avoid jargon, be conversational
- **Brief**: Short sentences, scannable content

## File Naming

- Logo: `mark.svg`
- Mascots: `happy-delta.svg`, `sad-delta.svg`
- Icons: `icon-{name}.svg`
