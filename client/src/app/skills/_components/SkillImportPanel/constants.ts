/** Accepted upload extensions (the server re-checks; this only filters the picker). */
export const ACCEPT = ".md,.markdown,.zip";

/** Max upload size, mirrored from the server (2 MB) so we fail before uploading. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
