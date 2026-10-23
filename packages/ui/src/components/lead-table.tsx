import { Button } from "@keyloop-interview/ui/components/button"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@keyloop-interview/ui/components/table"

type Lead = { id: string; customer: string; type: string }

function LeadTable({ leads, onView }: { leads: Lead[]; onView: (lead: Lead) => void }) {
  return (
    <Table>
      <TableCaption>Sample leads · preview data only</TableCaption>
      <TableHeader><TableRow>
        <TableHead scope="col">Customer name</TableHead>
        <TableHead scope="col">Lead type</TableHead>
        <TableHead scope="col" className="text-right">Action</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {leads.length === 0 && <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No leads to display.</TableCell></TableRow>}
        {leads.map(lead => <TableRow key={lead.id}>
          <TableCell className="font-medium">{lead.customer}</TableCell>
          <TableCell>{lead.type}</TableCell>
          <TableCell className="text-right"><Button variant="link" size="sm" aria-label={`View ${lead.customer}`} onClick={() => onView(lead)}>View</Button></TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  )
}

export { LeadTable, type Lead }
