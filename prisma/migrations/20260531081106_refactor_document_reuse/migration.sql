/*
  Warnings:

  - You are about to drop the column `chunkOverlap` on the `KnowledgeBase` table. All the data in the column will be lost.
  - You are about to drop the column `chunkSize` on the `KnowledgeBase` table. All the data in the column will be lost.
  - You are about to drop the column `knowledgeBaseId` on the `KnowledgeChunk` table. All the data in the column will be lost.
  - You are about to drop the column `knowledgeBaseId` on the `KnowledgeDocument` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "KnowledgeBaseDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeBaseDocument_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeBaseDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'database',
    "color" TEXT NOT NULL DEFAULT 'blue',
    "similarityThreshold" REAL NOT NULL DEFAULT 0.7,
    "topK" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KnowledgeBase" ("createdAt", "description", "icon", "id", "name", "similarityThreshold", "status", "topK", "updatedAt") SELECT "createdAt", "description", coalesce("icon", 'database') AS "icon", "id", "name", "similarityThreshold", "status", "topK", "updatedAt" FROM "KnowledgeBase";
DROP TABLE "KnowledgeBase";
ALTER TABLE "new_KnowledgeBase" RENAME TO "KnowledgeBase";
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "KnowledgeBase"("name");
CREATE INDEX "KnowledgeBase_status_idx" ON "KnowledgeBase"("status");
CREATE TABLE "new_KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "embedding" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startIndex" INTEGER,
    "endIndex" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgeChunk" ("chunkIndex", "content", "createdAt", "documentId", "embedding", "endIndex", "id", "startIndex", "status", "updatedAt") SELECT "chunkIndex", "content", "createdAt", "documentId", "embedding", "endIndex", "id", "startIndex", "status", "updatedAt" FROM "KnowledgeChunk";
DROP TABLE "KnowledgeChunk";
ALTER TABLE "new_KnowledgeChunk" RENAME TO "KnowledgeChunk";
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
CREATE INDEX "KnowledgeChunk_status_idx" ON "KnowledgeChunk"("status");
CREATE INDEX "KnowledgeChunk_documentId_status_idx" ON "KnowledgeChunk"("documentId", "status");
CREATE TABLE "new_KnowledgeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "fileName" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "rawContent" TEXT,
    "chunkSize" INTEGER NOT NULL DEFAULT 800,
    "chunkOverlap" INTEGER NOT NULL DEFAULT 100,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'active',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KnowledgeDocument" ("createdAt", "error", "fileName", "fileSize", "fileUrl", "id", "mimeType", "parseStatus", "rawContent", "sourceType", "status", "title", "updatedAt") SELECT "createdAt", "error", "fileName", "fileSize", "fileUrl", "id", "mimeType", "parseStatus", "rawContent", "sourceType", "status", "title", "updatedAt" FROM "KnowledgeDocument";
DROP TABLE "KnowledgeDocument";
ALTER TABLE "new_KnowledgeDocument" RENAME TO "KnowledgeDocument";
CREATE INDEX "KnowledgeDocument_sourceType_idx" ON "KnowledgeDocument"("sourceType");
CREATE INDEX "KnowledgeDocument_parseStatus_idx" ON "KnowledgeDocument"("parseStatus");
CREATE INDEX "KnowledgeDocument_status_idx" ON "KnowledgeDocument"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KnowledgeBaseDocument_knowledgeBaseId_idx" ON "KnowledgeBaseDocument"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseDocument_documentId_idx" ON "KnowledgeBaseDocument"("documentId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseDocument_status_idx" ON "KnowledgeBaseDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseDocument_knowledgeBaseId_documentId_key" ON "KnowledgeBaseDocument"("knowledgeBaseId", "documentId");
