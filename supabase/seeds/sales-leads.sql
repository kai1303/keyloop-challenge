insert into public.sales_leads
  (id, customer_name, email, phone, vehicle_interest, enquiry, source, received_at)
values
  ('10000000-0000-4000-8000-000000000001', 'Alex Morgan',
   'alex@example.com', '+84 900 000 001', 'Toyota Corolla Hybrid',
   E'Can I test-drive the Corolla on Saturday?\nI would also like to discuss a part exchange.',
   'Dealership website', now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000002', 'Jamie Taylor',
   'jamie@example.com', '+84 900 000 002', 'Kia Sportage',
   'Please send details about the automatic Sportage and its service history.',
   'Dealership website', now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000003', 'Sam Williams',
   'sam@example.com', '+84 900 000 003', 'Volkswagen Golf',
   'I am comparing the Golf with the Corolla. Please call after 16:00 to discuss finance and arrange a viewing next week. I need space for a child seat and would like to check the boot capacity during the visit.',
   'Dealership website', now() - interval '3 days')
on conflict (id) do nothing;

insert into public.sales_lead_activities (id, lead_id, note, created_at)
values
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   'Called customer. Left a voicemail.', now() - interval '20 hours'),
  ('20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002',
   'Customer called back. Sent the service history.', now() - interval '18 hours')
on conflict (id) do nothing;
