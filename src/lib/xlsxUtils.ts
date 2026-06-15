import * as XLSX from 'xlsx';
import type { User } from '../api/types';

export interface ProjectForTemplate {
  id: string;
  name: string;
  roles: string[];
}

export interface ParsedBulkRow {
  givenName: string;
  familyName: string;
  email: string;
  username?: string;
  password?: string;
  changeRequired: boolean;
  phone?: string;
  preferredLanguage?: string;
  projectGrants: Array<{ projectId: string; projectName: string; roleKeys: string[] }>;
  _line: number;
}

const FIXED_COLS = [
  { header: 'firstName', width: 18 },
  { header: 'lastName', width: 18 },
  { header: 'email', width: 30 },
  { header: 'username', width: 20 },
  { header: 'password', width: 20 },
  { header: 'changeRequired', width: 16 },
  { header: 'phone', width: 18 },
  { header: 'language', width: 12 },
] as const;

function projectColHeader(p: ProjectForTemplate): string {
  return p.roles.length > 0 ? `${p.name} (${p.roles.join(', ')})` : p.name;
}

export function generateTemplate(projects: ProjectForTemplate[]): Blob {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Users ──────────────────────────────────────────────────────────
  const headers = [
    ...FIXED_COLS.map((c) => c.header),
    ...projects.map(projectColHeader),
  ];

  const exampleRow = [
    'Ada',
    'Lovelace',
    'ada@example.com',
    'ada.lovelace',
    'Initial#123',
    'yes',
    '+15550100',
    'en',
    ...projects.map((p) => (p.roles.length > 0 ? p.roles[0] : '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  ws['!cols'] = [
    ...FIXED_COLS.map((c) => ({ wch: c.width })),
    ...projects.map((p) => ({ wch: Math.max(projectColHeader(p).length + 2, 25) })),
  ];

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as XLSX.ColInfo;

  XLSX.utils.book_append_sheet(wb, ws, 'Users');

  // ── Sheet 2: Legend (roles per project) ─────────────────────────────────────
  if (projects.length > 0) {
    const legendRows: unknown[][] = [
      ['Project', 'Project ID', 'Available Role Keys (comma-separate multiple)'],
      ...projects.map((p) => [p.name, p.id, p.roles.join(', ')]),
    ];
    const legendWs = XLSX.utils.aoa_to_sheet(legendRows);
    legendWs['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, legendWs, 'Legend');
  }

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function parseXlsx(
  buffer: ArrayBuffer,
  projects: ProjectForTemplate[],
): ParsedBulkRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });
  if (raw.length === 0) return [];

  // project name (lowercase) → project
  const projByName = new Map<string, ProjectForTemplate>();
  for (const p of projects) {
    projByName.set(p.name.toLowerCase().trim(), p);
  }

  // Detect which spreadsheet columns map to projects
  const allHeaders = Object.keys(raw[0] ?? {});
  const projectColMap: Array<{ header: string; project: ProjectForTemplate }> = [];
  for (const h of allHeaders) {
    const baseName = h.replace(/\s*\([^)]*\)\s*$/, '').trim(); // strip "(roles)" suffix
    const proj = projByName.get(baseName.toLowerCase());
    if (proj) projectColMap.push({ header: h, project: proj });
  }

  function str(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      const v = (row[k] ?? row[k.toLowerCase()] ?? '') as unknown;
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  return raw.map((row, i) => {
    const crRaw = str(row, 'changeRequired', 'change_required').toLowerCase();
    const changeRequired = crRaw === 'yes' || crRaw === 'true' || crRaw === '1';

    const projectGrants: ParsedBulkRow['projectGrants'] = [];
    for (const { header, project } of projectColMap) {
      const val = String(row[header] ?? '').trim();
      if (!val) continue;
      const roleKeys = val
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r && (project.roles.length === 0 || project.roles.includes(r)));
      if (roleKeys.length > 0) {
        projectGrants.push({ projectId: project.id, projectName: project.name, roleKeys });
      }
    }

    return {
      givenName: str(row, 'firstName', 'givenName', 'first_name', 'first'),
      familyName: str(row, 'lastName', 'familyName', 'last_name', 'last', 'surname'),
      email: str(row, 'email', 'e-mail', 'mail'),
      username: str(row, 'username', 'user', 'login') || undefined,
      password: str(row, 'password', 'pass', 'pwd') || undefined,
      changeRequired,
      phone: str(row, 'phone', 'mobile', 'phoneNumber') || undefined,
      preferredLanguage: str(row, 'language', 'lang', 'locale') || undefined,
      projectGrants,
      _line: i + 2,
    };
  });
}

// ── Project roles (bulk add) ──────────────────────────────────────────────────

export interface ParsedRoleRow {
  roleKey: string;
  displayName?: string;
  group?: string;
  _line: number;
}

const ROLE_COLS = [
  { header: 'roleKey', width: 24 },
  { header: 'displayName', width: 30 },
  { header: 'group', width: 20 },
] as const;

export function generateRolesTemplate(): Blob {
  const headers = ROLE_COLS.map((c) => c.header);
  const example = ['admin', 'Administrator', 'management'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = ROLE_COLS.map((c) => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as XLSX.ColInfo;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Roles');
  return makeBlob(wb);
}

function toRoleRow(
  roleKey: string,
  displayName: string,
  group: string,
  line: number,
): ParsedRoleRow {
  return {
    roleKey: roleKey.trim(),
    displayName: displayName.trim() || undefined,
    group: group.trim() || undefined,
    _line: line,
  };
}

/** Parse pasted text: one role per line, fields separated by comma or tab. */
export function parseRoleLines(text: string): ParsedRoleRow[] {
  const rows: ParsedRoleRow[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [key = '', display = '', group = ''] = trimmed.split(/[\t,]/);
    // Skip an accidental header row
    if (i === 0 && key.trim().toLowerCase() === 'rolekey') return;
    if (key.trim()) rows.push(toRoleRow(key, display, group, i + 1));
  });
  return rows;
}

/** Parse an uploaded XLSX/CSV: reads the first sheet, columns roleKey/displayName/group. */
export function parseRolesXlsx(buffer: ArrayBuffer): ParsedRoleRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });

  function pick(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      for (const rk of Object.keys(row)) {
        if (rk.toLowerCase().trim() === k.toLowerCase()) {
          const v = row[rk];
          if (typeof v === 'string' && v.trim()) return v.trim();
          if (typeof v === 'number') return String(v);
        }
      }
    }
    return '';
  }

  const rows: ParsedRoleRow[] = [];
  raw.forEach((row, i) => {
    const key = pick(row, 'roleKey', 'key', 'role');
    if (!key) return;
    rows.push(
      toRoleRow(key, pick(row, 'displayName', 'name', 'display'), pick(row, 'group'), i + 2),
    );
  });
  return rows;
}

// ── Export helpers ────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function makeBlob(wb: XLSX.WorkBook): Blob {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export interface BulkResultRow {
  userId: string;
  status: string;
  error: string;
  givenName: string;
  familyName: string;
  email: string;
  username: string;
  changeRequired: boolean;
  phone: string;
  preferredLanguage: string;
  roles: string;
}

export function exportBulkResults(rows: BulkResultRow[], filename = 'import-results.xlsx') {
  const headers = [
    'userId',
    'status',
    'firstName',
    'lastName',
    'email',
    'username',
    'changeRequired',
    'phone',
    'language',
    'roles',
    'error',
  ];
  const data = [
    headers,
    ...rows.map((r) => [
      r.userId,
      r.status,
      r.givenName,
      r.familyName,
      r.email,
      r.username,
      r.changeRequired ? 'yes' : 'no',
      r.phone,
      r.preferredLanguage,
      r.roles,
      r.error,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 34 }, // userId
    { wch: 10 }, // status
    { wch: 18 }, // firstName
    { wch: 18 }, // lastName
    { wch: 30 }, // email
    { wch: 20 }, // username
    { wch: 14 }, // changeRequired
    { wch: 18 }, // phone
    { wch: 10 }, // language
    { wch: 45 }, // roles
    { wch: 40 }, // error
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as XLSX.ColInfo;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  downloadBlob(makeBlob(wb), filename);
}

export function exportUsers(users: User[], filename = 'users.xlsx') {
  const headers = [
    'userId',
    'type',
    'firstName',
    'lastName',
    'email',
    'emailVerified',
    'username',
    'state',
    'preferredLoginName',
    'phone',
    'language',
  ];
  const data = [
    headers,
    ...users.map((u) => [
      u.userId,
      (u.type ?? '').replace('TYPE_', '').toLowerCase(),
      u.human?.profile?.givenName ?? u.machine?.name ?? '',
      u.human?.profile?.familyName ?? '',
      u.human?.email?.email ?? '',
      u.human?.email?.isVerified ? 'yes' : '',
      u.username ?? '',
      (u.state ?? '').replace('USER_STATE_', '').toLowerCase(),
      u.preferredLoginName ?? '',
      u.human?.phone?.phone ?? '',
      u.human?.profile?.preferredLanguage ?? '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 34 }, // userId
    { wch: 10 }, // type
    { wch: 18 }, // firstName
    { wch: 18 }, // lastName
    { wch: 30 }, // email
    { wch: 13 }, // emailVerified
    { wch: 20 }, // username
    { wch: 10 }, // state
    { wch: 30 }, // preferredLoginName
    { wch: 18 }, // phone
    { wch: 10 }, // language
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as XLSX.ColInfo;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  downloadBlob(makeBlob(wb), filename);
}
