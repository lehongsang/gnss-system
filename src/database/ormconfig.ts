import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;

export default new DataSource({
  type: 'postgres',
  host: databaseUrl?.hostname || process.env.POSTGRES_HOST || 'localhost',
  port: databaseUrl?.port
    ? Number(databaseUrl.port)
    : parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: databaseUrl
    ? decodeURIComponent(databaseUrl.username)
    : process.env.POSTGRES_USERNAME || 'postgres',
  password: databaseUrl
    ? decodeURIComponent(databaseUrl.password)
    : process.env.POSTGRES_PASSWORD || 'postgres',
  database: databaseUrl
    ? databaseUrl.pathname.replace(/^\//, '')
    : process.env.POSTGRES_DB || 'gnss_system',
  ssl: databaseUrl ? process.env.POSTGRES_SSL !== 'false' : process.env.POSTGRES_SSL === 'true',
  entities: [path.join(__dirname, '/../**/**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '/migrations/**/*{.ts,.js}')],
  synchronize: false,
});
