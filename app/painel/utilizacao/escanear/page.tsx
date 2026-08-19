import { requireStaff } from "@/lib/auth";
import { ScannerClient } from "./scanner-client";

export default async function EscanearPage() {
  await requireStaff();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Escanear QR do cliente
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aponte a câmera pro QR Code que o cliente está mostrando.
        </p>
      </div>
      <ScannerClient />
    </div>
  );
}
