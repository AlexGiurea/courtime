import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Loading, useGuarded, useToast } from "../ui";
import { formatDateLong } from "../lib/time";

const MODELS = [
  { id: "gpt-5.6-luna", label: "Luna — fastest, cheapest", note: "$1 / $6 per M tokens" },
  { id: "gpt-5.6-terra", label: "Terra — balanced", note: "$2.50 / $15 per M tokens" },
  { id: "gpt-5.6-sol", label: "Sol — most accurate", note: "$5 / $30 per M tokens" },
];

const STATUS_COPY: Record<string, string> = {
  queued: "Waiting",
  extracting: "Reading the page",
  verifying: "Checking the read",
  needs_review: "Ready for review",
  confirmed: "Published",
  failed: "Could not read",
};

export default function ImportPage({ session }: { session: SessionWithClub }) {
  const { batchId } = useParams();
  return batchId ? (
    <BatchView batchId={batchId as Id<"importBatches">} />
  ) : (
    <UploadView session={session} />
  );
}

function UploadView({ session }: { session: SessionWithClub }) {
  const generateUploadUrl = useMutation(api.imports.generateUploadUrl);
  const createBatch = useMutation(api.imports.createBatch);
  const batches = useQuery(api.imports.listBatches);
  const navigate = useNavigate();
  const guarded = useGuarded();
  const notify = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      notify("Those files aren't photos — pick images of the schedule pages.", "error");
      return;
    }
    if (images.length > 60) {
      notify("Import up to 60 pages at a time.", "error");
      return;
    }

    setProgress({ done: 0, total: images.length });
    const pages: { storageId: Id<"_storage">; fileName: string }[] = [];

    try {
      for (const file of images) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
        pages.push({ storageId, fileName: file.name });
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    } catch (error) {
      setProgress(null);
      notify(error instanceof Error ? error.message : "Upload failed", "error");
      return;
    }

    const result = await guarded(() => createBatch({ pages, model }));
    setProgress(null);
    if (result) navigate(`/desk/import/${result.batchId}`);
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Import from photos</h1>
          <p>
            Photograph the pages of the book, drop them here, and check the read before
            anything reaches the schedule.
          </p>
        </div>
      </div>

      <div className="stack">
        <div
          className={`dropzone${over ? " over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          {progress ? (
            <>
              <h3>
                Uploading {progress.done} of {progress.total}
              </h3>
              <div className="progress" style={{ maxWidth: 260, margin: "12px auto 0" }}>
                <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <h3>Drop schedule photos here</h3>
              <p>
                Or click to choose them. One photo per day-page — up to 60 at a time.
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>How carefully should it read?</h2>
              <p>
                Dense, scribbled pages are worth the slower model. Sparse pages with a
                few advance bookings are not.
              </p>
            </div>
          </div>
          <div className="rows">
            {MODELS.map((option) => (
              <label className="row" key={option.id} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="model"
                  checked={model === option.id}
                  onChange={() => setModel(option.id)}
                />
                <span className="grow">
                  <span className="title">{option.label}</span>
                  <span className="sub">{option.note}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Recent imports</h2>
              <p>Every published booking keeps a link back to the page it came from.</p>
            </div>
          </div>
          {batches === undefined ? (
            <Loading label="" />
          ) : batches.length ? (
            <div className="rows">
              {batches.map((item) => (
                <div className="row" key={item._id as string}>
                  <span className="grow">
                    <span className="title">
                      {item.pageCount} page{item.pageCount === 1 ? "" : "s"} ·{" "}
                      {item.model}
                    </span>
                    <span className="sub">
                      {item.confirmedCount} published · ${item.costUsd.toFixed(4)} ·{" "}
                      {new Date(item._creationTime).toLocaleDateString()}
                    </span>
                  </span>
                  <Link className="btn sm" to={`/desk/import/${item._id}`}>
                    Open
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">
              Nothing imported yet. The club's paper book is still the only copy.
            </p>
          )}
        </div>

        <p className="muted" style={{ fontSize: 12 }}>
          Courtime never publishes what it reads. Every page waits for a person to
          confirm it — {session.org.name} sees only what you approve.
        </p>
      </div>
    </div>
  );
}

function BatchView({ batchId }: { batchId: Id<"importBatches"> }) {
  const data = useQuery(api.imports.batch, { batchId });
  const retryPage = useMutation(api.imports.retryPage);
  const discardPage = useMutation(api.imports.discardPage);
  const guarded = useGuarded();

  if (data === undefined) return <Loading label="Loading the batch" />;
  if (data === null) {
    return (
      <div className="page narrow">
        <p className="empty">That import batch isn't available.</p>
      </div>
    );
  }

  const { batch, pages } = data;
  const done = pages.filter((p) => p.status === "confirmed").length;
  const working = pages.filter(
    (p) => p.status === "queued" || p.status === "extracting" || p.status === "verifying",
  ).length;

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </h1>
          <p>
            {working
              ? `${working} still being read — this page updates itself.`
              : "Every page has been read. Check each one, then publish it."}
          </p>
        </div>
        <Link className="btn" to="/desk/import">
          New import
        </Link>
      </div>

      <div className="stack">
        <div className="card card-pad">
          <div className="progress">
            <div style={{ width: `${pages.length ? (done / pages.length) * 100 : 0}%` }} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
            {done} of {pages.length} published · read with {batch.model} · cost so far $
            {batch.costUsd.toFixed(4)} ({batch.inputTokens.toLocaleString()} in /{" "}
            {batch.outputTokens.toLocaleString()} out)
          </p>
        </div>

        <div className="card">
          <div className="rows">
            {pages.map((page) => {
              const flagged =
                page.draftEntries?.filter((entry) => entry.confidence === "low").length ??
                0;
              return (
                <div className="row" key={page._id as string}>
                  <span className="grow">
                    <span className="title">{page.fileName}</span>
                    <span className="sub">
                      {STATUS_COPY[page.status] ?? page.status}
                      {page.detectedDate ? ` · ${formatDateLong(page.detectedDate)}` : ""}
                      {page.draftEntries
                        ? ` · ${page.draftEntries.length} booking${page.draftEntries.length === 1 ? "" : "s"}`
                        : ""}
                      {flagged ? ` · ${flagged} to check` : ""}
                      {page.error ? ` · ${page.error}` : ""}
                    </span>
                  </span>

                  {page.status === "queued" ||
                  page.status === "extracting" ||
                  page.status === "verifying" ? (
                    <span className="spinner" />
                  ) : null}

                  {flagged ? <span className="tag warn">{flagged} flagged</span> : null}

                  {page.status === "needs_review" ? (
                    <Link className="btn sm primary" to={`/desk/review/${page._id}`}>
                      Review
                    </Link>
                  ) : null}

                  {page.status === "confirmed" ? <span className="tag accent">Published</span> : null}

                  {page.status === "failed" ? (
                    <button
                      className="btn sm"
                      onClick={() => void guarded(() => retryPage({ pageId: page._id }))}
                    >
                      Try again
                    </button>
                  ) : null}

                  {page.status !== "confirmed" ? (
                    <button
                      className="btn sm ghost"
                      onClick={() => void guarded(() => discardPage({ pageId: page._id }))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
