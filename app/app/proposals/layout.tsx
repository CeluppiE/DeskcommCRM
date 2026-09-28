/**
 * Com a capacidade "Propostas" desligada na organização, a lista, o editor e a
 * tela de nova proposta não existem para ela — 404, como a tela de módulo
 * desligado (`app/app/integracao-dados/layout.tsx`). Link antigo, favorito e
 * aviso velho da Central caem aqui em vez de numa tela que quebra no primeiro
 * fetch.
 */
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PropostasLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const ligadas = await capacidadesDaOrganizacao(createAdminClient(), activeOrg.orgId);
  if (!ligadas.includes("propostas")) notFound();
  return <>{children}</>;
}
