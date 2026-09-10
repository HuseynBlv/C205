import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import type { Tables } from "@/lib/supabase/database.types";

type Reservation = Tables<"reservations">;

export interface EmailContent {
  html: string;
  text: string;
}

const NAVY = "#172e35";
const INK = "#1f2a2e";
const MUTED = "#5b6b71";
const BORDER = "#e3e7e8";
const CARD_BG = "#ffffff";
const PAGE_BG = "#f2f4f5";

const BADGES: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  PENDING: { label: "Pending", bg: "#fdf6e3", fg: "#8a6a10", border: "#f1e2b6" },
  APPROVED: { label: "Approved", bg: "#e8f6f0", fg: "#0f6b4c", border: "#bfe6d5" },
  REJECTED: { label: "Rejected", bg: "#f8ebe9", fg: "#8a3c37", border: "#eccbc7" },
  CANCELLED: { label: "Cancelled", bg: "#f3efea", fg: "#77706a", border: "#e4ddd2" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "EEEE, MMMM d, yyyy");
}

function formatTime(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "h:mm a");
}

function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function badge(status: string): string {
  const meta = BADGES[status];
  if (!meta) return "";
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;background:${meta.bg};color:${meta.fg};border:1px solid ${meta.border};">${meta.label}</span>`;
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:${MUTED};width:38%;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${INK};vertical-align:top;">${value}</td>
    </tr>`;
}

function calloutRow(text: string, tone: "info" | "warning" = "info"): string {
  const bg = tone === "warning" ? "#fdf6e3" : "#eef2f3";
  const fg = tone === "warning" ? "#8a6a10" : INK;
  return `<tr><td style="padding-top:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${bg};color:${fg};border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;">${text}</td></tr></table></td></tr>`;
}

/** The one shared shell every email renders inside — a plain, table-based
 * layout (email clients need inline styles and table layout for reliable
 * rendering, not the app's own Tailwind classes) using the same navy/
 * off-white palette as the rest of the app. */
function shell(opts: { title: string; statusHtml?: string; bodyRows: string; footerNote?: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${NAVY};padding:20px 24px;">
                <p style="margin:0;color:#f2f5f5;font-size:15px;font-weight:700;">${ROOM_NAME}</p>
                <p style="margin:2px 0 0;color:#a9bcc1;font-size:11px;">Part of usg.az</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:18px;font-weight:700;color:${INK};">${opts.title}</p>
                    </td>
                    ${opts.statusHtml ? `<td align="right" style="vertical-align:middle;">${opts.statusHtml}</td>` : ""}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER};margin-top:8px;padding-top:4px;">
                  ${opts.bodyRows}
                </table>
              </td>
            </tr>
            ${
              opts.footerNote
                ? `<tr><td style="padding:0 24px 24px;"><p style="margin:0;font-size:12px;color:${MUTED};">${opts.footerNote}</p></td></tr>`
                : ""
            }
            <tr>
              <td style="padding:16px 24px;border-top:1px solid ${BORDER};background:#fafbfb;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Automated notification from the ${ROOM_NAME} reservation system. Times shown in ${ROOM_TIMEZONE}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Renders one email_outbox row into a full HTML + plain-text pair.
 * `reservation` is the full row fetched via get_reservation_for_notification
 * (see that migration's comment on why returning the whole row there is
 * safe) — every field here was already headed to this exact recipient one
 * way or another (as plain text in `fallbackText`); this only presents it
 * better. Falls back to a plain rendering of the outbox row's own
 * pre-composed text if the reservation can't be found or the template is
 * unrecognized — this must never fail to produce *an* email.
 */
export function renderReservationEmail(
  template: string,
  reservation: Reservation | null,
  fallback: { subject: string; text: string },
): EmailContent {
  // Not reservation-shaped at all — no related_reservation_id exists for
  // this template (see the migration that queues it), so this must be
  // handled before the reservation-null fallback below, which is a
  // generic (template-unaware) catch-all rather than a real rendering.
  if (template === "account_registered_admin") {
    const rows =
      `<tr><td style="padding:8px 0;font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(fallback.text)}</td></tr>` +
      calloutRow("Review and authorize this account from the admin accounts page.");
    return {
      html: shell({ title: "New account awaiting authorization", bodyRows: rows }),
      text: fallback.text,
    };
  }

  if (!reservation) {
    return {
      html: shell({ title: escapeHtml(fallback.subject), bodyRows: `<tr><td style="padding:8px 0;font-size:14px;color:${INK};">${escapeHtml(fallback.text)}</td></tr>` }),
      text: fallback.text,
    };
  }

  const dateStr = formatDate(reservation.starts_at);
  const timeStr = `${formatTime(reservation.starts_at)} – ${formatTime(reservation.ends_at)}`;
  const durationStr = formatDuration(reservation.starts_at, reservation.ends_at);
  const purpose = escapeHtml(reservation.purpose);
  const requester = escapeHtml(`${reservation.requester_name} (${reservation.requester_email})`);

  const coreRows = [
    detailRow("Date", escapeHtml(dateStr)),
    detailRow("Time", `${escapeHtml(timeStr)} <span style="color:${MUTED};">· ${escapeHtml(durationStr)}</span>`),
  ].join("");

  switch (template) {
    case "reservation_submitted_admin": {
      const rows =
        coreRows +
        detailRow("Requester", requester) +
        detailRow("Purpose", purpose) +
        detailRow("Participants", String(reservation.participant_count)) +
        calloutRow("Review this request in the USG admin dashboard.");
      return {
        html: shell({ title: `New request for ${ROOM_NAME}`, statusHtml: badge("PENDING"), bodyRows: rows }),
        text: fallback.text,
      };
    }
    case "reservation_submitted_receipt": {
      const rows =
        coreRows +
        detailRow("Purpose", purpose) +
        detailRow("Participants", String(reservation.participant_count)) +
        calloutRow(
          "<strong>Pending USG approval. The room is not yet reserved.</strong> You'll get another email as soon as a decision is made.",
          "warning",
        );
      return {
        html: shell({ title: `Your request for ${ROOM_NAME}`, statusHtml: badge("PENDING"), bodyRows: rows }),
        text: fallback.text,
      };
    }
    case "reservation_approved":
    case "reservation_manual_confirmation": {
      let rows = coreRows + detailRow("Purpose", purpose);
      if (reservation.admin_override && reservation.override_reason) {
        rows += calloutRow(`Approved with an override: ${escapeHtml(reservation.override_reason)}`);
      }
      return {
        html: shell({
          title: `${ROOM_NAME} is reserved`,
          statusHtml: badge("APPROVED"),
          bodyRows: rows,
          footerNote: "Your request has been approved — this time is now confirmed.",
        }),
        text: fallback.text,
      };
    }
    case "reservation_rejected": {
      let rows = coreRows + detailRow("Purpose", purpose);
      if (reservation.decision_reason) {
        rows += calloutRow(`Reason: ${escapeHtml(reservation.decision_reason)}`);
      }
      return {
        html: shell({ title: `Your request for ${ROOM_NAME} was rejected`, statusHtml: badge("REJECTED"), bodyRows: rows }),
        text: fallback.text,
      };
    }
    case "reservation_cancelled": {
      let rows = coreRows + detailRow("Purpose", purpose);
      if (reservation.cancellation_reason) {
        rows += calloutRow(`Reason: ${escapeHtml(reservation.cancellation_reason)}`);
      }
      return {
        html: shell({ title: `Your reservation for ${ROOM_NAME} was cancelled`, statusHtml: badge("CANCELLED"), bodyRows: rows }),
        text: fallback.text,
      };
    }
    case "reservation_modified": {
      const rows = coreRows + detailRow("Purpose", purpose) + detailRow("Participants", String(reservation.participant_count));
      return {
        html: shell({
          title: `Your ${ROOM_NAME} reservation was updated`,
          statusHtml: badge(reservation.status),
          bodyRows: rows,
          footerNote: "USG changed the time, purpose, or participant count for this reservation.",
        }),
        text: fallback.text,
      };
    }
    default:
      return {
        html: shell({ title: escapeHtml(fallback.subject), statusHtml: badge(reservation.status), bodyRows: coreRows + detailRow("Purpose", purpose) }),
        text: fallback.text,
      };
  }
}
