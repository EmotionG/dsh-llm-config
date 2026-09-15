# dsh-llm-config

DeepSeek Harness 的多供应商模型配置插件。每个供应商独立配置接口地址、密钥与模型参数，支持 OpenAI Chat、OpenAI Responses、Anthropic Messages 与 Google Gemini。

## 安装

在 user/.dsh/profiles/web/package.json 中加入本包，例如：

```json
{
  "dsh": { "profile": { "bundles": ["dsh-llm-config"] } },
  "dependencies": {
    "dsh-llm-config": "file:插件目录"
  }
}
```

然后重启 `dsh web`。设置页会出现「模型供应商」。

## 图片输入（识图）

给模型的「输入」勾上 `image` 即声明它接受图片。声明后：

- 框架（dsh-llm）在请求组装时不再把图片投影成占位文本，而是原样交给本插件；
- 本插件通过 dsh 的持久附件服务（`attachments.readImageRequest`）把图片解析成确定性请求版本（含像素/字节数控），再按协议内联进请求体：
  - OpenAI Chat / Responses：`{type: "image_url", image_url: {url: "data:<media>;base64,..."}}`
  - Anthropic Messages：`{type: "image", source: {type: "base64", media_type, data}}`
  - Google Gemini：`{inlineData: {mimeType, data}}`
- 图片旁会附上模型可见的句柄文本（附件名与请求预览尺寸），与官方适配器的约定一致。

未勾 `image` 的模型仍走框架的纯文本投影（图片替换为占位文本），这是框架行为，不是本插件拒绝。运行时如果部署没有挂附件服务，或模型未声明图片能力而请求带了图片，会以 `UNSUPPORTED_CONTENT` 显式失败，不会静默丢图。

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

## 构建

```bash
npm install
npm run build   # tsc 编译宿主半 + esbuild 打包浏览器半
npm test        # 全量测试（smoke/client/adapter/mount/sync/channel/rpc/enrich）
```

沙箱环境（子进程 stdio 管道被拒绝）下 `build:client` 会自动回退到 `scripts/build-client-sandbox.mjs`，直接以继承 stdio 调用 esbuild 二进制。
