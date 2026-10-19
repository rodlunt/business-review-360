# Storage Adapter

Abstraction over the file-storage backend used by upload middleware.
Introduced as part of issue #494 to remove the `./uploads` local volume
as a sticky point for an eventual migration to Azure Container Apps.

## Purpose

Existing code writes uploaded images to a local disk volume served by
Express static. That works for self-hosted Docker today but blocks a
move to stateless container hosting. This adapter lets consumers call a
stable interface and have the runtime pick the concrete backend from a
single environment variable.

## Interface contract

Every adapter extends `StorageAdapter` in `interface.js` and implements:

- `save(filename, buffer, options?)` returns `{ url, path }`.
- `delete(filename)` is idempotent; missing files do not throw.
- `getUrl(filename)` returns the public URL for a stored file.
- `getStream(filename)` returns a readable stream.
- `exists(filename)` returns a boolean.

All methods are async. Filenames must not contain path separators;
callers are responsible for timestamping or sanitising names before
handing them to the adapter.

## Selecting a backend

`createStorageAdapter()` reads `STORAGE_PROVIDER` (default `local`) and
returns the matching instance. Today only the local implementation
ships.

## Roadmap

The Azure Blob adapter lands alongside the Key Vault secrets work under
issue #495. Scope there covers a `SecretsAdapter` plus the storage
counterpart, so both provider swaps happen together. The upload
middleware swap to call through this adapter is a separate follow-on
commit once Hotfix 2 (reCAPTCHA) clears.
