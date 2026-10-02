declare module 'snowflake-id' {
  export interface SnowflakeIdOptions {
    mid?: number;
    offset?: number;
  }

  export default class SnowflakeId {
    constructor(options?: SnowflakeIdOptions);

    generate(): string;
  }
}
