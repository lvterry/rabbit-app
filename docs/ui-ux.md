# Rabbit 视觉设计规范 (UI/UX)

**权威来源 — 产品视觉的唯一真值**

## 颜色 (Colors)

### 品牌色 (Brand Colors)
```
Primary Green: #10A050  (Rabbit 主色)
Yellow Accent: #F8C020  (强调色，谨慎使用)
```

### 背景色 (Backgrounds)
```
Page/App Background: #F7F6F3  (纸质感背景)
Surface (Cards):     #FFFFFF  (白色卡片/面板)
```

### 状态色 (Status Colors)
```
Success: #10A050  (与主色相同)
Warning: #C98500  (琥珀色 — 不使用品牌黄)
Danger:  #D94841  (错误/危险)
```

### 文字色 (Text)
```
Primary:   #1A1A1A
Secondary: #6B6B6B
Tertiary:  #9B9B9B
```

### 边框/分隔线 (Borders)
```
Border:  #E5E5E0
Divider: #EFEFEB
```

## 排版 (Typography)

### 字体栈 (Font Stack)
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', 
'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 
'Microsoft YaHei', system-ui, sans-serif
```

**禁止使用 Clash Display** — 系统字体栈优先，保证 CJK 最佳渲染

### 字号 (Sizes)
```
xs:  12px  (标签、时间戳)
sm:  14px  (次要文字)
md:  16px  (正文)
lg:  18px  (小标题)
xl:  24px  (标题)
2xl: 28px  (页面标题)
3xl: 32px  (Hero)
```

## 圆角 (Border Radius)

```
sm: 12px  (小元素、徽章)
md: 16px  (按钮、输入框)
lg: 24px  (卡片、面板)
xl: 32px  (大容器)
```

**大圆角设计** — 亲和、现代的视觉感受

## 间距 (Spacing)

```
xs:  4px
sm:  8px
md:  16px
lg:  24px
xl:  32px
2xl: 48px
```

## 阴影 (Shadows)

```
sm: 0 1px 2px rgba(0, 0, 0, 0.05)
md: 0 4px 6px rgba(0, 0, 0, 0.07)
lg: 0 10px 15px rgba(0, 0, 0, 0.1)
```

卡片使用 `shadow-sm` 即可，不要过重

## 安全区域 (Safe Area)

**iOS / WeChat 浏览器兼容**

```css
padding-top: env(safe-area-inset-top, 0px);
padding-bottom: env(safe-area-inset-bottom, 0px);
padding-left: env(safe-area-inset-left, 0px);
padding-right: env(safe-area-inset-right, 0px);
```

## 触摸目标 (Tap Targets)

**最小 44px** — WeChat 浏览器要求

所有可点击元素必须满足最小触摸尺寸

## 导航 (Navigation)

### 学员端 Web (2 个 Tab)
```
1. 我的课 (My Classes)
2. 预约 (Book)
```

**不要第三个 tab** — 保持简洁

Tab 图标使用简单线条 SVG，不用 emoji

## 插图与图标 (Illustrations & Icons)

### 空状态
- 默认**不使用 emoji**
- 简短文案 + 一个主要操作按钮
- 成功页面可以有一句轻松的文案，但不要依赖 emoji 传达品牌

### Tab 图标
- 简单线条 SVG
- Things-like 风格
- 不要 emoji (不用 📚📅)

## 文案语气 (Copy Tone)

### 严肃清晰 (规则/政策)
用于扣课时规则、迟到取消政策、重要警告

示例:
> 本次改期已超过免费期限，需要额外消耗 1 节课。

### 轻松友好 (成功/空状态)
成功确认可以有一句轻松的文案，但要克制

示例:
> 预约成功，已为你安排课程

**避免过度使用 emoji 或卡通化语气**

## 实现注意事项

### WeChat 浏览器
- 不依赖 Service Worker
- 不依赖 Push API
- Safe-area 支持必须完整
- 所有触摸目标 ≥44px

### 内联样式
CSS 变量必须加引号:
```tsx
// ✅ 正确
style={{ backgroundColor: 'var(--color-surface)' }}

// ❌ 错误 (运行时 ReferenceError)
style={{ backgroundColor: var(--color-surface) }}
```

---

**版本**: 1.0  
**更新**: 2026-09-22  
**状态**: 权威规范 — 所有产品实现以此为准
