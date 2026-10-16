# AI Mate · 前端

React + TypeScript + Vite，开发时通过 Vite 代理把 `/health` 与 `/api/*` 转发到 Express（默认 http://localhost:3001）。

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # 类型检查 + 生产构建