-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actorId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_emailedAt_readAt_createdAt_idx" ON "Notification"("emailedAt", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
