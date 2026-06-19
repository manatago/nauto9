import { randomBytes } from 'crypto'

// Naming convention ported from nauto8 (reservation_dispatch._slug / _rand7 /
// _build_save_key and reservations._safe_arc_path).

// Keep Unicode letters/digits (incl. Japanese), underscore and hyphen; collapse
// everything else to '_'. Matches Python's re.sub(r"[^\w\-]+", "_", ...).
export function slug(name: string, maxLen = 48): string {
  const s = (name ?? '').replace(/[^\p{L}\p{N}_-]+/gu, '_')
  return (s || 'res').slice(0, maxLen)
}

export function rand7(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const b = randomBytes(7)
  let out = ''
  for (let i = 0; i < 7; i++) out += chars[b[i] % chars.length]
  return out
}

// generations/{slug(batch)}/{seq:03d}-{slug(situation,32)}-{rand7}.png
export function generationKey(batchName: string, seq: number, situationName: string): string {
  return `generations/${slug(batchName)}/${String(seq).padStart(3, '0')}-${slug(situationName, 32)}-${rand7()}.png`
}

// ZIP archive name: last path segment, NFC-normalized, filesystem-illegal chars
// replaced. Japanese / alphanumerics are preserved.
export function safeArcName(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.normalize('NFC').replace(/[<>:"|?*\\]/g, '_')
}
