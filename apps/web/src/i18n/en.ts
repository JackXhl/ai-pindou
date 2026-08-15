import type { Dictionary } from './zh.js';

/**
 * 英文文案。
 *
 * 中文是主语言，英文为次。类型上强制与中文字典同构，
 * 漏翻一条会在构建期报错，而不是上线后露出一句中文。
 */
export const en: Dictionary = {
  site: {
    name: 'AiPindou',
    tagline: 'Turn any image into a fuse bead pattern you can actually build',
    description:
      'Free online fuse bead pattern generator. Convert images into bead grids with real colour codes. Supports MARD 221, COCO, Perler, Hama and 2.6mm / 5mm bead sizes, with printable charts and per-bag shopping lists.',
  },
  nav: {
    editor: 'Create',
    palettes: 'Colour charts',
    patterns: 'Patterns',
    guide: 'Guides',
    feedback: 'Feedback',
  },
  home: {
    heroTitle: 'Upload an image, get a bead pattern you can follow',
    heroSubtitle:
      'Generated entirely in your browser — your image is never uploaded. Supports the 2.6mm beads and MARD 221 chart used by most physical shops in China, with real colour codes on every export.',
    heroSubtitleMobile: 'Runs locally · no upload · shop-ready colour codes',
    ctaPrimary: 'Create a pattern',
    ctaPrimaryShort: 'Start',
    ctaSecondary: 'Browse colour charts',
    privacyNote:
      'Everything runs in your browser. Your image is never sent to a server.',
  },
  palette: {
    title: 'Fuse bead colour charts',
    description:
      'Complete colour codes and values for MARD 221 / 291, COCO 291, Artkal, Perler, Hama and more, annotated with data sources and confidence levels.',
    colorCount: 'Colours',
    version: 'Chart version',
    dataQuality: 'Data confidence',
    confidenceHigh: 'Sources agree',
    confidenceMedium: 'Single source or minor disagreement',
    confidenceLow: 'Sources disagree significantly',
    unidentified: 'Code unconfirmed',
    sources: 'Sources',
    license: 'Licence',
  },
  editor: {
    upload: 'Choose an image',
    uploadHint: 'JPG, PNG or WebP — you can also drop a file here',
    generating: 'Generating…',
    size: 'Finished size',
    beads: 'Beads',
    boards: 'Pegboards',
    colors: 'Colours',
    palette: 'Colour chart',
    beadSize: 'Bead size',
  },
  bom: {
    title: 'Materials',
    color: 'Code',
    beads: 'Beads',
    bags: 'Bags',
    share: 'Share',
    total: 'Total',
    bagNote:
      'Estimated at ~1000 beads per bag including 10% wastage. Check your seller for actual pack sizes.',
  },
  disclaimer: {
    colorTitle: 'About colour accuracy',
    colorBody:
      'Screen colours differ from real beads, and the same code can vary between production batches. Chart data is compiled from public sources, not published by manufacturers — always check the seller’s physical chart before ordering.',
    brandBody:
      'Brand names are trademarks of their respective owners. This site is not affiliated with or endorsed by any bead manufacturer.',
  },
  common: {
    back: 'Back',
    close: 'Close',
    confirm: 'Confirm',
    cancel: 'Cancel',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    print: 'Print',
    reset: 'Reset',
    loading: 'Loading…',
  },
};
