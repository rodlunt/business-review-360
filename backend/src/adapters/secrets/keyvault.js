// Azure Key Vault secrets adapter (stub).
//
// To complete this adapter:
//   1. npm install @azure/keyvault-secrets @azure/identity
//   2. Replace bootstrap() with a SecretClient fetch that populates process.env
//      with every secret the app expects.
//   3. Set SECRETS_PROVIDER=keyvault in the production environment.
//
// Relevant env vars:
//   AZURE_KEYVAULT_URI  - https://<vault-name>.vault.azure.net/
//   Credentials resolved by DefaultAzureCredential (managed identity in Azure,
//   az login or service principal for local dev).
export async function bootstrap() {
  throw new Error(
    "Azure Key Vault secrets adapter is not yet implemented. " +
      "See backend/src/adapters/secrets/keyvault.js for instructions. " +
      "Set SECRETS_PROVIDER=env to use the .env file."
  );
}
