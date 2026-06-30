import { Request } from 'express';

export type JwtAuthContext = {
  type: 'jwt';
  userId: string;
  email: string;
  organizationId: string;
  role: 'ADMIN' | 'VIEWER';
};

export type ApiKeyAuthContext = {
  type: 'apiKey';
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
};

export type AuthContext = JwtAuthContext | ApiKeyAuthContext;

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      auth?: AuthContext;
      serviceOrganizationId?: string;
    }
  }
}

export {};
