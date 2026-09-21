"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import { FileUploadField } from "@/components/data-table/file-upload-field";
import { OtherAwareSelect, type MasterRow } from "@/components/data-table/other-aware-select";
import type { MasterColumn } from "@/lib/navigation";

const PHOTO_COLUMN: MasterColumn = { key: "photo", label: "Photo", fileKind: "image", uploadKind: "staff-photo" };
const RESUME_COLUMN: MasterColumn = { key: "resume", label: "Resume", fileKind: "document", uploadKind: "staff-resume" };

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v }));

/**
 * Real audit finding, 2026-09-12: Sanctioned Post, Level (Pay Band), Discipline
 * and Category each had their own hardcoded list here, completely disconnected
 * from the real Sanctioned Post / Pay Level / Discipline / Staff Category
 * masters Super Admin already manages under All Masters - a value added there
 * never reached this form, and this form's own copy could drift from the
 * master (the hardcoded Discipline list was already missing nothing, but its
 * own OFT form counterpart only had 5 of the master's 13 real values). Fetched
 * live like every other master-sourced dropdown in this app now, through
 * OtherAwareSelect so a master row flagged "Mark as 'Other' option" gets its
 * real free-text follow-up instead of just being a dead-end literal string.
 */
function useMasterRows(slug: string) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  useEffect(() => {
    fetch(`/api/master-options?slug=${slug}`)
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data: { rows?: MasterRow[] }) => setRows(data.rows ?? []))
      .catch(() => {});
  }, [slug]);
  return rows;
}

type EmployeeDetailsFormProps = {
  trail: Crumb[];
  backHref: string;
  /** Present for Edit, absent for Add. */
  id?: string;
};

/**
 * "Add Staff" / "Edit Staff" - field set, order, fixed dropdowns and required
 * marks transcribed from the live reference (atariams.org /create-staff +
 * /edit-staff, KVK admin). Sanctioned Post, Level, Discipline and Category
 * are fixed <select> lists there, not All Masters lookups. Add and Edit
 * share this one component so they can never drift apart.
 */
export function EmployeeDetailsAddForm({ trail, backHref, id }: EmployeeDetailsFormProps) {
  const router = useRouter();
  const isEdit = Boolean(id);

  const [sanctionedPost, setSanctionedPost] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [payBand, setPayBand] = useState("");
  const [payScale, setPayScale] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [jobType, setJobType] = useState("");
  const [allowances, setAllowances] = useState("");
  const [category, setCategory] = useState("");
  const [photo, setPhoto] = useState("");
  const [resume, setResume] = useState("");

  const [loaded, setLoaded] = useState(!isEdit);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sanctionedPostRows = useMasterRows("sanctioned-post");
  const payLevelRows = useMasterRows("pay-level");
  const disciplineRows = useMasterRows("discipline");
  const staffCategoryRows = useMasterRows("staff-category");

  useEffect(() => {
    if (!id) return;
    const raw = sessionStorage.getItem(`edit-record:${id}`);
    if (!raw) {
      setLoadError(true);
      return;
    }
    try {
      const row = JSON.parse(raw) as Record<string, string>;
      setSanctionedPost(row.sanctionedPost ?? "");
      setName(row.staffName ?? row.name ?? "");
      setPosition(row.position ?? "");
      setMobile(row.mobile ?? "");
      setEmail(row.email ?? "");
      setPayBand(row.payBand ?? "");
      setPayScale(row.payScale ?? "");
      setDiscipline(row.discipline ?? "");
      setDateOfBirth(row.dateOfBirth ?? "");
      setDateOfJoining(row.dateOfJoining ?? "");
      setJobType(row.jobType ?? "");
      setAllowances(row.allowances ?? "");
      setCategory(row.category ?? "");
      setPhoto(row.photo ?? "");
      setResume(row.resume ?? "");
      setLoaded(true);
    } catch {
      setLoadError(true);
    }
  }, [id]);

  async function submit() {
    if (!sanctionedPost || !name || !position.trim() || !mobile || !discipline || !dateOfBirth || !dateOfJoining || !category || !photo) {
      setError("Please fill all required fields.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const values = { sanctionedPost, name, position, mobile, email, payBand, payScale, discipline, dateOfBirth, dateOfJoining, jobType, allowances, category, photo, resume };
      const response = await fetch(isEdit ? "/api/leaf-record/update" : "/api/leaf-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "about-kvk/employee/employee-details", ...(isEdit ? { id } : {}), values }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (isEdit) sessionStorage.removeItem(`edit-record:${id}`);
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isEdit ? "Edit Staff" : "Add Staff";

  if (loadError) {
    return (
      <div>
        <PageHeader backHref={backHref} trail={trail} title={title} />
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">This record could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">Please open Edit again from the list page.</p>
          <Button className="mt-4" onClick={() => router.push(backHref)}>Back to list</Button>
        </div>
      </div>
    );
  }
  if (!loaded) return null;

  return (
    <div>
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader backHref={backHref} trail={trail} title={title} />
      </div>

      <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300">
        <p className="mb-3 text-lg font-semibold text-primary">Staff Position</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          <OtherAwareSelect
            id="sanctioned-post"
            label="Sanctioned Post"
            required
            value={sanctionedPost}
            onChange={setSanctionedPost}
            rows={sanctionedPostRows}
            optionKey="name"
          />
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="staff-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-position">
              Position <span className="text-destructive">*</span>
            </Label>
            <Input id="staff-position" type="number" className="h-10" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-mobile">
              Mobile <span className="text-destructive">*</span>
            </Label>
            <Input id="staff-mobile" className="h-10" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input id="staff-email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" />
          </div>
          <OtherAwareSelect
            id="staff-level"
            label="Level"
            value={payBand}
            onChange={setPayBand}
            rows={payLevelRows}
            optionKey="name"
            placeholder="Select"
          />
          <div className="space-y-1.5">
            <Label htmlFor="staff-pay-scale">Present Basic Pay</Label>
            <Input id="staff-pay-scale" type="number" className="h-10" value={payScale} onChange={(e) => setPayScale(e.target.value)} />
          </div>

          <OtherAwareSelect
            id="staff-discipline"
            label="Discipline"
            required
            value={discipline}
            onChange={setDiscipline}
            rows={disciplineRows}
            optionKey="name"
          />
          <div className="space-y-1.5">
            <Label htmlFor="staff-dob">
              Date of Birth <span className="text-destructive">*</span>
            </Label>
            <Input id="staff-dob" type="date" className="h-10" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-doj">
              Date of Joining <span className="text-destructive">*</span>
            </Label>
            <Input id="staff-doj" type="date" className="h-10" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-job-type">Permanent/Temporary</Label>
            <SimpleSelect
              id="staff-job-type"
              value={jobType}
              onValueChange={setJobType}
              placeholder="Please Select"
              options={opt(["Permanent", "Temporary"])}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-allowances">Details of allowances</Label>
            <Input id="staff-allowances" className="h-10" value={allowances} onChange={(e) => setAllowances(e.target.value)} />
          </div>
          <OtherAwareSelect
            id="staff-category"
            label="Category"
            required
            value={category}
            onChange={setCategory}
            rows={staffCategoryRows}
            optionKey="name"
          />

          <div className="col-[1/-1] grid grid-cols-[repeat(auto-fit,minmax(260px,380px))] gap-5">
            <FileUploadField
              column={{ ...PHOTO_COLUMN, required: true }}
              fieldId="staff-photo"
              value={photo}
              onChange={setPhoto}
            />
            <FileUploadField
              column={RESUME_COLUMN}
              fieldId="staff-resume"
              value={resume}
              onChange={setResume}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push(backHref)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            <Save className="size-3.5" />
            {submitting ? "Saving…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
