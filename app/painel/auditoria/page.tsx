import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, AUDIT_ENTITIES, type AuditAction } from "@/lib/audit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";

const PAGE_SIZE = 50;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export default async function PainelAuditoriaPage({
  searchParams,
}: PageProps<"/painel/auditoria">) {
  await requireAdmin();
  const sp = await searchParams;
  const action = first(sp.action);
  const userId = first(sp.user_id);
  const entity = first(sp.entity);
  const from = first(sp.from);
  const to = first(sp.to);
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, user_id, action, entity, entity_id, before_state, after_state, ip_address, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);
  if (entity) query = query.eq("entity", entity);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const offset = (page - 1) * PAGE_SIZE;
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count } = await query;
  const logs = (data ?? []) as AuditLogRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const userIds = [...new Set(logs.map((l) => l.user_id).filter((id): id is string => !!id))];
  const userNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("user_id, name")
      .in("user_id", userIds);
    for (const c of customers ?? []) {
      if (c.user_id) userNames.set(c.user_id, c.name);
    }
  }

  const baseParams = new URLSearchParams();
  if (action) baseParams.set("action", action);
  if (userId) baseParams.set("user_id", userId);
  if (entity) baseParams.set("entity", entity);
  if (from) baseParams.set("from", from);
  if (to) baseParams.set("to", to);

  const pageHref = (p: number) => {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(p));
    return `/painel/auditoria?${params.toString()}`;
  };

  const exportHref = `/api/auditoria/export?${baseParams.toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-primary">
            Auditoria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {count ?? 0} registros. Restrito a ADMIN e SUPER_ADMIN.
          </p>
        </div>
        <a href={exportHref} className={buttonVariants({ variant: "secondary" })}>
          Exportar CSV
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="action">Ação</Label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todas</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entity">Entidade</Label>
          <select
            id="entity"
            name="entity"
            defaultValue={entity ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todas</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user_id">Usuário (UUID)</Label>
          <Input id="user_id" name="user_id" defaultValue={userId ?? ""} className="w-48" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl ring-1 ring-border">
        <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_1fr] gap-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Data/hora</span>
          <span>Usuário</span>
          <span>Ação</span>
          <span>Entidade</span>
          <span>ID</span>
        </div>
        {logs.map((log) => (
          <details key={log.id} className="border-t border-border">
            <summary className="grid cursor-pointer grid-cols-[1.2fr_1fr_1.2fr_1fr_1fr] gap-2 px-3 py-2 text-sm hover:bg-muted/50">
              <span>{formatDateTime(log.created_at)}</span>
              <span className="truncate">
                {log.user_id ? (userNames.get(log.user_id) ?? log.user_id.slice(0, 8)) : "Sistema"}
              </span>
              <span>{AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}</span>
              <span>{log.entity}</span>
              <span className="truncate text-muted-foreground">
                {log.entity_id ? log.entity_id.slice(0, 8) : "—"}
              </span>
            </summary>
            <div className="grid gap-4 border-t border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1 font-medium text-foreground">Estado anterior</p>
                <pre className="overflow-x-auto rounded bg-card p-2">
                  {log.before_state ? JSON.stringify(log.before_state, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">Estado novo</p>
                <pre className="overflow-x-auto rounded bg-card p-2">
                  {log.after_state ? JSON.stringify(log.after_state, null, 2) : "—"}
                </pre>
              </div>
              {log.ip_address ? (
                <p className="text-muted-foreground sm:col-span-2">IP: {log.ip_address}</p>
              ) : null}
            </div>
          </details>
        ))}
        {logs.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum registro encontrado.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <a href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Anterior
            </a>
          ) : null}
          {page < totalPages ? (
            <a href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Próxima
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
