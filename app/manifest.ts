import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "高校入試 理科単元別アーカイブ",
    short_name: "理科アーカイブ",
    description: "高校入試の理科大問を画像で比較・選定できる講師向けアーカイブ",
    start_url: "/",
    display: "standalone",
    background_color: "#08101f",
    theme_color: "#08101f",
    lang: "ja",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
