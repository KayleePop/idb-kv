interface Options {
    batchInterval?: number;
}

declare class Idbkv {
  constructor(dbName, options?: Options);
  async get(key: string): Promise<unknown>;
  async set(key: string, value: unknown): Promise<void>;
  async delete(key: string, value: unknown): Promise<void>;
  async destroy(): Promise<void>;
}

export = Idbkv;

