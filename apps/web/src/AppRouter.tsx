import { StaffAuthProvider, StaffGate } from "./auth/StaffAuth";
import { LoginPage } from "./auth/LoginPage";
import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  useMatch,
} from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { InventoryLoading } from "./admin/inventory/InventoryLoading";

const App = lazy(() => import("./App"));
const BookingDashboard = lazy(() =>
  import("./admin/BookingDashboard").then((module) => ({
    default: module.BookingDashboard,
  })),
);
const InventoryDashboard = lazy(() =>
  import("./admin/inventory/InventoryDashboard").then((module) => ({
    default: module.InventoryDashboard,
  })),
);
const LeadsDashboard = lazy(() =>
  import("./admin/leads/LeadsDashboard").then((module) => ({
    default: module.LeadsDashboard,
  })),
);
const DocumentsDashboard = lazy(() =>
  import("./admin/documents/DocumentsDashboard").then((module) => ({
    default: module.DocumentsDashboard,
  })),
);
const BookingCalendar = lazy(() =>
  import("./booking/BookingCalendar").then((module) => ({
    default: module.BookingCalendar,
  })),
);
const AvailabilityMonitor = lazy(() =>
  import("./booking/AvailabilityMonitor").then((module) => ({
    default: module.AvailabilityMonitor,
  })),
);
const loading = (
  <p role="status" className="p-6">
    Loading…
  </p>
);

function AdminRoute() {
  const inventory = useMatch("/admin/inventory");
  const leads = useMatch("/admin/leads");
  const documents = useMatch("/admin/documents");
  return (
    <AdminLayout
      activePage={
        documents
          ? "documents"
          : leads
            ? "leads"
            : inventory
              ? "inventory"
              : "bookings"
      }
    >
      <Suspense
        fallback={inventory ? <InventoryLoading includeHeader /> : loading}
      >
        <Outlet />
      </Suspense>
    </AdminLayout>
  );
}
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/appointments"
          element={
            <Suspense fallback={loading}>
              <Outlet />
            </Suspense>
          }
        >
          <Route index element={<BookingCalendar />} />
          <Route path="availability" element={<BookingCalendar />} />
          <Route path="monitor" element={<AvailabilityMonitor />} />
        </Route>
        <Route
          element={
            <StaffAuthProvider>
              <Outlet />
            </StaffAuthProvider>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route element={<StaffGate />}>
            <Route element={<AdminRoute />}>
              <Route path="/admin/bookings" element={<BookingDashboard />} />
              <Route path="/admin/inventory" element={<InventoryDashboard />} />
              <Route path="/admin/leads" element={<LeadsDashboard />} />
              <Route path="/admin/documents" element={<DocumentsDashboard />} />
            </Route>
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <Suspense fallback={loading}>
              <App />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
