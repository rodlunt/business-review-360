import * as envAdapter from "./env.js";
import * as keyvaultAdapter from "./keyvault.js";

const ADAPTERS = { env: envAdapter, keyvault: keyvaultAdapter };

function getAdapter() {
  const provider = process.env.SECRETS_PROVIDER || "env";
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unknown SECRETS_PROVIDER "${provider}". Valid values: env, keyvault`);
  }
  return adapter;
}

export async function bootstrap() {
  await getAdapter().bootstrap();
}
