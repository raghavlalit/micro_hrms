import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database.options';
import { DatabaseRoleGuard } from './database-role.guard';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...databaseOptions(), retryAttempts: 2 }),
    }),
  ],
  providers: [DatabaseRoleGuard],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
