'use strict';

/**
 * New Relic agent configuration for Sahachara Ops.
 * Production-grade observability with fail-open safety and clinical data privacy safeguards.
 *
 * See lib/config/default.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
const isEnabled = Boolean(
  process.env.NEW_RELIC_LICENSE_KEY &&
  process.env.NEW_RELIC_ENABLED !== 'false'
);

const environment = process.env.NODE_ENV || 'development';
const appName = process.env.NEW_RELIC_APP_NAME || (
  environment === 'production'
    ? 'Sahachara Ops Backend (Production)'
    : 'Sahachara Ops Backend (Development)'
);

exports.config = {
  app_name: [appName],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',
  agent_enabled: isEnabled,
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: 'stdout',
    diagnostics: false
  },
  // Clinical Data Privacy: Strictly disable AI/LLM monitoring per data governance requirements
  ai_monitoring: {
    enabled: false,
    basic_telemetry: {
      enabled: false
    },
    streaming: {
      enabled: false
    },
    record_llm_feedback_token: false
  },
  // Obfuscate SQL queries: captures database timing and latency without leaking parameters or patient data
  transaction_tracer: {
    enabled: true,
    record_sql: 'obfuscated',
    explain_threshold: 500
  },
  datastore_tracer: {
    instance_reporting: {
      enabled: false
    },
    database_name_reporting: {
      enabled: false
    }
  },
  // Error Collector: capture stack traces and error codes without leaking clinical data or tokens
  error_collector: {
    enabled: true,
    ignore_status_codes: [401, 403, 404],
    attributes: {
      exclude: [
        'request.headers.cookie',
        'request.headers.authorization',
        'request.headers.x-user-role',
        'request.headers.x-user-name',
        'request.headers.x-patient-mrn',
        'request.headers.*token*',
        'request.headers.*pin*',
        'request.headers.*secret*',
        'request.parameters.*',
        'request.body',
        'response.body',
        '*patient*',
        '*clinical*',
        '*password*',
        '*pin*'
      ]
    }
  },
  // Global Attribute Filters: Fail-safe redaction
  attributes: {
    enabled: true,
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.setCookie',
      'request.headers.x-user-role',
      'request.headers.x-user-name',
      'request.headers.x-patient-mrn',
      'request.headers.*token*',
      'request.headers.*pin*',
      'request.headers.*secret*',
      'request.parameters.*',
      'request.body',
      'response.body',
      'response.headers.setCookie',
      '*password*',
      '*pin*',
      '*token*',
      '*secret*',
      '*patient*',
      '*diagnosis*',
      '*prescription*',
      '*dosage*',
      '*mrn*'
    ]
  },
  // Route templates: avoid high-cardinality raw URLs containing UUIDs/IDs
  rules: {
    name: [
      { pattern: '^/api/patients/[^/]+', name: '/api/patients/:id' },
      { pattern: '^/api/appointments/[^/]+', name: '/api/appointments/:id' },
      { pattern: '^/api/staff/[^/]+', name: '/api/staff/:id' },
      { pattern: '^/api/prescriptions/[^/]+', name: '/api/prescriptions/:id' },
      { pattern: '^/api/billing/invoices/[^/]+', name: '/api/billing/invoices/:id' },
      { pattern: '^/api/billing/payments/[^/]+', name: '/api/billing/payments/:id' },
      { pattern: '^/api/therapy-sessions/[^/]+', name: '/api/therapy-sessions/:id' },
      { pattern: '^/api/panchakarma/[^/]+', name: '/api/panchakarma/:id' },
      { pattern: '^/api/lab-orders/[^/]+', name: '/api/lab-orders/:id' }
    ]
  },
  allow_all_headers: false
};
