import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { projectDirectoryList } from "../src/project/projectDirectoryList.js"
import { projectDownloadPrepare } from "../src/project/projectDownloadPrepare.js"
import { projectMetadataRead } from "../src/project/projectMetadataRead.js"
import { projectPathResolve } from "../src/project/projectPathResolve.js"
import { projectPathValidate } from "../src/project/projectPathValidate.js"
import { projectPreviewPolicyResolve } from "../src/project/projectPreviewPolicy.js"
import { projectPreviewPrepare } from "../src/project/projectPreviewPrepare.js"
import { projectPreviewRead } from "../src/project/projectPreviewRead.js"
import { projectTextRead } from "../src/project/projectTextRead.js"

describe("project-filesystem core", () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-fs-test-"))
    const realTemp = await fs.realpath(tempDir)
    tempDir = realTemp

    // Create nested directory structure for happy path & ordering test
    // Directories: Alpha_Dir, beta_dir
    // Files: a_file.txt, B_file.txt, hello.utf8.txt, sample.bin, invalid_utf8.bin, oversize.txt
    await fs.mkdir(path.join(tempDir, "Alpha_Dir"), { recursive: true })
    await fs.mkdir(path.join(tempDir, "beta_dir"), { recursive: true })
    await fs.mkdir(path.join(tempDir, "beta_dir/nested"), { recursive: true })

    await fs.writeFile(path.join(tempDir, "a_file.txt"), "content a", "utf-8")
    await fs.writeFile(path.join(tempDir, "B_file.txt"), "content B", "utf-8")
    await fs.writeFile(path.join(tempDir, "hello.utf8.txt"), "Hello, 🌍 World! Unicode string: 🚀", "utf-8")
    await fs.writeFile(path.join(tempDir, "beta_dir/nested/deep.txt"), "deep content", "utf-8")

    // Binary file with NUL byte
    const binaryBuffer = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64])
    await fs.writeFile(path.join(tempDir, "sample.bin"), binaryBuffer)

    // Invalid UTF-8 file
    const invalidUtf8Buffer = Buffer.from([0xc0, 0xaf, 0xff, 0xfe, 0x80])
    await fs.writeFile(path.join(tempDir, "invalid_utf8.bin"), invalidUtf8Buffer)

    // Oversize file
    const oversizeBuffer = Buffer.alloc(2000, "x")
    await fs.writeFile(path.join(tempDir, "oversize.txt"), oversizeBuffer)
    await fs.writeFile(path.join(tempDir, "picture.PNG"), Buffer.from([0x6e, 0x6f, 0x74, 0x2d, 0x70, 0x6e, 0x67]))
    await fs.writeFile(path.join(tempDir, "document.pdf"), Buffer.from("not decoded by preview"))

    // Symlinks
    await fs.symlink(path.join(tempDir, "a_file.txt"), path.join(tempDir, "symlink_file.txt"))
    await fs.symlink(path.join(tempDir, "Alpha_Dir"), path.join(tempDir, "symlink_dir"))
    await fs.symlink(path.join(tempDir, "a_file.txt"), path.join(tempDir, "beta_dir/nested/symlink_in_nested.txt"))
  })

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  describe("projectPathValidate", () => {
    test("validates root relative path and subpaths", () => {
      const rootRes = projectPathValidate("")
      expect(rootRes.success).toBe(true)
      if (rootRes.success) {
        expect(rootRes.data.normalizedPath).toBe("")
        expect(rootRes.data.segments).toEqual([])
      }

      const dotRes = projectPathValidate(".")
      expect(dotRes.success).toBe(true)
      if (dotRes.success) {
        expect(dotRes.data.normalizedPath).toBe("")
        expect(dotRes.data.segments).toEqual([])
      }

      const validRes = projectPathValidate("src/project/file.ts")
      expect(validRes.success).toBe(true)
      if (validRes.success) {
        expect(validRes.data.normalizedPath).toBe("src/project/file.ts")
        expect(validRes.data.segments).toEqual(["src", "project", "file.ts"])
      }
    })

    test("rejects absolute paths", () => {
      const res = projectPathValidate("/etc/passwd")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("absolute")
      }
    })

    test("rejects Windows drive letters and UNC paths", () => {
      const driveRes = projectPathValidate("C:/Windows/System32")
      expect(driveRes.success).toBe(false)
      if (!driveRes.success) {
        expect(driveRes.errorMessage).toContain("Windows drive letter")
      }

      const uncRes = projectPathValidate("//server/share/file.txt")
      expect(uncRes.success).toBe(false)
      if (!uncRes.success) {
        expect(uncRes.errorMessage).toContain("UNC prefix")
      }
    })

    test("rejects backslashes", () => {
      const res = projectPathValidate("foo\\bar.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("backslash")
      }
    })

    test("rejects NUL characters", () => {
      const res = projectPathValidate("foo\0bar.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("NUL")
      }
    })

    test("rejects empty interior/leading/trailing segments", () => {
      expect(projectPathValidate("foo//bar").success).toBe(false)
      expect(projectPathValidate("foo/").success).toBe(false)
      expect(projectPathValidate("/foo").success).toBe(false)
    })

    test("rejects dot and dot-dot interior segments", () => {
      expect(projectPathValidate("../foo").success).toBe(false)
      expect(projectPathValidate("foo/../bar").success).toBe(false)
      expect(projectPathValidate("foo/./bar").success).toBe(false)
      expect(projectPathValidate("..").success).toBe(false)
    })
  })

  describe("projectDirectoryList", () => {
    test("lists root directory sorted directories first then case-insensitive name", async () => {
      const res = await projectDirectoryList(tempDir, "")
      expect(res.success).toBe(true)
      if (!res.success) return

      const entries = res.data

      // Directories come first: Alpha_Dir, beta_dir, symlink_dir (marked type: other)
      const dirs = entries.filter((e) => e.type === "directory")
      const nonDirs = entries.filter((e) => e.type !== "directory")

      expect(dirs.map((d) => d.name)).toEqual(["Alpha_Dir", "beta_dir"])

      // Check non-directories are ordered case-insensitively
      const nonDirNames = nonDirs.map((e) => e.name)
      const sortedNonDirNames = [...nonDirNames].sort((a, b) => {
        const lowerA = a.toLowerCase()
        const lowerB = b.toLowerCase()
        if (lowerA < lowerB) return -1
        if (lowerA > lowerB) return 1
        return a.localeCompare(b)
      })
      expect(nonDirNames).toEqual(sortedNonDirNames)

      // Verify paths are relative
      for (const entry of entries) {
        expect(entry.path).not.toContain(tempDir)
        expect(path.isAbsolute(entry.path)).toBe(false)
      }
    })

    test("lists nested directory happy path", async () => {
      const res = await projectDirectoryList(tempDir, "beta_dir/nested")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.length).toBe(2)
      const first = res.data[0]
      const second = res.data[1]
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      if (!first || !second) return
      expect(first.name).toBe("deep.txt")
      expect(first.path).toBe("beta_dir/nested/deep.txt")
      expect(second.name).toBe("symlink_in_nested.txt")
      expect(second.type).toBe("other")
    })

    test("respects maxDirectoryEntries limit", async () => {
      const res = await projectDirectoryList(tempDir, "", { maxDirectoryEntries: 2 })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("exceeding limit of 2")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })
  })

  describe("projectMetadataRead", () => {
    test("reads metadata for root directory", async () => {
      const res = await projectMetadataRead(tempDir, "")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.path).toBe("")
      expect(res.data.type).toBe("directory")
      expect(res.data.name).toBe(path.basename(tempDir))
      expect(res.data.modifiedAt).toBeInstanceOf(Date)
    })

    test("reads metadata for file", async () => {
      const res = await projectMetadataRead(tempDir, "hello.utf8.txt")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.path).toBe("hello.utf8.txt")
      expect(res.data.name).toBe("hello.utf8.txt")
      expect(res.data.type).toBe("file")
      expect(res.data.size).toBeGreaterThan(0)
    })

    test("rejects symlink targets in metadata read", async () => {
      const res = await projectMetadataRead(tempDir, "symlink_file.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("symbolic link")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })
  })

  describe("projectTextRead", () => {
    test("reads valid UTF-8 text file", async () => {
      const res = await projectTextRead(tempDir, "hello.utf8.txt")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.path).toBe("hello.utf8.txt")
      expect(res.data.content).toBe("Hello, 🌍 World! Unicode string: 🚀")
      expect(res.data.size).toBeGreaterThan(0)
    })

    test("reads nested text file", async () => {
      const res = await projectTextRead(tempDir, "beta_dir/nested/deep.txt")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.content).toBe("deep content")
    })

    test("rejects binary file with NUL byte", async () => {
      const res = await projectTextRead(tempDir, "sample.bin")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("binary content")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects invalid UTF-8 file", async () => {
      const res = await projectTextRead(tempDir, "invalid_utf8.bin")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("invalid UTF-8 encoding")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects oversize file", async () => {
      const res = await projectTextRead(tempDir, "oversize.txt", { maxTextFileSizeBytes: 500 })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("exceeds limit of 500 bytes")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects directory target", async () => {
      const res = await projectTextRead(tempDir, "Alpha_Dir")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("not a regular file")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects symlink target", async () => {
      const res = await projectTextRead(tempDir, "symlink_file.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("symbolic link")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })
  })

  describe("project preview", () => {
    test("classifies bounded text and browser-safe image/PDF types without decoding binaries", async () => {
      expect(projectPreviewPolicyResolve("picture.PNG")).toEqual({ kind: "image", mimeType: "image/png" })
      expect(projectPreviewPolicyResolve("document.pdf")).toEqual({ kind: "pdf", mimeType: "application/pdf" })
      expect(projectPreviewPolicyResolve("unknown.bin")).toEqual({
        kind: "unsupported",
        mimeType: "application/octet-stream",
      })

      const text = await projectPreviewRead(tempDir, "hello.utf8.txt")
      expect(text.success).toBe(true)
      if (text.success)
        expect(text.data).toMatchObject({
          kind: "text",
          mimeType: "text/plain",
          content: "Hello, 🌍 World! Unicode string: 🚀",
        })

      const image = await projectPreviewRead(tempDir, "picture.PNG")
      expect(image.success).toBe(true)
      if (image.success)
        expect(image.data).toEqual({ path: "picture.PNG", kind: "image", mimeType: "image/png", size: 7 })

      const pdf = await projectPreviewPrepare(tempDir, "document.pdf", { maxPreviewFileSizeBytes: 100 })
      expect(pdf.success).toBe(true)
      if (pdf.success) {
        const chunks: Buffer[] = []
        for await (const chunk of pdf.data.createReadStream()) chunks.push(Buffer.from(chunk))
        expect(Buffer.concat(chunks).toString()).toBe("not decoded by preview")
      }
    })

    test("rejects symlinks and enforces the preview size limit", async () => {
      await fs.symlink(path.join(tempDir, "picture.PNG"), path.join(tempDir, "symlink_image.png"))
      const symlink = await projectPreviewPrepare(tempDir, "symlink_image.png")
      expect(symlink.success).toBe(false)
      if (!symlink.success) expect(symlink.errorMessage).toContain("symbolic link")

      const oversized = await projectPreviewPrepare(tempDir, "picture.PNG", { maxPreviewFileSizeBytes: 2 })
      expect(oversized.success).toBe(false)
      if (!oversized.success) {
        expect(oversized.errorMessage).toContain("exceeds preview limit of 2 bytes")
        expect(oversized.errorMessage).not.toContain(tempDir)
      }
    })
  })

  describe("projectDownloadPrepare", () => {
    test("prepares download descriptor for regular file", async () => {
      const res = await projectDownloadPrepare(tempDir, "hello.utf8.txt")
      expect(res.success).toBe(true)
      if (!res.success) return

      expect(res.data.path).toBe("hello.utf8.txt")
      expect(res.data.name).toBe("hello.utf8.txt")
      expect(res.data.size).toBeGreaterThan(0)
      expect(typeof res.data.createReadStream).toBe("function")

      // Stream content test
      const stream = res.data.createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }
      const streamContent = Buffer.concat(chunks).toString("utf-8")
      expect(streamContent).toBe("Hello, 🌍 World! Unicode string: 🚀")
    })

    test("rejects directory target for download", async () => {
      const res = await projectDownloadPrepare(tempDir, "Alpha_Dir")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("not a regular file")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects symlink target for download", async () => {
      const res = await projectDownloadPrepare(tempDir, "symlink_file.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("symbolic link")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("rejects download exceeding maxDownloadFileSizeBytes", async () => {
      const res = await projectDownloadPrepare(tempDir, "oversize.txt", { maxDownloadFileSizeBytes: 100 })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("exceeds download limit of 100 bytes")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })
  })

  describe("security containment & absolute path exposure", () => {
    test("rejects traversal via symlinked directory component", async () => {
      const res = await projectDirectoryList(tempDir, "symlink_dir/a_file.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("symbolic link")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("non-existent path error does not leak absolute path", async () => {
      const res = await projectTextRead(tempDir, "non_existent_folder/file.txt")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).toContain("Path 'non_existent_folder' does not exist")
        expect(res.errorMessage).not.toContain(tempDir)
      }
    })

    test("non-existent repository root fails cleanly without leaking raw error", async () => {
      const fakeRoot = path.join(tempDir, "non_existent_root_dir")
      const res = await projectDirectoryList(fakeRoot, "")
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.errorMessage).not.toContain(fakeRoot)
      }
    })

    test("handles root directory '/' correctly without false prefix mismatch", async () => {
      const res = await projectMetadataRead("/", "")
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.path).toBe("")
        expect(res.data.type).toBe("directory")
      }

      const resolveRes = await projectPathResolve("/", "")
      expect(resolveRes.success).toBe(true)
      if (resolveRes.success) {
        expect(resolveRes.data.resolvedRoot).toBe("/")
        expect(resolveRes.data.targetAbsolutePath).toBe("/")
      }
    })
  })
})
