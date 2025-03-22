/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

/**
 * This is a server watches files, and sends their contents to the client. It
 * uses web-socket connections, and has a small simple protocol to ask to start
 * listening, and stop listening.
 */

// TODO: once deno supports WebTransport, we should move to that.
// see: https://github.com/denoland/deno/pull/27431

import {
  FromClientMessage,
  FromClientMessageKind,
  FromWatcherMessage,
  FromWatcherMessageKind,
} from './protocol-types.ts';
import { tryer } from 'lib/utils';

type FileStateDB = {
  [path: string]: FileState;
};

type FileState = {
  path: string;
  watcher: Deno.FsWatcher;
  snapshotTimestamp: Date;
};

// Server that listens to many web-socket connections.
export class SocketFsWatcherServer {
  connectionCount = 0;
  connections: { [id: string]: SocketFsWatcherConnection } = {};

  constructor() {}

  start() {
    Deno.serve((req) => {
      // We only work with web-sockets, error otherwise.
      if (req.headers.get('upgrade') != 'websocket') {
        console.warn(`client without an upgrade request connected, sending 501.`);
        return new Response(null, { status: 501 });
      }
      const { socket, response } = Deno.upgradeWebSocket(req);

      const thisConnectionId = `${this.connectionCount++}`;
      this.connections[thisConnectionId] = new SocketFsWatcherConnection(
        this,
        socket,
        thisConnectionId,
      );
      return response;
    });
  }

  disconnect(connection: SocketFsWatcherConnection) {
    delete this.connections[connection.connectionId];
  }
}

// Class responsible for managing a single connection.
export class SocketFsWatcherConnection {
  db: FileStateDB = {};
  clientId?: string;

  constructor(
    public server: SocketFsWatcherServer,
    public socket: WebSocket,
    public connectionId: string,
  ) {
    socket.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data) as FromClientMessage;
      switch (message.kind) {
        case FromClientMessageKind.Connect:
          this.clientId = message.clientId;
          break;
        case FromClientMessageKind.Diconnect:
          this.server.disconnect(this);
          break;
        case FromClientMessageKind.StartWatchingFile:
          this.start(message.path);
          break;
        case FromClientMessageKind.StopWatchingFile:
          this.stop(message.path);
          break;
        default:
          console.error(`Unknown message action: ${JSON.stringify(message)}`);
      }
    });

    socket.onclose = () => {
      for (const path in this.db) {
        this.stop(path);
      }
    };
  }

  async start(path: string) {
    if (this.db[path]) {
      console.error(`Tried to start on a path we are already watching: ${path}}`);
      return;
    }

    const [err, file] = await tryer(Deno.open(path));
    if (err) {
      const fileMessage: FromWatcherMessage = {
        kind: FromWatcherMessageKind.ErrorReadingFile,
        path,
        error: err.message,
      };
      this.socket.send(JSON.stringify(fileMessage));
      return;
    }

    const startfileMessage: FromWatcherMessage = {
      kind: FromWatcherMessageKind.SendingFileContentsStart,
      path,
      size: file.statSync().size / 1024,
    };
    this.socket.send(JSON.stringify(startfileMessage));

    const reader = file.readable.getReader();
    let result: ReadableStreamReadResult<Uint8Array>;
    do {
      result = await reader.read();
      if (result.value) {
        this.socket.send(result.value);
      }
    } while (result.done === false);

    const endFileMessage: FromWatcherMessage = {
      kind: FromWatcherMessageKind.SendingFileContentsEnd,
      path,
    };
    this.socket.send(JSON.stringify(endFileMessage));

    const watcher = Deno.watchFs(path);

    this.db[path] = {
      path,
      watcher,
      snapshotTimestamp: new Date(),
    };

    for await (const event of watcher) {
      console.log('>>>> event', event);
      // TODO: reload and send the file if/as needed;
    }
  }

  stop(path: string) {
    const file = this.db[path];
    if (!file) {
      console.error(`Tried to stop on a path we are not watching: ${path}}`);
    }
    file.watcher.close();
    delete this.db[path];
  }
}
