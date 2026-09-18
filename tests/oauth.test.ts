import { beforeEach, describe, expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { OAuthStore } from '../src/oauth-store.js';
import { createOAuthRouter } from '../src/oauth-routes.js';

const issuer = new URL('https://gateway.example.com');
const resource = new URL('/mcp', issuer);
const password = 'correct horse battery staple';
let store: OAuthStore;

beforeEach(() => {
  store = new OAuthStore({
    issuer,
    resource,
    tokenSecret: '0123456789abcdef0123456789abcdef',
  });
});

describe('OAuthStore', () => {
  test('issues and verifies an audience-bound PKCE token', () => {
    const verifier = 'a'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const client = store.registerClient({ redirect_uris: ['https://chatgpt.com/aip/callback'] });
    const pending = store.beginAuthorization(client.client_id, {
      redirectUri: 'https://chatgpt.com/aip/callback',
      codeChallenge: challenge,
      state: 'state-1',
      scopes: ['mcp:tools'],
      resource,
    });
    const grant = store.approveAuthorization(pending.id, pending.csrfToken);
    const tokens = store.exchangeAuthorizationCode({
      clientId: client.client_id,
      code: grant.code,
      codeVerifier: verifier,
      redirectUri: pending.redirectUri,
      resource,
    });

    expect(tokens.token_type).toBe('Bearer');
    expect(store.verifyAccessToken(tokens.access_token)).toMatchObject({
      clientId: client.client_id,
      scopes: ['mcp:tools'],
      resource,
    });
    expect(() => store.exchangeAuthorizationCode({
      clientId: client.client_id,
      code: grant.code,
      codeVerifier: verifier,
      redirectUri: pending.redirectUri,
      resource,
    })).toThrow('authorization code is invalid or expired');
  });

  test('rejects insecure redirect URIs', () => {
    expect(() => store.registerClient({ redirect_uris: ['http://evil.example/callback'] }))
      .toThrow('redirect_uri must use HTTPS or loopback HTTP');
  });
});

describe('OAuth routes', () => {
  test('publishes discovery metadata and permits the registered callback in CSP', async () => {
    const app = express().use(createOAuthRouter({ publicBaseUrl: issuer, authPassword: password, store }));
    const protectedResource = await request(app).get('/.well-known/oauth-protected-resource/mcp').expect(200);
    expect(protectedResource.body.resource).toBe('https://gateway.example.com/mcp');
    const metadata = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(metadata.body.code_challenge_methods_supported).toEqual(['S256']);

    const registration = await request(app).post('/register').send({
      redirect_uris: ['https://chatgpt.com/aip/callback'],
      token_endpoint_auth_method: 'none',
    }).expect(201);
    const authorization = await request(app).get('/authorize').query({
      response_type: 'code',
      client_id: registration.body.client_id,
      redirect_uri: 'https://chatgpt.com/aip/callback',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      resource: 'https://gateway.example.com/mcp',
    }).expect(200);
    expect(authorization.headers['content-security-policy']).toContain("form-action 'self' https://chatgpt.com");
  });

  test('does not echo an incorrect password', async () => {
    const app = express().use(createOAuthRouter({ publicBaseUrl: issuer, authPassword: password, store }));
    const registration = await request(app).post('/register').send({ redirect_uris: ['https://chatgpt.com/aip/callback'] });
    const authorization = await request(app).get('/authorize').query({
      response_type: 'code', client_id: registration.body.client_id,
      redirect_uri: 'https://chatgpt.com/aip/callback', code_challenge: 'challenge',
      code_challenge_method: 'S256', resource: 'https://gateway.example.com/mcp',
    });
    const approvalId = authorization.text.match(/name="approval_id" value="([^"]+)"/)?.[1];
    const csrfToken = authorization.text.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    const response = await request(app).post('/authorize/decision').type('form').send({
      approval_id: approvalId, csrf_token: csrfToken, password: 'wrong-secret', action: 'approve',
    }).expect(401);
    expect(response.text).not.toContain('wrong-secret');
  });
});
