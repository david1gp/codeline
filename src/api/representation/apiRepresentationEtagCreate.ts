import type { ApiEtag } from "../schema/apiEtagSchema.js"
import type { ApiRevision } from "../schema/apiRevisionSchema.js"

export function apiRepresentationEtagCreate(
  representationIdentity: string,
  schemaVersion: string,
  revision: ApiRevision,
): ApiEtag {
  const input = `${representationIdentity}\u0000${schemaVersion}\u0000${revision}`
  const digest = apiRepresentationSha256Create(input)
  return `"${apiRepresentationBase64UrlCreate(digest)}"`
}

const apiRepresentationSha256RoundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const

const apiRepresentationSha256InitialHash = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

function apiRepresentationSha256Create(input: string): Uint8Array {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(source)
  padded[source.length] = 0x80

  const paddedView = new DataView(padded.buffer)
  const bitLength = source.length * 8
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000))
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0)

  const hash: number[] = [...apiRepresentationSha256InitialHash]
  const words = new Array<number>(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = paddedView.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15]!
      const second = words[index - 2]!
      const firstSigma =
        apiRepresentationSha256RotateRight(first, 7) ^ apiRepresentationSha256RotateRight(first, 18) ^ (first >>> 3)
      const secondSigma =
        apiRepresentationSha256RotateRight(second, 17) ^
        apiRepresentationSha256RotateRight(second, 19) ^
        (second >>> 10)
      words[index] = (words[index - 16]! + firstSigma + words[index - 7]! + secondSigma) >>> 0
    }

    let a = hash[0]!
    let b = hash[1]!
    let c = hash[2]!
    let d = hash[3]!
    let e = hash[4]!
    let f = hash[5]!
    let g = hash[6]!
    let h = hash[7]!
    for (let index = 0; index < 64; index += 1) {
      const sumOne =
        apiRepresentationSha256RotateRight(e, 6) ^
        apiRepresentationSha256RotateRight(e, 11) ^
        apiRepresentationSha256RotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const first = (h + sumOne + choose + apiRepresentationSha256RoundConstants[index]! + words[index]!) >>> 0
      const sumZero =
        apiRepresentationSha256RotateRight(a, 2) ^
        apiRepresentationSha256RotateRight(a, 13) ^
        apiRepresentationSha256RotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const second = (sumZero + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + first) >>> 0
      d = c
      c = b
      b = a
      a = (first + second) >>> 0
    }

    hash[0] = (hash[0]! + a) >>> 0
    hash[1] = (hash[1]! + b) >>> 0
    hash[2] = (hash[2]! + c) >>> 0
    hash[3] = (hash[3]! + d) >>> 0
    hash[4] = (hash[4]! + e) >>> 0
    hash[5] = (hash[5]! + f) >>> 0
    hash[6] = (hash[6]! + g) >>> 0
    hash[7] = (hash[7]! + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  for (let index = 0; index < hash.length; index += 1) digestView.setUint32(index * 4, hash[index]!)
  return digest
}

function apiRepresentationSha256RotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

function apiRepresentationBase64UrlCreate(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
