import "server-only";
import { put, get } from "@vercel/blob";

export type UploadKind =
  | "staff-photo"
  | "staff-resume"
  | "cfld-crop-image"
  | "module-image"
  | "cfld-training-photo"
  | "cfld-action-photo"
  | "oft-photograph"
  | "oft-supplementary-datasheet"
  | "farmer-award-photo"
  | "success-story-image"
  | "rawe-attachment"
  | "ppv-fra-farmer-image"
  | "sac-meeting-file";

const UPLOAD_RULES: Record<UploadKind, { folder: string; minBytes?: number; maxBytes: number; mimeTypes: string[] }> = {
  "staff-photo": {
    folder: "staff/photos",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  /**
   * Matches lib/module-images.ts's own ALLOWED_IMAGE_TYPES/MAX_IMAGE_SIZE_MB
   * (JPG/JPEG/PNG, 5MB) - kept in sync, not re-derived.
   *
   * Client direction, 2026-09-13: every "Photographs" section (this is the
   * one real multi-photo upload kind - form-photos-field.tsx, used at the
   * end of every generic leaf form and OFT Result) gets a 2MB floor as well
   * as the existing 5MB ceiling, plus a 2-photo cap enforced client-side.
   * Deliberately NOT applied to `staff-photo` (a single ID/passport-style
   * photo, normally well under 2MB - a floor there would reject completely
   * normal staff photos, not just bad ones).
   */
  "module-image": {
    folder: "module-images",
    minBytes: 2 * 1024 * 1024,
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png"],
  },
  /** Client direction, 2026-09-13: same 2-5MB floor/ceiling as "module-image" - a real content photo (the crop itself), not an ID photo like staff-photo, which stays 5MB-max-only on purpose. */
  "cfld-crop-image": {
    folder: "cfld/crop-images",
    minBytes: 2 * 1024 * 1024,
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  /** Real reference (atari-client.vercel.app, 2026-09-01): "Farmers' Training Photographs" / "Quality Action Photographs", each captioned "Only images allowed... Max 5 MB per file". */
  "cfld-training-photo": {
    folder: "cfld/training-photos",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  "cfld-action-photo": {
    folder: "cfld/action-photos",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  "staff-resume": {
    folder: "staff/resumes",
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  /** Real reference (atari-client.vercel.app, 2026-09-02): Edit OFT Result's "Photographs" ("Only images allowed... Max 5 MB per file") and "Supplementary Datasheets" ("PDF / Image / Excel / Word allowed... Max 5 MB per file"). */
  "oft-photograph": {
    folder: "oft/photographs",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  "oft-supplementary-datasheet": {
    folder: "oft/supplementary-datasheets",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  /** Real reference (atari-client.vercel.app, 2026-09-02): Farmer Award's own "Photographs" upload field, confirmed missing entirely before this - "Only images allowed... Max 5 MB per file", same as the app's other photo fields. */
  "farmer-award-photo": {
    folder: "awards/farmer-photos",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  /** Real reference (atariams.org/impact/success-story/create, 2026-09-03): Success Stories' own "Supporting Images" field, confirmed missing entirely before this - "File size must be less than 2MB" (the one upload field in this app with a 2MB cap instead of the usual 5MB). */
  "success-story-image": {
    folder: "impact/success-story-images",
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  /** Real Add form field confirmed live (atariams.org/rawe-program/create, 2026-09-04): RAWE/FET/FIT Programme's own "Attachment Upload" file field, plain text before - same accepted types as oft-supplementary-datasheet (PDF/image/Excel/Word), no cap confirmed live so kept at this app's usual 5MB. */
  "rawe-attachment": {
    folder: "miscellaneous/rawe-attachments",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  /** Real Add form field confirmed live (atariams.org/sensitization-farmer-details/create, 2026-09-04): PPV & FRA Sensitization Farmer Details' own "Images" multi-file field, missing entirely before. */
  "ppv-fra-farmer-image": {
    folder: "miscellaneous/ppv-fra-farmer-images",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  /** SAC Meetings' "File/Proceeding" field (client pointer, 2026-09-15) - was a plain text input with nowhere to actually attach the meeting's file despite the column existing (SacMeeting.fileUrl). Same accepted types as rawe-attachment/oft-supplementary-datasheet (a scanned proceeding is as likely to be a PDF/Word doc as a photographed page). */
  "sac-meeting-file": {
    folder: "meetings/sac-meeting-files",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
};

/**
 * The single source of truth for which `kind` values /api/upload accepts -
 * derived from UPLOAD_RULES so the route can never drift out of sync with
 * the storage rules (it did: `rawe-attachment` / `success-story-image` /
 * `ppv-fra-farmer-image` were added here but not to the route's own hand-
 * kept list, so those upload fields returned 400).
 */
export const UPLOAD_KINDS = Object.keys(UPLOAD_RULES) as UploadKind[];

/**
 * Checks the file's actual leading bytes against its claimed MIME type
 * (security audit finding, 2026-09-02 - `file.type` in a FormData upload is
 * just a client-asserted string, trivially spoofable; without this, an
 * authenticated user could upload an HTML/SVG payload labelled
 * "image/jpeg" and have it stored and later served back under that
 * Content-Type). Paired with next.config.ts's X-Content-Type-Options:
 * nosniff, which stops a browser from sniffing past the label anyway - this
 * makes sure the label itself is trustworthy in the first place.
 */
const MAGIC_BYTE_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  "application/msword": (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) =>
    b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  "application/vnd.ms-excel": (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) =>
    b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
};

/** Only ever used by lib/api-auth.ts's routes after requireSession() has already passed - not exported to client code. */
export async function uploadPrivateFile(kind: UploadKind, file: File) {
  const rule = UPLOAD_RULES[kind];
  if (!rule.mimeTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  }
  if (file.size > rule.maxBytes) {
    throw new Error(`File too large - max ${Math.round(rule.maxBytes / (1024 * 1024))}MB.`);
  }
  if (rule.minBytes && file.size < rule.minBytes) {
    throw new Error(`File too small - min ${Math.round(rule.minBytes / (1024 * 1024))}MB.`);
  }
  const buffer = await file.arrayBuffer();
  const check = MAGIC_BYTE_CHECKS[file.type];
  if (check && !check(new Uint8Array(buffer.slice(0, 12)))) {
    throw new Error("File content doesn't match its declared type.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const blob = await put(`${rule.folder}/${safeName}`, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return blob;
}

const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";

/**
 * The store id is the 16-char segment right after "vercel_blob_rw_" in
 * BLOB_READ_WRITE_TOKEN, and it's exactly the subdomain Vercel serves that
 * store's blobs from (verified against a real stored URL, 2026-09-02:
 * token prefix "Je5Ww79eunzsDRmR_..." vs the real blob host
 * "je5ww79eunzsdrmr.private.blob.vercel-storage.com" - same 16 characters,
 * case-insensitive). Used instead of matching any hostname with the right
 * *suffix* (security audit finding - that old check would have accepted a
 * URL to any other Vercel customer's private store, not just this app's).
 */
function ownStoreHostname(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]{16})_/)?.[1];
  return storeId ? `${storeId.toLowerCase()}${PRIVATE_BLOB_HOST_SUFFIX}` : null;
}

export function isOwnPrivateBlobUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    const expected = ownStoreHostname();
    // Falls back to the looser suffix check only if the token doesn't match
    // the expected shape (e.g. a future token format change) - never fails
    // closed to the point of breaking every upload over a parsing surprise.
    return expected ? hostname === expected : hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Streams a private blob back out - callers must already have validated the URL with isOwnPrivateBlobUrl() and checked the caller's session. */
export async function readPrivateFile(url: string) {
  return get(url, { access: "private" });
}
