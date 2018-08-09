module.exports = class {
  constructor (dbName, { batchInterval = 10 } = {}) {
    this.storeName = 'idb-kv'
    this.batchInterval = batchInterval

    // Promise for the indexeddb DB object
    this.db = new Promise((resolve, reject) => {
      // use global scope to support web workers
      const request = indexedDB.open(dbName, 1) // eslint-disable-line

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        const error = new Error(`error opening the indexedDB database named ${dbName}: ${request.error}`)

        this.closed = true
        this.closedError = error

        // reject queued gets
        for (const action of this._actions) { if (action.reject) action.reject(error) }

        this._actions = null

        reject(error)
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

    // new actions will be cancelled if closed is true
    this.closed = false

    // error used for rejections of new actions when the store is closed
    this.closedError = new Error('This Idbkv instance is closed')

    // promise for the currently pending commit to the database if it exists
    this._commitPromise = null
  }

  async get (key) {
    if (this.closed) throw this.closedError

    return new Promise((resolve, reject) => {
      this._actions.push({
        type: 'get',
        key: key,
        resolve: resolve,
        reject: reject
      })

      this._getOrStartCommit()
    })
  }

  async set (key, value) {
    if (this.closed) throw this.closedError

    this._actions.push({
      type: 'set',
      key: key,
      value: value
    })

    return this._getOrStartCommit()
  }

  async delete (key) {
    if (this.closed) throw this.closedError

    this._actions.push({
      type: 'delete',
      key: key
    })

    return this._getOrStartCommit()
  }

  async close () {
    this.closed = true

    // wait for any queued actions to be committed
    // ignore errors, the final transaction just needs to finish
    try {
      if (this._commitPromise) await this._commitPromise
    } catch (e) {}

    const db = await this.db
    db.close()
  }

  async destroy () {
    await this.close()

    // use global to allow use in web workers
    const request = indexedDB.deleteDatabase((await this.db).name) // eslint-disable-line
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
