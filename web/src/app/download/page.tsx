import { type Metadata } from "next";

import { DownloadScreen } from "@/components/download/download-screen";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Download Stackstep for Android or iPhone, with install steps and fixes for common problems.",
};

export default function DownloadPage() {
  return <DownloadScreen />;
}
