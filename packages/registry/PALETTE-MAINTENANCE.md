# 色卡周更流程

色卡是产品可信度的根基：**无可靠来源不猜测**。每周或有新源时按下列步骤更新。

## 命令

```bash
# 1. 从源脚本重建 JSON（packages/registry/scripts/build-palettes.mjs）
pnpm refresh:palettes

# 2. 数据门禁：色号、HEX、LAB、sets.codesKnown、禁止错误合并等
pnpm verify:data

# 3. 全量门禁（含类型、单测、静态构建；构建会生成色卡详情页）
pnpm check
```

## 规则

1. **有源才加**：商家 PDF、开源色卡（如 bitbead CC BY）、可核验的实测表。传闻色号清单不得写入 `codes`。
2. **`codesKnown: false` 时 `codes` 必须为空**：套装档位只展示色数，UI 引导用户手选/导入。
3. **跨品牌禁止色号字面映射**：只走 HEX + CIEDE2000（见 `apps/web/src/lib/convert.ts`）。
4. **COCO 等易撞号品牌**：构建脚本会拒绝「色号相同但 ΔE 过高」的错误合并。
5. **新增品牌**：在 `build-palettes.mjs` 增加源与 loader，再跑 refresh → verify → check。详情页 `/palette/<id>/` 与换算页由静态路径自动生成。

## 本周优先

| 优先级 | 项 | 说明 |
| --- | --- | --- |
| P0 | 现有 10 套校验保持绿 | `verify:data` 断言全过 |
| P1 | Artkal S 系列 | 若缺可靠源则跳过，不编造 |
| P2 | 国产长尾 | 有公开色值表再加 |

## 发布检查

- [ ] `pnpm check` 全绿
- [ ] 新色卡详情页可打开，页脚 CC BY 署名仍在
- [ ] 换算矩阵入口出现在色卡详情页
- [ ] sitemap 含新 `/palette/...` 路径（构建后产物）
