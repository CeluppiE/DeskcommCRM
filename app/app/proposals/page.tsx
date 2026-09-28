import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";

import { ProposalsClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propostas" };

export default async function ProposalsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeCriar =
    roleAtLeast(activeOrg.role, "agent") &&
    (!user.support ||
      (user.support.status === "active" && user.support.access_mode === "full"));

  return <ProposalsClient key={activeOrg.orgId} podeCriar={podeCriar} />;
}
