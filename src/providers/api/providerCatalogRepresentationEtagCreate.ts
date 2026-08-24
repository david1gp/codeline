import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"

const providerCatalogRepresentationSchemaVersion = "provider-catalog-v1"

/**
 * Strong validator of the redacted provider catalog representation. The catalog
 * digest identifies the loaded source and the integer revision identifies the
 * typed API representation in the shared browser cache.
 */
export function providerCatalogRepresentationEtagCreate(catalogRevision: string, revision: ApiRevision): ApiEtag {
  return apiRepresentationEtagCreate(
    `providers:catalog:${catalogRevision}`,
    providerCatalogRepresentationSchemaVersion,
    revision,
  )
}
