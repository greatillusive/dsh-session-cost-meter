# 会话费用计 · DSH Session Cost Meter

DeepSeek Harness（DSH）插件：在输入框下方显示**当前会话**的 API 费用估算，并按 DeepSeek
的**峰时 / 空闲时段**分别计价。

> A DeepSeek Harness plugin that shows the current session's estimated API cost under the
> composer, priced with DeepSeek peak / off-peak tariffs.

- 药丸显示 `¥金额 · 峰/谷`，随会话用量实时更新
- 点击展开明细（浮层，不挤压对话区）：峰谷费用与请求数、缓存命中率、输入/输出 token、按模型拆分
- 峰谷自动判定：北京时间工作日 09:00–12:00、14:00–18:00 为峰时；其余时间（含周末、法定节假日全天）为空闲
- 内置 2026 年法定节假日；价目、时段、时区、币种均可配置
- 只读取会话日志里 provider 上报的 token 用量，不发起模型调用、不外发数据

## 价格口径

单位：元 / 百万 tokens（峰时价）；空闲价 = 峰时价 × `offPeakFactor`（默认 0.5）。

| 模型 | 缓存命中输入 | 缓存未命中输入 | 输出 |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.04 | 2 | 8 |
| `deepseek-v4-pro` | 0.30 | 9 | 27 |

价格取自 [DeepSeek 官方价目](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（2026-09 调整）；
节假日取自 [国务院办公厅 2026 年放假安排](https://www.gov.cn/zhengce/content/202511/content_7047090.htm)。
费用为估算值，不替代官方账单；官方调价后改配置即可。

## 安装

需要 DSH 的 `sessionProjections` 服务（基础 profile 默认提供）。

**方式 A：从本地目录安装**

```text
plugin_manager
  action: install_bundle
  target: <本仓库的绝对路径>
```

**方式 B：从 tarball 安装**

```text
plugin_manager
  action: install_bundle
  target: <session-cost-meter-1.0.0.tgz 的绝对路径>
```

安装返回 `"application": "applied"` 后，刷新页面（Ctrl+R）加载客户端脚本，输入框下方即出现费用药丸。
卸载：`plugin_manager action: remove_bundle target: @local/session-cost-meter`。

## 配置

安装后在 profile 的 `cordis.patch.yml` 中修改 `session-cost-meter` 行的 `config`：

```yaml
- id: session-cost-meter
  name: '@local/session-cost-meter'
  config:
    currency: CNY
    offPeakFactor: 0.5
    fallbackModel: deepseek-flash   # 未知模型按它估算；null 表示不计价
    timezone: Asia/Shanghai
    peakWindows: ['09:00-12:00', '14:00-18:00']
    peakWeekdays: [1, 2, 3, 4, 5]
    holidays: ['2026-01-01']        # 省略则用内置 2026 年列表
    prices:
      deepseek-flash: { cacheHit: 0.04, cacheMiss: 2, output: 8 }
      deepseek-v4-pro: { cacheHit: 0.30, cacheMiss: 9, output: 27 }
```

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `currency` | `CNY` | 货币前缀，`CNY` 显示为 `¥` |
| `prices` | 见上表 | `模型 id → { cacheHit, cacheMiss, output }`，峰时价，元/百万 tokens |
| `offPeakFactor` | `0.5` | 空闲时段价格系数 |
| `fallbackModel` | `deepseek-flash` | 无价目模型的参考价目；`null` 表示不参与计价 |
| `timezone` | `Asia/Shanghai` | 峰谷判定时区（IANA 名称） |
| `peakWindows` | 09:00–12:00、14:00–18:00 | 高峰时间窗，也可写 `[开始分钟, 结束分钟]` |
| `peakWeekdays` | `[1,2,3,4,5]` | 高峰星期（ISO，周一=1） |
| `holidays` | 2026 年法定节假日 | `YYYY-MM-DD` 列表，全天按空闲计价 |

## 工作原理

- **Host 半**（`index.js` + `pricing.js`）注册 `sessionCost` 会话投影：折叠
  `assistant/message`、`assistant/attempt` 里 provider 上报的 usage，按事件时间归入峰 / 谷桶，
  并以当前价目计算视图。重试会用同一 turn/step 的最终结算替换尝试值，不会重复计费。
- **Client 半**（`client.js`）用 `useProjection('sessionCost')` 订阅投影值，在
  `conversation.composer.dock` 渲染药丸；明细浮层用 `position: fixed` 按药丸位置定位，
  不参与布局，因此不会把对话区顶起来。
- 投影状态是纯 JSON、可重放；同一份会话日志在任何机器上折叠结果一致。

## 开发

```powershell
node --check index.js
node --check client.js
node test/pricing.test.mjs
```

测试覆盖峰谷判定（含周末与 2026 法定节假日）、三桶计价、重试替换、未知模型回退、
事件忽略时保持引用，以及视图数值全部有限（可 JSON 序列化）。

发布新版本：改 `package.json` 的 `version`，`pnpm pack`，把 tgz 作为 `install_bundle` 的 target。

## 已知限制

- 峰谷归属按**请求完成时间**（事件时间）判定，跨 09:00/12:00/14:00/18:00 边界的单次请求会有少量误差。
- 价格为估算，不作为账单依据；官方调价后需更新 `prices`。
- `holidays` 内置 2026 年；进入 2027 年后请补当年的法定节假日列表。
- 会话分叉（fork）会继承父会话的历史事件，因此子会话的费用包含被继承部分。

## License

MIT，见 [LICENSE](LICENSE)。
