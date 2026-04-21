import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  username: string;
  password: string;
  port: number;
  database: string;
  ssl: boolean;
}

export default registerAs(
  'database',
  (): DatabaseConfig => ({
    host: process.env.POSTGRES_HOST || 'localhost',
    username: process.env.POSTGRES_USERNAME || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'gnss_system',
    ssl: process.env.POSTGRES_SSL === 'true',
  }),
);
