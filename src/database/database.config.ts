import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  username: string;
  password: string;
  port: number;
  database: string;
  ssl: boolean;
}

const parseDatabaseUrl = (): Partial<DatabaseConfig> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {};
  }

  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, ''),
    ssl: process.env.POSTGRES_SSL !== 'false',
  };
};

export default registerAs(
  'database',
  (): DatabaseConfig => {
    const databaseUrlConfig = parseDatabaseUrl();
    return {
      host: databaseUrlConfig.host || process.env.POSTGRES_HOST || 'localhost',
      username:
        databaseUrlConfig.username ||
        process.env.POSTGRES_USERNAME ||
        'postgres',
      password:
        databaseUrlConfig.password ||
        process.env.POSTGRES_PASSWORD ||
        'postgres',
      port:
        databaseUrlConfig.port ||
        parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database:
        databaseUrlConfig.database || process.env.POSTGRES_DB || 'gnss_system',
      ssl: databaseUrlConfig.ssl ?? process.env.POSTGRES_SSL === 'true',
    };
  },
);
