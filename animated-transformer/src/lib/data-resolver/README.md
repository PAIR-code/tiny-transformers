# Data Resolver Library

The `data-resolver` library provides a clean, flexible abstraction for loading and saving binary data (`ArrayBuffer`) and text (`string`) resources. By separating the storage implementation from the application logic, it enables seamless resource access across multiple execution environments, such as browser memory, LocalStorage, local disk via the File System Access API, or a remote experiment server.

## Key Concepts

*   **`AbstractDataResolver`**: The abstract base class that defines the `loadArrayBuffer` and `saveArrayBuffer` methods. It also provides high-level utilities for string decoding and encoding (`loadStr`, `saveStr`).
*   **`InMemoryDataResolver`**: A simple in-memory key-value store mapping path arrays to `ArrayBuffer` buffers, ideal for testing or transient sessions.
*   **`LocalCacheDataResolver`**: Wraps browser `localStorage` to save and load string representations under key prefixes.
*   **`BrowserDirDataResolver`**: Uses the HTML5 File System Access API (`FileSystemDirectoryHandle`) to let the browser directly read and write files inside a local workspace directory.
*   **`tRpcDataResolver`**: Connects to a remote workspace/experiment server over tRPC HTTP links to fetch or upload resources dynamically.

---

## Example Usage

### 1. In-Memory Resolver

```typescript
import { InMemoryDataResolver } from './data-resolver';

const resolver = new InMemoryDataResolver();

// Save a string to a path
await resolver.saveStr(['configs', 'model1.json'], '{"layers": 4}');

// Load the string back
const config = await resolver.loadStr(['configs', 'model1.json']);
console.log(JSON.parse(config)); // { layers: 4 }
```

### 2. Browser Directory Resolver

```typescript
import { BrowserDirDataResolver } from './data-resolver';

// Request directory handle from browser user
const dirHandle = await window.showDirectoryPicker();

const fileResolver = new BrowserDirDataResolver({ dirHandle });

// Reads directly from the user's chosen directory path
const fileContent = await fileResolver.loadStr(['src', 'lib', 'README.md']);
console.log(fileContent);
```

### 3. Local Storage Cache Store

```typescript
import { LocalCacheStore, LocalCacheDataResolver } from './data-resolver';

const store = new LocalCacheStore('myAppPrefix');
const cacheResolver = new LocalCacheDataResolver(store);

await cacheResolver.saveStr(['cache', 'session1'], 'session-token');
```
