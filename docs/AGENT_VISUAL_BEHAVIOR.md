# AI Agent Visual Behavior - Quick Reference

**Project**: Proctor App (proctor-app)  
**Tech Stack**: React + Tailwind CSS + SCSS  
**Style**: Clean design, professional color palette  
**Approach**: Tailwind-first, SCSS for complex patterns

## Core Principles

1. **Tailwind-First**: Use utilities for 90% of styling
2. **SCSS for Patterns**: Extract complex/repeated patterns only
3. **Modular**: Component-based SCSS modules (no global styles)
4. **Clean Design**: Use borders and colors for hierarchy
5. **Professional Colors**: Accessible, clear status indicators

## Color Usage

| Color               | Usage                                      |
| ------------------- | ------------------------------------------ |
| **indigo-600**      | Primary actions, session code, links       |
| **gray-900**        | Headings, primary text                     |
| **gray-600**        | Secondary text                             |
| **gray-400**        | Muted text, placeholders                   |
| **green-500**       | Online status, clean students              |
| **emerald-500**     | Timer (safe), success states               |
| **rose-500/red-600**| Violations, danger, end session actions    |
| **amber/yellow**    | Warnings, time running low                 |
| **gray-50**         | Page background                            |
| **white**           | Card backgrounds                           |
| **gray-200**        | Borders, dividers                          |

## Status Indicators

The Proctor App relies heavily on clear status visualization:

### Student Online/Offline

```tsx
// Online
<Wifi size={20} className="text-green-500" />

// Offline
<WifiOff size={20} className="text-gray-400" />
```

### Violation Badges

```tsx
// Has violations
<div className="px-3 py-1 bg-red-100 text-red-700 rounded-full border border-red-200">
  <AlertTriangle size={14} />
  <span className="text-xs font-bold">{count} Violations</span>
</div>

// Clean
<StatusBadge status="success" text="Clean" />
```

### Timer States

```tsx
// Safe (> 5 min remaining)
<div className="text-2xl font-mono font-bold text-emerald-500 tabular-nums">{time}</div>

// Warning (≤ 5 min remaining)
<div className="text-2xl font-mono font-bold text-rose-500 tabular-nums">{time}</div>
```

## Card Patterns

### Student Monitoring Card

```tsx
<div className={`
  p-5 rounded-lg border-2 transition-all
  ${student.isOnline
    ? 'bg-white border-green-100 shadow-sm'
    : 'bg-gray-50 border-gray-200 opacity-75'
  }
`}>
  <div className="flex justify-between items-start">
    <h3 className="font-bold text-gray-800 text-lg">{student.name}</h3>
    {student.isOnline ? <Wifi className="text-green-500" /> : <WifiOff className="text-gray-400" />}
  </div>
  <p className="text-sm font-mono text-gray-500">{student.studentId}</p>
</div>
```

### Session Info Section

```tsx
<section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
  <div className="flex flex-wrap items-center justify-between gap-6">
    <div>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Session Code</h2>
      <div className="text-2xl font-mono font-bold text-indigo-600 tracking-widest">{code}</div>
    </div>
  </div>
</section>
```

## SCSS Module Pattern

### When to Use SCSS

Use SCSS modules only for:
- Complex hover states with multiple properties
- Deeply nested structures
- Animations (keyframes)
- Component-specific complex patterns

```scss
// components/StudentCard.module.scss
.card {
  background-color: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  transition: border-color 200ms;

  &:hover {
    border-color: #6366f1;
  }

  &--online {
    border-color: #bbf7d0;
  }

  &--offline {
    opacity: 0.75;
    background-color: #f9fafb;
  }
}
```

## Usage Guidelines

### Use Tailwind For (90%):
- Simple layouts (flex, grid, spacing)
- Background colors, borders
- Typography sizing
- Responsive utilities
- One-off styles

### Use SCSS Modules For (10%):
- Complex hover/active states
- Animation keyframes
- Deeply nested BEM structures
- Theme variants with multiple properties

## Proctor App UI Components

| Component          | Purpose                              |
| ------------------ | ------------------------------------ |
| `Header`           | Top bar with title, connection, logout |
| `Card`             | Container with border                |
| `Modal`            | Overlay dialog (violations, confirm) |
| `Table`            | Data display (students, violations)  |
| `StatusBadge`      | Colored status indicator             |
| `ConfirmationModal`| Danger action confirmation           |

## Critical Rules

1. **Tailwind First**: Always check if Tailwind can do it before writing SCSS
2. **No Global SCSS**: All SCSS must be modules (`.module.scss`)
3. **Clear Status**: Online/offline, violations, timer states must be instantly visible
4. **Touch Targets**: Minimum 44x44px for all interactive elements
5. **Font Mono**: Use `font-mono tabular-nums` for timers and session codes
6. **Consistent Borders**: Use `border border-gray-200` for card separation
