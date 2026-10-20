/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMPARESHOP_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import type { AdminIdentity } from './permissions';

declare global {
  interface Window {
    /** Supplied by the authenticated Admin host after session validation. */
    __GIATOT_ADMIN_IDENTITY__?: AdminIdentity | null;
  }
}
