export default function TermosPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <a href="/" className="text-sm text-primary underline underline-offset-4">
        ← Voltar
      </a>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Termos de uso
      </h1>

      <div className="flex flex-col gap-4 text-sm text-foreground">
        <p>
          Ao assinar o Clube Neon, você concorda com as condições abaixo.
          Esse é um resumo simples — em caso de dúvida, fale com a equipe da
          Neon Pizzaria.
        </p>

        <h2 className="font-heading text-lg font-bold">O plano</h2>
        <p>
          O Clube Neon custa R$ 49,90 por mês e libera R$ 99,00 de crédito
          pra usar no cardápio da Neon. O crédito não acumula entre meses —
          o que não for usado expira no início do próximo ciclo. A
          assinatura tem duração de 12 meses, com renovação automática.
        </p>

        <h2 className="font-heading text-lg font-bold">Pagamento</h2>
        <p>
          A cobrança é mensal e recorrente. Em caso de falha no pagamento,
          sua assinatura pode ficar inadimplente até a regularização.
        </p>

        <h2 className="font-heading text-lg font-bold">Cancelamento</h2>
        <p>
          Você pode cancelar sua assinatura a qualquer momento entrando em
          contato com a Neon. O cancelamento encerra a assinatura no fim do
          período vigente — não há reembolso do crédito já liberado.
        </p>

        <h2 className="font-heading text-lg font-bold">Uso do crédito</h2>
        <p>
          O crédito é pessoal e intransferível, usado exclusivamente no
          cardápio da Neon Pizzaria, debitado digitalmente no momento do
          pedido.
        </p>
      </div>
    </div>
  );
}
