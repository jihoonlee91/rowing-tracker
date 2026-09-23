const RACE_HUB_BASE_URL = 'https://race-hub-plum.vercel.app';

export type RaceEvent = {
  id: string;
  title: string;
  sport: string;
  region: 'domestic' | 'international';
  country: string;
  city: string;
  date: string;
  endDate?: string;
  distances: string[];
  organizer: string;
  applyUrl: string;
  sourceUrl: string;
  linkVerified: boolean;
  registrationStatus: 'open' | 'upcoming' | 'closed';
  entryFee?: string;
  description: string;
};

export async function fetchRowingEvents(): Promise<RaceEvent[]> {
  const response = await fetch(`${RACE_HUB_BASE_URL}/api/events?sport=rowing&status=all`);
  if (!response.ok) {
    throw new Error(`race-hub API 오류: ${response.status}`);
  }
  const body = (await response.json()) as { events: RaceEvent[] };
  return body.events;
}
