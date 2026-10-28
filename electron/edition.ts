import type { Edition } from '../src/platform/bridge-types';

export function resolveEdition(options: { isPackaged: boolean; portable: boolean }): Edition {
  if (!options.isPackaged) return 'development';
  if (options.portable) return 'portable';
  return 'installed';
}
