# Slot 生成算法与接口设计

对应 `docs/mvp.md` §7。**这是整个产品最核心、也最容易被实现错的一块**：它同时被「日历高亮」「时间列表」「确认预约」三个位置使用，任何一处口径不一致，都会产出「列表里看着能约、点确认却说冲突」的挫败感。

> 本文 §6.1 的鉴权部分对应 `docs/auth-model.md`（身份与鉴权的唯一权威定义）。本文只写这两个接口的准入分类，不重新定义身份模型。

---

## 1. 目标与非目标

### 目标

1. 给定「老师 + 课程 + 日期」，产出一组**确定、可复现**的可预约时间。
2. 同一套规则必须在**展示（L1）**和**创建（L3）**两处得到完全一致的结果。
3. 算法是**纯函数**：输入齐全则不依赖数据库、不依赖当前时间以外的外部状态，可离线单测。

### 非目标（MVP 明确不做）

| 不做 | 说明 |
|---|---|
| 缓冲时间 `buffer_minutes` | 两节课可以背靠背 |
| 跨天课程 | `duration ≤ 240` 且必须完整落在单个开放区间内 |
| 候补名单 | 时段满了就是满了 |
| Recurring Booking | 老师在每周开放时间上重复约课 |
| 多课程混合展示 | 一次只算一个 Course 的 slot（§7.3） |
| 时区转换 | 老师固定 `Asia/Shanghai` |

---

## 2. 输入

| 来源 | 字段 | 用途 |
|---|---|---|
| `teacher_profile` | `timezone`, `slotStepMinutes`, `minLeadHours`, `maxAdvanceDays` | 算法参数 |
| `course` | `durationMinutes`, `allowSelfBooking`, `status` | 时长与准入 |
| `availability_rule` | `weekday`, `startMinute`, `endMinute`（`status='Active'`） | 开放区间 |
| `availability_exception` | `onDate`, `startMinute`, `endMinute`（缺失 = 整天） | 关闭区间 |
| `booking` | `startAt`, `endAt`（`status='Upcoming'`） | 占用区间 |
| `lesson_package` | `remainingSessions` 聚合 | 额度闸门 |

**共 4 次数据访问**（老师配置 1 + 规则 1 + 例外 1 + 占用 1），与日期跨度的天数无关。月视图也是 4 次，不是 30 次。这一点是日历页性能的关键。

### 在 PostgreSQL 上的落地（`docs/data-model.md`）

PostgreSQL 没有 JOIN 与条数上限方面的障碍，但"一次查询覆盖整个区间"的要求不变 —— 它是日历页性能的关键：

- **规则与例外**用一次范围查询取回整个区间（`teacher_id` + `weekday = ANY(...)` / `on_date BETWEEN from AND to`），条数极少。
- **占用**用一次范围查询取回整个区间的 Upcoming Booking，只 `SELECT start_at, end_at` 两列。索引 `(teacher_id, status, start_at)` 让它走范围扫描。
- **额度**用 `SUM(remaining_sessions)` 聚合，不要把批次拉回应用层再求和。
- 30 天的占用通常只有 30–100 行 —— **不存在查询条数上限**，但仍然不要按天循环查库（§7）。

---

## 3. 算法

### 3.1 签名

```
computeSlots(
  rules:          AvailabilityRule[]        // 目标 weekday 的 Active 规则（分钟数）
  exceptions:     AvailabilityException[]   // 目标日期的例外
  busy:           Interval[]                // 该老师的 Upcoming Booking（UTC 瞬刻）
  durationMinutes: number                   // 单个 Course 的时长
  stepMinutes:     number
  minLeadHours:    number
  maxAdvanceDays:  number
  timezone:        string
  now:             Instant
) -> Slot[]
```

### 3.2 步骤

```
① 规则准入（在进入算法之前）
   course.status <> 'Active'                     → 空，reason = COURSE_ARCHIVED
   course.allow_self_booking = false 且非老师视角 → 空，reason = SELF_BOOKING_DISABLED
   student.available_sessions < 1                 → 空，reason = INSUFFICIENT_SESSIONS

② 构造阻塞集合 blocked（全部转成 UTC 瞬刻）
   blocked = busy
           ∪ { 把该日期命中的 exception 区间按 timezone 展开到 UTC }

③ 逐规则展开
   for rule in rules:
       ruleStart = 该日期的 rule.start_minute 转成 UTC 瞬刻
       ruleEnd   = 该日期的 rule.end_minute   转成 UTC 瞬刻
       for t = ruleStart;  t + duration <= ruleEnd;  t += step:
           if [t, t + duration) ∩ blocked ≠ ∅:        continue
           if t <  now + minLeadHours:                continue
           if t >  now + maxAdvanceDays:              continue     # 可提前剪枝
           emit slot(t, t + duration)

④ 去重（按 start_at；防御性，数据库已禁止规则重叠）
⑤ 按 start_at 升序返回
```

### 3.3 三条必须写进注释的语义

**① 区间一律左闭右开 `[start, end)`。**

这是全部边界行为的根据：已有 15:00–16:00 时，16:00 起的新课**是允许的**（`16:00` 不在 `[15:00, 16:00)` 内）。如果实现里写成 `<=` 或做 `between`，会产生"背靠背的课约不上"的诡异 bug，且很难复现。

**② 全部区间转成 UTC 瞬刻后再比较。**

不要做"本地时间字符串比较"，也不要做"分钟数相减"。规则的 `start_minute` 是**本地墙钟时间**，必须先按 `timezone` 落到具体日期的 UTC 瞬刻。跨时区/夏令时地区的差异全部在这一步被吸收。

**③ slot 起点从开放区间的起点对齐，步进 `step`。**

不是从整点对齐。开放 14:10–18:00、step 30 → slot 是 14:10 / 14:40 / 15:10 / …。可预测性优先于"看起来整齐"。

### 3.4 为什么 `step ≠ duration`

若 `step = duration`（例如开放 14:00–18:00、60min 课、15:00 已被占 → 只能约 14:00 / 16:00 / 17:00），可约时间会明显变少。

本设计把两者解耦，`step` 默认 30，同一场景产出 **14:00 / 16:00 / 16:30 / 17:00**。

- 对老师：同一段开放时间能容纳更多安排。
- 对学员：可选时间更多，预约成功率更高（直接服务 §2.2 的 R1）。
- 若老师偏爱整点，把 `slotStepMinutes` 设为 60 即可回到整点对齐（见测试向量 V3）。

---

## 4. 两个必须区分的"空"

slot 为空有**四种不同原因**，UI 文案完全不同（`docs/mvp.md` §18）：

| reason | UI 文案 | 修复动作 |
|---|---|---|
| `NO_AVAILABILITY` | 老师近期还没有开放时间，请联系老师 | 老师去配开放时间 |
| `FULLY_BOOKED` | 这一天已经约满了 | 换一天 |
| `INSUFFICIENT_SESSIONS` | 剩余课时不足，请联系老师续课 | 学员找老师续课 |
| `SELF_BOOKING_DISABLED` | 该课程需要联系老师安排 | 老师改课程设置 |

**但 `reason` 只出现在响应顶层，绝不逐 slot 输出。** 服务端不返回"不可用 slot"，也不返回任何"某时段被某人占用"的信息（`docs/mvp.md` §4.3 / §17）。`FULLY_BOOKED` 的语义是"这天在开放时间内，但所有 slot 都被占"，它不泄露占用者是谁。

---

## 5. 测试向量

> **本节所有向量已用参考实现验证通过**：`spec-tests/slots.test.mjs` 严格按 §3.2 的描述实现 `computeSlots`（时区走 `Intl`，无 `+8` 硬编码），逐条比对下表。验证过程中发现并修正了 V19 的一处期望值错误 —— 说明这组向量确实在检验算法本身，而不只是文档的自我复述。
>
> 实现时请把 `spec-tests/` 作为回归测试基线：**先让它全绿，再写业务代码。**

固定夹具，除"变化"列注明外都一致：

```
timezone      = Asia/Shanghai (UTC+8，无夏令时)
基准日期 D     = 2026-03-03（周二，ISO weekday = 2）
now           = 2026-02-20T00:00:00Z（D 之前 10 天）
min_lead      = 0，max_advance = 60 天
rules         = 周二 14:00–18:00
duration      = 60，step = 30
busy          = 空
```

| # | 变化 | 期望输出 |
|---|---|---|
| V1 | 无（基准） | 14:00 14:30 15:00 15:30 16:00 16:30 17:00 |
| V2 | busy 加 15:00–16:00 | **14:00 16:00 16:30 17:00** |
| V3 | 同 V2，但 step = 60 | 14:00 16:00 17:00（**step = duration 时的整点对齐**） |
| V4 | busy 加 14:00–15:00 与 16:00–17:00 | 15:00 17:00 |
| V5 | duration = 90，无 busy | 14:00 14:30 15:00 15:30 16:00 16:30 |
| V6 | duration = 90，busy 加 15:00–16:00 | 16:00 16:30 |
| V7 | step = 15，rules 改 14:00–16:00，无 busy | 14:00 14:15 14:30 14:45 15:00 |
| V8 | rules 改 09:00–17:00，exception 加 12:00–14:00 | 09:00 09:30 10:00 10:30 11:00 14:00 14:30 15:00 15:30 16:00 |
| V9 | exception 改为整天关闭 | （空）reason = NO_AVAILABILITY |
| V10 | now = 2026-03-03T05:00:00Z（当天 13:00 CST），min_lead = 2h | 15:00 15:30 16:00 16:30 17:00 |
| V11 | max_advance = 5 天（D 在 10 天后） | （空）reason = NO_AVAILABILITY |
| V12 | rules 改 14:00–14:45，duration = 60 | （空）**区间装不下整节课** |
| V13 | rules = 09:00–12:00 + 14:00–18:00，step = 60，无 busy | 09:00 10:00 11:00 14:00 15:00 16:00 17:00 |
| V14 | rules 改 14:00–17:00，step = 60，busy 加 14:00–15:00 与 15:00–16:00 | 16:00（**验证左闭右开：16:00 可约**） |
| V15 | duration = 240，rules 改 09:00–17:00，step = 60 | 09:00 10:00 11:00 12:00 13:00 |
| V16 | 学员 available_sessions = 0 | （空）reason = **INSUFFICIENT_SESSIONS**（不是 NO_AVAILABILITY） |
| V17 | 整天 exception，但已存在 1 条该日 Booking | Booking **保持不变**；slot 为空（§7.2） |
| V18 | duration = 15，rules 改 14:00–15:00（`duration < step`） | 14:00 14:30 |
| V19 | busy 加 17:00–18:00（占用末端） | 14:00 14:30 15:00 15:30 16:00（**`16:30` 被挡住**：16:30–17:30 会侵入 17:00） |
| V20 | 相邻规则 14:00–16:00 + 16:00–18:00，step = 60，无 busy | 14:00 15:00 16:00 17:00（**无重复、无缺口**） |

### V2 逐步验算（供实现对照）

```
blocked = { [15:00, 16:00) }        规则区间 = [14:00, 18:00)，本地时间
t=14:00  [14:00,15:00) ∩ blocked = ∅   → 产出
t=14:30  [14:30,15:30) ∩ blocked ≠ ∅   → 跳过
t=15:00  [15:00,16:00) ∩ blocked ≠ ∅   → 跳过
t=15:30  [15:30,16:30) ∩ blocked ≠ ∅   → 跳过
t=16:00  [16:00,17:00) ∩ blocked = ∅   → 产出
t=16:30  [16:30,17:30) ∩ blocked = ∅   → 产出
t=17:00  [17:00,18:00) ∩ blocked = ∅   → 产出
t=17:30  17:30 + 60 = 18:30 > 18:00    → 越界，终止
```

### V8 逐步验算（例外的传播）

```
blocked = { [12:00, 14:00) }
09:00 ✓  09:30 ✓  10:00 ✓  10:30 ✓  11:00 ✓
11:30 ✗（11:30–12:30 侵入例外）
12:00 ✗  12:30 ✗  13:00 ✗
13:30 ✗（13:30–14:30 侵入例外）
14:00 ✓  14:30 ✓  15:00 ✓  15:30 ✓  16:00 ✓
16:30 ✗（16:30–17:30 越出 17:00 终点）
```

> 注意 `11:00` 可约、`11:30` 不可约：一节课必须**完整**放在可用的连续区间内，不允许跨越例外边界。这正是"整节时长"约束的意义。

---

## 6. 接口契约

> **字段命名约定（全项目统一，别在客户端各写一套）：**
> **数据库列名用 `snake_case`**（与 `docs/mvp.md` §5.3 的实体字段表、`docs/data-model.md` 的 DDL 一致）；
> **API 的 JSON 字段一律用 `camelCase`**。本文档的示例已按此规则书写 —— 数据库的 `start_at` 在 API 里是 `startAt`，
> `allow_self_booking` 在 API 里是 `allowSelfBooking`。客户端不需要、也不应该知道数据库列名。

### 6.1 鉴权（重要）

`bookable-days` 与 `slots` 都**必须鉴权**。按 `docs/auth-model.md` §1 的 Principal 分类，除 `Public` 外只有三种准入（注意**没有 `TeacherPrincipal`**：老师是一种由数据推导的**能力**，不是身份类型）：

| Principal | 准入条件 |
|---|---|
| `Student` | `principal.studentId` 与 `principal.teacherId` 与请求路径上的 `teacherId` **匹配**，且该 Student 为 `status='Active'` |
| `User` + 老师能力 | `canActAsTeacher(principal, teacherId)` 成立（老师本人），此时用 `view=teacher` 视图 |
| `InviteToken` | 持有一个该老师签发的、`status='Pending'` 且未过期的 invite token（用于**绑定前预览**，此时还没有学员会话） |

**不满足任何一种即拒绝**：无凭证的匿名请求返回 `401 UNAUTHENTICATED`；持有有效凭证但与该资源不匹配返回 `403 FORBIDDEN`（`docs/auth-model.md` §5、§6.5）。

> ⚠️ **不要用 `user_id = 当前登录用户` 判权。** 默认路径上的免账号学员没有 `user_id`，
> 判据只能是 `principal.studentId` / `principal.teacherId` 与资源的匹配（`docs/auth-model.md` §3.2）——
> 用老写法会把产品最重要的路径整个挡在门外。判权一律读 `ctx.principal`，**不读原始 token，也不读请求体或查询串里的任何 id**：客户端可以随便填。

> 不要因为"只是个时间列表"就放开匿名访问。老师的完整可约时间一旦可被任意遍历，产品就从 Invite Only 变成了公开预约页，直接违背 `docs/mvp.md` §4.2。同时也要限流：单用户对同一老师每分钟 ≤ 60 次。

### 6.2 可预约日期

```
GET /v1/teachers/{teacherId}/bookable-days?courseId={id}&from=2026-03-01&to=2026-03-31
```

```json
{
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-02-20T02:11:00Z",
  "days": [
    { "date": "2026-03-03", "slotCount": 4 },
    { "date": "2026-03-05", "slotCount": 3 }
  ]
}
```

- **只返回 `slotCount ≥ 1` 的日期**，其余由前端置灰，不逐个返回空日期（省带宽，也少泄露信息）。
- `from`/`to` 跨度上限 62 天；超出返回 422。
  > 62 天是**查询跨度护栏**，与老师配置的 `maxAdvanceDays`（最大 60）是两件事：前者限制"一次能问多长的区间"，
  > 后者限制"学员最远能约到多久以后"。62 > 60 是刻意留出的余量，让客户端可以用一个请求覆盖整个可预约窗口。
- 内部实现：4 次查询覆盖整个区间，在内存里逐日调用 `computeSlots`，不要按天循环查库。

### 6.3 某日时间列表

```
GET /v1/teachers/{teacherId}/slots?courseId={id}&date=2026-03-03
```

```json
{
  "date": "2026-03-03",
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-02-20T02:11:00Z",
  "reason": null,
  "slots": [
    {
      "startAt":    "2026-03-03T06:00:00Z",
      "endAt":      "2026-03-03T07:00:00Z",
      "startLocal": "14:00",
      "endLocal":   "15:00"
    }
  ]
}
```

- `slots` 为空时，`reason` 取 §4 的四个值之一；非空时为 `null`。
- **同时返回 UTC 瞬刻与本地展示串**，前端不要自己推时区。
- `generated_at` 供客户端判断数据新鲜度。
- **响应中不含任何其他学员的信息，也不含不可用时段。**

### 6.4 创建预约

```
POST /v1/bookings
Idempotency-Key: 8f3c1e02-...
```

老师代约（`canActAsTeacher` 成立，**必须**带 `studentId`）：

```json
{ "studentId": "…", "courseId": "…", "startAt": "2026-03-03T06:00:00Z" }
```

学员自主（`canActAsStudent`，**不带** `studentId`）：

```json
{ "courseId": "…", "startAt": "2026-03-03T06:00:00Z" }
```

- `endAt` **由服务端按 `course.durationMinutes` 推导**，不接受客户端传入。
- **`source` 与取消方由服务端从 `docs/auth-model.md` 的 Principal 推导，客户端不能指定。** 请求体里没有 `asTeacher`，取消 / 改期也没有 `by`：
  - 老师代约（`canActAsTeacher` 成立）→ `source = TeacherCreated`，**必须**带 `studentId`（老师要选学生）；
  - 学员自主（`canActAsStudent`）→ `source = SelfBooked`，**不接受**请求体里的 `studentId`（传了即 `422 VALIDATION_FAILED`），学生由 Principal 解析。
- 成功 201 返回 Booking 全量（含 `startLocal` / `endLocal`）。
- 客户端在点击「确认预约」前应重拉一次 §6.3（L2）；服务端在事务内还会再查一次（L3）+ 约束兜底（L4）。

### 6.5 错误码

| HTTP | code | 触发场景 | 前端处理 |
|---|---|---|---|
| 409 | `SLOT_TAKEN` | 排他约束冲突（含 L3 检查失败） | **刷新 slot 列表 + 回到 Step2**，不要只弹通用错误 |
| 409 | `INSUFFICIENT_SESSIONS` | `available < 1` | 提示续课 |
| 409 | `BALANCE_GUARD_FAILED` | 老师侧手动调整课时越界（唯一入口 `apply_package_transaction` 的守卫未通过） | 提示"调整后的余额不合法" + 刷新余额，不重试 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 同 key 不同 `request_hash` | 客户端 bug，上报 |
| 409 | `BOOKING_NOT_UPCOMING` | 状态已变（并发） | 刷新详情 |
| 409 | `LATE_RESCHEDULE_INSUFFICIENT` | 逾期改期时可用课时不足（逾期改期 = 损失旧课时 **+** 新预约还需另一节可用课时，见 `docs/data-model.md` §5.5 / `docs/mvp.md` §10.7） | 展示专属文案"本次改期已超过免费期限，需要额外消耗 1 节课。当前剩余课时不足，请先联系老师。"+ **保留原预约**（服务端已整体回滚，不扣课时） |
| 422 | `SLOT_OUTSIDE_AVAILABILITY` | 不在任何开放区间内 | 刷新 slot 列表 |
| 422 | `SLOT_IN_EXCEPTION` | 命中临时关闭 | 刷新 slot 列表 |
| 422 | `SLOT_TOO_SOON` | 违反 `min_lead_hours` | 刷新 slot 列表 |
| 422 | `SLOT_TOO_FAR` | 违反 `max_advance_days` | 刷新 slot 列表 |
| 422 | `SELF_BOOKING_DISABLED` | 课程不允许自主预约 | 提示联系老师 |
| 422 | `STUDENT_INACTIVE` / `COURSE_ARCHIVED` | 状态不允许 | 提示联系老师 |
| 403 | `NOT_BOUND_TO_TEACHER` | 当前 Principal 与该资源不匹配：`Student` 会话的 `studentId` / `teacherId` 与请求资源不符，或缺少可用的老师/学员身份（判权规则见 `docs/auth-model.md` §3.2） | 引导走邀请流程 |
| 403 | `RESCHEDULE_LIMIT_REACHED` | 改期次数超上限 | 提示联系老师 |
| 403 | `UNDO_WINDOW_EXPIRED` | 超出撤销完成窗口 | 提示窗口已关闭 |
| 422 | `ALREADY_STARTED` | 学员试图取消已开始的课 | 提示联系老师 |
| 401 | `UNAUTHENTICATED` | 缺少或无法验证 Bearer token | 重新登录 |
| 401 | `TOKEN_EXPIRED` | token 已过期 | 静默刷新一次；仍失败则回到登录 |
| 403 | `FORBIDDEN` | 越权访问他人资源 | 不重试，显示"无权查看"并回上一级 |
| 404 | `INVITE_NOT_FOUND` | 邀请不存在 | 明确文案 + "请联系老师重新发送" |
| 410 | `INVITE_EXPIRED` | 邀请已过期 | 同上 |
| 410 | `INVITE_CONSUMED` | 邀请已被使用 | 同上（**不做"谁先点谁绑定"**） |
| 410 | `INVITE_REVOKED` | 老师重发导致旧邀请作废 | 同上 |
| 409 | `BOOKING_BUSY` | 账号级互斥 / 系统繁忙 | "系统繁忙，请重试"，保留已选内容 |
| 422 | `VALIDATION_FAILED` | 请求体不合法（`details` 给出字段） | 客户端 bug，上报埋点 |
| 429 | `RATE_LIMITED` | 超过限流（§6.1：单用户对同一老师 ≤ 60 次/分） | 按 `Retry-After` 退避，不弹错误 |
| 426 | `CLIENT_TOO_OLD` | 客户端版本低于最低支持版本 | 阻塞式升级提示 |
| 5xx | `INTERNAL` | 服务端异常 | 可重试；**写操作重试必须带同一个幂等键** |
| — | `NETWORK_ERROR` | **客户端合成**（离线 / 超时 / DNS 失败） | **保留已选内容可重试**，不重置表单 |

> **本表是全项目唯一的权威错误码清单**（HTTP 状态 + code + 触发场景）。
> `docs/impl-guide.md` §4.4 是它的**客户端实现层镜像**，补充了具体文案与回退动作；两边如有出入以本表为准。

**`SLOT_TAKEN` 必须有专属文案和自动回退**（`docs/mvp.md` §18 最后一行）。这是整个产品里最伤体验的一个错误 —— 学员已经决定了时间、点了确认，才被告知不行。文案：

> 这个时间刚被预约了，请选择其他时间。

配一个"重新选择时间"按钮，直接拉刷新后的 slot 列表，保留已选的日期。

服务端要把数据库排他约束的冲突（PostgreSQL `exclusion_violation`，SQLSTATE `23P01`）也映射成这个 code —— 否则学员会看到一个 500，而实际上这只是"手慢了"。

---

## 7. 性能

| 关注点 | 结论 |
|---|---|
| 查询次数 | 固定 4 次，与天数无关 |
| 单日计算量 | `⌈区间长度 / step⌉` ≤ 96 次迭代 |
| 月视图计算量 | 31 天 × ≤ 4 区间 × ≤ 96 ≈ 1.2 万次纯内存迭代，微秒级 |
| 冲突检测 | 把 `busy` 按 `startAt` 排序后可用双指针做到 O(n+m)，不需要逐个 slot 遍历全部 busy |
| **响应体大小** | 无查询条数上限，但 `bookable-days` 只返回有 slot 的日期（§6.2），月视图也不会很大 |
| 缓存 | **不做服务端缓存**。可约状态随每次预约/取消变化，缓存收益低、一致性风险高 |
| 客户端缓存 | 同一次会话内可缓存 `bookable-days`，但进入 Step2 必须重新拉 `slots`；用响应里的 `generated_at` 判断新鲜度 |
| 请求次数 | 月视图一次 4 次数据访问 —— 不要让客户端对每个日期各调一次 `slots`。学员端是手机浏览器，30 次请求既慢又费流量 |

`busy` 的边界：查询时取 `startAt < rangeEnd + maxDuration AND endAt > rangeStart`，避免漏掉跨越区间边界的预约。

> **日历页不要逐日调用 `slots`。** 30 天 = 30 次请求，既慢又贵。用 §6.2 的 `bookable-days` 一次拿回"哪些日期有可约时段 + 各有多少"，只有用户点进某一天时才调 §6.3。

---

## 8. 时区

`Asia/Shanghai` 自 1991 年起没有夏令时，因此**当前实现怎么算都不会错** —— 这恰恰是危险所在：很容易写成 `localTime + 8h`。

**禁止手工加固定偏移。** 一律通过时区库做 `local date + time-of-day → UTC 瞬刻` 的转换（服务端用 `Temporal` / `luxon` / `date-fns-tz`）。理由：一旦进入有夏令时的市场，手工偏移会在一年里错两天，而且极难定位。

**客户端不参与时区换算。** iOS 与 Web 都只展示服务端返回的展示串（`start_local` / `end_local` / `time_range` / `date_label`），也不要拿设备本地时区去反推 UTC。服务端是唯一权威 —— 否则学员把手机时区改成 UTC，看到的课表就全错了，而这会变成一次"我明明约的是 3 点"的纠纷。

若未来支持 DST 地区，还需处理两个额外情况（当前不实现，但算法结构不要堵死）：

- **不存在的本地时间**：春季跳表时 02:30 不存在 → 该 slot 跳过。
- **重复的本地时间**：秋季回拨时 01:30 出现两次 → 取第一次（较早的瞬刻）。

由于算法全程在 UTC 瞬刻上比较，这两条只需在"本地墙钟 → UTC 瞬刻"这一步处理，展开逻辑无需改动。

---

## 9. 实现检查清单

上线前请逐条确认：

- [ ] 区间比较用的是左闭右开 `[)`，V14 通过
- [ ] 规则时间先转 UTC 瞬刻再比较，没有任何形式的本地时间字符串比较
- [ ] 没有出现 `+8` 或 `8 * 3600` 之类的硬编码偏移
- [ ] `computeSlots` 是纯函数，展示（L1/L2）与创建（L3）**调用的是同一个函数**
- [ ] `slots` 与 `bookable-days` 都按 Principal 鉴权：匿名（无凭证）返回 401，凭证有效但资源不匹配返回 403（§6.1、`docs/auth-model.md` §3.2）
- [ ] `bookable-days` 不按天循环查库
- [ ] 课程时长从 `course.duration_minutes` 取，不信任客户端传参
- [ ] 响应里不含不可用时段，也不含 `reason` 之外的任何他人信息
- [ ] V1–V20 全部有自动化测试，且 V20（相邻规则）确认无重复无缺口
- [ ] `computeSlots` **只在服务端有一份实现**。iOS 与 Web 都不复制这套逻辑 —— 「展示（L1/L2）与创建（L3）必须调用同一个实现」的落点就是：客户端只消费服务端算好的结果
- [ ] 创建预约时的约束冲突（SQLSTATE `23P01`）被映射成 `SLOT_TAKEN`，不是 500
