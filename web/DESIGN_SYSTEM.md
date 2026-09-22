# 学员端 Web 实现备注

**权威设计规范**: 请参考 [`docs/ui-ux.md`](../docs/ui-ux.md)

本文档仅记录 Web 端特定的实现细节。

## 实现要点

### CSS 变量引用
内联样式中的 CSS 变量必须加引号，否则会导致运行时 ReferenceError：

```tsx
// ✅ 正确
style={{ backgroundColor: 'var(--color-surface)' }}

// ❌ 错误 - 运行时报错
style={{ backgroundColor: var(--color-surface) }}
```

### 组件文件
```
web/src/components/
├── Layout.tsx          # 2-tab 底部导航
└── UIComponents.tsx    # 可复用组件
```

### 样式文件
```
web/src/styles/
├── tokens.css          # 设计令牌 (从 docs/ui-ux.md 派生)
└── global.css          # 全局样式
```

## 技术约束

### WeChat 浏览器兼容
- 不依赖 Service Worker
- 不依赖 Push API  
- 完整 safe-area 支持
- 所有可点击元素 ≥44px

### Fixture 模式
开发时使用 fixture 数据测试：
```bash
VITE_USE_FIXTURES=1 npm run dev
```

---

**所有设计决策请参考**: [`docs/ui-ux.md`](../docs/ui-ux.md)  
**产品功能规范**: [`docs/mvp.md`](../docs/mvp.md)
