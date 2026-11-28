export type ComplaintStatus = 'Submitted' | 'Under Review' | 'In Progress' | 'Resolved'

export interface ComplaintRecord {
  id: string
  complaintCode: string
  title: string
  category: string
  description: string
  relatedService: string
  complaintDate: string
  status: ComplaintStatus
  backendId?: string
}

const STORAGE_KEY = 'studenthub.complaints.v1'
const STATUS_OVERRIDES_KEY = 'studenthub.complaintStatuses.v1'

export function generateComplaintCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000)
  return `CMP-${Date.now().toString().slice(-4)}${num}`
}

export function encodeComplaintPayload(meta: {
  complaintCode: string
  category: string
  relatedService: string
  complaintDate: string
  description: string
}): string {
  const cleanCat = meta.category.replace(/[|\]]/g, ' ')
  const cleanProp = (meta.relatedService || 'General StudentHub Service').replace(/[|\]]/g, ' ')
  const header = `[SH-CMP|code=${meta.complaintCode}|cat=${cleanCat}|prop=${cleanProp}|date=${meta.complaintDate}]`
  const maxBody = Math.max(100, 980 - header.length - 2)
  return `${header}\n${meta.description.trim().slice(0, maxBody)}`
}

export function mapBackendStatus(rawStatus: string, overrideStatus?: ComplaintStatus): ComplaintStatus {
  if (overrideStatus) return overrideStatus
  const lower = rawStatus.toLowerCase()
  if (lower === 'resolved' || lower === 'closed') return 'Resolved'
  if (lower === 'in_progress' || lower === 'in progress') return 'In Progress'
  if (lower === 'under_review' || lower === 'under review') return 'Under Review'
  return 'Submitted'
}

export function loadLocalComplaints(): ComplaintRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ComplaintRecord[]
  } catch {
    return []
  }
}

export function saveLocalComplaints(items: ComplaintRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function loadStatusOverrides(): Record<string, ComplaintStatus> {
  try {
    return JSON.parse(localStorage.getItem(STATUS_OVERRIDES_KEY) ?? '{}') as Record<string, ComplaintStatus>
  } catch {
    return {}
  }
}

export function saveStatusOverride(complaintCode: string, status: ComplaintStatus): void {
  const overrides = loadStatusOverrides()
  overrides[complaintCode] = status
  localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(overrides))
}

export function parseBackendRequest(row: { id: string; subject: string; description: string; status: string }): ComplaintRecord {
  const overrides = loadStatusOverrides()
  const match = row.description.match(/^\[SH-CMP\|code=([^|]+)\|cat=([^|]+)\|prop=([^|]+)\|date=([^\]]+)\]\n?([\s\S]*)$/)
  if (match) {
    const [, complaintCode, category, relatedService, complaintDate, body] = match
    return {
      id: `be-${row.id}`,
      backendId: row.id,
      complaintCode,
      title: row.subject,
      category,
      relatedService,
      complaintDate,
      description: body.trim(),
      status: mapBackendStatus(row.status, overrides[complaintCode]),
    }
  }
  const fallbackCode = `CMP-${row.id.padStart(4, '0')}`
  return {
    id: `be-${row.id}`,
    backendId: row.id,
    complaintCode: fallbackCode,
    title: row.subject || 'Student Service Issue',
    category: 'General',
    relatedService: 'StudentHub Service',
    complaintDate: new Date().toISOString().slice(0, 10),
    description: row.description,
    status: mapBackendStatus(row.status, overrides[fallbackCode]),
  }
}

export function mergeComplaintRecords(
  backendRows: { id: string; subject: string; description: string; status: string }[],
  localRows: ComplaintRecord[],
): ComplaintRecord[] {
  const overrides = loadStatusOverrides()
  const byCode = new Map<string, ComplaintRecord>()
  for (const row of backendRows) {
    const parsed = parseBackendRequest(row)
    byCode.set(parsed.complaintCode, parsed)
  }
  for (const local of localRows) {
    if (!byCode.has(local.complaintCode)) {
      byCode.set(local.complaintCode, {
        ...local,
        status: overrides[local.complaintCode] ?? local.status,
      })
    }
  }
  return Array.from(byCode.values())
}
