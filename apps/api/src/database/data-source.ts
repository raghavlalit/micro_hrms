import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options';

// CLI only. The application uses DATABASE_URL via DatabaseModule.
export default new DataSource(databaseOptions(true));
