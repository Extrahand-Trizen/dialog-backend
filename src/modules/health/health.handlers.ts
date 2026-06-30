import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getLiveness, getReadiness } from './health.service';

export function livenessHandler(_req: Request, res: Response): void {
  AppResponse.success(res, 'Service is alive', getLiveness());
}

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  const data = await getReadiness();
  const statusCode = data.status === 'ready' ? 200 : 503;
  AppResponse.success(res, 'Readiness check complete', data, undefined, statusCode);
}
