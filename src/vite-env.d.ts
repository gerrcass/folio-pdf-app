/// <reference types="vite/client" />

import type { FolioBridge } from './platform/bridge-types';

declare global {
  interface Window {
    folio?: FolioBridge;
    scheduler?: {
      yield?: () => Promise<void>;
    };
  }

  const __FOLIO_BUILD__: {
    edition: 'desktop' | 'web';
    version: string;
  };

}

export {};
