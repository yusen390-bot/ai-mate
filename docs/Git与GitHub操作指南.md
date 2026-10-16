# Git 与 GitHub 操作指南

> 适用：本项目位于 `D:\AI-Mate`，Git 已安装（2.56.0），全局身份已配置（Lee <yusen390@gmail.com>）。
> 远程仓库：**https://github.com/yusen390-bot/ai-mate.git**（公开、初始为空）

## 0. 日常三件事（改完代码后）

```powershell
cd D:\AI-Mate
git add -A                                   # 暂存所有改动
git commit -m "feat: 这次改了什么"            # 提交到本地
git push                                      # 推送到 GitHub
```

或者直接双击桌面的 **`推送到GitHub-双击我.cmd`**（提交 + 推送一体，全程写日志 `logs\git-push.log`）。

## 1. 首次上传：完整流程

### 1.1 先提交（本地至少要有一次提交，否则无法推送）

```powershell
cd D:\AI-Mate
git add -A
git commit -m "feat: W1 全栈骨架"
git log --oneline -n 3      # 确认能看到提交
```

### 1.2 在 GitHub 建一个**空**仓库

1. 打开 https://github.com/new
2. Repository name 填 `ai-mate`
3. **不要勾** Add a README / .gitignore / license（避免与本地冲突）
4. Create repository，复制它的 HTTPS 地址：
   `https://github.com/yusen390-bot/ai-mate.git`

### 1.3 关联远程并推送

```powershell
cd D:\AI-Mate
git remote add origin https://github.com/yusen390-bot/ai-mate.git
git branch -M main
git push -u origin main
```

第一次推送会弹出登录窗口（Git Credential Manager），在浏览器里授权一次即可，之后不再需要登录。

> 如果之前配错了地址：
> ```powershell
> git remote set-url origin https://github.com/yusen390-bot/ai-mate.git
> ```

## 2. 常用命令

| 目的 | 命令 |
|---|---|
| 看当前状态 | `git status` |
| 看提交历史 | `git log --oneline --graph` |
| 看远程地址 | `git remote -v` |
| 改远程地址 | `git remote set-url origin <地址>` |
| 撤销未提交的改动 | `git restore <文件>` |
| 看某次提交改了什么 | `git show <commit>` |
| 拉取远程更新 | `git pull --rebase` |

## 3. 排错

| 报错 | 原因与处理 |
|---|---|
| `src refspec main does not match any` | 本地还没有提交 → 先 `git commit` |
| `remote origin already exists` | `git remote set-url origin <地址>` |
| `Updates were rejected` | 远程有本地没有的提交 → `git pull --rebase origin main` 后 `git push` |
| `Authentication failed` | 凭据失效 → 再 push 一次，在弹出的窗口重新授权；或删除凭据管理器里的 github 条目 |
| push 卡住 / `Connection timed out` | 国内访问 GitHub 不稳定 → 开代理（v2rayN）后重试；也可给 git 单独配代理：`git config --global http.proxy http://127.0.0.1:端口`（端口见 v2rayN 界面），撤销：`git config --global --unset http.proxy` |
| 提示 `dubious ownership` | `git config --global --add safe.directory D:/AI-Mate` |

## 4. 密钥安全（重要）

- `.env` 已被 `.gitignore` 忽略，**不会被提交**。自查命令：
  ```powershell
  cd D:\AI-Mate
  git check-ignore -v .env      # 应显示命中 .gitignore 的 .env 规则
  git status                    # 列表里不应出现 .env
  ```
- 永远不要把真实密钥写进 `.env.example`、README 或任何会被提交的文件。