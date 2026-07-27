import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://restroom-report.com";
  const routes = ["", "/install", "/privacy", "/support", "/terms"];
  const lastModified = new Date();
  return routes.map(route => ({ url: `${base}${route}`, lastModified }));
}
