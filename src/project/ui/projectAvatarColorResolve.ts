export type ProjectAvatarColor = {
  key: string
  background: string
  foreground: string
}

const emptyProjectAvatarColor: ProjectAvatarColor = {
  key: "gray",
  background: "#71717a",
  foreground: "#ffffff",
}

const projectAvatarPalette: ProjectAvatarColor[] = [
  { key: "orange", background: "#ea580c", foreground: "#ffffff" },
  { key: "yellow", background: "#ca8a04", foreground: "#ffffff" },
  { key: "cyan", background: "#0891b2", foreground: "#ffffff" },
  { key: "green", background: "#16a34a", foreground: "#ffffff" },
  { key: "red", background: "#dc2626", foreground: "#ffffff" },
  { key: "pink", background: "#db2777", foreground: "#ffffff" },
  { key: "blue", background: "#2563eb", foreground: "#ffffff" },
  { key: "purple", background: "#9333ea", foreground: "#ffffff" },
]

export function projectAvatarColorResolve(name: string): ProjectAvatarColor {
  if (name === "") {
    return emptyProjectAvatarColor
  }

  let hash = 5381
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash * 33) ^ name.charCodeAt(index)) >>> 0
  }

  return projectAvatarPalette[hash % projectAvatarPalette.length] ?? emptyProjectAvatarColor
}
