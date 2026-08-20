import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FAQ = [
  {
    question: "Quanto de crédito recebo?",
    answer: "R$ 99,00 em crédito de consumo por mês, por 12 meses.",
  },
  {
    question: "O crédito acumula pro mês seguinte?",
    answer:
      "Não. O crédito é válido no mês de referência. Só o saldo do último mês (mês 12) fica disponível por mais 2 meses, no período de carência.",
  },
  {
    question: "Posso usar tudo de uma vez?",
    answer: "Sim, dentro do crédito disponível do mês.",
  },
  {
    question: "Posso pedir qualquer coisa?",
    answer: "Sim, qualquer item do cardápio até o limite disponível.",
  },
  {
    question: "O que acontece se eu não usar?",
    answer:
      "O crédito não utilizado no mês não é transferido para o mês seguinte.",
  },
  {
    question: "Como uso meu crédito?",
    answer:
      "Na Neon, informe ao atendente que você é membro do Clube Neon. O crédito é debitado digitalmente na hora.",
  },
];

export default function AjudaPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">Ajuda</h1>

      <div className="flex max-w-md flex-col gap-3">
        {FAQ.map((item) => (
          <Card key={item.question}>
            <CardHeader>
              <CardTitle className="text-base">{item.question}</CardTitle>
              <CardDescription>{item.answer}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="max-w-md">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Não achou o que precisava? Fale direto com a equipe da Neon.
        </CardContent>
      </Card>
    </div>
  );
}
