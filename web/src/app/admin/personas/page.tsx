import { type Metadata } from "next";

import { PersonasScreen } from "@/components/admin/personas";

export const metadata: Metadata = { title: "Personas" };

export default function PersonasPage() {
  return <PersonasScreen />;
}
