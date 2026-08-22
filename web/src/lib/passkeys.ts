type JsonObject = Record<string, unknown>

function bytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer
}

function encoded(value: ArrayBuffer): string {
  let raw = ''
  for (const byte of new Uint8Array(value)) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function creationOptions(json: JsonObject): PublicKeyCredentialCreationOptions {
  const user = json.user as Record<string, unknown>
  const exclude = (json.excludeCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...(json as unknown as PublicKeyCredentialCreationOptions), challenge: bytes(json.challenge as string),
    user: { ...user, id: bytes(user.id as string) } as PublicKeyCredentialUserEntity,
    excludeCredentials: exclude.map((item) => ({ ...item, id: bytes(item.id as string) })) as PublicKeyCredentialDescriptor[],
  }
}

export function requestOptions(json: JsonObject): PublicKeyCredentialRequestOptions {
  const allow = (json.allowCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...(json as unknown as PublicKeyCredentialRequestOptions), challenge: bytes(json.challenge as string),
    allowCredentials: allow.map((item) => ({ ...item, id: bytes(item.id as string) })) as PublicKeyCredentialDescriptor[],
  }
}

export function credentialJSON(credential: PublicKeyCredential): JsonObject {
  const response = credential.response
  const base = { id: credential.id, rawId: encoded(credential.rawId), type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment, clientExtensionResults: credential.getClientExtensionResults() }
  if (response instanceof AuthenticatorAttestationResponse) {
    return { ...base, response: { clientDataJSON: encoded(response.clientDataJSON),
      attestationObject: encoded(response.attestationObject), transports: response.getTransports?.() ?? [] } }
  }
  const assertion = response as AuthenticatorAssertionResponse
  return { ...base, response: { clientDataJSON: encoded(assertion.clientDataJSON),
    authenticatorData: encoded(assertion.authenticatorData), signature: encoded(assertion.signature),
    userHandle: assertion.userHandle ? encoded(assertion.userHandle) : null } }
}
