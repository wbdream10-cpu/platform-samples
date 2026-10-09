# MASTER7 V2.2 独立技术客服演示（非正式平台）

这是一个**离线 FAQ 的静态演示页**：无客户登录、无数据库、无支付、无真实 AI、无 Telegram 或交易功能，也不连接正式前后台。不要用它替换正式网站或现有机器人。

## 本次升级

- 把原本内嵌在 HTML 的 CSS/JavaScript 拆为本地文件，采用更严格的内容安全策略（CSP，不使用 `unsafe-inline`）。
- 添加中、马、英三语“跳至主要内容”键盘导航，仍保留三语 FAQ 演示。
- `render.yaml` 提供了未来 Blueprint 使用的 `checksPass` 和 HTTP 安全响应头示例。**当前实际服务通过 Render 直接创建，启用的是 On Commit；构建中独立执行 10 项静态安全/功能检查**。Blueprint 的 HTTP 响应头配置不会因此自动应用到该服务。
- 加强构建检查，并提供可复现的本地浏览器测试及截图。
- `/health.json` 只检查静态资源是否存在，不代表真实 AI、生产平台或数据库运行正常。

## 本次部署：独立分支与独立静态演示服务（不覆盖现有演示或正式服务）

1. V2.2 已准备放入现有公共样本仓库 `wbdream10-cpu/platform-samples` 的专用分支 `codex/master7-support-demo-v22-20261009`，路径 `vendor-preview-v22/`。这是独立静态技术客服演示，不包含正式业务代码；不得把它当作正式网站。
2. 在 Render 以专用分支建立一项独立 Static Site：仓库 `https://github.com/wbdream10-cpu/platform-samples`，发布目录 `vendor-preview-v22/public`，构建命令 `cd vendor-preview-v22 && sh scripts/verify-build.sh && python3 -m unittest discover -s tests -v`。不要改动原有静态演示服务。
3. Render 只应创建名为 `master7-independent-support-demo-v22` 的 Static Site，不需要数据库、API Key、后台服务或手动广告配置；`render.yaml` 为将来独立仓库的 Blueprint 参考。
4. 部署后打开 Render 分配的演示站地址，测试中文 / Bahasa Melayu / English，FAQ 按钮、手机排版和 `/health.json`。
5. GitHub Actions 工作流在 `codex/master7-support-demo-v22-20261009` 分支上运行。Render Direct Creation 自动部署使用 On Commit，构建命令中重复执行单元测试；如需严格的 checksPass 阻断推送至生产流量，应在 Render Dashboard 手工更改触发策略，并核对检查状态。
6. 若变更有误，可从 Render → Deploys 回滚到此前成功版本。

不要混用旧演示站、Telegram 机器人、正式网站或任何客户数据。

## 本地检查

- 构建检测：`sh scripts/verify-build.sh`（从项目根目录执行）
- GitHub 同款静态/隐私配置检查：`python3 -m unittest discover -s tests -v`，仅需 Python 标准库，无需 API 密钥
- 可选浏览器 QA：`python3 scripts/qa_local.py`（需要 Python Playwright 和 Chromium；不会访问线上系统）
- V2.2 的本地 QA 截图及模拟视口结果保存在离线交付包的 `qa-current/`，没有作为生产证据上传到本分支。

本地 Chromium 模拟屏幕尺寸并不等于真实 iPhone、Android 或生产站验收。Render 已报告本演示站 `live`，但仍需在独立浏览器检查 `/health.json` 以及实际的 HTTP 安全响应头。

## 当前上线情况（请勿混淆）

- ✅ 已在本地执行构建/三语交互模拟 QA。
- ✅ 这个交付包包含 GitHub Actions 与 Render Blueprint 自动化配置。
- ✅ 2026-10-09 14:11 UTC Render 已将 `srv-db4fc27avr4c73eaegqg` 的初次部署 `dep-db4fc2favr4c73eaehkg` 标记为 `live`。构建日志中 10/10 个测试通过。
- ✅ 独立公网网页检查返回 HTTP 200，页面标题为 `MASTER7 — Demo Preview`，仅展示本地 FAQ。
- ✅ 实际 Render Auto Deploy 为 **On Commit**，并非 `checksPass`；GitHub Actions 工作流已写入分支，但 Actions 的实时执行状态尚未独立确认。
- ⚠️ `/health.json` 公网响应、安全 HTTP Headers 和 Android/iPhone 真机仍待验证。
- ❌ 不含真实 AI、人工客服转接、客户账号或后台数据。
- ❌ 不含任何博彩/支付/交易功能。

后续验证：GitHub Actions 运行状态、`/health.json`、实际 HTTP 安全响应头、手机真机。不在此分支内提供正式客户平台上线验收。

