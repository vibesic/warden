# AI Agent Visual Behavior - Quick Reference

**Project**: Quiz Application (cert-app)  
**Tech Stack**: React + Tailwind CSS + SCSS  
**Style**: Flat design, GitHub-inspired color palette  
**Approach**: Tailwind-first, SCSS for complex patterns

## Core Principles

1. **Tailwind-First**: Use utilities for 90% of styling
2. **SCSS for Patterns**: Extract complex/repeated patterns only
3. **Modular**: Component-based SCSS modules (no global styles)
4. **Flat Design**: No shadows, use borders and colors for hierarchy
5. **GitHub Colors**: Professional, accessible color palette

## Color System (GitHub-Inspired)

### Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Primary (GitHub blue-gray)
        primary: {
          50: '#f6f8fa',
          100: '#eaeef2',
          200: '#d0d7de',
          300: '#afb8c1',
          400: '#8c959f',
          500: '#6e7781', // Main
          600: '#57606a',
          700: '#424a53',
          800: '#32383f',
          900: '#24292f',
        },
        // Accent (GitHub blue)
        accent: {
          50: '#ddf4ff',
          100: '#b6e3ff',
          200: '#80ccff',
          300: '#54aeff',
          400: '#218bff',
          500: '#0969da', // Main
          600: '#0550ae',
          700: '#033d8b',
          800: '#0a3069',
          900: '#002155',
        },
        // Success (GitHub green)
        success: {
          50: '#dafbe1',
          100: '#aceebb',
          200: '#6fdd8b',
          300: '#4ac26b',
          400: '#2da44e', // Main
          500: '#1a7f37',
          600: '#116329',
          700: '#044f1e',
          800: '#003d16',
          900: '#002d11',
        },
        // Warning (GitHub yellow)
        warning: {
          50: '#fff8c5',
          100: '#fae17d',
          200: '#eac54f',
          300: '#d4a72c',
          400: '#bf8700', // Main
          500: '#9a6700',
          600: '#7d4e00',
          700: '#633c01',
          800: '#4d2d00',
          900: '#3b2300',
        },
        // Danger (GitHub red)
        danger: {
          50: '#ffebe9',
          100: '#ffcecb',
          200: '#ffaba8',
          300: '#ff8182',
          400: '#fa4549',
          500: '#cf222e', // Main
          600: '#a40e26',
          700: '#82071e',
          800: '#660018',
          900: '#4c0014',
        },
        // Neutral (GitHub gray)
        neutral: {
          50: '#f6f8fa',
          100: '#eaeef2',
          200: '#d0d7de',
          300: '#afb8c1',
          400: '#8c959f',
          500: '#6e7781',
          600: '#57606a',
          700: '#424a53',
          800: '#32383f',
          900: '#24292f',
        },
      },
    },
  },
};
```

### Color Usage

| Color           | Usage                             |
| --------------- | --------------------------------- |
| **accent-500**  | Primary CTAs, links, focus states |
| **primary-900** | Headings, primary text            |
| **primary-600** | Secondary text                    |
| **primary-400** | Muted text, placeholders          |
| **success-400** | Completed states, correct answers |
| **warning-400** | Caution, time warnings            |
| **danger-500**  | Errors, delete actions            |
| **neutral-50**  | Page background                   |
| **neutral-100** | Card backgrounds (elevated)       |
| **neutral-200** | Borders, dividers                 |

## Flat Design Rules

### Depth Without Shadows

```tsx
// ❌ NEVER use shadows
<div className="shadow-lg rounded-lg">

// ✅ Use borders for separation
<div className="border-2 border-neutral-200 rounded-lg">

// ✅ Use background colors for layers
<div className="bg-white border border-neutral-200">
  <div className="bg-neutral-50 border-t border-neutral-200">

// ✅ Use border color changes for interaction
<button className="
  border-2 border-neutral-200
  hover:border-accent-500
  hover:bg-accent-50
">
```

### Visual Hierarchy

```tsx
// Page Background
className = 'bg-neutral-50';

// Card (elevated)
className = 'bg-white border border-neutral-200';

// Nested Section
className = 'bg-neutral-50 border-t border-neutral-200';

// Interactive Hover
className = 'hover:border-accent-500 hover:bg-accent-50';

// Active State
className = 'border-2 border-accent-500 bg-accent-50';

// Disabled
className = 'border border-neutral-200 bg-neutral-100 opacity-50';
```

## SCSS Module Pattern

### File Structure

```
src/
├── styles/
│   ├── _variables.scss    # Color variables, spacing
│   ├── _mixins.scss        # Reusable mixins
│   └── components/         # Component-specific SCSS
│       ├── _card.scss
│       ├── _button.scss
│       ├── _form.scss
│       └── _table.scss
├── components/
│   ├── ExamCard/
│   │   ├── ExamCard.tsx
│   │   └── ExamCard.module.scss
│   └── QuestionList/
│       ├── QuestionList.tsx
│       └── QuestionList.module.scss
```

### Variables File

```scss
// styles/_variables.scss
// Import Tailwind colors as SCSS variables
$accent-500: #0969da;
$accent-50: #ddf4ff;

$primary-900: #24292f;
$primary-600: #57606a;
$primary-400: #8c959f;

$success-400: #2da44e;
$warning-400: #bf8700;
$danger-500: #cf222e;

$neutral-50: #f6f8fa;
$neutral-100: #eaeef2;
$neutral-200: #d0d7de;

// Spacing (match Tailwind)
$spacing-1: 0.25rem; // 4px
$spacing-2: 0.5rem; // 8px
$spacing-3: 0.75rem; // 12px
$spacing-4: 1rem; // 16px
$spacing-6: 1.5rem; // 24px
$spacing-8: 2rem; // 32px

// Border Radius
$radius-sm: 0.375rem; // 6px
$radius-md: 0.5rem; // 8px
$radius-lg: 0.75rem; // 12px

// Transitions
$transition-fast: 150ms;
$transition-base: 200ms;
$transition-slow: 300ms;
```

### Mixins File

```scss
// styles/_mixins.scss
@use 'variables' as *;

// Flat card with border
@mixin flat-card($border-width: 1px) {
  background-color: white;
  border: $border-width solid $neutral-200;
  border-radius: $radius-lg;
  transition: border-color $transition-base;
}

// Interactive flat card
@mixin flat-card-interactive {
  @include flat-card(2px);
  cursor: pointer;

  &:hover {
    border-color: $accent-500;
    background-color: $accent-50;
  }

  &:active {
    border-color: $accent-500;
    background-color: $accent-50;
  }
}

// Button variants
@mixin button-base {
  padding: $spacing-2 $spacing-4;
  border-radius: $radius-md;
  font-weight: 500;
  transition: all $transition-base;
  cursor: pointer;
  border: 2px solid transparent;

  &:focus-visible {
    outline: 2px solid $accent-500;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

@mixin button-primary {
  @include button-base;
  background-color: $accent-500;
  color: white;

  &:hover:not(:disabled) {
    background-color: $accent-600;
  }
}

@mixin button-secondary {
  @include button-base;
  background-color: white;
  color: $primary-900;
  border-color: $neutral-200;

  &:hover:not(:disabled) {
    border-color: $neutral-300;
    background-color: $neutral-50;
  }
}

// Responsive breakpoints
@mixin sm {
  @media (min-width: 768px) {
    @content;
  }
}

@mixin lg {
  @media (min-width: 1024px) {
    @content;
  }
}

// Form input base
@mixin input-base {
  width: 100%;
  padding: $spacing-2 $spacing-3;
  border: 1px solid $neutral-200;
  border-radius: $radius-md;
  transition: all $transition-base;

  &:focus {
    outline: none;
    border-color: $accent-500;
    box-shadow: 0 0 0 3px rgba($accent-500, 0.1);
  }

  &:disabled {
    background-color: $neutral-100;
    color: $primary-400;
    cursor: not-allowed;
  }

  &[aria-invalid='true'] {
    border-color: $danger-500;

    &:focus {
      box-shadow: 0 0 0 3px rgba($danger-500, 0.1);
    }
  }
}
```

## Component SCSS Modules

### Card Component

```scss
// components/ExamCard/ExamCard.module.scss
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.card {
  @include flat-card-interactive;
  overflow: hidden;

  &__header {
    padding: $spacing-6;
    border-bottom: 1px solid $neutral-200;
  }

  &__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: $primary-900;
    margin-bottom: $spacing-1;
  }

  &__meta {
    font-size: 0.875rem;
    color: $primary-600;
  }

  &__body {
    padding: $spacing-6;

    &-item {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      font-size: 0.875rem;
      color: $primary-600;

      &:not(:last-child) {
        margin-bottom: $spacing-4;
      }
    }
  }

  &__footer {
    padding: $spacing-4 $spacing-6;
    background-color: $neutral-50;
    border-top: 1px solid $neutral-200;
    display: flex;
    gap: $spacing-3;
  }

  // Variants
  &--highlighted {
    border-color: $accent-500;
    background-color: $accent-50;
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;

    &:hover {
      border-color: $neutral-200;
      background-color: white;
    }
  }
}
```

### Button Component

```scss
// styles/components/_button.scss
@use '../variables' as *;
@use '../mixins' as *;

.btn {
  @include button-base;

  &--primary {
    @include button-primary;
  }

  &--secondary {
    @include button-secondary;
  }

  &--danger {
    @include button-base;
    background-color: $danger-500;
    color: white;

    &:hover:not(:disabled) {
      background-color: $danger-600;
    }
  }

  &--ghost {
    @include button-base;
    background-color: transparent;
    color: $primary-600;

    &:hover:not(:disabled) {
      background-color: $neutral-100;
    }
  }

  &--sm {
    padding: $spacing-1 $spacing-3;
    font-size: 0.875rem;
  }

  &--lg {
    padding: $spacing-3 $spacing-6;
    font-size: 1rem;
  }

  &--full {
    width: 100%;
  }
}
```

### Form Component

```scss
// styles/components/_form.scss
@use '../variables' as *;
@use '../mixins' as *;

.form-group {
  margin-bottom: $spacing-4;

  &:last-child {
    margin-bottom: 0;
  }
}

.label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: $primary-900;
  margin-bottom: $spacing-2;

  &--required::after {
    content: '*';
    color: $danger-500;
    margin-left: $spacing-1;
  }
}

.input {
  @include input-base;
}

.textarea {
  @include input-base;
  resize: vertical;
  min-height: 80px;
}

.select {
  @include input-base;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236e7781' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-position: right $spacing-2 center;
  background-repeat: no-repeat;
  background-size: 1.5em 1.5em;
  padding-right: $spacing-8;
}

.checkbox,
.radio {
  width: 1rem;
  height: 1rem;
  border: 1px solid $neutral-200;
  cursor: pointer;

  &:checked {
    background-color: $accent-500;
    border-color: $accent-500;
  }

  &:focus {
    outline: 2px solid $accent-500;
    outline-offset: 2px;
  }
}

.checkbox {
  border-radius: $radius-sm;
}

.radio {
  border-radius: 50%;
}

.error-message {
  margin-top: $spacing-2;
  font-size: 0.875rem;
  color: $danger-500;
}

.helper-text {
  margin-top: $spacing-2;
  font-size: 0.875rem;
  color: $primary-600;
}
```

### Table Component

```scss
// styles/components/_table.scss
@use '../variables' as *;
@use '../mixins' as *;

.table-container {
  overflow-x: auto;
  border: 1px solid $neutral-200;
  border-radius: $radius-lg;
}

.table {
  width: 100%;
  border-collapse: collapse;

  &__header {
    background-color: $neutral-50;
    border-bottom: 2px solid $neutral-200;
  }

  &__head-cell {
    padding: $spacing-3 $spacing-6;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 500;
    color: $primary-600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__body {
    background-color: white;
  }

  &__row {
    border-bottom: 1px solid $neutral-200;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $neutral-50;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  &__cell {
    padding: $spacing-4 $spacing-6;
    font-size: 0.875rem;
    color: $primary-900;
  }
}
```

## Usage Pattern

### Tailwind-First with SCSS Modules

```tsx
// components/ExamCard/ExamCard.tsx
import React from 'react';
import styles from './ExamCard.module.scss';

interface ExamCardProps {
  title: string;
  duration: number;
  questions: number;
  variant?: 'default' | 'highlighted';
  onClick?: () => void;
}

export const ExamCard: React.FC<ExamCardProps> = ({
  title,
  duration,
  questions,
  variant = 'default',
  onClick,
}) => {
  return (
    <div
      className={`
        ${styles.card}
        ${variant === 'highlighted' ? styles['card--highlighted'] : ''}
      `}
      onClick={onClick}
    >
      {/* Header: Use Tailwind for simple layouts */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className={styles.card__title}>{title}</h3>
          <p className={styles.card__meta}>Created 2 days ago</p>
        </div>

        {/* Badge: Inline Tailwind is fine for simple components */}
        <span className="px-3 py-1 bg-success-100 text-success-700 text-xs font-medium rounded-full">
          Active
        </span>
      </div>

      {/* Body: Use SCSS module for complex structure */}
      <div className={styles.card__body}>
        <div className={styles['card__body-item']}>
          <ClockIcon className="w-5 h-5" />
          <span>Duration: {duration} minutes</span>
        </div>
        <div className={styles['card__body-item']}>
          <QuestionIcon className="w-5 h-5" />
          <span>Questions: {questions}</span>
        </div>
      </div>

      {/* Footer: Use Tailwind for flex layout */}
      <div className={styles.card__footer}>
        <button className="btn btn--primary flex-1">View Results</button>
        <button className="btn btn--secondary">Edit</button>
      </div>
    </div>
  );
};
```

## When to Use What

### Use Tailwind For:

- Simple layouts (flex, grid, spacing)
- One-off styles
- Responsive utilities
- Background colors, borders
- Typography sizing

### Use SCSS Modules For:

- Component-specific complex patterns
- Deeply nested structures (card**header**title\_\_meta)
- Pseudo-elements (::before, ::after)
- Complex hover states with multiple properties
- Animations (keyframes)
- Theme variants

## Critical Rules

1. **Tailwind First**: Always check if Tailwind can do it before writing SCSS
2. **No Global SCSS**: All SCSS must be modules (`.module.scss`)
3. **Use Mixins**: Extract repeated SCSS patterns into mixins
4. **GitHub Colors**: Use the color palette defined in Tailwind config
5. **Flat Design**: No shadows, use borders (`border-2 border-neutral-200`)
6. **BEM for SCSS**: Use BEM naming in SCSS modules (`card__header`, `card--highlighted`)
7. **Modular**: One SCSS file per component or pattern
8. **Variables**: Use SCSS variables from `_variables.scss` for consistency

## Quick Decision Tree

**Need layout (flex, grid)?**
→ Use Tailwind classes

**Need simple color/spacing?**
→ Use Tailwind utilities

**Need complex nested structure?**
→ Create SCSS module with BEM

**Need hover state with 3+ properties?**
→ Use SCSS mixin

**Need animation?**
→ Create SCSS keyframes + mixin

**Need component variants?**
→ SCSS module with modifier classes

## Summary

**Visual approach:**

- Flat design (no shadows, borders for depth)
- GitHub color palette (professional, accessible)
- Tailwind-first (utilities for 90% of styling)
- SCSS modules (complex patterns, component-specific)
- Modular (no global styles, reusable mixins)

**Every component should use Tailwind utilities for simple styles and SCSS modules only for complex, component-specific patterns.**
