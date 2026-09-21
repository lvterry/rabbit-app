# 身份、能力与鉴权模型

> **这一页是身份模型的唯一权威定义。** 其他文档只引用它，不再各自解释"谁能做什么"。
> 出现分歧时以本页为准。

---

## 1. Principal：只有两种持久认证身份

一次 API 调用最多有一个 Principal。鉴权中间件解析凭证后把它放进请求上下文，**业务代码只读 `ctx.principal`，不读原始 token，也不读请求体里的任何 id**。

| `kind` | 怎么来的 | 携带什么 |
|---|---|---|
| `Public` | 无凭证 | 全为 `null` |
| `InviteToken` | 路径里的一次性邀请 token | `studentId` + `teacherId`（仅 `Pending` 期间有效） |
| `Student` | `auth_session`（`kind='Student'`） | `studentId` + `teacherId` |
| `User` | `auth_session`（`kind='User'`） | `userId` |

**这里只有两种持久身份：`User` 与 `Student` 会话。"老师"不是一个身份，而是一种能力（§2）。**

### 1.1 形状：所有 variant 同形

```ts
type Principal = {
  kind:      'Public' | 'InviteToken' | 'Student' | 'User';
  userId:    string | null;   // 仅 User
  studentId: string | null;   // 仅 Student / InviteToken
  teacherId: string | null;   // 仅 Student / InviteToken —— 那是这条会话的作用域，不是自然人属性
  inviteId:  string | null;   // 仅 InviteToken
};
```

**四个字段永远存在，不适用的那个是 `null`。** 于是所有落库点都写成同一句话，不需要按 `kind` 分叉：

```ts
// 幂等记录、package_transaction 的 actor 列，都直接用这两个值（`docs/data-model.md` §2.8）
{ userId: principal.userId, studentId: principal.studentId }
```

> 两条都不要走：
> ① 折成 `(kind, id)` 二元组 —— 每个落库点都要先判断 kind 再决定写哪一列，那正是"到处判断 `ctx.userId` / `ctx.studentSessionId`"的来源；
> ② 用可辨识联合给每个 variant 单独定义字段 —— 那样 `principal.userId` 在 `Student` 分支上根本不存在，落库点又得写 `?? null`。

## 2. 能力由数据推导，不由身份类型声明

| 能力 | 判据 |
|---|---|
| 能作为**老师 T** 行事 | `principal.kind === 'User'` **且**存在 `teacher_profile(user_id = principal.userId, id = T)` |
| 能作为**学员 S** 行事 | `principal.kind === 'Student'` 且 `principal.studentId === S.id` 且 `principal.teacherId === S.teacher_id`<br>**或** `principal.kind === 'User'` 且 `S.user_id === principal.userId` |

### ⚠️ 不要引入与 `User` 互斥的 `Teacher` 身份类型

产品数据模型明确支持一个 User **同时**是老师、又是别的老师的学生（`docs/mvp.md` §5.1 决定 1），"老师也可以有自己的老师"是常见情形。

一旦把它做成互斥的可辨识联合：

```ts
// ❌ 不要这样
{ kind: 'Teacher'; userId; teacherId }
{ kind: 'User';    userId }
```

那么一个"既是老师又是学生"的用户升级账号后，中间件只能给他**一个** kind：

- 给 `Teacher` → 老师侧通了，但学员侧的 `kind === 'User'` 分支不成立 → **他没法用自己的账号给老师预约**（这正是本页要堵的洞）；
- 给 `User` → 老师侧全挂。

所以需要"老师视角"时用**谓词**，不用类型判断：

```ts
canActAsTeacher(principal, teacherId)   // 上表第 1 行
canActAsStudent(principal, student)     // 上表第 2 行
```

> 一个 User 可以同时拥有**一个**老师能力和**多个**学员关系（不同 `Student` 行）。这不矛盾 —— 能力是按资源现算的，不是身份的属性。

### 2.1 行为身份只能来自 Principal，不能来自请求参数

`source`（`SelfBooked` / `TeacherCreated`）、取消方（`by`）、`asTeacher` 这类**决定业务规则**的字段，**一律由服务端从 `ctx.principal` 与目标资源推导**：

| 情形 | 推导结果 |
|---|---|
| `canActAsTeacher(principal, booking.teacher_id)` | `source = TeacherCreated`；取消记 `cancelledBy = Teacher`（免费） |
| `canActAsStudent(principal, 目标 Student)` | `source = SelfBooked`；取消记 `cancelledBy = Student`（按免费/逾期判定） |

**客户端不得通过 `asTeacher=true` 或 `by=Teacher` 改变服务端眼里"我是谁"。** 它们决定的是免费取消、逾期处罚这类有金钱后果的分支，交给客户端等于把规则交给用户。

> 老师代约时请求体里可以带 `studentId`（老师需要选学生）；**学员自主预约时不接受请求体里的 `studentId`**，直接取 `principal.studentId` / 目标 `Student`。

## 3. 接口的鉴权要求

每一行都必须能回答两个问题：**哪个 Principal？它凭什么能碰这条资源？**

### 3.1 公开（无凭证）

| 接口 | 说明 |
|---|---|
| `GET /v1/meta` | 版本与最低支持版本（`docs/impl-guide.md` §4.6） |
| `GET /v1/invites/:token` | 邀请预览。`Pending` → 返回老师与课程；`Consumed` → **只有**当 Principal 是 `Student` 且 `studentId` 匹配才返回 `alreadyAccepted`，否则一律"已被使用"且不泄露身份 |
| `POST /v1/invites/:token/accept` | **免登录**：token 本身就是凭证，换出 `Student` 会话 |
| `GET /v1/auth/email/verify` | 魔法链接回跳（token 即凭证） |

### 3.2 学员侧

接口：`GET /v1/me/student-home`、`/me/student-bookings`、`/me/transactions`、`GET /v1/teachers/:teacherId/slots`、`/bookable-days`（默认视图）、`POST /v1/bookings`（自主预约）、`POST /v1/bookings/:id/cancellation`、`/reschedule`、`GET /v1/bookings/:id`

**判权规则只有一条：** `canActAsStudent(principal, 目标 Student)`。

> ⚠️ **不要用 `student.user_id === userId` 作为唯一判据** —— 默认路径上的学员没有 `user_id`，那样写会把产品最重要的路径整个挡在门外。
> 反过来，**也不要用 `kind === 'User'` 就放行** —— 那会让"既是老师又是学生"的用户碰到本该属于别人的东西。必须比对**目标 Student 的 `user_id`**。

### 3.3 老师侧（Teacher capability）

接口：`GET /v1/me/teacher*`、`POST/PATCH /v1/me/teacher`、`/v1/courses*`、`/v1/availability*`、`/v1/students*`、`POST /v1/bookings`（代约，带 `studentId`）、`POST /v1/bookings/:id/completion`、`/settlement`、`/v1/packages*`、`GET /v1/students/:id/transactions`

**判权规则：** `canActAsTeacher(principal, 资源.teacherId)`。**不接受客户端传入的 `teacherId` 作为身份。**

### 3.4 两种能力都能访问，但看到的内容不同

| 接口 | 差异 |
|---|---|
| `GET /v1/teachers/:teacherId/slots` | 有老师能力 → `view=teacher`（不检查自主预约开关、不加提前量/最远天数）；否则默认视图 |
| `GET /v1/bookings/:id` | 学员侧视角的响应里 `reserved` 为 `null`（`docs/mvp.md` §6.6 / §17） |

> 同一个 User 完全可能同时满足两条路径（他既是这位老师、又是那位老师的学生）。接口按**当前请求的目标资源**选视图，不按身份选。

## 4. 幂等键挂在 Principal 上

`idempotency_record` 用**两个可空列**（`user_id` / `student_id`）承载主体，而不是 `user_id NOT NULL` —— 匿名学员没有 `user_id`，而他们的**创建 / 取消 / 改期恰恰是最需要幂等的写请求**。DDL 见 `docs/data-model.md` §2.8。

> 这里刻意**没有**采用多态的 `(principal_type, principal_id)`：那种写法会让 `principal_id` 无法建外键，等于用"少一个约束"换"少一列"。
> 两个可空列 + 两条部分唯一索引能同时拿到真外键与真唯一性 —— 和 `student` 上那条"部分唯一索引排除 NULL"是同一个手法（`docs/data-model.md` §2.5）。

中间件只做一次归一化，产出 §1.1 那个同形对象；业务代码与幂等表都不再关心是哪一种 Principal。

> **`idempotency_record` 是创建 Booking 的幂等闸门，而幂等 key 不是权限凭证。**
> 重放必须回到发起它的那个主体：重放前比对 `request_hash` 与**当前 Principal**，不一致就是 `409 IDEMPOTENCY_KEY_REUSED`，绝不"按 key 把别人的 Booking 读回来"（`docs/data-model.md` §2.7 / §5.0）。

## 5. 实现纪律

1. **业务代码只读 `ctx.principal`**，不读 `ctx.userId` / `ctx.studentSessionId`，也不读请求体或查询串里的 `teacherId`、`studentId`。
2. **行为身份只能来自 Principal**（§2.1）：`source` / `by` / `asTeacher` 一律服务端推导。
3. **未认证与越权要分开**：缺/坏凭证 → `401 UNAUTHENTICATED`；凭证有效但无权 → `403 FORBIDDEN`（`docs/slot-algorithm.md` §6.5）。
4. **`Public` 不开任何列表接口。** 老师的完整可约时间一旦可被遍历，产品就从 Invite Only 变成公开预约页（`docs/slot-algorithm.md` §6.1）。
5. **每个写接口都在服务端重新判权**（`docs/mvp.md` §7.4 的 L3）。
6. **新增接口时先在本页 §3 登记**它属于哪一类。这一页不更新，就不写那个接口。

## 6. 学员端的两种形态与传输方式

| | 默认（免账号） | 升级后 |
|---|---|---|
| 进入方式 | 邀请 token 换 `Student` 会话，**全程无登录页** | Sign in with Apple / 邮箱魔法链接 |
| `student.user_id` | `NULL`（**正常状态，不是异常**） | 回填 |
| Principal | `kind = 'Student'`，作用域 `(studentId, teacherId)` | `kind = 'User'`；访问该 Student 时走 §2 表格第 2 行的第二个分支 |
| 能访问 | 这一位老师的课程 / 预约 / 课时 | 同上，外加**跨老师聚合**与换设备找回 |
| 会话 TTL | 180 天 + 每次访问滑动续期 | 同 |

> `Student` 会话**不含自然人身份**：系统不知道 A 老师名下的 `Student 123` 与 B 老师名下的 `Student 456` 是不是同一个人。这是"免账号"的固有含义（`docs/mvp.md` §5.1 决定 6）。
> 完整取舍见 `docs/mvp.md` §5.1 决定 5 / 决定 6、§10.2《回到入口》。

### 6.1 传输方式

| 端 | 长效凭证 | 每次请求携带 |
|---|---|---|
| 老师端 iOS | refresh token（Keychain） | 短期 Bearer access token（内存） |
| 学员端 Web | **HttpOnly + Secure + SameSite=Lax Cookie**（长效 session / refresh token，**永不暴露给 JavaScript**） | 短期 Bearer access token（内存） |

Web 的 access token 由 `POST /v1/auth/refresh` 用 Cookie 换取。**首屏不要因此多走一次往返** —— 见 `docs/impl-guide.md` §3.3。

> **一个浏览器同一时刻只有一个有效会话，Cookie 只有一个名字**（例如 `rb_session`）。
> 会话的 `kind` 由服务端解析，**不体现在 Cookie 名上** —— 这样就不存在"两个会话互相覆盖"或"这次该用哪一个"的问题：
>
> - **升级为账号时旧会话被作废**（`upgradeSessionToUser`），浏览器里只剩 `User` 会话；
> - **已经有 `User` 会话的人接受邀请时，不发新会话，而是把那条 `Student` 绑到该账号**（`docs/data-model.md` §5.6.1）。
>   这条规则顺带把"老师收到另一位老师的邀请"解决了：他继续用同一个 `User` 会话访问学员侧，跨老师聚合也顺带生效 —— 而老师端 App 的凭证在 Keychain 里，本来就不和浏览器 Cookie 冲突。
