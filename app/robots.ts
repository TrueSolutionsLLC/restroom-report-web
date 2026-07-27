import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/__/auth" }],
    sitemap: "https://restroom-report.com/sitemap.xml",
  };
}
