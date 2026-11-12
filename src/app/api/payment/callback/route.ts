import type { Enrollment, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getPaymentSettings,
  verifyPaypingPayment,
  verifyZarinpalPayment,
} from "@/lib/payment";
import { markFirstInstallmentPaid } from "@/lib/installments";
import { forwardedOrigin } from "@/lib/http";

function currentAttempt(enrollment: Enrollment): Prisma.EnrollmentWhereInput {
  return {
    id: enrollment.id,
    paymentGateway: enrollment.paymentGateway,
    paymentAttemptCode: enrollment.paymentAttemptCode,
    paymentRefId: enrollment.paymentRefId,
    paymentAmount: enrollment.paymentAmount,
    paymentStatus: { in: ["pending", "failed"] },
  };
}

async function recordPayment(
  enrollment: Enrollment,
  reference: string,
  cardPan?: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const paidAt = new Date();
    const { count } = await tx.enrollment.updateMany({
      where: currentAttempt(enrollment),
      data: {
        paymentStatus: "paid",
        paymentAttemptCode: enrollment.paymentAttemptCode ?? enrollment.paymentRefId,
        paymentRefId: reference,
        paymentCardPan: cardPan,
        paidAt,
      },
    });
    if (!count) {
      const current = await tx.enrollment.findUnique({ where: { id: enrollment.id } });
      return (
        current?.paymentStatus === "paid" &&
        current.paymentGateway === enrollment.paymentGateway &&
        current.paymentAttemptCode === (enrollment.paymentAttemptCode ?? enrollment.paymentRefId) &&
        current.paymentRefId === reference
      );
    }

    if (enrollment.paymentMethod === "installment") {
      await markFirstInstallmentPaid(tx, enrollment.id, paidAt);
    }
    return true;
  });
}

function parseGatewayData(value: unknown): Record<string, unknown> {
  const data: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}

async function handleCallback(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const origin = forwardedOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/register?payment=failed&reason=${encodeURIComponent(reason)}`,
      303
    );
  const success = () => NextResponse.redirect(`${origin}/register?payment=success`, 303);

  try {
    const settings = await getPaymentSettings();

    if (req.method === "GET" && params.get("gateway") === "test") {
      if (settings.gateway !== "test") return fail("test-mode-disabled");
      const reference = params.get("ref");
      const id = params.get("enrollmentId");
      if (!reference || !id) return fail("invalid-test");

      const enrollment = await db.enrollment.findUnique({ where: { id } });
      if (enrollment?.paymentGateway !== "test" || enrollment.paymentRefId !== reference) {
        return fail("not-found");
      }
      if (enrollment.paymentStatus === "paid") return success();
      if (enrollment.paymentStatus !== "pending") return fail("not-pending");
      const recorded = await recordPayment(
        enrollment,
        reference,
        enrollment.paymentCardPan ?? "TEST-**** 1234"
      );
      return recorded ? success() : fail("not-pending");
    }

    const authority = params.get("Authority") ?? params.get("authority");
    if (req.method === "GET" && authority) {
      if ((params.get("Status") ?? params.get("status")) !== "OK") {
        return fail("canceled");
      }
      const enrollment = await db.enrollment.findFirst({
        where: {
          paymentGateway: "zarinpal",
          OR: [
            { paymentAttemptCode: authority },
            { paymentAttemptCode: null, paymentRefId: authority },
          ],
        },
      });
      if (!enrollment?.paymentAmount) return fail("not-found");
      if (enrollment.paymentStatus === "paid") return success();

      const result = await verifyZarinpalPayment({
        settings,
        amountToman: enrollment.paymentAmount,
        authority,
      });
      if (!result.ok) {
        await db.enrollment.updateMany({
          where: currentAttempt(enrollment),
          data: { paymentStatus: "failed" },
        });
        return fail("verify-failed");
      }

      const recorded = await recordPayment(enrollment, result.refId ?? authority, result.cardPan);
      return recorded ? success() : fail("not-pending");
    }

    let gatewayData: Record<string, unknown>;
    try {
      const contentType = req.headers.get("content-type") ?? "";
      if (req.method === "GET") {
        gatewayData = parseGatewayData(params.get("data"));
      } else if (contentType.includes("application/json")) {
        const body = parseGatewayData(await req.json());
        gatewayData = parseGatewayData(body.data ?? body);
      } else {
        const form = await req.formData();
        if (form.get("status") === "0") return fail("canceled");
        gatewayData = parseGatewayData(form.get("data") ?? params.get("data"));
      }
    } catch {
      return fail("invalid-payment");
    }
    if (params.get("status") === "0") return fail("canceled");

    const { clientRefId, paymentCode, amount } = gatewayData;
    const rawReference = gatewayData.paymentRefId;
    const paymentRefId =
      typeof rawReference === "number" && Number.isSafeInteger(rawReference)
        ? String(rawReference)
        : rawReference;
    if (
      typeof clientRefId !== "string" || !clientRefId ||
      typeof paymentCode !== "string" || !paymentCode ||
      typeof paymentRefId !== "string" || !paymentRefId
    ) {
      return fail("invalid-payment");
    }

    const enrollment = await db.enrollment.findUnique({ where: { id: clientRefId } });
    if (
      !enrollment?.paymentAmount ||
      enrollment.paymentGateway !== "payping" ||
      enrollment.paymentAttemptCode !== paymentCode ||
      (amount !== enrollment.paymentAmount && amount !== String(enrollment.paymentAmount))
    ) {
      return fail("payment-mismatch");
    }
    if (enrollment.paymentStatus === "paid") {
      return enrollment.paymentRefId === paymentRefId ? success() : fail("payment-mismatch");
    }
    if (enrollment.paymentStatus !== "pending" && enrollment.paymentStatus !== "failed") {
      return fail("not-pending");
    }

    const result = await verifyPaypingPayment({
      settings,
      amountToman: enrollment.paymentAmount,
      refId: paymentRefId,
      paymentCode,
    });
    if (!result.ok) {
      await db.enrollment.updateMany({
        where: currentAttempt(enrollment),
        data: { paymentStatus: "failed" },
      });
      return fail("verify-failed");
    }

    const recorded = await recordPayment(enrollment, paymentRefId);
    return recorded ? success() : fail("not-pending");
  } catch (error) {
    console.error("payment callback error:", error);
    return fail("server-error");
  }
}
