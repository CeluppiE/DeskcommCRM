/**
 * Supabase admin client (service role). BYPASSA RLS.
 *
 * REGRA CRÍTICA: handlers que usam este client DEVEM filtrar `organization_id`
 * manualmente, resolvido de fonte confiável (cookie, JWT validado, webhook
 * secret, path token) — NUNCA do request body.
 *
 * Uso permitido:
 *  - Webhook handlers (WAHA, Nuvemshop)
 *  - Cron / workers
 *  - Onboarding / admin operations explícitas
 *  - Health check (read-only)
 *
 * Uso PROIBIDO:
 *  - Qualquer rota acionada por usuário final em fluxo normal
 *  - Substituir auth por conveniência
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

let _admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (_admin) return _admin;

  _admin = createSupabaseClient(
    // #1082: base na URL pública (origem dos links que este client gera) e o
    // endereço interno só no transporte, no `global.fetch` — mesma regra de
    // `lib/supabase/server.ts`.
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: fetchDoServidor(
          urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
          env.NEXT_PUBLIC_SUPABASE_URL,
        ),
        headers: {
          "X-Client-Info": "deskcomm-crm/admin",
        },
      },
    },
  );

  return _admin;
}
