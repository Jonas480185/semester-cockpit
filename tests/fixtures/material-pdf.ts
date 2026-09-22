// Small deterministic two-page PDF: text/table/formula plus a raster image page.
// It is test data only; no real study documents or personal data are included.
import { deflateSync } from 'node:zlib';
export function materialPdf() {
  const stream = (bytes: Buffer, extra = '') => Buffer.concat([Buffer.from(`<< /Length ${bytes.length} ${extra} >>\nstream\n`), bytes, Buffer.from('\nendstream')]);
  const text = Buffer.from('BT /F1 20 Tf 50 780 Td (Material verification) Tj 0 -45 Td /F1 14 Tf (Formula: E = m c^2) Tj 0 -35 Td (Table: x | x^2) Tj 0 -25 Td (       2 | 4) Tj 0 -25 Td (       3 | 9) Tj ET');
  const pixels = Buffer.alloc(120 * 60 * 3, 255);
  // Raster crosses and a square ensure image bytes survive round trips.
  for (let y = 10; y < 50; y++) for (let x = 10; x < 110; x++) if (x === y || x === 60 - y || x === 75 || x === 105 || y === 10 || y === 49) pixels.fill(0, (y * 120 + x) * 3, (y * 120 + x) * 3 + 3);
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), stream(text),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 7 0 R >> >> /Contents 8 0 R >>'),
    stream(deflateSync(pixels), '/Type /XObject /Subtype /Image /Width 120 /Height 60 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode'),
    stream(Buffer.from('q 480 0 0 240 50 400 cm /Im1 Do Q')),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.concat(chunks).length); chunks.push(Buffer.from(`${i + 1} 0 obj\n`), objects[i], Buffer.from('\nendobj\n')); }
  const start = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
