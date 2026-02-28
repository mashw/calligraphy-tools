export const DEFAULT_EXPORT_DPI = 450 as const;

const MAX_PIXEL_COUNT = 60_000_000;
const PALETTE_SIZE = 64;

const mmToPx = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (typeAndData: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < typeAndData.length; i += 1) {
    c = crcTable[(c ^ typeAndData[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Uint8Array) => {
  const typeBytes = new TextEncoder().encode(type);
  const length = data.length;
  const chunk = new Uint8Array(12 + length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crc = crc32(concatBytes([typeBytes, data]));
  dv.setUint32(8 + length, crc, false);
  return chunk;
};

const readStreamToUint8 = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return concatBytes(parts);
};

const zlibDeflate = async (bytes: Uint8Array) => {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream is required for optimized PNG export.');
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  await writer.write(new Uint8Array(bytes));
  await writer.close();
  return readStreamToUint8(cs.readable);
};

function quantizeRgbaToIndexed(rgba: Uint8ClampedArray, width: number, height: number, paletteSize: number) {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cur = bins.get(key);
    if (cur) {
      cur.count += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }

  const palette = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, paletteSize)
    .map((entry) => [
      Math.round(entry.r / entry.count),
      Math.round(entry.g / entry.count),
      Math.round(entry.b / entry.count),
    ] as const);

  while (palette.length < paletteSize) palette.push(palette[palette.length - 1] ?? [255, 255, 255]);

  const indices = new Uint8Array(width * height);
  for (let px = 0, i = 0; i < rgba.length; i += 4, px += 1) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let p = 0; p < palette.length; p += 1) {
      const pr = palette[p][0];
      const pg = palette[p][1];
      const pb = palette[p][2];
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    indices[px] = best;
  }

  return { palette, indices };
}

async function encodeIndexedPng(opts: { width: number; height: number; rgba: Uint8ClampedArray }) {
  const { width, height, rgba } = opts;
  const { palette, indices } = quantizeRgbaToIndexed(rgba, width, height, PALETTE_SIZE);

  const scanline = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1);
    scanline[rowStart] = 0;
    scanline.set(indices.subarray(y * width, (y + 1) * width), rowStart + 1);
  }

  const plte = new Uint8Array(PALETTE_SIZE * 3);
  palette.forEach((rgb, idx) => {
    plte[idx * 3] = rgb[0];
    plte[idx * 3 + 1] = rgb[1];
    plte[idx * 3 + 2] = rgb[2];
  });

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 3;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = await zlibDeflate(scanline);
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

export async function rasterizeSvgToOptimizedPng(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  background?: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<{ pngBytes: Uint8Array; widthPx: number; heightPx: number }> {
  const { svgEl, pageWmm, pageHmm, background = '#fff', prepareClone } = opts;

  let widthPx = mmToPx(pageWmm, DEFAULT_EXPORT_DPI);
  let heightPx = mmToPx(pageHmm, DEFAULT_EXPORT_DPI);
  const pixelCount = widthPx * heightPx;
  if (pixelCount > MAX_PIXEL_COUNT) {
    const scale = Math.sqrt(MAX_PIXEL_COUNT / pixelCount);
    widthPx = Math.max(1, Math.round(widthPx * scale));
    heightPx = Math.max(1, Math.round(heightPx * scale));
  }

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', String(widthPx));
  clone.setAttribute('height', String(heightPx));

  clone.querySelectorAll<SVGElement>('[data-export-role="grid"], [stroke-dasharray]').forEach((el) => {
    el.setAttribute('stroke-linecap', 'butt');
    el.setAttribute('shape-rendering', 'crispEdges');
  });

  prepareClone?.(clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    img.src = svgUrl;
    await loaded;
    if (typeof img.decode === 'function') await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create 2D canvas context.');

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const rgba = ctx.getImageData(0, 0, widthPx, heightPx).data;
    const pngBytes = await encodeIndexedPng({ width: widthPx, height: heightPx, rgba });
    return { pngBytes, widthPx, heightPx };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
