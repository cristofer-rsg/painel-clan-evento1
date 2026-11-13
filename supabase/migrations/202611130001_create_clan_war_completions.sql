CREATE TABLE IF NOT EXISTS public.clan_war_completions (
    war_key text PRIMARY KEY,
    started_at timestamptz NOT NULL,
    ended_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clan_war_completions ENABLE ROW LEVEL SECURITY;

-- Guerra de 12/11/2026: encerramento confirmado e ataques já sincronizados.
INSERT INTO public.clan_war_completions (war_key, started_at, ended_at)
VALUES (
    '#2GCGP0RQ9:20261112T090651.000Z',
    '2026-11-12T09:06:51Z',
    now()
)
ON CONFLICT (war_key) DO NOTHING;
