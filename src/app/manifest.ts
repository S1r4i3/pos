import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home screen" / "Install app").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RestoPOS",
    short_name: "RestoPOS",
    description: "Restaurant billing, KOT, inventory and reports",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "any",
    background_color: "#F8FAFC",
    theme_color: "#EA580C",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
