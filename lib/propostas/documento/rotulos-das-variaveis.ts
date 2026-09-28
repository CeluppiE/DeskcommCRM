/**
 * O nome de cada `{{variável}}` para uma pessoa ler, e onde ela se preenche.
 *
 * A tela e a trava de envio falavam em `project.objective`; quem revisa uma
 * proposta não sabe o que é isso. O teste ao lado VARRE os modelos da
 * plataforma e reprova variável nova sem nome — a lista não envelhece calada.
 */
export const ROTULO_DA_VARIAVEL: Readonly<Record<string, string>> = Object.freeze({
  "approval.date": "Data da aprovação",
  "client.company": "Empresa do cliente",
  "client.company_or_name": "Empresa ou nome do cliente",
  "client.name": "Nome do cliente",
  "commercial_terms.validity_days": "Validade da proposta (dias)",
  "excluded.list": "O que não está incluído",
  "included.list": "O que está incluído",
  "investment.total_formatted": "Investimento total",
  "project.business_context": "Contexto do negócio",
  "project.description": "Descrição da solução",
  "project.name": "Nome do projeto",
  "project.objective": "Objetivo do projeto",
  "project.primary_conversion_action": "Ação principal de conversão",
  "schedule.estimated_days": "Prazo (dias úteis)",
  "scope.actions": "Ações da automação",
  "scope.admin_features": "Recursos administrativos",
  "scope.assumptions": "Premissas",
  "scope.content.client_provided_list": "Materiais fornecidos pelo cliente",
  "scope.content.initial_population": "Cadastro inicial de imóveis",
  "scope.content.provider_provided_list": "Conteúdos produzidos pelo fornecedor",
  "scope.features_conversion_list": "Elementos de conversão",
  "scope.features_list": "Funcionalidades",
  "scope.integrations_list": "Integrações",
  "scope.pages_list": "Lista de páginas",
  "scope.payment_methods": "Meios de pagamento",
  "scope.product_catalog_fields": "Campos do catálogo de produtos",
  "scope.property_filters": "Filtros de busca de imóveis",
  "scope.services_list": "Serviços oferecidos",
  "scope.shipping_rules": "Regras de entrega e frete",
  "scope.triggers": "Gatilhos da automação",
  "scope.user_roles": "Perfis de usuário",
  "scope.workflow": "Fluxo principal da automação",
  "scope.workflows": "Fluxos principais",
});

export function rotuloDaVariavel(caminho: string): string {
  if (Object.hasOwn(ROTULO_DA_VARIAVEL, caminho)) return ROTULO_DA_VARIAVEL[caminho]!;
  const ultimo = caminho.split(".").pop() ?? caminho;
  const texto = ultimo.replace(/_/g, " ").trim();
  return texto.length === 0 ? caminho : texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type OndePreencher = "briefing" | "campo_prazo" | "itens" | "contato" | "sistema";

/**
 * `montarDadosDoDocumento` calcula `client.name`, `client.company_or_name`,
 * `investment`, `schedule` e `commercial_terms` de colunas gravadas; o resto
 * vem do `briefing_json`. Esta função é o espelho daquela, para a tela saber
 * se oferece um campo ou aponta para outro lugar.
 */
export function ondePreencher(caminho: string): OndePreencher {
  if (caminho === "schedule.estimated_days") return "campo_prazo";
  if (caminho === "investment" || caminho.startsWith("investment.")) return "itens";
  if (caminho === "client.name" || caminho === "client.company_or_name") return "contato";
  if (
    caminho === "numero" ||
    caminho === "commercial_terms.validity_days" ||
    caminho === "approval" ||
    caminho.startsWith("approval.")
  ) {
    return "sistema";
  }
  return "briefing";
}
