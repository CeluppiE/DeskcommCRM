import type { ModeloBase } from "./tipos";

/**
 * A base da plataforma mora AQUI, no código — nunca no banco com
 * organization_id nulo (spec-mãe §6.1). `proposal_templates` só guarda cópias
 * por organização; quem nunca personalizou usa o que está neste objeto.
 *
 * Os 8 modelos-piloto de web design (institucional, landing page, e-commerce,
 * catálogo imobiliário, site profissional, sistema web, automação, projeto
 * personalizado) chegaram como um pacote de modelos entregue pelo dono em
 * 25/09/2026 e foram convertidos aqui por script — os 8 slugs, a ordem de seção
 * de cada um e o total de seções (159 no total) conferem com os arquivos
 * `template.json` de origem. `titleEs`/`bodyEs` ficam `null`: a
 * arquitetura bilíngue já existe (i18n pronta desde a M0/M2), o conteúdo em
 * espanhol é onda futura (spec §9 — decisão do dono, conteúdo depois).
 */
export const MODELOS_BASE: Readonly<Record<string, ModeloBase>> = Object.freeze(
{
  "site_institucional": {
    "slug": "site_institucional",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos do projeto",
        "titleEs": null,
        "body": "O projeto tem como objetivo {{project.objective}}. A solução será estruturada de acordo com o público e os objetivos comerciais definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "structure",
        "title": "Estrutura do site",
        "titleEs": null,
        "body": "O site contemplará: {{scope.pages_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "content",
        "title": "Conteúdo",
        "titleEs": null,
        "body": "Materiais do cliente: {{scope.content.client_provided_list}}. Conteúdos do fornecedor: {{scope.content.provider_provided_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "design",
        "title": "Design e experiência",
        "titleEs": null,
        "body": "A interface será desenvolvida de forma personalizada, considerando identidade visual, hierarquia, legibilidade, navegação e experiência em diferentes dispositivos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsive",
        "title": "Responsividade",
        "titleEs": null,
        "body": "O projeto será desenvolvido para computadores, notebooks, tablets e smartphones.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "development",
        "title": "Desenvolvimento",
        "titleEs": null,
        "body": "O projeto será implementado com tecnologia adequada ao escopo e testado antes da publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "Integrações previstas: {{scope.integrations_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "seo",
        "title": "SEO",
        "titleEs": null,
        "body": "Será aplicada estrutura técnica inicial favorável aos mecanismos de busca. Isso não representa garantia de posicionamento, tráfego ou quantidade de leads.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsibilities",
        "title": "Responsabilidades do cliente",
        "titleEs": null,
        "body": "O cliente deverá fornecer materiais, informações, acessos e aprovações. Atrasos podem alterar o cronograma.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "objectives",
      "structure",
      "content",
      "design",
      "responsive",
      "development",
      "integrations",
      "seo",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "responsibilities",
      "support",
      "terms",
      "approval"
    ]
  },
  "landing_page": {
    "slug": "landing_page",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objective",
        "title": "Objetivo e conversão",
        "titleEs": null,
        "body": "A página será planejada para {{project.objective}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "strategy",
        "title": "Estratégia",
        "titleEs": null,
        "body": "A estrutura conduzirá o visitante até {{project.primary_conversion_action}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "structure",
        "title": "Estrutura",
        "titleEs": null,
        "body": "A página poderá contemplar hero, benefícios, prova social, oferta, FAQ e CTA conforme o briefing.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "copy",
        "title": "Conteúdo e copy",
        "titleEs": null,
        "body": "Conteúdo do cliente: {{scope.content.client_provided_list}}. Conteúdo do fornecedor: {{scope.content.provider_provided_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "design",
        "title": "Design e experiência",
        "titleEs": null,
        "body": "A interface será desenvolvida de forma personalizada, considerando identidade visual, hierarquia, legibilidade, navegação e experiência em diferentes dispositivos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsive",
        "title": "Responsividade",
        "titleEs": null,
        "body": "O projeto será desenvolvido para computadores, notebooks, tablets e smartphones.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "seo",
        "title": "SEO",
        "titleEs": null,
        "body": "Será aplicada estrutura técnica inicial favorável aos mecanismos de busca. Isso não representa garantia de posicionamento, tráfego ou quantidade de leads.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "conversion",
        "title": "Conversão",
        "titleEs": null,
        "body": "Elementos de conversão: {{scope.features_conversion_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "tracking",
        "title": "Mensuração",
        "titleEs": null,
        "body": "Quando previsto, serão configurados recursos de mensuração.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "objective",
      "strategy",
      "structure",
      "copy",
      "design",
      "responsive",
      "seo",
      "conversion",
      "tracking",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "support",
      "terms",
      "approval"
    ]
  },
  "ecommerce": {
    "slug": "ecommerce",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos do projeto",
        "titleEs": null,
        "body": "O projeto tem como objetivo {{project.objective}}. A solução será estruturada de acordo com o público e os objetivos comerciais definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "store_structure",
        "title": "Estrutura da loja",
        "titleEs": null,
        "body": "Categorias e páginas: {{scope.pages_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "catalog",
        "title": "Catálogo",
        "titleEs": null,
        "body": "Campos e recursos de produtos: {{scope.product_catalog_fields}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "cart_checkout",
        "title": "Carrinho e checkout",
        "titleEs": null,
        "body": "O fluxo contemplará carrinho e checkout conforme a plataforma escolhida.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "payments",
        "title": "Pagamentos",
        "titleEs": null,
        "body": "Meios de pagamento: {{scope.payment_methods}}. Taxas das operadoras são do cliente.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "shipping",
        "title": "Entrega e frete",
        "titleEs": null,
        "body": "Regras: {{scope.shipping_rules}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "admin",
        "title": "Gestão",
        "titleEs": null,
        "body": "A gestão seguirá os recursos da plataforma adotada.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "{{scope.integrations_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "seo",
        "title": "SEO",
        "titleEs": null,
        "body": "Será aplicada estrutura técnica inicial favorável aos mecanismos de busca. Isso não representa garantia de posicionamento, tráfego ou quantidade de leads.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsive",
        "title": "Responsividade",
        "titleEs": null,
        "body": "O projeto será desenvolvido para computadores, notebooks, tablets e smartphones.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "security",
        "title": "Segurança",
        "titleEs": null,
        "body": "Serão aplicadas as práticas de segurança disponíveis na tecnologia escolhida.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "third_party_costs",
        "title": "Custos de terceiros",
        "titleEs": null,
        "body": "Plataforma, gateway, plugins, frete e serviços externos podem ter custos separados.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "objectives",
      "store_structure",
      "catalog",
      "cart_checkout",
      "payments",
      "shipping",
      "admin",
      "integrations",
      "seo",
      "responsive",
      "security",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "third_party_costs",
      "support",
      "terms",
      "approval"
    ]
  },
  "catalogo_imobiliario": {
    "slug": "catalogo_imobiliario",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos",
        "titleEs": null,
        "body": "Criar presença digital profissional, facilitar busca e apresentação de imóveis e gerar contatos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "site_structure",
        "title": "Estrutura",
        "titleEs": null,
        "body": "Home, catálogo, imóvel individual, institucional e contato, conforme {{scope.pages_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "property_catalog",
        "title": "Catálogo de imóveis",
        "titleEs": null,
        "body": "Cada imóvel poderá apresentar título, código, finalidade, preço, localização, área, quartos, suítes, banheiros, vagas, fotos, descrição e características.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "filters",
        "title": "Busca e filtros",
        "titleEs": null,
        "body": "Filtros: {{scope.property_filters}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "property_detail",
        "title": "Página do imóvel",
        "titleEs": null,
        "body": "Cada imóvel poderá ter página própria com galeria, dados, localização e contato.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "admin_panel",
        "title": "Painel administrativo",
        "titleEs": null,
        "body": "Quando incluído, permitirá cadastrar, editar, publicar e organizar imóveis.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "whatsapp",
        "title": "WhatsApp",
        "titleEs": null,
        "body": "Quando incluído, o visitante poderá iniciar contato relacionado ao imóvel.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "{{scope.integrations_list}}. Integrações com portais ou CRMs só entram quando expressamente previstas.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "content",
        "title": "Cadastro inicial",
        "titleEs": null,
        "body": "Cadastro inicial: {{scope.content.initial_population}}. Dados fornecidos: {{scope.content.client_provided_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "seo",
        "title": "SEO",
        "titleEs": null,
        "body": "Será aplicada estrutura técnica inicial favorável aos mecanismos de busca. Isso não representa garantia de posicionamento, tráfego ou quantidade de leads.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsive",
        "title": "Responsividade",
        "titleEs": null,
        "body": "O projeto será desenvolvido para computadores, notebooks, tablets e smartphones.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsibilities",
        "title": "Responsabilidades",
        "titleEs": null,
        "body": "A imobiliária fornecerá dados, fotos, informações comerciais, identidade visual e acessos. A atualização dos dados depende da imobiliária.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "objectives",
      "site_structure",
      "property_catalog",
      "filters",
      "property_detail",
      "admin_panel",
      "whatsapp",
      "integrations",
      "content",
      "seo",
      "responsive",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "responsibilities",
      "support",
      "terms",
      "approval"
    ]
  },
  "site_profissional": {
    "slug": "site_profissional",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos",
        "titleEs": null,
        "body": "Apresentar o profissional, serviços, diferenciais e facilitar contato.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "professional_presentation",
        "title": "Apresentação",
        "titleEs": null,
        "body": "Serão apresentados trajetória, experiência, formação e informações fornecidas.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "services",
        "title": "Serviços",
        "titleEs": null,
        "body": "Serviços/especialidades: {{scope.services_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "authority",
        "title": "Credibilidade",
        "titleEs": null,
        "body": "Podem ser apresentados formação, certificações, experiência e diferenciais.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "testimonials",
        "title": "Depoimentos",
        "titleEs": null,
        "body": "Depoimentos autorizados poderão ser apresentados.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "contact",
        "title": "Contato",
        "titleEs": null,
        "body": "Canais: {{scope.integrations_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "localization",
        "title": "Localização",
        "titleEs": null,
        "body": "Quando aplicável, endereço, mapa e regiões atendidas.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "design",
        "title": "Design e experiência",
        "titleEs": null,
        "body": "A interface será desenvolvida de forma personalizada, considerando identidade visual, hierarquia, legibilidade, navegação e experiência em diferentes dispositivos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsive",
        "title": "Responsividade",
        "titleEs": null,
        "body": "O projeto será desenvolvido para computadores, notebooks, tablets e smartphones.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "seo",
        "title": "SEO",
        "titleEs": null,
        "body": "Será aplicada estrutura técnica inicial favorável aos mecanismos de busca. Isso não representa garantia de posicionamento, tráfego ou quantidade de leads.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "content",
        "title": "Conteúdo",
        "titleEs": null,
        "body": "Cliente: {{scope.content.client_provided_list}}. Fornecedor: {{scope.content.provider_provided_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsibilities",
        "title": "Responsabilidades do cliente",
        "titleEs": null,
        "body": "O cliente deverá fornecer materiais, informações, acessos e aprovações. Atrasos podem alterar o cronograma.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "objectives",
      "professional_presentation",
      "services",
      "authority",
      "testimonials",
      "contact",
      "localization",
      "design",
      "responsive",
      "seo",
      "content",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "responsibilities",
      "support",
      "terms",
      "approval"
    ]
  },
  "sistema_web": {
    "slug": "sistema_web",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "problem",
        "title": "Contexto",
        "titleEs": null,
        "body": "Necessidade: {{project.business_context}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos",
        "titleEs": null,
        "body": "O projeto tem como objetivo {{project.objective}}. A solução será estruturada de acordo com o público e os objetivos comerciais definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "functional_scope",
        "title": "Escopo funcional",
        "titleEs": null,
        "body": "Funcionalidades: {{scope.features_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "users_roles",
        "title": "Usuários e permissões",
        "titleEs": null,
        "body": "Perfis: {{scope.user_roles}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "workflows",
        "title": "Fluxos",
        "titleEs": null,
        "body": "Fluxos principais: {{scope.workflows}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "admin",
        "title": "Área administrativa",
        "titleEs": null,
        "body": "Recursos administrativos: {{scope.admin_features}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "{{scope.integrations_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "security",
        "title": "Segurança",
        "titleEs": null,
        "body": "Serão aplicadas práticas compatíveis com a arquitetura escolhida.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "architecture",
        "title": "Arquitetura",
        "titleEs": null,
        "body": "A arquitetura será definida conforme os requisitos aprovados.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "testing",
        "title": "Testes",
        "titleEs": null,
        "body": "Serão testadas funcionalidades, fluxos e integrações incluídas.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "deployment",
        "title": "Publicação",
        "titleEs": null,
        "body": "A publicação ocorrerá no ambiente definido, com infraestrutura disponível.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "problem",
      "objectives",
      "functional_scope",
      "users_roles",
      "workflows",
      "admin",
      "integrations",
      "security",
      "architecture",
      "testing",
      "deployment",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "support",
      "terms",
      "approval"
    ]
  },
  "automacao": {
    "slug": "automacao",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "problem",
        "title": "Contexto",
        "titleEs": null,
        "body": "A automação tratará {{project.business_context}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos",
        "titleEs": null,
        "body": "O projeto tem como objetivo {{project.objective}}. A solução será estruturada de acordo com o público e os objetivos comerciais definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "workflow",
        "title": "Fluxo",
        "titleEs": null,
        "body": "Fluxo principal: {{scope.workflow}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "triggers",
        "title": "Gatilhos",
        "titleEs": null,
        "body": "{{scope.triggers}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "actions",
        "title": "Ações",
        "titleEs": null,
        "body": "{{scope.actions}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "{{scope.integrations_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "exceptions",
        "title": "Exceções",
        "titleEs": null,
        "body": "Serão considerados os cenários identificados no briefing.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "monitoring",
        "title": "Monitoramento",
        "titleEs": null,
        "body": "Quando previsto, haverá acompanhamento das execuções.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "testing",
        "title": "Testes",
        "titleEs": null,
        "body": "A automação será testada nos cenários definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "maintenance",
        "title": "Manutenção",
        "titleEs": null,
        "body": "Manutenção contínua e alterações futuras serão contratadas separadamente salvo indicação expressa.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "third_party",
        "title": "Terceiros",
        "titleEs": null,
        "body": "APIs, plataformas e serviços externos podem ter limites e custos próprios.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "problem",
      "objectives",
      "workflow",
      "triggers",
      "actions",
      "integrations",
      "exceptions",
      "monitoring",
      "testing",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "maintenance",
      "third_party",
      "support",
      "terms",
      "approval"
    ]
  },
  "projeto_personalizado": {
    "slug": "projeto_personalizado",
    "version": 1,
    "sections": [
      {
        "id": "summary",
        "title": "Resumo da proposta",
        "titleEs": null,
        "body": "Esta proposta apresenta o planejamento, design e desenvolvimento do projeto {{project.name}} para {{client.company_or_name}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "context",
        "title": "Contexto",
        "titleEs": null,
        "body": "Contexto: {{project.business_context}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "objectives",
        "title": "Objetivos",
        "titleEs": null,
        "body": "O projeto tem como objetivo {{project.objective}}. A solução será estruturada de acordo com o público e os objetivos comerciais definidos.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "solution",
        "title": "Solução",
        "titleEs": null,
        "body": "A solução proposta consiste em {{project.description}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "functional_scope",
        "title": "Escopo funcional",
        "titleEs": null,
        "body": "{{scope.features_list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "technical_scope",
        "title": "Escopo técnico",
        "titleEs": null,
        "body": "O escopo técnico contempla os componentes necessários para entregar as funcionalidades aprovadas.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "integrations",
        "title": "Integrações",
        "titleEs": null,
        "body": "{{scope.integrations_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "assumptions",
        "title": "Premissas",
        "titleEs": null,
        "body": "{{scope.assumptions}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "limitations",
        "title": "Limitações",
        "titleEs": null,
        "body": "{{excluded.list}}.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "content",
        "title": "Materiais",
        "titleEs": null,
        "body": "Materiais do cliente: {{scope.content.client_provided_list}}.",
        "bodyEs": null,
        "required": false,
        "conditional": true
      },
      {
        "id": "testing",
        "title": "Testes",
        "titleEs": null,
        "body": "Serão realizados testes compatíveis com o escopo.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "process",
        "title": "Etapas do projeto",
        "titleEs": null,
        "body": "O projeto seguirá briefing e planejamento, arquitetura, design, desenvolvimento, configuração, testes, ajustes e publicação.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "schedule",
        "title": "Prazo",
        "titleEs": null,
        "body": "O prazo estimado é de {{schedule.estimated_days}} dias úteis, condicionado à aprovação, pagamento inicial quando aplicável e recebimento dos materiais necessários.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "investment",
        "title": "Investimento",
        "titleEs": null,
        "body": "O investimento total para o escopo é de {{investment.total_formatted}}. As condições de pagamento estão na seção comercial.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "included",
        "title": "O que está incluído",
        "titleEs": null,
        "body": "{{included.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "excluded",
        "title": "O que não está incluído",
        "titleEs": null,
        "body": "{{excluded.list}}",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "responsibilities",
        "title": "Responsabilidades do cliente",
        "titleEs": null,
        "body": "O cliente deverá fornecer materiais, informações, acessos e aprovações. Atrasos podem alterar o cronograma.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "support",
        "title": "Garantia e suporte",
        "titleEs": null,
        "body": "Correções diretamente relacionadas ao desenvolvimento serão avaliadas dentro da garantia definida. Novas funcionalidades, alterações de escopo e problemas de terceiros não fazem parte da garantia.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "terms",
        "title": "Condições comerciais",
        "titleEs": null,
        "body": "A proposta possui validade de {{commercial_terms.validity_days}} dias. Alterações posteriores no escopo poderão revisar prazo e investimento.",
        "bodyEs": null,
        "required": true,
        "conditional": false
      },
      {
        "id": "approval",
        "title": "Aprovação",
        "titleEs": null,
        "body": "Ao aprovar esta proposta, o cliente declara concordância com escopo, investimento e condições. Cliente: {{client.name}} | Empresa: {{client.company}} | Data: {{approval.date}} | Assinatura: ____________________",
        "bodyEs": null,
        "required": true,
        "conditional": false
      }
    ],
    "sectionOrder": [
      "summary",
      "context",
      "objectives",
      "solution",
      "functional_scope",
      "technical_scope",
      "integrations",
      "assumptions",
      "limitations",
      "content",
      "testing",
      "process",
      "schedule",
      "investment",
      "included",
      "excluded",
      "responsibilities",
      "support",
      "terms",
      "approval"
    ]
  }
} as Record<string, ModeloBase>,
);
