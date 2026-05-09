// Registry — query on-chain ProviderRecord accounts.

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

function bytesToModelId(bytes) {
  // Models are stored as 32-byte arrays, often null-padded utf8 strings.
  return Buffer.from(bytes).toString('utf8').replace(/\0+$/, '')
}

function normalize(record) {
  const acct = record.account
  return {
    pubkey: record.publicKey,
    authority: acct.authority,
    qvacPubKey: bytesToHex(acct.qvacPubkey),
    models: acct.models.map(bytesToModelId),
    pricePer1k: BigInt(acct.pricePer1K.toString()),
    stakeAmount: BigInt(acct.stakeAmount.toString()),
    active: acct.active,
  }
}

export async function listProviders(program, { activeOnly = true, model } = {}) {
  const records = await program.account.providerRecord.all()
  let providers = records.map(normalize)
  if (activeOnly) providers = providers.filter((p) => p.active)
  if (model) providers = providers.filter((p) => p.models.includes(model))
  return providers
}

export function pickCheapest(providers) {
  if (providers.length === 0) return null
  return providers.reduce((best, p) => (p.pricePer1k < best.pricePer1k ? p : best))
}
