import { CheckIcon, ClipboardCheckIcon, PizzaIcon, ZapIcon } from "lucide-react";
import { getCurrentUser, getUserRoleCodes, STAFF_ROLES } from "@/lib/auth";
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
    title: "Escolha seu plano",
    description: "Assine o Clube Neon por R$ 49,90/mês.",
  },
  {
    icon: ZapIcon,
    title: "Ative sua assinatura",
    description: "Pagamento seguro e acesso imediato ao clube.",
  },
  {
    icon: PizzaIcon,
    title: "Use quando quiser",
    description:
      "R$ 99,00 de crédito liberado todo mês para gastar como preferir na Neon.",
  },
];

const BENEFITS = [
  "R$ 99,00 em crédito mensal (valor em reais, não pizzas)",
  "Use como quiser no cardápio da Neon",
  "Crédito disponível a partir da confirmação do pagamento",
  "Acesso à área do membro com histórico completo",
  "12 meses de experiência Neon",
];

const FAQ = [
  {
    question: "Quanto de crédito recebo?",
    answer: "R$ 99,00 por mês em crédito real (em reais).",
  },
  {
    question: "O crédito acumula?",
    answer:
      "Não. O crédito de cada mês deve ser usado no próprio mês. Apenas o saldo do mês 12 fica disponível por mais 2 meses.",
  },
  {
    question: "Posso usar tudo de uma vez?",
    answer: "Sim, dentro do saldo do mês.",
  },
  {
    question: "Posso pedir qualquer coisa?",
    answer: "Sim, qualquer item do cardápio até o limite disponível.",
  },
  {
    question: "O que acontece se não usar?",
    answer: "O crédito não usado expira no fim do ciclo e não é estornado.",
  },
  {
    question: "Como cancelo?",
    answer:
      "Entre em contato com a Neon. O cancelamento encerra a assinatura no fim do período vigente.",
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
          🎉 CLUBE NEON – SUA EXPERIÊNCIA GASTRONÔMICA TODO MÊS
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          Pague R$ 49,90 por mês e tenha R$ 99,00 de crédito para usar na
          Neon quando quiser. Todo mês, sem complicação.
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
        <div className="mx-auto max-w-md">
          <Card className="border-2 border-secondary">
            <CardHeader className="items-center gap-2 text-center">
              <Badge variant="secondary">CLUBE NEON</Badge>
              <CardTitle className="font-heading text-4xl font-extrabold text-primary">
                R$ 49,90
                <span className="text-base font-medium text-muted-foreground">
                  /mês
                </span>
              </CardTitle>
              <CardDescription>R$ 99,00 de crédito todo mês</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#checkout"
                className={buttonVariants({ variant: "secondary", className: "w-full" })}
              >
                QUERO SER MEMBRO
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
              R$ 99,00 por mês
            </p>
            <p className="text-sm text-muted-foreground">
              Use em qualquer item do cardápio.
            </p>
            <p className="text-xs text-muted-foreground">
              O crédito não utilizado no mês expira no início do próximo
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
          R$ 49,90/mês. R$ 99,00 de crédito. Todo mês.
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
              <p>Clube Neon — R$ 49,90/mês</p>
              <p>R$ 99,00 de crédito mensal</p>
              <p>12 meses com renovação automática</p>
              <p className="mt-2 text-primary-foreground/70">
                O crédito é liberado mensalmente e não acumula entre meses.
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
                      ASSINAR O CLUBE NEON — R$ 49,90/mês
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
