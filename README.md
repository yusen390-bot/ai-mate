# AI Mate

可运行、可验证、具备完整 Agent 执行闭环的 AI 任务协作系统。

核心闭环：**用户提出目标 → AI 制定计划 → 用户确认 → 系统执行 → 检查结果 → 继续或调整 → 保存状态并可恢复**

> 项目规范见 `AGENTS.md`（最高优先级）；需求原文见 `docs/AI-Mate-实施方案.md`；进度见 `docs/开发路线与差距分析.md`。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| 后端 | Node.js + Express 5 + TypeScript（Node 24 原生运行，无需编译） |
| 校验 | Zod（API 入参 + 模型输出） |
| 数据库 | SQLite（Node 内置 `node:sqlite`） |
| 测试 | Vitest + Supertest |
| 模型 | OpenAI 兼容 HTTP 接口（当前 DeepSeek） |

## 目录结构

    AI-Mate/
    ├─ AGENTS.md              项目规范（技术栈、架构原则、四周验收标准）
    ├─ docs/                  方案书原文、开发路线与差距分析
    ├─ server/
    │  ├─ src/
    │  │  ├─ app.ts           组装 Express（不打开数据库，便于测试）
    │  │  ├─ index.ts         启动入口（listen + 优雅退出）
    │  │  ├─ config.ts        环境变量与数据库路径
    │  │  ├─ db.ts            四张表 + 事务 + 数据访问函数
    │  │  ├─ schemas.ts       Zod 校验与状态枚举
    │  │  ├─ model.ts         OpenAI 兼容调用（未来替换 Agents SDK 只改这里）
    │  │  ├─ middleware/      validate（参数校验）、error（统一错误）
    │  │  ├─ routes/          health / projects / tasks / model
    │  │  └─ services/        taskRules（依赖合法性等业务规则）
    │  ├─ tests/              Vitest + Supertest（12 个用例）
    │  ├─ scripts/db-test.ts  四表 + 事务 + 级联删除自检
    │  └─ data/               SQLite 数据库（已 gitignore）
    ├─ client/src/
    │  ├─ App.tsx             顶栏 + 标签页（任务 / 模型自检）
    │  ├─ api.ts              类型化 API 封装与状态字典
    │  └─ components/         ProjectPanel / TaskBoard / ModelCheck
    └─ .env.example           环境变量模板

## 快速开始

    npm run setup                     # 一次性安装 root / server / client 依赖
    Copy-Item .env.example .env       # 然后填写 MODEL_API_KEY（当前已配 DeepSeek）
    npm run dev                       # 后端 3001 + 前端 5173

打开 http://localhost:5173

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动前后端 |
| `npm run dev:server` / `npm run dev:client` | 单独启动 |
| `npm test` | 服务端测试（Vitest + Supertest，使用内存数据库） |
| `npm run typecheck` | 服务端 TypeScript 类型检查 |
| `npm run build` | 前端类型检查 + 生产构建 |
| `npm run db:test` | 四表 + 事务 + 级联删除 自检 |
| `npm run health` | 命令行访问 /health |

## 数据模型（四张表）

| 表 | 关键字段 |
|---|---|
| `projects` | id, title, goal, status |
| `tasks` | id, project_id, title, description, status, dependencies(JSON), plan_version, order_index, requires_approval, acceptance_criteria, attempts, max_attempts, last_error |
| `runs` | id, task_id, attempt, status, input, output, error, started_at, finished_at |
| `artifacts` | id, task_id, project_id, type, name, content |

外键 `ON DELETE CASCADE`：删除项目会级联删除其任务、执行记录与产物。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 服务 / 模型 / 数据库（四表计数） |
| POST / GET | `/api/projects` | 创建（title + goal）/ 列表（带任务统计） |
| GET / PATCH / DELETE | `/api/projects/:id` | 详情（含 tasks）/ 修改 / 删除（级联） |
| GET / POST | `/api/projects/:id/tasks` | 任务列表 / 创建任务 |
| GET / PATCH / DELETE | `/api/tasks/:id` | 任务详情（含 runs）/ 修改 / 删除 |
| GET | `/api/projects/:id/artifacts` | 项目产物 |
| POST | `/api/chat` · GET `/api/models` | 模型连通性自检（不写数据库） |

错误统一为：`{ "error": { "code": "...", "message": "...", "details": [...] } }`

## 当前进度（第 1 周已完成）

- [x] 四表数据模型 + 事务 + 级联删除
- [x] 任务/项目 CRUD API（全部 Zod 校验）
- [x] 依赖合法性校验（不存在 / 自我依赖 / 重复 / 跨项目 → 400）
- [x] Tailwind 任务列表页（创建项目、创建任务、改状态、删除）
- [x] Vitest + Supertest 12 个用例
- [x] 重启后端数据仍在（已实测）
- [ ] 第 2 周：任务规划引擎（模型生成计划 + Zod 校验 + 用户确认）
- [ ] 第 3 周：执行引擎 / 受控工具 / 验证器 / 恢复
- [ ] 第 4 周：任务地图 / 工作台 / 审批界面 / 自动化测试 / 演示

## 环境要求

Node.js 24+（用到内置 `node:sqlite` 与原生 TypeScript 运行能力），无需 Python 或编译工具链。

## 排错

- **PowerShell 提示"禁止运行脚本"**：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，然后重开窗口
- **前端提示"后端离线"**：先 `npm run dev:server`
- **模型未配置**：编辑 `.env` 的 `MODEL_API_KEY`（DeepSeek 控制台申请）后重启后端