import type { DocumentSearchResult } from "./documents-api";
export const VIN = "1HGCM82633A004352";
export const result: DocumentSearchResult = {
  vin: VIN,
  documents: [
    {
      id: "service:101",
      vin: VIN,
      title: "Service invoice",
      type: "Invoice",
      issuedAt: "2026-10-20",
      source: "service",
      content: "DEMO SERVICE INVOICE\nVehicle VIN: " + VIN + "\nTotal: £205.00",
    },
    {
      id: "sales:101",
      vin: VIN,
      title: "Vehicle sales invoice",
      type: "Invoice",
      issuedAt: "2026-10-10",
      source: "sales",
      content:
        "DEMO SALES INVOICE\nVehicle VIN: " + VIN + "\nTotal: £22,250.00",
    },
  ],
  sources: {
    sales: { label: "Sales System", status: "ok", count: 1 },
    service: { label: "Service System", status: "ok", count: 1 },
  },
};

export const allResult: DocumentSearchResult = {
  ...result,
  vin: null,
  documents: result.documents.map((doc, index) => ({
    ...doc,
    vin: index ? "WDBRF40J93F000001" : VIN,
  })),
};
