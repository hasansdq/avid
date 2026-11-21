-- ————————————————————————————————————————————————————————————————
--  جدول‌های کلاس حضوری و کلاس آنلاین (استریم)
--
--  این مهاجرت «پیش از» مهاجرت نقش استاد (20261201000000_teacher_role)
--  می‌آید تا جدول‌هایی که آن مهاجرت و کلیدهای خارجی‌اش به آن‌ها ارجاع
--  می‌دهند (ClassRoom/LiveStream) همیشه موجود باشند — ریشه‌ی شکست نصب
--  تازه با «no such table: ClassRoom» همین‌جا بود.
--
--  DDL عیناً از prisma/baseline.sql (خروجِ migrate diff --from-empty) و
--  «شکل نهایی» اسکیماست: ستون‌های teacherId/hostId/inviteSlug و
--  کلیدهای خارجی‌شان از همین‌جا ساخته می‌شوند؛ DDL بدون BEGIN/COMMIT
--  است (همان سبک 0_init — سازگار با prisma migrate deploy).
-- ————————————————————————————————————————————————————————————————

-- CreateTable
CREATE TABLE "ClassRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inviteSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teacherId" TEXT,
    CONSTRAINT "ClassRoom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassMembership_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "inviteSlug" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "hostId" TEXT,
    CONSTRAINT "LiveStream_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StreamInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "courseId" TEXT,
    "courseTitle" TEXT NOT NULL DEFAULT '',
    "classId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StreamInvitation_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StreamInvitation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StreamInvitation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StreamParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "kicked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StreamParticipant_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StreamParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassRoom_inviteSlug_key" ON "ClassRoom"("inviteSlug");
-- CreateIndex
CREATE INDEX "ClassRoom_teacherId_idx" ON "ClassRoom"("teacherId");
-- CreateIndex
CREATE INDEX "ClassMembership_classId_idx" ON "ClassMembership"("classId");
-- CreateIndex
CREATE UNIQUE INDEX "ClassMembership_userId_classId_key" ON "ClassMembership"("userId", "classId");
-- CreateIndex
CREATE UNIQUE INDEX "LiveStream_inviteSlug_key" ON "LiveStream"("inviteSlug");
-- CreateIndex
CREATE INDEX "LiveStream_hostId_idx" ON "LiveStream"("hostId");
-- CreateIndex
CREATE INDEX "StreamInvitation_streamId_idx" ON "StreamInvitation"("streamId");
-- CreateIndex
CREATE INDEX "StreamParticipant_streamId_idx" ON "StreamParticipant"("streamId");
-- CreateIndex
CREATE UNIQUE INDEX "StreamParticipant_streamId_userId_key" ON "StreamParticipant"("streamId", "userId");
