import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
import db from '../dist/database/data-source.js';
import {BookingsService} from '../dist/bookings/bookings.service.js';
import {ScheduleRules,readSchedule} from '../dist/bookings/schedule-rules.js';
const path='/Users/kai/works/side-project/keyloop-interview/exports/booking-locks-e2e-results.json';
const report=existsSync(path)?JSON.parse(await readFile(path,'utf8')):{cases:[]};
const url=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='55322'&&url.pathname==='/postgres','Only current local application DB allowed');
const mode=process.argv[2];assert(['baseline','run','verify-browser','cleanup'].includes(mode));
const api='http://127.0.0.1:3006';
const rules=new ScheduleRules(readSchedule());
await db.initialize();const service=new BookingsService(db,rules);
const save=()=>writeFile(path,JSON.stringify(report,null,2)+'\n');
async function snapshot(){const result={};for(const table of ['users','vehicles','booking_vehicles','service_bookings','account','session']){const [row]=await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM public.${table} t`);result[table]=row}return result}
async function test(name,fn){try{report.cases.push({name,status:'PASS',evidence:await fn()})}catch(error){report.cases.push({name,status:'FAIL',error:error.message});process.exitCode=1}await save()}
let oil,inspection;
function starts(hour,date=report.date){return DateTime.fromISO(date+'T'+String(hour).padStart(2,'0')+':00',{zone:rules.schedule.timeZone}).toUTC().toISO()}
function input(tag,hour,serviceTypeId=oil,date=report.date){return {name:'Booking Locks E2E '+tag,email:report.runId+'-'+tag+'@example.com',phoneNumber:'+84901234567',registrationNumber:'LOCK-'+tag,serviceTypeId,startsAt:starts(hour,date)}}
async function post(tag,hour,serviceTypeId=oil,date=report.date){const requestKey=randomUUID();(report.creationKeys??=[]).push(requestKey);await save();const response=await fetch(api+'/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(input(tag,hour,serviceTypeId,date))});return {status:response.status,body:await response.json()}}
try{
 if(mode==='baseline'){assert(!report.runId,'Use a fresh report for a new run');report.before=await snapshot();await save()}
 if(mode==='run'){
  assert(!report.runId,'Use a new baseline report for another run');assert.deepEqual(await snapshot(),report.before);
  const catalog=await service.adminCatalog();oil=catalog.services.find(row=>row.name==='Oil change').id;inspection=catalog.services.find(row=>row.name==='Inspection').id;
  assert.equal(catalog.technicians.filter(row=>row.services.includes(oil)).length,1);
  let day=DateTime.now().setZone(rules.schedule.timeZone).startOf('day').plus({days:4});
  for(let attempt=0;attempt<30;attempt++,day=day.plus({days:1})){
   const next=day.plus({days:1});const [row]=await db.query('SELECT count(*)::int AS count FROM public.service_bookings WHERE starts_at >= $1 AND starts_at < $2',[day.toJSDate(),day.plus({days:2}).toJSDate()]);
   if(rules.schedule.hours[day.weekday-1]?.open==='09:00'&&rules.schedule.hours[next.weekday-1]?.open==='09:00'&&!row.count)break;
  }
  assert.equal((await db.query("SELECT to_regclass('public.resource_slots') AS obsolete"))[0].obsolete,null);
  report.date=day.toISODate();report.nextDate=day.plus({days:1}).toISODate();report.runId='booking-locks-'+randomUUID();report.timeZone=rules.schedule.timeZone;report.services={oil,inspection};await save();
  let first;
  await test('HTTP auto matching persists qualified independent resource pairs',async()=>{const a=await post('oil',9),b=await post('inspection',9,inspection);assert.equal(a.status,201);assert.equal(b.status,201);first=(await service.listBookings(report.date)).find(row=>row.id===a.body.id);const rows=await db.query('SELECT b.id,b.technician_id,b.service_bay_id,EXISTS(SELECT 1 FROM public.technician_service_types q WHERE q.technician_id=b.technician_id AND q.service_type_id=b.service_type_id) AS qualified FROM public.service_bookings b WHERE b.id=ANY($1::uuid[])',[[a.body.id,b.body.id]]);assert(rows.every(row=>row.qualified));assert.equal(new Set(rows.map(row=>row.technician_id)).size,2);assert.equal(new Set(rows.map(row=>row.service_bay_id)).size,2);return {http:[201,201],qualified:true,distinctResources:true}});
  await test('Ten simultaneous confirmations produce one winner',async()=>{const results=await Promise.all(Array.from({length:10},(_,i)=>post('race-'+i,10)));assert.equal(results.filter(row=>row.status===201).length,1);assert.equal(results.filter(row=>row.status===409).length,9);return {requests:10,http201:1,http409:9}});
  await test('Reschedule rolls back conflicts, rejects stale versions and cancellation releases capacity',async()=>{const moved=await service.reschedule(first.id,{startsAt:starts(14),expectedVersion:first.version});assert.equal(moved.version,2);await assert.rejects(()=>service.reschedule(first.id,{startsAt:starts(10),expectedVersion:2}),{status:409});assert.equal((await service.listBookings(report.date)).find(row=>row.id===first.id).time,'14:00');await assert.rejects(()=>service.changeStatus(first.id,{status:'CANCELLED',expectedVersion:1}),{status:409});await service.changeStatus(first.id,{status:'CANCELLED',expectedVersion:2});const replacement=await post('replacement',14);assert.equal(replacement.status,201);return {version:2,occupiedMoveHttp:409,staleEditHttp:409,rebookHttp:201}});
  await test('Racing reschedule and create cannot share destination',async()=>{const source=await service.createAdmin(input('move-source',11));const results=await Promise.allSettled([service.reschedule(source.id,{startsAt:starts(12),expectedVersion:1}),post('move-racer',12).then(row=>{if(row.status!==201)throw Object.assign(new Error('conflict'),{status:row.status});return row})]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.status,409);return {winners:1,conflicts:1}});
  await test('Resource locks serialize different hours and dates for the same technician',async()=>{
   const tech=catalog.technicians.find(row=>row.services.includes(oil)).id;
   const runner=db.createQueryRunner();await runner.connect();await runner.startTransaction();
   let pending;let waiters=0;let results;
   try{
    await runner.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[tech]);
    pending=Promise.all([post('waiting-row',15),post('other-hour',16),post('other-date',15,oil,report.nextDate)]);
    for(let attempt=0;attempt<100;attempt++){
     const [row]=await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='appointment-scheduler' AND wait_event_type='Lock' AND query LIKE '%public.users%FOR UPDATE%'");
     waiters=row.count;if(waiters>=3)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert(waiters>=3,'Expected three waiting resource-row writes');
   }finally{await runner.commitTransaction();await runner.release();if(pending)results=await pending}
   assert(results.every(row=>row.status===201));return {observedResourceWaiters:waiters,http:[201,201,201]}
  });
  await test('Service and completion statuses retain occupied slots',async()=>{const row=await service.createAdmin(input('status',9,oil,report.nextDate));await service.changeStatus(row.id,{status:'IN_SERVICE',expectedVersion:1});await service.changeStatus(row.id,{status:'COMPLETED',expectedVersion:2});assert.equal((await post('status-busy',9,oil,report.nextDate)).status,409);return {completedVersion:3,occupiedHttp:409}});
  await test('Occupancy exists only in booking records',async()=>{assert.equal((await db.query("SELECT to_regclass('public.resource_slots') AS obsolete"))[0].obsolete,null);return {resourceSlotsRemoved:true}});
 }
 if(mode==='verify-browser')await test('Browser guest booking persists assigned resources',async()=>{const rows=await db.query('SELECT b.* FROM public.service_bookings b WHERE submitted_email=$1',[report.runId+'-browser@example.com']);assert.equal(rows.length,1);assert.equal(rows[0].starts_at.toISOString(),starts(13));assert(rows[0].technician_id&&rows[0].service_bay_id);return {bookingId:rows[0].id,slotHour:13}});
 if(mode==='cleanup'){
  report.cleanup=await db.transaction(async manager=>{await manager.query("SELECT set_config('scheduler.timezone',$1,true)",[report.timeZone]);const pattern=report.runId+'-%@example.com';await manager.query("DELETE FROM public.booking_requests WHERE scope='guest' AND key=ANY($1::uuid[])",[report.creationKeys??[]]);const deleted=await manager.query('DELETE FROM public.service_bookings WHERE submitted_email LIKE $1 RETURNING id',[pattern]);await manager.query('DELETE FROM public.booking_vehicles v USING public.users u WHERE v.user_id=u.id AND u.email LIKE $1 AND NOT EXISTS(SELECT 1 FROM public.service_bookings b WHERE b.vehicle_id=v.id)',[pattern]);await manager.query('DELETE FROM public.users u WHERE u.email LIKE $1 AND NOT EXISTS(SELECT 1 FROM public.booking_vehicles v WHERE v.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM public.service_bookings b WHERE b.user_id=u.id)',[pattern]);return {bookings:deleted[0]?.length??deleted.length}});report.after=await snapshot();report.cleanup.originalDataUnchanged=JSON.stringify(report.before)===JSON.stringify(report.after);await save();assert(report.cleanup.originalDataUnchanged,'Original data changed');
 }
 await save();console.log(JSON.stringify({mode,date:report.date,runId:report.runId,cases:report.cases.map(({name,status,error})=>({name,status,error})),cleanup:report.cleanup}));
}finally{await db.destroy()}
