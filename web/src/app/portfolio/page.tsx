import { type Metadata } from "next";

import { PortfolioSettingsScreen } from "@/components/portfolio/settings-screen";

export const metadata: Metadata = { title: "Your portfolio" };

export default function PortfolioSettingsPage() {
  return <PortfolioSettingsScreen />;
}
