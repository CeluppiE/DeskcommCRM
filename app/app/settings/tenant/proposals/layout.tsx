import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Doc 79: Propostas é módulo opcional da INSTALAÇÃO, além de capacidade da
 * empresa. Com o módulo desligado em /admin/sistema, Configurações › Propostas
 * e os modelos não existem — para nenhuma empresa. Mesmo desenho de
 * `app/app/integracao-dados/layout.tsx`.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  if (!(await moduloLigado(createAdminClient(), "propostas"))) notFound();
  return <>{children}</>;
}
