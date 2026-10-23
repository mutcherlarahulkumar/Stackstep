import { type Metadata } from "next";

import { WorkspaceScreen } from "@/components/workspace/workspace-screen";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return <WorkspaceScreen />;
}
