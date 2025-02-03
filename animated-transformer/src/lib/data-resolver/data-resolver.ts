// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStoreService } from '../../app/localcache-store.service';
import { stringifyJsonValue } from '../json/pretty_json';
import json5 from 'json5';

// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver<T> {
  abstract loadArrayBuffer(path: string[]): Promise<ArrayBuffer>;
  // abstract loadBlob(path: string[]): Promise<Blob>;
  abstract load(path: string): Promise<T>;
  abstract save(path: string, data: T): Promise<void>;
}

export class InMemoryDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public nodes: { [id: string]: T } = {}) {}

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const obj = await this.load(path.join('/'));
    const enc = new TextEncoder();
    const contents = enc.encode(JSON.stringify(obj));
    return contents.buffer as ArrayBuffer;
  }

  // async loadBlob(path: string[]): Promise<Blob> {
  //   const obj = await this.load(path.join('/'));
  //   return new Blob(JSON.stringify(obj));
  // }

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

export class BrowserDirDataResolver<T extends JsonValue> implements AbstractDataResolver<T> {
  constructor(
    public config: {
      dirHandle?: FileSystemDirectoryHandle;
      intendedRootPath?: string;
    },
  ) {}

  async loadArrayBuffer(subpaths: string[]): Promise<ArrayBuffer> {
    if (subpaths.length === 0) {
      throw new Error('Cannot load empty path');
    }
    if (!this.config.dirHandle) {
      throw new MissingDirHandle();
    }
    let curDirHandle = this.config.dirHandle;
    console.log('subpaths', JSON.stringify(subpaths));
    if (subpaths.length > 1) {
      const nextDirPath = subpaths.shift();
      console.log(`looking in ${nextDirPath}`);
      curDirHandle = await curDirHandle.getDirectoryHandle(nextDirPath!);
    }
    const finalFilePath = subpaths.shift() as string;
    console.log(`looking in final filepath: ${finalFilePath}`);
    const fileHandle = await curDirHandle.getFileHandle(finalFilePath);
    const file = await fileHandle.getFile();
    const fileBuffer = await file.arrayBuffer();
    return fileBuffer;
  }

  async load(path: string): Promise<T> {
    const buffer = await this.loadArrayBuffer([path]);
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
    await writable.write(
      stringifyJsonValue(nodeData, { arrWrapAt: 100, objWrapAt: 100, quoteAllKeys: true }),
    );
    // TODO ERROR HERE.
    await writable.close();
  }
}

// ============================================================================
export class LocalCacheStore<T> {
  constructor(
    public encoder: (x: T) => string,
    public decoder: (s: string) => T,
    public defaultStorageId = 'defaultFilePath',
    public pathPrefix = 'LocalCacheStore:',
  ) {}
  async load(path: string): Promise<T | null> {
    const s = localStorage.getItem(this.pathPrefix + path);
    if (!s) {
      return null;
    }
    // TODO: consider if not parsable, clear and return null?
    return this.decoder(s);
  }
  async save(path: string, obj: T): Promise<void> {
    localStorage.setItem(this.pathPrefix + path, this.encoder(obj));
  }
  async delete(path: string): Promise<void> {
    localStorage.removeItem(this.pathPrefix + path);
  }
  async saveDefault(obj: T): Promise<void> {
    this.save(this.defaultStorageId, obj);
  }
  async loadDefault(): Promise<T | null> {
    return this.load(this.defaultStorageId);
  }
  async deleteDefault(): Promise<void> {
    this.delete(this.defaultStorageId);
  }
}

export const defaultLocalCacheStore = new LocalCacheStore<JsonValue>(
  stringifyJsonValue,
  json5.parse,
);

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class LocalCacheDataResolver<T extends JsonValue> implements AbstractDataResolver<T> {
  localCache: LocalCacheStore<T>;

  constructor(localCache?: LocalCacheStore<T>) {
    this.localCache = localCache || (defaultLocalCacheStore as never as LocalCacheStore<T>);
  }

  async loadArrayBuffer(path: string[]): Promise<ArrayBuffer> {
    const obj = await this.load(path.join('/'));
    const enc = new TextEncoder();
    const contents = enc.encode(JSON.stringify(obj));
    return contents.buffer as ArrayBuffer;
  }

  async load(path: string): Promise<T> {
    const dataObject = await this.localCache.load(path);
    if (!dataObject) {
      throw new Error(`No local cache file at path (using loadFileCache): ${path}`);
    }
    return dataObject;
  }

  async save(path: string, data: T): Promise<void> {
    await this.localCache.save(path, data);
  }
}
