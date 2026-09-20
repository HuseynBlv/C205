import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ROOM_NAME } from "@/lib/config";

export const metadata = { title: `Internal Rules for ${ROOM_NAME}` };

const USG_URL = "https://www.usg.az";

function UsgLink() {
  return (
    <a
      href={USG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {USG_URL}
    </a>
  );
}

type Section = { title: string; body: React.ReactNode[] };

const sections: Section[] = [
  {
    title: "General Scope of Use",
    body: [
      "Room C205 forms part of the operational infrastructure of major ADA University student organizations and should be treated accordingly. The room may primarily be used for organizational meetings, discussions, and other professional purposes. It may also be used for personal purposes, such as studying, resting, or holding minor informal activities, provided that such use does not interfere with any scheduled or ongoing organizational activity.",
      "Registered organizational meetings and events shall always take priority over informal or personal use of the room.",
    ],
  },
  {
    title: "Registration of Organizational Meetings",
    body: [
      <>
        Professional, organizational, and official meetings should be registered through the C205
        reservation system available on the official USG website <UsgLink />
      </>,
      "Registered reservations shall have priority over unregistered use of the room. Meeting organizers are therefore strongly encouraged to register their meetings in advance to avoid scheduling conflicts or interruptions.",
    ],
  },
  {
    title: "Reservation Approval",
    body: [
      "Authorized users may submit reservation requests through the designated reservation system.",
      "Reservation requests will be reviewed by the USG, and the requesting person will automatically receive a notification once the request has been approved or declined.",
      "The approval process is primarily intended to ensure proper coordination of room use and prevent overlapping reservations.",
    ],
  },
  {
    title: "Advance Reservation",
    body: [
      "Reservation requests should normally be submitted at least 48 hours in advance, particularly for longer, formal, or important meetings.",
      "Where circumstances are urgent or unforeseen, or where the room remains available, shorter-notice reservations may also be considered.",
    ],
  },
  {
    title: "Meeting Participants",
    body: [
      "Meeting organizers are responsible for ensuring that individuals present during a meeting are relevant to its purpose, particularly where confidential, sensitive, or internal organizational matters are being discussed.",
      "This requirement does not restrict the ordinary use of the room outside such meetings.",
    ],
  },
  {
    title: "Cancellation of Reservations",
    body: [
      "If a scheduled meeting is cancelled, the person who made the reservation should cancel it through the reservation system as soon as reasonably possible so that the room may become available to other users.",
    ],
  },
  {
    title: "Equal Application of the Rules",
    body: [
      "These rules apply equally to all individuals and organizations authorized to use Room C205.",
      "No authorized organization shall receive automatic priority solely on the basis of its identity. Priority shall generally be determined by properly registered reservations and the operational needs of the room.",
    ],
  },
  {
    title: "Extended Meetings",
    body: [
      "For meetings lasting more than two (2) hours, organizers should, where reasonably possible, allow sufficient time before another extended meeting begins, normally around one hour, in order to prevent continuous occupation of the room.",
    ],
  },
  {
    title: "Administration and Coordination",
    body: [
      "The USG Head of Logistics, together with the USG Logistics Department, is responsible for administering the C205 reservation system, coordinating the use of the room, and supporting compliance with these internal rules.",
      "Where scheduling conflicts or other operational issues arise, the Logistics Department may communicate with the relevant users and seek a practical solution acceptable to the parties involved.",
    ],
  },
  {
    title: "Access Card Sharing",
    body: [
      "Authorized users are strictly prohibited from sharing their ID cards with unauthorized individuals for the purpose of accessing Room C205.",
      "A first violation may result in a formal warning. Repeated or serious violations may result in the temporary or permanent suspension of the individual's access to the room, depending on the circumstances and seriousness of the breach.",
    ],
  },
  {
    title: "Noise and Conduct",
    body: [
      "Users of Room C205 should maintain reasonable noise levels and behave respectfully toward others present in the room.",
      "Even when no formal meeting is taking place, users should avoid unnecessarily loud conversations or other behaviour that may noticeably disturb individuals who are studying, working, resting, or using the room for organizational purposes.",
    ],
  },
  {
    title: "Cleanliness and Personal Belongings",
    body: [
      "All users are expected to contribute to maintaining the cleanliness and general order of Room C205.",
      "Personal belongings may be stored in the room for convenience where reasonably necessary. However, such storage should be kept to a minimum and generally limited to items useful for the room's regular operation or frequent use, such as chargers, basic technological equipment, and similar essential items.",
      "Users should avoid leaving unnecessary personal belongings, excessive materials, or other items that may create clutter or inconvenience other users.",
    ],
  },
  {
    title: "Addition of New Authorized Users",
    body: [
      "If a new individual requires access to Room C205 during the semester, the USG Logistics Department must be informed.",
      "The Logistics Department will review the need for access and, where justified, coordinate the necessary arrangements for the individual to be granted access to the room.",
    ],
  },
  {
    title: "Confidentiality and Unauthorized Recording",
    body: [
      "Certain meetings held in Room C205 may involve confidential or sensitive information, including, for example, students sharing personal matters with senators, internal USG leadership discussions, or private discussions involving Student Services employees.",
      "Any individual who is not an authorized participant in such a meeting is strictly prohibited from intentionally recording, photographing, transmitting, or otherwise attempting to obtain the contents of the meeting without authorization.",
      "Where such conduct is identified, the matter may be referred to the relevant university authorities for consideration under the applicable Code of Conduct or other university regulations.",
    ],
  },
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/requests/new"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to request
      </Link>
      <PageHeader title={`Internal Rules for the Use of Room ${ROOM_NAME}`} />

      <p className="mb-8 text-sm leading-relaxed text-foreground">
        To facilitate and systematize the use of Room C205, improve coordination among its users,
        and maintain a safe and professional environment, the following internal rules are
        introduced by the United Student Government (USG), as the organization responsible for the
        management and coordination of the room. These rules apply to all individuals and
        organizations authorized to use Room C205.
      </p>

      <ol className="space-y-7">
        {sections.map((section, i) => (
          <li key={section.title}>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {i + 1}. {section.title}
            </h2>
            <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
              {section.body.map((paragraph, j) => (
                <p key={j}>{paragraph}</p>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
        For more information regarding Room C205, including reservations and room-use procedures,
        please visit the USG website (<UsgLink />) and navigate to the “C205” section.
      </p>
    </div>
  );
}
