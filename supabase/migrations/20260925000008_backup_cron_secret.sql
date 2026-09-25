-- BUGS #68 — only the scheduled job may start a database backup.
--
-- backup-database accepted any valid JWT, and the public anon key is one, so
-- anyone could dump the whole database. The function now also requires an
-- `x-backup-secret` header matching the Vault entry created here, which it
-- reads over its own database connection.
--
-- This half is safe on its own: the function version live before it ignores
-- the extra header. Deploy the function after applying this.
--
-- Rotate: select vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex'))
--         from vault.secrets where name = 'backup_cron_secret';

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'backup_cron_secret',
  'Sent by the "DB Backup to R2" cron job to the backup-database function (BUGS #68)'
)
where not exists (select 1 from vault.secrets where name = 'backup_cron_secret');

-- Add the header to the job's existing request, in place, so the job's other
-- settings (its URL, schedule and Authorization header) stay exactly as they are.
select cron.alter_job(
  j.jobid,
  command := replace(
    j.command,
    'jsonb_build_object(''Content-Type'', ''application/json'',',
    'jsonb_build_object(''x-backup-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''backup_cron_secret''), ''Content-Type'', ''application/json'','
  )
)
from cron.job j
where j.jobname = 'DB Backup to R2'
  and j.command not like '%x-backup-secret%';
