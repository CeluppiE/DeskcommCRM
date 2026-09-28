import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ModelosDeProposta } from "./_client";

export const metadata = { title: "Modelos de proposta" };

export default async function ModelosDePropostaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <ModelosDeProposta />;
}
