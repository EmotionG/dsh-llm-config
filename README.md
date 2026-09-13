# dsh-llm-config

DeepSeek Harness 的多供应商模型配置插件。每个供应商独立配置接口地址、密钥与模型参数，支持 OpenAI Chat、OpenAI Responses、Anthropic Messages 与 Google Gemini。

## 安装

在 web profile 中加入本包，例如：

```json
{
  "dsh": { "profile": { "bundles": ["dsh-llm-config"] } },
  "dependencies": {
    "dsh-llm-config": "file:D:/developer/opencodeProject1/dsh-llm-config"
  }
}
```

然后重启 `dsh web`。设置页会出现「模型供应商」。

## 开发

```bash
npm install
npm test
```
