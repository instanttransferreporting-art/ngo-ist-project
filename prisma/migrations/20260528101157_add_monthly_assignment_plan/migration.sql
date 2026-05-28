-- CreateTable
CREATE TABLE "MonthlyAssignmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "useCurrentTasks" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyAssignmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPlanTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MonthlyPlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAssignmentPlan_userId_month_year_key" ON "MonthlyAssignmentPlan"("userId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlanTask_planId_taskId_key" ON "MonthlyPlanTask"("planId", "taskId");

-- AddForeignKey
ALTER TABLE "MonthlyAssignmentPlan" ADD CONSTRAINT "MonthlyAssignmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlanTask" ADD CONSTRAINT "MonthlyPlanTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MonthlyAssignmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlanTask" ADD CONSTRAINT "MonthlyPlanTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
