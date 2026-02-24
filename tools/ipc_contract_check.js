// IPC payload contract checker.
// Verifies:
// 1) every CHANNEL key has request + response schema
// 2) every static EVENT key has payload schema
// 3) fixture samples match schemas
//
// Usage:
//   node tools/ipc_contract_check.js

const fs = require('fs');
const path = require('path');
const { CHANNEL, EVENT } = require('../shared/ipc');
const schemas = require('../contracts/ipc/payload_schemas');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_PATH = path.join(ROOT, 'qa', 'fixtures', 'contracts', 'ipc_contract_samples.json');

function fail(msg) {
  console.error(`IPC CONTRACT FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateValue(schema, value, at, errors) {
  if (!schema || schema.kind === 'any') return;

  if (schema.nullable && value === null) return;

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: expected enum value ${JSON.stringify(schema.enum)} but got ${JSON.stringify(value)}`);
    return;
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${at}: expected boolean`);
    return;
  }
  if (schema.type === 'number' && (typeof value !== 'number' || !isFinite(value))) {
    errors.push(`${at}: expected finite number`);
    return;
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(`${at}: expected string`);
    return;
  }
  if (schema.type === 'object') {
    if (!isObject(value)) {
      errors.push(`${at}: expected object`);
      return;
    }
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const req of required) {
      if (!(req in value)) errors.push(`${at}: missing required property '${req}'`);
    }
    const props = isObject(schema.properties) ? schema.properties : {};
    for (const [k, sub] of Object.entries(props)) {
      if (!(k in value)) continue;
      validateValue(sub, value[k], `${at}.${k}`, errors);
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${at}: expected array`);
      return;
    }
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${at}: expected at least ${schema.minItems} item(s)`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${at}: expected at most ${schema.maxItems} item(s)`);
    }
    if (Array.isArray(schema.items)) {
      for (let i = 0; i < schema.items.length; i++) {
        if (i >= value.length) break;
        validateValue(schema.items[i], value[i], `${at}[${i}]`, errors);
      }
      return;
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        validateValue(schema.items, value[i], `${at}[${i}]`, errors);
      }
    }
  }
}

function checkCoverage() {
  const request = schemas.channelRequest || {};
  const response = schemas.channelResponse || {};
  const events = schemas.eventPayload || {};

  for (const key of Object.keys(CHANNEL)) {
    if (!(key in request)) fail(`missing request schema for CHANNEL.${key}`);
    if (!(key in response)) fail(`missing response schema for CHANNEL.${key}`);
  }

  const staticEvents = Object.keys(EVENT).filter((k) => typeof EVENT[k] === 'string');
  for (const key of staticEvents) {
    if (!(key in events)) fail(`missing payload schema for EVENT.${key}`);
  }

  for (const key of Object.keys(request)) {
    if (!(key in CHANNEL)) fail(`unknown CHANNEL key in request schema: ${key}`);
  }
  for (const key of Object.keys(response)) {
    if (!(key in CHANNEL)) fail(`unknown CHANNEL key in response schema: ${key}`);
  }
  for (const key of Object.keys(events)) {
    if (!(key in EVENT)) fail(`unknown EVENT key in payload schema: ${key}`);
  }

  if (!process.exitCode) {
    ok(`coverage: ${Object.keys(CHANNEL).length} channels and ${staticEvents.length} static events`);
  }
}

function checkSamples() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    fail(`missing sample file ${path.relative(ROOT, SAMPLE_PATH)}`);
    return;
  }

  const raw = fs.readFileSync(SAMPLE_PATH, 'utf8').replace(/^\uFEFF/, '');
  const samples = JSON.parse(raw);
  const reqSamples = isObject(samples.channelRequests) ? samples.channelRequests : {};
  const resSamples = isObject(samples.channelResponses) ? samples.channelResponses : {};
  const evtSamples = isObject(samples.events) ? samples.events : {};

  const errors = [];

  for (const [key, value] of Object.entries(reqSamples)) {
    const schema = schemas.channelRequest[key];
    if (!schema) {
      errors.push(`sample request references unknown CHANNEL.${key}`);
      continue;
    }
    validateValue(schema, value, `channelRequests.${key}`, errors);
  }

  for (const [key, value] of Object.entries(resSamples)) {
    const schema = schemas.channelResponse[key];
    if (!schema) {
      errors.push(`sample response references unknown CHANNEL.${key}`);
      continue;
    }
    validateValue(schema, value, `channelResponses.${key}`, errors);
  }

  for (const [key, value] of Object.entries(evtSamples)) {
    const schema = schemas.eventPayload[key];
    if (!schema) {
      errors.push(`sample event references unknown EVENT.${key}`);
      continue;
    }
    validateValue(schema, value, `events.${key}`, errors);
  }

  if (errors.length) {
    for (const err of errors) fail(err);
    return;
  }
  ok(`sample validation: ${Object.keys(reqSamples).length} requests, ${Object.keys(resSamples).length} responses, ${Object.keys(evtSamples).length} events`);
}

function main() {
  checkCoverage();
  checkSamples();
  if (process.exitCode) process.exit(process.exitCode);
  console.log('IPC contract check passed.');
}

main();
