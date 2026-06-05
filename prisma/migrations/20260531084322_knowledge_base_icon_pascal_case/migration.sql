-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgeBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Database',
    "color" TEXT NOT NULL DEFAULT 'blue',
    "similarityThreshold" REAL NOT NULL DEFAULT 0.7,
    "topK" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KnowledgeBase" ("color", "createdAt", "description", "icon", "id", "name", "similarityThreshold", "status", "topK", "updatedAt") SELECT "color", "createdAt", "description", "icon", "id", "name", "similarityThreshold", "status", "topK", "updatedAt" FROM "KnowledgeBase";
DROP TABLE "KnowledgeBase";
ALTER TABLE "new_KnowledgeBase" RENAME TO "KnowledgeBase";
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "KnowledgeBase"("name");
CREATE INDEX "KnowledgeBase_status_idx" ON "KnowledgeBase"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
