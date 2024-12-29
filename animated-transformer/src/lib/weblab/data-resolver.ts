// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStoreService } from '../../app/localcache-store.service';

// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver<T> {
  abstract load(path: string): Promise<T>;
  abstract save(path: string, data: T): Promise<void>;
}

export class InMemoryDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public nodes: { [id: string]: T }) {}

  async load(path: string): Promise<T> {
    if (!(path in this.nodes)) {
      throw new Error(`no such cell path entry: ${path}`);
    }
    return structuredClone(this.nodes[path]);
  }

  async save(path: string, sectionDataDef: T): Promise<void> {
    this.nodes[path] = structuredClone(sectionDataDef);
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class BrowserDirDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public dirHandle: FileSystemDirectoryHandle) {}

  async load(path: string): Promise<T> {
    const fileHandle = await this.dirHandle.getFileHandle(path);
    const file = await fileHandle.getFile();
    const fileBuffer = await file.arrayBuffer();
    const dec = new TextDecoder('utf-8');
    const contents = dec.decode(fileBuffer);
    // TODO: add better file contents verification.
    const dataObject = JSON.parse(contents);
    return dataObject;
  }

  async save(path: string, nodeData: T): Promise<void> {
    const fileHandle = await this.dirHandle.getFileHandle(path);
    fileHandle.requestPermission({ mode: 'readwrite' });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(nodeData, null, 2));
    await writable.close();
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class LocalCacheDataResolver<T extends JsonValue> implements AbstractDataResolver<T> {
  constructor(public localCache: LocalCacheStoreService) {}

  async load(path: string): Promise<T> {
    const dataObject = await this.localCache.loadFileCache<T>(path);
    if (!dataObject) {
      throw new Error(`No local cache file at path (using loadFileCache): ${path}`);
    }
    return dataObject;
  }

  async save(path: string, data: T): Promise<void> {
    await this.localCache.saveFileCache(path, data);
  }
}
