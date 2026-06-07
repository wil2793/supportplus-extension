import { useState, useEffect } from "react";
import type { AppState, NotionUser, UserConfig } from "../types";
import { syncNotion } from "../services";
import { getSession } from "../services/supportplus";

const DEFAULT_STATE: AppState = {
  email: "",
  userName: "",
  profileId: null,
  role: "usuario",
  roleName: "usuario",
  groups: [],
  permissions: {
    canMigrate: false,
    canDragDrop: false,
    canReassignApp: false,
    canAddIAM: false,
    canShowLabels: false,
    canReopenTickets: false,
    canCommentClosed: false,
    canRejectTickets: false,
    btnDashboard: true,
    btnComments: true,
    btnReports: true,
  },
  userConfig: { pageId: "", blacklist: [], onlyWithTickets: false },
  groupMondayConfig: {},
};

export const useAppState = () => {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    "loading" | "active" | "inactive" | "not_found"
  >("loading");

  useEffect(() => {
    const init = async () => {
      try {
        // Get session email
        const session = await getSession();
        const email = session?.user?.email?.toLowerCase() || "";
        const userName = session?.user?.name || "";
        if (!email) {
          setStatus("not_found");
          setLoading(false);
          return;
        }

        // Save email for background sync
        chrome.storage.local.set({ userEmail: email });

        // Trigger sync and wait
        await Promise.race([
          syncNotion(),
          new Promise((r) => setTimeout(r, 15000)),
        ]);

        // Read synced data
        const stored = await new Promise<any>((resolve) => {
          chrome.storage.local.get(
            ["notionUsers", "userConfig", "groupMondayConfig"],
            resolve,
          );
        });

        const users: Record<string, NotionUser> = stored.notionUsers || {};
        const userData = users[email];

        if (!userData) {
          setStatus("not_found");
          setLoading(false);
          return;
        }
        if (!userData.active) {
          setStatus("inactive");
          setLoading(false);
          return;
        }

        setState({
          email,
          userName,
          profileId: userData.profileId,
          role: userData.roleName?.toLowerCase().includes("admin")
            ? "admin"
            : "usuario",
          roleName: userData.roleName || "usuario",
          groups: userData.groups || [],
          permissions: {
            canMigrate: !!userData.canMigrate,
            canDragDrop: !!userData.canDragDrop,
            canReassignApp: !!userData.canReassignApp,
            canAddIAM: !!userData.canAddIAM,
            canShowLabels: !!userData.canShowLabels,
            canReopenTickets: !!userData.canReopenTickets,
            canCommentClosed: !!userData.canCommentClosed,
            canRejectTickets: !!userData.canRejectTickets,
            btnDashboard: userData.btnDashboard !== false,
            btnComments: userData.btnComments !== false,
            btnReports: userData.btnReports !== false,
          },
          userConfig: stored.userConfig || DEFAULT_STATE.userConfig,
          groupMondayConfig: stored.groupMondayConfig || {},
        });
        setStatus("active");
      } catch (e) {
        console.error("[SP] Init error:", e);
        setStatus("not_found");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  return { state, loading, status };
};
