"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type Audience, notificationFor, notificationsWanted, setNotificationsWanted, titleWithCount } from "./notify";
import { useFrames } from "./realtime-context";

const supported = () => typeof window !== "undefined" && "Notification" in window;

/** Shows a browser notification for important live events while the tab is in the background. */
export function useBrowserNotifications(who: Audience, personaName: (id: string) => string | undefined): void {
  const names = useRef(personaName);
  useEffect(() => {
    names.current = personaName;
  }, [personaName]);
  useFrames((f) => {
    if (!supported() || !document.hidden || Notification.permission !== "granted" || !notificationsWanted()) return;
    const show = () => {
      const n = notificationFor(f, who, (id) => names.current(id));
      if (!n) return;
      const note = new Notification(n.title, { body: n.body, tag: n.tag, icon: "/icon.svg" });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    };
    // A first message from a new persona arrives before the chat list knows its name.
    if (f.type === "message" && !names.current(f.message.persona_id)) window.setTimeout(show, 1500);
    else show();
  });
}

/** Keeps "(n) " in front of the tab title while something is unread. */
export function useUnreadTitle(unread: number): void {
  const path = usePathname();
  useEffect(() => {
    document.title = titleWithCount(document.title, unread);
  }, [unread, path]);
}

export type NotificationState = "unsupported" | "blocked" | "on" | "off";

/** The account-menu toggle's state and action. */
export function useNotificationToggle(): { state: NotificationState; toggle: () => Promise<NotificationState> } {
  const read = (): NotificationState => {
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    return Notification.permission === "granted" && notificationsWanted() ? "on" : "off";
  };
  // Only rendered after the session loads on the client, so reading browser state here is safe.
  const [state, setState] = useState<NotificationState>(read);
  const toggle = async () => {
    if (!supported()) return "unsupported";
    if (state === "on") {
      setNotificationsWanted(false);
    } else {
      const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setNotificationsWanted(p === "granted");
    }
    const next = read();
    setState(next);
    return next;
  };
  return { state, toggle };
}
