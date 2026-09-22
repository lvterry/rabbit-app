# Rabbit Student Web Design System

Official design system implementation for Student Web/H5 application.

## Design Tokens

### Colors

#### Primary Brand
```css
--color-primary: #10A050         /* Rabbit Green */
--color-primary-light: #E8F5EE   /* Light green backgrounds */
--color-primary-dark: #0D8040    /* Hover/active states */
```

#### Accent
```css
--color-yellow: #FFD04A          /* Yellow accent - use sparingly */
--color-yellow-light: #FFF9E5    /* Light yellow backgrounds */
```

#### Backgrounds (Paper-like)
```css
--color-background: #FFFFFF           /* Pure white surfaces */
--color-background-secondary: #F8F8F6 /* Main page background */
--color-background-tertiary: #F0F0ED  /* Subtle variations */
--color-surface: #FFFFFF              /* Cards and panels */
```

#### Text
```css
--color-text: #1A1A1A              /* Primary text */
--color-text-secondary: #6B6B6B    /* Secondary text */
--color-text-tertiary: #9B9B9B     /* Disabled/de-emphasized */
```

### Typography

#### Font Stack
```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
               'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 
               'Microsoft YaHei', system-ui, sans-serif;
```

**Note**: NO Clash Display font - system fonts only for best CJK rendering.

#### Sizes
```css
--font-size-xs: 12px    /* Labels, timestamps */
--font-size-sm: 14px    /* Secondary text */
--font-size-md: 16px    /* Body text */
--font-size-lg: 18px    /* Subheadings */
--font-size-xl: 24px    /* Headings */
--font-size-2xl: 28px   /* Page titles */
--font-size-3xl: 32px   /* Hero text */
```

#### Weights
```css
--font-weight-normal: 400    /* Body text */
--font-weight-medium: 500    /* Emphasized */
--font-weight-semibold: 600  /* Buttons, headings */
--font-weight-bold: 700      /* Strong emphasis */
```

### Spacing Scale
```css
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px
--spacing-2xl: 48px
```

### Border Radius (Large & Friendly)
```css
--radius-sm: 12px    /* Small elements, badges */
--radius-md: 16px    /* Buttons, inputs */
--radius-lg: 24px    /* Cards, panels */
--radius-xl: 32px    /* Large containers */
--radius-full: 9999px /* Pills, avatars */
```

### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05)
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07)
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1)
```

### Safe Area (iOS/WeChat)
```css
--safe-area-top: env(safe-area-inset-top, 0px)
--safe-area-bottom: env(safe-area-inset-bottom, 0px)
--safe-area-left: env(safe-area-inset-left, 0px)
--safe-area-right: env(safe-area-inset-right, 0px)
```

### Tap Targets
```css
--tap-target-min: 44px  /* Minimum for WeChat compatibility */
--tab-bar-height: 56px  /* Bottom navigation height */
```

## Components

### Layout
2-tab bottom navigation:
- 📚 我的课 (My Classes)
- 📅 预约 (Book)

### Buttons
- **Primary**: Green (#10A050), white text, large radius
- **Secondary**: White background, green text, border
- **Danger**: Red for destructive actions

All buttons have minimum 44px tap target.

### Cards
- Large border radius (24px)
- Subtle shadow
- White background
- Generous padding (24px)

### Empty States
- Centered content
- Optional playful emoji (🐰)
- Clear messaging
- Optional call-to-action button

### InfoBox (Serious Messaging)
Three types:
- **info**: Blue, informational
- **warning**: Yellow, cautionary (deduction rules, policies)
- **danger**: Red, critical warnings

## Copy Tone Guidelines

### Serious & Clear (Use InfoBox)
- Deduction rules
- Late cancellation policies
- Important warnings
- Policy explanations

Example:
> "本次改期已超过免费期限，需要额外消耗 1 节课。"

### Playful (Empty States & Success)
- Empty state messages
- Success confirmations
- Encouragement

Example:
> "🐰 暂无课程\n预约课程后会显示在这里"

## WeChat In-App Browser Compatibility

### Requirements Met
✅ Safe-area insets for notched devices  
✅ All tap targets ≥44px  
✅ No Service Worker dependency  
✅ No Push API dependency  
✅ Fast initial render  
✅ Works offline (with cached data)

### Testing Checklist
- [ ] Test in WeChat in-app browser (iOS)
- [ ] Test in WeChat in-app browser (Android)
- [ ] Verify safe-area on notched devices
- [ ] Verify tap targets on small screens
- [ ] Test without Service Worker support

## Screen Flow

### S01 - Home (我的课)
- Teacher cards with avatar
- Course list with remaining sessions
- "预约课程" button for each course
- Clean 2-tab navigation at bottom

### S02 - Booking (预约)
**Strict 3-step flow (≤3 taps to confirm):**

1. **Select Date (1/3)**
   - Calendar grid
   - Only available days highlighted
   - Unavailable days greyed out

2. **Select Time (2/3)**
   - Grid of available time slots
   - Clear time ranges
   - Easy scanning

3. **Confirm (3/3)**
   - Summary of date/time
   - Course details
   - Policy warnings if applicable
   - "确认预约" button

4. **Success**
   - ✓ Green check mark animation
   - Success message
   - "返回首页" button

### S05 - Invite (邀请)
**Optimized for fast first screen:**
- Centered card layout
- Teacher avatar
- "X 老师邀请你加入" heading
- Course list with remaining sessions
- One-tap "接受邀请" button
- Non-blocking bookmark prompt after acceptance

## Implementation Notes

### CSS Organization
```
web/src/styles/
├── tokens.css       # Design tokens (import first)
└── global.css       # Global styles and utilities
```

### Component Files
```
web/src/components/
├── Layout.tsx       # 2-tab navigation wrapper
└── UIComponents.tsx # Reusable UI components
```

### Token Usage
Always use CSS variables for consistency:

```tsx
// ✅ Good
<div style={{ 
  padding: 'var(--spacing-lg)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-primary)',
}} />

// ❌ Bad
<div style={{ 
  padding: '24px',
  borderRadius: '16px',
  color: '#10A050',
}} />
```

## Accessibility

- Minimum tap target: 44px (WeChat requirement)
- Color contrast: WCAG AA minimum
- Focus states: Visible focus indicators
- Labels: Semantic HTML and ARIA when needed

## Browser Support

- **Primary**: WeChat in-app browser (iOS/Android)
- **Secondary**: Safari (iOS), Chrome (Android)
- **Fallback**: Modern browsers with ES6+ support

## Future Considerations

- Dark mode support (tokens already structured for it)
- RTL language support
- Larger font size accessibility option
- High contrast mode

---

**Last Updated**: 2026-09-22  
**Version**: 1.0  
**Status**: Implemented in PR #11
