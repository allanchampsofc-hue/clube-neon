import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  updatePlan,
  updateBirthdayConfig,
  updateMembershipMessages,
  updateCashbackConfig,
  updateSurveyConfig,
  updateWaiterPin,
  updatePricingConfig,
  updateCycleNotificationsConfig,
} from "./actions";

function centsToReais(cents: number) {
  return (cents / 100).toFixed(2);
}

export default async function PainelSistemaPage({
  searchParams,
}: PageProps<"/painel/sistema">) {
  await requireSuperAdmin();
  const { error, success } = await searchParams;

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: config } = await supabase
    .from("system_config")
    .select(
      "birthday_message, birthday_gift, membership_ouro_message, membership_black_message, cashback_percentage, cashback_max_cents, cashback_enabled, survey_message, survey_enabled, waiter_pin, monthly_price_cents, annual_price_cents, notify_credit_released, credit_released_message, notify_plan_ending, plan_ending_message",
    )
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Configurações do sistema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restrito a SUPER_ADMIN. Regras comerciais do Clube Neon ficam
          aqui — nada é hardcoded no código.
        </p>
      </div>

      {!plan ? (
        <p className="text-sm text-destructive">
          Nenhum plano cadastrado ainda. Rode a migration
          supabase/migrations/00002_seed_plan.sql no projeto Supabase.
        </p>
      ) : (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Plano</CardTitle>
            <CardDescription>
              Único plano do Clube Neon hoje — os valores abaixo controlam
              cobrança e crédito mensal de todo mundo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={updatePlan.bind(null, plan.id)}
              className="flex flex-col gap-4"
            >
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              {success ? (
                <p className="text-sm text-primary">
                  Plano atualizado com sucesso.
                </p>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" defaultValue={plan.name} required />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price_reais">Valor mensal (R$)</Label>
                <Input
                  id="price_reais"
                  name="price_reais"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={centsToReais(plan.price_cents)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthly_credit_reais">
                  Crédito mensal (R$)
                </Label>
                <Input
                  id="monthly_credit_reais"
                  name="monthly_credit_reais"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={centsToReais(plan.monthly_credit_cents)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="duration_months">Duração (meses)</Label>
                <Input
                  id="duration_months"
                  name="duration_months"
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={plan.duration_months}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grace_period_months">
                  Carência ao final do contrato (meses)
                </Label>
                <Input
                  id="grace_period_months"
                  name="grace_period_months"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={plan.grace_period_months}
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  name="active"
                  defaultChecked={plan.active}
                />
                <Label htmlFor="active">Plano ativo</Label>
              </div>

              <Button type="submit" className="mt-2">
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Aniversário</CardTitle>
          <CardDescription>
            Enviada automaticamente por WhatsApp no dia do aniversário do
            cliente (assinatura ATIVA). Variáveis disponíveis: {"{nome}"},{" "}
            {"{mimo}"}, {"{plano}"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateBirthdayConfig} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthday_message">Mensagem de aniversário</Label>
              <Textarea
                id="birthday_message"
                name="birthday_message"
                rows={5}
                defaultValue={config?.birthday_message ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthday_gift">Mimo de aniversário</Label>
              <Input
                id="birthday_gift"
                name="birthday_gift"
                defaultValue={config?.birthday_gift ?? ""}
                required
              />
            </div>
            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Níveis de membership</CardTitle>
          <CardDescription>
            Enviadas por WhatsApp quando o cliente sobe de nível. Variável
            disponível: {"{nome}"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateMembershipMessages} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="membership_ouro_message">Mensagem OURO</Label>
              <Textarea
                id="membership_ouro_message"
                name="membership_ouro_message"
                rows={4}
                defaultValue={config?.membership_ouro_message ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="membership_black_message">Mensagem BLACK</Label>
              <Textarea
                id="membership_black_message"
                name="membership_black_message"
                rows={4}
                defaultValue={config?.membership_black_message ?? ""}
                required
              />
            </div>
            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Cashback</CardTitle>
          <CardDescription>
            Aplicado sobre o valor pago fora do crédito quando o pedido excede
            o saldo disponível. Não acumula com crédito de indicação
            pendente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCashbackConfig} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashback_percentage">Percentual de cashback (%)</Label>
              <Input
                id="cashback_percentage"
                name="cashback_percentage"
                type="number"
                step="1"
                min="0"
                max="100"
                defaultValue={config?.cashback_percentage ?? 5}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashback_max_reais">Teto de cashback por ciclo (R$)</Label>
              <Input
                id="cashback_max_reais"
                name="cashback_max_reais"
                type="number"
                step="0.01"
                min="0"
                defaultValue={centsToReais(config?.cashback_max_cents ?? 1500)}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cashback_enabled"
                name="cashback_enabled"
                defaultChecked={config?.cashback_enabled ?? true}
              />
              <Label htmlFor="cashback_enabled">Cashback ativado</Label>
            </div>
            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Preços do plano anual</CardTitle>
          <CardDescription>
            Valores exibidos na landing page e no checkout — não mudam o
            valor efetivamente cobrado por ciclo (isso fica no plano, acima).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePricingConfig} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monthly_price_reais">Parcela mensal (R$)</Label>
              <Input
                id="monthly_price_reais"
                name="monthly_price_reais"
                type="number"
                step="0.01"
                min="0"
                defaultValue={centsToReais(config?.monthly_price_cents ?? 4990)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="annual_price_reais">Preço à vista (R$)</Label>
              <Input
                id="annual_price_reais"
                name="annual_price_reais"
                type="number"
                step="0.01"
                min="0"
                defaultValue={centsToReais(config?.annual_price_cents ?? 49900)}
                required
              />
            </div>
            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Notificações WhatsApp</CardTitle>
          <CardDescription>
            Avisos automáticos disparados pelo cron diário — crédito
            liberado a cada rollover mensal, e aviso de fim de plano 30
            dias antes do término dos 12 meses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCycleNotificationsConfig} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify_credit_released"
                name="notify_credit_released"
                defaultChecked={config?.notify_credit_released ?? true}
              />
              <Label htmlFor="notify_credit_released">
                Notificar crédito liberado
              </Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credit_released_message">Mensagem de crédito liberado</Label>
              <Textarea
                id="credit_released_message"
                name="credit_released_message"
                rows={4}
                defaultValue={config?.credit_released_message ?? ""}
                required
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{nome}"}, {"{data_fim_ciclo}"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="notify_plan_ending"
                name="notify_plan_ending"
                defaultChecked={config?.notify_plan_ending ?? true}
              />
              <Label htmlFor="notify_plan_ending">
                Notificar fim de plano
              </Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan_ending_message">Mensagem de fim de plano</Label>
              <Textarea
                id="plan_ending_message"
                name="plan_ending_message"
                rows={5}
                defaultValue={config?.plan_ending_message ?? ""}
                required
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{nome}"}, {"{data_fim}"}, {"{meses_restantes}"}
              </p>
            </div>

            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>PIN da tela do garçom</CardTitle>
          <CardDescription>
            Este PIN protege o acesso à tela clube-neon.vercel.app/garcom,
            usada pra confirmar utilização de crédito por código de 4
            dígitos sem precisar de login com conta Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateWaiterPin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waiter_pin">PIN (4 dígitos)</Label>
              <Input
                id="waiter_pin"
                name="waiter_pin"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                defaultValue={config?.waiter_pin ?? ""}
                required
              />
            </div>
            <Button type="submit" className="mt-2">
              Alterar PIN
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Pesquisa de satisfação</CardTitle>
          <CardDescription>
            Enviada por WhatsApp ~30 minutos depois de cada utilização de
            crédito, no máximo 1 por dia por cliente. Variável disponível:{" "}
            {"{nome}"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateSurveyConfig} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="survey_message">Mensagem da pesquisa</Label>
              <Textarea
                id="survey_message"
                name="survey_message"
                rows={7}
                defaultValue={config?.survey_message ?? ""}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="survey_enabled"
                name="survey_enabled"
                defaultChecked={config?.survey_enabled ?? true}
              />
              <Label htmlFor="survey_enabled">Pesquisa de satisfação ativada</Label>
            </div>
            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
