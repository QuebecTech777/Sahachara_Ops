/**
 * Sahachara Ops — Telemetry Sanitization & Privacy Safeguards
 *
 * Implements strict data redaction and fail-safe sanitization aligned with clinical
 * data governance and Indian Digital Personal Data Protection (DPDP Act 2023) principles.
 *
 * Technical Data Protection Controls:
 * - No passwords, activation PINs, password hashes, or session secrets.
 * - No patient identifiers (MRN, names, phone numbers, addresses, DOB, national IDs).
 * - No clinical data (diagnoses, symptoms, prescriptions, clinical notes, Dosha assessments).
 * - No request/response bodies in telemetry feeds.
 * - Sensitive HTTP headers and query strings are masked or eliminated.
 * - URLs with raw IDs are normalized to route templates.
 * - Prisma database errors are sanitized to remove connection strings and raw parameters.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /pin/i,
  /hash/i,
  /secret/i,
  /token/i,
  /auth/i,
  /cookie/i,
  /session/i,
  /jwt/i,
  /bearer/i,
  /mrn/i,
  /patient/i,
  /phone/i,
  /email/i,
  /address/i,
  /aadhaar/i,
  /nationalid/i,
  /dob/i,
  /birth/i,
  /diagnosis/i,
  /prescription/i,
  /clinical/i,
  /complaint/i,
  /notes/i,
  /treatment/i,
  /dosage/i,
  /dosha/i
];

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-user-role',
  'x-user-name',
  'x-patient-mrn',
  'x-activation-pin',
  'x-api-key',
  'x-session-secret',
  'proxy-authorization'
]);

/**
 * Sanitizes plain text log messages to strip embedded tokens, PINs, or patient identifiers.
 */
export function sanitizeLogMessage(msg: string): string {
  if (!msg) return '';
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DB_URL]')
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}(\.[a-zA-Z0-9_\-]+)?/g, '[REDACTED_JWT]')
    .replace(/\b(?:pin|code|password)[:=\s]+(\d{4,8})\b/gi, 'PIN [REDACTED]')
    .replace(/\bpatient(?:\s+name)?[:=\s]+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi, 'patient [REDACTED]')
    .replace(/([?&][a-zA-Z0-9_-]+=)[^&\s]+/g, '$1[REDACTED]')
    .replace(/\bSAH-[A-Z0-9]+-[0-9]+-[0-9]+\b/gi, '[REDACTED_ID]')
    .replace(/\bSAH-[A-Z0-9]+-[0-9]+\b/gi, '[REDACTED_ID]');
}

/**
 * Normalizes dynamic URL paths containing IDs or UUIDs to high-level route templates
 * to prevent leaking patient/staff IDs and to avoid metric cardinality explosions.
 */
export function sanitizeRoute(path: string): string {
  if (!path) return '/';
  
  // Strip query string first
  const cleanPath = path.split('?')[0];

  return cleanPath
    // Replace CUIDs / UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/c[a-z0-9]{20,32}/gi, ':id')
    // Replace custom Sahachara sequence IDs (e.g. SAH-APT-202611-001, SAH-MED-0001, etc.)
    .replace(/SAH-[A-Z0-9]+-[0-9]+/gi, ':id')
    .replace(/SAH-[A-Z0-9]+-[0-9]+-[0-9]+/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Standardize specific known patterns
    .replace(/\/patients\/[^/]+/g, '/patients/:id')
    .replace(/\/appointments\/[^/]+/g, '/appointments/:id')
    .replace(/\/prescriptions\/[^/]+/g, '/prescriptions/:id')
    .replace(/\/invoices\/[^/]+/g, '/invoices/:id')
    .replace(/\/payments\/[^/]+/g, '/payments/:id')
    .replace(/\/staff\/[^/]+/g, '/staff/:id')
    .replace(/\/therapy-sessions\/[^/]+/g, '/therapy-sessions/:id')
    .replace(/\/panchakarma\/[^/]+/g, '/panchakarma/:id')
    .replace(/\/lab-orders\/[^/]+/g, '/lab-orders/:id');
}

/**
 * Sanitizes request headers: removes cookies, bearer tokens, user names, and role headers.
 */
export function sanitizeHeaders(headers: Record<string, any> = {}): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerKey) || SENSITIVE_KEY_PATTERNS.some(p => p.test(lowerKey))) {
      sanitized[lowerKey] = '[REDACTED]';
    } else if (typeof value === 'string' || typeof value === 'number') {
      sanitized[lowerKey] = String(value);
    }
  }

  return sanitized;
}

/**
 * Sanitizes URL query strings: redacts sensitive keys or removes them entirely.
 */
export function sanitizeQueryString(urlOrQuery: string): string {
  if (!urlOrQuery) return '';
  const queryIndex = urlOrQuery.indexOf('?');
  const queryString = queryIndex !== -1 ? urlOrQuery.substring(queryIndex + 1) : urlOrQuery;

  if (!queryString) return '';

  const params = new URLSearchParams(queryString);
  const sanitizedParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
      sanitizedParams.set(key, '[REDACTED]');
    } else {
      // General safety: limit length of parameter values to avoid logging huge payloads
      sanitizedParams.set(key, value.length > 64 ? value.slice(0, 64) + '...' : value);
    }
  }

  return sanitizedParams.toString();
}

/**
 * Recursively redacts sensitive properties from metadata objects.
 */
export function sanitizeMetadata(obj: any, depth = 0): any {
  if (depth > 5) return '[NESTED_TOO_DEEP]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Redact database connection strings
      if (/postgres(?:ql)?:\/\/[^\s"']+/i.test(obj)) {
        return '[REDACTED_DB_URL]';
      }
      // Redact potential Bearer tokens or JWTs embedded in strings
      if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(obj)) {
        return obj.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
      }
      if (/eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/.test(obj)) {
        return '[REDACTED_JWT]';
      }
      // Redact potential bcrypt hashes
      if (/^\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}$/.test(obj)) {
        return '[REDACTED_HASH]';
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeMetadata(item, depth + 1));
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
      cleanObj[key] = '[REDACTED]';
    } else {
      cleanObj[key] = sanitizeMetadata(value, depth + 1);
    }
  }

  return cleanObj;
}

/**
 * Validates and sanitizes a correlation ID string.
 */
export function sanitizeCorrelationId(id: unknown): string {
  if (typeof id !== 'string') return '';
  // Only allow alphanumeric, dash, and underscore; limit to 64 chars
  const clean = id.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);
  return clean || '';
}

/**
 * Sanitizes an error object for telemetry transmission.
 * Specifically scrubs Prisma database error meta, connection strings, and stack paths.
 */
export function sanitizeError(err: unknown): { message: string; name: string; stack?: string; code?: string; meta?: Record<string, any> } {
  if (!err) {
    return { message: 'Unknown error', name: 'Error' };
  }

  if (err instanceof Error) {
    const rawStack = err.stack || '';
    // Strip file paths that might include local usernames or sensitive query strings
    const sanitizedStack = rawStack
      .split('\n')
      .slice(0, 8)
      .join('\n')
      .replace(/\/Users\/[^\s/]+/g, '[SYSTEM_DIR]')
      .replace(/\/home\/[^\s/]+/g, '[SYSTEM_DIR]')
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DB_URL]')
      .replace(/([?&][a-zA-Z0-9_-]+=)[^&\s]+/g, '$1[REDACTED]');

    const cleanMessage = sanitizeLogMessage(
      err.message
        .replace(/\/Users\/[^\s/]+/g, '[SYSTEM_DIR]')
        .replace(/\/home\/[^\s/]+/g, '[SYSTEM_DIR]')
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DB_URL]')
    );

    // Sanitize Prisma error metadata if present
    const rawMeta = (err as any).meta;
    let cleanMeta: Record<string, any> | undefined;
    if (rawMeta && typeof rawMeta === 'object') {
      cleanMeta = sanitizeMetadata(rawMeta);
    }

    return {
      name: err.name || 'Error',
      message: cleanMessage,
      stack: sanitizedStack,
      code: (err as any).code ? String((err as any).code) : undefined,
      ...(cleanMeta ? { meta: cleanMeta } : {})
    };
  }

  return {
    name: 'NonErrorObject',
    message: sanitizeLogMessage(String(err)).slice(0, 256)
  };
}
