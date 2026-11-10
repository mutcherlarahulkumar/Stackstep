import { type MetadataRoute } from "next";

/** Lets phones install the web app from the browser (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stackstep",
    short_name: "Stackstep",
    description: "Your virtual internship, step by step.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
