const RACE_HUB_BASE_URL = 'https://race-hub-plum.vercel.app';

export type RegistrationStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

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
  registrationStatus: RegistrationStatus;
  entryFee?: string;
  description: string;
};

const STATUSES: RegistrationStatus[] = ['open', 'upcoming', 'closed'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// race-hub는 다른 저장소의 API라 형식이 바뀔 수 있다. 2026-10-29 점검 때
// distances가 없는 항목 하나에 대회 탭 전체가 오류로 죽을 수 있어서, 화면에 필요한
// 칸만 골라 정리하고 id·제목이 없는 항목은 버린다.
export function normalizeEvents(body: unknown): RaceEvent[] {
  const list = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: RaceEvent[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const id = str(e.id);
    const title = str(e.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const status = str(e.registrationStatus) as RegistrationStatus;
    const endDate = str(e.endDate);
    const entryFee = str(e.entryFee);
    out.push({
      id,
      title,
      sport: str(e.sport),
      region: e.region === 'international' ? 'international' : 'domestic',
      country: str(e.country),
      city: str(e.city),
      date: str(e.date),
      ...(endDate ? { endDate } : {}),
      distances: Array.isArray(e.distances) ? e.distances.map(str).filter(Boolean) : [],
      organizer: str(e.organizer),
      applyUrl: str(e.applyUrl),
      sourceUrl: str(e.sourceUrl),
      linkVerified: e.linkVerified === true,
      registrationStatus: STATUSES.includes(status) ? status : 'unknown',
      ...(entryFee ? { entryFee } : {}),
      description: str(e.description),
    });
  }
  return out;
}

// API를 status=all로 부르므로 끝난 대회도 온다. 끝나지 않은 대회만 가까운 날짜순으로 보여 준다.
// 날짜가 없거나 형식이 다른 대회는 끝났는지 알 수 없으니 숨기지 않고 맨 뒤에 둔다.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function upcomingEvents(events: RaceEvent[], now = new Date()): RaceEvent[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const known = (d: string | undefined) => (d && ISO_DATE.test(d) ? d.slice(0, 10) : '');
  return events
    .filter((e) => {
      const last = known(e.endDate) || known(e.date);
      return !last || last >= today;
    })
    .sort((a, b) => (known(a.date) || '9999').localeCompare(known(b.date) || '9999'));
}

export function isWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+/i.test(url);
}

// 카드를 눌렀을 때 열 주소: 확인된 신청 링크 → 출처 링크 순서, http(s)만.
// javascript:·intent: 같은 주소가 API로 들어와도 열지 않는다.
export function eventLink(event: Pick<RaceEvent, 'applyUrl' | 'sourceUrl' | 'linkVerified'>): string | null {
  if (event.linkVerified && isWebUrl(event.applyUrl)) return event.applyUrl;
  if (isWebUrl(event.sourceUrl)) return event.sourceUrl;
  return null;
}

export async function fetchRowingEvents(): Promise<RaceEvent[]> {
  const response = await fetch(`${RACE_HUB_BASE_URL}/api/events?sport=rowing&status=all`);
  if (!response.ok) {
    throw new Error(`race-hub API 오류: ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('대회 정보 형식이 올바르지 않아요.');
  }
  return upcomingEvents(normalizeEvents(body));
}
