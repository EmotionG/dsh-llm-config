# dsh-llm-config

DeepSeek Harness 的多供应商模型配置插件。每个供应商独立配置接口地址、密钥与模型参数，支持 OpenAI Chat、OpenAI Responses、Anthropic Messages 与 Google Gemini。

## 兼容性

本插件适配 **DSH 0.2.0-rc.2**，即 DeepSeek Harness 桌面端 44.0.0 内置的运行时（`@deepseek-ai/dsh-desktop-runtime@0.2.0-rc.2`）。

`peerDependencies` 中的 `@deepseek-ai/dsh-*` 一律声明为 `>=0.2.0-rc.2 <0.3.0`，与桌面端市场的宿主兼容性闸门（`satisfiesRange(runtimeVersion, range, { includePrerelease: true })`）一致。**0.1.x 运行时不兼容**：本版本使用了 0.2 的消息模型与设置模型，详见下文「0.2 迁移要点」。

```bash
npm run check:market   # 用桌面端市场自己的闸门校验上面的 peer 范围
```

该脚本从 `scripts/extract-runtime.mjs` 抽取出的桌面端运行时清单读取真实版本号，先运行一次抽取：

```bash
node scripts/extract-runtime.mjs   # 从已安装的 app.asar 抽取运行时包到 .dsh-ref/
```

## 安装

在 user/.dsh/profiles/<profile>/package.json 中加入本包，例如：

```json
{
  "dsh": { "profile": { "bundles": ["dsh-llm-config"] } },
  "dependencies": {
    "dsh-llm-config": "file:插件目录"
  }
}
```

然后重启 `dsh` / 桌面端。设置页会出现「模型供应商」。

## 设置模型（0.2）

0.2 把「设置命名空间」的所有权从插件收回到框架：

- 插件的 `package.json` 所在 profile **条目就是命名空间**，条目 id 由本包的 `cordis.patch.yml` 固定为 `llm-config`；
- 插件导出的 `Config`（schemastery schema）就是条目 schema，设置服务用它校验写入并投影表单；
- `providers` 字段带 `.volatile()`，因此保存设置会把新快照提交进正在运行的插件（不重启），并通过 `loader/volatile-update` 通知本插件重建路由。

因此有三件事必须同时成立，`test/channel.mjs` 与 `test/compat.mjs` 会把它们钉住：

1. `cordis.patch.yml` 的条目 id、宿主常量 `NS`、客户端页面常量 `NS` 三者相等；
2. `Config` 至少有一个**固定对象路径**上的 `.volatile()` 字段——否则 `SettingsForms.volatileForm` 返回 `undefined`，任何写入都会抛 `has no volatile fields`（页面能渲染但存不下去）；
3. 宿主与客户端都通过 `remote.settings` 的 `{ok, value}` 信封读写，并按**条目 id**（不是 `settings.llm-config`）寻址。

插件自带手写页面，所以宿主调用 `ctx.settings.configure({ auto: false })` 关掉框架自动生成的表单。`settings.llm-config` 只作为**文案（locale）命名空间**存在。

## 图片输入（识图）

给模型的「输入」勾上 `image` 即声明它接受图片。声明后：

- 框架（dsh-llm）在请求组装时不再把图片投影成占位文本，而是原样交给本插件；
- 本插件通过 dsh 的持久附件服务把图片解析成确定性请求版本，再按协议内联进请求体：
  - OpenAI Chat / Responses：`{type: "image_url", image_url: {url: "data:<media>;base64,..."}}`
  - Anthropic Messages：`{type: "image", source: {type: "base64", media_type, data}}`
  - Google Gemini：`{inlineData: {mimeType, data}}`
- 图片旁会附上模型可见的句柄文本（附件名与请求预览尺寸），与官方适配器的约定一致。

0.2 的附件接口要求完整的 **`ImageRequestTarget`**（`width` / `height` / `maxBytes`），因此本插件先用框架的 `requestImageDimensions()` 按像素预算算出目标尺寸再取版本，缓存键覆盖全部变换输入。

被框架标记为 `offloaded` 的图片**不会**作为字节发送：本插件在组装前先用 `projectOffloadedImages` 把它们投影成占位文本，因此这类请求既不解析请求版本，也不要求挂载附件服务。

未勾 `image` 的模型仍走框架的纯文本投影（图片替换为占位文本），这是框架行为，不是本插件拒绝。运行时如果部署没有挂附件服务，或模型未声明图片能力而请求带了图片，会以 `UNSUPPORTED_CONTENT` 显式失败，不会静默丢图。

## 工具调用与消息角色（0.2）

0.2 把工具结果提升为一等公民：

| | 0.1.x | 0.2 |
|---|---|---|
| 工具结果 | user 消息里的 `tool-result` 内容块 | `role: 'tool'` 消息（`toolCallId` / `isError`） |
| 系统提示 | 只有 `options.system` | `options.system` **或** 历史里的首条 `system` 消息 |
| 工具声明变更 | 不存在 | `developer` 消息 + `tool-addition` / `tool-removal` 块 |

本插件的序列化按 0.2 口径重写：首条 `system` 消息进协议的系统槽（OpenAI 前置消息 / Anthropic 顶层 `system` / Gemini `systemInstruction`），更靠后的 `system` 消息并入 user 文本；连续的工具结果在 Anthropic 上合并进**同一条** user 消息（并带 `is_error`），在 Gemini 上用调用方的**函数名**（而不是 call id）作为 `functionResponse.name`。

`developer` 消息承载的是四种 wire format 都无法表达的工具声明变更，本适配器以 `UNSUPPORTED_CONTENT` 显式拒绝（与官方适配器一致），而不是把它们当用户文本发出去。

## 请求失败重试

每个供应商可配置失败重试策略，默认**有限次数 5 次**（框架默认）：

```yaml
llm-config:
  providers:
    my-gateway:
      retry: 3            # 数字简写：normal 模式，最多重试 3 次
    another:
      retry:
        mode: always      # 无限重试直到成功/取消
    third: {}             # 不写 retry：normal 模式默认 5 次
```

- `retry: <n>` — `mode: normal` 的简写，`maxRetries: n`；
- `retry: {mode: always}` — 无限重试（退避仍由框架执行）；
- 完整对象还接受 `retryableCodes` 与 `backoff`（`initialDelayMs` / `maxDelayMs` / `jitterRatio`），校验复用框架的 `resolveRetryPolicy`，错误信息与 dsh 自带供应商插件一致。

重试只作用于**瞬时错误**（默认码：`EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`）；鉴权、配额等确定性错误不重试。执行者是宿主侧的 `dsh-llm-retry` 插件（agent 循环的请求恢复扩展点），本插件只负责声明策略——策略在路由注册时被框架捕获，因此修改 `retry` 后本插件会重建该路由，下一次请求即生效，无需重启。

设置页「高级选项」中提供「失败重试」下拉（有限次数 / 一直重试）与重试次数输入框；留空即默认 5。

## 自建 RPC 频道

models.dev 目录查询走插件自己的宿主 RPC 频道 `/llm-config`。0.2.0-rc.2 上**必须**用带 owner 的私有重载：

```ts
connection.register(scoped, RPC_CHANNEL, handler)
```

公开的 `ctx.connection.rpc.handle(channel, handler)` 取 `owner = this.ctx`，即连接服务**自己**的上下文（没有注入 `webServer`），于是 `owner.effect(() => owner.webServer.register(route))` 抛 `cannot get property "webServer" without inject`；cordis 的服务追踪并不会把 `this.ctx` 重绑到读取方上下文，所以从注入了 `webServer` 的作用域读取服务也没用。本插件先尝试公开入口（宿主修正后自动切换），失败再退回上面这条路径，`test/rpc.mjs` 覆盖两种宿主线。

## 构建与测试

```bash
npm install
npm run build      # tsc 编译宿主半 + esbuild 打包浏览器半
npm run typecheck  # 宿主半 + 浏览器半
npm test           # 全量测试（smoke/client/adapter/mount/sync/channel/rpc/enrich/runtime/compat/responses）
```

沙箱环境（子进程 stdio 管道被拒绝）下 `build:client` 会自动回退到 `scripts/build-client-sandbox.mjs`，直接以继承 stdio 调用 esbuild 二进制。

## OpenAI Responses

`openai-responses` 走真正独立的 wire format（`POST <baseURL>/responses`），不再复用 Chat Completions 的请求体与事件词汇。形状对齐桌面端运行时自带的 `@earendil-works/pi-ai@0.87.1` Responses 适配器。

请求：

| | Chat Completions | Responses |
|---|---|---|
| 消息 | `messages[]`（role 消息） | `input[]`（**item** 列表） |
| 系统提示 | 首条 `system` 消息 | 顶层 `instructions` 字符串 |
| 助手文本 | `message.content` | `{type:'message', role:'assistant', content:[{type:'output_text'}]}` |
| 工具调用 | `tool_calls[]` 挂在消息上 | 独立 `{type:'function_call', call_id, name, arguments}` item |
| 工具结果 | `{role:'tool', tool_call_id}` | `{type:'function_call_output', call_id, output}` item |
| 工具声明 | `{type:'function', function:{…}}` | 扁平 `{type:'function', name, description, parameters}` |
| 文本/图片 part | `text` / `image_url`（`{url}` 对象） | `input_text` / `input_image`（URL **字符串**） |
| 输出上限 | `max_tokens` | `max_output_tokens`（API 最小值 16，低于即上调） |
| 停止串 | `stop` | **无此字段**，配置的 stop 在此协议被丢弃（需要非标写法请用 `extraBody`） |
| 推理档位 | 顶层 `reasoning_effort` | 嵌套 `reasoning.effort` |

工具调用的 item `id` 被**有意省略**：它必须是 provider 自己的 `fc_*` item id 才能回放，而跨协议的历史里可能是 Chat 的 `call_*` 或 Anthropic 的 `toolu_*`，带上去会触发配对校验失败；`call_id` 才是与 `function_call_output` 配对的键。

流式事件按 `output_index` 寻址（不是 `choices[0].delta`），完整性的判据是终态事件 `response.completed` / `response.incomplete` / `response.failed`——该协议**没有 `[DONE]` 哨兵**（仍接受，因为部分网关会补发）。`reasoning_summary_text.delta` / `reasoning_text.delta` 进 reasoning 块，`refusal.delta` 作为可见文本呈现而不是丢弃。

终态到 finish reason 的映射，以及各自的可重试性：

| 终态 | finish reason | 默认策略下重试？ |
|---|---|---|
| `completed`（无工具调用） | `stop` | — |
| `completed`（有工具调用） | `tool-calls` | — |
| `incomplete` + `max_output_tokens` | `max-tokens` | — |
| `incomplete` + 其他原因 | `error` / `INVALID_REQUEST` | 否（确定性失败） |
| `response.failed` | `error` / `SERVER` | 是 |
| SSE `error` 事件 | `error` / `SERVER` | 是 |

usage 与 Chat Completions 一样把 `input_tokens_details.cached_tokens` / `cache_write_tokens` 从 `input_tokens` 里减掉，保持三个计数互不重叠；`output_tokens_details.reasoning_tokens` 单独上报。

协议自身的错误终态优先于适配器的「只推理无可见文本」兜底：后者不会再追加第二个 finish 块覆盖 provider 的判定。

## 已知缺口

无已知的 wire-format 缺口。`openai-responses` 之外未实现的 Responses 特性（`store` / `previous_response_id` 状态化续写、`include: ["reasoning.encrypted_content"]` 的推理回放、custom/grammar 工具）都不在本插件的配置面内；需要时可通过模型的 `extraBody` 注入额外字段。

