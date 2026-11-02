// SPIKE — throwaway. Zero-dependency vector PDF from AlphaTab's SVG partials.
//
// AlphaTab's SVG output is a tiny machine-generated subset: <rect>, <path> with
// only M/L/z, <text>, and <g transform="translate(x y)">. That maps 1:1 onto PDF
// operators, so the whole converter is this file — no jsPDF, no svg2pdf, no Rust.
//
// Usage: node svg-to-pdf.mjs <svgDir> <out.pdf>
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';

const ALPHATAB_FONT = '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/@coderline/alphatab/dist/font/Bravura.otf';
const SYS = '/System/Library/Fonts/Supplemental';

// ─── sfnt parsing: just the metrics tables we need ──────────────────────────

function parseFont(buf) {
  const u8 = (o) => buf.readUInt8(o);
  const u16 = (o) => buf.readUInt16BE(o);
  const i16 = (o) => buf.readInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);

  const tables = {};
  const numTables = u16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables[buf.toString('ascii', rec, rec + 4).trim()] = {off: u32(rec + 8), len: u32(rec + 12)};
  }

  const head = tables.head.off;
  const upem = u16(head + 18);
  const bbox = [i16(head + 36), i16(head + 38), i16(head + 40), i16(head + 42)];

  const hhea = tables.hhea.off;
  const ascent = i16(hhea + 4);
  const descent = i16(hhea + 6);
  const numHMetrics = u16(hhea + 34);

  const numGlyphs = u16(tables.maxp.off + 4);
  const hmtx = tables.hmtx.off;
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numHMetrics) last = u16(hmtx + g * 4);
    advances[g] = last;
  }

  let xHeight = 0, capHeight = 0;
  if (tables['OS/2']) {
    const os2 = tables['OS/2'].off;
    if (u16(os2) >= 2) { xHeight = i16(os2 + 86); capHeight = i16(os2 + 88); }
  }
  if (!xHeight) xHeight = Math.round(ascent * 0.52);
  if (!capHeight) capHeight = Math.round(ascent * 0.7);

  // cmap: prefer (3,10) format 12, else (3,1) format 4
  const cmapOff = tables.cmap.off;
  const nSub = u16(cmapOff + 2);
  let best = null;
  for (let i = 0; i < nSub; i++) {
    const rec = cmapOff + 4 + i * 8;
    const pid = u16(rec), eid = u16(rec + 2), off = cmapOff + u32(rec + 4);
    const score = pid === 3 && eid === 10 ? 3 : pid === 3 && eid === 1 ? 2 : pid === 0 ? 1 : 0;
    if (score && (!best || score > best.score)) best = {off, score};
  }
  const cmap = new Map();
  const sub = best.off;
  const fmt = u16(sub);
  if (fmt === 4) {
    const segs = u16(sub + 6) / 2;
    const endO = sub + 14, startO = endO + segs * 2 + 2, deltaO = startO + segs * 2, rangeO = deltaO + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = u16(endO + s * 2), start = u16(startO + s * 2);
      const delta = i16(deltaO + s * 2), rangeOff = u16(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let g;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + rangeOff + (c - start) * 2;
          g = u16(gi);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) cmap.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const nGroups = u32(sub + 12);
    for (let i = 0; i < nGroups; i++) {
      const g = sub + 16 + i * 12;
      const s = u32(g), e = u32(g + 4), gid = u32(g + 8);
      for (let c = s; c <= e; c++) cmap.set(c, gid + (c - s));
    }
  } else throw new Error(`unsupported cmap format ${fmt}`);

  return {buf, upem, bbox, ascent, descent, xHeight, capHeight, numGlyphs, advances, cmap,
          gid: (cp) => cmap.get(cp) ?? 0,
          adv: (cp) => advances[cmap.get(cp) ?? 0] / upem};
}

const bravura = parseFont(readFileSync(ALPHATAB_FONT));
const metrics = {
  arial: parseFont(readFileSync(`${SYS}/Arial.ttf`)),
  georgia: parseFont(readFileSync(`${SYS}/Georgia.ttf`)),
};

// ─── PDF object plumbing ────────────────────────────────────────────────────

const objs = [null]; // 1-indexed
const ref = (o) => { objs.push(o); return objs.length - 1; };
const stream = (dict, data) => {
  const body = deflateSync(Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1'));
  return {dict: {...dict, Filter: '/FlateDecode', Length: body.length}, body};
};
const dictStr = (d) => '<< ' + Object.entries(d).map(([k, v]) => `/${k} ${v}`).join(' ') + ' >>';

// ─── fonts ──────────────────────────────────────────────────────────────────

// Arial/Georgia are measured with their real metrics but drawn with the PDF
// base-14 equivalents: no embedding, and for digits (every fret number) the
// advance widths are identical anyway.
const BASE14 = {
  'arial':          'Helvetica',
  'arial-bold':     'Helvetica-Bold',
  'arial-italic':   'Helvetica-Oblique',
  'georgia':        'Times-Roman',
  'georgia-bold':   'Times-Bold',
  'georgia-italic': 'Times-Italic',
};
const fontIds = {};
for (const [key, base] of Object.entries(BASE14)) {
  fontIds[key] = ref({dict: {Type: '/Font', Subtype: '/Type1', BaseFont: `/${base}`, Encoding: '/WinAnsiEncoding'}});
}

// Bravura goes in as a CIDFontType0 with Identity-H: glyph ids straight from
// the font's own cmap, so the private-use music codepoints need no remapping.
const usedGlyphs = new Set();
const fontFile = ref(stream({Subtype: '/OpenType'}, bravura.buf));
const descriptor = ref({dict: {
  Type: '/FontDescriptor', FontName: '/Bravura', Flags: 4,
  FontBBox: `[${bravura.bbox.map(v => Math.round(v * 1000 / bravura.upem)).join(' ')}]`,
  ItalicAngle: 0, Ascent: Math.round(bravura.ascent * 1000 / bravura.upem),
  Descent: Math.round(bravura.descent * 1000 / bravura.upem),
  CapHeight: Math.round(bravura.capHeight * 1000 / bravura.upem), StemV: 80,
  FontFile3: `${fontFile} 0 R`,
}});
const cidFont = ref({dict: {
  Type: '/Font', Subtype: '/CIDFontType0', BaseFont: '/Bravura',
  CIDSystemInfo: '<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>',
  FontDescriptor: `${descriptor} 0 R`, DW: 0, W: '%%W%%',
}});
const musicFont = ref({dict: {
  Type: '/Font', Subtype: '/Type0', BaseFont: '/Bravura',
  Encoding: '/Identity-H', DescendantFonts: `[${cidFont} 0 R]`,
}});

// ─── SVG → PDF content stream ───────────────────────────────────────────────

const AT_FONT_PX = 34; // alphaTab's own stylesheet: .at { font-size: 34px }

const colorOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' ');
};
const attrs = (s) => {
  const out = {};
  for (const m of s.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4];
  return out;
};
const esc = (s) => s.replace(/([\\()])/g, '\\$1');

// style='stroke: none; font:italic 11px Georgia, serif; dominant-baseline: middle'
function parseStyleFont(style) {
  const m = /font:\s*(italic\s+|bold\s+)?([\d.]+)px\s+([A-Za-z]+)/.exec(style || '');
  if (!m) return null;
  const family = m[3].toLowerCase();
  const variant = (m[1] || '').trim();
  const key = variant ? `${family}-${variant}` : family;
  return {key: key in BASE14 ? key : family, family, size: Number(m[2])};
}

function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

const warnings = new Map();
const warn = (k) => warnings.set(k, (warnings.get(k) || 0) + 1);

// Emits one partial's drawing ops into `out`, offset by (ox, oy) in SVG px.
// Frames carry a full 2D matrix [a b c d e f] because AlphaTab rotates the
// vertical track name; everything else is a plain translate.
const mul = (A, B) => [ // apply B, then A
  B[0] * A[0] + B[1] * A[2], B[0] * A[1] + B[1] * A[3],
  B[2] * A[0] + B[3] * A[2], B[2] * A[1] + B[3] * A[3],
  B[4] * A[0] + B[5] * A[2] + A[4], B[4] * A[1] + B[5] * A[3] + A[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const rotated = (m) => Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9;

function emitPartial(svg, out, ox, oy) {
  const stack = [{m: [1, 0, 0, 1, ox, oy], music: false}];
  let top = stack[0];
  const re = /<(\/?)(svg|g|rect|path|text)\b([^>]*?)(\/?)>|([^<]+)/g;
  let pending = null; // open <text>
  let m;
  while ((m = re.exec(svg))) {
    const [, close, tag, rawAttr, selfClose, textRun] = m;
    if (textRun !== undefined) {
      if (pending) pending.chars += textRun;
      continue;
    }
    if (close) {
      if (tag === 'text' && pending) { drawText(pending, out, top); pending = null; }
      else if (tag === 'g') { stack.pop(); top = stack[stack.length - 1]; }
      continue;
    }
    const a = attrs(rawAttr || '');
    if (tag === 'svg') continue;
    if (tag === 'g') {
      let mat = top.m;
      const t = a.transform || '';
      const tr = /translate\(\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)\s*\)/.exec(t);
      if (tr) mat = mul(mat, [1, 0, 0, 1, Number(tr[1]), Number(tr[2])]);
      const rot = /rotate\(\s*(-?[\d.]+)/.exec(t);
      if (rot) {
        const r = Number(rot[1]) * Math.PI / 180;
        mat = mul(mat, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
      }
      const frame = {m: mat, music: top.music || a.class === 'at'};
      if (!selfClose) { stack.push(frame); top = frame; }
      continue;
    }
    if (tag === 'rect') {
      if (rotated(top.m)) warn('rotated rect approximated');
      const [x, y] = apply(top.m, Number(a.x), Number(a.y));
      out.push(`${colorOf(a.fill || '#000000')} rg ${f(x)} ${f(y)} ${f(Number(a.width))} ${f(Number(a.height))} re f`);
      continue;
    }
    if (tag === 'path') {
      const style = a.style || '';
      const strokeOnly = /fill:\s*none/.test(style);
      const ops = [];
      let cx = 0, cy = 0; // current point in SVG space, for curve lifting
      const tx = (px, py) => { const [X, Y] = apply(top.m, px, py); return `${f(X)} ${f(Y)}`; };
      const to = (px, py) => { const s = tx(px, py); cx = px; cy = py; return s; };
      // AlphaTab emits M, L, Q, C, z — plus one fixed A-pair form for circles.
      const tok = /([MLQCAz])([^MLQCAz]*)/g;
      let seg;
      while ((seg = tok.exec(a.d || ''))) {
        const cmd = seg[1];
        const n = (seg[2].match(/-?[\d.]+/g) || []).map(Number);
        if (cmd === 'z') { ops.push('h'); continue; }
        if (cmd === 'M') { ops.push(`${to(n[0], n[1])} m`); continue; }
        if (cmd === 'L') { ops.push(`${to(n[0], n[1])} l`); continue; }
        if (cmd === 'C') { ops.push(`${tx(n[0], n[1])} ${tx(n[2], n[3])} ${to(n[4], n[5])} c`); continue; }
        if (cmd === 'Q') {
          // exact quadratic → cubic: control points at 2/3 toward the quad control
          const [qx, qy, ex, ey] = n;
          ops.push(`${tx(cx + (qx - cx) * 2 / 3, cy + (qy - cy) * 2 / 3)} ` +
                   `${tx(ex + (qx - ex) * 2 / 3, ey + (qy - ey) * 2 / 3)} ${to(ex, ey)} c`);
          continue;
        }
        if (cmd === 'A') {
          // only ever `A1,1 0 0,0 x,y` half-circles from fillCircle()
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
      pending = {a, style: a.style || '', chars: '', anchor: a['text-anchor'] || 'start', fill: a.fill};
      if (selfClose) { drawText(pending, out, top); pending = null; }
    }
  }
}

const f = (n) => (Math.round(n * 100) / 100).toString();

function drawText(t, out, frame) {
  const chars = decodeEntities(t.chars);
  if (!chars.trim() && !frame.music) return;

  const isMusic = frame.music;
  let size, fontRes, width, fm;
  if (isMusic) {
    const pct = /font-size:\s*([\d.]+)%/.exec(t.style);
    size = AT_FONT_PX * (pct ? Number(pct[1]) / 100 : 1);
    fontRes = '/FM';
    fm = bravura;
  } else {
    const spec = parseStyleFont(t.style);
    if (!spec) { warn('text with no font'); return; }
    size = spec.size;
    fontRes = `/F${Object.keys(BASE14).indexOf(spec.key)}`;
    fm = metrics[spec.family] || metrics.arial;
  }
  width = [...chars].reduce((w, c) => w + fm.adv(c.codePointAt(0)), 0) * size;

  let x = Number(t.a.x) || 0;
  let y = Number(t.a.y) || 0;
  if (t.anchor === 'middle') x -= width / 2;
  else if (t.anchor === 'end') x -= width;

  // SVG dominant-baseline → PDF, which only has the alphabetic baseline
  if (/dominant-baseline:\s*middle/.test(t.style)) y += (fm.xHeight / fm.upem) * size / 2;
  else if (/dominant-baseline:\s*hanging/.test(t.style)) y += (fm.ascent / fm.upem) * size * 0.8;
  else if (/dominant-baseline:\s*ideographic/.test(t.style)) y += (fm.descent / fm.upem) * size;

  const body = isMusic
    ? '<' + [...chars].map(c => {
        const g = bravura.gid(c.codePointAt(0));
        if (!g) warn(`missing glyph U+${c.codePointAt(0).toString(16)}`);
        usedGlyphs.add(g);
        return g.toString(16).padStart(4, '0');
      }).join('') + '>'
    : `(${esc(chars)})`;

  // flip y locally so text sits upright under the page's y-down CTM
  const tm = mul(frame.m, [1, 0, 0, -1, x, y]);
  out.push(`${colorOf(t.fill || '#000000')} rg BT ${fontRes} ${f(size)} Tf ` +
           `${tm.map(v => f(v)).join(' ')} Tm ${body} Tj ET`);
}

// ─── page assembly ──────────────────────────────────────────────────────────

const [, , svgDir, outPath, pageArg = 'a4'] = process.argv;
const PAGE = pageArg === 'letter' ? [612, 792] : [595.276, 841.89];
const MARGIN = 28;

const files = readdirSync(svgDir).filter(n => n.endsWith('.svg'))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const partials = files.map(n => {
  const svg = readFileSync(`${svgDir}/${n}`, 'utf8');
  return {svg, w: Number(/width="([\d.]+)px"/.exec(svg)[1]), h: Number(/height="([\d.]+)px"/.exec(svg)[1])};
});

const srcWidth = Math.max(...partials.map(p => p.w));
const scale = (PAGE[0] - MARGIN * 2) / srcWidth;
const pageHeightPx = (PAGE[1] - MARGIN * 2) / scale;

const pages = [];
let cur = [], curY = 0;
for (const p of partials) {
  if (curY + p.h > pageHeightPx && cur.length) { pages.push(cur); cur = []; curY = 0; }
  cur.push({...p, y: curY});
  curY += p.h;
}
if (cur.length) pages.push(cur);

const pagesId = objs.length + pages.length * 2 + 1; // reserved below
const pageIds = [];
for (const page of pages) {
  const out = [];
  for (const p of page) emitPartial(p.svg, out, 0, p.y);
  // flip: SVG is y-down from the top-left of the text block
  const content = `q ${f(scale)} 0 0 ${f(-scale)} ${f(MARGIN)} ${f(PAGE[1] - MARGIN)} cm\n${out.join('\n')}\nQ`;
  const contentId = ref(stream({}, content));
  pageIds.push(ref({dict: {
    Type: '/Page', Parent: `%%PAGES%% 0 R`, MediaBox: `[0 0 ${f(PAGE[0])} ${f(PAGE[1])}]`,
    Resources: `<< /Font << ${Object.keys(BASE14).map((k, i) => `/F${i} ${fontIds[k]} 0 R`).join(' ')} /FM ${musicFont} 0 R >> >>`,
    Contents: `${contentId} 0 R`,
  }}));
}
const pagesObj = ref({dict: {Type: '/Pages', Kids: `[${pageIds.map(i => `${i} 0 R`).join(' ')}]`, Count: pageIds.length}});
const catalog = ref({dict: {Type: '/Catalog', Pages: `${pagesObj} 0 R`}});

// Widths for the glyphs we actually used (DW 0 means anything missed is visible)
const wArr = [...usedGlyphs].sort((a, b) => a - b)
  .map(g => `${g} [${Math.round(bravura.advances[g] * 1000 / bravura.upem)}]`).join(' ');
objs[cidFont].dict.W = `[${wArr}]`;

// ─── serialise ──────────────────────────────────────────────────────────────

const chunks = [Buffer.from('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
let pos = chunks[0].length;
const offsets = [0];
for (let i = 1; i < objs.length; i++) {
  const o = objs[i];
  const dict = dictStr(o.dict).replace('%%PAGES%%', String(pagesObj));
  const head = Buffer.from(`${i} 0 obj\n${dict}\n`, 'latin1');
  const parts = o.body ? [head, Buffer.from('stream\n', 'latin1'), o.body, Buffer.from('\nendstream\nendobj\n', 'latin1')]
                       : [head, Buffer.from('endobj\n', 'latin1')];
  offsets[i] = pos;
  for (const b of parts) { chunks.push(b); pos += b.length; }
}
const xrefPos = pos;
let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
xref += `trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
chunks.push(Buffer.from(xref, 'latin1'));

writeFileSync(outPath, Buffer.concat(chunks));
const kb = (Buffer.concat(chunks).length / 1024).toFixed(0);
console.log(`wrote ${outPath} — ${pages.length} pages, ${partials.length} partials, ${usedGlyphs.size} music glyphs, ${kb} KB`);
if (warnings.size) for (const [k, n] of warnings) console.log(`  warn: ${k} (x${n})`);
