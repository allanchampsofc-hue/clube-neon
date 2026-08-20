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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button, buttonVariants } from "@/components/ui/button";
import { checkout } from "./checkout-actions";

const STEPS = [
  {
    icon: ClipboardCheckIcon,
    title: "Escolha como pagar",
    description: "Plano anual do Clube Neon: 12x R$ 49,90 ou R$ 499,00 à vista.",
  },
  {
    icon: ZapIcon,
    title: "Ative sua assinatura",
    description: "Pagamento seguro e acesso imediato ao clube.",
  },
  {
    icon: PizzaIcon,
    title: "Use no mês",
    description:
      "R$ 99,00 de crédito liberado todo mês — válido só no mês vigente, não acumula.",
  },
];

const BENEFITS = [
  "R$ 99,00 em crédito todo mês, por 12 meses (R$ 1.188,00 no total)",
  "Válido no cardápio inteiro da Neon, dentro do mês de referência",
  "Crédito disponível a partir da confirmação do pagamento",
  "Acesso à área do membro com histórico completo",
  "Escolha entre parcelado (12x) ou à vista, com desconto",
];

const FAQ = [
  {
    question: "Quanto de crédito recebo?",
    answer: "R$ 99,00 por mês em crédito real (em reais), por 12 meses — R$ 1.188,00 no total.",
  },
  {
    question: "O crédito acumula se eu não usar?",
    answer:
      "Não. O crédito de cada mês é válido apenas naquele mês — se não usar, não passa pro próximo ciclo. A exceção é o último mês do plano: o saldo restante fica disponível por mais 2 meses.",
  },
  {
    question: "Posso cancelar antes dos 12 meses?",
    answer:
      "Sim. Ao cancelar, você paga os 3 meses seguintes ao pedido de cancelamento e continua tendo acesso ao crédito nesses meses. Após esse período, a assinatura encerra sem novas cobranças.",
  },
  {
    question: "O que acontece ao fim dos 12 meses?",
    answer:
      "Sua assinatura encerra automaticamente. Você terá 2 meses extras para usar o saldo remanescente do último ciclo. Após isso, poderá renovar quando quiser.",
  },
  {
    question: "Qual a diferença entre parcelado e à vista?",
    answer:
      "No parcelado você paga 12x R$ 49,90 (total R$ 598,80). No à vista você paga R$ 499,00 de uma vez e economiza R$ 99,80 — equivale a ganhar 1 mês grátis. O crédito mensal de R$ 99,00 é o mesmo nas duas opções.",
  },
  {
    question: "Posso pedir qualquer coisa com o crédito?",
    answer: "Sim, qualquer item do cardápio até o limite disponível no mês.",
  },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LandingPage({
  searchParams,
}: PageProps<"/">) {
  const sp = await searchParams;
  const checkoutError = first(sp.checkout_error);
  const refCode = first(sp.ref)?.trim().toUpperCase() || null;

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("system_config")
    .select("referral_credit_cents, annual_price_cents, monthly_price_cents")
    .limit(1)
    .maybeSingle();
  const referralCreditCents = config?.referral_credit_cents ?? 3000;
  const monthlyPriceCents = config?.monthly_price_cents ?? 4990;
  const annualPriceCents = config?.annual_price_cents ?? 49900;
  const monthlyTotalCents = monthlyPriceCents * 12;
  const annualSavingsCents = monthlyTotalCents - annualPriceCents;

  const { data: planData } = await supabase
    .from("plans")
    .select("monthly_credit_cents")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const monthlyCreditCents = planData?.monthly_credit_cents ?? 9900;
  const totalCreditCents = monthlyCreditCents * 12;

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
        <h1 className="max-w-3xl font-heading text-3xl font-extrabold text-balance sm:text-5xl">
          🎉 CLUBE NEON – CRÉDITO TODO MÊS PRA COMER NA NEON
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          12x {formatCents(monthlyPriceCents)} ou {formatCents(annualPriceCents)}{" "}
          à vista — {formatCents(monthlyCreditCents)} de crédito todo mês na
          Neon, por 12 meses.
        </p>
        <p className="max-w-xl text-sm text-primary-foreground/70">
          Total em crédito no ano: {formatCents(totalCreditCents)}. O
          crédito de cada mês vale só naquele mês — não acumula.
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

      {/* Seção 3 — O plano */}
      <section id="plano" className="bg-background px-6 py-20">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h2 className="text-center font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Clube Neon — plano anual, 12 meses
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader className="items-center gap-2 text-center">
                <Badge variant="outline">PARCELADO</Badge>
                <CardTitle className="font-heading text-3xl font-extrabold text-primary">
                  12x {formatCents(monthlyPriceCents)}
                </CardTitle>
                <CardDescription>
                  Total: {formatCents(monthlyTotalCents)} — débito automático todo mês
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-2 border-secondary">
              <CardHeader className="items-center gap-2 text-center">
                <Badge variant="secondary">À VISTA ⭐ MAIS VANTAJOSO</Badge>
                <CardTitle className="font-heading text-3xl font-extrabold text-primary">
                  {formatCents(annualPriceCents)}
                </CardTitle>
                <CardDescription>
                  Economia de {formatCents(annualSavingsCents)} — equivale a 1 mês grátis
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-2 border-secondary">
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-center text-sm">
                Em ambas as opções: {formatCents(monthlyCreditCents)} de crédito
                todo mês por 12 meses — total de {formatCents(totalCreditCents)}{" "}
                em crédito no ano.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <p className="text-center text-xs text-muted-foreground">
                ⚠️ O crédito mensal não acumula para o mês seguinte.
              </p>
              <a
                href="#checkout"
                className={buttonVariants({ variant: "secondary", className: "w-full" })}
              >
                ASSINAR O CLUBE NEON
              </a>
            </CardContent>
          </Card>
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
              Neon. O valor é debitado digitalmente do seu saldo.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-card p-6 ring-1 ring-border">
            <p className="font-heading text-xl font-bold text-primary">
              {formatCents(monthlyCreditCents)} por mês
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
            {FAQ.map((item) => (
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
          12x {formatCents(monthlyPriceCents)} ou {formatCents(annualPriceCents)}{" "}
          à vista. {formatCents(monthlyCreditCents)} de crédito todo mês.
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
              <p>12x {formatCents(monthlyPriceCents)} ou {formatCents(annualPriceCents)} à vista</p>
              <p>{formatCents(monthlyCreditCents)} de crédito todo mês</p>
              <p className="mt-2 text-primary-foreground/70">
                Você está contratando o Clube Neon — plano anual de 12
                meses. Você receberá {formatCents(monthlyCreditCents)} em
                crédito de consumo por mês, válido apenas no mês de
                referência — o crédito não utilizado não é transferido
                para o mês seguinte.
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
                  <form action={checkout} className="flex flex-col gap-3">
                    {checkoutError ? (
                      <p className="text-sm text-destructive">{checkoutError}</p>
                    ) : null}

                    {validReferral ? (
                      <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3 text-sm text-primary-foreground">
                        Você foi indicado por um amigo Neon! Ao ativar sua
                        assinatura, ambos ganham {formatCents(referralCreditCents)}{" "}
                        de crédito.
                        <input type="hidden" name="ref" value={refCode ?? ""} />
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input id="name" name="name" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" name="email" type="email" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" name="phone" type="tel" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="cpf">CPF (opcional)</Label>
                      <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Forma de pagamento</Label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
                        <input type="radio" name="payment_type" value="MONTHLY" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">Parcelado — 12x {formatCents(monthlyPriceCents)}</span>
                          <span className="block text-muted-foreground">Total: {formatCents(monthlyTotalCents)}</span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
                        <input type="radio" name="payment_type" value="ANNUAL" defaultChecked className="mt-0.5" />
                        <span>
                          <span className="block font-medium">
                            À vista — {formatCents(annualPriceCents)} ⭐ mais vantajoso
                          </span>
                          <span className="block text-muted-foreground">
                            Economia de {formatCents(annualSavingsCents)}
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="confirm_password">Confirmar senha</Label>
                      <Input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox id="terms" name="terms" required className="mt-0.5" />
                      <Label htmlFor="terms" className="text-xs font-normal text-muted-foreground">
                        Li e aceito os{" "}
                        <a href="/termos" className="underline underline-offset-2">
                          termos de uso
                        </a>{" "}
                        e a{" "}
                        <a href="/politica-de-privacidade" className="underline underline-offset-2">
                          política de privacidade
                        </a>
                        .
                      </Label>
                    </div>

                    <Button type="submit" variant="secondary" className="mt-2">
                      ASSINAR O CLUBE NEON
                    </Button>
                  </form>
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
