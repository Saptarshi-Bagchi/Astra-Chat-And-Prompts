ALTER TABLE public.messages ADD COLUMN citations jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.messages.citations IS 'Source document citations included with the assistant reply';