// ============================================================================

import { JsonValue } from 'src/lib/json/json';
import { LocalCacheStoreService } from '../../app/localcache-store.service';
import { tryer } from '../utils';

// TODO: maybe this should just be path <--> object ?
export abstract class AbstractDataResolver<T> {
  abstract loadArrayBuffer(path: string): Promise<Error | ArrayBuffer>;
  abstract load(path: string): Promise<Error | T>;
  abstract save(path: string, data: T): Promise<Error | null>;
}

export class InMemoryDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public nodes: { [id: string]: T }) {}

  async loadArrayBuffer(path: string): Promise<Error | ArrayBuffer> {
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

  async save(path: string, sectionDataDef: T): Promise<null> {
    this.nodes[path] = structuredClone(sectionDataDef);
    return null;
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class BrowserDirDataResolver<T> implements AbstractDataResolver<T> {
  constructor(public dirHandle: FileSystemDirectoryHandle) {}

  async loadArrayBuffer(path: string): Promise<Error | ArrayBuffer> {
    const [getDirErr, fileHandle] = await tryer(this.dirHandle.getFileHandle(path));
    if (getDirErr) {
      return getDirErr;
    }
    const [getFileErr, file] = await tryer(fileHandle.getFile());
    if (getFileErr) {
      return getFileErr;
    }
    const [bufferErr, fileBuffer] = await tryer(file.arrayBuffer());
    if (bufferErr) {
      return bufferErr;
    }
    return fileBuffer;
  }

  async load(path: string): Promise<Error | T> {
    const buffer = await this.loadArrayBuffer(path);
    if (buffer instanceof Error) {
      return buffer;
    }
    const dec = new TextDecoder('utf-8');
    const contents = dec.decode(buffer);
    // TODO: add better file contents verification.
    let dataObject: T;
    try {
      dataObject = JSON.parse(contents);
    } catch (e) {
      return e as Error;
    }
    return dataObject;
  }

  async save(path: string, nodeData: T): Promise<Error | null> {
    const [getFileErr, fileHandle] = await tryer(
      this.dirHandle.getFileHandle(path, { create: true }),
    );
    if (getFileErr) {
      return getFileErr;
    }
    fileHandle.requestPermission({ mode: 'readwrite' });
    const [createErr, writable] = await tryer(fileHandle.createWritable());
    if (createErr) {
      return createErr;
    }
    const [writeErr] = await tryer(writable.write(JSON.stringify(nodeData, null, 2)));
    if (writeErr) {
      return writeErr;
    }
    // TODO ERROR HERE.
    await writable.close();
    return null;
  }
}

// ============================================================================
// TODO: maybe this should just be path <--> object ?
export class LocalCacheDataResolver<T extends JsonValue> implements AbstractDataResolver<T> {
  constructor(public localCache: LocalCacheStoreService) {}

  async loadArrayBuffer(path: string): Promise<Error | ArrayBuffer> {
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

  async save(path: string, data: T): Promise<null> {
    await this.localCache.saveFileCache(path, data);
    return null;
  }
}
