export default function PoliticaDePrivacidadePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <a href="/" className="text-sm text-primary underline underline-offset-4">
        ← Voltar
      </a>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Política de privacidade
      </h1>

      <div className="flex flex-col gap-4 text-sm text-foreground">
        <p>
          A Neon Pizzaria leva a sua privacidade a sério. Esta página explica
          de forma simples quais dados coletamos e como usamos.
        </p>

        <h2 className="font-heading text-lg font-bold">Dados coletados</h2>
        <p>
          Coletamos apenas o necessário pra operar o Clube Neon: nome,
          e-mail, telefone, CPF (opcional, usado pra identificação no
          balcão) e data de nascimento (opcional).
        </p>

        <h2 className="font-heading text-lg font-bold">Pagamento</h2>
        <p>
          Dados de cartão de crédito são processados diretamente pelo
          gateway de pagamento — a Neon nunca armazena número de cartão.
        </p>

        <h2 className="font-heading text-lg font-bold">Uso dos dados</h2>
        <p>
          Usamos seus dados só pra operar sua participação no Clube Neon,
          identificar você no balcão e te avisar sobre sua conta. Não
          vendemos nem compartilhamos seus dados com terceiros pra fins de
          marketing.
        </p>

        <h2 className="font-heading text-lg font-bold">Seus direitos</h2>
        <p>
          Você pode pedir a exclusão da sua conta e dos seus dados a
          qualquer momento, entrando em contato com a equipe da Neon,
          conforme a Lei Geral de Proteção de Dados (LGPD).
        </p>
      </div>
    </div>
  );
}
