import { type Metadata } from "next";

import { AttendanceScreen } from "@/components/attendance/attendance-screen";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return <AttendanceScreen />;
}
