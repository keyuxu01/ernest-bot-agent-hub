type Environment = Record<string, unknown>;

function requireString(config: Environment, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} is required`);
  }

  return value;
}

function requirePort(config: Environment, key: string): number {
  const rawValue = requireString(config, key);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(
      `Environment variable ${key} must be an integer between 1 and 65535`,
    );
  }

  return value;
}

/**
 * Validates infrastructure configuration before Nest creates database clients.
 * The returned object also normalizes numeric values for ConfigService.
 */
export function validateEnvironment(config: Environment): Environment {
  const mongoUri = requireString(config, 'MONGO_URI');
  if (!/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
    throw new Error(
      'Environment variable MONGO_URI must use mongodb:// or mongodb+srv://',
    );
  }

  return {
    ...config,
    POSTGRES_HOST: requireString(config, 'POSTGRES_HOST'),
    POSTGRES_PORT: requirePort(config, 'POSTGRES_PORT'),
    POSTGRES_USER: requireString(config, 'POSTGRES_USER'),
    POSTGRES_PASSWORD: requireString(config, 'POSTGRES_PASSWORD'),
    POSTGRES_DB: requireString(config, 'POSTGRES_DB'),
    MONGO_URI: mongoUri,
  };
}
