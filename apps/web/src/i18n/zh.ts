/** 中文文案。这是主语言，任何新增文案以此为准。 */
export const zh = {
  site: {
    name: '爱拼豆',
    tagline: '把图片变成能照着摆的拼豆图纸',
    description:
      '免费在线拼豆图纸生成器。上传图片自动转成拼豆点阵图纸，支持 MARD 221、COCO、漫漫、Perler、Hama 等主流色卡与 2.6mm / 5mm 豆径，导出可直接打印的图纸与按袋计算的采购清单。',
  },
  nav: {
    editor: '生成图纸',
    palettes: '色卡大全',
    patterns: '图纸库',
    guide: '新手教程',
    feedback: '意见反馈',
  },
  home: {
    heroTitle: '上传一张图，得到一份能照着摆的拼豆图纸',
    heroSubtitle:
      '在浏览器里直接生成，图片不上传服务器。支持国内实体店主流的 2.6mm 豆与 MARD 221 色卡，导出的图纸标注真实色号，拿着就能去配豆。',
    /** 移动端首屏更短的副文案，避免挤占样例区 */
    heroSubtitleMobile: '本地生成 · 图片不上传 · 对得上实体店色号',
    ctaPrimary: '开始生成图纸',
    ctaPrimaryShort: '开始',
    ctaSecondary: '看看色卡大全',
    privacyNote: '全部计算在你的浏览器里完成，图片不会上传到任何服务器。',
  },
  palette: {
    title: '拼豆色卡大全',
    description:
      '收录 MARD 221 / 291、COCO 291、漫漫 278、盼盼 289、咪小窝 290、Artkal、Perler、Hama 等色卡的完整色号与色值，标注数据来源与可信度。',
    colorCount: '色号数',
    version: '色卡版本',
    dataQuality: '数据可信度',
    confidenceHigh: '多源一致',
    confidenceMedium: '单源或轻微分歧',
    confidenceLow: '多源分歧较大',
    unidentified: '色号待确认',
    sources: '数据来源',
    license: '许可',
  },
  editor: {
    upload: '选择图片',
    uploadHint: '支持 JPG、PNG、WebP，也可以直接把图片拖进来',
    generating: '正在生成…',
    size: '成品尺寸',
    beads: '豆数',
    boards: '底板',
    colors: '色号数',
    palette: '色卡',
    beadSize: '豆径',
  },
  bom: {
    title: '用料清单',
    color: '色号',
    beads: '颗数',
    bags: '袋数',
    share: '占比',
    total: '合计',
    bagNote: '按每袋约 1000 粒、含 10% 损耗估算，实际以商家规格为准。',
  },
  disclaimer: {
    colorTitle: '关于颜色的说明',
    colorBody:
      '屏幕上的颜色与实际豆子存在差异，同一色号不同批次也可能有色差。色卡数据来自公开整理，非厂商官方发布，下单前请以商家色卡实物为准。',
    brandBody: '各品牌名称为其各自商标，本站与任何拼豆厂商无隶属或背书关系。',
  },
  common: {
    back: '返回',
    close: '关闭',
    confirm: '确定',
    cancel: '取消',
    copy: '复制',
    copied: '已复制',
    download: '下载',
    print: '打印',
    reset: '重置',
    loading: '加载中…',
  },
};

/**
 * 字典类型由中文推导而来。
 *
 * 这里刻意不加 as const：那会把每条文案收窄成字面量类型，
 * 于是任何英文翻译都无法赋值给同一个类型（'AiPindou' 不是 '爱拼豆'）。
 * 用宽松的 string 才能让「结构必须一致、内容可以不同」这个约束成立，
 * 漏翻一条仍会在构建期报错。
 */
export type Dictionary = typeof zh;
