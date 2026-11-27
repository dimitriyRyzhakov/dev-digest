import { unzipSync, type UnzipFileInfo } from 'fflate';
import type { SkillArchiveEntry, SkillArchiveReader } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/**
 * In-memory zip reader for skill import (M2), on fflate (pure JS, no native
 * code). Never touches the filesystem and never executes anything:
 *  - `listEntries` walks the central directory with a filter that rejects every
 *    file, so NOTHING is inflated;
 *  - `readText` inflates exactly one named entry after checking its declared size.
 */
export class FflateSkillArchive implements SkillArchiveReader {
  listEntries(archive: Uint8Array): SkillArchiveEntry[] {
    const entries: SkillArchiveEntry[] = [];
    unzipOrThrow(archive, (file) => {
      if (!file.name.endsWith('/')) entries.push({ path: file.name, size: file.originalSize });
      return false;
    });
    return entries;
  }

  readText(archive: Uint8Array, path: string, maxBytes: number): string {
    let declared = -1;
    const files = unzipOrThrow(archive, (file) => {
      if (file.name !== path) return false;
      declared = file.originalSize;
      return declared <= maxBytes;
    });
    if (declared < 0) throw new ValidationError(`Archive entry not found: ${path}`);
    const bytes = files[path];
    if (!bytes || declared > maxBytes || bytes.length > maxBytes) {
      throw new ValidationError(`Skill file is too large: ${path}`);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new ValidationError(`Skill file is not valid UTF-8 text: ${path}`);
    }
  }
}

function unzipOrThrow(
  archive: Uint8Array,
  filter: (file: UnzipFileInfo) => boolean,
): Record<string, Uint8Array> {
  try {
    return unzipSync(archive, { filter });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Could not read the archive (not a valid .zip)');
  }
}
