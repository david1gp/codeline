const managedDatabaseConsumerUnits = ["codeline-dev-api.service"] as const

export function managedDatabaseConsumerUnitsRead(): readonly string[] {
  return managedDatabaseConsumerUnits
}
