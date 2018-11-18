module.exports = class Idbkv {
  constructor (dbName, { batchInterval = 10 } = {}) {
    this.storeName = 'idb-kv'
    this.batchInterval = batchInterval

    // Promise for the indexeddb DB object
    this.db = new Promise((resolve, reject) => {
      // use global scope to support web workers
      const request = indexedDB.open(dbName, 1) // eslint-disable-line

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        reject(new Error(`error opening the indexedDB database named ${dbName}: ${request.error}`))
      }

      // if db doesn't already exist
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName)
    })

    this._actions = []
    // ^^ A list of pending actions for the next batch transaction
    // {
    //   type: (set, get, or delete)
    //   key:
    //   value:
    //   resolve: (resolve get() promise)
    //   reject: (reject get() promise)
    // }

    // promise for the currently pending commit to the database if it exists
    this._commitPromise = null
  }

  async get (key) {
    const getPromise = new Promise((resolve, reject) => {
      this._actions.push({
        type: 'get',
        key: key,
        resolve: resolve,
        reject: reject
      })
    })

    // reject if the commit fails before the get succeeds
    // to prevent hanging on a failed DB open or other transaction errors
    await Promise.race([getPromise, this._getOrStartCommit()])

    return getPromise
  }

  async set (key, value) {
    this._actions.push({
      type: 'set',
      key: key,
      value: value
    })

    return this._getOrStartCommit()
  }

  async delete (key) {
    this._actions.push({
      type: 'delete',
      key: key
    })

    return this._getOrStartCommit()
  }

  async destroy () {
    const db = await this.db

    // the onsuccess event will only be called after the DB closes
    db.close()

    // use global to allow use in web workers
    const request = indexedDB.deleteDatabase(db.name) // eslint-disable-line
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // return the pending commit or a new one if none exists
  _getOrStartCommit () {
    if (!this._commitPromise) this._commitPromise = this._commit()
    return this._commitPromise
  }

  // wait for the batchInterval, then commit the queued actions to the database
  async _commit () {
    // wait batchInterval milliseconds for more actions
    await new Promise(resolve => setTimeout(resolve, this.batchInterval))

    // the first queue lasts until the db is opened
    const db = await this.db

    const transaction = db.transaction(this.storeName, 'readwrite')
    const store = transaction.objectStore(this.storeName)

    for (const action of this._actions) {
      switch (action.type) {
        case 'get':
          const request = store.get(action.key)
          request.onsuccess = () => action.resolve(request.result)
          request.onerror = () => action.reject(request.error)
          break
        case 'set':
          store.put(action.value, action.key)
          break
        case 'delete':
          store.delete(action.key)
          break
      }
    }

    // empty queue
    this._actions = []
    this._commitPromise = null

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()

      transaction.onerror = transaction.onabort = (error) => {
        // onabort uses an argument to pass the error, but onerror uses transaction.error
        reject(transaction.error || error)
      }
    })
  }
}
