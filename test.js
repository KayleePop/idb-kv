const test = require('muggle-test')
const assert = require('muggle-assert')
const Idbkv = require('./index.js')
const sleep = (delay) => new Promise(resolve => setTimeout(resolve, delay))

// make sure store is empty
async function createCleanStore (storeName, opts) {
  let store = new Idbkv(storeName)
  await store.destroy()
  return new Idbkv(storeName, opts)
}

test('set then get', async () => {
  let store = await createCleanStore('setTest')

  await store.set('key', 'value')
  let value = await store.get('key')
  assert.equal(value, 'value', 'seperate transactions')

  store.set('key2', 'value2')
  let value2 = await store.get('key2')
  assert.equal(value2, 'value2', 'same transaction')
})

test('get nonexistent key', async () => {
  let store = await createCleanStore('undefinedGetTest')

  let value = await store.get('key')
  assert.equal(value, undefined, 'should be undefined')
})

test('data should persist to a new instance', async () => {
  let store = await createCleanStore('persistTest')

  await store.set('key', 'value')
  await store.close()
  store = null
  // give the garbage collector a chance to clear the previous store's memory
  await sleep(100)
  let store2 = new Idbkv('persistTest')

  let value = await store2.get('key')
  assert.equal(value, 'value')
})

test('overwrite a key', async () => {
  let store = await createCleanStore('overwriteTest')

  await store.set('key', 'value')
  await store.set('key', 'overwrite')
  let value = await store.get('key')
  assert.equal(value, 'overwrite', 'different transactions')

  store.set('key2', 'value')
  store.set('key2', 'overwrite')
  let value2 = await store.get('key2')
  assert.equal(value2, 'overwrite', 'same transaction')
})

test('order is preserved in batch', async () => {
  let store = await createCleanStore('orderTest')

  store.set('key', 'value')
  const setValue = store.get('key')
  store.set('key', 'overwrite')
  const overwriteValue = store.get('key')
  store.delete('key')
  const deleteValue = store.get('key')

  assert.equal(await setValue, 'value')
  assert.equal(await overwriteValue, 'overwrite')
  assert.equal(await deleteValue, undefined)
})

test('store an array', async () => {
  let store = await createCleanStore('functionTest')

  store.set('array', [1, 1, 1, 1, 1])
  let array = await store.get('array')
  let sum = array.reduce((sum, curr) => sum + curr)
  assert.equal(sum, 5, 'array should be preserved through set and get')
})

test('delete a key', async () => {
  let store = await createCleanStore('deleteTest')

  store.set('key', 'value')
  store.delete('key')
  let value = await store.get('key')
  assert.equal(value, undefined)
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
})

test('seperate stores should not interact', async () => {
  let store1 = await createCleanStore('storeInteractionTest1')
  let store2 = await createCleanStore('storeInteractionTest2')

  store1.set('key', 'value1')
  store2.set('key', 'value2')

  let value1 = await store1.get('key')
  assert.equal(value1, 'value1', 'putting to the same key of a different store should not affect this store')

  await store1.delete('key')

  let value2 = await store2.get('key')
  assert.equal(value2, 'value2', 'deleting the same key in a different store should not affect this store')
})

test('closed instance rejects new actions', async () => {
  let store = await createCleanStore('closedErrorTest')

  store.close()

  const closedError = new Error('This Idbkv instance is closed')
  await assert.rejects(store.get('key'), closedError, 'get should reject')
  await assert.rejects(store.set('key', 'value'), closedError, 'set should reject')
  await assert.rejects(store.delete('key'), closedError, 'delete should reject')
})

test('close() waits for queued actions', async () => {
  let store = await createCleanStore('closedDrainTest')

  store.set('key', 'value')
  await store.close()
  store = new Idbkv('closedDrainTest')

  let value = await store.get('key')
  assert.equal(value, 'value')
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

test('indexedDB failing to open rejects queued actions', async () => {
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

  window.indexedDB.open = originalOpen
})

test('indexedDB failing to open rejects new actions', async () => {
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

  window.indexedDB.open = originalOpen
})
