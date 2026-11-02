/**
 * AlphaTab SVG → PDF, with no third-party PDF library.
 *
 * AlphaTab's SVG output is a machine-generated subset — `<rect>`, `<path>` using
 * only M/L/Q/C/z (plus one fixed `A1,1 0 0,0` form for circles), `<text>`, and
 * `<g>` with translate/rotate — and every one of those maps directly onto a PDF
 * operator. See `SvgCanvas` in alphaTab.core.mjs for the emitting side.
 *
 * Music glyphs are private-use codepoints that rely on alphaTab's own stylesheet
 * (`.at { font-family: alphaTab; font-size: 34px }`) for their font, so the font
 * is embedded here as a CIDFontType0 with Identity-H encoding and the glyph ids
 * are looked up in its cmap. Plain text (fret numbers, titles) is measured with
 * the real font via canvas and drawn with the PDF base-14 equivalents, which are
 * metrically identical for digits.
 */

// ── sfnt parsing: only the tables needed for glyph ids and metrics ──────────

export type ParsedFont = {
  data: Uint8Array;
  upem: number;
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  capHeight: number;
  advances: Uint16Array;
  gid: (codePoint: number) => number;
  advance: (codePoint: number) => number; // in em units
};

export function parseFont(buffer: ArrayBuffer): ParsedFont {
  const v = new DataView(buffer);
  const data = new Uint8Array(buffer);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)).trim();

  const tables: Record<string, {off: number; len: number}> = {};
  const numTables = v.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables[tag(rec)] = {off: v.getUint32(rec + 8), len: v.getUint32(rec + 12)};
  }

  const head = tables.head.off;
  const upem = v.getUint16(head + 18);
  const bbox: [number, number, number, number] = [
    v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42),
  ];

  const hhea = tables.hhea.off;
  const ascent = v.getInt16(hhea + 4);
  const descent = v.getInt16(hhea + 6);
  const numHMetrics = v.getUint16(hhea + 34);

  const numGlyphs = v.getUint16(tables.maxp.off + 4);
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numHMetrics) last = v.getUint16(tables.hmtx.off + g * 4);
    advances[g] = last;
  }

  let capHeight = 0;
  if (tables['OS/2'] && v.getUint16(tables['OS/2'].off) >= 2) {
    capHeight = v.getInt16(tables['OS/2'].off + 88);
  }
  if (!capHeight) capHeight = Math.round(ascent * 0.7);

  // cmap: prefer (3,10) format 12, then (3,1) format 4
  const cmapOff = tables.cmap.off;
  let best: {off: number; score: number} | null = null;
  for (let i = 0, n = v.getUint16(cmapOff + 2); i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const pid = v.getUint16(rec), eid = v.getUint16(rec + 2);
    const score = pid === 3 && eid === 10 ? 3 : pid === 3 && eid === 1 ? 2 : pid === 0 ? 1 : 0;
    if (score && (!best || score > best.score)) best = {off: cmapOff + v.getUint32(rec + 4), score};
  }
  if (!best) throw new Error('font has no usable cmap subtable');

  const cmap = new Map<number, number>();
  const sub = best.off;
  const format = v.getUint16(sub);
  if (format === 4) {
    const segs = v.getUint16(sub + 6) / 2;
    const endO = sub + 14, startO = endO + segs * 2 + 2, deltaO = startO + segs * 2, rangeO = deltaO + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = v.getUint16(endO + s * 2), start = v.getUint16(startO + s * 2);
      const delta = v.getInt16(deltaO + s * 2), rangeOff = v.getUint16(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let g: number;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          g = v.getUint16(rangeO + s * 2 + rangeOff + (c - start) * 2);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) cmap.set(c, g);
      }
    }
  } else if (format === 12) {
    for (let i = 0, n = v.getUint32(sub + 12); i < n; i++) {
      const g = sub + 16 + i * 12;
      const s = v.getUint32(g), e = v.getUint32(g + 4), gid = v.getUint32(g + 8);
      for (let c = s; c <= e; c++) cmap.set(c, gid + (c - s));
    }
  } else {
    throw new Error(`unsupported cmap format ${format}`);
  }

  return {
    data, upem, bbox, ascent, descent, capHeight, advances,
    gid: (cp) => cmap.get(cp) ?? 0,
    advance: (cp) => advances[cmap.get(cp) ?? 0] / upem,
  };
}

// ── text metrics from the browser, for the fonts AlphaTab actually laid out with ──

type TextMetricsProvider = {
  width: (cssFont: string, text: string) => number;
  xHeightRatio: (cssFont: string) => number;
  ascentRatio: (cssFont: string) => number;
};

function canvasMetrics(): TextMetricsProvider {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const ratios = new Map<string, {x: number; a: number}>();

  const measureRatios = (cssFont: string) => {
    let r = ratios.get(cssFont);
    if (!r) {
      ctx.font = cssFont;
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(cssFont)?.[1] ?? 16);
      const x = ctx.measureText('x');
      const m = ctx.measureText('Hg');
      r = {
        x: (x.actualBoundingBoxAscent || size * 0.52) / size,
        a: (m.fontBoundingBoxAscent || size * 0.9) / size,
      };
      ratios.set(cssFont, r);
    }
    return r;
  };

  return {
    width: (cssFont, text) => { ctx.font = cssFont; return ctx.measureText(text).width; },
    xHeightRatio: (f) => measureRatios(f).x,
    ascentRatio: (f) => measureRatios(f).a,
  };
}

// ── PDF primitives ──────────────────────────────────────────────────────────

const latin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate'); // zlib wrapper — matches /FlateDecode
  const stream = new Blob([bytes as BufferSource]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type PdfObject = {dict: Record<string, string | number>; body?: Uint8Array};

// ── SVG → content stream ────────────────────────────────────────────────────

const AT_FONT_PX = 34; // alphaTab's stylesheet: .at { font-size: 34px }

const BASE14: Record<string, string> = {
  'arial': 'Helvetica',
  'arial-bold': 'Helvetica-Bold',
  'arial-italic': 'Helvetica-Oblique',
  'georgia': 'Times-Roman',
  'georgia-bold': 'Times-Bold',
  'georgia-italic': 'Times-Italic',
};
const BASE14_KEYS = Object.keys(BASE14);

const f = (n: number) => (Math.round(n * 100) / 100).toString();

const colorOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(c => c.toFixed(3)).join(' ');
};

type Matrix = [number, number, number, number, number, number];
const mul = (A: Matrix, B: Matrix): Matrix => [ // apply B, then A
  B[0] * A[0] + B[1] * A[2], B[0] * A[1] + B[1] * A[3],
  B[2] * A[0] + B[3] * A[2], B[2] * A[1] + B[3] * A[3],
  B[4] * A[0] + B[5] * A[2] + A[4], B[4] * A[1] + B[5] * A[3] + A[5],
];
const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseStyleFont(style: string) {
  const m = /font:\s*(italic\s+|bold\s+)?([\d.]+)px\s+([A-Za-z]+)/.exec(style);
  if (!m) return null;
  const family = m[3].toLowerCase();
  const variant = (m[1] || '').trim();
  const key = variant ? `${family}-${variant}` : family;
  return {
    key: key in BASE14 ? key : family,
    size: Number(m[2]),
    css: `${variant ? variant + ' ' : ''}${m[2]}px ${m[3]}`,
  };
}

export type PdfExportOptions = {
  pageSize?: 'a4' | 'letter';
  /** Page margin in points. */
  margin?: number;
  title?: string;
  /** Overridable so tests and non-default deployments can point elsewhere. */
  musicFontUrl?: string;
};

export type PdfExportResult = {
  bytes: Uint8Array;
  pageCount: number;
  /** Non-fatal conversion notes, deduplicated with counts. */
  warnings: string[];
};

/**
 * Converts AlphaTab SVG partials (one per rendered system) into a paginated PDF.
 */
export async function svgPartialsToPdf(
  partials: string[],
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const {pageSize = 'a4', margin = 28, musicFontUrl = '/font/Bravura.otf'} = options;

  const response = await fetch(musicFontUrl);
  if (!response.ok) throw new Error(`could not load music font: ${response.status}`);
  const music = parseFont(await response.arrayBuffer());
  const metrics = canvasMetrics();

  const warned = new Map<string, number>();
  const warn = (key: string) => warned.set(key, (warned.get(key) ?? 0) + 1);

  const objects: (PdfObject | null)[] = [null];
  const ref = (o: PdfObject) => { objects.push(o); return objects.length - 1; };

  const fontIds: Record<string, number> = {};
  for (const [key, base] of Object.entries(BASE14)) {
    fontIds[key] = ref({dict: {Type: '/Font', Subtype: '/Type1', BaseFont: `/${base}`, Encoding: '/WinAnsiEncoding'}});
  }

  const usedGlyphs = new Set<number>();
  const fontFile = ref({dict: {Subtype: '/OpenType'}, body: music.data});
  const scaleToPdf = (u: number) => Math.round(u * 1000 / music.upem);
  const descriptor = ref({dict: {
    Type: '/FontDescriptor', FontName: '/Bravura', Flags: 4,
    FontBBox: `[${music.bbox.map(scaleToPdf).join(' ')}]`,
    ItalicAngle: 0, Ascent: scaleToPdf(music.ascent), Descent: scaleToPdf(music.descent),
    CapHeight: scaleToPdf(music.capHeight), StemV: 80, FontFile3: `${fontFile} 0 R`,
  }});
  const cidFont = ref({dict: {
    Type: '/Font', Subtype: '/CIDFontType0', BaseFont: '/Bravura',
    CIDSystemInfo: '<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>',
    FontDescriptor: `${descriptor} 0 R`, DW: 0, W: '[]',
  }});
  const musicFont = ref({dict: {
    Type: '/Font', Subtype: '/Type0', BaseFont: '/Bravura',
    Encoding: '/Identity-H', DescendantFonts: `[${cidFont} 0 R]`,
  }});

  // ── drawing ──

  const decodeEntities = (s: string) =>
    s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
     .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
     .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

  const attrsOf = (s: string) => {
    const out: Record<string, string> = {};
    for (const m of s.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4];
    return out;
  };

  type Frame = {m: Matrix; music: boolean};
  type PendingText = {attrs: Record<string, string>; style: string; chars: string; anchor: string};

  function drawText(t: PendingText, out: string[], frame: Frame) {
    const chars = decodeEntities(t.chars);
    if (!chars.trim() && !frame.music) return;

    let size: number, fontRes: string, width: number, xHeight: number, ascent: number;
    if (frame.music) {
      const pct = /font-size:\s*([\d.]+)%/.exec(t.style);
      size = AT_FONT_PX * (pct ? Number(pct[1]) / 100 : 1);
      fontRes = '/FM';
      width = [...chars].reduce((w, c) => w + music.advance(c.codePointAt(0)!), 0) * size;
      xHeight = (music.capHeight / music.upem) * size;
      ascent = (music.ascent / music.upem) * size;
    } else {
      const spec = parseStyleFont(t.style);
      if (!spec) { warn('text with no resolvable font was skipped'); return; }
      size = spec.size;
      fontRes = `/F${BASE14_KEYS.indexOf(spec.key)}`;
      width = metrics.width(spec.css, chars);
      xHeight = metrics.xHeightRatio(spec.css) * size;
      ascent = metrics.ascentRatio(spec.css) * size;
    }

    let x = Number(t.attrs.x) || 0;
    let y = Number(t.attrs.y) || 0;
    if (t.anchor === 'middle') x -= width / 2;
    else if (t.anchor === 'end') x -= width;

    // SVG dominant-baseline → PDF, which only has the alphabetic baseline
    if (/dominant-baseline:\s*middle/.test(t.style)) y += xHeight / 2;
    else if (/dominant-baseline:\s*hanging/.test(t.style)) y += ascent * 0.8;
    else if (/dominant-baseline:\s*ideographic/.test(t.style)) y += (music.descent / music.upem) * size;

    const body = frame.music
      ? '<' + [...chars].map(c => {
          const g = music.gid(c.codePointAt(0)!);
          if (!g) warn(`music font is missing a glyph (U+${c.codePointAt(0)!.toString(16)})`);
          usedGlyphs.add(g);
          return g.toString(16).padStart(4, '0');
        }).join('') + '>'
      : `(${chars.replace(/([\\()])/g, '\\$1')})`;

    // flip y locally so text sits upright under the page's y-down CTM
    const tm = mul(frame.m, [1, 0, 0, -1, x, y]);
    out.push(`${colorOf(t.attrs.fill || '#000000')} rg BT ${fontRes} ${f(size)} Tf ` +
             `${tm.map(f).join(' ')} Tm ${body} Tj ET`);
  }

  function emitPartial(svg: string, out: string[], offsetY: number) {
    const stack: Frame[] = [{m: [1, 0, 0, 1, 0, offsetY], music: false}];
    let top = stack[0];
    const re = /<(\/?)(svg|g|rect|path|text)\b([^>]*?)(\/?)>|([^<]+)/g;
    let pending: PendingText | null = null;
    let m: RegExpExecArray | null;

    while ((m = re.exec(svg))) {
      const [, close, tag, rawAttrs, selfClose, textRun] = m;
      if (textRun !== undefined) {
        if (pending) pending.chars += textRun;
        continue;
      }
      if (close) {
        if (tag === 'text' && pending) { drawText(pending, out, top); pending = null; }
        else if (tag === 'g') { stack.pop(); top = stack[stack.length - 1]; }
        continue;
      }
      const a = attrsOf(rawAttrs || '');
      if (tag === 'svg') continue;

      if (tag === 'g') {
        let mat = top.m;
        const transform = a.transform || '';
        const tr = /translate\(\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)\s*\)/.exec(transform);
        if (tr) mat = mul(mat, [1, 0, 0, 1, Number(tr[1]), Number(tr[2])]);
        const rot = /rotate\(\s*(-?[\d.]+)/.exec(transform);
        if (rot) {
          const r = Number(rot[1]) * Math.PI / 180;
          mat = mul(mat, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
        }
        const frame: Frame = {m: mat, music: top.music || a.class === 'at'};
        if (!selfClose) { stack.push(frame); top = frame; }
        continue;
      }

      if (tag === 'rect') {
        const [x, y] = apply(top.m, Number(a.x), Number(a.y));
        out.push(`${colorOf(a.fill || '#000000')} rg ${f(x)} ${f(y)} ` +
                 `${f(Number(a.width))} ${f(Number(a.height))} re f`);
        continue;
      }

      if (tag === 'path') {
        const strokeOnly = /fill:\s*none/.test(a.style || '');
        const ops: string[] = [];
        let cx = 0, cy = 0; // current point in SVG space, for curve lifting
        const tx = (px: number, py: number) => { const [X, Y] = apply(top.m, px, py); return `${f(X)} ${f(Y)}`; };
        const to = (px: number, py: number) => { const s = tx(px, py); cx = px; cy = py; return s; };

        const tok = /([MLQCAz])([^MLQCAz]*)/g;
        let seg: RegExpExecArray | null;
        while ((seg = tok.exec(a.d || ''))) {
          const cmd = seg[1];
          const n = (seg[2].match(/-?[\d.]+/g) || []).map(Number);
          if (cmd === 'z') { ops.push('h'); continue; }
          if (cmd === 'M') { ops.push(`${to(n[0], n[1])} m`); continue; }
          if (cmd === 'L') { ops.push(`${to(n[0], n[1])} l`); continue; }
          if (cmd === 'C') { ops.push(`${tx(n[0], n[1])} ${tx(n[2], n[3])} ${to(n[4], n[5])} c`); continue; }
          if (cmd === 'Q') {
            // exact quadratic → cubic: controls two thirds of the way to the quad control
            const [qx, qy, ex, ey] = n;
            ops.push(`${tx(cx + (qx - cx) * 2 / 3, cy + (qy - cy) * 2 / 3)} ` +
                     `${tx(ex + (qx - ex) * 2 / 3, ey + (qy - ey) * 2 / 3)} ${to(ex, ey)} c`);
            continue;
          }
          if (cmd === 'A') {
            // AlphaTab only emits the fixed `A1,1 0 0,0 x,y` half-circle pair from fillCircle()
            const ex = n[4], ey = n[5];
            const r = Math.abs(ex - cx) / 2, mx = (cx + ex) / 2, k = 0.5523 * r;
            const dir = ex > cx ? 1 : -1;
            ops.push(`${tx(cx, cy + dir * k)} ${tx(mx - dir * k, cy + dir * r)} ${tx(mx, cy + dir * r)} c`);
            ops.push(`${tx(mx + dir * k, cy + dir * r)} ${tx(ex, cy + dir * k)} ${to(ex, ey)} c`);
            continue;
          }
        }
        if (strokeOnly) out.push(`${colorOf(a.stroke || '#000000')} RG 1 w ${ops.join(' ')} S`);
        else out.push(`${colorOf(a.fill || '#000000')} rg ${ops.join(' ')} f`);
        continue;
      }

      if (tag === 'text') {
        pending = {attrs: a, style: a.style || '', chars: '', anchor: a['text-anchor'] || 'start'};
        if (selfClose) { drawText(pending, out, top); pending = null; }
      }
    }
  }

  // ── pagination ──

  const PAGE: [number, number] = pageSize === 'letter' ? [612, 792] : [595.276, 841.89];
  const sized = partials.map(svg => ({
    svg,
    width: Number(/width="([\d.]+)px"/.exec(svg)?.[1] ?? 0),
    height: Number(/height="([\d.]+)px"/.exec(svg)?.[1] ?? 0),
  }));
  if (!sized.length) throw new Error('nothing to export: the score produced no rendered systems');

  const srcWidth = Math.max(...sized.map(p => p.width));
  const scale = (PAGE[0] - margin * 2) / srcWidth;
  const pageHeightPx = (PAGE[1] - margin * 2) / scale;

  const pages: {svg: string; y: number}[][] = [];
  let current: {svg: string; y: number}[] = [];
  let y = 0;
  for (const p of sized) {
    if (y + p.height > pageHeightPx && current.length) { pages.push(current); current = []; y = 0; }
    current.push({svg: p.svg, y});
    y += p.height;
  }
  if (current.length) pages.push(current);

  // ── page objects ──

  const resources = `<< /Font << ${BASE14_KEYS.map((k, i) => `/F${i} ${fontIds[k]} 0 R`).join(' ')} ` +
                    `/FM ${musicFont} 0 R >> >>`;
  const pageIds: number[] = [];
  for (const page of pages) {
    const out: string[] = [];
    for (const p of page) emitPartial(p.svg, out, p.y);
    const content = `q ${f(scale)} 0 0 ${f(-scale)} ${f(margin)} ${f(PAGE[1] - margin)} cm\n` +
                    `${out.join('\n')}\nQ`;
    const contentId = ref({dict: {}, body: await deflate(latin1(content))});
    objects[contentId]!.dict.Filter = '/FlateDecode';
    pageIds.push(ref({dict: {
      Type: '/Page', Parent: '%%PAGES%% 0 R',
      MediaBox: `[0 0 ${f(PAGE[0])} ${f(PAGE[1])}]`,
      Resources: resources, Contents: `${contentId} 0 R`,
    }}));
  }
  const pagesObj = ref({dict: {
    Type: '/Pages', Kids: `[${pageIds.map(i => `${i} 0 R`).join(' ')}]`, Count: pageIds.length,
  }});
  const catalog = ref({dict: {Type: '/Catalog', Pages: `${pagesObj} 0 R`}});

  // DW 0 means a glyph we failed to account for shows up as an overlap, not silently
  objects[cidFont]!.dict.W = `[${[...usedGlyphs].sort((a, b) => a - b)
    .map(g => `${g} [${scaleToPdf(music.advances[g])}]`).join(' ')}]`;

  // Compress the embedded font last so its /Length matches the deflated body
  const fontBody = await deflate(music.data);
  objects[fontFile]!.body = fontBody;
  objects[fontFile]!.dict.Filter = '/FlateDecode';

  // ── serialise ──

  const chunks: Uint8Array[] = [latin1('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n')];
  let pos = chunks[0].length;
  const offsets: number[] = [0];

  for (let i = 1; i < objects.length; i++) {
    const o = objects[i]!;
    if (o.body) o.dict.Length = o.body.length;
    const dict = '<< ' + Object.entries(o.dict)
      .map(([k, val]) => `/${k} ${String(val).replace('%%PAGES%%', String(pagesObj))}`).join(' ') + ' >>';
    offsets[i] = pos;
    const parts = o.body
      ? [latin1(`${i} 0 obj\n${dict}\nstream\n`), o.body, latin1('\nendstream\nendobj\n')]
      : [latin1(`${i} 0 obj\n${dict}\nendobj\n`)];
    for (const part of parts) { chunks.push(part); pos += part.length; }
  }

  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(latin1(xref));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }

  return {
    bytes,
    pageCount: pages.length,
    warnings: [...warned].map(([k, n]) => (n > 1 ? `${k} (x${n})` : k)),
  };
}
