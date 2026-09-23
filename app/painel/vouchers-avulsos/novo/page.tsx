import { requireManager } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { generatePromoVouchers } from "../actions";

export default async function NovoVoucherAvulsoPage({
  searchParams,
}: PageProps<"/painel/vouchers-avulsos/novo">) {
  await requireManager();
  const { error } = await searchParams;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Gerar vouchers avulsos</CardTitle>
        <CardDescription>
          Vale pra promoções pontuais, sem exigir que o comprador seja assinante do
          clube — ex: &quot;pague R$ 49,90 e leve uma pizza grátis&quot;. O pagamento é
          recebido fora do sistema (Pix, dinheiro ou cartão na hora) e registrado aqui só
          pra controle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={generatePromoVouchers} className="flex flex-col gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign_name">Nome da campanha</Label>
            <Input
              id="campaign_name"
              name="campaign_name"
              placeholder="Ex: Promo Instagram Setembro"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="benefit_description">Benefício</Label>
            <Input
              id="benefit_description"
              name="benefit_description"
              placeholder="Ex: 1 pizza grátis, qualquer tamanho ou sabor do cardápio"
              required
            />
            <p className="text-xs text-muted-foreground">
              Esse texto aparece pro garçom na hora de confirmar o resgate.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price_paid">Preço pago (R$)</Label>
              <Input
                id="price_paid"
                name="price_paid"
                type="number"
                step="0.01"
                min="0"
                placeholder="49,90"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment_method">Forma de pagamento</Label>
              <select
                id="payment_method"
                name="payment_method"
                required
                defaultValue=""
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="" disabled>
                  Selecione
                </option>
                <option value="PIX">Pix</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO">Cartão</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantity">Quantidade de códigos</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                max="200"
                defaultValue="1"
                required
              />
              <p className="text-xs text-muted-foreground">Até 200 por vez.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valid_days">Validade (dias)</Label>
              <Input
                id="valid_days"
                name="valid_days"
                type="number"
                min="1"
                max="365"
                defaultValue="30"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buyer_name">Nome do comprador (opcional)</Label>
            <Input id="buyer_name" name="buyer_name" placeholder="Deixe em branco se for lote" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buyer_phone">WhatsApp do comprador (opcional)</Label>
            <Input id="buyer_phone" name="buyer_phone" type="tel" placeholder="(12) 99999-0000" />
          </div>

          <Button type="submit" className="mt-2">
            Gerar código(s)
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
