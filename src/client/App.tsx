import { useState } from "react";
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes } from "react-router-dom";
import { DEV_USER_KEY, devUser } from "./api";
import { AskProvider } from "./ask";
import { Header, Nav } from "./components/Header";
import { NotificationsDrawer } from "./components/Notifications";
import { JoinLink, Welcome } from "./components/Projects";
import { Tooltips } from "./components/Tooltips";
import { WhatsNew } from "./components/WhatsNew";
import { Board } from "./pages/Board";
import { Calendar } from "./pages/Calendar";
import { CheckIn } from "./pages/CheckIn";
import { Admin } from "./pages/Admin";
import { Profile } from "./pages/Profile";
import { Timeline } from "./pages/Timeline";
import { useFocusFlash } from "./hooks";
import { SessionProvider, useSession } from "./session";
import { TeamProvider, useTeam } from "./state";

/** Act as any teammate: always in local dev and the public demo, and on the trial site while the Worker's TRIAL_SWITCHER is on. */
function DevBar() {
  const { members, me } = useTeam();
  const { switcher, signed_in_as } = useSession();
  const demo = Boolean(import.meta.env.VITE_DEMO);
  if (!import.meta.env.DEV && !demo && !switcher) return null;
  const label = demo
    ? "Demo · your changes stay in this tab"
    : import.meta.env.DEV
      ? "Dev only"
      : `Trial week${signed_in_as ? ` · you are ${signed_in_as}` : ""}`;
  return (
    <div className="devbar">
      <span>{label} · viewing as</span>
      <select
        value={devUser() ?? me.email}
        onChange={(e) => {
          try {
            localStorage.setItem(DEV_USER_KEY, e.target.value);
          } catch {
            /* ignore */
          }
          location.reload();
        }}
        aria-label="Act as teammate"
      >
        {members.map((m) => (
          <option key={m.id} value={m.email}>
            {m.name} ({m.role})
          </option>
        ))}
      </select>
      {demo && (
        <button
          className="btn ghost"
          onClick={() => {
            try {
              sessionStorage.removeItem("standup.demoDb"); // the key src/demo/boot.ts saves the tab's database under
            } catch {
              /* ignore */
            }
            location.reload();
          }}
        >
          Reset demo
        </button>
      )}
    </div>
  );
}

function Shell() {
  const [bell, setBell] = useState(false);
  useFocusFlash();
  return (
    <div className="wrap">
      <Header onBell={() => setBell(true)} />
      <Nav />
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/checkin" element={<CheckIn />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/meeting" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <WhatsNew />
      {bell && <NotificationsDrawer onClose={() => setBell(false)} />}
      <DevBar />
    </div>
  );
}

function Gate({ error }: { error: string | null }) {
  return (
    <div className="wrap" style={{ display: "grid", placeItems: "center", minHeight: "70vh", textAlign: "center" }}>
      <div>
        <div className="logo" style={{ margin: "0 auto 16px" }} aria-hidden="true">
          ✈
        </div>
        {error ? (
          <>
            <p className="v">Gate closed</p>
            <p className="muted">{error}</p>
            <p className="muted">Sign in with your SUTD email. To join a project, ask one of its admins for the invite code or link.</p>
          </>
        ) : (
          <p className="muted">Boarding…</p>
        )}
      </div>
    </div>
  );
}

/** The current project, remounted on switch so every page reloads its data for the new project. */
function Root() {
  const { current } = useSession();
  return (
    <Routes>
      <Route path="/join/:code" element={<JoinLink />} />
      <Route
        path="*"
        element={
          current ? (
            <TeamProvider key={current.id} fallback={(error) => <Gate error={error} />}>
              <Shell />
            </TeamProvider>
          ) : (
            <Welcome />
          )
        }
      />
    </Routes>
  );
}

// A data router so pages can block navigation while they have unsaved changes.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AskProvider>
        <Tooltips />
        <SessionProvider fallback={(error) => <Gate error={error} />}>
          <Root />
        </SessionProvider>
      </AskProvider>
    ),
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
