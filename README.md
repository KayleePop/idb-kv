# Idb-kv

[![Greenkeeper badge](https://badges.greenkeeper.io/KayleePop/idb-kv.svg)](https://greenkeeper.io/) [![Travis badge](https://travis-ci.org/KayleePop/idb-kv.svg?branch=master)](https://travis-ci.org/KayleePop/idb-kv) [![standard badge](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![npm](https://img.shields.io/npm/v/idb-kv.svg)](https://www.npmjs.com/package/idb-kv)

## IndexedDB Key Value Store

A tiny and simple API for IndexedDB with automatic batching for out of the box performance.

All operations called within a 10ms interval are queued and executed in a single batch transaction. This improves performance when lots of reads and/or writes are performed quickly.

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

let store = new Idbkv('example-store') // using the same name loads previous data

store.get('pastas').then(pastas => console.log(pastas[1])) // logs "linguine"
```

## Batching

Because actions are batched, you only have to listen to a single promise for every set or delete in a synchronous block of code because they all share a common promise that indicates the success or failure of the entire batch transaction.

This may provide a performance benefit with a large number of writes by eliminating promise handler overhead.

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

// this store will gather actions for 1000ms before executing a transaction
let slowStore = new Idbkv('slow-store', {batchInterval: 1000})
```

Create a new Idbkv store instance using `indexedDB.open(dbName)` for data. Two instances created with the same name will use the same data store.

`batchInterval` is the number of milliseconds to wait for more actions before a batch transaction is performed. The default is 10ms. Higher values improve batching, but also increase the delay for actions to complete including get().

### _async_ get(key)

#### Read a value from the store

```javascript
store.get('animals').then(animals => console.log(animals[2]))

store.get('nonexistent').then(value => console.log(value)) // logs "undefined"
```

Returns a promise that resolves with the value corresponding to `key`, or rejects due to errors thrown by IndexedDB.

If the key doesn't exist in the database, then get() resolves with `undefined`.

### _async_ set(key, value)

#### Write a value to the store

```javascript
store.set('pastas', ['spaghetti', 'linguine', 'macaroni', 'fettuccine'])
store.get('pastas').then(pastas => console.log(pastas[1])) // logs "linguine"
```

Returns a promise that resolves when the data is successfully written to the disk, or rejects on IndexedDB errors.

### _async_ delete(key)

#### Remove a value from the store

```javascript
let store = new Idbkv('example-store')
store.set('pastas', ['spaghetti', 'linguine', 'macaroni', 'fettuccine'])
store.delete('pastas')
store.get('pastas').then(value => console.log(value)) // logs "undefined"
```

Returns a promise that resolves with the data from the store or rejects on IndexedDB errors.

### _async_ destroy()

#### Delete the database, and tear down the Idbkv instance

```javascript
let store = new Idbkv('example-store')
store.get('color').then(color => console.log(color)) // logs "blue"
await store.destroy()

store = new Idbkv('example-store')
store.get('color').then(color => console.log(color)) // logs "undefined"
```

Closes and then deletes the underlying IndexedDB database. This is basically equivalent to calling `store.delete()` on every existing key in the store.

Returns a promise that resolves when the database is successfully deleted or rejects on an error.
