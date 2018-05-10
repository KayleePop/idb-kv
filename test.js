const test = require('tape-promise/tape')
const Idbkv = require('./index.js')

// make sure store is empty
async function setupStore (storeName, opts) {
  let store = new Idbkv(storeName)
  await store.destroy()
  return new Idbkv(storeName, opts)
}

function sleep (delay) {
  return new Promise((resolve, reject) => setTimeout(resolve, delay))
}

test('set then get', async (t) => {
  let store = await setupStore('setTest')

  await store.set('key', 'value')
  let value = await store.get('key')
  t.equals(value, 'value', 'seperate transactions')

  store.set('key2', 'value2')
  let value2 = await store.get('key2')
  t.equals(value2, 'value2', 'same transaction')
})

test('error on get nonexistent key', async (t) => {
  let store = await setupStore('undefinedGetTest')

  try {
    await store.get('key')
    t.fail('get on nonexistent key should throw error')
  } catch (err) {
    t.equals(err.message, 'Key:key does not exist in db:undefinedGetTest')
  }
})

test('data should persist to a new instance', async (t) => {
  let store = await setupStore('persistTest')

  store.set('key', 'value')
  await store.close()
  store = null
  // give the garbage collector a chance to clear the previous store's memory
  await sleep(100)
  let store2 = new Idbkv('persistTest')

  let value = await store2.get('key')
  t.equals(value, 'value')
})

test('overwrite a key', async (t) => {
  let store = await setupStore('overwriteTest')

  await store.set('key', 'value')
  await store.set('key', 'overwrite')
  let value = await store.get('key')
  t.equals(value, 'overwrite', 'different transactions')

  store.set('key2', 'value')
  store.set('key2', 'overwrite')
  let value2 = await store.get('key2')
  t.equals(value2, 'overwrite', 'same transaction')
})

test('order is preserved in batch', async (t) => {
  let store = await setupStore('orderTest')

  t.plan(3)

  store.set('key', 'value')
  store.get('key')
    .then((value) => t.equals(value, 'value'))
    .catch(err => t.error(err))
  store.set('key', 'overwrite')
  store.get('key')
    .then((value) => t.equals(value, 'overwrite'))
    .catch(err => t.error(err))
  store.delete('key')
  try {
    await store.get('key')
    t.fail('error for nonexistant key should be thrown')
  } catch (err) {
    t.equals(err.message, 'Key:key does not exist in db:orderTest')
  }
})

test('store an array', async (t) => {
  let store = await setupStore('functionTest')

  store.set('array', [1, 1, 1, 1, 1])
  let array = await store.get('array')
  let sum = array.reduce((sum, curr) => sum + curr)
  t.equals(sum, 5, 'array should be preserved through set and get')
})

test('delete a key', async (t) => {
  let store = await setupStore('deleteTest')

  store.set('key', 'value')
  store.delete('key')
  try {
    await store.get('key')
    t.fail('error for nonexistant key should be thrown')
  } catch (err) {
    t.equals(err.message, 'Key:key does not exist in db:deleteTest')
  }
})

test('destroy a store', async (t) => {
  let store = await setupStore('destroyTest')

  store.set('key1', 'value1')
  store.set('key2', 'value1')
  store.set('key3', 'value3')
  await store.destroy()
  store = new Idbkv('destroyTest')

  try {
    await store.get('key1')
    t.fail('error for nonexistant key should be thrown')
  } catch (err) {
    t.equals(err.message, 'Key:key1 does not exist in db:destroyTest')
  }

  try {
    await store.get('key2')
    t.fail('error for nonexistant key should be thrown')
  } catch (err) {
    t.equals(err.message, 'Key:key2 does not exist in db:destroyTest')
  }

  try {
    await store.get('key3')
    t.fail('error for nonexistant key should be thrown')
  } catch (err) {
    t.equals(err.message, 'Key:key3 does not exist in db:destroyTest')
  }
})

test('seperate stores should not interact', async (t) => {
  let store1 = await setupStore('storeInteractionTest1')
  let store2 = await setupStore('storeInteractionTest2')

  store1.set('key', 'value1')
  store2.set('key', 'value2')

  let value1 = await store1.get('key')
  t.equals(value1, 'value1', 'putting to the same key of a different store should not affect this store')

  await store1.delete('key')

  let value2 = await store2.get('key')
  t.equals(value2, 'value2', 'deleting the same key in a different store should not affect this store')
})

test('closed instance rejects new actions', async (t) => {
  let store = await setupStore('closedTest')

  store.close()
  try {
    await store.get('key')
    t.fail('get() on a closed instance should throw error')
  } catch (err) {
    t.equals(err.message, 'This Idbkv instance is closed')
  }
  try {
    await store.set('key', 'value')
    t.fail('set() on a closed instance should throw error')
  } catch (err) {
    t.equals(err.message, 'This Idbkv instance is closed')
  }
  try {
    await store.delete('key')
    t.fail('delete() on a closed instance should throw error')
  } catch (err) {
    t.equals(err.message, 'This Idbkv instance is closed')
  }
})
