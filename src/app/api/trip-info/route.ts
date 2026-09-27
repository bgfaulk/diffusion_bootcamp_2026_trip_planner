import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { decryptRow, encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse, fail, requireString } from "@/lib/validation";

const categories = new Set(["flight", "hotel", "rental", "training", "insurance", "other"]);

const encryptedFields = ["title", "provider", "confirmation_number", "start_at", "end_at", "address", "phone", "notes"];

function readTripInfo(body: any) {
  const category = asString(body.category, 40);
  if (!categories.has(category)) fail("Choose a valid booking type");
  return {
    category,
    title: encryptText(requireString(body.title, "Title", 120)),
    provider: encryptText(asString(body.provider, 120)),
    confirmationNumber: encryptText(asString(body.confirmationNumber, 120)),
    startAt: encryptText(asString(body.startAt, 120)),
    endAt: encryptText(asString(body.endAt, 120)),
    address: encryptText(asString(body.address, 260)),
    phone: encryptText(asString(body.phone, 80)),
    notes: encryptText(asString(body.notes, 1200))
  };
}

export const POST = withAudit("bookings.add", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const item = readTripInfo(body);
    ctx.detail = item.category;
    const rows = await getSql()`
      INSERT INTO trip_info (user_id, category, title, provider, confirmation_number, start_at, end_at, address, phone, notes)
      VALUES (${user.id}, ${item.category}, ${item.title}, ${item.provider}, ${item.confirmationNumber}, ${item.startAt}, ${item.endAt}, ${item.address}, ${item.phone}, ${item.notes})
      RETURNING *
    `;
    return Response.json({ item: decryptRow(rows[0], encryptedFields) });
  } catch (error) {
    return errorResponse(error, "Could not add trip information");
  }
});

export const PATCH = withAudit("bookings.update", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const id = ctx.target = requireString(body.id, "Booking id", 80);
    const item = readTripInfo(body);
    const rows = await getSql()`
      UPDATE trip_info
      SET category = ${item.category},
          title = ${item.title},
          provider = ${item.provider},
          confirmation_number = ${item.confirmationNumber},
          start_at = ${item.startAt},
          end_at = ${item.endAt},
          address = ${item.address},
          phone = ${item.phone},
          notes = ${item.notes},
          updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `;
    if (!rows.length) fail("Trip information not found", 404);
    return Response.json({ item: decryptRow(rows[0], encryptedFields) });
  } catch (error) {
    return errorResponse(error, "Could not update trip information");
  }
});

export const DELETE = withAudit("bookings.delete", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const id = ctx.target = requireString(body.id, "Booking id", 80);
    await getSql()`DELETE FROM trip_info WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete trip information");
  }
});
