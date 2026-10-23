import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifiedUsers1792800000001 implements MigrationInterface {
  name = 'UnifiedUsers1792800000001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query("SELECT set_config('scheduler.timezone',$1,true)", [
      process.env.DEALERSHIP_TIMEZONE ?? 'UTC',
    ]);
    await runner.query(`
      SET LOCAL search_path = public, pg_catalog;
      CREATE TEMP TABLE unify_user_foreign_keys ON COMMIT DROP AS
        SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name,
          r.relname AS target_name,k.conname,pg_get_constraintdef(k.oid) AS definition,a.atttypid<>25 AS needs_text
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_class r ON r.oid=k.confrelid
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1]
        WHERE k.contype='f' AND k.confrelid IN
          (to_regclass('public.users'),to_regclass('public.technicians'),to_regclass('public."user"'));
      DO $merge$
      DECLARE item record;
      BEGIN
        FOR item IN SELECT * FROM unify_user_foreign_keys LOOP
          EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',item.schema_name,item.table_name,item.conname);
        END LOOP;
        ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.users ALTER COLUMN id TYPE text USING id::text;
        ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
        ALTER TABLE public.users ALTER COLUMN name TYPE text;
        ALTER TABLE public.users ALTER COLUMN email TYPE text;
        ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
        ALTER TABLE public.users ALTER COLUMN phone_number DROP NOT NULL;
        ALTER TABLE public.users
          ADD COLUMN role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','technician','admin')),
          ADD COLUMN "emailVerified" boolean NOT NULL DEFAULT false,
          ADD COLUMN image text,
          ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN banned boolean,
          ADD COLUMN "banReason" text,
          ADD COLUMN "banExpires" timestamptz;
        FOR item IN SELECT * FROM unify_user_foreign_keys WHERE needs_text LOOP
          EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE text USING %I::text',item.schema_name,item.table_name,item.column_name,item.column_name);
        END LOOP;
        IF to_regclass('public."user"') IS NOT NULL THEN
          IF EXISTS (SELECT FROM public.users c JOIN public."user" s ON c.id=s.id WHERE c.email IS DISTINCT FROM lower(btrim(s.email))) THEN
            RAISE EXCEPTION 'Customer/staff ID collision requires explicit identity reconciliation';
          END IF;
          CREATE TEMP TABLE unify_staff_users ON COMMIT DROP AS
            SELECT s.*,c.phone_number FROM public."user" s LEFT JOIN public.users c ON c.email=lower(btrim(s.email));
          CREATE TEMP TABLE unify_customer_ids ON COMMIT DROP AS
            SELECT c.id AS old_id,s.id AS new_id FROM public.users c JOIN public."user" s ON c.email=lower(btrim(s.email)) WHERE c.id<>s.id;
          FOR item IN SELECT * FROM unify_user_foreign_keys WHERE target_name='users' LOOP
            EXECUTE format('UPDATE %I.%I r SET %I=m.new_id FROM unify_customer_ids m WHERE r.%I=m.old_id',item.schema_name,item.table_name,item.column_name,item.column_name);
          END LOOP;
          DELETE FROM public.users WHERE id IN (SELECT old_id FROM unify_customer_ids);
          INSERT INTO public.users (id,name,email,phone_number,role,"emailVerified",image,"createdAt","updatedAt",banned,"banReason","banExpires")
            SELECT id,name,lower(btrim(email)),phone_number,coalesce(role,'customer'),"emailVerified",image,"createdAt","updatedAt",banned,"banReason","banExpires" FROM unify_staff_users
            ON CONFLICT (id) DO UPDATE SET name=excluded.name,email=excluded.email,phone_number=coalesce(excluded.phone_number,users.phone_number),role=excluded.role,
              "emailVerified"=excluded."emailVerified",image=excluded.image,"createdAt"=excluded."createdAt","updatedAt"=excluded."updatedAt",banned=excluded.banned,"banReason"=excluded."banReason","banExpires"=excluded."banExpires";
          DROP TABLE public."user";
        END IF;
        IF EXISTS (SELECT FROM public.technicians t JOIN public.users u ON t.id::text=u.id) THEN
          RAISE EXCEPTION 'Technician/user ID collision requires explicit identity reconciliation';
        END IF;
        -- Legacy resource profiles have no verified email or credentials; never invent either.
        INSERT INTO public.users (id,name,role) SELECT id::text,name,'technician' FROM public.technicians;
        DROP TABLE public.technicians;
        FOR item IN SELECT * FROM unify_user_foreign_keys LOOP
          EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',item.schema_name,item.table_name,item.conname,
            regexp_replace(item.definition,'REFERENCES [^(]+','REFERENCES public.users'));
        END LOOP;
      END;
      $merge$;
      NOTIFY pgrst, 'reload schema';
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Identity rollback requires a verified backup and explicit identity reconciliation',
      ),
    );
  }
}
