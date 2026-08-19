"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SCANNER_ELEMENT_ID = "qr-scanner-viewport";

/** Extrai o caminho de confirmação (com o token) de uma URL completa ou parcial escaneada/colada. */
function extractConfirmPath(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.pathname.startsWith("/painel/utilizacao/confirmar/")) {
      return `${url.pathname}${url.search}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function ScannerClient() {
  const router = useRouter();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handledRef.current) return;
          const path = extractConfirmPath(decodedText);
          if (!path) return;
          handledRef.current = true;
          router.push(path);
        },
        () => {
          // callback de "nenhum QR neste frame" — ruído esperado, ignorar.
        },
      )
      .catch((err) => {
        setCameraError(
          err instanceof Error ? err.message : "Não foi possível acessar a câmera.",
        );
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [router]);

  function handleManualSubmit() {
    setManualError(null);
    const path = extractConfirmPath(manualInput.trim());
    if (!path) {
      setManualError("Cole a URL completa do QR Code do cliente.");
      return;
    }
    router.push(path);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Câmera</CardTitle>
          <CardDescription>Funciona em celular/tablet com câmera.</CardDescription>
        </CardHeader>
        <CardContent>
          <div id={SCANNER_ELEMENT_ID} className="mx-auto max-w-xs overflow-hidden rounded-xl" />
          {cameraError ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Câmera indisponível ({cameraError}) — use a opção manual abaixo.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Cole o código do QR</CardTitle>
          <CardDescription>Alternativa pra desktop, sem câmera.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-qr">URL do QR</Label>
            <Input
              id="manual-qr"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="https://clube-neon.vercel.app/painel/utilizacao/confirmar/..."
            />
          </div>
          {manualError ? <p className="text-sm text-destructive">{manualError}</p> : null}
          <Button onClick={handleManualSubmit}>Buscar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
