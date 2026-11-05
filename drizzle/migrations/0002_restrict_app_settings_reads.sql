DROP POLICY IF EXISTS "Authenticated users read settings" ON public.app_settings;
CREATE POLICY "Owner reads settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  owner_email IS NULL
  OR owner_email = COALESCE(auth.jwt() ->> 'email', '')
);