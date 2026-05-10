/**
 * File Management Routes for ContextGate
 *
 * Endpoints (mounted at /api/files):
 *   GET    /:id            ?path=<rel>        — list directory
 *   GET    /:id/content    ?path=<rel>        — read file content (text)
 *   POST   /:id/upload                         — upload one or more files (multipart)
 *   PUT    /:id/content                        — write/overwrite file content (JSON)
 *   POST   /:id/folder                         — create directory
 *   PATCH  /:id/rename                         — rename file or folder
 *   DELETE /:id            ?path=<rel>        — delete file or folder (recursive)
 *
 * Shared safety rules across all endpoints:
 *   - Connector type must be "filesystem"
 *   - Path traversal blocked (resolved path must stay within rootPath)
 *   - allowedExtensions enforced when configured (uploads, edits)
 *   - maxFileSize enforced
 *   - readOnly connectors reject mutations (POST/PUT/PATCH/DELETE)
 */

import { Hono } from "hono";
import { promises as fs } from "fs";
import * as path from "path";
import { db } from "@contextgate/core";
import { connectors as connectorsTable } from "@contextgate/core";
import { eq } from "drizzle-orm";

const fileRoutes = new Hono();

interface FilesystemConfig {
  rootPath: string;
  allowedExtensions?: string[];
  maxFileSize?: number;
}

interface ResolvedConnector {
  id: string;
  name: string;
  readOnly: boolean;
  config: FilesystemConfig;
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
async function loadConnector(
  id: string
): Promise<{ ok: true; conn: ResolvedConnector } | { ok: false; status: number; error: string }> {
  const rows = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.id, id))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, status: 404, error: "Connector not found" };
  }
  const c = rows[0];
  if (c.type !== "filesystem") {
    return {
      ok: false,
      status: 400,
      error: `Connector type "${c.type}" does not support file management`,
    };
  }

  const cfg = c.config as unknown as FilesystemConfig;
  if (!cfg?.rootPath) {
    return { ok: false, status: 400, error: "Connector missing rootPath" };
  }

  return {
    ok: true,
    conn: {
      id: c.id,
      name: c.name,
      readOnly: c.readOnly,
      config: cfg,
    },
  };
}

function resolveSafePath(rootPath: string, relativePath: string): string {
  const root = path.resolve(rootPath);
  const full = path.resolve(path.join(root, relativePath || ""));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Access denied: path traversal detected");
  }
  return full;
}

function checkExtensionAllowed(
  cfg: FilesystemConfig,
  filename: string
): void {
  if (cfg.allowedExtensions == null || cfg.allowedExtensions.length === 0) return;
  const ext = path.extname(filename).toLowerCase();
  if (!cfg.allowedExtensions.includes(ext)) {
    throw new Error(`File extension not allowed: ${ext || "(none)"}`);
  }
}

function assertWritable(conn: ResolvedConnector): void {
  if (conn.readOnly) {
    throw new Error("Connector is read-only — write operations are disabled");
  }
}

// ───────────────────────────────────────────────────────────────
// GET /:id — list directory
// ───────────────────────────────────────────────────────────────
fileRoutes.get("/:id", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  const relPath = c.req.query("path") ?? "";

  try {
    const fullPath = resolveSafePath(conn.config.rootPath, relPath);
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      return c.json({ error: "Not a directory" }, 400);
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(async (e) => {
          const itemPath = path.join(fullPath, e.name);
          let size = 0;
          let modifiedAt: string | null = null;
          try {
            const itemStat = await fs.stat(itemPath);
            size = itemStat.size;
            modifiedAt = itemStat.mtime.toISOString();
          } catch {
            /* ignore broken entries */
          }
          return {
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
            size,
            modifiedAt,
          };
        })
    );

    return c.json({
      data: {
        connector: { id: conn.id, name: conn.name, readOnly: conn.readOnly },
        path: relPath,
        items,
        config: {
          allowedExtensions: conn.config.allowedExtensions ?? null,
          maxFileSize: conn.config.maxFileSize ?? null,
        },
      },
    });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return c.json({ error: "Path not found" }, 404);
    return c.json({ error: e.message ?? "Failed to list" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// GET /:id/content — read file content as text
// ───────────────────────────────────────────────────────────────
fileRoutes.get("/:id/content", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  const relPath = c.req.query("path");
  if (!relPath) return c.json({ error: "Query param 'path' is required" }, 400);

  try {
    const fullPath = resolveSafePath(conn.config.rootPath, relPath);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return c.json({ error: "Not a file" }, 400);

    if (conn.config.maxFileSize != null && stat.size > conn.config.maxFileSize) {
      return c.json(
        {
          error: `File exceeds max size limit (${conn.config.maxFileSize} bytes)`,
        },
        413
      );
    }

    // Read as UTF-8 text. Binary files will appear garbled but won't error.
    const content = await fs.readFile(fullPath, "utf-8");

    return c.json({
      data: {
        path: relPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        content,
      },
    });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return c.json({ error: "File not found" }, 404);
    return c.json({ error: e.message ?? "Failed to read" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// POST /:id/upload — upload files (multipart/form-data)
//   Form fields:
//     - file (one or more, can repeat)
//     - path (optional, target directory relative to rootPath)
// ───────────────────────────────────────────────────────────────
fileRoutes.post("/:id/upload", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  try {
    assertWritable(conn);

    const formData = await c.req.formData();
    const dirRel = ((formData.get("path") as string) ?? "").trim();

    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return c.json({ error: "No file uploaded (use field name 'file')" }, 400);
    }

    const targetDir = resolveSafePath(conn.config.rootPath, dirRel);
    await fs.mkdir(targetDir, { recursive: true });

    const uploaded: Array<{ name: string; size: number; path: string }> = [];
    for (const file of files) {
      // Reject path traversal in filename
      const safeName = path.basename(file.name);
      if (!safeName) continue;

      checkExtensionAllowed(conn.config, safeName);

      if (conn.config.maxFileSize != null && file.size > conn.config.maxFileSize) {
        throw new Error(
          `File "${safeName}" (${file.size} bytes) exceeds max size limit (${conn.config.maxFileSize} bytes)`
        );
      }

      const fullPath = path.join(targetDir, safeName);
      // Ensure still within root
      resolveSafePath(conn.config.rootPath, path.relative(conn.config.rootPath, fullPath));

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(fullPath, buffer);

      uploaded.push({
        name: safeName,
        size: file.size,
        path: dirRel ? `${dirRel}/${safeName}` : safeName,
      });
    }

    return c.json({ data: { uploaded } }, 201);
  } catch (err: unknown) {
    const e = err as Error;
    return c.json({ error: e.message ?? "Upload failed" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// PUT /:id/content — write/overwrite a text file
//   Body: { path: string, content: string }
// ───────────────────────────────────────────────────────────────
fileRoutes.put("/:id/content", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  try {
    assertWritable(conn);
    const body = (await c.req.json()) as { path?: string; content?: string };
    const relPath = body.path?.trim();
    const content = body.content;

    if (!relPath) return c.json({ error: "'path' is required" }, 400);
    if (typeof content !== "string") {
      return c.json({ error: "'content' must be a string" }, 400);
    }

    const fullPath = resolveSafePath(conn.config.rootPath, relPath);
    checkExtensionAllowed(conn.config, fullPath);

    const bytes = Buffer.byteLength(content, "utf-8");
    if (conn.config.maxFileSize != null && bytes > conn.config.maxFileSize) {
      return c.json(
        { error: `Content exceeds max file size (${conn.config.maxFileSize} bytes)` },
        413
      );
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");

    return c.json({ data: { path: relPath, bytesWritten: bytes } });
  } catch (err: unknown) {
    const e = err as Error;
    return c.json({ error: e.message ?? "Write failed" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// POST /:id/folder — create a directory
//   Body: { path: string }
// ───────────────────────────────────────────────────────────────
fileRoutes.post("/:id/folder", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  try {
    assertWritable(conn);
    const body = (await c.req.json()) as { path?: string };
    const relPath = body.path?.trim();
    if (!relPath) return c.json({ error: "'path' is required" }, 400);

    const fullPath = resolveSafePath(conn.config.rootPath, relPath);
    await fs.mkdir(fullPath, { recursive: true });

    return c.json({ data: { path: relPath } }, 201);
  } catch (err: unknown) {
    const e = err as Error;
    return c.json({ error: e.message ?? "Failed to create folder" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// PATCH /:id/rename — rename a file or folder
//   Body: { from: string, to: string }
// ───────────────────────────────────────────────────────────────
fileRoutes.patch("/:id/rename", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  try {
    assertWritable(conn);
    const body = (await c.req.json()) as { from?: string; to?: string };
    const from = body.from?.trim();
    const to = body.to?.trim();
    if (!from || !to) return c.json({ error: "'from' and 'to' are required" }, 400);

    const fromPath = resolveSafePath(conn.config.rootPath, from);
    const toPath = resolveSafePath(conn.config.rootPath, to);

    // If the source is a file and we have an extension allowlist, the
    // destination must also pass the check.
    const stat = await fs.stat(fromPath);
    if (stat.isFile()) {
      checkExtensionAllowed(conn.config, toPath);
    }

    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);

    return c.json({ data: { from, to } });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return c.json({ error: "Source not found" }, 404);
    return c.json({ error: e.message ?? "Rename failed" }, 400);
  }
});

// ───────────────────────────────────────────────────────────────
// DELETE /:id — delete a file or folder (recursive)
//   Query: ?path=<rel>
// ───────────────────────────────────────────────────────────────
fileRoutes.delete("/:id", async (c) => {
  const result = await loadConnector(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.status as 404 | 400);
  const { conn } = result;

  try {
    assertWritable(conn);
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "Query param 'path' is required" }, 400);

    const fullPath = resolveSafePath(conn.config.rootPath, relPath);

    // Prevent deleting the root itself
    if (fullPath === path.resolve(conn.config.rootPath)) {
      return c.json({ error: "Cannot delete the connector root" }, 400);
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }

    return c.json({ data: { deleted: relPath, type: stat.isDirectory() ? "directory" : "file" } });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return c.json({ error: "Path not found" }, 404);
    return c.json({ error: e.message ?? "Delete failed" }, 400);
  }
});

export { fileRoutes };
