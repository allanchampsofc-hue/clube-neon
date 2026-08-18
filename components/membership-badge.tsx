import { Badge } from "@/components/ui/badge";

const LEVEL_CONFIG: Record<
  string,
  { label: string; variant?: "default" | "secondary" | "outline"; className?: string }
> = {
  MEMBRO: { label: "MEMBRO", variant: "default" },
  OURO: { label: "⭐ OURO", variant: "secondary" },
  BLACK: {
    label: "⭐⭐ BLACK",
    variant: "outline",
    className: "border-2 border-secondary bg-black text-white",
  },
};

export function MembershipBadge({ level }: { level: string }) {
  const config = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.MEMBRO;
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
