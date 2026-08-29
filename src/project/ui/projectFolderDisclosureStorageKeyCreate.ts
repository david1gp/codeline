export function projectFolderDisclosureStorageKeyCreate(accountId: string | null): string {
  return `codeline.project-folder-disclosure.${accountId ?? "default"}`
}
