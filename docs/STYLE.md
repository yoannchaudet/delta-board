# Delta Board Style Guide

This document defines the visual identity and brand guidelines for Delta Board.

## Brand Personality

**Friendly, approachable, and warm.** Delta Board helps teams reflect on their work together. The visual style should feel inviting and positive - like a helpful companion, not a corporate tool.

Keywords: warm, playful, supportive, simple, human

## Color Palette

### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Delta Yellow** | `#fed443` | Primary brand color, logo, accents, primary buttons |
| **Delta Amber** | `#cf8f26` | Logo outline, hover states, depth |

### Neutral Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Warm White** | `#fef8f5` | Page background |
| **Card White** | `#ffffff` | Card/panel backgrounds |
| **Warm Brown** | `#5b4237` | Mascot features, can be used for headings |
| **Text** | `#333333` | Body text |
| **Text Light** | `#666666` | Secondary text, metadata |
| **Border** | `#e0e0e0` | Dividers, subtle borders |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Well Green** | `#4caf50` | "What Went Well" column accent |
| **Well Green BG** | `#e8f5e9` | Well card backgrounds |
| **Delta Blue** | `#2196f3` | "Delta" column accent |
| **Delta Blue BG** | `#e3f2fd` | Delta card backgrounds |
| **Vote Orange** | `#ff9800` | Vote indicators, stars |
| **Error Red** | `#f44336` | Errors, delete actions, disconnected state |

### Accent Shades (for mascot/illustrations)

| Name | Hex | Usage |
|------|-----|-------|
| **Highlight Amber** | `#ebb00b` | Illustration highlights |
| **Shadow Gold** | `#d19718` | Illustration shading |

## Typography

**System fonts** - No custom fonts needed. Fast loading, familiar feel.

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
```

### Scale

| Element | Size | Weight |
|---------|------|--------|
| Page title | 1.5rem | 600 |
| Section heading | 1.25rem | 600 |
| Body | 1rem | 400 |
| Small/meta | 0.875rem | 400 |
| Button | 0.875rem | 500 |

## Logo & Mascot

### Logo Mark (`mark.svg`)
- A stylized delta (triangle) with a dynamic swoosh
- Use on light backgrounds
- Minimum size: 32px
- Clear space: At least 8px on all sides

### Mascot Characters
Two expressive delta characters convey application state:

| Character | File | Usage |
|-----------|------|-------|
| Happy Delta | `happpy delta.svg` | Landing page, success states, empty states with positive framing |
| Sad Delta | `sad delta.svg` | 404 pages, error pages (5xx), connection lost |

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
background: #4caf50; /* or #fed443 for brand emphasis */
color: white;
padding: 0.75rem 1.5rem;
border-radius: 8px;
```

**Secondary** (Export, minor actions)
```css
background: #333333;
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

### Board Page
- Two-column layout
- Color-coded column headers (green/blue top border)
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
- Mascots: `happy-delta.svg`, `sad-delta.svg` (consider renaming for consistency)
- Icons: `icon-{name}.svg`
