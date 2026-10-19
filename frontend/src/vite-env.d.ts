/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_RECAPTCHA_SITE_KEY: string;
  readonly VITE_GIT_COMMIT_HASH: string;
  readonly VITE_BASE_DOMAIN: string;
  readonly VITE_BUILD_NUMBER: string;
  readonly VITE_BUILD_INFO: {
    hash: string;
    branch: string;
    date: string;
    dirty: boolean;
  };
  readonly VITE_APP_VERSION: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
