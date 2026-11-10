import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home screen icon on iPhone: the Stackstep steps on the brand gradient. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #7c3aed, #c2410c)", position: "relative" }}>
        <div style={{ position: "absolute", left: 37, top: 104, width: 25, height: 40, borderRadius: 6, background: "rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", left: 78, top: 73, width: 25, height: 71, borderRadius: 6, background: "rgba(255,255,255,0.85)" }} />
        <div style={{ position: "absolute", left: 118, top: 37, width: 25, height: 107, borderRadius: 6, background: "#fff" }} />
      </div>
    ),
    size,
  );
}
