// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStoreService } from '../../app/localcache-store.service';
import { stringifyJsonValue } from '../json/pretty_json';
import json5 from 'json5';

// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver {
  abstract loadArrayBuffer(path: string[]): Promise<ArrayBuffer>;
  abstract saveArrayBuffer(path: string[], data: ArrayBuffer): Promise<void>;

  async loadStr(path: string[]): Promise<string> {
    const dec = new TextDecoder('utf-8');
    const arrayBuffer = await this.loadArrayBuffer(path);
    const str = dec.decode(arrayBuffer);
    return str;
  }

  async saveStr(path: string[], data: string): Promise<void> {
    const enc = new TextEncoder(); // always utf-8
    const contents = enc.encode(data);
    this.saveArrayBuffer(path, contents.buffer as ArrayBuffer);
  }
}

// ============================================================================
export class InMemoryDataResolver extends AbstractDataResolver {
  constructor(public nodes: { [id: string]: ArrayBuffer } = {}) {
    super();
  }

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const pathStr = path.join('/');
    if (!(pathStr in this.nodes)) {
      throw new Error(`no such cell path entry: ${pathStr}`);
    }
    return this.nodes[path.join('/')];
  }

  async saveArrayBuffer(path: string[], data: ArrayBuffer): Promise<void> {
    this.nodes[path.join('/')] = data;
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
class MissingDirHandle extends Error {}

export class BrowserDirDataResolver extends AbstractDataResolver {
  constructor(
    public config: {
      dirHandle?: FileSystemDirectoryHandle;
      intendedRootPath?: string;
    },
  ) {
    super();
  }

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const usedSubpaths = [...path];
    if (usedSubpaths.length === 0) {
      throw new Error('Cannot load empty path');
    }
    if (!this.config.dirHandle) {
      throw new MissingDirHandle();
    }
    let curDirHandle = this.config.dirHandle;
    console.log('subpaths', JSON.stringify(usedSubpaths));
    while (usedSubpaths.length > 1) {
      const nextDirPath = usedSubpaths.shift();
      console.log(`looking in ${nextDirPath}`);
      curDirHandle = await curDirHandle.getDirectoryHandle(nextDirPath!);
    }
    const finalFilePath = usedSubpaths.shift() as string;
    console.log(`looking in final filepath: ${finalFilePath}`);
    const fileHandle = await curDirHandle.getFileHandle(finalFilePath);
    const file = await fileHandle.getFile();
    const fileBuffer = await file.arrayBuffer();
    return fileBuffer;
  }

  async saveArrayBuffer(path: string[], data: ArrayBuffer): Promise<void> {
    const usedSubpaths = [...path];
    if (usedSubpaths.length === 0) {
      throw new Error('saveArrayBuffer: Cannot load empty path');
    }
    if (!this.config.dirHandle) {
      throw new MissingDirHandle();
    }
    let curDirHandle = this.config.dirHandle;
    console.log('saveArrayBuffer: subpaths', JSON.stringify(usedSubpaths));
    while (usedSubpaths.length > 1) {
      const nextDirPath = usedSubpaths.shift();
      console.log(`saveArrayBuffer: looking in ${nextDirPath}`);
      curDirHandle = await curDirHandle.getDirectoryHandle(nextDirPath!);
    }
    const finalFilePath = usedSubpaths.shift() as string;
    console.log(`saveArrayBuffer: looking in final filepath: ${finalFilePath}`);
    const fileHandle = await curDirHandle.getFileHandle(finalFilePath);
    fileHandle.requestPermission({ mode: 'readwrite' });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
  }
}

// ============================================================================
export class LocalCacheStore {
  constructor(
    public defaultStorageId = 'defaultFilePath',
    public pathPrefix = 'LocalCacheStore:',
  ) {}
  async load(path: string): Promise<string> {
    const s = localStorage.getItem(this.pathPrefix + path);
    if (!s) {
      throw new Error(`LocalCacheStore: no such key: ${path}`);
    }
    // TODO: consider if not parsable, clear and return null?
    return s;
  }
  async save(path: string, obj: string): Promise<void> {
    localStorage.setItem(this.pathPrefix + path, obj);
  }
  async delete(path: string): Promise<void> {
    localStorage.removeItem(this.pathPrefix + path);
  }
  async saveDefault(obj: string): Promise<void> {
    this.save(this.defaultStorageId, obj);
  }
  async loadDefault(): Promise<string> {
    return this.load(this.defaultStorageId);
  }
  async deleteDefault(): Promise<void> {
    this.delete(this.defaultStorageId);
  }
}

export const jsonEncode = stringifyJsonValue;
export const jsonDecode = json5.parse;

export const defaultLocalCacheStore = new LocalCacheStore();

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class LocalCacheDataResolver extends AbstractDataResolver {
  localCache: LocalCacheStore;

  constructor(localCache?: LocalCacheStore) {
    super();
    this.localCache = localCache || defaultLocalCacheStore;
  }

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const s = await this.localCache.load(path.join('/'));
    const enc = new TextEncoder(); // always utf-8
    const contents = enc.encode(s);
    return contents.buffer as ArrayBuffer;
  }

  async saveArrayBuffer(path: string[], data: ArrayBuffer): Promise<void> {
    const dec = new TextDecoder('utf-8');
    const str = dec.decode(data);
    await this.localCache.save(path.join('/'), str);
  }
}
