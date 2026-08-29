declare const fileVersionBrand: unique symbol

export type FileVersion = string & { readonly [fileVersionBrand]: "FileVersion" }

export function fileVersion(value: string): FileVersion {
  return value as FileVersion
}
