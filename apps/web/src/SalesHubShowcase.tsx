import { useRef, useState } from "react"
import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@keyloop-interview/ui/components/accordion"
import { Badge } from "@keyloop-interview/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@keyloop-interview/ui/components/card"
import { CurrencyInput } from "@keyloop-interview/ui/components/currency-input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@keyloop-interview/ui/components/dialog"
import { Label } from "@keyloop-interview/ui/components/label"
import { LeadTable, type Lead } from "@keyloop-interview/ui/components/lead-table"
import { MetricCard } from "@keyloop-interview/ui/components/metric-card"
import { SliderField } from "@keyloop-interview/ui/components/slider-field"

const leads: Lead[] = [
  { id: "SH-001", customer: "Alex Morgan", type: "Vehicle enquiry" },
  { id: "SH-002", customer: "Jamie Taylor", type: "Test drive" },
  { id: "SH-003", customer: "Sam Williams", type: "Part exchange" },
]

export function SalesHubShowcase() {
  const [leadCount, setLeadCount] = useState(5000)
  const [sales, setSales] = useState(250)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const leadTrigger = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()

  return (
    <m.section id="sales-hub" aria-labelledby="sales-hub-title" className="scroll-mt-8 space-y-6"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}>
      <div className="space-y-3">
        <Badge className="border-0 text-foreground" style={{ background: "linear-gradient(to right, #2792ff, #42b7ff, #12c6ff)" }}>DEMAND · SALES HUB</Badge>
        <h2 id="sales-hub-title" className="text-2xl font-bold">More patterns from Sales Hub</h2>
        <p className="max-w-3xl text-muted-foreground">Calculator controls, metric cards, FAQ rows and a compact lead table adapted from the <a className="underline underline-offset-4" href="https://keyloop.com/sales-hub" target="_blank" rel="noreferrer">public Sales Hub page</a>.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="rounded-xl lg:col-span-3">
          <CardHeader><CardTitle>Slider & currency fields</CardTitle><CardDescription>Type a number or use the slider. Out-of-range numbers are corrected when you leave the field.</CardDescription></CardHeader>
          <CardContent className="space-y-7">
            <SliderField id="monthly-leads" label="Monthly leads" min={500} max={10000} value={leadCount} onValueChange={setLeadCount} />
            <SliderField id="monthly-sales" label="Monthly vehicle sales" min={0} max={500} value={sales} onValueChange={setSales} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="average-profit">Average profit (GBP)</Label><CurrencyInput id="average-profit" currency="£" defaultValue="1500" aria-describedby="currency-help" /></div>
              <div className="grid gap-2"><Label htmlFor="cost-per-lead">Cost per lead (GBP)</Label><CurrencyInput id="cost-per-lead" currency="£" defaultValue="200" aria-describedby="currency-help" /></div>
            </div>
            <p id="currency-help" className="text-sm text-muted-foreground">Currency prefix, decimal entry and right-aligned amounts. These fields do not calculate a return.</p>
          </CardContent>
        </Card>
        <aside aria-label="Example metrics" className="space-y-4 rounded-xl bg-foreground p-6 text-background lg:col-span-2 sm:p-8">
          <h3 className="text-lg font-semibold">Metric cards</h3>
          <MetricCard label="Example pipeline value" value="£375,000" description="Static sample amount" className="border-white/15 bg-white/5 text-white" />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Monthly leads" value={leadCount.toLocaleString("en-GB")} className="rounded-lg border-white/15 bg-white/5 p-4 text-white" />
            <MetricCard label="Vehicle sales" value={sales} className="rounded-lg border-white/15 bg-white/5 p-4 text-white" />
          </div>
          <p className="text-sm text-white/80">Sample data for component inspection. No Sales Hub ROI formula is reproduced.</p>
        </aside>
      </div>

      <Card>
        <CardHeader><CardTitle>Lead table</CardTitle><CardDescription>A compact table based on the dashboard artwork. View opens local sample details.</CardDescription></CardHeader>
        <CardContent><LeadTable leads={leads} onView={lead => {
          leadTrigger.current = document.activeElement as HTMLElement
          setSelectedLead(lead)
        }} /></CardContent>
      </Card>
      <Dialog open={selectedLead !== null} onOpenChange={open => { if (!open) setSelectedLead(null) }}>
        <AnimatePresence>
          {selectedLead && <DialogContent key="lead-details" forceMount aria-modal="true" onCloseAutoFocus={event => {
            event.preventDefault()
            leadTrigger.current?.focus()
          }}>
            <DialogHeader><DialogTitle>{selectedLead.customer}</DialogTitle><DialogDescription>Sample lead details. No customer data is fetched or saved.</DialogDescription></DialogHeader>
            <dl className="grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">Reference</dt><dd>{selectedLead.id}</dd><dt className="text-muted-foreground">Lead type</dt><dd>{selectedLead.type}</dd></dl>
          </DialogContent>}
        </AnimatePresence>
      </Dialog>

      <Card>
        <CardHeader><CardTitle><h3 className="font-heading text-2xl leading-8 font-semibold">Frequently asked questions</h3></CardTitle><CardDescription>Expandable rows with blue chevrons. Example copy for this library.</CardDescription></CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="source"><AccordionTrigger>Where do these patterns come from?</AccordionTrigger><AccordionContent>The slider, currency field, result cards and FAQ layout are informed by the public Sales Hub website. The lead table is an adaptation of its dashboard artwork.</AccordionContent></AccordionItem>
            <AccordionItem value="controls"><AccordionTrigger>Can I use these controls with a keyboard?</AccordionTrigger><AccordionContent>Yes. Use Tab to focus controls, arrow keys to change sliders or move between FAQ headings, and Enter or Space to expand a question.</AccordionContent></AccordionItem>
            <AccordionItem value="data"><AccordionTrigger>Does this preview save any data?</AccordionTrigger><AccordionContent>No. All lead details and amounts are examples. Slider changes remain in this preview and reset when the page reloads.</AccordionContent></AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </m.section>
  )
}
