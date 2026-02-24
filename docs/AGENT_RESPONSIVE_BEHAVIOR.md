# AI Agent Responsive Design - Quick Reference

**Tech Stack**: React + TypeScript + Tailwind CSS  
**Min Width**: 360px (modern smartphones)  
**Max Width**: 1280px (max-w-7xl)  
**Approach**: Mobile-first responsive design  
**Breakpoints**: 2 only (768px, 1024px)

## Core Principle

**ALL UI must be responsive and work on ALL screen sizes from 360px to 1920px+**

The Proctor App has two main views:
- **Teacher dashboard**: Typically used on desktop/laptop (session monitoring)
- **Student exam view**: Used on any device (laptop, tablet, phone)

Both must work responsively across all screen sizes.

## Breakpoint System

| Size                | Range          | Device           | Tailwind Prefix     |
| ------------------- | -------------- | ---------------- | ------------------- |
| **Small** (Mobile)  | 360px - 767px  | Phones           | default (no prefix) |
| **Medium** (Tablet) | 768px - 1023px | Tablets          | `sm:`               |
| **Large** (Desktop) | 1024px+        | Laptops/Desktops | `lg:`               |

**Do NOT use**: `md:`, `xl:`, `2xl:` - stick to `sm:` and `lg:` only

## Critical Rules for All UI

### 1. Always Prevent Overflow

```tsx
<div className="flex min-w-0">
  <div className="flex-1 min-w-0">
    <p className="break-words">{dynamicText}</p>
  </div>
</div>
```

### 2. Text Must Wrap (Never Truncate)

```tsx
// ✅ ALWAYS use break-words for dynamic text
<h2 className="break-words">{studentName}</h2>

// ❌ NEVER use truncate (hides content)
<h2 className="truncate">{studentName}</h2>
```

### 3. Mobile-First Approach

```tsx
// ✅ Start with mobile, add larger breakpoints
<div className="text-base sm:text-lg lg:text-xl">

// ❌ Don't start with desktop
<div className="text-xl lg:text-base">
```

### 4. Stack on Mobile

```tsx
// ✅ Vertical on mobile, horizontal on desktop
<div className="flex flex-col sm:flex-row gap-3">
  <Button fullWidth className="sm:w-auto">Cancel</Button>
  <Button fullWidth className="sm:w-auto">End Session</Button>
</div>
```

## Standard Patterns

### Student Card Grid

```tsx
// Student monitoring grid (1 → 2 → 3 columns)
<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
  {students.map(student => (
    <StudentCard key={student.studentId} student={student} />
  ))}
</div>
```

### Page Container

```tsx
// ALWAYS use this pattern for page content
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 className="text-2xl sm:text-3xl">Session Monitor</h1>
</div>
```

### Typography Scaling

```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl">Title</h1>
<h2 className="text-xl sm:text-2xl">Section</h2>
<p className="text-sm sm:text-base">Body text</p>
```

### Buttons (Touch-Friendly)

```tsx
// Minimum 44x44px touch target
<button className="px-4 py-3 min-h-[44px] min-w-[44px] text-base">
  End Session
</button>

// Full width on mobile, auto on desktop
<Button fullWidth className="sm:w-auto">Submit</Button>
```

### Session Info Bar (Responsive)

```tsx
<div className="flex flex-wrap items-center justify-between gap-4 sm:gap-6">
  <div>
    <h2 className="text-xs font-bold text-gray-400 uppercase">Session Code</h2>
    <div className="text-2xl font-mono font-bold tracking-widest">{code}</div>
  </div>
  <div>
    <h2 className="text-xs font-bold text-gray-400 uppercase">Time Remaining</h2>
    <div className="text-2xl font-mono font-bold tabular-nums">{time}</div>
  </div>
</div>
```

## Testing Checklist (Before Committing)

Test at these widths:

- [ ] **360px** - Minimum width (no horizontal scroll)
- [ ] **768px** - Tablet (sm: breakpoint)
- [ ] **1024px** - Desktop (lg: breakpoint)

**What to check:**

- [ ] No horizontal scrollbar at 360px+
- [ ] Text wraps (no overflow)
- [ ] Student cards grid collapses (3→2→1)
- [ ] Buttons min 44x44px
- [ ] Session info bar wraps properly

## Critical Mistakes to Avoid

**Never:**

- Use fixed widths (`width: 500px`)
- Use `truncate` on dynamic text
- Forget `min-w-0` on flex children
- Use `md:`, `xl:`, `2xl:` breakpoints
- Test only on desktop

**Always:**

- Use `break-words` for text
- Add `min-w-0` to flex containers
- Test on 360px minimum
- Use `sm:` (768px) and `lg:` (1024px) only
- Stack vertically on mobile (`flex-col sm:flex-row`)

## Summary

**3 Rules to Remember:**

1. `min-w-0` + `break-words` = No overflow
2. `flex-col sm:flex-row` = Stack on mobile
3. Test at 360px, 768px, 1024px = Responsive verified
