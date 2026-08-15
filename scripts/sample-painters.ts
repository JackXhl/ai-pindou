export type Rgba = [number, number, number, number];

export type SamplePainter = () => { width: number; height: number; data: Uint8ClampedArray };

export type SampleCatalogItem = {
  id: string;
  title: string;
  tag: '入门' | '可爱' | '风景' | '静物' | '人像感' | '节日' | '几何';
  featured: boolean;
  image: SamplePainter;
  opts: {
    cols: number;
    rows: number;
    simplify?: number;
    maxColors?: number;
    dither?: boolean;
  };
};

export function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a;
    }
  }
  return { width, height, data };
}

const opts29 = (simplify = 28, maxColors = 12) => ({
  cols: 29,
  rows: 29,
  simplify,
  maxColors,
});

function heartImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const nx = (x / (size - 1)) * 2 - 1;
    const ny = (y / (size - 1)) * 2 - 1.1;
    const v = (nx * nx + ny * ny - 0.3) ** 3 - nx * nx * ny * ny * ny;
    if (v <= 0) return [220, 40, 60, 255];
    return [255, 250, 248, 255];
  });
}

function smileyImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d > cx * 0.92) return [255, 210, 50, 255];
    if (d > cx * 0.78) return [40, 40, 40, 255];
    const eyeL = Math.hypot(x - cx * 0.65, y - cy * 0.75);
    const eyeR = Math.hypot(x - cx * 1.35, y - cy * 0.75);
    if (eyeL < cx * 0.12 || eyeR < cx * 0.12) return [40, 40, 40, 255];
    if (y > cy * 1.15 && y < cy * 1.35 && Math.abs(x - cx) < cx * 0.45) {
      return [40, 40, 40, 255];
    }
    return [255, 210, 50, 255];
  });
}

function mushroomImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const stemW = size * 0.22;
    if (Math.abs(x - cx) < stemW && y > size * 0.55) return [245, 235, 210, 255];
    const capY = size * 0.45;
    const capR = size * 0.42;
    if (Math.hypot(x - cx, y - capY) < capR) {
      if (Math.hypot(x - cx * 0.75, y - capY * 0.85) < size * 0.08) return [255, 255, 255, 255];
      if (Math.hypot(x - cx * 1.25, y - capY * 0.95) < size * 0.07) return [255, 255, 255, 255];
      if (Math.hypot(x - cx, y - capY * 0.7) < size * 0.06) return [255, 255, 255, 255];
      return [220, 50, 45, 255];
    }
    return [180, 220, 255, 255];
  });
}

function starImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const ang = Math.atan2(y - cy, x - cx);
    const dist = Math.hypot(x - cx, y - cy);
    const spikes = 5;
    const outer = size * 0.42;
    const inner = size * 0.18;
    const mod = ((ang + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    const sector = mod * spikes;
    const t = sector - Math.floor(sector);
    const r = t < 0.5 ? outer : inner + (outer - inner) * (1 - (t - 0.5) * 2);
    if (dist < r) return [255, 200, 40, 255];
    return [30, 40, 80, 255];
  });
}

function cherryImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const c1 = { x: size * 0.38, y: size * 0.62, r: size * 0.18 };
    const c2 = { x: size * 0.62, y: size * 0.68, r: size * 0.17 };
    const d1 = Math.hypot(x - c1.x, y - c1.y);
    const d2 = Math.hypot(x - c2.x, y - c2.y);
    if (d1 < c1.r || d2 < c2.r) return [200, 25, 45, 255];
    const stemX = size * 0.5;
    if (Math.abs(x - stemX) < 2 && y < size * 0.35) return [60, 120, 50, 255];
    if (Math.hypot(x - size * 0.35, y - size * 0.32) < 3) return [60, 120, 50, 255];
    return [255, 252, 248, 255];
  });
}

function cloverImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const leaves: [number, number][] = [
      [size * 0.35, size * 0.35],
      [size * 0.65, size * 0.35],
      [size * 0.35, size * 0.65],
      [size * 0.65, size * 0.65],
    ];
    for (const [lx, ly] of leaves) {
      if (Math.hypot(x - lx, y - ly) < size * 0.16) return [50, 160, 70, 255];
    }
    if (Math.abs(x - size * 0.5) < 3 && y > size * 0.45) return [50, 120, 40, 255];
    return [240, 248, 240, 255];
  });
}

function catImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const faceR = size * 0.32;
    if (Math.hypot(x - cx, y - cy) < faceR) {
      const eyeL = Math.hypot(x - cx * 0.75, y - cy * 0.85);
      const eyeR = Math.hypot(x - cx * 1.25, y - cy * 0.85);
      if (eyeL < size * 0.05 || eyeR < size * 0.05) return [30, 30, 30, 255];
      if (Math.abs(x - cx) < 3 && y > cy * 1.05 && y < cy * 1.15) return [255, 160, 180, 255];
      return [255, 180, 100, 255];
    }
    if (y < cy * 0.55 && x < cx * 0.7 && Math.hypot(x - cx * 0.55, y - cy * 0.45) < size * 0.12)
      return [255, 180, 100, 255];
    if (y < cy * 0.55 && x > cx * 1.3 && Math.hypot(x - cx * 1.45, y - cy * 0.45) < size * 0.12)
      return [255, 180, 100, 255];
    return [255, 240, 230, 255];
  });
}

function rainbowImage(w: number, h: number) {
  return makeImage(w, h, (x) => {
    const t = x / (w - 1);
    const hue = t * 300;
    const s = 0.85;
    const l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = hue / 60;
    const x2 = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) [r, g, b] = [c, x2, 0];
    else if (hp < 2) [r, g, b] = [x2, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x2];
    else if (hp < 4) [r, g, b] = [0, x2, c];
    else if (hp < 5) [r, g, b] = [x2, 0, c];
    else [r, g, b] = [c, 0, x2];
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
      255,
    ];
  });
}

// —— 入门 ——
function moonImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size * 0.48;
    const cy = size * 0.5;
    const r = size * 0.32;
    const d = Math.hypot(x - cx, y - cy);
    if (d < r) {
      const cut = Math.hypot(x - (cx + size * 0.14), y - (cy - size * 0.06));
      if (cut < r * 0.85) return [35, 40, 70, 255];
      return [245, 230, 160, 255];
    }
    if ((x * 7 + y * 13) % 47 === 0 && d > r * 1.2) return [200, 210, 255, 255];
    return [35, 40, 70, 255];
  });
}

function cloudImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const bumps: [number, number, number][] = [
      [size * 0.32, size * 0.52, size * 0.18],
      [size * 0.5, size * 0.45, size * 0.22],
      [size * 0.68, size * 0.52, size * 0.17],
      [size * 0.5, size * 0.58, size * 0.2],
    ];
    for (const [cx, cy, r] of bumps) {
      if (Math.hypot(x - cx, y - cy) < r) return [255, 255, 255, 255];
    }
    return [140, 190, 240, 255];
  });
}

function arrowImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const shaft = Math.abs(y - cx) < size * 0.08 && x > size * 0.15 && x < size * 0.72;
    const head =
      x > size * 0.55 &&
      Math.abs(y - cx) < (x - size * 0.55) * 0.9 &&
      Math.abs(y - cx) > (x - size * 0.72) * 0.35;
    if (shaft || head) return [40, 90, 200, 255];
    return [245, 248, 255, 255];
  });
}

function checkImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const nx = x / size;
    const ny = y / size;
    const left = Math.abs(ny - (0.55 + (0.25 - nx) * 1.1)) < 0.07 && nx > 0.18 && nx < 0.42;
    const right = Math.abs(ny - (0.28 + (nx - 0.42) * 1.35)) < 0.07 && nx >= 0.42 && nx < 0.82;
    if (left || right) return [40, 170, 90, 255];
    return [240, 252, 245, 255];
  });
}

function diamondImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const dx = Math.abs(x - cx) / (size * 0.35);
    const dy = Math.abs(y - cy) / (size * 0.42);
    if (dx + dy < 1) {
      if (y < cy * 0.85) return [120, 210, 255, 255];
      return [40, 140, 220, 255];
    }
    return [250, 252, 255, 255];
  });
}

// —— 可爱 ——
function fishImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size * 0.48;
    const cy = size * 0.5;
    const body = (x - cx) ** 2 / (size * 0.28) ** 2 + (y - cy) ** 2 / (size * 0.16) ** 2 < 1;
    const tail =
      x > size * 0.72 &&
      Math.abs(y - cy) < (x - size * 0.72) * 1.4 &&
      Math.abs(y - cy) > (x - size * 0.88) * 0.5;
    if (body || tail) {
      if (Math.hypot(x - size * 0.32, y - cy * 0.9) < size * 0.04) return [20, 30, 50, 255];
      return [80, 170, 220, 255];
    }
    return [230, 245, 255, 255];
  });
}

function birdImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const body = Math.hypot(x - size * 0.45, y - size * 0.52) < size * 0.18;
    const head = Math.hypot(x - size * 0.62, y - size * 0.38) < size * 0.12;
    const beak =
      x > size * 0.7 &&
      x < size * 0.88 &&
      Math.abs(y - size * 0.4) < size * 0.04 + (x - size * 0.7) * 0.15;
    const wing =
      Math.abs(y - (size * 0.48 + (x - size * 0.35) * 0.2)) < size * 0.05 &&
      x > size * 0.22 &&
      x < size * 0.5;
    if (beak) return [255, 160, 40, 255];
    if (body || head || wing) {
      if (Math.hypot(x - size * 0.66, y - size * 0.36) < size * 0.025) return [20, 20, 30, 255];
      return [70, 130, 200, 255];
    }
    return [245, 250, 255, 255];
  });
}

function bunnyImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const face = Math.hypot(x - size * 0.5, y - size * 0.58) < size * 0.28;
    const earL =
      Math.abs(x - size * 0.35) < size * 0.08 && y > size * 0.08 && y < size * 0.42;
    const earR =
      Math.abs(x - size * 0.65) < size * 0.08 && y > size * 0.08 && y < size * 0.42;
    if (earL || earR) {
      if (Math.abs(x - (earL ? size * 0.35 : size * 0.65)) < size * 0.03) return [255, 180, 200, 255];
      return [250, 245, 240, 255];
    }
    if (face) {
      const eyeL = Math.hypot(x - size * 0.4, y - size * 0.52);
      const eyeR = Math.hypot(x - size * 0.6, y - size * 0.52);
      if (eyeL < size * 0.04 || eyeR < size * 0.04) return [30, 30, 30, 255];
      if (Math.hypot(x - size * 0.5, y - size * 0.62) < size * 0.035) return [255, 150, 170, 255];
      return [250, 245, 240, 255];
    }
    return [255, 240, 245, 255];
  });
}

function cupcakeImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const icing = Math.hypot(x - size * 0.5, y - size * 0.38) < size * 0.22;
    const paper =
      y > size * 0.48 &&
      y < size * 0.82 &&
      Math.abs(x - size * 0.5) < size * 0.22 - (y - size * 0.48) * 0.15;
    const cherry = Math.hypot(x - size * 0.5, y - size * 0.2) < size * 0.06;
    if (cherry) return [220, 40, 60, 255];
    if (icing) return [255, 200, 220, 255];
    if (paper) {
      const stripe = Math.floor(x / 4) % 2 === 0;
      return stripe ? [255, 180, 80, 255] : [255, 220, 140, 255];
    }
    return [255, 250, 245, 255];
  });
}

function appleImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const body = Math.hypot(x - size * 0.5, y - size * 0.55) < size * 0.28;
    const dent = Math.hypot(x - size * 0.5, y - size * 0.32) < size * 0.08;
    const leaf =
      Math.hypot(x - size * 0.62, y - size * 0.28) < size * 0.08 && x > size * 0.52;
    const stem = Math.abs(x - size * 0.5) < 2 && y > size * 0.18 && y < size * 0.35;
    if (leaf) return [60, 160, 70, 255];
    if (stem) return [90, 60, 40, 255];
    if (body && !dent) {
      if (Math.hypot(x - size * 0.38, y - size * 0.48) < size * 0.05) return [255, 120, 100, 255];
      return [210, 40, 45, 255];
    }
    return [255, 248, 245, 255];
  });
}

function pawImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const pads: [number, number, number][] = [
      [size * 0.5, size * 0.62, size * 0.18],
      [size * 0.28, size * 0.38, size * 0.1],
      [size * 0.42, size * 0.28, size * 0.1],
      [size * 0.58, size * 0.28, size * 0.1],
      [size * 0.72, size * 0.38, size * 0.1],
    ];
    for (const [cx, cy, r] of pads) {
      if (Math.hypot(x - cx, y - cy) < r) return [80, 50, 40, 255];
    }
    return [255, 245, 235, 255];
  });
}

// —— 风景 ——
function sunriseImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const sun = Math.hypot(x - size * 0.5, y - size * 0.42) < size * 0.16;
    if (sun) return [255, 200, 60, 255];
    if (y > size * 0.62) return [40, 90, 70, 255];
    const t = y / size;
    return [
      Math.round(255 - t * 40),
      Math.round(160 + t * 40),
      Math.round(100 + t * 80),
      255,
    ];
  });
}

function hillsImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const h1 = size * 0.55 + Math.sin(x / size * Math.PI * 2) * size * 0.08;
    const h2 = size * 0.68 + Math.sin(x / size * Math.PI * 3 + 1) * size * 0.06;
    if (y > h2) return [50, 120, 60, 255];
    if (y > h1) return [90, 160, 80, 255];
    return [180, 220, 255, 255];
  });
}

function wavesImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const wave = size * 0.5 + Math.sin(x / size * Math.PI * 4) * size * 0.08;
    if (Math.abs(y - wave) < size * 0.06) return [255, 255, 255, 255];
    if (y > wave) return [40, 120, 180, 255];
    return [160, 210, 240, 255];
  });
}

function nightSkyImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const star = (x * 17 + y * 31) % 53 === 0;
    if (star && y < size * 0.7) return [255, 250, 200, 255];
    if (y > size * 0.78) return [20, 35, 50, 255];
    const t = y / size;
    return [
      Math.round(20 + t * 20),
      Math.round(25 + t * 30),
      Math.round(60 + t * 40),
      255,
    ];
  });
}

function treeLineImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const treeX = Math.floor(x / (size * 0.14)) * (size * 0.14) + size * 0.07;
    const trunk = Math.abs(x - treeX) < size * 0.02 && y > size * 0.55 && y < size * 0.85;
    const crown = Math.hypot(x - treeX, y - size * 0.48) < size * 0.1;
    if (trunk) return [90, 60, 40, 255];
    if (crown) return [40, 120, 55, 255];
    if (y > size * 0.82) return [70, 100, 50, 255];
    return [200, 230, 255, 255];
  });
}

function islandImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const land =
      (x - size * 0.5) ** 2 / (size * 0.28) ** 2 + (y - size * 0.58) ** 2 / (size * 0.12) ** 2 < 1;
    const palm =
      Math.abs(x - size * 0.55) < 2 && y > size * 0.35 && y < size * 0.58;
    const frond = Math.hypot(x - size * 0.55, y - size * 0.35) < size * 0.12 && y < size * 0.4;
    if (frond) return [40, 140, 60, 255];
    if (palm) return [100, 70, 40, 255];
    if (land) return [230, 210, 140, 255];
    if (y > size * 0.55) return [50, 140, 200, 255];
    return [160, 210, 255, 255];
  });
}

function rainImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const drop = (x + Math.floor(y * 0.4)) % 7 === 0 && y > size * 0.15;
    if (drop) return [120, 170, 220, 255];
    if (y > size * 0.85) return [60, 90, 70, 255];
    return [90, 110, 130, 255];
  });
}

function auroraImage(w: number, h: number) {
  return makeImage(w, h, (x, y) => {
    const t = x / (w - 1);
    const band = 0.35 + Math.sin(t * Math.PI * 3) * 0.12 + Math.sin(t * 8) * 0.04;
    const ny = y / (h - 1);
    const dist = Math.abs(ny - band);
    if (dist < 0.12) {
      const g = Math.round(180 + (1 - dist / 0.12) * 60);
      const b = Math.round(120 + Math.sin(t * Math.PI * 2) * 80);
      return [60, g, Math.min(255, b + 80), 255];
    }
    if ((x * 11 + y * 19) % 61 === 0) return [220, 230, 255, 255];
    return [15, 20, 45, 255];
  });
}

// —— 静物 ——
function vaseImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const neck = Math.abs(x - size * 0.5) < size * 0.1 && y > size * 0.25 && y < size * 0.45;
    const body =
      (x - size * 0.5) ** 2 / (size * 0.22) ** 2 + (y - size * 0.65) ** 2 / (size * 0.22) ** 2 < 1;
    const flower = Math.hypot(x - size * 0.5, y - size * 0.2) < size * 0.08;
    if (flower) return [230, 80, 100, 255];
    if (neck || body) return [90, 140, 180, 255];
    return [250, 248, 245, 255];
  });
}

function mugImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cup =
      x > size * 0.28 &&
      x < size * 0.68 &&
      y > size * 0.28 &&
      y < size * 0.78;
    const handle =
      Math.hypot(x - size * 0.75, y - size * 0.5) < size * 0.12 &&
      Math.hypot(x - size * 0.75, y - size * 0.5) > size * 0.06 &&
      x > size * 0.65;
    if (handle) return [220, 90, 70, 255];
    if (cup) {
      if (y < size * 0.38) return [240, 230, 210, 255];
      return [220, 90, 70, 255];
    }
    return [255, 250, 245, 255];
  });
}

function bookImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cover =
      x > size * 0.22 &&
      x < size * 0.78 &&
      y > size * 0.25 &&
      y < size * 0.78;
    const spine = x > size * 0.22 && x < size * 0.3 && y > size * 0.25 && y < size * 0.78;
    const pages = x > size * 0.72 && x < size * 0.78 && y > size * 0.28 && y < size * 0.75;
    if (pages) return [245, 240, 230, 255];
    if (spine) return [40, 70, 120, 255];
    if (cover) {
      if (Math.abs(y - size * 0.45) < 2 && x > size * 0.35 && x < size * 0.68) return [255, 220, 100, 255];
      return [60, 100, 160, 255];
    }
    return [250, 248, 245, 255];
  });
}

function plantImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const pot =
      Math.abs(x - size * 0.5) < size * 0.18 - (y - size * 0.62) * 0.1 &&
      y > size * 0.62 &&
      y < size * 0.88;
    const leaves: [number, number, number][] = [
      [size * 0.5, size * 0.35, size * 0.12],
      [size * 0.35, size * 0.45, size * 0.1],
      [size * 0.65, size * 0.45, size * 0.1],
      [size * 0.42, size * 0.55, size * 0.09],
      [size * 0.58, size * 0.55, size * 0.09],
    ];
    if (pot) return [200, 100, 70, 255];
    for (const [cx, cy, r] of leaves) {
      if (Math.hypot(x - cx, y - cy) < r) return [50, 150, 70, 255];
    }
    return [245, 250, 245, 255];
  });
}

function lampImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const shade =
      Math.abs(x - size * 0.5) < size * 0.22 - (y - size * 0.28) * 0.4 &&
      y > size * 0.2 &&
      y < size * 0.48;
    const stem = Math.abs(x - size * 0.5) < 3 && y > size * 0.48 && y < size * 0.75;
    const base =
      Math.abs(x - size * 0.5) < size * 0.16 && y > size * 0.75 && y < size * 0.85;
    if (shade) return [255, 230, 150, 255];
    if (stem || base) return [80, 70, 60, 255];
    return [40, 45, 55, 255];
  });
}

function bottleImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const neck = Math.abs(x - size * 0.5) < size * 0.08 && y > size * 0.15 && y < size * 0.4;
    const body =
      Math.abs(x - size * 0.5) < size * 0.16 && y >= size * 0.4 && y < size * 0.85;
    const cork = Math.abs(x - size * 0.5) < size * 0.07 && y > size * 0.1 && y < size * 0.18;
    if (cork) return [160, 110, 60, 255];
    if (neck || body) {
      if (Math.abs(x - size * 0.42) < 2 && y > size * 0.45 && y < size * 0.7) return [180, 230, 200, 255];
      return [50, 140, 100, 255];
    }
    return [250, 252, 250, 255];
  });
}

// —— 人像感（抽象几何） ——
function faceRoundImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const face = Math.hypot(x - size * 0.5, y - size * 0.52) < size * 0.32;
    if (face) {
      const eyeL = Math.hypot(x - size * 0.38, y - size * 0.45);
      const eyeR = Math.hypot(x - size * 0.62, y - size * 0.45);
      if (eyeL < size * 0.05 || eyeR < size * 0.05) return [40, 40, 50, 255];
      if (y > size * 0.6 && y < size * 0.68 && Math.abs(x - size * 0.5) < size * 0.12)
        return [200, 80, 90, 255];
      return [240, 200, 170, 255];
    }
    return [230, 235, 245, 255];
  });
}

function faceSideImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const profile =
      x > size * 0.35 &&
      x < size * 0.7 &&
      y > size * 0.2 &&
      y < size * 0.8 &&
      x < size * 0.55 + Math.sin((y / size) * Math.PI) * size * 0.12;
    const nose = x > size * 0.62 && x < size * 0.78 && Math.abs(y - size * 0.48) < size * 0.06;
    const eye = Math.hypot(x - size * 0.52, y - size * 0.4) < size * 0.04;
    if (eye) return [30, 30, 40, 255];
    if (profile || nose) return [230, 190, 160, 255];
    return [245, 240, 235, 255];
  });
}

function bustSimpleImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const head = Math.hypot(x - size * 0.5, y - size * 0.32) < size * 0.16;
    const shoulder =
      y > size * 0.5 &&
      y < size * 0.85 &&
      Math.abs(x - size * 0.5) < size * 0.32 - (y - size * 0.5) * 0.05;
    const neck = Math.abs(x - size * 0.5) < size * 0.08 && y > size * 0.42 && y < size * 0.55;
    if (head) return [235, 195, 165, 255];
    if (neck) return [235, 195, 165, 255];
    if (shoulder) return [70, 100, 160, 255];
    return [245, 245, 250, 255];
  });
}

function hatFigureImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const brim =
      Math.abs(y - size * 0.28) < size * 0.04 && Math.abs(x - size * 0.5) < size * 0.28;
    const crown =
      Math.abs(x - size * 0.5) < size * 0.14 && y > size * 0.12 && y < size * 0.28;
    const face = Math.hypot(x - size * 0.5, y - size * 0.45) < size * 0.14;
    const body =
      Math.abs(x - size * 0.5) < size * 0.18 && y > size * 0.55 && y < size * 0.85;
    if (brim || crown) return [50, 50, 60, 255];
    if (face) {
      if (Math.hypot(x - size * 0.45, y - size * 0.43) < size * 0.025) return [30, 30, 30, 255];
      if (Math.hypot(x - size * 0.55, y - size * 0.43) < size * 0.025) return [30, 30, 30, 255];
      return [240, 200, 170, 255];
    }
    if (body) return [180, 60, 70, 255];
    return [250, 248, 245, 255];
  });
}

function duoFacesImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const left = Math.hypot(x - size * 0.35, y - size * 0.5) < size * 0.2;
    const right = Math.hypot(x - size * 0.65, y - size * 0.5) < size * 0.2;
    if (left) {
      if (Math.hypot(x - size * 0.3, y - size * 0.45) < size * 0.035) return [30, 30, 40, 255];
      return [240, 180, 150, 255];
    }
    if (right) {
      if (Math.hypot(x - size * 0.7, y - size * 0.45) < size * 0.035) return [30, 30, 40, 255];
      return [180, 200, 240, 255];
    }
    return [245, 245, 250, 255];
  });
}

function maskGeoImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const mask =
      Math.abs(x - size * 0.5) < size * 0.28 &&
      y > size * 0.22 &&
      y < size * 0.78;
    if (mask) {
      const eyeL = Math.abs(x - size * 0.38) < size * 0.08 && Math.abs(y - size * 0.42) < size * 0.05;
      const eyeR = Math.abs(x - size * 0.62) < size * 0.08 && Math.abs(y - size * 0.42) < size * 0.05;
      if (eyeL || eyeR) return [20, 20, 30, 255];
      if (y > size * 0.55) return [200, 60, 80, 255];
      return [240, 220, 80, 255];
    }
    return [50, 55, 70, 255];
  });
}

// —— 节日 ——
function lanternImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const body =
      (x - size * 0.5) ** 2 / (size * 0.2) ** 2 + (y - size * 0.5) ** 2 / (size * 0.28) ** 2 < 1;
    const top = Math.abs(x - size * 0.5) < size * 0.12 && y > size * 0.15 && y < size * 0.28;
    const tassel = Math.abs(x - size * 0.5) < 2 && y > size * 0.75 && y < size * 0.9;
    if (tassel) return [220, 180, 60, 255];
    if (top) return [180, 40, 40, 255];
    if (body) {
      if (Math.abs(x - size * 0.5) < 2) return [255, 220, 100, 255];
      return [220, 50, 45, 255];
    }
    return [40, 30, 35, 255];
  });
}

function snowflakeImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const ang = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const spoke = Math.abs(((ang + Math.PI) % (Math.PI / 3)) - Math.PI / 6) < 0.12;
    const arm = dist < size * 0.38 && spoke;
    const center = dist < size * 0.08;
    if (arm || center) return [220, 240, 255, 255];
    return [60, 90, 140, 255];
  });
}

function giftImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const box =
      x > size * 0.22 &&
      x < size * 0.78 &&
      y > size * 0.4 &&
      y < size * 0.82;
    const lid =
      x > size * 0.18 &&
      x < size * 0.82 &&
      y > size * 0.28 &&
      y < size * 0.42;
    const ribbonV = Math.abs(x - size * 0.5) < size * 0.05 && y > size * 0.28 && y < size * 0.82;
    const ribbonH = Math.abs(y - size * 0.55) < size * 0.04 && x > size * 0.22 && x < size * 0.78;
    const bow = Math.hypot(x - size * 0.5, y - size * 0.22) < size * 0.08;
    if (bow || ribbonV || ribbonH) return [255, 220, 80, 255];
    if (lid || box) return [200, 50, 60, 255];
    return [255, 250, 248, 255];
  });
}

function fireworkImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size * 0.5;
    const cy = size * 0.42;
    const dist = Math.hypot(x - cx, y - cy);
    const ang = Math.atan2(y - cy, x - cx);
    const ray = Math.abs(((ang + Math.PI) % (Math.PI / 4)) - Math.PI / 8) < 0.15;
    if (dist < size * 0.08) return [255, 240, 180, 255];
    if (ray && dist < size * 0.38) {
      const colors: Rgba[] = [
        [255, 80, 100, 255],
        [255, 200, 60, 255],
        [100, 200, 255, 255],
        [180, 120, 255, 255],
      ];
      return colors[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 4) % 4];
    }
    return [20, 25, 50, 255];
  });
}

function envelopeImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const body =
      x > size * 0.15 &&
      x < size * 0.85 &&
      y > size * 0.3 &&
      y < size * 0.75;
    const flap =
      y > size * 0.3 &&
      y < size * 0.55 &&
      Math.abs(x - size * 0.5) < (y - size * 0.3) * 1.6;
    if (flap && body) return [200, 80, 70, 255];
    if (body) return [245, 240, 230, 255];
    return [230, 240, 250, 255];
  });
}

function candleImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const flame = Math.hypot(x - size * 0.5, y - size * 0.28) < size * 0.08;
    const wick = Math.abs(x - size * 0.5) < 1.5 && y > size * 0.32 && y < size * 0.4;
    const body =
      Math.abs(x - size * 0.5) < size * 0.1 && y > size * 0.4 && y < size * 0.82;
    if (flame) return [255, 180, 60, 255];
    if (wick) return [40, 40, 40, 255];
    if (body) return [255, 250, 230, 255];
    return [40, 35, 50, 255];
  });
}

// —— 几何 ——
function mosaicImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cell = Math.floor(size / 6);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const palette: Rgba[] = [
      [240, 100, 90, 255],
      [90, 180, 220, 255],
      [255, 200, 80, 255],
      [100, 190, 120, 255],
      [180, 120, 220, 255],
      [255, 150, 100, 255],
    ];
    return palette[(cx + cy * 3) % palette.length];
  });
}

function popBlocksImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const blocks: { x: number; y: number; w: number; h: number; c: Rgba }[] = [
      { x: 0.1, y: 0.15, w: 0.35, h: 0.3, c: [230, 60, 80, 255] },
      { x: 0.5, y: 0.12, w: 0.35, h: 0.25, c: [50, 120, 220, 255] },
      { x: 0.15, y: 0.5, w: 0.28, h: 0.35, c: [255, 190, 40, 255] },
      { x: 0.5, y: 0.45, w: 0.38, h: 0.4, c: [40, 180, 120, 255] },
    ];
    for (const b of blocks) {
      if (
        x > size * b.x &&
        x < size * (b.x + b.w) &&
        y > size * b.y &&
        y < size * (b.y + b.h)
      ) {
        return b.c;
      }
    }
    return [250, 250, 248, 255];
  });
}

function spiralImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const expected = ((ang + Math.PI) / (Math.PI * 2)) * size * 0.4;
    const band = Math.abs(dist - expected - Math.floor(dist / (size * 0.12)) * size * 0.08);
    if (band < size * 0.04) return [60, 80, 200, 255];
    return [245, 248, 255, 255];
  });
}

export const catalog: SampleCatalogItem[] = [
  // 入门 (8 = 3 existing + 5 new)
  { id: 'heart-29', title: '像素爱心', tag: '入门', featured: true, image: () => heartImage(58), opts: opts29(25, 8) },
  { id: 'smiley-29', title: '经典笑脸', tag: '入门', featured: true, image: () => smileyImage(58), opts: opts29(30, 10) },
  { id: 'star-29', title: '五角星', tag: '入门', featured: true, image: () => starImage(58), opts: opts29(20, 8) },
  { id: 'moon-29', title: '弯月', tag: '入门', featured: false, image: () => moonImage(58), opts: opts29(25, 10) },
  { id: 'cloud-29', title: '云朵', tag: '入门', featured: false, image: () => cloudImage(58), opts: opts29(28, 8) },
  { id: 'arrow-29', title: '箭头', tag: '入门', featured: false, image: () => arrowImage(58), opts: opts29(22, 8) },
  { id: 'check-29', title: '对勾', tag: '入门', featured: false, image: () => checkImage(58), opts: opts29(22, 8) },
  { id: 'diamond-29', title: '钻石', tag: '入门', featured: false, image: () => diamondImage(58), opts: opts29(25, 10) },

  // 可爱 (9 = 3 existing + 6 new; mushroom no longer featured to keep featured ~10)
  { id: 'mushroom-29', title: '像素小蘑菇', tag: '可爱', featured: false, image: () => mushroomImage(58), opts: opts29(28, 12) },
  { id: 'cherry-29', title: '樱桃', tag: '可爱', featured: false, image: () => cherryImage(58), opts: opts29(25, 10) },
  { id: 'clover-29', title: '四叶草', tag: '可爱', featured: false, image: () => cloverImage(58), opts: opts29(22, 8) },
  { id: 'cat-58', title: '像素猫脸', tag: '可爱', featured: true, image: () => catImage(116), opts: { cols: 58, rows: 58, simplify: 35, maxColors: 16 } },
  { id: 'fish-29', title: '小鱼', tag: '可爱', featured: false, image: () => fishImage(58), opts: opts29(28, 10) },
  { id: 'bird-29', title: '小鸟', tag: '可爱', featured: false, image: () => birdImage(58), opts: opts29(28, 12) },
  { id: 'bunny-29', title: '小兔子', tag: '可爱', featured: true, image: () => bunnyImage(58), opts: opts29(30, 12) },
  { id: 'cupcake-29', title: '纸杯蛋糕', tag: '可爱', featured: false, image: () => cupcakeImage(58), opts: opts29(30, 12) },
  { id: 'apple-29', title: '苹果', tag: '可爱', featured: false, image: () => appleImage(58), opts: opts29(28, 10) },
  { id: 'paw-29', title: '爪印', tag: '可爱', featured: false, image: () => pawImage(58), opts: opts29(25, 8) },

  // 风景 (8)
  { id: 'sunrise-29', title: '日出', tag: '风景', featured: true, image: () => sunriseImage(58), opts: opts29(30, 14) },
  { id: 'hills-29', title: '山丘', tag: '风景', featured: false, image: () => hillsImage(58), opts: opts29(28, 12) },
  { id: 'waves-29', title: '海浪', tag: '风景', featured: false, image: () => wavesImage(58), opts: opts29(28, 10) },
  { id: 'night-sky-29', title: '夜空', tag: '风景', featured: true, image: () => nightSkyImage(58), opts: opts29(25, 12) },
  { id: 'tree-line-29', title: '树林', tag: '风景', featured: false, image: () => treeLineImage(58), opts: opts29(30, 12) },
  { id: 'island-29', title: '小岛', tag: '风景', featured: false, image: () => islandImage(58), opts: opts29(30, 14) },
  { id: 'rain-29', title: '雨天', tag: '风景', featured: false, image: () => rainImage(58), opts: opts29(28, 10) },
  { id: 'aurora-52', title: '极光', tag: '风景', featured: false, image: () => auroraImage(116, 58), opts: { cols: 58, rows: 29, simplify: 15, maxColors: 20, dither: true } },

  // 静物 (6)
  { id: 'vase-29', title: '花瓶', tag: '静物', featured: false, image: () => vaseImage(58), opts: opts29(28, 12) },
  { id: 'mug-29', title: '马克杯', tag: '静物', featured: false, image: () => mugImage(58), opts: opts29(28, 10) },
  { id: 'book-29', title: '书本', tag: '静物', featured: false, image: () => bookImage(58), opts: opts29(28, 12) },
  { id: 'plant-29', title: '盆栽', tag: '静物', featured: true, image: () => plantImage(58), opts: opts29(30, 12) },
  { id: 'lamp-29', title: '台灯', tag: '静物', featured: false, image: () => lampImage(58), opts: opts29(28, 10) },
  { id: 'bottle-29', title: '瓶子', tag: '静物', featured: false, image: () => bottleImage(58), opts: opts29(28, 10) },

  // 人像感 (6)
  { id: 'face-round-29', title: '圆脸', tag: '人像感', featured: true, image: () => faceRoundImage(58), opts: opts29(30, 12) },
  { id: 'face-side-29', title: '侧脸', tag: '人像感', featured: false, image: () => faceSideImage(58), opts: opts29(30, 10) },
  { id: 'bust-simple-29', title: '半身像', tag: '人像感', featured: false, image: () => bustSimpleImage(58), opts: opts29(30, 12) },
  { id: 'hat-figure-29', title: '戴帽人', tag: '人像感', featured: false, image: () => hatFigureImage(58), opts: opts29(32, 14) },
  { id: 'duo-faces-29', title: '双人像', tag: '人像感', featured: false, image: () => duoFacesImage(58), opts: opts29(30, 12) },
  { id: 'mask-geo-29', title: '几何面具', tag: '人像感', featured: false, image: () => maskGeoImage(58), opts: opts29(28, 12) },

  // 节日 (6)
  { id: 'lantern-29', title: '灯笼', tag: '节日', featured: true, image: () => lanternImage(58), opts: opts29(28, 12) },
  { id: 'snowflake-29', title: '雪花', tag: '节日', featured: false, image: () => snowflakeImage(58), opts: opts29(25, 8) },
  { id: 'gift-29', title: '礼物', tag: '节日', featured: false, image: () => giftImage(58), opts: opts29(28, 10) },
  { id: 'firework-29', title: '烟花', tag: '节日', featured: false, image: () => fireworkImage(58), opts: opts29(30, 14) },
  { id: 'envelope-29', title: '信封', tag: '节日', featured: false, image: () => envelopeImage(58), opts: opts29(28, 10) },
  { id: 'candle-29', title: '蜡烛', tag: '节日', featured: false, image: () => candleImage(58), opts: opts29(28, 10) },

  // 几何 (4 = 1 existing + 3 new)
  { id: 'rainbow-58', title: '彩虹条', tag: '几何', featured: false, image: () => rainbowImage(116, 58), opts: { cols: 58, rows: 29, simplify: 10, maxColors: 24, dither: true } },
  { id: 'mosaic-29', title: '马赛克', tag: '几何', featured: false, image: () => mosaicImage(58), opts: opts29(20, 16) },
  { id: 'pop-blocks-29', title: '色块', tag: '几何', featured: false, image: () => popBlocksImage(58), opts: opts29(22, 12) },
  { id: 'spiral-29', title: '螺旋', tag: '几何', featured: false, image: () => spiralImage(58), opts: opts29(25, 10) },
];
