import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clube Neon",
    short_name: "Clube Neon",
    description:
      "Clube Neon — assinatura da Neon Pizzaria. R$ 49,90/mês por R$ 99,00 de crédito para usar no cardápio todo mês.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f4ff",
    theme_color: "#1a4f8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
