export interface SimulateSpeedOption {
  label: string
  multiplier: number
}

export const simulateSpeedOptions = [
  { label: "0.5x", multiplier: 0.5 },
  { label: "1x", multiplier: 1 },
  { label: "2x", multiplier: 2 },
  { label: "4x", multiplier: 4 },
] as const satisfies readonly SimulateSpeedOption[]
