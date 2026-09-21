# 实现说明（给开发与后续迭代用）

对应 `docs/mvp.md`（产品主文档：页面清单 §16、用户故事 §19、空状态 §18、展示口径 §6.6）
+ `docs/auth-model.md`（身份与鉴权模型：Principal、每个接口的鉴权分类）
+ `docs/slot-algorithm.md`（Slot 算法 §3、接口契约 §6、错误码 §6.5、性能 §7）
+ `docs/data-model.md`（数据层；PostgreSQL 表设计、九条不变式的保证层级、关键事务）。

这份文档只讲**这个仓库怎么组织**、页面该调什么、展示口径是什么。

> 技术栈：老师端是**原生 iOS App**（SwiftUI / 最低 iOS 17 / `@Observable` + async-await），
> 学员端是**响应式 Web/H5**（手机浏览器优先、零安装），后端是**自有 REST API**（Node.js + TypeScript）
> + **PostgreSQL 16**（托管部署推荐 Supabase）。
>
> 本文档**不复述**产品逻辑的来源：Booking 状态机、课时模型、取消与扣课时规则、并发与幂等协议，
> 一律以 `docs/mvp.md` 与 `docs/slot-algorithm.md` 为准。本文只做"落到仓库与页面"的那一层。

---

## 0. 四条贯穿全篇的落点

| 落点 | 具体约定 |
|---|---|
| 业务逻辑只有一份 | 放在 **API 服务**里（`api/src/domain/`）；两个客户端都只是展示服务端返回的结果 |
| 客户端不做业务判断 | 客户端**不算**时区、**不拼**条件、**不拼**展示串：`startLocal` / `timeRange` / `dateLabel` / `balanceText` 全部来自服务端 |
| `actions` 是唯一判断入口 | 由服务端在 Booking 视图模型里算好（撤销窗口、已开始、改期上限都在服务端），客户端只读不算（`docs/mvp.md` §10.7） |
| 列表刷新是显式的 | iOS：`.task` + `scenePhase` / 显式 `refresh()`；Web：路由进入 + `staleTime` 失效 |

---

## 1. 仓库结构

目标 monorepo 布局（当前仓库还只有 `docs/`，以下是**待建立**的结构）：

```
Rabbit/
  docs/                        产品与实现文档（唯一事实来源）
    mvp.md                     ★ 产品主文档
    auth-model.md              ★ 身份与鉴权模型（Principal、接口鉴权分类）
    slot-algorithm.md          ★ Slot 算法 + 接口契约 + 错误码
    data-model.md               数据层（PostgreSQL：字段/不变式/事务）
    impl-guide.md              本文档
  packages/
    shared/                    ★ 跨端共享：TypeScript 类型 + 校验 schema + 纯函数常量
      src/types.ts             实体与视图模型类型（Booking / Slot / PackageView / ErrorCode…）
      src/schemas.ts           zod schema：请求体校验 + 响应形状（API 与 Web 共用）
      src/errors.ts            错误码枚举 + HTTP 状态映射 + 默认文案
      src/constants.ts         ruleOptions、weekdayLabels、reason 文案
  api/                         Node.js + TypeScript REST 服务（唯一业务实现）
    src/domain/                ★ 纯业务：slot.ts / booking.ts / package.ts / cancelPolicy.ts
    src/routes/                HTTP 层：auth / teacher / students / courses / availability
                               / packages / transactions / slots / bookings / system
    src/db/                    PostgreSQL 访问：migrations/ + repositories/（SQL 只在这里）
    src/jobs/                  settle.ts（自动结算）/ reconcile.ts（对账）
    src/middleware/            auth / idempotency / ratelimit / error → {ok:false}
    test/                      集成测试（真 Postgres，跑 docker compose）
  web/                         学员端 Web/H5（Vite + TypeScript）
    src/routes/                InviteRoute / HomeRoute / BookingsRoute / BookingDetail / BookRoute
    src/api/client.ts          fetch 封装：信封解包、错误码 → 动作、token 刷新
    src/state/                 session / query 缓存
  ios/                         老师端 iOS App
    Rabbit.xcodeproj
    Rabbit/                    App 层：Features/ Views/ Resources/
    Packages/RabbitKit/        ★ SwiftPM 包：APIClient / DTO / Repository / ViewModel / 通用组件
      Tests/RabbitKitTests/    ViewModel 与 DTO 单测（不需要模拟器）
  spec-tests/                  规格符合性测试：Slot 22 项 + 并发 16 项（跨语言不变基线）
  docker-compose.yml           本地 PostgreSQL 16
  pnpm-workspace.yaml
  package.json                 顶层脚本：dev / test / db:migrate（见 §9）
```

### 依赖方向（**单向，不要出现反向引用**）

```
packages/shared  ←── api       （类型 + schema + 错误码；shared 不依赖任何运行时）
packages/shared  ←── web       （仅 Web 端使用类型；共享包与 api 通过 OpenAPI 或手写 DTO 对齐）
docs/            ←── 全部       （文档是契约来源，代码里不要出现文档里没有的规则）
ios/             ←── 独立      （不依赖 TS 生态；DTO 手写并与 api 的响应字段逐字段对齐）
api/domain       ←── api/routes / api/jobs（domain 是纯函数，不 import db、不 import express）
```

**为什么业务逻辑只有一份**：`docs/slot-algorithm.md` §1 要求"展示（L1/L2）与创建（L3）调用同一个实现"。
这句话的含义是：`api/src/domain/slot.ts` 的 `computeSlots` 同时服务于
`GET /v1/.../slots`（L1）、确认前重拉（L2）与 `POST /v1/bookings` 事务内的复核（L3）。
**客户端不持有任何一份 slot 实现**——这是必须守住的边界。

> ❌ 不要在 iOS 或 Web 里实现第二份"可用时段"或"能不能取消"的判断。
> 一旦出现两份，`SLOT_TAKEN` 就会从"偶发"变成"常态"，而这正是 `docs/mvp.md` §18 里最伤体验的一条。

**写代码前必须记住的四条数据库约定**：

| 约定 | 做法 |
|---|---|
| 时间不重叠由数据库保证 | `EXCLUDE USING gist (teacher_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status = 'Upcoming')`（`docs/mvp.md` §13.1） |
| 查询没有条数上限 | 分页只按业务需要做（列表用 keyset 分页）；`slot-algorithm.md` §2 的区间查询仍然要一次覆盖整段，不要按天循环 |
| 学员绑定的唯一性 | 部分唯一索引 `UNIQUE (teacher_id, user_id) WHERE user_id IS NOT NULL`；免账号学员不参与该约束 |
| 跨表原子性 | 改期、完成、撤销都在**单个事务**里完成（`docs/mvp.md` §10.7 的"先取消后创建"）；必要时用 `SERIALIZABLE` 或显式 `SELECT … FOR UPDATE` |

---

## 2. iOS 客户端架构（老师端）

### 2.1 分层

| 层 | 职责 | 不做什么 |
|---|---|---|
| `View`（SwiftUI） | 渲染、把用户意图转成 ViewModel 调用 | 不发请求、不算业务条件、不格式化时间 |
| `ViewModel`（`@Observable`，`@MainActor`） | 持状态、调 Repository、暴露 `actions` 的直读属性 | 不拼 URL、不判 `canCancel` |
| `Repository` | 把 API 响应映射成领域模型、进程内缓存、刷新策略 | 不含 UI 文案 |
| `APIClient` | URL 组装、鉴权头、幂等键、信封解包、错误码 → `APIError`、超时与重试 | 不含业务分支 |
| `SessionStore` / `Keychain` | 存取 access/refresh token、当前老师资料 | 不参与业务判断 |

### 2.2 约定

```swift
@Observable @MainActor
final class TodayViewModel {
    private(set) var day: TeacherDayView?
    private(set) var isLoading = false
    private let repo: BookingRepository

    init(repo: BookingRepository) { self.repo = repo }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        day = try? await repo.teacherDay()   // 失败保留旧值，页面显示可重试条
    }
}
```

```swift
// 详情页完成课程后，列表必须立刻反映新状态
Button("完成课程") {
    Task {
        await detail.complete()      // POST /v1/bookings/{id}/completion（带幂等键）
        await today.refresh()        // 见 §8.2：SwiftUI 不会自动刷新，必须显式调用
    }
}
.disabled(!(detail.booking?.actions.canComplete ?? false))   // 判断来自服务端
```

### 2.3 导航结构

- 根：`TabView`，老师端 **4 个一级入口**（`docs/mvp.md` §16.1）：今天 / 日历 / 学员 / 我的。
- 每个 Tab 内部是 `NavigationStack`，`path` 由 `@Observable` 的 `Router` 持有，深链（APNs 点开）直接推入对应路由。
- 模态：`AddBookingView`、`AddStudentView`、`CourseEditView`、`AvailabilityExceptionView`、`RulesView` 用 `.sheet`；破坏性操作用 `.confirmationDialog`。
- 老师端**不出现**学员端页面；学员端页面在 Web，App 里只提供"分享邀请"入口。

### 2.4 目录结构

```
ios/Rabbit/Features/
  Today/TodayView.swift            TodayViewModel.swift
  Calendar/TeacherCalendarView.swift
  Bookings/TeacherBookingDetailView.swift  AddBookingView.swift
  Students/StudentListView.swift   StudentDetailView.swift   AddStudentView.swift
  Courses/CourseListView.swift     CourseEditView.swift
  Availability/AvailabilityView.swift      ExceptionEditorView.swift
  Profile/ProfileView.swift        RulesView.swift   OnboardingView.swift
  Invite/InviteShareView.swift     二维码 + ShareLink
ios/Rabbit/Packages/RabbitKit/Sources/RabbitKit/
  APIClient/{HTTPClient.swift,Endpoint.swift,Envelope.swift,APIError.swift}
  Auth/{SessionStore.swift,KeychainStore.swift,SignInWithAppleCoordinator.swift}
  DTO/…                           与 §5 的响应字段一一对应
  Repository/{BookingRepository.swift,StudentRepository.swift,…}
  ViewModel/…
  Components/{EmptyStateView.swift,BookingRow.swift,LoadingRetryView.swift}
```

### 2.5 本地缓存（取舍，明确说为什么）

| 数据 | 方案 | 理由 |
|---|---|---|
| token | Keychain | 系统级加密；不要放 `UserDefaults` |
| 老师资料、课程列表 | 内存（ViewModel 持有）+ 可选 `URLCache` | 变更频率低，冷启动重拉一次足够 |
| 今天 / 日历 / 学员列表 | **内存，不做持久化** | 这些列表的正确性依赖服务端最新状态（`actions`、余额），**缓存下来就会撒谎** |
| 图片（头像） | `URLCache` + 自定义 `URLSessionConfiguration` | 纯展示资源 |
| SwiftData | **MVP 不引入** | 引入即意味着要写同步、冲突与迁移；`actions` 与余额一旦离线缓存就与服务端漂移（`docs/mvp.md` §4.5 只增不删，错了很难自愈） |

> 结论：**MVP 用"内存 + 请求时刷新"**，不要为了"看起来更快"引入本地数据库。
> 真要离线，也要是只读快照并显著标注"数据来自 N 分钟前"，且**任何写操作前必须重新拉取**。

### 2.6 依赖注入与 Preview

- `AppEnvironment`（`@Observable`）持 `APIClient` / `SessionStore` / 各 Repository，通过 `.environment(env)` 注入。
- 所有 ViewModel 通过 `init(repo:)` 拿依赖，**默认参数只在 Preview 分支提供**，其余一律显式传入。
- Preview 用 `MockBookingRepository`（返回固定 fixture）：这是原来"`wx` 桩件做页面冒烟测试"的替代品。

```swift
#Preview {
    TodayView(vm: TodayViewModel(repo: MockBookingRepository.sampleToday))
}
```

---

## 3. Web 学员端架构

### 3.1 技术选型与理由

| 项 | 选择 | 为什么 |
|---|---|---|
| 构建 | Vite + TypeScript | 冷启动与 HMR 快；产物是纯静态资源，可放任意 CDN |
| 框架 | **Preact + `@preact/signals`** | 学员端页面极少（5 个路由），React 的运行时体积在这里换不来收益；Preact 兼容 JSX 心智、gzip 后十几 KB |
| 路由 | `wouter`（或等价的极小路由） | 5 条路由不值得一个 12KB 的路由库 |
| 服务端状态 | `@tanstack/query`（或 60 行的自研 `useQuery`） | slot 频繁变化，需要显式 `staleTime` + `invalidateQueries`，不要手写 loading/error 三态 |
| 样式 | 原生 CSS + CSS 变量（可选 UnoCSS） | 只要不引入运行时 CSS-in-JS，选哪个都行；深浅色用 `prefers-color-scheme` |

> 如果团队更熟 React，用 React 也可以——**真正的约束是首屏体积预算，不是框架品牌**。
> 但不要引入 Next.js/SSR：学员点是老师分享的静态链接，没有 SEO 需求，SSR 只增加部署面。

### 3.2 路由与"无登录直达邀请页"

| 路由 | 页面 | 鉴权 |
|---|---|---|
| `/i/:token` | S05 邀请绑定 | **公开**：`Pending` 时 token 本身即凭证（`slot-algorithm.md` §6.1 第 2 条）；**`Consumed` 时只认会话**（见约束 3） |
| `/` | S01 我的课 | 需要会话；**无会话时给中性提示** |
| `/bookings` | S03 我的课程 | 需要会话 |
| `/bookings/:id` | S04 预约详情 | 需要会话 |
| `/book?courseId=…&teacherId=…` | S02 预约（Step1–3） | 需要会话 |
| `/book?rescheduleBookingId=…` | S02 改期模式 | 需要会话 |

五条不能违反的设计约束：

1. **不做注册引导页、不做强制登录页**（`docs/mvp.md` §2.2 第 3 条 / §3.2）。首次进入 `/i/:token` 直接展示"X 老师邀请你加入"，点一下就进去了。
2. **接受邀请不需要任何账号**（`docs/mvp.md` §5.1 决定 5）：`POST /v1/invites/:token/accept` 用 token 直接换该学员的会话，`user_id` 保持为空。邮箱魔法链接与 Apple 登录只用于**可选的账号升级与找回**，不是入口。
   点击序列是 `打开链接 → 接受邀请 → 点课程卡 → 点「预约」→ 选日期 → 选时间 → 确认`，
   **从"进入预约流程"到"预约成功"≤ 3 次点击**（日期 → 时间 → 确认，`mvp.md` US-4）。任何"先看课程介绍页""先完善资料"的做法都会把 R1 直接打死。
3. **`/i/:token` 必须先解析会话，再决定展示什么**（`docs/mvp.md` §10.2《回到入口》、§19 US-10）：
   - `Consumed` 且当前会话的 `studentId` 正是该邀请的 Student → **按 `redirectTo: '/'` 直接放行，这不是错误**
   - 其余无法证明身份的情况（无会话 / 会话属于别的学员 / `Expired` / `Revoked`）→ 提示"该邀请已被使用或已失效"，**响应与页面都不得包含老师姓名、学员姓名、课程名**
4. **接受成功后立刻 `history.replaceState('/')`**，并给一次可关闭的"加入书签 / 添加到主屏幕"提示。此后 `/` 是学员的**正式入口**，不要再让浏览器停在一次性 token 的 URL 上 —— 它会被加书签、加主屏幕、被浏览器同步、被截图转发。`/` 上无会话时给中性提示且**不展示任何数据**。
5. 会话存 access token（内存）+ refresh token（`httpOnly` cookie，`SameSite=Lax`）。
   **不要把 JWT 放 `localStorage`**：分享链接会在信息/邮件 App 的内置浏览器、Safari、Chrome 之间跳，XSS 面比 App 大。

### 3.3 首屏性能预算（学员多用手机流量打开分享链接）

| 指标 | 预算 | 做法 |
|---|---|---|
| JS（gzip，首屏） | ≤ 100 KB | 邀请页与预约流程分 chunk；日历组件 `import()` 懒加载 |
| LCP（4G） | ≤ 2.5 s | HTML 内联关键 CSS；邀请页所需数据随 HTML 首屏注入或首个 `fetch` 并行发起 |
| 请求数 | ≤ 3 个关键请求 | 静态资源合并；不要在邀请页预取 `bookable-days` |
| 图片 | 头像 ≤ 64px，`loading="lazy"` | 只用 WebP/AVIF |
| 字体 | 只用系统字体 | 中文字体文件动辄数 MB，直接放弃 Web font |

> 邀请页是**漏斗第一格**（`docs/mvp.md` §22.2）。这里多 200KB 流量，损失的是真实预约。

**首屏不能多一次往返（认证约束）。** Web 学员端的长效凭证在 HttpOnly Cookie、每次请求用短期 access token（`docs/auth-model.md` §6.1）。因此：

- **不能让 `/auth/refresh` 变成首屏的第二次往返。** 两条可行路径，选一条：
  1. 服务端渲染首屏时，**把首屏数据与短期 access token 一起发下来**；
  2. 若 Web 与 API **同源**，首屏直接用 Cookie 打业务接口（同源下 Cookie 自动带上，不需要先换 token）。
- 理由：学员端是"浏览器里的一跳"，认证上多一个 RTT 会直接压在 `docs/mvp.md` §22.2 的**首屏跳出率**上 —— 那是漏斗的第一格，多出来的延迟在这里的代价最高。

### 3.4 状态与错误回退

- `SessionStore`：`accessToken`（内存）+ 当前绑定身份（`teacherId / studentId`），刷新页面时用 refresh cookie 恢复。
- 服务端状态交给 query 缓存：`bookable-days` 在同一会话可缓存（`staleTime: 5min`），
  **但进入 Step2 与点"确认预约"前必须重新拉 `slots`**（L2，见 §4.5 与 `slot-algorithm.md` §7 的客户端缓存条）。
- 所有错误码 → 动作的映射集中在 `web/src/api/errorActions.ts` 一张表里（与 §4.4 表格一一对应），
  页面里不写散落的 `if (code === 'SLOT_TAKEN')`。

---

## 4. API 调用约定

### 4.1 请求与响应形状

```
POST /v1/bookings
Authorization: Bearer <JWT>
Idempotency-Key: 8f3c1e02-6f1a-4b3e-9a77-0b1c2d3e4f50
Content-Type: application/json
X-Client: ios/1.4.0  |  web/2026.03.1
```

成功（HTTP 2xx）：

```json
{
  "ok": true,
  "data": { "...": "见 §5" },
  "meta": { "generatedAt": "2026-02-20T02:11:00Z", "requestId": "req_9f2…" }
}
```

失败（HTTP 4xx/5xx）：

```json
{
  "ok": false,
  "code": "SLOT_TAKEN",
  "message": "这个时间刚被预约了，请选择其他时间。",
  "retryable": false,
  "details": { "date": "2026-03-03" },
  "requestId": "req_9f2…"
}
```

- `message` 是**给用户看的兜底文案**；客户端优先按 `code` 选自己的文案（`code` 才是契约，`message` 可以改）。
- `retryable` 明确"重试是否有意义"，客户端不要靠猜 HTTP 状态。
- `meta.generatedAt` 用于新鲜度判断（§8.9）；写操作（创建/完成/取消/改期）**不要**读它做判断。
- 版本前缀 `/v1`，见 §4.6。

### 4.2 鉴权

> **本节只讲客户端怎么做**（token 存哪、怎么刷新、401 怎么处理、Cookie 属性）。
> **身份模型与"哪个接口需要哪种 Principal"的唯一权威定义见 `docs/auth-model.md`**（§1 Principal、§3 接口鉴权分类、§5 实现纪律），本文不重复定义。

| 端 | 方式 |
|---|---|
| iOS 老师端 | Sign in with Apple → `POST /v1/auth/apple`（`identityToken` + `authorizationCode`）→ 换 access/refresh token；access token 存 Keychain，401 时用 refresh 换一次并重放原请求（只重放一次） |
| Web 学员端（**默认，免账号**） | 打开邀请链接 → `GET /v1/invites/{token}` 预览（免登录）→ `POST /v1/invites/{token}/accept` 消费 token，直接换取**该学员的会话**（httpOnly refresh cookie + 短期 access token）。**全程不出现登录页，不要求邮箱，不要求注册**。接受后 URL replace 成 `/`，此后 `/` 就是正式入口（`docs/mvp.md` §10.2《回到入口》） |
| Web 学员端（账号升级，可选） | 学员想换设备或找回访问时，可用 Sign in with Apple 或邮箱魔法链接把当前会话升级为正式账号，回填 `student.user_id` |
| 服务端 | 每个请求解析凭证 → `ctx.principal`（`Public` / `InviteToken` / `Student` / `User` 四种形态）。业务代码**只读 `ctx.principal`**，不读 `ctx.userId` / `ctx.studentSessionId`，也不读请求体/查询串里的 `teacherId` / `studentId`；**每个写接口在服务端重新判权**（`docs/auth-model.md` §3 / §5）。**没有 `TeacherPrincipal`** —— 老师是一种由数据推导的**能力**（`canActAsTeacher`），不是身份类型（`docs/auth-model.md` §1 / §2） |

**未认证与越权必须分开**（`docs/auth-model.md` §5）：缺凭证或凭证无法验证 → `401 UNAUTHENTICATED`（客户端刷新一次，仍失败则老师端回登录、Web 学员端回邀请页）；凭证有效但无权 → `403 FORBIDDEN`（不重试，显示"无权查看"并回上一级）。两者的客户端动作见 §4.4。

**refresh cookie 属性**：`HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/v1/auth`；access token 只放内存，不进 `localStorage`。

> **为什么 Web 学员端默认不要账号**（这条直接服务于 `docs/mvp.md` §2.2 的 R1）：
> 学员的替代方案是"给老师发一条微信"，成本约等于零。任何注册墙、邮件往返或第三方登录确认，
> 都会让绑定这一步变成漏斗里最容易掉的一环 —— 而它偏偏是第二步。
>
> **代价（必须知道）**：清空浏览器数据或换设备后，学员会失去访问权，需要老师**重新发送邀请**。
> 这是有意的取舍：把摩擦从"每一个学员、每一次进入"降级为"极少数情况下的一次找回"。
> 老师的 Student Detail 里有「重新发送邀请」入口（`docs/mvp.md` §10.2），这条退路已经存在。
>
> 因此 `student.user_id` **允许长期为空**，这是正常状态而不是异常状态。
> ⚠️ **判权不要依赖它**：服务端判据是 `principal.studentId` / `principal.teacherId` 与资源的匹配
> （`docs/auth-model.md` §3.2）；靠 `student.user_id` 会把默认路径的学员挡在门外。
> 依赖 `user_id` 的能力（"同一账号不能重复绑定同一老师"）只在学员升级为账号后才有意义 —— 见 `docs/data-model.md` §2.5。

**客户端不信任原则**（`docs/mvp.md` §7.4 的 L3）：客户端校验只为体验（提前置灰、少一次往返），
**服务端必须把每一条都重做一遍**：课程时长取 `course.durationMinutes`（不接受客户端传 `endAt`）、
额度、冲突、`minLeadHours` / `maxAdvanceDays`、Exception、`allowSelfBooking`，
一个都不能因为"客户端已经查过"而跳过。

### 4.3 幂等键

| 操作 | 幂等键 | 服务端 |
|---|---|---|
| 创建预约 | 客户端生成 UUID | `idempotency_record` 的**「主体 + key」唯一**：主体取 `ctx.principal` 的 `userId` / `studentId` 两个可空列，配两条部分唯一索引；24h TTL；同 key 不同 `requestHash` → 409 `IDEMPOTENCY_KEY_REUSED`。**免账号学员的创建 / 取消 / 改期同样有幂等**（他们没有 `userId`，由 `studentId` 承载主体）—— 见 `docs/auth-model.md` §4、`docs/data-model.md` §2.8 |
| 完成课程 / 撤销完成 / 取消 / 改期 | 同上（一次改期 = 一个新 Booking + 一个旧 Cancelled，**一个键覆盖整体**，`docs/mvp.md` §13.3） | 幂等键 + 状态条件更新双保险 |
| 自动结算 | 不需要（`booking_id` + `status='Upcoming'` 条件更新即天然幂等） | `UPDATE … WHERE id = $1 AND status = 'Upcoming'`，`rowCount = 0` 即视为已完成 |

```swift
// iOS：一次用户意图 = 一个 key，重试沿用同一个 key
let key = UUID().uuidString
try await api.post(.completeBooking(id), idempotencyKey: key)
```

### 4.4 错误码 → 前端动作对照表（`slot-algorithm.md` §6.5 + 客户端码）

> 这张表是**团队实际照做的依据**，逐条实现，不要只做通用错误弹窗。
>
> **权威性**：错误码的权威清单在 `docs/slot-algorithm.md` §6.5（契约层）。本表是它的**镜像**，
> 补充了客户端的具体文案与回退动作。两边如出现出入，以 `slot-algorithm.md` §6.5 为准，并回来修正本表。

| HTTP | code | 触发场景 | 前端必须做的事 |
|---|---|---|---|
| 409 | `SLOT_TAKEN` | 排他约束冲突（含 L3 检查失败） | **专属文案"这个时间刚被预约了，请选择其他时间。" + 重新拉 slot 列表 + 回到选时间这一步（Step2）并保留已选日期**，不能只弹通用错误 |
| 409 | `INSUFFICIENT_SESSIONS` | `available < 1` | 提示续课（"剩余课时不足，请联系老师续课"） |
| 409 | `BALANCE_GUARD_FAILED` | 老师侧手动调整课时越界（唯一入口 `apply_package_transaction` 的守卫未通过，`docs/data-model.md` §5.0） | 提示"调整后的余额不合法" + 刷新余额；不重试，让老师重新选择调整类型与数值 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 同 key 不同 `requestHash` | 客户端 bug，上报埋点；不重试，提示"请重试"并换新 key |
| 409 | `BOOKING_NOT_UPCOMING` | 状态已变（并发：已被取消/完成） | 刷新详情，不重试写操作 |
| 409 | `LATE_RESCHEDULE_INSUFFICIENT` | 逾期改期时可用课时不足（逾期改期要花两节：旧课时 penalty + 新预约各 1 节，`docs/data-model.md` §5.5 / `docs/mvp.md` §10.7） | 专属文案**"本次改期已超过免费期限，需要额外消耗 1 节课。当前剩余课时不足，请先联系老师。"** + 保留原预约并刷新详情（服务端已整体回滚，**原 Booking 仍为 `Upcoming`，不扣课时**）；引导联系老师，不重试 |
| 422 | `SLOT_OUTSIDE_AVAILABILITY` | 不在任何开放区间内 | 刷新 slot 列表 |
| 422 | `SLOT_IN_EXCEPTION` | 命中临时关闭 | 刷新 slot 列表 |
| 422 | `SLOT_TOO_SOON` | 违反 `minLeadHours` | 刷新 slot 列表 |
| 422 | `SLOT_TOO_FAR` | 违反 `maxAdvanceDays` | 刷新 slot 列表 |
| 422 | `SELF_BOOKING_DISABLED` | 课程不允许自主预约 | 提示联系老师 |
| 422 | `COURSE_ARCHIVED` | 课程处于 `Archived` 状态 | 提示联系老师 |
| 422 | `STUDENT_INACTIVE` | 学员已停用 | 提示联系老师 |
| 422 | `ALREADY_STARTED` | 学员试图取消已开始的课 | "这节课已经开始，请联系老师确认"（不显示取消入口） |
| 403 | `RESCHEDULE_LIMIT_REACHED` | 改期次数超上限 | "该课程已改期 N 次，请联系老师" |
| 403 | `UNDO_WINDOW_EXPIRED` | 超出撤销完成窗口 | 提示撤销窗口已关闭，入口隐藏 |
| 403 | `NOT_BOUND_TO_TEACHER` | 当前 Principal 与该资源不匹配（`Student` 会话的 `studentId` / `teacherId` 不符，或缺可用身份，`docs/auth-model.md` §3.2） | 引导走邀请流程 |
| 401 | `UNAUTHENTICATED` | token 缺失或无法验证 | 回到登录（老师端）；Web 学员端回邀请页 |
| 401 | `TOKEN_EXPIRED` | token 已过期 | 静默刷新一次；仍失败则同上 |
| 403 | `FORBIDDEN` | 越权访问他人资源 | 不重试；显示"无权查看"并回上一级 |
| 404 | `INVITE_NOT_FOUND` | 邀请不存在 | 明确文案 + "请联系老师重新发送" |
| 410 | `INVITE_EXPIRED` | 邀请已过期 | 明确文案 + "请联系老师重新发送" |
| 410 | `INVITE_CONSUMED` | 邀请已被使用，且**无法证明**当前访问者就是原学员 | 明确文案 + "请联系老师重新发送"；**页面不得包含老师 / 学员 / 课程名**。⚠️ 能证明身份时服务端**不会**返回这个码，而是返回 `alreadyAccepted` + `redirectTo`，客户端直接跳 `/`（`docs/mvp.md` §10.2《回到入口》） |
| 410 | `INVITE_REVOKED` | 老师已重发作废 | 明确文案 + "请联系老师重新发送" |
| 409 | `BOOKING_BUSY` | 账号级互斥/系统繁忙 | "系统繁忙，请重试"，保留已选内容 |
| 429 | `RATE_LIMITED` | 超过限流（`slot-algorithm.md` §6.1：单用户对同一老师 ≤ 60 次/分） | 按 `Retry-After` 退避，不弹错误 |
| 422 | `VALIDATION_FAILED` | 请求体不合法（`details` 给出字段） | 客户端 bug，上报 |
| 426 | `CLIENT_TOO_OLD` | 客户端版本低于最低支持版本 | 显示**阻塞式**升级提示（§4.6） |
| 5xx | `INTERNAL` | 服务端异常 | 可重试；**写操作重试必须带同一个幂等键** |
| — | `NETWORK_ERROR` | **客户端合成**（离线/超时/DNS） | **保留已选内容可重试**（`ui.retryable` 语义）；不重置表单、不回到 Step1 |

> `SLOT_TAKEN` 与 `NETWORK_ERROR` 是两条最容易被做成"通用错误弹窗"的路径，
> 而它们恰好分别对应 `docs/mvp.md` §18 的"时段被抢"与"网络失败"——两条都要求**保留用户已做的选择**。

### 4.5 客户端操作锁、超时与重试

| 项 | 约定 |
|---|---|
| 操作锁 | 提交按钮点击后立即 `disabled` 直到有响应（`isSubmitting`）。**这只是体验优化**，正确性由服务端幂等保证（`docs/mvp.md` §13.3 末句） |
| 超时 | 读接口 10s；写接口 20s（创建/改期走事务与锁）。超时按 `NETWORK_ERROR` 处理 |
| GET 重试 | 可自动重试 2 次，指数退避 300ms / 900ms。GET **必须无副作用** |
| POST 重试 | **只有带幂等键的写操作**才自动重试（同 key 重放是安全的）；登录、邮箱验证、`POST /invites` 这类无幂等键的写操作**不自动重试** |
| 网络失败 | **保留已选内容**（课程、日期、时间、备注），显示重试条；iOS 用 `NWPathMonitor`/`URLError` 区分离线与超时，离线时不发请求直接给离线态 |
| 刷新时机 | 从后台回前台（`scenePhase == .active`）：若 `generatedAt` 超过 60s，刷新当前页；不在后台轮询 |
| Step2 特例 | 进入 Step2（选时间）与点"确认预约"前**必须重新拉 `slots`**（L2），不吃缓存——`slot-algorithm.md` §7 明确写了这一条 |

### 4.6 版本策略（App 有旧版本长期留在用户手机上）

API 有 iOS 与 Web 两类客户端，而 **iOS 的旧版本永远在跑**（App Store 不会强制升级），
Web 是即时更新。因此：

| 机制 | 约定 |
|---|---|
| 路径版本 | 所有接口 `/v1`；破坏性变更开 `/v2`，`v1` 至少并行 3 个月 |
| 客户端版本头 | 每个请求带 `X-Client: ios/1.4.0`（或 `web/<build>`） |
| 最低版本检查 | `GET /v1/meta` 返回 `{ minIOSVersion, minWebBuild, upgradeMessage }`。**App 冷启动与回前台各查一次** |
| 强制升级 | 版本低于 `minIOSVersion` → 服务端所有业务请求返回 426 `CLIENT_TOO_OLD`，App 展示**阻塞式**页面（只有一个"去 App Store"按钮）。**不要用软提示**：老客户端会把新语义算错（例如新的 `actions` 字段缺失） |
| 加字段 | 服务端只加不改不删字段；客户端解码必须容忍未知字段（Swift `Decodable` 默认忽略未知字段，但**不要**把可选新字段写成非可选） |
| 字段语义变更 | 视为破坏性变更：新增字段而不是改旧字段（如 `dateLabel` 变了就加 `dateLabelV2`） |
| 服务端开关 | 用远端配置（`GET /v1/meta` 里带 `features`）控制灰度，不靠客户端硬编码 |

---

## 5. 接口清单（REST 风格）

约定：字段名与 `docs/mvp.md` §5.3 一致；**字段一律 camelCase**（`startAt` / `durationMinutes` / `allowSelfBooking`）。
时间既返回 UTC 毫秒（`startAt`）也返回本地展示串（`startLocal` / `endLocal` / `timeRange` / `date` / `dateLabel`），
**前端不要自己算时区**（`slot-algorithm.md` §8 / `docs/mvp.md` §14）。

> 🔎 **服务端算好的展示串，客户端一律照用（"不要重算清单"）**：
> `startLocal` / `endLocal` / `timeRange` / `dateLabel` / `createdLabel` / `expiresLabel` / `rangeLabel` /
> `amountText` / `balanceText` / `policyText` / `weekdayLabels` / `sourceLabel` / `sessionSourceLabel` /
> `cancelledByLabel` / `reasonText` / `next`。
> 客户端只做一件事：把它们放进 `Text(...)` / `<span>`。**任何形如 `startAt.formatted(...)`、
> `new Date(ms).toLocaleTimeString()`、`substring(11, 16)` 的写法都是 bug**（见 §8.1）。

### 5.1 身份

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `POST /v1/auth/apple` | `{identityToken, authorizationCode, fullName?}` | `{ userId, isTeacher, teacher\|null, students:[{teacherId,teacherName,teacherAvatarUrl,studentId,studentName}] }` |
| `POST /v1/auth/email/request` | `{email, inviteToken?}` | `{ sent:true }`（不透露邮箱是否已注册） |
| `POST /v1/auth/email/verify` | `{token}` | 同 `auth/apple` 的返回形状 + 会话 token |
| `POST /v1/auth/refresh` | （refresh cookie 或 body） | `{ accessToken, expiresIn }` |
| `GET /v1/me` | — | `{ user:{userId,nickname,avatarUrl}, isTeacher, teacher\|null, students:[…] }` |
| `GET /v1/meta` | — | `{ minIOSVersion, minWebBuild, features, serverTime }`（§4.6） |

### 5.2 老师资料与规则

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `GET /v1/me/teacher` | — | `{ teacher, ruleOptions }` |
| `POST /v1/me/teacher` | `{name, avatarUrl?, bio?}` | `{ teacher, created }` |
| `PATCH /v1/me/teacher` | 任意子集：`slotStepMinutes / minLeadHours / maxAdvanceDays / freeCancelHours / autoSettleHours / undoCompleteDays / maxReschedules` | `{ teacher }` |

`ruleOptions` 给出可选项：`{ slotStepMinutes:[15,20,30,60], minLeadHours:[0,1,2,6,12,24], maxAdvanceDays:[7,14,30,60], freeCancelHours:[6,12,24,48], autoSettleHours:[0,6,12,24,48] }`。
**选项值来自服务端，客户端不要硬编码**——Free/Pro 的功能差异（`docs/mvp.md` §21.2）要靠它下发。

### 5.3 课程

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `GET /v1/courses` | `{includeArchived?}` | `{ courses:[{courseId, name, durationMinutes, allowSelfBooking, status}] }` |
| `POST /v1/courses` | `{name, durationMinutes, allowSelfBooking?}` | `{ course }` |
| `PATCH /v1/courses/{courseId}` | `{name?, durationMinutes?, allowSelfBooking?}` | `{ course }` |
| `POST /v1/courses/{courseId}/status` | `{status:'Active'\|'Archived'}` | `{ course }`（**不删除**，`docs/mvp.md` §20） |

### 5.4 开放时间

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `GET /v1/availability` | `{includePast?}` | `{ rules, byWeekday:{'1'..'7':[rule]}, weekdayLabels, exceptions:[{…rule, wholeDay, rangeLabel}] }` |
| `POST /v1/availability/rules` | `{weekday(1-7), startMinute, endMinute}`<br>分钟必须是 5 的倍数 | `{ rule }` |
| `PATCH /v1/availability/rules/{ruleId}` | `{weekday?, startMinute?, endMinute?}` | `{ rule }` |
| `DELETE /v1/availability/rules/{ruleId}` | — | `{ deleted:true }`（软删除，`status='Deleted'`） |
| `POST /v1/availability/rules:copy` | `{fromWeekday, toWeekdays:[]}` | `{ created, skipped }` |
| `POST /v1/availability/exceptions` | `{onDate:'YYYY-MM-DD', wholeDay?, startMinute?, endMinute?, reason?}` | `{ exception }` |
| `DELETE /v1/availability/exceptions/{exceptionId}` | — | `{ deleted:true }` |

分钟 ↔ `HH:mm` 的转换在服务端用 `api/src/domain/time.ts` 的 `minuteToHHMM` / `hhmmToMinute`；
**客户端只发分钟数**，`rangeLabel` 由服务端给。

### 5.5 学员与邀请

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `GET /v1/students` | `{q?, status?}` | `{ students:[{studentId,name,contact,status,bound,boundAt,courseSummaries:[{courseId,courseName,remaining,reserved,available}],remainingTotal,nextBooking\|null}], stats:{total,unbound,active} }`，已按"最近课程时间"排序 |
| `GET /v1/students/{studentId}` | — | `{ student:{studentId,name,contact,status,bound,boundName,boundEmail,boundAt}, courses:[{courseId,courseName,durationMinutes,courseStatus,remaining,reserved,available}], packages:[{packageId,courseId,courseName,purchasedSessions,remainingSessions,status,createdAt,createdDate}], transactions:[…], upcoming:[brief], history:[{…brief,status}], invite\|null }` |
| `POST /v1/students` | `{name, contact?, courseId?, initialSessions?, note?}` | `{ student, package\|null, invite:{inviteId,token,url,expiresAt,expiresLabel,studentName} }` |
| `PATCH /v1/students/{studentId}` | `{name?, contact?, status?}` | `{ student }` |
| `POST /v1/students/{studentId}/invites` | — | `{ invite }`（旧的 `Pending` 自动置 `Revoked`） |
| `POST /v1/invites/{inviteId}/revoke` | — | `{ invite }` |
| `GET /v1/invites/{token}` | 免登录（带会话时按会话判定） | `Pending` → `{ teacher:{teacherId,name,avatarUrl}, studentName, courses:[{courseId,courseName,remaining}], expiresAt }`（**`remaining` 也走 §6.6 口径：只有一个未归档批次才带分母**）。**`Consumed` 且会话的 `studentId` 正是该邀请的 Student → `200 { alreadyAccepted:true, redirectTo:"/" }`**（服务端滑动续期会话，不新建）。其余情况（无会话 / 会话属于别的学员 / `Expired` / `Revoked`）→ 错误码，**响应体不含任何身份信息** |
| `POST /v1/invites/{token}/accept` | 免登录（token 即身份） | `{ alreadyAccepted, teacherId, teacherName, studentId, studentName, redirectTo:"/" }`。**幂等**：token 已 `Consumed` 且会话正是该 Student 时返回同一结果，**不新建会话、不改邀请状态** |

> `invite.token` 在 REST 里的对外形态是 **URL**：`url = https://<domain>/i/<token>`，
> 同时给 `token`（二维码离线生成用）。**客户端不要自己拼域名** —— `url` 由服务端按环境生成（staging 与 prod 的域名不同）。

### 5.6 课时

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `POST /v1/students/{studentId}/packages` | `{courseId, sessions, note?}` | `{ package, balance }`（**续课 = 新建批次**，`docs/mvp.md` §6.5） |
| `POST /v1/packages/{packageId}/transactions` | `{mode:'add'\|'deduct'\|'set', sessions, type?, note?}`（`mode='set'` 时必须带 `type`，见下） | `{ package, change?, balance }` |
| `POST /v1/packages/{packageId}/archival` | `{archived:boolean}` | `{ package }`（归档有余额时 UI 必须提示 §6.7） |
| `GET /v1/students/{studentId}/transactions` | `{limit?, cursor?}` | `{ items:[tx], nextCursor, hasMore }` |
| `GET /v1/me/transactions` | `{teacherId?}` | `{ items:[tx] }`（学员端只读） |

`tx = { transactionId, packageId, courseId, courseName, type, label, amount, amountText, beforeSessions, afterSessions, balanceText, note, createdAt, createdLabel }`。

**`POST /v1/packages/{packageId}/transactions` 的 `mode` → 流水类型映射**（`docs/mvp.md` §12、`docs/data-model.md` §2.1）：

| `mode` | 请求体 | 产生的 `type` | `purchased` 是否变动 |
|---|---|---|---|
| `add` | `sessions > 0` | `MANUAL_ADD` | **是**（与 `remaining` 同步上涨） |
| `deduct` | `sessions > 0` | `MANUAL_DEDUCT` | 否 |
| `set` | `sessions` = 目标值 | **由调用方显式指定**：`PURCHASE_ADJUSTMENT`（这批购买量记错了）或 `BALANCE_ADJUSTMENT`（消耗记错了） | `PURCHASE_ADJUSTMENT` 是；`BALANCE_ADJUSTMENT` 否 |

> ⚠️ **`set` 必须让老师显式选择纠的是哪一个，不能靠差值正负推断。** `7 → 8` 既可能是"这一批实际买了 8 节"
> （`PURCHASE_ADJUSTMENT`），也可能是"少扣了一节、消耗记错了"（`BALANCE_ADJUSTMENT`）——
> **同一个差值对应两种完全不同的账本语义**。iOS 的「调整课时」界面要给两个明确选项：
> "这批购买量记错了" / "消耗记错了"，并把选择作为 `type` 传给服务端；
> 服务端只看 `type`，**绝不看 `amount` 的正负**（`docs/data-model.md` §5.0）。

`balance = { remaining, reserved, available }`（学员端响应里 `reserved` 为 `null`，见 §7）。

### 5.7 可预约时间

| 方法 / 路径 | 入参 | 返回 |
|---|---|---|
| `GET /v1/teachers/{teacherId}/slots` | `{courseId, date, view?}` | `{ date, dateLabel, timezone, generatedAt, reason, reasonText, slots:[{startAt,endAt,startLocal,endLocal,timeRange,label}], balance }` |
| `GET /v1/teachers/{teacherId}/bookable-days` | `{courseId, from, to, view?}` | `{ timezone, generatedAt, reason, reasonText, days:[{date,dateLabel,weekday,weekdayLabel,slotCount}], balance }` |

- `view='teacher'` 表示老师本人视角：不检查是否允许自主预约、不加提前量/最远天数限制。
- `reason` 只出现在顶层，取值 `NO_AVAILABILITY / FULLY_BOOKED / INSUFFICIENT_SESSIONS / SELF_BOOKING_DISABLED / COURSE_ARCHIVED`，
  **绝不要逐 slot 输出原因，也不要展示"被谁占用"**（`docs/mvp.md` §4.3 / §17）。
- `from/to` 跨度上限 62 天，超出返回 422 `VALIDATION_FAILED`；`bookable-days` **只返回有 slot 的日期**。
- **两个接口都必须按 Principal 鉴权**：`Student` 会话（`studentId` + `teacherId` 与资源匹配）/ `User` 且 `canActAsTeacher(principal, teacherId)` 成立（老师本人，用 `view=teacher`）/ `InviteToken`（`Pending` 且未过期，用于绑定前预览）；不满足即拒绝（匿名 401、凭证有效但无权 403）。
  **不要用 `user_id = 当前登录用户` 判权**——免账号学员没有 `user_id`。不要因为"只是个时间列表"就放开匿名访问（`slot-algorithm.md` §6.1 / `docs/auth-model.md` §3）。
- **不要按天循环调用**：日历页一次 `bookable-days` 拿回整段区间，点进某一天才调 `slots`（`docs/mvp.md` §7 / `slot-algorithm.md` §7）。

### 5.8 预约

| 方法 / 路径 | 入参 | 关键返回 |
|---|---|---|
| `POST /v1/bookings` | `{ studentId?, courseId, startAt }` + `Idempotency-Key` | `{ bookingId, booking, outsideAvailability, warning }`（`endAt` 服务端推导） |
| `GET /v1/bookings/{bookingId}` | — | `{ booking, view, policy }` |
| `POST /v1/bookings/{bookingId}/completion` | + `Idempotency-Key` | `{ bookingId, alreadyCompleted, booking }` |
| `DELETE /v1/bookings/{bookingId}/completion` | — | `{ bookingId, booking }`（撤销完成，`docs/mvp.md` §10.5） |
| `POST /v1/bookings/{bookingId}/cancellation` | `{reason?}` + `Idempotency-Key` | `{ bookingId, policy, consumedSession, booking }` |
| `POST /v1/bookings/{bookingId}/reschedule` | `{newStartAt}` + `Idempotency-Key` | `{ bookingId, previousBookingId, policy, consumedSession, booking }` |
| `POST /v1/bookings/{bookingId}/settlement` | `{action:'complete'\|'mark_no_show'\|'cancel_free'}` | 完成或取消的结果（`docs/mvp.md` §10.8 的三个动作） |
| `GET /v1/me/teacher-day` | `{date?}` | `{ date, isToday, dateLabel, todayCount, completedCount, next, bookings[], pending[], hints }` |
| `GET /v1/me/teacher-calendar` | `{from, to, courseId?}` | `{ from, to, courseId, courses[], days:[{date,weekdayLabel,dayOfMonth,isToday,bookingCount,slotCount,bookings[]}] }` |
| `GET /v1/me/teacher-upcoming` | `{days?}` | `{ items:[booking] }` |
| `GET /v1/me/student-home` | — | `{ cards:[{teacherId,teacherName,teacherAvatarUrl,studentId,studentName,courses:[{courseId,courseName,durationMinutes,allowSelfBooking,remaining,purchased\|null,batchCount,available,exhausted,fullyReserved,nextBooking}],remainingTotal}], bound }`。**匿名会话下 `cards` 恒为 1 条**（会话是 `(studentId, teacherId)` 作用域，`docs/mvp.md` §5.1 决定 6）；只有升级为账号后才可能多条 |
| `GET /v1/me/student-bookings` | `{scope:'upcoming'\|'history'}` | `{ upcoming:[] }` 或 `{ history:[] }` |

**`POST /v1/bookings` 的请求体只有三个字段，`studentId` 的含义按 Principal 分叉**：

| Principal | `studentId` | `source` |
|---|---|---|
| 老师能力（`canActAsTeacher(principal, course.teacherId)` 成立） | **必须带** —— 老师要选学生；缺了就是 `422 VALIDATION_FAILED` | `TeacherCreated` |
| 学员自主（`canActAsStudent`） | **不接受** —— 带了就是 `422 VALIDATION_FAILED`，学生由 Principal 解析 | `SelfBooked` |

> **`source` 由服务端推导，客户端不能指定**（`docs/auth-model.md` §2.1）。
> 同一个理由下，**取消与改期也不需要 `by`**：
> - `POST /v1/bookings/{id}/cancellation` 只接受 `{ reason? }`；
> - `POST /v1/bookings/{id}/reschedule` 只接受 `{ newStartAt }`。
>
> **取消方由服务端从 Principal 推导** —— 它决定"免费取消 / 逾期扣课 / 老师取消"这三条**有金钱后果**的分支：
> `canActAsTeacher` 成立 → `cancelledBy = Teacher`（老师取消，免费）；否则必须通过 `canActAsStudent` → `cancelledBy = Student`（再按免费 / 逾期判定）。
> 把 `by` 交给客户端，等于把这三条分支的判定权交给用户（`docs/auth-model.md` §2.1）。

`booking` 视图模型（`view='teacher'` 时含 `remaining/reserved/available`，学员视角为 `null`）：

```
{ bookingId, teacherId, teacherName, studentId, studentName, courseId, courseName, durationMinutes,
  packageId, startAt, endAt, date, dateLabel, startLocal, endLocal, timeRange,
  status: 'Upcoming'|'Completed'|'Cancelled', source, sourceLabel,
  cancelledAt, cancelledBy, cancelledByLabel, cancellationPolicyResult, policyText, consumedSession,
  policySnapshotFreeCancelHours, rescheduledFromBookingId, rescheduledToBookingId, rescheduleCount, maxReschedules,
  settledAt, sessionStatus, sessionSource, sessionSourceLabel, createdAt, started,
  remaining, reserved, available,
  actions: { canComplete, canMarkNoShow, canCancel, canReschedule, rescheduleLimitReached,
             canUndoComplete, undoDeadline } }
```

**`actions` 是唯一判断入口，且由服务端算好**：撤销窗口（7 天）、是否已开始、改期次数上限、老师 vs 学员的差异，
全部在服务端判定。客户端只做 `if actions.canReschedule { … }`。

```swift
// ✅ 正确：直接读服务端判断
if booking.actions.canCancel { CancelButton() }
// ❌ 错误：客户端自己拼条件（时区、快照、上限全都可能算错）
if booking.status == .upcoming && Date() < booking.startAt.addingTimeInterval(-24*3600) { … }
```

### 5.9 系统任务（运维与演示用）

| 方法 / 路径 | 说明 |
|---|---|
| `POST /v1/system/settlements:run` | 跑一次自动结算（**定时任务调用的是同一个 domain 实现**，`docs/mvp.md` §10.8） |
| `POST /v1/system/reconciliations:run` | 跑一次对账，返回 `{ issues, errorCount, warnCount }` |
| `POST /v1/system/demo/reset` | 仅 dev/staging：重置演示数据（`DEMO_MODE=true` 时才挂载路由） |

> **对账（I4 巡检）是可选的监控，不是正确性的兜底。** 余额与账本的等价由数据库保证：
> 唯一 `SECURITY DEFINER` 入口 `apply_package_transaction` + 余额列**列级 `REVOKE`**（应用角色没有 `UPDATE (remaining_sessions, purchased_sessions)`）+ 流水 append-only（`docs/data-model.md` §1 / §5.0 / §2.6 网 3）。
> 对账只用来发现代码逻辑 bug、或有人绕过唯一入口直接改数字。

---

## 6. 页面清单与实现要点

老师端 = iOS 4 个一级入口（`TabView`）；学员端 = Web 路由。
所有列表页在**每次出现时重新拉数据**：iOS 用 `.task` + 回前台/详情页返回后的显式 `refresh()`（§8.2）；
Web 用路由进入 + query `staleTime` 失效。**不要只依赖首次加载**。

### 6.1 老师端（SwiftUI）

| 页面 | 视图 | 要点 |
|---|---|---|
| 启动 / 身份选择 | `RootView` + `OnboardingView` | Sign in with Apple 首次登录；`POST /v1/me/teacher` 建资料（**姓名即可**，规则可跳过，US-1） |
| T01 今天 | `TodayView` | 日期 + 今日课程数；下一节课卡片；**今日课程列表**（时间 / 学员 / 课程 / 剩余课时）；**待处理分组**（三个动作，§10.8）；快速创建预约；空状态显示下一次课程 |
| T02 日历 | `CalendarView` | 周切换器（上一周 / 下一周 / 回到今天）+ 每天的 Booking 数与可用时段数；点日期看当天列表；多课程时用课程筛选器决定"可用时段数"。**用一次 `bookable-days` 拿整周，不要逐日调 `slots`** |
| T03 预约详情（老师） | `TeacherBookingDetailView` | Upcoming：完成课程 / 标记未上课并扣课时 / 改期 / 取消；Completed：课时消耗 + 撤销完成（窗口内）+ 撤销截止时间；Cancelled：取消时间、取消方、是否扣课时；显示改期链条。**按钮显隐一律读 `actions`** |
| T04 老师代约 | `AddBookingView` | 学员 → 课程 → 日期 → 时间；**代约身份由服务端从 Principal 推导，客户端不发任何身份字段**（只带 `studentId` 用来选学生）；`outsideAvailability` 为 true 时用 `.alert` 弹"该时间不在你的开放时间内…仍要创建吗"；**同时支持改期模式**（从 T03 以 `.sheet(item:)` 带 `rescheduleBookingId` 进入，锁定学员与课程，提交时调 `POST /bookings/{id}/reschedule`）。老师代约**不检查 Availability 与提前/最远限制，但仍强制检查时间冲突**（§7.4） |
| T05 学员列表 | `StudentListView` | 搜索（**学员姓名**，用 `.searchable`，服务端 `q`）；未绑定标识 + 剩余课时 + 下一次课；按最近课程时间排序；空搜索结果显示"没有找到学员"（§18） |
| T06 学员详情 | `StudentDetailView` | 顶部摘要（剩余 N 节 · 已约 M 节）；批次列表（`remaining / purchased` + 状态 + 创建时间）；操作：续课 / 调整课时 / 创建预约 / 重新发送邀请 / 停用；入口：课时流水、历史课程 |
| T07 添加学员 | `AddStudentView` | 姓名 → 课程 → 初始课时 → 创建成功页展示邀请（`ShareLink` 分享 + **二维码**（`CIQRCodeGenerator`）+ 复制链接 + dev 模式下的"模拟学员打开"）。分享出去的是普通 https 链接 `https://<domain>/i/<token>`（永远在浏览器里打开），二维码是线下场景的补充 |
| T08 我的 | `ProfileView` | 首次进入 `onboarding=1` 时是引导（姓名即可，可跳过规则）；正常模式：资料编辑 + 课程/开放时间/预约规则入口 + **APNs 通知设置**（授权入口，§8.3）+ 演示工具（跑自动结算、跑对账、切换身份、重置数据，仅 `DEMO_MODE`） |
| T09 课程管理 | `CourseListView` + `CourseEditView` | 列表（名称/时长/状态）+ 新建/编辑/归档/恢复，**不删除** |
| T10 开放时间 | `AvailabilityView`（例外用 `ExceptionEditorView` sheet） | 每周规则（按 weekday，可多条）+ 复制到其他工作日 + 临时关闭（整天 / 区间，可删）。分钟用 `Picker`（5 的倍数），**不出现自由文本时间输入**；`rangeLabel` 用服务端返回 |
| T11 预约规则 | `RulesView` | 最少提前 / 最远可约 / 免费取消期限 / 自动结算 / 改期上限 / 撤销窗口，用 `Picker` + 服务端 `ruleOptions`；**改动只对之后创建的 Booking 生效**（规则快照 §8 / `docs/mvp.md` §8），页面要有一句说明 |
| 课时流水 | `TransactionListView` | 从 T06 进入；`before → after` 展示 + 加载更多（`cursor` + `hasMore`）；订单式倒序 |

### 6.2 学员端（Web）

| 页面 | 路由 / 组件 | 要点 |
|---|---|---|
| S01 我的课 | `/` → `HomeRoute` | 老师头像 / **老师姓名**；每个课程卡片：课程名 + **剩余 N 节**（§6.6）+ 下一节时间；主 CTA「预约课程」；未绑定状态引导。**匿名会话下固定一位老师**，只有账号升级后才显示老师列表（`docs/mvp.md` §5.1 决定 6）；无会话时给中性提示且**不展示任何数据**。**学员端不显示其他学员姓名**（§17） |
| S02 预约 | `/book` → `BookRoute`（Step1 日期 → Step2 时间 → Step3 确认） | 日期 → 时间 → 确认，**总共不超过 3 次点击**；只高亮有可用 slot 的日期（其余置灰）；**确认前重拉一次 slot（L2）**；`SLOT_TAKEN` 时给专属文案并自动刷新、**保留已选日期并回到 Step2**；**支持 `?rescheduleBookingId=`**（改期模式，逾期时先提示"此次改期将计为一次课程"）。确认页必须显示：课程 / 日期 / 起止时间 / 老师 |
| S03 我的课程 | `/bookings` → `BookingsRoute` | 两个 Tab：Upcoming / History |
| S04 预约详情（学员） | `/bookings/:id` → `BookingDetailRoute` | Upcoming：改期 / 取消（逾期取消前提示"此次取消将计为一次课程"）；已开始：只读 + "请联系老师确认"；**改期入口在 `actions.canReschedule` 为 false 时不显示**（不要显示后置灰） |
| S05 邀请绑定 | `/i/:token` → `InviteRoute` | token 从路径取；"X 老师邀请你加入" + 课程 + 接受邀请；**默认免账号：不要邮箱、不要注册**；**已消费但会话正是该学员 → 按 `redirectTo` 直接跳 `/`，不算错误**；无法证明身份 / 已过期 / 已作废 → 明确提示且**不泄露任何身份信息**；成功后 `history.replaceState('/')` + 一次可关闭的书签提示（`docs/mvp.md` §10.2《回到入口》、§19 US-10） |

> **S02 是 R1 的最后一格**（`docs/mvp.md` §22.2）。任何"确认页再加一步""先看课程介绍"
> 都会让这条漏斗掉一截。空状态与异常状态（`docs/mvp.md` §18）在 S02 里必须逐条实现：
> `available=0`、未来 7 天无 slot、日期全部置灰，各有专门的文案与"不显示预约按钮"的规则。

---

## 7. 展示口径（容易做错的地方）

| 规则 | 出处 |
|---|---|
| 学员端每个课程显示 **剩余 N 节**，只有一个未归档批次时才显示 `N / M` | §6.6 |
| **不向学员显示 `reserved`**；但 `available = 0` 时必须解释"你已预约的课程占用了全部剩余课时" | §6.6 / §18 |
| 老师端学员详情顶部显示 `剩余 N 节 · 已约 M 节` | §6.6 |
| 老师端批次列表逐批显示 `remaining / purchased` + 状态 | §6.6 |
| 已占用的时间对学员**只表现为不可预约**，不显示原因、不显示是谁 | §4.3 / §17 |
| 时间一律用服务端返回的本地串（`timeRange` / `dateLabel`），前端不做时区换算 | §14 |
| 归档有余额的批次要提示"归档后剩余 N 节将不可用于预约，记录仍会保留" | §6.7 |
| 已开始的课学员不能取消，文案"这节课已经开始，请联系老师确认" | §9.2 |
| 撤销完成窗口 7 天，超窗口不显示入口；已完成页面显示"系统自动结算"标识 | §10.5 / §10.8 |

**实现这一节的唯一手法**：把上表逐条变成测试（服务端响应断言 + 客户端组件测试 + 截图对比），
而不是写在文档里靠自觉。`reserved` 出现在学员端响应里这件事，只有测试能长期拦住。

---

## 8. iOS 与 Web 特有的坑

### 8.1 时区：客户端**不做**时区换算

服务端返回的 `startLocal` / `endLocal` / `timeRange` / `dateLabel` 就是**老师本地**（`Asia/Shanghai`）的展示串。
客户端直接用。

| 坑 | 后果 | 防线 |
|---|---|---|
| iOS 用 `Date.formatted()` / `DateFormatter`（默认设备时区）渲染 `startAt` | 学员在纽约打开链接，14:00 的课显示成 01:00 | 只渲染 `startLocal`；**禁用所有对 `startAt` 的本地格式化** |
| Web 用 `new Date(startAt).toLocaleTimeString()` | 同上，且不同浏览器输出格式还不一致 | 同上；`startAt` 只用于比较与排序，不用于显示 |
| 手工 `+8` 小时 | `Asia/Shanghai` 现在没有夏令时，测试全过，未来进海外必错一年两天 | 服务端用 `zoneinfo`/`Temporal` 做墙钟→UTC；客户端**零**时区代码（`slot-algorithm.md` §8） |
| "今天"用设备日期算 | 设备时区不同 → 打开的是"昨天" | "今天"的日期由服务端给（`teacherDay.date` / `isToday`） |
| 倒计时/剩余时间用 `Date()` 减 `startAt` | 设备时钟被改就错 | 用服务端 `serverTime`（`/v1/meta`）估算偏移 |

### 8.2 列表刷新：SwiftUI 不会自动刷新

"从详情页返回后列表是最新的"这件事在 SwiftUI 里没有现成的承载者：`.task` **只在视图首次出现时跑一次**
（依赖变化才重跑），返回上级**不会**重新触发。三种可靠做法：

| 做法 | 适用 | 说明 |
|---|---|---|
| **共享 ViewModel**（推荐） | 所有列表 | ViewModel 由上层 `@State`/environment 持有，详情页完成后直接调 `listVM.refresh()`；返回时列表已经是新数据 |
| `.onChange(of: scenePhase)` + `refresh()` | 跨 App 前后台 | 从后台回前台时刷新（并配合 `generatedAt` 新鲜度判断） |
| `.refreshable { await vm.refresh() }` | 兜底 | 下拉刷新；**不要**把它当唯一机制 |

```swift
TabView { TodayView(vm: today) … }
    .onChange(of: scenePhase) { _, phase in
        if phase == .active { Task { await today.refresh() } }
    }
```

> ❌ 不要用 `.onAppear` 里无脑 `Task { refresh() }`：SwiftUI 会重复调用，返回时会闪一下并且可能吞掉用户的滚动位置。

### 8.3 APNs：授权时机、不承诺必达、静默推送不可靠

| 项 | 约定 |
|---|---|
| 授权时机 | **不要在冷启动就弹**。首次进入"今天"或首次创建预约成功后（有明确价值时）再请求；`UNUserNotificationCenter.current().requestAuthorization` 被拒后**无法再次弹出**，只能引导去系统设置 |
| 设备 token | 每次启动都上报 `POST /v1/me/devices`（token 会变）；登出或换账号时置 `revokedAt`（服务端 `push_device.revoked_at`，`docs/data-model.md` §2.8）。**这是 Phase 2 的核心范围，不是可选项**（`docs/mvp.md` §24） |
| 首批推送内容 | **"新预约 / 取消 / 改期"三类面向老师的即时通知**（`docs/mvp.md` §15.2 / §24 Phase 2）。"逾期待处理"随自动结算一起在 Phase 3 上 |
| 投递 | 与业务写入**同事务**写 `notification_outbox`，由 worker 投递与重试。**不要在事务里调 APNs，也不要"提交后顺手发"**（`docs/data-model.md` §2.8 / §5.0） |
| 错误分流 | `BadDeviceToken` / `Unregistered` → **停止重试并置 `revoked_at`**；`503` / `TooManyRequests` → 退避重试（这类失败正是"顺手发一下"会静默丢掉的那种） |
| 点击行为 | 推送必须能**一键跳到那条 Booking**（`docs/mvp.md` §15.2），走 §2.3 的 `Router` 深链。详情页**重新拉取**，不复用推送里的数据 |
| 必达信息 | 关键状态必须在 App 内可见（`actions` / 列表刷新 / **「今天」的待处理计数**）。推送是**加速器**，不是数据通道 |
| 静默推送 | `content-available: 1` 不可靠（后台刷新被系统节流，用户关掉后台 App 刷新就完全收不到）。**不要用它做"后台同步"或"结算"** |
| 通知角标 | 用 `badge` 表示"今天待处理条数"，与 `pending` 分组一致；App 打开后清零 |

> 这里有一组容易混淆的判断，值得写清楚：**通知是"核心闭环的一部分"，同时又是"尽力而为"的。**
>
> 前者说的是**重要性** —— 老师不知道有新预约就可能不去上课，试点会因此得出错误结论，所以它必须在 Phase 2；
> 后者说的是**可靠性** —— APNs 会被用户关掉、会延迟、会丢，所以任何正确性都不能建立在它之上。
>
> 两句并不矛盾，落点是分开的：**推送要赶紧做，同时把「今天」的待处理计数做成可见的兜底。**

### 8.4 邀请链接永远走 Web（不要在 App 里 claim `/i/*`）

老师分享的是 `https://<domain>/i/<token>`。**它在任何设备上都在浏览器里打开** —— 装了 Rabbit App 的 iPhone 也一样。老师端 App **不 claim `/i/*`，也不 claim 任何 https 路径**。

MVP 明确**不需要**下面这三样，做了反而是错的：

| 不需要 | 原因 |
|---|---|
| `apple-app-site-association`（AASA） | 没有任何路径要交给 App |
| Associated Domains（`applinks:` entitlement） | 同上 |
| `.onOpenURL` / `continueUserActivity` 里处理 `/i/*` | 收到邀请的是学员，而老师端 App 里**没有任何学员端页面** |

**原因是一条产品事实，不是省事**：老师端 iOS 里没有学员端页面，而"老师同时是别人的学生"是产品明确支持的情形（`docs/mvp.md` §5.1 决定 1）。一个装了 Rabbit 的老师收到另一位老师的学员邀请时，如果 `/i/*` 被 App claim，Universal Link 会把他拉进 App —— 而 App 根本不知道怎么处理 `/i/token`。让 `/i/*` 留在 Web 是唯一简单的解：**老师和学员用的是同一个学员端页面**。

**那老师端 App 的深链用来做什么？** 只用于**推送点开**：走 APNs payload 里的 `bookingId`（`docs/mvp.md` §15.2），由 §2.3 的 `Router` 推入对应的 Booking 详情页。它**不是一条 https 链接**，和邀请流程无关。详情页**重新拉取**，不复用推送里的数据（§8.3）。

> **将来若要让网页跳进 App**（例如分享出去的预约详情链接），才需要 AASA + Associated Domains，并且**必须显式排除 `/i/*`**：
>
> ```json
> { "applinks": { "details": [ { "appIDs": ["<TeamID>.<bundleId>"], "paths": ["NOT /i/*", "/bookings/*"] } ] } }
> ```
>
> 这是给未来的说明，**不是当前依赖**。真做的时候要记住：AASA 必须是 `Content-Type: application/json`、无 `.json` 后缀、HTTPS 且无重定向；`paths` 用 `NOT /i/*` 把邀请路径排除掉；改了配置要留意 CDN 与苹果侧各自的缓存。另外，**在 App 内用 WebView 打开自己的链接不会触发 App 跳转**，需要显式拦截并转成 App 内路由。

**邀请的唯一落地页是 `docs/mvp.md` §16.2 的 S05**（`/i/:token` → `InviteRoute`），它在任何设备、任何浏览器里都必须自己完整可用。四种入口都要测（`docs/mvp.md` §10.2《回到入口》）：

| 场景 | 期望 |
|---|---|
| 刚收到链接，未装 App | Web 邀请页正常渲染 |
| 刚收到链接，**装了 App** | 同样落到 Web 邀请页（App 不 claim `/i/*`） |
| **老师账号打开别人的学员邀请** | 正常渲染 Web 版学员视图，**不做"请用 App 打开"的拦截** |
| **学员两周后回来点同一条已消费的链接** | 有会话 → 直接进「我的课」；会话已丢 → "请联系老师重新发送" |

> ⚠️ **微信内置浏览器里的会话不是永久的。** 学员清理微信缓存、换设备、或者在微信与 Safari 之间跳，都可能让 refresh cookie 消失。
>
> 这正是回访路径必须"**先看会话、再看 token**"的原因：只要会话还在，那条旧链接就是一条有效的回家路。
> 也正因如此，接受邀请后的**书签 / 添加到主屏幕提示**不是锦上添花 —— 它把入口从"聊天记录"搬到浏览器，是这条漏斗上最便宜的一次投入。

### 8.5 后台任务与自动结算：不要依赖客户端

自动结算（`docs/mvp.md` §10.8）**必须**在服务端跑：

- iOS 的 `BGTaskScheduler` 可能几小时到几天不执行，用户卸载就彻底停；Web 更不可能。
- 服务端：`node-cron`（单实例）或托管平台的 Cron（Supabase `pg_cron` / 平台 Scheduled Functions）每天多次调用
  `POST /v1/system/settlements:run`，实现与 `booking.settlePending` 共用同一个 domain 函数。
- **锚点是 `end_at`，不是 `start_at`**：候选集是 `status='Upcoming'` 且 `end_at + autoSettleHours < now()`。
  这正是"课程**结束** N 小时后老师仍未处理 → 自动完成"（`docs/mvp.md` §9.2 / §10.8、`docs/data-model.md` §7.2）；
  用 `start_at` 会让 3 小时的课在结束仅 21 小时后就被结算。
- 任务必须**幂等**（`status='Upcoming'` + `settled_at IS NULL` 条件更新），重跑只产生一条 Session。

### 8.6 日期/时间选择器

| 端 | 约定 |
|---|---|
| iOS | 用 `DatePicker`（`.graphical` / `.compact`）；**不要**自绘日历。日期选择先拉 `bookable-days`（整段区间一次），**只允许选中 `slotCount ≥ 1` 的日期**，其余置灰（`.disabled`）；选中日期变化后再拉 `slots` |
| Web | `<input type="date">` 的原生控件（手机上是系统滚轮，体验最好），配合 `min`/`max` = `from`/`to`；**不要**为了好看引入日期组件库（体积 + 移动端体验反而差） |
| 共同 | 只允许选有可用 slot 的日期：不要用"选完再报错"，要在选择器层就置灰；`min` = 服务端算出的最早可约日（不是设备今天），`max` = `now + maxAdvanceDays` |
| 时间选择 | 一律是**从 `slots` 返回的列表里选**，不是让用户自由输入时间。列表为空时展示顶层 `reasonText`（`slot-algorithm.md` §4 的四种文案） |

### 8.7 动态字体、深浅色、安全区、键盘

| 坑 | 处理 |
|---|---|
| 大字号（辅助功能）下表格/按钮文字被截断 | 用 `Text` + `.lineLimit(nil)`，卡片高度自适应（不要固定 height）；列表行用 `@ScaledMetric` 控制图标尺寸；**布局用 `VStack/HStack` 而不是绝对坐标** |
| 深浅色 | 只用语义色（`.primary` / `.secondary` / `Color(.systemBackground)`），不写死 `#FFFFFF`；Web 用 CSS 变量 + `prefers-color-scheme`；**阴影在深色下要换** |
| 安全区 | `TabView` + `NavigationStack` 自动处理大部分；自绘底部操作条要 `.safeAreaInset(edge: .bottom)`；Web 用 `env(safe-area-inset-bottom)`（iPhone 底部横条会挡住"确认预约"按钮——这就是漏斗最后一格被挡住） |
| 键盘遮挡 | 表单页（T07 添加学员、T04 备注）用 `ScrollView` + `.scrollDismissesKeyboard(.interactively)`；Web 输入邮箱时 `inputmode="email"` + `autocomplete`，并把提交按钮放在键盘上方可见区 |
| 横屏/小屏 | 学员端 Web 必须能在 iPhone SE 宽度（375pt）下完成"日期 → 时间 → 确认"，不要出现横向滚动 |

### 8.8 网络切换、请求重试与幂等

- 地铁/电梯里切网的典型现象是**请求已到达服务端但响应丢了**。客户端会重试，
  于是"创建预约"必须靠 `Idempotency-Key` 去重（同一个 key 重放返回同一结果，`docs/mvp.md` §13.3）。
- iOS 用 `URLSessionConfiguration.waitsForConnectivity = true` 短暂等待恢复，但**不要无限等**（20s 上限）。
- 4G→WiFi 切换时 `URLSession` 可能重发请求：GET 安全，POST 靠幂等键。
- **不要**在重试时重新生成 key：一次用户意图 = 一个 key，只有用户手动再点一次才算新意图。

### 8.9 客户端缓存与服务端状态不一致（`generatedAt` 新鲜度）

- 每个响应带 `meta.generatedAt`（服务端生成时刻）。客户端规则：
  | 场景 | 规则 |
  |---|---|
  | 展示型列表（今天/日历/学员列表） | `now − generatedAt > 60s` → 标脏，进入页面时刷新 |
  | `slots` | 进入 Step2 与点"确认预约"前**必须重拉**，不吃缓存（L2） |
  | `actions` / 余额 | **永远以最近一次的响应为准**，不做本地推算；挂起时间超过 60s 才允许刷新 |
  | 写操作 | 不读 `generatedAt`；服务端在事务内重新判定（L3） |
- App 长时间在后台再回来：先刷新再让用户操作（先渲染旧数据 + 顶部"正在更新"提示，不要白屏）。
- **绝不**把 `actions` 或余额缓存到本地数据库再离线判定（§2.5）——那会让客户端"以为自己能约"。

---

## 9. 开发与验证

### 9.1 本地怎么跑

```bash
# 依赖
pnpm install

# 1) PostgreSQL 16（本地）
docker compose up -d db          # postgres:16，映射 5432，卷持久化
pnpm db:migrate                  # api/src/db/migrations → SQL 顺序执行
pnpm db:seed                     # 演示数据：1 老师 / 3 学员 / 3 课程 / 若干 Booking

# 2) API 服务（默认 http://localhost:8787，/v1）
pnpm api:dev                     # tsx watch api/src/server.ts
curl localhost:8787/v1/meta

# 3) 学员端 Web（默认 http://localhost:5173）
pnpm web:dev                     # Vite；VITE_API_BASE=http://localhost:8787

# 4) 老师端 iOS
open ios/Rabbit.xcodeproj        # 选 iPhone 15 模拟器运行
#    环境：Scheme → Run → Arguments → Environment Variables
#    API_BASE_URL = http://localhost:8787（模拟器可直接用 localhost；真机用局域网 IP）
#    DEMO_MODE   = true
```

`docker compose up -d db` 起的是**和线上同一个大版本（PostgreSQL 16）**，
不要在本地用 SQLite 替身——`EXCLUDE USING gist`、部分唯一索引、`timestamptz` 行为都不同，
"本地过了线上挂"最常出在这三处。

### 9.2 测试分层

| 层 | 工具 | 覆盖什么 | 命令 |
|---|---|---|---|
| 规格符合性 | Node test（`spec-tests/`） | Slot 22 项 + 并发 16 项，**跨语言不变基线**，先让它全绿再写业务代码 | `pnpm test:spec` |
| Slot / 领域算法 | Vitest（`api/test/domain`） | V1–V20 向量、左闭右开边界、`computeSlots` 纯函数、取消政策快照、FIFO 批次 | `pnpm test:domain` |
| API 集成 | Vitest + 真 Postgres（`api/test/integration`） | US-1~US-8 验收标准、并发抢时段、额度、改期原子性、撤销、自动结算幂等、§17 权限（学员读不到他人）、对账 | `pnpm test:api` |
| iOS 单测 | `swift test`（RabbitKit） | DTO 解码（含未知字段容忍）、错误码→动作映射、ViewModel 状态机、`actions` 直读 | `swift test --package-path ios/Packages/RabbitKit` |
| iOS UI/冒烟 | `xcodebuild test` | 关键路径：登录 → 今天 → 完成课程 → 撤销；Preview 编译 | `xcodebuild test -project ios/Rabbit.xcodeproj -scheme Rabbit -destination 'platform=iOS Simulator,name=iPhone 15'` |
| Web 组件 | Vitest + Testing Library（`web/src/**/*.test.tsx`） | 邀请页渲染与过期态、`SLOT_TAKEN` 回退到 Step2 且保留日期、`available=0` 的文案、3 次点击路径 | `pnpm web:test` |
| 端到端 | Playwright | 老师（API 脚本代 App）+ 学员 Web 的完整闭环；邀请链接用普通浏览器与 `xcrun simctl openurl` 各验一次，确认都落在 Web（§8.4） | `pnpm test:e2e` |
| 全量 | — | 上面全部 + 迁移可从零重放 | `pnpm test` |

```bash
pnpm test              # 全量
pnpm test:spec         # 先跑这个：文档层的 38 项断言
pnpm lint && pnpm typecheck   # tsc --noEmit + eslint
```

**哪些原来靠静态检查的坑现在不用管了**：旧架构那种"目录 require 不写全名""标签不配对"
"自定义组件未声明""模板里写函数调用"全部消失——Swift 与 TS 都由编译器和 lint 拦住。
**新增要静态拦的**：类型共享（`packages/shared` 与 API 响应对齐，用 `zod` 生成/校验）、
`actions` 字段不被客户端重算（code review + 禁止在 `ios/` 与 `web/` 出现 `DateFormatter`/`toLocaleTimeString` 的 grep 规则）。

---

## 10. 从 mock 到线上

### 10.1 本地 mock 数据策略

| 方式 | 用法 |
|---|---|
| `DEMO_MODE=true`（API 环境变量） | 挂载 `/v1/system/demo/*` 路由：切换身份（老师/学员）、重置数据、生成演示邀请；**生产环境不挂载**，路由不存在比"隐藏入口"安全 |
| 种子数据相对"今天"生成 | 与旧 `seed.js` 同样的理由：写死日期第二天就全过期，演示立刻失效 |
| iOS Preview | `MockBookingRepository` 返回 fixture，不发网络请求（§2.6） |
| Web | `VITE_USE_FIXTURES=1` 时 `client.ts` 走本地 JSON，用于纯 UI 迭代 |
| 邮箱魔法链接 | 本地用 Mailpit（`docker compose up -d mailpit`，`http://localhost:8025`）接邮件，不要真发 |

### 10.2 环境配置

| 环境 | 域名 | 数据库 | 用途 |
|---|---|---|---|
| dev | `http://localhost:8787` | docker compose 的 Postgres 16 | 日常开发 |
| staging | `https://api.staging.<domain>` | 托管 Postgres（Supabase 独立项目） | 真机联调 / E2E / TestFlight |
| prod | `https://api.<domain>` | 托管 Postgres（Supabase，开启 PITR 备份） | 线上 |

- **邀请链接的 `<domain>` 在三套环境都不同**：Web 的邀请页（`/i/<token>`）在每套环境都不同，客户端不要自己拼域名，一律用服务端下发的 `invite.url`。**MVP 不配 AASA / Associated Domains**（§8.4），因此两个环境**不需要在 entitlements 上做区分**。
- 后端托管建议：Supabase（托管 Postgres + 备份 + `pg_cron` 跑结算/对账）。API 服务本身跑在
  Railway/Render/Fly 之类的常驻容器上；**不要用会休眠的免费实例**——自动结算与对账需要准时。

### 10.3 密钥与凭证管理

| 凭证 | 放哪 | 绝对不要 |
|---|---|---|
| Sign in with Apple 的 `.p8` / `client secret` | 服务端环境变量（托管平台的 Secret）；`client secret` 是 JWT，**每 6 个月会到期**，用启动时生成而不是手工粘贴 | ❌ 进仓库；❌ 进 iOS App（App 只需要 `identityToken`，不需要 client secret） |
| APNs `.p8`（auth key）+ `keyId` / `teamId` | 服务端 Secret | ❌ 进仓库；❌ 用 `.p12` 证书（会过期） |
| 数据库连接串 | 各环境 Secret；本地 `.env`（已 gitignore） | ❌ 进仓库 |
| JWT 签名密钥 | 每环境独立 Secret，**不要 dev/prod 复用** | ❌ 复用 → dev 的 token 能打 prod |
| 邮箱服务（魔法链接）API Key | 服务端 Secret | ❌ 进前端（Web 打包产物是公开的） |
| iOS 证书/描述文件 | Xcode 自动管理 或 CI 的 fastlane match 私有仓库 | ❌ 散落在开发者机器上 |

- 提交前检查：`git-secrets` / `gitleaks` 预提交钩子；`.gitignore` 必须包含 `.env*`、`*.p8`、`*.p12`、`GoogleService-Info.plist`。
- `.env.example` 进仓库（只含键名与假值），README 说明每个键去哪申请。

### 10.4 上线前检查清单

- [ ] `spec-tests` 22 + 16 全绿，且是在 `api/src/domain/slot.ts`（线上同一实现）上跑的
- [ ] `computeSlots` 是纯函数，L1/L2/L3 调的是**同一个函数**；客户端零 slot 实现
- [ ] 代码里搜不到 `+8` / `8 * 3600` / `DateFormatter` / `toLocaleTimeString`（§8.1）
- [ ] `actions` 的每个字段都有服务端测试；客户端没有自己拼 `canCancel` / `canReschedule`
- [ ] 学员端 `reserved` 为 `null`，且响应里不含其他学员信息（`docs/mvp.md` §17）
- [ ] `GET /slots` 与 `bookable-days` 匿名访问返回 401、凭证有效但越权返回 403，限流生效
- [ ] `EXCLUDE` 约束存在（`SELECT conname FROM pg_constraint WHERE conname = 'booking_no_overlap'`）
- [ ] 应用角色对 `lesson_package(remaining_sessions, purchased_sessions)` 无 `UPDATE` 权限，且 `apply_package_transaction` 是 `SECURITY DEFINER`（I4 的数据库级保证，`docs/data-model.md` §2.6 网 3 / §5.0）
- [ ] `bookings` 幂等键表 TTL 清理任务在线；自动结算与对账 cron 在线（**Phase 1 就要有，不留到最后**）
- [ ] `GET /v1/meta` 的 `minIOSVersion` 生效，426 分支在 App 里有阻塞页
- [ ] 邀请链接在装了 App 的真机上打开也落到 Web（App 没有 claim `/i/*`，§8.4）；`/i/:token` 的四种入口都测过
- [ ] 老师端 App 的推送深链走 APNs payload 里的 `bookingId`，没有依赖任何 https 链接
- [ ] 生产环境 `DEMO_MODE=false`（演示路由不存在）
- [ ] 密钥扫描通过；`.p8` / `.env` 未进仓库

---

## 附录：术语与文档权威性

- **产品与规则**：`docs/mvp.md`（§6 课时模型、§7 规则、§9 状态机、§10 流程、§11 取消规则、§13 并发幂等、§16 页面、§17 权限、§18 空状态、§19 用户故事）。
- **身份与鉴权**：`docs/auth-model.md`（Principal 的四种形态、只有 `User` / `Student` 两种持久身份、"老师"是能力而不是身份类型、每个接口的鉴权分类、幂等键挂在谁身上）。**"谁能做什么"以它为准**。
- **Slot 与接口**：`docs/slot-algorithm.md`（§3 算法、§4 两种空、§5 测试向量、§6 接口与错误码、§7 性能、§8 时区）。
- **数据层**：`docs/data-model.md`（PostgreSQL 表设计、九条不变式的保证层级、五个关键事务）。
- **本文档**只负责"仓库怎么组织、页面该调什么、展示口径是什么"。**冲突时以产品文档与 Slot 接口文档为准**，
  本文档若与它们不一致，是本文档需要改。
