# 配置与数据

## 配置文件

配置文件位于 `config/config.json`，示例模板来自 `config/config.example.json`。

关键字段：

- `api.api_key`：TweAPI.io 的 API Key
- `api.base_url`：默认 `https://api.tweapi.io`
- `api.cookie`：访问私有数据所需（可选）
- `me.username`：个人账号用户名

## 数据目录

- `data/`：运行时数据，默认不纳入版本控制
- `reports/`：生成的 Markdown 报告
