import Image from "next/image";
import { CheckIcon, ClipboardCheckIcon, PizzaIcon, ZapIcon } from "lucide-react";
import { getCurrentUser, getUserRoleCodes, STAFF_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CheckoutForm } from "./checkout-form";

const STEPS = [
  {
    icon: ClipboardCheckIcon,
    title: "Escolha seu plano",
    description: "Essencial ou Completo — parcelado em 12x ou à vista.",
  },
  {
    icon: ZapIcon,
    title: "Ative sua assinatura",
    description: "Pagamento seguro e acesso imediato ao clube.",
  },
  {
    icon: PizzaIcon,
    title: "Use no mês",
    description: "Crédito liberado todo mês — válido só no mês vigente, não acumula.",
  },
];

const BASE_BENEFITS = [
  "Crédito de consumo todo mês, por 12 meses",
  "Válido no cardápio inteiro da Neon, dentro do mês de referência",
  "Indicação de amigos, sorteio mensal e cashback",
  "Níveis Ouro e Black com descontos extras",
  "Escolha entre parcelado (12x) ou à vista, com desconto",
];

const COMPLETO_EXTRA_BENEFITS = [
  "Voucher pizza 2x1 a cada 2 meses",
  "Frete grátis todo mês em Taubaté",
];

function buildFaq(
  essencial: { monthlyPriceCents: number; annualPriceCents: number; monthlyCreditCents: number },
  completo: { monthlyPriceCents: number; annualPriceCents: number; monthlyCreditCents: number },
) {
  return [
    {
      question: "Quanto de crédito recebo?",
      answer: `Depende do plano: ${formatCents(essencial.monthlyCreditCents)} por mês no Essencial, ${formatCents(completo.monthlyCreditCents)} por mês no Completo — por 12 meses.`,
    },
    {
      question: "Qual a diferença entre Essencial e Completo?",
      answer:
        "O Completo tem tudo do Essencial, mais crédito mensal, voucher de pizza 2x1 a cada 2 meses e frete grátis todo mês em Taubaté.",
    },
    {
      question: "O crédito acumula se eu não usar?",
      answer:
        "Não. O crédito de cada mês é válido apenas naquele mês — se não usar, não passa pro próximo ciclo. A exceção é o último mês do plano: o saldo restante fica disponível por mais 2 meses.",
    },
    {
      question: "Posso cancelar antes dos 12 meses?",
      answer:
        "Sim. No parcelado, você paga os 3 meses seguintes ao pedido e continua com acesso ao crédito nesse período. No à vista, não há cobranças novas — você mantém o crédito até o fim natural dos 12 meses, sem reembolso do valor pago.",
    },
    {
      question: "O que acontece ao fim dos 12 meses?",
      answer:
        "Sua participação encerra automaticamente. Você terá 2 meses extras para usar o saldo remanescente do último ciclo. Após isso, poderá renovar quando quiser.",
    },
    {
      question: "Qual a diferença entre parcelado e à vista?",
      answer: `No parcelado você paga em 12x (Essencial: ${formatCents(essencial.monthlyPriceCents)}/mês, Completo: ${formatCents(completo.monthlyPriceCents)}/mês). No à vista você paga de uma vez (Essencial: ${formatCents(essencial.annualPriceCents)}, Completo: ${formatCents(completo.annualPriceCents)}) e economiza — equivale a ganhar 1 mês grátis. O crédito mensal é o mesmo nas duas formas de pagamento.`,
    },
    {
      question: "Posso pedir qualquer coisa com o crédito?",
      answer: "Sim, qualquer item do cardápio até o limite disponível no mês.",
    },
  ];
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LandingPage({
  searchParams,
}: PageProps<"/">) {
  const sp = await searchParams;
  const checkoutError = first(sp.checkout_error);
  const refCode = first(sp.ref)?.trim().toUpperCase() || null;
  const planoParam = first(sp.plano)?.trim().toUpperCase();
  const initialPlanType: "ESSENCIAL" | "COMPLETO" = planoParam === "ESSENCIAL" ? "ESSENCIAL" : "COMPLETO";

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("system_config")
    .select("referral_credit_cents")
    .limit(1)
    .maybeSingle();
  const referralCreditCents = config?.referral_credit_cents ?? 3000;

  const { data: plansData } = await supabase
    .from("plans")
    .select("plan_type, price_cents, annual_price_cents, monthly_credit_cents")
    .eq("active", true);
  const plansByType = Object.fromEntries(
    (plansData ?? []).map((p) => [
      p.plan_type,
      {
        monthlyPriceCents: p.price_cents,
        annualPriceCents: p.annual_price_cents,
        monthlyCreditCents: p.monthly_credit_cents,
      },
    ]),
  ) as Record<"ESSENCIAL" | "COMPLETO", { monthlyPriceCents: number; annualPriceCents: number; monthlyCreditCents: number }>;

  const essencial = plansByType.ESSENCIAL ?? {
    monthlyPriceCents: 3990,
    annualPriceCents: 39900,
    monthlyCreditCents: 8000,
  };
  const completo = plansByType.COMPLETO ?? {
    monthlyPriceCents: 4990,
    annualPriceCents: 49900,
    monthlyCreditCents: 9900,
  };
  const faq = buildFaq(essencial, completo);

  let validReferral = false;
  if (refCode) {
    const { data: referrerId } = await supabase.rpc("lookup_referrer_by_code", {
      p_code: refCode,
    });
    validReferral = Boolean(referrerId);
  }

  const user = await getCurrentUser();
  let loggedInHref: string | null = null;
  let loggedInLabel = "Entrar";
  if (user) {
    const roles = await getUserRoleCodes(user.id);
    if (roles.some((role) => STAFF_ROLES.includes(role))) {
      loggedInHref = "/painel";
      loggedInLabel = "Painel";
    } else {
      loggedInHref = "/minha-conta";
      loggedInLabel = "Minha conta";
    }
  }

  return (
    <div className="flex flex-col">
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-primary-foreground/10 bg-primary/95 px-6 py-4 backdrop-blur supports-backdrop-filter:bg-primary/80">
        <span className="font-heading text-lg font-bold text-primary-foreground">
          Clube Neon
        </span>
        <a
          href={loggedInHref ?? "/login"}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {loggedInHref ? loggedInLabel : "Entrar"}
        </a>
      </header>

      {/* Seção 1 — Hero */}
      <section className="flex flex-col items-center gap-6 bg-primary px-6 pt-32 pb-20 text-center text-primary-foreground">
        <Image
          src="/clube-neon-hero.png"
          alt="Clube Neon — pessoas comemorando com pizza"
          width={512}
          height={512}
          priority
          className="w-full max-w-xs rounded-2xl sm:max-w-sm"
        />
        <h1 className="max-w-3xl font-heading text-3xl font-extrabold text-balance sm:text-5xl">
          🎉 CLUBE NEON – CRÉDITO TODO MÊS PRA COMER NA NEON
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          Dois planos: Essencial ({formatCents(essencial.monthlyCreditCents)}/mês) ou
          Completo ({formatCents(completo.monthlyCreditCents)}/mês + vouchers). Parcelado
          em 12x ou à vista, com desconto.
        </p>
        <p className="max-w-xl text-sm text-primary-foreground/70">
          O crédito de cada mês vale só naquele mês — não acumula.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <a
            href="#plano"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            QUERO SER MEMBRO
          </a>
          <a
            href="#como-funciona"
            className="text-sm font-medium text-primary-foreground/80 underline underline-offset-4 hover:text-primary-foreground"
          >
            COMO FUNCIONA
          </a>
        </div>
      </section>

      {/* Seção 2 — Como funciona */}
      <section id="como-funciona" className="bg-background px-6 py-20 text-foreground">
        <div className="mx-auto flex max-w-5xl flex-col gap-12">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">
            Como funciona
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.title} className="text-center">
                <CardHeader className="justify-items-center">
                  <step.icon className="size-8 text-secondary" />
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Seção 3 — Os planos */}
      <section id="plano" className="bg-background px-6 py-20">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <h2 className="text-center font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Clube Neon — plano anual, 12 meses
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader className="items-center gap-2 text-center">
                <Badge variant="outline">ESSENCIAL</Badge>
                <CardTitle className="font-heading text-2xl font-extrabold text-primary">
                  12x {formatCents(essencial.monthlyPriceCents)}
                </CardTitle>
                <CardDescription>
                  ou {formatCents(essencial.annualPriceCents)} à vista
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span>{formatCents(essencial.monthlyCreditCents)}/mês em crédito de consumo</span>
                  </li>
                  {BASE_BENEFITS.slice(1).map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/?plano=essencial#checkout"
                  className={buttonVariants({ variant: "outline", className: "w-full" })}
                >
                  ASSINAR ESSENCIAL
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-secondary bg-secondary/5">
              <CardHeader className="items-center gap-2 text-center">
                <Badge variant="secondary">COMPLETO ⭐ MAIS VANTAJOSO</Badge>
                <CardTitle className="font-heading text-2xl font-extrabold text-primary">
                  12x {formatCents(completo.monthlyPriceCents)}
                </CardTitle>
                <CardDescription>
                  ou {formatCents(completo.annualPriceCents)} à vista
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span>{formatCents(completo.monthlyCreditCents)}/mês em crédito de consumo</span>
                  </li>
                  {BASE_BENEFITS.slice(1).map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                  {COMPLETO_EXTRA_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                      <span className="font-medium">{benefit}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/?plano=completo#checkout"
                  className={buttonVariants({ variant: "secondary", className: "w-full" })}
                >
                  ASSINAR COMPLETO
                </a>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            ⚠️ O crédito mensal não acumula para o mês seguinte.
          </p>
        </div>
      </section>

      {/* Seção 4 — Como usar o crédito */}
      <section className="bg-background px-6 py-20">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-2xl font-bold text-foreground">
              Como usar o crédito
            </h2>
            <p className="text-muted-foreground">
              Chegou na Neon? Informe ao atendente que é membro do Clube
              Neon. O crédito é debitado digitalmente na hora.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-card p-6 ring-1 ring-border">
            <p className="font-heading text-xl font-bold text-primary">
              {formatCents(essencial.monthlyCreditCents)} a {formatCents(completo.monthlyCreditCents)} por mês
            </p>
            <p className="text-sm text-muted-foreground">
              Use em qualquer item do cardápio, dentro do mês de referência.
            </p>
            <p className="text-xs text-muted-foreground">
              O crédito não utilizado no mês não é transferido pro próximo
              ciclo.
            </p>
          </div>
        </div>
      </section>

      {/* Seção 5 — FAQ */}
      <section id="faq" className="bg-background px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Perguntas frequentes
          </h2>
          <Accordion className="mt-8">
            {faq.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Seção 6 — CTA final */}
      <section className="flex flex-col items-center gap-4 bg-primary px-6 py-20 text-center text-primary-foreground">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">
          Pronto para fazer parte do Clube Neon?
        </h2>
        <p className="text-primary-foreground/90">
          Essencial ou Completo. Parcelado em 12x ou à vista. Crédito todo mês.
        </p>
        <a
          href="#checkout"
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          QUERO SER MEMBRO
        </a>
      </section>

      {/* Seção 7 — Checkout */}
      <section id="checkout" className="bg-primary px-6 py-20 text-primary-foreground">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 sm:flex-row">
          <div className="flex flex-1 flex-col gap-3">
            <h2 className="font-heading text-2xl font-bold sm:text-3xl">
              Finalize sua assinatura
            </h2>
            <div className="flex flex-col gap-1.5 text-sm text-primary-foreground/90">
              <p>Clube Neon — plano anual, 12 meses</p>
              <p className="mt-2 text-primary-foreground/70">
                Você receberá crédito de consumo por mês, válido apenas no
                mês de referência — o crédito não utilizado não é
                transferido para o mês seguinte.
              </p>
            </div>
          </div>

          <div className="flex-1">
            {loggedInHref ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
                  <p className="text-sm">
                    Você já faz parte do Clube Neon.
                  </p>
                  <a href={loggedInHref} className={buttonVariants({ variant: "secondary" })}>
                    Ir para {loggedInLabel}
                  </a>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <CheckoutForm
                    plans={{ ESSENCIAL: essencial, COMPLETO: completo }}
                    initialPlanType={initialPlanType}
                    referralCreditCents={referralCreditCents}
                    validReferral={validReferral}
                    refCode={refCode}
                    checkoutError={checkoutError ?? null}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-2 bg-primary px-6 py-8 text-center text-xs text-primary-foreground/70">
        <p>© {new Date().getFullYear()} Neon Pizzaria. Todos os direitos reservados.</p>
        <a href="/politica-de-privacidade" className="underline underline-offset-4">
          Política de privacidade
        </a>
      </footer>
    </div>
  );
}
