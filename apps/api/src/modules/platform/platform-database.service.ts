import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { credentialHash } from '../auth/password';

@Injectable()
export class PlatformDatabaseService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async withSession<T>(
    token: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      // Transaction-local security context; never accept a platform ID from the request body.
      await manager.query(
        "SELECT set_config('app.platform_session_hash', $1, true)",
        [credentialHash(token)],
      );
      const [session]: { allowed: boolean }[] = await manager.query(
        'SELECT public.platform_session_valid() AS allowed',
      );
      if (!session.allowed)
        throw new ForbiddenException('Platform session is no longer valid');
      return work(manager);
    });
  }
}
