type MetricsLabels = Readonly<Record<string, string>>
type MetricsValue = { labels: MetricsLabels; name: string; value: number }

export function metricsCollectorCreate() {
  const values = new Map<string, MetricsValue>()

  const increment = (name: string, value = 1, labels: MetricsLabels = {}): void => {
    if (!Number.isFinite(value) || value === 0) return

    const normalizedLabels = Object.fromEntries(
      Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)),
    )
    const key = `${name}\u0000${JSON.stringify(normalizedLabels)}`
    const current = values.get(key)
    if (current === undefined) {
      values.set(key, { labels: normalizedLabels, name, value })
      return
    }
    current.value += value
  }

  const snapshot = () => ({
    metrics: [...values.values()].map((metric) => ({
      labels: { ...metric.labels },
      name: metric.name,
      value: metric.value,
    })),
  })

  return { increment, snapshot }
}
