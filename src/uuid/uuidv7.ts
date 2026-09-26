type BunRuntime = {
  randomUUIDv7?: () => string
}

export function uuidv7(): string {
  const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun
  if (typeof bun?.randomUUIDv7 === "function") return bun.randomUUIDv7()

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  const timestamp = BigInt(Date.now())
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
