import type { ProjectLimits } from "./projectLimitsSchema.js"

export const projectDefaultLimits: ProjectLimits = {
  maxDirectoryEntries: 1000,
  maxTextFileSizeBytes: 1024 * 1024,
  maxDownloadFileSizeBytes: 100 * 1024 * 1024,
}
