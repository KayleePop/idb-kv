const test = require('muggle-test')
const assert = require('muggle-assert')
const Idbkv = require('./index.js')
const sleep = (delay) => new Promise(resolve => setTimeout(resolve, delay))

// make sure store is empty
async function createCleanStore (storeName, opts) {
  const store = new Idbkv(storeName)
  await store.destroy()
  return new Idbkv(storeName, opts)
}

test('set then get', async () => {
  const store = await createCleanStore('setTest')

  await store.set('key', 'value')
  const value = await store.get('key')
  assert.equal(value, 'value', 'seperate transactions')

  store.set('key2', 'value2')
  const value2 = await store.get('key2')
  assert.equal(value2, 'value2', 'same transaction')

  // cleanup
  await store.destroy()
})

test('get on nonexistant key should return undefined', async () => {
  const store = await createCleanStore('undefinedGetTest')

  const value = await store.get('key')
  assert.equal(value, undefined, 'should be undefined')

  // cleanup
  await store.destroy()
})

test('data should persist to a new instance', async () => {
  let store = await createCleanStore('persistTest')

  await store.set('key', 'value')

  const storeDB = await store.db
  storeDB.close()
  store = null

  // give the garbage collector a chance to clear the previous store's memory
  await sleep(100)

  const store2 = new Idbkv('persistTest')

  const value = await store2.get('key')
  assert.equal(value, 'value')

  // cleanup
  await store2.destroy()
})

test('overwrite a key', async () => {
  const store = await createCleanStore('overwriteTest')

  await store.set('key', 'value')
  await store.set('key', 'overwrite')
  const value = await store.get('key')
  assert.equal(value, 'overwrite', 'different transactions')

  store.set('key2', 'value')
  store.set('key2', 'overwrite')
  const value2 = await store.get('key2')
  assert.equal(value2, 'overwrite', 'same transaction')

  // cleanup
  await store.destroy()
})

test('order should be preserved in batch', async () => {
  const store = await createCleanStore('orderTest')

  store.set('key', 'value')
  const setValue = store.get('key')
  store.set('key', 'overwrite')
  const overwriteValue = store.get('key')
  store.delete('key')
  const deleteValue = store.get('key')

  assert.equal(await setValue, 'value')
  assert.equal(await overwriteValue, 'overwrite')
  assert.equal(await deleteValue, undefined)

  // cleanup
  await store.destroy()
})

test('store an array', async () => {
  const store = await createCleanStore('functionTest')

  store.set('array', [1, 1, 1, 1, 1])
  const array = await store.get('array')
  const sum = array.reduce((sum, curr) => sum + curr)
  assert.equal(sum, 5, 'array should be preserved through set and get')

  // cleanup
  await store.destroy()
})

test('delete a key', async () => {
  const store = await createCleanStore('deleteTest')

  store.set('key', 'value')
  store.delete('key')
  const value = await store.get('key')
  assert.equal(value, undefined)

  // cleanup
  await store.destroy()
})

test('destroy a store', async () => {
  let store = await createCleanStore('destroyTest')

  store.set('key1', 'value1')
  store.set('key2', 'value1')
  store.set('key3', 'value3')
  await store.destroy()
  store = new Idbkv('destroyTest')

  assert.equal(await store.get('key1'), undefined)
  assert.equal(await store.get('key2'), undefined)
  assert.equal(await store.get('key3'), undefined)

  // cleanup
  await store.destroy()
})

test('seperate stores should not interact', async () => {
  const store1 = await createCleanStore('storeInteractionTest1')
  const store2 = await createCleanStore('storeInteractionTest2')

  store1.set('key', 'value1')
  store2.set('key', 'value2')

  const value1 = await store1.get('key')
  assert.equal(value1, 'value1', 'putting to the same key of a different store should not affect this store')

  await store1.delete('key')

  const value2 = await store2.get('key')
  assert.equal(value2, 'value2', 'deleting the same key in a different store should not affect this store')

  // cleanup
  await store1.destroy()
  await store2.destroy()
})

test('destroyed instance should reject new actions', async () => {
  let store = new Idbkv('destroyRejectsNew')

  await store.destroy()

  const reason = new Error('This idb-kv instance has been destroyed')
  await assert.rejects(store.get('key'), reason, 'get should reject')
  await assert.rejects(store.set('key', 'value'), reason, 'set should reject')
  await assert.rejects(store.delete('key'), reason, 'delete should reject')
})

test('destroy() should reject queued actions', async () => {
  let store = new Idbkv('destroyRejectsQueued')

  // wait until the database is opened so the actions actually start executing
  await store.db

  const reason = new Error('This idb-kv instance has been destroyed')
  await Promise.all([
    assert.rejects(store.get('key'), reason, 'get should reject'),
    assert.rejects(store.set('key', 'value'), reason, 'set should reject'),
    assert.rejects(store.delete('key'), reason, 'delete should reject'),
    store.destroy()
  ])
})

// change indexedDB.open to always fail after 100ms
function overwriteIdbOpen () {
  window.indexedDB.open = () => {
    const request = {}
    setTimeout(() => {
      request.error = new Error('idb error')
      request.onerror()
    }, 100)
    return request
  }
}

test('indexedDB failing to open should reject queued actions', async () => {
  const originalOpen = window.indexedDB.open
  overwriteIdbOpen()

  const store = new Idbkv('dbFailRejectsQueued')

  const expectedError =
    new Error('error opening the indexedDB database named dbFailRejectsQueued: Error: idb error')

  // queue all before db fails to open
  await Promise.all([
    assert.rejects(store.get('key'), expectedError, 'get'),
    assert.rejects(store.set('key', 'value'), expectedError, 'set'),
    assert.rejects(store.delete('key'), expectedError, 'delete')
  ])

  // cleanup
  window.indexedDB.open = originalOpen
})

test('indexedDB failing to open should reject subsequent actions', async () => {
  const originalOpen = window.indexedDB.open
  overwriteIdbOpen()

  const store = new Idbkv('dbFailRejectsNew')

  const expectedError =
    new Error('error opening the indexedDB database named dbFailRejectsNew: Error: idb error')

  // wait until db fails
  await assert.rejects(store.db, 'db should fail to open')

  await assert.rejects(store.get('key'), expectedError, 'get')
  await assert.rejects(store.set('key', 'value'), expectedError, 'set')
  await assert.rejects(store.delete('key'), expectedError, 'delete')

  // cleanup
  window.indexedDB.open = originalOpen
})
