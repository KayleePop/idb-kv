# Idb-kv

[![Greenkeeper badge](https://badges.greenkeeper.io/KayleePop/idb-kv.svg)](https://greenkeeper.io/) [![Travis badge](https://travis-ci.org/KayleePop/idb-kv.svg?branch=master)](https://travis-ci.org/#) [![standard badge](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![npm](https://img.shields.io/npm/v/idb-kv.svg)](https://www.npmjs.com/package/idb-kv)

## IndexedDB Key Value Store

A tiny and simple API for indexeddb with automatic batching for out of the box performance.

Actions are queued and performed in a batch transaction every 10ms. This improves performance when lots of reads and/or writes are performed quickly.

## Goals

- Simple and small API
- Minimize bundle size
- Good performance
- Fully tested

## Usage

### Install

`$ npm install idb-kv`

### Require

```javascript
let Idbkv = require('idb-kv')

let store = new Idbkv('example-store')

store.set('animals', ['dog', 'cat', 'koala', 'moose', 'chinchilla'])
store.set('pastas', ['spaghetti', 'linguine', 'macaroni', 'fettuccine'])
store.get('animals').then(animals => console.log(animals[2])) // logs "koala"
```

```javascript
// new Session
let Idbkv = require('idb-kv')

let store = new Idbkv('example-store')

store.get('pastas').then(pastas => console.log(pastas[1])) // logs "linguine"
```

## Compatibility

Async functions and ES6 syntax are used, so be sure to transpile and shim if you need to support Internet Explorer.

## Batching

Because actions are queued and executed in a single transaction every 10ms, you only have to listen to a single promise for every set or delete in each synchronous block of code. This simplifies code and also provides a performance benefit by reducing promise overhead.

```javascript
store.set(0, 'first')
store.set(1, 'second')
store.set(2, 'third')
store.set(3, 'fourth')
store.delete(3)
  .then(() => console.log('all 4 sets and delete completed successfully'))
```

The order of actions is maintained when batching.

```javascript
store.delete(0)
store.get(0).then(value => console.log(value)) // logs undefined
store.set(0, 'first')
store.get(0).then(value => console.log(value)) // logs "first"
```

## API

### new Idbkv(dbName, [{batchInterval: 10}])

```javascript
let store = new Idbkv('example-store')

// this store will perform one batched transaction per second
let slowStore = new Idbkv('slow-store', {batchInterval: 1000})
```

Create a new Idbkv store instance using `IndexedDB.open(dbName)` for data. Two instances created with the same name will use the same data store.

`batchInterval` is the number of milliseconds to queue actions before a batch transaction is performed. The default is 10ms.

### _async_ get(key)

#### Read a value from the store

```javascript
store.get('animals').then(animals => console.log(animals[2]))

store.get('nonexistent').then(value => console.log(value)) // logs "undefined"
```

Returns a promise that resolves with the value corresponding to `key`, or rejects due to errors thrown by indexedDB.

If the key doesn't exist in the database, then get() resolves with `undefined`.

### _async_ set(key, value)

#### Write a value to the store

```javascript
store.set('pastas', ['spaghetti', 'linguine', 'macaroni', 'fettuccine'])
store.get('pastas').then(pastas => console.log(pastas[1])) // logs "linguine"
```

Returns a promise that resolves when the data is successfully written to the disk, or rejects on indexedDB errors.

### _async_ delete(key)

#### Remove a value from the store

```javascript
let store = new Idbkv('example-store')
store.set('pastas', ['spaghetti', 'linguine', 'macaroni', 'fettuccine'])
store.delete('pastas')
store.get('pastas').then(value => console.log(value)) // logs "undefined"
```

Returns a promise that resolves when the data is successfully deleted from the disk or rejects on indexedDB errors.

### _async_ close()

#### Tear down the Idbkv instance

```javascript
store.close()
store.get('anyKey').catch(err => console.error(err))
// err.message is "This Idbkv instance is closed"
```

Clears the setInterval() used for batching, closes the indexedDB database, and causes any gets, sets, or deletes performed afterwards to reject.

Resolves after a final batched transaction to drain the queue completes or fails.

If you're creating lots of new unique Idbkv instances, then you should close them when they're no longer needed to free up their memory, but otherwise this method should never be needed as the impact for each instance is negligible, and closing indexedDB databases isn't important.

### _async_ destroy()

#### Delete the database, and tear down the Idbkv instance

```javascript
let store = new Idbkv('example-store')
store.get('color').then(color => console.log(color)) // logs "blue"
await store.destroy()

store = new Idbkv('example-store')
store.get('color').then(color => console.log(color)) // logs "undefined"
```

Calls `store.close()`, then deletes the underlying indexedDB database. This is basically equivalent to calling `store.delete()` on every existing key in the store.

Returns a promise that resolves when the database is successfully deleted or rejects on an error.
