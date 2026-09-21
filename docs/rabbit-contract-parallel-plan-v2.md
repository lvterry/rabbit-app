# Rabbit 开发契约与并行任务拆分 v2

> 依据：当前最新版 `README.md`、`docs/auth-model.md`、`docs/data-model.md`、`docs/mvp.md`、`docs/slot-algorithm.md`、`docs/impl-guide.md`。
>
> 目标：让 Backend Core、Backend API、Student Web、Teacher iOS、QA/Contract 多个 coding agent 可以并行开发，同时不产生第二套业务规则。
>
> 范围：优先覆盖 Phase 0–2，目标是在 Phase 2 结束时达到真实 pilot 可用。Phase 3（自动结算、完整流水与收尾能力）保留接口兼容，但不要求所有 agent 第一轮完成。

---

# 1. 权威来源与冲突处理

开发时按以下优先级理解文档：

1. `docs/mvp.md`：产品语义与用户行为
2. `docs/auth-model.md`：身份、能力、鉴权的唯一权威
3. `docs/data-model.md`：数据库约束、事务、幂等
4. `docs/slot-algorithm.md`：Slot 算法、Slot 接口、错误码唯一权威
5. `docs/impl-guide.md`：仓库、客户端与实现落点
6. 本文：只负责把上述决定冻结成并行开发契约与任务边界

若 coding agent 发现文档之间仍有冲突：

- 不允许自行选一个实现后继续写；
- 新建 `notes/contract-blockers/<agent-name>.md`；
- 写明：
  - 冲突位置；
  - 两种解释；
  - 对已有代码的影响；
  - 推荐方案；
- 等统一决定后再改 contract。

---

# 2. 全局开发原则

## 2.1 业务逻辑只有一份

业务规则只存在于 API 服务端：

```text
Slot 生成
Availability 判定
额度 / reserved / available
取消政策
逾期改期
课包 FIFO
Booking actions
老师 / 学员能力判断
时间展示串
```

Web / iOS 只消费服务端结果。

客户端禁止：

```text
自己实现 computeSlots
自己算 canCancel / canReschedule / canUndo
自己推断 late cancellation
自己做老师业务时区换算
自己算课时余额
```

## 2.2 Client contract first

Web / iOS 不等待真实 Backend。

并行开发统一使用：

```text
packages/shared            TS executable contract
contracts/fixtures         跨端 JSON fixtures
Mock Repository / Mock API
```

Backend 实现同一份 schema。

## 2.3 API 命名

```text
PostgreSQL: snake_case
JSON API:   camelCase
```

## 2.4 时间

数据库：

```text
timestamptz / UTC
```

API 同时返回机器值与展示值，例如：

```text
startAt
endAt
date
dateLabel
startLocal
endLocal
timeRange
```

客户端直接展示服务端提供的展示串。

---

# 3. 身份与能力契约

完全采用最新版 `auth-model.md`。

## 3.1 Principal

```ts
export type Principal = {
  kind: 'Public' | 'InviteToken' | 'Student' | 'User'
  userId: string | null
  studentId: string | null
  teacherId: string | null
  inviteId: string | null
}
```

只有两种持久身份：

```text
Student session
User session
```

**没有 `TeacherPrincipal`。**

老师是一种 capability：

```ts
canActAsTeacher(principal, teacherId)
```

学员也是资源关系上的 capability：

```ts
canActAsStudent(principal, student)
```

一个 User 可以同时：

```text
是自己的老师账号
+
是其他老师的学员
+
绑定多个老师
```

## 3.2 行为身份由服务端推导

以下字段不得进入客户端 API：

```text
source
by
asTeacher
```

服务端根据 Principal 与目标资源决定：

```text
Teacher capability -> TeacherCreated / cancelledBy=Teacher
Student capability -> SelfBooked / cancelledBy=Student
```

### `POST /v1/bookings`

老师代约：

```json
{
  "studentId": "uuid",
  "courseId": "uuid",
  "startAt": "ISO8601"
}
```

学员自主：

```json
{
  "courseId": "uuid",
  "startAt": "ISO8601"
}
```

规则：

```text
老师能力成立：
  studentId 必须提供

学员路径：
  studentId 禁止提供
  实际 Student 从 Principal / user binding 解析
```

`studentId` 在老师代约里只是“目标资源选择器”，绝不能被当成身份来源。

---

# 4. 会话与认证契约

## 4.1 iOS

```text
refresh token -> Keychain
access token  -> 短期 Bearer
```

## 4.2 Web

长期会话：

```text
HttpOnly
Secure
SameSite=Lax
Cookie
```

JavaScript 永远不能读长期 session / refresh token。

请求时使用：

```text
Authorization: Bearer <short-lived access token>
```

access token 只放内存。

禁止：

```text
localStorage
sessionStorage
IndexedDB
URL query
```

## 4.3 Refresh

```text
POST /v1/auth/refresh
```

Web 使用 HttpOnly Cookie 换短期 access token。

## 4.4 一个浏览器只有一个 session

Cookie 只有一个名字。

已有 User session 的人接受学员邀请：

```text
不创建 Student session
→ 将目标 Student 绑定到当前 User
→ 当前 User session 保持不变
```

匿名学员接受邀请：

```text
创建 Student session
→ 长期 token 写 HttpOnly Cookie
→ response 只返回短期 access token
```

---

# 5. 邀请链接契约

最新版文档已明确：

```text
/i/:token 永远走 Web
```

MVP：

```text
不配置 AASA
不配置 Associated Domains
Teacher iOS App 不 claim 任何 https 路径
```

老师分享：

```text
https://<web-domain>/i/<token>
```

客户端不得自己拼域名，使用服务端返回的：

```text
invite.url
```

## 5.1 Pending

```text
GET /v1/invites/:token
```

只预览，不消费。

## 5.2 Accept

```text
POST /v1/invites/:token/accept
```

默认匿名路径：

```text
consume invite
→ bind_at
→ Student session
→ Set-Cookie
→ accessToken
→ redirectTo="/"
```

已有 User session：

```text
consume invite
→ bind Student.user_id to current User
→ no new session
→ redirectTo="/"
```

## 5.3 Consumed revisit

当前 Student session 与 invite 匹配：

```text
200 alreadyAccepted=true
redirectTo="/"
```

无法证明身份：

```text
INVITE_CONSUMED
```

响应不得泄露：

```text
teacher name
student name
course info
```

接受成功后 Web：

```js
history.replaceState(null, '', '/')
```

---

# 6. API Envelope

完全采用最新版 `impl-guide.md`。

成功：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "generatedAt": "ISO8601",
    "requestId": "req_xxx"
  }
}
```

失败：

```json
{
  "ok": false,
  "code": "SLOT_TAKEN",
  "message": "这个时间刚被预约了，请选择其他时间。",
  "retryable": false,
  "details": null,
  "requestId": "req_xxx"
}
```

约定：

```text
code       = 稳定 contract
message    = 用户可见兜底，可调整
retryable  = 客户端是否值得自动/手动重试
details    = 可选上下文，不放敏感资源信息
```

---

# 7. 请求通用约定

所有 authenticated 请求：

```text
Authorization: Bearer <accessToken>
X-Client: ios/<semver> | web/<build>
```

需要幂等的写请求：

```text
Idempotency-Key: <UUID>
```

超时：

```text
GET   10s
WRITE 20s
```

自动重试：

```text
GET:
  最多 2 次
  300ms / 900ms

WRITE:
  只有存在 Idempotency-Key 时允许重试
  重试必须复用同一个 key
```

网络失败：

```text
客户端合成 NETWORK_ERROR
保留用户全部已选内容
```

---

# 8. 幂等契约

采用最新版 `data-model.md` 的推荐写法 A。

## 8.1 主体

`idempotency_record`：

```text
user_id    nullable
student_id nullable
```

恰好一个非空。

唯一性：

```text
(user_id, idempotency_key) where user_id is not null
(student_id, idempotency_key) where student_id is not null
```

`endpoint` 不进入唯一键。

## 8.2 推荐流程

不做“事务开始先占位”。

推荐：

```text
BEGIN
  执行业务逻辑
  写业务记录
  INSERT idempotency_record(
    state='Succeeded',
    responseStatus,
    responseBody
  )
COMMIT
```

并发同 key：

```text
请求 A 成功提交

请求 B 在唯一索引处等待
→ 23505
→ B 整个事务 rollback
→ 外层新开事务读取 A 的 idempotency_record

same endpoint + same requestHash
  -> replay response

different endpoint or different requestHash
  -> 409 IDEMPOTENCY_KEY_REUSED
```

## 8.3 不创建 Booking 级幂等唯一索引

明确禁止新增：

```text
booking_teacher_idem_key
booking_student_idem_key
```

幂等 key 不是权限凭证。

创建 Booking 的重复提交若幂等记录丢失，最坏退化成：

```text
booking_no_overlap
→ SLOT_TAKEN
```

不会创建重复预约。

## 8.4 需要 Idempotency-Key

```text
POST   /v1/bookings
POST   /v1/bookings/:id/completion
DELETE /v1/bookings/:id/completion
POST   /v1/bookings/:id/cancellation
POST   /v1/bookings/:id/reschedule
```

`settlement` 如果 Phase 3 实现，也按同一原则处理。

自动结算不需要请求级 key：

```text
bookingId + status='Upcoming'
```

即天然幂等。

---

# 9. 数据层不可突破的契约

## 9.1 Booking 冲突

数据库必须存在：

```sql
EXCLUDE USING gist (
  teacher_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
)
WHERE (status = 'Upcoming')
```

区间统一：

```text
[start, end)
```

背靠背允许。

## 9.2 课时余额

```text
remaining / purchased
```

只能经过：

```text
apply_package_transaction
```

应用角色不能直接 UPDATE 两个余额字段。

## 9.3 Ledger

`package_transaction`：

```text
append-only
```

不能：

```text
UPDATE
DELETE
TRUNCATE
```

## 9.4 SECURITY DEFINER

`apply_package_transaction`：

```text
owner = app_migrator
SECURITY DEFINER
SET search_path = pg_catalog, public
```

必须显式：

```sql
REVOKE ALL ON FUNCTION apply_package_transaction(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_package_transaction(...) TO app_rw;
```

## 9.5 purchased 规则

只看流水类型，不看 amount 正负。

购买量簇：

```text
PACKAGE_CREATED
MANUAL_ADD
PURCHASE_ADJUSTMENT
```

才修改 `purchased`。

包括 `REVERSAL` 在内的其他类型只修改 `remaining`。

Regression 必须包含：

```text
10/10
complete -> 9/10
undo     -> 10/10
```

---

# 10. Slot Contract

实现唯一位置：

```text
api/src/domain/slot.ts
```

同一实现同时用于：

```text
bookable-days
slots
POST booking L3 recheck
```

客户端没有 Slot 算法。

## 10.1 Endpoint

```text
GET /v1/teachers/:teacherId/bookable-days
GET /v1/teachers/:teacherId/slots
```

### 协作契约决定

虽然 `impl-guide.md` 的表格仍写有 `view?`，实际视图按照最新 `auth-model.md` / `slot-algorithm.md` 由服务端能力推导。

因此第一版 executable contract **不暴露 `view` query parameter**。

服务端：

```text
User + canActAsTeacher -> teacher view
Student/User + canActAsStudent -> student view
InviteToken -> invite preview view
```

如果实现中发现确实需要显式 `view` 才能处理“同一 User 同时有两种能力且目标资源相同”的歧义，先写 contract blocker，不自行增加 query 参数。

## 10.2 算法

必须遵守：

```text
[start,end)
UTC instant comparison
slot 从 AvailabilityRule 起点对齐
step != duration
```

`bookable-days`：

```text
一次查整个范围
禁止按天查数据库
只返回 slotCount >= 1 的日期
```

---

# 11. 错误码 Contract

权威来源：

```text
docs/slot-algorithm.md §6.5
```

Phase 0–2 至少冻结：

```text
SLOT_TAKEN
INSUFFICIENT_SESSIONS
BALANCE_GUARD_FAILED
IDEMPOTENCY_KEY_REUSED
BOOKING_NOT_UPCOMING
LATE_RESCHEDULE_INSUFFICIENT

SLOT_OUTSIDE_AVAILABILITY
SLOT_IN_EXCEPTION
SLOT_TOO_SOON
SLOT_TOO_FAR

SELF_BOOKING_DISABLED
STUDENT_INACTIVE
COURSE_ARCHIVED
ALREADY_STARTED

NOT_BOUND_TO_TEACHER
RESCHEDULE_LIMIT_REACHED
UNDO_WINDOW_EXPIRED
FORBIDDEN

UNAUTHENTICATED
TOKEN_EXPIRED

INVITE_NOT_FOUND
INVITE_EXPIRED
INVITE_CONSUMED
INVITE_REVOKED

BOOKING_BUSY
VALIDATION_FAILED
RATE_LIMITED
CLIENT_TOO_OLD
INTERNAL

NETWORK_ERROR
```

特殊客户端行为：

### SLOT_TAKEN

```text
保留 date
重新请求 slots
回到 Step2
显示专属文案
```

### LATE_RESCHEDULE_INSUFFICIENT

```text
保留原 Booking
刷新详情
不自动重试
```

### TOKEN_EXPIRED

```text
refresh 一次
成功 -> 重放原请求一次
失败 -> 当前身份失效
```

### NETWORK_ERROR

```text
保留全部表单/选择
同一用户意图重试沿用原 Idempotency-Key
```

---

# 12. Phase 0–2 Endpoint Freeze

这里只冻结当前并行开发真正需要的 endpoint。

## 12.1 Identity

```text
POST /v1/auth/apple
POST /v1/auth/email/request
POST /v1/auth/email/verify
POST /v1/auth/refresh

GET /v1/me
GET /v1/meta
```

## 12.2 Teacher

```text
GET   /v1/me/teacher
POST  /v1/me/teacher
PATCH /v1/me/teacher
```

## 12.3 Course

```text
GET   /v1/courses
POST  /v1/courses
PATCH /v1/courses/:courseId
POST  /v1/courses/:courseId/status
```

## 12.4 Availability

```text
GET    /v1/availability

POST   /v1/availability/rules
PATCH  /v1/availability/rules/:ruleId
DELETE /v1/availability/rules/:ruleId
POST   /v1/availability/rules:copy

POST   /v1/availability/exceptions
DELETE /v1/availability/exceptions/:exceptionId
```

## 12.5 Student / Invite

```text
GET   /v1/students
GET   /v1/students/:studentId
POST  /v1/students
PATCH /v1/students/:studentId

POST /v1/students/:studentId/invites
POST /v1/invites/:inviteId/revoke

GET  /v1/invites/:token
POST /v1/invites/:token/accept
```

## 12.6 Package

```text
POST /v1/students/:studentId/packages
POST /v1/packages/:packageId/transactions
POST /v1/packages/:packageId/archival

GET /v1/students/:studentId/transactions
GET /v1/me/transactions
```

## 12.7 Slots

```text
GET /v1/teachers/:teacherId/bookable-days
GET /v1/teachers/:teacherId/slots
```

## 12.8 Booking

```text
POST   /v1/bookings
GET    /v1/bookings/:bookingId

POST   /v1/bookings/:bookingId/completion
DELETE /v1/bookings/:bookingId/completion

POST /v1/bookings/:bookingId/cancellation
POST /v1/bookings/:bookingId/reschedule

GET /v1/me/teacher-day
GET /v1/me/teacher-calendar
GET /v1/me/teacher-upcoming

GET /v1/me/student-home
GET /v1/me/student-bookings
```

Phase 3 contract 先保留：

```text
POST /v1/bookings/:bookingId/settlement
POST /v1/system/settlements:run
POST /v1/system/reconciliations:run
```

## 12.9 Push Device

现有文档明确：

```text
POST /v1/me/devices
```

每次 App 启动上报 APNs token。

### 并行开发新增的请求/响应冻结

因为原文档只冻结了 endpoint，没有冻结 payload，这里补齐最小 contract：

Request:

```json
{
  "platform": "ios",
  "token": "<apns-device-token>",
  "environment": "sandbox"
}
```

Response:

```json
{
  "deviceId": "uuid",
  "registered": true
}
```

行为：

```text
同 token 再上报 -> upsert / refresh lastSeenAt
token 换 User -> 原 owner 解绑后绑定新 User
```

登出如何显式 revoke 目前原文档没有冻结 public endpoint。

第一轮不要擅自新增 DELETE route：
- Session/logout 实现如果确实需要客户端主动 revoke device；
- 由 Backend API agent 写 contract blocker；
- 再统一冻结。

---

# 13. 核心 DTO Freeze

## 13.1 BookingView

```ts
export type BookingView = {
  bookingId: string

  teacherId: string
  teacherName: string

  studentId: string
  studentName: string

  courseId: string
  courseName: string
  durationMinutes: number

  packageId: string

  startAt: string
  endAt: string

  date: string
  dateLabel: string
  startLocal: string
  endLocal: string
  timeRange: string

  status: 'Upcoming' | 'Completed' | 'Cancelled'

  source: 'SelfBooked' | 'TeacherCreated'
  sourceLabel: string

  cancelledAt: string | null
  cancelledBy: 'Student' | 'Teacher' | null
  cancelledByLabel: string | null

  cancellationPolicyResult:
    | 'FREE_CANCEL'
    | 'LATE_CANCEL'
    | 'TEACHER_CANCEL'
    | null

  policyText: string | null
  consumedSession: boolean

  policySnapshotFreeCancelHours: number

  rescheduledFromBookingId: string | null
  rescheduledToBookingId: string | null
  rescheduleCount: number
  maxReschedules: number

  settledAt: string | null

  sessionStatus: 'Active' | 'Voided' | null
  sessionSource: 'Manual' | 'AutoSettled' | null
  sessionSourceLabel: string | null

  createdAt: string
  started: boolean

  remaining: number | null
  reserved: number | null
  available: number | null

  actions: {
    canComplete: boolean
    canMarkNoShow: boolean
    canCancel: boolean
    canReschedule: boolean
    rescheduleLimitReached: boolean
    canUndoComplete: boolean
    undoDeadline: string | null
  }
}
```

客户端只读 `actions`。

## 13.2 SlotView

```ts
export type SlotView = {
  startAt: string
  endAt: string
  startLocal: string
  endLocal: string
  timeRange: string
  label: string
}
```

## 13.3 BalanceView

```ts
export type BalanceView = {
  remaining: number
  reserved: number | null
  available: number
}
```

学员视角：

```text
reserved = null
```

---

# 14. Executable Contract 组织

这是为了并行开发增加的协作约定，不改变产品语义。

仓库建立：

```text
packages/shared/
  src/
    types.ts
    schemas.ts
    errors.ts
    constants.ts
    index.ts

contracts/
  fixtures/
    auth/
    invites/
    students/
    slots/
    bookings/
  README.md
```

`packages/shared` 是 API / Web 的可执行 schema：

```text
TypeScript types
Zod request schemas
Zod response schemas
ErrorCode
constants
```

`contracts/fixtures` 是 Web / iOS / API test 的共同样例。

不要求第一轮引入 OpenAPI codegen。

理由：

```text
API + Web 本来就共享 TypeScript
iOS 独立 Swift DTO
fixtures 比再引入一层 OpenAPI generator 更轻
```

以后要生成 SDK 再加 OpenAPI。

权威关系：

```text
docs/
  ↓
packages/shared + fixtures
  ↓
API / Web

fixtures
  ↓
iOS DTO decode tests
```

---

# 15. Fixtures Freeze

Agent 0 必须创建至少这些 fixture：

```text
meta.json

auth/
  me-user-teacher.json
  me-user-teacher-and-student.json

invites/
  pending.json
  consumed-matching-session.json
  consumed-foreign-session-error.json
  expired-error.json

students/
  student-home-anonymous.json
  student-home-user-multi-teacher.json
  student-detail.json

slots/
  bookable-days.json
  slots.json
  no-availability.json
  fully-booked.json
  insufficient-sessions.json

bookings/
  upcoming-teacher.json
  upcoming-student.json
  completed.json
  cancelled-free.json
  cancelled-late.json

errors/
  slot-taken.json
  late-reschedule-insufficient.json
  token-expired.json
  network-error-client-only.json
```

---

# 16. 并行开发波次

## Wave 0

先只跑：

```text
Agent 0 — Repository + Contract Bootstrap
```

Merge 后从同一个 main commit 创建 worktrees。

## Wave 1

并行：

```text
Agent A — Backend DB + Domain
Agent B — Backend HTTP + Auth + Notifications
Agent C — Student Web
Agent D — Teacher iOS
Agent E — Contract QA + CI
```

## Wave 2

```text
Backend A/B integration
Web/API integration
iOS/API integration
E2E
pilot hardening
```

---

# 17. Agent 0 — Repository & Contract Bootstrap

建议 worktree：

```text
worktree/contract-bootstrap
```

下面内容可直接交给 coding agent。

---

## TASK — Rabbit Repository & Contract Bootstrap

你的任务是建立 Rabbit 的 monorepo 骨架与 executable contract。

### 必读

```text
README.md
docs/mvp.md
docs/auth-model.md
docs/data-model.md
docs/slot-algorithm.md
docs/impl-guide.md
docs/parallel-development-plan.md
```

### 文件所有权

你可以修改：

```text
package.json
pnpm-workspace.yaml
docker-compose.yml
.env.example

packages/shared/**
contracts/**

api/package.json
web/package.json

api/src/server.ts      只建立空服务
api/src/ports/**       建 interfaces

README 中必要的启动脚本说明
```

不要实现业务逻辑。

### 必须完成

1. 建 pnpm monorepo。
2. 建 PostgreSQL 16 docker compose。
3. 建 `packages/shared`：
   - types
   - zod schemas
   - ErrorCode
   - slot reason
   - BookingView
   - API envelope
4. 建 `contracts/fixtures`。
5. 建 API ports：

```text
AuthService
TeacherRepository
CourseRepository
AvailabilityRepository
StudentRepository
PackageRepository
BookingRepository
IdempotencyRepository
NotificationRepository
```

6. 建 scripts：

```text
pnpm test
pnpm test:contract
pnpm test:spec
pnpm test:domain
pnpm test:api
pnpm web:test
pnpm api:dev
pnpm web:dev
pnpm db:migrate
```

7. 建空目录结构，保证后续 agents 不需要重新组织 repo。

### Contract 禁令

不得增加：

```text
TeacherPrincipal
asTeacher
by
source request field
/i/* Universal Link
客户端 view=teacher 依赖
booking 级 idempotency unique index
```

### 验收

```text
pnpm install
pnpm typecheck
pnpm test:contract
```

成功。

所有 fixture 能通过 shared zod schema。

最后写：

```text
notes/contract-bootstrap-summary.md
```

---

# 18. Agent A — Backend DB + Domain

建议 worktree：

```text
worktree/backend-core
```

---

## TASK — Rabbit Backend Core

你负责数据库、repository 实现、纯 domain 与关键事务。

### 文件所有权

只修改：

```text
api/src/db/**
api/src/domain/**
api/src/jobs/**
api/test/db/**
api/test/domain/**
spec-tests/**
```

不要修改：

```text
packages/shared/**
contracts/**
api/src/routes/**
api/src/middleware/**
api/src/auth/**
web/**
ios/**
```

### Database

实现最新版 `data-model.md`：

```text
extensions
roles
tables
named constraints
indexes
composite FKs
EXCLUDE
append-only ledger
idempotency_record
push_device
notification_outbox
integrity_issue
```

### `apply_package_transaction`

必须原样落实最新语义：

```text
SECURITY DEFINER
fixed search_path
balance columns REVOKE
PUBLIC execute revoke
app_rw explicit grant
```

真实 PostgreSQL regression：

```text
10/10
SESSION_COMPLETED -1 -> 9/10
REVERSAL +1          -> 10/10
```

### Domain

实现：

```text
computeSlots
time helpers
cancelPolicy
bookingActions
FIFO package selection
availability validation
```

`computeSlots`：

```text
pure function
同一份用于 L1/L2/L3
```

### Booking transactions

实现：

```text
createBooking
completeBooking
undoCompletion
cancelBooking
rescheduleBooking
```

行为身份不能来自 input。

### Create Booking

必须：

```text
resolve teacher capability
or resolve Student from Principal
lock student
read remaining+reserved in one SQL snapshot
check availability if self booked
EXCLUDE as final conflict guard
write idempotency_record last in same transaction
```

不要创建 booking-level idem index。

### Reschedule

必须：

```text
single transaction
cancel old
if late -> penalty first
then new booking quota check
then create new
```

测试：

```text
remaining=1 reserved=1 late
-> fail
-> entire transaction rollback
-> old booking Upcoming
-> no penalty

remaining=2 reserved=1 late
-> success
```

### Outbox

创建 / 取消 / 改期：

```text
同一业务事务 enqueue notification_outbox
```

Agent A 不调用 APNs。

### Tests

至少覆盖：

```text
Slot 规格向量全部
back-to-back
overlap
concurrent same slot
concurrent last available session
ledger invariants
REVERSAL regression
late reschedule rollback
free reschedule
idempotent completion
undo/re-complete
cross-teacher FK rejection
```

### 验收

```text
pnpm test:spec
pnpm test:domain
pnpm test:db
```

---

# 19. Agent B — Backend HTTP / Auth / Notification Worker

建议 worktree：

```text
worktree/backend-api
```

---

## TASK — Rabbit Backend API

你负责 HTTP、middleware、auth/session、capability resolution、错误映射和 APNs worker。

### 文件所有权

只修改：

```text
api/src/routes/**
api/src/middleware/**
api/src/auth/**
api/src/http/**
api/src/notifications/**
api/src/server.ts
api/test/integration/**
```

不修改 migration 与 domain 算法。

Agent A 未 merge 时，用 Agent 0 定义的 ports + fake implementation。

### Auth

实现 Principal：

```text
Public
InviteToken
Student
User
```

不得实现 TeacherPrincipal。

实现：

```text
canActAsTeacher
canActAsStudent
```

业务 route 只读取：

```text
ctx.principal
```

### Sessions

iOS：

```text
access + refresh
```

Web：

```text
HttpOnly session/refresh cookie
+ memory access token
```

### Invite

完整实现：

```text
Pending preview
anonymous accept
existing User accept
Consumed revisit
no identity leak
```

### Endpoints

实现本文 §12 Phase 0–2 freeze。

### Booking request validation

老师代约：

```text
studentId required
```

学员自主：

```text
studentId forbidden
```

任何：

```text
source
by
asTeacher
```

出现都返回：

```text
VALIDATION_FAILED
```

### Slots

不要依赖客户端 `view=teacher`。

视图由 capability 推导。

### Idempotency

使用最新版“写法 A”。

middleware / outer handler 必须支持：

```text
same principal + same key + same endpoint + same hash
-> replay

same principal + same key + different endpoint/hash
-> IDEMPOTENCY_KEY_REUSED
```

不要把 Idempotency-Key 当资源读取凭证。

### Error mapping

至少：

```text
23P01 booking_no_overlap -> SLOT_TAKEN
named constraints -> stable ErrorCode
```

响应不能泄露冲突 Booking owner。

### Push

实现：

```text
POST /v1/me/devices
```

按本文新增最小 payload contract。

实现 notification outbox worker：

```text
BadDeviceToken / Unregistered
-> revoke device
-> stop retry

503 / TooManyRequests / network
-> retry

max 5 attempts
```

推送 payload 最小化：

```text
bookingId
studentName
courseName
timeRange
```

点开后 App 必须重新 GET Booking。

### Integration Tests

```text
anonymous invite accept
existing User accepts invite
User is teacher + somebody else's student
consumed invite revisit
consumed invite no-session no leak
Student cross-resource 403
teacher capability
studentId forbidden on self booking
studentId required on teacher booking
source/by/asTeacher rejected
idempotent replay
key reuse different body
SLOT_TAKEN mapping
slots auth
```

### 验收

```text
pnpm test:api
```

---

# 20. Agent C — Student Web

建议 worktree：

```text
worktree/web-student
```

---

## TASK — Rabbit Student Web / H5

你负责学员端 Web。

### 文件所有权

只修改：

```text
web/**
```

### 技术

使用最新版 impl guide：

```text
Vite
TypeScript
Preact
轻量 router
query cache
```

### Mock First

必须先支持：

```text
VITE_USE_FIXTURES=1
```

不启动 API 也能跑完整 UI。

使用：

```text
packages/shared
contracts/fixtures
```

### Routes

```text
/i/:token
/
/book
/bookings
/bookings/:id
```

### Invite

实现：

```text
preview
accept
history.replaceState('/')
bookmark/home-screen tip
```

不做：

```text
"请用 App 打开"
Universal Link
注册墙
```

必须在微信 WebView 正常工作。

### Auth

```text
access token only in memory
refresh through HttpOnly Cookie
```

刷新页面：

```text
先尝试 refresh
成功 -> 恢复 session
失败 -> 中性无会话页
```

### Student Home

匿名 Student：

```text
只有一位老师
```

User：

```text
可显示多位老师
```

### Booking flow

严格：

```text
日期
→ 时间
→ 确认
```

不增加额外 step。

进入 Step2：

```text
GET slots fresh
```

确认前：

```text
GET slots fresh again
```

### SLOT_TAKEN

```text
保留日期
刷新 slots
回 Step2
```

### Reschedule

免费改期 / 逾期改期均由服务端决定。

客户端只根据返回：

```text
actions
policyText
ErrorCode
```

### 禁止

```text
toLocaleTimeString()
客户端 cancel deadline 计算
客户端 computeSlots
客户端 reserved 推导
localStorage token
```

### Tests

```text
invite pending
invite consumed matching session
invite consumed no session
anonymous home
User multi-teacher home
booking 3-step happy path
SLOT_TAKEN
NETWORK_ERROR preserve state
cancel
reschedule
LATE_RESCHEDULE_INSUFFICIENT
token refresh
```

### 验收

fixture mode 可独立演示完整学员路径。

---

# 21. Agent D — Teacher iOS

建议 worktree：

```text
worktree/ios-teacher
```

---

## TASK — Rabbit Teacher iOS

你负责老师端 iOS App。

### 文件所有权

只修改：

```text
ios/**
```

### 技术

```text
SwiftUI
iOS 17+
@Observable
async/await
RabbitKit SwiftPM
```

### 架构

```text
View
→ ViewModel
→ Repository
→ APIClient
```

View 不直接发 API。

### Mock First

先做：

```text
Mock Repository
fixture-equivalent Swift DTO samples
```

Backend 未完成也必须能迭代页面。

### Phase 1

实现：

```text
Root / Onboarding
Today
Calendar
Students
Student Detail
Add Student
Courses
Availability
Manual Booking
Profile
```

### Phase 2

实现：

```text
Booking Detail
cancel/reschedule result rendering
APNs permission
POST /v1/me/devices
push tap -> Booking Detail
Today new/pending visible count
```

### Invite

老师 App 只负责：

```text
ShareLink
QR code
copy invite.url
```

不 claim：

```text
/i/*
```

不配置：

```text
Associated Domains
AASA
```

### API DTO

Swift DTO 手写。

必须有 JSON decode tests，对齐：

```text
contracts/fixtures
```

未知字段必须容忍。

### Business Rules

禁止：

```swift
if Date() < startAt ...
```

按钮完全使用：

```swift
booking.actions.canComplete
booking.actions.canCancel
booking.actions.canReschedule
booking.actions.canUndoComplete
```

### Refresh

```text
.task
scenePhase == active
详情写操作完成后显式 refresh
```

### APNs

请求授权时机：

```text
首次进入 Today
或第一次创建预约后
```

不要冷启动弹权限。

推送点开：

```text
bookingId
→ Router
→ GET latest booking
```

### Tests

```text
DTO decode
unknown field tolerance
API envelope
ErrorCode mapping
ViewModel state
actions direct read
push routing
```

---

# 22. Agent E — Contract QA / CI

建议 worktree：

```text
worktree/qa-contract
```

---

## TASK — Rabbit Contract QA / CI

你的任务是阻止多个并行 agent 出现 contract drift。

### 文件所有权

只修改：

```text
scripts/**
test/contract/**
test/e2e/**
.github/workflows/**
notes/qa/**
```

原则上不修改产品代码。

### Contract validation

CI：

```text
packages/shared typecheck
all fixtures pass Zod
```

### API Contract

启动 API 后：

```text
response envelope
schema
status
error code
```

全部验证。

### iOS compatibility

fixtures 必须可以被 RabbitKit DTO decode tests 使用。

### Security

至少：

```text
Student A -> Student B booking = 403
Student A forge studentId = VALIDATION_FAILED/403
Public slots = 401
Consumed invite third party = no identity leak
User simultaneously teacher + student = both paths work
```

### Concurrency

```text
same slot race
last available session race
duplicate same idem key
same key different request
late reschedule race
```

### Static guard

CI grep / lint 防止客户端复制业务逻辑：

Web：

```text
toLocaleTimeString
手写 slot calculation
```

iOS：

```text
DateFormatter on Booking business times
startAt +/- freeCancelHours
```

允许纯 UI 时间（非业务时间）时可白名单。

### Merge Gate

```text
test:contract
test:spec
test:domain
test:db
test:api
web:test
swift test
```

---

# 23. Agent 文件所有权

| Agent | Owner |
|---|---|
| Agent 0 | `packages/shared/**`, `contracts/**`, repo bootstrap |
| Agent A | `api/src/db/**`, `api/src/domain/**`, `api/src/jobs/**`, `spec-tests/**` |
| Agent B | `api/src/routes/**`, `api/src/middleware/**`, `api/src/auth/**`, `api/src/notifications/**` |
| Agent C | `web/**` |
| Agent D | `ios/**` |
| Agent E | `scripts/**`, `test/**`, `.github/workflows/**` |

原则：

```text
不要跨 owner directory 顺手修代码
```

确实需要时：

```text
写 blocker / handoff note
```

---

# 24. Merge 顺序

第一轮：

```text
Agent 0
↓
A / B / C / D / E 并行
```

集成建议：

```text
A Backend Core
→ B Backend API
→ E Contract/API integration
→ C Web integration
→ D iOS integration
→ E E2E
```

C / D 的 fixture UI PR 可提前 merge，只要没有改 contract。

---

# 25. PR 规则

每个 PR 必须：

1. 只改 owner 范围。
2. 不自行新增 endpoint。
3. 不自行新增 ErrorCode。
4. 不修改 Principal 形状。
5. 不在客户端复制业务规则。
6. 不把 `/i/*` 接进 App。
7. 不新增 Booking 级幂等索引。
8. 新 contract 问题写 blocker note。
9. 测试通过。
10. Summary 明确列：
   - 完成；
   - 未完成；
   - blocker；
   - 下一 agent 依赖。

---

# 26. 第一轮 Definition of Done

Phase 2 pilot checkpoint 必须跑通：

```text
老师：
Sign in with Apple
→ 创建 Teacher
→ 创建 Course
→ 配 Availability
→ 添加真实 Student
→ 创建 Package
→ 分享 invite.url

学员：
微信浏览器打开 /i/token
→ 无注册接受
→ Home
→ 看剩余课时
→ 看 bookable days
→ 选 slot
→ 自主预约

老师：
收到 APNs
→ 点开
→ Booking Detail 拉取最新状态

学员：
取消
改期

老师：
Today / Booking Detail 同步反映变化
```

必须证明：

```text
同 slot 并发只能成功一个
available 永不负数
REVERSAL 不提高 purchased
匿名 Student 不可跨资源
User 同时老师+学员可工作
source/by 无法由客户端伪造
第三人打开 consumed invite 不泄露身份
旧 invite 对原 Student 可作为回访入口
网络重试不产生重复 Booking
SLOT_TAKEN 能恢复到 Step2
```

---

# 27. 暂不并行实现的 Phase 3

第一轮 agent 不要因为“顺手”把这些做大：

```text
完整自动结算 UI
完整待处理结算
完整流水页面打磨
学员邮件通知
高级通知偏好
Pro/IAP
课包支付
Recurring Booking
日历同步
```

可以保留 schema/interface，但不扩大 scope。

第一轮目标只有一个：

> 把 `老师开放时间 → 学员自主预约 → 老师立刻知道` 做成稳定、可真实试用的闭环。
