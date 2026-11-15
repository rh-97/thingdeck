/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set for static hosting (GitHub Pages) where no API proxy exists. */
  readonly VITE_STATIC_DEMO?: string;
  readonly VITE_BASE?: string;
}
