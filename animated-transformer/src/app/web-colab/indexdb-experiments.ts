export async function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('MyTestDatabase');
    r.onsuccess = () => resolve();
  });
}

export async function setupDb(): Promise<IDBDatabase> {
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
      reject(event);
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

export async function listStuff(): Promise<void> {
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
}
