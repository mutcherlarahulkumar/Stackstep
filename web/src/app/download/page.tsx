import { type Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { DownloadScreen } from "@/components/download/download-screen";
import { DEFAULT_ANDROID_URL } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Get the app",
  description:
    "Download Stackstep for Android or iPhone, with install steps and fixes for common problems.",
};

/** Links come from the server's environment, so one image serves every deployment. */
async function Links() {
  await connection();
  const android = process.env.APP_ANDROID_URL || DEFAULT_ANDROID_URL;
  const ios = process.env.APP_IOS_URL || null;
  return <DownloadScreen links={{ android, ios }} />;
}

export default function DownloadPage() {
  return (
    <Suspense>
      <Links />
    </Suspense>
  );
}
