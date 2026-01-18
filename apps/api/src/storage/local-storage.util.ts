import { existsSync } from 'fs';
import * as path from 'path';

export function resolveLocalStoragePath(envPath?: string) {
  if (envPath) {
    if (path.isAbsolute(envPath)) {
      return envPath;
    }
    const cwd = process.cwd();
    const apiDir = path.join(cwd, 'apps', 'api');
    if (envPath.startsWith('apps') && existsSync(apiDir) && cwd === path.dirname(apiDir)) {
      return path.join(cwd, envPath);
    }
    return path.resolve(cwd, envPath);
  }

  const cwd = process.cwd();
  const apiDir = path.join(cwd, 'apps', 'api');
  if (existsSync(apiDir)) {
    return path.join(apiDir, '.local-storage');
  }
  return path.join(cwd, '.local-storage');
}
