import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { FileSearch, FileText, LoaderCircle, Search } from "lucide-react";
import { Button } from "@keyloop-interview/ui/components/button";
import { Input } from "@keyloop-interview/ui/components/input";
import { Label } from "@keyloop-interview/ui/components/label";
import { Badge } from "@keyloop-interview/ui/components/badge";
import { Card, CardContent } from "@keyloop-interview/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@keyloop-interview/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keyloop-interview/ui/components/table";
import {
  DEMO_VIN,
  documentDate,
  normalizeVin,
  searchDocuments,
  type DocumentSearchResult,
  type VehicleDocument,
} from "./documents-api";
import "./documents.css";

const primary = "bg-[image:var(--kl-gradient-operate)] hover:opacity-90";
export function DocumentsDashboard() {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? false : { opacity: 0, y: 8 };
  const transition = {
    duration: reduceMotion ? 0 : 0.24,
    ease: "easeOut" as const,
  };
  const [vin, setVin] = useState("");
  const [result, setResult] = useState<DocumentSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<VehicleDocument | null>(null);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const previewTrigger = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const previous = document.title;
    document.title = "Unified Document Viewer · Keyloop";
    void search("");
    return () => {
      document.title = previous;
      generation.current++;
      request.current?.abort();
    };
  }, []);
  async function search(value: string) {
    const sequence = ++generation.current;
    request.current?.abort();
    setError("");
    setResult(null);
    setPreview(null);
    setLoading(false);
    let normalized: string;
    try {
      normalized = value.trim() ? normalizeVin(value) : "";
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Enter a valid VIN.",
      );
      return;
    }
    setVin(normalized);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const next = await searchDocuments(normalized, controller.signal);
      if (generation.current === sequence) setResult(next);
    } catch (failure) {
      if (generation.current === sequence)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to search documents. Please try again.",
        );
    } finally {
      if (generation.current === sequence) setLoading(false);
    }
  }
  const unavailable = result
    ? Object.keys(result.sources).filter(
        (source) => result.sources[source].status === "unavailable",
      )
    : [];
  return (
    <>
      <m.header
        className="admin-header"
        initial={entrance}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <div>
          <p className="admin-eyebrow">OPERATE / DOCUMENTS</p>
          <h1>Unified Document Viewer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vehicle documents from your connected systems.
          </p>
        </div>
      </m.header>
      <m.div
        initial={entrance}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <Card className="admin-board gap-0 py-0">
          <CardContent className="space-y-6 p-4 sm:p-6">
            <form
              className="document-search"
              onSubmit={(event) => {
                event.preventDefault();
                void search(vin);
              }}
            >
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="document-vin">
                  Vehicle identification number (VIN)
                </Label>
                <Input
                  ref={input}
                  id="document-vin"
                  value={vin}
                  maxLength={64}
                  onChange={(event) => setVin(event.target.value)}
                  placeholder="Enter a VIN to filter documents"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="document-vin-help"
                />
              </div>
              <Button type="submit" className={primary}>
                {loading ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                Search documents
              </Button>
              <p
                id="document-vin-help"
                className="document-search-help text-xs text-muted-foreground"
              >
                Filter by a 17-character VIN, or leave blank to show all.{" "}
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-1"
                  aria-label="Use example VIN"
                  onClick={() => void search(DEMO_VIN)}
                >
                  Use example VIN
                </Button>{" "}
                <span className="font-mono">{DEMO_VIN}</span>
              </p>
            </form>
            {error && (
              <div role="alert" className="document-warning">
                <p>{error}</p>
                <Button variant="outline" onClick={() => void search(vin)}>
                  Retry search
                </Button>
              </div>
            )}
            {loading && (
              <div role="status" className="document-empty">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                <p>Loading documents…</p>
              </div>
            )}
            {result && (
              <section
                aria-label="Document search results"
                className="space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading font-semibold">
                      {result.vin ? "Vehicle documents" : "All documents"}
                    </h2>
                    <p className="mt-1 break-all font-mono text-sm text-muted-foreground">
                      {result.vin ?? "All vehicles"}
                    </p>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label="Document source counts"
                  >
                    {result.vin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void search("")}
                      >
                        Show all documents
                      </Button>
                    )}
                    {Object.keys(result.sources).map((source) => (
                      <Badge key={source} variant="outline">
                        {result.sources[source].label} ·{" "}
                        {result.sources[source].status === "ok"
                          ? result.sources[source].count
                          : "Unavailable"}
                      </Badge>
                    ))}
                  </div>
                </div>
                {!!unavailable.length && (
                  <p role="alert" className="document-warning">
                    {unavailable
                      .map((source) => result.sources[source].label)
                      .join(" and ")}{" "}
                    unavailable.{" "}
                    {result.documents.length
                      ? "Showing documents from the available systems."
                      : "No documents were returned by the available systems."}
                  </p>
                )}
                {result.documents.length ? (
                  <>
                    <Table aria-label="Vehicle documents">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Issued</TableHead>
                          <TableHead>Source system</TableHead>
                          <TableHead>
                            <span className="sr-only">Preview</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.documents.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileText
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <div>
                                  <p className="font-medium">{doc.title}</p>
                                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {doc.vin}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{doc.type}</TableCell>
                            <TableCell>
                              <time dateTime={doc.issuedAt}>
                                {documentDate(doc.issuedAt)}
                              </time>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {result.sources[doc.source].label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                className={primary}
                                aria-label={`Preview ${doc.title} from ${result.sources[doc.source].label}`}
                                onClick={(event) => {
                                  previewTrigger.current = event.currentTarget;
                                  setPreview(doc);
                                }}
                              >
                                View document
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground">
                      {result.documents.length} documents · Newest first
                    </p>
                  </>
                ) : (
                  <div className="document-empty">
                    <FileSearch aria-hidden="true" />
                    <h3>
                      {unavailable.length
                        ? "Search results are incomplete."
                        : result.vin
                          ? "No documents found for this VIN."
                          : "No documents available."}
                    </h3>
                    <p>
                      {unavailable.length
                        ? "Try the search again to check all systems."
                        : result.vin
                          ? "No connected system returned documents for this vehicle."
                          : "No connected system returned documents."}
                    </p>
                  </div>
                )}
              </section>
            )}
          </CardContent>
        </Card>
      </m.div>
      <footer className="admin-page-footer">
        <span>Keyloop · Operate</span>
        <span>Fictional documents from connected demonstration systems.</span>
      </footer>
      {preview && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        >
          <DialogContent
            className="document-preview-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (previewTrigger.current?.isConnected
                ? previewTrigger.current
                : input.current
              )?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{preview.title}</DialogTitle>
              <DialogDescription>
                {result?.sources[preview.source]?.label ?? preview.source} ·{" "}
                {documentDate(preview.issuedAt)}
                <br />
                <span className="break-all font-mono">{preview.vin}</span>
              </DialogDescription>
            </DialogHeader>
            <article className="document-paper">
              <p className="document-watermark">DEMO DOCUMENT</p>
              <pre>{preview.content}</pre>
            </article>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Close preview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
