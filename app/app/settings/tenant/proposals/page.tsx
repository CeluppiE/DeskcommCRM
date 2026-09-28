import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ProposalsSettingsClient } from "./_client";

export default async function ProposalsSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <ProposalsSettingsClient />;
}
