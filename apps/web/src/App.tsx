import { useState } from "react"
import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { Badge } from "@keyloop-interview/ui/components/badge"
import { Button } from "@keyloop-interview/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@keyloop-interview/ui/components/card"
import { Checkbox } from "@keyloop-interview/ui/components/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@keyloop-interview/ui/components/dialog"
import { Input } from "@keyloop-interview/ui/components/input"
import { Label } from "@keyloop-interview/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@keyloop-interview/ui/components/select"
import { Textarea } from "@keyloop-interview/ui/components/textarea"
import { Switch } from "@keyloop-interview/ui/components/switch"
import { Toggle } from "@keyloop-interview/ui/components/toggle"
import catalogue from "@keyloop-interview/design-system/products.json"
import { SalesHubShowcase } from "./SalesHubShowcase"

export default function App() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dealership, setDealership] = useState("Northside Motors")
  const [recordSelection, setRecordSelection] = useState<boolean | "indeterminate">("indeterminate")
  const reduceMotion = useReducedMotion()
  const entrance = reduceMotion ? false : { opacity: 0, y: 12 }

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-9 sm:py-14">
      <m.header initial={entrance} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.22em] uppercase">Keyloop DMS · Component library</p>
        <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">Familiar controls.<br />One consistent system.</h1>
        <p className="text-lg text-muted-foreground">shadcn/ui components with Keyloop typography, blue actions, soft corners and the Operate accent.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1">React + shadcn/ui + Motion</Badge>
          <Badge className="border-0 px-3 py-1 text-foreground" style={{ background: "var(--kl-gradient-operate)" }}>OPERATE</Badge>
        </div>
      </m.header>

      <m.section initial={entrance} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} aria-labelledby="inputs-title" className="space-y-5">
        <div><h2 id="inputs-title" className="text-2xl font-bold">Inputs & form controls</h2><p className="mt-2 text-muted-foreground">Default, filled, disabled and invalid states, with labels and help text.</p></div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Text fields</CardTitle><CardDescription>Focus a field to inspect its keyboard focus ring.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2"><Label htmlFor="customer-name">Customer name</Label><Input id="customer-name" placeholder="e.g. Alex Morgan" autoComplete="name" /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" defaultValue="alex@example.com" autoComplete="email" /></div>
              <div className="grid gap-2"><Label htmlFor="reference">Read-only reference</Label><Input id="reference" value="DMS-00241" readOnly aria-describedby="reference-help" /><p id="reference-help" className="text-sm text-muted-foreground">This value can be selected and copied.</p></div>
              <div className="grid gap-2"><Label htmlFor="disabled-name">Disabled field</Label><Input id="disabled-name" defaultValue="Managed by your administrator" disabled /></div>
              <div className="grid gap-2"><Label htmlFor="invalid-email">Invalid email example</Label><Input id="invalid-email" type="email" defaultValue="alex@" aria-invalid="true" aria-describedby="email-error" /><p id="email-error" className="text-sm text-destructive">Enter a complete email address.</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Selection & notes</CardTitle><CardDescription>Use the keyboard or pointer to explore the controls.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2"><Label htmlFor="dms-product">DMS product</Label><Select defaultValue="Drive"><SelectTrigger id="dms-product" className="w-full"><SelectValue placeholder="Choose a DMS product" /></SelectTrigger><SelectContent>{catalogue.products.map(product => <SelectItem key={product.name} value={product.name}>{product.name}</SelectItem>)}</SelectContent></Select><p className="text-sm text-muted-foreground">The nine products listed on the public DMS page.</p></div>
              <div className="grid gap-2"><Label htmlFor="notes">Internal notes</Label><Textarea id="notes" placeholder="Add context for your team…" rows={4} /></div>
            </CardContent>
          </Card>
        </div>
      </m.section>

      <m.section initial={entrance} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} aria-labelledby="selection-title" className="space-y-5">
        <div><h2 id="selection-title" className="text-2xl font-bold">Checkboxes, switches & toggles</h2><p className="mt-2 text-muted-foreground">Select options, turn settings on or off, and press a button to keep it active.</p></div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Checkbox</CardTitle><CardDescription>Unchecked, checked, mixed, disabled and invalid states.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3"><Checkbox id="updates" /><Label htmlFor="updates">Receive product updates</Label></div>
              <div className="flex items-start gap-3"><Checkbox id="reminders" defaultChecked aria-describedby="reminders-help" /><div className="grid gap-1"><Label htmlFor="reminders">Service reminders</Label><p id="reminders-help" className="text-sm text-muted-foreground">Include this customer in the reminder list.</p></div></div>
              <div className="flex items-center gap-3"><Checkbox id="selected-records" checked={recordSelection} onCheckedChange={setRecordSelection} /><Label htmlFor="selected-records">Some records selected</Label></div>
              <div className="flex items-center gap-3"><Checkbox id="locked" disabled /><Label htmlFor="locked">Administrator-only option</Label></div>
              <div className="flex items-center gap-3"><Checkbox id="required-policy" defaultChecked disabled /><Label htmlFor="required-policy">Required by organisation policy</Label></div>
              <div className="grid gap-2"><div className="flex items-center gap-3"><Checkbox id="invalid-consent" aria-invalid="true" aria-describedby="consent-error" /><Label htmlFor="invalid-consent">Invalid state example</Label></div><p id="consent-error" className="text-sm text-destructive">Confirm customer consent before continuing.</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Switch</CardTitle><CardDescription>On/off settings with an animated thumb.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4"><Label htmlFor="automatic-updates">Automatic updates</Label><Switch id="automatic-updates" defaultChecked /></div>
              <div className="flex items-center justify-between gap-4"><Label htmlFor="email-notifications">Email notifications</Label><Switch id="email-notifications" /></div>
              <div className="flex items-center justify-between gap-4"><Label htmlFor="managed-setting">Managed setting</Label><Switch id="managed-setting" defaultChecked disabled /></div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Toggle button</CardTitle><CardDescription>Independent pressed buttons for optional modes and actions.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Toggle defaultPressed aria-label="Pin customer">Pin customer</Toggle>
              <Toggle variant="outline" aria-label="Compact view">Compact view</Toggle>
              <Toggle variant="outline" aria-label="Locked view" disabled>Locked view</Toggle>
            </CardContent>
          </Card>
        </div>
      </m.section>

      <m.section initial={entrance} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} aria-labelledby="dialog-section-title" className="space-y-5">
        <div><h2 id="dialog-section-title" className="text-2xl font-bold">Modal / dialog</h2><p className="mt-2 text-muted-foreground">A labelled dialog with keyboard focus management, Escape to close and a validated form.</p></div>
        <Card>
          <CardHeader><CardTitle>Dealership details</CardTitle><CardDescription>Try changing the name. Changes stay in this preview and reset on refresh.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-5">
            <div aria-live="polite"><m.p key={dealership} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-semibold">{dealership}</m.p><p className="text-sm text-muted-foreground">Drive · Dealership profile</p></div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button>Edit dealership</Button></DialogTrigger>
              <AnimatePresence>
                {dialogOpen && (
                  <DialogContent key="dealership-dialog" forceMount aria-modal="true">
                    <DialogHeader><DialogTitle>Edit dealership details</DialogTitle><DialogDescription>Update the display name in this preview. Nothing is sent to a server.</DialogDescription></DialogHeader>
                    <form className="space-y-6" onSubmit={event => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      setDealership(String(data.get("dealership")).trim())
                      setDialogOpen(false)
                    }}>
                      <div className="grid gap-2"><Label htmlFor="dealership">Dealership name</Label><Input id="dealership" name="dealership" defaultValue={dealership} required minLength={2} maxLength={100} pattern=".*\S.*" title="Enter a dealership name with at least one non-space character." /></div>
                      <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit">Save changes</Button></DialogFooter>
                    </form>
                  </DialogContent>
                )}
              </AnimatePresence>
            </Dialog>
          </CardContent>
        </Card>
      </m.section>

      <SalesHubShowcase />

      <footer className="border-t pt-6 text-sm text-muted-foreground">Brand styles come from the public Keyloop DMS website. Form states and modal layouts are proposed UI patterns built with shadcn/ui, rather than verified internal DMS screens.</footer>
    </main>
  )
}
