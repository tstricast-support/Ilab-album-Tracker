import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignIn,
  useUser,
  useClerk,
} from "@clerk/clerk-react";

const App = lazy(() => import("./App.jsx"));
const VALID_ROLES = [
  "ENTRY",
  "PRINTING",
  "LAMINATING",
  "LASER_CUTTING",
  "BINDING",
  "ADMIN",
];

function homeFor(role) {
  if (role === "ADMIN") return "/";
  if (role === "ENTRY") return "/entry";
  return `/station/${role.toLowerCase()}`;
}

function Center({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        background: "#0a0a0a",
        color: "#f0f0f0",
      }}
    >
      {children}
    </div>
  );
}

function RoleLoader() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) return <Center>Loading…</Center>;

  const role = String(user?.publicMetadata?.role || "").toUpperCase();
  if (!VALID_ROLES.includes(role)) {
    return (
      <Center>
        <div>Your account has no department role. Contact the admin.</div>
        <button
          onClick={() => {
            sessionStorage.clear();
            signOut({ redirectUrl: "/" });
          }}
        >
          Sign out
        </button>
      </Center>
    );
  }

  // must happen BEFORE App.jsx is imported
  sessionStorage.setItem("role", role);

  // non-admins can't land on the dashboard or admin pages
  const p = window.location.pathname;
  const stationMatch = p.match(/^\/station\/(\w+)/);
  const wrongStation = stationMatch && stationMatch[1].toUpperCase() !== role;
  const wrongEntry = p === "/entry" && role !== "ENTRY";
  if (
    role !== "ADMIN" &&
    (p === "/" ||
      p.startsWith("/admin") ||
      p === "/analytics" ||
      wrongStation ||
      wrongEntry)
  ) {
    window.history.replaceState({}, "", homeFor(role));
  }

  return (
    <Suspense fallback={<Center>Loading…</Center>}>
      <App />
    </Suspense>
  );
}

function Root() {
  // Public tracking page (QR code) stays open, no login
  if (window.location.pathname === "/track") {
    sessionStorage.setItem("role", "PUBLIC");
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );
  }
  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
    >
      <SignedOut>
        {sessionStorage.removeItem("role")}
        <Center>
          <SignIn routing="hash" />
        </Center>
      </SignedOut>
      <SignedIn>
        <RoleLoader />
      </SignedIn>
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

