import Color from "colorjs.io"

/** Pi's default/ANSI index, hex, okhsl and oklch color formats. Throws for invalid values at theme adaptation. */
export function cliTuiColorAnsi(value: string | number, background = false): string {
  const channel = background ? 48 : 38
  if (value === "" || value === "default") return ""
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`Invalid ANSI index: ${value}`)
    return `\x1b[${channel};5;${value}m`
  }
  let color: Color
  const okhsl =
    /^okhsl\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))(%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))(%?)\s*\)$/i.exec(
      value,
    )
  if (okhsl) {
    const saturation = Number(okhsl[2]) / (okhsl[3] ? 100 : 1)
    const lightness = Number(okhsl[4]) / (okhsl[5] ? 100 : 1)
    if (saturation < 0 || saturation > 1 || lightness < 0 || lightness > 1)
      throw new Error(`Invalid okhsl color: ${value}`)
    color = new Color("okhsl", [Number(okhsl[1]), saturation, lightness])
  } else {
    if (!/^#(?:[\da-f]{3}|[\da-f]{6})$|^oklch\(/i.test(value)) throw new Error(`Invalid Pi color: ${value}`)
    color = new Color(value)
  }
  const channels = color
    .to("srgb")
    .coords.map((component) =>
      component === null ? Number.NaN : Math.round(Math.max(0, Math.min(1, component)) * 255),
    )
  if (channels.some((component) => !Number.isFinite(component))) throw new Error(`Invalid Pi color: ${value}`)
  return `\x1b[${channel};2;${channels.join(";")}m`
}
