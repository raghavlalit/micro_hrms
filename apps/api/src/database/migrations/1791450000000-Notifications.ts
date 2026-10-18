import { MigrationInterface, QueryRunner } from 'typeorm';
export class Notifications1791450000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`ALTER TABLE outbox_events
      ADD COLUMN delivery_status varchar(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN last_error_code text,
      ADD COLUMN encrypted_secret text,
      ADD CONSTRAINT ck_notification_delivery_status CHECK (delivery_status IN ('pending','sent','skipped','failed'))`);
    await runner.query(`CREATE INDEX ix_notification_dispatch ON outbox_events(available_at, id)
      WHERE event_type = 'notification.email' AND delivery_status = 'pending' AND processed_at IS NULL`);
    // Narrow worker discovery: references only, never tenant records, email addresses
    // or invitation credentials. Ordinary business reads still use tenant RLS.
    // FORCE RLS also affects a non-superuser table/view owner. Give only that
    // trusted migration owner the reads needed by this owner-executed view.
    await runner.query(`DO $$ BEGIN
      EXECUTE format('CREATE POLICY notification_dispatch_owner ON outbox_events FOR SELECT TO %I USING (event_type = ''notification.email'')', current_user);
      EXECUTE format('CREATE POLICY notification_dispatch_owner ON tenants FOR SELECT TO %I USING (true)', current_user);
    END $$`);
    await runner.query(`CREATE VIEW notification_dispatch_candidates WITH (security_barrier=true) AS
      SELECT event.id, event.tenant_id, event.available_at FROM outbox_events event
      JOIN tenants tenant ON tenant.id=event.tenant_id
      WHERE event.event_type='notification.email' AND event.delivery_status='pending'
        AND event.processed_at IS NULL AND event.available_at <= now()
        AND tenant.status IN ('active','trial') AND tenant.archived_at IS NULL`);
    await runner.query(
      'REVOKE ALL ON notification_dispatch_candidates FROM PUBLIC',
    );
    await runner.query(
      'GRANT SELECT ON notification_dispatch_candidates TO microhrms_app',
    );
  }
  async down(runner: QueryRunner) {
    await runner.query('DROP VIEW notification_dispatch_candidates');
    await runner.query(
      'DROP POLICY notification_dispatch_owner ON outbox_events',
    );
    await runner.query('DROP POLICY notification_dispatch_owner ON tenants');
    await runner.query('DROP INDEX ix_notification_dispatch');
    await runner.query(
      'ALTER TABLE outbox_events DROP CONSTRAINT ck_notification_delivery_status, DROP COLUMN encrypted_secret, DROP COLUMN last_error_code, DROP COLUMN delivery_status',
    );
  }
}
