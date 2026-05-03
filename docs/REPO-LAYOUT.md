# Repo Layout

这个仓库现在按两层来维护：

## 1. Source of truth

这些目录应该长期进版本库：

- `config/`
- `scripts/`
- `src/`
- `workers/`
- `docs/`
- `wiki/`
- `public/generated-sites/`
- `public/robots.txt`
- `public/llms.txt`

它们分别承担：

- `config/`: thesis / routing / experiment 配置
- `scripts/`: pipeline、release、SEO、GA4、ops 自动化
- `workers/`: 真实表单收集、交付、commercial ops 后端
- `wiki/`: Wiki-first 内容资产层
- `public/generated-sites/`: 当前可部署样板站页面和下载资产

## 2. Runtime artifacts

这些目录或文件是“每次运行都会变”的本地产物，不再作为长期源码管理对象：

- `public/generated/*`
- `storage/*.json`
- `storage/*.md`
- `storage/release-runs/*`
- `public/<indexnow-key>.txt`
- `.wrangler/`
- `dist/`

它们仍然是系统的重要输出，但应该通过命令重新生成，而不是靠 git 历史回放：

```bash
pnpm run pipeline
pnpm run commercial:ops
pnpm run seo:diagnostics
pnpm run seo:submit
pnpm run release:prod
```

## Practical rule

判断一个文件该不该进版本库，可以用这条简单规则：

- 如果它定义系统行为、页面结构、资产标准或交付逻辑，就提交
- 如果它只是某一次运行的快照、报告、队列、监控结果或临时发布产物，就不要提交

## CI baseline

仓库默认用 GitHub Actions 跑一条轻量校验链：

```bash
pnpm run validate
```

这条校验只验证源码层，不依赖 Cloudflare、Google、GA4、GSC 的线上凭据。
