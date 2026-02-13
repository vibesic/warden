-- CreateTable
CREATE TABLE "CheckTarget" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckTarget_url_key" ON "CheckTarget"("url");
