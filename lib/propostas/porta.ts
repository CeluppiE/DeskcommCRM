/**
 * A porta das rotas de proposta: com a capacidade desligada na organização, a
 * rota não existe para ela — 404, o mesmo desfecho de `seModuloDesligado`
 * (`app/api/v1/external-db/_falha.ts`). Configurações › Propostas NÃO passa
 * por aqui: é onde se liga.
 */
import type { NextResponse } from "next/server";

import { fail, type ApiError } from "@/lib/api/wrappers";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sePropostasDesligadas(
  organizationId: string,
  requestId: string,
): Promise<NextResponse<ApiError> | null> {
  const ligadas = await capacidadesDaOrganizacao(createAdminClient(), organizationId);
  if (ligadas.includes("propostas")) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}
