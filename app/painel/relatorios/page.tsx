import { requireManager } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPORTS = [
  {
    href: "/painel/relatorios/assinantes",
    title: "Assinantes",
    description:
      "Total por status, novos assinantes por mês, churn e taxa de retenção.",
  },
  {
    href: "/painel/relatorios/creditos",
    title: "Créditos",
    description:
      "Crédito liberado, utilizado e expirado no período, taxa de utilização e top clientes.",
  },
  {
    href: "/painel/relatorios/receita",
    title: "Receita",
    description:
      "Receita recorrente mensal (MRR), receita por status e inadimplência em risco.",
  },
];

export default async function PainelRelatoriosPage() {
  await requireManager();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Relatórios
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visões consolidadas do Clube Neon. Restrito a GERENTE, ADMIN e
          SUPER_ADMIN.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {REPORTS.map((report) => (
          <a key={report.href} href={report.href}>
            <Card className="h-full transition-colors hover:border-secondary">
              <CardHeader>
                <CardTitle>{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
