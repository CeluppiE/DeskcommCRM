import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { NewProposalClient, type LeadOption } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova Proposta" };

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams?: Promise<{ lead_id?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeCriar =
    roleAtLeast(activeOrg.role, "agent") &&
    (!user.support ||
      (user.support.status === "active" && user.support.access_mode === "full"));

  if (!podeCriar) {
    redirect("/app/proposals");
  }

  const sp = searchParams ? await searchParams : undefined;
  const preselectedLeadId = sp?.lead_id;

  const supabase = await createClient();

  // Busca os negócios da organização ativa que possuem contato vinculado
  // (crm_proposals.contact_id é NOT NULL na criação da proposta).
  const { data: leadsData } = await supabase
    .from("crm_leads")
    .select(`
      id,
      title,
      contact_id,
      contacts (
        id,
        name,
        display_name,
        phone_number
      )
    `)
    .eq("organization_id", activeOrg.orgId)
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  const leads: LeadOption[] = ((leadsData ?? []) as unknown as Array<{
    id: string;
    title: string | null;
    contact_id: string;
    contacts:
      | {
          id: string;
          name: string | null;
          display_name: string | null;
          phone_number: string | null;
        }
      | Array<{
          id: string;
          name: string | null;
          display_name: string | null;
          phone_number: string | null;
        }>
      | null;
  }>).map((item) => {
    const contact = Array.isArray(item.contacts) ? item.contacts[0] ?? null : item.contacts;
    return {
      id: item.id,
      title: item.title,
      contact_id: item.contact_id,
      contact: contact
        ? {
            id: contact.id,
            name: contact.name,
            display_name: contact.display_name,
            phone_number: contact.phone_number,
          }
        : null,
    };
  });

  return (
    <NewProposalClient
      initialLeads={leads}
      preselectedLeadId={preselectedLeadId}
    />
  );
}
