export type OidcProviderMetadata = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint?: string
  jwksUri: string
  tokenEndpointAuthMethodsSupported: readonly string[]
  responseTypesSupported: readonly string[]
  codeChallengeMethodsSupported: readonly string[]
  idTokenSigningAlgValuesSupported: readonly string[]
  authorizationResponseIssParameterSupported: boolean
}
