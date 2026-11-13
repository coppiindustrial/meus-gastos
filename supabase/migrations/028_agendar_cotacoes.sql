-- Meus Gastos — 028: o AGENDAMENTO das cotações (13/11/2026, a renda variável).
-- Como aplicar, DEPOIS da 027 e de publicar a função `cotacoes` (Edge Functions):
--   1. Invente um segredo comprido (uma senha qualquer, só para o agendamento) e cadastre-o em DOIS lugares:
--      · Edge Functions → Secrets: COTACOES_SEGREDO = o segredo (junto de BRAPI_TOKEN e FINNHUB_TOKEN);
--      · aqui no SQL Editor, UMA VEZ, sem salvar no repositório:
--          select vault.create_secret('o segredo', 'cotacoes_segredo');
--   2. Cole este arquivo no SQL Editor → Run.
--
-- A cada 15 minutos, de segunda a sexta, das 13h às 21h45 em UTC (10h às 18h45 de Brasília): cobre o pregão da B3 (10h–17h)
-- e o da Nasdaq (9h30–16h de Nova York, 11h30–18h de Brasília no horário de verão de lá). A última leitura depois do fim do
-- pregão fica como o fechamento do dia. O segredo sai do Vault na hora: ele não fica escrito no agendamento.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('cotacoes') where exists (select 1 from cron.job where jobname = 'cotacoes');

select cron.schedule(
  'cotacoes',
  '*/15 13-21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://abofajutoxukbvrfisem.supabase.co/functions/v1/cotacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'cotacoes_segredo')
    ),
    body := '{}'::jsonb
  );
  $$
);
