import { Controller, Get, Param } from '@nestjs/common';
import { normalizeVin } from './document-model.js';

export const DEMO_VIN = '1HGCM82633A004352';
export const SALES_ONLY_VIN = 'WDBRF40J93F000001';
export const SERVICE_ONLY_VIN = 'WVWZZZ1JZXW000001';
function body(vin: string, title: string, reference: string, detail: string) {
  return `KEYLOOP DEMO DEALERSHIP\n\n${title}\nReference: ${reference}\nVehicle VIN: ${vin}\n\n${detail}\n\nThis is a fictional document supplied for the interview demonstration.`;
}
export function salesDocuments(vin: string) {
  return {
    vin,
    documents: [DEMO_VIN, SALES_ONLY_VIN].includes(vin)
      ? [
          {
            document_id: vin === DEMO_VIN ? '101' : vin + '-101',
            vin,
            title: 'Vehicle sales invoice',
            document_type: 'Invoice',
            issued_at: '2026-10-10',
            body: body(
              vin,
              'VEHICLE SALES INVOICE',
              'SALES-101',
              'Vehicle purchase: £22,000.00\nPreparation and delivery: £250.00\nTotal: £22,250.00\n\nPayment status: Paid\nSales adviser: Demo sales team',
            ),
          },
          {
            document_id: vin === DEMO_VIN ? '102' : vin + '-102',
            vin,
            title: 'Order confirmation',
            document_type: 'Order confirmation',
            issued_at: '2026-10-08',
            body: body(
              vin,
              'ORDER CONFIRMATION',
              'SALES-102',
              'Order status: Confirmed\nVehicle: Demonstration vehicle\nCollection date: 10 October 2026\n\nThe vehicle specification and collection arrangements have been confirmed.',
            ),
          },
        ]
      : [],
  };
}
export function serviceDocuments(vin: string) {
  return {
    vehicleVin: vin,
    records: [DEMO_VIN, SERVICE_ONLY_VIN].includes(vin)
      ? [
          {
            reference: vin === DEMO_VIN ? '101' : vin + '-101',
            vehicleVin: vin,
            description: 'Service invoice',
            category: 'Invoice',
            date: '2026-10-20',
            content: body(
              vin,
              'SERVICE INVOICE',
              'SERVICE-101',
              'Scheduled service: £180.00\nReplacement filter: £25.00\nTotal: £205.00\n\nPayment status: Paid\nMileage recorded: 24,150 miles',
            ),
          },
          {
            reference: vin === DEMO_VIN ? '102' : vin + '-102',
            vehicleVin: vin,
            description: 'Repair order',
            category: 'Repair order',
            date: '2026-10-18',
            content: body(
              vin,
              'REPAIR ORDER',
              'SERVICE-102',
              'Reported concern: Routine scheduled maintenance\nWork completed: Oil and filter replacement; inspection\nTechnician: Demo service team\n\nVehicle inspection completed. No additional work required.',
            ),
          },
        ]
      : [],
  };
}
@Controller('mock/sales')
export class MockSalesController {
  @Get('documents')
  allDocuments() {
    return {
      vin: null,
      documents: [DEMO_VIN, SALES_ONLY_VIN].flatMap(
        (vin) => salesDocuments(vin).documents,
      ),
    };
  }
  @Get('vehicles/:vin/documents')
  documents(@Param('vin') vin: string) {
    return salesDocuments(normalizeVin(vin));
  }
}
@Controller('mock/service')
export class MockServiceController {
  @Get('documents')
  allDocuments() {
    return {
      vehicleVin: null,
      records: [DEMO_VIN, SERVICE_ONLY_VIN].flatMap(
        (vin) => serviceDocuments(vin).records,
      ),
    };
  }
  @Get('vehicles/:vin/documents')
  documents(@Param('vin') vin: string) {
    return serviceDocuments(normalizeVin(vin));
  }
}
