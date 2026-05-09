// QVAC delegated-inference wrapper.
// Looks up provider's QVAC public key from on-chain ProviderRecord, loads a
// delegated model handle, and exposes a streaming completion API.

import {
  loadModel,
  completion,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
} from '@qvac/sdk'

export const MODELS = {
  'llama-3.2-1b': { src: LLAMA_3_2_1B_INST_Q4_0, type: 'llm' },
}

export async function complete({
  providerQvacPubKey,
  model = 'llama-3.2-1b',
  messages,
  stream = true,
  timeoutMs = 60_000,
  fallbackToLocal = false,
}) {
  const spec = MODELS[model]
  if (!spec) throw new Error(`Unknown model: ${model}. Known: ${Object.keys(MODELS).join(', ')}`)

  const modelId = await loadModel({
    modelSrc: spec.src,
    modelType: spec.type,
    delegate: { providerPublicKey: providerQvacPubKey, timeout: timeoutMs, fallbackToLocal },
  })

  const response = completion({ modelId, history: messages, stream })

  return {
    modelId,
    tokenStream: response.tokenStream,
    stats: response.stats,
    unload: () => unloadModel({ modelId }),
  }
}
