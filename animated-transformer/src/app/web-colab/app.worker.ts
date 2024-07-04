/// <reference lib="webworker" />

import {
  computeMetrics,
  initTransformerTrainState,
  TrainMetrics,
  TransformerTrainState,
} from 'src/lib/trainer/basic_transformer_trainer';
import { mapNonNull } from 'src/lib/rxjs/util';
import { TrainStateConfig, trySgdTrainStep } from 'src/lib/trainer/train_state';
import { stringifyJsonValue } from 'src/lib/pretty_json/pretty_json';
import { DictTree, SimpleJsTreesLib } from 'src/lib/js_tree/js_tree';
import * as tf from '@tensorflow/tfjs';
import {
  prepareBasicTaskTokenRep,
  strSeqPrepFn,
  singleNextTokenIdxOutputPrepFn,
} from 'src/lib/tokens/token_gemb';
import { BasicLmTask, BasicLmTaskUpdate } from 'src/lib/seqtasks/util';
import { GTensor } from 'src/lib/gtensor/gtensor';

// interface Input {}

const onceInputs = new Promise<string>((resolve) => {
  addEventListener('message', ({ data }) => {
    resolve(data);
  });
});

async function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('MyTestDatabase');
    r.onsuccess = () => resolve();
  });
}

async function setupDb(): Promise<IDBDatabase> {
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const data = [
      { id: '444-44-4444', name: 'Bill', age: 35, email: 'bill@company.com' },
      { id: '555-55-5555', name: 'Donna', age: 32, email: 'donna@home.org' },
    ];

    const request = indexedDB.open('MyTestDatabase', 3);
    let db: IDBDatabase;
    request.onerror = (event) => {
      // console.error(`Database error: ${event.target.errorCode}`);
      console.warn(event);
    };
    // This event is only implemented in recent browsers
    request.onupgradeneeded = () => {
      console.log('onupgradeneeded');
      // Save the IDBDatabase interface
      const db = request.result;

      // Create an objectStore for this database
      const objectStore = db.createObjectStore('customers', {
        keyPath: 'id',
      });
      // Use transaction oncomplete to make sure the objectStore creation is
      // finished before adding data into it.
      objectStore.transaction.oncomplete = () => {
        // Store values in the newly created objectStore.
        const customerObjectStore = db
          .transaction('customers', 'readwrite')
          .objectStore('customers');
        data.forEach((customer) => {
          customerObjectStore.add(customer);
        });
        console.log('All done!');
      };

      // Create an index to search customers by name. We may have duplicates
      // so we can't use a unique index.
      objectStore.createIndex('name', 'name', { unique: false });
      // Create an index to search customers by email. We want to ensure that
      // no two customers have the same email, so use a unique index.
      objectStore.createIndex('email', 'email', { unique: true });

      // Create another object store called "names" with the autoIncrement flag set as true.
      const objStore = db.createObjectStore('names', { autoIncrement: true });
      // Because the "names" object store has the key generator, the key for the name value is generated automatically.
      // The added records would be like:
      // key : 1 => value : "Bill"
      // key : 2 => value : "Donna"
      data.forEach((customer) => {
        objStore.add(customer.name);
      });
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('open onsuccess', db);
      // Do something with request.result!
      resolve(db);
      // Open a read/write DB transaction, ready for adding the data
      // const transaction = db.transaction(['toDoList'], 'readwrite');
      // const objectStore = transaction.objectStore('toDoList');

      // Create an objectStore for this database
      // const objectStore = db.createObjectStore('name', { keyPath: 'myKey' });
    };

    // request.transaction?.oncomplete
  });

  return await p;
}

async function run() {
  const inputs = await onceInputs;
  console.log(inputs);

  await deleteDb();

  const db = await setupDb();
  console.log('have db:', db);

  const transaction = db.transaction(['customers']);
  const objectStore = transaction.objectStore('customers');
  transaction.oncomplete = (e) => {
    console.log('transaction done:', e);
  };

  const cursorRequest: IDBRequest<IDBCursorWithValue | null> =
    objectStore.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      console.log(`Name for Id ${cursor.key} is ${cursor.value.name}`);
      cursor.continue();
    } else {
      console.log('No more entries!');
    }
  };

  const t = new GTensor(tf.tensor([1, 2, 3]), ['a']);
  const v = t.contract(t, ['a']).tensor.arraySync() as number;

  postMessage({
    t,
    v,
  });
}

run();
