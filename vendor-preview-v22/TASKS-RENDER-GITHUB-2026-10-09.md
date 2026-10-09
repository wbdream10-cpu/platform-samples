# MASTER7 独立技术支持演示站 V2.2 | GitHub + Render 验收任务

任务创建日期：2026-10-09，马来西亚时间（UTC+08:00）

> **范围严格限制：** 只涉及独立、无客户账号、无交易、无真实 AI 的静态技术支持 FAQ 演示。不要修改正式客户网站、现有 Telegram 服务、客户数据、任何交易或支付系统。

## 目标服务

- GitHub: `wbdream10-cpu/platform-samples`
- 隔离分支: `codex/master7-support-demo-v22-20261009`
- 代码目录: `vendor-preview-v22/`
- Render 服务: `master7-independent-support-demo-v22`
- Render 服务 ID: `srv-db4fc27avr4c73eaegqg`
- Render 控制台: https://dashboard.render.com/static/srv-db4fc27avr4c73eaegqg
- 公共预览: https://master7-independent-support-demo-v22.onrender.com/

## 已验证

- [x] V2.2 演示代码及 CI 文件保存在隔离分支中
- [x] Render 首次部署 `dep-db4fc2favr4c73eaehkg` 为 `live`，构建对应 commit `8ff5a52f5195b343343bb020c89e9081a337741d`
- [x] Render 构建日志记录了 10/10 项静态 QA 测试通过
- [x] 第三方独立网页访问返回 HTTP 200，标题为 `MASTER7 — Demo Preview`
- [x] Render 配置读取结果为 `autoDeploy=yes`、`autoDeployTrigger=commit`

## 待验收

- [ ] 验证公网 `GET /health.json` 返回 HTTP 200、有效 JSON，且不将状态当作真实 AI 或正式网站健康度
- [ ] 核对公网 HTTPS、CSP、X-Content-Type-Options、Referrer-Policy、X-Frame-Options、Cache-Control 等 HTTP 响应头。Blueprint 模板中的 headers 可能尚未应用到直接创建的 Render 服务
- [ ] 核实 GitHub Actions 是否运行以及测试是否通过。此前检查接口只返回空 statuses，不能当作 CI 通过
- [ ] 检查 On Commit 自动部署是否实际触发。最近文档 commit `1072482dab5647679adf2cfbdca224723f03dbfe` 尚未取得新部署记录；避免重复手动部署
- [ ] 在真实 Android Chrome 与 iPhone Safari 上做三语切换、FAQ、键盘及导航测试。模拟浏览器测试不能替代真机验收
- [ ] 完成独立演示站正式验收记录，区分 Live、功能测试与未接入真实 AI 的限制

## 执行原则

1. 只做独立演示站的只读核查和可逆的技术修复；新部署完成后核对最新 commit SHA。
2. 不擅自新建收费资源、启用付费计划、发送客户消息或更改现有生产系统。
3. 没有得到线上证据前不把任何待验收项标记为完成。
4. 本任务清单不是正式客户平台上线凭证。
