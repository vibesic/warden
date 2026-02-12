# AI Agent Responsive Design - Quick Reference

**Tech Stack**: React + TypeScript + Tailwind CSS + SCSS  
**Min Width**: 360px (modern smartphones)  
**Max Width**: 1280px (max-w-7xl) - ensures 3 columns max  
**Approach**: Mobile-first responsive design  
**Breakpoints**: 2 only (768px, 1024px)

## Core Principle

**ALL UI must be responsive and work on ALL screen sizes from 360px to 1920px+**

**Width Constraints:**

- Minimum: 360px (horizontal scroll appears below this)
- Maximum: 1280px (content centered with `max-w-7xl mx-auto`)
- Result: 3-column grid maximum on ultra-wide screens

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
// ALWAYS add to flex containers
<div className="flex min-w-0">
  <div className="flex-1 min-w-0">
    <p className="break-words">{dynamicText}</p>
  </div>
</div>
```

### 2. Text Must Wrap (Never Truncate)

```tsx
// ✅ ALWAYS use break-words for dynamic text
<h2 className="break-words">{title}</h2>

// ❌ NEVER use truncate (hides content)
<h2 className="truncate">{title}</h2>
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
  <Button fullWidth className="sm:w-auto">Save</Button>
</div>

// ❌ Always horizontal (bad for mobile)
<div className="flex gap-3">
```

### 5. Responsive Spacing

```tsx
// Use responsive padding for containers
<div className="px-4 sm:px-6 lg:px-8 py-6">

// Use consistent gap sizing
<div className="flex gap-3 sm:gap-4 lg:gap-6">
```

## Standard Patterns (Use These)

### Grid Layouts

```tsx
// Card grid (1 → 2 → 3 columns)
<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
  <Card />
</div>

// Stats grid (1 → 2 → 4 columns)
<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
  <StatCard />
</div>

// Two column (1 → 2 columns)
<div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
  <Card />
</div>
```

### Container Padding

```tsx
// Page container (ALWAYS use this pattern)
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 className="text-2xl sm:text-3xl">Title</h1>
</div>

// max-w-7xl = 1280px max width (centers content on large screens)
// mx-auto = centers the container
// Result: 3-column grid max, prevents ultra-wide layouts

// Content inside cards (fixed padding)
<Card>
  <div className="p-6">
    Content
  </div>
</Card>
```

### Typography Scaling

```tsx
// Headings
<h1 className="text-2xl sm:text-3xl lg:text-4xl">Main Title</h1>
<h2 className="text-xl sm:text-2xl lg:text-3xl">Section</h2>
<h3 className="text-lg sm:text-xl lg:text-2xl">Subsection</h3>

// Body text
<p className="text-sm sm:text-base">Body text</p>

// Small text
<span className="text-xs sm:text-sm">Caption</span>
```

### Buttons (Touch-Friendly)

```tsx
// Minimum 44x44px touch target
<button className="px-4 py-3 min-h-[44px] min-w-[44px] text-base">
  Tap Here
</button>

// Full width on mobile, auto on desktop
<Button fullWidth className="sm:w-auto">
  Submit
</Button>
```

### Images (Prevent Overflow)

```tsx
// ✅ Always responsive
<img
  src={url}
  alt=""
  className="w-full h-auto max-w-full"
/>

// ❌ Never fixed width
<img src={url} style={{ width: '500px' }} />
```

### Modals

```tsx
<Modal>
  <div className="max-w-lg w-full mx-4">
    <div className="px-4 sm:px-6 p-6">Content</div>
  </div>
</Modal>
```

## React Conditional Rendering

```tsx
// When you need different UI for different screens
import { useScreenFlags } from '@/hooks/useResponsive';

function Component() {
  const { isMobile, isTablet, isDesktop } = useScreenFlags();

  return (
    <>
      {isMobile && <MobileView />}
      {isDesktop && <DesktopNav />}
    </>
  );
}
```

## Show/Hide by Screen

```tsx
// Hide on mobile, show on tablet+
<div className="hidden sm:block">Desktop content</div>

// Show on mobile only
<div className="block sm:hidden">Mobile content</div>

// Different text
<span className="hidden sm:inline">Full Description</span>
<span className="sm:hidden">Short</span>
```

## Common Fixes

### Fix Horizontal Scroll

```tsx
// Add to container
<div className="overflow-x-hidden max-w-full">

// Add to flex children
<div className="flex min-w-0">
  <div className="min-w-0 flex-1">
```

### Fix Text Overflow

```tsx
// Always use break-words
<div className="min-w-0">
  <p className="break-words">{text}</p>
</div>
```

### Fix Small Buttons

```tsx
// Add proper sizing
<button className="px-4 py-3 min-h-[44px]">
```

## Tailwind Class Patterns

```tsx
// Complete responsive component template
<div
  className="
  // Container
  max-w-7xl mx-auto
  px-4 sm:px-6 lg:px-8
  py-6 sm:py-8
  
  // Overflow protection
  min-w-0 overflow-hidden
  
  // Layout
  flex flex-col sm:flex-row
  gap-3 sm:gap-4 lg:gap-6
  
  // Or Grid
  grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
  
  // Text
  text-base sm:text-lg
  break-words
"
>
  Content
</div>
```

## SCSS Media Queries (When Tailwind Can't)

```scss
.custom-component {
  padding: 1rem;

  // Tablet (768px+)
  @media (min-width: 768px) {
    padding: 1.5rem;
  }

  // Desktop (1024px+)
  @media (min-width: 1024px) {
    padding: 2rem;
  }
}
```

## Testing Checklist (Before Committing)

Test at these widths in Chrome DevTools:

- [ ] **360px** - Minimum width (no horizontal scroll)
- [ ] **428px** - iPhone 14 Pro Max
- [ ] **768px** - iPad portrait (breakpoint)
- [ ] **1024px** - iPad landscape (breakpoint)
- [ ] **1920px** - Desktop

**What to check:**

- [ ] No horizontal scrollbar at 360px+
- [ ] Text wraps (no overflow)
- [ ] Buttons min 44x44px
- [ ] Grid collapses properly (3→2→1)
- [ ] Images don't overflow
- [ ] Spacing looks good at all sizes

## Critical Mistakes to Avoid

❌ **Never:**

- Use fixed widths (`width: 500px`)
- Use `truncate` on dynamic text
- Forget `min-w-0` on flex children
- Use `md:`, `xl:`, `2xl:` breakpoints
- Test only on desktop
- Use inline styles for responsive values
- Skip mobile testing

✅ **Always:**

- Use `break-words` for text
- Add `min-w-0` to flex containers
- Test on 360px minimum
- Use `sm:` (768px) and `lg:` (1024px) only
- Stack vertically on mobile (`flex-col sm:flex-row`)
- Use Tailwind responsive classes
- Use `max-w-7xl mx-auto` for page containers (1280px max)

## Quick Decision Tree

**Is it text content?**
→ Add `break-words`

**Is it in a flex container?**
→ Add `min-w-0` to parent AND child

**Is it a button?**
→ Add `min-h-[44px]` and `px-4 py-3`

**Is it a grid?**
→ Use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

**Is it spacing?**
→ Use `px-4 sm:px-6 lg:px-8`

**Is it text size?**
→ Use `text-base sm:text-lg lg:text-xl`

**Is it layout direction?**
→ Use `flex-col sm:flex-row`

## Implementation Workflow

1. **Write mobile styles first** (default, no prefix)
2. **Add tablet styles** with `sm:` prefix
3. **Add desktop styles** with `lg:` prefix
4. **Test at 360px** (check for horizontal scroll)
5. **Test at 768px** (check tablet layout)
6. **Test at 1024px** (check desktop layout)
7. **Verify text wrapping** (use long titles/content)
8. **Check touch targets** (buttons 44x44px minimum)

## Summary

**3 Rules to Remember:**

1. `min-w-0` + `break-words` = No overflow
2. `flex-col sm:flex-row` = Stack on mobile
3. Test at 360px, 768px, 1024px = Responsive verified

**Width Constraints:**

- Min: 360px | Max: 1280px (`max-w-7xl`)
- Always use `max-w-7xl mx-auto` for page containers

**Standard Responsive Pattern:**

```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
    <Card className="min-w-0">
      <div className="p-6">
        <h2 className="text-xl sm:text-2xl break-words">{title}</h2>
        <p className="text-sm sm:text-base break-words">{description}</p>
      </div>
    </Card>
  </div>
</div>
```

**Remember**: Every UI element you create MUST work from 360px to 1920px+. No exceptions.
