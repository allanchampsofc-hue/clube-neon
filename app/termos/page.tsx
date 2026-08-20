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
          Ao contratar o Clube Neon, você concorda com as condições abaixo.
          Esse é um resumo simples — em caso de dúvida, fale com a equipe da
          Neon Pizzaria.
        </p>

        <h2 className="font-heading text-lg font-bold">O plano</h2>
        <p>
          O Clube Neon é um plano anual, com duração de 12 (doze) meses,
          contratável de duas formas: parcelado em 12x R$ 49,90 no cartão de
          crédito, ou à vista por R$ 499,00. Em ambas as formas de
          pagamento, o participante recebe R$ 99,00 de crédito por mês,
          durante os 12 meses de contrato.
        </p>

        <h2 className="font-heading text-lg font-bold">Natureza do benefício</h2>
        <p>
          O Clube Neon concede ao participante um crédito mensal de R$
          99,00 (noventa e nove reais) para uso exclusivo em consumo no
          estabelecimento Neon Pizzaria. Este crédito não representa
          transferência de valores em espécie, não é resgatável em
          dinheiro, não é transferível a terceiros e não pode ser
          utilizado fora do estabelecimento.
        </p>

        <h2 className="font-heading text-lg font-bold">Validade do crédito</h2>
        <p>
          O crédito mensal é válido exclusivamente no mês de referência,
          iniciando-se na data de aniversário mensal da contratação e
          encerrando-se no início do ciclo seguinte. Créditos não
          utilizados no período de validade expiram automaticamente, sem
          direito a compensação, transferência ou reembolso. A exceção é o
          último mês do contrato: o saldo remanescente do 12º mês fica
          disponível por mais 2 (dois) meses, período de carência em que
          nenhum crédito novo é liberado.
        </p>

        <h2 className="font-heading text-lg font-bold">
          Cancelamento — plano parcelado
        </h2>
        <p>
          O participante que optar pelo pagamento parcelado (12x R$ 49,90)
          poderá solicitar o cancelamento a qualquer momento. Neste caso,
          serão devidas as parcelas referentes aos 3 (três) meses
          subsequentes à data do pedido de cancelamento, período durante o
          qual o participante manterá acesso ao crédito mensal. Após esse
          prazo, a participação no Clube Neon será encerrada, sem novas
          cobranças e sem liberação de novos créditos mensais.
        </p>

        <h2 className="font-heading text-lg font-bold">
          Cancelamento — plano à vista
        </h2>
        <p>
          O participante que optar pelo pagamento à vista (R$ 499,00)
          poderá solicitar o cancelamento a qualquer momento. Como o valor
          já foi quitado integralmente, não há parcelas futuras a cobrar
          nem reembolso do valor pago. O participante mantém acesso ao
          crédito mensal normalmente até o fim dos 12 meses contratados,
          seguido do período de carência de 2 meses descrito acima.
        </p>

        <h2 className="font-heading text-lg font-bold">Pagamento</h2>
        <p>
          No plano parcelado, a cobrança é mensal e recorrente, via débito
          automático no cartão informado. Em caso de falha no pagamento, a
          participação pode ficar inadimplente até a regularização. No
          plano à vista, o pagamento único quita a totalidade do contrato
          — não há cobranças futuras.
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
