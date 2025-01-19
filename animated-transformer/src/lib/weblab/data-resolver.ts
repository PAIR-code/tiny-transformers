// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStoreService } from '../../app/localcache-store.service';
import { tryer } from '../utils';

// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver<T> {
  abstract loadArrayBuffer(path: string): Promise<ArrayBuffer>;
  abstract load(path: string): Promise<T>;
  abstract save(path: string, data: T): Promise<void>;
}

export class InMemoryDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public nodes: { [id: string]: T } = {}) {}

  async loadArrayBuffer(path: string): Promise<ArrayBuffer> {
    const obj = await this.load(path);
    const enc = new TextEncoder();
    const contents = enc.encode(JSON.stringify(obj));
    return contents.buffer as ArrayBuffer;
  }

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
class MissingDirHandle extends Error {}

export class BrowserDirDataResolver<T> implements AbstractDataResolver<T> {
  constructor(
    public config: {
      dirHandle?: FileSystemDirectoryHandle;
      intendedRootPath?: string;
    },
  ) {}

  async loadArrayBuffer(path: string): Promise<ArrayBuffer> {
    if (!this.config.dirHandle) {
      throw new MissingDirHandle();
    }
    const fileHandle = await this.config.dirHandle.getFileHandle(path);
    const file = await fileHandle.getFile();
    const fileBuffer = await file.arrayBuffer();
    return fileBuffer;
  }

  async load(path: string): Promise<T> {
    const buffer = await this.loadArrayBuffer(path);
    const dec = new TextDecoder('utf-8');
    const contents = dec.decode(buffer);
    // TODO: add better file contents verification.
    let dataObject: T;
    dataObject = JSON.parse(contents);
    return dataObject;
  }

  async save(path: string, nodeData: T): Promise<void> {
    if (!this.config.dirHandle) {
      throw new MissingDirHandle();
    }
    const fileHandle = await this.config.dirHandle.getFileHandle(path, { create: true });
    fileHandle.requestPermission({ mode: 'readwrite' });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(nodeData, null, 2));
    // TODO ERROR HERE.
    await writable.close();
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class LocalCacheDataResolver<T extends JsonValue> implements AbstractDataResolver<T> {
  constructor(public localCache: LocalCacheStoreService) {}

  async loadArrayBuffer(path: string): Promise<ArrayBuffer> {
    const obj = await this.load(path);
    const enc = new TextEncoder();
    const contents = enc.encode(JSON.stringify(obj));
    return contents.buffer as ArrayBuffer;
  }

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
