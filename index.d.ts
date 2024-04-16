interface Options {
    batchInterval?: number;
}

declare class Idbkv {
  constructor(dbName, options?: Options);
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  destroy(): Promise<void>;
}

export = Idbkv;

