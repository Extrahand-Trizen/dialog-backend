import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { LoginInput } from './auth.schemas';
import { getMeFromTokenPayload, login } from './auth.service';

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const body = getValidated<LoginInput>(req, 'body');
  const result = await login(body);
  AppResponse.success(res, 'Login successful', result);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }

  const user = await getMeFromTokenPayload({
    sub: auth.userId,
    email: auth.email,
    organizationId: auth.organizationId,
    role: auth.role,
  });

  AppResponse.success(res, 'User profile', { user });
}
